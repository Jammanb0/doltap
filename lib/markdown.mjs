// Markdown을 줄 단위로 읽는 도구. 전체 문법 파서가 아니라 doltap에 필요한 만큼만 본다.
// 표식·지문·골격·링크 검사가 코드 블록과 주석을 같은 기준으로 가르도록 여기 모은다.

import { posix } from 'node:path';

// 줄로 나누되 원래 줄 끝 방식과 BOM을 기억한다. 쓸 때 그대로 되돌리기 위해서다.
export function splitLines(text) {
  const bom = text.startsWith('﻿');
  const body = bom ? text.slice(1) : text;
  const crlf = (body.match(/\r\n/g) ?? []).length;
  const lf = (body.match(/\n/g) ?? []).length - crlf;
  return { lines: body.split(/\r?\n/), eol: crlf > lf ? '\r\n' : '\n', bom };
}

export function joinLines({ lines, eol = '\n', bom = false }) {
  return (bom ? '﻿' : '') + lines.join(eol);
}

const FENCE = /^(\s*)(`{3,}|~{3,})/;
const FENCE_CLOSE = /^(\s*)(`{3,}|~{3,})\s*$/;
const QUOTE = /^ {0,3}>[ ]?/;
const LIST_ITEM = /^[ \t]*([-*+]|\d{1,9}[.)])(\s|$)/;

function indentWidth(line) {
  return line.match(/^[ \t]*/)[0].replace(/\t/g, '    ').length;
}

// 인용 표시(>)를 모두 벗긴 깊이와 나머지 글. 인용문 안의 코드 블록도 코드로 보려고 쓴다.
export function quoteParts(line) {
  let depth = 0;
  let rest = line;
  for (let match = QUOTE.exec(rest); match; match = QUOTE.exec(rest)) {
    depth += 1;
    rest = rest.slice(match[0].length);
  }
  return { depth, rest };
}

// 백틱 울타리의 정보 문자열에는 백틱이 들어갈 수 없다. ```인라인``` 같은 줄은 울타리가 아니다.
function fenceOpen(text) {
  const open = FENCE.exec(text);
  if (!open) return null;
  if (open[2][0] === '`' && text.slice(open[0].length).includes('`')) return null;
  return { marker: open[2][0], length: open[2].length };
}

const LIST_MARKER = /^[ \t]*(?:[-*+]|\d{1,9}[.)])[ \t]+/;

// 인용 표시를 앞에서부터 count개만 벗긴다.
function stripQuotes(line, count) {
  let rest = line;
  for (let n = 0; n < count; n += 1) rest = rest.replace(QUOTE, '');
  return rest;
}

// 코드 블록을 여는 줄인지. 인용 표시 뒤나 "- ```js"처럼 목록 항목 기호 뒤에서 여는 울타리도 센다.
// 목록 항목 기호 뒤에서 열었으면 content는 그 항목의 내용이 시작하는 칸이다(인용 표시를 벗긴 줄 기준).
export function fenceStart(line) {
  const { depth, rest } = quoteParts(line);
  const direct = fenceOpen(rest);
  if (direct) return { ...direct, depth, content: null };
  const marker = LIST_MARKER.exec(rest);
  const inItem = marker ? fenceOpen(rest.slice(marker[0].length)) : null;
  return inItem ? { ...inItem, depth, content: marker[0].replace(/\t/g, '    ').length } : null;
}

// 줄마다 종류를 정한다: code(코드 블록), comment(doltap이 아닌 HTML 주석),
// marker(doltap 표식 주석의 줄), text, blank.
// 우선순위: 열린 doltap 주석 > 열린 HTML 주석 > 열린 코드 울타리 > 새로 시작하는 것.
// 줄 첫머리에서 시작한 주석만 블록으로 본다. 줄 중간에서 열린 주석까지 따라가면
// 그 뒤의 표식을 조용히 놓칠 수 있어서다.
export function classifyLines(lines) {
  const kinds = new Array(lines.length);
  let fence = null;
  let comment = false; // doltap이 아닌 주석
  let marker = false; // 여러 줄 doltap 시작 주석
  let listIndent = null;
  let blankBefore = true;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (marker) {
      // HTML처럼 처음 나온 -->에서 닫힌다. 주석 안에서 새 표식이 시작된 경우의 판정은
      // 파서가 한다.
      kinds[i] = 'marker';
      if (line.includes('-->')) marker = false;
      continue;
    }
    if (comment) {
      kinds[i] = 'comment';
      if (line.includes('-->')) comment = false;
      continue;
    }
    if (fence) {
      const { depth, rest } = quoteParts(line);
      // 인용문이 끝나면 그 안에서 연 코드 블록도 끝난다. 목록 항목 기호 뒤에서 연 코드 블록은
      // 항목 내용보다 덜 들여쓴 글 줄이 나오면 항목과 함께 끝난다.
      const inner = depth >= fence.depth ? stripQuotes(line, fence.depth) : null;
      const inside = inner !== null && (fence.content === null || inner.trim() === '' || indentWidth(inner) >= fence.content);
      if (inside) {
        kinds[i] = 'code';
        // 닫는 울타리는 연 울타리와 같은 인용 깊이에 있어야 한다.
        const close = depth === fence.depth ? FENCE_CLOSE.exec(rest) : null;
        if (close && close[2][0] === fence.marker && close[2].length >= fence.length) fence = null;
        continue;
      }
      // 끝난 줄은 새로 시작하는 줄로 다시 본다.
      fence = null;
    }
    const open = fenceStart(line);
    if (open) {
      fence = open;
      // 목록 항목 줄에서 연 코드 블록이면 그 항목의 들여쓰기를 기억한다. 닫은 뒤 이어지는 줄을
      // 들여쓴 코드로 잘못 보지 않게 하려는 것이다.
      if (open.content !== null && !open.depth) listIndent = indentWidth(line);
      kinds[i] = 'code';
      blankBefore = false;
      continue;
    }
    if (line.trim() === '') {
      kinds[i] = 'blank';
      blankBefore = true;
      continue;
    }
    const indent = indentWidth(line);
    if (LIST_ITEM.test(line)) listIndent = indent;
    else if (listIndent !== null && indent <= listIndent) listIndent = null;
    // 목록 안쪽으로 들여쓴 줄은 코드가 아니다. 들여쓴 코드는 문단을 끊지 못한다.
    const indentedCode = indent >= 4 && listIndent === null && (blankBefore || kinds[i - 1] === 'code');
    blankBefore = false;
    if (indentedCode) {
      kinds[i] = 'code';
      continue;
    }
    if (/^\s*<!--/.test(line)) {
      const rest = line.replace(/^\s*<!--/, '');
      if (/^\s*doltap:/i.test(rest)) {
        kinds[i] = 'marker';
        if (!/-->/.test(rest)) marker = true;
        continue;
      }
      kinds[i] = 'comment';
      if (!rest.includes('-->')) comment = true;
      continue;
    }
    kinds[i] = 'text';
  }
  return kinds;
}

