import { parseRegistry, assertUniqueRegistryIds } from './ids.mjs';
import { markVerbatim, codeMask, parseDocument, idFromFragment, splitTarget, isExternal } from './graph.mjs';
import { change, readText, safePath } from './transaction.mjs';
import { discoverDocuments } from './graph-check.mjs';
import { existsSync, lstatSync, readdirSync, rmdirSync } from 'node:fs';
import { posix } from 'node:path';
import { registryDocument, insertBeforeEnd, targetLink, wrap } from './edit.mjs';

const DECISION_MARK = /^\s*(?:[-*+]\s+)?`(계속 유효|이번만)`(?:\s+(\S.*?))?\s*$/;
// 주석을 빈칸으로 가려 줄 번호와 선언 위치를 보존한다. 코드 속 주석 예시는 제외한다.
function declarationLines(body) {
  const lines = body.split('\n'), code = markVerbatim(lines);
  let comment = false;
  return lines.map((line, i) => {
    if (!comment && code[i]) return line;
    const inline = codeMask(line);
    let out = '', at = 0;
    while (at < line.length) {
      if (comment) {
        const end = line.indexOf('-->', at), stop = end < 0 ? line.length : end + 3;
        out += ' '.repeat(stop - at); at = stop;
        if (end >= 0) comment = false;
      } else {
        const start = line.indexOf('<!--', at);
        if (start < 0) { out += line.slice(at); break; }
        // 인라인 코드 안의 HTML 예시는 주석을 열지 않는다.
        const before = line.slice(at, start);
        if (inline[start]) { out += line.slice(at, start + 4); at = start + 4; continue; }
        out += before; at = start; comment = true;
      }
    }
    return out;
  });
}
// 워크스트림 decisions.md 의 결정마다 아카이브 뒤에도 따를 것인지 선언하게 한다.
function decisionProblems(node) {
  const problems = [], lines = declarationLines(node.body), mask = markVerbatim(lines);
  const base = node.bodyStartLine ?? node.startLine + 1;
  let open = null;
  const close = () => {
    if (!open) return;
    const [mark, source] = open.marks[0] ?? [];
    const message = open.marks.length !== 1 ? '결정마다 `계속 유효` 또는 `이번만`을 하나 선언하세요'
      : mark === '계속 유효' && !source ? '계속 유효한 결정에는 담당 활성 원본을 같은 줄에 적으세요' : null;
    if (message) problems.push({ where: `${node.path}:${open.line}`, message: `${message}: ${open.title}` });
    open = null;
  };
  lines.forEach((line, i) => {
    if (mask[i]) return;
    const heading = /^##\s+(.+?)\s*$/.exec(line);
    if (heading) { close(); open = { title: heading[1], line: base + i, marks: [] }; return; }
    const mark = open && DECISION_MARK.exec(line);
    if (mark) open.marks.push([mark[1], mark[2]]);
  });
  close();
  return problems;
}
export function archiveCheck(graph, scope) {
  const problems = [];
  const inside = n => n.path === scope || n.path.startsWith(scope.replace(/\/$/, '') + '/');
  for (const n of graph.byId.values()) {
    if (!inside(n) || n.state === 'legacy') continue;
    if (n.kind === 'd' && posix.basename(n.path) === 'decisions.md') problems.push(...decisionProblems(n));
    const lines = declarationLines(n.body), mask = markVerbatim(lines);
    // Children own their declarations. Do not report them again at each ancestor.
    const own = lines.filter((_, i) => !mask[i] && ![...graph.byId.values()].some(c => c.parent === n.id && (n.bodyStartLine ?? n.startLine + 1) + i >= c.startLine && (n.bodyStartLine ?? n.startLine + 1) + i <= c.endLine)).join('\n');
    if (!/^\s*(?:[-*+]\s+)?`(?:전제|열린 질문)`\s+\S/m.test(own)) continue;
    const states = [...own.matchAll(/^\s*(?:[-*+]\s+)?`상태`\s+(미해결|해결|이월|폐기)(?:\s|$)/gm)];
    const state = states[0]?.[1];
    let message;
    if (states.length !== 1) message = '살아 있는 항목마다 범위를 나누고 상태 하나를 선언하세요';
    else if (state === '미해결') message = '처리하지 않은 전제·열린 질문';
    else if (state === '이월' && !(graph.incoming.get(n.id) ?? []).some(e => {
      const source = graph.byId.get(e.from); return source?.state === 'active' && !inside(source);
    })) message = '이월 항목을 가리키는 활성 외부 관계가 없습니다';
    else if (state === '폐기' && !/^\s*(?:[-*+]\s+)?`이유`\s+\S/m.test(own)) message = '폐기 이유가 없습니다';
    if (message) problems.push({ where: `${n.path}:${n.startLine}`, message: `${message}: ${n.id}` });
  }
  return problems;
}
export function deletePlan(root, graph, id, { mode, replacement, why } = {}) {
  const n = graph.byId.get(id);
  if (!n || n.deleted || n.path === 'CLAUDE.md' || n.path === '.doltap/ids.md') throw new Error('삭제할 본문 범위가 필요합니다');
  if (graph.duplicates.length) throw new Error('중복 ID를 먼저 고치세요');
  if (!['replace', 'tombstone', 'purge'].includes(mode) || !why?.trim()) throw new Error('--mode replace|tombstone|purge와 --why가 필요합니다');
  const targets = [...graph.byId.values()].filter(c => c.path === n.path && c.startLine >= n.startLine && c.endLine <= n.endLine);
  const ids = new Set(targets.map(c => c.id));
  const incoming = graph.edges.filter(e => ids.has(e.to) && !ids.has(e.from));
  const b = graph.byId.get(replacement);
  if (mode === 'replace' && (!b || b.deleted || ids.has(b.id))) throw new Error('살아 있는 대체 ID가 필요합니다');
  if (incoming.length && mode !== 'replace') throw new Error('참조 중인 범위는 삭제할 수 없습니다:\n' + incoming.map(e => `${e.path}:${e.line} ${e.id}`).join('\n'));
  if (mode === 'replace' && incoming.some(e => e.to !== id)) throw new Error('자식 ID의 참조를 각각 대체한 뒤 삭제하세요');
  const files = new Map();
  const get = path => files.has(path) ? files.get(path) : readText(root, path);
  const stub = target => wrap(target.id, `\`삭제 표식\` ${why.trim().replace(/[\r\n]+/g, ' ')}\n` + targets.filter(c=>c.parent===target.id).map(stub).join('\n'));
  const lines = get(n.path).split(/\r?\n/);
  if (n.kind === 'd') files.set(n.path, mode === 'purge' ? null : stub(n));
  else { lines.splice(n.startLine - 1, n.endLine - n.startLine + 1, ...(mode === 'purge' ? [] : [stub(n).trimEnd()])); files.set(n.path, lines.join('\n')); }
  if (mode === 'replace') {
    for (const e of incoming) {
      const existing = graph.edges.some(other=>other.from===e.from && other.type===e.type && other.to===b.id);
      const after = existing
        ? get(e.path).split(`\`${e.type}\` [${e.label}](${e.dest})`).join('').replace(/^\s*[-*+]\s*$/gm,'')
        : get(e.path).split(`](${e.dest})`).join(`](${targetLink(e.path, b.path, b.id)})`);
      files.set(e.path, after);
    }
    files.set(b.path, insertBeforeEnd(get(b.path), b.id, `- \`supersedes\` [삭제 기록](${targetLink(b.path, n.path, id)})`));
  }
  const rows = parseRegistry(readText(root, '.doltap/ids.md') ?? '');
  assertUniqueRegistryIds(rows);
  for (const target of targets) {
    let row = rows.find(r => r.id === target.id);
    if (!row) { row = { id: target.id, kind: target.kind, path: target.path }; rows.push(row); }
    row.state = '삭제'; row.replacedBy = replacement ?? null;
    row.reason = why.trim().replace(/[\r\n|]+/g, ' ');
  }
  files.set('.doltap/ids.md', registryDocument(rows));
  return [...files].map(([path, after]) => change(root, path, after));
}

