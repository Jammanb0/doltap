// 마크다운에서 doltap 범위와 관계를 읽어 그래프를 만든다.
// 형식의 원본은 .agents/plans/workstreams/009-document-graph/design.md 다.
//
// 이 파일은 판정하지 않는다. 읽어서 구조로 바꾸는 것까지만 한다.
// 무엇이 문제인지는 graph-check.mjs 가 정한다.

// ID 문자 집합은 Crockford Base32 소문자다. i l o u 를 뺀다.
const ID_CHARS = "[0-9a-hjkmnp-tv-z]";
export const ID_PATTERN = new RegExp(`^doltap-([dsb])-(${ID_CHARS}{8})$`);

// 관계 어휘. 역방향 이름과 대칭 여부, 검토 상태가 필요한지를 함께 가진다.
// `expires` 는 어느 쪽 contentHash 가 바뀌면 검토가 만료되는지다.
export const RELATIONS = new Map([
  ["references", { reverse: "referenced-by", symmetric: false, expires: null }],
  ["indexes", { reverse: "indexed-by", symmetric: false, expires: null }],
  ["governs", { reverse: "governed-by", symmetric: false, expires: null }],
  ["imports", { reverse: "imported-by", symmetric: false, expires: null }],
  ["depends-on", { reverse: "required-by", symmetric: false, expires: "to" }],
  ["produces", { reverse: "produced-by", symmetric: false, expires: "from" }],
  ["verified-by", { reverse: "verifies", symmetric: false, expires: "both" }],
  ["derived-from", { reverse: "source-of", symmetric: false, expires: "to" }],
  ["decided-by", { reverse: "decides", symmetric: false, expires: "to" }],
  ["assumes", { reverse: "assumption-for", symmetric: false, expires: "to" }],
  ["supersedes", { reverse: "superseded-by", symmetric: false, expires: null }],
  ["related-to", { reverse: "related-to", symmetric: true, expires: null }],
  ["mirror-of", { reverse: "mirror-of", symmetric: true, expires: null }],
  ["update-with", { reverse: "update-with", symmetric: true, expires: "both" }],
]);

// 앵커는 자기 줄에 혼자 둔다. 제목 줄 끝에 붙이지 않는다.
const ANCHOR_LINE = /^\s*<a\s+([^>]*?)>\s*<\/a>\s*$/;
const ATTR = /(name|id)\s*=\s*"([^"]*)"/g;
// 관계 선언 — 백틱으로 감싼 유형 바로 뒤에 표준 마크다운 링크가 온다.
const RELATION_LINE = /`([a-z][a-z0-9-]*)`\s*\[([^\]]*)\]\(([^)\s]+)\)/g;
const LINK = /\[([^\]]*)\]\(([^)\s]+)\)/g;

// 범위 경계는 -start 와 -end 다. 사람과 도구는 -start 로만 이동한다.
function readAnchor(line) {
  const shell = ANCHOR_LINE.exec(line);
  if (!shell) return null;
  const seen = new Map();
  for (const [, key, value] of shell[1].matchAll(ATTR)) seen.set(key, value);
  // name 은 오래된 조각 이동 방식이고 id 는 지금 방식이다. 지원 렌더러를 모두
  // 덮으려면 둘을 함께 써야 하므로 하나만 있는 것을 받지 않는다.
  if (!seen.size) return { malformed: "name 도 id 도 없습니다" };
  if (!seen.has("name")) return { malformed: "name 이 없습니다 — name 과 id 를 함께 씁니다" };
  if (!seen.has("id")) return { malformed: "id 가 없습니다 — name 과 id 를 함께 씁니다" };
  const values = [...seen.values()];
  if (new Set(values).size !== 1) return { malformed: "name 과 id 의 값이 다릅니다" };
  const raw = values[0];
  const at = raw.lastIndexOf("-");
  const role = raw.slice(at + 1);
  const id = raw.slice(0, at);
  if (role !== "start" && role !== "end") {
    return { malformed: `-start 나 -end 로 끝나야 합니다: ${raw}` };
  }
  if (!ID_PATTERN.test(id)) return { malformed: `ID 형식이 아닙니다: ${id}` };
  return { id, role, kind: ID_PATTERN.exec(id)[1] };
}

