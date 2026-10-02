<!-- doltap:start doltap-d-yjg3k8w1
same-as: doltap-d-mvqg5d0w
-->

<p align="center">
  <img src="assets/doltap_long.png" width="960" alt="A cairn of five natural stones against a dark background">
</p>

# doltap

**Even when the session changes, there is a place to pick up where you left off.**

[한국어](README.md) · [User guide](docs/guide/en/README.md) · [Adopting it in an existing project (Korean)](APPLY.md) · [Verification records (Korean)](https://github.com/Jammanb0/doltap/blob/main/docs/verification/README.md)

## Does this sound familiar?

You are building something with AI. You open a new conversation the next day and find yourself
explaining yesterday's work again.

> “We agreed to do it this way. Show me a plan before changing the code.”
>
> “We were building the login feature. Here is how far we got…”
>
> “The reason we made that choice was a problem we ran into earlier…”

You can repeat the rules. Opening the files may remind you how far you got. But **why you made
a choice** is hard to find. The result is still there, while the reason is buried somewhere in
an old conversation, and after a while even you may not remember it clearly.

As documents grow, another problem appears. You update the Korean guide and the English one
stays as it was. A rule about supported environments changes, but the install guide written
from it still says the old thing. The user guide and the operating procedure end up describing
different methods. When only one side was updated, it is easy to miss.

What if you kept these things **in documents inside the project, and connected the documents
that must agree with each other**? An AI starting new work could find the rules and the work in
progress in those documents, and after editing a document it could tell what else to check.

doltap gives those records a place and checks that connected documents have not drifted apart.

## So what does it do?

It does two things.

- **It leaves a place to pick up.** Rules to always follow go in `AGENTS.md`; work in progress
  goes in `.doltap/current.md` and a status document for each piece of work. `AGENTS.md` tells
  a new session to start reading from these documents.
- **It checks connected documents.** Connect parts that must match like a translation, a basis
  and the parts that follow it, or parts that must fit together. When one side changes, doltap
  tells you where to look again and where the structure no longer matches.

**You can leave these records to the AI you work with.** Ask a desktop app or terminal AI that
can read and edit your project files. You can also run the commands yourself.

~~~text
Read this project's rules and current work records, then check what to do next.
If you edited documents, use doltap check to see what else to look at, and update the work records too.
~~~

The records are ordinary text documents in Markdown. You can open, read, and edit them without
running doltap, and you do not need to keep doltap running or register an AI API key.

## How it works

Say you have install guides in Korean and English. You put markers that do not show on the
rendered page on the matching parts of both documents, and declare that they "must keep the
same content".

~~~markdown
<!-- doltap:start doltap-s-4txkm0y0
same-as: doltap-s-e3f0emcv
-->
## Requirements

Node.js 22 or later is required.
<!-- doltap:end doltap-s-4txkm0y0 -->
~~~

If you later add one more supported operating system only to the English guide, `doltap check`
reports it like this (abbreviated; doltap's messages are in Korean). The first item is a problem
saying the two parts no longer have the same structure (a bulleted list of 4 items against 3),
and the second is a notice that one side changed since the last review and should be checked
again.

~~~text
✗ 문제 1개
  [SAME_AS_SKELETON] docs/en/install.md:12
    same-as 골격이 다릅니다: 3번째 요소 — …는 글머리 목록 4항목, …는 글머리 목록 3항목
! 확인 1개
  [REVIEW_PENDING] docs/en/install.md:5
    지난 검토 뒤 …가 바뀌었습니다. …와 여전히 같은 의미와 골격인지 확인하세요
~~~

Once a person or AI has read both parts and brought them back in line, they record what they
checked as a review. Whether the meaning is really the same is judged by whoever read them, not
by doltap.

## Try it in your project

If you already have a project in progress, give the AI you work with doltap's
[adoption procedure (Korean)](APPLY.md) and the location of your project, and ask:

~~~text
Read APPLY.md and first show me the changes for applying doltap to this project.
Preserve existing rules and records, and ask me instead of guessing what you don't know.
~~~

To try it in a new project from scratch, you need Node.js 22 or later. This is how to get the
source with Git:

~~~sh
git clone https://github.com/Jammanb0/doltap
cd doltap
~~~

From the downloaded source folder, run these two commands. There is no package installation or
build step.

~~~sh
node bin/doltap.mjs init ../my-project
node bin/doltap.mjs check ../my-project
~~~

The first command creates a `my-project` folder next to it with the basic structure, and the
second checks that structure. At first it points out places still to be filled in for your
project. To go on to connecting documents and recording a review, follow
[getting started](docs/guide/en/getting-started.md).

## Where documents live

| Location | Role |
| --- | --- |
| `AGENTS.md` | Rules that people and AI follow, and where to start reading |
| `.doltap/current.md` | Where the work in progress is |
| `.doltap/workstreams/` | Each piece of work: its goal and scope, current status, and where to resume |
| `.doltap/history.md` · `.doltap/archive/` | A list of finished work and the records from that time |
| `.doltap/reviews.json` | The last recorded check for each relation |

You do not need to memorize folder names. `AGENTS.md` says which document to read and when, and
`current.md` points to the work in progress. Work folders, archive folders, and the review file
are created when they are needed.

## What a check covers

The checker verifies that markers are well formed, that both sides of a relation point to each
other, that parts meant to be the same have the same structure, whether content changed since
the last review, whether links are broken, and whether work in progress is listed.

It does not judge whether the writing is true, whether a translation means the same thing,
whether the basis for a connection is appropriate, or whether an AI actually followed its
instructions. People and AI read the content and review those.

What was checked for doltap 1.0.0, and how, is described in the
[verification records (Korean)](https://github.com/Jammanb0/doltap/blob/main/docs/verification/README.md).

## About 1.0

From 0.1 to 0.4 (September 2026), doltap was applied to its own development to try out a range
of features and ways of working, such as a document map, a document ID ledger, delete and recover
commands, and an approval procedure for every step. Building on that experience, 1.0 is a fresh
start that focuses on a place to pick up, relations between documents, and review records. The
step-by-step approval procedure is available in [work style examples (Korean)](docs/guide/work-style.md).

The name comes from *doltap*, the Korean word for the stone cairns piled along mountain trails.
It leaves records so that someone who returns can find how far they had come.

[MIT License](LICENSE)

<!-- doltap:end doltap-d-yjg3k8w1 -->
