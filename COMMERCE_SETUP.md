# 19,000원 · 15쪽 PDF 상품

사진의 운영 기준에 따라 추가한 관리자·잠금·통계·AI·환불 기능은 [OPERATIONS_GUIDE.md](OPERATIONS_GUIDE.md)를 확인하세요.

## 현재 상태

구현한 것: 상품/동의 화면, 서버 주문, 서버 금액 검증, 토스 결제 승인 어댑터, 15쪽 한글 PDF, Resend 첨부 메일 어댑터, SQLite 작업 대기열·재시도·재시작 복구, 구매 브라우저의 인증된 PDF 다운로드.

검증한 것: 로컬 모의 주문 전체 흐름, PDF 실제 15쪽과 한글 추출, 캘린더·결제 금액·권한·재시도 단위 테스트. **실제 토스 결제 및 Resend 발송은 계정/키가 없어 실행하지 않았습니다.** GitHub Pages는 정적 화면과 샘플 PDF를 제공하며 결제 서버가 아닙니다. 실제 결제는 기본적으로 잠겨 있습니다.

샘플: `sample-report.pdf`. 내용 원본: `server/report.cjs`. 디자인 원본: `server/report-design.cjs` (사주문 한글 표기, 자개 달·꽃 벡터 문양, 연분홍·연보라 팔레트, 나눔명조 제목과 나눔고딕 본문). 폰트를 PDF에 포함하므로 수신 기기에 같은 폰트가 없어도 표시됩니다. 디자인 변경은 `npm run sample`로 샘플에 반영하고 실제 주문 PDF에도 자동 적용됩니다. 이 보고서는 일간·오행·표면 천간 십성에 따른 정형 해설과 자기 이해 질문입니다. AI 개인 상담·대운·용신·합충·전문가 감정을 제공하지 않습니다. 판매자는 샘플을 검토하고 이 상품 범위와 유료 판매에 적합한 내용인지 확인해야 합니다.

## 로컬 모의 구매 (실제 돈/메일 없음)

Node 24.x가 필요합니다.

```sh
cd /workspace/Saju_moon
npm ci --cache /tmp/sajumoon-npm-cache --no-audit --no-fund
npm test
npm run build
npm run sample
npm run demo
```

터미널에 표시된 포트의 `checkout.html`에서 테스트합니다. 기본 포트는 3000입니다. 모의 모드는 루프백에만 바인딩하고 실제 이메일을 보내지 않습니다. `NODE_ENV=production`에서는 모의 모드를 사용할 수 없습니다. SQLite 파일은 `.data/`에 저장되며 Git에 포함하지 않습니다.

자동 브라우저 검증은 `DEMO_MODE=1 PORT=3100 DATA_DIR=/tmp/sajumoon-purchase-demo node server/start.cjs`로 별도 모의 서버를 실행한 뒤 `python3 tests/purchase-browser.py`를 실행합니다. Python Playwright와 Chromium이 필요합니다. 운영 서버는 Python이나 Chromium이 필요 없습니다.

## 실제 결제·이메일 연결

1. **토스페이먼츠**: 판매자 가입/심사와 카드 결제 계약을 진행하고 개발자센터에서 테스트 키를 발급받습니다. 실제 판매 전 라이브 키와 결제창/도메인 관련 설정을 확인합니다.
2. **Resend**: 계정을 만들고 발신 도메인의 소유권과 SPF/DKIM을 인증합니다. 발송 전용 키와 검증된 발신 주소를 준비합니다. 발송 상태와 반송은 Resend 대시보드에서 확인합니다.
3. **Node 서버 호스팅**: Docker를 실행하는 호스트에 배포합니다. 예: Railway의 Docker 서비스 + 영구 볼륨. GitHub Pages와 별개이며, 결제는 이 서버의 `checkout.html`에서 진행합니다. 현재는 SQLite를 사용하므로 서버 복제본은 **1개**로 유지합니다.
4. 아래 환경변수를 **서버 호스트의 보안 환경 설정**에 입력합니다. 키를 채팅·GitHub·프론트엔드 코드에 넣지 않습니다. `.env.example`에는 이름만 있습니다. `TOSS_CLIENT_KEY`는 공개용 키이며 secret key는 서버에서만 사용합니다.
5. 판매자 정보, 이용·환불 정책, 개인정보 처리 및 메일 업체 수탁/국외 이전 안내, 법정 거래 기록 보관 체계를 실제 운영 내용에 맞게 확정합니다. `checkout.html`의 고지는 초안입니다. 확정된 내용으로 수정한 뒤 `POLICIES_APPROVED=true`를 설정합니다.
6. 먼저 로컬 개발 서버에서 테스트 키로 결제 승인과 실제 테스트 이메일 수신을 확인합니다. 테스트 모드는 로컬에서만 열리며 운영 환경에서는 활성화되지 않습니다. 이후 라이브 키, HTTPS 주소, 판매자 정보를 넣고 `SALES_ENABLED=true`로 전환합니다.
7. 운영 전 소액 실결제·발송·다운로드·취소/환불을 판매자가 직접 확인합니다. 운영실의 전액 환불 또는 토스 관리자 화면에서 판매자가 취소를 검증합니다.

