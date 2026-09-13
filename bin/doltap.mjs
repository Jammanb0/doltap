#!/usr/bin/env node
// 문서 골격과 그래프 명령의 CLI 진입점.

import { cp, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { format } from "../lib/check.mjs";
import { toJson } from "../lib/graph-check.mjs";
import { fullCheck, inspect } from '../lib/runtime.mjs';
import { migratePlan, idPlan, linkPlan, moveFixPlan } from '../lib/edit.mjs';
import { mutate, preview, recover, safePath } from '../lib/transaction.mjs';
import { reviewPlan, suggestionPlan } from '../lib/state.mjs';
import { archiveCheck, deletePlan, deleteFixPlan, deleteFolderPlan, pruneEmptyFolders } from '../lib/lifecycle.mjs';
import { mapResult, context, audit, formatQuery } from '../lib/query.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TEMPLATE = join(ROOT, "template");

const USAGE = `doltap — AI 코딩 에이전트와 일할 때 쓰는 문서 골격

  doltap init <폴더>   새 폴더를 만들고 골격을 넣습니다
  doltap check [폴더]  골격이 실제로 이어져 있는지 검사합니다 (기본값: 지금 폴더)
  doltap migrate [폴더] [--apply]  문서 ID와 색인을 이관합니다
  doltap id <파일> --kind d|s|b [--at 제목|줄] [--end 줄] [--apply]
  doltap link <ID> --to <ID> --as <관계> [--apply]
  doltap move-fix [폴더] [--apply]
  doltap recover <실행 ID> [--apply|--discard]
  doltap archive-check <폴더>  전제·열린 질문 처리 여부를 검사합니다
  doltap delete <ID> --mode replace|tombstone|purge --why 이유 [--to ID] [--apply]
  doltap delete <폴더> --mode purge --why 이유 [--drop-links] [--apply]
  doltap delete-fix <ID|경로> --why 이유 [--drop-links] [--apply]
  doltap review <ID> [--node] --as 판단 --why 이유 --actor 사람|에이전트 [--apply]
  doltap map [폴더] [--json]
  doltap context <ID> [--depth 2] [--budget 4000] [--json]
  doltap audit <경로> [--changed] [--include-legacy] [--budget 8000] [--json]
  doltap suggest <ID> --to ID --relation 유형 --evidence 근거 --as 반영|기각|보류 --why 이유 --actor 주체 [--apply]

쓰기 명령은 기본 미리보기이며 --apply에서만 적용합니다. --root로 프로젝트를 지정합니다.

검사 옵션

  --json           기계가 읽는 출력

이미 작업 중인 프로젝트에는 init 을 쓰지 않습니다. 기존 규칙과 기록을
살리면서 합쳐야 하므로 APPLY.md의 절차를 따릅니다.

  git clone --depth 1 https://github.com/Jammanb0/doltap .doltap-bootstrap
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
        "  git clone --depth 1 https://github.com/Jammanb0/doltap .doltap-bootstrap"
    );
  }

  if (!existsSync(TEMPLATE)) fail(`골격을 찾지 못했습니다: ${TEMPLATE}`);

  await mkdir(target, { recursive: true });
  await cp(TEMPLATE, target, { recursive: true, filter: source => source !== join(TEMPLATE, '.doltap', 'recovery') && source !== join(TEMPLATE, '.doltap', 'ids.lock') });
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
function runCheck(args) {
  for(const a of args.filter(a=>a.startsWith('--'))) if(a!=='--json') fail(`모르는 검사 옵션입니다: ${a}. 그래프 검사는 기본값입니다`);
  const flags = args.filter((a) => a.startsWith("--"));
  const rawTarget = args.find((a) => !a.startsWith("--"));
  const target = resolve(process.cwd(), rawTarget ?? ".");
  if (!existsSync(target)) fail(`그런 폴더가 없습니다: ${rawTarget}`);

  const asJson = flags.includes("--json");

  const result = fullCheck(target);

  // 사람용 출력과 기계용 출력은 같은 판정에서 만든다. 두 벌로 갈라지지 않게.
  if (asJson) process.stdout.write(JSON.stringify(toJson(result), null, 2) + "\n");
  else process.stdout.write(format(result));
  if (result.problems.length) process.exit(1);
}

const [command, ...rest] = process.argv.slice(2);

function options(args) {
  const values = new Set(['--root','--kind','--at','--end','--to','--as','--why','--actor','--mode','--depth','--budget','--relation','--state','--evidence']);
  const booleans = new Set(['--apply','--discard','--json','--node','--changed','--include-legacy','--drop-links']);
  const out = { positional: [] };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (values.has(arg)) { if (!args[i+1] || args[i+1].startsWith('--')) throw new Error(`${arg} 값이 필요합니다`); out[arg.slice(2)] = args[++i]; }
    else if (booleans.has(arg)) out[arg.slice(2)] = true;
    else if (arg.startsWith('-')) throw new Error(`모르는 옵션: ${arg}`);
    else out.positional.push(arg);
  }
  return out;
}
function runGraph(command, args) {
  if (!['recover','migrate','id','link','move-fix','map','context','audit','archive-check','delete','delete-fix','review','suggest'].includes(command)) throw new Error(`모르는 명령입니다: ${command}\n\n${USAGE}`);
  const o = options(args), arg = o.positional[0];
  const root = resolve(o.root ?? (['migrate','move-fix','map'].includes(command) ? arg ?? '.' : '.'));
  const numeric = name => o[name] === undefined ? undefined : Number(o[name]);
  let plan, output, folderDetails;
  if (command === 'recover') output = recover(root, arg, { apply: o.apply, discard: o.discard });
  else if (command === 'migrate') plan = () => migratePlan(root);
  else if (command === 'id') plan = () => idPlan(root, arg, { kind: o.kind, at: o.at, end: o.end });
  else if (command === 'link') plan = () => linkPlan(root, arg, o.to, o.as);
  else if (command === 'move-fix') plan = () => moveFixPlan(root);
  else {
    const result = inspect(root), { graph, records } = result;
    if (command === 'map') output = { ...mapResult(graph), problems: result.problems };
    else if (command === 'context') output = context(graph, arg, { depth: numeric('depth'), budget: numeric('budget'), state: o.state, relation: o.relation });
    else if (command === 'audit') output = audit(root, result, records, arg ?? '.', { budget: numeric('budget'), changed: o.changed, includeLegacy: o['include-legacy'], relation: o.relation, state: o.state });
    else if (command === 'archive-check') {
      if (!arg || !existsSync(safePath(root, arg))) throw new Error('검사할 워크스트림 경로가 필요합니다');
      output = { problems: archiveCheck(graph, arg.replaceAll('\\', '/').replace(/\/$/, '')) };
    }
    else if (command === 'delete') plan = () => {
      if (!arg || arg.startsWith('doltap-')) return deletePlan(root, inspect(root).graph, arg, { mode:o.mode, replacement:o.to, why:o.why });
      const {changes,...details}=deleteFolderPlan(root,inspect(root).graph,arg,{mode:o.mode,why:o.why,dropLinks:o['drop-links']});
      folderDetails=details;return changes;
    };
    else if (command === 'delete-fix') plan = () => deleteFixPlan(root, inspect(root).graph, arg, { why: o.why, dropLinks: o['drop-links'] });
    else if (command === 'review') plan = () => reviewPlan(root, inspect(root).graph, arg, { judgment: o.as, why: o.why, actor: o.actor, node: o.node });
    else if (command === 'suggest') plan = () => suggestionPlan(root, inspect(root).graph, arg, o.to, o.relation, { judgment: o.as, why: o.why, actor: o.actor, evidence: o.evidence });
    else throw new Error(`모르는 명령: ${command}`);
    if (result.problems.length && ['map','context','audit'].includes(command)) process.exitCode = 1;
  }
  if (plan) {
    let diff;
    if (o.apply) output = mutate(root, () => { const changes = plan(); diff = preview(changes); if (!o.json) process.stdout.write(diff + '\n'); return changes; });
    else { diff = preview(plan()); if (!o.json) process.stdout.write(diff + '\n'); output = { applied: false, message: '미리보기입니다. --apply에서 적용합니다' }; }
    if (o.json) output = { ...output, preview: diff };
    if (folderDetails) output = {...output,...folderDetails,...(o.apply ? pruneEmptyFolders(root,folderDetails.scope) : {})};
  }
  process.stdout.write(o.json ? JSON.stringify(output, null, 2) + '\n' : formatQuery(output));
  if (output?.problems?.length || output?.errors?.length) process.exitCode = 1;
}

try {
if (!command || command === "-h" || command === "--help" || command === "help") {
  process.stdout.write(USAGE);
} else if (command === "init") {
  await init(rest[0]);
} else if (command === "check") {
  runCheck(rest);
} else {
  runGraph(command, rest);
}
} catch (error) { fail(error.message); }