export function deleteFolderPlan(root, graph, scope, { mode, why, dropLinks = false } = {}) {
  if (mode !== 'purge' || !why?.trim()) throw new Error('폴더 삭제는 --mode purge와 --why가 필요합니다');
  const path = posix.normalize(scope.replaceAll('\\', '/')).replace(/\/$/, ''), full = safePath(root, path);
  if (!existsSync(full) || !lstatSync(full).isDirectory()) throw new Error('삭제할 등록 문서 폴더가 필요합니다');
  if (graph.duplicates.length) throw new Error('중복 ID를 먼저 고치세요');
  const inside = p => p.startsWith(path + '/');
  const registry = readText(root, '.doltap/ids.md') ?? '';
  const rows = parseRegistry(registry);
  assertUniqueRegistryIds(rows);
  if (registry.split(/\r?\n/).filter(l => /^\s*\|\s*doltap-/.test(l)).length !== rows.length ||
    rows.some(r => !['활성','아카이브','삭제'].includes(r.state) || r.kind !== r.id.split('-')[1] || !r.path)) {
    throw new Error('손상된 발급 기록을 먼저 고치세요');
  }
  const documents = graph.documents.filter(d => inside(d.path) && (rows.some(r=>r.path===d.path) || d.ranges.some(n=>rows.some(r=>r.id===n.id))));
  const files = new Set(documents.map(d => d.path));
  if ([...files].some(p => ['AGENTS.md','CLAUDE.md','.doltap/ids.md'].includes(p) || p.startsWith('.doltap/reviews/'))) throw new Error('관리 메타데이터를 포함한 폴더는 묶음 삭제하지 않습니다');
  if (documents.some(d => d.problems.length || d.ranges.filter(n=>n.kind==='d').length !== 1)) throw new Error('대상 문서의 ID 범위를 먼저 고치세요');
  if (!files.size) throw new Error('이 폴더에 등록된 문서가 없습니다');
  const targets = [...graph.byId.values()].filter(n => files.has(n.path)), ids = new Set(targets.map(n => n.id));
  if (rows.some(r => inside(r.path) && r.state !== '삭제' && !ids.has(r.id))) throw new Error('사라진 발급 범위를 delete-fix로 먼저 정리하세요');
  if (targets.some(n => !rows.some(r => r.id === n.id))) throw new Error('발급 기록에 없는 범위를 먼저 등록하세요');
  const changes = [], references = [];
  for (const doc of graph.documents.filter(d => !files.has(d.path))) {
    const remove = new Set(), text = readText(root, doc.path), lines = text.split(/\r?\n/);
    for (const link of doc.links) {
      if (isExternal(link.dest)) continue;
      const target = splitTarget(link.dest);
      if (ids.has(idFromFragment(target.fragment)) || [posix.normalize(posix.join(posix.dirname(doc.path), target.path)), posix.normalize(target.path)].some(p=>files.has(p))) throw new Error(`일반 링크는 직접 정리하세요: ${doc.path}:${link.line} ${link.dest}`);
    }
    for (const edge of doc.edges) {
      if (isExternal(edge.dest) || !ids.has(idFromFragment(splitTarget(edge.dest).fragment))) continue;
      references.push(`${doc.path}:${edge.line} ${edge.type} ${edge.dest}`);
      const own = lines[edge.line - 1].trim().replace(/^[-*+]\s+/, '');
      if (own !== `\`${edge.type}\` [${edge.label}](${edge.dest})`) throw new Error(`다른 본문과 섞인 관계는 직접 정리하세요: ${doc.path}:${edge.line}`);
      remove.add(edge.line - 1);
    }
    if (remove.size) {
      if (doc.problems.length) throw new Error(`참조 문서의 범위를 먼저 고치세요: ${doc.path}`);
      changes.push(change(root, doc.path, lines.filter((_,i)=>!remove.has(i)).join('\n')));
    }
  }
  if (references.length && !dropLinks) throw new Error('폴더 밖 참조를 확인하고 직접 고치거나 --drop-links로 제거를 명시하세요:\n' + references.join('\n'));
  for (const row of rows.filter(r=>ids.has(r.id))) { row.state='삭제';row.reason=('묶음 삭제: '+why.trim()).replace(/[\r\n|]+/g,' '); }
  for (const file of files) changes.push(change(root, file, null));
  changes.push(change(root,'.doltap/ids.md',registryDocument(rows)));
  const retained = [];
  const walk = dir => { for (const name of readdirSync(safePath(root,dir))) {
    const p=posix.join(dir,name), stat=lstatSync(posix.join(root.replaceAll('\\','/'),p));
    if (stat.isSymbolicLink()) retained.push(p);
    else if (stat.isDirectory()) walk(p);
    else if (!files.has(p)) retained.push(p);
  }};
  walk(path);
  return { changes, scope:path, retained };
}

