import test from 'node:test';
import assert from 'node:assert/strict';
import { ID_PATTERN, collectIds, freshId, parseDocument, randomId } from '../lib/anchors.mjs';

const parse = (lines) => parseDocument(lines.join('\n'), 'a.md');
const codes = (parsed) => parsed.problems.map((problem) => problem.code);
const D = 'doltap-d-aaaaaaa1';
const S = 'doltap-s-aaaaaaa2';
const B = 'doltap-b-aaaaaaa3';

test('한 줄·여러 줄 시작 표식과 끝 표식으로 범위를 읽는다', () => {
  const parsed = parse([
    `<!-- doltap:start ${D} -->`,
    '',
    '# 설치',
    '',
    `<!-- doltap:start ${S}`,
    'same-as: doltap-s-bbbbbbb2',
    'depends-on: doltap-b-ccccccc3, doltap-b-ddddddd4 doltap-b-eeeeeee5,',
    '-->',
    '## 조건',
    'Node 22 이상',
    `<!-- doltap:end ${S} -->`,
    '',
    `<!-- doltap:end ${D} -->`,
  ]);
  assert.deepEqual(parsed.problems, []);
  assert.equal(parsed.managed, true);
  const inner = parsed.ranges.find((range) => range.id === S);
  assert.deepEqual({ start: inner.startLine, header: inner.headerEndLine, end: inner.endLine, depth: inner.depth, parent: inner.parent, title: inner.title },
    { start: 5, header: 8, end: 11, depth: 1, parent: D, title: '조건' });
  assert.deepEqual(inner.declarations.map((d) => [d.name, d.targets]), [
    ['same-as', ['doltap-s-bbbbbbb2']],
    ['depends-on', ['doltap-b-ccccccc3', 'doltap-b-ddddddd4', 'doltap-b-eeeeeee5']],
  ]);
  assert.equal(parsed.ranges.find((range) => range.id === D).title, '설치');
});

test('범위 제목은 첫 제목이나 첫 글 줄에서 목록 기호와 강조 표시를 걷어 낸다', () => {
  const parsed = parse([
    `<!-- doltap:start ${D} -->`,
    `<!-- doltap:start ${B} -->`,
    '- **npm 등록.** `npx doltap`과 [안내](guide.md)를 봅니다.',
    `<!-- doltap:end ${B} -->`,
    `<!-- doltap:end ${D} -->`,
  ]);
  assert.equal(parsed.ranges.find((range) => range.id === B).title, 'npm 등록. npx doltap과 안내를 봅니다.');
  assert.equal(parsed.ranges.find((range) => range.id === D).title, 'npm 등록. npx doltap과 안내를 봅니다.');
});

test('마지막 관계 줄 끝의 --> 로도 시작 표식을 닫는다', () => {
  const parsed = parse([`<!-- doltap:start ${D}`, 'consistent-with: doltap-d-bbbbbbb1 -->', '본문', `<!-- doltap:end ${D} -->`]);
  assert.deepEqual(codes(parsed), []);
  assert.deepEqual(parsed.ranges[0].declarations.map((d) => d.targets), [['doltap-d-bbbbbbb1']]);
});

test('코드 블록과 인라인 코드 안의 표식 예시는 읽지 않는다', () => {
  const parsed = parse([
    `<!-- doltap:start ${D} -->`,
    '```markdown',
    `<!-- doltap:start ${S} -->`,
    '```',
    '~~~',
    `<!-- doltap:end ${S} -->`,
    '~~~',
    '',
    `    <!-- doltap:start ${B} -->`,
    '',
    `문장 속 \`<!-- doltap:start ${S} -->\` 예시`,
    `<!-- doltap:end ${D} -->`,
  ]);
  assert.deepEqual(codes(parsed), []);
  assert.deepEqual(parsed.ranges.map((range) => range.id), [D]);
});

test('인용문 안의 코드 블록과 긴 울타리 안의 짧은 울타리도 코드로 본다', () => {
  const parsed = parse([
    `<!-- doltap:start ${D} -->`,
    '> ```markdown',
    `> <!-- doltap:start ${S} -->`,
    '> ```',
    '',
    '````markdown',
    '```',
    `<!-- doltap:start ${B} -->`,
    '```',
    '````',
    `<!-- doltap:end ${D} -->`,
  ]);
  assert.deepEqual(codes(parsed), []);
  assert.deepEqual(parsed.ranges.map((range) => range.id), [D]);
});

test('인용문이 끝나면 그 안에서 연 코드 블록도 끝난다', () => {
  const parsed = parse([
    `<!-- doltap:start ${D} -->`,
    '> ```',
    '> 닫지 않은 예시',
    '',
    `<!-- doltap:start ${S} -->`,
    '본문',
    `<!-- doltap:end ${S} -->`,
    `<!-- doltap:end ${D} -->`,
  ]);
  assert.deepEqual(codes(parsed), []);
  assert.deepEqual(parsed.ranges.map((range) => range.id), [S, D]);
});

