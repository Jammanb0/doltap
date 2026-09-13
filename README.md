# doltap

AI 코딩 에이전트와 일할 때 **규칙과 진행 상태를 문서에 남기고, 연결된 근거를 다시 찾는 도구**입니다.
Codex와 Claude Code가 같은 AGENTS.md를 읽고, 작업별 상태는 한곳에서 관리합니다.

[English](README.en.md) · [사용 안내](guide/README.md) · [기존 프로젝트에 적용](APPLY.md) · [시험 보고서](docs/trials/README.md)

## 할 수 있는 일

- **작업 이어받기:** 현재 작업의 소개·진행 상태·다음 행동을 찾습니다.
- **문서 검사:** 없는 파일, 중복 ID, 잘못 닫힌 범위, 연결되지 않은 문서를 찾습니다.
- **근거 탐색:** 무엇을 참고하는지, 어떤 문서들이 이 문서에 의존하는지 조회합니다.
- **변경 검토:** 관련 관계의 재검토 필요 여부를 표시하고 검토 이유를 기록합니다.
- **안전한 편집:** ID 부여와 경로 수정을 미리보고, 여러 파일을 고치다 실패하면 복구합니다.

문서가 원본입니다. CLI 없이도 마크다운을 읽을 수 있으며, 상주 프로세스나 AI API 키가 필요하지 않습니다.

## 시작하기

Node.js 22 이상이 필요합니다. 아래 명령은 **이 문서와 같은 버전의 소스 폴더**에서 실행합니다.
별도 패키지 설치나 빌드 단계는 없습니다. 소스가 없다면 먼저 받습니다.

~~~sh
git clone https://github.com/Jammanb0/doltap
cd doltap
~~~

새 프로젝트를 만들려면:

~~~sh
node bin/doltap.mjs init ../my-project
node bin/doltap.mjs check ../my-project
~~~

my-project에 AGENTS.md, CLAUDE.md, .doltap/이 생깁니다. 프로젝트 이름·언어·검증 명령 등
채우기 자리를 실제 프로젝트에 맞게 작성합니다. 파일이 이미 들어 있는 폴더에는 덮어쓰지 않습니다.

이미 작업 중인 프로젝트에는 [APPLY.md](APPLY.md)를 따라 기존 규칙과 기록을 합칩니다.
에이전트에게 문서 위치와 적용할 프로젝트를 알려주고 이렇게 요청할 수 있습니다.

~~~text
APPLY.md를 읽고 이 프로젝트에 적용해줘.
운영 문서를 둘 위치를 조사하고, 기존 규칙·기록을 보존하는 변경안을 먼저 보여줘.
~~~

회사 레포 밖의 개인 기록처럼 구성이 다르면 [환경에 맞게 적용하기](guide/adoption-layouts.md)를
참고하세요. 운영 문서·코드·에이전트의 위치와 보관 방식을 먼저 확인합니다.

처음이라면 [대작업 생성 → 진행 → 아카이브](guide/workstreams.md)와
[앵커·ID·관계의 개념](guide/concepts.md)을 먼저 읽어보세요.

## 문서가 놓이는 곳

| 위치 | 역할 |
| --- | --- |
| AGENTS.md · CLAUDE.md | 공통 규칙과 도구 진입점 |
| .doltap/plans/project.md · .doltap/rules/ | 프로젝트 설명과 상세 규칙 |
| .doltap/plans/current.md | 진행 중인 작업의 위치 |
| .doltap/plans/decisions.md · ideas.md | 공통 결정·전제와 미착수 후보 |
| .doltap/plans/workstreams/ | 작업별 소개·상태·계획 |
| .doltap/plans/history.md · archive/ | 마친 작업의 위치와 과거 원문 |
| .doltap/ids.md · reviews/ | ID 발급과 검토 기록 |

현재 유효한 규칙과 전제는 활성 문서에서 읽습니다. 과거 기록은 왜 그렇게 정했는지
확인할 때 참고합니다. 아카이브의 판단이 자동으로 현재 규칙이 되지는 않습니다.
이 저장소는 doltap을 자기 자신에게 적용해 운영합니다. 새 프로젝트에 복사하는 원본은 template/입니다.

## 연결을 따라 읽기

~~~sh
node bin/doltap.mjs map .
node bin/doltap.mjs context <노드-ID>
node bin/doltap.mjs audit .doltap/rules --changed
~~~

`<노드-ID>`는 지도에 나온 실제 ID로 바꿉니다. 하나의 규칙을 여러 문서가 참조하거나,
한 문서가 여러 근거를 참조할 수 있습니다. 검토 상태는 관계마다 따로 관리합니다.
ID 만들기와 검토 기록은 [사용 안내](guide/README.md)에서 시작할 수 있습니다.

## 확인할 수 있는 범위

검사기는 문서 구조와 명시된 관계를 확인합니다. 글의 내용이 참인지, 관계가 적절한지,
에이전트가 지시를 올바르게 따랐는지는 사람과 에이전트가 검토해야 합니다.
실제 시험 방법과 결과는 [파일별 시험 보고서](docs/trials/README.md)에 있습니다.

doltap은 산길에 쌓는 돌탑에서 따온 이름입니다. 다시 온 사람이 어디까지 왔는지 찾을 수 있도록 기록을 남깁니다.

[MIT License](LICENSE)
