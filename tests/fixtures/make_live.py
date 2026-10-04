import numpy as np, cv2, os, sys
sys.argv=['x']; exec(open('make_target.py').read().split('# still photo')[0])
W,H,fps=1280,720,10
os.makedirs('seq',exist_ok=True)
rng=np.random.default_rng(9)
frames=[]
cache={}
out=open('live.mjpeg','wb')
for i in range(fps*40):
    t=i/fps
    n=sum(1 for k in range(5) if t>=15+3*k)
    if n not in cache: cache[n]=render(W,H,20,HOLES[:n],seed=5)
    y=np.clip(cache[n].astype(np.float32)+rng.normal(0,2,(H,W)),0,255).astype(np.uint8)
    ok,jpg=cv2.imencode('.jpg',cv2.merge([y,y,y]),[cv2.IMWRITE_JPEG_QUALITY,80]); out.write(jpg.tobytes())
    if i%5==0: open(f'seq/{i//5:03d}.gray','wb').write(y.tobytes())
out.close(); print('ok', os.path.getsize('live.mjpeg')//1e6,'MB')
