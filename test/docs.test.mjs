// 안내 문서가 코드와 어긋나지 않는지 확인한다. 상대 링크와 문서 안 조각이 실재하는지,
// 모든 진단 코드·검토 이유·명령·옵션·출력 형식이 참고 문서에 있는지, 안내에 나오는 명령과
// npm 스크립트가 실제로 있는지 본다. 문장이 정확한지는 사람이 읽고 판단한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALL_CODES } from '../lib/findings.mjs';
import { classifyLines, findLinks, isExternal, resolveLocal, splitLines } from '../lib/markdown.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(ROOT, path), 'utf8');
const markdownIn = (dir) => (existsSync(join(ROOT, dir)) ? readdirSync(join(ROOT, dir)).filter((name) => name.endsWith('.md')).map((name) => `${dir}/${name}`) : []);
const PUBLIC = ['README.md', 'README.en.md', 'APPLY.md', 'CONTRIBUTING.md', 'SECURITY.md', ...markdownIn('docs'), ...markdownIn('docs/guide'), ...markdownIn('docs/guide/en'), ...markdownIn('docs/verification')];

// 코드 블록과 주석을 뺀 글 줄.
function textLines(path) {
  const { lines } = splitLines(read(path));
  const kinds = classifyLines(lines);
  return lines.map((line, index) => ({ line, number: index + 1 })).filter((_, index) => kinds[index] === 'text');
}

// GitHub가 제목에 붙이는 조각 이름. 서식 기호를 걷고 문장 부호를 지운 뒤 공백을 하이픈으로 바꾼다.
function slug(heading) {
  const plain = heading
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[`*]/g, '');
  return plain.trim().toLowerCase().replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '').replace(/ /g, '-');
}

function anchorsOf(path) {
  const seen = new Map();
  const anchors = new Set();
  for (const { line } of textLines(path)) {
    const heading = /^ {0,3}#{1,6}\s+(.*?)(?:\s+#+)?\s*$/.exec(line);
    if (!heading) continue;
    const base = slug(heading[1]);
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    anchors.add(count ? `${base}-${count}` : base);
  }
  return anchors;
}

test('공개 안내의 상대 링크와 문서 안 조각은 실제로 있다', () => {
  const broken = [];
  for (const path of PUBLIC) {
    for (const { line, number } of textLines(path)) {
      for (const link of findLinks(line)) {
        if (!link.dest || isExternal(link.dest)) continue;
        const target = resolveLocal(path, link.dest);
        const where = `${path}:${number} ${link.dest}`;
        const file = target.path ?? path;
        if (target.outside || !existsSync(join(ROOT, file))) {
          broken.push(`${where} — 파일 없음`);
          continue;
        }
        if (target.fragment && file.endsWith('.md') && !anchorsOf(file).has(decodeURIComponent(target.fragment))) {
          broken.push(`${where} — 조각 없음`);
        }
      }
    }
  }
  assert.deepEqual(broken, []);
});

test('배포 묶음에 들어가는 안내는 묶음 안의 파일만 가리킨다', () => {
  // npm은 files 목록과 함께 README·LICENSE·package.json을 늘 넣는다.
  const { files } = JSON.parse(read('package.json'));
  const shipped = (path) => ['README.md', 'README.en.md', 'LICENSE', 'package.json'].includes(path)
    || files.some((entry) => path === entry || path.startsWith(`${entry}/`));
  const outside = [];
  for (const path of PUBLIC.filter(shipped)) {
    for (const { line, number } of textLines(path)) {
      for (const link of findLinks(line)) {
        if (!link.dest || isExternal(link.dest)) continue;
        const target = resolveLocal(path, link.dest);
        if (target.path && !shipped(target.path)) outside.push(`${path}:${number} ${link.dest}`);
      }
    }
  }
  assert.deepEqual(outside, []);
});

test('조각 이름 계산은 GitHub 규칙을 따른다', () => {
  assert.equal(slug('보관한 문서와의 관계'), '보관한-문서와의-관계');
  assert.equal(slug('`same-as` — 번역처럼 같아야 하는 범위'), 'same-as--번역처럼-같아야-하는-범위');
  assert.equal(slug('12.2 출력'), '122-출력');
});

test('모든 진단 코드와 검토 이유가 검사 항목 참고에 있다', () => {
  const checks = read('docs/guide/checks.md');
  assert.deepEqual(ALL_CODES.filter((code) => !checks.includes(`\`${code}\``)), []);
  const reasons = [...new Set([...read('lib/inspect.mjs').matchAll(/reason: '([a-z-]+)'/g)].map((match) => match[1]))];
  assert.ok(reasons.length >= 5, `검토 이유를 찾지 못했습니다: ${reasons.join(', ')}`);
  assert.deepEqual(reasons.filter((reason) => !checks.includes(`\`${reason}\``)), []);
});

