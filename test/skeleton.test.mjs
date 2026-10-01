import test from 'node:test';
import assert from 'node:assert/strict';
import { compareSkeletons, skeleton, summarize } from '../lib/skeleton.mjs';

const of = (lines) => skeleton(lines.map((text, index) => ({ text, line: index + 1 })));
const same = (a, b) => compareSkeletons(of(a), of(b)) === null;

test('제목 → 문단 → 목록 3개끼리는 같은 골격이다', () => {
  assert.ok(same(
    ['## 설치 조건', '', 'Node.js가 필요합니다.', '', '- Windows', '- macOS', '- Linux'],
    ['## Requirements', '', 'Node.js is required. It must be 22 or later.', '', '- Windows', '- macOS', '- Linux'],
  ));
});

test('제목 → 문단 → 문단 → 목록 2개는 차이를 알린다', () => {
  const difference = compareSkeletons(
    of(['## 설치', '', '문단', '', '- a', '- b', '- c']),
    of(['## Install', '', '문단', '', '다른 문단', '', '- a', '- b']),
  );
  assert.equal(difference.where, '3번째 요소');
  assert.equal(difference.left, '글머리 목록 3항목');
  assert.equal(difference.right, '문단');
  assert.equal(difference.a.line, 5);
  assert.equal(difference.b.line, 5);
});

test('원문 줄바꿈, 강제 줄바꿈, 문장 수는 문단 수에 들어가지 않는다', () => {
  assert.ok(same(['첫 문장입니다. 둘째 문장입니다.'], ['첫 문장입니다.', '둘째 문장입니다.  ', '셋째 문장입니다.\\', '넷째.']));
});

test('제목은 상대 수준으로 비교한다', () => {
  assert.ok(same(['## 가', '### 나'], ['### A', '#### B']));
  assert.equal(compareSkeletons(of(['## 가', '## 나']), of(['## A', '### B'])).where, '2번째 요소');
  assert.ok(same(['설치', '====', '', '본문'], ['# Install', '', 'Body']), 'setext 제목도 제목이다');
});

test('번호 목록과 글머리 목록, 항목 수, 하위 목록 계층을 비교한다', () => {
  assert.ok(!same(['1. 하나', '2. 둘'], ['- one', '- two']));
  assert.ok(same(['- 가', '  - 가-1', '- 나'], ['* a', '  * a-1', '* b']));
  const nested = compareSkeletons(of(['- 가', '  - 가-1', '  - 가-2', '- 나']), of(['- a', '  - a-1', '- b']));
  assert.equal(nested.where, '1번째 요소 › 1번째 항목 › 2번째 요소');
  assert.ok(same(['- 가', '이어지는 줄', '- 나'], ['- a', '- b']), '빈 줄 없이 이어진 줄은 항목의 문단이다');
});

test('표의 열·행, 코드 블록의 위치와 개수를 비교하고 코드 내용은 보지 않는다', () => {
  assert.ok(same(['| 가 | 나 |', '| --- | --- |', '| 1 | 2 |'], ['| A | B |', '|---|---|', '| x | y |']));
  assert.ok(!same(['| 가 | 나 |', '| --- | --- |', '| 1 | 2 |'], ['| A | B | C |', '| --- | --- | --- |', '| x | y | z |']));
  assert.ok(!same(['| 가 |', '| --- |', '| 1 |', '| 2 |'], ['| A |', '| --- |', '| x |']));
  assert.ok(same(['```js', 'const a = 1;', '```'], ['```', 'let b = 2', 'let c = 3', '```']));
  assert.ok(!same(['문단', '', '```', 'x', '```'], ['```', 'x', '```', '', '문단']));
});

test('인용·구분선·HTML 블록을 요소로 보고, 주석과 링크 참조 정의는 빼고 본다', () => {
  assert.ok(same(['> 인용', '> 이어짐'], ['> quote']));
  assert.ok(!same(['> - 가', '> - 나'], ['> 문단']));
  assert.ok(same(['문단', '', '---', '', '문단'], ['para', '', '***', '', 'para']));
  assert.ok(same(['[참조]: https://example.com', '', '문단'], ['para']));
  assert.ok(same(['', '문단', ''], ['para']));
  assert.ok(!same(['<details>', '<summary>더 보기</summary>', '</details>'], ['문단']));
});

test('골격 요약은 사람이 읽을 수 있다', () => {
  assert.equal(summarize(of(['## 가', '', '문단', '', '- 가', '- 나'])), '제목(상대 수준 0), 문단, 글머리 목록 2항목[문단 | 문단]');
});
