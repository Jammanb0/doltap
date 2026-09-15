import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, renameSync, rmSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fullCheck, inspect } from '../lib/runtime.mjs';
import { checkGraph, toJson } from '../lib/graph-check.mjs';
import { format } from '../lib/check.mjs';
import { wrap, insertBeforeEnd, linkPlan, moveFixPlan, idPlan } from '../lib/edit.mjs';
import { reviewPlan } from '../lib/state.mjs';
import { mutate } from '../lib/transaction.mjs';

const cli = resolve('bin/doltap.mjs');
function project(t) {
  const root = mkdtempSync(join(tmpdir(), 'doltap-diagnostics-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  cpSync('template', root, { recursive: true, filter: p => !p.includes('recovery') });
  return root;
}
const run = (root, ...args) => spawnSync(process.execPath, [cli, 'check', root, ...args], { encoding: 'utf8', windowsHide: true });
const nodeAt = (root, path) => [...inspect(root).graph.byId.values()].find(n => n.path === path && n.kind === 'd');
const write = (root, path, text) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), text); };
function append(root, path, body) {
  write(root, path, insertBeforeEnd(readFileSync(join(root, path), 'utf8'), nodeAt(root, path).id, body));
}
function files(root) {
  return readdirSync(root, { recursive: true, withFileTypes: true }).filter(e => e.isFile())
    .map(e => join(e.parentPath, e.name)).sort().map(p => [p, readFileSync(p, 'utf8')]);
}
function assertDiagnostic(f) {
  assert.match(f.code, /^[A-Z][A-Z_]+$/);
  assert.ok(f.message && f.hint && f.location.path);
  assert.equal(f.where, f.location.path + (f.location.line ? ':' + f.location.line : ''));
  assert.ok(Array.isArray(f.related));
}

test('CLI는 연결 오류를 한 번 출력하고 JSON·터미널·종료 코드가 일치하며 읽기만 한다', t => {
  const root = project(t);
  write(root, 'CLAUDE.md', '# disconnected');
  const before = files(root), human = run(root), json = run(root, '--json');
  assert.equal(human.status, 1, human.stderr);
  assert.equal(json.status, 1, json.stderr);
  const result = JSON.parse(json.stdout);
  assert.equal(result.schema, 'doltap.check.v1');
  assert.ok(Array.isArray(result.nodes) && Array.isArray(result.edges));
  const findings = result.problems.filter(f => f.code === 'CLAUDE_IMPORT_MISSING');
  assert.equal(findings.length, 1);
  assert.deepEqual(findings[0].location, { path: 'CLAUDE.md' });
  for (const f of [...result.problems, ...result.notices]) {
    assertDiagnostic(f);
    assert.ok(human.stdout.includes(`[${f.code}] ${f.where}`));
    assert.ok(human.stdout.includes(f.message) && human.stdout.includes(`다음: ${f.hint}`));
  }
  assert.deepEqual(files(root), before);
  write(root, 'CLAUDE.md', '@AGENTS.md\n');
  const fixed = run(root, '--json');
  assert.equal(fixed.status, 0, fixed.stderr);
  assert.deepEqual(JSON.parse(fixed.stdout).problems, []);
  assert.ok(JSON.parse(fixed.stdout).notices.every(f => f.code === 'PLACEHOLDER'));
});

test('중복 ID는 두 파일의 실제 시작 행을 안내하고 복사본 제거 후 사라진다', t => {
  const root = project(t), path = '.doltap/복사한 문서.md';
  write(root, path, readFileSync(join(root, '.doltap/plans/project.md'), 'utf8'));
  const result = fullCheck(root), finding = result.problems.find(f => f.code === 'ID_DUPLICATE');
  assertDiagnostic(finding);
  assert.equal(finding.related.length, 1);
  assert.deepEqual(new Set([finding.location.path, finding.related[0].path]), new Set([path, '.doltap/plans/project.md']));
  for (const place of [finding.location, ...finding.related]) {
    assert.ok(readFileSync(join(root, place.path), 'utf8').split(/\r?\n/)[place.line - 1].includes('-start'));
  }
  const output = format(result);
  assert.ok(output.includes(`관련: ${finding.related[0].path}:${finding.related[0].line}`));
  rmSync(join(root, path));
  assert.equal(fullCheck(root).problems.length, 0);
});

test('이동한 관계 대상은 새 위치를 안내하고 move-fix 적용 후 재검사를 통과한다', t => {
  const root = project(t), old = '.doltap/extra.md', fresh = '.doltap/설명 문서.md';
  write(root, old, '# 추가 설명');
  mutate(root, () => idPlan(root, old, { kind: 'd' }));
  mutate(root, () => linkPlan(root, nodeAt(root, 'AGENTS.md').id, nodeAt(root, old).id, 'indexes'));
  const original = readFileSync(join(root, old), 'utf8');
  renameSync(join(root, old), join(root, fresh));
  const result = fullCheck(root), moved = result.notices.find(f => f.code === 'RELATION_PATH_STALE');
  assertDiagnostic(moved);
  assert.equal(moved.related[0].path, fresh);
  assert.match(moved.hint, /doltap move-fix/);
  mutate(root, () => moveFixPlan(root));
  assert.equal(readFileSync(join(root, fresh), 'utf8'), original);
  assert.equal(fullCheck(root).problems.length, 0);
  assert.ok(!fullCheck(root).notices.some(f => f.code === 'RELATION_PATH_STALE'));
});

