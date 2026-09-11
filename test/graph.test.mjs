import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { buildGraph, edgeId, parseDocument, relationsOf } from "../lib/graph.mjs";
import { CLAUDE_NODE, ENTRY_POINTS, checkGraph, collectDocuments, toJson } from "../lib/graph-check.mjs";

// 8자 ID 를 짧게 만들기 위한 도우미. 문자 집합에 i l o u 가 없다.
const ids = {
  docA: "doltap-d-a1b2c3d4",
  docB: "doltap-d-b2c3d4e5",
  secA: "doltap-s-c3d4e5f6",
  secB: "doltap-s-d4e5f6g7",
  blk: "doltap-b-e5f6g7h8",
  blk2: "doltap-b-f6g7h8j9",
};

function anchor(id, role) {
  return `<a name="${id}-${role}" id="${id}-${role}"></a>`;
}

// 문서 하나를 감싸는 최소 형태. 본문과 안쪽 범위를 넣을 수 있다.
function doc(id, body) {
  return [anchor(id, "start"), "", body, "", anchor(id, "end"), ""].join("\n");
}

// 임시 프로젝트에 파일을 쓰고 검사한다.
function run(files, entryPoints = []) {
  const root = mkdtempSync(join(tmpdir(), "doltap-graph-"));
  const documents = [];
  for (const [path, text] of Object.entries(files)) {
    const full = join(root, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, text);
    documents.push({ path, text });
  }
  return checkGraph({ root, documents, entryPoints });
}

const messages = (result) => result.problems.map((f) => f.message).join("\n");

test("범위가 닫히면 노드가 된다", () => {
  const parsed = parseDocument(doc(ids.docA, "본문입니다."), "AGENTS.md");
  assert.equal(parsed.problems.length, 0);
  assert.equal(parsed.ranges.length, 1);
  assert.equal(parsed.ranges[0].id, ids.docA);
  assert.equal(parsed.ranges[0].kind, "d");
});

test("닫히지 않은 범위를 잡는다", () => {
  const parsed = parseDocument([anchor(ids.docA, "start"), "", "본문"].join("\n"), "AGENTS.md");
  assert.match(parsed.problems[0].message, /닫히지 않았습니다/);
});

test("교차하는 범위를 잡는다", () => {
  const text = [
    anchor(ids.docA, "start"),
    anchor(ids.secA, "start"),
    anchor(ids.docA, "end"),
    anchor(ids.secA, "end"),
  ].join("\n");
  const parsed = parseDocument(text, "AGENTS.md");
  assert.match(parsed.problems[0].message, /교차합니다/);
});

test("완전히 포함된 중첩은 잡지 않는다", () => {
  const text = doc(ids.docA, [anchor(ids.secA, "start"), "안쪽", anchor(ids.secA, "end")].join("\n"));
  const parsed = parseDocument(text, "AGENTS.md");
  assert.equal(parsed.problems.length, 0);
  assert.equal(parsed.ranges.length, 2);
  const inner = parsed.ranges.find((r) => r.id === ids.secA);
  assert.equal(inner.parent, ids.docA);
});

test("name 과 id 의 값이 다르면 잡는다", () => {
  const text = `<a name="${ids.docA}-start" id="${ids.secA}-start"></a>`;
  const parsed = parseDocument(text, "AGENTS.md");
  assert.match(parsed.problems[0].message, /name 과 id 의 값이 다릅니다/);
});

test("ID 문자 집합을 벗어나면 잡는다", () => {
  // i 는 Crockford Base32 에서 뺀 문자다.
  const parsed = parseDocument(`<a name="doltap-s-iiiiiiii-start" id="doltap-s-iiiiiiii-start"></a>`, "AGENTS.md");
  assert.match(parsed.problems[0].message, /ID 형식이 아닙니다/);
});

test("같은 ID 가 두 곳에 있으면 잡는다", () => {
  const result = run({
    "AGENTS.md": doc(ids.docA, "가"),
    "other.md": doc(ids.docA, "나"),
  });
  assert.match(messages(result), /에도 있습니다/);
});

