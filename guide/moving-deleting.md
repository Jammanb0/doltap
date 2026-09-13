# 이동·삭제·복구

[사용 안내](README.md) · [실행 방법](getting-started.md)

| 현재 상태 | 선택 |
| --- | --- |
| 파일을 옮겼고 본문은 남아 있다 | move-fix |
| 문서·절·폴더가 아직 있고 이제 지우려 한다 | delete |
| 파일 탐색기나 rm으로 이미 지웠다 | delete-fix |
| doltap 쓰기 명령의 변경을 되돌린다 | recover |
| 끝난 작업을 보관하려 한다 | [아카이브 절차](finishing.md) |

## 파일을 옮긴 뒤

파일은 편집기나 파일 탐색기로 옮기고 ID는 유지합니다.

```sh
doltap move-fix .
doltap move-fix . --apply
doltap check .
```

명시된 관계 경로와 발급 위치를 맞춥니다. 미리보기에서 새 경로를 확인합니다.
일반 본문에 적힌 경로나 제목까지 의미를 추측해 고치지는 않습니다.
동일 ID가 두 곳에 있으면 어느 것이 원본인지 추측하지 않고 중단합니다.

## 아직 있는 범위를 삭제하기

```sh
doltap delete <ID> --mode purge --why "참조 없는 중복 기록 정리"
```

purge는 범위와 자식을 지우되 ID 발급 기록은 남깁니다.
tombstone은 내용 대신 ID와 삭제 이유를 둡니다. 두 방식은 외부 참조가 있으면 막힙니다.
다른 문서로 대체하려면 아래처럼 새 ID를 지정합니다.

```sh
doltap delete <옛-ID> --mode replace --to <새-ID> --why "새 규칙으로 대체"
```

replace는 명시된 참조를 새 ID로 바꾸고 대체 관계를 남깁니다.
자식 ID의 참조는 각각 먼저 정리해야 합니다. 모두 미리보기이므로 내용을
확인한 뒤 같은 명령에 --apply를 붙이고 check를 실행합니다.

## 폴더의 등록 문서를 함께 삭제하기

```sh
doltap delete .doltap/archive/workstreams/010-example --mode purge --why "보관 기록 정리"
```

폴더 안의 등록 문서와 내부 관계를 하나의 삭제 범위로 다룹니다. 밖에서 들어오는
관계가 있으면 위치를 보여주고 멈춥니다. 다른 근거로 연결하거나 제거 여부를 판단합니다.
독립된 관계 줄을 제거하기로 했다면 다음처럼 미리 봅니다.

```sh
doltap delete .doltap/archive/workstreams/010-example --mode purge --why "보관 기록 정리" --drop-links
```

--apply를 붙여야 실제로 삭제합니다. **미등록 파일은 retained 목록에 표시해 남깁니다.**
일반 링크·설명과 섞인 관계·history의 이력표 문장은 직접 정리합니다.
성공 뒤 빈 폴더만 제거하므로 미등록 파일이 있으면 폴더가 남는 것이 정상입니다.

## 이미 지웠다면 현재 상태에서 정리하기

```sh
doltap delete-fix .doltap/archive/workstreams/010-example --why "폴더를 직접 삭제함"
```

사라진 ID를 대장에서 삭제 상태로 바꿀 계획을 만듭니다.
남은 관계는 위치를 확인하고 직접 고치거나 --drop-links로 제거를 명시합니다.
미리보기 뒤 --apply로 적용하고 check를 실행합니다.

다른 경로에서 ID가 살아 있거나 본문·손상 앵커가 남아 있으면 삭제로 확정하지
않습니다. 숨김·빌드·복구 폴더 등 탐색 제외 위치로 옮긴 경우까지 찾아주는 기능은
아니므로 먼저 실제 위치를 확인합니다. 필수 문서가 사라진 문제는 별도로 해결해야 합니다.

## doltap이 바꾼 파일 되돌리기

적용 결과의 id는 실행 ID입니다. 대상 노드 ID와 다릅니다.

```sh
doltap recover <실행-ID>
doltap recover <실행-ID> --apply
```

복구 미리보기 뒤 적용합니다. 그사이 따로 편집한 파일과 충돌하면 덮어쓰지 않습니다.
묶음 삭제의 문서와 필요한 부모 폴더도 복원합니다. 원래 빈 폴더까지 보장하지는 않습니다.
**delete-fix 실행 전에 이미 지운 본문은 그 실행의 백업에 없으므로 복원할 수 없습니다.**

성공한 변경을 확인했고 해당 백업이 필요 없으면 실행 ID를 지정해 폐기합니다.

```sh
doltap recover <실행-ID> --discard
```

--discard는 즉시 해당 복구 자료를 지우는 명시적 명령입니다. --apply를 덧붙이는
방식이 아닙니다. 미완료 실행의 백업은 버릴 수 없으며 먼저 recover로 처리합니다.

