# 선택적 훅

[사용 안내](README.md) · [실행 방법](getting-started.md)

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
[Claude Hooks](https://code.claude.com/docs/en/hooks)를 2026-09-13에 확인했습니다.
어댑터는 로컬 입력으로 시험했으며 실제 사용자 설정에 설치해 실행한 검증은 아닙니다.

제거할 때는 추가한 Git 명령이나 해당 Stop 항목만 뺍니다. 원래 있던 설정과 다른 훅은
보존합니다. 이 훅만을 위해 만든 빈 파일은 사용자가 원하면 지웁니다.
