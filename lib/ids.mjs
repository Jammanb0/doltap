// 불변 ID 를 발급하고 발급 기록을 관리한다.
// 형식의 원본은 .agents/plans/workstreams/009-document-graph/design.md 의
// 「ID」와 「발급 레지스트리」다.
//
// 발급 기록을 두는 이유는 하나다. 활성 문서만 훑으면 **지운 ID 를 다시
// 발급하게 된다.** 지운 줄은 지우지 않고 상태만 바꾼다.

import { randomBytes } from "node:crypto";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, unlinkSync, writeFileSync, writeSync } from "node:fs";
import { dirname, join } from "node:path";

import { ID_PATTERN } from "./graph.mjs";

// Crockford Base32 소문자. i l o u 를 뺀다 — 1·l 과 0·o 를 가르고, 뜻하지 않은
// 낱말이 만들어지는 것도 줄인다.
const ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";
const LENGTH = 8;

export const STATES = ["활성", "아카이브", "삭제"];
export const REGISTRY_FILE = "ids.md";
const LOCK_FILE = "ids.lock";
// 죽은 프로세스가 남긴 잠금이 영원히 막지 않게 한다. 상주 프로세스를 두지
// 않으므로 잠금을 풀어 줄 감시자도 없다.
const STALE_MS = 30_000;

const HEADER = [
  "# 발급한 ID",
  "",
  "> doltap 이 발급한 ID 를 모두 적습니다. **지운 줄을 지우지 않습니다** —",
  "> 지우면 같은 ID 가 다시 발급되어 옛 링크가 엉뚱한 곳을 가리킵니다.",
  "> 이 파일은 doltap 이 고칩니다. 직접 고치면 발급과 어긋날 수 있습니다.",
  "",
  "| ID | 종류 | 상태 | 경로 | 대체 |",
  "| --- | --- | --- | --- | --- |",
];

function randomId(kind) {
  // 8자는 40비트다. 5바이트를 그대로 32진수 여덟 자리로 쓴다.
  const bytes = randomBytes(5);
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) | BigInt(byte);
  let out = "";
  for (let i = 0; i < LENGTH; i += 1) {
    out = ALPHABET[Number(value & 31n)] + out;
    value >>= 5n;
  }
  return `doltap-${kind}-${out}`;
}

export function registryPath(root, operatingDir) {
  return join(root, operatingDir, REGISTRY_FILE);
}

// 표만 읽는다. 사람이 위에 설명을 덧붙여도 깨지지 않는다.
export function parseRegistry(text) {
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith("|")) continue;
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    if (cells.length < 5) continue;
    const [id, kind, state, path, replacedBy] = cells;
    if (!ID_PATTERN.test(id)) continue; // 제목 줄과 구분선
    rows.push({ id, kind, state, path, replacedBy: replacedBy || null });
  }
  return rows;
}

export function formatRegistry(rows) {
  const body = [...rows]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((r) => `| ${r.id} | ${r.kind} | ${r.state} | ${r.path || "(없음)"} | ${r.replacedBy ?? ""} |`);
  return [...HEADER, ...body, ""].join("\n");
}

export function readRegistry(root, operatingDir) {
  const path = registryPath(root, operatingDir);
  if (!existsSync(path)) return [];
  return parseRegistry(readFileSync(path, "utf8"));
}

// 잠깐 기다린다. 바쁜 대기로 돌면 잠금을 쥔 쪽의 CPU 까지 뺏어 오히려 느려진다.
const IDLE = new Int32Array(new SharedArrayBuffer(4));
function pause(ms) {
  Atomics.wait(IDLE, 0, 0, ms);
}

// Windows 는 다른 프로세스가 대상 파일을 열고 있으면 rename 을 EPERM 으로
// 거절한다. 백신이나 색인기가 잠깐 잡고 있는 것만으로도 난다. 잠금으로 막는
// 것은 우리 프로세스끼리의 경쟁이지 남이 파일을 여는 것이 아니므로, 짧게
// 다시 시도한다. 성공했을 때 원자적이라는 성질은 그대로다.
function renameWithRetry(from, to) {
  for (let tries = 0; ; tries += 1) {
    try {
      renameSync(from, to);
      return;
    } catch (error) {
      const transient = error.code === "EPERM" || error.code === "EBUSY" || error.code === "EACCES";
      // 2초까지 기다린다. 백신이 파일을 잡고 있는 시간은 밀리초일 때가 많지만
      // 부하가 걸리면 길어진다. 실패 경로에서만 드는 시간이라 넉넉히 둔다.
      if (!transient || tries >= 200) throw error;
      pause(10);
    }
  }
}

