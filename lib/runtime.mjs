import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { check } from './check.mjs';
import { snapshot } from './edit.mjs';
import { enrich, readReviews, reviewStates, stateFindings } from './state.mjs';
import { pending } from './transaction.mjs';
import { archiveCheck } from './lifecycle.mjs';

export function inspect(root) {
  const result = snapshot(root);
  enrich(result.graph, result.documents);
  const records = readReviews(result.documents);
  reviewStates(result.graph, records);
  const findings = stateFindings(result.graph, result.documents, root);
  result.problems.push(...findings.problems);
  result.notices.push(...findings.notices);
  result.problems.push(...archiveCheck(result.graph, '.doltap/archive/workstreams'));
  for (const id of pending(root)) result.problems.push({ where: '.doltap/recovery', message: `중단된 쓰기를 복구하세요: doltap recover ${id} --apply` });
  const ignored = spawnSync('git', ['check-ignore', '-q', '.doltap/'], { cwd: root, encoding: 'utf8', windowsHide: true });
  if (ignored.status === 0) result.notices.push({ where: '.doltap', message: '운영 기록이 Git에서 제외되어 이 작업 공간에만 있습니다. 다른 checkout과 CI에는 전달되지 않습니다' });
  return { ...result, records };
}
export function fullCheck(root) {
  const old = check(root);
  if (existsSync(join(root, '.agents')) && !existsSync(join(root, '.doltap'))) old.problems.unshift({ where: '.agents', message: '운영 폴더가 .doltap으로 바뀌었습니다. APPLY.md의 이관 절차를 읽고 doltap migrate를 미리보기부터 실행하세요' });
  const graph = inspect(root);
  return { ...graph, problems: [...old.problems, ...graph.problems], notices: [...old.notices, ...graph.notices], passed: [...old.passed, ...graph.passed] };
}
