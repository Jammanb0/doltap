// 실제 CLI를 자식 프로세스로 실행해 출력과 종료 코드를 확인한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { doc, makeProject, operating, range, read, writeFiles } from './helpers.mjs';

const BIN = resolve(dirname(fileURLToPath(import.meta.url)), '../bin/doltap.mjs');
const cli = (cwd, ...args) => spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: 'utf8', windowsHide: true });
const KO = 'doltap-s-k0000001';
const EN = 'doltap-s-e0000001';

const translated = () => operating({
  'docs/install.md': doc('doltap-d-k0000000', '# 설치', '', ...range(KO, [], '## 설치 조건', '', 'Node.js 22 이상', '', '- Windows', '- macOS')),
  'docs/en/install.md': doc('doltap-d-e0000000', '# Install', '', ...range(EN, [], '## Requirements', '', 'Node.js 22 or later', '', '- Windows', '- macOS')),
});

test('사용법과 모르는 명령·옵션', (t) => {
  const root = makeProject(operating(), t);
  const help = cli(root, '--help');
  assert.equal(help.status, 0);
  assert.match(help.stdout, /doltap check \[폴더\]/);
  assert.equal(cli(root).status, 0);
  const unknown = cli(root, 'map');
  assert.equal(unknown.status, 2);
  assert.match(unknown.stderr, /모르는 명령입니다: map/);
  for (const name of ['constructor', 'toString']) {
    const builtin = cli(root, name);
    assert.equal(builtin.status, 2, name);
    assert.match(builtin.stderr, new RegExp(`모르는 명령입니다: ${name}`));
  }
  assert.equal(cli(root, 'check', '--fix').status, 2);
  assert.match(cli(root, 'list', '--strict').stderr, /list에는 --strict 옵션을 쓰지 않습니다/);
  assert.match(cli(root, 'check', 'a', '--root', 'b').stderr, /하나로만/);
  assert.match(cli(root, '--version').stdout, /^\d+\.\d+\.\d+\n$/);
});

test('check: 문제가 없으면 0, 문제가 있으면 1, 실행하지 못하면 2', (t) => {
  const root = makeProject(operating(), t);
  assert.equal(cli(root, 'check').status, 0);
  writeFiles(root, { 'docs/a.md': ['<!-- doltap:start doltap-d-aaaaaaa1 -->', '본문'] });
  const failed = cli(root, 'check');
  assert.equal(failed.status, 1);
  assert.match(failed.stdout, /\[MARKER_UNCLOSED\] docs\/a\.md:1/);
  assert.match(failed.stdout, /다음: /);
  assert.equal(cli(root, 'check', 'no-such-folder').status, 2);
});

test('check --json은 사람용 출력과 같은 판정을 담는다', (t) => {
  const root = makeProject({ ...operating(), 'docs/a.md': doc('doltap-d-aaaaaaa1', '[없음](missing.md)') }, t);
  const result = cli(root, 'check', '--json');
  assert.equal(result.status, 1);
  const data = JSON.parse(result.stdout);
  assert.equal(data.schema, 'doltap.check.v2');
  assert.equal(data.ok, false);
  assert.deepEqual(data.problems.map((p) => [p.code, p.where, p.location.line]), [['LINK_FILE_MISSING', 'docs/a.md:3', 3]]);
  assert.ok(data.problems[0].hint);
  assert.equal(data.summary.documents, 4);
});

test('check --strict는 검토 대기도 실패로 센다', (t) => {
  const root = makeProject(translated(), t);
  assert.equal(cli(root, 'relate', KO, 'same-as', EN, '--apply').status, 0);
  assert.equal(cli(root, 'check').status, 0);
  const strict = cli(root, 'check', '--strict');
  assert.equal(strict.status, 1);
  assert.match(strict.stdout, /--strict: 검토 대기 1개/);
});

