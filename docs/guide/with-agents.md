# 에이전트와 함께 쓰기

[사용 안내](README.md) · [작업 기록](workstreams.md)

doltap은 AI를 부르지 않습니다. AI 코딩 에이전트가 `AGENTS.md`를 읽고 그 안내에 따라
`.doltap/current.md`와 작업 기록을 찾고, 문서를 고친 뒤 `doltap check`로 확인하게 하는
방식입니다. AI가 규칙을 반드시 지킨다는 보장은 없으므로 결과는 사람이 확인합니다.

아래 도구 동작은 2026-10-01에 각 도구의 공식 문서로 확인한 내용입니다. 도구는 자주
바뀌므로 최신 동작은 공식 문서에서 다시 확인하세요.

- [Claude Code — How Claude remembers your project](https://code.claude.com/docs/en/memory)
- [Codex — AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md)

## 규칙 파일 연결

`init`은 `AGENTS.md`만 만듭니다. `CLAUDE.md`는 필요할 때만 둡니다.

### Codex

Codex는 `AGENTS.md`를 읽습니다. 홈 폴더의 Codex 폴더(기본 `~/.codex`)에 있는 전역 파일을
먼저 읽고, Git 루트부터 지금 작업하는 폴더까지 각 단계의 `AGENTS.override.md` 또는
`AGENTS.md`를 이어 붙입니다. 작업 폴더에 가까운 파일이 뒤에 붙습니다. 합친 크기는 기본
32 KiB까지만 읽으므로 `AGENTS.md`는 짧게 유지하고 긴 내용은 다른 문서로 나눕니다.

### Claude Code

Claude Code는 v2.1.277부터 `AGENTS.md`를 직접 읽습니다. 다만 기본 설정에서는 작업 폴더나
그 위 폴더에 `CLAUDE.md`, `.claude/CLAUDE.md`, `CLAUDE.local.md`가 **하나도 없을 때만**
`AGENTS.md`를 읽고, 하나라도 있으면 `CLAUDE.md` 쪽만 읽습니다. 그래서 다음 경우에는
`CLAUDE.md` 맨 위에 `@AGENTS.md` 한 줄을 둡니다.

- 이미 `CLAUDE.md`나 `CLAUDE.local.md`를 쓰고 있을 때
- v2.1.277보다 오래된 버전을 쓰거나, `AGENTS.md`를 직접 읽지 못하는 세션일 때

```markdown
@AGENTS.md
```

이 import를 두어도 `AGENTS.md`가 두 번 읽히지는 않습니다. Claude Code 전용 내용이 있으면
이 줄 아래에 덧붙입니다. doltap은 `CLAUDE.md`가 없거나 내용이 달라도 검사하지 않습니다.

## 주석 표식이 AI에게 보이는지

Claude Code 공식 문서는 `CLAUDE.md`의 블록 HTML 주석을 자동으로 넣는 문맥에서는 지우고,
파일을 직접 읽으면 보인다고 설명합니다. 이것이 `AGENTS.md`를 읽는 모든 경로나 다른 도구에도
같다고 볼 근거는 확인하지 못했습니다. 그래서 doltap은 표식이 자동 문맥에 보인다는 것에 기대지
않습니다.

- 작업 규칙은 주석 밖의 일반 글로 씁니다. 템플릿의 `AGENTS.md`도 그렇게 되어 있습니다.
- 관계 정보가 필요하면 에이전트가 `doltap show <ID>`나 `doltap check`로 확인합니다.

## 에이전트에게 요청하는 말

작업을 이어받을 때:

```text
AGENTS.md를 읽고 .doltap/current.md에서 진행 중인 작업을 찾아 이어서 해줘.
status.md의 마지막 기록과 실제 파일 변경이 맞는지 먼저 확인해줘.
```

문서를 고친 뒤:

```text
고친 문서에 관계가 있으면 doltap check와 doltap review로 상대 범위를 확인하고,
내용이 어긋나면 고쳐줘. 실제로 확인한 관계만 검토 기록으로 남겨줘.
```

작업을 마칠 때:

```text
이 작업을 마무리해줘. 앞으로도 적용할 내용이 작업 기록에만 남아 있으면 담당 문서에
반영하고, status.md를 완료 상태로 고친 뒤 보관 절차를 제안해줘.
```

## 에이전트가 지키게 할 것

템플릿의 `AGENTS.md`에는 doltap이 전제로 하는 규칙이 들어 있습니다. 지우지 않는 것이
좋습니다.

- 표식의 ID를 바꾸지 않습니다.
- 검사를 통과시키려고 관계를 느슨하게 바꾸지 않습니다. 내용이 어긋나면 내용을 고치고,
  관계를 잘못 적었으면 양쪽 선언을 고칩니다.
- 실제로 확인한 관계만 검토로 기록합니다. 검토 기록은 사용자 승인이 아닙니다.
- 의미 있는 작업 단위가 끝날 때마다 `status.md`를 고칩니다.

커밋·push·브랜치를 언제 해도 되는지 같은 작업 방식은 프로젝트가 정합니다. 엄격하게
운영하는 예시는 [작업 방식 예시](work-style.md)에 있습니다.