test('목록 항목 기호 뒤에서 연 코드 블록 안의 표식 예시도 읽지 않는다', () => {
  const parsed = parse([
    `<!-- doltap:start ${D} -->`,
    '',
    '- ```markdown',
    `  <!-- doltap:start ${S} -->`,
    '  예시',
    `  <!-- doltap:end ${S} -->`,
    '  ```',
    '',
    '1. ~~~',
    `   <!-- doltap:start ${B} -->`,
    '   ~~~',
    '',
    '> - ```markdown',
    `>   <!-- doltap:end ${S} -->`,
    '>   ```',
    '',
    `<!-- doltap:end ${D} -->`,
  ]);
  assert.deepEqual(codes(parsed), []);
  assert.deepEqual(parsed.ranges.map((range) => range.id), [D]);
});

test('목록 항목이 끝나면 항목 기호 뒤에서 연 코드 블록도 끝난다', () => {
  const unclosed = parse([
    `<!-- doltap:start ${D} -->`,
    '- ```',
    '  닫지 않은 예시',
    '',
    `<!-- doltap:start ${S} -->`,
    '본문',
    `<!-- doltap:end ${S} -->`,
    `<!-- doltap:end ${D} -->`,
  ]);
  assert.deepEqual(codes(unclosed), []);
  assert.deepEqual(unclosed.ranges.map((range) => range.id), [S, D]);
  // 항목보다 덜 들여쓴 울타리는 항목의 코드 블록을 닫지 않고 새 코드 블록을 연다. GitHub도 그렇게 보여 준다.
  const outdented = parse([
    `<!-- doltap:start ${D} -->`,
    '- ```js',
    '  code',
    '```',
    `<!-- doltap:start ${S} -->`,
    '```',
    `<!-- doltap:end ${D} -->`,
  ]);
  assert.deepEqual(codes(outdented), []);
  assert.deepEqual(outdented.ranges.map((range) => range.id), [D]);
});

test('백틱 세 개로 감싼 인라인 코드 줄은 코드 블록을 열지 않는다', () => {
  const parsed = parse([
    `<!-- doltap:start ${D} -->`,
    '```인라인``` 으로 시작하는 문장',
    `<!-- doltap:start ${S} -->`,
    '본문',
    `<!-- doltap:end ${S} -->`,
    '',
    // 목록 항목 기호 뒤에서도 같다. 항목 안쪽으로 들여쓴 표식을 코드로 삼키지 않는다.
    '- ```인라인``` 으로 시작하는 목록 항목',
    `  <!-- doltap:start ${B} -->`,
    '  항목 본문',
    `  <!-- doltap:end ${B} -->`,
    `<!-- doltap:end ${D} -->`,
  ]);
  assert.deepEqual(codes(parsed), []);
  assert.deepEqual(parsed.ranges.map((range) => range.id), [S, B, D]);
});

test('목록 안쪽으로 들여쓴 표식은 코드가 아니므로 읽는다', () => {
  const parsed = parse([
    `<!-- doltap:start ${D} -->`,
    '- 항목',
    '',
    `    <!-- doltap:start ${S} -->`,
    '    안쪽 문단',
    `    <!-- doltap:end ${S} -->`,
    `<!-- doltap:end ${D} -->`,
  ]);
  assert.deepEqual(codes(parsed), []);
  assert.ok(parsed.ranges.some((range) => range.id === S));
});

test('엇갈린 범위는 오류 하나로 알리고 안쪽 범위는 살린다', () => {
  const parsed = parse([
    `<!-- doltap:start ${D} -->`,
    `<!-- doltap:start ${S} -->`,
    `<!-- doltap:end ${D} -->`,
    `<!-- doltap:end ${S} -->`,
  ]);
  assert.deepEqual(codes(parsed), ['MARKER_CROSSED']);
  assert.equal(parsed.problems[0].line, 3);
  assert.ok(parsed.broken.has(D));
  assert.deepEqual(parsed.ranges.map((range) => range.id), [S]);
});

test('닫히지 않은 범위와 시작 없는 끝을 잡는다', () => {
  assert.deepEqual(codes(parse([`<!-- doltap:start ${D} -->`, '본문'])), ['MARKER_UNCLOSED']);
  assert.deepEqual(codes(parse([`<!-- doltap:start ${D} -->`, `<!-- doltap:end ${S} -->`, `<!-- doltap:end ${D} -->`])), ['MARKER_END_WITHOUT_START']);
});

test('손상된 표식을 조용히 넘기지 않는다', () => {
  const cases = [
    [`<!-- doltap:begin ${D} -->`, /모르는 표식/],
    [`<!-- DOLTAP:start ${D} -->`, /소문자 doltap/],
    ['<!-- doltap:start doltap-d-short -->', /ID 형식/],
    ['<!-- doltap:start DOLTAP-D-AAAAAAA1 -->', /소문자로/],
    ['<!-- doltap:start -->', /ID가 없습니다/],
    [`<!-- doltap:start ${D} --> 본문`, /표식만/],
    [`<!-- doltap:start ${D} same-as: ${S} -->`, /다음 줄부터/],
    [`<!-- doltap:end ${D}`, /한 줄/],
    [`본문 <!-- doltap:start ${D} -->`, /줄 첫머리/],
  ];
  for (const [line, message] of cases) {
    const parsed = parse([line]);
    assert.ok(parsed.managed, line);
    assert.equal(parsed.problems[0]?.code, 'MARKER_MALFORMED', line);
    assert.match(parsed.problems[0].message, message, line);
  }
});

