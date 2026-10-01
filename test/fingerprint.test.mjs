import test from 'node:test';
import assert from 'node:assert/strict';
import { bodyLines, parseDocument } from '../lib/anchors.mjs';
import { fingerprint, normalizeBody } from '../lib/fingerprint.mjs';

const fp = (lines) => fingerprint(lines);
const D = 'doltap-d-aaaaaaa1';
const S = 'doltap-s-aaaaaaa2';

// 문서를 읽어 범위 ID마다 지문을 낸다.
function prints(lines) {
  const parsed = parseDocument(lines.join('\n'), 'a.md');
  return Object.fromEntries(parsed.ranges.map((range) => [range.id, fingerprint(bodyLines(parsed, range).map((line) => line.text))]));
}

test('줄 바꿈 위치, 공백 수, 앞뒤 빈 줄은 지문을 바꾸지 않는다', () => {
  const base = fp(['첫 문장입니다. 둘째 문장입니다.', '', '- 항목 하나']);
  assert.equal(fp(['', '첫 문장입니다.', '둘째   문장입니다.', '', '', '- 항목  하나', '']), base);
  assert.equal(fp(['첫 문장입니다. 둘째 문장입니다. ', '', '- 항목 하나']), base);
});

test('글자나 구조가 바뀌면 지문이 바뀐다', () => {
  const base = fp(['- 가', '- 나']);
  assert.notEqual(fp(['- 가', '- 다']), base);
  assert.notEqual(fp(['- 가 - 나']), base, '두 항목을 한 줄로 합치면 구조가 바뀐다');
  assert.notEqual(fp(['- 가', '  - 나']), base, '들여쓰기로 계층이 바뀐다');
  assert.notEqual(fp(['문단', '', '다른 문단']), fp(['문단 다른 문단']), '문단 경계도 본문이다');
});

// 화면에서 같은 글이면 지문도 같아야 한다. 줄바꿈 위치와 공백만 다른 경우들이다.
const SAME = [
  ['문단 안의 줄바꿈', ['오늘은', '날씨가 좋다'], ['오늘은 날씨가 좋다']],
  ['목록 항목에 들여 이어 쓴 줄', ['- 항목', '  설명'], ['- 항목 설명']],
  ['목록 항목에 들여쓰기 없이 이어 쓴 줄', ['- 항목', '설명'], ['- 항목 설명']],
  ['인용문 안의 줄바꿈', ['> 첫 줄', '> 둘째 줄'], ['> 첫 줄 둘째 줄']],
  ['인용 표시 없이 이어 쓴 인용문 줄', ['> 첫 줄', '둘째 줄'], ['> 첫 줄 둘째 줄']],
  ['인용 표시 뒤 공백', ['>인용'], ['> 인용']],
  ['인용 표시 바로 뒤의 목록 항목', ['>- 항목', '>   - 하위'], ['> - 항목', '>   - 하위']],
  ['문단 앞 공백 수', ['   문단'], ['문단']],
];

// 화면에서 구성이나 글자가 달라지면 지문도 달라야 한다.
const DIFFERENT = [
  ['제목 다음 줄과 한 줄 제목', ['# Support', 'Node 22'], ['# Support Node 22']],
  ['표의 행 다음 줄', ['| a |', '| - |', '| b |', 'c'], ['| a |', '| - |', '| b | c']],
  ['구분선 다음 줄', ['***', '본문'], ['*** 본문']],
  ['HTML 줄 다음 줄', ['<br>', '본문'], ['<br> 본문']],
  ['제목 밑줄 다음 줄', ['제목', '===', '본문'], ['제목', '=== 본문']],
  ['인용문 하나의 두 문단과 인용문 둘', ['> 가', '>', '> 나'], ['> 가', '', '> 나']],
  ['인용문과 그 뒤 문단', ['> 가', '', '나'], ['> 가 나']],
  ['인용 깊이', ['> 가', '>> 나'], ['> 가', '> 나']],
  ['인용문 안 목록의 계층', ['> - Parent', '>   - Child'], ['> - Parent', '> - Child']],
  ['목록 항목에서 시작한 코드 블록의 공백', ['- ```py', '  x = "a  b"', '  ```'], ['- ```py', '  x = "a b"', '  ```']],
  ['인용문 안 코드의 공백', ['> ```python', '> x = "a  b"', '> ```'], ['> ```python', '> x = "a b"', '> ```']],
];

test('줄바꿈과 공백만 다른 글은 지문이 같다', () => {
  for (const [name, a, b] of SAME) assert.equal(fp(a), fp(b), name);
});

test('구성이나 글자가 다른 글은 지문이 다르다', () => {
  for (const [name, a, b] of DIFFERENT) assert.notEqual(fp(a), fp(b), name);
});

test('코드 블록 안의 공백은 그대로 비교한다', () => {
  assert.notEqual(fp(['```', 'a  b', '```']), fp(['```', 'a b', '```']));
  assert.notEqual(fp(['```', '  indented', '```']), fp(['```', 'indented', '```']));
  assert.notEqual(fp(['````', '```', 'a  b', '```', '````']), fp(['````', '```', 'a b', '```', '````']), '긴 울타리 안의 짧은 울타리도 코드다');
});

test('doltap 표식이 아닌 HTML 주석은 지문에 들어간다', () => {
  assert.notEqual(fp(['본문', '<!-- 메모 -->']), fp(['본문', '<!-- 다른 메모 -->']));
});

test('표식과 관계 선언은 지문에 들어가지 않는다', () => {
  const plain = prints([`<!-- doltap:start ${D} -->`, '', '# 제목', '', '본문', '', `<!-- doltap:end ${D} -->`]);
  const withChild = prints([
    `<!-- doltap:start ${D} -->`, '', '# 제목', '',
    `<!-- doltap:start ${S}`, 'same-as: doltap-s-bbbbbbb2', 'depends-on: doltap-b-ccccccc3', '-->',
    '본문',
    `<!-- doltap:end ${S} -->`, '', `<!-- doltap:end ${D} -->`,
  ]);
  assert.equal(withChild[D], plain[D], '안쪽 범위를 만들고 관계를 더해도 바깥 범위 지문은 그대로다');
  assert.equal(withChild[S], fp(['본문']));
});

test('로컬 링크는 넘겨준 정규화를 거친다', () => {
  const resolve = (dest) => (dest === '../a.md' || dest === 'a.md' ? 'doltap:doltap-d-aaaaaaa1' : null);
  assert.equal(fingerprint(['[문서](../a.md) 참고'], resolve), fingerprint(['[문서](a.md) 참고'], resolve));
  assert.notEqual(fingerprint(['[문서](../a.md) 참고']), fingerprint(['[문서](a.md) 참고']));
  assert.equal(normalizeBody(['`[예시](a.md)`'], resolve), '`[예시](a.md)`', '인라인 코드 안의 링크는 바꾸지 않는다');
});
