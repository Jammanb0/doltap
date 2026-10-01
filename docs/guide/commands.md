# 명령 참고

[사용 안내](README.md) · [검사 항목 참고](checks.md)

모든 공개 명령과 옵션입니다. 표식과 관계의 형식은 [표식과 관계](format.md)에 있습니다.
`doltap`은 `node <doltap 폴더>/bin/doltap.mjs`를 줄여 쓴 것입니다.

## 공통

| 항목 | 내용 |
| --- | --- |
| 프로젝트 위치 | `--root <폴더>`. 기본값은 지금 폴더. `check`·`list`는 위치 인자로도 받지만 둘을 함께 쓸 수는 없습니다 |
| 기계용 출력 | `init`을 뺀 모든 명령이 `--json`을 받습니다 |
| 쓰기 | `id`(파일)·`relate`·`unrelate`·`review`(기록)는 바뀔 내용만 보여 주고, `--apply`를 붙였을 때 씁니다. `init`은 바로 만듭니다 |
| 옵션 값 | `--note "내용"`처럼 띄어 쓰거나 `--note=내용`처럼 붙입니다 |
| 도움말·버전 | `doltap --help`, `doltap --version` |

### 종료 코드

| 코드 | 뜻 |
| --- | --- |
| 0 | 성공. `check`는 문제가 없음(확인 항목은 있을 수 있음) |
| 1 | `check`가 문제를 찾음. `--strict`면 검토 대기도 포함 |
| 2 | 실행하지 못함: 모르는 명령·옵션, 없는 폴더·ID, 전제 조건 미충족, 쓰기 실패 |

### 쓰기와 보호

`--apply`를 붙이면 그 순간의 파일로 변경안을 만들고, 쓰기 직전에 파일이 그대로인지 다시
확인합니다. 그사이 다른 편집이 있었으면 아무것도 쓰지 않고 종료 코드 2로 끝납니다. 변경안을
만든 뒤에는 결과를 다시 읽어, 표식 문제가 새로 생기거나 검토 기록의 형식이 틀리면 쓰지 않고
종료 코드 2로 끝납니다. 파일마다 원래 줄 끝 방식(LF·CRLF)을 지켜 같은 폴더의 임시 파일에 쓴
뒤 이름을 바꿉니다. 여러
파일을 쓰다 중간에 실패하면 이미 쓴 파일과 쓰지 못한 파일을 나눠 알립니다. 되돌리지 않으며,
어긋난 선언은 다음 `doltap check`가 보여 줍니다. 백업이나 복구 자료는 만들지 않습니다.
두 프로그램이 같은 순간에 같은 파일을 쓰는 경우까지 막지는 않습니다.

미리보기는 파일마다 바뀐 줄을 `-`(지울 줄)와 `+`(넣을 줄)로 보여 주며, `@@ N행 @@`의
줄 번호는 바꾸기 전 파일 기준입니다.

### `--json` 출력

| 명령 | `schema` |
| --- | --- |
| `check` | `doltap.check.v2` |
| `list` | `doltap.list.v1` |
| `show` | `doltap.show.v1` |
| `review`(목록) | `doltap.review.v1` |
| `id --kind`(파일 없이) | `doltap.id.v1`. 새 ID를 `id`에 담습니다 |
| `id`(파일)·`relate`·`unrelate`·`review`(기록) | `doltap.write.v1` |

`doltap.write.v1`은 `command`, `applied`(썼으면 `true`), `preview`(사람용 미리보기와 같은
변경 내용)를 갖습니다. `--apply`를 붙였으면 `written`(쓴 파일), `failed`(실패한 파일과 이유,
없으면 `null`), `notWritten`(쓰지 못한 파일)도 갖습니다. 명령에 따라 `id`, `relation`,
`pruned`, `removedReviews`가 더해집니다.

모르는 명령·옵션이나 거부된 변경처럼 실행하지 못한 경우(종료 코드 2)에는 JSON 없이 표준
오류에 이유를 씁니다. 예외는 둘입니다. `show`에 없는 ID를 주면 남은 선언을 담은 결과를,
여러 파일을 쓰다 중간에 실패하면 위 쓰기 결과를 내고 종료 코드 2로 끝납니다. 예상하지 못한
오류의 자세한 위치가 필요하면 환경 변수 `DOLTAP_DEBUG=1`을 두고 다시 실행합니다.

## init

```text
doltap init <폴더>
```

새 폴더에 기본 구조를 만듭니다.

- 만드는 파일: `AGENTS.md`, `.doltap/current.md`, `.doltap/history.md`. `CLAUDE.md`는 만들지
  않습니다([에이전트와 함께 쓰기](with-agents.md)).
- 템플릿의 ID를 새로 발급한 ID로 바꿔 넣고, `AGENTS.md`의 프로젝트 이름 자리를 폴더 이름으로
  채웁니다.
