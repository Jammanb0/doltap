import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { inspect } from '../lib/runtime.mjs';
import { idPlan, linkPlan } from '../lib/edit.mjs';
import { deleteFolderPlan, pruneEmptyFolders } from '../lib/lifecycle.mjs';
import { mutate, transact, recover } from '../lib/transaction.mjs';
const read=(r,p)=>readFileSync(join(r,p),'utf8');
function fixture(){
 const root=mkdtempSync(join(tmpdir(),'doltap-folder-')),scope='.doltap/archive/legacy/example';
 cpSync('template',root,{recursive:true});mkdirSync(join(root,scope,'nested'),{recursive:true});
 const paths=[scope+'/a.md',scope+'/nested/b.md'];
 for(const p of paths){writeFileSync(join(root,p),'# 기록\n내용');mutate(root,()=>idPlan(root,p));}
 const ids=paths.map(p=>[...inspect(root).graph.byId.values()].find(n=>n.path===p).id);
 const entry=[...inspect(root).graph.byId.values()].find(n=>n.path==='AGENTS.md').id;
 mutate(root,()=>linkPlan(root,entry,ids[0],'indexes'));mutate(root,()=>linkPlan(root,ids[0],ids[1],'depends-on'));mutate(root,()=>linkPlan(root,ids[1],ids[0],'references'));
 return {root,scope,paths,ids};
}
const plan=f=>deleteFolderPlan(f.root,inspect(f.root).graph,f.scope,{mode:'purge',why:'아카이브 정리',dropLinks:true});
test('묶음 삭제는 내부 순환 참조를 함께 지우고 외부 참조는 명시해야 제거한다',()=>{
 const f=fixture(),before=read(f.root,'.doltap/ids.md');
 assert.throws(()=>deleteFolderPlan(f.root,inspect(f.root).graph,f.scope,{mode:'purge',why:'정리'}),/폴더 밖 참조/);
 const p=plan(f);assert.equal(p.changes.filter(c=>c.after===null).length,2);assert.equal(read(f.root,'.doltap/ids.md'),before);
 assert.deepEqual(deleteFolderPlan(f.root,inspect(f.root).graph,f.scope+'/',{mode:'purge',why:'아카이브 정리',dropLinks:true}),p);
 mutate(f.root,()=>plan(f).changes);pruneEmptyFolders(f.root,f.scope);
 assert.ok(!existsSync(join(f.root,f.scope)));assert.equal(inspect(f.root).problems.length,0);
});
test('등록되지 않은 텍스트와 마크다운은 보존하고 retained에 표시한다',()=>{
 const f=fixture();for(const name of ['keep.txt','keep.md'])writeFileSync(join(f.root,f.scope,name),'보존');
 const p=plan(f);assert.deepEqual(p.retained.sort(),[f.scope+'/keep.md',f.scope+'/keep.txt']);
 mutate(f.root,()=>p.changes);pruneEmptyFolders(f.root,f.scope);
 for(const name of ['keep.txt','keep.md'])assert.equal(read(f.root,f.scope+'/'+name),'보존');
});
test('일반 링크와 혼합 본문·루트·잘못된 모드는 묶음 삭제하지 않는다',()=>{
 const f=fixture(), original=read(f.root,'AGENTS.md'),line=original.split('\n').find(l=>l.includes(f.ids[0]));
 writeFileSync(join(f.root,'AGENTS.md'),original.replace(line,line.replace('`indexes` ','')));assert.throws(()=>plan(f),/일반 링크/);
 writeFileSync(join(f.root,'AGENTS.md'),original.replace(line,line+' 설명'));assert.throws(()=>plan(f),/섞인 관계/);
 for(const scope of ['.','../outside'])assert.throws(()=>deleteFolderPlan(f.root,inspect(f.root).graph,scope,{mode:'purge',why:'정리'}),/프로젝트 밖/);
 assert.throws(()=>deleteFolderPlan(f.root,inspect(f.root).graph,f.scope,{mode:'replace',why:'정리'}),/purge/);
});
test('묶음 삭제 실패는 모두 롤백하고 성공 뒤에도 파일과 부모 폴더를 복원한다',()=>{
 const f=fixture(),files=['AGENTS.md','.doltap/ids.md',...f.paths],before=files.map(p=>read(f.root,p));
 assert.throws(()=>transact(f.root,plan(f).changes,{afterReplace:i=>{if(i===2)throw Error('injected')}}),/injected/);
 assert.deepEqual(files.map(p=>read(f.root,p)),before);
 const result=mutate(f.root,()=>plan(f).changes);pruneEmptyFolders(f.root,f.scope);recover(f.root,result.id,{apply:true});
 assert.deepEqual(files.map(p=>read(f.root,p)),before);assert.equal(inspect(f.root).problems.length,0);
});
test('delete 폴더 CLI의 JSON 미리보기는 읽기 전용이고 apply는 빈 폴더까지 정리한다',()=>{
 const f=fixture(),args=['bin/doltap.mjs','delete',f.scope,'--root',f.root,'--mode','purge','--why','정리','--drop-links','--json'];
 let r=spawnSync(process.execPath,args,{encoding:'utf8',windowsHide:true});assert.equal(r.status,0,r.stderr);assert.ok(existsSync(join(f.root,f.paths[0])));assert.equal(JSON.parse(r.stdout).scope,f.scope);
 r=spawnSync(process.execPath,[...args,'--apply'],{encoding:'utf8',windowsHide:true});assert.equal(r.status,0,r.stderr);assert.ok(JSON.parse(r.stdout).removedDirectories.includes(f.scope));assert.equal(inspect(f.root).problems.length,0);
});
