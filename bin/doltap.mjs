#!/usr/bin/env node
// 새 프로젝트 폴더를 만들고 template/ 을 그대로 복사한다.
// 이 파일은 문서 내용을 갖지 않는다. 복사와 프로젝트 이름 치환만 한다.

import { cp, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { check, format } from "../lib/check.mjs";
import { ENTRY_POINTS, checkGraph, collectDocuments, toJson } from "../lib/graph-check.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TEMPLATE = join(ROOT, "template");

const USAGE = `doltap — AI 코딩 에이전트와 일할 때 쓰는 문서 골격

  doltap init <폴더>   새 폴더를 만들고 골격을 넣습니다
  doltap check [폴더]  골격이 실제로 이어져 있는지 검사합니다 (기본값: 지금 폴더)

검사 옵션

  --json           기계가 읽는 출력
  --schema next    아직 이관 중인 문서 그래프 규칙을 엄격하게 봅니다
                   이관이 끝나면 이것이 기본이 되고 옵션은 사라집니다

이미 작업 중인 프로젝트에는 init 을 쓰지 않습니다. 기존 규칙과 기록을
살리면서 합쳐야 하므로 APPLY.md의 절차를 따릅니다.

  git clone --depth 1 https://github.com/Jammanb0/cairn .doltap-bootstrap
`;

// 셸에 그대로 붙여 넣을 수 있게 경로를 인용한다.
// POSIX 셸(bash, zsh 등) 기준이다. PowerShell은 작은따옴표 이스케이프 방식이 다르다.
function shellQuote(value) {
  if (/^[A-Za-z0-9._:@%+,\/-]+$/.test(value)) return value;
  const q = String.fromCharCode(39);
  const esc = q + String.fromCharCode(92) + q + q;
  return q + value.split(q).join(esc) + q;
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

async function isEmptyDir(path) {
  const entries = await readdir(path);
  return entries.length === 0;
}

// AGENTS.md 첫머리의 이름 자리만 채운다. 나머지 채우기 표시는 그대로 둔다.
async function fillProjectName(target, name) {
  const path = join(target, "AGENTS.md");
  const before = await readFile(path, "utf8");
  const after = before
    .replace("<!-- 채우기: 프로젝트 이름 -->\n", "")
    .replace("# 프로젝트 이름", () => `# ${name}`);
  if (after === before) {
    return false;
  }
  await writeFile(path, after);
  return true;
}

async function init(rawTarget) {
  if (!rawTarget) fail("폴더 이름이 필요합니다.\n\n" + USAGE);

  const target = resolve(process.cwd(), rawTarget);
  const name = basename(target);

  if (existsSync(target) && !(await isEmptyDir(target))) {
    fail(
      `${rawTarget} 안에 이미 파일이 있습니다. 아무것도 바꾸지 않았습니다.\n\n` +
        "작업 중인 프로젝트라면 기존 규칙과 기록을 살리면서 합쳐야 합니다.\n" +
        "아래로 골격을 받은 뒤 APPLY.md의 절차를 따르세요.\n\n" +
        "  git clone --depth 1 https://github.com/Jammanb0/cairn .doltap-bootstrap"
    );
  }

  if (!existsSync(TEMPLATE)) fail(`골격을 찾지 못했습니다: ${TEMPLATE}`);

  await mkdir(target, { recursive: true });
  await cp(TEMPLATE, target, { recursive: true });
  const named = await fillProjectName(target, name);

  process.stdout.write(
    `${rawTarget}/ 에 골격을 만들었습니다.\n\n` +
      "  AGENTS.md      항상 적용되는 규칙과 문서 안내표\n" +
      "  CLAUDE.md      \"@AGENTS.md\" 한 줄\n" +
      "  .doltap/       규칙과 계획 문서\n\n" +
      (named
        ? `프로젝트 이름은 ${name} 으로 넣었습니다. `
        : "프로젝트 이름 자리를 찾지 못해 그대로 두었습니다. ") +
      "나머지는 직접 채웁니다. 아래는 bash 같은 POSIX 셸 기준입니다.\n\n" +
      `  cd ${shellQuote(rawTarget)}\n` +
      '  grep -rnE "채우기|고르기" AGENTS.md .doltap/\n\n' +
      "에이전트에게 맡기려면 이렇게 말하면 됩니다.\n\n" +
      "  AGENTS.md와 .doltap/의 채우기 자리를 이 프로젝트에 맞게 채워줘.\n" +
      "  확인되지 않는 것은 지어내지 말고 확인 필요로 남겨줘.\n"
  );
}

// 문서가 서로 이어져 있는지 검사한다. 문제가 있으면 종료 코드 1로 끝낸다.
// `--schema next` 는 아직 이관하지 않은 그래프 규칙을 엄격하게 본다. 이관이
// 끝나면 이것이 기본이 되고 옵션은 사라진다.
function runCheck(args) {
  const flags = args.filter((a) => a.startsWith("--"));
  const rawTarget = args.find((a) => !a.startsWith("--") && a !== "next");
  const target = resolve(process.cwd(), rawTarget ?? ".");
  if (!existsSync(target)) fail(`그런 폴더가 없습니다: ${rawTarget}`);

  const at = args.indexOf("--schema");
  const schema = at === -1 ? null : args[at + 1];
  if (at !== -1 && schema !== "next") fail(`모르는 스키마입니다: ${schema ?? "(없음)"}`);
  const asJson = flags.includes("--json");

  const result =
    schema === "next"
      ? checkGraph({
          root: target,
          documents: collectDocuments(target),
          entryPoints: ENTRY_POINTS,
        })
      : check(target);

  // 사람용 출력과 기계용 출력은 같은 판정에서 만든다. 두 벌로 갈라지지 않게.
  if (asJson) process.stdout.write(JSON.stringify(schema === "next" ? toJson(result) : result, null, 2) + "\n");
  else process.stdout.write(format(result));
  if (result.problems.length) process.exit(1);
}

const [command, ...rest] = process.argv.slice(2);

if (!command || command === "-h" || command === "--help" || command === "help") {
  process.stdout.write(USAGE);
} else if (command === "init") {
  await init(rest[0]);
} else if (command === "check") {
  runCheck(rest);
} else {
  fail(`모르는 명령입니다: ${command}\n\n${USAGE}`);
}
