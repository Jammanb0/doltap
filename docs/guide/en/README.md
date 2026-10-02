<!-- doltap:start doltap-d-fqq7wa3x
same-as: doltap-d-r9tfqq7c
-->

# User guide

[한국어](../README.md)

doltap does not write documents for you. People or the AI they work with edit Markdown documents as
usual, and doltap then finds **what has drifted apart, what needs to be checked again, and where the
work in progress is**. You can run the commands yourself or leave them to an AI that can use a
terminal. doltap's messages are in Korean, and pages marked (Korean) are not translated yet.

## If you are new, read in this order

1. [Getting started](getting-started.md) — install doltap, create a new project, connect two documents
   with a relation, and record a review.
2. [Markers and relations (Korean)](../format.md) — when and how to use range markers and the three
   kinds of relations.
3. [Work records (Korean)](../workstreams.md) — how to leave, pick up, and archive work in progress.

## Look things up when you need them

| What you want to do | Read |
| --- | --- |
| Apply doltap to a project already in progress | [Adoption procedure (Korean)](../../../APPLY.md) |
| Have AI agents read the rules and work records | [Working with agents (Korean)](../with-agents.md) |
| Look up commands, options, exit codes, and output | [Command reference (Korean)](../commands.md) |
| Look up and fix the codes in check results | [Check reference (Korean)](../checks.md) |
| Run strict rules for approvals, commits, and branches | [Work style examples (Korean)](../work-style.md) |
| Get a new version of doltap | [Getting a new version (Korean)](../updating.md) |
| Check the exact syntax of markers and relations and the review record format | [Markers and relations (Korean)](../format.md) |

## Reading the commands

`doltap` in this guide is short for the command that runs doltap. If you use the source, it means
`node <doltap folder>/bin/doltap.mjs`. Check how to run it in [Getting started](getting-started.md)
first. Replace `<ID>` or `<folder>` with real values; do not type the angle brackets themselves.

Commands that change files first show only what would change. After checking, add `--apply` to the
same command to write the change. Only `init` creates files right away, in an empty folder.

<!-- doltap:end doltap-d-fqq7wa3x -->
