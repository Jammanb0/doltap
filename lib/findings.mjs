// 검사 결과 항목과 사람용 출력. 코드는 판정하는 곳에서 정하고 문구를 고쳐도 바뀌지 않는다.
// 문제(problem)는 종료 코드 1, 확인(notice)은 사람이 판단할 것이다.

const CODES = {
  MARKER_MALFORMED: ['problem', '표식을 <!-- doltap:start <ID> -->·<!-- doltap:end <ID> --> 형식으로 고치세요. 표식은 줄 첫머리에 혼자 두고, 여러 줄 시작 표식은 --> 로 닫습니다.'],
  MARKER_CROSSED: ['problem', '관련 시작 위치와 대조해 안쪽 범위를 먼저 닫고 바깥 범위를 닫으세요.'],
  MARKER_END_WITHOUT_START: ['problem', '같은 ID의 시작 표식을 본문 앞에 되살리거나, 필요 없는 끝 표식을 지우세요.'],
  MARKER_UNCLOSED: ['problem', '범위 본문이 끝나는 곳에 같은 ID의 끝 표식을 두세요.'],
  DOCUMENT_ANCHOR_MISSING: ['problem', '문서 전체를 감싸는 d 범위를 만드세요: doltap id <파일> 로 미리 보고 --apply 로 적용합니다.'],
  DOCUMENT_ANCHOR_MULTIPLE: ['problem', '문서 범위(d)는 하나만 둡니다. 나머지는 안쪽 범위라면 s나 b ID로 바꾸세요.'],
  DOCUMENT_BODY_OUTSIDE: ['problem', '본문 전체가 문서 범위의 시작·끝 표식 사이에 들도록 표식 위치를 옮기세요.'],
  ID_KIND: ['problem', 'd는 문서 전체에만, s·b는 문서 범위 안에만 씁니다. 종류가 맞지 않으면 doltap id --kind <종류> 로 새 ID를 받아 바꾸세요.'],
  ID_DUPLICATE: ['problem', '두 범위를 비교해 원래 범위를 정하고, 복사본에는 doltap id --kind <종류> 로 받은 새 ID를 쓰세요. 관계 선언이 어느 쪽을 가리켜야 하는지도 확인하세요.'],
  RELATION_UNKNOWN: ['problem', '관계 이름은 same-as, depends-on, depended-on-by, consistent-with 가운데 하나입니다. 단순 참고라면 일반 링크를 쓰세요.'],
  RELATION_TARGET_INVALID: ['problem', '관계 대상은 doltap-<d|s|b>-<8자> ID로 적습니다. 경로나 제목은 쓰지 않습니다.'],
  RELATION_SELF: ['problem', '자기 자신을 가리키는 선언을 지우세요.'],
  RELATION_TARGET_MISSING: ['problem', '대상 범위를 지웠다면 이 선언을 지우세요. 옮기거나 ID를 바꿨다면 선언을 실제 ID로 고치세요.'],
  RELATION_DUPLICATE: ['problem', '같은 선언을 한 번만 남기세요.'],
  RELATION_CONFLICT: ['problem', '두 범위 사이에 맞는 관계 하나를 정해 양쪽 선언을 맞추세요.'],
  RELATION_MISMATCH: ['problem', '의도한 관계를 정한 뒤 두 쪽 선언을 그에 맞게 고치세요. 검사를 통과시키려고 관계를 느슨하게 바꾸지 않습니다.'],
  RELATION_COUNTERPART_MISSING: ['problem', '관계를 유지하려면 관련 위치의 시작 표식에 짝 선언을 추가하고, 해제하는 중이라면 이 선언을 지우세요. 무엇이 맞는지는 두 범위를 읽고 정합니다.'],
  SAME_AS_SKELETON: ['problem', '두 범위의 제목·문단·목록·표·코드 블록 구성을 맞추세요. 같은 골격을 유지할 관계가 아니라면 관계 종류를 다시 정하세요.'],
  LINK_FILE_MISSING: ['problem', '링크 경로를 실제 파일 위치로 고치거나, 지운 문서라면 링크를 정리하세요.'],
  OPERATING_DIR_MISSING: ['problem', 'doltap 기본 구조가 없습니다. 새 프로젝트는 doltap init, 기존 프로젝트는 APPLY.md의 절차를 따르세요.'],
  ENTRY_MISSING: ['problem', '규칙 원본인 AGENTS.md를 되살리거나 만드세요.'],
  ENTRY_CURRENT_MISSING: ['problem', 'AGENTS.md에 작업을 시작할 때 .doltap/current.md를 읽으라는 안내를 넣으세요.'],
  REQUIRED_DOCUMENT_MISSING: ['problem', '빠진 운영 문서를 만드세요. 내용은 doltap init으로 만든 기본 구조를 참고합니다.'],
  REQUIRED_ANCHOR_MISSING: ['problem', '이 운영 문서에 문서 범위를 만드세요: doltap id <파일> 로 미리 보고 --apply 로 적용합니다.'],
  WORKSTREAM_DOCUMENT_MISSING: ['problem', '작업 폴더에 목적·범위를 적은 README.md와 현재 상태를 적은 status.md를 두세요.'],
  WORKSTREAM_UNLISTED: ['problem', '.doltap/current.md에 이 작업의 README.md와 status.md 링크를 적으세요.'],
  WORKSTREAM_TARGET_MISSING: ['problem', '실제 작업 폴더와 current.md를 대조하세요. 마친 작업이면 current.md에서 빼고 history.md에 적습니다.'],
  WORKSTREAM_NUMBER_DUPLICATE: ['problem', '작업 폴더와 보관 폴더의 번호를 확인해 새 작업에는 쓰지 않은 번호를 붙이세요.'],
  CONFIG_INVALID: ['problem', '.doltap/config.json을 {"exclude": ["경로", …]} 형식으로 고치세요. 고칠 때까지 설정을 쓰지 않습니다.'],
  REVIEWS_INVALID: ['problem', '.doltap/reviews.json을 Git 기록 등에서 되살리거나 고치세요. 쓰기 명령은 손상된 파일을 덮어쓰지 않습니다.'],
  REVIEW_PENDING: ['notice', 'doltap show <ID> 로 두 범위를 읽고 관계가 여전히 맞는지 확인하세요. 맞지 않으면 내용이나 관계를 고치고, 확인을 마친 뒤 doltap review <ID> <ID> --note <확인한 내용> --by human --apply 로 기록합니다(AI가 확인했으면 --by agent).'],
  WORKSTREAM_NAME: ['notice', '작업 폴더 이름을 <세 자리 번호>-<영문 소문자·숫자·하이픈>으로 바꾸고 current.md의 링크도 고치세요.'],
  ARCHIVE_UNLISTED: ['notice', 'history.md에 이 보관 작업을 한 줄로 적으세요. 앞으로도 적용할 내용이 작업 기록에만 남아 있다면 담당 활성 문서에 반영했는지도 확인하세요.'],
  PLACEHOLDER: ['notice', '표시된 줄을 프로젝트에 맞게 채우고 처리한 자리표시 주석을 지우세요.'],
  OPERATING_DIR_IGNORED: ['notice', '운영 기록을 공유하려면 Git 제외 규칙을 고치세요. 이 작업 공간에만 둘 의도라면 그대로 두어도 됩니다.'],
};

