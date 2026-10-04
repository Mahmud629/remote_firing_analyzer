import asyncio, time
from playwright.async_api import async_playwright
BASE='http://localhost:4173'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        page = await b.new_page(viewport={'width':1920,'height':1080})
        logs=[]
        page.on('console', lambda m: logs.append(f'{m.type}: {m.text}'))
        page.on('pageerror', lambda e: logs.append(f'PAGEERROR: {e}'))
        await page.add_init_script(path='/tmp/e2e/fakecam.js')
        await page.goto(BASE + '/')
        await page.get_by_role('radio', name='Camera').click()
        await page.wait_for_timeout(500)
        await page.get_by_role('button', name='Start live').click()
        t0=time.time(); shot=0; last=None
        while time.time()-t0 < 110:
            await page.wait_for_timeout(2000)
            status = await page.locator('span[role=status]').all_inner_texts()
            holes = await page.evaluate('window.__fakecamHoles')
            line = f'{time.time()-t0:5.1f}s holes_on_target={holes} {status[:1]}'
            print(line)
            if status and 'hits' in status[0] and shot < 3 and holes and holes >= 2*shot+1:
                await page.screenshot(path=f'live-{shot}.png'); shot += 1
            if await page.locator('text=Frame captured').count():
                print('AUTO-CAPTURED after %.1fs' % (time.time()-t0)); break
        await page.wait_for_timeout(800)
        print(await page.locator('section[aria-live=polite]').inner_text())
        await page.screenshot(path='live-review.png')
        print('\n'.join(l for l in logs if 'rror' in l)[:2000])
        await b.close()
asyncio.run(main())
