// 검증 보고서가 어떤 구현을 대상으로 했는지 가리키는 구현 해시를 출력한다.
// bin·lib의 .mjs와 template의 .md를 경로순으로 줄 끝을 LF로 맞춰 이은 뒤 SHA-256을 계산한다.
// 커밋 번호와 달리 문서만 고친 커밋에서는 바뀌지 않아, 실행 보고서의 대상을 오래 가리킬 수 있다.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8').replace(/\r\n/g, '\n');

function listFiles(dir, pattern) {
  const found = [];
  for (const entry of readdirSync(resolve(root, dir), { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) found.push(...listFiles(path, pattern));
    else if (pattern.test(entry.name)) found.push(path);
  }
  return found;
}

const files = [...listFiles('bin', /\.mjs$/), ...listFiles('lib', /\.mjs$/), ...listFiles('template', /\.md$/)].sort();
const hash = createHash('sha256').update(files.map((path) => `${path}\0${read(path)}\0`).join('')).digest('hex');
const { version } = JSON.parse(read('package.json'));
process.stdout.write(`doltap ${version} ${hash}\n`);