test('일반 링크 오류는 작성 행을 가리키며 파일 복원 후 사라지고 코드 예시는 무시한다', t => {
  const root = project(t);
  append(root, 'AGENTS.md', '[자료](missing.md)\n\n```md\n[예시](example-missing.md)\n```');
  const finding = fullCheck(root).problems.find(f => f.code === 'LINK_FILE_MISSING');
  assertDiagnostic(finding);
  const line = readFileSync(join(root, 'AGENTS.md'), 'utf8').split(/\r?\n/)[finding.location.line - 1];
  assert.equal(line, '[자료](missing.md)');
  write(root, 'missing.md', '# 자료');
  assert.equal(fullCheck(root).problems.length, 0);
});

test('교차·시작 누락·끝 누락·잘못된 앵커를 서로 다른 코드로 구분한다', () => {
  const d = 'doltap-d-12345678', s = 'doltap-s-12345678';
  const start = id => `<a name="${id}-start" id="${id}-start"></a>`;
  const end = id => `<a name="${id}-end" id="${id}-end"></a>`;
  for (const [body, code] of [
    [start(d) + '\n' + start(s) + '\n' + end(d), 'ANCHOR_CROSSED'],
    [end(d), 'ANCHOR_START_MISSING'], [start(d), 'ANCHOR_END_MISSING'],
    [`<a name="${d}-start" id="${s}-start"></a>`, 'ANCHOR_MALFORMED'],
  ]) {
    const result = checkGraph({ documents: [{ path: '문서.md', text: body }] });
    const f = result.problems.find(p => p.code === code);
    assertDiagnostic(f);
    if (code === 'ANCHOR_CROSSED') assert.deepEqual(f.related, [{ path: '문서.md', line: 2, label: '아직 닫히지 않은 시작' }]);
  }
  assert.deepEqual(checkGraph({ documents: [{ path: '문서.md', text: wrap(d, '# 정상') }] }).problems, []);
});

function relation(root, type, reverse = false) {
  let a = nodeAt(root, 'AGENTS.md'), b = nodeAt(root, '.doltap/plans/project.md');
  if (reverse && a.id < b.id) [a, b] = [b, a];
  mutate(root, () => linkPlan(root, a.id, b.id, type));
  const edge = inspect(root).graph.edges.find(e => e.from === a.id && e.to === b.id && e.type === type);
  return { a, b, edge };
}
function review(root, edge) {
  mutate(root, () => reviewPlan(root, inspect(root).graph, edge.id, { judgment: '재검증함', why: '두 범위의 내용과 관계를 대조함', actor: '에이전트' }));
}
const stale = (root, edge) => fullCheck(root).notices.find(f => f.code === 'REVIEW_STALE' && f.message.includes(edge.id));

test('검토 기록이 없는 관계는 양쪽 위치와 실제 관계 ID를 안내하고 기록 후 사라진다', t => {
  const root = project(t), { a, b, edge } = relation(root, 'depends-on');
  const f = stale(root, edge);
  assertDiagnostic(f);
  assert.equal(f.reason, 'unreviewed');
  assert.deepEqual(f.related.map(p => p.path), [a.path, b.path]);
  assert.ok(f.hint.includes(`doltap context ${a.id}`) && f.hint.includes(`doltap review ${edge.id}`));
  assert.equal(run(root).status, 0);
  review(root, edge);
  assert.equal(stale(root, edge), undefined);
});

for (const type of ['depends-on', 'produces', 'verified-by', 'update-with']) {
  test(`${type} 재검토 이유는 만료 방향을 따르고 대칭 관계도 실제 출발·도착을 구분한다`, t => {
    const root = project(t), { a, b, edge } = relation(root, type, type === 'update-with');
    if (type === 'update-with') assert.ok(a.id > b.id, '해시 정렬과 선언 순서를 반대로 구성');
    review(root, edge);
    assert.equal(stale(root, edge), undefined);
    append(root, a.path, '\n출발 내용 변경.');
    if (type === 'depends-on') assert.equal(stale(root, edge), undefined);
    else assert.equal(stale(root, edge).reason, 'source-changed');
    append(root, b.path, '\n도착 내용 변경.');
    const reason = type === 'depends-on' ? 'target-changed' : type === 'produces' ? 'source-changed' : 'both-changed';
    assert.equal(stale(root, edge).reason, reason);
    const json = JSON.parse(run(root, '--json').stdout);
    assert.equal(json.notices.find(f => f.message.includes(edge.id)).reason, reason);
    review(root, edge);
    assert.equal(stale(root, edge), undefined);
    append(root, b.path, '\n도착만 다시 변경.');
    if (type === 'produces') assert.equal(stale(root, edge), undefined);
    else assert.equal(stale(root, edge).reason, 'target-changed');
  });
}

