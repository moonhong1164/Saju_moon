# GitHub Pages 배포

이 사이트는 빌드나 API 키가 필요 없는 정적 HTML/CSS/JavaScript 사이트입니다.

## 처음 공개하기

1. GitHub의 `moonhong1164/Saju_moon` 저장소에서 **Settings → Pages**를 엽니다.
2. **Build and deployment → Source**에서 **Deploy from a branch**를 선택합니다.
3. 브랜치를 **gh-pages**, 폴더를 **/ (root)**로 선택하고 **Save**를 누릅니다.
4. 배포가 완료되면 Pages 설정에 표시된 사이트 주소로 접속합니다.

프로젝트 기본 주소는 `https://moonhong1164.github.io/Saju_moon/`입니다. 설정과 배포가 완료되기 전에는 접속되지 않을 수 있습니다. 비공개 저장소의 Pages 지원 여부는 GitHub 요금제에 따라 다릅니다. 공개가 필요하더라도 저장소 공개 범위를 임의로 변경하지 마세요.

## 변경 사항 반영

`gh-pages` 브랜치의 `index.html`, `style.css`, `app.js`를 수정하고 커밋한 뒤 푸시하면 다시 배포됩니다. 강제 푸시는 필요하지 않습니다.

## 로컬 확인

```sh
python3 -m http.server 3000 --bind 0.0.0.0 --directory /workspace/Saju_moon
node --check /workspace/Saju_moon/app.js
```

메뉴 이동, 모바일 화면, 생년월일 필수 입력, 확인창 열기와 닫기를 확인하세요. 입력값은 서버로 전송하거나 저장하지 않습니다. 실제 사주 계산 기능은 구현되어 있지 않습니다.
