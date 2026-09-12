import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { check } from "../lib/check.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CLI = join(ROOT, "bin/doltap.mjs");

function run(args, options = {}) {
  return execFileSync(process.execPath, [CLI, ...args], { encoding: "utf8", ...options });
}

function workspace() {
  return mkdtempSync(join(tmpdir(), "doltap-init-"));
}

test("골격을 만들고 프로젝트 이름을 채운다", () => {
  const dir = workspace();
  try {
    const output = run(["init", "my-project"], { cwd: dir });
    const target = join(dir, "my-project");

    assert.match(output, /골격을 만들었습니다/);
    assert.equal(readFileSync(join(target, "CLAUDE.md"), "utf8").trim(), "@AGENTS.md");

    const agents = readFileSync(join(target, "AGENTS.md"), "utf8");
    assert.match(agents, /^# my-project$/m);
    assert.ok(!agents.includes("채우기: 프로젝트 이름"));

    // 골격 문서가 빠짐없이 들어간다
    assert.deepEqual(
      readdirSync(join(target, ".doltap/rules")).sort(),
      ["communication.md", "verification.md"]
    );
    assert.deepEqual(
      readdirSync(join(target, ".doltap/plans")).sort(),
      ["README.md", "current.md", "decisions.md", "history.md", "ideas.md", "project.md", "workstreams.md"]
    );
    assert.ok(existsSync(join(target, ".doltap/plans/project.md")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("만든 프로젝트가 곧바로 check를 통과한다", () => {
  const dir = workspace();
  try {
    run(["init", "my-project"], { cwd: dir });
    const result = check(join(dir, "my-project"));
    assert.deepEqual(result.problems, [], result.problems.map((f) => f.message).join("\n"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("파일이 있는 폴더는 건드리지 않고 멈춘다", () => {
  const dir = workspace();
  try {
    writeFileSync(join(dir, "README.md"), "기존 프로젝트\n");
    assert.throws(
      () => run(["init", "."], { cwd: dir }),
      (error) =>
        error.status === 1 &&
        /이미 파일이 있습니다/.test(error.stderr) &&
        /APPLY.md/.test(error.stderr)
    );
    assert.deepEqual(readdirSync(dir), ["README.md"]);
    assert.ok(!existsSync(join(dir, "AGENTS.md")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("폴더 이름을 주지 않으면 사용법을 보여주고 멈춘다", () => {
  assert.throws(
    () => run(["init"]),
    (error) => error.status === 1 && /폴더 이름이 필요합니다/.test(error.stderr)
  );
});

test("공백과 특수문자가 든 이름도 그대로 붙여 넣을 수 있게 인용한다", () => {
  const dir = workspace();
  try {
    const output = run(["init", "it's mine"], { cwd: dir });
    // POSIX 셸 인용을 거치면 it's mine 은 'it'\''s mine' 이 된다.
    const BACKSLASH = String.fromCharCode(92);
    const quoted = "cd 'it'" + BACKSLASH + "''s mine'";
    assert.ok(output.includes(quoted), output);
    assert.match(readFileSync(join(dir, "it's mine/AGENTS.md"), "utf8"), /^# it's mine$/m);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("모르는 명령은 사용법과 함께 멈춘다", () => {
  assert.throws(
    () => run(["nope"]),
    (error) => error.status === 1 && /모르는 명령입니다/.test(error.stderr)
  );
});
