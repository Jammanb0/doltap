import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ID_PATTERN } from '../lib/anchors.mjs';
import { inspect } from '../lib/inspect.mjs';
import { UsageError, newId, planId, planRelate, planReview, planUnrelate, verifyChanges } from '../lib/editor.mjs';
import { readReviews } from '../lib/reviews.mjs';
import { StaleFileError, applyChanges, preview } from '../lib/writer.mjs';
import { codes, doc, makeProject, operating, range, read, writeFiles } from './helpers.mjs';

const A = 'doltap-s-aaaaaaa1';
const B = 'doltap-s-bbbbbbb1';
const apply = (root, plan) => {
  const result = applyChanges(root, plan.changes);
  assert.equal(result.failed, null);
  return plan;
};
const twoRanges = () => operating({
  'docs/a.md': doc('doltap-d-aaaaaaa0', '# A', '', ...range(A, [], '## 가', '', '본문 가')),
  'docs/b.md': doc('doltap-d-bbbbbbb0', '# B', '', ...range(B, [], '## 나', '', '본문 나')),
});

test('id: 문서 범위를 만들고 front matter는 범위 밖에 둔다', (t) => {
  const root = makeProject({ ...operating(), 'docs/new.md': ['---', 'title: 새 문서', '---', '', '# 새 문서', '', '본문', ''] }, t);
  const plan = apply(root, planId(inspect(root), 'docs/new.md'));
  assert.match(plan.id, /^doltap-d-/);
  const text = read(root, 'docs/new.md');
  assert.equal(text, `---\ntitle: 새 문서\n---\n<!-- doltap:start ${plan.id} -->\n\n# 새 문서\n\n본문\n\n<!-- doltap:end ${plan.id} -->\n`);
  assert.deepEqual(codes(inspect(root).problems), []);
  assert.throws(() => planId(inspect(root), 'docs/new.md'), /이미 문서 범위가 있습니다/);
});

test('id: 절 범위는 제목부터 같거나 높은 다음 제목 앞까지다', (t) => {
  const root = makeProject({
    ...operating(),
    'docs/g.md': doc('doltap-d-ggggggg0', '# 안내', '', '## 설치', '', '설치 본문', '', '### 조건', '', '조건 본문', '', '## 사용', '', '사용 본문'),
  }, t);
  const plan = apply(root, planId(inspect(root), 'docs/g.md', { kind: 's', at: '설치' }));
  const lines = read(root, 'docs/g.md').split('\n');
  assert.equal(lines[4], `<!-- doltap:start ${plan.id} -->`);
  assert.equal(lines[5], '## 설치');
  assert.equal(lines[lines.indexOf('## 사용') - 2], `<!-- doltap:end ${plan.id} -->`);
  assert.deepEqual(codes(inspect(root).problems), []);
  assert.throws(() => planId(inspect(root), 'docs/g.md', { kind: 's', at: '설치' }), /이미 범위가 있습니다/);
  assert.throws(() => planId(inspect(root), 'docs/g.md', { kind: 's', at: '없는 제목' }), /그런 제목이 없습니다/);
  assert.throws(() => planId(inspect(root), 'docs/g.md', { kind: 's', at: '8' }), /제목 줄에서 시작합니다/);
});

test('id: 블록 범위는 블록 경계에서만 만들고 기존 범위와 엇갈리지 않는다', (t) => {
  // 3–4행 문단, 6–10행 코드 블록(8행은 코드 안의 빈 줄), 12행 문단
  const root = makeProject({ ...operating(), 'docs/g.md': doc('doltap-d-ggggggg0', '첫 문단 첫 줄', '첫 문단 둘째 줄', '', '```', 'code', '', 'more', '```', '', '둘째 문단') }, t);
  const id = (at, end) => planId(inspect(root), 'docs/g.md', { kind: 'b', at, end });
  assert.throws(() => id('4', '4'), /4행은 문단이나 블록의 시작이 아닙니다/);
  assert.throws(() => id('3', '3'), /3행은 문단이나 블록의 끝이 아닙니다/);
  assert.throws(() => id('6', '7'), /코드 블록 가운데/);
  assert.throws(() => id('9', '9'), /시작할 수 있는 줄이 아닙니다/);
  assert.throws(() => id('3'), /--end/);
  const plan = apply(root, id('3', '10'));
  assert.match(plan.id, /^doltap-b-/);
  assert.deepEqual(codes(inspect(root).problems), []);
  // 표식 두 줄이 들어가 첫 문단은 4행, 둘째 문단은 14행이 됐다. 기존 범위 안에서 시작해 밖에서 끝나면 거부한다.
  assert.throws(() => id('4', '14'), /엇갈립니다/);
  assert.throws(() => id('12', '14'), /시작할 수 있는 줄이 아닙니다/);
});

