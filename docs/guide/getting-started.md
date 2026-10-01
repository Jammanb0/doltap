# 시작하기

[사용 안내](README.md) · 다음: [표식과 관계](format.md)

이 문서에서는 새 프로젝트를 만들고, 한국어와 영어 설치 안내 두 문서를 "같은 내용을
유지해야 하는 관계"로 이은 뒤, 한쪽을 고쳤을 때 doltap이 무엇을 알려 주는지 따라가
봅니다. 이미 작업 중인 프로젝트에 적용하려면 이 문서로 흐름을 익힌
다음 [적용 절차](../../APPLY.md)를 따르세요.

## 준비

Node.js 22 이상이 필요합니다. 따로 설치할 의존성이나 빌드 단계는 없습니다. 명령을
입력하는 창(터미널)에서 버전을 확인합니다.

```sh
node --version
```

`v22`나 그보다 높은 숫자가 나오면 됩니다. 다음으로 doltap 소스를 받습니다.

```sh
git clone https://github.com/Jammanb0/doltap
cd doltap
node bin/doltap.mjs --help
```

사용법이 나오면 준비가 끝났습니다. 이 안내에서 `doltap`이라고 쓴 곳은
`node <doltap 폴더>/bin/doltap.mjs`로 바꿔 실행합니다. 예를 들어 doltap 폴더 옆에 프로젝트를
만들었다면 그 프로젝트 안에서는 `node ../doltap/bin/doltap.mjs`입니다.

## 1. 새 프로젝트 만들기

doltap 폴더에서 옆에 새 프로젝트를 만듭니다.

```sh
node bin/doltap.mjs init ../my-project
```

세 파일이 생깁니다.

| 파일 | 역할 |
| --- | --- |
| `AGENTS.md` | 사람과 AI가 따르는 규칙, 작업을 시작할 때 읽을 곳 |
| `.doltap/current.md` | 진행 중인 작업 목록 |
| `.doltap/history.md` | 마친 작업 목록 |

만든 프로젝트로 옮겨 검사해 봅니다.

```sh
cd ../my-project
doltap check
```

```text
! 확인 1개
  [PLACEHOLDER] AGENTS.md
    아직 채우지 않은 자리 3곳 (5, 44, 51행)
    다음: 표시된 줄을 프로젝트에 맞게 채우고 처리한 자리표시 주석을 지우세요.

✓ 통과
  관리 문서 3개 · 범위 3개 · 관계 0개
```

`!`로 시작하는 확인 항목은 오류가 아니라 사람이 볼 것입니다. `AGENTS.md`에 프로젝트
설명처럼 아직 채우지 않은 자리가 있다는 뜻입니다. AI에게 맡길 수 있습니다.

```text
AGENTS.md의 채우기 자리를 이 프로젝트에 맞게 채워줘.
확인되지 않는 것은 지어내지 말고 확인 필요로 남겨줘.
```

## 2. 문서에 범위 표식 달기

설치 안내 두 개를 만듭니다. 편집기로 직접 써도 되고 AI에게 맡겨도 됩니다.

`docs/install.md`

```markdown
# 설치

## 설치 조건

Node.js 22 이상이 필요합니다.

- Windows
- macOS
- Linux
```

`docs/en/install.md`

```markdown
# Install

## Requirements

Node.js 22 or later is required.

- Windows
- macOS
- Linux
```

doltap이 이 문서들을 알아보려면 **범위 표식**이 있어야 합니다. 표식은 HTML 주석이라
렌더링한 화면에는 보이지 않습니다. 먼저 문서 전체를 감싸는 표식을 넣습니다. `--apply` 없이
실행하면 바뀔 내용만 보여 줍니다.

```sh
doltap id docs/install.md
doltap id docs/install.md --apply
doltap id docs/en/install.md --apply
```

그다음 관계를 맺을 절에 범위를 만듭니다. `--at`에는 절의 제목을 적습니다.

```sh
doltap id docs/install.md --kind s --at "설치 조건" --apply
doltap id docs/en/install.md --kind s --at Requirements --apply
```

`docs/install.md`는 이렇게 바뀝니다. ID는 실행할 때마다 새로 만들어지므로 여러분의
화면과 다릅니다. 이후 명령에는 자기 화면에 나온 ID를 씁니다. 검사 결과에서 두 문서 가운데
어느 쪽이 먼저 나오는지도 ID에 따라 달라집니다.

```markdown
<!-- doltap:start doltap-d-dbwtr2gv -->

# 설치

<!-- doltap:start doltap-s-e3f0emcv -->
## 설치 조건

Node.js 22 이상이 필요합니다.

- Windows
- macOS
- Linux
<!-- doltap:end doltap-s-e3f0emcv -->

<!-- doltap:end doltap-d-dbwtr2gv -->
```

## 3. 관계 잇기

