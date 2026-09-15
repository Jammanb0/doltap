// 코드는 판정 지점에서 지정한다. 번역하거나 문구를 고쳐도 코드가 바뀌지 않는다.
const HINTS = {
  ENTRY_MISSING: '기존 규칙 원본을 복원하세요. 처음 적용한다면 APPLY.md의 적용 절차를 확인하세요.',
  CLAUDE_MISSING: 'CLAUDE.md를 만들고 본문에 @AGENTS.md 한 줄을 넣으세요.',
  CLAUDE_IMPORT_MISSING: 'CLAUDE.md의 규칙 본문을 AGENTS.md로 옮기고 @AGENTS.md 한 줄로 연결하세요.',
  CLAUDE_BODY: '추가 규칙은 AGENTS.md나 연결된 규칙 문서로 옮기고 CLAUDE.md에는 @AGENTS.md 한 줄만 남기세요.',
  OPERATING_DIR_MISSING: '기존 운영 문서 위치를 확인하세요. 처음 적용한다면 APPLY.md를, 이전 골격이면 doltap migrate 미리보기를 확인하세요.',
  OPERATING_NAVIGATION_MISSING: 'AGENTS.md에 .doltap/ 문서를 언제 읽는지 안내를 추가하세요.',
  REQUIRED_DOCUMENT_MISSING: '해당 필수 문서를 복원하거나 배포 골격을 참고해 프로젝트에 맞게 작성하세요.',
  DOCUMENT_PATH_MISSING: '이 줄의 경로와 실제 파일 위치를 대조해 참조를 고치거나 필요한 문서를 복원하세요.',
  PLACEHOLDER: '표시된 행을 프로젝트에 맞게 채우고 처리한 자리표시자 주석을 지우세요.',
  WORKSTREAM_NAME: '대작업 폴더 이름을 세 자리 번호와 영문 소문자로 고치고 색인 경로를 갱신하세요.',
  WORKSTREAM_NUMBER_DUPLICATE: '기존·아카이브 번호를 확인해 새 대작업에 미사용 번호를 붙이고 색인을 갱신하세요.',
  WORKSTREAM_DOCUMENT_MISSING: '해당 대작업 폴더에 빠진 README.md 또는 status.md를 작성하세요.',
  WORKSTREAM_UNLISTED: 'current.md에서 이 대작업의 README.md를 indexes 관계로 연결하세요.',
  WORKSTREAM_TARGET_MISSING: '실제 활성 폴더와 current.md를 대조하세요. 마친 작업은 history.md에서 찾도록 색인을 정리하세요.',
  TEMP_REFERENCE: '임시 골격 참조를 적용 후 실제 문서 경로로 바꾸세요.',
  SETUP_IN_PROGRESS: '실제로 사용한 임시 골격 경로를 활성 문서에서 검색하고 남은 참조를 정리하세요.',
  ANCHOR_MALFORMED: '이 행의 name·id 값과 start/end 표기를 기존 발급 ID에 맞춰 고치세요.',
  ANCHOR_START_MISSING: '같은 ID의 시작 앵커를 본문 앞에 복원하고 짝을 확인하세요.',
  ANCHOR_CROSSED: '관련 시작 위치와 대조해 안쪽 범위를 먼저 닫고 바깥 범위를 닫으세요.',
  ANCHOR_END_MISSING: '같은 ID의 끝 앵커를 해당 본문 뒤에 복원하세요.',
  ID_DUPLICATE: '두 범위를 비교해 원본을 정하세요. 복사본은 중복 앵커를 제거한 뒤 doltap id로 새 ID를 발급하고 참조를 대조하세요.',
  DOCUMENT_BODY_OUTSIDE: '문서 전체 본문이 d 시작·끝 앵커 안에 들도록 앵커 위치를 고치세요.',
  DOCUMENT_NESTED: 'd 범위를 문서의 최상위로 옮기세요. 부분 범위라면 s 또는 b로 다시 발급하세요.',
  RANGE_OUTSIDE_DOCUMENT: '해당 s·b 범위를 문서의 d 시작·끝 앵커 안에 두세요.',
  BLOCK_HAS_CHILD: '하위 범위를 b 밖으로 옮기거나 상위 범위의 종류를 다시 정하세요.',
  DOCUMENT_MULTIPLE: '문서 전체를 감싸는 d 범위를 하나로 정하고 부분 범위는 s·b로 구분하세요.',
  RELATION_TYPE: 'guide/reference.md의 관계 유형 표에서 의도에 맞는 유형을 선택하세요.',
  RELATION_SOURCE_MISSING: '관계 선언을 출발 노드의 시작·끝 앵커 안에 두세요.',
  RELATION_EXTERNAL: '외부 자료는 일반 Markdown 링크로 적고, 관계는 프로젝트의 등록 ID에 연결하세요.',
  TARGET_OUTSIDE_ROOT: '프로젝트 안의 문서를 가리키도록 경로를 고치세요. 외부 자료라면 URL 일반 링크로 남기세요.',
  RELATION_FILE_MISSING: '대상 파일을 복원하거나 실제 위치로 경로를 고치세요. 이동했다면 doltap move-fix 미리보기를 확인하세요.',
  RELATION_FRAGMENT: '관계 대상 조각을 #doltap-<종류>-<발급값>-start 형식의 실제 ID로 고치세요.',
  RELATION_UNMANAGED: '대상을 관리 가능한 Markdown 문서에 두세요. 숨김·빌드·복구 폴더와 심볼릭 링크는 대상에서 제외됩니다.',
  RELATION_ID_MISSING: '대상의 앵커와 발급 기록을 확인하고 실제로 존재하는 ID에 연결하세요.',
  RELATION_DELETED: '삭제 이유와 대체 ID를 확인하고 관계를 살아 있는 대상으로 옮기거나 필요 없는 관계를 제거하세요.',
  RELATION_PATH_STALE: '관련 위치의 ID가 의도한 대상인지 확인한 뒤 doltap move-fix 미리보기로 경로 변경을 확인하세요.',
  RELATION_DUPLICATE: '같은 관계 선언을 한 곳만 남기세요. 대칭 관계는 양쪽에 반복하지 않습니다.',
  LINK_LOCAL_ID_MISSING: '같은 문서의 실제 ID로 조각을 고치세요. 다른 문서라면 대상 파일 경로도 적으세요.',
  LINK_FILE_MISSING: '이 줄의 링크를 실제 파일 경로로 고치거나 대상 파일을 복원하세요.',
  LINK_ID_MISSING: '대상 문서의 시작 앵커를 확인해 링크 조각을 실제 ID로 고치세요.',
  LINK_PATH_MISMATCH: '관련 위치의 ID가 의도한 대상인지 확인하고 링크 경로를 고치세요.',
  DOCUMENT_ID_MISSING: 'doltap id <파일> --kind d 미리보기로 문서 전체를 감싸는 ID 발급을 확인하세요.',
  DOCUMENT_UNREACHABLE: '진입점에서 읽을 수 있는 문서에 이 문서를 가리키는 indexes 관계를 추가하세요.',
  CURRENT_POINTS_ARCHIVE: 'current.md에서 활성 색인을 제거하고 history.md에 아카이브 색인이 있는지 확인하세요.',
  WORKSTREAM_INDEX_UNREACHABLE: '활성 작업은 current.md, 마친 작업은 history.md에서 README.md를 indexes 관계로 연결하세요.',
  REGISTRY_MISSING: 'doltap migrate 미리보기로 기존 ID와 발급 기록의 등록 계획을 확인하세요.',
  REGISTRY_DUPLICATE: '발급 대장에서 같은 ID의 행들을 대조해 실제 범위와 일치하는 기록 하나로 정리하세요.',
  REVIEW_INVALID: '검토 표의 시각·ID·해시·판단·이유·주체를 확인하세요. 손상 기록을 검토 없이 최신 처리하지 마세요.',
  DELETED_ID_REAPPEARED: '삭제 이력과 실제 본문을 대조하세요. 새 내용이라면 삭제 ID를 재사용하지 말고 새 ID를 발급하세요.',
  REGISTERED_RANGE_MISSING: '이동이면 doltap move-fix, 직접 삭제했다면 doltap delete-fix 미리보기로 참조와 삭제 기록을 확인하세요.',
  REGISTRY_INVALID: '발급 행의 종류를 ID와 맞추고 상태를 활성·아카이브·삭제 중 실제 상태로 고치세요.',
  ID_UNREGISTERED: 'doltap migrate 미리보기로 기존 ID를 발급 대장에 등록하는 계획을 확인하세요.',
  MIRROR_CONTENT_MISMATCH: '관련 원문과 복사본을 비교해 내용을 맞추세요. 같은 내용을 유지할 의도가 아니라면 관계 유형을 다시 정하세요.',
  REVIEW_STALE: '관련 두 범위를 읽고 영향 여부를 판단한 뒤 doltap review로 판단·이유·주체를 기록하세요.',
  RECOVERY_PENDING: 'doltap recover <복구 ID>로 계획을 먼저 확인하고 복구 내용을 검토한 뒤 적용하세요.',
  OPERATING_DIR_IGNORED: '공유할 운영 기록이라면 Git 제외 규칙을 고치세요. 로컬 전용 의도라면 이 안내를 유지해도 됩니다.',
  LEGACY_OPERATING_DIR: 'APPLY.md의 이관 절차를 읽고 doltap migrate 미리보기를 확인하세요.',
  LEGACY_PROJECT_PATH: 'doltap migrate 미리보기에서 프로젝트 설명과 참조 경로의 이동 계획을 확인하세요.',
  ARCHIVE_DECISION: '결정마다 수명 표식 하나를 적고 계속 유효한 결정은 담당 활성 원본을 같은 줄에 연결하세요.',
  ARCHIVE_STATE: '전제·열린 질문을 각각 범위로 나누고 상태를 하나씩 선언하세요.',
  ARCHIVE_UNRESOLVED: '전제·열린 질문을 해결하거나 활성 원본으로 이월하거나 이유를 남겨 폐기하세요.',
  ARCHIVE_HANDOFF: '이월받은 활성 원본에서 보관 항목을 관계로 연결하고 이월 내용을 대조하세요.',
  ARCHIVE_REASON: '해당 항목에 `이유` 표식과 실제 폐기 이유를 적으세요.',
};

// where는 기존 출력 계약이다. 구조화 위치는 행을 아는 경우에만 line을 제공한다.
export function location(where) {
  const match = /^(.*):(\d+)$/.exec(where);
  return match ? { path: match[1], line: Number(match[2]) } : { path: where };
}

export function related(node, label) {
  return { path: node.path, ...(node.startLine ? { line: node.startLine } : {}), label };
}

export function diagnostic(code, where, message, extra = {}) {
  if (!Object.hasOwn(HINTS, code)) throw new Error(`알 수 없는 진단 코드: ${code}`);
  return { where, message, code, location: location(where), hint: HINTS[code], related: [], ...extra };
}

export function diagnosticJson(f) {
  const { where, message, code, location, hint, related, reason } = f;
  return { where, message, code, location, hint, related, ...(reason ? { reason } : {}) };
}
