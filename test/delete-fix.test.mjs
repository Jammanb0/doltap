import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, renameSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { inspect } from '../lib/runtime.mjs';
import { idPlan, linkPlan, wrap } from '../lib/edit.mjs';
import { deleteFixPlan } from '../lib/lifecycle.mjs';
import { mutate, transact, recover } from '../lib/transaction.mjs';
import { parseRegistry } from '../lib/ids.mjs';

const read = (root, path) => readFileSync(join(root,path),'utf8');
const docId = (root,path) => [...inspect(root).graph.byId.values()].find(n=>n.path===path && n.kind==='d').id;
function fixture() {
  const root=mkdtempSync(join(tmpdir(),'doltap-delete-fix-'));
  cpSync('template',root,{recursive:true});
  const folder='.doltap/archive/legacy/workstreams/999-example';
  mkdirSync(join(root,folder),{recursive:true});
  const paths=['README.md','status.md'].map(p=>folder+'/'+p);
  for(const path of paths){writeFileSync(join(root,path),'# 기록\n본문');mutate(root,()=>idPlan(root,path));}
  const ids=paths.map(p=>docId(root,p)), source=docId(root,'AGENTS.md');
  for(const id of ids) mutate(root,()=>linkPlan(root,source,id,'indexes'));
  mutate(root,()=>linkPlan(root,docId(root,'.doltap/plans/history.md'),ids[0],'indexes'));
  return {root,folder,paths,ids,source};
}
const plan=(f,scope=f.folder,opts={})=>deleteFixPlan(f.root,inspect(f.root).graph,scope,{why:'직접 삭제한 기록 정리',...opts});
const removeFiles=f=>f.paths.forEach(p=>rmSync(join(f.root,p)));

test('Git 없이 직접 삭제한 폴더를 미리보고 관계 제거를 명시해 정리한다',()=>{
  const f=fixture();removeFiles(f);
  // 문서에 남긴 코드 예시는 살아 있는 ID로 오인하지 않는다.
  writeFileSync(join(f.root,'example.md'),'```markdown\n'+wrap(f.ids[0],'# 예시')+'```\n');
  const before=read(f.root,'.doltap/ids.md');
  assert.throws(()=>plan(f),/--drop-links/);
  plan(f,f.folder,{dropLinks:true});
  assert.equal(read(f.root,'.doltap/ids.md'),before);
  assert.ok(inspect(f.root).problems.some(p=>p.message.includes('delete-fix')));
  mutate(f.root,()=>plan(f,f.folder,{dropLinks:true}));
  assert.equal(inspect(f.root).problems.length,0);
  for(const row of parseRegistry(read(f.root,'.doltap/ids.md')).filter(r=>f.ids.includes(r.id))) {
    assert.equal(row.state,'삭제'); assert.match(row.reason,/사후 삭제 정리/);
  }
  assert.throws(()=>plan(f),/사라진 ID가 없습니다/);
});

test('ID 범위는 다른 누락과 살아 있는 문서를 건드리지 않는다',()=>{
  const f=fixture();removeFiles(f);
  mutate(f.root,()=>plan(f,f.ids[0],{dropLinks:true}));
  const rows=parseRegistry(read(f.root,'.doltap/ids.md'));
  assert.equal(rows.find(r=>r.id===f.ids[0]).state,'삭제');
  assert.equal(rows.find(r=>r.id===f.ids[1]).state,'아카이브');
  assert.equal(rows.find(r=>r.id===f.source).state,'활성');
  assert.throws(()=>plan(f,f.source),/move-fix/);
  assert.throws(()=>plan(f,'../outside'),/프로젝트 밖/);
  assert.throws(()=>plan(f,undefined,{why:''}),/--why/);
});

test('색인에서 빠진 외부 이동 문서를 삭제로 오인하지 않는다',()=>{
  const f=fixture();mkdirSync(join(f.root,'notes'));
  renameSync(join(f.root,f.paths[0]),join(f.root,'notes/moved.md'));
  // 관계도 손으로 지워 collectDocuments의 이동 탐색에 잡히지 않는 경우.
  for(const p of ['AGENTS.md','.doltap/plans/history.md']) writeFileSync(join(f.root,p),read(f.root,p).split('\n').filter(l=>!l.includes(f.ids[0])).join('\n'));
  assert.ok(!inspect(f.root).graph.byId.has(f.ids[0]));
  assert.throws(()=>plan(f,f.ids[0],{dropLinks:true}),/ID가 살아 있습니다.*move-fix/);
});