test('중단된 쓰기는 복구 ID와 미리보기 행동을 안내하며 검사로 복구하지 않는다', t => {
  const root = project(t), id = '12345678-1234-1234-1234-123456789abc';
  const path = `.doltap/recovery/${id}/manifest.json`;
  write(root, path, JSON.stringify({ version: 1, id, state: 'prepared', files: [] }));
  const before = files(root), result = run(root, '--json');
  assert.equal(result.status, 1);
  const f = JSON.parse(result.stdout).problems.find(f => f.code === 'RECOVERY_PENDING');
  assertDiagnostic(f);
  assert.ok(f.message.includes(id) && f.hint.includes(`doltap recover ${id}로 복구 계획을 확인`));
  assert.deepEqual(files(root), before);
  write(root, path, JSON.stringify({ version: 1, id, state: 'recovered', files: [] }));
  assert.ok(!fullCheck(root).problems.some(f => f.code === 'RECOVERY_PENDING'));
});

test('아카이브 미해결 안내도 공통 진단을 쓰고 상태를 해결하면 사라진다', t => {
  const root = project(t), path = '.doltap/archive/workstreams/099-sample/status.md';
  write(root, path, '# 상태\n\n- `전제` 보관 전에 확인할 조건\n- `상태` 미해결');
  mutate(root, () => idPlan(root, path, { kind: 'd' }));
  const f = fullCheck(root).problems.find(f => f.code === 'ARCHIVE_UNRESOLVED');
  assertDiagnostic(f);
  assert.equal(f.location.path, path);
  assert.match(f.hint, /해결.*이월.*폐기/);
  write(root, path, readFileSync(join(root, path), 'utf8').replace('`상태` 미해결', '`상태` 해결'));
  assert.ok(!fullCheck(root).problems.some(f => f.code === 'ARCHIVE_UNRESOLVED'));
});

test('검토가 만료되지 않는 관계에는 내용 변경 후에도 재검토 안내가 없다', t => {
  const root = project(t), { a, b, edge } = relation(root, 'references');
  append(root, a.path, '출발 변경'); append(root, b.path, '도착 변경');
  assert.equal(stale(root, edge), undefined);
});

test('같은 ID를 출발·도착으로 쓰는 관계도 만료 대상인 쪽만 변경 이유로 표시한다', t => {
  for (const [type, reason] of [['depends-on', 'target-changed'], ['produces', 'source-changed']]) {
    const root = project(t), node = nodeAt(root, '.doltap/plans/project.md');
    mutate(root, () => linkPlan(root, node.id, node.id, type));
    const edge = inspect(root).graph.edges.find(e => e.from === node.id && e.to === node.id && e.type === type);
    review(root, edge);
    assert.equal(stale(root, edge), undefined);
    append(root, node.path, '자기 참조 범위의 내용 변경');
    assert.equal(stale(root, edge).reason, reason);
  }
});

test('손상 검토 기록과 발급 상태는 실제 표 행을 안내한다', t => {
  const root = project(t), { edge } = relation(root, 'depends-on');
  review(root, edge);
  const path = '.doltap/reviews/reviewed.md', text = readFileSync(join(root, path), 'utf8');
  write(root, path, text.replace('| 재검증함 |', '| 잘못된판단 |'));
  const f = fullCheck(root).problems.find(f => f.code === 'REVIEW_INVALID');
  assertDiagnostic(f);
  assert.equal(f.location.path, path);
  assert.ok(readFileSync(join(root, path), 'utf8').split(/\r?\n/)[f.location.line - 1].includes('잘못된판단'));
  write(root, path, text);
  const registry = readFileSync(join(root, '.doltap/ids.md'), 'utf8');
  write(root, '.doltap/ids.md', registry.replace('| 활성 |', '| 모름 |'));
  const bad = fullCheck(root).problems.find(f => f.code === 'REGISTRY_INVALID');
  assertDiagnostic(bad);
  assert.ok(readFileSync(join(root, bad.location.path), 'utf8').split(/\r?\n/)[bad.location.line - 1].includes('| 모름 |'));
  write(root, '.doltap/ids.md', registry);
  assert.equal(fullCheck(root).problems.length, 0);
});

test('긴 한글 경로와 여러 줄 설명도 일정하게 들여쓰고 JSON은 코드 없는 기존 입력을 보존한다', () => {
  const long = '.doltap/' + '긴 경로/'.repeat(12) + '문서.md:12';
  const output = format({ problems: [{ where: long, message: '첫 줄\n둘째 줄' }], notices: [], passed: [] });
  assert.ok(output.includes('\n    첫 줄\n    둘째 줄\n'));
  const result = toJson({ problems: [{ where: 'old.md', message: '기존 메시지' }], notices: [], graph: { byId: new Map(), edges: [] } });
  assert.deepEqual(JSON.parse(JSON.stringify(result)).problems, [{ where: 'old.md', message: '기존 메시지' }]);
});
