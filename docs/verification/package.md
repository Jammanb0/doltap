# 배포 파일

[검증 기록](README.md)

## 대상

- doltap 1.0.0, 구현 SHA-256 `3b36e42532ea79b7a423d8a71978eaf21db51dc66276a0a08ade4e6d93a08f21`
- `package.json`의 `files`(`bin`, `lib`, `template`, `APPLY.md`, `docs/guide`,
  `assets/doltap_long.png`)와 npm이 늘 넣는 `package.json`·README·LICENSE

## 방법

2026-10-02, Windows 11(win32 x64), Node v22.14.0, npm 10.9.2.

1. `npm pack --dry-run`으로 묶일 파일 목록을 봅니다.
2. `npm pack --pack-destination <임시 폴더>`로 묶음 파일을 만들어 풀고, 그 안의
   `bin/doltap.mjs`로 `--version`, 새 폴더에 `init`, 그 폴더의 `check`를 실행합니다.
3. 풀어 놓은 묶음의 Markdown에서 상대 링크를 모두 따라가, 대상이 묶음 안에 있는지 봅니다.

판정 기준: 실행 코드·템플릿·사용 안내·README 두 벌·라이선스·README 그림이 들어가고, 시험·검증
기록·운영 기록이 빠질 것. 묶음만으로 `init`과 `check`가 종료 코드 0으로 끝날 것. 묶음 안
안내의 상대 링크가 모두 묶음 안의 파일을 가리킬 것.

## 결과

- 파일 35개, 묶음 643.8 kB, 풀었을 때 803.3 kB.
- 들어감: `bin/doltap.mjs`, `lib/` 14개, `template/` 3개(`AGENTS.md`, `.doltap/current.md`,
  `.doltap/history.md`), `docs/guide/` 11개(영어판 `docs/guide/en/` 2개 포함), `APPLY.md`,
  `README.md`, `README.en.md`, `LICENSE`, `package.json`, `assets/doltap_long.png`. `docs/` 아래에는
  `guide/`만 있습니다.
- 빠짐: `test/`, `docs/verification/`, `docs/README.md`, `scripts/`, `.doltap/`, `.github/`,
  `CONTRIBUTING.md`, `SECURITY.md`.
- 묶음에서 실행: `--version`은 `1.0.0`, `init`과 그 결과의 `check`는 종료 코드 0(채우기 자리
  확인 항목만 있음).
- 링크: 묶음 안 Markdown 17개의 상대 링크 87개가 모두 묶음 안의 파일을 가리킵니다. README 두
  벌의 검증 기록 링크는 묶음에서 빠지는 문서를 가리키므로 GitHub 주소로 연결되어 있습니다.

## 적용 범위

npm 10.9.2로 만든 묶음의 파일 목록과, 묶음만으로 기본 명령이 도는지에 대한 확인입니다.

## 재실행

```sh
npm pack --dry-run
npm pack --pack-destination <임시 폴더>
```

임시 폴더에서 `tar -xzf doltap-1.0.0.tgz`로 풀고 `node package/bin/doltap.mjs init <새 폴더>`와
`node package/bin/doltap.mjs check <새 폴더>`를 실행합니다. 링크 판정은
`node --test test/docs.test.mjs`의 "배포 묶음에 들어가는 안내는 묶음 안의 파일만 가리킨다"로
다시 확인할 수 있습니다.
