<a name="doltap-d-5ma2gx4q-start" id="doltap-d-5ma2gx4q-start"></a>

# 처음 쓰는 사람을 위한 안내 — 상태

## 작업 위치

| 항목 | 값 |
| --- | --- |
| 작업 위치 | workstream/010-user-guide |
| 기준 브랜치 | 009 완료를 반영한 main의 b60d15d |
| 반영 대상 | main, 이번에는 반영하지 않음 |
| 원격 작업 흔적 | 로컬 브랜치와 로컬 커밋만, push·PR 없음 |

사용자가 009 종료 뒤 새 로컬 브랜치에서 진행하도록 요청했습니다.
개별 운영 문서 수정과 로컬 커밋은 승인됐으며 이 대작업의 push·종료는 금지입니다.

## 현재 단계

가이드 작성과 로컬 검증을 마쳤고 사용자 검토 대기입니다. 010은 활성 상태로 유지합니다.

- 현재 설치 URL 7곳을 실제 저장소명 doltap으로 맞췄습니다.
- 가이드 11개를 작성했습니다. 개념과 대작업 생성 → 진행 → 아카이브 흐름은
  별도 문서로 설명합니다. 기존 GRAPH의 상세 설명은 reference와 hooks에 옮겼습니다.
- README 두 벌·APPLY·활성 사양과 프로젝트 안내를 연결하고 guide를 배포에 넣었습니다.
- 009 원격 CI의 Windows / Node 24 잠금 열기 실패를 로그로 확인했습니다.
  해당 EPERM 처리 경로를 보완하고 별도 로컬 커밋에 시험·보고서를 담았습니다.

## 검증

- 전체 시험 202개와 check template 통과. 골격의 확인 5개는 채우기 자리입니다.
- 파일별 보고서 8개와 202개 시험 일치 검사 통과. check . 문제·확인 0, git diff --check 통과.
- guide 시나리오: CLI 호출 38개, 내부 링크 목적지 파일 73곳 통과.
- 실제 tarball: 파일 44개, guide 11개, GRAPH 없음. 패키지 CLI의 init → check 통과.
- 새 GitHub 주소의 npx check template 실행 통과.
- 잠금 보완: 오류 주입 시험과 로컬 Windows / Node 22 동시 발급 시험 20회 통과.
- 상세 근거: docs/trials/guide.md, docs/trials/ci-009.md.

## 다음 행동

사용자 검토를 기다립니다. main 반영·push·010 종료·아카이브·브랜치 삭제는 하지 않습니다.
향후 반영이 승인되면 Windows / Node 24 원격 CI를 다시 확인해야 합니다.

## 검증 한계

009 main의 원격 CI는 6개 중 5개 환경이 통과했고 Windows / Node 24는 시험 1개가
실패했습니다. 로컬 보완을 push하지 않았으므로 원격 실패를 해결 완료로 표시하지 않습니다.
가이드를 처음 읽는 사용자의 이해도를 관찰하는 시험과 실제 설치한 훅 검증은 하지
않았습니다. 과거 기록의 역사적 이름과 현재 checkout 폴더명은 그대로입니다.

<a name="doltap-d-5ma2gx4q-end" id="doltap-d-5ma2gx4q-end"></a>
