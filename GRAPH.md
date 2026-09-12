# 문서 그래프 사용법

문서 그래프는 “어떤 글이 어떤 근거와 연결돼 있는가”를 따라 읽는 방법입니다.
문서 한 장이나 그 안의 주장 하나를 **노드**, 두 노드를 잇는 연결을 **관계**라고 부릅니다.
ID는 제목이나 파일 위치가 바뀌어도 그 노드를 구별하는 이름입니다.

처음에는 `check`로 검사하고 `map`에서 ID를 찾은 뒤 `context`로 연결된 내용을
읽어보세요. 모든 제목에 ID를 붙일 필요는 없습니다. 따로 참조하거나 검토할 주장에만 붙입니다.

마크다운이 원본입니다. `map`의 JSON은 언제든 다시 만들 수 있습니다.
Node.js 22 이상이면 외부 패키지·AI 키·Git 없이 실행할 수 있습니다.
아래 `doltap`은 이 버전의 CLI입니다. 소스 폴더에서는 `node bin/doltap.mjs`로
바꿔 실행합니다. `check`, `migrate`, `move-fix`, `map`은 프로젝트 폴더를 위치
인수로 받을 수 있습니다. ID를 받는 `context`, `link`, `review` 같은 명령에서 다른
프로젝트를 다룰 때는 `--root <프로젝트 경로>`를 붙입니다.
`<ID>`·`<파일>`은 실제 값으로 바꾸며 꺾쇠 자체는 입력하지 않습니다.

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

감사 후보에는 실제 검토 가능한 본문만 나옵니다. 발급·검토 기록과 삭제 표식은
후보에서 빠지며, 관계·상태 필터는 재검토 목록에도 적용됩니다. 필터는 선택 경로 안의
관계 끝점을 기준으로 봅니다. 상태·관계가 없는 미등록 외부 문서는 이 필터를 지정하면
빠집니다. 파일 누락 같은 구조 오류는 경로 범위 안에서 계속 표시됩니다.

감사의 `errors`와 `reviewRequired`는 기계 판정이고, `candidates`는 본문 검토 자료입니다.
`suggestions`와 `ambiguous`는 CLI가 의미를 추측해 채우지 않습니다. 사람이나 현재
호스트 AI가 근거를 읽고 판단합니다. 외부 경로를 감사해도 자동으로 관리 대상이
되지 않습니다. `--changed`는 현재 내용·관계 구성에 맞는 노드 검토가 없는 범위입니다.

## ID와 관계

아래 예시는 프로젝트에 이미 있는 `notes.md`를 연결하는 순서입니다. 먼저 문서 전체에
`d` ID를 붙이고, 필요한 제목에는 `s`, 더 작은 주장에는 `b` ID를 붙입니다.
미리보기를 확인한 뒤 같은 명령에 `--apply`를 붙이면 저장됩니다.

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

파일 탐색기나 rm으로 이미 지웠다면 복원 없이 `delete-fix`로 발급 대장을 정리할
수 있습니다. 정리할 ID 또는 프로젝트 안의 경로와 이유를 지정합니다. 경로를 쓰면
그 아래에서 사라진 ID들을 함께 고릅니다. `.`은 프로젝트 전체입니다.

```sh
doltap delete-fix .doltap/archive/legacy/workstreams/006-example --why "폴더를 직접 삭제함"
doltap delete-fix .doltap/archive/legacy/workstreams/006-example --why "폴더를 직접 삭제함" --drop-links
```

남아 있는 관계가 있으면 첫 명령은 위치를 보여주며 중단합니다. 관계의 의미를 읽고
다른 근거로 연결하거나, 제거해도 된다면 두 번째 명령으로 변경 내용을 미리 봅니다.
같은 명령에 `--apply`를 붙여야 실제로 저장됩니다. `--drop-links`는 독립된 명시
관계 줄만 제거합니다. 일반 링크·설명과 섞인 관계는 위치를 보고 직접 고쳐야 합니다.
누락된 필수 문서나 다른 구조 오류까지 해결하는 명령은 아니므로 적용 뒤 check를 실행합니다.