- 폴더가 없으면 만들고, 비어 있지 않으면 아무것도 바꾸지 않고 종료 코드 2로 끝냅니다.
  작업 중인 프로젝트에는 [적용 절차](../../APPLY.md)를 따릅니다.

## check

```text
doltap check [폴더] [--strict] [--json]
```

프로젝트 전체를 검사합니다. 파일을 바꾸지 않습니다.

- 표식과 ID, 관계 선언, `same-as` 골격, 검토 상태, 일반 링크, 운영 구조를 봅니다.
  항목별 뜻은 [검사 항목 참고](checks.md)에 있습니다.
- 사람용 출력은 `✗ 문제`, `! 확인`, `✓ 통과`(문제가 있으면 `· 요약`) 순서입니다. 항목마다
  `[코드] 경로:줄`, 설명, `관련:` 위치, `다음:` 행동을 보여 줍니다.
- `--strict`: 검토 대기가 하나라도 있으면 종료 코드 1로 끝냅니다. CI에서 검토를 빠뜨리지
  않게 할 때 씁니다.
- `--json`: `schema`가 `doltap.check.v2`인 객체를 냅니다.

```json
{
  "schema": "doltap.check.v2",
  "ok": true,
  "problems": [],
  "notices": [
    {
      "code": "REVIEW_PENDING",
      "severity": "notice",
      "where": "docs/en/install.md:5",
      "location": { "path": "docs/en/install.md", "line": 5 },
      "message": "…",
      "related": [{ "path": "docs/install.md", "line": 5, "label": "…" }],
      "hint": "…",
      "reason": "unreviewed",
      "relation": "doltap-s-4txkm0y0 same-as doltap-s-e3f0emcv"
    }
  ],
  "summary": { "documents": 5, "anchors": 7, "relations": 1, "reviewed": 0, "pending": 1, "excluded": 0, "nested": 0 }
}
```

`summary`는 관리 문서, 범위, 양쪽 선언이 맞은 관계, 검토가 최신인 관계, 검토 대기, 설정으로
뺀 문서, 읽지 않은 하위 프로젝트의 수입니다. 경로는 모두 프로젝트 기준이며 절대 경로는
내보내지 않습니다.

## list

```text
doltap list [폴더] [--json]
```

관리 문서와 그 안의 범위를 파일별로 보여 줍니다. 범위마다 줄 범위, ID, 제목, 선언한 관계
수가 나오며 안쪽 범위는 들여씁니다. 보관 문서에는 `[보관]`이 붙습니다. 범위의 제목은 본문의
첫 제목이고, 제목이 없으면 첫 글 줄(목록 기호와 강조 표시를 빼고 60자가 넘으면 줄임), 그것도
없으면 파일 이름입니다.

```text
docs/install.md
  1–17      doltap-d-dbwtr2gv  설치
  5–15        doltap-s-e3f0emcv  설치 조건  · same-as 1
```

`--json`: `schema`가 `doltap.list.v1`이고 `documents[].anchors[]`에 `id`, `kind`, `title`,
`startLine`, `endLine`, `depth`, `parent`, `declarations`가 들어갑니다.

## show

```text
doltap show <ID> [--body] [--json]
```

범위 하나의 위치, 직접 관계, 검토 상태, 간접 연결을 보여 줍니다.

- 직접 관계마다 상대 범위의 ID·제목·위치, 의존 관계에서의 역할(기준·의존하는 쪽), 검토
  상태(최신·변경 후 재검토 필요·검토 기록 없음·비교 방식이 바뀌어 재검토 필요·더 새 doltap의
  기록이라 비교할 수 없음)와 마지막 검토의 날짜·주체·메모가 나옵니다.
  양쪽 선언이 맞지 않거나 `same-as` 골격이 다르면 그 사실도 나옵니다.
- 간접 연결은 직접 관계의 상대가 맺은 다른 관계입니다. 검토 의무는 생기지 않습니다.
- `--body`: 이 범위와 직접 관계 상대의 본문을 함께 출력합니다. 표식 줄은 뺍니다.
- 없는 ID를 주면 그 ID를 가리키는 선언의 위치를 보여 주고 종료 코드 2로 끝냅니다. 범위를
  지운 뒤 남은 참조를 찾을 때 씁니다.
- `--json`: `schema`가 `doltap.show.v1`입니다.

## review

```text
doltap review [--json]
doltap review <ID> <ID> --note <확인한 내용> --by human|agent [--apply]
```

