# 사용 안내

처음에는 [개념](concepts.md)과 [대작업의 흐름](workstreams.md)을 읽어보세요.
어떤 문서가 왜 생기는지 이해한 뒤 [시작하기](getting-started.md)로 실제 프로젝트에 적용합니다.

| 지금 하려는 일 | 읽을 문서 | 쓰는 명령 |
| --- | --- | --- |
| 앵커·ID·관계가 무엇인지 알기 | [개념](concepts.md) | 명령 없이 읽기 |
| 작업을 만들고 이어가고 보관하기 | [대작업의 흐름](workstreams.md) | 사람·에이전트의 문서 작업 |
| 처음 적용하기 | [시작하기](getting-started.md) | init, migrate |
| 현재 작업과 관련 근거 읽기 | [일상 작업](daily.md) | check, map, context, audit |
| 문서나 주장 연결하기 | [ID와 관계](linking.md) | id, link |
| 옮기거나 지운 문서 정리하기 | [이동·삭제·복구](moving-deleting.md) | move-fix, delete, delete-fix, recover |
| 변경 영향을 읽고 판단 남기기 | [검토](review.md) | review, suggest |
| 작업을 마치고 보관하기 | [마무리](finishing.md) | archive-check, move-fix, check |
| 검사 실행을 자동으로 부르기 | [선택적 훅](hooks.md) | check, Stop 어댑터 |
| 문법과 옵션을 찾아보기 | [상세 참고](reference.md) | 전체 명령 |

가이드의 `doltap`은 실행 명령을 줄여 쓴 것입니다.
아직 명령을 설치하지 않았다면 [실행 방법](getting-started.md)을 먼저 확인하세요.
`<ID>`나 `<폴더>`는 실제 값으로 바꾸며 꺾쇠 자체는 입력하지 않습니다.

문서를 쓰는 명령은 기본적으로 **미리보기**만 보여줍니다. 내용을 확인하고
허용된 변경에 같은 명령의 `--apply`를 붙입니다. 옵션이 사용자의 의사를 대신
판단하거나 승인 권한을 인증하는 것은 아닙니다.

