# 문서 그래프 사용법

마크다운이 원본입니다. `map`의 JSON은 언제든 다시 만들 수 있습니다.
Node.js 22 이상이면 외부 패키지·AI 키·Git 없이 실행할 수 있습니다.
아래 `doltap`은 설치된 명령입니다. 소스 checkout에서는 `node bin/doltap.mjs`로
바꿔 실행합니다. 이 브랜치의 기능은 아직 원격 릴리즈에 반영되지 않았습니다.

## 읽기

```sh
doltap check .
doltap check . --json
doltap map . --json
doltap context <ID> --depth 2 --budget 4000 --json
doltap audit .doltap/rules --changed --budget 8000 --json
doltap audit .doltap/archive --include-legacy --json
```

`check`는 무결성 오류에서 종료 코드 1, 확인 항목만 있으면 0입니다. 검토 만료는
내용이 틀렸다는 뜻이 아니므로 확인으로 구분합니다. `map`은 활성·아카이브·레거시·
삭제 기록, 역방향 조회에 필요한 관계, 포함 관계와 파생 파일 관계를 제공합니다.
`context`는 들어오고 나가는 관계와 부모·자식을 함께 탐색합니다.

`--budget`은 반환하는 **본문의 문자 수**입니다. JSON 키·ID·경로·관계 등 탐색
메타데이터는 이 숫자 밖에 있으므로 전송 전체 크기나 토큰 수가 아닙니다. 루트 본문도
한도를 넘으면 잘리고 `bodyTruncated`와 `omitted`에 표시됩니다. 깊이 2 이상은 제목과
위치만 제공합니다. `--relation`과 `--state active|archived|legacy|deleted`로 범위를
좁힐 수 있습니다. 감사에서 레거시는 `--include-legacy`를 명시해야 들어갑니다.

감사의 `errors`와 `reviewRequired`는 기계 판정이고, `candidates`는 본문 검토 자료입니다.
`suggestions`와 `ambiguous`는 CLI가 의미를 추측해 채우지 않습니다. 사람이나 현재
호스트 AI가 근거를 읽고 판단합니다. 외부 경로를 감사해도 자동으로 관리 대상이
되지 않습니다. `--changed`는 현재 내용·관계 구성에 맞는 노드 검토가 없는 범위입니다.

## ID와 관계

```sh
doltap id notes.md --kind d
doltap id notes.md --kind s --at "배포 조건"
doltap id notes.md --kind b --at 12 --end 15
doltap link <출발-ID> --to <도착-ID> --as verified-by
```

쓰기는 모두 미리보기가 기본이고, 같은 명령에 `--apply`를 붙여 적용합니다.
이미 ID가 있는 범위에는 새 ID를 주지 않습니다. `b`의 `--at`·`--end`는 양 끝을
포함하는 원문 줄 번호입니다. ID를 손으로 만들거나 삭제 ID를 다시 쓰지 않습니다.

```markdown
<a name="doltap-s-3q8m5k2p-start" id="doltap-s-3q8m5k2p-start"></a>

## 배포 조건

- `verified-by` [검증 결과](trials.md#doltap-d-9k4m2npq-start)

<a name="doltap-s-3q8m5k2p-end" id="doltap-s-3q8m5k2p-end"></a>
```

위 ID는 문법 예시입니다. 실제 값은 명령으로 발급합니다. document는 파일 전체,
section은 제목 범위, block은 작은 주장입니다. `name`·`id`는 같은 값이어야 합니다.
중첩은 완전히 포함해야 하고 교차는 오류입니다. 관계는 가장 안쪽 범위에서 출발합니다.
링크는 문서 기준 상대 경로를 쓰며, 파일 이동 뒤에도 ID를 유지합니다.

`references`, `indexes`, `governs`, `imports`, `supersedes`, `related-to`는 탐색·이력입니다.
`depends-on`, `derived-from`, `decided-by`, `assumes`는 대상 변경, `produces`는 출발
변경, `verified-by`와 `update-with`는 양쪽 변경 때 재검토합니다. `mirror-of`는
정규화한 내용이 같아야 하며 다르면 오류입니다. 대칭 관계도 한쪽에 한 번만 씁니다.
역방향은 계산합니다. 일반 링크는 파일 존재를 검사하지만 관계로 추측하지 않습니다.

기본 관리 범위는 `AGENTS.md`, 특수 연결인 `CLAUDE.md`, `.doltap/**/*.md`입니다.
외부 문서는 ID를 발급한 뒤 운영 문서에서 관계로 연결합니다. `CLAUDE.md`에는
앵커를 넣지 않고 `@AGENTS.md` 한 줄을 유지합니다.

## 이동·삭제·아카이브

```sh
doltap move-fix .
doltap delete <ID> --mode tombstone --why "더 이상 유지하지 않는 주장"
doltap delete <ID> --mode replace --to <새-ID> --why "새 규칙으로 대체"
doltap delete <ID> --mode purge --why "참조 없는 중복 기록 정리"
doltap archive-check .doltap/plans/workstreams/009-example
```

이동 복구는 표시 이름과 ID를 유지하고 경로만 고칩니다. 같은 ID가 두 곳에 있으면
중단합니다. 삭제는 자식 범위의 참조까지 확인하고, 대체를 명시하지 않으면 참조 중
삭제를 거부합니다. 표식은 ID·마지막 경로·이유를 남기며 완전 삭제도 발급 기록을
남깁니다. 대체는 참조를 새 ID로 옮기고 `supersedes`를 기록합니다.