ID 없이 부르면 검토할 관계를 보여 줍니다. 바뀐 관계가 먼저, 기록이 없는 관계가 뒤에 옵니다.
관계마다 두 범위의 위치, 이유, 확인할 점과 기록 명령이 나옵니다. 기록 명령은 사람이 확인했을
때(`--by human`)와 AI가 확인했을 때(`--by agent`)를 따로 보여 주므로 그대로 복사해 `<확인한
내용>`만 바꾸면 됩니다. `same-as` 골격이 달라 아직 기록할 수 없는 관계에는 `먼저:`로 먼저 고칠
점이 붙습니다. 보관 범위끼리의 관계는 빠집니다. `--json`: `schema`가 `doltap.review.v1`이고
`pending[]`에 `key`, `kind`, `ends`, `state`, `changed`, `reason`, `message`, `check`(확인할 점),
`commands`(`human`·`agent`별 기록 명령)와, 기록할 수 없을 때 `blockedBy`가 들어갑니다.

ID 두 개를 주면 그 관계의 검토를 기록합니다.

- 바뀌는 파일: `.doltap/reviews.json`(없으면 만듭니다).
- `--note`: 무엇을 확인했는지. 비워 둘 수 없습니다.
- `--by`: `human` 또는 `agent`. `사람`·`에이전트`도 받습니다. 이름은 적지 않습니다.
- 두 범위의 지금 지문과 그 지문의 계산 방식 번호(`method`), 시각을 함께 남깁니다. 관계마다
  최신 기록 하나만 둡니다.
- 거부하는 경우(종료 코드 2): 두 범위 사이에 관계가 없음, 양쪽 선언이 맞지 않음, `same-as`
  골격이 다름, 두 범위의 파일에 표식 문제가 있음, `reviews.json`을 읽을 수 없음.
- 기록할 때 표식 문제가 없으면, 양쪽 선언이 모두 사라진 관계의 기록을 함께 지우고 그 목록을
  보여 줍니다. 대상 문서가 지워졌어도 한쪽에 선언이 남은 관계와, 설정으로 뺀 문서의 ID가
  걸린 관계의 기록은 지우지 않습니다.
- 한 번에 관계 하나만 기록합니다. 전체를 한꺼번에 검토 완료로 만드는 방법은 없습니다.

## id

```text
doltap id <파일> [--kind d|s|b] [--at <제목|줄>] [--end <줄>] [--apply]
doltap id --kind d|s|b [--json]
```

파일에 범위 표식을 넣습니다.

- `--kind d`(기본값, 문서 범위가 없을 때): 문서 전체를 감쌉니다. 맨 앞의 YAML front matter는
  범위 밖에 둡니다. 이미 문서 범위가 있으면 거부합니다.
- `--kind s --at <제목|줄>`: 그 제목 줄부터 같거나 높은 수준의 다음 제목 앞까지 감쌉니다.
  같은 제목이 여러 곳이면 줄 번호로 지정하라고 알립니다.
- `--kind b --at <줄> --end <줄>`: 두 줄 사이(둘 다 포함)를 감쌉니다. 빈 줄·표식 줄 옆이나 목록
  항목·제목이 시작되는 줄이어야 합니다. 문단 가운데나 코드 블록 가운데는 거부합니다.
- 기존 범위와 엇갈리거나 문서 범위 밖이면 거부합니다. 표식 문제가 있는 파일에는 쓰지
  않습니다.
- 미리보기에 보이는 ID는 예시이며 `--apply` 때 새로 발급합니다. 적용 결과에 나온 ID를 씁니다.
- 파일 없이 `--kind`만 주면 쓰지 않은 ID 하나를 출력합니다. 표식을 직접 쓸 때 씁니다.

## relate

```text
doltap relate <ID> <관계> <ID> [--apply]
```

두 범위의 시작 표식에 서로를 가리키는 선언을 함께 넣습니다. 관계는 `same-as`,
`depends-on`, `depended-on-by`, `consistent-with` 가운데 하나입니다.
`doltap relate B depends-on A`는 B에 `depends-on: A`, A에 `depended-on-by: B`를 씁니다.

- 한 줄 시작 표식은 여러 줄 형식으로 바뀌고, 같은 관계 이름의 선언은 한 줄에 모읍니다.
- 두 범위 사이에 어떤 선언이든 이미 있으면 거부합니다. 관계를 바꾸려면 `unrelate`로 해제한
  뒤 다시 `relate`합니다.
- 새 관계는 검토 대기가 됩니다.

## unrelate

```text
doltap unrelate <ID> <ID> [--apply]
```

두 범위 사이의 선언을 양쪽에서 모두 지우고, `reviews.json`에 있는 그 관계의 검토 기록도
지웁니다. 한쪽 범위가 이미 지워졌으면 남은 쪽의 선언만 지웁니다. 남은 선언이 없으면 시작
표식은 한 줄 형식으로 돌아갑니다. `reviews.json`을 읽을 수 없으면 검토 기록은 그대로 둡니다.
