# 일상 작업과 이어받기

[사용 안내](README.md) · [명령 실행 방법](getting-started.md)

세션을 시작하면 AGENTS와 안내된 규칙을 읽고 plans/current.md에서 현재 대작업을
찾습니다. 처음 보는 작업이면 README로 목표를, status로 다음 행동을 확인합니다.
CLI는 이 문서 읽기를 대신하지 않습니다.

## 파일이 제대로 연결됐는지 확인하기

```sh
doltap check .
```

파일 누락·중복 ID·범위 오류가 있으면 파일과 위치를 보고 고칩니다.
오류는 종료 코드 1입니다. 채우기 안내나 관계 재검토 같은 확인 항목만 있으면 0이므로,
0이라는 이유만으로 내용 검토까지 끝났다고 판단하지 않습니다.

## ID를 찾고 근거를 따라 읽기

```sh
doltap map . --json
doltap context <노드-ID> --depth 2 --budget 4000 --json
```

map은 관리 범위의 지도입니다. nodes의 제목·경로에서 찾은 id를 context에 넣습니다.
context는 그 노드의 부모·자식과 들어오고 나가는 관계를 따라 관련 글을 돌려줍니다.

예를 들어 배포 규칙을 고치기 전 그 규칙을 가리키는 작업과 검증 결과를 함께 읽습니다.
본문이 잘렸으면 bodyTruncated·omitted를 확인하고 필요한 노드를 다시 조회합니다.
budget은 본문 문자 수이며 JSON 전체 크기나 토큰 수 제한이 아닙니다.

## 넓은 범위에서 다시 볼 항목 찾기

```sh
doltap audit .doltap/rules --changed --json
```

context는 ID 하나에서 출발하고 audit는 경로 범위를 살핍니다.
audit의 errors는 구조 문제, reviewRequired는 관계 재검토 목록,
candidates는 읽고 판단할 본문입니다. AI가 자동으로 감사한 결론은 아닙니다.

위 세 명령은 읽기 전용입니다. 문서를 고쳤다면 필요한 연결을 정리하고
[실제 검토한 대상만 기록](review.md)한 뒤 status의 현재 상태를 갱신합니다.

