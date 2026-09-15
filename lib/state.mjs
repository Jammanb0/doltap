import { diagnostic, related } from './diagnostics.mjs';
import { posix } from 'node:path';
import { RELATIONS, markVerbatim, parseDocument, splitTarget, idFromFragment, isExternal } from './graph.mjs';
import { digest, readText, change } from './transaction.mjs';
import { nextId, usedIds, parseRegistry, assertUniqueRegistryIds } from './ids.mjs';
import { wrap, registryDocument, insertBeforeEnd, targetLink } from './edit.mjs';
import { collectDocuments, checkGraph, ENTRY_POINTS } from './graph-check.mjs';

export const isReviewable = node => !!node && !node.deleted && node.path !== 'CLAUDE.md' && node.path !== '.doltap/ids.md' && !node.path.startsWith('.doltap/reviews/');

export function normalize(text, path = '', graph = null) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n'), verbatim = markVerbatim(lines);
  const out = []; let paragraph = '', hard = false;
  const flush = () => { if (paragraph) out.push(paragraph); paragraph = ''; };
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    if (verbatim[i]) { flush(); out.push(line); hard = true; continue; }
    if (/^\s*<a (?:name|id)="doltap-/.test(line) || /^\s*[-*+]?\s*`[a-z][a-z-]*`\s*\[/.test(line)) continue;
    if (!line.trim()) { flush(); if (out.length && out.at(-1) !== '') out.push(''); hard = false; continue; }
    const nextHard = / {2,}$|\\$/.test(line);
    const listIndent = /^[ \t]+(?:[-*+]|\d+[.)])\s/.test(line) ? line.match(/^[ \t]*/)[0].replace(/\t/g, '    ') : '';
    line = line.replace(/ {2,}$|\\$/, '').trim().replace(/[ \t]+/g, ' ');
    line = line.replace(/\[([^\]]*)\]\(([^)\s]+)\)/g, (_, label, dest) => {
      if (isExternal(dest)) return `[${label}](${dest})`;
      const { path: target, fragment } = splitTarget(dest);
      const id = idFromFragment(fragment);
      const paths = [posix.normalize(posix.join(posix.dirname(path), target || posix.basename(path))), posix.normalize(target)];
      const node = id && graph?.byId.get(id) || [...(graph?.byId.values() ?? [])].find(n => n.kind === 'd' && paths.includes(n.path));
      return `[${label}](${node?.id ?? paths[0]}${fragment ? '#' + fragment : ''})`;
    });
    const structure = /^(#{1,6}\s|[-*+]\s|\d+[.)]\s|\||>|[-*_]{3,}$)/.test(line);
    if (structure || hard) flush();
    paragraph += (paragraph ? ' ' : '') + listIndent + line;
    if (nextHard) { paragraph += '\n'; flush(); }
    hard = nextHard || structure;
  }
  flush();
  return out.join('\n').trim();
}
export function enrich(graph, documents) {
  const texts = new Map(documents.map(d => [d.path, d.text]));
  for (const node of graph.byId.values()) {
    const lines = (texts.get(node.path) ?? '@AGENTS.md').split(/\r?\n/);
    const leading = lines.slice(node.startLine, node.endLine - 1).findIndex(l => l.trim());
    node.bodyStartLine = node.startLine + 1 + Math.max(0, leading);
    node.body = node.path === 'CLAUDE.md' ? '@AGENTS.md' : lines.slice(node.startLine, node.endLine - 1).join('\n').trim();
    node.title = node.body.match(/^#{1,6}\s+(.+)$/m)?.[1] ?? posix.basename(node.path);
    node.state = node.deleted ? 'deleted' : node.path.includes('/archive/legacy/') ? 'legacy' : node.path.includes('/archive/') ? 'archived' : 'active';
    node.contentHash = digest(normalize(node.body, node.path, graph));
    node.graphHash = digest(graph.edges.filter(e => e.from === node.id).map(e => `${e.type}:${e.to}`).sort().join('\n'));
  }
  return graph;
}
export function readReviews(documents) {
  const records = { nodes: [], edges: [], suggestions: [] };
  for (const d of [...documents].sort((a, b) => a.path.localeCompare(b.path))) {
    if (!/^\.doltap\/reviews\/(?:reviewed|\d{4})\.md$/.test(d.path)) continue;
    let group;
    for (const line of d.text.split(/\r?\n/)) {
      if (line === '## 노드 검토') group = 'nodes';
      if (line === '## 관계 검토') group = 'edges';
      if (line === '## 감사 제안') group = 'suggestions';
      if (!group || !line.startsWith('|')) continue;
      const c = line.split('|').slice(1, -1).map(s => s.trim());
      if (!/^\d{4}-\d{2}-\d{2}/.test(c[0])) continue;
      records[group].push(c);
    }
  }
  return records;
}
export function edgeHashes(graph, edge) {
  const sorted = RELATIONS.get(edge.type)?.symmetric ? [edge.from, edge.to].sort() : [edge.from, edge.to];
  return sorted.map(id => graph.byId.get(id)?.contentHash.slice(0, 8));
}
export function latestReviews(rows) {
  const latest = new Map();
  for (const row of rows) {
    const previous = latest.get(row[1]);
    if (!previous || Date.parse(row[0]) >= Date.parse(previous[0])) latest.set(row[1], row);
  }
  return latest;
}
function changedReviewSides(graph, edge, last) {
  if (!last) return null;
  const meta = RELATIONS.get(edge.type);
  const endpoints = [{ id: edge.from, side: 'source' }, { id: edge.to, side: 'target' }];
  if (meta?.symmetric) endpoints.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const hashes = edgeHashes(graph, edge);
  return endpoints.filter((endpoint, i) =>
    (i === 0 ? meta?.expires !== 'to' : meta?.expires !== 'from') && last[i + 2] !== hashes[i]).map(endpoint => endpoint.side);
}
export function reviewStates(graph, records) {
  const nodes = latestReviews(records.nodes), edges = latestReviews(records.edges);
  for (const n of graph.byId.values()) {
    const last = nodes.get(n.id);
    const match = last && last[2] === n.contentHash.slice(0, 8) && last[3] === n.graphHash.slice(0, 8) ? last : null;
    n.review = { state: match ? 'fresh' : 'stale', judgment: match?.[4] ?? null };
  }
  for (const e of graph.edges) {
    const expires = RELATIONS.get(e.type)?.expires;
    const legacy = graph.byId.get(e.from)?.state === 'legacy';
    const required = !!expires && !legacy;
    const last = edges.get(e.id);
    const match = last && changedReviewSides(graph, e, last).length === 0;
    e.review = { required, state: !required ? 'none' : match ? 'fresh' : 'stale' };
  }
}
export function stateFindings(graph, documents, root) {
  const problems = [], notices = [];
  const registry = readText(root, '.doltap/ids.md') ?? '';
  const rows = parseRegistry(registry);
  const registryWhere = id => {
    const line = registry.split(/\r?\n/).findIndex(l => l.split('|')[1]?.trim() === id);
    return '.doltap/ids.md' + (line >= 0 ? ':' + (line + 1) : '');
  };
  if (readText(root, '.doltap/ids.md') === null) problems.push(diagnostic('REGISTRY_MISSING', '.doltap/ids.md', '발급 기록이 없습니다. doltap migrate로 등록하세요'));
  try { assertUniqueRegistryIds(rows); } catch (e) { problems.push(diagnostic('REGISTRY_DUPLICATE', '.doltap/ids.md', e.message)); }
  const records = readReviews(documents);
  const edgeReviews = latestReviews(records.edges);
  for (const [group, judgments] of [['nodes', ['최신임','고쳐야 함']], ['edges', ['반영함','영향 없음','재검증함']]]) {
    for (const r of records[group]) {
      if (!validReview(r, judgments)) {
        let where = '.doltap/reviews';
        for (const doc of documents.filter(d => /^\.doltap\/reviews\/(?:reviewed|\d{4})\.md$/.test(d.path))) {
          const line = doc.text.split(/\r?\n/).findIndex(l => l.startsWith('|') && JSON.stringify(l.split('|').slice(1, -1).map(s => s.trim())) === JSON.stringify(r));
          if (line >= 0) { where = `${doc.path}:${line + 1}`; break; }
        }
        problems.push(diagnostic('REVIEW_INVALID', where, `잘못된 검토 기록: ${r[1]}`));
      }
    }
  }
  for (const row of rows) {
    const node = graph.byId.get(row.id);
    if (row.state === '삭제' && node && !node.deleted) problems.push(diagnostic('DELETED_ID_REAPPEARED', `${node.path}:${node.startLine}`, `삭제 ID가 다시 나타났습니다: ${row.id}`));
    if (row.state !== '삭제' && !node) problems.push(diagnostic('REGISTERED_RANGE_MISSING', registryWhere(row.id), `발급한 범위가 사라졌습니다: ${row.id}. 이동은 doltap move-fix, 직접 삭제했다면 doltap delete-fix ${row.id} --why "삭제 이유"로 확인하세요`));
    if (!['활성','아카이브','삭제'].includes(row.state) || row.kind !== row.id.split('-')[1]) problems.push(diagnostic('REGISTRY_INVALID', registryWhere(row.id), `잘못된 발급 상태·종류: ${row.id}`));
  }
  if(readText(root, '.doltap/ids.md') !== null) for(const n of graph.byId.values()) if(n.path!=='CLAUDE.md'&&!rows.some(r=>r.id===n.id))problems.push(diagnostic('ID_UNREGISTERED', `${n.path}:${n.startLine}`, `발급 기록에 없는 ID입니다: ${n.id}`));
  for (const e of graph.edges) {
    const a = graph.byId.get(e.from), b = graph.byId.get(e.to);
    const endpoints = [a && related(a, `출발 ${e.from}`), b && related(b, `도착 ${e.to}`)].filter(Boolean);
    if (a && b && e.type === 'mirror-of' && a.state !== 'legacy' && a.contentHash !== b.contentHash) problems.push(diagnostic('MIRROR_CONTENT_MISMATCH', `${e.path}:${e.line}`, `mirror-of 내용이 다릅니다: ${e.id}`, { related: endpoints }));
    if (e.review?.state === 'stale') {
      const changed = changedReviewSides(graph, e, edgeReviews.get(e.id));
      const source = changed?.includes('source'), target = changed?.includes('target');
      const reason = changed === null ? 'unreviewed' : source && target ? 'both-changed' : source ? 'source-changed' : 'target-changed';
      const cause = changed === null ? '이 관계의 검토 기록이 없습니다'
        : `이전 검토 이후 ${source && target ? '출발·도착' : source ? '출발' : '도착'} 범위의 내용 해시가 바뀌었습니다`;
      notices.push(diagnostic('REVIEW_STALE', `${e.path}:${e.line}`, `관계 재검토 필요: ${e.id} — ${cause}`, {
        reason, related: endpoints,
        hint: `doltap context ${e.from}로 ${e.type} 관계의 두 범위를 읽고 영향 여부를 판단하세요. doltap review ${e.id} --as <판단> --why <이유> --actor <주체>로 검토 기록을 미리 확인하세요.`,
      }));
    }
  }
  return { problems, notices };
}
const HEADINGS = {
  nodes: '## 노드 검토\n\n| 시각 | 노드 ID | contentHash | graphHash | 판단 | 이유 | 주체 |\n| --- | --- | --- | --- | --- | --- | --- |',
  edges: '## 관계 검토\n\n| 시각 | 관계 ID | 출발 해시 | 도착 해시 | 판단 | 이유 | 주체 |\n| --- | --- | --- | --- | --- | --- | --- |',
  suggestions: '## 감사 제안\n\n| 시각 | 제안 ID | 출발 | 관계 | 도착 | 근거 | 판정 | 판정 이유 | 주체 |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
};
function validReview(r, judgments) {
  return r.length === 7 && Number.isFinite(Date.parse(r[0])) && /^[a-f0-9]{8}$/.test(r[2]) && /^[a-f0-9]{8}$/.test(r[3]) && judgments.includes(r[4]) && r[5]?.trim() && ['사람','에이전트'].includes(r[6]) && (r[4] !== '영향 없음' || [...r[5]].length >= 10);
}
const formatRow = cells => '| ' + cells.map(c => String(c ?? '').replace(/\|/g, '&#124;').replace(/[\r\n]+/g, ' ')).join(' | ') + ' |';
function replaceReviewRows(text, node, group, rows, remove = false) {
  text = text.replace(/\r\n/g, '\n');
  const heading = HEADINGS[group], start = text.indexOf(heading);
  if (start < 0) throw new Error(`검토 표를 먼저 고치세요: ${heading.split('\n')[0]}`);
  const body = start + heading.length, next = text.indexOf('\n## ', body);
  const end = next < 0 ? text.indexOf(`<a name="${node.id}-end"`) : next;
  if (end < body) throw new Error('손상된 검토 표는 덮어쓰지 않습니다');
  const judgments = group === 'nodes' ? ['최신임','고쳐야 함'] : ['반영함','영향 없음','재검증함'];
  for (const line of text.slice(body, end).split('\n').filter(l => l.trim())) {
    const cells = line.split('|').slice(1, -1).map(s => s.trim());
    if (!line.startsWith('|') || !validReview(cells, judgments)) throw new Error('손상된 검토 표는 덮어쓰지 않습니다');
  }
  if (remove) return text.slice(0, start) + text.slice(end);
  return text.slice(0, body) + (rows.length ? '\n' + rows.map(formatRow).join('\n') : '') + '\n\n' + text.slice(end).replace(/^\n/, '');
}
function appendRecord(root, graph, group, cells) {
  const isReview = group !== 'suggestions';
  const path = isReview ? '.doltap/reviews/reviewed.md' : `.doltap/reviews/${new Date().getUTCFullYear()}.md`;
  const rows = parseRegistry(readText(root, '.doltap/ids.md') ?? '');
  assertUniqueRegistryIds(rows);
  let text = readText(root, path), node = text && parseDocument(text, path).ranges.find(r => r.kind === 'd');
  if (text !== null && (!node || parseDocument(text, path).problems.length)) throw new Error('기존 검토 기록의 범위를 먼저 고치세요. 기록을 덮어쓰지 않습니다');
  const changes = [];
  if (!node) {
    const id = nextId('d', usedIds(rows, graph.byId.keys()));
    rows.push({ id, kind: 'd', state: '활성', path, replacedBy: null });
    node = { id };
    text = wrap(id, (isReview ? '# 현재 검토' : '# 감사 제안') + '\n\n검토는 작업 승인이나 내용의 참이라는 증명이 아닙니다.\n\n' + (isReview ? [HEADINGS.nodes, HEADINGS.edges] : [HEADINGS.suggestions]).join('\n\n'));
    const entry = [...graph.byId.values()].find(n => n.path === 'AGENTS.md' && n.kind === 'd');
    if (!entry) throw new Error('AGENTS.md 문서 ID가 필요합니다');
    changes.push(change(root, 'AGENTS.md', insertBeforeEnd(readText(root, 'AGENTS.md'), entry.id, `- \`indexes\` [${isReview ? '현재 검토' : '감사 제안'}](${targetLink('AGENTS.md', path, id)})`)));
    changes.push(change(root, '.doltap/ids.md', registryDocument(rows)));
  }
  const documents = collectDocuments(root);
  const records = readReviews(documents);
  if (isReview) {
    // Move only node/edge receipts out of the old yearly files. Suggestions stay intact.
    for (const doc of documents.filter(d => /^\.doltap\/reviews\/\d{4}\.md$/.test(d.path))) {
      const parsed = parseDocument(doc.text, doc.path), oldNode = parsed.ranges.find(r => r.kind === 'd');
      if (!oldNode || parsed.problems.length) throw new Error('기존 검토 기록의 범위를 먼저 고치세요. 기록을 덮어쓰지 않습니다');
      let after = doc.text;
      for (const kind of ['nodes','edges']) if (after.includes(HEADINGS[kind].split('\n')[0])) after = replaceReviewRows(after, oldNode, kind, [], true);
      after = after.replace(/^# 검토 기록$/m, '# 감사 제안');
      if (after !== doc.text) changes.push(change(root, doc.path, after));
    }
  }
  const heading = HEADINGS[group].split('\n')[0];
  const start = text.indexOf(heading);
  if (start < 0) throw new Error(`검토 표가 없습니다: ${heading}`);
  const next = text.indexOf('\n## ', start + heading.length);
  const end = next < 0 ? text.indexOf(`<a name="${node.id}-end"`) : next;
  // Review the planned state, including the first review-file index.
  // The receipt itself is metadata and must not feed its own fingerprint.
  let effective = graph;
  if (changes.length && typeof cells === 'function') {
    const overlay = new Map(documents.map(d => [d.path, d.text]));
    for (const c of changes) overlay.set(c.path, c.after);
    overlay.set(path, text);
    const planned = [...overlay].map(([path, text]) => ({ path, text }));
    effective = enrich(checkGraph({ root, documents: planned, entryPoints: ENTRY_POINTS }).graph, planned);
  }
  const values = typeof cells === 'function' ? cells(effective) : cells;
  if (isReview) {
    for (const kind of ['nodes','edges']) {
      const latest = latestReviews(records[kind]);
      if (kind === group) latest.set(values[1], values);
      text = replaceReviewRows(text, node, kind, [...latest.values()].sort((a,b) => a[1].localeCompare(b[1])));
    }
  } else text = text.slice(0, end).trimEnd() + '\n' + formatRow(values) + '\n\n' + text.slice(end);
  changes.push(change(root, path, text));
  return changes;
}
export function reviewPlan(root, graph, id, { judgment, why, actor, node = false } = {}) {
  const allowed = node ? ['최신임', '고쳐야 함'] : ['반영함', '영향 없음', '재검증함'];
  judgment = judgment === '영향없음' ? '영향 없음' : judgment;
  if (!allowed.includes(judgment)) throw new Error('올바른 검토 판단이 필요합니다');
  if (!why?.trim() || (judgment === '영향 없음' && [...why.trim()].length < 10)) throw new Error('구체적인 이유가 필요합니다 (영향 없음: 10글자 이상)');
  if (!['사람', '에이전트'].includes(actor)) throw new Error('--actor 사람|에이전트가 필요합니다');
  if (node) {
    const n = graph.byId.get(id);
    if (!isReviewable(n)) throw new Error('검토할 본문 노드가 필요합니다');
  } else {
    const e = graph.edges.find(e => e.id === id);
    if (!e || !e.review.required) throw new Error('상태 검토가 필요한 관계가 아닙니다');
  }
  return appendRecord(root, graph, node ? 'nodes' : 'edges', effective => {
    const n = effective.byId.get(id);
    const hashes = node ? [n.contentHash.slice(0, 8), n.graphHash.slice(0, 8)] : edgeHashes(effective, effective.edges.find(e => e.id === id));
    return [new Date().toISOString(), id, ...hashes, judgment, why.trim(), actor];
  });
}
export function suggestionPlan(root, graph, from, to, type, { evidence, judgment, why, actor }) {
  if (!graph.byId.has(from) || !graph.byId.has(to) || !RELATIONS.has(type)) throw new Error('제안의 출발·관계·대상이 필요합니다');
  if (!['반영', '기각', '보류'].includes(judgment) || !evidence?.trim() || !why?.trim() || !['사람', '에이전트'].includes(actor)) throw new Error('제안 근거·판정·이유·주체가 필요합니다');
  const id = `${from}@${graph.byId.get(from).contentHash.slice(0, 4)}:${type}:${to}`;
  if (judgment === '반영' && !(graph.outgoing.get(from) ?? []).some(e => e.to === to && e.type === type)) throw new Error('관계를 반영한 뒤 기록하세요');
  return appendRecord(root, graph, 'suggestions', [new Date().toISOString(), id, from, type, to, evidence, judgment, why, actor]);
}
