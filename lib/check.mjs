// 문서 골격이 실제로 이어져 있는지 검사한다.
// 파일이 생겼다는 것과 서로 연결됐다는 것은 다르므로, 가리키는 곳이 실재하는지까지 본다.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { markVerbatim } from './graph.mjs';

// current.md 에서 "지금 진행 중"이라고 읽히는 자리. 워크스트림 경로와 굵은 글씨
// 항목 둘뿐입니다. 줄 아무 데서나 번호를 세면 날짜(2026-09-10)와 지나간 대작업을
// 말로 언급한 문장까지 활성 목록으로 잡힙니다.
const LISTED = [
  /\.doltap\/plans\/workstreams\/([0-9]{3}-[a-z0-9-]+)\//g,
  /\*\*([0-9]{3}-[a-z0-9-]+)\*\*/g,
];
// 자리표시자는 주석 형태로만 셉니다. 절차를 설명하느라 그 말이 들어간 문장까지
// 세면 오탐이 쌓이고, 오탐을 내는 검사는 아무도 보지 않게 됩니다.
const MARKER = new RegExp("^[ ]*<!--[ ]*(채우기|고르기|확인 필요)[ ]*:");
const ARCHIVE = ".doltap/archive";
// 이름을 말로 부르는 것과 그 폴더를 가리키는 것은 다릅니다. 뒤에 경로가 이어진
// 것만 참조로 셉니다. 줄에 이름이 들어 있기만 하면 세면 이 검사를 설명하는
// 문서가 그대로 걸립니다.
const TEMP_REFERENCE = /\.doltap-bootstrap\/[A-Za-z0-9._-]/;

const PROBLEM = "문제"; // 고쳐야 하는 것
const NOTICE = "확인"; // 사람이 판단할 것

// 골격이 자리를 잡았다면 반드시 있어야 하는 문서.
const REQUIRED = [
  ".doltap/plans/project.md",
  ".doltap/plans/README.md",
  ".doltap/plans/current.md",
  ".doltap/plans/workstreams.md",
  ".doltap/plans/ideas.md",
  ".doltap/plans/history.md",
];

// 활성 워크스트림의 필수 문서. plan.md, design.md, decisions.md 는 있을 때만 본다.
const WORKSTREAM_REQUIRED = ["README.md", "status.md"];

// 세팅 워크스트림은 적용 절차를 설명하느라 임시 골격 경로를 담고 있다.
const SETUP_SUFFIX = "-doltap-setup";

// 다른 도구의 지시 파일은 "이런 것들이 해당한다"고 열거하는 자리라 실재 여부를 묻지 않는다.
const OTHER_TOOLS = new Set([
  "AGENTS.override.md",
  "CLAUDE.local.md",
  ".cursorrules",
  ".github/copilot-instructions.md",
]);

function read(root, name) {
  const path = join(root, name);
  return existsSync(path) ? readFileSync(path, "utf8") : null;
}

function listMarkdown(dir, out = [], skipDirectory = () => false) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      if (!skipDirectory(path)) listMarkdown(path, out, skipDirectory);
    } else if (entry.endsWith(".md")) out.push(path);
  }
  return out;
}

// 코드 블록과 HTML 주석은 안내가 아니라 예시이므로 검사에서 뺀다.
function meaningfulLines(text) {
  const lines = [];
  let inFence = false;
  let inComment = false;
  const rawLines = text.split(/\r?\n/), verbatim = markVerbatim(rawLines);
  rawLines.forEach((raw, index) => {
    if (verbatim[index]) return;
    let line = raw;
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;
    if (inComment) {
      const end = line.indexOf("-->");
      if (end === -1) return;
      line = line.slice(end + 3);
      inComment = false;
    }
    line = line.replace(/<!--[\s\S]*?-->/g, "");
    const open = line.indexOf("<!--");
    if (open !== -1) {
      line = line.slice(0, open);
      inComment = true;
    }
    if (line.trim()) lines.push({ number: index + 1, text: line });
  });
  return lines;
}

