# 원격 CI

[검증 기록](README.md)

## 대상

- doltap 1.0.0, 구현 SHA-256 `3b36e42532ea79b7a423d8a71978eaf21db51dc66276a0a08ade4e6d93a08f21`
- 이 저장소의 첫 커밋 `ea3b055`와 그 커밋의 `.github/workflows/test.yml`

## 방법

2026-10-02(한국 시간), GitHub Actions. `main`에 첫 커밋을 올리자 워크플로가 실행됐습니다(실행
번호 36906925062). 아래 여섯 환경에서 저장소를 받아 `npm test`, `node bin/doltap.mjs check template`,
`node bin/doltap.mjs check .`을 차례로 실행합니다.

| 실행 이미지 | Node 22 | Node 24 |
| --- | --- | --- |
| `ubuntu-24.04` | v22.23.3 | v24.21.0 |
| `macos-26-arm64` | v22.23.2 | v24.20.0 |
| `windows-2025-vs2026` | v22.23.3 | v24.21.0 |

판정 기준: 여섯 환경 모두 세 단계가 종료 코드 0으로 끝날 것. 시험 110개가 모두 통과할 것.

## 결과

- 여섯 환경 모두 세 단계를 통과했습니다.
- 시험: 환경마다 110개 실행, 110개 통과, 0개 실패.
- `check template`: 통과. 확인 항목은 템플릿 `AGENTS.md`의 채우기 자리 안내 하나뿐입니다.
- `check .`: 통과. 관리 문서 5개, 범위 5개, 관계 1개이고 검토 대기는 0개입니다.
- 실행 기록: https://github.com/Jammanb0/doltap/actions/runs/36906925062

## 적용 범위

위 실행 이미지와 Node 버전에서 시험과 두 검사가 통과한다는 확인입니다.

## 재실행

`main`에 push하거나 pull request를 열면 같은 워크플로가 돕니다. 이미 끝난 실행은 GitHub의
Actions 화면에서 다시 실행하거나 `gh run rerun <실행 번호>`로 다시 돌립니다.
