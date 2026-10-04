import asyncio, os, re, subprocess, sys, time
from playwright.async_api import async_playwright
procs = []
def start(name, cmd, cwd=None):
    f = open(f'/tmp/cctv/{name}.log', 'w')
    p = subprocess.Popen(cmd, stdout=f, stderr=subprocess.STDOUT, cwd=cwd); procs.append(p); return p
def make_long():
    d = open('/tmp/e2e/live.mjpeg', 'rb').read()
    starts = [m.start() for m in re.finditer(b'\xff\xd8\xff', d)]
    first = d[starts[0]:starts[1]]
    open('/tmp/cctv/live_long.mjpeg', 'wb').write(first * 700 + d)   # 10 s clean + the 40 s session
async def main():
    make_long()
    start('static', ['python3', '-m', 'http.server', '4173', '--directory', '/home/claude/rfa/out'])
    app = start('mtx_app', ['/tmp/mtx/linux/mediamtx', '/home/claude/rfa/mediamtx/mediamtx.yml'], cwd='/tmp/mtx/linux')
    cam = start('mtx_cam', ['/tmp/mtx/linux/mediamtx', '/tmp/cctv/cam.yml'], cwd='/tmp/cctv')
    time.sleep(2.5)
    for n, p in (('app MediaMTX (project config)', app), ('camera MediaMTX', cam)):
        print(n, 'running' if p.poll() is None else 'EXITED'); 
        if p.poll() is not None: print(open('/tmp/cctv/' + ('mtx_app' if p is app else 'mtx_cam') + '.log').read()[-600:]); return
    ff = start('ffmpeg', ['ffmpeg', '-loglevel', 'error', '-re', '-f', 'mjpeg', '-framerate', '10', '-i', '/tmp/cctv/live_long.mjpeg',
        '-c:v', 'libvpx-vp9', '-deadline', 'realtime', '-cpu-used', '8', '-g', '10', '-pix_fmt', 'yuv420p', '-b:v', '2M',
        '-strict', 'experimental', '-f', 'rtsp', '-rtsp_transport', 'tcp', 'rtsp://127.0.0.1:8555/Streaming/Channels/102'])
    t0 = time.time()
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/opt/google/chrome/chrome', args=['--no-sandbox'])
        page = await b.new_page(viewport={'width': 1920, 'height': 1080}, color_scheme='dark')
        errs = []; page.on('pageerror', lambda e: errs.append(str(e)))
        print('VP9 playable:', await page.evaluate("() => document.createElement('video').canPlayType('video/webm; codecs=\"vp9\"')"))
        print('H.264 playable:', await page.evaluate("() => document.createElement('video').canPlayType('video/mp4; codecs=\"avc1.42E01E\"')"))
        await page.goto('http://localhost:4173/settings/'); await page.wait_for_timeout(2500)
        print('settings banner:', 'MediaMTX running' in await page.inner_text('body'))
        await page.get_by_role('button', name='Add camera').click()
        dlg = page.locator('dialog[open]')
        await dlg.get_by_label('Name', exact=True).fill('Bay 1'); await dlg.get_by_label('IP address').fill('127.0.0.1')
        await dlg.get_by_label('RTSP port').fill('8555'); await dlg.get_by_label('Password', exact=True).fill('Pa$$:w0rd@1')
        await dlg.get_by_role('radio', name='Sub stream').click()
        print('rtsp preview:', await dlg.locator('p.font-mono').inner_text())
        await dlg.get_by_role('button', name='Save and connect').click()
        await page.wait_for_selector('text=Camera connected', timeout=15000)
        await page.wait_for_timeout(7000)
        print('camera row:', (await page.locator('li:has-text("Bay 1")').first.inner_text()).replace('\n', ' | '))
        await page.screenshot(path='/tmp/cctv/settings_on.png')
        await page.goto('http://localhost:4173/'); await page.wait_for_timeout(500)
        await page.get_by_role('radio', name='CCTV').click(); await page.wait_for_timeout(1500)
        await page.get_by_role('button', name='Start live').click()
        print('started live at %.0fs of the video' % (time.time() - t0))
        last = ''
        while time.time() - t0 < 150:
            await page.wait_for_timeout(3000)
            st = await page.locator('span[role=status]').all_inner_texts()
            s = st[0] if st else ''
            if s != last: print('%5.1fs  %s' % (time.time() - t0, s)); last = s
            if await page.locator('.toast-in:has-text("Frame captured")').count(): print('AUTO-CAPTURED'); break
            if await page.locator('.toast-in:has-text("Live view stopped")').count():
                print('STOPPED:', await page.locator('.toast-in:has-text("Live view stopped")').inner_text()); break
        await page.wait_for_timeout(1000)
        if await page.locator('section[aria-live=polite]').count(): print('RESULT:', (await page.locator('section[aria-live=polite]').inner_text()).replace('\n', ' | ')[:170])
        await page.screenshot(path='/tmp/cctv/live_result.png')
        print('page errors:', errs[:3]); await b.close()
try:
    asyncio.run(main())
finally:
    for pr in procs: pr.terminate()
    print('--- app MediaMTX log (tail) ---'); print(''.join(open('/tmp/cctv/mtx_app.log').readlines()[-6:])[:900])
