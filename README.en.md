# doltap

**Keep rules and progress in documents, and follow their links back to the evidence.**
Codex and Claude Code share AGENTS.md. Each workstream keeps its current status in one place.

[한국어](README.md) · [Graph guide](GRAPH.md) · [Adoption guide](APPLY.md) · [Test reports](docs/trials/README.md)

## What it does

- **Resume work:** find the active workstream, its status, and the next action.
- **Check documents:** find missing files, duplicate IDs, broken ranges, and unreachable documents.
- **Follow evidence:** see what a document references and what depends on it.
- **Review changes:** identify relationships that need another review and record the reasoning.
- **Edit safely:** preview ID and path edits, and recover interrupted changes across files.

Markdown is the source. Read it without the CLI. No background process or AI API key is required.

## Get started

Use Node.js 22 or later. Run these commands from **the source directory matching this version
of the documentation**. No dependency installation or build step is needed.

To create a project:

~~~sh
node bin/doltap.mjs init ../my-project
node bin/doltap.mjs check ../my-project
~~~

This creates AGENTS.md, CLAUDE.md, and .doltap/. Fill in the language, verification commands,
and other project settings. Existing files in a nonempty directory are protected.

For an existing project, follow [APPLY.md](APPLY.md) to merge its rules and records.
Give your agent the guide's location and the project to adopt it into:

~~~text
Read APPLY.md and apply it to this project.
Preserve the existing rules and records, and show me instruction-file changes first.
~~~

## Where information lives

| Location | Role |
| --- | --- |
| AGENTS.md · CLAUDE.md | Shared rules and tool entry points |
| .doltap/project.md · rules/ | Project overview and detailed rules |
| .doltap/plans/current.md | Active workstream locations |
| .doltap/plans/decisions.md · ideas.md | Current project decisions, assumptions, and unstarted candidates |
| .doltap/plans/workstreams/ | Workstream scope, status, and plans |
| .doltap/plans/history.md · archive/ | Completed workstream locations and historical sources |
| .doltap/ids.md · reviews/ | Issued IDs and review records |

Current rules and assumptions live in active documents. Archives explain past decisions;
archiving a decision does not make it an ongoing rule. This repository uses doltap for its own work.
The skeleton copied to new projects lives in template/.

## Follow the connections

~~~sh
node bin/doltap.mjs map .
node bin/doltap.mjs context <node-ID>
node bin/doltap.mjs audit .doltap/rules --changed
~~~

Replace `<node-ID>` with an actual ID from the map. Several documents can reference one rule,
and one document can reference several sources. Each relationship has its own review state.
See [GRAPH.md](GRAPH.md) for creating IDs, connecting documents, and recording reviews.

## What a check establishes

The checker verifies document structure and explicit relationships. People and agents still need to
judge whether the content is true, the relationships make sense, and instructions were followed.
[File-by-file test reports](docs/trials/README.md) describe the methods and results.

The name comes from the Korean word for a cairn: stones that help a returning traveler find their way.

[MIT License](LICENSE)
