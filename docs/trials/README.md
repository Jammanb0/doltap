<a name="doltap-d-0kk90ace-start" id="doltap-d-0kk90ace-start"></a>

# 시험 보고서

시험 파일별 방법과 실제 실행 결과를 아래 보고서에 나눠 기록합니다.
자동 시험, CLI 실행, 화면 관찰, 에이전트 행동 관찰은 서로 다른 근거입니다.

## 자동 시험

각 보고서에는 실행 명령·환경, 시험 원본의 해시, 실제 시험 이름과 판정이 있습니다.
전체 실행은 npm test, 파일별 재실행과 보고서 생성은 node scripts/report-tests.mjs입니다.
`node scripts/report-tests.mjs --check`는 파일을 고치지 않고 현재 시험 원본·실행
결과가 저장된 보고서의 해시·시험 목록과 맞는지 확인합니다.

| 시험 파일 | 확인하는 동작 | 보고서 |
| --- | --- | --- |
| test/delete-folder.test.mjs | 등록 문서 묶음 삭제·미등록 보존·복구 | [묶음 삭제](automated/delete-folder.md) |
| test/delete-fix.test.mjs | 직접 삭제 사후 정리·범위·참조·복구 | [사후 삭제 정리](automated/delete-fix.md) |
| test/check.test.mjs | 기존 문서 구조·색인·경로 | [구조 검사](automated/check.md) |
| test/diagnostics.test.mjs | 진단 코드·위치·다음 행동·수정 후 재검사 | [검사 메시지](automated/diagnostics.md) |
| test/graph.test.mjs | ID·범위·관계·도달성 | [그래프 파서](automated/graph.md) |
| test/ids.test.mjs | 발급·중복·삭제 ID·동시 잠금 | [ID 발급](automated/ids.md) |
| test/init.test.mjs | 초기화·이름 치환·기존 파일 보호 | [초기화](automated/init.md) |
| test/workflow.test.mjs | 이관·복구·수명 주기·조회 | [작업 흐름](automated/workflow.md) |
| test/review.test.mjs | 검토·감사 회귀·다대일·일대다 | [검토와 감사](automated/review.md) |

## 실행과 관찰

- [사용자 안내 실행 검증](guide.md): 가이드의 CLI 흐름·링크·패키지 확인.
- [009 원격 CI](ci-009.md): Windows / Node 24 실패, 로컬 보완과 010 반영 뒤 원격 6개 환경 통과.
- [012 CI 시험 안정화](ci-012.md): Ubuntu / Node 22의 PID 의존 실패를 재현·수정하고 원격 6개 환경 통과 확인.
- [013 검사 메시지](check-diagnostics.md): 진단 위치·다음 행동·재검토 이유와 실제 CLI 출력 확인.
- [패키지·문서·폴더 이동 실행](local-integration.md): 실제 CLI 실행과 해석 범위.
- [이전 에이전트 행동 관찰](agent-behavior-2026-09-10.md): 2026-09-10 기록과 근거의 구분.

## 결과를 읽는 기준

자동 시험 통과는 해당 입력에서 기대한 결과가 나왔다는 뜻입니다. Markdown의 모든
표현, 자연어 의미의 타당성, AI의 작업 승인 준수를 보장하지 않습니다. 관계를 적고
검토하는 책임은 사람과 호스트 에이전트에 있습니다. 원격 CI 결과와 실제 설치한 훅은
이 로컬 보고서의 근거에 포함하지 않습니다. 이 문서는 향후 할 일 목록을 관리하지 않습니다.

<a name="doltap-d-0kk90ace-end" id="doltap-d-0kk90ace-end"></a>
