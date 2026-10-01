#!/usr/bin/env node
// doltap CLI 진입점. 명령·옵션·종료 코드는 docs/guide/commands.md에 있고 test/cli.test.mjs가 동작을 고정한다.

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { UsageError, newId, planId, planRelate, planReview, planUnrelate } from '../lib/editor.mjs';
import { formatFindings, toJson } from '../lib/findings.mjs';
import { initProject } from '../lib/init.mjs';
import { inspect, passedLines } from '../lib/inspect.mjs';
import { formatList, formatReviewList, formatShow, listResult, reviewListResult, showResult } from '../lib/queries.mjs';
import { StaleFileError, applyChanges, preview } from '../lib/writer.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TEMPLATE = join(ROOT, 'template');

const USAGE = `doltap — Markdown 문서 사이의 관계와 현재 작업을 확인하는 도구

  doltap init <폴더>                        새 폴더에 기본 구조를 만듭니다
  doltap check [폴더] [--strict] [--json]   전체를 검사합니다
  doltap list [폴더] [--json]               관리 문서와 범위 목록을 봅니다
  doltap show <ID> [--body] [--json]        범위의 관계와 검토 상태를 봅니다
  doltap review [--json]                    검토할 관계를 봅니다
  doltap review <ID> <ID> --note <확인한 내용> --by human|agent [--apply]
                                            관계 하나의 검토를 기록합니다
  doltap id <파일> [--kind d|s|b] [--at <제목|줄>] [--end <줄>] [--apply]
                                            범위 표식을 추가합니다
  doltap id --kind d|s|b                    쓰지 않은 새 ID를 보여 줍니다
  doltap relate <ID> <관계> <ID> [--apply]  양쪽 관계 선언을 추가합니다
  doltap unrelate <ID> <ID> [--apply]       두 범위 사이의 선언을 해제합니다

관계: same-as, depends-on, depended-on-by, consistent-with
--root <폴더>로 프로젝트 위치를 정합니다. 기본값은 지금 폴더입니다.
쓰기 명령은 바뀔 내용을 먼저 보여 주고 --apply를 붙였을 때 씁니다(init은 바로 만듭니다).
종료 코드: 0 성공, 1 check가 문제를 찾음, 2 실행하지 못함
자세한 안내: docs/guide/README.md
`;

const VALUE = new Set(['--root', '--kind', '--at', '--end', '--note', '--by']);
const FLAGS = new Set(['--apply', '--json', '--strict', '--body']);
const ALLOWED = {
  init: [],
  check: ['--root', '--json', '--strict'],
  list: ['--root', '--json'],
  show: ['--root', '--json', '--body'],
  review: ['--root', '--json', '--note', '--by', '--apply'],
  id: ['--root', '--json', '--kind', '--at', '--end', '--apply'],
  relate: ['--root', '--json', '--apply'],
  unrelate: ['--root', '--json', '--apply'],
};

function parse(command, args) {
  const allowed = new Set(ALLOWED[command]);
  const options = { positional: [] };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--') {
      options.positional.push(...args.slice(i + 1));
      break;
    }
    if (arg.startsWith('--')) {
      const eq = arg.indexOf('=');
      const flag = eq === -1 ? arg : arg.slice(0, eq);
      const inline = eq === -1 ? undefined : arg.slice(eq + 1);
      if (!VALUE.has(flag) && !FLAGS.has(flag)) throw new UsageError(`모르는 옵션입니다: ${flag}`);
      if (!allowed.has(flag)) throw new UsageError(`${command}에는 ${flag} 옵션을 쓰지 않습니다`);
      if (VALUE.has(flag)) {
        const value = inline ?? args[i + 1];
        if (value === undefined || (inline === undefined && value.startsWith('--'))) throw new UsageError(`${flag}에 값이 필요합니다`);
        if (inline === undefined) i += 1;
        options[flag.slice(2)] = value;
      } else {
        if (inline !== undefined) throw new UsageError(`${flag}에는 값을 붙이지 않습니다`);
        options[flag.slice(2)] = true;
      }
      continue;
    }
    if (arg.startsWith('-') && arg.length > 1) throw new UsageError(`모르는 옵션입니다: ${arg}`);
    options.positional.push(arg);
  }
  return options;
}

