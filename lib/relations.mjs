// 관계 선언을 모아 관계 하나로 묶고, 양쪽 선언이 맞는지 판정한다.
// 규칙은 docs/guide/format.md의 「세 가지 관계」에 있다. 선언이 빠졌을 때 무엇이 맞는지는 추측하지 않는다.

import { ID_PATTERN } from './anchors.mjs';

export const RELATIONS = {
  'same-as': { kind: 'same-as', counterpart: 'same-as' },
  'consistent-with': { kind: 'consistent-with', counterpart: 'consistent-with' },
  'depends-on': { kind: 'depends-on', counterpart: 'depended-on-by', role: 'dependent' },
  'depended-on-by': { kind: 'depends-on', counterpart: 'depends-on', role: 'basis' },
};
export const RELATION_NAMES = Object.keys(RELATIONS);
export const KINDS = ['same-as', 'depends-on', 'consistent-with'];


// 관계의 정규형. 대칭 관계는 두 ID를 사전순으로, 의존은 의존하는 쪽을 앞에 둔다.
export function canonical(from, name, to) {
  const meta = RELATIONS[name];
  if (meta.kind === 'depends-on') {
    const dependent = meta.role === 'dependent' ? from : to;
    const basis = meta.role === 'dependent' ? to : from;
    return { kind: 'depends-on', dependent, basis, ends: [dependent, basis], key: `${dependent} depends-on ${basis}` };
  }
  const ends = [from, to].sort();
  return { kind: meta.kind, ends, key: `${ends[0]} ${meta.kind} ${ends[1]}` };
}

// 관계 c를 위해 at 범위의 시작 표식에 있어야 하는 선언 줄.
export function declarationFor(relation, at) {
  const other = relation.ends[0] === at ? relation.ends[1] : relation.ends[0];
  if (relation.kind !== 'depends-on') return `${relation.kind}: ${other}`;
  return at === relation.dependent ? `depends-on: ${other}` : `depended-on-by: ${other}`;
}

export function relationName(relation, at) {
  if (relation.kind !== 'depends-on') return relation.kind;
  return at === relation.dependent ? 'depends-on' : 'depended-on-by';
}

function distance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const saved = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = saved;
    }
  }
  return row[b.length];
}

export function unknownNameMessage(name) {
  const lower = name.toLowerCase();
  const near = RELATION_NAMES.find((known) => distance(lower.replaceAll('_', '-'), known) <= 2);
  // 무엇으로 바꿀지는 사용자가 정하므로 가까운 이름이나 고를 수 있는 관계를 안내만 한다.
  const advice = near
    ? `${near}를 뜻했다면 그렇게 고치세요`
    : `쓸 수 있는 관계는 ${RELATION_NAMES.join(', ')}입니다. 뜻에 맞는 것을 고르거나, 단순 참고라면 일반 링크로 바꾸세요`;
  return `모르는 관계입니다: ${name} — ${advice}`;
}

const at = (declaration, label) => ({ path: declaration.path, line: declaration.line, ...(label ? { label } : {}) });

