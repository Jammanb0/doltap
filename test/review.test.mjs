import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { inspect } from '../lib/runtime.mjs';
import { mutate, transact } from '../lib/transaction.mjs';
import { idPlan, linkPlan, migratePlan, wrap } from '../lib/edit.mjs';
import { reviewPlan } from '../lib/state.mjs';
import { audit } from '../lib/query.mjs';

function project() {
  const root = mkdtempSync(join(tmpdir(), 'doltap-review-'));
  cpSync('template', root, { recursive: true, filter: p => !p.includes('recovery') });
  return root;
}
const id = (r, path) => [...r.graph.byId.values()].find(n => n.path === path && n.kind === 'd').id;
const nodeReview = (root, target) => mutate(root, () => reviewPlan(root, inspect(root).graph, target, { node: true, judgment: '최신임', why: '본문과 연결된 관계를 대조함', actor: '에이전트' }));
const edgeReview = (root, target) => mutate(root, () => reviewPlan(root, inspect(root).graph, target, { judgment: '반영함', why: '대상의 변경을 출발 내용에 반영함', actor: '에이전트' }));
const query = (root, scope = '.', options = {}) => { const r = inspect(root); return audit(root, r, r.records, scope, options); };

function oldReviews(root) {
  const r = inspect(root), target = id(r, '.doltap/plans/project.md'), n = r.graph.byId.get(target);
  const path = '.doltap/reviews/2025.md';
  const body = '# 검토 기록\n\n## 노드 검토\n\n| 시각 | 노드 ID | contentHash | graphHash | 판단 | 이유 | 주체 |\n| --- | --- | --- | --- | --- | --- | --- |\n' +
    `| 2025-12-02T00:00:00Z | ${target} | bbbbbbbb | ${n.graphHash.slice(0,8)} | 고쳐야 함 | 마지막 판단 | 사람 |\n` +
    `| 2025-12-01T00:00:00Z | ${target} | ${n.contentHash.slice(0,8)} | ${n.graphHash.slice(0,8)} | 최신임 | 옛 판단 | 에이전트 |\n` +
    '\n## 관계 검토\n\n| 시각 | 관계 ID | 출발 해시 | 도착 해시 | 판단 | 이유 | 주체 |\n| --- | --- | --- | --- | --- | --- | --- |\n' +
    '\n## 감사 제안\n\n| 시각 | 제안 ID | 출발 | 관계 | 도착 | 근거 | 판정 | 판정 이유 | 주체 |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- |\n' +
    `| 2025-12-01T00:00:00Z | suggestion | ${target} | references | ${id(r,'AGENTS.md')} | 근거 | 기각 | 재제안 방지 | 사람 |\n`;
  mkdirSync(join(root,'.doltap/reviews'),{recursive:true});
  writeFileSync(join(root,path),wrap('doltap-d-12345678',body));
  mutate(root,()=>migratePlan(root));
  return {target,path};
}

test('이전 연도 검토는 최신 시각 한 건만 옮기고 감사 제안은 보존한다',()=>{
  const root=project(), {target,path}=oldReviews(root);
  const before=inspect(root).records.suggestions;
  assert.equal(inspect(root).graph.byId.get(target).review.state,'stale');
  nodeReview(root,id(inspect(root),'AGENTS.md'));
  const result=inspect(root), row=result.records.nodes.find(r=>r[1]===target);
  assert.equal(row[4],'고쳐야 함');assert.equal(row[2],'bbbbbbbb');
  assert.equal(result.records.nodes.length,2);assert.deepEqual(result.records.suggestions,before);
  assert.equal(result.graph.byId.get(id(result,'AGENTS.md')).review.state,'fresh');
  const old=readFileSync(join(root,path),'utf8');assert.ok(!old.includes('## 노드 검토'));assert.ok(!old.includes('## 관계 검토'));
  assert.ok(!readFileSync(join(root,'.doltap/reviews/reviewed.md'),'utf8').includes('옛 판단'));
  const saved=readFileSync(join(root,path),'utf8');nodeReview(root,target);
  assert.equal(readFileSync(join(root,path),'utf8'),saved);
  assert.equal(inspect(root).records.nodes.length,2);
});

test('검토 이관 중 쓰기 실패는 이전 기록과 발급 대장을 함께 복구한다',()=>{
  const root=project(), {path}=oldReviews(root), files=[path,'AGENTS.md','.doltap/ids.md'];
  const before=files.map(p=>readFileSync(join(root,p),'utf8'));
  const plan=reviewPlan(root,inspect(root).graph,id(inspect(root),'AGENTS.md'),{node:true,judgment:'최신임',why:'내용 대조',actor:'에이전트'});
  assert.throws(()=>transact(root,plan,{afterReplace:i=>{if(i===2)throw new Error('injected')}}),/injected/);
  assert.deepEqual(files.map(p=>readFileSync(join(root,p),'utf8')),before);
  assert.equal(existsSync(join(root,'.doltap/reviews/reviewed.md')),false);
});