`archive-check`는 폴더를 옮기지 않습니다. `전제`나 `열린 질문`은 각각 하나의
범위에 넣고 `상태`를 `미해결`, `해결`, `이월`, `폐기` 중 하나로 선언합니다.
이월에는 폴더 밖 활성 범위의 관계가, 폐기에는 `이유`가 필요합니다. 실제 종료·
이동은 프로젝트의 승인 절차를 따릅니다. 아카이브 뒤에는 current 색인을 제거하고
history 색인을 연결한 뒤 `move-fix`와 `check`를 실행합니다.

## 검토 기록

```sh
doltap review <관계-ID> --as "영향 없음" --why "원본 변경은 이 규칙의 적용 범위 밖임" --actor 에이전트
doltap review <노드-ID> --node --as 최신임 --why "내용과 나가는 관계를 확인함" --actor 사람
doltap suggest <출발-ID> --to <도착-ID> --relation verified-by --evidence "검증 범위 대조" --as 기각 --why "이 시험은 다른 동작을 검증함" --actor 에이전트
```

확인한 대상 한 건에 대해 `--apply`로 남깁니다. 모든 대상을 한 번에 완료하는 명령은
없습니다. 검토는 `.doltap/reviews/<연도>.md`에 누적됩니다. `영향 없음`은 10글자
이상의 이유를 요구합니다. 노드 검토는 내용과 자신의 관계 구성, 관계 검토는 유형에
따른 양쪽 내용 해시를 봅니다. 상대가 관계 하나를 추가해도 재검토가 연쇄 전파되지
않습니다. 주체 표시는 신원 증명이나 커밋·push·종료 승인으로 쓰지 않습니다.

제안의 반영·기각·보류도 이유와 주체를 남깁니다. 감사 자료의 `decisions`를 읽어
같은 출발 내용 상태에서 기각한 동일 관계를 다시 제안하지 않습니다. `반영`은 실제
관계가 존재할 때만 기록합니다. CLI는 제안을 자동 반영하지 않습니다.

## 이관과 복구

```sh
doltap migrate .
doltap migrate . --apply
doltap recover <실행-ID>
doltap recover <실행-ID> --apply
doltap recover <실행-ID> --discard
```

기존 규칙을 먼저 합치는 순서는 [APPLY.md](APPLY.md)에 있습니다. 이관은 문서 ID와
도달성 색인만 추가하며 제목마다 범위를 만들지 않습니다. 처음 이관하는 이전 구조의
아카이브는 legacy로 보존합니다. 이미 이관한 프로젝트의 새 아카이브는 동결하지 않습니다.

여러 파일은 백업과 전체 예정 manifest를 먼저 만든 뒤 교체합니다. 잡을 수 있는
오류는 즉시 롤백하고, 강제 종료는 다음 검사에서 알립니다. 중단된 실행을 복구하기
전에는 다른 쓰기를 막습니다. 미리보기 이후 따로 편집된 파일은 덮어쓰지 않습니다.
백업은 `.doltap/recovery/` 아래 `.bak`·JSON이며 그래프와 Git 추적에서 빠집니다.
성공하거나 복구한 실행만 실행 ID를 지정해 `--discard`할 수 있습니다.

`.doltap/`을 gitignore해도 로컬 명령은 같습니다. 발급·검토 기록은 다른 checkout이나
CI에 전달되지 않으므로 별도로 보존해야 합니다. CI는 필수 사용 경로가 아닙니다.

## 선택적 훅

어느 훅도 설치하지 않습니다. 다음 예시의 `DOLTAP_CHECKOUT`은 보존할 doltap 소스
위치로 바꿉니다. 적용 뒤 지울 임시 클론을 가리키지 않습니다. CLI와 런타임은 검사
시점에만 필요하며 상주 프로세스를 만들지 않습니다.

Git의 `.git/hooks/pre-commit`에서 호출할 두 줄입니다. 기존 훅에는 명령만 합칩니다.

```sh
#!/bin/sh
node /DOLTAP_CHECKOUT/bin/doltap.mjs check .
```

Codex의 `.codex/config.toml`에 합칠 예시입니다.

```toml
[[hooks.Stop]]
[[hooks.Stop.hooks]]
type = "command"
command = "node /DOLTAP_CHECKOUT/bin/doltap-hook.mjs"
```

Claude Code의 `.claude/settings.json`에는 아래 항목을 기존 설정에 합칩니다.

```json
{
  "hooks": {
    "Stop": [{ "hooks": [{
      "type": "command",
      "command": "node /DOLTAP_CHECKOUT/bin/doltap-hook.mjs"
    }] }]
  }
}
```

공백 경로는 명령 문자열 안에서도 인용합니다. 어댑터는 stdin의 `cwd`에서 같은 검사를
실행하고 Stop 출력 JSON으로 문제를 돌려줍니다. 재호출에는 `{}`로 응답해 반복을
막습니다. 공식 형식은 [Codex Hooks](https://learn.chatgpt.com/docs/hooks)와
[Claude Hooks](https://code.claude.com/docs/en/hooks)를 2026-09-11에 확인했습니다.
어댑터는 로컬 입력으로 시험했으며 실제 사용자 설정에 설치해 실행한 검증은 아닙니다.

제거할 때는 추가한 Git 명령이나 해당 Stop 항목만 뺍니다. 원래 있던 설정과 다른 훅은
보존합니다. 이 훅만을 위해 만든 빈 파일은 사용자가 원하면 지웁니다.
