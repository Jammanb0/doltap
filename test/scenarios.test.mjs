// 합의 때 확인하기로 한 흐름을 실제 파일과 CLI로 재현한다: 편집 → 검사 → 수정 → 검토 기록 → 알림 해소.
// 판정은 check --json으로, 기록과 관계 편집은 각 명령의 --apply로 한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { renameSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { toJson } from '../lib/findings.mjs';
import { inspect } from '../lib/inspect.mjs';
import { codes, doc, makeProject, operating, range, read, writeFiles } from './helpers.mjs';

const KO = 'doltap-s-k0000001';
const EN = 'doltap-s-e0000001';
const RULE = 'doltap-b-r0000001';
const GUIDE = 'doltap-s-g0000001';
const OPS = 'doltap-b-p0000001';

function files() {
  return operating({
    'docs/install.md': doc('doltap-d-k0000000', '# 설치', '',
      ...range(KO, [`same-as: ${EN}`, `depends-on: ${RULE}`], '## 설치 조건', '', 'Node.js 22 이상이 필요합니다.', '', '- Windows', '- macOS')),
    'docs/en/install.md': doc('doltap-d-e0000000', '# Install', '',
      ...range(EN, [`same-as: ${KO}`], '## Requirements', '', 'Node.js 22 or later is required.', '', '- Windows', '- macOS')),
    'docs/support.md': doc('doltap-d-r0000000', '# 지원 환경', '',
      ...range(RULE, [`depended-on-by: ${KO}`], '지원하는 Node.js는 22 이상입니다.')),
  });
}

const BIN = resolve(dirname(fileURLToPath(import.meta.url)), '../bin/doltap.mjs');
const cli = (root, ...args) => spawnSync(process.execPath, [BIN, ...args], { cwd: root, encoding: 'utf8', windowsHide: true });
const ok = (run) => assert.equal(run.status, 0, run.stderr);
const review = (root, a, b) => ok(cli(root, 'review', a, b, '--note', '두 범위를 읽고 확인함', '--by', 'agent', '--apply'));
const relate = (root, a, name, b) => ok(cli(root, 'relate', a, name, b, '--apply'));
const unrelate = (root, a, b) => ok(cli(root, 'unrelate', a, b, '--apply'));
const refused = (run, pattern) => {
  assert.equal(run.status, 2);
  assert.match(run.stderr, pattern);
};

// 실제 CLI의 판정을 받고, 같은 파일을 라이브러리로 읽은 결과와 항목 전체가 같은지 대조한다.
// 관계의 검토 상태처럼 check 출력에 없는 값은 돌려준 라이브러리 결과로 확인한다.
function check(root) {
  const run = cli(root, 'check', '--json');
  const output = JSON.parse(run.stdout);
  const result = inspect(root);
  assert.deepEqual(output.problems, result.problems.map(toJson));
  assert.deepEqual(output.notices, result.notices.map(toJson));
  assert.deepEqual(output.summary, result.summary);
  assert.equal(run.status, result.problems.length ? 1 : 0);
  return result;
}
const pending = (result) => result.notices.filter((item) => item.code === 'REVIEW_PENDING').map((item) => item.relation).sort();
const replace = (root, path, from, to) => writeFiles(root, { [path]: read(root, path).replace(from, to) });

test('양쪽 선언은 관계 하나이고 검토 대기도 하나다', (t) => {
  const root = makeProject(files(), t);
  const result = check(root);
  assert.deepEqual(codes(result.problems), []);
  assert.equal(result.relations.length, 2);
  assert.deepEqual(pending(result), [`${EN} same-as ${KO}`, `${KO} depends-on ${RULE}`]);
});

test('검토를 기록하면 알림이 사라지고, 기록만으로는 지문이 바뀌지 않는다', (t) => {
  const root = makeProject(files(), t);
  review(root, KO, EN);
  review(root, RULE, KO);
  const after = check(root);
  assert.deepEqual(pending(after), []);
  assert.deepEqual(codes(after.notices), []);
  assert.equal(after.relations.every((relation) => relation.review.state === 'reviewed'), true);
  const saved = JSON.parse(read(root, '.doltap/reviews.json'));
  assert.deepEqual(Object.keys(saved.relations).sort(), [`${EN} same-as ${KO}`, `${KO} depends-on ${RULE}`]);
});

