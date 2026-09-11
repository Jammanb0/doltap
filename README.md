<div align="center">

# doltap

**AI 에이전트가 어제 뭘 하다 말았는지 기억하게 만듭니다.**

규칙은 `AGENTS.md` 한 곳에. 진행 상태는 문서 한 곳에.
Codex와 Claude Code가 같은 것을 읽습니다.

[![test](https://github.com/Jammanb0/cairn/actions/workflows/test.yml/badge.svg)](https://github.com/Jammanb0/cairn/actions/workflows/test.yml)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![node](https://img.shields.io/badge/node-%E2%89%A522-brightgreen.svg)](package.json)

[English](README.en.md) · [검증 현황](docs/trials/README.md) · [적용 절차](APPLY.md)

</div>

---

## 이런 적 있나요

```text
나: 어제 하던 거 이어서 하자
AI: 어떤 작업을 말씀하시는지 알려주시겠어요?
나: ...
```

```text
나: 커밋 전에 물어보라고 했잖아
AI: CLAUDE.md에는 그런 규칙이 없는데요
나: AGENTS.md에 적었는데?
```

**doltap을 적용하면**

```text
나: 지금 뭐 하던 중이었지?
AI: 002-length-limit 워크스트림이 진행 중입니다.
    어제 검사기까지 끝냈고 다음은 템플릿 반영이에요.
    작업 브랜치는 workstream/002-length-limit, main에 반영 예정입니다.
```

실제로 이렇게 동작하는지 확인한 결과는 [검증 현황](docs/trials/README.md)에
있습니다. 무엇이 아직 안 되는지도 같은 문서의 「알려진 제한」에 적어 두었습니다.

## 5분 만에 시작하기

**새 프로젝트**

```bash
npx --yes github:Jammanb0/cairn init my-project
```

**이미 하던 프로젝트** — 기존 파일을 덮어쓰지 않고, 바꿀 내용은 먼저 보여줍니다

```bash
git clone --depth 1 https://github.com/Jammanb0/cairn .doltap-bootstrap
```

에이전트에게 그대로 붙여 넣으세요.

```text
.doltap-bootstrap/APPLY.md를 읽고 이 프로젝트에 적용해줘.
기존 규칙과 기록은 보존하고, 지시 파일 변경안은 적용 전에 보여줘.
```

**확인**

```bash
npx --yes github:Jammanb0/cairn check .
```

## 규칙은 한 곳에만 둡니다

도구마다 읽는 파일이 다릅니다. Codex는 `AGENTS.md`를, Claude Code는
`CLAUDE.md`를 읽습니다. 그래서 보통 같은 규칙을 두 벌 쓰게 되고, 한쪽만 고치면
갈라집니다.

`CLAUDE.md`를 한 줄짜리 이정표로 만들면 두 도구가 같은 파일을 읽습니다.

```text
  Codex  ─────────────────────────────┐
                                      ├──►  AGENTS.md  ──►  .doltap/
  Claude Code  ──►  CLAUDE.md  ───────┘     규칙 원본        상세 규칙과
                    "@AGENTS.md"                             진행 기록
                    이 한 줄이 전부
```

원본이 하나뿐이라 생성도 동기화도 필요 없고, 갈라질 수가 없습니다.

## 따로 관리할 일은 폴더 하나로

따로 관리할 만한 일은 폴더를 하나 만들어 거기서 관리합니다. 새 세션은 그
폴더만 보면 어디까지 왔는지 압니다.

```text
  시작하면    .doltap/plans/workstreams/002-length-limit/
                 README.md     무엇을 왜 하는가
                 status.md     어디까지 했고 다음은 무엇인가
                 plan.md       어떤 순서로 할 것인가 (필요할 때만)

  끝나면      .doltap/archive/workstreams/002-length-limit/
                 반영과 확인이 끝난 뒤, 사용자 확인을 받고 옮깁니다
                 지우지 않고 그대로 옮기고 history.md 에 한 줄만 남습니다
```

문서마다 역할이 하나씩입니다. 무엇을 왜 하는지는 `README.md`, 지금 어디까지
왔는지는 `status.md`가 가집니다. 어느 브랜치에서 작업할지, 어디에 반영할지도
시작할 때 정해서 `status.md`에 적어 둡니다. 다음 세션이 다시 묻지 않습니다.

## 왜 또 다른 도구인가

<table>
<tr><td width="33%" valign="top">

**옮겨 담습니다**

흩어진 `TODO.md`와 기존 규칙을 조사해 제자리에 넣습니다. 덮어쓰지 않고, 어긋나면 사람에게 묻습니다.

</td><td width="33%" valign="top">

**작업 위치를 기억합니다**

기준 브랜치, 반영 대상, PR 흔적 여부를 정해서 적어 둡니다. 다음 세션이 다시 묻지 않습니다.

</td><td width="33%" valign="top">

**아무것도 안 남깁니다**

전역 CLI도, 생성 단계도, 상주 프로세스도 없습니다. 마크다운뿐입니다.

</td></tr>
</table>

## 자주 나오는 질문

<details>
<summary><b>그냥 메모 파일 몇 개 두면 되는 거 아닌가요?</b></summary>

<br>

맞습니다. 많은 경우 그걸로 충분하고, 실제로 그렇게 쓰는 분이 많습니다.
doltap은 거기에 세 가지를 더합니다.

1. 기존에 쓰던 규칙과 메모를 **버리지 않고 옮기는 절차**가 있습니다
2. 문서끼리 실제로 연결됐는지 **검사하는 명령**이 있습니다 (`doltap check`, CI에 넣을 수 있음)
3. 큰 작업을 **어느 브랜치에서 하기로 했는지까지** 남깁니다

</details>

<details>
<summary><b>Cursor나 Copilot도 되나요?</b></summary>

<br>

`AGENTS.md`를 읽는 도구라면 됩니다. 다만 각 도구 형식으로 **변환해 주지는 않습니다.**
그건 [rulesync](https://github.com/dyoshikawa/rulesync)나
[ai-rules-sync](https://github.com/PanisHandsome/ai-rules-sync)가 더 잘합니다.

</details>

<details>
<summary><b>Spec Kit이나 OpenSpec과 뭐가 다른가요?</b></summary>

<br>

그쪽은 **무엇을 만들지**(요구사항)를 다루고, doltap은 **어떻게 일하고 어디까지 왔는지**를
다룹니다. 층이 다르니 같이 써도 충돌하지 않습니다.

</details>

<details>
<summary><b>규칙을 강제해 주나요?</b></summary>

<br>

아니요. 훅도 상주 프로세스도 두지 않는 것이 이 도구의 성립 조건입니다.
대신 **확인할 수 있게** 만들었습니다 — `doltap check`가 연결이 끊긴 것을 종료 코드 1로 알립니다.

</details>

<details>
<summary><b>마친 작업 기록은 어떻게 다루나요?</b></summary>

<br>

마친 대작업은 `.doltap/archive/workstreams/`로 옮기고 그대로 둡니다. 그때의
구조와 그때의 판단을 담고 있는 것이 정상이라, **검사기는 아카이브 안을
들여다보지 않습니다.** 끊긴 옛 경로도, 그때 쓰던 임시 골격 참조도 잡지
않습니다. 아카이브 관리는 사용자 몫입니다.

폴더 이름만 읽습니다. 새 대작업이 지난 번호를 다시 쓰면 문제로 잡고, 고칠 곳은
새로 만든 쪽이라 그 자리를 가리킵니다. 폴더를 지우기로 했다면 `history.md`의
줄도 함께 지우세요 — 색인이 없는 폴더를 가리키는 것은 문제로 잡습니다.

</details>

<details>
<summary><b>어디까지 검증됐나요?</b></summary>

<br>

명령(`init`·`check`)은 Windows·Ubuntu·macOS에서 Node 22와 24로 CI가 매번 돌립니다.
에이전트가 문서를 실제로 따르는지는 임시 프로젝트에서 적용·이어받기·마무리를 한
흐름으로 돌려 확인했습니다. 아직 Claude Code에서만 했고 원격 브랜치·PR 경로는
아직입니다. 전체는 [검증 현황](docs/trials/README.md)에 있습니다.

</details>

## 들어 있는 것

`doltap init`이 만들어 주는 것입니다. 원본은 이 저장소의 `template/`에 있고,
받으면 대부분 빈 자리라 채워 넣으며 씁니다.

```text
AGENTS.md        항상 적용되는 규칙과 문서 안내표
CLAUDE.md        "@AGENTS.md" 한 줄
.doltap/
  project.md     이 프로젝트가 전체로서 무엇인가
  rules/         검증 · 소통 방식
  plans/
    README.md       문서 지도와 읽는 순서
    current.md      진행 중인 작업이 어디 있는가
    workstreams.md  대작업을 어떻게 운영하는가
    history.md      마친 작업 한 줄씩
    ideas.md        아직 착수하지 않은 후보
    workstreams/<번호>-<이름>/    따로 관리하는 작업 하나당 폴더 하나
```

명령은 `init`과 `check` 둘뿐이고, **둘 다 없어도 됩니다.** 복사만 해도 같은
결과이고 검사는 눈으로 해도 됩니다.

이 저장소를 둘러보다 루트에도 `AGENTS.md`와 `.doltap/`가 있는 것을 보셨다면,
그건 배포물이 아닙니다. **doltap을 doltap 자신에게 적용한 실제 운영
문서입니다.** 여기서 진행 중인 작업과 지난 기록을 그대로 볼 수 있고, CI가
매번 `doltap check .`으로 검사합니다. 받는 것은 `template/` 쪽입니다.

---

<div align="center">

케른(doltap)은 산길에 쌓아 두는 돌탑입니다.<br>
길을 만들어 주지는 않지만, 다음 사람이 — 혹은 다시 온 내가 — 어디까지 왔는지 알 수 있게 합니다.<br>
지나온 돌탑도 치우지 않습니다. 그 자리에 그대로 두어야 어디서부터 걸어왔는지가 남습니다.

**MIT**

</div>