// 파일의 트랜잭션이 성공한 뒤 빈 디렉터리만 제거한다. recover는 파일과 부모를 복원한다.
export function pruneEmptyFolders(root, scope) {
  const removed = [], notices = [];
  const walk = path => {
    try {
      const full=safePath(root,path);
      for (const name of readdirSync(full)) {
        const child=posix.join(path,name), stat=lstatSync(posix.join(full.replaceAll('\\','/'),name));
        if (stat.isDirectory() && !stat.isSymbolicLink()) walk(child);
      }
      if (!readdirSync(full).length) { rmdirSync(full);removed.push(path); }
    } catch (e) { notices.push(`빈 폴더 정리 미완료: ${path} (${e.code ?? e.message})`); }
  };
  walk(scope);
  return { removedDirectories:removed, notices };
}

export function deleteFixPlan(root, graph, scope, { why, dropLinks = false } = {}) {
  if (!scope || !why?.trim()) throw new Error('정리할 ID 또는 경로와 --why가 필요합니다');
  const registry = readText(root, '.doltap/ids.md') ?? '';
  const rows = parseRegistry(registry);
  assertUniqueRegistryIds(rows);
  if (registry.split(/\r?\n/).filter(l => /^\s*\|\s*doltap-/.test(l)).length !== rows.length ||
    rows.some(r => !['활성','아카이브','삭제'].includes(r.state) || r.kind !== r.id.split('-')[1] || !r.path)) {
    throw new Error('손상된 발급 기록을 먼저 고치세요');
  }
  if (graph.duplicates.length) throw new Error('중복 ID를 먼저 고치세요');
  const exact = rows.find(r => r.id === scope);
  const path = posix.normalize(scope.replaceAll('\\', '/'));
  if (!exact && path !== '.') safePath(root, path);
  const selected = rows.filter(r => r.state !== '삭제' && !graph.byId.has(r.id) &&
    (exact ? r.id === exact.id : path === '.' || r.path === path || r.path.startsWith(path + '/')));
  if (!selected.length) throw new Error('이 범위에 사라진 ID가 없습니다. 이동했다면 doltap move-fix를 확인하세요');
  const ids = new Set(selected.map(r => r.id));
  const documents = discoverDocuments(root).map(d => ({ ...d, parsed: parseDocument(d.text, d.path) }));
  for (const doc of documents) {
    for (const id of ids) {
      if (doc.parsed.ranges.some(n => n.id === id)) throw new Error(`ID가 살아 있습니다: ${id} (${doc.path}). doltap move-fix를 확인하세요`);
      if (doc.parsed.problems.some(p => doc.text.split(/\r?\n/)[p.line - 1]?.includes(id))) throw new Error(`삭제로 처리할 수 없는 앵커가 있습니다: ${doc.path} (${id}). 범위를 먼저 고치세요`);
    }
  }
  for (const row of selected) {
    if (row.kind === 'd' && existsSync(safePath(root, row.path))) throw new Error(`본문 파일이 남아 있습니다: ${row.path}. 문서 범위를 먼저 고치세요`);
  }
  const files = new Map(), references = [];
  const managed = new Set(graph.documents.map(d => d.path));
  const missingFiles = new Set(selected.filter(r => r.kind === 'd').map(r => r.path));
  for (const doc of documents.filter(d => managed.has(d.path))) {
    const removed = new Set(), lines = doc.text.split(/\r?\n/);
    for (const link of doc.parsed.links) {
      if (isExternal(link.dest)) continue;
      const target = splitTarget(link.dest);
      if (ids.has(idFromFragment(target.fragment)) || (target.path &&
        [posix.normalize(posix.join(posix.dirname(doc.path), target.path)), posix.normalize(target.path)].some(p => missingFiles.has(p)))) {
        throw new Error(`일반 링크는 본문을 확인해 직접 정리하세요: ${doc.path}:${link.line} ${link.dest}`);
      }
    }
    for (const edge of doc.parsed.edges) {
      if (isExternal(edge.dest) || !ids.has(idFromFragment(splitTarget(edge.dest).fragment))) continue;
      references.push(`${doc.path}:${edge.line} ${edge.type} ${edge.dest}`);
      const expected = `\`${edge.type}\` [${edge.label}](${edge.dest})`;
      const own = lines[edge.line - 1].trim().replace(/^[-*+]\s+/, '');
      if (own !== expected) throw new Error(`다른 본문과 섞인 관계는 직접 정리하세요: ${doc.path}:${edge.line}`);
      removed.add(edge.line - 1);
    }
    if (removed.size) {
      if (doc.parsed.problems.length) throw new Error(`참조 문서의 범위를 먼저 고치세요: ${doc.path}`);
      files.set(doc.path, lines.filter((_, i) => !removed.has(i)).join('\n'));
    }
  }
  if (references.length && !dropLinks) throw new Error('남은 관계를 확인하고 직접 고치거나 --drop-links로 제거를 명시하세요:\n' + references.join('\n'));
  for (const row of selected) {
    row.state = '삭제';
    row.reason = ('사후 삭제 정리: ' + why.trim()).replace(/[\r\n|]+/g, ' ');
  }
  files.set('.doltap/ids.md', registryDocument(rows));
  return [...files].map(([path, after]) => change(root, path, after));
}
