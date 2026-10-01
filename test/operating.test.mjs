import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { inspect } from '../lib/inspect.mjs';
import { newId } from '../lib/editor.mjs';
import { readReviews, reviewState, serializeReviews } from '../lib/reviews.mjs';
import { codes, doc, makeProject, operating, writeFiles } from './helpers.mjs';

const workstream = (name, extra = {}) => ({
  [`.doltap/workstreams/${name}/README.md`]: doc('doltap-d-w0000001', '# 작업'),
  [`.doltap/workstreams/${name}/status.md`]: doc('doltap-d-w0000002', '# 상태'),
  ...extra,
});
const listed = (...names) => doc('doltap-d-crnt0001', '# 현재 작업', '', ...names.map((name) => `- [${name}](workstreams/${name}/README.md)`));

test('기본 구조만 갖춘 프로젝트는 문제가 없고 CLAUDE.md는 검사하지 않는다', (t) => {
  const root = makeProject(operating(), t);
  const result = inspect(root);
  assert.deepEqual(codes(result.problems), []);
  assert.deepEqual(codes(result.notices), []);
  writeFiles(root, { 'CLAUDE.md': '@AGENTS.md\n\n## Claude Code\n\n계획 모드를 씁니다.\n' });
  assert.deepEqual(codes(inspect(root).problems), []);
});

test('.doltap이 없으면 운영 검사를 하지 않고 한 번만 알린다', (t) => {
  const root = makeProject({ 'README.md': ['# 문서'] }, t);
  assert.deepEqual(codes(inspect(root).problems), ['OPERATING_DIR_MISSING']);
});

test('진입점과 필수 운영 문서, 그 표식을 확인한다', (t) => {
  const root = makeProject({ ...operating(), 'AGENTS.md': null, '.doltap/history.md': null }, t);
  assert.deepEqual(codes(inspect(root).problems).sort(), ['ENTRY_MISSING', 'REQUIRED_DOCUMENT_MISSING']);
  writeFiles(root, {
    'AGENTS.md': ['# 규칙', '', '<!-- `.doltap/current.md` 를 읽습니다 -->', '```', '.doltap/current.md', '```'],
    '.doltap/history.md': ['# 이력'],
  });
  assert.deepEqual(codes(inspect(root).problems).sort(), ['ENTRY_CURRENT_MISSING', 'REQUIRED_ANCHOR_MISSING', 'REQUIRED_ANCHOR_MISSING'],
    '주석과 코드 블록 속 안내는 안내로 세지 않는다');
});

test('진행 중인 작업은 README·status가 있고 current.md에 적혀 있어야 한다', (t) => {
  const root = makeProject({ ...operating(), ...workstream('002-search') }, t);
  assert.deepEqual(codes(inspect(root).problems), ['WORKSTREAM_UNLISTED']);
  writeFiles(root, { '.doltap/current.md': listed('002-search'), '.doltap/workstreams/002-search/status.md': null });
  assert.deepEqual(codes(inspect(root).problems), ['WORKSTREAM_DOCUMENT_MISSING']);
});

test('이름이 다른 이름의 일부로만 나오거나 주석 속 예시로만 있으면 적힌 것으로 보지 않는다', (t) => {
  const root = makeProject({
    ...operating(),
    ...workstream('004-search'),
    '.doltap/current.md': [...doc('doltap-d-crnt0001', '# 현재', '', '- 004-search-rework 는 끝났습니다', '<!-- 예: 004-search -->')],
  }, t);
  assert.deepEqual(codes(inspect(root).problems), ['WORKSTREAM_UNLISTED']);
});

test('current.md가 없는 작업 폴더를 가리키면 잡고, 보관된 작업이면 그렇게 알린다', (t) => {
  const root = makeProject({
    ...operating(),
    '.doltap/current.md': listed('003-gone', '001-done'),
    '.doltap/archive/001-done/README.md': doc('doltap-d-a0000001', '# 끝난 작업'),
    '.doltap/history.md': doc('doltap-d-hstry001', '# 이력', '', '- 001-done'),
  }, t);
  const found = inspect(root).problems.filter((item) => item.code === 'WORKSTREAM_TARGET_MISSING').map((item) => item.message);
  assert.equal(found.length, 2);
  assert.ok(found.some((message) => /003-gone 작업 폴더가 없습니다/.test(message)));
  assert.ok(found.some((message) => /001-done은 이미 보관됐습니다/.test(message)));
});

test('작업 번호가 보관 폴더와 겹치거나 이름 형식이 다르면 알린다', (t) => {
  const root = makeProject({
    ...operating(),
    ...workstream('001-again'),
    ...workstream('Draft'),
    '.doltap/current.md': listed('001-again', 'Draft'),
    '.doltap/archive/001-done/README.md': doc('doltap-d-a0000001', '# 끝난 작업'),
    '.doltap/history.md': doc('doltap-d-hstry001', '# 이력', '', '- 001-done'),
  }, t);
  const result = inspect(root);
  assert.ok(codes(result.problems).includes('WORKSTREAM_NUMBER_DUPLICATE'));
  assert.deepEqual(codes(result.notices), ['WORKSTREAM_NAME']);
});

