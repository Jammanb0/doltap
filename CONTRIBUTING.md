<!-- doltap:start doltap-d-hn4kgypv -->

# 기여 안내 / Contributing

[한국어](#한국어) · [English](#english)

<!-- doltap:start doltap-s-68ncypqf
same-as: doltap-s-q0pnqk08
-->
## 한국어

doltap에 관심 가져 주셔서 고맙습니다. 버그 제보, 문서 개선, 기능 제안 모두 환영합니다. 이슈와 PR은
영어로 남겨도 됩니다.

### 이렇게 참여할 수 있습니다

- **버그 제보:** [새 이슈](https://github.com/Jammanb0/doltap/issues/new/choose)에서 「버그 제보」 양식을
  고릅니다. doltap·Node 버전, 운영체제, 실행한 명령, 문제를 재현하는 가장 작은 Markdown 예시를
  적어 주시면 빨리 확인할 수 있습니다.
- **문서 개선:** 오타나 이해하기 어려운 설명은 바로 PR을 보내셔도 됩니다.
- **기능 제안:** 새 기능이나 동작을 바꾸는 일은 코드를 쓰기 전에 「제안」 양식으로 먼저 방향을
  맞춰 주세요. doltap은 작고 단순한 검사 도구로 남는 것을 중요하게 여겨서, 받아들이지 못하는
  제안도 있습니다.
- **보안 문제:** 공개 이슈에 올리지 말고 [보안 안내](SECURITY.md)를 먼저 확인해 주세요.

### 저장소 구성

| 위치 | 내용 |
| --- | --- |
| `bin/doltap.mjs` | 명령줄 진입점 |
| `lib/` | 표식 읽기, 관계 판정, 검사, 편집 보조의 구현 |
| `template/` | `doltap init`이 사용자 프로젝트에 넣는 기본 구조 |
| `docs/guide/` | 사용 안내. npm 패키지에도 함께 들어갑니다 |
| `docs/verification/` | 무엇을 어떻게 확인했는지 적은 검증 기록 |
| `test/` | 시험 |
| `AGENTS.md`, `.doltap/` | 이 저장소에서 일하는 사람과 AI 에이전트가 따르는 규칙과 작업 기록 |

### 고친 뒤 확인

Node.js 22 이상이면 되고, 설치할 의존성이나 빌드 단계는 없습니다. doltap을 쓰기만 하는 사람은
아래 명령을 실행할 필요가 없고, doltap 자체를 고쳤을 때 실행합니다.

```sh
npm test
node bin/doltap.mjs check template
node bin/doltap.mjs check .
```

- 동작을 바꿨으면 그 동작을 확인하는 시험을 더하거나 고칩니다. 검사 규칙을 바꿨다면 잡아야
  하는 경우와 잡으면 안 되는 경우를 모두 시험에 넣습니다.
- 명령·옵션·진단 코드를 바꿨으면 `docs/guide/`의 참고 문서도 함께 고칩니다. 참고 문서에 이름이
  빠지면 안내 문서 시험이 알려 줍니다.
- `template/`을 고쳤으면 `node bin/doltap.mjs init <새 폴더>`로 새 프로젝트를 만들어 `check`가
  통과하는지 봅니다.
- 구현을 바꾸면 검증 기록도 새 구현에 맞춰 다시 확인해야 합니다. 외부 기여자의 PR에서는 관리자가
  병합 전에 재검증하고 `docs/verification/`의 보고서를 고칩니다. 직접 확인한 결과와 재현 방법은
  PR 설명에 적어 주세요.

### PR을 보낼 때

- 한 PR에는 한 가지 목적만 담아 주세요.
- 무엇을 왜 바꿨는지와 실행한 확인을 PR 설명에 적어 주세요. PR 양식이 안내합니다.
- 커밋 메시지는 한국어로 써도 영어로 써도 됩니다. 병합할 때 관리자가 이 저장소의 형식으로
  정리합니다.

### AI 에이전트와 함께 작업한다면

이 저장소의 `AGENTS.md`는 Claude Code나 Codex 같은 에이전트가 자동으로 읽는 규칙입니다. 포크한
저장소에서 에이전트에게 작업을 맡기면 이 규칙에 따라 시험과 검사를 돌리고, 커밋이나 push 같은
일은 작업을 맡긴 사람에게 먼저 확인받습니다.

### 라이선스

보내 주신 기여는 이 저장소와 같은 [MIT 라이선스](LICENSE)로 배포됩니다.
<!-- doltap:end doltap-s-68ncypqf -->

---

<!-- doltap:start doltap-s-q0pnqk08
same-as: doltap-s-68ncypqf
-->
## English

Thank you for your interest in doltap. Bug reports, documentation fixes, and feature proposals are
all welcome. Issues and pull requests in English are welcome too; most of the user guide and the CLI
messages are in Korean, so feel free to ask if anything is unclear.

### Ways to contribute

- **Bug reports:** Choose the "Bug report" form under
  [New issue](https://github.com/Jammanb0/doltap/issues/new/choose). Including the doltap and Node
  versions, your operating system, the command you ran, and the smallest Markdown example that
  reproduces the problem helps us look into it quickly.
- **Documentation fixes:** For typos or unclear explanations, feel free to send a pull request right
  away.
- **Feature proposals:** Before writing code for a new feature or a change in behavior, please use
  the "Proposal" form to agree on the direction first. doltap values staying a small, simple checking
  tool, so some proposals may not be accepted.
- **Security issues:** Do not post them in public issues. Please read the
  [security policy](SECURITY.md) first.

### Repository layout

| Path | Contents |
| --- | --- |
| `bin/doltap.mjs` | Command-line entry point |
| `lib/` | Implementation of marker reading, relation checks, checks, and editing helpers |
| `template/` | The basic structure that `doltap init` puts into a user's project |
| `docs/guide/` | User guide (Korean). Also included in the npm package |
| `docs/verification/` | Verification records of what was checked and how (Korean) |
| `test/` | Tests |
| `AGENTS.md`, `.doltap/` | Rules and work records followed by people and AI agents working in this repository |

### Checking your changes

Node.js 22 or later is all you need; there are no dependencies to install and no build step. People
who only use doltap do not need to run these commands; run them when you change doltap itself.

```sh
npm test
node bin/doltap.mjs check template
node bin/doltap.mjs check .
```

- If you changed a behavior, add or update the tests for it. If you changed a check rule, cover both
  the cases it must catch and the cases it must not.
- If you changed commands, options, or diagnostic codes, update the reference documents in
  `docs/guide/` as well. The documentation tests tell you when a name is missing from them.
- If you changed `template/`, create a new project with `node bin/doltap.mjs init <new folder>` and
  confirm that `check` passes.
- When the implementation changes, the verification records have to be checked again against it.
  For pull requests from external contributors, the maintainer re-verifies before merging and
  updates the reports in `docs/verification/`. Please describe what you checked yourself and how to
  reproduce it in the pull request description.

### Sending a pull request

- Keep each pull request to a single purpose.
- In the description, explain what you changed and why, and which checks you ran. The pull request
  template will guide you.
- Commit messages can be in Korean or English. The maintainer tidies them into this repository's
  format when merging.

### Working with AI agents

`AGENTS.md` in this repository holds the rules that agents such as Claude Code and Codex read
automatically. If you have an agent work on your fork, it follows these rules: it runs the tests and
checks, and asks the person who gave it the task before commits, pushes, and similar steps.

### License

Contributions are distributed under the same [MIT License](LICENSE) as this repository.
<!-- doltap:end doltap-s-q0pnqk08 -->

<!-- doltap:end doltap-d-hn4kgypv -->