test('어느 쪽 본문이 바뀌든 그 관계가 재검토 대상이 되고 바뀐 쪽을 알린다', (t) => {
  const root = makeProject(files(), t);
  review(root, KO, EN);
  review(root, RULE, KO);

  replace(root, 'docs/support.md', '22 이상입니다', '24 이상입니다');
  let result = check(root);
  assert.deepEqual(pending(result), [`${KO} depends-on ${RULE}`]);
  let item = result.notices.find((notice) => notice.code === 'REVIEW_PENDING');
  assert.equal(item.reason, 'basis-changed');
  assert.match(item.message, /기준.*바뀌었습니다/);

  review(root, KO, RULE);
  replace(root, 'docs/install.md', '22 이상이', '24 이상이');
  result = check(root);
  assert.deepEqual(pending(result), [`${EN} same-as ${KO}`, `${KO} depends-on ${RULE}`],
    '기준 변경으로 고친 범위의 다른 관계(번역)도 재검토 대상이 된다');
  item = result.notices.find((notice) => notice.relation === `${KO} depends-on ${RULE}`);
  assert.equal(item.reason, 'dependent-changed');
  assert.match(item.message, /기준을 이쪽에 맞추라는 뜻이 아닙니다/);
});

test('직접 관계만 재검토 대상이고 간접 연결은 의무가 되지 않는다', (t) => {
  const root = makeProject(files(), t);
  review(root, KO, EN);
  review(root, RULE, KO);
  replace(root, 'docs/support.md', '22 이상입니다', '22 이상을 지원합니다');
  const result = check(root);
  assert.deepEqual(pending(result), [`${KO} depends-on ${RULE}`], 'EN은 RULE과 직접 관계가 없으므로 대기에 오르지 않는다');
});

test('관계를 새로 더해도 기존 검토는 만료되지 않는다', (t) => {
  const root = makeProject({
    ...files(),
    'docs/ops.md': doc('doltap-d-p0000000', '# 운영', '', ...range(OPS, [], '신청은 이메일로 받습니다.')),
    'docs/guide.md': doc('doltap-d-g0000000', '# 안내', '', ...range(GUIDE, [], '신청서는 이메일로 보냅니다.')),
  }, t);
  review(root, KO, EN);
  review(root, RULE, KO);
  relate(root, KO, 'consistent-with', OPS);
  relate(root, GUIDE, 'consistent-with', OPS);
  const result = check(root);
  assert.deepEqual(codes(result.problems), []);
  assert.deepEqual(pending(result), [`${OPS} consistent-with ${GUIDE}`, `${OPS} consistent-with ${KO}`], '대칭 관계의 키는 두 ID를 사전순으로 놓는다');
});

test('same-as 골격 차이를 알리고 고치기 전에는 검토를 기록하지 않는다', (t) => {
  const root = makeProject(files(), t);
  replace(root, 'docs/en/install.md', '- macOS', '- macOS\n- Linux');
  const result = check(root);
  assert.deepEqual(codes(result.problems), ['SAME_AS_SKELETON']);
  assert.match(result.problems[0].message, new RegExp(`3번째 요소 — ${EN}는 글머리 목록 3항목, ${KO}는 글머리 목록 2항목`));
  refused(cli(root, 'review', KO, EN, '--note', '확인', '--by', 'human', '--apply'), /골격이 다릅니다/);
  replace(root, 'docs/install.md', '- macOS', '- macOS\n- Linux');
  assert.deepEqual(codes(check(root).problems), []);
});

test('파일을 옮겨도 ID로 관계를 찾고, 링크 경로만 고치면 검토 상태가 돌아온다', (t) => {
  const root = makeProject({
    ...files(),
    'docs/guide.md': doc('doltap-d-g0000000', '# 안내', '',
      ...range(GUIDE, [`consistent-with: ${RULE}`], '[지원 환경](support.md)을 먼저 확인하세요.')),
  }, t);
  replace(root, 'docs/support.md', `depended-on-by: ${KO}`, `depended-on-by: ${KO}\nconsistent-with: ${GUIDE}`);
  review(root, KO, EN);
  review(root, RULE, KO);
  review(root, GUIDE, RULE);
  assert.deepEqual(pending(check(root)), []);

  mkdirSync(join(root, 'docs/rules'));
  renameSync(join(root, 'docs/support.md'), join(root, 'docs/rules/support.md'));
  let result = check(root);
  assert.deepEqual(codes(result.problems), ['LINK_FILE_MISSING'], '관계는 ID로 이어져 있고 일반 링크만 끊긴다');
  replace(root, 'docs/guide.md', '(support.md)', '(rules/support.md)');
  result = check(root);
  assert.deepEqual(codes(result.problems), []);
  assert.deepEqual(pending(result), [], '같은 문서를 가리키는 링크로 고쳤으므로 지문이 원래대로 돌아온다');
});

