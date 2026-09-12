import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { change, transact, recover, pending, mutate, readText } from '../lib/transaction.mjs';
import { migratePlan, wrap, idPlan, linkPlan, moveFixPlan } from '../lib/edit.mjs';
import { inspect, fullCheck } from '../lib/runtime.mjs';
import { normalize, reviewPlan, suggestionPlan } from '../lib/state.mjs';
import { context, audit, mapResult } from '../lib/query.mjs';
import { archiveCheck, deletePlan } from '../lib/lifecycle.mjs';
import { allocate } from '../lib/ids.mjs';

function fixture(files = {}) {
  const root = mkdtempSync(join(tmpdir(), 'doltap-workflow-'));
  for (const [path, text] of Object.entries(files)) { mkdirSync(dirname(join(root,path)), { recursive:true }); writeFileSync(join(root,path), text); }
  return root;
}
function project() {
  const root = fixture(); cpSync('template', root, { recursive: true });
  mutate(root, () => migratePlan(root)); return root;
}
const documentId = (result, path) => [...result.graph.byId.values()].find(n => n.path === path && n.kind === 'd').id;

test('새 프로젝트에는 복구 자료가 복사되지 않는다',()=>{
  const root=fixture();
  const run=spawnSync(process.execPath,['bin/doltap.mjs','init',root],{encoding:'utf8'});
  assert.equal(run.status,0,run.stderr);
  assert.equal(existsSync(join(root,'.doltap/recovery')),false);
  assert.equal(fullCheck(root).problems.length,0);
});
test('쓰기 미리보기와 적용의 JSON은 diff와 결과를 하나의 값으로 낸다',()=>{
 const root=fixture({'AGENTS.md':'# 규칙','CLAUDE.md':'@AGENTS.md'});
 for(const flags of [[],['--apply']]){
  const run=spawnSync(process.execPath,['bin/doltap.mjs','migrate',root,'--json',...flags],{encoding:'utf8'});
  assert.equal(run.status,0,run.stderr);const data=JSON.parse(run.stdout);assert.match(data.preview,/AGENTS.md/);
 }
 assert.equal(inspect(root).problems.length,0);
});

test('발급 API로 기존 ID를 확인해도 레지스트리 문서 범위가 유지된다',()=>{
  const root=project(),id=documentId(inspect(root),'AGENTS.md');
  allocate({root,operatingDir:'.doltap',kind:'d',path:'AGENTS.md',existingId:id});
  assert.equal(inspect(root).problems.length,0);
});

test('기존 절 안의 하위 절은 별도 ID를 받고 재실행 때 유지한다',()=>{
  const root=fixture({'AGENTS.md':'# 규칙\n\n## 상위\n본문\n\n### 하위\n본문\n\n## 다음\n끝','CLAUDE.md':'@AGENTS.md'});
  mutate(root,()=>migratePlan(root));
  mutate(root,()=>idPlan(root,'AGENTS.md',{kind:'s',at:'상위'}));
  mutate(root,()=>idPlan(root,'AGENTS.md',{kind:'s',at:'하위'}));
  const before=readText(root,'AGENTS.md');
  mutate(root,()=>idPlan(root,'AGENTS.md',{kind:'s',at:'하위'}));
  assert.equal(readText(root,'AGENTS.md'),before);
  assert.equal([...inspect(root).graph.byId.values()].filter(n=>n.kind==='s').length,2);
  assert.equal(inspect(root).problems.length,0);
});
test('공백과 #이 든 파일도 표준 URI 링크로 등록하고 복구한다',()=>{
 const root=project();mkdirSync(join(root,'docs'));const path='docs/한글 # 파일.md';writeFileSync(join(root,path),'# 외부');
 mutate(root,()=>idPlan(root,path));const rows=readText(root,'.doltap/ids.md'),id=rows.split('\n').find(l=>l.includes(path)).split('|')[1].trim();
 mutate(root,()=>linkPlan(root,documentId(inspect(root),'AGENTS.md'),id,'references'));
 assert.equal(inspect(root).problems.length,0);assert.match(readText(root,'AGENTS.md'),/%23/);
 assert.equal(moveFixPlan(root).filter(c=>c.before!==c.after).length,0);
});
test('일반 ID 링크도 잘못된 파일을 가리키면 오류다',()=>{
 const root=project(),id=documentId(inspect(root),'.doltap/project.md');
 const p=join(root,'AGENTS.md');writeFileSync(p,readText(root,'AGENTS.md').replace('# 프로젝트 이름',`# 프로젝트 이름\n\n[틀린 경로](.doltap/plans/ideas.md#${id}-start)`));
 assert.ok(inspect(root).problems.some(p=>p.message.includes('링크의 경로에 ID')));
});
test('목록의 부모·자식 변경은 내용 해시를 바꾼다',()=>{
 assert.notEqual(normalize('- 부모\n  - 자식'),normalize('- 부모\n- 자식'));
});