test('남은 파일이나 깨진 앵커를 삭제로 확정하지 않는다',()=>{
  const f=fixture();writeFileSync(join(f.root,f.paths[0]),'# ID만 사라진 본문');
  assert.throws(()=>plan(f,f.ids[0]),/본문 파일이 남아/);
  writeFileSync(join(f.root,f.paths[0]),wrap(f.ids[0],'# 본문').split('\n').filter(l=>!l.includes('-end')).join('\n'));
  assert.throws(()=>plan(f,f.ids[0]),/앵커가 있습니다/);
});

test('본문과 섞인 관계와 일반 링크는 자동 삭제하지 않는다',()=>{
  const f=fixture();removeFiles(f);
  const path=join(f.root,'AGENTS.md'), original=read(f.root,'AGENTS.md');
  const line=original.split('\n').find(l=>l.includes(f.ids[0]));
  writeFileSync(path,original.replace(line,line+' 중요한 설명'));
  assert.throws(()=>plan(f,f.folder,{dropLinks:true}),/다른 본문과 섞인/);
  writeFileSync(path,original.replace(line,line.replace('`indexes` ','')));
  // 관계 표기만 지운 일반 링크도 자동 제거 대상이 아니다.
  assert.throws(()=>plan(f,f.folder,{dropLinks:true}),/일반 링크/);
});

test('문단만 직접 지운 경우 파일은 보존하고 해당 ID만 정리한다',()=>{
  const f=fixture(), path=f.paths[0];
  const before=read(f.root,path);
  writeFileSync(join(f.root,path),before.replace('# 기록','# 기록\n\n## 항목\n삭제할 문단'));
  mutate(f.root,()=>idPlan(f.root,path,{kind:'s',at:'항목'}));
  const node=[...inspect(f.root).graph.byId.values()].find(n=>n.path===path&&n.kind==='s');
  writeFileSync(join(f.root,path),before);
  mutate(f.root,()=>plan(f,node.id));
  assert.equal(read(f.root,path),before);
  assert.deepEqual(inspect(f.root).problems,[]);
});

test('사후 정리 실패와 recover는 대장·참조를 되돌리고 이미 지운 본문은 만들지 않는다',()=>{
  const f=fixture();removeFiles(f);
  const files=['AGENTS.md','.doltap/plans/history.md','.doltap/ids.md'];
  const before=files.map(p=>read(f.root,p));
  assert.throws(()=>transact(f.root,plan(f,f.folder,{dropLinks:true}),{afterReplace:i=>{if(i===0)throw Error('injected')}}),/injected/);
  assert.deepEqual(files.map(p=>read(f.root,p)),before);
  const result=mutate(f.root,()=>plan(f,f.folder,{dropLinks:true}));
  recover(f.root,result.id,{apply:true});
  assert.deepEqual(files.map(p=>read(f.root,p)),before);
  assert.ok(f.paths.every(p=>!existsSync(join(f.root,p))));
});

test('delete-fix CLI는 JSON 미리보기 뒤 apply에서만 쓰며 root와 범위를 구분한다',()=>{
  const f=fixture();removeFiles(f);
  const args=['bin/doltap.mjs','delete-fix',f.folder,'--root',f.root,'--why','직접 삭제','--drop-links','--json'];
  const before=read(f.root,'.doltap/ids.md');
  let run=spawnSync(process.execPath,args,{encoding:'utf8',windowsHide:true});
  assert.equal(run.status,0,run.stderr);assert.match(JSON.parse(run.stdout).preview,/사후 삭제 정리/);
  assert.equal(read(f.root,'.doltap/ids.md'),before);
  run=spawnSync(process.execPath,[...args,'--apply'],{encoding:'utf8',windowsHide:true});
  assert.equal(run.status,0,run.stderr);assert.equal(inspect(f.root).problems.length,0);
});

test('사후 정리도 중복·손상 발급 기록을 축약해서 덮어쓰지 않는다',()=>{
  const f=fixture();removeFiles(f);
  const path=join(f.root,'.doltap/ids.md'), original=read(f.root,'.doltap/ids.md');
  const row=original.split('\n').find(l=>l.includes(f.ids[0]));
  writeFileSync(path,original.replace(row,row+'\n'+row));
  assert.throws(()=>plan(f,f.folder,{dropLinks:true}),/같은 ID/);
  writeFileSync(path,original.replace(row,'| doltap-d-bad | d | 활성 | broken.md | | |'));
  assert.throws(()=>plan(f,f.folder,{dropLinks:true}),/손상된 발급/);
});
