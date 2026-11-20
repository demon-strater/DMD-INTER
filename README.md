# DMD INTER

Three Art Movements That Shaped Me — 인터랙션 전용판.

메인화면의 순환하는 카드를 누르면 개념 설명 없이 바로 그 사조의 인터랙션으로 들어가고,
인터랙션에서 나오면(왼쪽 위 홈 버튼) 대표작 갤러리가 이어진 뒤 메인화면으로 돌아옵니다.

| 카드 | 인터랙션 | 명화 관람 |
| --- | --- | --- |
| 르네상스 | 소실점 배치하기 (`renaissance-perspective.html`) | `renaissance-finale.html` |
| 초현실주의 | 낮과 밤이 공존하는 방 → 우아한 시체 놀이 (메인화면 안) | `surrealism-finale.html` |
| 낭만주의 | 안개 위의 방랑자 (`romanticism-experience.html`) | `romanticism-finale.html` |

개념 설명 영상이 포함된 원본은 [Three_ArtMovements-That-Shaped-Me](https://github.com/demon-strater/Three_ArtMovements-That-Shaped-Me)에 있습니다.

## 실행

페이지가 ES 모듈을 쓰므로 `file://`로는 열 수 없습니다. `start.cmd`를 더블클릭하면
`node serve.cjs`가 http://127.0.0.1:8010/ 에서 사이트를 엽니다.

## 손으로 조작하기

오른쪽 아래 손 아이콘을 누르면 웹캠이 켜집니다(처음 한 번 카메라 허용 필요). 캠 영상은 화면에 나오지 않고,
인식 영역 패널에 카메라 시야와 화면에 대응하는 16:9 영역, 인식된 손 뼈대와 지금 상태가 표시됩니다.

- 처음에 손가락을 펴고 손바닥을 카메라에 보여 주면 손바닥 방향을 맞춥니다.
- 검지 끝 = 화면 커서
- 엄지와 검지를 집기 = 클릭(선택), 집은 채 움직이기 = 끌기
- 메인화면: 편 손을 좌우로 움직여 카드 넘기기, 집어서 카드 열기
- 사조 안: 주먹을 0.7초 쥐고 있으면 뒤로(명화 관람 → 메인)

손 인식은 브라우저 안에서만 처리되며 영상은 어디에도 전송되지 않습니다.
