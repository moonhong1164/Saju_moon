"""Checks mobile discovery and read-only review on a static host, with no backend."""
import os
from playwright.sync_api import sync_playwright,expect
base=os.environ.get('SAJU_STATIC_PREVIEW_URL','http://127.0.0.1:3130')
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 page=b.new_page();errors=[];requests=[]
 page.on('request',lambda r:requests.append(r.url))
 page.on('pageerror',lambda e:errors.append(str(e)))
 for width in [320,375,430,1440]:
  page.set_viewport_size({'width':width,'height':812})
  page.goto(base+'/index.html')
  admin=page.locator('header .nav-admin-link')
  expect(admin).to_be_visible()
  assert admin.bounding_box()['y']<100
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  if width==375:page.screenshot(path='/tmp/sajumoon-mobile-admin-menu.png')
  admin.click()
  expect(page.locator('#admin-login')).to_be_visible()
  expect(page.locator('#login-button')).to_be_disabled()
  expect(page.locator('#connection-help')).to_be_visible()
  requests.clear()
  page.get_by_role('link',name='관리자 화면 미리보기',exact=False).click()
  expect(page.locator('.preview-notice').first).to_contain_text('가상 데이터')
  page.locator('[data-preview-order="A"]').click()
  expect(page.locator('#preview-detail')).to_be_visible()
  expect(page.locator('#preview-detail-content')).to_contain_text('PREVIEW-001')
  page.get_by_role('button',name='미리보기 닫기').click()
  expect(page.locator('#preview-detail')).to_be_hidden()
  assert not any('/api/' in u for u in requests)
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  if width==375:page.screenshot(path='/tmp/sajumoon-mobile-admin-preview.png')
 assert not errors,errors
 print('PASS: top admin menu visible at 320/375/430/1440px; static login status; read-only preview/details; no admin API or financial actions; no horizontal overflow')
 b.close()
