import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { ID_PATTERN } from "../lib/graph.mjs";
import {
  REGISTRY_FILE,
  allocate,
  assertUniqueRegistryIds,
  formatRegistry,
  isStaleLock,
  nextId,
  parseRegistry,
  pidAlive,
  readRegistry,
  registryPath,
  release,
  setState,
  tryCreateLock,
  usedIds,
  writeRegistry,
} from "../lib/ids.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OP = ".doltap";

function project() {
  const dir = mkdtempSync(join(tmpdir(), "doltap-ids-"));
  mkdirSync(join(dir, OP), { recursive: true });
  return dir;
}

// --- 잡아야 할 경우는 design.md 의 「ID」와 「발급 레지스트리」에서 뽑았다. ---

test("발급한 ID 가 형식과 문자 집합을 지킨다", () => {
  const used = new Set();
  for (let i = 0; i < 300; i += 1) {
    const id = nextId("s", used);
    assert.match(id, ID_PATTERN, id);
    // i l o u 는 뺀 문자다. 하나라도 나오면 문자 집합이 틀린 것이다.
    assert.doesNotMatch(id.slice("doltap-s-".length), /[ilou]/, id);
    used.add(id);
  }
  assert.equal(used.size, 300, "같은 ID 가 두 번 나왔습니다");
});

test("이미 쓰인 ID 를 다시 발급하지 않는다", () => {
  // 후보 공간을 하나만 남기지 못하므로, 뽑힌 것을 곧바로 막아 확인한다.
  for (let i = 0; i < 50; i += 1) {
    const first = nextId("d", new Set());
    const second = nextId("d", new Set([first]));
    assert.notEqual(second, first);
  }
});

test("지운 ID 를 다시 발급하지 않는다", () => {
  const dir = project();
  const id = allocate({ root: dir, operatingDir: OP, kind: "s", path: "AGENTS.md" });
  setState({ root: dir, operatingDir: OP, id, state: "삭제", replacedBy: null });

  const rows = readRegistry(dir, OP);
  assert.equal(rows.length, 1, "지운 줄이 사라졌습니다");
  assert.equal(rows[0].state, "삭제");
  assert.ok(usedIds(rows).has(id), "지운 ID 가 쓰인 것으로 보이지 않습니다");
  // 활성 문서만 봤다면 이 ID 는 비어 있는 것으로 보인다.
  assert.ok(!usedIds([], []).has(id));
});

test("아카이브한 ID 도 다시 발급하지 않는다", () => {
  const dir = project();
  const id = allocate({ root: dir, operatingDir: OP, kind: "d", path: "AGENTS.md" });
  setState({ root: dir, operatingDir: OP, id, state: "아카이브", path: "archive/old.md" });
  const rows = readRegistry(dir, OP);
  assert.equal(rows[0].state, "아카이브");
  assert.ok(usedIds(rows).has(id));
});

test("대체 ID 도 쓰인 것으로 본다", () => {
  const rows = [{ id: "doltap-s-aaaaaaaa", kind: "s", state: "삭제", path: "(없음)", replacedBy: "doltap-s-bbbbbbbb" }];
  const used = usedIds(rows);
  assert.ok(used.has("doltap-s-aaaaaaaa"));
  assert.ok(used.has("doltap-s-bbbbbbbb"));
});

test("같은 범위에 두 번 실행해도 ID 가 그대로다", () => {
  const dir = project();
  const first = allocate({ root: dir, operatingDir: OP, kind: "s", path: "AGENTS.md" });
  const again = allocate({ root: dir, operatingDir: OP, kind: "s", path: "AGENTS.md", existingId: first });
  assert.equal(again, first);
  // 줄이 늘지 않아야 한다. 늘면 같은 ID 가 두 줄이 된다.
  assert.equal(readRegistry(dir, OP).length, 1);
});

