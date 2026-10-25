# GitHub Pages 배포

이 사이트는 API 키나 백엔드가 필요 없는 정적 HTML/CSS/JavaScript 사이트입니다. 계산 라이브러리를 포함한 `app.js`가 커밋되어 있어 GitHub Pages에서 별도의 빌드 명령 없이 실행됩니다.

## 처음 공개하기

1. GitHub의 `moonhong1164/Saju_moon` 저장소에서 **Settings → Pages**를 엽니다.
2. **Build and deployment → Source**에서 **Deploy from a branch**를 선택합니다.
3. 브랜치를 **gh-pages**, 폴더를 **/ (root)**로 선택하고 **Save**를 누릅니다.
4. 배포가 완료되면 Pages 설정에 표시된 사이트 주소로 접속합니다.

프로젝트 기본 주소는 `https://moonhong1164.github.io/Saju_moon/`입니다. 설정과 배포가 완료되기 전에는 접속되지 않을 수 있습니다. 비공개 저장소의 Pages 지원 여부는 GitHub 요금제에 따라 다릅니다. 공개가 필요하더라도 저장소 공개 범위를 임의로 변경하지 마세요.

## 변경 사항 반영

`gh-pages` 브랜치의 `index.html`, `style.css`, `src/`를 수정하세요. 계산·동작 원본을 수정했다면 `npm ci --cache /tmp/sajumoon-npm-cache --no-audit --no-fund`, `npm test`, `npm run build`를 실행하고 생성된 `app.js`와 함께 커밋·푸시하세요. 자동으로 다시 배포되며 강제 푸시는 필요하지 않습니다.

## 로컬 확인

```sh
python3 -m http.server 3000 --bind 0.0.0.0 --directory /workspace/Saju_moon
node --check /workspace/Saju_moon/app.js
```

메뉴 이동, 모바일 화면, 양력·음력·윤달 입력, 시간 미상, 계산 결과와 풀이 주제 전환, 결과 복사를 확인하세요. 입력값은 서버로 전송하거나 저장하지 않습니다. 사주 기둥 계산과 전통 상징에 따른 기본 풀이를 제공하며, 상세한 계산 기준과 한계는 README 및 결과창에 표시합니다.

## 유료 PDF 구매 서버

GitHub Pages는 결제·메일 서버를 실행할 수 없습니다. 현재 구매 페이지는 API가 없는 경우 결제 버튼을 잠그고 19,000원 상품 설명과 15쪽 샘플을 제공합니다. 실제 판매를 하려면 [COMMERCE_SETUP.md](COMMERCE_SETUP.md)의 Node 서버 호스팅·토스·Resend 연동을 완료하고 Pages의 구매 링크를 서버 구매 주소로 바꾸세요. 무료 풀이와 샘플 PDF는 Pages에 그대로 유지할 수 있습니다.

관리자·문의·환불·유입 통계·수익 계산·선택적 AI 해설의 운영 기준과 30일 출시 순서는 [OPERATIONS_GUIDE.md](OPERATIONS_GUIDE.md)를 참고하세요. `/admin.html`은 관리자 화면 파일이며 실제 데이터는 인증된 Node API에서만 불러옵니다. Pages 주소에서 화면 파일이 열린다고 관리자 서버가 배포된 것은 아닙니다.