// 폴더를 받는 명령은 위치 인자나 --root 하나로 프로젝트를 정한다.
function folderOf(options, max = 1) {
  if (options.positional.length > max) throw new UsageError(`인자가 너무 많습니다: ${options.positional.join(' ')}`);
  if (options.root !== undefined && options.positional.length) throw new UsageError('프로젝트 폴더는 위치 인자와 --root 가운데 하나로만 정합니다');
  return resolve(options.root ?? options.positional[0] ?? '.');
}

function expect(options, count, usage) {
  if (options.positional.length !== count) throw new UsageError(`사용법: ${usage}`);
}

const out = (text) => process.stdout.write(text);
const json = (value) => out(`${JSON.stringify(value, null, 2)}\n`);

function runCheck(options) {
  const result = inspect(folderOf(options));
  const failed = result.problems.length > 0 || (options.strict && result.summary.pending > 0);
  if (options.json) {
    json({ schema: 'doltap.check.v2', ok: !failed, problems: result.problems.map(toJson), notices: result.notices.map(toJson), summary: result.summary });
  } else {
    out(formatFindings(result.problems, result.notices, passedLines(result.summary)));
    if (options.strict && result.summary.pending && !result.problems.length) out(`--strict: 검토 대기 ${result.summary.pending}개를 실패로 셉니다.\n`);
  }
  return failed ? 1 : 0;
}

// 변경안을 보여 주거나 쓴다. 쓰는 중 실패하면 어디까지 썼는지 알리고 2로 끝낸다.
function write(options, command, plan, describe) {
  const diff = preview(plan.changes);
  const details = describe(plan);
  if (!options.apply) {
    if (options.json) json({ schema: 'doltap.write.v1', command, applied: false, preview: diff, ...details.data });
    else out(`${diff ? `${diff}\n\n` : ''}${details.text}미리보기입니다. --apply를 붙이면 씁니다.\n`);
    return 0;
  }
  const result = applyChanges(options.rootPath, plan.changes);
  if (options.json) json({ schema: 'doltap.write.v1', command, applied: !result.failed, preview: diff, ...result, ...details.data });
  if (result.failed) {
    process.stderr.write([
      `${result.failed.path}에 쓰지 못했습니다: ${result.failed.message}`,
      `이미 쓴 파일: ${result.written.length ? result.written.join(', ') : '없음'}`,
      `쓰지 못한 파일: ${result.notWritten.join(', ')}`,
      '되돌리지 않았습니다. doltap check로 어긋난 선언을 확인하고 직접 고치세요.',
    ].join('\n') + '\n');
    return 2;
  }
  if (!options.json) {
    out(`${diff ? `${diff}\n\n` : ''}${details.text}`);
    out(result.written.length ? `파일 ${result.written.length}개를 썼습니다: ${result.written.join(', ')}\n` : '바꿀 내용이 없습니다.\n');
  }
  return 0;
}

