<!-- doltap:start doltap-d-t2r1qkpf
same-as: doltap-d-yw0hp9qg
-->

# Getting started

[User guide](README.md) · Next: [Markers and relations (Korean)](../format.md) · [한국어](../getting-started.md)

In this guide you create a new project, connect two install guides, one in Korean and one in English,
with a relation that says they "must keep the same content", and then see what doltap tells you when
one side changes. To apply doltap to a project already in progress, learn the flow here first and
then follow the [adoption procedure (Korean)](../../../APPLY.md).

## Preparation

You need Node.js 22 or later. There are no dependencies to install and no build step. Check the
version in the window where you type commands (the terminal).

```sh
node --version
```

Anything from `v22` up is fine. Next, get the doltap source.

```sh
git clone https://github.com/Jammanb0/doltap
cd doltap
node bin/doltap.mjs --help
```

When the usage appears, you are ready. Where this guide says `doltap`, run
`node <doltap folder>/bin/doltap.mjs` instead. For example, if you created your project next to the
doltap folder, that is `node ../doltap/bin/doltap.mjs` inside the project. doltap's messages are in
Korean; this guide explains what each one means.

## 1. Create a new project

From the doltap folder, create a new project next to it.

```sh
node bin/doltap.mjs init ../my-project
```

Three files are created.

| File | Role |
| --- | --- |
| `AGENTS.md` | Rules that people and AI follow, and where to start reading |
| `.doltap/current.md` | List of work in progress |
| `.doltap/history.md` | List of finished work |

Move into the new project and run a check.

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

Items starting with `!` are not errors but things for a person to look at. This one says that
`AGENTS.md` still has places to fill in, such as the project description (lines 5, 44, and 51). The
check passed (`✓ 통과`) with 3 managed documents, 3 ranges, and 0 relations. You can leave the filling
in to AI.

```text
Fill in the placeholders in AGENTS.md to fit this project.
Do not make up anything you cannot confirm; mark it as needing confirmation.
```

## 2. Add range markers to the documents

Create two install guides. You can write them in an editor or leave them to AI.

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

For doltap to recognize these documents, they need **range markers**. Markers are HTML comments, so
they do not show on the rendered page. First add a marker around each whole document. Without
`--apply`, the command only shows what would change.

```sh
doltap id docs/install.md
doltap id docs/install.md --apply
doltap id docs/en/install.md --apply
```

Next, create ranges for the sections you want to connect. Put the section heading after `--at`.

```sh
doltap id docs/install.md --kind s --at "설치 조건" --apply
doltap id docs/en/install.md --kind s --at Requirements --apply
```

`docs/install.md` now looks like this. IDs are generated each time you run the command, so yours will
differ; use the IDs on your own screen in the commands that follow. Which of the two documents comes
first in check results also depends on the IDs.

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

## 3. Connect them with a relation

The two sections are translations of each other, so they must keep the same meaning and structure.
That relation is `same-as`.

```sh
doltap relate doltap-s-e3f0emcv same-as doltap-s-4txkm0y0 --apply
```

A declaration pointing to the other side is added to both start markers.

```markdown
<!-- doltap:start doltap-s-e3f0emcv
same-as: doltap-s-4txkm0y0
-->
```

How to write relations and how to choose among the three kinds are in
[Markers and relations (Korean)](../format.md).

## 4. Check and record a review

```sh
doltap check
```

No one has checked the new relation yet, so it shows up as pending review (`REVIEW_PENDING`). This is
not an error, so the exit code is 0. Shortened parts of the output below are marked `…`.
`PLACEHOLDER` is the place to fill in that you saw in step 1.

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

`doltap review` gathers the relations to review, what to check, and the commands to record them. You
can read the bodies of both ranges together with `doltap show <ID> --body`.

```sh
doltap review
doltap show doltap-s-e3f0emcv --body
```

Once you have read both sections and confirmed that they say the same thing, record what you checked.
Use `--by human` if a person checked it and `--by agent` if an AI did.

```sh
doltap review doltap-s-e3f0emcv doltap-s-4txkm0y0 --note "Both documents list the same requirements and operating systems" --by human --apply
```

The record goes into `.doltap/reviews.json`, and the pending review disappears when you check again.
Recording a review does not change the documents themselves.

## 5. When one side changes

Say you added FreeBSD only to the English document.

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

You are told two things: a problem (`SAME_AS_SKELETON`, exit code 1) because the number of list items
differs and **the structure no longer matches**, and a pending review because the English side
**changed since the last review and should be checked again**. If you add FreeBSD to the Korean
document too, the structure problem goes away, and once you read both sections and record the review
again, the pending review goes away as well.

If instead FreeBSD belongs only in the English document, the two sections no longer have the same
content. Then remove the relation (`doltap unrelate`) or change it to one that fits. Do not loosen
the relation just to make the check pass.

## Next steps

- How to leave and pick up work that spans several days: [Work records (Korean)](../workstreams.md)
- How to have AI agents follow this flow: [Working with agents (Korean)](../with-agents.md)
- All commands and options: [Command reference (Korean)](../commands.md)

<!-- doltap:end doltap-d-t2r1qkpf -->
