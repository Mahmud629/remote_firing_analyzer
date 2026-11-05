"""
Training pictures made from REAL target pictures (your own targets and cameras).

For every real picture with known holes:
  * the real holes are cut out as "stamps" (the hole minus the target around it,
    with a soft edge),
  * stamps from the real pictures are blended into OTHER places of a real target
    (green face, next to creases, folds and printed lines), scaled to that picture's
    hole size,
  * the whole picture is then rotated, scaled (hole 1.8..10 px), squashed like a
    camera looking up, and passed through CCTV effects (blur, sharpening, noise, JPEG).
Every candidate that is not on a real or pasted hole becomes a "not a hole" example,
so the network learns the exact creases, folds and print of the targets you use.

python3 real_paste.py SPEC.json OUT_DIR N_PER_PICTURE [seed]
SPEC.json: [{"rgb": path, "w": W, "h": H, "holes": [[x, y], ...], "R": ring radius px,
             "stamp": true/false (use its holes as stamps), "bg": true/false}]
"""
import json, math, os, sys
import numpy as np
import cv2
sys.path.insert(0, os.path.dirname(__file__))
from render import camera_effects, background, lognormal

spec_path, out, n_per = sys.argv[1], sys.argv[2], int(sys.argv[3])
seed = int(sys.argv[4]) if len(sys.argv) > 4 else 0
spec = json.load(open(spec_path))
os.makedirs(out, exist_ok=True)
rng = np.random.default_rng(seed)

pics = []
for s in spec:
    img = np.fromfile(s['rgb'], np.uint8).reshape(s['h'], s['w'], 3).astype(np.float32)
    dh = 0.3 / 16 * s['R']  # hole diameter in px
    pics.append(dict(s, img=img, dh=dh))


def make_stamps(p):
    """(delta, alpha) arrays around each real hole, normalised to unit hole size later."""
    img, dh = p['img'], p['dh']
    stamps = []
    for (x, y) in p['holes']:
        r = int(math.ceil(2.2 * dh)) + 2
        x0, y0 = int(round(x)) - r, int(round(y)) - r
        if x0 < 0 or y0 < 0 or x0 + 2 * r + 1 > img.shape[1] or y0 + 2 * r + 1 > img.shape[0]:
            continue
        patch = img[y0:y0 + 2 * r + 1, x0:x0 + 2 * r + 1].copy()
        # background estimate: inpaint the hole disk
        m = np.zeros(patch.shape[:2], np.uint8)
        cv2.circle(m, (r, r), max(1, int(round(0.95 * dh))), 255, -1)
        bg = cv2.inpaint(np.clip(patch, 0, 255).astype(np.uint8), m, 3, cv2.INPAINT_TELEA).astype(np.float32)
        delta = patch - bg
        yy, xx = np.mgrid[:2 * r + 1, :2 * r + 1]
        d = np.hypot(xx - r, yy - r)
        alpha = np.clip((1.25 * dh - d) / max(0.6, 0.35 * dh), 0, 1)[..., None]
        stamps.append((delta, alpha, dh))
    return stamps


stamps = [st for p in pics if p.get('stamp', True) for st in make_stamps(p)]
print('stamps', len(stamps))


def face_mask(img):
    g = img[:, :, 1] - np.maximum(img[:, :, 0], img[:, :, 2])
    m = (g > 10).astype(np.uint8)
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    return m


