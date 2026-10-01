# 시작하기 흐름

[검증 기록](README.md) · [시작하기](../guide/getting-started.md)

## 대상

- doltap 1.0.0, 구현 SHA-256 `3b36e42532ea79b7a423d8a71978eaf21db51dc66276a0a08ade4e6d93a08f21`
- 안내 문서 `docs/guide/getting-started.md`

## 방법

2026-10-02, Windows 11(win32 x64), Node v22.14.0, Git Bash. 안내의 명령을 적힌 순서대로 새
임시 폴더에서 실행하고, 단계마다 종료 코드와 출력이 안내의 설명·예시와 맞는지 대조했습니다.
명령은 소스 작업 트리의 `node bin/doltap.mjs`로 실행했습니다.

판정 기준: 단계마다 안내가 말한 종료 코드와 진단 코드·요약이 나올 것. ID는 실행마다 새로
만들어지므로 비교하지 않습니다.

## 결과

| 단계 | 명령 | 종료 코드 | 안내와 대조 |
| --- | --- | --- | --- |
| 준비 | `--help` | 0 | 사용법이 나옴 |
| 1 | `init ../my-project` | 0 | `AGENTS.md`, `.doltap/current.md`, `.doltap/history.md`가 생김 |
| 1 | `check` | 0 | `PLACEHOLDER` 1개(5, 44, 51행), 관리 문서 3개·범위 3개·관계 0개. 예시와 같음 |
| 2 | `id` 미리보기, `id --apply` 두 번 | 0 | 미리보기는 파일을 바꾸지 않고, 적용하면 문서 범위가 생김 |
| 2 | `id --kind s --at` 두 번 | 0 | 제목부터 절 끝까지 감싼 범위가 생김. 안내의 결과 문서와 같은 모양 |
| 3 | `relate … same-as … --apply` | 0 | 양쪽 시작 표식에 서로를 가리키는 선언이 들어감 |
| 4 | `check` | 0 | `REVIEW_PENDING`(새 관계)과 `PLACEHOLDER`. 관리 문서 5개·범위 7개·관계 1개·검토 대기 1개. 예시와 같음 |
| 4 | `review`, `show --body` | 0 | 검토할 관계, 확인할 점, 사람용·AI용 기록 명령, 두 범위의 본문이 나옴 |
| 4 | `review … --by human --apply`, `check` | 0, 0 | `.doltap/reviews.json`이 생기고(계산 방식 번호 1 포함) 검토 대기 0개 |
| 5 | 영어 쪽에 FreeBSD를 더하고 `check` | 1 | `SAME_AS_SKELETON`(글머리 목록 3항목과 4항목)과 `REVIEW_PENDING`(한쪽 변경). 예시와 같음 |
| 5 | 한국어 쪽에도 더하고 `check` | 0 | 골격 문제가 사라지고 검토 대기(양쪽 변경)만 남음 |
| 5 | 다시 검토하고 `check` | 0, 0 | 검토 대기 0개 |

검사 결과에서 두 문서 가운데 어느 쪽이 먼저 나오는지는 ID 순서를 따르고, 안내에도 그렇게
적혀 있습니다. 이번 실행에서는 안내 예시처럼 영어 문서가 먼저 나왔습니다.

## 적용 범위

Windows 11, Node v22.14.0, Git Bash에서 안내의 흐름이 끝까지 진행되고 예시와 같은 판정이
나온다는 확인입니다.

## 재실행

소스 폴더에서 `node scripts/implementation-hash.mjs`로 같은 구현인지 확인한 뒤,
`docs/guide/getting-started.md`를 위에서부터 따라 하며 단계마다 종료 코드(`echo $?`)와 검사 요약을
위 표와 비교합니다.
