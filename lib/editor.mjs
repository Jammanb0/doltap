// 좁은 편집 보조: 범위 표식 추가, 관계 추가·해제, 검토 기록.
// 모두 변경안만 만든다. 쓰기는 writer.mjs가 한다. 명령의 동작은 docs/guide/commands.md에 있다.

import { posix } from 'node:path';
import { ID_PATTERN, KINDS, freshId, parseDocument } from './anchors.mjs';
import { FINGERPRINT_METHOD } from './fingerprint.mjs';
import { fenceStart, joinLines } from './markdown.mjs';
import { REVIEWS_PATH } from './project.mjs';
import { RELATIONS, RELATION_NAMES, canonical } from './relations.mjs';
import { checkReviews, reviewerOf, serializeReviews } from './reviews.mjs';

// 사용자가 고칠 수 있는 입력·전제 문제. CLI는 종료 코드 2로 끝낸다.
export class UsageError extends Error {}

const HEADING = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const BLOCK_START = /^\s*(?:[-*+]|\d{1,9}[.)])\s|^\s{0,3}#{1,6}\s/;

function markerProblems(document) {
  return document.problems.filter((problem) => problem.code.startsWith('MARKER_'));
}

// 쓰기 전에 변경 결과를 다시 읽는다. 편집 보조가 문서나 검토 기록을 고장 내지 않게 하는 마지막 확인이다.
// 표식 문제가 생기거나 문서 문제가 늘면 쓰지 않는다.
export function verifyChanges(inspection, changes) {
  for (const change of changes) {
    if (change.path === REVIEWS_PATH) {
      const problem = checkReviews(JSON.parse(change.after));
      if (problem) throw new UsageError(`검토 기록이 형식에 맞지 않아 쓰지 않았습니다: ${problem}`);
      continue;
    }
    const before = inspection.project.documents.find((document) => document.path === change.path);
    const after = parseDocument(change.after, change.path);
    const broken = markerProblems(after);
    if (broken.length || after.problems.length > (before?.problems.length ?? 0)) {
      const first = broken[0] ?? after.problems[0];
      throw new UsageError(`바꾼 결과를 다시 읽었더니 표식이 맞지 않아 쓰지 않았습니다: ${change.path}:${first.line} ${first.code} — ${first.message}`);
    }
  }
  return changes;
}

function requireNode(inspection, id) {
  if (!ID_PATTERN.test(id ?? '')) throw new UsageError(`ID 형식이 아닙니다: ${id ?? '(없음)'}`);
  if (inspection.duplicates.has(id)) throw new UsageError(`같은 ID가 여러 곳에 있어 어느 범위인지 정할 수 없습니다: ${id} — doltap check로 먼저 고치세요`);
  if (inspection.broken.has(id)) throw new UsageError(`표식이 손상된 범위입니다: ${id} — doltap check로 먼저 고치세요`);
  const node = inspection.nodes.get(id);
  if (!node) throw new UsageError(`이 ID의 범위가 없습니다: ${id}`);
  if (markerProblems(node.document).length) throw new UsageError(`${node.path}에 표식 문제가 있습니다. doltap check로 먼저 고치세요`);
  return node;
}

// 시작 표식을 선언 목록에서 다시 만든다. 같은 관계 이름은 한 줄로 모은다.
function renderStart(indent, id, declarations) {
  const order = [];
  const targets = new Map();
  for (const declaration of declarations) {
    if (!targets.has(declaration.name)) {
      order.push(declaration.name);
      targets.set(declaration.name, []);
    }
    for (const target of declaration.targets) if (!targets.get(declaration.name).includes(target)) targets.get(declaration.name).push(target);
  }
  const body = order.filter((name) => targets.get(name).length).map((name) => `${indent}${name}: ${targets.get(name).join(', ')}`);
  if (!body.length) return [`${indent}<!-- doltap:start ${id} -->`];
  return [`${indent}<!-- doltap:start ${id}`, ...body, `${indent}-->`];
}

// 파일별로 모아 뒤쪽 범위부터 고친다. 앞쪽 줄 번호가 밀리지 않게 하려는 것이다.
function markerChanges(edits) {
  const files = new Map();
  for (const edit of edits) {
    const { document } = edit.node;
    if (!files.has(document.path)) files.set(document.path, { document, edits: [] });
    files.get(document.path).edits.push(edit);
  }
  const changes = [];
  for (const { document, edits: list } of files.values()) {
    const lines = [...document.lines];
    for (const { node, declarations } of list.sort((a, b) => b.node.startLine - a.node.startLine)) {
      const indent = lines[node.startLine - 1].match(/^\s*/)[0];
      lines.splice(node.startLine - 1, node.headerEndLine - node.startLine + 1, ...renderStart(indent, node.id, declarations));
    }
    changes.push({ path: document.path, before: document.text, after: joinLines({ lines, eol: document.eol, bom: document.bom }) });
  }
  return changes;
}

