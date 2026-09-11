import { parseRegistry, assertUniqueRegistryIds } from './ids.mjs';
import { markVerbatim } from './graph.mjs';
import { change, readText } from './transaction.mjs';
import { registryDocument, insertBeforeEnd, targetLink, wrap } from './edit.mjs';

export function archiveCheck(graph, scope) {
  const problems = [];
  const inside = n => n.path === scope || n.path.startsWith(scope.replace(/\/$/, '') + '/');
  for (const n of graph.byId.values()) {
    if (!inside(n) || n.state === 'legacy') continue;
    const lines = n.body.split('\n'), mask = markVerbatim(lines);
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