items = []
for pi, p in enumerate(pics):
    if not p.get('bg', True):
        continue
    for k in range(n_per):
        img = p['img'].copy()
        dh = p['dh']
        holes = [list(h) for h in p['holes']]
        # ---- paste real hole stamps into the green face
        fm = face_mask(img)
        er = max(3, int(1.5 * dh))
        fm = cv2.erode(fm, np.ones((er, er), np.uint8))
        ys, xs = np.nonzero(fm)
        npaste = int(rng.integers(2, 9)) if len(xs) else 0
        for _ in range(npaste * 4):
            if npaste == 0:
                break
            j = rng.integers(0, len(xs))
            x, y = float(xs[j]), float(ys[j])
            if any(math.hypot(x - hx, y - hy) < 3 * dh for hx, hy in holes):
                continue
            delta, alpha, sdh = stamps[rng.integers(0, len(stamps))]
            sc = dh / sdh * rng.uniform(0.8, 1.25)
            ksz = (max(3, int(round(delta.shape[1] * sc)) | 1), max(3, int(round(delta.shape[0] * sc)) | 1))
            interp = cv2.INTER_AREA if sc < 1 else cv2.INTER_LINEAR
            dl = cv2.resize(delta, ksz, interpolation=interp)
            al = cv2.resize(alpha, ksz, interpolation=cv2.INTER_LINEAR)
            if al.ndim == 2:
                al = al[..., None]
            if rng.random() < 0.5:
                dl, al = dl[:, ::-1], al[:, ::-1]
            gain = rng.uniform(0.75, 1.15)
            h2, w2 = dl.shape[:2]
            x0, y0 = int(round(x)) - w2 // 2, int(round(y)) - h2 // 2
            if x0 < 0 or y0 < 0 or x0 + w2 > img.shape[1] or y0 + h2 > img.shape[0]:
                continue
            img[y0:y0 + h2, x0:x0 + w2] += dl * al * gain
            holes.append([x, y])
            npaste -= 1
        img = np.clip(img, 0, 255)
        # ---- camera: rotation, scale (hole 1.8..10 px), squash, keystone, then CCTV effects
        target_dh = lognormal(rng, 1.8, 10) if rng.random() < 0.8 else dh * rng.uniform(0.8, 1.1)
        s = target_dh / dh
        H0, W0 = img.shape[:2]
        W = int(min(1600, max(320, W0 * s * rng.uniform(0.9, 1.4))))
        H = int(min(1100, max(240, H0 * s * rng.uniform(0.9, 1.3))))
        ang = math.radians(rng.normal(0, 6))
        sq = rng.uniform(0.85, 1.0)
        src_c = np.float32([[0, 0], [W0, 0], [W0, H0], [0, H0]])
        cx, cy = W0 / 2, H0 / 2
        ox, oy = W / 2 + rng.normal(0, 0.04 * W), H / 2 + rng.normal(0, 0.04 * H)
        dst_c = []
        for (x, y) in src_c:
            u, v = (x - cx) * s, (y - cy) * s
            u, v = u * math.cos(ang) - v * math.sin(ang), u * math.sin(ang) + v * math.cos(ang)
            dst_c.append([ox + u, oy + v * sq])
        dst_c = np.float32(dst_c)
        dst_c += rng.normal(0, 0.012 * W0 * s, dst_c.shape).astype(np.float32)
        M = cv2.getPerspectiveTransform(src_c, dst_c).astype(np.float64)
        small = cv2.resize(img, None, fx=min(1, s * 1.4), fy=min(1, s * 1.4), interpolation=cv2.INTER_AREA) if s < 0.7 else img
        kk = small.shape[1] / W0
        M2 = M @ np.diag([1 / kk, 1 / kk, 1])
        bgimg = background(rng, W, H)
        warped = cv2.warpPerspective(small, M2, (W, H), flags=cv2.INTER_LINEAR)
        mask = cv2.warpPerspective(np.ones(small.shape[:2], np.float32), M2, (W, H))
        comp = bgimg * (1 - mask[..., None]) + warped * mask[..., None]
        comp = camera_effects(rng, comp)
        hp = cv2.perspectiveTransform(np.float32(holes)[None], M)[0] if holes else np.zeros((0, 2))
        keep = [[float(x), float(y)] for x, y in hp if 4 <= x < W - 4 and 4 <= y < H - 4]
        name = f"{os.path.basename(p['rgb']).split('.')[0]}_{seed}_{k:03d}"
        comp.tofile(os.path.join(out, name + '.rgb'))
        items.append(dict(rgb=os.path.join(out, name + '.rgb'), w=W, h=H, holes=keep, tag='realpaste'))
json.dump(items, open(os.path.join(out, 'list.json'), 'w'))
print('wrote', len(items), 'pictures,', sum(len(i['holes']) for i in items), 'holes')
