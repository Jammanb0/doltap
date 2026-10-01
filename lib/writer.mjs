// 변경안을 보여 주고 파일에 쓴다. 쓰기 보호는 docs/guide/commands.md의 「쓰기와 보호」에 있다.
// 백업과 복구 자료를 두지 않는다. 대신 읽은 뒤 바뀐 파일을 덮어쓰지 않고, 중간에 멈추면
// 어디까지 썼는지 정확히 알린다.

import { randomUUID } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

export function safePath(root, path) {
  const full = resolve(root, path);
  const rel = relative(resolve(root), full);
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error(`프로젝트 밖의 경로입니다: ${path}`);
  let cursor = resolve(root);
  for (const part of rel.split(sep)) {
    if (part === '.git' || part === 'node_modules') throw new Error(`쓰지 않는 경로입니다: ${path}`);
    cursor = join(cursor, part);
    if (existsSync(cursor) && lstatSync(cursor).isSymbolicLink()) throw new Error(`심볼릭 링크를 거치는 경로에는 쓰지 않습니다: ${path}`);
  }
  return full;
}

export function readOrNull(root, path) {
  const full = safePath(root, path);
  return existsSync(full) ? readFileSync(full, 'utf8') : null;
}

// Windows는 다른 프로세스가 파일을 잠깐 열고 있어도 이름 바꾸기를 거절한다. 짧게 다시 시도한다.
const IDLE = new Int32Array(new SharedArrayBuffer(4));
function renameWithRetry(from, to) {
  for (let tries = 0; ; tries += 1) {
    try {
      renameSync(from, to);
      return;
    } catch (error) {
      const transient = error.code === 'EPERM' || error.code === 'EBUSY' || error.code === 'EACCES';
      if (!transient || tries >= 100) throw error;
      Atomics.wait(IDLE, 0, 0, 10);
    }
  }
}

function writeAtomic(full, text) {
  mkdirSync(dirname(full), { recursive: true });
  const temp = `${full}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temp, text);
    renameWithRetry(temp, full);
  } finally {
    rmSync(temp, { force: true });
  }
}

// 두 줄 배열의 차이를 바뀐 묶음별로 돌려준다. 문서 앞뒤에 표식을 넣으면 두 묶음이 된다.
function hunks(a, b) {
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start += 1;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA -= 1;
    endB -= 1;
  }
  const x = a.slice(start, endA);
  const y = b.slice(start, endB);
  if (!x.length && !y.length) return [];
  // 아주 큰 차이는 한 묶음으로 보여 준다. 공통 부분 계산의 비용을 제한하려는 것이다.
  if (x.length * y.length > 4_000_000) return [{ line: start + 1, removed: x, added: y }];
  const width = y.length + 1;
  const common = new Uint32Array((x.length + 1) * width);
  for (let i = x.length - 1; i >= 0; i -= 1) {
    for (let j = y.length - 1; j >= 0; j -= 1) {
      common[i * width + j] = x[i] === y[j] ? common[(i + 1) * width + j + 1] + 1 : Math.max(common[(i + 1) * width + j], common[i * width + j + 1]);
    }
  }
  const out = [];
  let current = null;
  const flush = () => {
    if (current) out.push(current);
    current = null;
  };
  let i = 0;
  let j = 0;
  while (i < x.length || j < y.length) {
    if (i < x.length && j < y.length && x[i] === y[j]) {
      flush();
      i += 1;
      j += 1;
      continue;
    }
    current ??= { line: start + i + 1, removed: [], added: [] };
    if (j >= y.length || (i < x.length && common[(i + 1) * width + j] >= common[i * width + j + 1])) {
      current.removed.push(x[i]);
      i += 1;
    } else {
      current.added.push(y[j]);
      j += 1;
    }
  }
  flush();
  return out;
}

// 파일별로 바뀐 줄만 보여 준다. 줄 번호는 바꾸기 전 파일 기준이다.
export function preview(changes) {
  return changes.filter((change) => change.before !== change.after).map((change) => {
    const label = change.before === null ? '(새 파일)' : change.after === null ? '(삭제)' : '';
    const lines = [`--- ${change.path} ${label}`.trimEnd(), `+++ ${change.path}`];
    for (const hunk of hunks((change.before ?? '').split(/\r?\n/), (change.after ?? '').split(/\r?\n/))) {
      lines.push(`@@ ${hunk.line}행 @@`, ...hunk.removed.map((line) => `-${line}`), ...hunk.added.map((line) => `+${line}`));
    }
    return lines.join('\n');
  }).join('\n');
}

export class StaleFileError extends Error {}

// 모든 파일이 변경안을 만들 때와 같은지 먼저 확인하고, 파일마다 쓰기 직전에 한 번 더 본다.
export function applyChanges(root, changes) {
  const real = changes.filter((change) => change.before !== change.after);
  for (const change of real) {
    if (readOrNull(root, change.path) !== change.before) {
      throw new StaleFileError(`변경안을 만든 뒤 파일이 바뀌어 아무것도 쓰지 않았습니다: ${change.path}\n다시 실행해 새 변경안을 확인하세요.`);
    }
  }
  const written = [];
  for (const change of real) {
    try {
      const full = safePath(root, change.path);
      if (readOrNull(root, change.path) !== change.before) throw new StaleFileError(`쓰기 직전에 파일이 바뀌었습니다: ${change.path}`);
      if (change.after === null) rmSync(full, { force: true });
      else writeAtomic(full, change.after);
      written.push(change.path);
    } catch (error) {
      const rest = real.slice(written.length).map((item) => item.path);
      return { written, failed: { path: change.path, message: error.message }, notWritten: rest };
    }
  }
  return { written, failed: null, notWritten: [] };
}