export function planRelate(inspection, from, name, to) {
  if (!RELATION_NAMES.includes(name)) throw new UsageError(`관계는 ${RELATION_NAMES.join(', ')} 가운데 하나입니다: ${name ?? '(없음)'}`);
  if (from === to) throw new UsageError('같은 범위끼리는 관계를 맺을 수 없습니다');
  const a = requireNode(inspection, from);
  const b = requireNode(inspection, to);
  const existing = [
    ...a.declarations.filter((d) => d.targets.includes(to)).map((d) => `${from}의 ${d.name}: ${to}`),
    ...b.declarations.filter((d) => d.targets.includes(from)).map((d) => `${to}의 ${d.name}: ${from}`),
  ];
  if (existing.length) {
    throw new UsageError(`두 범위 사이에 이미 선언이 있습니다: ${existing.join(', ')}\n관계를 바꾸려면 doltap unrelate ${from} ${to} 로 해제한 뒤 다시 relate 하세요`);
  }
  const relation = canonical(from, name, to);
  const changes = markerChanges([
    { node: a, declarations: [...a.declarations, { name, targets: [to] }] },
    { node: b, declarations: [...b.declarations, { name: RELATIONS[name].counterpart, targets: [from] }] },
  ]);
  return { changes: verifyChanges(inspection, changes), relation };
}

// 한쪽 범위가 이미 지워졌어도 남은 쪽의 선언은 해제할 수 있어야 한다.
export function planUnrelate(inspection, from, to) {
  for (const id of [from, to]) if (!ID_PATTERN.test(id ?? '')) throw new UsageError(`ID 형식이 아닙니다: ${id ?? '(없음)'}`);
  if (from === to) throw new UsageError('두 ID가 같습니다');
  const edits = [];
  for (const [id, other] of [[from, to], [to, from]]) {
    if (!inspection.nodes.has(id)) continue;
    const node = requireNode(inspection, id);
    if (!node.declarations.some((d) => d.targets.includes(other))) continue;
    edits.push({ node, declarations: node.declarations.map((d) => ({ ...d, targets: d.targets.filter((t) => t !== other) })) });
  }
  if (!edits.length) throw new UsageError(`두 범위 사이에 관계 선언이 없습니다: ${from}, ${to}`);
  const changes = markerChanges(edits);
  const removedReviews = [];
  const { reviews } = inspection;
  if (reviews.exists && !reviews.problem) {
    const relations = { ...reviews.relations };
    for (const key of Object.keys(relations)) {
      const [x, , y] = key.split(' ');
      if ((x === from && y === to) || (x === to && y === from)) {
        delete relations[key];
        removedReviews.push(key);
      }
    }
    if (removedReviews.length) changes.push({ path: REVIEWS_PATH, before: reviews.text, after: serializeReviews(relations) });
  }
  return { changes: verifyChanges(inspection, changes), removedReviews, reviewsSkipped: Boolean(reviews.problem) };
}

export function planReview(inspection, first, second, { note, by } = {}) {
  if (!note?.trim()) throw new UsageError('--note에 무엇을 확인했는지 적으세요');
  const reviewer = reviewerOf(by);
  if (!reviewer) throw new UsageError('--by에는 human 또는 agent를 적습니다');
  if (first === second) throw new UsageError('두 ID가 같습니다');
  for (const id of [first, second]) requireNode(inspection, id);
  const relation = inspection.relations.find((r) => r.ends.includes(first) && r.ends.includes(second));
  if (!relation) throw new UsageError(`두 범위 사이에 관계가 없습니다: ${first}, ${second}`);
  if (!relation.complete) throw new UsageError('양쪽 선언이 맞지 않아 검토를 기록하지 않습니다. doltap check로 선언을 먼저 맞추세요');
  if (relation.skeletonDifference) {
    throw new UsageError(`same-as 골격이 다릅니다(${relation.skeletonDifference.where}). 골격을 맞추거나 관계를 다시 정한 뒤 기록하세요`);
  }
  const { reviews } = inspection;
  if (reviews.problem) throw new UsageError(`.doltap/reviews.json을 읽을 수 없어 덮어쓰지 않습니다: ${reviews.problem}`);
  const relations = { ...reviews.relations };
  relations[relation.key] = {
    fingerprints: Object.fromEntries(relation.ends.map((id) => [id, inspection.fingerprints.get(id)])),
    method: FINGERPRINT_METHOD,
    reviewedAt: new Date().toISOString(),
    by: reviewer,
    note: note.trim(),
  };
  // 표식 오류가 있으면 관계가 잠깐 사라져 보일 수 있으므로 정리하지 않는다.
  const pruned = [];
  const unstable = inspection.duplicates.size > 0 || inspection.project.documents.some((document) => markerProblems(document).length);
  if (!unstable) {
    const { excludedIds } = inspection.project;
    for (const key of Object.keys(relations)) {
      if (inspection.declaredKeys.has(key)) continue;
      // 설정으로 뺀 문서에 선언이 남아 있을 수 있으므로 그 ID가 걸린 기록은 두고 간다.
      const [x, , y] = key.split(' ');
      if (excludedIds.has(x) || excludedIds.has(y)) continue;
      delete relations[key];
      pruned.push(key);
    }
  }
  return {
    changes: verifyChanges(inspection, [{ path: REVIEWS_PATH, before: reviews.text, after: serializeReviews(relations) }]),
    relation,
    pruned,
    previous: reviews.relations[relation.key] ?? null,
  };
}