test('id: 긴 울타리 안의 짧은 울타리를 경계로 삼아 코드 블록 가운데를 감싸지 않는다', (t) => {
  // 3행 ````, 4행 ```sh, 5행은 코드 안의 빈 줄, 6행 echo, 7행 ```, 8행 ````
  const root = makeProject({ ...operating(), 'docs/f.md': doc('doltap-d-fffffff0', '````markdown', '```sh', '', 'echo hi', '```', '````') }, t);
  const id = (at, end) => planId(inspect(root), 'docs/f.md', { kind: 'b', at, end });
  assert.throws(() => id('3', '4'), /코드 블록 가운데/);
  assert.throws(() => id('4', '7'), /4행은 문단이나 블록의 시작이 아닙니다/);
  apply(root, id('3', '8'));
  assert.deepEqual(codes(inspect(root).problems), []);
});

test('쓰기 전 마지막 확인: 표식이 깨지거나 검토 기록 형식이 틀린 결과는 쓰지 않는다', (t) => {
  const root = makeProject(twoRanges(), t);
  const inspection = inspect(root);
  const text = read(root, 'docs/a.md');
  const broken = text.replace(`<!-- doltap:end ${A} -->`, '');
  assert.throws(() => verifyChanges(inspection, [{ path: 'docs/a.md', before: text, after: broken }]), /표식이 맞지 않아 쓰지 않았습니다: docs\/a\.md:\d+ MARKER_/);
  const reviews = JSON.stringify({ version: 1, relations: { [`${A} same-as ${B}`]: { note: '확인' } } });
  assert.throws(() => verifyChanges(inspection, [{ path: '.doltap/reviews.json', before: null, after: reviews }]), /검토 기록이 형식에 맞지 않아/);
  assert.deepEqual(verifyChanges(inspection, [{ path: 'docs/a.md', before: text, after: text }]).length, 1);
});

test('id: 목록 항목 하나를 블록 범위로 감쌀 수 있다', (t) => {
  // 3–4행 첫 항목, 5–6행 둘째 항목(이어지는 줄 포함), 7행 셋째 항목
  const root = makeProject({ ...operating(), 'docs/g.md': doc('doltap-d-ggggggg0', '- 첫 항목', '  이어짐', '- 둘째 항목', '  이어짐', '- 셋째 항목') }, t);
  assert.throws(() => planId(inspect(root), 'docs/g.md', { kind: 'b', at: '4', end: '6' }), /4행은 문단이나 블록의 시작이 아닙니다/);
  assert.throws(() => planId(inspect(root), 'docs/g.md', { kind: 'b', at: '5', end: '5' }), /5행은 문단이나 블록의 끝이 아닙니다/);
  const plan = apply(root, planId(inspect(root), 'docs/g.md', { kind: 'b', at: '5', end: '6' }));
  assert.match(read(root, 'docs/g.md'), new RegExp(`  이어짐\\n<!-- doltap:start ${plan.id} -->\\n- 둘째 항목\\n  이어짐\\n<!-- doltap:end ${plan.id} -->\\n- 셋째 항목`));
  assert.deepEqual(codes(inspect(root).problems), []);
});