// 인라인 코드 구간을 표시한다. 여는 백틱과 같은 개수로 닫히는 자리까지가 한 구간이다.
export function inlineCodeMask(line) {
  const mask = new Array(line.length).fill(false);
  let i = 0;
  while (i < line.length) {
    if (line[i] !== '`') {
      i += 1;
      continue;
    }
    let run = 0;
    while (line[i + run] === '`') run += 1;
    let j = i + run;
    let close = -1;
    while (j < line.length) {
      if (line[j] !== '`') {
        j += 1;
        continue;
      }
      let other = 0;
      while (line[j + other] === '`') other += 1;
      if (other === run) {
        close = j;
        break;
      }
      j += other;
    }
    if (close === -1) {
      i += run;
      continue;
    }
    for (let k = i; k < close + run; k += 1) mask[k] = true;
    i = close + run;
  }
  return mask;
}

// 인라인 링크·이미지와 링크 참조 정의의 대상을 찾는다. 인라인 코드 안은 예시라서 뺀다.
const INLINE_LINK = /(!?\[[^\]\n]*\])\(\s*(<[^>\n]*>|[^)\s]+)((?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*)\)/g;
const REFERENCE_DEFINITION = /^(\s{0,3}\[[^\]]+\]:\s*)(<[^>\n]*>|\S+)/;

export function findLinks(line) {
  const mask = inlineCodeMask(line);
  const links = [];
  const definition = REFERENCE_DEFINITION.exec(line);
  if (definition && !mask[definition.index]) {
    links.push({ index: definition[1].length, raw: definition[2], dest: unwrap(definition[2]) });
  }
  for (const match of line.matchAll(INLINE_LINK)) {
    if (mask[match.index]) continue;
    links.push({ index: match.index + match[0].indexOf('(') + 1, raw: match[2], dest: unwrap(match[2]) });
  }
  return links;
}

// 링크 대상을 바꾼 줄을 돌려준다. 바꾸는 함수는 unwrap한 대상을 받는다.
export function mapLinks(line, replace) {
  const mask = inlineCodeMask(line);
  let out = line;
  const definition = REFERENCE_DEFINITION.exec(line);
  if (definition && !mask[definition.index]) {
    const next = replace(unwrap(definition[2]));
    if (next !== null && next !== undefined) out = definition[1] + next + line.slice(definition[0].length);
    return out;
  }
  return line.replace(INLINE_LINK, (whole, label, dest, title, offset) => {
    if (mask[offset]) return whole;
    const next = replace(unwrap(dest));
    return next === null || next === undefined ? whole : `${label}(${next}${title})`;
  });
}

function unwrap(dest) {
  return dest.startsWith('<') && dest.endsWith('>') ? dest.slice(1, -1) : dest;
}

// 저장소 밖을 가리키는 주소인지. 스킴이 있거나 //로 시작하면 외부다.
export function isExternal(dest) {
  return /^[a-z][a-z0-9+.-]*:/i.test(dest) || dest.startsWith('//');
}

// 링크 대상을 경로와 조각으로 나누고, 로컬 경로를 루트 기준으로 푼다.
// 루트 밖으로 나가면 outside를 표시한다.
export function resolveLocal(fromPath, dest) {
  const at = dest.indexOf('#');
  const rawPath = at === -1 ? dest : dest.slice(0, at);
  const fragment = at === -1 ? null : dest.slice(at + 1);
  let path = rawPath;
  try {
    path = decodeURIComponent(rawPath);
  } catch {
    // 퍼센트 기호가 파일 이름에 그대로 있을 수 있다.
  }
  if (!path) return { path: null, fragment, outside: false };
  const joined = path.startsWith('/') ? posix.normalize(path.slice(1)) : posix.normalize(posix.join(posix.dirname(fromPath), path));
  const outside = joined === '..' || joined.startsWith('../');
  return { path: joined.replace(/\/$/, '') || '.', fragment, outside };
}
