# ID를 만들고 관계 연결하기

[사용 안내](README.md) · [개념](concepts.md) · [실행 방법](getting-started.md)

**기존 문서 전체를 처음 이관할 때는 migrate**, 특정 문서나 절에 ID를 추가할 때는
id를 씁니다. 실제로 따로 참조할 범위만 등록합니다.

프로젝트 루트에 notes.md가 있고 “배포 조건”이라는 제목이 있다고 가정합니다.

```sh
doltap id notes.md --kind d
doltap id notes.md --kind d --apply
doltap id notes.md --kind s --at "배포 조건"
doltap id notes.md --kind s --at "배포 조건" --apply
```

각 미리보기를 확인하고 같은 명령의 --apply에서 저장합니다.
작은 문단을 감싸려면 `--kind b --at <시작 줄> --end <끝 줄>`을 씁니다.
양 끝을 포함하며 앞선 ID 추가로 줄 번호가 바뀔 수 있으니 현재 파일을 확인합니다.

미리보기의 새 ID는 아직 예약된 값이 아닙니다. 실제 적용에서 발급된 ID를
확인하고 연결에 사용하세요. 기존 ID는 재실행해도 유지됩니다.

.doltap 밖의 notes.md는 ID만 발급하면 아직 지도에 나오지 않습니다.
먼저 관련 작업의 README 같은 **운영 문서에서 notes 문서 ID로** 연결합니다.
실제 적용된 notes.md의 문서 앵커와 운영 문서의 ID를 확인해 아래 값을 바꿉니다.

```sh
doltap link <운영문서-ID> --to <notes-문서-ID> --as indexes
doltap link <운영문서-ID> --to <notes-문서-ID> --as indexes --apply
```

이제 notes.md의 절도 지도에서 찾고 관계의 출발점으로 쓸 수 있습니다.
외부 문서끼리만 연결해서 전체 관리 범위가 계속 늘어나는 구조는 아닙니다.

## 출발점과 근거를 연결하기

```sh
doltap map . --json
doltap link <출발-ID> --to <도착-ID> --as depends-on
doltap link <출발-ID> --to <도착-ID> --as depends-on --apply
doltap check .
```

예를 들어 “배포 조건”이 공통 규칙을 근거로 삼는다면 배포 조건 ID가 출발점,
공통 규칙 ID가 도착점입니다. link가 출발 범위 안에 상대 경로와 관계를 적습니다.
어떤 유형인지 고민된다면 단순 참고는 references, 목차는 indexes,
근거 변경 시 재검토해야 하는 의존은 depends-on으로 구분합니다.
전체 유형과 만료 방향은 [상세 참고](reference.md)에 있습니다.

이미 ID가 있는 파일을 옮길 때는 재발급하지 말고 [move-fix](moving-deleting.md)를
씁니다. ID를 복사해 붙이거나 같은 관계를 양쪽 문서에 중복 선언하지 않습니다.