test('편집 → 검사 → 검토 기록 → 알림 해소를 CLI로 이어서 한다', (t) => {
  const root = makeProject(translated(), t);
  const preview = cli(root, 'relate', KO, 'same-as', EN);
  assert.equal(preview.status, 0);
  assert.match(preview.stdout, /미리보기입니다/);
  assert.doesNotMatch(read(root, 'docs/install.md'), /same-as/, '미리보기는 쓰지 않는다');
  assert.equal(cli(root, 'relate', KO, 'same-as', EN, '--apply').status, 0);

  let list = JSON.parse(cli(root, 'review', '--json').stdout);
  assert.deepEqual(list.pending.map((item) => [item.key, item.reason]), [[`${EN} same-as ${KO}`, 'unreviewed']]);
  const record = cli(root, 'review', KO, EN, '--note', '목록과 조건이 같음', '--by', 'agent', '--apply');
  assert.equal(record.status, 0, record.stderr);
  assert.deepEqual(JSON.parse(cli(root, 'review', '--json').stdout).pending, []);

  writeFiles(root, { 'docs/en/install.md': read(root, 'docs/en/install.md').replace('Node.js 22 or later', 'Node.js 24 or later') });
  list = JSON.parse(cli(root, 'review', '--json').stdout);
  assert.deepEqual(list.pending.map((item) => [item.reason, item.changed]), [['one-changed', [EN]]]);
  assert.deepEqual(Object.keys(list.pending[0].commands), ['human', 'agent']);
  const human = cli(root, 'review');
  assert.match(human.stdout, /검토할 관계 1개/);
  // 셸에 그대로 붙여도 되게 사람용과 AI용 명령을 따로 준다. 파이프가 되는 human|agent는 쓰지 않는다.
  assert.match(human.stdout, /기록\(사람이 확인\): doltap review \S+ \S+ --note "<확인한 내용>" --by human --apply/);
  assert.match(human.stdout, /기록\(AI가 확인\): +doltap review \S+ \S+ --note "<확인한 내용>" --by agent --apply/);
  assert.doesNotMatch(human.stdout, /\|/);
  assert.doesNotMatch(cli(root, 'check').stdout, /human\|agent/);

  writeFiles(root, { 'docs/en/install.md': read(root, 'docs/en/install.md').replace('- macOS', '- macOS\n- Linux') });
  const blocked = cli(root, 'review', KO, EN, '--note', '다시 확인', '--by', 'agent', '--apply');
  assert.equal(blocked.status, 2);
  assert.match(blocked.stderr, /same-as 골격이 다릅니다/);
});

test('계산 방식 번호가 다른 검토 기록은 내용 변경과 구별해 다시 확인하게 한다', (t) => {
  const root = makeProject(translated(), t);
  assert.equal(cli(root, 'relate', KO, 'same-as', EN, '--apply').status, 0);
  assert.equal(cli(root, 'review', KO, EN, '--note', '같은 조건', '--by', 'human', '--apply').status, 0);
  const saved = JSON.parse(read(root, '.doltap/reviews.json'));
  const key = `${EN} same-as ${KO}`;
  assert.equal(saved.relations[key].method, 1, '검토 기록마다 계산 방식 번호를 남긴다');

  const rewrite = (method) => {
    const entry = { ...saved.relations[key], method };
    if (method === undefined) delete entry.method;
    writeFiles(root, { '.doltap/reviews.json': JSON.stringify({ version: 1, relations: { [key]: entry } }) });
  };
  for (const [method, reason, label] of [[undefined, 'method-changed', /비교 방식이 바뀌어 재검토 필요/], [2, 'method-newer', /더 새 doltap의 기록이라 비교할 수 없음/]]) {
    rewrite(method);
    const check = JSON.parse(cli(root, 'check', '--json').stdout);
    assert.deepEqual(check.notices.map((item) => [item.code, item.reason]), [['REVIEW_PENDING', reason]], `글은 그대로인데 번호가 ${method}`);
    assert.equal(check.ok, true);
    assert.match(cli(root, 'show', KO).stdout, label);
  }
  // 실제로 다시 확인해 기록하면 지금 번호로 바뀌고 대기가 풀린다.
  assert.equal(cli(root, 'review', KO, EN, '--note', '다시 확인', '--by', 'agent', '--apply').status, 0);
  assert.equal(JSON.parse(read(root, '.doltap/reviews.json')).relations[key].method, 1);
  assert.deepEqual(JSON.parse(cli(root, 'check', '--json').stdout).notices, []);
});