test("문서 노드 밖의 범위를 잡는다", () => {
  const result = run({
    "AGENTS.md": [anchor(ids.secA, "start"), "본문", anchor(ids.secA, "end")].join("\n"),
  });
  assert.match(messages(result), /문서 노드 밖에 있습니다/);
});

test("b 안에 s 를 두면 잡는다", () => {
  const inner = [anchor(ids.secA, "start"), "안쪽", anchor(ids.secA, "end")].join("\n");
  const text = doc(ids.docA, [anchor(ids.blk, "start"), inner, anchor(ids.blk, "end")].join("\n"));
  const result = run({ "AGENTS.md": text });
  assert.match(messages(result), /안에 있습니다/);
});

test("코드 울타리 안의 앵커는 선언이 아니다", () => {
  for (const fence of ["```", "~~~"]) {
    const body = [fence, anchor(ids.secA, "start"), fence].join("\n");
    const parsed = parseDocument(doc(ids.docA, body), "AGENTS.md");
    assert.equal(parsed.ranges.length, 1, `${fence} 울타리`);
    assert.equal(parsed.problems.length, 0, `${fence} 울타리`);
  }
});

test("네 칸 들여쓴 코드 안의 앵커도 선언이 아니다", () => {
  const body = ["예시입니다.", "", `    ${anchor(ids.secA, "start")}`].join("\n");
  const parsed = parseDocument(doc(ids.docA, body), "AGENTS.md");
  assert.equal(parsed.ranges.length, 1);
  assert.equal(parsed.problems.length, 0);
});

test("목록 안쪽으로 들여쓴 줄은 코드가 아니다", () => {
  // 들여쓴 목록 이어짐을 코드로 보면 그 안의 관계 선언을 놓친다.
  const body = [
    anchor(ids.secA, "start"),
    "- 첫째",
    `    \`supersedes\` [옛 규칙](other.md#${ids.secB}-start)`,
    anchor(ids.secA, "end"),
  ].join("\n");
  const parsed = parseDocument(doc(ids.docA, body), "AGENTS.md");
  assert.equal(parsed.edges.length, 1);
  assert.equal(parsed.edges[0].type, "supersedes");
});

test("허용되지 않은 관계 유형을 잡는다", () => {
  const body = [
    anchor(ids.secA, "start"),
    `- \`points-at\` [저쪽](other.md#${ids.secB}-start)`,
    anchor(ids.secA, "end"),
  ].join("\n");
  const result = run({
    "AGENTS.md": doc(ids.docA, body),
    "other.md": doc(ids.docB, [anchor(ids.secB, "start"), "저쪽", anchor(ids.secB, "end")].join("\n")),
  });
  assert.match(messages(result), /허용되지 않은 관계 유형/);
});

test("없는 ID 를 가리키는 관계를 잡는다", () => {
  const body = [
    anchor(ids.secA, "start"),
    `- \`supersedes\` [없음](other.md#${ids.secB}-start)`,
    anchor(ids.secA, "end"),
  ].join("\n");
  const result = run({ "AGENTS.md": doc(ids.docA, body), "other.md": doc(ids.docB, "비었음") });
  assert.match(messages(result), /가리키는 ID 가 없습니다/);
});

test("제목 조각을 관계 대상으로 쓰면 잡는다", () => {
  const body = [
    anchor(ids.secA, "start"),
    "- `governs` [작업 전 승인](other.md#작업-전-승인)",
    anchor(ids.secA, "end"),
  ].join("\n");
  const result = run({ "AGENTS.md": doc(ids.docA, body), "other.md": doc(ids.docB, "저쪽") });
  assert.match(messages(result), /doltap ID 조각이 아닙니다/);
});

test("대칭 관계를 양쪽에 적으면 잡는다", () => {
  const a = doc(
    ids.docA,
    [anchor(ids.secA, "start"), `- \`mirror-of\` [나](other.md#${ids.secB}-start)`, anchor(ids.secA, "end")].join("\n")
  );
  const b = doc(
    ids.docB,
    [anchor(ids.secB, "start"), `- \`mirror-of\` [가](AGENTS.md#${ids.secA}-start)`, anchor(ids.secB, "end")].join("\n")
  );
  const result = run({ "AGENTS.md": a, "other.md": b });
  assert.match(messages(result), /대칭 관계를 양쪽에 적었습니다/);
});

