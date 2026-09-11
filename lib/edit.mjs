import { posix } from 'node:path';
import { existsSync, readdirSync, lstatSync } from 'node:fs';
import { collectDocuments, checkGraph, ENTRY_POINTS } from './graph-check.mjs';
import { parseDocument, RELATIONS, markVerbatim } from './graph.mjs';
import { nextId, usedIds, parseRegistry, formatRegistry, assertUniqueRegistryIds } from './ids.mjs';
import { change, readText, safePath } from './transaction.mjs';

export const anchor = (id, role) => `<a name="${id}-${role}" id="${id}-${role}"></a>`;
export const wrap = (id, text) => `${anchor(id, 'start')}\n\n${text.trimEnd()}\n\n${anchor(id, 'end')}\n`;
export const targetLink = (from, to, id) => `${(posix.relative(posix.dirname(from), to) || posix.basename(to)).split('/').map(encodeURIComponent).join('/')}#${id}-start`;
export function snapshot(root) {
  const documents = collectDocuments(root);
  const result = checkGraph({ root, documents, entryPoints: ENTRY_POINTS });
  return { ...result, documents };
}
export function insertBeforeEnd(text, id, addition) {
  return text.replace(anchor(id, 'end'), `${addition.trimEnd()}\n\n${anchor(id, 'end')}`);
}
export function registryDocument(rows) {
  const self = rows.find(r => r.path === '.doltap/ids.md' && r.kind === 'd' && r.state !== '삭제');
  return self ? wrap(self.id, formatRegistry(rows)) : formatRegistry(rows);
}
function allocator(root, documents) {
  const rows = parseRegistry(readText(root, '.doltap/ids.md') ?? '');
  assertUniqueRegistryIds(rows);
  const live = documents.flatMap(d => parseDocument(d.text, d.path).ranges.map(r => r.id));
  const used = usedIds(rows, live);
  const allocate = (kind, path, existing) => {
    const known = rows.find(r => r.id === existing);
    if (known?.state === '삭제') throw new Error(`삭제 ID 재사용: ${existing}`);
    if (known) { known.path = path; return existing; }
    const id = existing ?? nextId(kind, used);
    used.add(id);
    rows.push({ id, kind, state: path.includes('/archive/') ? '아카이브' : '활성', path, replacedBy: null });
    return id;
  };
  return { rows, allocate };
}

