// 프로젝트 전체를 읽고 판정한다. 검사·조회·편집 명령이 모두 이 결과를 쓴다.

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { bodyLines } from './anchors.mjs';
import { FINGERPRINT_METHOD, fingerprint } from './fingerprint.mjs';
import { finding, sortFindings } from './findings.mjs';
import { isExternal, resolveLocal } from './markdown.mjs';
import { linkFindings, operatingFindings } from './operating.mjs';
import { CONFIG_PATH, REVIEWS_PATH, loadProject } from './project.mjs';
import { analyzeRelations } from './relations.mjs';
import { readReviews, reviewState } from './reviews.mjs';
import { compareSkeletons, skeleton, summarize } from './skeleton.mjs';

const KIND_LABEL = { 'same-as': '동일', 'depends-on': '의존', 'consistent-with': '정합성' };

// 지문에서 로컬 링크를 정규화한다. 파일을 옮기고 경로만 고치면 지문이 원래대로 돌아와야 한다.
function linkResolver(root, documentIds, path) {
  return (dest) => {
    if (!dest || isExternal(dest) || dest.startsWith('#')) return null;
    const target = resolveLocal(path, dest);
    if (!target.path) return null;
    const fragment = target.fragment === null ? '' : `#${target.fragment}`;
    const id = documentIds.get(target.path);
    if (id) return `doltap:${id}${fragment}`;
    if (!target.outside && existsSync(join(root, target.path))) return `/${target.path}${fragment}`;
    return null;
  };
}

export function pendingMessage(relation, nodes) {
  const [a, b] = relation.ends;
  const head = relation.kind === 'depends-on' ? `depends-on ${a} → ${b}` : `${relation.kind} ${a} ↔ ${b}`;
  const { state, changed, method } = relation.review;
  if (state === 'unreviewed') return { head, reason: 'unreviewed', text: '검토 기록이 없습니다(새 관계)' };
  if (method !== undefined) {
    if (method !== null && method > FINGERPRINT_METHOD) {
      return { head, reason: 'method-newer', text: '더 새 doltap이 남긴 검토 기록이라 지금 버전으로는 비교할 수 없습니다. doltap을 새로 받은 뒤 다시 검사하세요' };
    }
    return { head, reason: 'method-changed', text: '검토 기록을 남긴 뒤 doltap의 비교 방식이 바뀌어, 그동안 내용이 바뀌었는지 판단할 수 없습니다. 두 범위를 다시 확인하고 검토를 기록하세요' };
  }
  const both = changed.length === 2;
  if (relation.kind === 'depends-on') {
    if (both) return { head, reason: 'both-changed', text: `지난 검토 뒤 의존하는 쪽과 기준(${b})이 모두 바뀌었습니다. 의존하는 쪽이 새 기준에 맞는지 확인하세요` };
    if (changed[0] === relation.basis) return { head, reason: 'basis-changed', text: `지난 검토 뒤 기준(${b})이 바뀌었습니다. 의존하는 쪽(${a})이 새 기준에 맞는지 확인하세요` };
    return { head, reason: 'dependent-changed', text: `지난 검토 뒤 의존하는 쪽(${a})이 바뀌었습니다. 바뀐 내용이 기준(${b})에 맞는지 확인하세요. 기준을 이쪽에 맞추라는 뜻이 아닙니다` };
  }
  const same = relation.kind === 'same-as';
  if (both) {
    return { head, reason: 'both-changed', text: `지난 검토 뒤 양쪽이 바뀌었습니다. 두 범위가 ${same ? '여전히 같은 의미와 골격인지' : '함께 적용했을 때 어긋나지 않는지'} 확인하세요` };
  }
  const other = changed[0] === a ? b : a;
  return {
    head,
    reason: 'one-changed',
    text: `지난 검토 뒤 ${changed[0]}가 바뀌었습니다. ${other}와 ${same ? '여전히 같은 의미와 골격인지' : '함께 적용했을 때 어긋나지 않는지'} 확인하세요`,
  };
}