test('관계 없는 범위를 직접 지우는 것은 오류가 아니고, 관계가 있던 범위를 지우면 남은 선언을 알린다', (t) => {
  const root = makeProject({ ...files(), 'docs/memo.md': doc('doltap-d-m0000000', '# 메모', '', '지울 문서') }, t);
  review(root, KO, EN);
  writeFiles(root, { 'docs/memo.md': null });
  assert.deepEqual(codes(check(root).problems), []);

  writeFiles(root, { 'docs/en/install.md': null });
  let result = check(root);
  assert.deepEqual(codes(result.problems), ['RELATION_TARGET_MISSING']);
  assert.equal(result.problems[0].where, 'docs/install.md:6');
  unrelate(root, KO, EN);
  result = check(root);
  assert.deepEqual(codes(result.problems), []);
  assert.equal(JSON.parse(read(root, '.doltap/reviews.json')).relations[`${EN} same-as ${KO}`], undefined, '해제한 관계의 검토 기록도 지운다');
});

test('대응 선언 누락과 잘못된 방향을 알리고, 고칠 때까지 검토를 기록하지 않는다', (t) => {
  const root = makeProject(files(), t);
  replace(root, 'docs/support.md', `depended-on-by: ${KO}`, `depends-on: ${KO}`);
  let result = check(root);
  assert.deepEqual(codes(result.problems), ['RELATION_MISMATCH']);
  refused(cli(root, 'review', KO, RULE, '--note', '확인', '--by', 'agent', '--apply'), /양쪽 선언이 맞지 않아/);
  replace(root, 'docs/support.md', `depends-on: ${KO}`, '');
  result = check(root);
  assert.deepEqual(codes(result.problems), ['RELATION_COUNTERPART_MISSING']);
  assert.equal(result.problems[0].related[0].path, 'docs/support.md');
});

test('엇갈린 범위와 중복 ID를 잡는다', (t) => {
  const root = makeProject(files(), t);
  writeFiles(root, { 'docs/copy.md': read(root, 'docs/support.md') });
  let result = check(root);
  assert.deepEqual(codes(result.problems).sort(), ['ID_DUPLICATE', 'ID_DUPLICATE']);
  writeFiles(root, { 'docs/copy.md': null });
  replace(root, 'docs/support.md', `<!-- doltap:end ${RULE} -->\n\n<!-- doltap:end doltap-d-r0000000 -->`, `<!-- doltap:end doltap-d-r0000000 -->\n<!-- doltap:end ${RULE} -->`);
  result = check(root);
  assert.deepEqual(codes(result.problems), ['MARKER_CROSSED']);
});

test('코드 블록 안의 표식 예시는 범위나 관계로 읽지 않는다', (t) => {
  const root = makeProject(operating({
    'docs/format.md': doc('doltap-d-f0000000', '# 문법', '', '```markdown', `<!-- doltap:start ${KO}`, `same-as: ${EN}`, '-->', `<!-- doltap:end ${KO} -->`, '```'),
  }), t);
  const result = check(root);
  assert.deepEqual(codes(result.problems), []);
  assert.equal(result.nodes.has(KO), false);
  assert.equal(result.relations.length, 0);
});

test('활성 범위가 보관된 근거에 의존하면 보관 범위도 검사하고, 보관 범위끼리는 빼고 본다', (t) => {
  const OLD = 'doltap-b-a0000001';
  const OLDER = 'doltap-b-a0000002';
  const root = makeProject({
    ...files(),
    '.doltap/archive/001-setup/decisions.md': doc('doltap-d-a0000000', '# 결정', '',
      ...range(OLD, [], '지원 범위를 Node 22로 정한 근거'),
      ...range(OLDER, [`same-as: ${OLD}`], '짝이 없는 과거 선언')),
    '.doltap/history.md': doc('doltap-d-hstry001', '# 작업 이력', '', '- 001-setup: 완료'),
  }, t);
  relate(root, RULE, 'depends-on', OLD);
  let result = check(root);
  assert.deepEqual(codes(result.problems), [], '보관 범위끼리의 짝 없는 선언은 보고하지 않는다');
  assert.ok(pending(result).includes(`${RULE} depends-on ${OLD}`), '보관 범위와의 관계도 검토 대상이다');

  replace(root, '.doltap/archive/001-setup/decisions.md', `depended-on-by: ${RULE}`, '');
  result = check(root);
  assert.deepEqual(codes(result.problems), ['RELATION_COUNTERPART_MISSING'], '활성 범위와의 짝 선언은 보관 문서에서도 확인한다');
});
