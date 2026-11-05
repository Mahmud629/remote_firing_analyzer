"""Photo mode in a real browser: upload pictures, report marks and time.
python3 tests/e2e/e2e_photo.py IMG [IMG...]   (app served at http://localhost:4173)"""
import asyncio, re, sys, time
from playwright.async_api import async_playwright
BASE = 'http://localhost:4173'

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/opt/pw-browsers/chromium')
        page = await b.new_page(viewport={'width': 1680, 'height': 1000})
        errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        await page.goto(BASE + '/')
        for k, img in enumerate(sys.argv[1:]):
            t0 = time.time()
            async with page.expect_file_chooser() as fc:
                await page.get_by_role('button', name=re.compile('Choose (a )?photo', re.I)).first.click()
            await (await fc.value).set_files(img)
            await page.wait_for_function("() => !document.body.innerText.includes('Analysing')", timeout=60000)
            await page.wait_for_timeout(1500)
            bullets = await page.locator('text=/^Bullet \\d+$/').count()
            res = await page.locator('section[aria-live=polite]').first.inner_text()
            print(f'{img.split("/")[-1]}: {bullets} marks, {time.time()-t0:.1f}s |', ' | '.join(x for x in res.split('\n') if x.strip())[:160])
            await page.screenshot(path=f'/tmp/e2e_photo_{k}.png')
        print('page errors:', errs[:3])
        await b.close()
asyncio.run(main())
