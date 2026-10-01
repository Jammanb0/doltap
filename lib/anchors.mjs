// 문서 하나에서 doltap 표식과 관계 선언을 읽는다. 형식은 docs/guide/format.md의 「범위 표식」에 있다.
// 여기서는 파일 안에서 판정되는 것만 문제로 낸다. 관계가 맞는지는 relations.mjs가 본다.

import { randomBytes } from 'node:crypto';
import { posix } from 'node:path';
import { classifyLines, inlineCodeMask, splitLines } from './markdown.mjs';

// Crockford Base32 소문자. i l o u 를 뺀다 — 1·l, 0·o를 가르고 뜻하지 않은 낱말을 줄인다.
export const ID_ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz';
export const ID_PATTERN = /^doltap-([dsb])-([0-9a-hjkmnp-tv-z]{8})$/;
// 이미 쓰인 ID를 모을 때는 느슨하게 찾는다. 겹치지 않게 하는 쪽이 안전하다.
const ID_TOKEN = /doltap-[dsb]-[0-9a-z]{8}/gi;

export const KINDS = ['d', 's', 'b'];

export function randomId(kind) {
  if (!KINDS.includes(kind)) throw new Error(`종류는 d, s, b 가운데 하나입니다: ${kind}`);
  // 8자는 40비트다. 5바이트를 32진수 여덟 자리로 쓴다.
  let value = 0n;
  for (const byte of randomBytes(5)) value = (value << 8n) | BigInt(byte);
  let out = '';
  for (let i = 0; i < 8; i += 1) {
    out = ID_ALPHABET[Number(value & 31n)] + out;
    value >>= 5n;
  }
  return `doltap-${kind}-${out}`;
}

export function freshId(kind, used) {
  for (let tries = 0; tries < 1000; tries += 1) {
    const candidate = randomId(kind);
    if (!used.has(candidate)) return candidate;
  }
  throw new Error('쓰지 않은 ID를 만들지 못했습니다');
}

export function collectIds(text, into = new Set()) {
  for (const match of text.matchAll(ID_TOKEN)) into.add(match[0].toLowerCase());
  return into;
}

function idFrom(text) {
  const match = /doltap-[dsb]-[0-9a-z]{8}/i.exec(text);
  return match ? match[0] : null;
}

