"""Live mode in a real browser on a rendered or real-picture sequence.
python3 tests/e2e/e2e_seq.py SEQ_DIR [fps]   (app served at http://localhost:4173)
Prints the status line over time: no hits may appear before the first shot is fired,
and every fired shot should be counted."""
import asyncio, json, os, shutil, sys, time
import numpy as np, cv2
from playwright.async_api import async_playwright
SEQ = sys.argv[1]; FPS = float(sys.argv[2]) if len(sys.argv) > 2 else 3
OUT = os.path.join(os.path.dirname(__file__), '../../out/e2e/seq')
shutil.rmtree(OUT, ignore_errors=True); os.makedirs(OUT)
meta = json.load(open(os.path.join(SEQ, 'meta.json')))
for f in range(meta['frames']):
    im = np.fromfile(os.path.join(SEQ, f'f{f:03d}.rgb'), np.uint8).reshape(meta['h'], meta['w'], 3)
    cv2.imwrite(os.path.join(OUT, f'f{f:03d}.jpg'), cv2.cvtColor(im, cv2.COLOR_RGB2BGR), [cv2.IMWRITE_JPEG_QUALITY, 95])
json.dump({'w': meta['w'], 'h': meta['h'], 'n': meta['frames'], 'fps': FPS, 'shots': [s['frame'] for s in meta['shots']]}, open(os.path.join(OUT, 'manifest.json'), 'w'))
BASE = 'http://localhost:4173'

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/opt/pw-browsers/chromium')
        page = await b.new_page(viewport={'width': 1680, 'height': 1000})
        logs = []
        page.on('console', lambda m: logs.append(f'{m.type}: {m.text}'))
        page.on('pageerror', lambda e: logs.append(f'PAGEERROR: {e}'))
        await page.add_init_script(path=os.path.join(os.path.dirname(__file__), 'fakeseq.js'))
        await page.goto(BASE + '/')
        await page.get_by_role('radio', name='Camera').click()
        await page.wait_for_timeout(400)
        await page.get_by_role('button', name='Start live').click()
        t0 = time.time(); early = 0; last = ''
        dur = meta['frames'] / FPS + 25
        while time.time() - t0 < dur:
            await page.wait_for_timeout(700)
            st = await page.locator('span[role=status]').all_inner_texts()
            seq = await page.evaluate('window.__seq')
            s = st[0] if st else ''
            counted = int(s.split('/')[0].split()[-1]) if '/' in s and 'hits' in s or 'capturing' in s else None
            if counted is not None and seq and counted > seq['fired']:
                early += 1
            line = f"{time.time()-t0:5.1f}s frame {seq['frame'] if seq else '-'} fired {seq['fired'] if seq else '-'} | {s}"
            if line.split('|')[1] != last:
                print(line); last = line.split('|')[1]
            if await page.locator('text=Group 1').count() and await page.locator('section[aria-live=polite]').count() and 'Waiting' not in s and not st:
                break
            if not st and time.time() - t0 > 10:
                print('review mode reached (auto capture)')
                break
        await page.wait_for_timeout(1000)
        await page.screenshot(path='/tmp/e2e_seq_review.png')
        res = await page.locator('section[aria-live=polite]').first.inner_text()
        print('RESULT PANEL:', ' | '.join(x for x in res.split('\n') if x.strip())[:300])
        print('counted more than fired at any time:', early)
        errs = [l for l in logs if 'rror' in l]
        print('console errors:', errs[:5])
        await b.close()
asyncio.run(main())