test('id: 목록 항목 기호 뒤에서 연 코드 블록도 블록 단위로 감싼다', (t) => {
  // 3행 첫 항목, 4–6행 코드 블록으로 시작하는 둘째 항목, 7행 셋째 항목
  const root = makeProject({ ...operating(), 'docs/g.md': doc('doltap-d-ggggggg0', '- 첫 항목', '- ```js', '  code', '  ```', '- 셋째 항목') }, t);
  const id = (at, end) => planId(inspect(root), 'docs/g.md', { kind: 'b', at, end });
  assert.throws(() => id('3', '4'), /4행은 문단이나 블록의 끝이 아닙니다/);
  assert.throws(() => id('5', '6'), /5행은 범위를 시작할 수 있는 줄이 아닙니다/);
  assert.match(id('3', '3').id, /^doltap-b-/, '다음 줄이 코드 블록을 여는 목록 항목이면 앞 항목에서 끝낼 수 있다');
  const plan = apply(root, id('4', '6'));
  assert.match(read(root, 'docs/g.md'), new RegExp(`- 첫 항목\\n<!-- doltap:start ${plan.id} -->\\n- \`\`\`js\\n  code\\n  \`\`\`\\n<!-- doltap:end ${plan.id} -->\\n- 셋째 항목`));
  assert.deepEqual(codes(inspect(root).problems), []);
});

test('id: 파일 없이 부르면 쓰지 않은 새 ID만 준다', (t) => {
  const root = makeProject(twoRanges(), t);
  const id = newId(inspect(root), 's');
  assert.match(id, ID_PATTERN);
  assert.throws(() => newId(inspect(root), 'x'), UsageError);
});

test('relate: 양쪽 선언을 함께 추가하고 한 줄 표식은 여러 줄로 바꾼다', (t) => {
  const root = makeProject(twoRanges(), t);
  apply(root, planRelate(inspect(root), A, 'depends-on', B));
  assert.match(read(root, 'docs/a.md'), new RegExp(`<!-- doltap:start ${A}\ndepends-on: ${B}\n-->`));
  assert.match(read(root, 'docs/b.md'), new RegExp(`<!-- doltap:start ${B}\ndepended-on-by: ${A}\n-->`));
  const result = inspect(root);
  assert.deepEqual(codes(result.problems), []);
  assert.equal(result.relations[0].key, `${A} depends-on ${B}`);
  assert.throws(() => planRelate(result, B, 'same-as', A), /이미 선언이 있습니다/);
  assert.throws(() => planRelate(result, A, 'related-to', B), /관계는/);
  assert.throws(() => planRelate(result, A, 'same-as', 'doltap-s-zzzzzzz9'), /범위가 없습니다/);
});

test('relate: 같은 관계 이름은 한 줄에 모으고 같은 파일의 두 범위도 함께 고친다', (t) => {
  const C = 'doltap-b-ccccccc1';
  const root = makeProject(operating({
    'docs/a.md': doc('doltap-d-aaaaaaa0', ...range(A, [`consistent-with: ${B}`], '본문 가'), '', ...range(C, [], '본문 다')),
    'docs/b.md': doc('doltap-d-bbbbbbb0', ...range(B, [`consistent-with: ${A}`], '본문 나')),
  }), t);
  apply(root, planRelate(inspect(root), C, 'consistent-with', A));
  const text = read(root, 'docs/a.md');
  assert.match(text, new RegExp(`consistent-with: ${B}, ${C}`));
  assert.match(text, new RegExp(`<!-- doltap:start ${C}\nconsistent-with: ${A}\n-->`));
  assert.deepEqual(codes(inspect(root).problems), []);
});

test('unrelate: 양쪽 선언과 검토 기록을 지우고, 남은 선언이 없으면 한 줄 표식으로 돌린다', (t) => {
  const root = makeProject(twoRanges(), t);
  apply(root, planRelate(inspect(root), A, 'same-as', B));
  apply(root, planReview(inspect(root), A, B, { note: '확인함', by: 'human' }));
  const plan = apply(root, planUnrelate(inspect(root), B, A));
  assert.deepEqual(plan.removedReviews, [`${A} same-as ${B}`]);
  assert.match(read(root, 'docs/a.md'), new RegExp(`<!-- doltap:start ${A} -->`));
  assert.match(read(root, 'docs/b.md'), new RegExp(`<!-- doltap:start ${B} -->`));
  assert.deepEqual(readReviews(root).relations, {});
  assert.throws(() => planUnrelate(inspect(root), A, B), /관계 선언이 없습니다/);
});