// 백틱으로 감싼 것 중 다른 문서를 가리키는 링크만 고른다.
// 폴더와 확장자 없는 것은 구조 설명이나 브랜치 이름이라 대상이 아니다.
// 파일명만 쓴 것도 뺀다. 같은 폴더를 가리키거나, 대작업마다 생기는 문서를
// 이름으로 부르는 자리("그 대작업의 status.md")라 실재를 물을 수 없다.
function documentTokens(line) {
  const found = [];
  for (const [, token] of line.matchAll(/`([^`]+)`/g)) {
    if (token.startsWith("@")) continue;
    if (!token.endsWith(".md")) continue;
    if (!token.includes("/")) continue;
    if (!/^[A-Za-z0-9._\-/]+$/.test(token)) continue;
    if (OTHER_TOOLS.has(token)) continue;
    // `.doltap-bootstrap/` 은 적용을 마치면 지우는 폴더다. 세팅 기록이 그 경로를 담고
    // 있는 것이 정상이므로 실재를 묻지 않는다. 활성 문서에 남은 참조는 6번이 본다.
    if (token.startsWith(".doltap-bootstrap/")) continue;
    found.push(token);
  }
  return found;
}

// 같은 폴더는 파일명으로 줄여 쓰고 다른 폴더는 저장소 루트 기준으로 쓴다.
function resolves(root, doc, token) {
  return existsSync(join(dirname(doc), token)) || existsSync(join(root, token));
}

function subdirs(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((name) => statSync(join(dir, name)).isDirectory());
}

// current.md 는 파일 하나가 통째로 진행 중인 대작업 목록이라 절을 찾지 않는다.
// 주석 안의 작성 예시와 코드 블록은 실제로 적힌 것이 아니므로 빠진다.
function currentBody(text) {
  if (text === null) return null;
  return meaningfulLines(text)
    .map((l) => l.text)
    .join("\n");
}

// 이어받을 곳을 찾을 때 씁니다. 이름이 어디에 적혀 있든 인정하되, 앞뒤가
// 끊겨 있어야 합니다. 부분 문자열을 그냥 인정하면 `004-search` 폴더가
// `004-search-rework` 한 줄에 가려집니다.
const NAME_CHAR = /[0-9A-Za-z_-]/;
function mentions(body, name) {
  for (let from = 0; ; ) {
    const at = body.indexOf(name, from);
    if (at === -1) return false;
    const before = at === 0 ? "" : body[at - 1];
    const after = body[at + name.length] ?? "";
    if (!NAME_CHAR.test(before) && !NAME_CHAR.test(after)) return true;
    from = at + 1;
  }
}

// 폴더가 없는 대작업을 가리키는지 볼 때 씁니다. 형식이 갖춰진 자리만 셉니다.
function listedWorkstreams(body) {
  const names = new Set();
  for (const pattern of LISTED) {
    for (const [, name] of body.matchAll(pattern)) names.add(name);
  }
  return [...names];
}

// 아카이브는 지나간 기록입니다. 그때의 경로와 판단을 그대로 담고 있는 것이
// 정상이고 관리는 사용자 몫이므로, 재귀 탐색에 들어가기 전부터 뺍니다.
function isArchivePath(root, path) {
  const name = relative(root, path).split(sep).join("/");
  return name === ARCHIVE || name.startsWith(`${ARCHIVE}/`);
}

export function check(root) {
  const findings = [];
  const passed = [];
  const at = (file, line) => `${relative(root, file).split(sep).join("/")}${line ? `:${line}` : ""}`;
  const add = (kind, where, message) => findings.push({ kind, where, message });

  // 1. 진입점이 있고 서로 이어지는지
  const agents = read(root, "AGENTS.md");
  const claude = read(root, "CLAUDE.md");
  if (agents === null) add(PROBLEM, "AGENTS.md", "규칙 원본이 없습니다");
  if (claude === null) {
    add(PROBLEM, "CLAUDE.md", "없습니다. Claude Code가 규칙을 읽을 길이 없습니다");
  } else {
    // 주석 안의 `@AGENTS.md` 는 import 가 아니므로 본문만 본다.
    const body = meaningfulLines(claude)
      .map((l) => l.text.trim())
      .join("\n");
    if (!body.includes("@AGENTS.md")) {
      add(PROBLEM, "CLAUDE.md", "`@AGENTS.md` 가 없어 AGENTS.md로 이어지지 않습니다");
    } else if (body !== "@AGENTS.md") {
      add(PROBLEM, "CLAUDE.md", "`@AGENTS.md` 한 줄이 아닙니다. 여기 적은 본문은 Codex가 읽지 못해 규칙이 갈라집니다");
    } else if (agents !== null) {
      passed.push("CLAUDE.md → AGENTS.md 연결");
    }
  }

  // 폴더가 있는 것과 AGENTS.md가 그리로 안내하는 것은 다르다.
  const hasOperatingDir = existsSync(join(root, ".doltap"));
  if (!hasOperatingDir) {
    add(PROBLEM, ".doltap/", "폴더가 없습니다");
  } else if (agents !== null) {
    if (meaningfulLines(agents).some((l) => l.text.includes(".doltap/"))) {
      passed.push("AGENTS.md → .doltap/ 안내");
    } else {
      add(PROBLEM, "AGENTS.md", "`.doltap/` 로 이어지는 안내가 없어 그 폴더를 아무도 읽지 않습니다");
    }
  }

  // 2. 필수 문서가 있는지
  let missing = 0;
  if (hasOperatingDir) {
    for (const path of REQUIRED) {
      if (existsSync(join(root, path))) continue;
      missing += 1;
      add(PROBLEM, path, "없습니다. 골격의 필수 문서입니다");
    }
    if (!missing) passed.push(`필수 문서 ${REQUIRED.length}개`);
  }

  // 3. 문서가 가리키는 곳이 실재하는지
  // 재귀 탐색에 들어가기 전에 한 번 빼면 아래 4번과 6번도 함께 아카이브를
  // 보지 않고, 아카이브가 커져도 문서 목록을 만드는 비용이 늘지 않는다.
  const docs = [];
  if (agents !== null) docs.push(join(root, "AGENTS.md"));
  docs.push(...listMarkdown(join(root, ".doltap"), [], (dir) => isArchivePath(root, dir)));
  let links = 0;
  let broken = 0;
  for (const doc of docs) {
    for (const { number, text } of meaningfulLines(readFileSync(doc, "utf8"))) {
      for (const token of documentTokens(text)) {
        links += 1;
        if (resolves(root, doc, token)) continue;
        broken += 1;
        add(PROBLEM, at(doc, number), `가리키는 ${token} 가 없습니다`);
      }
    }
  }
  if (links && !broken) passed.push(`문서가 가리키는 경로 ${links}곳`);

  // 4. 아직 채우지 않은 자리 — 파일마다 한 줄로 모은다
  let blanks = 0;
  for (const doc of docs) {
    const hits = readFileSync(doc, "utf8")
      .split(/\r?\n/)
      .map((line, index) => (MARKER.test(line) ? index + 1 : 0))
      .filter(Boolean);
    if (!hits.length) continue;
    blanks += hits.length;
    add(NOTICE, at(doc), `아직 채우지 않은 자리 ${hits.length}곳 (${hits.slice(0, 5).join(", ")}${hits.length > 5 ? " …" : ""}행)`);
  }
  if (!blanks && docs.length) passed.push("채우기·고르기·확인 필요 자리 없음");

  // 5. 워크스트림 상태
  const plansDir = join(root, ".doltap/plans/workstreams");
  const archiveDir = join(root, ".doltap/archive/workstreams");
  const active = subdirs(plansDir);
  let workstreamClean = true;
  // 아카이브 폴더 이름은 그 번호가 이미 쓰였다는 기록으로만 읽는다. 아카이브
  // 자체를 판정하지 않으므로 이름 형식도 아카이브끼리의 충돌도 보지 않는다.
  // 잡는 것은 새 워크스트림이 지난 번호를 다시 쓴 것이고, 고칠 곳은 활성 쪽이다.
  const numbers = new Map();
  for (const name of [...subdirs(archiveDir), ...subdirs(join(root, '.doltap/archive/legacy/workstreams'))]) {
    const number = name.slice(0, 3);
    if (!numbers.has(number)) numbers.set(number, name);
  }
  for (const name of active) {
    if (!/^\d{3}-[a-z0-9-]+$/.test(name)) {
      workstreamClean = false;
      add(NOTICE, at(join(plansDir, name)), "이름이 `<세 자리 번호>-<영문 소문자>` 형식이 아닙니다");
    }
    const number = name.slice(0, 3);
    const clash = numbers.get(number);
    if (clash) {
      workstreamClean = false;
      add(PROBLEM, at(join(plansDir, name)), `번호 ${number} 가 ${clash} 와 겹칩니다`);
    } else {
      numbers.set(number, name);
    }
  }
  for (const name of active) {
    for (const required of WORKSTREAM_REQUIRED) {
      if (existsSync(join(plansDir, name, required))) continue;
      workstreamClean = false;
      add(PROBLEM, at(join(plansDir, name)), `${required} 가 없습니다`);
    }
  }
  // 양쪽을 다른 기준으로 본다. 이어받을 곳을 찾는 쪽은 이름이 어디에 적혀 있든
  // 인정하고, 없는 폴더를 가리킨다고 잡는 쪽은 형식이 갖춰진 자리만 본다.
  // 잡는 쪽까지 느슨하게 두면 날짜나 지나간 대작업 이야기가 문제로 올라온다.
  const current = currentBody(read(root, ".doltap/plans/current.md"));
  if (current !== null) {
    for (const name of active) {
      if (mentions(current, name)) continue;
      workstreamClean = false;
      add(PROBLEM, ".doltap/plans/current.md", `${name} 이 없어 새 세션이 찾지 못합니다`);
    }
    // 반대쪽 — 적혀 있는데 폴더가 없으면 이어받을 곳이 없다.
    for (const name of listedWorkstreams(current)) {
      if (active.includes(name)) continue;
      workstreamClean = false;
      const archived = ['.doltap/archive/workstreams', '.doltap/archive/legacy/workstreams'].some(dir => existsSync(join(root, dir, name)));
      add(PROBLEM, ".doltap/plans/current.md", archived ? `${name} 은 이미 아카이브에 있습니다. current.md의 활성 색인을 갱신하세요` : `${name} 이 적혀 있는데 그 폴더가 없습니다`);
    }
  }
  if (active.length && workstreamClean) passed.push(`진행 중인 대작업 ${active.length}개`);

  // 6. 곧 지울 폴더를 활성 문서가 가리키는지
  // 골격 이름을 알 방법이 없어 기본값 `.doltap-bootstrap` 만 본다. 다른 이름에 두었으면 이
  // 검사가 아무것도 하지 않으므로, 적용이 진행 중일 때 그 사실을 알린다.
  // 코드 블록 안의 명령도 그 폴더를 가리키는 것은 마찬가지라 원문 줄을 본다.
  for (const doc of docs) {
    if (doc.includes(SETUP_SUFFIX)) continue;
    const hits = readFileSync(doc, "utf8")
      .split(/\r?\n/)
      .map((line, index) => (TEMP_REFERENCE.test(line) ? index + 1 : 0))
      .filter(Boolean);
    if (hits.length) add(NOTICE, at(doc), `\`.doltap-bootstrap\` 참조가 ${hits.length}곳 남아 있습니다 (${hits.join(", ")}행)`);
  }
  const setup = active.find((name) => name.endsWith(SETUP_SUFFIX));
  if (setup) {
    add(
      NOTICE,
      at(join(plansDir, setup)),
      "적용이 진행 중입니다. 위의 임시 골격 참조 검사는 기본 이름 `.doltap-bootstrap` 뒤에 경로가 이어진 것만 봅니다\n" +
        "골격을 다른 이름이나 경로에 두었으면 그 경로로 직접 찾아야 합니다"
    );
  }

  return {
    problems: findings.filter((f) => f.kind === PROBLEM),
    notices: findings.filter((f) => f.kind === NOTICE),
    passed,
  };
}

export function format(result) {
  const lines = [];
  const width = Math.max(0, ...[...result.problems, ...result.notices].map((f) => f.where.length));
  // 여러 줄짜리 안내는 두 번째 줄부터 메시지 열에 맞춰 들여쓴다.
  const indent = " ".repeat(2 + width + 2);
  const entry = (f) => {
    const [head, ...rest] = f.message.split("\n");
    return [`  ${f.where.padEnd(width)}  ${head}`, ...rest.map((line) => `${indent}${line}`)];
  };
  if (result.problems.length) {
    lines.push(`✗ 문제 ${result.problems.length}개`);
    for (const f of result.problems) lines.push(...entry(f));
  }
  if (result.notices.length) {
    if (lines.length) lines.push("");
    lines.push(`! 확인 ${result.notices.length}개`);
    for (const f of result.notices) lines.push(...entry(f));
  }
  if (result.passed.length) {
    if (lines.length) lines.push("");
    lines.push("✓ 통과");
    for (const p of result.passed) lines.push(`  ${p}`);
  }
  if (!lines.length) lines.push("검사할 것을 찾지 못했습니다.");
  return lines.join("\n") + "\n";
}