살아 있는 ID는 처리하지 않습니다. 색인에서 빠진 이동 문서도 일반 Markdown 탐색
범위에서 찾고, 발견하면 move-fix 안내와 함께 중단합니다. 숨김·빌드·복구 폴더와
심볼릭 링크는 탐색하지 않으므로 그런 위치로 옮긴 파일을 삭제로 확정하면 안 됩니다.
남아 있는 문서 파일이나 대상 앵커가 손상된 경우도 먼저 확인하도록 막습니다.

대장에는 `삭제` 상태와 `사후 삭제 정리: <이유>`를 남깁니다. recover는 이번에 고친
대장·참조만 되돌립니다. 명령 실행 전에 이미 지운 본문은 복원하지 못합니다.
삭제하기 전이라면 먼저 delete로 영향을 확인합니다. delete-fix는 이미 사라진
범위의 사후 정리이며, 아직 존재하는 폴더를 묶음 삭제하는 명령은 아닙니다.

`archive-check`는 폴더를 옮기지 않습니다. `전제`나 `열린 질문`은 각각 하나의
범위에 넣고 `상태`를 `미해결`, `해결`, `이월`, `폐기` 중 하나로 선언합니다.
이월에는 폴더 밖 활성 범위의 관계가, 폐기에는 `이유`가 필요합니다. 실제 종료·
이동은 프로젝트의 승인 절차를 따릅니다. 아카이브 뒤에는 current 색인을 제거하고
history 색인을 연결한 뒤 `move-fix`와 `check`를 실행합니다.

이 검사는 위 표식을 기계적으로 확인할 뿐, 일반 문장의 뜻을 읽어 공통 결정인지
판단하거나 내용을 다른 문서로 옮기지는 않습니다. 어떤 내용을 활성 원본에 남길지는
사람이나 에이전트가 판단하고, 검사는 그 결과의 ID·관계와 명시한 상태를 확인합니다.

프로젝트 전체 설명은 `.doltap/plans/project.md`에 둡니다.
계속 유효한 결정과 전제는 먼저 담당 활성 원본에 옮깁니다. 공통 결정은
`plans/decisions.md`, 규칙은 `AGENTS.md`·`rules/`, 미착수 후보는 `ideas.md`가
맡습니다. 아카이브 연결은 당시 근거가 필요할 때 남깁니다. ID를 유지해 옮겼다면
복제본을 남기지 말고 `move-fix`로 기존 참조 경로를 갱신합니다.

## 검토 기록

본문을 읽고 내용을 확인했다면 **노드 검토**를, 연결된 근거의 변경이 이 주장에 미치는
영향을 확인했다면 **관계 검토**를 남깁니다. 한쪽을 했다고 다른 쪽이 완료되지는 않습니다.
같은 대상을 여러 노드가 참조해도 관계 ID가 다르므로 검토를 따로 남깁니다.

`map --json`의 `nodes[].id`가 노드 ID이고 `edges[].id`가 관계 ID입니다.
`fresh`는 현재 내용에 맞는 검토 기록이 있다는 뜻이고, `stale`은 기록이 없거나
그 뒤 내용이 바뀌어 다시 확인해야 한다는 뜻입니다. `stale` 자체가 오류 판정은 아닙니다.

```sh
doltap review <관계-ID> --as "영향 없음" --why "원본 변경은 이 규칙의 적용 범위 밖임" --actor 에이전트
doltap review <노드-ID> --node --as 최신임 --why "내용과 나가는 관계를 확인함" --actor 사람
doltap suggest <출발-ID> --to <도착-ID> --relation verified-by --evidence "검증 범위 대조" --as 기각 --why "이 시험은 다른 동작을 검증함" --actor 에이전트
```