export function parseDocument(text, path) {
  const { lines, eol, bom } = splitLines(text);
  const kinds = classifyLines(lines);
  const problems = [];
  const ranges = [];
  const stack = [];
  const broken = new Set();
  const closed = new Set();
  let managed = false;
  let pending = null;

  const problem = (code, line, message, extra = {}) => problems.push({ code, path, line, message, ...extra });
  const breakId = (id) => {
    if (id) broken.add(id);
  };

  const closeRange = (id, index) => {
    const top = stack.at(-1);
    if (top && top.id === id) {
      stack.pop();
      closed.add(id);
      ranges.push({ ...top, endLine: index + 1, depth: stack.length, parent: stack.at(-1)?.id ?? null });
      return;
    }
    const at = stack.findIndex((open) => open.id === id);
    if (at !== -1) {
      const inner = stack.slice(at + 1);
      problem('MARKER_CROSSED', index + 1,
        `${id}를 닫기 전에 안쪽 범위 ${inner.map((open) => open.id).join(', ')}를 먼저 닫아야 합니다`,
        { related: [{ path, line: stack[at].startLine, label: `${id} 시작` }, ...inner.map((open) => ({ path, line: open.startLine, label: `${open.id} 시작` }))] });
      stack.splice(at, 1);
      breakId(id);
      return;
    }
    if (broken.has(id)) return;
    problem('MARKER_END_WITHOUT_START', index + 1, closed.has(id) ? `${id} 범위를 이미 닫았습니다` : `${id}의 시작 표식이 없습니다`);
  };

  const startRange = (id, index, closes) => {
    const open = { id, kind: ID_PATTERN.exec(id)[1], path, startLine: index + 1, headerEndLine: index + 1, declarations: [] };
    if (closes) stack.push(open);
    else pending = { ...open, invalid: false };
  };

  // 여러 줄 시작 표식의 안쪽 줄. 관계 줄이거나 빈 줄이고, -->에서 닫힌다.
  const relationLine = (line, index) => {
    let content = line;
    const close = content.indexOf('-->');
    if (close !== -1) {
      const trailing = content.slice(close + 3);
      content = content.slice(0, close);
      if (trailing.trim()) {
        problem('MARKER_MALFORMED', index + 1, '표식 주석을 닫는 --> 뒤에는 다른 내용을 두지 않습니다');
        pending.invalid = true;
      }
    }
    if (content.trim() && !pending.invalid) {
      const match = /^\s*([A-Za-z][A-Za-z0-9_-]*)\s*:\s*(.*?)\s*$/.exec(content);
      const targets = match ? match[2].split(/[\s,]+/).filter(Boolean) : [];
      if (!match) {
        problem('MARKER_MALFORMED', index + 1, `관계 줄을 읽을 수 없습니다: ${content.trim()} — "<관계>: <ID>" 형식으로 쓰고, 시작 표식은 --> 로 닫습니다`);
        pending.invalid = true;
      } else if (!targets.length) {
        problem('MARKER_MALFORMED', index + 1, `관계 대상 ID가 없습니다: ${match[1]}`);
        pending.invalid = true;
      } else {
        pending.declarations.push({ name: match[1], targets, line: index + 1 });
      }
    }
    if (close === -1) return;
    const done = pending;
    pending = null;
    if (done.invalid) {
      breakId(done.id);
      return;
    }
    const { invalid, ...open } = done;
    stack.push({ ...open, headerEndLine: index + 1 });
  };

  const markerLine = (line, index) => {
    const match = /^\s*<!--\s*([A-Za-z]+):(.*)$/.exec(line);
    const lineNo = index + 1;
    const guessed = idFrom(line);
    if (!match) {
      problem('MARKER_MALFORMED', lineNo, '표식을 읽을 수 없습니다');
      breakId(guessed);
      return;
    }
    const [, prefix, rest] = match;
    const directive = /^[A-Za-z-]*/.exec(rest)[0];
    let body = rest.slice(directive.length);
    const close = body.indexOf('-->');
    const closes = close !== -1;
    const trailing = closes ? body.slice(close + 3) : '';
    if (closes) body = body.slice(0, close);
    const tokens = body.trim().split(/\s+/).filter(Boolean);

    // 손상된 표식도 주석이 열려 있으면 닫힐 때까지 그 안의 줄을 따로 판정하지 않는다.
    const reject = (message, id) => {
      problem('MARKER_MALFORMED', lineNo, message);
      breakId(id);
      if (!closes) pending = { id: id ?? null, invalid: true, declarations: [], startLine: lineNo };
    };

    if (prefix !== 'doltap') return reject(`표식 이름은 소문자 doltap으로 씁니다: ${prefix}:`, guessed);
    if (directive !== 'start' && directive !== 'end') return reject(`모르는 표식입니다: doltap:${directive} — start나 end를 씁니다`, guessed);
    if (trailing.trim()) return reject('표식 줄에는 표식만 둡니다. --> 뒤의 내용을 다른 줄로 옮기세요', guessed);
    const id = tokens[0];
    if (!id) return reject(`doltap:${directive} 뒤에 ID가 없습니다`, null);
    if (!ID_PATTERN.test(id)) {
      return reject(ID_PATTERN.test(id.toLowerCase())
        ? `ID는 소문자로 씁니다: ${id}`
        : `ID 형식이 아닙니다: ${id} — doltap-<d|s|b>-<8자>`, guessed ?? id);
    }
    if (directive === 'end') {
      if (!closes || tokens.length > 1) return reject('끝 표식은 한 줄에 <!-- doltap:end <ID> --> 로만 씁니다', id);
      closeRange(id, index);
      return;
    }
    if (tokens.length > 1) return reject('시작 표식 줄에는 ID만 둡니다. 관계는 다음 줄부터 씁니다', id);
    startRange(id, index, closes);
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const kind = kinds[index];
    if (kind === 'marker') {
      managed = true;
      if (pending) {
        // HTML 주석은 중첩되지 않는다. 닫히기 전에 새 주석이 시작됐다면 앞 표식을 닫지 않은 것이다.
        if (/^\s*<!--/.test(line)) {
          if (!pending.invalid) problem('MARKER_MALFORMED', pending.startLine, `시작 표식 주석이 닫히지 않았습니다${pending.id ? `: ${pending.id}` : ''} — 관계 줄 뒤에 --> 를 두세요`);
          breakId(pending.id);
          pending = null;
        } else {
          relationLine(line, index);
          continue;
        }
      }
      markerLine(line, index);
      continue;
    }
    if (kind === 'comment' && /^\s*<!--\s*doltap:/i.test(line)) {
      // HTML 주석은 중첩되지 않으므로 이 줄은 앞 주석의 일부다. 조용히 넘기지 않는다.
      managed = true;
      problem('MARKER_MALFORMED', index + 1, '다른 HTML 주석 안에 있어 표식으로 읽지 않습니다 — 앞의 주석을 먼저 --> 로 닫으세요');
      breakId(idFrom(line));
      continue;
    }
    if (kind !== 'text') continue;
    const mask = inlineCodeMask(line);
    for (const match of line.matchAll(/<!--\s*doltap:/gi)) {
      if (mask[match.index]) continue;
      managed = true;
      problem('MARKER_MALFORMED', index + 1, '표식은 줄 첫머리에 혼자 둡니다');
      breakId(idFrom(line.slice(match.index)));
      break;
    }
  }
  if (pending) {
    problem('MARKER_MALFORMED', pending.startLine ?? lines.length, `시작 표식 주석이 파일 끝까지 닫히지 않았습니다${pending.id ? `: ${pending.id}` : ''}`);
    breakId(pending.id);
  }
  for (const open of stack) {
    problem('MARKER_UNCLOSED', open.startLine, `${open.id} 범위가 닫히지 않았습니다 — <!-- doltap:end ${open.id} -->가 필요합니다`);
    breakId(open.id);
  }

  // 무효가 된 범위가 뒤에서 닫힌 범위와 겹치는 ID라면 그 범위도 믿을 수 없다.
  const valid = ranges.filter((range) => !broken.has(range.id));
  const parsed = { path, lines, eol, bom, kinds, managed, ranges: valid, broken, problems };
  // 표식이 없는 문서는 관리 대상이 아니므로 문서 범위 규칙을 적용하지 않는다.
  if (managed && !problems.length) problems.push(...structureProblems(parsed));
  for (const range of parsed.ranges) range.title = rangeTitle(parsed, range);
  return parsed;
}