두 절은 번역 관계라서 같은 의미와 구성을 유지해야 합니다. 이런 관계가 `same-as`입니다.

```sh
doltap relate doltap-s-e3f0emcv same-as doltap-s-4txkm0y0 --apply
```

양쪽 시작 표식에 서로를 가리키는 선언이 함께 들어갑니다.

```markdown
<!-- doltap:start doltap-s-e3f0emcv
same-as: doltap-s-4txkm0y0
-->
```

관계를 적는 방법과 세 가지 관계를 고르는 기준은 [표식과 관계](format.md)에 있습니다.

## 4. 검사하고 검토 기록 남기기

```sh
doltap check
```

새 관계는 아직 아무도 확인하지 않았으므로 검토 대기로 나옵니다. 오류가 아니라서 종료
코드는 0입니다. 아래 출력에서 줄인 부분은 `…`로 표시했습니다. `PLACEHOLDER`는 1단계에서 본
채우기 자리입니다.

```text
! 확인 2개
  [PLACEHOLDER] AGENTS.md
    …
  [REVIEW_PENDING] docs/en/install.md:5
    동일 관계 검토 대기: same-as doltap-s-4txkm0y0 ↔ doltap-s-e3f0emcv
    검토 기록이 없습니다(새 관계)
    관련: docs/en/install.md:5 — doltap-s-4txkm0y0 Requirements
    관련: docs/install.md:5 — doltap-s-e3f0emcv 설치 조건
    다음: doltap show <ID> 로 두 범위를 읽고 관계가 여전히 맞는지 확인하세요. …

✓ 통과
  관리 문서 5개 · 범위 7개 · 관계 1개
  검토 기록이 최신인 관계 0개 · 검토 대기 1개
```

`doltap review`는 검토할 관계와 확인할 점, 기록 명령을 모아 보여 줍니다. 두 범위의 본문은
`doltap show <ID> --body`로 함께 읽을 수 있습니다.

```sh
doltap review
doltap show doltap-s-e3f0emcv --body
```

두 절을 읽고 같은 내용임을 확인했다면 무엇을 확인했는지 적어 기록합니다. 사람이 확인했으면
`--by human`, AI가 확인했으면 `--by agent`를 씁니다.

```sh
doltap review doltap-s-e3f0emcv doltap-s-4txkm0y0 --note "두 문서의 설치 조건과 지원 운영체제가 같음" --by human --apply
```

기록은 `.doltap/reviews.json`에 남고, 다시 검사하면 검토 대기가 사라집니다. 검토 기록은
문서 본문을 바꾸지 않습니다.

## 5. 한쪽을 고치면

영어 문서에만 FreeBSD를 더했다고 해 봅시다.

```markdown
- Windows
- macOS
- Linux
- FreeBSD
```

```sh
doltap check
```

```text
✗ 문제 1개
  [SAME_AS_SKELETON] docs/en/install.md:12
    same-as 골격이 다릅니다: 3번째 요소 — doltap-s-4txkm0y0는 글머리 목록 4항목, doltap-s-e3f0emcv는 글머리 목록 3항목
    관련: docs/install.md:12 — doltap-s-e3f0emcv의 같은 자리
    다음: …

! 확인 2개
  [PLACEHOLDER] AGENTS.md
    …
  [REVIEW_PENDING] docs/en/install.md:5
    동일 관계 검토 대기: same-as doltap-s-4txkm0y0 ↔ doltap-s-e3f0emcv
    지난 검토 뒤 doltap-s-4txkm0y0가 바뀌었습니다. doltap-s-e3f0emcv와 여전히 같은 의미와 골격인지 확인하세요
    …

· 요약
  관리 문서 5개 · 범위 7개 · 관계 1개
  검토 기록이 최신인 관계 0개 · 검토 대기 1개
```

두 가지를 알려 줍니다. 목록 항목 수가 달라 **골격이 어긋났다**는 문제(종료 코드 1)와,
지난 검토 뒤 영어 쪽이 **바뀌었으니 다시 확인하라**는 검토 대기입니다. 한국어 문서에도
FreeBSD를 더하면 골격 문제는 사라지고, 두 절을 읽어 확인한 뒤 다시 검토를 기록하면 검토
대기도 사라집니다.

반대로 FreeBSD가 영어 문서에만 있어야 하는 내용이라면 두 절은 더 이상 같은 내용이
아닙니다. 그때는 관계를 해제하거나(`doltap unrelate`) 맞는 관계로 바꿉니다. 검사를
통과시키려고 관계를 느슨하게 바꾸지는 않습니다.

## 다음으로

- 여러 날 이어지는 작업을 남기고 이어받는 방법: [작업 기록](workstreams.md)
- AI 에이전트가 이 흐름을 따르게 하는 방법: [에이전트와 함께 쓰기](with-agents.md)
- 모든 명령과 옵션: [명령 참고](commands.md)