// 임시 파일에 다 쓴 뒤 바꿔치기한다. 중간에 멈춰도 원본이 그대로 남는다.
export function writeRegistry(root, operatingDir, rows) {
  const path = registryPath(root, operatingDir);
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.tmp`;
  writeFileSync(temp, formatRegistry(rows));
  try {
    renameWithRetry(temp, path);
  } catch (error) {
    // 바꿔치기하지 못했으면 임시 파일을 남기지 않는다. 원본은 그대로다.
    rmSync(temp, { force: true });
    throw error;
  }
}

// 잠금은 파일을 배타적으로 만드는 것으로 잡는다. 같은 순간에 둘이 성공할 수 없다.
function acquire(root, operatingDir) {
  const path = join(root, operatingDir, LOCK_FILE);
  mkdirSync(dirname(path), { recursive: true });
  const deadline = Date.now() + STALE_MS * 2;
  while (Date.now() < deadline) {
    try {
      const fd = openSync(path, "wx");
      writeSync(fd, `${process.pid} ${Date.now()}\n`);
      closeSync(fd);
      return path;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      if (isStaleLock(readLockStamp(path), Date.now())) {
        rmSync(path, { force: true });
        continue;
      }
      pause(10);
    }
  }
  throw new Error(
    `발급 기록 잠금을 얻지 못했습니다: ${path}\n` +
      "doltap 이 돌고 있지 않다면 이 파일을 지우고 다시 실행하세요."
  );
}

function readLockStamp(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

// 죽은 프로세스가 남긴 잠금만 걷어낸다.
//
// **읽지 못하면 빼앗지 않는다.** 잠금은 만든 직후 내용을 쓰기 전까지 잠깐 비어
// 있고, 그 순간을 「오래됐다」로 읽으면 남이 쥔 잠금을 빼앗아 둘이 동시에
// 들어간다. 실제로 그렇게 발급 줄을 잃었다. 못 읽으면 방금 만들어진 것으로 본다.
//
// 만들자마자 죽은 아주 드문 경우에는 잠금이 남는다. 그때는 기다리다 실패하며
// 어느 파일을 지우면 되는지 알린다. 조용히 기록이 깨지는 것보다 낫다.
export function isStaleLock(content, now) {
  const stamp = Number(String(content).trim().split(/\s+/)[1]);
  if (!Number.isFinite(stamp) || stamp <= 0) return false;
  return now - stamp > STALE_MS;
}

function release(path) {
  for (let tries = 0; tries < 20; tries += 1) {
    try {
      unlinkSync(path);
      return;
    } catch (error) {
      if (error.code === "ENOENT") return; // 이미 없으면 그만이다.
      pause(5);
    }
  }
}

// 잠금을 잡고 발급 기록을 고친다. 예외가 나도 잠금은 반드시 푼다.
export function withRegistry(root, operatingDir, change) {
  const lock = acquire(root, operatingDir);
  try {
    const rows = readRegistry(root, operatingDir);
    const result = change(rows);
    writeRegistry(root, operatingDir, rows);
    return result;
  } finally {
    release(lock);
  }
}

// 이미 쓰인 ID 를 모은다. 활성 문서만 보면 지운 ID 를 다시 발급하게 되므로
// 발급 기록의 모든 상태를 함께 본다.
export function usedIds(rows, liveIds = []) {
  const used = new Set(liveIds);
  for (const row of rows) {
    used.add(row.id);
    if (row.replacedBy) used.add(row.replacedBy);
  }
  return used;
}

export function nextId(kind, used) {
  if (!"dsb".includes(kind)) throw new Error(`모르는 종류입니다: ${kind}`);
  for (let tries = 0; tries < 1000; tries += 1) {
    const candidate = randomId(kind);
    if (!used.has(candidate)) return candidate;
  }
  throw new Error("ID 후보를 만들지 못했습니다");
}

// 범위 하나에 ID 를 준다. **이미 있으면 새로 만들지 않는다.** 두 번 실행해서
// ID 가 달라지면 앞서 건 링크가 끊긴다.
export function allocate({ root, operatingDir, kind, path, existingId = null, liveIds = [] }) {
  return withRegistry(root, operatingDir, (rows) => {
    if (existingId) {
      const known = rows.find((r) => r.id === existingId);
      if (known) {
        // 파일이 옮겨졌으면 마지막으로 알려진 경로만 고친다. ID 는 그대로다.
        if (path && known.path !== path) known.path = path;
        return existingId;
      }
      rows.push({ id: existingId, kind, state: "활성", path, replacedBy: null });
      return existingId;
    }
    const id = nextId(kind, usedIds(rows, liveIds));
    rows.push({ id, kind, state: "활성", path, replacedBy: null });
    return id;
  });
}

// 상태만 바꾼다. 줄은 지우지 않는다.
export function setState({ root, operatingDir, id, state, path = null, replacedBy = null }) {
  if (!STATES.includes(state)) throw new Error(`모르는 상태입니다: ${state}`);
  return withRegistry(root, operatingDir, (rows) => {
    const row = rows.find((r) => r.id === id);
    if (!row) throw new Error(`발급 기록에 없는 ID 입니다: ${id}`);
    row.state = state;
    if (state === "삭제") row.path = path ?? "(없음)";
    else if (path) row.path = path;
    if (replacedBy) row.replacedBy = replacedBy;
    return row;
  });
}