// 문서 범위 규칙. 표식 오류가 있는 파일에서는 연쇄 오류를 피하려고 보지 않는다.
function structureProblems({ path, lines, kinds, ranges }) {
  const problems = [];
  const problem = (code, line, message, extra = {}) => problems.push({ code, path, line, message, ...extra });
  const documents = ranges.filter((range) => range.depth === 0 && range.kind === 'd');
  for (const range of ranges) {
    if (range.kind === 'd' && range.depth > 0) problem('ID_KIND', range.startLine, `문서 범위(d)는 최상위에만 둡니다: ${range.id} — 안쪽 범위라면 s나 b ID를 새로 받으세요`);
    if (range.kind !== 'd' && range.depth === 0) problem('ID_KIND', range.startLine, `${range.kind} 범위는 문서 범위(d) 안에 둡니다: ${range.id}`);
  }
  if (!documents.length) {
    problem('DOCUMENT_ANCHOR_MISSING', 1, '문서 전체를 감싸는 d 범위가 없습니다');
    return problems;
  }
  if (documents.length > 1) {
    problem('DOCUMENT_ANCHOR_MULTIPLE', documents[1].startLine, `문서 범위(d)가 둘 이상입니다: ${documents.map((range) => range.id).join(', ')}`,
      { related: documents.map((range) => ({ path, line: range.startLine, label: `${range.id} 시작` })) });
    return problems;
  }
  const [document] = documents;
  let frontEnd = -1;
  if (lines[0] === '---') {
    frontEnd = lines.findIndex((line, index) => index > 0 && (line === '---' || line === '...'));
  }
  for (let index = 0; index < lines.length; index += 1) {
    if (index + 1 >= document.startLine && index + 1 <= document.endLine) continue;
    if (index <= frontEnd) continue;
    if (kinds[index] === 'text' || kinds[index] === 'code') {
      problem('DOCUMENT_BODY_OUTSIDE', index + 1, `문서 범위 ${document.id} 밖에 본문이 있습니다`,
        { related: [{ path, line: document.startLine, label: `${document.id} 시작` }] });
      break;
    }
  }
  return problems;
}

// 범위 본문의 줄 번호(0부터). 시작 표식이 끝난 다음 줄부터 끝 표식 앞 줄까지다.
export function bodyIndexes(range) {
  const out = [];
  for (let index = range.headerEndLine; index <= range.endLine - 2; index += 1) out.push(index);
  return out;
}

// 표식 줄을 빈 줄로 바꾼 본문. skipComments면 doltap이 아닌 주석 줄도 비운다.
export function bodyLines(parsed, range, { skipComments = false } = {}) {
  return bodyIndexes(range).map((index) => {
    const kind = parsed.kinds[index];
    if (kind === 'marker' || (skipComments && kind === 'comment')) return { text: '', line: index + 1 };
    return { text: parsed.lines[index], line: index + 1 };
  });
}

// 목록 기호와 강조·코드 표시를 걷어 읽기 쉬운 한 줄로 만든다. 표시용이며 판정에는 쓰지 않는다.
function plain(text) {
  return text
    .replace(/^\s*(?:[-*+]|\d{1,9}[.)])\s+/, '')
    .replace(/^>\s*/, '')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__|`)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function rangeTitle(parsed, range) {
  let firstText = null;
  for (const index of bodyIndexes(range)) {
    if (parsed.kinds[index] !== 'text') continue;
    const line = parsed.lines[index];
    const heading = /^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/.exec(line);
    if (heading && heading[1]) return plain(heading[1]);
    if (firstText === null && plain(line)) firstText = plain(line);
  }
  if (firstText) return firstText.length > 60 ? `${firstText.slice(0, 59)}…` : firstText;
  return posix.basename(parsed.path);
}