test("한쪽에만 적은 대칭 관계는 잡지 않는다", () => {
  const a = doc(
    ids.docA,
    [anchor(ids.secA, "start"), `- \`mirror-of\` [나](other.md#${ids.secB}-start)`, anchor(ids.secA, "end")].join("\n")
  );
  const b = doc(ids.docB, [anchor(ids.secB, "start"), "나", anchor(ids.secB, "end")].join("\n"));
  const result = run({ "AGENTS.md": a, "other.md": b });
  assert.equal(result.problems.length, 0, messages(result));
});

test("관계를 한 번 적으면 양쪽에서 조회된다", () => {
  const a = doc(
    ids.docA,
    [anchor(ids.secA, "start"), `- \`supersedes\` [옛](other.md#${ids.secB}-start)`, anchor(ids.secA, "end")].join("\n")
  );
  const b = doc(ids.docB, [anchor(ids.secB, "start"), "옛", anchor(ids.secB, "end")].join("\n"));
  const graph = buildGraph([parseDocument(a, "AGENTS.md"), parseDocument(b, "other.md")]);

  const from = relationsOf(graph, ids.secA);
  assert.equal(from.outgoing[0].type, "supersedes");
  assert.equal(from.outgoing[0].to, ids.secB);

  // 도착점에서는 역방향 이름으로 읽힌다.
  const to = relationsOf(graph, ids.secB);
  assert.equal(to.incoming[0].type, "superseded-by");
  assert.equal(to.incoming[0].from, ids.secA);
});

test("대칭 관계는 양쪽에서 같은 이름으로 읽힌다", () => {
  const a = doc(
    ids.docA,
    [anchor(ids.secA, "start"), `- \`update-with\` [짝](other.md#${ids.secB}-start)`, anchor(ids.secA, "end")].join("\n")
  );
  const b = doc(ids.docB, [anchor(ids.secB, "start"), "짝", anchor(ids.secB, "end")].join("\n"));
  const graph = buildGraph([parseDocument(a, "AGENTS.md"), parseDocument(b, "other.md")]);
  assert.equal(relationsOf(graph, ids.secA).outgoing[0].type, "update-with");
  assert.equal(relationsOf(graph, ids.secB).outgoing[0].type, "update-with");
});

test("대칭 관계의 ID 는 선언 방향과 무관하게 같다", () => {
  assert.equal(edgeId(ids.secB, "update-with", ids.secA), edgeId(ids.secA, "update-with", ids.secB));
  // 단방향은 방향이 다르면 다른 관계다.
  assert.notEqual(edgeId(ids.secA, "supersedes", ids.secB), edgeId(ids.secB, "supersedes", ids.secA));
});

test("없는 파일을 가리키는 일반 링크를 잡는다", () => {
  const result = run({ "AGENTS.md": doc(ids.docA, "[없음](missing.md) 을 봅니다.") });
  assert.match(messages(result), /링크가 가리키는 파일이 없습니다/);
});

test("실재하는 일반 링크는 잡지 않는다", () => {
  const result = run({
    "AGENTS.md": doc(ids.docA, "[저쪽](other.md) 을 봅니다."),
    "other.md": doc(ids.docB, "저쪽"),
  });
  assert.equal(result.problems.length, 0, messages(result));
});

test("진입점에서 닿지 않는 문서를 잡는다", () => {
  const result = run(
    { "AGENTS.md": doc(ids.docA, "혼자"), "orphan.md": doc(ids.docB, "고아") },
    ["AGENTS.md"]
  );
  assert.match(messages(result), /진입점에서 닿지 않습니다/);
});

test("관계로 이어지면 도달로 본다", () => {
  const a = doc(
    ids.docA,
    [anchor(ids.secA, "start"), `- \`indexes\` [저쪽](other.md#${ids.docB}-start)`, anchor(ids.secA, "end")].join("\n")
  );
  const result = run({ "AGENTS.md": a, "other.md": doc(ids.docB, "저쪽") }, ["AGENTS.md"]);
  assert.equal(result.problems.length, 0, messages(result));
});

