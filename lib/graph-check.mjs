// 그래프에서 상태 없이 판정할 수 있는 것만 검사한다.
// 내용 해시와 검토 기록이 필요한 검사는 여기 없다 — 8단계에서 붙인다.
//
// 규칙의 원본은 .doltap/plans/workstreams/009-document-graph/design.md 다.

import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import { RELATIONS, buildGraph, idFromFragment, isExternal, parseDocument, splitTarget } from "./graph.mjs";

const PROBLEM = "문제";
const NOTICE = "확인";

// 운영 폴더 이름이다. 5단계에서 새 이름으로 바뀐다.
export const OPERATING_DIR = ".doltap";
// 진입점. 여기서 관계를 따라가 닿지 않는 문서는 새 세션이 찾지 못한다.
// CLAUDE.md 는 도구가 먼저 읽는 자리라 함께 진입점이다.
export const ENTRY_POINTS = ["AGENTS.md", "CLAUDE.md"];
// `@AGENTS.md` 한 줄을 지켜야 해서 앵커를 넣지 않는다. 파일 안에 발급 기록을
// 남길 자리가 없으므로 이 ID 만 난수가 아니라 고정값이다.
export const CLAUDE_NODE = "doltap-d-claude-md";

// 문서로 읽지 않는 폴더. 프로젝트가 늘릴 수 있고 줄이지는 못한다.
const SKIP_DIRS = new Set([".git", "node_modules", ".svn", ".hg", "dist", "build", "coverage"]);

function walk(root, dir, out) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    // 심볼릭 링크는 따라가지 않는다. 같은 파일을 두 경로로 읽으면 ID 가 겹쳐 보인다.
    if (lstatSync(full).isSymbolicLink()) continue;
    if (lstatSync(full).isDirectory()) {
      if (SKIP_DIRS.has(name)) continue;
      // 운영 폴더가 아닌 숨김 폴더는 문서를 두는 자리가 아니다.
      if (name.startsWith(".")) continue;
      // 복구 자료는 원본의 사본이라 ID 가 겹친다. 탐색에서 뺀다.
      if (name === "recovery" && relative(root, dir).split(sep).join("/") === OPERATING_DIR) continue;
      walk(root, full, out);
      continue;
    }
    if (name.endsWith(".md")) out.push(relative(root, full).split(sep).join("/"));
  }
}

function read(root, path) {
  return { path, text: readFileSync(join(root, path), "utf8") };
}

function insideRoot(root, full) {
  const name = relative(resolve(root), resolve(full));
  if (name === "") return "";
  if (name === ".." || name.startsWith(`..${sep}`) || isAbsolute(name)) return null;
  return name.split(sep).join("/");
}

function excludedFromGraph(path) {
  const parts = path.split("/");
  if (parts.some((part) => part === ".." || SKIP_DIRS.has(part))) return true;
  if (parts.some((part, i) => part.startsWith(".") && !(i === 0 && part === OPERATING_DIR))) return true;
  return path === `${OPERATING_DIR}/recovery` || path.startsWith(`${OPERATING_DIR}/recovery/`);
}

// 관계로 등록하는 문서에도 기본 탐색과 같은 경계를 적용한다. 그렇지 않으면
// ../, 숨김 폴더, 복구 사본이나 심볼릭 링크를 통해 관리 범위를 우회할 수 있다.
function isManagedMarkdown(root, path) {
  if (!/\.md$/i.test(path) || excludedFromGraph(path)) return false;
  const full = resolve(root, path);
  if (insideRoot(root, full) === null || !existsSync(full)) return false;

  let cursor = resolve(root);
  for (const part of path.split("/")) {
    cursor = join(cursor, part);
    const stat = lstatSync(cursor);
    if (stat.isSymbolicLink()) return false;
  }
  return lstatSync(full).isFile();
}