test('손상된 현재 검토 표는 교체로 유실시키지 않는다',()=>{
  const root=project(), target=id(inspect(root),'.doltap/plans/project.md');nodeReview(root,target);
  const path=join(root,'.doltap/reviews/reviewed.md');
  writeFileSync(path,readFileSync(path,'utf8').replace('## 관계 검토','손상된 행\n\n## 관계 검토'));
  const before=readFileSync(path,'utf8');assert.throws(()=>nodeReview(root,target),/덮어쓰지/);
  assert.equal(readFileSync(path,'utf8'),before);
});

test('첫 AGENTS 검토는 기록 파일 색인이 추가된 최종 그래프를 검토한다', () => {
  const root = project(), target = id(inspect(root), 'AGENTS.md');
  nodeReview(root, target);
  const node = inspect(root).graph.byId.get(target);
  assert.equal(node.review.state, 'fresh');
  assert.equal(query(root, '.', { changed: true }).candidates.some(n => n.id === target), false);
});

test('노드 검토는 최신 한 건으로 교체하고 과거 내용 복원으로 되살아나지 않는다', () => {
  const root = project(), target = id(inspect(root), '.doltap/plans/project.md');
  const path = join(root, '.doltap/plans/project.md'), original = readFileSync(path, 'utf8');
  nodeReview(root, target);
  writeFileSync(path, original.replace('# 프로젝트', '# 변경된 프로젝트'));
  assert.equal(inspect(root).graph.byId.get(target).review.state, 'stale');
  writeFileSync(path, original);
  assert.equal(inspect(root).graph.byId.get(target).review.state, 'fresh');
  writeFileSync(path, original.replace('# 프로젝트', '# 변경된 프로젝트'));
  nodeReview(root, target);
  assert.equal(inspect(root).records.nodes.filter(r => r[1] === target).length, 1);
  writeFileSync(path, original);
  assert.equal(inspect(root).graph.byId.get(target).review.state, 'stale');
  mutate(root, () => reviewPlan(root, inspect(root).graph, target, {node:true, judgment:'고쳐야 함', why:'복원한 내용에도 수정이 필요함', actor:'에이전트'}));
  assert.equal(inspect(root).graph.byId.get(target).review.judgment, '고쳐야 함');
  assert.ok(query(root, '.', {changed:true}).candidates.some(n => n.id === target));
  nodeReview(root, target);
  assert.equal(inspect(root).records.nodes.filter(r => r[1] === target).length, 1);
  assert.equal(inspect(root).graph.byId.get(target).review.judgment, '최신임');
});

test('관계 검토도 최신 한 건만 남기며 대상이 과거 내용으로 돌아가면 만료된다', () => {
  const root = project(), r = inspect(root), a = id(r, 'AGENTS.md'), b = id(r, '.doltap/plans/project.md');
  mutate(root, () => linkPlan(root, a, b, 'depends-on'));
  const key = `${a}:depends-on:${b}`, path = join(root, '.doltap/plans/project.md'), original = readFileSync(path, 'utf8');
  edgeReview(root, key);
  writeFileSync(path, original.replace('# 프로젝트', '# 변경된 프로젝트'));
  assert.equal(inspect(root).graph.edges.find(e => e.id === key).review.state, 'stale');
  writeFileSync(path, original);
  assert.equal(inspect(root).graph.edges.find(e => e.id === key).review.state, 'fresh');
  writeFileSync(path, original.replace('# 프로젝트', '# 변경된 프로젝트'));
  edgeReview(root, key);
  assert.equal(inspect(root).records.edges.filter(r => r[1] === key).length, 1);
  writeFileSync(path, original);
  assert.equal(inspect(root).graph.edges.find(e => e.id === key).review.state, 'stale');
  edgeReview(root, key);
  assert.equal(inspect(root).graph.edges.find(e => e.id === key).review.state, 'fresh');
});

test('감사 후보는 발급·검토 메타데이터를 제외하고 모두 노드 검토가 가능하다', () => {
  const root = project(); nodeReview(root, id(inspect(root), '.doltap/plans/project.md'));
  const candidates = query(root, '.', { changed: true }).candidates;
  assert.equal(candidates.some(n => n.path === '.doltap/ids.md' || n.path.startsWith('.doltap/reviews/')), false);
  for (const n of candidates) assert.doesNotThrow(() => reviewPlan(root, inspect(root).graph, n.id, { node: true, judgment: '최신임', why: '검토 가능한 본문임', actor: '에이전트' }));
});

