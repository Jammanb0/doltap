// 프로젝트에서 Markdown 문서를 찾아 읽는다. 읽지 않는 폴더와 설정은 docs/guide/checks.md의 「설정」에 있다.

import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { collectIds, parseDocument } from './anchors.mjs';

export const OPERATING_DIR = '.doltap';
export const ARCHIVE_DIR = '.doltap/archive';
export const WORKSTREAMS_DIR = '.doltap/workstreams';
export const CONFIG_PATH = '.doltap/config.json';
export const REVIEWS_PATH = '.doltap/reviews.json';

// 문서를 두지 않는 폴더. 빌드 결과와 도구의 내부 폴더다.
const SKIP = new Set(['.git', '.hg', '.svn', 'node_modules', 'dist', 'build', 'coverage']);

const byName = (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);

export function isArchived(path) {
  return path.startsWith(`${ARCHIVE_DIR}/`);
}

function isDirectory(path) {
  try {
    return lstatSync(path).isDirectory();
  } catch {
    return false;
  }
}

export function readConfig(root) {
  const full = join(root, CONFIG_PATH);
  if (!existsSync(full)) return { exists: false, exclude: [], problem: null };
  let data;
  try {
    data = JSON.parse(readFileSync(full, 'utf8'));
  } catch (error) {
    return { exists: true, exclude: [], problem: `JSON으로 읽을 수 없습니다: ${error.message}` };
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { exists: true, exclude: [], problem: '최상위가 객체가 아닙니다' };
  const unknown = Object.keys(data).filter((key) => key !== 'exclude');
  if (unknown.length) return { exists: true, exclude: [], problem: `모르는 설정입니다: ${unknown.join(', ')}` };
  const list = data.exclude ?? [];
  if (!Array.isArray(list) || list.some((item) => typeof item !== 'string' || !item.trim())) {
    return { exists: true, exclude: [], problem: 'exclude는 경로 문자열의 배열이어야 합니다' };
  }
  const exclude = [];
  for (const item of list) {
    const path = item.trim().replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/+$/, '');
    if (!path || path === '.' || path.split('/').includes('..') || path.startsWith('/')) {
      return { exists: true, exclude: [], problem: `프로젝트 안의 상대 경로가 아닙니다: ${item}` };
    }
    if (excludesRequired(path)) {
      return { exists: true, exclude: [], problem: `필수 운영 문서는 뺄 수 없습니다: ${item} — AGENTS.md, .doltap/current.md, .doltap/history.md, 작업 폴더의 README.md·status.md는 항상 검사합니다` };
    }
    exclude.push(path);
  }
  return { exists: true, exclude, problem: null };
}

// 운영 구조 검사가 꼭 읽어야 하는 문서. 설정으로 빼면 검사를 조용히 건너뛰게 되므로 막는다.
const REQUIRED_DOCUMENTS = ['AGENTS.md', '.doltap/current.md', '.doltap/history.md'];
const WORKSTREAM_REQUIRED = /^\.doltap\/workstreams(?:\/[^/]+(?:\/(?:README|status)\.md)?)?$/;

function excludesRequired(path) {
  return REQUIRED_DOCUMENTS.some((required) => required === path || required.startsWith(`${path}/`)) || WORKSTREAM_REQUIRED.test(path);
}

function excludedBy(path, exclude) {
  return exclude.some((item) => path === item || path.startsWith(`${item}/`));
}

// 루트 아래의 Markdown을 찾는다. 설정으로 뺀 파일도 ID 중복을 피하려고 목록에는 남긴다.
export function findMarkdown(root, exclude = []) {
  const files = [];
  const nested = [];
  const walk = (dir, rel) => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort(byName)) {
      const path = rel ? `${rel}/${entry.name}` : entry.name;
      const full = join(dir, entry.name);
      // 심볼릭 링크는 따라가지 않는다. 같은 파일을 두 경로로 읽으면 ID가 겹쳐 보인다.
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (SKIP.has(entry.name)) continue;
        if (entry.name.startsWith('.') && path !== OPERATING_DIR) continue;
        // .doltap을 가진 하위 폴더는 따로 운영하는 프로젝트다. 섞어 읽지 않는다.
        if (isDirectory(join(full, OPERATING_DIR))) {
          nested.push(path);
          continue;
        }
        walk(full, path);
        continue;
      }
      if (entry.isFile() && /\.md$/i.test(entry.name)) files.push({ path, full, excluded: excludedBy(path, exclude) });
    }
  };
  walk(root, '');
  return { files, nested };
}

export function loadProject(rootInput) {
  const root = resolve(rootInput);
  if (!isDirectory(root)) throw new Error(`폴더가 아닙니다: ${rootInput}`);
  const config = readConfig(root);
  const { files, nested } = findMarkdown(root, config.problem ? [] : config.exclude);
  const documents = [];
  const excluded = [];
  const usedIds = new Set();
  // 설정으로 뺀 문서의 ID. 그 문서에 남은 관계 선언을 볼 수 없으므로 검토 기록을 정리할 때 피한다.
  const excludedIds = new Set();
  for (const file of files) {
    const text = readFileSync(file.full, 'utf8');
    collectIds(text, usedIds);
    if (file.excluded) {
      excluded.push(file.path);
      collectIds(text, excludedIds);
      continue;
    }
    documents.push({ ...parseDocument(text, file.path), text, archived: isArchived(file.path) });
  }
  const reviewsFile = join(root, REVIEWS_PATH);
  if (existsSync(reviewsFile)) collectIds(readFileSync(reviewsFile, 'utf8'), usedIds);
  return { root, config, documents, excluded, excludedIds, nested, usedIds, operating: isDirectory(join(root, OPERATING_DIR)) };
}
