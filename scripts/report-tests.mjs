// Reproduce per-file reports with Node's built-in runner. No raw host paths are saved.
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const checkOnly = process.argv.includes('--check');
const suites = {
  diagnostics: ['검사 메시지', '임시 프로젝트에서 실제 CLI의 터미널·JSON·종료 코드를 비교한다. 중복 ID·깨진 링크·이동·검토 만료·손상 기록을 만들고 수정 뒤 재검사한다.', '로컬 CLI와 지정 입력의 진단을 검증한다. 원격 CI, 모든 오류 조합, 안내 문구만으로 사용자가 수습할 수 있는지는 별도 검증 대상이다.'],
  'delete-folder': ['등록 문서 묶음 삭제', '폴더 안에 등록된 문서와 내부 순환 관계를 함께 삭제한다. 외부 참조, 미등록 파일 보존, CLI 미리보기, 실패 롤백과 부모 폴더 복원을 확인한다.', '일반 폴더 삭제가 아니다. 등록된 문서만 삭제하며 일반 링크와 혼합 본문은 직접 정리한다. 원래 비어 있던 폴더까지 복원하지는 않는다.'],
  'delete-fix': ['직접 삭제 사후 정리', 'Git 없는 임시 프로젝트에서 직접 삭제한 파일·문단의 ID와 참조를 정리한다. 이동·손상·일반 링크·범위 제한·CLI 미리보기 및 실패 복구를 대조한다.', '복구 대상은 사후 정리가 바꾼 대장과 관계다. 명령 실행 전에 이미 삭제된 원문을 되살리는 시험이 아니며 의미 판단이나 모든 Markdown 링크 구문을 자동 처리하지 않는다.'],
  check: ['기존 문서 구조', '필수 파일·경로·current 색인·번호 충돌을 바꾼 임시 문서를 검사한다. 유효한 입력과 무시해야 할 예시·아카이브를 함께 비교한다.', '이 파일은 기존 구조 검사 함수의 시험이다. 최종 CLI의 그래프 검사는 graph·workflow 시험과 함께 해석한다.'],
  graph: ['범위와 관계 파싱', '메모리 문서와 임시 파일에 정상·중복·교차 ID, 일반 링크와 관계 링크를 넣고 노드·엣지·오류를 대조한다.', 'Markdown 전체 표준 구현이나 자연어 관계의 타당성을 검증하는 시험은 아니다.'],
  ids: ['ID 발급과 잠금', '발급·재발급·삭제 상태와 잠금을 검사한다. 동시 프로세스와 쓰기 실패를 사용해 충돌·잠금 정리를 확인한다.', '아래 실행 환경에서 관찰한 결과다. 다른 운영체제의 파일 잠금 동작까지 입증하지 않는다.'],
  init: ['프로젝트 초기화', 'CLI를 자식 프로세스로 실행해 빈 폴더 초기화, 이름 치환, 기존 파일 보호, 오류 메시지를 확인한다.', '생성한 프로젝트의 업무 규칙은 사람이 채우고 판단한다. init의 cd 안내는 POSIX 셸 기준이며, 작은따옴표가 있는 이름을 PowerShell에 그대로 붙여 넣는 사용법까지 보장하지 않는다.'],
  workflow: ['그래프 작업 흐름', '임시 프로젝트에서 이관·편집·이동·삭제·검토·조회·훅 입출력을 실행한다. 오류 주입과 프로세스 강제 종료 후 복구도 검사한다.', '훅은 stdin·출력 어댑터 시험이다. 실제 에이전트 설정에 설치한 실행을 의미하지 않는다.'],
  review: ['검토·감사 회귀', '첫 검토, 관리 메타데이터, 필터, 경로 표기, 손상 기록을 재현한다. 다대일·일대다 관계의 검토 상태 변화를 각각 확인한다.', '검토 기록은 내용의 참이나 사용자 승인을 인증하지 않는다. 관계별 상태 계산의 독립성을 검증한다.'],
};
let total = 0;
if (!checkOnly) mkdirSync(resolve(root, 'docs/trials/automated'), { recursive: true });
for (const [name, [title, method, limit]] of Object.entries(suites)) {
  const file = `test/${name}.test.mjs`;
  const run = spawnSync(process.execPath, ['--test', '--test-reporter=tap', file], { cwd: root, encoding: 'utf8', windowsHide: true });
  if (run.status !== 0) {
    process.stderr.write(`${file}: 실패 (종료 코드 ${run.status ?? '없음'})\n`);
    if (run.error) process.stderr.write(`${run.error.message}\n`);
    if (run.signal) process.stderr.write(`종료 신호: ${run.signal}\n`);
    if (run.stdout) process.stderr.write(run.stdout);
    if (run.stderr) process.stderr.write(run.stderr);
    process.exit(1);
  }
  const count = Number(run.stdout.match(/^# tests (\d+)$/m)?.[1]);
  const passed = Number(run.stdout.match(/^# pass (\d+)$/m)?.[1]);
  const cases = [...run.stdout.matchAll(/^# Subtest: (.+)$/gm)].map(m => m[1]);
  if (!count || passed !== count || cases.length !== count) throw new Error(`판정 수 불일치: ${file}`);
  const hash = createHash('sha256').update(readFileSync(resolve(root, file))).digest('hex');
  const date = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date());
  const caseRows = cases.map((title, i) => `| ${i + 1} | ${title.replaceAll('|', '&#124;')} | 통과 |`);
  const reportPath = resolve(root, `docs/trials/automated/${name}.md`);
  const report = `# ${title} 시험\n\n[시험 보고서 목록](../README.md) · [시험 원본](../../../${file})\n\n## 방법\n\n${method}\n\n- 실행: \`node --test --test-reporter=tap ${file}\`\n- 실행일: ${date} (Asia/Seoul)\n- 환경: Node ${process.version}, ${process.platform} ${process.arch}\n- 시험 대상: 이 명령을 실행한 시점의 작업 트리\n- 판정 기준: 종료 코드 0, TAP의 전체·통과·나열된 하위 시험 수가 모두 일치\n- 시험 파일 SHA-256: \`${hash}\` (시험 파일만 식별하며 구현 전체의 해시는 아님)\n\n## 결과\n\n${count}개 실행, ${passed}개 통과, 실패·건너뜀 0개. 다음은 실제 러너가 출력한 시험 이름이다.\n\n| 번호 | 시험 | 결과 |\n| --- | --- | --- |\n${caseRows.join('\n')}\n\n## 해석 범위\n\n${limit}\n`;
  if (checkOnly) {
    const saved = readFileSync(reportPath, 'utf8');
    // Preserve the original run date/environment while comparing the complete report.
    const comparable = text => text.replace(/\r\n/g, '\n').replace(/^- (?:실행일|환경):.*\n/gm, '');
    if (comparable(saved) !== comparable(report)) throw new Error(`보고서가 현재 시험과 다릅니다: docs/trials/automated/${name}.md`);
  } else writeFileSync(reportPath, report);
  total += count; process.stdout.write(`${file}: ${checkOnly ? '보고서 일치' : `${passed}/${count}`}\n`);
}
process.stdout.write(checkOnly ? `합계: ${total}개 시험의 보고서 일치\n` : `합계: ${total}개 통과\n`);