// 기본 관리 범위는 AGENTS.md 와 운영 폴더의 모든 마크다운이다.
// CLAUDE.md 는 앵커를 넣지 않으므로 여기서 읽지 않고 checkGraph 가 연결 노드로
// 만든다.
//
// 그 밖의 문서는 **운영 문서가 ID 조각이 있는 관계로 가리켰을 때만** 들어온다.
// 한 걸음만 따라간다 — 들어온 문서의 관계를 다시 따라가면 관리 범위가 끝없이
// 넓어진다.
export function collectDocuments(root) {
  const paths = [];
  if (existsSync(join(root, "AGENTS.md"))) paths.push("AGENTS.md");
  const operating = join(root, OPERATING_DIR);
  if (existsSync(operating)) walk(root, operating, paths);

  const base = paths.map((path) => read(root, path));
  const known = new Set(paths);
  const extra = [];
  for (const doc of base.map((d) => parseDocument(d.text, d.path))) {
    for (const edge of doc.edges) {
      if (isExternal(edge.dest)) continue;
      const { path, fragment } = splitTarget(edge.dest);
      if (!path || !idFromFragment(fragment)) continue;
      const resolved = resolveTarget(root, doc.path, path);
      if (!resolved || known.has(resolved) || !isManagedMarkdown(root, resolved)) continue;
      known.add(resolved);
      extra.push(read(root, resolved));
    }
  }
  return [...base, ...extra];
}

// 같은 폴더는 파일명으로, 다른 폴더는 저장소 루트 기준으로 쓴다. check.mjs 와 같다.
//
// 못 찾은 이유를 둘로 가른다. 저장소 밖에 실재하는 파일을 「없습니다」라고 하면
// 사실과 다르고, 왜 막혔는지 알 수 없어 같은 시도를 반복하게 된다.
const OUTSIDE = "밖";
function resolveTarget(root, fromPath, target) {
  if (!target || isExternal(target)) return null;
  const candidates = [resolve(root, dirname(fromPath), target), resolve(root, target)];
  let escaped = false;
  for (const candidate of candidates) {
    const name = insideRoot(root, candidate);
    if (name !== null && existsSync(candidate)) return name;
    if (name === null && existsSync(candidate)) escaped = true;
  }
  return escaped ? OUTSIDE : false;
}

function missingMessage(what, resolved, target) {
  return resolved === OUTSIDE
    ? `${what} 대상이 저장소 밖입니다: ${target}`
    : `${what}가 가리키는 파일이 없습니다: ${target}`;
}

