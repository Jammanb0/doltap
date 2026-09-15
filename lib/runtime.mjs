import { diagnostic } from './diagnostics.mjs';
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
  for (const id of pending(root)) result.problems.push(diagnostic('RECOVERY_PENDING', '.doltap/recovery', `중단된 쓰기가 남아 있습니다: ${id}`, { hint: `doltap recover ${id}로 복구 계획을 확인한 뒤 같은 명령에 --apply를 붙여 적용하세요.` }));
  const ignored = spawnSync('git', ['check-ignore', '-q', '.doltap/'], { cwd: root, encoding: 'utf8', windowsHide: true });
  if (ignored.status === 0) result.notices.push(diagnostic('OPERATING_DIR_IGNORED', '.doltap', '운영 기록이 Git에서 제외되어 이 작업 공간에만 있습니다. 다른 checkout과 CI에는 전달되지 않습니다'));
  return { ...result, records };
}
export function fullCheck(root) {
  const old = check(root);
  if (existsSync(join(root, '.agents')) && !existsSync(join(root, '.doltap'))) old.problems.unshift(diagnostic('LEGACY_OPERATING_DIR', '.agents', '운영 폴더가 .doltap으로 바뀌었습니다. APPLY.md의 이관 절차를 읽고 doltap migrate를 미리보기부터 실행하세요'));
  const graph = inspect(root);
  if (existsSync(join(root, '.doltap/project.md')) && !existsSync(join(root, '.doltap/plans/project.md'))) old.problems.unshift(diagnostic('LEGACY_PROJECT_PATH', '.doltap/project.md', '프로젝트 설명은 plans/project.md로 옮깁니다. doltap migrate를 미리보기부터 실행하세요'));
  // 골격 검사와 그래프 진입점 검사가 같은 문제를 보고해도 사용자에게는 한 번만 보인다.
  const unique = findings => [...new Map(findings.map(f => [JSON.stringify([f.code, f.where, f.message]), f])).values()];
  return { ...graph, problems: unique([...old.problems, ...graph.problems]), notices: unique([...old.notices, ...graph.notices]), passed: [...old.passed, ...graph.passed] };
}