test('show는 직접 관계와 간접 연결을 나누고, 없는 ID는 남은 선언을 알려 준다', (t) => {
  const OPS = 'doltap-b-p0000001';
  const root = makeProject({
    ...translated(),
    'docs/ops.md': doc('doltap-d-p0000000', '# 운영', '', ...range(OPS, [], '신청은 이메일로 받습니다.')),
  }, t);
  cli(root, 'relate', KO, 'same-as', EN, '--apply');
  cli(root, 'relate', EN, 'consistent-with', OPS, '--apply');
  const shown = JSON.parse(cli(root, 'show', KO, '--json', '--body').stdout);
  assert.equal(shown.anchor.title, '설치 조건');
  assert.match(shown.anchor.body, /Node\.js 22 이상/);
  assert.deepEqual(shown.relations.map((r) => [r.name, r.other.id, r.review.state]), [['same-as', EN, 'unreviewed']]);
  assert.deepEqual(shown.indirect.map((item) => [item.via, item.name, item.id]), [[EN, 'consistent-with', OPS]]);
  const text = cli(root, 'show', KO).stdout;
  assert.match(text, /간접 연결 — 직접 관계가 아니며 검토 의무가 생기지 않습니다/);

  writeFiles(root, { 'docs/en/install.md': null });
  const missing = cli(root, 'show', EN);
  assert.equal(missing.status, 2);
  assert.match(missing.stdout, /이 ID를 가리키는 선언/);
  assert.match(missing.stdout, /docs\/install\.md:\d+ {2}doltap-s-k0000001의 same-as/);
});

test('list는 파일별로 범위와 선언 수를 보여 준다', (t) => {
  const root = makeProject(translated(), t);
  cli(root, 'relate', KO, 'same-as', EN, '--apply');
  const text = cli(root, 'list').stdout;
  assert.match(text, /docs\/install\.md\n {2}1–\d+ +doltap-d-k0000000 {2}설치\n {2}5–\d+ + {2}doltap-s-k0000001 {2}설치 조건 {2}· same-as 1/);
  const data = JSON.parse(cli(root, 'list', '--json').stdout);
  assert.equal(data.schema, 'doltap.list.v1');
  assert.equal(data.summary.relations, 1);
});

test('id는 파일 없이 새 ID를 주고, 파일에는 미리보기 뒤 --apply로 표식을 넣는다', (t) => {
  const root = makeProject({ ...operating(), 'docs/new.md': ['# 새 문서', '', '본문'] }, t);
  assert.match(cli(root, 'id', '--kind', 'b').stdout, /^doltap-b-[0-9a-z]{8}\n$/);
  assert.equal(cli(root, 'id').status, 2);
  const applied = cli(root, 'id', 'docs/new.md', '--apply', '--json');
  const data = JSON.parse(applied.stdout);
  assert.equal(data.applied, true);
  assert.deepEqual(data.written, ['docs/new.md']);
  assert.ok(read(root, 'docs/new.md').startsWith(`<!-- doltap:start ${data.id} -->`));
  assert.equal(cli(root, 'check').status, 0);
  assert.equal(cli(root, 'id', 'docs/new.md').status, 2, '이미 문서 범위가 있으면 거부한다');
});

test('unrelate는 한쪽이 지워진 뒤에도 남은 선언을 해제한다', (t) => {
  const root = makeProject(translated(), t);
  cli(root, 'relate', KO, 'same-as', EN, '--apply');
  writeFiles(root, { 'docs/en/install.md': null });
  assert.equal(cli(root, 'check').status, 1);
  assert.equal(cli(root, 'unrelate', KO, EN, '--apply').status, 0);
  assert.equal(cli(root, 'check').status, 0);
});

test('init은 새 ID로 기본 구조를 만들고 곧바로 check를 통과한다', () => {
  const parent = mkdtempSync(join(tmpdir(), 'doltap-init-'));
  try {
    const made = cli(parent, 'init', 'my project');
    assert.equal(made.status, 0, made.stderr);
    const root = join(parent, 'my project');
    assert.deepEqual(readdirSync(join(root, '.doltap')).sort(), ['current.md', 'history.md']);
    assert.equal(existsSync(join(root, 'CLAUDE.md')), false, 'CLAUDE.md는 기본으로 만들지 않는다');
    const agents = read(root, 'AGENTS.md');
    assert.match(agents, /^<!-- doltap:start doltap-d-[0-9a-z]{8} -->\n\n# my project\n/);
    assert.doesNotMatch(agents, /doltap-d-wr0cv7mp/, '템플릿의 ID를 그대로 쓰지 않는다');
    const checked = cli(root, 'check', '--json');
    assert.equal(checked.status, 0);
    assert.deepEqual(JSON.parse(checked.stdout).notices.map((n) => n.code), ['PLACEHOLDER']);
    const again = cli(parent, 'init', 'my project');
    assert.equal(again.status, 2);
    assert.match(again.stderr, /이미 파일이 있습니다/);
    assert.equal(cli(parent, 'init').status, 2);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});