// 코드로 읽어야 하는 줄을 표시한다. 그 안의 앵커와 링크는 예시이지 선언이 아니다.
// 울타리는 백틱과 물결 둘 다 본다. 네 칸 들여쓰기도 코드로 본다.
function markVerbatim(lines) {
  const verbatim = new Array(lines.length).fill(false);
  let fence = null; // { marker, length, indent }
  let listIndent = null;
  let blankBefore = true;

  lines.forEach((line, i) => {
    const open = /^(\s*)(`{3,}|~{3,})/.exec(line);
    if (fence) {
      verbatim[i] = true;
      const close = /^(\s*)(`{3,}|~{3,})\s*$/.exec(line);
      if (close && close[2][0] === fence.marker && close[2].length >= fence.length) fence = null;
      return;
    }
    if (open) {
      fence = { marker: open[2][0], length: open[2].length };
      verbatim[i] = true;
      return;
    }

    const blank = line.trim() === "";
    if (blank) {
      blankBefore = true;
      return;
    }

    const indent = line.match(/^[ \t]*/)[0].replace(/\t/g, "    ").length;
    const item = /^[ \t]*([-*+]|\d+[.)])\s/.test(line);
    if (item) listIndent = indent;
    else if (listIndent !== null && indent <= listIndent) listIndent = null;

    // 목록 안쪽 줄은 들여써도 코드가 아니다. 목록이 열려 있지 않을 때만 본다.
    if (blankBefore && indent >= 4 && listIndent === null) verbatim[i] = true;
    else if (!blankBefore && verbatim[i - 1] && indent >= 4 && listIndent === null) verbatim[i] = true;

    blankBefore = false;
  });

  return verbatim;
}

// 인라인 코드 구간을 표시한다. 백틱 안의 링크는 예시이지 링크가 아니다.
// 여는 백틱과 같은 개수로 닫히는 자리까지가 한 구간이다.
function codeMask(line) {
  const mask = new Array(line.length).fill(false);
  let i = 0;
  while (i < line.length) {
    if (line[i] !== "`") {
      i += 1;
      continue;
    }
    let run = 0;
    while (line[i + run] === "`") run += 1;
    let j = i + run;
    let close = -1;
    while (j < line.length) {
      if (line[j] !== "`") {
        j += 1;
        continue;
      }
      let other = 0;
      while (line[j + other] === "`") other += 1;
      if (other === run) {
        close = j;
        break;
      }
      j += other;
    }
    // 닫히지 않은 백틱은 코드가 아니다. 그대로 지나간다.
    if (close === -1) {
      i += run;
      continue;
    }
    for (let k = i; k < close + run; k += 1) mask[k] = true;
    i = close + run;
  }
  return mask;
}

// 링크 목적지에서 파일 경로와 조각을 가른다.
export function splitTarget(dest) {
  const at = dest.indexOf("#");
  if (at === -1) return { path: dest, fragment: null };
  return { path: dest.slice(0, at), fragment: dest.slice(at + 1) };
}

// 저장소 밖을 가리키는 목적지. 남의 사이트의 조각이 이 프로젝트의 노드를
// 가리킬 수는 없으므로 관계 대상이 될 수 없다.
export function isExternal(dest) {
  return /^[a-z][a-z0-9+.-]*:/i.test(dest) || dest.startsWith("//");
}

// 조각이 doltap 범위를 가리키면 그 ID 를 돌려준다. 아니면 null 이다.
export function idFromFragment(fragment) {
  if (!fragment || !fragment.endsWith("-start")) return null;
  const id = fragment.slice(0, -"-start".length);
  return ID_PATTERN.test(id) ? id : null;
}