// Migration only assigns document IDs; hierarchy supplies navigable indexes.
export function migratePlan(root, { legacy = readText(root, '.doltap/ids.md') === null } = {}) {
  let source = collectDocuments(root);
  const oldRoot = safePath(root, '.agents');
  const hasFiles = dir => readdirSync(dir).some(name => { const full = `${dir}/${name}`; return lstatSync(full).isDirectory() ? hasFiles(full) : true; });
  if (existsSync(oldRoot) && hasFiles(oldRoot)) {
    if (existsSync(safePath(root, '.doltap/plans'))) throw new Error('.agents와 .doltap이 함께 있습니다. 합칠 문서를 먼저 정하세요');
    const walk = path => {
      for (const name of readdirSync(safePath(root, path))) {
        const file = `${path}/${name}`, stat = lstatSync(safePath(root, file));
        if (stat.isSymbolicLink()) throw new Error(`이관 중 심볼릭 링크를 따라가지 않습니다: ${file}`);
        if (stat.isDirectory()) walk(file);
        else if (name.endsWith('.md')) source.push({ originalPath: file, path: file.replace(/^\.agents\//, '.doltap/'), text: readText(root, file) });
        else throw new Error(`자동 이관할 수 없는 파일입니다. 먼저 보존 위치를 정하세요: ${file}`);
      }
    };
    walk('.agents');
    source = source.map(d => ({...d, text: d.path.includes('/archive/') ? d.text : d.text.replaceAll('.agents/', '.doltap/')}));
  }
  const { rows, allocate } = allocator(root, source);
  const files = new Map(), moved = new Map();
  const seenIds = new Set();
  for (const doc of source) {
    const path = legacy && doc.path.startsWith('.doltap/archive/workstreams/')
      ? doc.path.replace('.doltap/archive/workstreams/', '.doltap/archive/legacy/workstreams/') : doc.path;
    const originalPath = doc.originalPath ?? doc.path;
    if (path !== originalPath && readText(root, path) !== null) throw new Error(`이관 대상이 이미 있습니다: ${path}`);
    if (path !== originalPath) moved.set(originalPath, path);
    const parsed = parseDocument(doc.text, doc.path);
    if (parsed.problems.length) throw new Error(`먼저 범위를 고치세요: ${doc.path}`);
    for (const r of parsed.ranges) { if (seenIds.has(r.id)) throw new Error(`중복 ID: ${r.id}`); seenIds.add(r.id); }
    const id = allocate('d', path, parsed.ranges.find(r => r.kind === 'd')?.id);
    for(const range of parsed.ranges.filter(r=>r.kind!=='d'))allocate(range.kind,path,range.id);
    let text = doc.text;
    if (!parsed.ranges.some(r => r.kind === 'd')) {
      const front = /^(---\r?\n[\s\S]*?\r?\n---\r?\n)/.exec(text);
      text = front ? front[0] + wrap(id, text.slice(front[0].length)) : wrap(id, text);
    }
    files.set(path, { id, text });
  }
  if (!files.has('AGENTS.md')) throw new Error('먼저 APPLY.md에 따라 운영 문서를 구성하세요');
  const registryId = allocate('d', '.doltap/ids.md', files.get('.doltap/ids.md')?.id);
  files.set('.doltap/ids.md', { id: registryId, text: '' });
  for (const [path, file] of files) {
    if (path === 'AGENTS.md') continue;
    let parent;
    if (path.startsWith('.doltap/archive/')) {
      parent = path.endsWith('/README.md') ? '.doltap/plans/history.md' : `${posix.dirname(path)}/README.md`;
    } else if (path.startsWith('.doltap/plans/workstreams/')) {
      parent = path.endsWith('/README.md') ? '.doltap/plans/current.md' : `${posix.dirname(path)}/README.md`;
    } else parent = 'AGENTS.md';
    if (!files.has(parent) || parent === path) parent = 'AGENTS.md';
    const p = files.get(parent);
    if (!parseDocument(p.text, parent).edges.some(e => e.dest.endsWith(`#${file.id}-start`))) {
      p.text = insertBeforeEnd(p.text, p.id, `- \`indexes\` [${posix.basename(path)}](${targetLink(parent, path, file.id)})`);
    }
  }
  files.get('.doltap/ids.md').text = registryDocument(rows);
  const changes = [];
  for (const [path, file] of files) {
    // Preserve historical prose; only live links and active path references move.
    if (!path.includes('/archive/legacy/')) for (const [old, fresh] of moved) file.text = file.text.split(old).join(fresh);
    changes.push(change(root, path, file.text));
  }
  for (const old of moved.keys()) changes.push(change(root, old, null));
  return changes;
}

export function idPlan(root, path, { kind = 'd', at, end } = {}) {
  const docs = collectDocuments(root), text = readText(root, path);
  if (text === null) throw new Error(`파일이 없습니다: ${path}`);
  const parsed = parseDocument(text, path);
  if (parsed.problems.length) throw new Error('범위 오류를 먼저 고치세요');
  const { rows, allocate } = allocator(root, docs);
  const lines = text.split(/\r?\n/);
  const verbatim = markVerbatim(lines);
  let start = 0, stop = lines.length;
  if (kind !== 'd') {
    if (!parsed.ranges.some(r => r.kind === 'd')) throw new Error('먼저 문서 ID를 부여하세요');
    start = /^\d+$/.test(String(at)) ? Number(at) - 1 : lines.findIndex(l => l.replace(/^#+\s*/, '') === at);
    if (start < 0 || start >= lines.length || verbatim[start]) throw new Error('코드 밖의 시작 줄 또는 제목이 필요합니다');
    if (kind === 's') {
      const heading = /^(#{1,6})\s/.exec(lines[start]);
      if (!heading) throw new Error('section은 제목에서 시작합니다');
      stop = start + 1;
      const enclosing = parsed.ranges.filter(r => r.startLine < start + 1 && r.endLine > start + 1).sort((a,b)=>b.depth-a.depth)[0];
      while (stop < lines.length && stop < (enclosing?.endLine ?? lines.length + 1) - 1 && (verbatim[stop] || !new RegExp(`^#{1,${heading[1].length}}\\s`).test(lines[stop]))) stop++;
      // An existing following section starts at its anchor, before its heading.
      const following = parsed.ranges.find(r => r.kind === 's' && r.startLine > start + 1 && r.startLine <= stop + 1 && r.endLine > stop + 1);
      if (following) stop = following.startLine - 1;
    } else if (kind === 'b') stop = Number(end);
    else throw new Error('종류는 d, s, b입니다');
    if (!Number.isInteger(stop) || stop <= start || stop > lines.length) throw new Error('block은 유효한 --end 줄이 필요합니다');
  }
  const existing = parsed.ranges.find(r => r.kind === kind && (kind === 'd' || r.startLine === start + 1 || r.startLine + lines.slice(r.startLine, r.endLine - 1).findIndex(l=>l.trim()) === start));
  const id = allocate(kind, path, existing?.id);
  let after = text;
  if (!existing) {
    if (kind === 'd') {
      const front = /^(---\r?\n[\s\S]*?\r?\n---\r?\n)/.exec(text);
      after = front ? front[0] + wrap(id, text.slice(front[0].length)) : wrap(id, text);
    } else { lines.splice(stop, 0, anchor(id, 'end')); lines.splice(start, 0, anchor(id, 'start')); after = lines.join('\n'); }
    const validation = parseDocument(after, path);
    if (validation.problems.length) throw new Error('기존 범위와 교차합니다');
  }
  return [change(root, path, after), change(root, '.doltap/ids.md', registryDocument(rows))];
}
export function linkPlan(root, from, to, type) {
  const { graph } = snapshot(root);
  if (graph.duplicates.length) throw new Error('중복 ID를 먼저 고치세요');
  const a = graph.byId.get(from);
  let b = graph.byId.get(to);
  if (!b) {
    const row = parseRegistry(readText(root, '.doltap/ids.md') ?? '').find(r => r.id === to && r.state !== '삭제');
    if (row) b = parseDocument(readText(root, row.path) ?? '', row.path).ranges.find(r => r.id === to);
  }
  if (!a || !b || a.path === 'CLAUDE.md') throw new Error('출발·대상 범위를 찾을 수 없습니다');
  if (!RELATIONS.has(type)) throw new Error(`모르는 관계: ${type}`);
  if ((graph.outgoing.get(from) ?? []).some(e => e.type === type && e.to === to)) return [];
  return [change(root, a.path, insertBeforeEnd(readText(root, a.path), from, `- \`${type}\` [${posix.basename(b.path)}](${targetLink(a.path, b.path, to)})`))];
}
export function moveFixPlan(root) {
  const { graph, documents } = snapshot(root);
  if (graph.duplicates.length) throw new Error('동일 ID가 여러 곳에 있어 복구할 수 없습니다');
  const changes = [];
  for (const doc of documents) {
    let after = doc.text;
    const parsed = parseDocument(after, doc.path);
    for (const e of [...parsed.edges, ...parsed.links]) {
      const id = e.dest.match(/#(doltap-[dsb]-[0-9a-z]{8})-start$/)?.[1];
      const node = graph.byId.get(id);
      if (!node || /^[a-z]+:/i.test(e.dest)) continue;
      const dest = targetLink(doc.path, node.path, id);
      after = after.split(`](${e.dest})`).join(`](${dest})`);
    }
    changes.push(change(root, doc.path, after));
  }
  const rows = parseRegistry(readText(root, '.doltap/ids.md') ?? '');
  assertUniqueRegistryIds(rows);
  for (const r of rows) if (graph.byId.has(r.id) && r.state !== '삭제') {
    r.path = graph.byId.get(r.id).path;
    r.state = r.path.includes('/archive/') ? '아카이브' : '활성';
  }
  if (rows.length) {
    const registry = changes.find(c => c.path === '.doltap/ids.md');
    if (registry) registry.after = registryDocument(rows);
    else changes.push(change(root, '.doltap/ids.md', registryDocument(rows)));
  }
  return changes;
}