test("파일이 옮겨지면 경로만 고치고 ID 는 그대로다", () => {
  const dir = project();
  const id = allocate({ root: dir, operatingDir: OP, kind: "d", path: "old.md" });
  const again = allocate({ root: dir, operatingDir: OP, kind: "d", path: "new.md", existingId: id });
  assert.equal(again, id);
  assert.equal(readRegistry(dir, OP)[0].path, "new.md");
});

test("문서에 살아 있는 ID 와도 겹치지 않는다", () => {
  const dir = project();
  // 발급 기록에는 없지만 문서에 이미 있는 ID 를 막아야 한다.
  const live = [];
  for (let i = 0; i < 200; i += 1) live.push(nextId("s", new Set(live)));
  const id = allocate({ root: dir, operatingDir: OP, kind: "s", path: "AGENTS.md", liveIds: live });
  assert.ok(!live.includes(id));
});

test("발급 기록은 사람이 읽는 마크다운 표다", () => {
  const dir = project();
  allocate({ root: dir, operatingDir: OP, kind: "s", path: "AGENTS.md" });
  const text = readFileSync(registryPath(dir, OP), "utf8");
  assert.match(text, /^# 발급한 ID/);
  assert.match(text, /\| ID \| 종류 \| 상태 \| 경로 \| 대체 \|/);
  // 다시 읽어도 같은 줄이 나와야 한다.
  assert.deepEqual(parseRegistry(text), readRegistry(dir, OP));
});

test("사람이 위에 덧붙인 설명은 표 해석을 깨지 않는다", () => {
  const dir = project();
  const id = allocate({ root: dir, operatingDir: OP, kind: "b", path: "AGENTS.md" });
  const path = registryPath(dir, OP);
  writeFileSync(path, `# 발급한 ID\n\n메모를 덧붙였습니다.\n\n${readFileSync(path, "utf8")}`);
  assert.equal(readRegistry(dir, OP)[0].id, id);
});

test("표에 없는 ID 의 상태를 바꾸려 하면 멈춘다", () => {
  const dir = project();
  assert.throws(
    () => setState({ root: dir, operatingDir: OP, id: "doltap-s-aaaaaaaa", state: "삭제" }),
    /발급 기록에 없는 ID/
  );
});

test("모르는 상태와 종류를 받지 않는다", () => {
  const dir = project();
  const id = allocate({ root: dir, operatingDir: OP, kind: "s", path: "AGENTS.md" });
  assert.throws(() => setState({ root: dir, operatingDir: OP, id, state: "폐기" }), /모르는 상태/);
  assert.throws(
    () => allocate({ root: dir, operatingDir: OP, kind: "d", path: "archive.md", initialState: "폐기" }),
    /모르는 상태/
  );
  assert.throws(() => nextId("x", new Set()), /모르는 종류/);
});

test("쓰기가 끝나면 잠금 파일이 남지 않는다", () => {
  const dir = project();
  allocate({ root: dir, operatingDir: OP, kind: "s", path: "AGENTS.md" });
  const left = readdirSync(join(dir, OP)).filter((name) => name !== REGISTRY_FILE);
  assert.deepEqual(left, [], `남은 파일: ${left.join(", ")}`);
});

test("죽은 프로세스가 남긴 잠금이 영원히 막지 않는다", () => {
  const dir = project();
  // 오래된 시각을 적어 두면 다음 실행이 걷어내야 한다.
  writeFileSync(join(dir, OP, "ids.lock"), `999999 ${Date.now() - 60_000}\n`);
  const id = allocate({ root: dir, operatingDir: OP, kind: "s", path: "AGENTS.md" });
  assert.match(id, ID_PATTERN);
  assert.ok(!existsSync(join(dir, OP, "ids.lock")), "잠금이 남았습니다");
});

test("두 프로세스가 동시에 발급해도 같은 ID 가 두 줄이 되지 않는다", async () => {
  const dir = project();
  // 순차로 돌리면 동시성을 전혀 시험하지 않는다. 둘을 띄워 놓고 함께 기다린다.
  const module = pathToFileURL(join(ROOT, "lib/ids.mjs")).href;
  const script = `
    import { allocate } from ${JSON.stringify(module)};
    for (let i = 0; i < 25; i += 1) {
      allocate({ root: ${JSON.stringify(dir)}, operatingDir: ${JSON.stringify(OP)}, kind: "s", path: "x.md" });
    }
  `;
  const run = () =>
    new Promise((done, failed) => {
      const child = spawn(process.execPath, ["--input-type=module", "-e", script], { stdio: "pipe" });
      let err = "";
      child.stderr.on("data", (chunk) => (err += chunk));
      child.on("close", (code) => (code === 0 ? done() : failed(new Error(err))));
    });

  await Promise.all([run(), run()]);

  const rows = readRegistry(dir, OP);
  assert.equal(rows.length, 50, `줄이 ${rows.length}개입니다 — 잃거나 덮어썼습니다`);
  assert.equal(new Set(rows.map((r) => r.id)).size, 50, "같은 ID 가 두 줄입니다");
  assert.ok(!existsSync(join(dir, OP, "ids.lock")), "잠금이 남았습니다");
});

test("같은 ID 를 두 줄로 적어 두면 읽을 때 드러난다", () => {
  // 사람이 손으로 고쳐 겹치게 만들 수 있다. 읽기가 조용히 합치지 않아야 한다.
  const rows = parseRegistry(
    formatRegistry([
      { id: "doltap-s-aaaaaaaa", kind: "s", state: "활성", path: "a.md", replacedBy: null },
      { id: "doltap-s-aaaaaaaa", kind: "s", state: "활성", path: "b.md", replacedBy: null },
    ])
  );
  assert.equal(rows.length, 2);
  assert.throws(() => assertUniqueRegistryIds(rows), /같은 ID 가 두 줄입니다/);
});

test("중복 행 가운데 삭제 표식이 있으면 ID 를 되살리지 않는다", () => {
  const dir = project();
  const id = "doltap-s-aaaaaaaa";
  writeRegistry(dir, OP, [
    { id, kind: "s", state: "활성", path: "live.md", replacedBy: null },
    { id, kind: "s", state: "삭제", path: "(없음)", replacedBy: null },
  ]);

  assert.throws(
    () => allocate({ root: dir, operatingDir: OP, kind: "s", path: "reused.md", existingId: id }),
    /같은 ID 가 두 줄입니다/
  );
  assert.deepEqual(
    readRegistry(dir, OP).map((row) => [row.state, row.path]),
    [
      ["활성", "live.md"],
      ["삭제", "(없음)"],
    ],
    "거절하면서 기존 행을 바꾸면 안 됩니다"
  );
});

test("빈 발급 기록도 읽힌다", () => {
  const dir = project();
  assert.deepEqual(readRegistry(dir, OP), []);
  writeRegistry(dir, OP, []);
  assert.deepEqual(readRegistry(dir, OP), []);
});

test("읽지 못한 잠금을 오래된 것으로 보지 않는다", () => {
  // 잠금은 만든 직후 내용을 쓰기 전까지 잠깐 비어 있다. 그 순간을 오래된 것으로
  // 읽으면 남이 쥔 잠금을 빼앗아 둘이 동시에 들어가고, 발급 줄을 잃는다.
  const now = Date.now();
  assert.equal(isStaleLock("", now), false, "빈 잠금을 빼앗았습니다");
  assert.equal(isStaleLock("1234", now), false, "시각이 없는 잠금을 빼앗았습니다");
  assert.equal(isStaleLock("망가진 내용", now), false);
  assert.equal(isStaleLock(`1234 ${now - 1000}\n`, now), false, "방금 잡은 잠금을 빼앗았습니다");
  // 시각을 읽을 수 있고 정말 오래됐을 때만 걷어낸다.
  assert.equal(isStaleLock(`1234 ${now - 60_000}\n`, now), true);
});

// --- 두 번째 검토에서 드러난 누락. 각각 재현한 뒤 고쳤다. ---

test("지운 ID 를 existingId 로 되살릴 수 없다", () => {
  const dir = project();
  const id = allocate({ root: dir, operatingDir: OP, kind: "s", path: "old.md" });
  setState({ root: dir, operatingDir: OP, id, state: "삭제" });
  assert.throws(
    () => allocate({ root: dir, operatingDir: OP, kind: "s", path: "new.md", existingId: id }),
    /지운 ID 는 다시 쓸 수 없습니다/
  );
  // 거절만 하는 것이 아니라 지운 줄을 건드리지도 않아야 한다.
  const row = readRegistry(dir, OP).find((r) => r.id === id);
  assert.equal(row.state, "삭제");
  assert.equal(row.path, "(없음)");
});

test("기존 ID 를 확인해도 아카이브 상태는 바뀌지 않는다", () => {
  const dir = project();
  const id = allocate({ root: dir, operatingDir: OP, kind: "s", path: "a.md" });
  setState({ root: dir, operatingDir: OP, id, state: "아카이브", path: "archive/a.md" });
  assert.equal(allocate({ root: dir, operatingDir: OP, kind: "s", path: "archive/moved.md", existingId: id }), id);
  const row = readRegistry(dir, OP)[0];
  assert.equal(row.state, "아카이브");
  assert.equal(row.path, "archive/moved.md");
});

test("새 아카이브 ID 를 처음부터 아카이브 상태로 기록한다", () => {
  const dir = project();
  const id = allocate({
    root: dir,
    operatingDir: OP,
    kind: "d",
    path: ".doltap/archive/workstreams/001/README.md",
    initialState: "아카이브",
  });
  const row = readRegistry(dir, OP)[0];
  assert.equal(row.id, id);
  assert.equal(row.state, "아카이브");
});

test("한 글자가 아닌 종류를 받지 않는다", () => {
  // `"dsb".includes(kind)` 로 보면 ds 와 빈 문자열이 통과해 doltap-ds-... 가 나온다.
  for (const kind of ["ds", "sb", "dsb", "", "x", "D"]) {
    assert.throws(() => nextId(kind, new Set()), /모르는 종류/, `nextId(${JSON.stringify(kind)})`);
  }
});

test("형식이 아닌 existingId 를 받지 않는다", () => {
  const dir = project();
  // 그대로 넣으면 표에 들어갔다가 다시 읽을 때 사라진다.
  assert.throws(
    () => allocate({ root: dir, operatingDir: OP, kind: "s", path: "x.md", existingId: "not-an-id" }),
    /ID 형식이 아닙니다/
  );
  assert.deepEqual(readRegistry(dir, OP), []);
});

test("ID 안의 종류와 다른 종류로 기록하지 않는다", () => {
  const dir = project();
  assert.throws(
    () => allocate({ root: dir, operatingDir: OP, kind: "d", path: "y.md", existingId: "doltap-s-aaaaaaaa" }),
    /ID 의 종류와 다릅니다/
  );
});

test("주인이 살아 있는 잠금은 오래돼도 빼앗지 않는다", () => {
  // 시간만 보면 오래 걸리는 작업이나 잠시 멈춘 프로세스의 잠금을 빼앗는다.
  const now = Date.now();
  assert.equal(isStaleLock(`${process.pid} ${now - 60_000}`, now), false, "살아 있는 주인의 잠금을 빼앗았습니다");
  assert.equal(isStaleLock(`1234 ${now - 60_000}`, now, () => true), false);
  // 주인이 없고 시각도 오래됐을 때만 걷어낸다.
  assert.equal(isStaleLock(`1234 ${now - 60_000}`, now, () => false), true);
  assert.equal(isStaleLock(`1234 ${now - 1_000}`, now, () => false), false, "방금 잡은 잠금을 빼앗았습니다");
});

test("PID 를 읽을 수 없으면 빼앗지 않는다", () => {
  const now = Date.now();
  assert.equal(isStaleLock(`알수없음 ${now - 60_000}`, now, () => false), false);
  assert.equal(isStaleLock(`0 ${now - 60_000}`, now, () => false), false);
});

test("살아 있는 프로세스는 살아 있다고 본다", () => {
  assert.equal(pidAlive(process.pid), true);
  // 있을 법하지 않은 PID. 없으면 false 여야 한다.
  assert.equal(pidAlive(0x7ffffff), false);
});

test("잠금 내용을 쓰지 못하면 핸들과 불완전한 파일을 치운다", () => {
  const calls = [];
  const writeFailure = new Error("쓸 수 없음");
  assert.throws(
    () =>
      tryCreateLock("ids.lock", "123 456\n", {
        openSync() {
          calls.push("open");
          return 7;
        },
        writeFileSync() {
          calls.push("write");
          throw writeFailure;
        },
        closeSync(fd) {
          calls.push(`close:${fd}`);
        },
        unlinkSync(path) {
          calls.push(`unlink:${path}`);
        },
      }),
    (error) => error === writeFailure
  );
  assert.deepEqual(calls, ["open", "write", "close:7", "unlink:ids.lock"]);
});

test("Windows 잠금 열기 EPERM은 재시도하되 다른 주인의 잠금은 건드리지 않는다", () => {
  const busy = Object.assign(new Error("일시적인 열기 실패"), { code: "EPERM" });
  let opens = 0;
  const calls = [];
  const io = {
    openSync(_path, flags) { assert.equal(flags, "wx"); if (++opens < 3) throw busy; return 7; },
    writeFileSync(fd) { calls.push(`write:${fd}`); },
    closeSync(fd) { calls.push(`close:${fd}`); },
    unlinkSync() { assert.fail("얻지 않은 잠금을 지우면 안 됨"); }
  };
  assert.equal(tryCreateLock("ids.lock", "123 456\n", io, "win32"), true);
  assert.equal(opens, 3);
  assert.deepEqual(calls, ["write:7", "close:7"]);
  opens = 0; calls.length = 0;
  io.openSync = () => { throw ++opens === 1 ? busy : Object.assign(new Error("다른 주인"), { code: "EEXIST" }); };
  assert.equal(tryCreateLock("ids.lock", "123 456\n", io, "win32"), false);
  assert.deepEqual(calls, []);
});

test("지속되는 잠금 권한 오류와 Windows 밖 오류는 원래 오류로 끝난다", () => {
  const failure = Object.assign(new Error("권한 없음"), { code: "EPERM" });
  let opens = 0;
  const io = { openSync() { opens++; throw failure; } };
  assert.throws(() => tryCreateLock("ids.lock", "", io, "win32"), e => e === failure);
  assert.equal(opens, 40);
  opens = 0;
  assert.throws(() => tryCreateLock("ids.lock", "", io, "linux"), e => e === failure);
  assert.equal(opens, 1);
});

test("잠금을 풀지 못하면 false 를 돌려준다", () => {
  // 지울 수 없는 자리를 만들어 해제 실패 자체를 본다. allocate 로 돌리면
  // 잠금을 **얻지** 못해 실패하는 다른 경로를 타고, 대기 시간도 길다.
  const dir = project();
  const blocked = join(dir, OP, "ids.lock");
  mkdirSync(join(blocked, "막음"), { recursive: true });
  assert.equal(release(blocked), false, "지우지 못했는데 성공으로 봤습니다");
});

test("잠금을 풀면 true 를 돌려준다", () => {
  const dir = project();
  const path = join(dir, OP, "ids.lock");
  writeFileSync(path, `1 ${Date.now()}\n`);
  assert.equal(release(path), true);
  assert.ok(!existsSync(path));
  // 이미 없어도 성공으로 본다.
  assert.equal(release(path), true);
});