| 변수 | 값/용도 |
| --- | --- |
| `TOSS_CLIENT_KEY` | `test_ck_...` 또는 `live_ck_...` 공개용 클라이언트 키 |
| `TOSS_SECRET_KEY` | 대응하는 서버 전용 시크릿 키 |
| `RESEND_API_KEY` | 메일 발송 전용 서버 키 |
| `MAIL_FROM` | 검증된 주소. 예: `사주문 <report@your-domain.example>` |
| `PUBLIC_BASE_URL` | 서버의 실제 공개 HTTPS 주소 (구매 화면과 같은 도메인) |
| `SELLER_NAME` / `SELLER_BUSINESS_ID` | 실제 상호/판매자명 및 사업자번호 |
| `SELLER_CONTACT` / `SELLER_ADDRESS` | 실제 고객센터 연락처 및 사업장 주소 |
| `SALES_ENABLED` | 기본 `false`. 로컬 결제사 테스트는 `test`, 실결제는 `true` |
| `POLICIES_APPROVED` | 판매자가 실제 정책 확정 후 `true` |
| `ADMIN_SETUP_TOKEN` | 첫 관리자 계정 생성용 32자 이상 무작위 소유자 설정 키 |
| `ORDER_DATA_KEY` | 32바이트 난수의 Base64 인코딩, 개인정보 암호화용 |
| `REPORT_ENGINE` | `rules` 기본 해설 / `ai` AI 해설 |
| `AI_PROVIDER_KEY` / `AI_MODEL` | AI 모드에서만 필요한 서버 키와 구조화 출력 지원 모델 |
| `DATA_DIR` | 운영에서는 영구 볼륨의 경로. 예: `/data` |
| `PORT` | 호스트가 지정한 HTTP 포트 |

가격은 서버 `server/product.cjs`의 19,000원으로 승인하며 브라우저가 보내는 가격을 신뢰하지 않습니다. 결제 금액·주문번호·통화·상태·결제키를 결제사 응답과 대조합니다. 확인 실패 시 같은 주문으로 재확인하며, 새 결제를 유도하지 않습니다.

## Docker 배포

```sh
docker build -t sajumoon .
docker volume create sajumoon-data
docker run --rm --env-file .env -e NODE_ENV=production -e DATA_DIR=/data -p 3000:3000 -v sajumoon-data:/data sajumoon
```

Docker 구성은 포함했으나 이 클라우드에서 Docker 이미지를 실제 빌드/호스팅 배포하지는 않았습니다. 영구 볼륨은 컨테이너의 `node` 사용자(UID 1000)가 읽고 쓸 수 있어야 합니다. `/health`를 상태 확인 경로로 사용합니다. HTTPS는 호스팅 서비스가 제공해야 합니다. DB와 백업에는 접근 제한·암호화를 적용하고 `.data/`를 공개 정적 디렉터리로 쓰지 않습니다.

새 구매 서버가 준비되면 GitHub Pages의 `checkout.html` 링크를 그 서버의 구매 주소로 바꿉니다. 고객의 출생 정보나 주문 토큰을 링크의 쿼리 문자열에 넣지 마세요. 현재의 임시 입력값 자동 채움은 같은 출처 내에서만 동작합니다.

## 발송·보관·운영

- 결제 승인 후 DB에 기록한 작업을 10초 간격으로 처리합니다. 미완료 작업은 재시작 후 이어서 처리합니다. 테스트·실결제·모의 주문은 서로 섞이지 않습니다.
- PDF를 먼저 DB에 보관하고 이메일을 요청합니다. 실패 시 지수 간격으로 최대 5회 재시도합니다. 발송 요청에는 주문별 고정 idempotency key를 사용합니다. 결제 후 23시간 넘게 중단된 작업은 중복 발송 방지를 위해 자동 처리하지 않고 운영자 확인 대상으로 남깁니다.
- `sent`는 메일 업체 **접수**를 뜻하며 수신함 도착을 증명하지 않습니다. 반송/배달 확인은 Resend에서 확인합니다. 실패한 주문의 수동 재발송·환불은 토스/메일 대시보드와 주문 DB를 확인해 처리해야 합니다. 운영실에서 주문 조회·재발송·문의 답변·전액 환불을 처리할 수 있습니다. 메일 배달 웹훅은 아직 없습니다.
- PDF·이메일·출생 정보는 생성 후 30일에 정리합니다. 이 DB는 판매자의 법정 거래 장부를 대신하지 않습니다. 토스 결제 기록 및 별도의 법정 기록 보관 절차를 준비하고 개인정보/백업 삭제 정책을 확정해야 합니다.
- 구매 브라우저의 임시 토큰으로만 주문·PDF를 조회합니다. 링크로 토큰을 보내거나 공개 PDF URL을 만들지 않습니다. 브라우저 데이터가 사라지면 판매자 문의가 필요하며, 계정 로그인/이메일 주문 복구는 현재 포함하지 않습니다.
