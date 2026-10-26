"""Use only tests/email-browser-server.cjs. No real mail or credentials."""
from playwright.sync_api import sync_playwright,expect
base='http://127.0.0.1:3150'
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 context=b.new_context(viewport={'width':375,'height':812});page=context.new_page();errors=[];external=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 context.on('request',lambda r:external.append(r.url) if not r.url.startswith(base) else None)
 page.goto(base+'/admin.html');expect(page.locator('#login-button')).to_be_enabled()
 page.locator('#admin-username').fill('browser_mail_owner');page.locator('#admin-password').fill('Only-for-email-browser-tests-2026');page.locator('#login-button').click()
 expect(page.locator('#dashboard')).to_be_visible();expect(page.locator('#email-status')).to_contain_text('본인 이메일 테스트 설정')
 page.locator('#order-list tr').first.get_by_role('button',name='상세 보기').click()
 page.once('dialog',lambda d:d.accept());page.get_by_role('button',name='PDF 이메일로 보내기',exact=True).click()
 page.wait_for_function("async()=>{const r=await fetch('/test/mail-count');return (await r.json()).count===1}")
 page.locator('#close-detail').click();page.locator('#refresh-admin').click()
 expect(page.locator('#dashboard')).to_be_visible()
 page.locator('#order-list tr').first.get_by_role('button',name='상세 보기').click();expect(page.get_by_role('button',name='PDF 이메일 다시 보내기')).to_be_visible();page.locator('#close-detail').click()
 page.goto(base+'/checkout.html');expect(page.locator('#service-status')).to_contain_text('본인 이메일로만')
 page.locator('#buyer-email').fill('wrong@example.com');page.locator('#buyer-date').fill('2005-12-23')
 for name in ['agreeTerms','agreePrivacy','agreeProduction']:page.locator('[name='+name+']').check()
 page.locator('#pay-button').click();expect(page.locator('#purchase-error')).to_contain_text('본인 수신 이메일')
 page.locator('#buyer-email').fill('owner@example.com');page.locator('#pay-button').click()
 expect(page.locator('#order-status')).to_contain_text('PDF 이메일 발송 요청이 접수',timeout=10000)
 assert page.request.get(base+'/test/mail-count').json()['count']==2
 expect(page.locator('#download-report')).to_be_visible()
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 page.screenshot(path='/tmp/sajumoon-email-test-mobile.png',full_page=True)
 assert not errors,errors
 assert not external,external
 print('PASS: mobile email settings, explicit legacy PDF email request, recipient restriction, automatic new-order submission, download fallback; simulated mail only')
 b.close()