test('모든 명령·옵션·출력 형식이 명령 참고와 사용법에 있다', () => {
  const bin = read('bin/doltap.mjs');
  const allowed = /const ALLOWED = \{([\s\S]*?)\n\};/.exec(bin)[1];
  const commands = [...allowed.matchAll(/^\s*([a-z-]+):/gm)].map((match) => match[1]);
  const options = new Set([...bin.matchAll(/'(--[a-z]+)'/g)].map((match) => match[1]));
  options.add('--version');
  options.add('--help');
  assert.ok(commands.length >= 8 && options.size >= 10);

  const reference = read('docs/guide/commands.md');
  const usage = spawnSync(process.execPath, [join(ROOT, 'bin/doltap.mjs'), '--help'], { encoding: 'utf8', windowsHide: true }).stdout;
  assert.deepEqual(commands.filter((command) => !new RegExp(`^## ${command}$`, 'm').test(reference)), []);
  assert.deepEqual(commands.filter((command) => !usage.includes(`doltap ${command}`)), []);
  assert.deepEqual([...options].filter((option) => !new RegExp(`${option}(?![a-z-])`).test(reference)), []);

  const schemas = new Set();
  for (const path of ['bin/doltap.mjs', ...readdirSync(join(ROOT, 'lib')).map((name) => `lib/${name}`)]) {
    for (const match of read(path).matchAll(/'(doltap\.[a-z]+\.v\d+)'/g)) schemas.add(match[1]);
  }
  assert.ok(schemas.size >= 6);
  assert.deepEqual([...schemas].filter((schema) => !reference.includes(`\`${schema}\``)), []);
});

test('안내에 나오는 doltap 명령과 npm 스크립트는 실제로 있다', () => {
  const commands = new Set([.../const ALLOWED = \{([\s\S]*?)\n\};/.exec(read('bin/doltap.mjs'))[1].matchAll(/^\s*([a-z-]+):/gm)].map((match) => match[1]));
  const scripts = new Set(Object.keys(JSON.parse(read('package.json')).scripts ?? {}));
  const places = [...PUBLIC, 'template/AGENTS.md', 'template/.doltap/current.md', 'template/.doltap/history.md'];
  const unknown = [];
  for (const path of places) {
    const { lines } = splitLines(read(path));
    const kinds = classifyLines(lines);
    lines.forEach((line, index) => {
      // 명령으로 쓰인 곳만 본다. 코드 블록은 줄 첫머리, 글 줄은 인라인 코드의 첫머리다.
      // 요청 예시처럼 문장 가운데 나오는 doltap은 명령으로 세지 않는다.
      const pieces = kinds[index] === 'code' ? [line] : [...line.matchAll(/`([^`]+)`/g)].map((match) => match[1]);
      for (const piece of pieces) {
        const command = /^\s*(?:\$\s+)?(?:doltap|node \S*bin\/doltap\.mjs)\s+([a-z][a-z-]*)/.exec(piece);
        if (command && !commands.has(command[1])) unknown.push(`${path}:${index + 1} 명령 ${command[1]}`);
        for (const match of piece.matchAll(/\bnpm (?:run ([\w:-]+)|(start|test|stop|restart)\b)/g)) {
          const script = match[1] ?? match[2];
          if (!scripts.has(script)) unknown.push(`${path}:${index + 1} npm 스크립트 ${script}`);
        }
      }
    });
  }
  assert.deepEqual(unknown, []);
});