export function codeInfo(code) {
  const info = CODES[code];
  if (!info) throw new Error(`모르는 진단 코드입니다: ${code}`);
  return { severity: info[0], hint: info[1] };
}

export const ALL_CODES = Object.keys(CODES);

// where는 { path, line } 또는 경로 문자열이다.
export function finding(code, where, message, extra = {}) {
  const { severity, hint } = codeInfo(code);
  const location = typeof where === 'string' ? { path: where } : { path: where.path, ...(where.line ? { line: where.line } : {}) };
  return {
    code,
    severity,
    where: location.line ? `${location.path}:${location.line}` : location.path,
    location,
    message,
    related: extra.related ?? [],
    hint: extra.hint ?? hint,
    ...(extra.reason ? { reason: extra.reason } : {}),
    ...(extra.relation ? { relation: extra.relation } : {}),
  };
}

export function sortFindings(list) {
  return [...list].sort((a, b) =>
    a.location.path.localeCompare(b.location.path) || (a.location.line ?? 0) - (b.location.line ?? 0) || a.code.localeCompare(b.code));
}

export function toJson(finding) {
  const { code, severity, where, location, message, related, hint, reason, relation } = finding;
  return { code, severity, where, location, message, related, hint, ...(reason ? { reason } : {}), ...(relation ? { relation } : {}) };
}

// 사람용 출력. 위치를 먼저 보여 주고 이유·관련 위치·다음 행동을 잇는다.
export function formatFindings(problems, notices, passed = []) {
  const lines = [];
  const indent = '    ';
  const entry = (item) => [
    `  [${item.code}] ${item.where}`,
    ...item.message.split('\n').map((line) => `${indent}${line}`),
    ...item.related.map((r) => `${indent}관련: ${r.path}${r.line ? `:${r.line}` : ''}${r.label ? ` — ${r.label}` : ''}`),
    ...(item.hint ? [`${indent}다음: ${item.hint}`] : []),
  ];
  if (problems.length) {
    lines.push(`✗ 문제 ${problems.length}개`);
    for (const item of problems) lines.push(...entry(item));
  }
  if (notices.length) {
    if (lines.length) lines.push('');
    lines.push(`! 확인 ${notices.length}개`);
    for (const item of notices) lines.push(...entry(item));
  }
  if (passed.length) {
    if (lines.length) lines.push('');
    lines.push(problems.length ? '· 요약' : '✓ 통과');
    for (const item of passed) lines.push(`  ${item}`);
  }
  if (!lines.length) lines.push('검사할 것을 찾지 못했습니다.');
  return `${lines.join('\n')}\n`;
}
