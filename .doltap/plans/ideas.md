<a name="doltap-d-scm8gx88-start" id="doltap-d-scm8gx88-start"></a>

# 아이디어

> 아직 착수를 약속하지 않은 기능과 선택적 개선 후보를 관리합니다.
> 해결해야 하는 현재 문제나 진행 중인 작업은 이 파일에 두지 않습니다.

## 조건이 갖춰지면

- **템플릿 영어판.** 지금 골격 문서는 한국어뿐입니다. `README.en.md`는 있지만
  정작 복사되는 내용이 한국어라 영어 사용자는 직접 번역해야 합니다. 실제로 쓰는
  사람이 생기면 착수합니다.
- **npm 레지스트리 등록.** 지금은 `npx github:Jammanb0/cairn`으로만 받습니다.
  등록하면 `npx doltap check .`로 짧아지고, Git 없이도 설치되며 버전
  고정이 `@<버전>`이라는 표준 형태가 됩니다.
  **지금 하지 않는 이유는 GitHub 설치로 충분하고, 별도 배포처와 패키지 이름을
  계속 관리할 만큼 확인된 수요가 없기 때문입니다.**
  착수한다면 이런 것들을 정해야 합니다. 패키지 이름은 `doltap`입니다 —
  2026-09-11 확인 시 비어 있었지만 등록할 때 다시 봐야 합니다. 이름은 한 번
  정하면 되돌리기 어렵습니다. 릴리즈마다 GitHub Release와 npm 두 곳에 내야 해서
  어긋날 수 있고, README 설치 안내도 두 벌이 됩니다.
  자동 배포에 장기 토큰은 필요 없습니다. npm에 Trusted Publisher를 연결하고
  GitHub Actions에 `id-token: write` 권한을 주면 OIDC로 배포됩니다
  (npm 11.5.1 이상, Node 22.14 이상, self-hosted 러너는 미지원).
  `AGENTS.md`의 「시크릿을 쓰는 곳이 없습니다」를 깨지 않고 갈 수 있습니다.

## 고칠 거리

현재 후보 없음.

새 후보가 생기면 기대 효과와 제약을 짧게 적습니다. 구현을 결정하면 이 파일에서
지웁니다. 그다음은 `workstreams.md`의 「시작할 때」를 따릅니다 — 대작업이면
`workstreams/<번호>-<이름>/`을 만들고, 아니면 그냥 합니다.

**안 하기로 정한 것은 여기 남기지 않습니다.** 이 파일은 후보 목록이지 판단
기록장이 아닙니다. 기각한 이유는 그때의 결정 문서와 `docs/trials/README.md`의
「알려진 제한」·「검증하지 않는 것」에 있습니다.

- `assumes` [status.md](../archive/legacy/workstreams/007-first-impression/status.md#doltap-d-qzcaxr50-start)

- `assumes` [README.md](workstreams/009-document-graph/README.md#doltap-b-js7yf5p8-start)

<a name="doltap-d-scm8gx88-end" id="doltap-d-scm8gx88-end"></a>
