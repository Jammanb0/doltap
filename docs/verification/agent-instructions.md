# 에이전트 지시 파일

[검증 기록](README.md) · [에이전트와 함께 쓰기](../guide/with-agents.md)

## 대상

- `docs/guide/with-agents.md`가 설명하는 Claude Code와 Codex의 지시 파일 동작(doltap 1.0.0 안내)
- 공식 문서 두 곳: Claude Code의 "How Claude remembers your project", Codex의 "AGENTS.md"

## 방법

2026-10-01에 두 문서를 열어 `docs/guide/with-agents.md`의 설명을 하나씩 대조했습니다.

판정 기준: 안내의 각 설명에 공식 문서의 근거가 있을 것.

## 결과

| 안내의 설명 | 공식 문서 |
| --- | --- |
| Claude Code는 v2.1.277부터 `AGENTS.md`를 직접 읽음 | 일치 |
| 기본 설정에서는 작업 폴더나 그 위에 `CLAUDE.md`·`.claude/CLAUDE.md`·`CLAUDE.local.md`가 하나도 없을 때만 `AGENTS.md`를 읽음 | 일치 |
| 오래된 버전이나 `AGENTS.md`를 직접 읽지 못하는 세션에서는 `CLAUDE.md`의 `@AGENTS.md`로 연결함 | 일치 |
| `@AGENTS.md` import를 두어도 `AGENTS.md`가 두 번 읽히지 않음 | 일치 |
| `CLAUDE.md`의 블록 HTML 주석은 자동으로 넣는 문맥에서 지워지고, 파일을 직접 읽으면 보임 | 일치. `AGENTS.md`를 직접 읽을 때 주석을 어떻게 다루는지는 문서에 없음 |
| Codex는 `~/.codex`의 전역 파일을 먼저 읽고, Git 루트부터 작업 폴더까지 단계마다 `AGENTS.override.md` 또는 `AGENTS.md`를 이어 붙임 | 일치 |
| Codex가 합쳐 읽는 크기는 기본 32 KiB | 일치. `project_doc_max_bytes`로 바꿀 수 있음 |
| Codex의 HTML 주석 처리 | 문서에 설명이 없음. 안내도 근거를 확인하지 못했다고 적음 |

## 적용 범위

2026-10-01의 공식 문서와 `docs/guide/with-agents.md`의 설명이 맞는다는 확인입니다.

## 재실행

아래 두 문서를 열어 `docs/guide/with-agents.md`의 설명과 대조합니다.

- [Claude Code — How Claude remembers your project](https://code.claude.com/docs/en/memory)
- [Codex — AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md)
