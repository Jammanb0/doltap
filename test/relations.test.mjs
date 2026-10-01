import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeRelations, canonical, declarationFor } from '../lib/relations.mjs';

// 선언만 가진 가짜 범위. 판정은 선언과 ID만 본다.
function graph(spec, archived = []) {
  const nodes = new Map();
  let line = 1;
  for (const [id, declarations] of Object.entries(spec)) {
    nodes.set(id, {
      id, path: `${id}.md`, startLine: 1,
      declarations: declarations.map(([name, ...targets]) => ({ name, targets, line: (line += 1) })),
    });
  }
  return { nodes, archived: (id) => archived.includes(id) };
}
const A = 'doltap-s-aaaaaaa1';
const B = 'doltap-s-bbbbbbb2';
const C = 'doltap-s-ccccccc3';
const run = (spec, options = {}) => analyzeRelations({ ...graph(spec, options.archived), skip: options.skip });
const codes = (result) => result.findings.map((finding) => finding.code);

test('양쪽 선언은 관계 하나가 된다', () => {
  for (const [left, right, key] of [
    [['same-as', B], ['same-as', A], `${A} same-as ${B}`],
    [['consistent-with', B], ['consistent-with', A], `${A} consistent-with ${B}`],
    [['depends-on', B], ['depended-on-by', A], `${A} depends-on ${B}`],
    [['depended-on-by', B], ['depends-on', A], `${B} depends-on ${A}`],
  ]) {
    const result = run({ [A]: [left], [B]: [right] });
    assert.deepEqual(codes(result), []);
    assert.equal(result.relations.length, 1);
    assert.equal(result.relations[0].key, key);
    assert.equal(result.relations[0].complete, true);
  }
});

test('관계 키는 선언한 쪽과 무관하게 같다', () => {
  assert.equal(canonical(B, 'same-as', A).key, canonical(A, 'same-as', B).key);
  assert.equal(canonical(A, 'depends-on', B).key, canonical(B, 'depended-on-by', A).key);
  assert.equal(declarationFor(canonical(A, 'depends-on', B), B), `depended-on-by: ${A}`);
  assert.equal(declarationFor(canonical(A, 'depends-on', B), A), `depends-on: ${B}`);
});

test('한 범위가 여러 대상과 서로 다른 관계를 맺을 수 있다', () => {
  const result = run({
    [A]: [['same-as', B], ['depends-on', C]],
    [B]: [['same-as', A]],
    [C]: [['depended-on-by', A]],
  });
  assert.deepEqual(codes(result), []);
  assert.deepEqual(result.relations.map((relation) => relation.kind).sort(), ['depends-on', 'same-as']);
});

test('대응 선언이 없으면 필요한 짝을 알려 주되 복원하지 않는다', () => {
  const result = run({ [A]: [['depends-on', B]], [B]: [] });
  assert.deepEqual(codes(result), ['RELATION_COUNTERPART_MISSING']);
  assert.match(result.findings[0].message, new RegExp(`depended-on-by: ${A}`));
  assert.equal(result.relations[0].complete, false);
  assert.ok(result.declaredKeys.has(`${A} depends-on ${B}`), '해제 중일 수 있으므로 검토 기록은 지키도록 키를 남긴다');
});

test('종류나 방향이 어긋난 선언을 잡는다', () => {
  assert.match(run({ [A]: [['same-as', B]], [B]: [['consistent-with', A]] }).findings[0].message, /same-as.*consistent-with/);
  const both = run({ [A]: [['depends-on', B]], [B]: [['depends-on', A]] });
  assert.deepEqual(codes(both), ['RELATION_MISMATCH']);
  assert.match(both.findings[0].message, /모두 상대를 기준으로/);
  assert.match(run({ [A]: [['depended-on-by', B]], [B]: [['depended-on-by', A]] }).findings[0].message, /모두 상대가 자신에게 의존/);
});

test('한 쌍에 관계를 둘 이상 적거나 같은 선언을 되풀이하면 잡는다', () => {
  assert.deepEqual(codes(run({ [A]: [['same-as', B], ['depends-on', B]], [B]: [['same-as', A]] })), ['RELATION_CONFLICT']);
  assert.deepEqual(codes(run({ [A]: [['same-as', B], ['same-as', B]], [B]: [['same-as', A]] })), ['RELATION_DUPLICATE']);
});

test('자기 자신, 없는 대상, 형식이 아닌 대상, 모르는 관계를 잡는다', () => {
  assert.deepEqual(codes(run({ [A]: [['same-as', A]] })), ['RELATION_SELF']);
  assert.deepEqual(codes(run({ [A]: [['same-as', C]] })), ['RELATION_TARGET_MISSING']);
  assert.deepEqual(codes(run({ [A]: [['same-as', 'docs/b.md']] })), ['RELATION_TARGET_INVALID']);
  assert.match(run({ [A]: [['same_as', B]] }).findings[0].message, /same-as를 뜻했다면/);
  assert.match(run({ [A]: [['derived-from', B]] }).findings[0].message, /쓸 수 있는 관계는 same-as, consistent-with, depends-on, depended-on-by입니다\. 뜻에 맞는 것을 고르거나, 단순 참고라면 일반 링크로/);
});

test('객체 기본 속성 이름은 관계로 받지 않는다', () => {
  for (const name of ['constructor', 'toString', 'valueOf', 'hasOwnProperty', 'isPrototypeOf']) {
    const result = run({ [A]: [[name, B]], [B]: [[name, A]] });
    assert.deepEqual(codes(result), ['RELATION_UNKNOWN', 'RELATION_UNKNOWN'], name);
    assert.deepEqual(result.relations, [], name);
  }
});

test('손상되거나 중복된 대상은 대상 없음으로 다시 보고하지 않는다', () => {
  assert.deepEqual(codes(run({ [A]: [['same-as', C]] }, { skip: new Set([C]) })), []);
});

test('보관 범위끼리의 관계만 선언 검사에서 빼고, 활성 범위와의 관계는 그대로 검사한다', () => {
  assert.deepEqual(codes(run({ [A]: [['depends-on', B]], [B]: [] }, { archived: [A, B] })), []);
  assert.deepEqual(codes(run({ [A]: [['depends-on', B]], [B]: [] }, { archived: [B] })), ['RELATION_COUNTERPART_MISSING']);
  const archivedOnly = run({ [A]: [['same-as', B]], [B]: [['same-as', A]] }, { archived: [A, B] });
  assert.equal(archivedOnly.relations[0].archived, true);
  assert.deepEqual(codes(run({ [A]: [['same-as', C]] }, { archived: [A] })), ['RELATION_TARGET_MISSING'], '없는 대상은 어느 문서에 있든 보고한다');
});

test('간접 연결은 관계로 만들지 않는다', () => {
  const result = run({
    [A]: [['same-as', B]],
    [B]: [['same-as', A], ['consistent-with', C]],
    [C]: [['consistent-with', B]],
  });
  assert.deepEqual(codes(result), []);
  assert.equal(result.relations.some((relation) => relation.ends.includes(A) && relation.ends.includes(C)), false);
});
