# 시작하기

[사용 안내](README.md) · [대작업의 흐름](workstreams.md)

Node.js 22 이상이 필요합니다. 문서를 읽고 보관하는 데 doltap 상주 프로그램은
필요하지 않습니다. 아래는 Git으로 소스를 받은 뒤 Node로 직접 실행하는 방법입니다.

```sh
git clone https://github.com/Jammanb0/doltap
cd doltap
node bin/doltap.mjs --help
```

이미 소스를 받았다면 그 폴더에서 시작합니다. 다른 버전의 명령과 문서를 섞지
않습니다. 이 소스에는 별도 의존성 설치나 빌드가 필요하지 않습니다.
Git은 이 다운로드 방법에 쓰이며 CLI 자체의 필수 실행 조건은 아닙니다.

## 새 프로젝트인가, 이미 작업 중인 프로젝트인가

**새 빈 폴더**를 만들려면 소스 폴더에서 실행합니다.

```sh
node bin/doltap.mjs init ../my-project
node bin/doltap.mjs check ../my-project
```

AGENTS.md, CLAUDE.md와 .doltap/이 생깁니다. AGENTS와 plans/project.md의
프로젝트 설명·언어·검증 명령 등 채우기 자리를 실제 프로젝트에 맞춥니다.
초기 check의 채우기 안내는 이 작업을 하라는 뜻입니다. 확인하지 못한 값은 지어내지 않습니다.

**이미 파일이 있는 프로젝트**라면 init으로 덮어쓰지 않습니다.
[APPLY.md](../APPLY.md)를 따라 기존 규칙과 기록을 합치고 이관합니다.

```text
doltap의 APPLY.md를 읽고 이 프로젝트의 기존 규칙·기록을 조사해줘.
기존 내용을 보존하는 변경안을 먼저 보여줘.
```

## 가이드의 명령을 실제로 실행하기

이후 문서에서는 명령을 `doltap check .`처럼 줄여 씁니다.
소스를 쓰는 경우 작업 프로젝트에서 다음처럼 실행할 수 있습니다.

```sh
node ../doltap/bin/doltap.mjs check .
node ../doltap/bin/doltap.mjs map . --json
```

위 경로는 my-project와 doltap이 형제 폴더일 때입니다. 다른 위치에 두었다면
실제 소스 경로로 바꾸고 공백이 있는 경로는 따옴표로 감쌉니다.
ID를 받는 명령은 `--root <프로젝트 경로>`로 대상을 지정할 수도 있습니다.

GitHub에서 그때 받아 실행하는 방법도 있습니다. 다운로드에는 네트워크와 Git이 필요합니다.

```sh
npx --yes github:Jammanb0/doltap check .
```

npm 레지스트리에 게시한 패키지를 전제로 한 `npx doltap`과 구분합니다.
소스를 계속 보관한다면 Node로 직접 실행해도 충분합니다.

## 기존 문서를 이관할 때

규칙·폴더 구성을 합친 뒤 기존 Markdown에 ID와 색인을 넣는 명령입니다.

```sh
doltap migrate .
doltap migrate . --apply
doltap check .
```

첫 명령은 미리보기입니다. 실제 적용은 변경 범위를 확인한 뒤 합니다.
제목마다 ID를 만들거나 문서의 뜻을 읽어 관계를 추천하는 기능은 아닙니다.
이제 [대작업을 만들고 진행](workstreams.md)하거나 [현재 작업을 조회](daily.md)할 수 있습니다.

