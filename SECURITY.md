<!-- doltap:start doltap-d-vhpn4b9r -->

# 보안 안내 / Security policy

[한국어](#한국어) · [English](#english)

<!-- doltap:start doltap-s-erjncca4
same-as: doltap-s-vzx7yd82
-->
## 한국어

doltap은 네트워크에 연결하지 않고, API 키나 자격 증명 파일을 요구하지 않습니다. 파일은 `init`과
`--apply`를 붙인 명령에서만 쓰고, 외부 프로그램은 `.doltap/`이 Git에서 제외됐는지 확인하는
`git check-ignore` 하나만 실행합니다.

그래도 파일을 잘못 덮어쓰거나 프로젝트 밖의 경로를 건드리는 문제처럼 보안에 영향을 줄 수 있는
문제를 찾으셨다면, 아래 방법으로 비공개 제보해 주세요. 취약점 세부 정보는 공개 이슈에
올리지 말아 주세요.

### 알리는 방법

저장소의 [Security and quality 탭](https://github.com/Jammanb0/doltap/security)에서
**Report a vulnerability**를 선택합니다. 제목과 설명을 적고, 재현 방법과 영향을 받는 버전도
가능하면 포함한 뒤 **Submit report**를 누릅니다. 제보는 공개 이슈로 게시되지 않고 저장소
관리자에게 전달됩니다.

### 고치는 버전

가장 최근 릴리즈를 기준으로 고쳐 새 버전으로 냅니다.
<!-- doltap:end doltap-s-erjncca4 -->

---

<!-- doltap:start doltap-s-vzx7yd82
same-as: doltap-s-erjncca4
-->
## English

doltap does not connect to the network and does not require API keys or credential files. It writes
files only through `init` and commands run with `--apply`, and the only external program it runs is
`git check-ignore`, which checks whether `.doltap/` is excluded from Git.

If you still find a problem that could affect security, such as overwriting files by mistake or
touching paths outside the project, please report it privately as described below. Do not post
vulnerability details in public issues.

### How to report

Open the repository's [Security and quality tab](https://github.com/Jammanb0/doltap/security) and
choose **Report a vulnerability**. Fill in a title and description, include the steps to reproduce
and the affected versions if you can, and click **Submit report**. The report is not posted as a
public issue; it goes to the repository maintainers.

### Supported versions

Fixes are made against the latest release and shipped as a new version.
<!-- doltap:end doltap-s-vzx7yd82 -->

<!-- doltap:end doltap-d-vhpn4b9r -->
