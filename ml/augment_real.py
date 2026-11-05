"""Range-camera versions of real close-up photos: shrink so a hole is 1.6..12 px,
rotate, perspective, colour, blur, CCTV sharpening, noise, JPEG.
python3 augment_real.py OUT_DIR N_PER_PHOTO name1 name2 ..."""
import cv2, json, math, os, sys
import numpy as np
sys.path.insert(0, os.path.dirname(__file__))
from render import camera_effects, background, lognormal
out, n_per = sys.argv[1], int(sys.argv[2])
names = sys.argv[3:]
os.makedirs(out, exist_ok=True)
T = json.load(open('/tmp/real/truth.json'))
items = []
for ni, name in enumerate(names):
    t = T[name]
    img = np.fromfile(f'/tmp/real/{name}.rgb', np.uint8).reshape(t['h'], t['w'], 3).astype(np.float32)
    holes = np.float32([h[:2] for h in t['truth']])
    # native hole ~ 0.3 in; ring radius ~ 0.47 * min dim
    R = 0.47 * min(t['w'], t['h'])
    dh_native = 0.3 / 16 * R
    for k in range(n_per):
        rng = np.random.default_rng(1000 * ni + k + 77)
        dh = lognormal(rng, 1.6, 12)
        s = dh / dh_native
        W = int(min(1600, max(300, 2 * R * s * rng.uniform(1.3, 2.4))))
        H = int(W * rng.uniform(0.6, 1.0))
        cx, cy = t['w'] / 2, t['h'] / 2
        ang = math.radians(rng.uniform(-180, 180))
        sq = rng.uniform(0.8, 1.0)  # camera looking up squashes the target vertically
        ox, oy = W / 2 + rng.normal(0, 0.05 * W), H / 2 + rng.normal(0, 0.05 * H)
        src_c = np.float32([[0, 0], [t['w'], 0], [t['w'], t['h']], [0, t['h']]])
        dst_c = []
        for (x, y) in src_c:
            u, v = (x - cx) * s, (y - cy) * s
            u, v = u * math.cos(ang) - v * math.sin(ang), u * math.sin(ang) + v * math.cos(ang)
            v *= sq
            dst_c.append([ox + u, oy + v])
        dst_c = np.float32(dst_c)
        span = (dst_c.max(0) - dst_c.min(0)).mean()
        dst_c += rng.normal(0, 0.025 * span, dst_c.shape).astype(np.float32)  # mild keystone
        M = cv2.getPerspectiveTransform(src_c, dst_c).astype(np.float64)
        small = cv2.resize(img, None, fx=min(1, s * 1.5), fy=min(1, s * 1.5), interpolation=cv2.INTER_AREA)
        k_ = small.shape[1] / t['w']
        M2 = M @ np.diag([1 / k_, 1 / k_, 1])
        bg = background(rng, W, H)
        warped = cv2.warpPerspective(small, M2, (W, H), flags=cv2.INTER_LINEAR)
        mask = cv2.warpPerspective(np.ones(small.shape[:2], np.float32), M2, (W, H))
        comp = bg * (1 - mask[..., None]) + warped * mask[..., None]
        comp = camera_effects(rng, comp)
        hp = cv2.perspectiveTransform(holes[None], M.astype(np.float64))[0]
        keep = [(float(x), float(y)) for x, y in hp if 4 <= x < W - 4 and 4 <= y < H - 4]
        nm = f'{name[:8]}_{k:03d}'
        comp.tofile(os.path.join(out, nm + '.rgb'))
        items.append(dict(rgb=os.path.join(out, nm + '.rgb'), w=W, h=H, holes=[list(p) for p in keep], tag='realaug'))
json.dump(items, open(os.path.join(out, 'list.json'), 'w'))
print('wrote', len(items))