export function inspect(rootInput) {
  const project = loadProject(rootInput);
  const findings = [];
  const add = (code, where, message, extra) => findings.push(finding(code, where, message, extra));
  if (project.config.problem) add('CONFIG_INVALID', CONFIG_PATH, project.config.problem);

  for (const document of project.documents) {
    for (const problem of document.problems) add(problem.code, { path: problem.path, line: problem.line }, problem.message, { related: problem.related });
  }

  // 범위를 ID로 모은다. 같은 ID가 두 곳 이상이면 어느 쪽인지 정할 수 없으므로 판정에서 뺀다.
  const seen = new Map();
  const broken = new Set();
  for (const document of project.documents) {
    for (const id of document.broken) broken.add(id);
    for (const range of document.ranges) {
      const node = { ...range, archived: document.archived, document };
      if (!seen.has(range.id)) seen.set(range.id, []);
      seen.get(range.id).push(node);
    }
  }
  const nodes = new Map();
  const duplicates = new Set();
  for (const [id, list] of seen) {
    if (list.length === 1) {
      nodes.set(id, list[0]);
      continue;
    }
    duplicates.add(id);
    add('ID_DUPLICATE', { path: list[1].path, line: list[1].startLine }, `같은 ID가 ${list.length}곳에 있습니다: ${id}`,
      { related: list.map((node) => ({ path: node.path, line: node.startLine, label: `${id} 시작` })) });
  }

  const { relations, findings: relationFindings, declaredKeys } = analyzeRelations({
    nodes,
    skip: new Set([...duplicates, ...broken]),
    archived: (id) => nodes.get(id)?.archived ?? false,
  });
  for (const item of relationFindings) add(item.code, item.where, item.message, { related: item.related });

  const documentIds = new Map();
  for (const node of nodes.values()) if (node.kind === 'd' && node.depth === 0) documentIds.set(node.path, node.id);
  const fingerprints = new Map();
  for (const node of nodes.values()) {
    const lines = bodyLines(node.document, node).map((line) => line.text);
    fingerprints.set(node.id, fingerprint(lines, linkResolver(project.root, documentIds, node.path)));
  }

  for (const relation of relations) {
    if (!relation.complete || relation.kind !== 'same-as' || relation.archived) continue;
    const [left, right] = relation.ends.map((id) => nodes.get(id));
    const a = skeleton(bodyLines(left.document, left, { skipComments: true }));
    const b = skeleton(bodyLines(right.document, right, { skipComments: true }));
    relation.skeletons = [summarize(a), summarize(b)];
    const difference = compareSkeletons(a, b);
    if (!difference) continue;
    relation.skeletonDifference = difference;
    add('SAME_AS_SKELETON', { path: left.path, line: difference.a?.line ?? left.startLine },
      `same-as 골격이 다릅니다: ${difference.where} — ${left.id}는 ${difference.left}, ${right.id}는 ${difference.right}`,
      { related: [{ path: right.path, line: difference.b?.line ?? right.startLine, label: `${right.id}의 같은 자리` }] });
  }

  const reviews = readReviews(project.root);
  if (reviews.problem) add('REVIEWS_INVALID', REVIEWS_PATH, reviews.problem);
  for (const relation of relations) {
    if (!relation.complete) continue;
    relation.review = { ...reviewState(relation, reviews.relations[relation.key], fingerprints), entry: reviews.relations[relation.key] ?? null };
    if (relation.archived || relation.review.state === 'reviewed') continue;
    const { head, reason, text } = pendingMessage(relation, nodes);
    const [first, second] = relation.ends.map((id) => nodes.get(id));
    add('REVIEW_PENDING', { path: first.path, line: first.startLine }, `${KIND_LABEL[relation.kind]} 관계 검토 대기: ${head}\n${text}`, {
      reason,
      relation: relation.key,
      related: [
        { path: first.path, line: first.startLine, label: `${first.id} ${first.title}` },
        { path: second.path, line: second.startLine, label: `${second.id} ${second.title}` },
      ],
    });
  }

  findings.push(...linkFindings(project), ...operatingFindings(project));

  const problems = sortFindings(findings.filter((item) => item.severity === 'problem'));
  const notices = sortFindings(findings.filter((item) => item.severity === 'notice'));
  const complete = relations.filter((relation) => relation.complete);
  const pending = complete.filter((relation) => !relation.archived && relation.review.state !== 'reviewed');
  const summary = {
    documents: project.documents.filter((document) => document.managed).length,
    anchors: nodes.size,
    relations: complete.length,
    reviewed: complete.filter((relation) => relation.review.state === 'reviewed').length,
    pending: pending.length,
    excluded: project.excluded.length,
    nested: project.nested.length,
  };
  return { root: project.root, project, nodes, relations, fingerprints, reviews, declaredKeys, duplicates, broken, problems, notices, summary };
}

export function passedLines(summary) {
  const lines = [`관리 문서 ${summary.documents}개 · 범위 ${summary.anchors}개 · 관계 ${summary.relations}개`];
  if (summary.relations) lines.push(`검토 기록이 최신인 관계 ${summary.reviewed}개 · 검토 대기 ${summary.pending}개`);
  if (summary.excluded) lines.push(`설정으로 뺀 문서 ${summary.excluded}개`);
  if (summary.nested) lines.push(`따로 운영하는 하위 프로젝트 ${summary.nested}곳은 읽지 않았습니다`);
  return lines;
}