// nodes: ID → 범위, skip: 표식 오류나 중복으로 판정에서 뺄 ID, archived: 보관 범위인지.
export function analyzeRelations({ nodes, skip = new Set(), archived = () => false }) {
  const findings = [];
  const add = (code, where, message, extra = {}) => findings.push({ code, where, message, ...extra });
  const valid = [];
  const declaredKeys = new Set();

  for (const node of nodes.values()) {
    for (const declaration of node.declarations) {
      const where = { path: node.path, line: declaration.line };
      // 자기 속성만 본다. constructor·toString 같은 객체 기본 속성 이름도 모르는 관계다.
      if (!Object.hasOwn(RELATIONS, declaration.name)) {
        add('RELATION_UNKNOWN', where, unknownNameMessage(declaration.name));
        continue;
      }
      for (const target of declaration.targets) {
        if (!ID_PATTERN.test(target)) {
          add('RELATION_TARGET_INVALID', where, `관계 대상이 ID 형식이 아닙니다: ${declaration.name}: ${target}`);
          continue;
        }
        if (target === node.id) {
          add('RELATION_SELF', where, `자기 자신을 대상으로 한 관계입니다: ${declaration.name}: ${target}`);
          continue;
        }
        // 대상 범위가 없거나 손상돼도 이쪽 선언이 남아 있으면 관계는 아직 선언된 것이다.
        // 검토 기록은 어느 쪽에도 선언이 남지 않았을 때만 정리한다.
        declaredKeys.add(canonical(node.id, declaration.name, target).key);
        if (skip.has(target)) continue;
        if (!nodes.has(target)) {
          add('RELATION_TARGET_MISSING', where, `${declaration.name}: ${target} — 이 ID의 범위가 없습니다`, { target });
          continue;
        }
        valid.push({ from: node.id, name: declaration.name, to: target, path: node.path, line: declaration.line });
      }
    }
  }

  const pairs = new Map();
  for (const declaration of valid) {
    const key = [declaration.from, declaration.to].sort().join(' ');
    if (!pairs.has(key)) pairs.set(key, []);
    pairs.get(key).push(declaration);
  }

  const relations = [];
  for (const [pair, declarations] of pairs) {
    const [p, q] = pair.split(' ');
    const bothArchived = archived(p) && archived(q);
    const report = bothArchived ? () => {} : add;
    const sides = new Map([[p, []], [q, []]]);
    for (const declaration of declarations) sides.get(declaration.from).push(declaration);

    let conflict = false;
    for (const [id, list] of sides) {
      const first = new Map();
      for (const declaration of list) {
        if (first.has(declaration.name)) {
          report('RELATION_DUPLICATE', at(declaration), `같은 선언을 두 번 적었습니다: ${declaration.name}: ${declaration.to}`,
            { related: [at(first.get(declaration.name), '먼저 적은 선언')] });
          continue;
        }
        first.set(declaration.name, declaration);
      }
      const unique = [...first.values()];
      sides.set(id, unique);
      if (unique.length > 1) {
        conflict = true;
        const other = id === p ? q : p;
        report('RELATION_CONFLICT', at(unique[1]),
          `${id}가 ${other}에게 관계를 둘 이상 적었습니다: ${unique.map((d) => d.name).join(', ')} — 한 쌍에는 관계 하나만 둡니다`,
          { related: unique.map((d) => at(d, `${d.name} 선언`)) });
      }
    }
    if (conflict) continue;

    const [fromP] = sides.get(p);
    const [fromQ] = sides.get(q);
    if (fromP && fromQ) {
      const left = canonical(p, fromP.name, q);
      const right = canonical(q, fromQ.name, p);
      if (left.key === right.key) {
        relations.push({ ...left, complete: true, archived: bothArchived, declarations: [fromP, fromQ] });
        continue;
      }
      const sameKind = RELATIONS[fromP.name].kind === RELATIONS[fromQ.name].kind;
      const message = !sameKind
        ? `${p}는 ${fromP.name}, ${q}는 ${fromQ.name}로 적었습니다 — 두 쪽이 같은 관계를 적어야 합니다`
        : fromP.name === 'depends-on'
          ? `두 쪽 모두 상대를 기준으로 적었습니다(depends-on) — 기준이 되는 쪽에는 depended-on-by를 적습니다`
          : `두 쪽 모두 상대가 자신에게 의존한다고 적었습니다(depended-on-by) — 의존하는 쪽에는 depends-on을 적습니다`;
      report('RELATION_MISMATCH', at(fromP), message, { related: [at(fromQ, `${q}의 선언`)] });
      relations.push({ ...left, complete: false, mismatch: true, archived: bothArchived, declarations: [fromP, fromQ] });
      continue;
    }
    const declaration = fromP ?? fromQ;
    const relation = canonical(declaration.from, declaration.name, declaration.to);
    const target = nodes.get(declaration.to);
    const expected = declarationFor(relation, declaration.to);
    report('RELATION_COUNTERPART_MISSING', at(declaration),
      `${declaration.to}에 대응 선언이 없습니다 — ${declaration.name}: ${declaration.to}의 짝은 ${expected}입니다`,
      { related: [{ path: target.path, line: target.startLine, label: `${declaration.to} 시작 표식` }], expected, target: declaration.to });
    relations.push({ ...relation, complete: false, archived: bothArchived, declarations: [declaration] });
  }
  return { relations, findings, declaredKeys };
}