확인한 대상 한 건에 대해 `--apply`로 남깁니다. 모든 대상을 한 번에 완료하는 명령은
없습니다. 노드·관계 검토는 `.doltap/reviews/reviewed.md`에서 대상마다 최신 한 줄을
덮어씁니다. 과거 검토 행은 별도로 남기지 않습니다. `영향 없음`은 10글자
이상의 이유를 요구합니다. 노드 검토는 내용과 자신의 관계 구성, 관계 검토는 유형에
따른 양쪽 내용 해시를 봅니다. 상대가 관계 하나를 추가해도 재검토가 연쇄 전파되지
않습니다. 주체 표시는 신원 증명이나 커밋·push·종료 승인으로 쓰지 않습니다.

A를 검토하고 B로 고친 뒤 B도 검토했다면, A로 되돌려도 재검토가 필요합니다.
B를 검토하지 않았다면 마지막 검토는 여전히 A이므로 A로 돌아왔을 때 일치합니다.

구형 연도별 기록은 첫 review 실행 때 대상별 최신 시각 한 건만 reviewed.md로
옮기고, 이전 노드·관계 검토 행을 제거합니다. 미리보기에서 변경을 확인한 뒤
--apply로 실행합니다. 감사 제안의 반영·기각·보류 기록은 연도별 파일에 그대로
누적합니다. 이는 문서를 검토했다는 영수증과 다른 기록입니다.

같은 대상을 반복 검토해도 검토 행 수는 늘지 않습니다. 새로 검토하는 대상은
행을 추가하고, 사라진 대상의 마지막 행은 자동으로 지우지 않습니다. 복구 백업은
기존대로 보존하므로 로컬 용량은 계속 늘 수 있습니다. Git에도 커밋한 버전만
남습니다. 커밋 사이에 덮어쓴 모든 판단을 별도 이력으로 보장하지 않습니다.

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

**처음에는 이 절을 건너뛰어도 됩니다.** 필요할 때 `doltap check`를 직접 실행하면 됩니다.
훅은 커밋하거나 에이전트가 답변을 마칠 때 같은 검사를 자동으로 부르는 설정입니다.
이 자동 검사를 원할 때에만 아래에서 사용하는 도구의 예시를 선택해 직접 설정합니다.
`init`과 `migrate`는 훅 설정을 만들지 않습니다.

예시의 `DOLTAP_CHECKOUT`은 계속 보관할 doltap 소스 경로로 바꿉니다. 적용 후 지울
임시 클론을 지정하면 나중에 검사가 실행되지 않습니다. 검사는 그 시점에만 실행됩니다.

Git의 `.git/hooks/pre-commit`에서 호출할 두 줄입니다. 기존 훅에는 명령만 합칩니다.

이 연결은 문제가 있으면 커밋을 멈춥니다. POSIX 셸에서 실행 권한도 부여합니다.

```sh
#!/bin/sh
node /DOLTAP_CHECKOUT/bin/doltap.mjs check .
```

Codex의 `.codex/config.toml`에 합칠 예시입니다.

아래 Stop 연결은 무결성 문제가 있으면 에이전트에게 오류를 돌려줍니다.

```toml
[[hooks.Stop]]
[[hooks.Stop.hooks]]
type = "command"
command = "node /DOLTAP_CHECKOUT/bin/doltap-hook.mjs"
```

프로젝트의 `.codex/`가 신뢰된 상태여야 하며, 새로 만들거나 바꾼 훅은 Codex
CLI의 `/hooks`에서 내용을 확인하고 신뢰해야 실행됩니다. 승인 전에는 Codex가
그 훅을 건너뜁니다.

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
[Claude Hooks](https://code.claude.com/docs/en/hooks)를 2026-09-12에 확인했습니다.
어댑터는 로컬 입력으로 시험했으며 실제 사용자 설정에 설치해 실행한 검증은 아닙니다.

제거할 때는 추가한 Git 명령이나 해당 Stop 항목만 뺍니다. 원래 있던 설정과 다른 훅은
보존합니다. 이 훅만을 위해 만든 빈 파일은 사용자가 원하면 지웁니다.
