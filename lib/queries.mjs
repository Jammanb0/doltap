// 조회 결과: 전체 목록, 범위 하나의 관계, 검토할 관계. 사람용 출력은 파일·줄 위치를 먼저 보여 준다.

import { bodyLines } from './anchors.mjs';
import { pendingMessage } from './inspect.mjs';
import { relationName } from './relations.mjs';

const WHAT = {
  'same-as': '두 범위가 같은 의미와 골격을 유지하는지',
  'consistent-with': '두 내용을 함께 적용했을 때 어긋나지 않는지',
  'depends-on': '의존하는 쪽이 기준에 맞는지',
};
const STATE = { reviewed: '최신', changed: '변경 후 재검토 필요', unreviewed: '검토 기록 없음' };
// 계산 방식이 달라 비교하지 못한 기록은 내용이 바뀐 것과 구별해 보여 준다.
const METHOD_STATE = { 'method-changed': '비교 방식이 바뀌어 재검토 필요', 'method-newer': '더 새 doltap의 기록이라 비교할 수 없음' };


function summaryOf(node) {
  const counts = new Map();
  for (const declaration of node.declarations) counts.set(declaration.name, (counts.get(declaration.name) ?? 0) + declaration.targets.length);
  return [...counts].map(([name, count]) => `${name} ${count}`).join(' · ');
}

export function listResult(inspection) {
  const documents = inspection.project.documents
    .filter((document) => document.managed)
    .map((document) => ({
      path: document.path,
      archived: document.archived,
      anchors: document.ranges
        .filter((range) => inspection.nodes.get(range.id) === undefined || inspection.nodes.get(range.id).path === document.path)
        .sort((a, b) => a.startLine - b.startLine)
        .map((range) => ({
          id: range.id, kind: range.kind, title: range.title, startLine: range.startLine, endLine: range.endLine,
          depth: range.depth, parent: range.parent,
          declarations: range.declarations.map((d) => ({ name: d.name, targets: d.targets })),
        })),
    }));
  return { schema: 'doltap.list.v1', documents, summary: inspection.summary };
}

export function formatList(result) {
  const lines = [];
  for (const document of result.documents) {
    lines.push(`${document.path}${document.archived ? '  [보관]' : ''}`);
    for (const anchor of document.anchors) {
      const relations = summaryOf(anchor);
      lines.push(`  ${`${anchor.startLine}–${anchor.endLine}`.padEnd(9)} ${'  '.repeat(anchor.depth)}${anchor.id}  ${anchor.title}${relations ? `  · ${relations}` : ''}`);
    }
  }
  if (!lines.length) lines.push('관리 문서가 없습니다.');
  const { documents, anchors, relations } = result.summary;
  lines.push('', `관리 문서 ${documents}개 · 범위 ${anchors}개 · 관계 ${relations}개`);
  return `${lines.join('\n')}\n`;
}

function relationView(inspection, relation, id) {
  const otherId = relation.ends[0] === id ? relation.ends[1] : relation.ends[0];
  const other = inspection.nodes.get(otherId);
  const name = relationName(relation, id);
  const arrow = relation.kind !== 'depends-on' ? '↔' : name === 'depends-on' ? '→' : '←';
  const role = relation.kind === 'depends-on' ? (name === 'depends-on' ? '기준' : '의존하는 쪽') : null;
  const review = relation.review
    ? {
      state: relation.review.state,
      changed: relation.review.changed,
      ...(relation.review.state !== 'reviewed' ? { reason: pendingMessage(relation, inspection.nodes).reason } : {}),
      ...(relation.review.entry ? { reviewedAt: relation.review.entry.reviewedAt, by: relation.review.entry.by, note: relation.review.entry.note } : {}),
    }
    : null;
  return {
    key: relation.key, kind: relation.kind, name, arrow, role, complete: relation.complete, archived: relation.archived,
    other: { id: otherId, title: other?.title ?? null, path: other?.path ?? null, line: other?.startLine ?? null, archived: other?.archived ?? false },
    review,
    ...(relation.skeletonDifference ? { skeleton: relation.skeletonDifference.where } : {}),
  };
}

