# 검사 항목 참고

[사용 안내](README.md) · [명령 참고](commands.md)

`doltap check`가 내는 모든 코드입니다. **문제**는 기계가 판정할 수 있는 어긋남이라 종료
코드 1이 되고, **확인**은 사람이나 AI가 판단할 것이라 종료 코드에 영향을 주지 않습니다
(`--strict`면 검토 대기도 실패로 셉니다). 표식과 관계, 지문의 규칙은 [표식과 관계](format.md)에
있습니다.

## 읽는 법

```text
✗ 문제 1개
  [RELATION_COUNTERPART_MISSING] docs/install.md:6
    doltap-s-e0000001에 대응 선언이 없습니다 — depends-on: doltap-s-e0000001의 짝은 depended-on-by: doltap-s-k0000001입니다
    관련: docs/en/install.md:5 — doltap-s-e0000001 시작 표식
    다음: 관계를 유지하려면 관련 위치의 시작 표식에 짝 선언을 추가하고, …
```

첫 줄은 코드와 위치(`경로:줄`), 그 아래는 이유, `관련:`은 함께 볼 위치, `다음:`은 고치는
방향입니다. 검사는 무엇을 어떻게 고칠지 대신 정하지 않습니다. 의도한 관계가 맞는지 먼저
판단하고, 맞으면 내용을, 잘못 적었으면 관계를 고칩니다. 검사를 통과시키려고 관계를
느슨하게 바꾸지 않습니다.

## 표식

