// 새 폴더에 기본 구조를 만든다. 템플릿의 ID는 복사할 때 새로 발급해 프로젝트마다 겹치지 않게 한다.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { freshId } from './anchors.mjs';
import { UsageError } from './editor.mjs';

const ID = /doltap-([dsb])-[0-9a-hjkmnp-tv-z]{8}/g;

// 템플릿에서는 Markdown 문서만 복사한다.
function templateFiles(dir) {
  const out = [];
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith('.md')) out.push({ path: relative(dir, full).split(sep).join('/'), text: readFileSync(full, 'utf8') });
    }
  };
  walk(dir);
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

export function initProject(targetInput, templateDir) {
  const target = resolve(targetInput);
  if (existsSync(target) && readdirSync(target).length) {
    throw new UsageError(`${targetInput} 안에 이미 파일이 있습니다. 아무것도 바꾸지 않았습니다.\n작업 중인 프로젝트에는 기존 규칙과 기록을 살리며 합쳐야 하므로 APPLY.md의 절차를 따르세요.`);
  }
  if (!existsSync(templateDir)) throw new Error(`템플릿을 찾지 못했습니다: ${templateDir}`);
  const files = templateFiles(templateDir);
  const used = new Set();
  for (const file of files) for (const match of file.text.matchAll(ID)) used.add(match[0]);
  const renamed = new Map();
  for (const old of [...used].sort()) {
    const fresh = freshId(old.split('-')[1], used);
    used.add(fresh);
    renamed.set(old, fresh);
  }
  const name = basename(target);
  let named = false;
  for (const file of files) {
    let text = file.text.replace(ID, (id) => renamed.get(id) ?? id);
    if (file.path === 'AGENTS.md') {
      const filled = text.replace(/<!-- 채우기: 프로젝트 이름 -->\r?\n# 프로젝트 이름/, () => `# ${name}`);
      named = filled !== text;
      text = filled;
    }
    const full = join(target, file.path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, text);
  }
  return { target, name, named, files: files.map((file) => file.path) };
}