function run(command, args) {
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    out(USAGE);
    return 0;
  }
  if (command === '--version') {
    out(`${JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version}\n`);
    return 0;
  }
  if (!Object.hasOwn(ALLOWED, command)) throw new UsageError(`모르는 명령입니다: ${command}\n\n${USAGE}`);
  const options = parse(command, args);

  if (command === 'init') {
    expect(options, 1, 'doltap init <폴더>');
    const result = initProject(options.positional[0], TEMPLATE);
    out([
      `${options.positional[0]}에 기본 구조를 만들었습니다.`,
      '',
      '  AGENTS.md            규칙과 작업을 시작할 때 읽을 곳',
      '  .doltap/current.md   진행 중인 작업',
      '  .doltap/history.md   마친 작업',
      '',
      result.named ? `프로젝트 이름은 ${result.name}로 넣었습니다.` : '프로젝트 이름 자리는 그대로 두었습니다.',
      'AGENTS.md의 채우기 자리를 프로젝트에 맞게 채우세요. doltap check가 남은 자리를 알려 줍니다.',
      '에이전트에게 맡길 때는 이렇게 말할 수 있습니다.',
      '',
      '  AGENTS.md의 채우기 자리를 이 프로젝트에 맞게 채워줘.',
      '  확인되지 않는 것은 지어내지 말고 확인 필요로 남겨줘.',
      '',
      'Claude Code가 AGENTS.md를 직접 읽지 않는 환경이면 CLAUDE.md에 @AGENTS.md 한 줄을 두세요.',
      '',
    ].join('\n'));
    return 0;
  }
  if (command === 'check') return runCheck(options);
  if (command === 'list') {
    const result = listResult(inspect(folderOf(options)));
    if (options.json) json(result);
    else out(formatList(result));
    return 0;
  }

  const rootPath = folderOf({ ...options, positional: [] });
  options.rootPath = rootPath;
  const inspection = inspect(rootPath);

  if (command === 'show') {
    expect(options, 1, 'doltap show <ID> [--body] [--json]');
    const result = showResult(inspection, options.positional[0], { body: options.body });
    if (options.json) json(result);
    else out(formatShow(result));
    return result.found ? 0 : 2;
  }
  if (command === 'review') {
    if (!options.positional.length) {
      if (options.note !== undefined || options.by !== undefined || options.apply) throw new UsageError('검토를 기록하려면 두 범위의 ID를 적습니다: doltap review <ID> <ID> --note <내용> --by human|agent');
      const result = reviewListResult(inspection);
      if (options.json) json(result);
      else out(formatReviewList(result));
      return 0;
    }
    expect(options, 2, 'doltap review <ID> <ID> --note <확인한 내용> --by human|agent [--apply]');
    const [first, second] = options.positional;
    return write(options, 'review', planReview(inspection, first, second, { note: options.note, by: options.by }), (plan) => ({
      text: [
        `${plan.previous ? '검토 기록을 새로 씁니다' : '첫 검토 기록입니다'}: ${plan.relation.key}`,
        ...(plan.pruned.length ? [`선언이 모두 사라진 관계의 기록 ${plan.pruned.length}개를 정리합니다: ${plan.pruned.join(', ')}`] : []),
        '',
      ].join('\n'),
      data: { relation: plan.relation.key, pruned: plan.pruned },
    }));
  }
  if (command === 'id') {
    if (!options.positional.length) {
      if (!options.kind) throw new UsageError('사용법: doltap id <파일> [--kind d|s|b] [--at <제목|줄>] [--end <줄>] [--apply] 또는 doltap id --kind d|s|b');
      if (options.at !== undefined || options.end !== undefined || options.apply) throw new UsageError('파일 없이 부르면 새 ID만 보여 줍니다. 범위를 만들려면 파일을 적으세요');
      const id = newId(inspection, options.kind);
      if (options.json) json({ schema: 'doltap.id.v1', id });
      else out(`${id}\n`);
      return 0;
    }
    expect(options, 1, 'doltap id <파일> [--kind d|s|b] [--at <제목|줄>] [--end <줄>] [--apply]');
    return write(options, 'id', planId(inspection, options.positional[0], { kind: options.kind, at: options.at, end: options.end }), (plan) => ({
      text: options.apply ? `새 ID: ${plan.id}\n` : `새 ID 예: ${plan.id} (--apply 때 새로 발급하므로 적용 결과의 ID를 쓰세요)\n`,
      data: { id: plan.id },
    }));
  }
  if (command === 'relate') {
    expect(options, 3, 'doltap relate <ID> <관계> <ID> [--apply]');
    const [from, name, to] = options.positional;
    return write(options, 'relate', planRelate(inspection, from, name, to), (plan) => ({
      text: `관계: ${plan.relation.key}\n새 관계는 검토 대기로 표시됩니다. 두 범위를 확인한 뒤 doltap review로 기록하세요.\n`,
      data: { relation: plan.relation.key },
    }));
  }
  expect(options, 2, 'doltap unrelate <ID> <ID> [--apply]');
  const [from, to] = options.positional;
  return write(options, 'unrelate', planUnrelate(inspection, from, to), (plan) => ({
    text: [
      ...(plan.removedReviews.length ? [`검토 기록도 지웁니다: ${plan.removedReviews.join(', ')}`] : []),
      ...(plan.reviewsSkipped ? ['.doltap/reviews.json을 읽을 수 없어 검토 기록은 그대로 둡니다.'] : []),
      '',
    ].join('\n'),
    data: { removedReviews: plan.removedReviews },
  }));
}

try {
  process.exitCode = run(process.argv[2], process.argv.slice(3));
} catch (error) {
  const known = error instanceof UsageError || error instanceof StaleFileError;
  process.stderr.write(`${known ? error.message : `실행하지 못했습니다: ${error.message}`}\n`);
  if (!known && process.env.DOLTAP_DEBUG) process.stderr.write(`${error.stack}\n`);
  process.exitCode = 2;
}