test('unrelate: 상대 범위가 이미 지워졌어도 남은 선언을 해제한다', (t) => {
  const root = makeProject(twoRanges(), t);
  apply(root, planRelate(inspect(root), A, 'same-as', B));
  writeFiles(root, { 'docs/b.md': null });
  assert.deepEqual(codes(inspect(root).problems), ['RELATION_TARGET_MISSING']);
  apply(root, planUnrelate(inspect(root), A, B));
  assert.deepEqual(codes(inspect(root).problems), []);
});

test('review: 입력과 전제가 맞지 않으면 기록하지 않는다', (t) => {
  const root = makeProject(twoRanges(), t);
  const base = inspect(root);
  assert.throws(() => planReview(base, A, B, { note: '', by: 'agent' }), /--note/);
  assert.throws(() => planReview(base, A, B, { note: '확인', by: '나' }), /--by/);
  for (const inherited of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
    assert.throws(() => planReview(base, A, B, { note: '확인', by: inherited }), /--by/, `${inherited}는 검토 주체가 아니다`);
  }
  assert.throws(() => planReview(base, A, B, { note: '확인', by: 'agent' }), /관계가 없습니다/);
  apply(root, planRelate(inspect(root), A, 'same-as', B));
  writeFiles(root, { '.doltap/reviews.json': '{ 손상' });
  const broken = inspect(root);
  assert.deepEqual(codes(broken.problems), ['REVIEWS_INVALID']);
  assert.throws(() => planReview(broken, A, B, { note: '확인', by: 'agent' }), /덮어쓰지 않습니다/);
});

test('review: 양쪽 지문과 판단을 남기고, 선언이 모두 사라진 관계의 기록만 정리한다', (t) => {
  const C = 'doltap-b-ccccccc1';
  const root = makeProject(operating({
    'docs/a.md': doc('doltap-d-aaaaaaa0', ...range(A, [], '본문 가'), '', ...range(C, [], '본문 다')),
    'docs/b.md': doc('doltap-d-bbbbbbb0', ...range(B, [], '본문 나')),
  }), t);
  apply(root, planRelate(inspect(root), A, 'same-as', B));
  apply(root, planRelate(inspect(root), C, 'consistent-with', B));
  apply(root, planReview(inspect(root), A, B, { note: '같은 뜻', by: '사람' }));
  apply(root, planReview(inspect(root), B, C, { note: '맞물림', by: 'agent' }));
  const saved = readReviews(root).relations[`${A} same-as ${B}`];
  assert.equal(saved.by, 'human');
  assert.equal(saved.note, '같은 뜻');
  assert.deepEqual(Object.keys(saved.fingerprints).sort(), [A, B]);

  // 한쪽 선언만 지운 관계는 해제 중일 수 있으므로 기록을 지키고, 양쪽 다 지운 관계만 정리한다.
  writeFiles(root, { 'docs/b.md': read(root, 'docs/b.md').replace(`same-as: ${A}\n`, '') });
  let plan = planReview(inspect(root), B, C, { note: '다시 확인', by: 'agent' });
  assert.deepEqual(plan.pruned, []);
  writeFiles(root, { 'docs/a.md': read(root, 'docs/a.md').replace(`<!-- doltap:start ${A}\nsame-as: ${B}\n-->`, `<!-- doltap:start ${A} -->`) });
  plan = apply(root, planReview(inspect(root), B, C, { note: '다시 확인', by: 'agent' }));
  assert.deepEqual(plan.pruned, [`${A} same-as ${B}`]);
  assert.deepEqual(Object.keys(readReviews(root).relations), [`${C} consistent-with ${B}`]);
});

