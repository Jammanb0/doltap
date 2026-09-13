import {readFileSync,writeFileSync,mkdtempSync,mkdirSync,renameSync,unlinkSync,existsSync} from 'node:fs';
import {resolve,join,dirname,posix} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {parseDocument,isExternal,splitTarget} from '../lib/graph.mjs';
const source=resolve(dirname(fileURLToPath(import.meta.url)),'..'), cliPath=join(source,'bin/doltap.mjs');
const root=mkdtempSync(join(tmpdir(),'doltap-guide-'));
let commands=0,links=0;
function cli(...args){
 const r=spawnSync(process.execPath,[cliPath,...args],{cwd:root,encoding:'utf8',windowsHide:true});
 assert.equal(r.status,0,r.stderr||r.stdout);commands++;return r.stdout;
}
const json=(...args)=>JSON.parse(cli(...args,'--json'));
const read=p=>readFileSync(join(root,p),'utf8');
const write=(p,s)=>{mkdirSync(dirname(join(root,p)),{recursive:true});writeFileSync(join(root,p),s);};
const id=p=>read(p).match(/name="(doltap-[dsb]-[a-z0-9]{8})-start"/)[1];
const append=(p,s)=>write(p,read(p).replace(/(<a name="doltap-[dsb]-[a-z0-9]+-end"[^\n]*>\s*)$/,s+'\n\n$1'));
cli('init',root);cli('check','.');
write('notes.md','# 기록\n\n## 배포 조건\n\n시험을 통과한다.\n');
json('id','notes.md','--kind','d');assert.ok(!read('notes.md').includes('<a'));
json('id','notes.md','--kind','d','--apply');
const entry=id('AGENTS.md'),notes=id('notes.md');
json('link',entry,'--to',notes,'--as','indexes','--apply');
json('id','notes.md','--kind','s','--at','배포 조건','--apply');
let map=json('map','.');const section=map.nodes.find(n=>n.path==='notes.md'&&n.kind==='s').id;
json('link',section,'--to',entry,'--as','depends-on','--apply');
map=json('map','.');const edge=map.edges.find(e=>e.from===section&&e.to===entry).id;
json('context',section,'--depth','2','--budget','4000');json('audit','.doltap','--changed');
json('review',section,'--node','--as','최신임','--why','본문과 관계를 확인함','--actor','에이전트','--apply');
json('review',edge,'--as','영향 없음','--why','원본 변경은 이 규칙의 적용 범위 밖임','--actor','에이전트','--apply');
json('suggest',section,'--to',entry,'--relation','depends-on','--evidence','범위 대조','--as','반영','--why','관계가 존재함','--actor','에이전트','--apply');
renameSync(join(root,'notes.md'),join(root,'notes-moved.md'));
json('move-fix','.');json('move-fix','.','--apply');cli('check','.');
json('delete',section,'--mode','purge','--why','작은 범위 정리','--apply');cli('check','.');
unlinkSync(join(root,'notes-moved.md'));
json('delete-fix',notes,'--why','직접 삭제한 문서','--drop-links');
json('delete-fix',notes,'--why','직접 삭제한 문서','--drop-links','--apply');cli('check','.');
const scope='.doltap/archive/legacy/example';
write(scope+'/a.md','# 옛 문서\n');write(scope+'/b.md','# 다른 기록\n');
json('migrate','.');json('migrate','.','--apply');
const preview=json('delete',scope,'--mode','purge','--why','보관 정리','--drop-links');
assert.equal(preview.applied,false);assert.ok(existsSync(join(root,scope+'/a.md')));
const deletion=json('delete',scope,'--mode','purge','--why','보관 정리','--drop-links','--apply');
cli('check','.');json('recover',deletion.id);json('recover',deletion.id,'--apply');cli('check','.');
assert.ok(existsSync(join(root,scope+'/a.md')));json('recover',deletion.id,'--discard');
const ws='.doltap/plans/workstreams/010-search', archive='.doltap/archive/workstreams/010-search';
write(ws+'/README.md','# 검색 개편\n\n## 완료 조건\n검색 시험 통과\n');write(ws+'/status.md','# 검색 개편 상태\n\n진행 중\n');
append('.doltap/plans/current.md',`- **010-search**\n  - 소개: \`${ws}/README.md\`\n  - 상태: \`${ws}/status.md\``);
json('migrate','.','--apply');
const intro=id(ws+'/README.md');json('link',id('.doltap/plans/current.md'),'--to',intro,'--as','indexes','--apply');
cli('check','.');json('archive-check',ws);
write(ws+'/status.md',read(ws+'/status.md').replace('진행 중','완료 — 시험 통과, 다음 행동 없음'));
write('.doltap/plans/current.md',read('.doltap/plans/current.md').replace(/- \*\*010-search\*\*[\s\S]*?(?=<a name="doltap-d-[a-z0-9]+-end")/,'진행 중인 대작업이 없습니다.\n\n'));
mkdirSync(dirname(join(root,archive)),{recursive:true});renameSync(join(root,ws),join(root,archive));
json('move-fix','.','--apply');json('link',id('.doltap/plans/history.md'),'--to',intro,'--as','indexes','--apply');cli('check','.');
for(const p of ['README.md','README.en.md','APPLY.md',...['README','concepts','workstreams','getting-started','daily','linking','moving-deleting','review','finishing','reference','hooks'].map(n=>'guide/'+n+'.md')]){
 const doc=parseDocument(readFileSync(join(source,p),'utf8'),p);
 for(const link of [...doc.links,...doc.edges]){
  if(isExternal(link.dest))continue;
  const dest=splitTarget(link.dest),path=posix.normalize(posix.join(posix.dirname(p),dest.path||posix.basename(p)));
  assert.ok(existsSync(join(source,path)),`${p}:${link.line} → ${link.dest}`);links++;
 }
}
console.log(JSON.stringify({commands,localLinks:links,init:true,review:true,move:true,deleteFix:true,folderRecovery:true,workstreamArchive:true},null,2));
