// 관계별 마지막 검토 기록(.doltap/reviews.json). 형식은 docs/guide/format.md의 「검토 기록」에 있다.
// 관계마다 최신 한 건만 둔다. 과거 검토를 쌓지 않는다.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FINGERPRINT_METHOD } from './fingerprint.mjs';
import { REVIEWS_PATH } from './project.mjs';

export const REVIEWERS = { human: 'human', agent: 'agent', 사람: 'human', 에이전트: 'agent' };

// 객체가 물려받은 속성(constructor 등)은 검토 주체가 아니다. 정해 둔 값만 받는다.
export function reviewerOf(by) {
  return typeof by === 'string' && Object.hasOwn(REVIEWERS, by) ? REVIEWERS[by] : null;
}
const FINGERPRINT = /^[0-9a-f]{16}$/;

function validEntry(key, entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return `${key}: 기록이 객체가 아닙니다`;
  const ids = key.split(' ').filter((_, i) => i !== 1);
  const fingerprints = entry.fingerprints;
  if (!fingerprints || typeof fingerprints !== 'object') return `${key}: fingerprints가 없습니다`;
  for (const id of ids) if (!FINGERPRINT.test(fingerprints[id] ?? '')) return `${key}: ${id}의 지문이 없거나 형식이 다릅니다`;
  if (Object.keys(fingerprints).length !== 2) return `${key}: fingerprints에는 두 범위의 지문만 둡니다`;
  if (typeof entry.reviewedAt !== 'string' || !Number.isFinite(Date.parse(entry.reviewedAt))) return `${key}: reviewedAt이 날짜가 아닙니다`;
  if (entry.by !== 'human' && entry.by !== 'agent') return `${key}: by는 human 또는 agent입니다`;
  if (typeof entry.note !== 'string' || !entry.note.trim()) return `${key}: note가 비어 있습니다`;
  // 번호가 없는 기록은 형식 오류가 아니라 방식을 알 수 없는 기록으로 보고 다시 확인하게 한다.
  if ('method' in entry && !(Number.isInteger(entry.method) && entry.method >= 1)) return `${key}: method는 1 이상의 정수입니다`;
  return null;
}

const KEY = /^doltap-[dsb]-[0-9a-z]{8} (?:same-as|depends-on|consistent-with) doltap-[dsb]-[0-9a-z]{8}$/;

export function readReviews(root) {
  const full = join(root, REVIEWS_PATH);
  if (!existsSync(full)) return { exists: false, text: null, relations: {}, problem: null };
  const text = readFileSync(full, 'utf8');
  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    return { exists: true, text, relations: {}, problem: `JSON으로 읽을 수 없습니다: ${error.message}` };
  }
  const problem = checkReviews(data);
  if (problem) return { exists: true, text, relations: {}, problem };
  return { exists: true, text, relations: data.relations, problem: null };
}

// 읽을 때와 쓰기 직전에 같은 기준으로 형식을 확인한다. 문제가 없으면 null이다.
export function checkReviews(data) {
  if (!data || typeof data !== 'object' || data.version !== 1 || !data.relations || typeof data.relations !== 'object' || Array.isArray(data.relations)) {
    return 'version 1과 relations 객체가 필요합니다';
  }
  for (const [key, entry] of Object.entries(data.relations)) {
    if (!KEY.test(key)) return `관계 키의 형식이 다릅니다: ${key}`;
    const problem = validEntry(key, entry);
    if (problem) return problem;
  }
  return null;
}

// 키를 정렬해 쓴다. 같은 내용이면 같은 글이 나와야 Git 차이가 작다.
export function serializeReviews(relations) {
  const sortObject = (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortObject(value[key])]));
  };
  return `${JSON.stringify({ version: 1, relations: sortObject(relations) }, null, 2)}\n`;
}

// current: ID → 현재 지문.
export function reviewState(relation, entry, current) {
  if (!entry) return { state: 'unreviewed', changed: [] };
  // 다른 방식으로 계산한 지문끼리는 비교하지 않는다. 같은 글이어도 값이 달라 "바뀜"으로 잘못 알리게 된다.
  if (entry.method !== FINGERPRINT_METHOD) return { state: 'changed', changed: [], method: entry.method ?? null };
  const changed = relation.ends.filter((id) => entry.fingerprints[id] !== current.get(id));
  return { state: changed.length ? 'changed' : 'reviewed', changed };
}
