"""Run against a local server: python3 tests/browser.py (requires Playwright + Chromium)."""
import os
from playwright.sync_api import sync_playwright, expect

url = os.environ.get('SAJU_TEST_URL', 'http://127.0.0.1:3000/')
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'), headless=True, args=['--no-sandbox'])
    for zone in ['Asia/Seoul', 'America/Los_Angeles']:
        context = browser.new_context(viewport={'width':1440,'height':1000}, timezone_id=zone, permissions=['clipboard-read','clipboard-write'])
        page = context.new_page()
        errors, requests = [], []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('request', lambda r: requests.append((r.method,r.url)))
        assert page.goto(url).status == 200
        page.locator('[data-topic="일과 재물"]').click()
        assert page.locator('#topic').input_value() == '일과 재물'
        page.locator('#name').fill('<img src=x onerror=alert(1)>')
        page.locator('#birth').fill('20051223')
        assert page.locator('#birth').input_value() == '2005-12-23'
        page.locator('#unknown-time').uncheck()
        page.locator('#time').fill('08:37')
        before = len(requests)
        page.get_by_role('button', name='나의 사주 풀이 보기').click()
        assert page.locator('#result').is_visible()
        assert len(requests) == before, 'birth data must remain local'
        assert '辛' in page.locator('#result-pillars').inner_text()
        assert '壬' in page.locator('#result-pillars').inner_text()
        assert '<img' in page.locator('#result-title').inner_text()
        assert page.locator('#result-title img').count() == 0
        assert '확정된 8글자' in page.locator('#element-note').inner_text()
        assert page.locator('[data-reading="일과 재물"]').get_attribute('aria-pressed') == 'true'
        first = page.locator('#reading-body').inner_text()
        page.locator('[data-reading="연애와 인연"]').click()
        assert page.locator('#reading-body').inner_text() != first
        page.locator('#copy-result').click()
        expect(page.locator('#copy-status')).to_have_text('결과를 복사했습니다.')
        assert '辛巳(신사)' in page.evaluate('navigator.clipboard.readText()')
        page.keyboard.press('Escape')
        assert not page.locator('#result').is_visible()
        page.locator('#birth').fill('2023-02-29')
        page.get_by_role('button', name='나의 사주 풀이 보기').click()
        assert not page.locator('#result').is_visible()
        assert '존재하지 않는 양력' in page.locator('#form-error').inner_text()
        page.locator('#birth').fill('2017-05-01')
        page.locator('#calendar').select_option('leap')
        page.locator('#unknown-time').check()
        page.get_by_role('button', name='나의 사주 풀이 보기').click()
        assert '2017-06-24' in page.locator('#result-text').inner_text()
        assert '시간 미상' in page.locator('#result-pillars').inner_text()
        assert '확정된 6글자' in page.locator('#element-note').inner_text()
        page.get_by_role('button', name='다시 입력하기').click()
        page.locator('#birth').fill('2024-01-01')
        page.get_by_role('button', name='나의 사주 풀이 보기').click()
        assert '존재하지 않는 음력' in page.locator('#form-error').inner_text()
        page.locator('#birth').fill('2024-02-04')
        page.locator('#calendar').select_option('solar')
        page.get_by_role('button', name='나의 사주 풀이 보기').click()
        assert '경계일' in page.locator('#result-warning').inner_text()
        assert '확정된 2글자' in page.locator('#element-note').inner_text()
        page.get_by_role('button', name='닫기',exact=True).click()
        page.locator('#name').fill('사주문')
        page.locator('#birth').fill('2005-12-23')
        page.locator('#unknown-time').uncheck()
        page.locator('#time').fill('08:37')
        page.set_viewport_size({'width':375,'height':812})
        page.get_by_role('button', name='나의 사주 풀이 보기').click()
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        assert page.locator('#result').evaluate('(d)=>d.scrollWidth<=d.clientWidth')
        if zone == 'Asia/Seoul':
            page.screenshot(path='/tmp/saju-calculator-mobile.png',full_page=True)
        page.get_by_role('button', name='다시 입력하기').click()
        page.set_viewport_size({'width':1440,'height':1000})
        page.get_by_role('button', name='나의 사주 풀이 보기').click()
        if zone == 'Asia/Seoul':
            page.screenshot(path='/tmp/saju-calculator-desktop.png',full_page=True)
        assert not errors, errors
        assert all(method == 'GET' for method,_ in requests)
        assert all(u.startswith(url) for _,u in requests)
        context.close()
        print(f'PASS {zone}: solar/leap lunar, validation, pillars, unknown time, boundary, topics, clipboard, XSS escaping, mobile overflow, local-only requests, no JS errors')
    browser.close()