export function newId(inspection, kind) {
  if (!KINDS.includes(kind)) throw new UsageError('--kind에는 d, s, b 가운데 하나를 적습니다');
  return freshId(kind, inspection.project.usedIds);
}

function findDocument(inspection, file) {
  const root = inspection.root;
  const path = posix.normalize(String(file).replaceAll('\\', '/')).replace(/^\.\//, '');
  const relative = posix.isAbsolute(path) || /^[A-Za-z]:\//.test(path)
    ? posix.relative(root.replaceAll('\\', '/'), path)
    : path;
  const document = inspection.project.documents.find((d) => d.path === relative);
  if (document) return document;
  if (inspection.project.excluded.includes(relative)) throw new UsageError(`설정으로 뺀 문서입니다: ${relative}`);
  throw new UsageError(`프로젝트에서 읽는 Markdown 문서가 아닙니다: ${file}`);
}

function lineIndex(document, at, { heading }) {
  if (at === undefined || at === true) throw new UsageError('--at에 제목이나 줄 번호를 적습니다');
  if (/^\d+$/.test(String(at))) {
    const index = Number(at) - 1;
    if (index < 0 || index >= document.lines.length) throw new UsageError(`줄 번호가 문서 밖입니다: ${at}`);
    return index;
  }
  const matches = [];
  document.lines.forEach((line, index) => {
    if (document.kinds[index] !== 'text') return;
    const match = HEADING.exec(line);
    if (match && match[2] === String(at).trim()) matches.push(index);
  });
  if (!matches.length) throw new UsageError(`그런 제목이 없습니다: ${at}${heading ? '' : ' — 줄 번호를 적어도 됩니다'}`);
  if (matches.length > 1) throw new UsageError(`같은 제목이 여러 곳에 있습니다: ${matches.map((i) => i + 1).join(', ')}행 — --at에 줄 번호를 적으세요`);
  return matches[0];
}

function firstBodyLine(document, range) {
  for (let index = range.headerEndLine; index <= range.endLine - 2; index += 1) if (document.lines[index].trim()) return index;
  return -1;
}

function insertRange(document, id, first, last) {
  const top = document.ranges.find((range) => range.depth === 0 && range.kind === 'd');
  const f = first + 1;
  const l = last + 1;
  if (!(f > top.headerEndLine && l < top.endLine)) throw new UsageError(`문서 범위 ${top.id} 안에서만 만들 수 있습니다`);
  for (const range of document.ranges) {
    const inside = f > range.headerEndLine && l < range.endLine;
    const contains = range.startLine >= f && range.endLine <= l;
    const apart = l < range.startLine || f > range.endLine;
    if (!inside && !contains && !apart) throw new UsageError(`기존 범위 ${range.id}(${range.startLine}–${range.endLine}행)와 엇갈립니다`);
  }
  const lines = [...document.lines];
  const indent = lines[first].match(/^\s*/)[0];
  lines.splice(last + 1, 0, `${indent}<!-- doltap:end ${id} -->`);
  lines.splice(first, 0, `${indent}<!-- doltap:start ${id} -->`);
  return lines;
}

export function planId(inspection, file, { kind, at, end } = {}) {
  const document = findDocument(inspection, file);
  if (markerProblems(document).length) throw new UsageError(`${document.path}에 표식 문제가 있습니다. doltap check로 먼저 고치세요`);
  const top = document.ranges.find((range) => range.depth === 0 && range.kind === 'd');
  const chosen = kind ?? (top ? null : 'd');
  if (!chosen) throw new UsageError(`이미 문서 범위가 있습니다: ${top.id} — 안쪽 범위는 --kind s 또는 b와 --at을 주세요`);
  if (!KINDS.includes(chosen)) throw new UsageError('--kind에는 d, s, b 가운데 하나를 적습니다');
  const id = freshId(chosen, inspection.project.usedIds);
  let lines;
  if (chosen === 'd') {
    if (top) throw new UsageError(`이미 문서 범위가 있습니다: ${top.id}`);
    if (document.ranges.length) throw new UsageError('안쪽 범위만 있는 문서입니다. 문서 전체를 감싸는 표식을 직접 넣고 doltap check로 확인하세요');
    lines = [...document.lines];
    let start = 0;
    if (lines[0] === '---') {
      const close = lines.findIndex((line, index) => index > 0 && (line === '---' || line === '...'));
      if (close > 0) start = close + 1;
    }
    const body = lines.slice(start);
    while (body.length && !body[0].trim()) body.shift();
    while (body.length && !body.at(-1).trim()) body.pop();
    lines = [...lines.slice(0, start), `<!-- doltap:start ${id} -->`, '', ...body, '', `<!-- doltap:end ${id} -->`, ''];
  } else {
    if (!top) throw new UsageError('먼저 문서 범위를 만드세요: doltap id <파일>');
    const first = lineIndex(document, at, { heading: chosen === 's' });
    if (document.kinds[first] !== 'text' && !(document.kinds[first] === 'code' && fenceStart(document.lines[first]))) {
      throw new UsageError(`${first + 1}행은 범위를 시작할 수 있는 줄이 아닙니다(코드 블록 안이나 표식·주석 줄)`);
    }
    let last;
    if (chosen === 's') {
      const heading = HEADING.exec(document.lines[first]);
      if (!heading) throw new UsageError(`s 범위는 제목 줄에서 시작합니다: ${first + 1}행`);
      const existing = document.ranges.find((range) => range.kind !== 'd' && firstBodyLine(document, range) === first);
      if (existing) throw new UsageError(`이 제목에는 이미 범위가 있습니다: ${existing.id}`);
      const level = heading[1].length;
      const enclosing = document.ranges.filter((range) => range.headerEndLine < first + 1 && range.endLine > first + 1)
        .sort((a, b) => b.depth - a.depth)[0];
      last = enclosing.endLine - 2;
      for (let index = first + 1; index <= enclosing.endLine - 2; index += 1) {
        const next = document.kinds[index] === 'text' && HEADING.exec(document.lines[index]);
        if (next && next[1].length <= level) {
          last = index - 1;
          break;
        }
      }
      for (const range of document.ranges) {
        if (range.startLine - 1 > first && range.startLine - 1 <= last && range.endLine - 1 > last) last = range.startLine - 2;
      }
      while (last > first && !document.lines[last].trim()) last -= 1;
    } else {
      if (!/^\d+$/.test(String(end ?? ''))) throw new UsageError('b 범위는 --end에 끝 줄 번호를 적습니다');
      last = Number(end) - 1;
      if (last < first || last >= document.lines.length) throw new UsageError(`--end 줄이 잘못됐습니다: ${end}`);
      // 빈 줄·표식 줄 옆이거나, 목록 항목·제목이 시작되는 줄이면 블록 경계다.
      // "- ```js"처럼 목록 항목에서 코드 블록을 여는 줄도 새 블록의 시작이다.
      const opens = (index) => {
        const line = document.lines[index] ?? '';
        return (document.kinds[index] === 'text' || Boolean(fenceStart(line))) && BLOCK_START.test(line);
      };
      const boundary = (index) => index < 0 || index >= document.lines.length || !document.lines[index].trim() || document.kinds[index] === 'marker';
      if (!boundary(first - 1) && !opens(first)) throw new UsageError(`${first + 1}행은 문단이나 블록의 시작이 아닙니다. 범위는 블록 단위로 만듭니다`);
      if (!boundary(last + 1) && !opens(last + 1)) throw new UsageError(`${last + 1}행은 문단이나 블록의 끝이 아닙니다. 범위는 블록 단위로 만듭니다`);
      // 울타리 줄의 개수로는 긴 울타리 안의 짧은 울타리를 가르지 못한다. 실제 코드 줄이 범위 경계를
      // 넘어 이어지는지 본다. 이어지면 표식이 코드 안에 들어가 범위가 깨진다.
      const code = (index) => document.kinds[index] === 'code';
      if ((code(first) && code(first - 1)) || (code(last) && code(last + 1))) {
        throw new UsageError('코드 블록 가운데에서 범위를 시작하거나 끝낼 수 없습니다');
      }
    }
    lines = insertRange(document, id, first, last);
  }
  return {
    id,
    changes: verifyChanges(inspection, [{ path: document.path, before: document.text, after: joinLines({ lines, eol: document.eol, bom: document.bom }) }]),
  };
}
