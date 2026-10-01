// 현재 작업과 보관 기록을 찾을 수 있게 하는 운영 구조 검사. 코드별 조건은 docs/guide/checks.md에 있다.

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { finding } from './findings.mjs';
import { findLinks, isExternal, resolveLocal } from './markdown.mjs';
import { ARCHIVE_DIR, OPERATING_DIR, WORKSTREAMS_DIR } from './project.mjs';

const REQUIRED = ['.doltap/current.md', '.doltap/history.md'];
const WORKSTREAM_REQUIRED = ['README.md', 'status.md'];
const PLACEHOLDER = /^[ ]*<!--[ ]*(채우기|고르기|확인 필요)[ ]*:/;
const NAME_CHAR = /[0-9A-Za-z_-]/;

function subdirs(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
    .map((entry) => entry.name)
    .sort();
}

// 주석·코드·표식 밖의 글 줄만 모은다. 주석 속 작성 예시를 실제로 적은 것으로 세지 않는다.
function prose(document) {
  if (!document) return '';
  return document.lines.filter((_, index) => document.kinds[index] === 'text').join('\n');
}

// 이름이 다른 이름의 일부로만 나오면 적힌 것으로 보지 않는다. 004-search가 004-search-rework에 가려지지 않게 한다.
function mentions(body, name) {
  for (let from = 0; ;) {
    const at = body.indexOf(name, from);
    if (at === -1) return false;
    const before = at === 0 ? '' : body[at - 1];
    const after = body[at + name.length] ?? '';
    if (!NAME_CHAR.test(before) && !NAME_CHAR.test(after)) return true;
    from = at + 1;
  }
}

export function operatingFindings(project) {
  const findings = [];
  const add = (code, where, message, extra) => findings.push(finding(code, where, message, extra));
  const { root, documents } = project;
  const byPath = new Map(documents.map((document) => [document.path, document]));
  if (!project.operating) {
    add('OPERATING_DIR_MISSING', `${OPERATING_DIR}/`, '.doltap/ 폴더가 없습니다');
    return findings;
  }

  const agents = byPath.get('AGENTS.md');
  if (!existsSync(join(root, 'AGENTS.md'))) add('ENTRY_MISSING', 'AGENTS.md', 'AGENTS.md가 없습니다');
  else if (agents) {
    if (!agents.managed) add('REQUIRED_ANCHOR_MISSING', 'AGENTS.md', 'AGENTS.md에 doltap 표식이 없습니다');
    if (!prose(agents).includes('.doltap/current.md')) add('ENTRY_CURRENT_MISSING', 'AGENTS.md', 'AGENTS.md가 .doltap/current.md를 안내하지 않아 새 세션이 현재 작업을 찾지 못합니다');
  }
  for (const path of REQUIRED) {
    if (!existsSync(join(root, path))) add('REQUIRED_DOCUMENT_MISSING', path, `${path}가 없습니다`);
    else if (byPath.get(path) && !byPath.get(path).managed) add('REQUIRED_ANCHOR_MISSING', path, `${path}에 doltap 표식이 없습니다`);
  }

  const active = subdirs(join(root, WORKSTREAMS_DIR));
  const archived = subdirs(join(root, ARCHIVE_DIR));
  const numbers = new Map();
  for (const name of archived) if (!numbers.has(name.slice(0, 3))) numbers.set(name.slice(0, 3), `${ARCHIVE_DIR}/${name}`);
  for (const name of active) {
    const path = `${WORKSTREAMS_DIR}/${name}`;
    if (!/^\d{3}-[a-z0-9-]+$/.test(name)) add('WORKSTREAM_NAME', path, `작업 폴더 이름이 <세 자리 번호>-<영문 소문자>가 아닙니다: ${name}`);
    const clash = numbers.get(name.slice(0, 3));
    if (clash && /^\d{3}/.test(name)) add('WORKSTREAM_NUMBER_DUPLICATE', path, `번호 ${name.slice(0, 3)}가 ${clash}와 겹칩니다`);
    else numbers.set(name.slice(0, 3), path);
    for (const file of WORKSTREAM_REQUIRED) {
      const full = `${path}/${file}`;
      if (!existsSync(join(root, full))) add('WORKSTREAM_DOCUMENT_MISSING', path, `${file}가 없습니다`);
      else if (byPath.get(full) && !byPath.get(full).managed) add('REQUIRED_ANCHOR_MISSING', full, `${full}에 doltap 표식이 없습니다`);
    }
  }

  const current = byPath.get('.doltap/current.md');
  if (current) {
    const body = prose(current);
    for (const name of active) if (!mentions(body, name)) add('WORKSTREAM_UNLISTED', '.doltap/current.md', `진행 중인 작업 ${name}이 적혀 있지 않아 새 세션이 찾지 못합니다`);
    const listed = new Set([...body.matchAll(/(?:^|[^0-9A-Za-z_-])workstreams\/([0-9]{3}-[a-z0-9-]+)\//g)].map((match) => match[1]));
    for (const name of listed) {
      if (active.includes(name)) continue;
      add('WORKSTREAM_TARGET_MISSING', '.doltap/current.md', archived.includes(name)
        ? `${name}은 이미 보관됐습니다. current.md에서 빼세요`
        : `${name} 작업 폴더가 없습니다`);
    }
  }
  const history = byPath.get('.doltap/history.md');
  if (history) {
    const body = prose(history);
    for (const name of archived) if (!mentions(body, name)) add('ARCHIVE_UNLISTED', `${ARCHIVE_DIR}/${name}`, `history.md에 보관 작업 ${name}이 없습니다`);
  }

  for (const document of documents) {
    if (document.archived) continue;
    if (document.path !== 'AGENTS.md' && !document.path.startsWith(`${OPERATING_DIR}/`)) continue;
    const hits = document.lines.map((line, index) => (PLACEHOLDER.test(line) ? index + 1 : 0)).filter(Boolean);
    if (hits.length) add('PLACEHOLDER', document.path, `아직 채우지 않은 자리 ${hits.length}곳 (${hits.slice(0, 5).join(', ')}${hits.length > 5 ? ' …' : ''}행)`);
  }

  const ignored = spawnSync('git', ['check-ignore', '-q', `${OPERATING_DIR}/`], { cwd: root, encoding: 'utf8', windowsHide: true });
  if (ignored.status === 0) add('OPERATING_DIR_IGNORED', `${OPERATING_DIR}/`, '운영 기록이 Git에서 제외되어 이 작업 공간에만 있습니다. 다른 checkout과 CI에는 전달되지 않습니다');
  return findings;
}

// 보관 문서가 아닌 관리 문서의 로컬 링크가 실제 파일을 가리키는지 본다.
export function linkFindings(project) {
  const findings = [];
  for (const document of project.documents) {
    if (!document.managed || document.archived) continue;
    document.lines.forEach((line, index) => {
      if (document.kinds[index] !== 'text') return;
      for (const link of findLinks(line)) {
        const where = { path: document.path, line: index + 1 };
        if (!link.dest || isExternal(link.dest)) continue;
        const target = resolveLocal(document.path, link.dest);
        if (!target.path) continue;
        if (!existsSync(join(project.root, target.path))) findings.push(finding('LINK_FILE_MISSING', where, `링크 대상 파일이 없습니다: ${link.dest}`));
      }
    });
  }
  return findings;
}

