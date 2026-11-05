"""
Live test sequences made from a REAL range-camera frame.

The still frame is animated like a CCTV stream (sub-pixel sway, light drift,
sensor noise, JPEG) and new holes (small dark dots like the real one) appear at
known frames. The hole already in the picture must never be counted.

python3 real_seq.py SRC.png OUT_DIR SEED [--shots N] [--frames N] [--sway PX] [--none]
                   [--dh HOLE_PX] [--old "x,y;x,y"]   (holes already in the picture)
"""
import json, math, os, sys
import numpy as np
import cv2


def arg(name, default, cast=float):
    a = sys.argv
    return cast(a[a.index(name) + 1]) if name in a else default


src, out, seed = sys.argv[1], sys.argv[2], int(sys.argv[3])
nshots = 0 if '--none' in sys.argv else arg('--shots', 5, int)
nframes = arg('--frames', 60, int)
sway = arg('--sway', 0.6)
dh = arg('--dh', 2.2)
old_holes = [tuple(map(float, p.split(','))) for p in (sys.argv[sys.argv.index('--old') + 1].split(';') if '--old' in sys.argv else ['202,195'])]
rng = np.random.default_rng(seed)
os.makedirs(out, exist_ok=True)
base = cv2.cvtColor(cv2.imread(src), cv2.COLOR_BGR2RGB).astype(np.float32)
H, W = base.shape[:2]
# work at 2x so a hole can be drawn with sub-pixel shape, then shrink each frame
S = 2
big = cv2.resize(base, (W * S, H * S), interpolation=cv2.INTER_CUBIC)
# where holes can go: inside the green face (from the colour), away from the existing hole
g = big[:, :, 1] - np.maximum(big[:, :, 0], big[:, :, 2])
face = (g > 12).astype(np.uint8)
face = cv2.erode(face, np.ones((9, 9), np.uint8))
ys, xs = np.nonzero(face)
shots = []
while len(shots) < nshots:
    k = rng.integers(0, len(xs))
    x, y = xs[k] / S, ys[k] / S
    if any(math.hypot(x - ox, y - oy) < 4 * dh for ox, oy in old_holes) or any(math.hypot(x - s['px'][0], y - s['px'][1]) < 3 * dh for s in shots):
        continue
    shots.append({'px': [float(x), float(y)]})
first = 26
gap = max(4, (nframes - first - 8) // max(1, nshots))
for i, s in enumerate(shots):
    s['frame'] = first + i * gap + int(rng.integers(0, 3))
light = 1.0
for f in range(nframes):
    for s in shots:
        if s['frame'] == f:
            x, y = s['px']
            r = rng.uniform(0.4, 0.6) * dh * S  # hole about as wide as the real ones
            col = rng.uniform(5, 30)
            cv2.circle(big, (int(x * S * 16), int(y * S * 16)), int(r * 16), (col, col, col * 0.9), -1, cv2.LINE_AA, 4)
    t = f * 0.4
    dx = sway * (math.sin(t * 1.3) + 0.35 * rng.normal())
    dy = sway * 0.7 * (math.sin(t * 0.8 + 1) + 0.35 * rng.normal())
    M = np.float32([[1, 0, dx * S], [0, 1, dy * S]])
    fr = cv2.warpAffine(big, M, (W * S, H * S), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
    fr = cv2.resize(fr, (W, H), interpolation=cv2.INTER_AREA)
    light *= math.exp(rng.normal(0, 0.005))
    fr = fr * light + rng.normal(0, 2.0, fr.shape)
    fr = np.clip(fr, 0, 255).astype(np.uint8)
    ok, buf = cv2.imencode('.jpg', cv2.cvtColor(fr, cv2.COLOR_RGB2BGR), [cv2.IMWRITE_JPEG_QUALITY, 70])
    fr = cv2.cvtColor(cv2.imdecode(buf, cv2.IMREAD_COLOR), cv2.COLOR_BGR2RGB)
    fr.tofile(os.path.join(out, f'f{f:03d}.rgb'))
# target-inch positions are not known for a real picture: livesim matches by pixel position
meta = dict(w=W, h=H, frames=nframes, kind='real-range', dh=dh, shots=[dict(frame=s['frame'], x=None, y=None, px=s['px']) for s in shots], old=[list(o) for o in old_holes], events={}, real=True)
json.dump(meta, open(os.path.join(out, 'meta.json'), 'w'))
print(out, 'shots', [(s['frame'], [round(v) for v in s['px']]) for s in shots])
