// 시험용 임시 프로젝트. 파일 내용은 줄 배열이나 문자열로 받는다.

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

export function makeProject(files, t) {
  const root = mkdtempSync(join(tmpdir(), 'doltap-'));
  if (t) t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFiles(root, files);
  return root;
}

export function writeFiles(root, files) {
  for (const [path, content] of Object.entries(files)) {
    const full = join(root, path);
    if (content === null) {
      rmSync(full, { recursive: true, force: true });
      continue;
    }
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, Array.isArray(content) ? `${content.join('\n')}\n` : content);
  }
}

export function read(root, path) {
  return readFileSync(join(root, path), 'utf8');
}

// 문서 하나를 d 범위로 감싼 줄 배열.
export function doc(id, ...body) {
  return [`<!-- doltap:start ${id} -->`, '', ...body, '', `<!-- doltap:end ${id} -->`];
}

// 관계 선언이 있는 안쪽 범위.
export function range(id, relations, ...body) {
  const head = relations.length
    ? [`<!-- doltap:start ${id}`, ...relations, '-->']
    : [`<!-- doltap:start ${id} -->`];
  return [...head, ...body, `<!-- doltap:end ${id} -->`];
}

// 운영 구조를 갖춘 최소 프로젝트.
export function operating(extra = {}) {
  return {
    'AGENTS.md': doc('doltap-d-agents01', '# 예제', '', '작업을 시작할 때 `.doltap/current.md`를 읽습니다.'),
    '.doltap/current.md': doc('doltap-d-crnt0001', '# 현재 작업', '', '진행 중인 작업이 없습니다.'),
    '.doltap/history.md': doc('doltap-d-hstry001', '# 작업 이력', '', '아직 마친 작업이 없습니다.'),
    ...extra,
  };
}

export const codes = (items) => items.map((item) => item.code);
