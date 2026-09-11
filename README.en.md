<div align="center">

# doltap

**Keep rules and progress in documents, and follow their relationships to find context again.**

One source of rules in `AGENTS.md`. One place for progress.
Codex and Claude Code read the same file.

[![test](https://github.com/Jammanb0/cairn/actions/workflows/test.yml/badge.svg)](https://github.com/Jammanb0/cairn/actions/workflows/test.yml)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![node](https://img.shields.io/badge/node-%E2%89%A522-brightgreen.svg)](package.json)

[한국어](README.md) · [Verification status](docs/trials/README.md) · [Adoption guide](APPLY.md)

</div>

---

## Sound familiar

```text
You: let's pick up where we left off yesterday
AI:  Could you tell me which task you're referring to?
You: ...
```

```text
You: I told you to ask before committing
AI:  There's no such rule in CLAUDE.md
You: I wrote it in AGENTS.md
```

**With doltap applied**

```text
You: what was I working on?
AI:  The 002-length-limit workstream is in progress.
     The checker landed yesterday; next is the template.
     Working branch is workstream/002-length-limit, merging into main.
```

What was actually checked is in the [verification status](docs/trials/README.md),
along with what still doesn't work under "알려진 제한" (known limits).

## Get started in five minutes

**New project**

```bash
npx --yes github:Jammanb0/cairn init my-project
```

**Project already in flight** — nothing gets overwritten, and you see every change first

```bash
git clone --depth 1 https://github.com/Jammanb0/cairn .doltap-bootstrap
```

Paste this to your agent.

```text
Read .doltap-bootstrap/APPLY.md and apply it to this project.
Preserve the existing rules and notes, and show me any change to an
instruction file before you make it.
```

**Check it worked**

```bash
npx --yes github:Jammanb0/cairn check .
```

## Document graph

Stable IDs connect documents and smaller ranges. The CLI recovers moved links,
tracks review freshness, and retrieves archived assumptions.

```sh
node bin/doltap.mjs map . --json
node bin/doltap.mjs context <ID> --depth 2 --budget 4000
node bin/doltap.mjs audit .doltap/rules --changed
```

Run these from this source checkout. The 009 changes are not released yet; the
GitHub installation address still uses the existing `cairn` repository. The
[graph guide](GRAPH.md) covers syntax, commands, recovery, and optional hooks.

## Rules live in exactly one place

Each tool reads its own file. Codex reads `AGENTS.md`, Claude Code reads
`CLAUDE.md`. So you end up writing the same rules twice, and fixing one side
splits them.

Make `CLAUDE.md` a one-line signpost and both tools read the same file.

```text
  Codex  ────────────────────────────┐
                                     ├──►  AGENTS.md  ──►  .doltap/
  Claude Code  ──►  CLAUDE.md  ──────┘     rule source      detailed rules
                    "@AGENTS.md"                            and progress
                    that one line is all of it
```

One source, so there is no generation step and nothing to drift out of sync.

## Work worth tracking gets its own folder

Anything worth tracking on its own gets a folder. A fresh session only has to
read that folder to know where things stand.

```text
  Starting     .doltap/plans/workstreams/002-length-limit/
                  README.md     what this is and why
                  status.md     how far it got, what comes next
                  plan.md       the order of the work (only when useful)

  Finished     .doltap/archive/workstreams/002-length-limit/
                  moved once the work has landed and you say so
                  moved, not deleted; one line stays behind in history.md
```

Each file has exactly one job. `README.md` says what the work is and why;
`status.md` says how far it got. Which branch you work on and where it merges
are decided up front and written into `status.md`, so the next session doesn't
ask again.

## Why another tool

<table>
<tr><td width="33%" valign="top">

**It carries things over**

Scattered `TODO.md` files and existing rules get surveyed and moved into place. Nothing is overwritten, and conflicts go to you.

</td><td width="33%" valign="top">

**It remembers where you work**

Base branch, merge target, whether to leave a remote branch and PR — decided once and written down.

</td><td width="33%" valign="top">

**Documents remain the source**

No mandatory global CLI or background process. Documents, IDs, and review records stay in Markdown.

</td></tr>
</table>

## Questions people ask

<details>
<summary><b>Can't I just keep a few notes files?</b></summary>

<br>

Honestly, yes — for many projects that's enough, and plenty of people work
exactly that way. doltap adds three things on top.

1. A **procedure for carrying over** the rules and notes you already have
2. A **command that checks** the documents actually link up (`doltap check`, exits 1 so CI can use it)
3. It records **which branch a larger piece of work lives on**

</details>

<details>
<summary><b>Does it work with Cursor or Copilot?</b></summary>

<br>

Any tool that reads `AGENTS.md` works. It does **not** convert rules into each
tool's own format — [rulesync](https://github.com/dyoshikawa/rulesync) and
[ai-rules-sync](https://github.com/PanisHandsome/ai-rules-sync) do that better.

</details>

<details>
<summary><b>How is this different from Spec Kit or OpenSpec?</b></summary>

<br>

Those cover **what to build** (requirements). doltap covers **how you work and how
far you got**. Different layers, so they don't collide.

</details>

<details>
<summary><b>Does it enforce the rules?</b></summary>

<br>

No. Hooks are optional and never installed automatically. There is no background
process. The same checker can run manually, from an optional hook, or in CI.

</details>

<details>
<summary><b>What happens to finished work?</b></summary>

<br>

A finished workstream moves to `.doltap/archive/workstreams/` after approval.
Its IDs and relationships stay searchable in the map and context output. Older
records are frozen under `.doltap/archive/legacy/`: graph integrity is checked,
but current writing rules and review freshness are not imposed retroactively.
Unresolved assumptions and questions must be resolved, carried forward with an
active relationship, or discarded with a reason before archiving.

</details>

<details>
<summary><b>How much of this is verified?</b></summary>

<br>

The 009 branch has local automated tests and an observed VS Code anchor-navigation
check. Previous CI and agent-behavior trials are separate evidence, not proof of
the new graph workflow. See [verification status](docs/trials/README.md).

</details>

## What's in it

This is what `doltap init` gives you. The original lives in `template/` in this
repository, and most of it arrives blank — you fill it in as you go.

```text
AGENTS.md        rules that always apply, plus a table pointing to the rest
CLAUDE.md        the single line "@AGENTS.md"
.doltap/
  project.md     what the project is as a whole
  rules/         verification and communication
  plans/
    README.md       the document map and reading order
    current.md      where the work in progress lives
    workstreams.md  how tracked work is run
    history.md      one line per finished task
    ideas.md        candidates not committed to yet
    workstreams/<number>-<name>/    one folder per tracked piece of work
```

The CLI also provides map, context, audit, ID, relationship, review, migration,
and recovery commands. Markdown remains readable without the tool.

If you are browsing this repository and notice an `AGENTS.md` and an `.doltap/`
at the root too, those are not part of what ships. **They are doltap applied to
doltap itself** — real operating documents, where you can read the work in
progress and the record of what came before. CI runs `doltap check .` against
them on every push. What you get is the `template/` copy.

---

<div align="center">

A doltap is a stack of stones left along a mountain trail.<br>
It doesn't make the path for you, but it tells the next person — or you, coming back — how far things got.<br>
You don't knock down the ones you passed, either. Leaving them standing is what shows how far you've walked.

**MIT**

</div>