// 검사 하나가 여러 문서를 같이 봐야 하므로 문서를 먼저 다 읽고 그래프를 만든다.
export function checkGraph({ root, documents, entryPoints = [] }) {
  const parsed = documents.map((doc) => parseDocument(doc.text, doc.path));
  const preflight = [];
  // CLAUDE.md 는 앵커를 넣을 수 없으므로 노드와 관계를 여기서 만들어 준다.
  // `mirror-of` 가 아니라 `imports` 다 — 한 줄짜리 파일이 긴 파일을 읽어 들이는
  // 관계이지 두 글이 같아야 하는 관계가 아니다.
  const agents = parsed.find((d) => d.path === "AGENTS.md")?.ranges.find((r) => r.depth === 0);
  let claudeValid = false;
  if (root && entryPoints.includes("CLAUDE.md")) {
    const claudePath = join(root, "CLAUDE.md");
    if (!existsSync(claudePath) || !lstatSync(claudePath).isFile()) {
      preflight.push({ kind: PROBLEM, where: "CLAUDE.md", message: "없습니다. Claude Code가 규칙을 읽을 길이 없습니다" });
    } else {
      // 주석과 빈 줄은 본문이 아니다. 그 밖의 실질 내용은 @AGENTS.md 한 줄뿐이어야 한다.
      const body = readFileSync(claudePath, "utf8")
        .replace(/<!--[\s\S]*?-->/g, "")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .join("\n");
      if (!body.includes("@AGENTS.md")) {
        preflight.push({ kind: PROBLEM, where: "CLAUDE.md", message: "`@AGENTS.md` 가 없어 AGENTS.md로 이어지지 않습니다" });
      } else if (body !== "@AGENTS.md") {
        preflight.push({
          kind: PROBLEM,
          where: "CLAUDE.md",
          message: "`@AGENTS.md` 한 줄이 아닙니다. 여기 적은 본문은 Codex가 읽지 못해 규칙이 갈라집니다",
        });
      } else {
        claudeValid = true;
      }
    }
  }
  if (claudeValid && agents) {
    parsed.push({
      path: "CLAUDE.md",
      ranges: [
        { id: CLAUDE_NODE, kind: "d", path: "CLAUDE.md", startLine: 1, endLine: 1, depth: 0, parent: null },
      ],
      edges: [
        {
          type: "imports",
          label: "AGENTS.md",
          dest: `AGENTS.md#${agents.id}-start`,
          from: CLAUDE_NODE,
          path: "CLAUDE.md",
          line: 1,
        },
      ],
      links: [],
      problems: [],
    });
  }
  const graph = buildGraph(parsed);
  const findings = [...preflight];
  const add = (kind, where, message) => findings.push({ kind, where, message });
  const at = (path, line) => (line ? `${path}:${line}` : path);

  // 1. 파서가 문서 안에서 이미 잡은 것 — 앵커 형식, 닫히지 않은 범위, 교차
  for (const doc of parsed) {
    for (const p of doc.problems) add(PROBLEM, at(p.path, p.line), p.message);
  }

  // 2. ID 는 관리 범위 전체에서 하나만 가리켜야 한다.
  // 겹치면 링크 목적지, 이동 복구, 삭제 대상이 모두 모호해진다.
  for (const dup of graph.duplicates) {
    add(
      PROBLEM,
      at(dup.again.path, dup.again.startLine),
      `ID ${dup.id} 가 ${at(dup.first.path, dup.first.startLine)} 에도 있습니다`
    );
  }

  // 3. 종류와 자리가 맞는지. d 는 문서를 통째로 감싸고, s 와 b 는 그 안에 든다.
  for (const doc of parsed) {
    const roots = doc.ranges.filter((r) => r.depth === 0);
    for (const range of doc.ranges) {
      if (range.kind === "d" && range.depth !== 0) {
        add(PROBLEM, at(range.path, range.startLine), `${range.id} 는 문서 노드인데 다른 범위 안에 있습니다`);
      }
      if (range.kind !== "d" && range.depth === 0) {
        add(
          PROBLEM,
          at(range.path, range.startLine),
          `${range.id} 가 문서 노드 밖에 있습니다 — d 범위 안에 두세요`
        );
      }
      // b 는 가장 작은 단위다. 그 안에 무엇을 두든 크기 순서가 뒤집힌다.
      if (range.parent) {
        const parent = doc.ranges.find((r) => r.id === range.parent);
        if (parent?.kind === "b") {
          add(
            PROBLEM,
            at(range.path, range.startLine),
            `${range.id}(${range.kind}) 가 ${parent.id}(b) 안에 있습니다 — b 는 가장 작은 단위입니다`
          );
        }
      }
    }
    if (roots.length > 1) {
      add(PROBLEM, at(doc.path, roots[1].startLine), "문서 노드가 둘 이상입니다");
    }
  }

  // 4. 관계 유형과 대상
  const declared = new Set();
  for (const edge of graph.edges) {
    const where = at(edge.path, edge.line);
    const meta = RELATIONS.get(edge.type);
    if (!meta) {
      add(PROBLEM, where, `허용되지 않은 관계 유형입니다: \`${edge.type}\``);
      continue;
    }
    if (!edge.from) {
      add(PROBLEM, where, `관계가 어느 범위에도 들어 있지 않습니다: \`${edge.type}\``);
    }
    // 남의 주소의 조각은 이 프로젝트의 노드를 가리킬 수 없다.
    if (isExternal(edge.dest)) {
      add(PROBLEM, where, `관계 대상이 외부 주소입니다: ${edge.dest}`);
      continue;
    }
    const { path, fragment } = splitTarget(edge.dest);
    const resolved = resolveTarget(root, edge.path, path);
    if (resolved === false || resolved === OUTSIDE) {
      add(PROBLEM, where, missingMessage("관계", resolved, path));
    }
    if (!edge.to) {
      // 관계에는 ID 조각만 받는다. 제목 조각은 제목이 바뀌면 깨진다.
      add(PROBLEM, where, `관계 대상이 doltap ID 조각이 아닙니다: #${fragment ?? ""}`);
      continue;
    }
    if (resolved && resolved !== OUTSIDE && !isManagedMarkdown(root, resolved)) {
      add(PROBLEM, where, `관계 대상이 그래프 관리 범위 밖입니다: ${resolved}`);
      continue;
    }
    if (!graph.byId.has(edge.to)) {
      add(PROBLEM, where, `관계가 가리키는 ID 가 없습니다: ${edge.to}`);
      continue;
    }
    // 경로는 깨졌는데 같은 ID 가 다른 곳에 있으면 이동한 것이다. 복구 후보를 알린다.
    if (resolved === false || (resolved && resolved !== OUTSIDE && resolved !== graph.byId.get(edge.to).path)) {
      add(
        NOTICE,
        where,
        `${edge.to} 는 ${graph.byId.get(edge.to).path} 에 있습니다 — 경로가 낡았을 수 있습니다`
      );
    }
    // 같은 관계를 두 번 적으면 관계 ID 가 겹쳐 검토 기록이 어느 쪽 것인지
    // 모호해진다. 대칭 관계는 양쪽에 적는 것이 곧 중복이다.
    if (edge.from && edge.id) {
      if (declared.has(edge.id)) {
        add(
          PROBLEM,
          where,
          meta.symmetric
            ? `대칭 관계를 양쪽에 적었습니다: ${edge.id}`
            : `같은 관계를 두 번 적었습니다: ${edge.id}`
        );
      }
      declared.add(edge.id);
    }
  }

  // 5. 일반 링크는 엣지가 아니지만 대상 파일이 실재하는지는 본다.
  for (const doc of parsed) {
    for (const link of doc.links) {
      const { path, fragment } = splitTarget(link.dest);
      if (!path) continue; // 같은 문서 안의 조각 링크
      const target = resolveTarget(root, link.path, path);
      if (target === false || target === OUTSIDE) {
        add(PROBLEM, at(link.path, link.line), missingMessage("링크", target, path));
        continue;
      }
      const id = idFromFragment(fragment);
      if (id && !graph.byId.has(id)) {
        add(PROBLEM, at(link.path, link.line), `링크가 가리키는 ID 가 없습니다: ${id}`);
      }
    }
  }

  // 6. 도달성 — 진입점에서 관계를 따라가 닿지 않는 문서는 새 세션이 찾지 못한다.
  if (entryPoints.length) {
    const reachable = new Set();
    const queue = [];
    for (const entry of entryPoints) {
      // 바깥의 root(폴더)와 이름이 겹치지 않게 한다.
      const entryNode = parsed.find((d) => d.path === entry)?.ranges.find((r) => r.depth === 0);
      if (entryNode) queue.push(entryNode.id);
    }
    while (queue.length) {
      const id = queue.shift();
      if (reachable.has(id)) continue;
      reachable.add(id);
      const here = graph.byId.get(id);
      // 포함 관계도 길이다. 문서에 닿으면 그 안의 범위에도 닿는다.
      for (const doc of parsed) {
        for (const range of doc.ranges) {
          if (range.parent === id) queue.push(range.id);
        }
      }
      if (here) {
        for (const doc of parsed) {
          if (doc.path !== here.path) continue;
          const docRoot = doc.ranges.find((r) => r.depth === 0);
          if (docRoot) queue.push(docRoot.id);
        }
      }
      for (const edge of graph.outgoing.get(id) ?? []) {
        if (edge.to) queue.push(edge.to);
      }
    }
    for (const doc of parsed) {
      const docRoot = doc.ranges.find((r) => r.depth === 0);
      if (!docRoot) {
        add(PROBLEM, doc.path, "문서 노드가 없습니다 — d 범위로 감싸세요");
        continue;
      }
      if (!reachable.has(docRoot.id)) {
        add(PROBLEM, doc.path, `진입점에서 닿지 않습니다 (${docRoot.id})`);
      }
    }
  }

  const passed = [];
  if (!findings.some((f) => f.kind === PROBLEM)) {
    if (graph.byId.size) passed.push(`범위 ${graph.byId.size}개`);
    const real = graph.edges.filter((e) => e.from && e.to).length;
    if (real) passed.push(`관계 ${real}개`);
  }

  return {
    graph,
    problems: findings.filter((f) => f.kind === PROBLEM),
    notices: findings.filter((f) => f.kind === NOTICE),
    passed,
  };
}

// 기계가 읽는 출력. 사람용 출력과 같은 판정에서 만든다 — 두 벌로 갈라지지 않게.
export function toJson(result) {
  return {
    schema: "doltap.check.v1",
    problems: result.problems.map((f) => ({ where: f.where, message: f.message })),
    notices: result.notices.map((f) => ({ where: f.where, message: f.message })),
    nodes: [...result.graph.byId.values()].map((r) => ({
      id: r.id,
      kind: r.kind,
      path: r.path,
      startLine: r.startLine,
      endLine: r.endLine,
      parent: r.parent,
    })),
    edges: result.graph.edges
      .filter((e) => e.from && e.to)
      .map((e) => ({ id: e.id, from: e.from, type: e.type, to: e.to })),
  };
}