test('history.md에 없는 보관 작업은 확인 항목이다', (t) => {
  const root = makeProject({ ...operating(), '.doltap/archive/001-done/README.md': doc('doltap-d-a0000001', '# 끝난 작업') }, t);
  const result = inspect(root);
  assert.deepEqual(codes(result.problems), []);
  assert.deepEqual(codes(result.notices), ['ARCHIVE_UNLISTED']);
  assert.match(result.notices[0].hint, /담당 활성 문서에 반영/);
});

test('채우기 자리는 줄 첫머리의 주석만 세고 보관 문서는 보지 않는다', (t) => {
  const root = makeProject({
    ...operating(),
    '.doltap/current.md': doc('doltap-d-crnt0001', '# 현재', '<!-- 채우기: 진행 중인 작업 -->', '문장 속 `<!-- 채우기:` 인용'),
    '.doltap/archive/001-x/README.md': doc('doltap-d-a0000001', '<!-- 채우기: 옛날 -->'),
    '.doltap/history.md': doc('doltap-d-hstry001', '# 이력', '', '- 001-x'),
  }, t);
  const notices = inspect(root).notices.filter((item) => item.code === 'PLACEHOLDER');
  assert.equal(notices.length, 1);
  assert.equal(notices[0].where, '.doltap/current.md');
});

test('일반 링크는 활성 관리 문서에서만 확인한다', (t) => {
  const root = makeProject({
    ...operating(),
    'docs/a.md': doc('doltap-d-aaaaaaa0', '[없음](missing.md) [외부](https://example.com/x.md) [제목](#설치) [다른 문서의 조각](b.md#없는-제목)', '`[코드](nope.md)`'),
    'docs/b.md': doc('doltap-d-bbbbbbb0', '[위로](/docs/a.md)'),
    'docs/plain.md': ['[표식 없는 문서의 링크](nope.md)'],
    '.doltap/archive/001-x/README.md': doc('doltap-d-a0000001', '[옛 링크](gone.md)'),
    '.doltap/history.md': doc('doltap-d-hstry001', '# 이력', '', '- 001-x'),
  }, t);
  const result = inspect(root);
  assert.deepEqual(result.problems.map((item) => [item.code, item.where]), [['LINK_FILE_MISSING', 'docs/a.md:3']]);
  assert.deepEqual(codes(result.notices), [], '문서 안 조각은 검사하지 않는다');
});

test('설정으로 뺀 문서는 읽지 않지만 그 안의 ID는 새로 발급하지 않는다', (t) => {
  const root = makeProject({
    ...operating(),
    '.doltap/config.json': JSON.stringify({ exclude: ['docs/examples'] }),
    'docs/examples/sample.md': ['<!-- doltap:start doltap-s-bad -->'],
  }, t);
  const result = inspect(root);
  assert.deepEqual(codes(result.problems), []);
  assert.equal(result.summary.excluded, 1);
  assert.ok(result.project.usedIds.has('doltap-d-agents01'));
  writeFiles(root, { '.doltap/config.json': '{"exclude": "docs"}' });
  assert.deepEqual(codes(inspect(root).problems), ['CONFIG_INVALID', 'MARKER_MALFORMED'], '설정이 잘못되면 쓰지 않고 알린다');
});

test('필수 운영 문서는 설정으로 빼서 검사를 건너뛸 수 없다', (t) => {
  const root = makeProject({
    ...operating(),
    '.doltap/workstreams/002-x/README.md': doc('doltap-d-wsreadm1', '# 작업'),
    '.doltap/workstreams/002-x/status.md': doc('doltap-d-wsstat01', '# 상태'),
    '.doltap/current.md': doc('doltap-d-crnt0001', '# 현재 작업', '', '- [002](workstreams/002-x/README.md)'),
  }, t);
  const configured = (exclude) => {
    writeFiles(root, { '.doltap/config.json': JSON.stringify({ exclude }) });
    return codes(inspect(root).problems);
  };
  for (const path of ['AGENTS.md', '.doltap', '.doltap/current.md', '.doltap/history.md', '.doltap/workstreams', '.doltap/workstreams/002-x', '.doltap/workstreams/002-x/status.md']) {
    assert.deepEqual(configured([path]), ['CONFIG_INVALID'], `${path}는 뺄 수 없다`);
  }
  for (const path of ['docs/examples', '.doltap/archive', '.doltap/workstreams/002-x/notes.md']) {
    assert.deepEqual(configured([path]), [], `${path}는 뺄 수 있다`);
  }

  // 검증에서 재현한 경우: 필수 문서를 빼고 표식과 진입 안내를 지워도, 설정을 쓰지 않으므로 그대로 잡는다.
  writeFiles(root, { 'AGENTS.md': ['# 규칙'], '.doltap/current.md': ['# 현재'], '.doltap/history.md': ['# 이력'] });
  assert.deepEqual(configured(['AGENTS.md', '.doltap/current.md', '.doltap/history.md']).sort(),
    ['CONFIG_INVALID', 'ENTRY_CURRENT_MISSING', 'REQUIRED_ANCHOR_MISSING', 'REQUIRED_ANCHOR_MISSING', 'REQUIRED_ANCHOR_MISSING', 'WORKSTREAM_UNLISTED']);
});