// 문서 하나를 읽는다. 범위 겹침처럼 이 파일 안에서 판정되는 것만 문제로 낸다.
export function parseDocument(text, path) {
  const lines = text.split(/\r?\n/);
  const verbatim = markVerbatim(lines);

  const ranges = [];
  const problems = [];
  const open = [];

  lines.forEach((line, i) => {
    if (verbatim[i]) return;
    const anchor = readAnchor(line);
    if (!anchor) return;
    const at = { path, line: i + 1 };
    if (anchor.malformed) {
      problems.push({ ...at, message: `앵커 형식이 아닙니다 — ${anchor.malformed}` });
      return;
    }
    if (anchor.role === "start") {
      open.push({ ...anchor, start: i, startLine: i + 1 });
      return;
    }
    const top = open[open.length - 1];
    if (!top) {
      problems.push({ ...at, message: `${anchor.id} 의 끝 앵커만 있고 시작이 없습니다` });
      return;
    }
    // 스택 맨 위와 다르면 범위가 교차했다는 뜻이다. 어느 노드가 내용을 갖는지 모호해진다.
    if (top.id !== anchor.id) {
      problems.push({
        ...at,
        message: `범위가 교차합니다 — ${top.id} 가 닫히기 전에 ${anchor.id} 가 닫혔습니다`,
      });
      open.pop();
      return;
    }
    open.pop();
    ranges.push({
      id: top.id,
      kind: top.kind,
      path,
      startLine: top.startLine,
      endLine: i + 1,
      depth: open.length,
      parent: open.length ? open[open.length - 1].id : null,
    });
  });

  for (const left of open) {
    problems.push({ path, line: left.startLine, message: `${left.id} 의 범위가 닫히지 않았습니다` });
  }

  // 어느 범위 안에 있는지로 관계의 출발점을 정한다. 가장 안쪽 범위가 출발점이다.
  const innermost = (lineNumber) => {
    let found = null;
    for (const r of ranges) {
      if (lineNumber < r.startLine || lineNumber > r.endLine) continue;
      if (!found || r.depth > found.depth) found = r;
    }
    return found;
  };

  const edges = [];
  const links = [];
  lines.forEach((line, i) => {
    if (verbatim[i] || readAnchor(line)) return;
    const lineNumber = i + 1;
    const from = innermost(lineNumber);
    const mask = codeMask(line);
    const declared = new Set();

    for (const m of line.matchAll(RELATION_LINE)) {
      // 유형은 백틱 안이고 링크는 밖이다. 링크까지 코드 안이면 예시다.
      const linkAt = m.index + m[0].lastIndexOf("[");
      if (mask[linkAt]) continue;
      declared.add(m[3]);
      edges.push({ type: m[1], label: m[2], dest: m[3], from: from ? from.id : null, path, line: lineNumber });
    }
    for (const m of line.matchAll(LINK)) {
      if (mask[m.index]) continue;
      if (declared.has(m[2])) continue;
      links.push({ label: m[1], dest: m[2], from: from ? from.id : null, path, line: lineNumber });
    }
  });

  return { path, ranges, edges, links, problems };
}

// 여러 문서를 모아 그래프로 만든다. 역방향 색인은 여기서 계산한다 —
// 마크다운에는 한쪽만 적고 어느 쪽에서든 찾을 수 있어야 한다.
export function buildGraph(documents) {
  const byId = new Map();
  const duplicates = [];
  for (const doc of documents) {
    for (const range of doc.ranges) {
      const seen = byId.get(range.id);
      if (seen) duplicates.push({ id: range.id, first: seen, again: range });
      else byId.set(range.id, range);
    }
  }

  const outgoing = new Map();
  const incoming = new Map();
  const edges = [];
  for (const doc of documents) {
    for (const raw of doc.edges) {
      // 외부 URL 은 경로를 무시하고 조각만 보면 남의 주소가 이쪽 노드를
      // 가리키는 것처럼 보인다. 목적지가 이 저장소 안일 때만 ID 로 읽는다.
      const to = isExternal(raw.dest) ? null : idFromFragment(splitTarget(raw.dest).fragment);
      const edge = { ...raw, to, id: edgeId(raw.from, raw.type, to) };
      edges.push(edge);
      if (!raw.from || !to) continue;
      push(outgoing, raw.from, edge);
      push(incoming, to, edge);
      const meta = RELATIONS.get(raw.type);
      // 대칭 관계는 양쪽에서 같은 이름으로 보인다. 단방향은 역방향 이름으로 보인다.
      if (meta?.symmetric) {
        push(outgoing, to, { ...edge, mirrored: true, from: to, to: raw.from });
        push(incoming, raw.from, { ...edge, mirrored: true, from: to, to: raw.from });
      }
    }
  }

  return { documents, byId, duplicates, edges, outgoing, incoming };
}

function push(map, key, value) {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

// 관계 ID 는 결정적으로 만든다. 대칭 관계는 어느 쪽이 선언했든 같은 ID 가 나와야
// 검토 기록이 한 벌로 유지된다.
export function edgeId(from, type, to) {
  if (!from || !to) return null;
  const meta = RELATIONS.get(type);
  if (meta?.symmetric) {
    const [a, b] = [from, to].sort();
    return `${a}:${type}:${b}`;
  }
  return `${from}:${type}:${to}`;
}

// 어느 노드에서 나가고 들어오는 관계를 이름과 함께 돌려준다.
export function relationsOf(graph, id) {
  const out = (graph.outgoing.get(id) ?? []).map((e) => ({
    id: e.id,
    type: e.type,
    to: e.to,
    symmetric: RELATIONS.get(e.type)?.symmetric ?? false,
  }));
  const into = (graph.incoming.get(id) ?? []).map((e) => {
    const meta = RELATIONS.get(e.type);
    return {
      id: e.id,
      // 단방향 관계는 도착점에서 역방향 이름으로 읽힌다.
      type: meta?.symmetric ? e.type : (meta?.reverse ?? e.type),
      from: e.from,
      symmetric: meta?.symmetric ?? false,
    };
  });
  return { outgoing: out, incoming: into };
}
