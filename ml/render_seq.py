"""
Synthetic live-camera sequences for testing (and training) live hole counting.

A scene is rendered once (target, board, camera pose); every frame then gets:
  camera shake + target sway (small random perspective change), light drift,
  sensor noise, CCTV sharpening, JPEG; plus optional disturbances: a passing
  shadow, an insect sitting on the target for a few frames, a camera bump.
Shots appear at known frames.

python3 render_seq.py OUT_DIR SEED [--frames 70] [--shots 5] [--quiet] [--dh 2.5]
Writes OUT_DIR/f000.rgb ... and meta.json with the shot times and positions.
"""
import json, math, os, sys
import numpy as np
import cv2
sys.path.insert(0, os.path.dirname(__file__))
import render as R


def arg(name, default, cast=float):
    a = sys.argv
    return cast(a[a.index(name) + 1]) if name in a else default


def main():
    out = sys.argv[1]
    seed = int(sys.argv[2])
    nframes = arg('--frames', 70, int)
    nshots = arg('--shots', 5, int)
    quiet = '--quiet' in sys.argv  # no disturbances
    rng = np.random.default_rng(seed)
    os.makedirs(out, exist_ok=True)
    kind = rng.choice(['cloth', 'paper', 'white'], p=[0.7, 0.15, 0.15])
    d = R.Design(rng, kind)
    dh = arg('--dh', R.lognormal(rng, 1.8, 7))
    R_px = 16 / R.CAL_IN * dh
    P = float(min(48, max(10, 3 * R_px / 16)))
    shots = R.sample_holes(rng, d, nshots)[:nshots]
    old = R.sample_holes(rng, d, rng.integers(0, 6))  # holes already there before the session
    distract = R.sample_distractors(rng, d)
    tex = R.draw_texture(rng, d, P, old, distract)
    S = tex.shape[0]
    W = int(min(1280, max(480, R_px * rng.uniform(2.8, 4.0))))
    H = int(min(800, max(360, W * rng.uniform(0.56, 0.8))))
    Hm = R.camera_homography(rng, P, S, R_px, W, H)
    J = np.linalg.svd(Hm[:2, :2])[1]
    shrink = float(np.clip(1.0 / max(J[0], 1e-3) * 0.8, 0.05, 1))
    bg_rng = np.random.default_rng(seed + 1)
    scene = R.background(bg_rng, W, H)
    R.draw_posts(bg_rng, scene, Hm, S, P)
    first_shot = 28
    gap = max(4, (nframes - first_shot - 8) // max(1, nshots))
    shot_frames = [first_shot + i * gap + int(rng.integers(0, 3)) for i in range(len(shots))]
    # disturbances (not in quiet mode)
    events = {}
    if not quiet:
        if rng.random() < 0.6:  # passing shadow during the idle phase or between shots
            f0 = int(rng.integers(14, nframes - 10))
            events['shadow'] = (f0, f0 + int(rng.integers(3, 8)))
        if rng.random() < 0.5:  # insect sits on the target
            f0 = int(rng.integers(14, nframes - 10))
            events['insect'] = (f0, f0 + int(rng.integers(2, 7)), rng.uniform(-14, 14, 2))
        if rng.random() < 0.3:  # camera bump: one frame jumps
            events['bump'] = int(rng.integers(16, nframes - 5))
    sway_amp = rng.uniform(0.2, 1.5)  # px
    light = 1.0
    meta = dict(w=W, h=H, frames=nframes, kind=kind, dh=dh, shots=[], old=[[h[0], h[1]] for h in old], events={k: (list(v) if isinstance(v, tuple) else v) for k, v in events.items()})
    for f in range(nframes):
        for k, fs in enumerate(shot_frames):
            if f == fs:
                x, y, r, hk = shots[k]
                R.draw_hole(rng, tex, S / 2 + x * P, S / 2 - y * P, r * P, hk, d)
                meta['shots'].append(dict(frame=f, x=x, y=y, kind=hk))
        tex_s = cv2.resize(tex, (int(S * shrink), int(S * shrink)), interpolation=cv2.INTER_AREA) if shrink < 0.95 else tex
        Ssc = np.diag([S / tex_s.shape[1], S / tex_s.shape[0], 1.0])
        # sway: small perspective jitter of the board corners
        jit = np.eye(3)
        t = f * 0.35
        jit[0, 2] = sway_amp * (math.sin(t * 1.3) + 0.4 * rng.normal())
        jit[1, 2] = sway_amp * 0.6 * (math.sin(t * 0.9 + 1) + 0.4 * rng.normal())
        ang = 0.002 * sway_amp * math.sin(t * 0.7)
        jit[:2, :2] = [[math.cos(ang), -math.sin(ang)], [math.sin(ang), math.cos(ang)]]
        if events.get('bump') == f:
            jit[0, 2] += rng.uniform(8, 20)
            jit[1, 2] += rng.uniform(-10, 10)
        C = np.array([[1, 0, -W / 2], [0, 1, -H / 2], [0, 0, 1]])
        Hf = np.linalg.inv(C) @ jit @ C @ Hm @ Ssc
        frm_rng = np.random.default_rng(seed * 1000 + f)
        warped = cv2.warpPerspective(tex_s, Hf, (W, H), flags=cv2.INTER_LINEAR)
        mask = cv2.warpPerspective(np.ones(tex_s.shape[:2], np.float32), Hf, (W, H))
        img = scene * (1 - mask[..., None]) + warped * mask[..., None]
        light *= math.exp(frm_rng.normal(0, 0.006))
        img = img * light
        if 'shadow' in events and events['shadow'][0] <= f < events['shadow'][1]:
            k0 = (f - events['shadow'][0]) / max(1, events['shadow'][1] - events['shadow'][0])
            cx, cy = W * (0.2 + 0.6 * k0), H * 0.45
            yy, xx = np.mgrid[:H, :W]
            sh = 1 - 0.35 * np.exp(-(((xx - cx) / (0.25 * W)) ** 2 + ((yy - cy) / (0.3 * H)) ** 2))
            img = img * sh[..., None]
        if 'insect' in events and events['insect'][0] <= f < events['insect'][1]:
            ix, iy = events['insect'][2]
            p = Hm @ np.array([S / 2 + ix * P, S / 2 - iy * P, 1.0])
            p = p[:2] / p[2]
            cv2.ellipse(img, (int(p[0]), int(p[1])), (max(1, int(dh * 0.9)), max(1, int(dh * 0.5))), 30, 0, 360, (20, 18, 15), -1, cv2.LINE_AA)
        img = cam(frm_rng, img)
        img.tofile(os.path.join(out, f'f{f:03d}.rgb'))
    # truth in image px at the resting pose
    def to_img(x, y):
        p = Hm @ np.array([S / 2 + x * P, S / 2 - y * P, 1.0])
        return [float(p[0] / p[2]), float(p[1] / p[2])]
    for s in meta['shots']:
        s['px'] = to_img(s['x'], s['y'])
    ring = np.float32([to_img(16 * math.cos(a), 16 * math.sin(a)) for a in np.linspace(0, 2 * math.pi, 90, endpoint=False)])
    (ex, ey), (ea, eb), eang = cv2.fitEllipse(ring)
    meta['ring'] = [ex, ey, ea / 2, eb / 2, eang]
    json.dump(meta, open(os.path.join(out, 'meta.json'), 'w'), default=lambda o: o.tolist() if hasattr(o, 'tolist') else str(o))
    print(out, kind, f'dh={dh:.1f}px', f'{W}x{H}', 'shots at', shot_frames, 'events', list(events))


_cam = {}
def cam(rng, img):
    """Per-frame camera noise with fixed optics (same blur/sharpening every frame)."""
    img = np.clip(img, 0, 255).astype(np.float32)
    if 'blur' not in _cam:
        g = np.random.default_rng(12345 + int(img.shape[1]))
        _cam.update(blur=g.uniform(0.4, 1.0), sharp=g.uniform(0, 1.0), noise=g.uniform(1, 4), q=int(g.uniform(45, 85)))
    img = cv2.GaussianBlur(img, (0, 0), _cam['blur'])
    if _cam['sharp'] > 0.1:
        bl = cv2.GaussianBlur(img, (0, 0), 1.2)
        img = img + _cam['sharp'] * (img - bl)
    img += rng.normal(0, _cam['noise'], img.shape).astype(np.float32)
    img = np.clip(img, 0, 255).astype(np.uint8)
    ok, buf = cv2.imencode('.jpg', cv2.cvtColor(img, cv2.COLOR_RGB2BGR), [cv2.IMWRITE_JPEG_QUALITY, _cam['q']])
    return cv2.cvtColor(cv2.imdecode(buf, cv2.IMREAD_COLOR), cv2.COLOR_BGR2RGB)


if __name__ == '__main__':
    main()
