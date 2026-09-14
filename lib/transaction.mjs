// Every planned path is backed up before the first replacement. No Git required.
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { acquire, release, renameWithRetry } from './ids.mjs';

export const digest = text => text === null ? null : createHash('sha256').update(text).digest('hex');
export function safePath(root, path) {
  const full = resolve(root, path);
  const rel = relative(resolve(root), full);
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error(`프로젝트 밖 경로: ${path}`);
  let cursor = resolve(root);
  for (const part of rel.split(sep)) {
    if (['.git', 'node_modules'].includes(part)) throw new Error(`예약 경로: ${path}`);
    cursor = join(cursor, part);
    if (existsSync(cursor) && lstatSync(cursor).isSymbolicLink()) throw new Error(`심볼릭 링크 경로: ${path}`);
  }
  return full;
}
export function readText(root, path) {
  const full = safePath(root, path);
  return existsSync(full) ? readFileSync(full, 'utf8') : null;
}
export function change(root, path, after) { return { path, before: readText(root, path), after }; }
export function preview(changes) {
  return changes.filter(c => c.before !== c.after).map(c => {
    const a = (c.before ?? '').split('\n'), b = (c.after ?? '').split('\n');
    let start = 0;
    while (start < a.length && start < b.length && a[start] === b[start]) start++;
    let endA = a.length, endB = b.length;
    while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB--; }
    return `--- ${c.path}\n+++ ${c.path}\n@@ ${start + 1} @@\n` + a.slice(start, endA).map(l => `-${l}`).join('\n') + '\n' + b.slice(start, endB).map(l => `+${l}`).join('\n');
  }).join('\n');
}
function replace(root, path, text) {
  const full = safePath(root, path);
  if (text === null) { rmSync(full, { force: true }); return; }
  mkdirSync(dirname(full), { recursive: true });
  const tmp = `${full}.${randomUUID()}.tmp`;
  try { writeFileSync(tmp, text); renameWithRetry(tmp, full); }
  finally { rmSync(tmp, { force: true }); }
}
const base = '.doltap/recovery';
export function pending(root) {
  const dir = safePath(root, base);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(id => /^[0-9a-f-]{36}$/.test(id)).filter(id => {
    const file = safePath(root, `${base}/${id}/manifest.json`);
    if (!existsSync(file)) return false; // preparation never reached a write
    return JSON.parse(readFileSync(file, 'utf8')).state === 'prepared';
  });
}
export function mutate(root, plan) {
  safePath(root, '.doltap/ids.lock');
  const lock = acquire(root, '.doltap');
  try {
    const unfinished = pending(root);
    if (unfinished.length) throw new Error(`먼저 recover가 필요합니다: ${unfinished.join(', ')}`);
    const changes = plan().filter(c => c.before !== c.after);
    return transact(root, changes);
  } finally { if (!release(lock)) throw new Error('쓰기 잠금을 풀지 못했습니다'); }
}
export function transact(root, changes, { afterReplace } = {}) {
  if (!changes.length) return { id: null, changed: 0 };
  const seen = new Set();
  for (const c of changes) {
    const full = safePath(root, c.path);
    if (seen.has(full)) throw new Error(`중복 변경 경로: ${c.path}`);
    seen.add(full);
    if (readText(root, c.path) !== c.before) throw new Error(`변경안 작성 뒤 파일이 바뀌었습니다: ${c.path}`);
  }
  const id = randomUUID(), dir = `${base}/${id}`;
  mkdirSync(safePath(root, `${dir}/files`), { recursive: true });
  writeFileSync(safePath(root, `${base}/.gitignore`), '*\n');
  const manifest = { version: 1, id, state: 'prepared', files: changes.map((c, i) => ({ path: c.path, before: digest(c.before), after: digest(c.after), backup: `files/${i}.bak` })) };
  changes.forEach((c, i) => { if (c.before !== null) writeFileSync(safePath(root, `${dir}/files/${i}.bak`), c.before); });
  replace(root, `${dir}/manifest.json`, JSON.stringify(manifest, null, 2));
  try {
    changes.forEach((c, i) => { replace(root, c.path, c.after); afterReplace?.(i); });
    manifest.state = 'success';
    replace(root, `${dir}/manifest.json`, JSON.stringify(manifest, null, 2));
  } catch (error) {
    recover(root, id, { apply: true, locked: true });
    throw error;
  }
  return { id, changed: changes.length };
}
export function recover(root, id, { apply = false, discard = false, locked = false } = {}) {
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error('잘못된 실행 ID');
  if (!locked && (apply || discard)) {
    safePath(root, '.doltap/ids.lock');
    const lock = acquire(root, '.doltap');
    try { return recover(root, id, { apply, discard, locked: true }); }
    finally { release(lock); }
  }
  const dir = `${base}/${id}`;
  const m = JSON.parse(readText(root, `${dir}/manifest.json`));
  if (m.id !== id || m.version !== 1 || !['prepared', 'success', 'rolled-back'].includes(m.state)) throw new Error('손상된 복구 기록');
  if (discard) {
    if (m.state === 'prepared') throw new Error('닫히지 않은 실행은 버릴 수 없습니다');
    rmSync(safePath(root, dir), { recursive: true });
    return { discarded: dir };
  }
  const changes = m.files.map(f => {
    if (!/^files\/\d+\.bak$/.test(f.backup)) throw new Error('잘못된 백업 경로');
    const now = readText(root, f.path), hash = digest(now);
    if (hash !== f.before && hash !== f.after) throw new Error(`복구 충돌: ${f.path}`);
    const original = f.before === null ? null : readText(root, `${dir}/${f.backup}`);
    if (digest(original) !== f.before) throw new Error(`백업 손상: ${f.path}`);
    return { path: f.path, before: now, after: original };
  }).filter(c => c.before !== c.after);
  if (apply) {
    for (const c of changes) replace(root, c.path, c.after);
    m.state = 'rolled-back';
    replace(root, `${dir}/manifest.json`, JSON.stringify(m, null, 2));
  }
  return { changes, preview: preview(changes) };
}