test('.doltap을 가진 하위 폴더와 숨김·의존성 폴더는 읽지 않는다', (t) => {
  const root = makeProject({
    ...operating(),
    'template/AGENTS.md': doc('doltap-d-agents01', '# 복사본'),
    'node_modules/x/README.md': ['<!-- doltap:start broken'],
    '.github/notes.md': ['<!-- doltap:start broken'],
  }, t);
  mkdirSync(join(root, 'template/.doltap'), { recursive: true });
  const result = inspect(root);
  assert.deepEqual(codes(result.problems), [], '복사본의 같은 ID도 중복으로 보지 않는다');
  assert.equal(result.summary.nested, 1);
});

test('검토 파일은 형식을 확인하고, 키를 정렬해 쓴다', (t) => {
  const root = makeProject(operating(), t);
  assert.equal(readReviews(root).exists, false);
  const entry = { fingerprints: { 'doltap-s-aaaaaaa1': '0123456789abcdef', 'doltap-s-bbbbbbb1': 'fedcba9876543210' }, method: 1, reviewedAt: '2026-10-01T00:00:00.000Z', by: 'agent', note: '확인' };
  for (const [text, message] of [
    ['{', /JSON/],
    ['{"version":2,"relations":{}}', /version 1/],
    [JSON.stringify({ version: 1, relations: { 'a b c': entry } }), /키의 형식/],
    [JSON.stringify({ version: 1, relations: { 'doltap-s-aaaaaaa1 same-as doltap-s-bbbbbbb1': { ...entry, by: '사람' } } }), /human 또는 agent/],
    [JSON.stringify({ version: 1, relations: { 'doltap-s-aaaaaaa1 same-as doltap-s-bbbbbbb1': { ...entry, note: ' ' } } }), /note/],
    [JSON.stringify({ version: 1, relations: { 'doltap-s-aaaaaaa1 same-as doltap-s-bbbbbbb1': { ...entry, method: '1' } } }), /method/],
    [JSON.stringify({ version: 1, relations: { 'doltap-s-aaaaaaa1 same-as doltap-s-bbbbbbb1': { ...entry, method: 0 } } }), /method/],
  ]) {
    writeFiles(root, { '.doltap/reviews.json': text });
    assert.match(readReviews(root).problem ?? '', message, text);
  }
  const serialized = serializeReviews({ 'z b same-as c': entry, 'a b same-as c': entry });
  assert.ok(serialized.indexOf('"a b same-as c"') < serialized.indexOf('"z b same-as c"'));
  assert.ok(serialized.endsWith('}\n'));
  const relation = { ends: ['doltap-s-aaaaaaa1', 'doltap-s-bbbbbbb1'] };
  const current = new Map([['doltap-s-aaaaaaa1', '0123456789abcdef'], ['doltap-s-bbbbbbb1', '0000000000000000']]);
  assert.deepEqual(reviewState(relation, null, current), { state: 'unreviewed', changed: [] });
  assert.deepEqual(reviewState(relation, entry, current), { state: 'changed', changed: ['doltap-s-bbbbbbb1'] });
  // 계산 방식 번호가 없거나 다르면 지문을 비교하지 않는다. 같은 글이어도 다시 확인하게 한다.
  const same = new Map(Object.entries(entry.fingerprints));
  assert.deepEqual(reviewState(relation, entry, same), { state: 'reviewed', changed: [] });
  const { method, ...unnumbered } = entry;
  assert.equal(method, 1);
  assert.equal(readReviewsWith(root, unnumbered).problem, null, '번호가 없는 기록은 형식 오류가 아니다');
  assert.deepEqual(reviewState(relation, unnumbered, same), { state: 'changed', changed: [], method: null });
  assert.deepEqual(reviewState(relation, { ...entry, method: 2 }, same), { state: 'changed', changed: [], method: 2 });
});

function readReviewsWith(root, entry) {
  writeFiles(root, { '.doltap/reviews.json': JSON.stringify({ version: 1, relations: { 'doltap-s-aaaaaaa1 same-as doltap-s-bbbbbbb1': entry } }) });
  return readReviews(root);
}

test('새 ID는 검토 기록에만 남은 ID도 피한다', (t) => {
  const root = makeProject({ ...operating(), '.doltap/reviews.json': '{"version":1,"relations":{}} doltap-s-zzzzzzz1' }, t);
  assert.ok(inspect(root).project.usedIds.has('doltap-s-zzzzzzz1'));
  assert.match(newId(inspect(root), 'b'), /^doltap-b-/);
});
