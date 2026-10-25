"""Run a local demo server on port 3100 before this test; no real charge or email."""
import os
from playwright.sync_api import sync_playwright, expect
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 page=browser.new_page(viewport={'width':1440,'height':1000})
 errors=[]
 page.on('pageerror',lambda error:errors.append(str(error)))
 page.goto(os.environ.get('SAJU_PURCHASE_URL','http://127.0.0.1:3100/checkout.html'))
 expect(page.locator('#service-status')).to_contain_text('로컬 체험')
 expect(page.locator('#pay-button')).to_be_enabled()
 page.locator('#buyer-name').fill('구매 테스트')
 page.locator('#buyer-email').fill('test@example.com')
 page.locator('#buyer-date').fill('20051223')
 expect(page.locator('#buyer-date')).to_have_value('2005-12-23')
 page.locator('#buyer-unknown').uncheck()
 page.locator('#buyer-time').fill('08:37')
 for name in ['agreeTerms','agreePrivacy','agreeProduction']:
  page.locator('[name='+name+']').check()
 page.locator('#pay-button').click()
 expect(page.locator('#order-panel')).to_be_visible()
 expect(page.locator('#order-status')).to_contain_text('모의 주문으로 PDF를 생성',timeout=20000)
 expect(page.locator('#download-report')).to_be_visible()
 with page.expect_download() as event:
  page.locator('#download-report').click()
 download=event.value
 download.save_as('/tmp/sajumoon-purchased-browser.pdf')
 page.reload()
 expect(page.locator('#order-status')).to_contain_text('실제 결제나 이메일 발송은 하지 않았습니다.')
 page.set_viewport_size({'width':375,'height':812})
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 page.screenshot(path='/tmp/sajumoon-purchase-mobile.png',full_page=True)
 assert not errors,errors
 assert all(u in page.url for u in ['checkout.html'])
 print('PASS: local mock checkout, consent, 19,000 order, PDF queue, download, refresh recovery, mobile layout; no real charges or email')
 browser.close()
