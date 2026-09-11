import { existsSync, readdirSync, lstatSync, readFileSync } from 'node:fs';
import { relationsOf, RELATIONS } from './graph.mjs';
import { safePath } from './transaction.mjs';
import { relative, resolve } from 'node:path';
import { isReviewable } from './state.mjs';

function validateState(state) {
  if (state && !['active', 'archived', 'legacy', 'deleted'].includes(state)) throw new Error('모르는 상태입니다: ' + state);
}

export function mapResult(graph) {
  const nodes = [...graph.byId.values()].sort((a,b) => a.id.localeCompare(b.id));
  const edges = graph.edges.map(e => ({ id: e.id, from: e.from, to: e.to, type: e.type, review: e.review }));
  const contains = nodes.filter(n => n.parent).map(n => ({ from: n.parent, to: n.id, type: 'contains' }));
  const files = new Map();
  for (const e of edges) {
    const a = graph.byId.get(e.from), b = graph.byId.get(e.to);
    if (!a || !b || a.path === b.path) continue;
    const derived = a.kind !== 'd' || b.kind !== 'd';
    const key = `${a.path}:${e.type}:${b.path}:${derived}`;
    const aggregate = files.get(key) ?? { from: a.path, type: e.type, to: b.path, count: 0, derived };
    aggregate.count++; files.set(key, aggregate);
  }
  // Mutual dependencies remain two edges; cycles are derived, never written back.
  const cycles = [], visited = new Set(), stack = [], active = new Set(), index = new Map(), low = new Map();
  let tick=0;
  function visit(id) {
    visited.add(id);index.set(id,tick);low.set(id,tick++);stack.push(id);active.add(id);
    for(const e of edges.filter(e=>e.type==='depends-on'&&e.from===id&&graph.byId.has(e.to))) {
      if(!visited.has(e.to)){visit(e.to);low.set(id,Math.min(low.get(id),low.get(e.to)));}
      else if(active.has(e.to)) low.set(id,Math.min(low.get(id),index.get(e.to)));
    }
    if(low.get(id)===index.get(id)) {
      const component=[];let node;do{node=stack.pop();active.delete(node);component.push(node);}while(node!==id);
      if(component.length>1||edges.some(e=>e.type==='depends-on'&&e.from===id&&e.to===id))cycles.push(component.sort());
    }
  }
  for(const n of nodes)if(!visited.has(n.id))visit(n.id);
  return { schema: 'doltap.map.v1', nodes, edges, contains, fileEdges: [...files.values()], cycles };
}
export function context(graph, id, { depth = 2, budget = 4000, state, relation } = {}) {
  validateState(state);
  if(graph.duplicates.some(d=>d.id===id)) throw new Error(`중복 ID는 맥락을 고를 수 없습니다: ${id}`);
  if (!graph.byId.has(id)) throw new Error(`ID가 없습니다: ${id}`);
  if (!Number.isInteger(depth) || depth < 0 || !Number.isInteger(budget) || budget < 0) throw new Error('깊이와 예산은 0 이상의 정수입니다');
  if (relation && !RELATIONS.has(relation)) throw new Error('모르는 관계 유형');
  const nodes = [], edges = [], omitted = [], seen = new Set(), edgeSeen = new Set(), queue = [[id, 0]];
  let used = 0;
  while (queue.length) {
    const [key, level] = queue.shift();
    if (seen.has(key)) continue;
    seen.add(key);
    const n = graph.byId.get(key);
    if (!n) continue;
    if (level > depth) { omitted.push({ id: key, depth: level, reason: 'depth' }); continue; }
    if (state && n.state !== state && key !== id) continue;
    const raw = level < 2 ? n.body : '';
    const body = raw.slice(0, Math.max(0, budget - used));
    used += body.length;
    nodes.push({ ...n, depth: level, body, bodyTruncated: body.length < n.body.length });
    if (body.length < raw.length) omitted.push({ id: key, depth: level, reason: 'budget' });
    const local = graph.edges.filter(e => (e.from === key || e.to === key) && (!relation || e.type === relation));
    for (const e of local) {
      if (!edgeSeen.has(e.id)) { edges.push({ id: e.id, from: e.from, to: e.to, type: e.type, direction: e.from === key ? 'out' : 'in', displayType: e.from === key ? e.type : RELATIONS.get(e.type)?.reverse, review: e.review }); edgeSeen.add(e.id); }
      queue.push([e.from === key ? e.to : e.from, level + 1]);
    }
    if (n.parent) queue.push([n.parent, level + 1]);
    for (const child of graph.byId.values()) if (child.parent === key) queue.push([child.id, level + 1]);
  }
  return { schema: 'doltap.context.v1', root: id, depth, budget: { unit: 'chars', scope: 'body', limit: budget, used }, nodes, edges, omitted };
}
export function audit(root, result, records, scope, { budget = 8000, changed = false, includeLegacy = false, relation, state } = {}) {
  const prefix = relative(resolve(root), resolve(root, scope)).replace(/\\/g, '/');
  if (prefix) safePath(root, prefix);
  validateState(state);
  if (!Number.isInteger(budget) || budget < 0) throw new Error('예산은 0 이상의 정수입니다');
  if (relation && !RELATIONS.has(relation)) throw new Error('모르는 관계 유형');
  const inside = path => !prefix || path === prefix || path.startsWith(prefix + '/');
  const selected = n => !!n && inside(n.path) && (includeLegacy || n.state !== 'legacy') && (!state || n.state === state);
  const selectedEdge = e => (!relation || e.type === relation) && [e.from, e.to].some(id => selected(result.graph.byId.get(id)));
  const candidates = [], omitted = []; let used = 0;
  for (const n of result.graph.byId.values()) {
    if (!selected(n) || !isReviewable(n) || (changed && n.review.state === 'fresh' && n.review.judgment !== '고쳐야 함')) continue;
    if (relation && !result.graph.edges.some(e => e.type === relation && (e.from === n.id || e.to === n.id))) continue;
    const body = n.body.slice(0, Math.max(0, budget - used)); used += body.length;
    candidates.push({ id: n.id, path: n.path, title: n.title, body, review: n.review, bodyTruncated: body.length !== n.body.length, relations: relationsOf(result.graph, n.id), task: '본문의 근거·의미를 사람이 또는 호스트 AI가 검토' });
    if (body.length !== n.body.length) omitted.push(n.id);
  }
  // An explicit external audit scope is one-shot input, not registration.
  const known = new Set([...result.graph.byId.values()].map(n => n.path));
  function visit(path) {
    const full = safePath(root, path);
    if (!existsSync(full) || lstatSync(full).isSymbolicLink()) return;
    if (lstatSync(full).isDirectory()) {
      for (const name of readdirSync(full)) if (!name.startsWith('.') && !['node_modules','dist','build','coverage'].includes(name)) visit(`${path}/${name}`);
    } else if (path.endsWith('.md') && !known.has(path)) {
      const text = readFileSync(full, 'utf8'), body = text.slice(0, Math.max(0, budget-used)); used += body.length;
      candidates.push({ path, body, registered: false, bodyTruncated: body.length !== text.length, task: '일회성 감사 — ID·관계 등록 여부를 판단' });
      if (body.length !== text.length) omitted.push(path);
    }
  }
  if (prefix && !prefix.startsWith('.doltap') && !relation && !state) visit(prefix);
  return { schema: 'doltap.audit.v1', scope, budget: { unit: 'chars', scope: 'body', limit: budget, used }, errors: result.problems.filter(p => inside(p.where.split(':')[0])), reviewRequired: result.graph.edges.filter(e => e.review?.state === 'stale' && selectedEdge(e)), candidates, suggestions: [], ambiguous: [], decisions: records.suggestions.filter(r => selectedEdge({ from: r[2], to: r[4], type: r[3] })), omitted };
}
export function formatQuery(result) {
  if(result.schema==='doltap.map.v1') return result.nodes.map(n=>`${n.id} [${n.state}] ${n.path}:${n.startLine} ${n.title}`).join('\n')+'\n\n'+result.edges.map(e=>`${e.from} --${e.type}--> ${e.to}`).join('\n')+'\n';
  if(result.schema==='doltap.context.v1') return result.nodes.map(n=>`${n.title} (${n.id})\n${n.path}:${n.startLine} [${n.state}] 깊이 ${n.depth}\n${n.body}${n.bodyTruncated?'\n[본문 생략]':''}`).join('\n\n')+'\n\n관계\n'+result.edges.map(e=>`${e.from} --${e.type}--> ${e.to} [${e.review?.state}]`).join('\n')+`\n본문 ${result.budget.used}/${result.budget.limit}자; 생략 ${result.omitted.length}개\n`;
  if(result.schema==='doltap.audit.v1')return `오류 ${result.errors.length}개\n`+result.errors.map(p=>`${p.where}: ${p.message}`).join('\n')+`\n재검토 필요 ${result.reviewRequired.length}개\n`+result.reviewRequired.map(e=>e.id).join('\n')+`\n호스트 검토 후보 ${result.candidates.length}개\n`+result.candidates.map(n=>`${n.path}${n.id?' #'+n.id:''}\n${n.body}`).join('\n\n')+`\n제안 ${result.suggestions.length}개 · 모호함 ${result.ambiguous.length}개 (CLI는 의미를 추측하지 않음)\n생략 ${result.omitted.length}개\n`;
  return JSON.stringify(result,null,2)+'\n';
}