test('review: 대상 문서가 사라졌거나 설정으로 빠져도 남은 선언이 있을 수 있으면 기록을 지킨다', (t) => {
  const C = 'doltap-s-ccccccc1';
  const D = 'doltap-s-ddddddd1';
  const root = makeProject(operating({
    'docs/a.md': doc('doltap-d-aaaaaaa0', '# A', '', ...range(A, [], '## 가', '', '본문 가')),
    'docs/b.md': doc('doltap-d-bbbbbbb0', '# B', '', ...range(B, [], '## 나', '', '본문 나')),
    'docs/c.md': doc('doltap-d-ccccccc0', '# C', '', ...range(C, [], '## 다', '', '본문 다')),
    'docs/d.md': doc('doltap-d-ddddddd0', '# D', '', ...range(D, [], '## 라', '', '본문 라')),
  }), t);
  apply(root, planRelate(inspect(root), A, 'same-as', B));
  apply(root, planRelate(inspect(root), C, 'same-as', D));
  apply(root, planReview(inspect(root), A, B, { note: '같은 뜻', by: 'human' }));
  apply(root, planReview(inspect(root), C, D, { note: '같은 뜻', by: 'human' }));
  const kept = () => Object.keys(readReviews(root).relations).sort();

  // B 문서를 지워도 A에 선언이 남아 있으므로 다른 관계를 검토할 때 A–B 기록을 지우지 않는다.
  writeFiles(root, { 'docs/b.md': null });
  let plan = apply(root, planReview(inspect(root), C, D, { note: '다시 확인', by: 'agent' }));
  assert.deepEqual(plan.pruned, []);
  assert.deepEqual(kept(), [`${A} same-as ${B}`, `${C} same-as ${D}`]);

  // A 문서를 설정으로 빼면 선언을 볼 수 없지만 남아 있을 수 있으므로 지우지 않는다.
  writeFiles(root, { '.doltap/config.json': JSON.stringify({ exclude: ['docs/a.md'] }) });
  plan = apply(root, planReview(inspect(root), C, D, { note: '다시 확인', by: 'agent' }));
  assert.deepEqual(plan.pruned, []);

  // 설정을 거두고 A의 선언도 지우면 어느 쪽에도 선언이 없으므로 그때 정리한다.
  writeFiles(root, {
    '.doltap/config.json': null,
    'docs/a.md': read(root, 'docs/a.md').replace(`<!-- doltap:start ${A}\nsame-as: ${B}\n-->`, `<!-- doltap:start ${A} -->`),
  });
  plan = apply(root, planReview(inspect(root), C, D, { note: '다시 확인', by: 'agent' }));
  assert.deepEqual(plan.pruned, [`${A} same-as ${B}`]);
  assert.deepEqual(kept(), [`${C} same-as ${D}`]);
});

test('쓰기: 읽은 뒤 바뀐 파일이 있으면 아무것도 쓰지 않는다', (t) => {
  const root = makeProject(twoRanges(), t);
  const plan = planRelate(inspect(root), A, 'same-as', B);
  writeFileSync(join(root, 'docs/b.md'), `${read(root, 'docs/b.md')}\n다른 편집\n`);
  assert.throws(() => applyChanges(root, plan.changes), StaleFileError);
  assert.doesNotMatch(read(root, 'docs/a.md'), /same-as/, '다른 파일도 쓰지 않는다');
});

test('쓰기: 중간에 실패하면 쓴 파일과 쓰지 못한 파일을 나눠 알린다', (t) => {
  const root = makeProject(twoRanges(), t);
  const before = read(root, 'docs/a.md');
  const result = applyChanges(root, [
    { path: 'docs/a.md', before, after: `${before}추가\n` },
    { path: 'docs/a.md/안쪽.md', before: null, after: '쓸 수 없는 위치' },
  ]);
  assert.deepEqual(result.written, ['docs/a.md']);
  assert.equal(result.failed.path, 'docs/a.md/안쪽.md');
  assert.deepEqual(result.notWritten, ['docs/a.md/안쪽.md']);
});

test('미리보기는 파일별로 바뀐 줄만 보여 준다', () => {
  const text = preview([{ path: 'a.md', before: '가\n나\n다\n', after: '가\n바\n다\n' }, { path: 'b.md', before: 'x', after: 'x' }]);
  assert.equal(text, '--- a.md\n+++ a.md\n@@ 2행 @@\n-나\n+바');
});
