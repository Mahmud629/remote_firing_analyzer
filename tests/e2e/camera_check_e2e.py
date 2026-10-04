import asyncio, subprocess, time
from playwright.async_api import async_playwright
procs=[]
def start(name, cmd, cwd=None):
    p=subprocess.Popen(cmd, stdout=open(f'/tmp/cctv/{name}.log','w'), stderr=subprocess.STDOUT, cwd=cwd); procs.append(p); return p
IN='-re -f lavfi -i testsrc2=size=1280x720:rate=5'
STREAMS={
 'c264':  '-c:v libx264 -preset ultrafast -tune zerolatency -g 10 -pix_fmt yuv420p',
 'c265':  '-c:v libx265 -preset ultrafast -x265-params keyint=10:log-level=none -pix_fmt yuv420p',
 'cmjpeg':'-c:v mjpeg -q:v 6 -pix_fmt yuvj420p',
 'cvp9':  '-c:v libvpx-vp9 -deadline realtime -cpu-used 8 -g 10 -pix_fmt yuv420p -strict experimental',
}
async def main():
    start('static',['python3','-m','http.server','4173','--directory','/home/claude/rfa/out'])
    app=start('mtx_app',['/tmp/mtx/linux/mediamtx','/tmp/cctv/app.yml'],cwd='/tmp/mtx/linux')
    start('mtx_cam',['/tmp/mtx/linux/mediamtx','/tmp/cctv/cam.yml'],cwd='/tmp/cctv'); time.sleep(2.5)
    print('project config accepted by MediaMTX:', app.poll() is None)
    for n,a in STREAMS.items():
        start('ff_'+n,['ffmpeg','-loglevel','error']+IN.split()+a.split()+['-f','rtsp','-rtsp_transport','tcp',f'rtsp://127.0.0.1:8555/{n}'])
    time.sleep(3)
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/opt/google/chrome/chrome',args=['--no-sandbox'])
        page=await b.new_page(viewport={'width':1600,'height':1000},color_scheme='dark')
        await page.goto('http://localhost:4173/settings/'); await page.wait_for_timeout(2000)
        for n in STREAMS:
            await page.get_by_role('button',name='Add camera').click()
            dlg=page.locator('dialog[open]')
            await dlg.get_by_label('Name',exact=True).fill(n)
            await dlg.get_by_label('Brand').select_option('custom')
            await dlg.get_by_label('IP address').fill('127.0.0.1'); await dlg.get_by_label('RTSP port').fill('8555')
            await dlg.get_by_role('textbox', name='RTSP path').fill('/'+n)
            await dlg.get_by_role('button',name='Save and connect').click()
            await page.wait_for_selector('text=Camera connected',timeout=15000)
            await page.wait_for_function("() => !document.querySelector('dialog[open]')")
            await page.get_by_role('button',name=f'Test {n}').click()
            await page.wait_for_function("() => { const d=document.querySelector('dialog[open]'); return d && /cannot be shown yet|ready to use/.test(d.innerText) }",timeout=80000)
            txt=(await page.locator('dialog[open]').inner_text()).replace('\n\n','\n')
            print('\n=== '+n+' ===\n'+'\n'.join(l for l in txt.split('\n') if l.strip() and not l.startswith(('Close','Test again','Copy report','Test '))) [:900])
            if n=='c265': await page.locator('dialog[open]').screenshot(path='/tmp/cctv/diag_h265.png')
            await page.locator('dialog[open]').get_by_role('button',name='Close',exact=True).last.click()
            await page.wait_for_function("() => !document.querySelector('dialog[open]')")
        await b.close()
try: asyncio.run(main())
finally:
    for pr in procs: pr.terminate()
