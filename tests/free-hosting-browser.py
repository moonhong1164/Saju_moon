"""Local PostgreSQL-backed free-trial UI. Never run against public data."""
import os,uuid
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright,expect
base=os.environ.get('SAJU_FREE_TEST_URL','http://127.0.0.1:3140')
assert urlparse(base).hostname in ['localhost','127.0.0.1']
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 context=b.new_context(viewport={'width':375,'height':812})
 admin=context.new_page();errors=[];external=[]
 context.on('page',lambda page:page.on('pageerror',lambda e:errors.append(str(e))))
 context.on('request',lambda request:external.append(request.url) if not request.url.startswith(base) else None)
 config=admin.request.get(base+'/api/config').json();assert config['trial'] is True and config['reportEngine']=='rules'
 admin.goto(base+'/admin.html')
 expect(admin.locator('#login-note')).not_to_contain_text('연결하고 있습니다')
 if admin.locator('#account-setup').is_visible():
  admin.locator('#setup-token').fill(os.environ.get('SAJU_TEST_SETUP_TOKEN','local-browser-test-setup-token-never-production'))
  admin.locator('#setup-username').fill('free_browser_owner')
  admin.locator('#setup-password').fill('Only-for-free-browser-tests-2026')
  admin.locator('#setup-password-confirm').fill('Only-for-free-browser-tests-2026')
  admin.locator('#setup-button').click()
 else:
  admin.locator('#admin-username').fill('free_browser_owner')
  admin.locator('#admin-password').fill('Only-for-free-browser-tests-2026')
  admin.locator('#login-button').click()
 expect(admin.locator('#dashboard')).to_be_visible()
 expect(admin.locator('#environment-note')).to_contain_text('무료 테스트 데이터')
 admin.reload();expect(admin.locator('#dashboard')).to_be_visible()
 page=context.new_page();page.goto(base+'/checkout.html')
 expect(page.locator('.price')).to_have_text('0원 · 무료 테스트')
 expect(page.locator('#service-status')).to_contain_text('실제 결제·이메일·유료 AI 호출 없이')
 expect(page.locator('#pay-button')).to_be_enabled()
 page.locator('#buyer-name').fill('무료 확인')
 email='free-'+uuid.uuid4().hex[:6]+'@example.com'
 page.locator('#buyer-email').fill(email)
 page.locator('#buyer-date').fill('20051223')
 for name in ['agreeTerms','agreePrivacy','agreeProduction']:page.locator('[name='+name+']').check()
 page.locator('#pay-button').click()
 expect(page.locator('#order-status')).to_contain_text('무료 테스트 PDF가 준비',timeout=20000)
 page.locator('#open-report').click();expect(page.locator('.web-chapter')).to_have_count(15)
 page.locator('#close-web-report').click()
 with page.expect_download() as event:page.locator('#download-report').click()
 event.value.save_as('/tmp/sajumoon-free-trial.pdf')
 page.reload();expect(page.locator('#download-report')).to_be_visible()
 admin.locator('#refresh-admin').click();admin.locator('#order-search').fill(email)
 row=admin.locator('#order-list tr').filter(has_text=email)
 row.get_by_role('button',name='상세 보기').click()
 expect(admin.get_by_role('button',name='무료 테스트 주문 취소')).to_be_visible()
 admin.locator('#close-detail').click()
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 page.screenshot(path='/tmp/sajumoon-free-trial-mobile.png',full_page=True)
 admin.screenshot(path='/tmp/sajumoon-free-admin-mobile.png')
 assert not external,external
 assert not errors,errors
 print('PASS: authenticated mobile admin, 0 KRW trial checkout, 15-chapter web/PDF, persisted order, correct free labels; zero external payment/mail/AI requests')
 b.close()