function bodyText(node) {
  return bodyLines(node.document, node).map((line) => line.text).join('\n').replace(/^\n+|\n+$/g, '');
}

export function showResult(inspection, id, { body = false } = {}) {
  const node = inspection.nodes.get(id);
  if (!node) {
    const references = [];
    for (const other of inspection.nodes.values()) {
      for (const declaration of other.declarations) {
        if (declaration.targets.includes(id)) references.push({ path: other.path, line: declaration.line, from: other.id, name: declaration.name });
      }
    }
    return { schema: 'doltap.show.v1', id, found: false, duplicate: inspection.duplicates.has(id), broken: inspection.broken.has(id), references };
  }
  const direct = inspection.relations.filter((relation) => relation.ends.includes(id));
  const directIds = new Set(direct.flatMap((relation) => relation.ends));
  const indirect = [];
  for (const relation of direct) {
    const via = relation.ends[0] === id ? relation.ends[1] : relation.ends[0];
    for (const next of inspection.relations) {
      if (!next.ends.includes(via) || next === relation) continue;
      const far = next.ends[0] === via ? next.ends[1] : next.ends[0];
      if (far === id || directIds.has(far) && far !== via) continue;
      const target = inspection.nodes.get(far);
      indirect.push({ via, kind: next.kind, name: relationName(next, via), id: far, title: target?.title ?? null, path: target?.path ?? null, line: target?.startLine ?? null });
    }
  }
  const problems = [...inspection.problems, ...inspection.notices]
    .filter((item) => item.code !== 'REVIEW_PENDING' && (item.message.includes(id) || item.related.some((r) => r.label?.includes(id))));
  return {
    schema: 'doltap.show.v1',
    id,
    found: true,
    anchor: {
      id, kind: node.kind, title: node.title, path: node.path, startLine: node.startLine, endLine: node.endLine,
      parent: node.parent, archived: node.archived, fingerprint: inspection.fingerprints.get(id),
      ...(body ? { body: bodyText(node) } : {}),
    },
    relations: direct.map((relation) => ({
      ...relationView(inspection, relation, id),
      ...(body && inspection.nodes.get(relation.ends[0] === id ? relation.ends[1] : relation.ends[0])
        ? { body: bodyText(inspection.nodes.get(relation.ends[0] === id ? relation.ends[1] : relation.ends[0])) }
        : {}),
    })),
    indirect,
    problems: problems.map((item) => ({ code: item.code, where: item.where, message: item.message })),
  };
}

function indent(text, prefix) {
  return text.split('\n').map((line) => `${prefix}${line}`).join('\n');
}

