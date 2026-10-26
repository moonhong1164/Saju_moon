# 도메인 없이 본인 메일로 PDF 테스트

서버의 `/email-setup.html`에서도 같은 연결 순서를 확인할 수 있습니다. 실제 발송에는 본인이 만든 Resend 키가 필요하며 저장소에 키를 넣지 않습니다.

1. [Resend](https://resend.com/signup)에 가입·로그인하고 수신할 가입 이메일을 인증합니다. 무료 플랜의 최신 한도는 Resend에서 확인합니다.
2. API Keys에서 발송 권한이 있는 키를 만듭니다. 키는 채팅이나 GitHub에 보내지 않습니다.
3. Render의 **sajumoon-server → Environment**에 다음 값을 등록하고 저장·재배포합니다.

| 환경변수 | 값 |
| --- | --- |
| `EMAIL_DELIVERY_MODE` | `owner_test` |
| `RESEND_API_KEY` | Resend에서 만든 실제 키 |
| `TEST_EMAIL_TO` | Resend에서 인증한 본인 가입 이메일 |
| `MAIL_FROM` | `사주문 <onboarding@resend.dev>` |

`FREE_TRIAL_MODE=true`, `SALES_ENABLED=false`, `REPORT_ENGINE=rules`를 유지합니다. `DATABASE_URL`, `ORDER_DATA_SECRET` 등 기존 DB·암호화 설정은 바꾸지 않습니다. 이메일 모드는 Blueprint에서 고정하지 않으므로 위의 Render 환경변수로 선택합니다.

4. 배포가 Live가 되면 관리자 → 이메일 연결에서 설정 상태를 확인합니다. 설정 등록은 실제 수신 성공을 보장하지 않습니다.
5. `/checkout.html`에서 위 본인 이메일로 새 무료 주문을 만들고 PDF 첨부 메일의 받은편지함·스팸함을 확인합니다. 다른 주소는 테스트 모드에서 거절합니다.

과거 다운로드 전용 주문은 설정을 켜도 자동 발송하지 않습니다. 본인 이메일로 생성했던 기존 주문은 관리자 주문 상세의 **PDF 이메일로 보내기**로 명시적으로 요청할 수 있습니다. 재발송도 같은 화면에서 요청합니다. 환불 처리 중이거나 취소된 주문에는 발송할 수 없습니다.

Resend 접수와 실제 배달은 다릅니다. API 키·수신인 인증 오류는 무한 재시도하지 않으며, 설정을 수정한 뒤 관리자에서 다시 요청합니다. 발송 오류가 나도 준비된 PDF는 웹에서 다운로드할 수 있습니다. 무료 서버가 쉬는 동안에는 대기열 처리가 지연될 수 있습니다.

실제 고객의 임의 주소로 판매하려면 소유한 발신 도메인을 Resend에서 검증하고 `MAIL_FROM`과 `EMAIL_DELIVERY_MODE=customer`를 설정해야 합니다. 도메인 없는 본인 테스트에 도메인 구매는 필요하지 않습니다. 실제 결제 개시는 별도 설정입니다.

검증: 가짜 메일 제공자로 PDF 첨부, 수신인 제한, 로그인·CSRF, 기존 주문의 명시적 발송·중복 방지, 실패 후 다운로드를 확인했습니다. 로컬 PostgreSQL 영속화와 모바일 브라우저 흐름도 확인했습니다. 운영 Resend 키로 실제 메일 수신은 아직 검증하지 않았습니다.