| 코드 | 종류 | 뜻과 조건 | 다음 행동 |
| --- | --- | --- | --- |
| `MARKER_MALFORMED` | 문제 | 표식처럼 보이지만 형식이 틀림. 모르는 지시어, ID 없음·형식 틀림·대문자, 표식 뒤 다른 내용, 읽을 수 없는 관계 줄, 닫히지 않은 시작 주석, 줄 가운데의 표식, 다른 HTML 주석에 갇힌 표식 | 메시지가 가리키는 부분을 [표식 형식](format.md#범위-표식)에 맞게 고칩니다 |
| `MARKER_CROSSED` | 문제 | 안쪽 범위가 닫히기 전에 바깥 범위를 닫음. 바깥 범위는 무효가 됨 | 관련 위치의 시작 표식과 대조해 안쪽 범위를 먼저 닫습니다 |
| `MARKER_END_WITHOUT_START` | 문제 | 열린 적 없는 ID로 닫거나 같은 범위를 두 번 닫음 | 시작 표식을 되살리거나 필요 없는 끝 표식을 지웁니다 |
| `MARKER_UNCLOSED` | 문제 | 시작한 범위가 파일 끝까지 닫히지 않음 | 범위가 끝나는 곳에 같은 ID의 끝 표식을 둡니다 |
| `DOCUMENT_ANCHOR_MISSING` | 문제 | 표식이 있는 문서에 문서 전체를 감싸는 `d` 범위가 없음 | `doltap id <파일>`로 문서 범위를 만듭니다 |
| `DOCUMENT_ANCHOR_MULTIPLE` | 문제 | 최상위 `d` 범위가 둘 이상 | 하나만 남기고, 나머지가 안쪽 범위라면 `s`·`b` ID로 바꿉니다 |
| `DOCUMENT_BODY_OUTSIDE` | 문제 | 문서 범위 밖에 본문이 있음(빈 줄, 맨 앞의 front matter, HTML 주석은 괜찮음) | 본문 전체가 문서 범위 안에 들도록 표식을 옮깁니다 |
| `ID_KIND` | 문제 | `d`가 다른 범위 안에 있거나 `s`·`b`가 문서 범위 밖에 있음 | 종류에 맞는 자리로 옮기거나 `doltap id --kind <종류>`로 새 ID를 받아 바꿉니다 |
| `ID_DUPLICATE` | 문제 | 같은 ID가 두 곳 이상에 있음. 복사한 문서에서 흔함. 그 ID가 걸린 관계는 판정하지 않음 | 원래 범위를 정하고 복사본에 새 ID를 씁니다. 관계 선언이 어느 쪽을 가리켜야 하는지 확인합니다 |

표식 문제가 있는 파일에서는 연쇄 오류를 막으려고 문서 범위 규칙(`DOCUMENT_*`, `ID_KIND`)을
보고하지 않습니다. 표식을 고친 뒤 다시 검사하세요.

## 관계

| 코드 | 종류 | 뜻과 조건 | 다음 행동 |
| --- | --- | --- | --- |
| `RELATION_UNKNOWN` | 문제 | 관계 이름이 `same-as`·`depends-on`·`depended-on-by`·`consistent-with`가 아님. 비슷한 이름이면 함께 알림 | 뜻에 맞는 관계를 고르거나, 단순 참고라면 일반 링크로 바꿉니다 |
| `RELATION_TARGET_INVALID` | 문제 | 대상이 ID 형식이 아님(경로나 제목을 적음) | 대상 범위의 ID를 적습니다 |
| `RELATION_SELF` | 문제 | 자기 자신을 대상으로 함 | 그 선언을 지웁니다 |
| `RELATION_TARGET_MISSING` | 문제 | 대상 ID의 범위가 없음. 대상을 지웠거나 ID를 잘못 적음 | 지웠다면 선언을 지우거나 `doltap unrelate`로 해제합니다. 옮겼다면 실제 ID로 고칩니다 |
| `RELATION_DUPLICATE` | 문제 | 같은 범위가 같은 선언을 두 번 적음 | 하나만 남깁니다 |
| `RELATION_CONFLICT` | 문제 | 한 범위가 같은 상대에게 서로 다른 관계를 둘 이상 적음 | 맞는 관계 하나를 정해 양쪽 선언을 맞춥니다 |
| `RELATION_MISMATCH` | 문제 | 양쪽이 서로 다른 관계를 적었거나, 두 쪽 모두 상대를 기준(`depends-on`)으로 적음 | 의도한 관계를 정해 두 쪽 선언을 고칩니다 |
| `RELATION_COUNTERPART_MISSING` | 문제 | 한쪽에만 선언이 있음. 필요한 짝 선언을 메시지에 보여 줌 | 관계를 유지하려면 짝 선언을 추가하고, 해제하는 중이면 남은 선언을 지웁니다 |
| `SAME_AS_SKELETON` | 문제 | `same-as` 두 범위의 골격(제목 수준, 문단, 목록, 표, 코드 블록 등)이 다름. 처음 달라진 자리를 양쪽 줄과 함께 보여 줌 | 구성을 맞추거나, 같은 골격을 유지할 관계가 아니면 관계를 다시 정합니다 |

두 끝이 모두 보관 문서(`.doltap/archive/` 아래)인 관계는 짝 선언·골격 검사와 검토 대기에서
뺍니다. 활성 문서와 보관 문서 사이의 관계는 그대로 검사합니다. 없는 대상을 가리키는 선언은
어느 문서에 있든 알립니다.

## 검토

| 코드 | 종류 | 뜻과 조건 | 다음 행동 |
| --- | --- | --- | --- |
| `REVIEW_PENDING` | 확인 | 양쪽 선언이 맞은 관계에 검토 기록이 없거나, 마지막 검토 뒤 한쪽 이상의 본문이 바뀌었거나, 검토 기록을 남긴 doltap과 지금 doltap의 비교 방식이 다름 | `doltap show <ID> --body`로 두 범위를 읽고 확인한 뒤 `doltap review <ID> <ID> --note … --by … --apply`로 기록합니다 |
| `REVIEWS_INVALID` | 문제 | `.doltap/reviews.json`을 읽을 수 없거나 형식이 다름. 모든 관계를 기록 없음으로 봄 | Git 기록 등에서 되살리거나 형식에 맞게 고칩니다. 쓰기 명령은 이 파일을 덮어쓰지 않습니다 |

`REVIEW_PENDING`의 `reason`은 아래 가운데 하나입니다.

| `reason` | 조건 | 확인할 것 |
| --- | --- | --- |
| `unreviewed` | 기록이 없음(새 관계) | 관계가 성립하는지 |
| `basis-changed` | 의존 관계에서 기준만 바뀜 | 의존하는 쪽이 새 기준에 맞는지 |
| `dependent-changed` | 의존 관계에서 의존하는 쪽만 바뀜 | 바뀐 내용이 기준에 맞는지. 기준을 바꾸라는 뜻이 아님 |
| `one-changed` | 대칭 관계에서 한쪽만 바뀜 | 다른 쪽과 여전히 같은 뜻(`same-as`)인지, 함께 적용해도 어긋나지 않는지(`consistent-with`) |
| `both-changed` | 양쪽이 바뀜 | 관계가 여전히 성립하는지 |
| `method-changed` | 검토 기록을 남긴 뒤 doltap의 비교 방식(지문 계산 방식)이 바뀌어 내용 변경을 판단할 수 없음 | 관계가 여전히 성립하는지. 내용이 바뀌었다는 뜻은 아님 |
| `method-newer` | 지금보다 새 doltap이 남긴 검토 기록 | doltap을 새로 받은 뒤 다시 검사합니다 |

`doltap show`는 관계마다 검토 상태를 `최신`, `변경 후 재검토 필요`, `검토 기록 없음`,
`비교 방식이 바뀌어 재검토 필요`, `더 새 doltap의 기록이라 비교할 수 없음`으로 보여 줍니다. 검토
기록은 내용이 참이라는 증명이나 사용자 승인이 아닙니다.

## 링크

| 코드 | 종류 | 뜻과 조건 | 다음 행동 |
| --- | --- | --- | --- |
| `LINK_FILE_MISSING` | 문제 | 보관 문서가 아닌 관리 문서의 로컬 링크(이미지와 링크 참조 정의 포함)가 없는 파일을 가리킴. `/`로 시작하면 프로젝트 기준, 아니면 문서 폴더 기준이며 `%` 인코딩은 풀어서 찾음 | 경로를 실제 위치로 고치거나 지운 문서라면 링크를 정리합니다 |

외부 주소와 `#제목` 같은 문서 안 조각은 검사하지 않습니다. 코드 안의 링크도 보지 않습니다.

## 운영 구조

`.doltap/` 폴더가 없으면 `OPERATING_DIR_MISSING` 하나만 알리고 나머지 운영 검사는 하지
않습니다.

| 코드 | 종류 | 뜻과 조건 | 다음 행동 |
| --- | --- | --- | --- |
| `OPERATING_DIR_MISSING` | 문제 | `.doltap/`이 없음. 이 경우 아래 운영 검사는 하지 않음 | 새 프로젝트는 `doltap init`, 기존 프로젝트는 [적용 절차](../../APPLY.md)를 따릅니다 |
| `ENTRY_MISSING` | 문제 | `AGENTS.md`가 없음 | 규칙 원본인 `AGENTS.md`를 만들거나 되살립니다 |
| `ENTRY_CURRENT_MISSING` | 문제 | `AGENTS.md`의 주석·코드 밖 본문에 `.doltap/current.md`가 없음 | 작업을 시작할 때 `.doltap/current.md`를 읽으라는 안내를 넣습니다 |
| `REQUIRED_DOCUMENT_MISSING` | 문제 | `.doltap/current.md`나 `.doltap/history.md`가 없음 | 빠진 문서를 만듭니다 |
| `REQUIRED_ANCHOR_MISSING` | 문제 | `AGENTS.md`, `current.md`, `history.md`, 작업 폴더의 `README.md`·`status.md`에 표식이 없음 | `doltap id <파일>`로 문서 범위를 만듭니다 |
| `WORKSTREAM_DOCUMENT_MISSING` | 문제 | 작업 폴더에 `README.md`나 `status.md`가 없음 | 목적·범위와 현재 상태 문서를 만듭니다 |
| `WORKSTREAM_UNLISTED` | 문제 | 진행 중인 작업 폴더 이름이 `current.md`에 없음. 주석 속 예시나 다른 이름의 일부는 세지 않음 | `current.md`에 그 작업의 링크를 적습니다 |
| `WORKSTREAM_TARGET_MISSING` | 문제 | `current.md`가 `workstreams/<이름>/`을 가리키는데 그 폴더가 없음. 보관된 작업이면 그렇게 알림 | 마친 작업이면 `current.md`에서 빼고 `history.md`에 적습니다 |
| `WORKSTREAM_NUMBER_DUPLICATE` | 문제 | 작업 폴더 번호가 보관 폴더나 다른 작업과 겹침 | 새 작업에 쓰지 않은 번호를 붙이고 링크를 고칩니다 |
| `WORKSTREAM_NAME` | 확인 | 작업 폴더 이름이 `<세 자리 번호>-<영문 소문자·숫자·하이픈>`이 아님 | 이름을 바꾸고 `current.md`의 링크도 고칩니다 |
| `ARCHIVE_UNLISTED` | 확인 | 보관 폴더 이름이 `history.md`에 없음 | `history.md`에 한 줄 적습니다. 앞으로도 적용할 내용을 담당 문서에 반영했는지도 확인합니다 |
| `PLACEHOLDER` | 확인 | `AGENTS.md`나 보관 문서가 아닌 `.doltap/` 문서에 `<!-- 채우기:`, `<!-- 고르기:`, `<!-- 확인 필요:`로 시작하는 줄이 남음 | 프로젝트에 맞게 채우고 그 주석을 지웁니다 |
| `OPERATING_DIR_IGNORED` | 확인 | `.doltap/`이 Git에서 제외됨. 다른 checkout과 CI에는 기록이 없음 | 공유할 기록이면 제외 규칙을 고칩니다. 이 작업 공간에만 둘 의도면 그대로 둡니다 |

`CLAUDE.md`는 검사하지 않습니다. 필요할 때 두는 선택 파일입니다.

## 설정

| 코드 | 종류 | 뜻과 조건 | 다음 행동 |
| --- | --- | --- | --- |
| `CONFIG_INVALID` | 문제 | `.doltap/config.json`이 JSON이 아니거나 `exclude` 밖의 키, 문자열이 아닌 항목, 프로젝트 밖 경로, 필수 운영 문서를 빼는 항목이 있음. 고칠 때까지 설정을 쓰지 않음 | `{"exclude": ["경로", …]}` 형식으로 고치고 필수 운영 문서는 목록에서 뺍니다 |

`.doltap/config.json`의 `exclude`에는 예제·시험용 사본처럼 검사에서 뺄 파일이나 폴더를 적습니다.
경로는 프로젝트 기준이며 그 아래 전체가 빠집니다. 빠진 문서의 ID도 새 ID를 발급할 때는 피합니다.
`AGENTS.md`, `.doltap/current.md`, `.doltap/history.md`, 작업 폴더의 `README.md`·`status.md`는 항상
검사하므로 이 문서들이나 이 문서들을 담은 폴더(`.doltap`, `.doltap/workstreams` 등)는 뺄 수 없습니다.

```json
{
  "exclude": ["docs/examples"]
}
```

`.git`, `node_modules`, `dist`, `build`, `coverage`, `.doltap`을 뺀 숨김 폴더, 심볼릭 링크,
그리고 `.doltap` 폴더를 가진 하위 폴더(따로 운영하는 프로젝트)는 설정 없이도 읽지 않습니다.

## 검사가 판단하지 않는 것

같은 뜻인지, 근거에 맞는지, 두 절차가 실제로 맞물리는지, 내용과 관계 가운데 무엇을 고쳐야
하는지는 판단하지 않습니다. 앞으로도 적용할 결정이 작업 기록에만 남았는지도 보장하지
않습니다. 이런 판단은 사람이나 작업 중인 AI가 하고, 확인한 결과를 검토 기록으로 남깁니다.
