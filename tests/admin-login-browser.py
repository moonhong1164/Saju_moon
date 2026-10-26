"""Run against a fresh local demo database. Does not create accounts on live servers."""
import os,uuid
from playwright.sync_api import sync_playwright,expect
base=os.environ.get('SAJU_ADMIN_TEST_URL','http://127.0.0.1:3120')
password='Test-only-'+uuid.uuid4().hex
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 context=b.new_context(viewport={'width':1440,'height':1000})
 page=context.new_page();errors=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 assert page.request.get(base+'/api/config').json()['demo'] is True
 page.goto(base+'/admin.html')
 expect(page.locator('#account-setup')).to_be_visible()
 expect(page.locator('#dashboard')).to_be_hidden()
 page.locator('#setup-username').fill('browser_owner')
 page.locator('#setup-password').fill(password)
 page.locator('#setup-password-confirm').fill(password)
 page.locator('#setup-button').click()
 expect(page.locator('#dashboard')).to_be_visible()
 page.reload()
 expect(page.locator('#dashboard')).to_be_visible()
 assert any(c['httpOnly'] and c['sameSite']=='Strict' for c in context.cookies())
 second=context.new_page();second.goto(base+'/admin.html');expect(second.locator('#dashboard')).to_be_visible()
 page.locator('#logout').click()
 expect(page.locator('#admin-login')).to_be_visible()
 expect(page.locator('#dashboard')).to_be_hidden()
 assert page.request.get(base+'/api/admin/summary').status==401
 second.reload();expect(second.locator('#dashboard')).to_be_hidden()
 page.locator('#admin-username').fill('browser_owner')
 page.locator('#admin-password').fill('wrong-password')
 page.locator('#login-button').click()
 expect(page.locator('#admin-error')).to_contain_text('아이디 또는 비밀번호')
 expect(page.locator('#dashboard')).to_be_hidden()
 page.locator('#admin-password').fill(password)
 page.locator('#login-button').click()
 expect(page.locator('#dashboard')).to_be_visible()
 new_password='New-test-'+uuid.uuid4().hex
 page.locator('#current-password').fill(password)
 page.locator('#new-password').fill(new_password)
 page.locator('#new-password-confirm').fill(new_password)
 page.locator('#password-form button').click()
 expect(page.locator('#password-status')).to_contain_text('비밀번호를 변경')
 page.locator('#logout').click()
 page.set_viewport_size({'width':375,'height':812})
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 page.screenshot(path='/tmp/sajumoon-admin-login-mobile.png',full_page=True)
 page.set_viewport_size({'width':1440,'height':1000})
 page.screenshot(path='/tmp/sajumoon-admin-login.png')
 # GitHub Pages/no-backend case: no fake client-side authentication.
 page.route('**/api/admin/**',lambda r:r.fulfill(status=404,body='Not found',content_type='text/html'))
 page.reload()
 expect(page.locator('#connection-help')).to_be_visible()
 expect(page.locator('#admin-login')).to_be_hidden()
 expect(page.locator('#dashboard')).to_be_hidden()
 expect(page.locator('#connection-help')).to_contain_text('로그인 서버 연결')
 assert not errors,errors
 print('PASS: first-owner setup, password login, refresh persistence, cross-tab logout, wrong-password rejection, password change, mobile layout, honest static-host fallback')
 b.close()