test('읽을 수 없는 관계 줄과 닫히지 않은 시작 주석을 잡는다', () => {
  const unreadable = parse([`<!-- doltap:start ${D}`, 'same-as doltap-s-bbbbbbb2', '-->', `<!-- doltap:end ${D} -->`]);
  assert.deepEqual(codes(unreadable), ['MARKER_MALFORMED']);
  assert.equal(unreadable.problems[0].line, 2);
  assert.ok(unreadable.broken.has(D), '관계 줄이 깨진 범위는 판정에서 뺀다');

  const unclosed = parse([`<!-- doltap:start ${D}`, 'same-as: doltap-s-bbbbbbb2', `<!-- doltap:start ${S} -->`, `<!-- doltap:end ${S} -->`]);
  assert.deepEqual(codes(unclosed), ['MARKER_MALFORMED']);
  assert.match(unclosed.problems[0].message, /닫히지 않았습니다/);
  assert.equal(unclosed.problems[0].line, 1);
});

test('다른 HTML 주석에 갇힌 표식은 알린다', () => {
  const parsed = parse(['<!-- 채우기: 이름', `<!-- doltap:start ${D} -->`, '본문']);
  assert.deepEqual(codes(parsed), ['MARKER_MALFORMED']);
  assert.match(parsed.problems[0].message, /다른 HTML 주석/);
});

test('문서 범위 규칙: 없음·여럿·밖의 본문·종류', () => {
  assert.deepEqual(codes(parse([`<!-- doltap:start ${S} -->`, '본문', `<!-- doltap:end ${S} -->`])), ['ID_KIND', 'DOCUMENT_ANCHOR_MISSING']);
  assert.deepEqual(codes(parse([`<!-- doltap:start ${D} -->`, `<!-- doltap:end ${D} -->`, '<!-- doltap:start doltap-d-bbbbbbb1 -->', '<!-- doltap:end doltap-d-bbbbbbb1 -->'])), ['DOCUMENT_ANCHOR_MULTIPLE']);
  assert.deepEqual(codes(parse(['머리말', `<!-- doltap:start ${D} -->`, `<!-- doltap:end ${D} -->`])), ['DOCUMENT_BODY_OUTSIDE']);
  assert.deepEqual(codes(parse([`<!-- doltap:start ${D} -->`, '<!-- doltap:start doltap-d-bbbbbbb1 -->', '<!-- doltap:end doltap-d-bbbbbbb1 -->', `<!-- doltap:end ${D} -->`])), ['ID_KIND']);
});

test('front matter·HTML 주석·빈 줄은 문서 범위 밖에 있어도 된다', () => {
  const parsed = parse(['---', 'title: 예제', '---', '<!-- 메모 -->', '', `<!-- doltap:start ${D} -->`, '본문', `<!-- doltap:end ${D} -->`, '', '<!-- 끝 메모 -->']);
  assert.deepEqual(codes(parsed), []);
});

test('표식 오류가 있는 파일에서는 문서 범위 규칙을 연쇄로 보고하지 않는다', () => {
  const parsed = parse([`<!-- doltap:start ${D} -->`, `<!-- doltap:start ${S} -->`, `<!-- doltap:end ${D} -->`, `<!-- doltap:end ${S} -->`, '밖의 본문']);
  assert.deepEqual(codes(parsed), ['MARKER_CROSSED']);
});

test('표식이 없는 문서는 관리 문서가 아니다', () => {
  const plain = parse(['# 제목', '본문']);
  assert.equal(plain.managed, false);
  assert.deepEqual(plain.problems, []);
});

test('CRLF 줄 끝과 BOM을 기억한다', () => {
  const parsed = parseDocument(`﻿<!-- doltap:start ${D} -->\r\n본문\r\n<!-- doltap:end ${D} -->\r\n`, 'a.md');
  assert.deepEqual(parsed.problems, []);
  assert.equal(parsed.eol, '\r\n');
  assert.equal(parsed.bom, true);
});

test('발급한 ID는 형식을 지키고 이미 쓰인 ID를 피한다', () => {
  for (const kind of ['d', 's', 'b']) assert.match(randomId(kind), ID_PATTERN);
  assert.throws(() => randomId('x'));
  const used = collectIds('doltap-d-aaaaaaa1 과 DOLTAP-S-BBBBBBB2 가 이미 있습니다');
  assert.deepEqual([...used], ['doltap-d-aaaaaaa1', 'doltap-s-bbbbbbb2']);
  const id = freshId('s', used);
  assert.ok(!used.has(id));
});
