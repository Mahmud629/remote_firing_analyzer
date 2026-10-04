import numpy as np, cv2, sys
sys.argv=['x']; exec(open('make_target.py').read().split('# still photo')[0])
import os
os.makedirs('/tmp/e2e/frames', exist_ok=True)
rng=np.random.default_rng(4)
for n in range(6):
    base=render(1280,720,20,HOLES[:n],seed=5)
    for v in range(2):
        y=np.clip(base.astype(np.float32)+rng.normal(0,2.5,base.shape),0,255).astype(np.uint8)
        cv2.imwrite(f'/tmp/e2e/frames/f{n}_{v}.jpg', cv2.merge([y,y,y]), [cv2.IMWRITE_JPEG_QUALITY,82])
print('ok')