test("사람용 판정과 JSON 판정이 같다", () => {
  const result = run({
    "AGENTS.md": doc(ids.docA, "[없음](missing.md)"),
  });
  const json = toJson(result);
  assert.equal(json.problems.length, result.problems.length);
  assert.equal(json.problems[0].message, result.problems[0].message);
  assert.equal(json.nodes.length, 1);
  assert.equal(json.schema, "doltap.check.v1");
});

test("깨끗한 그래프는 범위와 관계 수를 통과로 보고한다", () => {
  const a = doc(
    ids.docA,
    [anchor(ids.secA, "start"), `- \`governs\` [저쪽](other.md#${ids.docB}-start)`, anchor(ids.secA, "end")].join("\n")
  );
  const result = run({ "AGENTS.md": a, "other.md": doc(ids.docB, "저쪽") }, ["AGENTS.md"]);
  assert.equal(result.problems.length, 0, messages(result));
  assert.deepEqual(result.passed, ["범위 3개", "관계 1개"]);
});

test("인라인 코드 안의 링크는 링크가 아니다", () => {
  // 문법을 설명하는 문서가 스스로 오탐에 걸리면 안 된다.
  const body = "| `[글](없는파일.md#조각)`의 조각 | 그대로 |";
  const result = run({ "AGENTS.md": doc(ids.docA, body) });
  assert.equal(result.problems.length, 0, messages(result));
});

test("인라인 코드 밖의 링크는 그대로 본다", () => {
  const result = run({ "AGENTS.md": doc(ids.docA, "[없음](없는파일.md) 을 봅니다.") });
  assert.match(messages(result), /링크가 가리키는 파일이 없습니다/);
});

test("관계 선언 전체가 코드 예시면 세지 않는다", () => {
  const body = [
    anchor(ids.secA, "start"),
    "``- `supersedes` [옛](other.md#" + ids.secB + "-start)``",
    anchor(ids.secA, "end"),
  ].join("\n");
  const parsed = parseDocument(doc(ids.docA, body), "AGENTS.md");
  assert.equal(parsed.edges.length, 0);
});

// --- 검토에서 드러난 누락. 각각 재현한 뒤 고쳤다. ---

test("name 만 있는 앵커를 잡는다", () => {
  const text = [`<a name="${ids.docA}-start"></a>`, "본문", `<a name="${ids.docA}-end"></a>`].join("\n");
  const parsed = parseDocument(text, "x.md");
  assert.equal(parsed.ranges.length, 0);
  assert.match(parsed.problems[0].message, /id 가 없습니다/);
});

test("id 만 있는 앵커도 잡는다", () => {
  const parsed = parseDocument(`<a id="${ids.docA}-start"></a>`, "x.md");
  assert.match(parsed.problems[0].message, /name 이 없습니다/);
});

test("외부 주소의 조각을 관계 대상으로 인정하지 않는다", () => {
  // 남의 사이트 주소에 우리 ID 를 붙여도 이쪽 노드를 가리킬 수 없다.
  const body = [
    anchor(ids.secA, "start"),
    `- \`supersedes\` [남의 사이트](https://example.com/#${ids.docA}-start)`,
    anchor(ids.secA, "end"),
  ].join("\n");
  const result = run({ "AGENTS.md": doc(ids.docA, body) });
  assert.match(messages(result), /관계 대상이 외부 주소입니다/);
});

test("b 안에 b 를 두면 잡는다", () => {
  const inner = [anchor(ids.blk2, "start"), "안", anchor(ids.blk2, "end")].join("\n");
  const text = doc(ids.docA, [anchor(ids.blk, "start"), inner, anchor(ids.blk, "end")].join("\n"));
  const result = run({ "AGENTS.md": text });
  assert.match(messages(result), /b 는 가장 작은 단위입니다/);
});

test("같은 단방향 관계를 두 번 적으면 잡는다", () => {
  const line = `- \`references\` [저쪽](other.md#${ids.docB}-start)`;
  const body = [anchor(ids.secA, "start"), line, line, anchor(ids.secA, "end")].join("\n");
  const result = run({ "AGENTS.md": doc(ids.docA, body), "other.md": doc(ids.docB, "저쪽") });
  assert.match(messages(result), /같은 관계를 두 번 적었습니다/);
});

