// 범위 본문의 지문. 무엇이 지문에 들어가는지는 docs/guide/format.md에 있고, 경우별 동작은
// test/fingerprint.test.mjs가 고정한다.
// 줄바꿈 위치와 공백 수, doltap 표식과 관계 선언은 지문을 바꾸지 않는다.

import { createHash } from 'node:crypto';
import { classifyLines, inlineCodeMask, mapLinks, quoteParts } from './markdown.mjs';

// 지문 계산 방식의 번호. 배포한 버전의 정규화를 고쳐 같은 글에서도 지문이 달라지면 번호를 올린다.
// 1은 1.0.0에 담는 방식이다. 첫 배포 전에 고친 것은 그 방식의 일부로 보고 번호를 올리지 않는다.
// 검토 기록마다 이 번호를 남기고, 번호가 다른 기록은 내용 변경이 아니라 방식 변경으로 다시 확인하게 한다.
export const FINGERPRINT_METHOD = 1;

// 한 줄로 끝나는 요소: 제목, 표의 행, 구분선, 제목 밑줄, HTML. 다음 글 줄을 여기에 이어 붙이면
// "# Support" 다음 줄 "Node 22"가 제목 "# Support Node 22"와 같아지는 식으로 구조 변화를 놓친다.
const STANDALONE = /^(?:#{1,6}(?:\s|$)|\||[-*_](?:\s*[-*_]){2,}\s*$|<|=+\s*$|-+\s*$)/;
const LIST_ITEM = /^(?:[-*+]|\d{1,9}[.)])(?:\s|$)/;

function collapse(text) {
  // 인라인 코드 밖의 연속 공백만 줄인다.
  const mask = inlineCodeMask(text);
  let out = '';
  let space = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (!mask[i] && /\s/.test(ch)) {
      space = true;
      continue;
    }
    if (space && out) out += ' ';
    space = false;
    out += ch;
  }
  return out;
}

// lines: 표식 줄을 빈 줄로 바꾼 본문 줄. resolveLink는 로컬 링크 대상을 정규화한다.
// 화면에서 같은 문단인 줄은 한 줄로 이어 줄바꿈 위치를 무시한다. 이어 붙이는 것은 문단·목록 항목·
// 인용문 안의 글 줄뿐이고, 한 줄로 끝나는 요소 다음 줄은 새 줄로 센다.
export function normalizeBody(lines, resolveLink = null) {
  const kinds = classifyLines(lines);
  const out = [];
  // 이어 붙일 수 있는 마지막 출력 줄의 인용 깊이. 빈 줄·코드·주석·한 줄 요소 뒤에는 null이다.
  let open = null;
  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];
    if (kinds[i] === 'code') {
      out.push(raw.replace(/\r$/, ''));
      open = null;
      continue;
    }
    if (raw.trim() === '') {
      if (out.length && out.at(-1) !== '') out.push('');
      open = null;
      continue;
    }
    const linked = resolveLink ? mapLinks(raw, resolveLink) : raw;
    const lead = linked.match(/^[ \t]*/)[0];
    const indent = lead.replace(/\t/g, '    ');
    if (kinds[i] === 'comment') {
      out.push(indent + collapse(linked.slice(lead.length)));
      open = null;
      continue;
    }
    const { depth, rest } = quoteParts(linked);
    const quote = depth ? `${indent}${'>'.repeat(depth)}` : '';
    // 인용문 안에서도 > 뒤의 들여쓰기가 목록 계층을 정한다. 지우면 하위 항목과 같은 단계 항목이 같아진다.
    const innerLead = depth ? rest.match(/^[ \t]*/)[0] : '';
    const body = collapse(depth ? rest.slice(innerLead.length) : linked.slice(lead.length));
    if (!body) {
      // 인용문 안의 빈 줄은 인용문을 끝내지 않고 그 안의 문단만 나눈다.
      out.push(quote);
      open = null;
      continue;
    }
    const standalone = STANDALONE.test(body);
    const item = !standalone && LIST_ITEM.test(body);
    // 같은 인용 깊이에서 이어지는 글 줄과, 인용 표시 없이 이어지는 줄(게으른 이어 쓰기)을 붙인다.
    if (open !== null && !standalone && !item && (depth === open || depth === 0)) {
      out[out.length - 1] += ` ${body}`;
      continue;
    }
    // 들여쓰기는 목록 항목과 한 줄 요소에서만 남긴다. 문단 앞 공백 수는 차이로 보지 않는다.
    const kept = standalone || item;
    if (depth) out.push(`${quote} ${kept ? innerLead.replace(/\t/g, '    ') : ''}${body}`);
    else out.push(kept ? indent + body : body);
    open = standalone ? null : depth;
  }
  while (out.length && out[0] === '') out.shift();
  while (out.length && out.at(-1) === '') out.pop();
  return out.join('\n');
}

export function fingerprint(lines, resolveLink = null) {
  return createHash('sha256').update(normalizeBody(lines, resolveLink)).digest('hex').slice(0, 16);
}
