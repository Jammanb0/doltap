// same-as 비교에 쓰는 문서 골격. 비교하는 요소는 docs/guide/format.md의 same-as 절에 있다.
// 문장이 아니라 Markdown 요소의 구성과 순서만 본다. 번역이나 표현이 달라도 골격은 같을 수 있다.

const FENCE_OPEN = /^( {0,3})(`{3,}|~{3,})(.*)$/;
const ATX = /^ {0,3}(#{1,6})(?:[ \t]+|$)/;
const HR = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const QUOTE = /^ {0,3}>/;
const ITEM = /^( {0,3})([-*+]|\d{1,9}[.)])([ \t]+|$)/;
const SETEXT = /^ {0,3}(=+|-+)[ \t]*$/;
const DELIMITER_ROW = /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/;
const HTML_BLOCK = /^ {0,3}<\/?[A-Za-z][A-Za-z0-9-]*(?:\s|\/?>|$)/;
const REFERENCE = /^ {0,3}\[[^\]]+\]:\s*\S/;

const expand = (text) => text.replace(/^[ \t]+/, (lead) => lead.replace(/\t/g, '    '));
const leading = (text) => text.match(/^ */)[0].length;
const blank = (text) => text.trim() === '';

function fenceOf(text) {
  const match = FENCE_OPEN.exec(text);
  if (!match) return null;
  // 백틱 울타리의 정보 문자열에는 백틱이 들어갈 수 없다.
  if (match[2][0] === '`' && match[3].includes('`')) return null;
  return { char: match[2][0], length: match[2].length };
}

// 문단을 끊고 새 요소를 시작하는 줄인지.
function interrupts(text) {
  return ATX.test(text) || HR.test(text) || QUOTE.test(text) || fenceOf(text) !== null || ITEM.test(text) || HTML_BLOCK.test(text);
}

function cells(row) {
  let text = row.trim();
  if (text.startsWith('|')) text = text.slice(1);
  if (text.endsWith('|') && !text.endsWith('\\|')) text = text.slice(0, -1);
  return text.split(/(?<!\\)\|/);
}

// lines: [{ text, line }]. 표식과 주석 줄은 부르는 쪽에서 빈 줄로 바꿔 넘긴다.
export function parseBlocks(input) {
  const lines = input.map(({ text, line }) => ({ text: expand(text), line }));
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const { text, line } = lines[i];
    if (blank(text)) {
      i += 1;
      continue;
    }
    if (leading(text) >= 4) {
      let j = i + 1;
      while (j < lines.length && (blank(lines[j].text) || leading(lines[j].text) >= 4)) j += 1;
      blocks.push({ type: 'code', line });
      i = j;
      continue;
    }
    const fence = fenceOf(text);
    if (fence) {
      const close = new RegExp(`^ {0,3}${fence.char === '`' ? '`' : '~'}{${fence.length},}[ \\t]*$`);
      let j = i + 1;
      while (j < lines.length) {
        const closing = close.test(lines[j].text);
        j += 1;
        if (closing) break;
      }
      blocks.push({ type: 'code', line });
      i = j;
      continue;
    }
    const heading = ATX.exec(text);
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1].length, line });
      i += 1;
      continue;
    }
    if (HR.test(text)) {
      blocks.push({ type: 'hr', line });
      i += 1;
      continue;
    }
    if (QUOTE.test(text)) {
      const inner = [];
      let j = i;
      while (j < lines.length && !blank(lines[j].text) && (QUOTE.test(lines[j].text) || (j > i && !interrupts(lines[j].text)))) {
        inner.push({ text: lines[j].text.replace(/^ {0,3}> ?/, ''), line: lines[j].line });
        j += 1;
      }
      blocks.push({ type: 'quote', line, children: parseBlocks(inner) });
      i = j;
      continue;
    }
    if (ITEM.test(text)) {
      const { block, next } = parseList(lines, i);
      blocks.push(block);
      i = next;
      continue;
    }
    if (HTML_BLOCK.test(text)) {
      let j = i + 1;
      while (j < lines.length && !blank(lines[j].text)) j += 1;
      blocks.push({ type: 'html', line });
      i = j;
      continue;
    }
    if (REFERENCE.test(text)) {
      i += 1;
      continue;
    }
    if (text.includes('|') && i + 1 < lines.length && DELIMITER_ROW.test(lines[i + 1].text) && lines[i + 1].text.includes('-')) {
      const cols = cells(lines[i + 1].text).length;
      let j = i + 2;
      let rows = 0;
      while (j < lines.length && !blank(lines[j].text) && lines[j].text.includes('|') && !interrupts(lines[j].text)) {
        rows += 1;
        j += 1;
      }
      blocks.push({ type: 'table', cols, rows, line });
      i = j;
      continue;
    }
    let j = i + 1;
    let setext = 0;
    while (j < lines.length) {
      const next = lines[j].text;
      if (blank(next)) break;
      const underline = SETEXT.exec(next);
      if (underline) {
        setext = underline[1][0] === '=' ? 1 : 2;
        j += 1;
        break;
      }
      if (interrupts(next)) break;
      j += 1;
    }
    blocks.push(setext ? { type: 'heading', level: setext, line } : { type: 'paragraph', line });
    i = j;
  }
  return blocks;
}

function markerOf(match) {
  const ordered = /\d/.test(match[2]);
  return { ordered, char: ordered ? match[2].slice(-1) : match[2] };
}

function parseList(lines, start) {
  const head = markerOf(ITEM.exec(lines[start].text));
  const items = [];
  let i = start;
  while (i < lines.length) {
    const match = ITEM.exec(lines[i].text);
    if (!match || HR.test(lines[i].text)) break;
    const marker = markerOf(match);
    // 번호·글머리가 바뀌거나 기호가 바뀌면 새 목록이다.
    if (marker.ordered !== head.ordered || marker.char !== head.char) break;
    const markerIndent = match[1].length;
    const width = match[2].length;
    const rest = lines[i].text.slice(match[0].length);
    const spaces = match[3].replace(/\t/g, '    ').length;
    const contentIndent = blank(rest) || spaces > 4 ? markerIndent + width + 1 : markerIndent + width + spaces;
    const first = blank(rest) ? '' : lines[i].text.slice(Math.min(contentIndent, markerIndent + width + spaces));
    const itemLines = [{ text: first, line: lines[i].line }];
    let j = i + 1;
    let lastBlank = false;
    while (j < lines.length) {
      const text = lines[j].text;
      if (blank(text)) {
        itemLines.push({ text: '', line: lines[j].line });
        lastBlank = true;
        j += 1;
        continue;
      }
      if (leading(text) >= contentIndent) {
        itemLines.push({ text: text.slice(contentIndent), line: lines[j].line });
        lastBlank = false;
        j += 1;
        continue;
      }
      // 빈 줄 없이 이어지는 글 줄은 앞 항목의 문단에 이어진다.
      if (!lastBlank && !interrupts(text)) {
        itemLines.push({ text: text.trimStart(), line: lines[j].line });
        j += 1;
        continue;
      }
      break;
    }
    while (itemLines.length > 1 && blank(itemLines.at(-1).text)) itemLines.pop();
    items.push(parseBlocks(itemLines));
    i = j;
  }
  return { block: { type: 'list', ordered: head.ordered, items, line: lines[start].line }, next: i };
}

function minHeading(blocks) {
  let min = Infinity;
  for (const block of blocks) {
    if (block.type === 'heading') min = Math.min(min, block.level);
    if (block.type === 'list') for (const item of block.items) min = Math.min(min, minHeading(item));
    if (block.type === 'quote') min = Math.min(min, minHeading(block.children));
  }
  return min;
}

export function skeleton(lines) {
  const blocks = parseBlocks(lines);
  const min = minHeading(blocks);
  return { blocks, base: Number.isFinite(min) ? min : 1 };
}

export function describeBlock(block, base) {
  switch (block.type) {
    case 'heading': return `제목(상대 수준 ${block.level - base})`;
    case 'paragraph': return '문단';
    case 'list': return `${block.ordered ? '번호' : '글머리'} 목록 ${block.items.length}항목`;
    case 'table': return `표 ${block.cols}열 ${block.rows}행`;
    case 'code': return '코드 블록';
    case 'quote': return '인용';
    case 'hr': return '구분선';
    case 'html': return 'HTML 블록';
    default: return block.type;
  }
}

export function summarize({ blocks, base }) {
  const walk = (list) => list.map((block) => {
    if (block.type === 'list') return `${describeBlock(block, base)}[${block.items.map((item) => walk(item).join(', ') || '빈 항목').join(' | ')}]`;
    if (block.type === 'quote') return `인용[${walk(block.children).join(', ')}]`;
    return describeBlock(block, base);
  });
  return walk(blocks).join(', ');
}

// 처음 달라진 자리를 돌려준다. 같으면 null이다.
export function compareSkeletons(left, right) {
  const walk = (a, b, path) => {
    const count = Math.max(a.length, b.length);
    for (let index = 0; index < count; index += 1) {
      const p = a[index];
      const q = b[index];
      const here = [...path, { index }];
      if (!p || !q) return { path: here, a: p ?? null, b: q ?? null };
      if (p.type !== q.type) return { path: here, a: p, b: q };
      if (p.type === 'heading' && p.level - left.base !== q.level - right.base) return { path: here, a: p, b: q };
      if (p.type === 'table' && (p.cols !== q.cols || p.rows !== q.rows)) return { path: here, a: p, b: q };
      if (p.type === 'list') {
        if (p.ordered !== q.ordered || p.items.length !== q.items.length) return { path: here, a: p, b: q };
        for (let item = 0; item < p.items.length; item += 1) {
          const found = walk(p.items[item], q.items[item], [...here, { item }]);
          if (found) return found;
        }
      }
      if (p.type === 'quote') {
        const found = walk(p.children, q.children, [...here, { quote: true }]);
        if (found) return found;
      }
    }
    return null;
  };
  const found = walk(left.blocks, right.blocks, []);
  if (!found) return null;
  return {
    ...found,
    where: describePath(found.path),
    left: found.a ? describeBlock(found.a, left.base) : '없음',
    right: found.b ? describeBlock(found.b, right.base) : '없음',
  };
}

function describePath(path) {
  const parts = [];
  for (const step of path) {
    if ('index' in step) parts.push(`${step.index + 1}번째 요소`);
    else if ('item' in step) parts.push(`${step.item + 1}번째 항목`);
    else parts.push('인용 안');
  }
  return parts.join(' › ');
}
