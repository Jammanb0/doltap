<a name="doltap-d-9tgvms63-start" id="doltap-d-9tgvms63-start"></a>

# 대작업 이력

> 완료하거나 취소한 대작업의 결과와 기록 위치를 찾기 위한 짧은 색인입니다.
> 현재 진행 상태나 상세 연대기는 기록하지 않습니다.

| 기간 | 대작업 | 결과 | 기록 |
| --- | --- | --- | --- |
| 2026-09-06~07 | cairn 구조 적용 | 완료 — 이 저장소가 자기 문서 골격으로 운영됩니다. 규칙과 목표가 문서로 남고 `cairn check`가 연결을 확인합니다 | `.doltap/archive/legacy/workstreams/001-cairn-setup/README.md` |
| 2026-09-08~09 | 문서 역할 분리 | 완료 — 문서마다 역할이 하나씩인 0.2.0 구조로 골격·적용 절차·검사기를 옮기고, 대작업 종료 절차에 승인과 검증 단계를 넣었습니다. 0.1.x 와 호환되지 않습니다 | `.doltap/archive/legacy/workstreams/002-document-roles/README.md` |
| 2026-09-09 | 검증과 시험 기록 개편 | 완료 — 0.2 구조에서 적용·이어받기·마무리를 실제로 돌려 확인하고, 시험 기록을 누적 일지에서 검증 현황 보고서로 바꿨습니다. 적용 절차의 삭제 위험 하나를 고쳤습니다 | `.doltap/archive/legacy/workstreams/003-verify-and-report/README.md` |
| 2026-09-09~10 | 안전한 적용 | 완료 — 적용 중 승인과 기록 보존, 개인정보가 든 골격 경로와 이름 가정을 정리하고 기존 프로젝트에서 Codex가 승인부터 아카이브까지 이어가는 것을 확인했습니다 | `.doltap/archive/legacy/workstreams/004-safe-apply/README.md` |
| 2026-09-10 | 아카이브 검사 범위 | 완료 — 검사기가 아카이브를 탐색 전에 빼고 활성 쪽 결함만 봅니다. 이어서 드러난 판정 오탐 둘과 미탐 하나까지 고쳐 `cairn check .`의 확인이 0개가 됐습니다 | `.doltap/archive/legacy/workstreams/005-archive-scope/README.md` |
| 2026-09-10 | 승인의 경계 | 완료 — 무엇을 사용자 승인으로 인정하는지 `AGENTS.md`·`workstreams.md`·`APPLY.md`에 명시했습니다. 붙여 넣은 보고나 검토 의견 안의 허락은 승인이 아니고, 마칠 때는 실행할 항목을 보여주고 직접 승인받은 것만 합니다 | `.doltap/archive/legacy/workstreams/006-approval-boundary/README.md` |
| 2026-09-10 | 첫인상과 군더더기 | 완료 — README 두 벌에 배포되는 `template/`과 자기 적용본의 구분을 밝히고, 외부 사용이 확인되지 않은 0.1.x 이관 안내를 검사기·시험·문서에서 걷어냈습니다 | `.doltap/archive/legacy/workstreams/007-first-impression/README.md` |
| 2026-09-10 | 승인의 종료점 | 완료 — 승인한 지점에 필요한 앞 단계만 포함하고 이후 단계와 작업 브랜치 삭제는 따로 승인받도록 규칙과 종료 절차를 보완했습니다 | `.doltap/archive/legacy/workstreams/008-approval-endpoint/README.md` |
| 2026-09-11~13 | 문서 그래프 기반 | 완료 — ID·관계·최신 검토·조회·이관·복구와 묶음 삭제를 구현하고 현재 사양을 활성 문서로 분리함 | `.doltap/archive/workstreams/009-document-graph/README.md` |
| 2026-09-13~14 | 처음 쓰는 사람을 위한 안내 | 완료 — 사용 안내 12개와 환경별 적용 절차를 작성하고 Windows 잠금 보완을 원격 6개 환경에서 확인함 | `.doltap/archive/workstreams/010-user-guide/README.md` |
| 2026-09-14 | 최종 점검 보완 | 완료 — 검사가 놓치던 경로 표기와 빈 ID 대장, 일반 링크가 남은 삭제를 고치고 미리보기 설명을 실제 동작에 맞춤. README 두 언어에 소개와 대표 이미지를 넣음 | `.doltap/archive/workstreams/011-final-polish/README.md` |
| 2026-09-15 | CI 시험 안정화 | 완료 — 잠금 시험의 PID 환경 의존을 제거하고 Ubuntu·macOS·Windows × Node 22·24 원격 CI 통과를 확인함 | `.doltap/archive/workstreams/012-ci-stability/README.md` |
<!-- 대작업을 마칠 때마다 한 줄씩 더합니다. 결과는 완료일 수도 취소일
     수도 있고, 어느 쪽이든 남깁니다.
     예) | 2026-09-02~03 | 초기 파이프라인 구축 | 완료 — 무엇이 가능해졌는지 한 줄 | `.doltap/archive/workstreams/001-initial-pipeline/README.md` |
     예) | 2026-09-04 | 다국어 문서 | 취소 — 구조가 자주 바뀌어 번역이 계속 어긋남 | `.doltap/archive/workstreams/003-i18n-docs/README.md` | -->

- `indexes` [README.md](../archive/legacy/workstreams/001-cairn-setup/README.md#doltap-d-7ay3ap4e-start)

- `indexes` [README.md](../archive/legacy/workstreams/002-document-roles/README.md#doltap-d-zkdqf9se-start)

- `indexes` [README.md](../archive/legacy/workstreams/003-verify-and-report/README.md#doltap-d-80ccq92z-start)

- `indexes` [README.md](../archive/legacy/workstreams/004-safe-apply/README.md#doltap-d-rxk3xb7d-start)

- `indexes` [README.md](../archive/legacy/workstreams/005-archive-scope/README.md#doltap-d-wxxj5vs5-start)

- `indexes` [README.md](../archive/legacy/workstreams/006-approval-boundary/README.md#doltap-d-4svrcedy-start)

- `indexes` [README.md](../archive/legacy/workstreams/007-first-impression/README.md#doltap-d-3dakc346-start)

- `indexes` [README.md](../archive/legacy/workstreams/008-approval-endpoint/README.md#doltap-d-b27smchj-start)

- `indexes` [문서 그래프 기반](../archive/workstreams/009-document-graph/README.md#doltap-d-n0k25q71-start)

- `indexes` [처음 쓰는 사람을 위한 안내](../archive/workstreams/010-user-guide/README.md#doltap-d-rpw9dv94-start)

- `indexes` [최종 점검 보완](../archive/workstreams/011-final-polish/README.md#doltap-d-nb1zqwt1-start)

- `indexes` [CI 시험 안정화](../archive/workstreams/012-ci-stability/README.md#doltap-d-0hpzfjcz-start)

<a name="doltap-d-9tgvms63-end" id="doltap-d-9tgvms63-end"></a>