export function formatShow(result) {
  if (!result.found) {
    const lines = [result.duplicate ? `같은 ID가 여러 곳에 있습니다: ${result.id} — doltap check로 확인하세요`
      : result.broken ? `표식이 손상된 범위입니다: ${result.id} — doltap check로 확인하세요`
        : `이 ID의 범위가 없습니다: ${result.id}`];
    if (result.references.length) {
      lines.push('', '이 ID를 가리키는 선언');
      for (const ref of result.references) lines.push(`  ${ref.path}:${ref.line}  ${ref.from}의 ${ref.name}`);
    }
    return `${lines.join('\n')}\n`;
  }
  const { anchor } = result;
  const lines = [
    `${anchor.id}  ${anchor.title}${anchor.archived ? '  [보관]' : ''}`,
    `  ${anchor.path}:${anchor.startLine}–${anchor.endLine}${anchor.parent ? `  (안쪽 범위, 바깥: ${anchor.parent})` : ''}`,
  ];
  if (anchor.body !== undefined) lines.push('', indent(anchor.body || '(본문 없음)', '  │ '));
  lines.push('', result.relations.length ? `직접 관계 ${result.relations.length}개` : '직접 관계가 없습니다.');
  for (const relation of result.relations) {
    const other = relation.other;
    lines.push(`  ${relation.name} ${relation.arrow} ${other.id}  ${other.title ?? '(범위 없음)'}${relation.role ? `  (${relation.role})` : ''}${other.archived ? '  [보관]' : ''}`);
    if (other.path) lines.push(`    ${other.path}:${other.line}`);
    if (!relation.complete) lines.push('    선언: 양쪽 선언이 맞지 않습니다 — doltap check로 확인하세요');
    else if (relation.skeleton) lines.push(`    골격: ${relation.skeleton}에서 다릅니다`);
    if (relation.review) {
      const { state, reason, reviewedAt, by, note } = relation.review;
      lines.push(`    검토: ${METHOD_STATE[reason] ?? STATE[state]}${reviewedAt ? ` (마지막 ${reviewedAt.slice(0, 10)} ${by}: ${note})` : ''}`);
    }
    if (relation.body !== undefined) lines.push(indent(relation.body || '(본문 없음)', '    │ '));
  }
  if (result.indirect.length) {
    lines.push('', '간접 연결 — 직접 관계가 아니며 검토 의무가 생기지 않습니다');
    for (const item of result.indirect) lines.push(`  ${item.via} —${item.name}— ${item.id}  ${item.title ?? ''}${item.path ? `  ${item.path}:${item.line}` : ''}`);
  }
  if (result.problems.length) {
    lines.push('', '관련 검사 항목');
    for (const item of result.problems) lines.push(`  [${item.code}] ${item.where} ${item.message.split('\n')[0]}`);
  }
  return `${lines.join('\n')}\n`;
}

export function reviewListResult(inspection) {
  const pending = inspection.relations
    .filter((relation) => relation.complete && !relation.archived && relation.review.state !== 'reviewed')
    .map((relation) => {
      const { reason, text } = pendingMessage(relation, inspection.nodes);
      const ends = relation.ends.map((id) => {
        const node = inspection.nodes.get(id);
        return { id, title: node.title, path: node.path, line: node.startLine, archived: node.archived };
      });
      return {
        key: relation.key, kind: relation.kind, ends, state: relation.review.state, changed: relation.review.changed, reason, message: text,
        check: WHAT[relation.kind],
        ...(relation.skeletonDifference ? { blockedBy: `same-as 골격이 다릅니다(${relation.skeletonDifference.where})` } : {}),
        // 셸에서 |는 파이프라 human|agent를 그대로 복사하면 잘못 실행된다. 주체마다 완성된 명령을 준다.
        commands: Object.fromEntries(['human', 'agent'].map((by) => [by, `doltap review ${relation.ends[0]} ${relation.ends[1]} --note "<확인한 내용>" --by ${by} --apply`])),
      };
    })
    .sort((a, b) => (a.state === b.state ? a.key.localeCompare(b.key) : a.state === 'changed' ? -1 : 1));
  return { schema: 'doltap.review.v1', pending };
}

export function formatReviewList(result) {
  if (!result.pending.length) return '검토할 관계가 없습니다.\n';
  const lines = [`검토할 관계 ${result.pending.length}개`];
  result.pending.forEach((item, index) => {
    const [a, b] = item.ends;
    const arrow = item.kind === 'depends-on' ? '→' : '↔';
    lines.push('', `${index + 1}. ${item.kind}  ${a.id} ${a.title} (${a.path}:${a.line})`);
    lines.push(`     ${arrow} ${b.id} ${b.title} (${b.path}:${b.line})${item.kind === 'depends-on' ? '  — 기준' : ''}`);
    lines.push(`   이유: ${item.message}`);
    lines.push(`   확인: ${item.check}`);
    if (item.blockedBy) lines.push(`   먼저: ${item.blockedBy}`);
    lines.push(`   기록(사람이 확인): ${item.commands.human}`);
    lines.push(`   기록(AI가 확인):   ${item.commands.agent}`);
  });
  return `${lines.join('\n')}\n`;
}