test("출발점이 다르면 같은 대상을 가리켜도 중복이 아니다", () => {
  const link = `- \`references\` [저쪽](other.md#${ids.docB}-start)`;
  const body = [
    anchor(ids.secA, "start"),
    link,
    anchor(ids.secA, "end"),
    anchor(ids.secB, "start"),
    link,
    anchor(ids.secB, "end"),
  ].join("\n");
  const result = run({ "AGENTS.md": doc(ids.docA, body), "other.md": doc(ids.docB, "저쪽") });
  assert.equal(result.problems.length, 0, messages(result));
});

test("CLAUDE.md 는 앵커 없이 연결 노드가 된다", () => {
  const root = mkdtempSync(join(tmpdir(), "doltap-claude-"));
  writeFileSync(join(root, "CLAUDE.md"), "@AGENTS.md\n");
  const documents = [{ path: "AGENTS.md", text: doc(ids.docA, "규칙") }];
  writeFileSync(join(root, "AGENTS.md"), documents[0].text);
  const result = checkGraph({ root, documents, entryPoints: ENTRY_POINTS });

  assert.equal(result.problems.length, 0, messages(result));
  assert.ok(result.graph.byId.has(CLAUDE_NODE), "CLAUDE.md 노드가 없습니다");
  const edge = result.graph.edges.find((e) => e.from === CLAUDE_NODE);
  // mirror-of 로 이으면 한 줄짜리 파일이 언제나 불일치로 잡힌다.
  assert.equal(edge.type, "imports");
  assert.equal(edge.to, ids.docA);
});

test("관계로 가리킨 외부 문서를 관리 범위에 들인다", () => {
  const root = mkdtempSync(join(tmpdir(), "doltap-external-"));
  mkdirSync(join(root, ".agents"), { recursive: true });
  mkdirSync(join(root, "docs"), { recursive: true });
  const body = [
    anchor(ids.secA, "start"),
    `- \`verified-by\` [시험 기록](docs/trials.md#${ids.docB}-start)`,
    anchor(ids.secA, "end"),
  ].join("\n");
  writeFileSync(join(root, "AGENTS.md"), doc(ids.docA, body));
  writeFileSync(join(root, "docs/trials.md"), doc(ids.docB, "시험 기록"));

  const collected = collectDocuments(root);
  assert.ok(
    collected.some((d) => d.path === "docs/trials.md"),
    `외부 문서를 읽지 않았습니다: ${collected.map((d) => d.path).join(", ")}`
  );
  const result = checkGraph({ root, documents: collected, entryPoints: ["AGENTS.md"] });
  assert.equal(result.problems.length, 0, messages(result));
});

test("가리키지 않은 외부 문서는 들이지 않는다", () => {
  const root = mkdtempSync(join(tmpdir(), "doltap-unrelated-"));
  mkdirSync(join(root, "docs"), { recursive: true });
  writeFileSync(join(root, "AGENTS.md"), doc(ids.docA, "규칙"));
  writeFileSync(join(root, "docs/unrelated.md"), "# 남의 문서\n");
  const collected = collectDocuments(root);
  assert.ok(!collected.some((d) => d.path === "docs/unrelated.md"));
});

test("운영 폴더 안의 숨김 폴더는 읽지 않는다", () => {
  const root = mkdtempSync(join(tmpdir(), "doltap-hidden-"));
  mkdirSync(join(root, ".agents/.hidden"), { recursive: true });
  mkdirSync(join(root, ".agents/recovery"), { recursive: true });
  writeFileSync(join(root, "AGENTS.md"), doc(ids.docA, "규칙"));
  writeFileSync(join(root, ".agents/.hidden/note.md"), "# 숨김\n");
  writeFileSync(join(root, ".agents/recovery/old.md"), "# 복구 사본\n");
  const paths = collectDocuments(root).map((d) => d.path);
  assert.deepEqual(paths, ["AGENTS.md"]);
});