test('감사의 관계·상태·레거시 필터가 재검토 목록에도 적용된다', () => {
  const root = project(), r = inspect(root), a = id(r, 'AGENTS.md'), b = id(r, '.doltap/plans/project.md'), c = id(r, '.doltap/plans/ideas.md');
  mutate(root, () => linkPlan(root, a, b, 'depends-on'));
  mutate(root, () => linkPlan(root, a, c, 'derived-from'));
  assert.deepEqual(query(root, '.', { relation: 'depends-on' }).reviewRequired.map(e => e.type), ['depends-on']);
  assert.equal(query(root, '.', { state: 'archived' }).reviewRequired.length, 0);
  assert.equal(query(root, '.', { state: 'active' }).reviewRequired.length, 2);
  assert.throws(() => query(root, '.', { state: 'typo' }), /상태/);
});

test('여러 출발점의 검토는 같은 대상 변경에도 서로 독립적이다', () => {
  const root = project(), r = inspect(root), a = id(r, 'AGENTS.md'), b = id(r, '.doltap/plans/project.md'), c = id(r, '.doltap/plans/ideas.md');
  for (const from of [a, b]) mutate(root, () => linkPlan(root, from, c, 'depends-on'));
  const keys = [a, b].map(from => `${from}:depends-on:${c}`);
  for (const key of keys) edgeReview(root, key);
  const states = () => keys.map(key => inspect(root).graph.edges.find(e => e.id === key).review.state);
  assert.deepEqual(states(), ['fresh', 'fresh']);
  const path = join(root, '.doltap/plans/ideas.md'); writeFileSync(path, readFileSync(path, 'utf8').replace('# 아이디어', '# 다른 아이디어'));
  assert.deepEqual(states(), ['stale', 'stale']);
  edgeReview(root, keys[0]); assert.deepEqual(states(), ['fresh', 'stale']);
});

test('한 출발점이 여러 대상을 가리켜도 변경된 대상의 관계만 만료된다', () => {
  const root = project(), r = inspect(root), a = id(r, 'AGENTS.md'), b = id(r, '.doltap/plans/project.md'), c = id(r, '.doltap/plans/ideas.md');
  for (const to of [b, c]) { mutate(root, () => linkPlan(root, a, to, 'depends-on')); edgeReview(root, `${a}:depends-on:${to}`); }
  const path = join(root, '.doltap/plans/project.md'); writeFileSync(path, readFileSync(path, 'utf8').replace('# 프로젝트', '# 변경 프로젝트'));
  const edges = inspect(root).graph.edges.filter(e => e.type === 'depends-on');
  assert.equal(edges.find(e => e.to === b).review.state, 'stale');
  assert.equal(edges.find(e => e.to === c).review.state, 'fresh');
});

test('감사는 ./경로와 경로를 같은 범위로 읽는다', () => {
  const root = project(); mkdirSync(join(root, 'docs')); writeFileSync(join(root, 'docs/a.md'), '# 내용');
  mutate(root, () => idPlan(root, 'docs/a.md'));
  const row = readFileSync(join(root, '.doltap/ids.md'), 'utf8').split('\n').find(l => l.includes('docs/a.md'));
  mutate(root, () => linkPlan(root, id(inspect(root), 'AGENTS.md'), row.split('|')[1].trim(), 'references'));
  assert.deepEqual(query(root, './docs').candidates, query(root, 'docs').candidates);
});

test('손상된 기존 검토 문서는 첫 기록 생성으로 덮어쓰지 않는다', () => {
  const root = project(), path = join(root, `.doltap/reviews/${new Date().getUTCFullYear()}.md`);
  mkdirSync(join(root, '.doltap/reviews')); writeFileSync(path, '# 보존할 과거 검토\n기록이 있음');
  const before = readFileSync(path, 'utf8');
  assert.throws(() => nodeReview(root, id(inspect(root), 'AGENTS.md')), /덮어쓰지/);
  assert.equal(readFileSync(path, 'utf8'), before);
});

test('레거시 범위의 재검토도 include-legacy를 명시했을 때만 반환한다', () => {
  const root = project(), path = '.doltap/archive/legacy/note.md';
  mkdirSync(join(root, '.doltap/archive/legacy'), { recursive: true }); writeFileSync(join(root, path), '# 옛 근거');
  mutate(root, () => migratePlan(root));
  const r = inspect(root); mutate(root, () => linkPlan(root, id(r, 'AGENTS.md'), id(r, path), 'depends-on'));
  assert.equal(query(root, '.doltap/archive/legacy').reviewRequired.length, 0);
  assert.equal(query(root, '.doltap/archive/legacy', { includeLegacy: true, state: 'legacy' }).reviewRequired.length, 1);
});
test('다른 문서에서 옮긴 block만 있어도 이관이 바깥 문서 ID를 만든다', () => {
  const root = project(), path = '.doltap/moved.md';
  writeFileSync(join(root, path), wrap('doltap-b-12345678', '옮긴 주장'));
  mutate(root, () => migratePlan(root));
  const r = inspect(root); assert.equal(r.problems.length, 0);
  assert.equal(r.graph.byId.get('doltap-b-12345678').parent, id(r, path));
});