test('트랜잭션 실패는 새 파일과 기존 파일을 함께 되돌린다', () => {
  const root = fixture({ 'a.md':'old' });
  assert.throws(() => transact(root,[change(root,'a.md','new'),change(root,'b.md','created')],{ afterReplace:i=>{if(i===1) throw Error('fault');} }),/fault/);
  assert.equal(readText(root,'a.md'),'old'); assert.equal(readText(root,'b.md'),null); assert.deepEqual(pending(root),[]);
});
test('교체 직후 프로세스가 죽어도 예정 목록으로 복구한다', () => {
  const root = fixture({ 'a.md':'old', 'b.md':'old b' });
  const module = new URL('../lib/transaction.mjs',import.meta.url).href;
  const code = `import {transact,change} from ${JSON.stringify(module)};const r=process.argv[1];transact(r,[change(r,'a.md','new'),change(r,'b.md','new b')],{afterReplace:()=>process.exit(9)});`;
  assert.equal(spawnSync(process.execPath,['--input-type=module','-e',code,root]).status,9);
  const [id] = pending(root); assert.ok(id);
  assert.throws(()=>mutate(root,()=>[]),/recover/);
  assert.throws(()=>recover(root,id,{discard:true}),/닫히지/);
  assert.ok(recover(root,id).preview.includes('a.md'));
  recover(root,id,{apply:true}); assert.equal(readText(root,'a.md'),'old'); assert.equal(readText(root,'b.md'),'old b');
});
test('사용자 편집과 손상 백업은 복구가 덮어쓰지 않는다', () => {
  const root = fixture({'a.md':'old'}); const {id}=transact(root,[change(root,'a.md','new')]);
  writeFileSync(join(root,'a.md'),'user'); assert.throws(()=>recover(root,id,{apply:true}),/충돌/); assert.equal(readText(root,'a.md'),'user');
});
test('프로젝트 밖 쓰기와 미리보기 이후 변경은 거부한다', () => {
  const root = fixture({'a.md':'old'}); assert.throws(()=>change(root,'../escape.md','bad'),/밖/);
  const c = change(root,'a.md','new'); writeFileSync(join(root,'a.md'),'other'); assert.throws(()=>transact(root,[c]),/바뀌었/);
});
test('이관은 미리보기에서 쓰지 않으며 재실행해도 ID가 같다', () => {
  const root = fixture({'AGENTS.md':'# rules','.doltap/project.md':'# project','CLAUDE.md':'@AGENTS.md\n'});
  const plan=migratePlan(root); assert.equal(readText(root,'AGENTS.md'),'# rules');
  transact(root,plan); const before=readText(root,'AGENTS.md'); mutate(root,()=>migratePlan(root));
  assert.equal(readText(root,'AGENTS.md'),before); assert.equal(inspect(root).problems.length,0);
});
test('레거시 이관은 본문을 보존하고 색인으로 모든 문서를 잇는다', () => {
  const root = fixture({'AGENTS.md':'# rules','CLAUDE.md':'@AGENTS.md','.doltap/plans/history.md':'# history','.doltap/archive/workstreams/007-test/README.md':'# old','.doltap/archive/workstreams/007-test/status.md':'외부 사용이 확인되지 않았습니다.'});
  mutate(root,()=>migratePlan(root)); const r=inspect(root);
  assert.equal(r.problems.length,0); assert.ok(readText(root,'.doltap/archive/legacy/workstreams/007-test/status.md').includes('외부 사용이 확인되지 않았습니다.'));
  assert.equal([...r.graph.byId.values()].filter(n=>n.state==='legacy').length,2);
});
test('frontmatter는 ID 삽입 뒤에도 첫 블록이다', () => {
  const root=fixture({'AGENTS.md':'---\ntitle: demo\n---\n# rules'}); mutate(root,()=>migratePlan(root)); assert.ok(readText(root,'AGENTS.md').startsWith('---\ntitle: demo\n---'));
});
for (const [a,b] of [['hello world','hello\nworld'],['hello  world','hello world'],['a\r\n\r\nb','a\n\nb']]) test(`정규화는 서식 차이를 없앤다: ${JSON.stringify(a)}`,()=>assert.equal(normalize(a),normalize(b)));
for (const [a,b] of [['- one\n- two','- one - two'],['# title\nbody','# title body'],['one  \ntwo','one\ntwo'],['```\na  b\n```','```\na b\n```'],['    a  b','    a b'],['word','other']]) test(`정규화는 의미·구조 변경을 남긴다: ${JSON.stringify(a)}`,()=>assert.notEqual(normalize(a),normalize(b)));
test('검토는 현재 내용에 묶이며 관계 추가는 이웃 검토를 만료시키지 않는다',()=>{
  const root=project(); let r=inspect(root); const a=documentId(r,'AGENTS.md'), b=documentId(r,'.doltap/project.md'), c=documentId(r,'.doltap/plans/ideas.md');
  mutate(root,()=>linkPlan(root,a,b,'derived-from')); r=inspect(root); const edge=r.graph.edges.find(e=>e.type==='derived-from');
  assert.equal(edge.review.state,'stale'); mutate(root,()=>reviewPlan(root,inspect(root).graph,edge.id,{judgment:'반영함',why:'원본과 현재 소개 내용을 확인함',actor:'에이전트'}));
  assert.equal(inspect(root).graph.edges.find(e=>e.id===edge.id).review.state,'fresh');
  mutate(root,()=>linkPlan(root,b,c,'references')); assert.equal(inspect(root).graph.edges.find(e=>e.id===edge.id).review.state,'fresh');
  const p=join(root,'.doltap/project.md'); writeFileSync(p,readFileSync(p,'utf8').replace('# 프로젝트','# 바뀐 프로젝트'));
  assert.equal(inspect(root).graph.edges.find(e=>e.id===edge.id).review.state,'stale');
});
test('영향 없음은 구체적인 이유와 주체를 요구한다',()=>{
  const root=project(),r=inspect(root);
  assert.throws(()=>reviewPlan(root,r.graph,'all',{judgment:'영향 없음',why:'ok',actor:'사람'}),/이유/);
});
test('007: 활성 전제에서 아카이브의 검토 기록을 맥락으로 찾는다',()=>{
  const root=fixture({'AGENTS.md':'# rules','CLAUDE.md':'@AGENTS.md','.doltap/plans/history.md':'# history','.doltap/plans/ideas.md':'# npm 등록','.doltap/archive/workstreams/007-test/README.md':'# 소개','.doltap/archive/workstreams/007-test/status.md':'외부 사용이 확인되지 않았음은 사용자가 없다는 뜻이 아닙니다.'});
  mutate(root,()=>migratePlan(root)); let r=inspect(root); const a=documentId(r,'.doltap/plans/ideas.md'),b=documentId(r,'.doltap/archive/legacy/workstreams/007-test/status.md');
  mutate(root,()=>linkPlan(root,a,b,'assumes')); r=inspect(root); const result=context(r.graph,a);
  assert.ok(result.nodes.some(n=>n.id===b&&n.body.includes('사용자가 없다는 뜻이 아닙니다')));
  assert.ok(mapResult(r.graph).nodes.some(n=>n.state==='legacy'));
});
test('맥락은 작은 예산과 깊이를 지키고 생략을 표시한다',()=>{
  const r=inspect(project()),id=documentId(r,'AGENTS.md'),c=context(r.graph,id,{depth:0,budget:12});
  assert.ok(c.budget.used<=12);assert.ok(c.omitted.length);assert.equal(c.nodes.length,1);
});
test('Git 없는 프로젝트와 gitignore된 운영 폴더의 지도는 같다',()=>{
  const root=project(),before=mapResult(inspect(root).graph);
  spawnSync('git',['init','-q'],{cwd:root});writeFileSync(join(root,'.gitignore'),'.doltap/\n');
  const r=inspect(root);assert.deepEqual(mapResult(r.graph),before);assert.ok(r.notices.some(n=>n.message.includes('Git에서 제외')));
});
test('감사는 외부 파일을 일회성 후보로 내고 관리 범위에 추가하지 않는다',()=>{
  const root=project();mkdirSync(join(root,'docs'));writeFileSync(join(root,'docs/a.md'),'# 외부 문서');const r=inspect(root);
  const a=audit(root,r,r.records,'docs');assert.equal(a.candidates[0].registered,false);assert.equal(inspect(root).graph.byId.size,r.graph.byId.size);
});
test('삭제는 문서 안의 자식으로 들어오는 관계도 거부한다',()=>{
  const root=project();mutate(root,()=>idPlan(root,'.doltap/project.md',{kind:'s',at:'한 줄 요약'}));let r=inspect(root);const child=[...r.graph.byId.values()].find(n=>n.kind==='s');
  mutate(root,()=>linkPlan(root,documentId(r,'AGENTS.md'),child.id,'references'));r=inspect(root);
  assert.throws(()=>deletePlan(root,r.graph,documentId(r,'.doltap/project.md'),{mode:'purge',why:'삭제'}),/참조 중/);
});
test('아카이브 검사는 미해결·이월 연결·폐기 이유를 구분한다',()=>{
  const id='doltap-b-12345678';
  const graph=body=>({byId:new Map([[id,{id,path:'.doltap/plans/workstreams/009-x/status.md',body,startLine:1,state:'active'}]]),incoming:new Map()});
  for(const body of ['`전제` a\n`상태` 미해결','`전제` a\n`상태` 이월','`전제` a\n`상태` 폐기']) assert.equal(archiveCheck(graph(body),'.doltap/plans/workstreams/009-x').length,1);
  for(const body of ['`전제` a\n`상태` 해결','`전제` a\n`상태` 폐기\n`이유` 더 이상 쓰지 않음']) assert.equal(archiveCheck(graph(body),'.doltap/plans/workstreams/009-x').length,0);
  const carried=graph('`전제` a\n`상태` 이월'), source={id:'doltap-b-87654321',path:'.doltap/plans/decisions.md',body:'',startLine:1,state:'active'};
  carried.byId.set(source.id,source);carried.incoming.set(id,[{from:source.id}]);
  assert.equal(archiveCheck(carried,'.doltap/plans/workstreams/009-x').length,0);
  source.state='archived';assert.equal(archiveCheck(carried,'.doltap/plans/workstreams/009-x').length,1);
  source.state='active';source.path='.doltap/plans/workstreams/009-x/README.md';assert.equal(archiveCheck(carried,'.doltap/plans/workstreams/009-x').length,1);
});
test('아카이브 검사는 문법 설명을 선언으로 세지 않고 자식 범위만 판정한다',()=>{
 const root=fixture({'AGENTS.md':'# 규칙','CLAUDE.md':'@AGENTS.md','.doltap/plans/workstreams/009-x/README.md':'# 작업\n\n전제의 문법은 `전제`입니다.\n\n- `` `열린 질문` `` 표식 설명\n\n## 항목\n\n- `전제` 아직 확인하지 않음\n- `상태` 미해결'});
 mutate(root,()=>migratePlan(root));mutate(root,()=>idPlan(root,'.doltap/plans/workstreams/009-x/README.md',{kind:'s',at:'항목'}));
 const r=inspect(root),problems=archiveCheck(r.graph,'.doltap/plans/workstreams/009-x');
 assert.equal(problems.length,1);assert.match(problems[0].message,/처리하지 않은.*doltap-s-/);
});
test('구형 운영 폴더는 안내하고 복구 가능한 이관을 제공한다',()=>{
 const root=fixture({'AGENTS.md':'# rules\n`.agents/project.md`','CLAUDE.md':'@AGENTS.md','.agents/project.md':'# old project'});
 assert.ok(fullCheck(root).problems.some(p=>p.message.includes('APPLY.md')));
 const plan=migratePlan(root);assert.ok(readText(root,'.agents/project.md'));transact(root,plan);
 assert.ok(readText(root,'.doltap/project.md'));assert.equal(readText(root,'.agents/project.md'),null);
 assert.equal(inspect(root).problems.length,0);assert.doesNotThrow(()=>migratePlan(root));
});
test('새 아카이브는 이관을 재실행해도 레거시로 바뀌지 않는다',()=>{
 const root=project();mkdirSync(join(root,'.doltap/archive/workstreams/010-new'),{recursive:true});writeFileSync(join(root,'.doltap/archive/workstreams/010-new/README.md'),'# new');
 mutate(root,()=>migratePlan(root));assert.ok(readText(root,'.doltap/archive/workstreams/010-new/README.md'));
});
test('이동 복구는 라벨과 ID를 유지하고 경로와 발급 위치를 갱신한다',()=>{
 const root=project();let r=inspect(root);const id=documentId(r,'.doltap/project.md');
 const text=readText(root,'.doltap/project.md');transact(root,[change(root,'.doltap/project.md',null),change(root,'.doltap/renamed.md',text)]);
 const before=readText(root,'AGENTS.md'),plan=moveFixPlan(root);assert.equal(readText(root,'AGENTS.md'),before);
 transact(root,plan);assert.ok(readText(root,'AGENTS.md').includes(`renamed.md#${id}-start`));assert.equal(inspect(root).problems.length,0);
});
test('중복 ID이면 이관과 경로 복구 모두 거부한다',()=>{
 const root=project();writeFileSync(join(root,'.doltap/copy.md'),readText(root,'.doltap/project.md'));
 assert.throws(()=>migratePlan(root),/중복/);assert.throws(()=>moveFixPlan(root),/동일 ID/);
});
test('삭제 표식은 내용 대신 ID와 이유를 남기고 이후 발급에서도 보존된다',()=>{
 const root=project();writeFileSync(join(root,'.doltap/unused.md'),'# unused');mutate(root,()=>idPlan(root,'.doltap/unused.md'));
 let r=inspect(root);const id=documentId(r,'.doltap/unused.md');mutate(root,()=>deletePlan(root,inspect(root).graph,id,{mode:'tombstone',why:'더 이상 사용하지 않는 문서'}));
 r=inspect(root);assert.equal(r.graph.byId.get(id).state,'deleted');assert.ok(readText(root,'.doltap/unused.md').includes('삭제 표식'));
 mutate(root,()=>idPlan(root,'.doltap/project.md'));assert.ok(readText(root,'.doltap/ids.md').includes('더 이상 사용하지 않는 문서'));
 assert.throws(()=>idPlan(root,'.doltap/unused.md'),/삭제/);
});
test('대체 삭제는 참조를 옮기고 이전 ID로 supersedes를 보존한다',()=>{
 const root=project();let r=inspect(root);const old=documentId(r,'.doltap/plans/ideas.md'),fresh=documentId(r,'.doltap/project.md');
 mutate(root,()=>deletePlan(root,inspect(root).graph,old,{mode:'replace',replacement:fresh,why:'프로젝트 문서로 통합'}));r=inspect(root);
 assert.ok(r.graph.edges.some(e=>e.from===fresh&&e.type==='supersedes'&&e.to===old));assert.equal(r.problems.length,0,JSON.stringify(r.problems));
});
test('완전 삭제 뒤 ID 재등장은 오류이며 재발급하지 않는다',()=>{
 const root=project();writeFileSync(join(root,'.doltap/unused.md'),'# unused');mutate(root,()=>idPlan(root,'.doltap/unused.md'));let r=inspect(root);const id=documentId(r,'.doltap/unused.md');
 mutate(root,()=>deletePlan(root,inspect(root).graph,id,{mode:'purge',why:'불필요한 파일'}));assert.equal(readText(root,'.doltap/unused.md'),null);
 writeFileSync(join(root,'.doltap/unused.md'),wrap(id,'# resurrection'));assert.ok(inspect(root).problems.some(p=>p.message.includes('삭제 ID')));
});
test('대칭 검토는 선언 방향이 바뀌어도 같은 영수증을 사용한다',()=>{
 const root=project();let r=inspect(root);const a=documentId(r,'.doltap/project.md'),b=documentId(r,'.doltap/plans/ideas.md');mutate(root,()=>linkPlan(root,a,b,'update-with'));
 r=inspect(root);const edge=r.graph.edges.find(e=>e.type==='update-with');mutate(root,()=>reviewPlan(root,inspect(root).graph,edge.id,{judgment:'반영함',why:'양쪽의 역할과 범위를 대조함',actor:'사람'}));
 let text=readText(root,'.doltap/project.md').replace(/^- `update-with`.*\n/gm,'');writeFileSync(join(root,'.doltap/project.md'),text);mutate(root,()=>linkPlan(root,b,a,'update-with'));
 assert.equal(inspect(root).graph.edges.find(e=>e.type==='update-with').review.state,'fresh');
});
test('감사 판단 기록은 누적되며 --changed는 노드 검토를 사용한다',()=>{
 const root=project();let r=inspect(root);const a=documentId(r,'.doltap/project.md'),b=documentId(r,'.doltap/plans/ideas.md');
 mutate(root,()=>suggestionPlan(root,inspect(root).graph,a,b,'verified-by',{evidence:'본문을 대조함',judgment:'기각',why:'검증 자료가 아니라 아이디어임',actor:'에이전트'}));
 mutate(root,()=>reviewPlan(root,inspect(root).graph,a,{node:true,judgment:'최신임',why:'본문과 나가는 관계를 확인함',actor:'사람'}));r=inspect(root);
 assert.equal(r.records.suggestions.length,1);assert.equal(audit(root,r,r.records,'.doltap/project.md',{changed:true}).candidates.length,0);
});
test('문서 밖 본문과 주석 속 가짜 앵커를 구분한다',()=>{
 const root=project();const path=join(root,'.doltap/project.md');writeFileSync(path,readText(root,'.doltap/project.md')+'outside');assert.ok(inspect(root).problems.some(p=>p.message.includes('범위 밖')));
});
test('선택적 Stop 어댑터는 JSON 판정과 재호출 종료를 제공한다',()=>{
 const root=project(),hook=resolve('bin/doltap-hook.mjs');
 const run=input=>spawnSync(process.execPath,[hook],{input:JSON.stringify(input),encoding:'utf8'});
 assert.deepEqual(JSON.parse(run({cwd:root}).stdout),{});
 writeFileSync(join(root,'CLAUDE.md'),'broken');assert.equal(JSON.parse(run({cwd:root}).stdout).decision,'block');
 assert.deepEqual(JSON.parse(run({cwd:root,stop_hook_active:true}).stdout),{});
});
test('이동한 외부 문서도 명시된 ID로만 찾아 복구한다',()=>{
 const root=project();mkdirSync(join(root,'docs'));writeFileSync(join(root,'docs/evidence.md'),'# evidence');mutate(root,()=>idPlan(root,'docs/evidence.md'));
 const rows=readText(root,'.doltap/ids.md');const id=rows.split('\n').find(l=>l.startsWith('| doltap-')&&l.includes('docs/evidence.md')).split('|')[1].trim();
 const a=documentId(inspect(root),'AGENTS.md');mutate(root,()=>linkPlan(root,a,id,'verified-by'));
 transact(root,[change(root,'docs/evidence.md',null),change(root,'docs/moved.md',readText(root,'docs/evidence.md'))]);
 assert.ok(inspect(root).graph.byId.has(id));mutate(root,()=>moveFixPlan(root));assert.equal(inspect(root).problems.length,0);
});
test('세 노드 순환 의존을 지도에서 한 성분으로 표시한다',()=>{
 const root=project();let r=inspect(root);const a=documentId(r,'AGENTS.md'),b=documentId(r,'.doltap/project.md'),c=documentId(r,'.doltap/plans/ideas.md');
 for(const [from,to]of [[a,b],[b,c],[c,a]])mutate(root,()=>linkPlan(root,from,to,'depends-on'));
 assert.deepEqual(mapResult(inspect(root).graph).cycles,[[a,b,c].sort()]);
});
test('기본 CLI는 그래프 위반에서 실패하고 임시 스키마 옵션을 받지 않는다',()=>{
 const root=project(),cli=resolve('bin/doltap.mjs');writeFileSync(join(root,'.doltap/orphan.md'),'# no id');
 const run=spawnSync(process.execPath,[cli,'check',root,'--json'],{encoding:'utf8'});assert.equal(run.status,1);assert.ok(JSON.parse(run.stdout).problems.some(p=>p.message.includes('문서 노드')));
 assert.equal(spawnSync(process.execPath,[cli,'check',root,'--schema','next']).status,1);
});
