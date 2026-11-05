"""
HoleNet: small CNN that decides whether a candidate patch is a bullet hole.

Input 3 x 32 x 32 (RGB around the candidate, a hole ~6 px wide), each channel
minus its median, divided by 48 (see normalisePatch in src/vision/candidates.ts).
  conv3x3 3->12, ReLU, maxpool 2   (16 x 16)
  conv3x3 12->24, ReLU, maxpool 2  (8 x 8)
  conv3x3 24->32, ReLU, maxpool 2  (4 x 4)
  dense 512->48, ReLU, dense 48->1 (logit)

python3 train_holenet.py OUT_TS [--steps N] [--final]
  default: trains on synthetic + augmented training photos, reports on held-out
  photos (never seen, incl. the range-camera frame)
  --final: also trains on every real photo (for the shipped model)
"""
import glob, json, math, os, sys, time, base64
import numpy as np
import cv2
import jax, jax.numpy as jnp
import optax

STORE, P = 48, 32
DS = '/tmp/ds'
args = sys.argv[1:]
out_ts = args[0]
steps = int(args[args.index('--steps') + 1]) if '--steps' in args else 7000
final = '--final' in args
rng = np.random.default_rng(0)

TEST_PHOTOS = {'68529162-Picture9', '7c6c6305-Picture8', '9b8df935-Picture4', 'e5045210'}


def load(prefix):
    """Memory-mapped patches (the full set does not fit in RAM) and their info rows."""
    meta = json.load(open(prefix + '.json'))
    info = np.array(meta['info'], np.float32).reshape(-1, 6)
    x = np.memmap(prefix + '.u8', np.uint8, 'r').reshape(-1, 3, STORE, STORE)
    assert len(x) == len(info), prefix
    return x, info


def exists(prefix):
    return os.path.exists(prefix + '.u8') and os.path.exists(prefix + '.json')


def real_split():
    x, info = load(f'{DS}/real')
    tags = [it['tag'] for it in json.load(open(f'{DS}/real_list.json'))]
    is_test = np.array([tags[int(s)] in TEST_PHOTOS for s in info[:, 4]])
    return (np.asarray(x[~is_test]), info[~is_test]), (np.asarray(x[is_test]), info[is_test])


# ---- training groups: (name, [(patches, labels)], weight) -- sampled by weight, so a
# small set of real pictures counts as much as thousands of rendered ones
groups = []
syn = [load(f[:-3]) for f in sorted(glob.glob(f'{DS}/syn_*.u8')) if exists(f[:-3])]
# Holes found as LIGHT spots (backlit holes, sky through the sheet) are dropped: on a target
# mounted on a board a hole shows dark or tan, and a bright dot is a glint or dust (label -1 = unused)
def backlit_on_light(x, info):
    """Positives found as LIGHT spots whose core is not tan and whose surround is light
    (green face / paper): sky seen through the sheet, which looks like a glint. Bright holes
    inside dark print (black disc, ring lines) and tan / torn holes are kept."""
    lab = info[:, 0].copy()
    c = STORE // 2
    yy, xx = np.mgrid[:STORE, :STORE]
    d = np.hypot(xx - c + 0.5, yy - c + 0.5)
    ring = (d > 9) & (d < 18)
    for r in np.nonzero((info[:, 0] > 0.5) & (info[:, 2] == 1))[0]:
        p = x[r].astype(np.float32)
        core = p[:, c - 2:c + 2, c - 2:c + 2].reshape(3, -1).mean(1)
        lum = 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2]
        if lum[ring].mean() > 70 and core[0] - core[2] <= 12:
            lab[r] = -1.0
    return lab


syn_lab = [backlit_on_light(x, i) for x, i in syn]
print('rendered: bright holes on a light surround dropped:', int(sum((l < -0.5).sum() for l in syn_lab)))
groups.append(('rendered scenes', [(x, l) for (x, i), l in zip(syn, syn_lab)], 0.42))
if exists(f'{DS}/realaug_p'):
    x, i = load(f'{DS}/realaug_p')
    groups.append(('range versions of real photos', [(x, i[:, 0])], 0.10))
if exists(f'{DS}/pasteA_p'):
    x, i = load(f'{DS}/pasteA_p')
    groups.append(('your target: pasted real holes', [(x, i[:, 0])], 0.22 if not final else 0.16))
if final and exists(f'{DS}/pasteC_p'):
    x, i = load(f'{DS}/pasteC_p')
    groups.append(('your CCTV frame: pasted real holes', [(x, i[:, 0])], 0.14))
(rtr_x, rtr_i), (rte_x, rte_i) = real_split()
native = [(rtr_x, rtr_i[:, 0])]
if exists(f'{DS}/newclose'):
    x, i = load(f'{DS}/newclose')
    native.append((np.asarray(x), i[:, 0]))
if final:
    native.append((rte_x, rte_i[:, 0]))
    if exists(f'{DS}/newcctv'):
        x, i = load(f'{DS}/newcctv')
        native.append((np.asarray(x), i[:, 0]))
groups.append(('real photos as taken', native, 0.16))
gw = np.array([g[2] for g in groups])
gw /= gw.sum()
# per group: positive / negative (member, row) index lists
gidx = []
for name, members, w in groups:
    pos = [(m, r) for m, (x, y) in enumerate(members) for r in np.nonzero(y > 0.5)[0]]
    neg = [(m, r) for m, (x, y) in enumerate(members) for r in np.nonzero((y < 0.5) & (y > -0.5))[0]]
    gidx.append((np.array(pos, np.int64).reshape(-1, 2), np.array(neg, np.int64).reshape(-1, 2)))
    print(f'group {name}: weight {w}, patches {sum(len(x) for x, _ in members)}, holes {len(pos)}, not holes {len(neg)}')

tests = {'held-out photos': (rte_x, rte_i[:, 0])}
if exists(f'{DS}/range'):
    rx, ri = load(f'{DS}/range')
    tests['range camera frame'] = (np.asarray(rx), ri[:, 0])
if exists(f'{DS}/newcctv'):
    x, i = load(f'{DS}/newcctv')
    tests['YOUR CCTV frame' + (' (trained on)' if final else ' (never seen)')] = (np.asarray(x), i[:, 0])
if exists(f'{DS}/newclose'):
    x, i = load(f'{DS}/newclose')
    tests['your close-up (trained on)'] = (np.asarray(x), i[:, 0])


def sample_batch(B):
    xs, ys, sp = [], [], []
    for k, (pos, neg) in enumerate(gidx):
        n = rng.binomial(B, gw[k]) if k < len(gidx) - 1 else B - len(xs)
        n = max(0, min(n, B - len(xs)))
        npos = int(round(n * 0.25)) if len(pos) else 0
        for arr, cnt, lab in ((pos, npos, 1.0), (neg, n - npos, 0.0)):
            if cnt <= 0 or not len(arr):
                continue
            for m, r in arr[rng.integers(0, len(arr), cnt)]:
                xs.append(groups[k][1][m][0][r])
                ys.append(lab)
                sp.append(lab == 0.0 and rng.random() < 0.15)  # becomes a bright-speck negative
    return np.stack(xs), np.array(ys, np.float32), np.array(sp)


def normalise(p):  # p: (N, 3, 32, 32) float32 0..255
    med = np.median(p.reshape(p.shape[0], 3, -1), axis=2)[:, :, None, None]
    return (p - med) / 48.0


def center(p):
    o = (STORE - P) // 2
    return p[:, :, o:o + P, o:o + P].astype(np.float32)


def add_speck(img):
    """A tiny bright dot (glint, dust, paint fleck) at the centre of a light/green patch."""
    c = (STORE - 1) / 2 + rng.normal(0, 0.7, 2)
    core = img[int(c[1]) - 2:int(c[1]) + 3, int(c[0]) - 2:int(c[0]) + 3].mean()
    if core < 70:  # inside the black disc a light spot can be the backing seen through a hole
        return img
    yy, xx = np.mgrid[:STORE, :STORE]
    r = rng.uniform(0.5, 1.6)
    blob = np.exp(-((xx - c[0]) ** 2 + (yy - c[1]) ** 2) / (2 * r * r))[..., None]
    white = np.array([rng.uniform(200, 255)] * 3) + rng.normal(0, 8, 3)
    k = rng.uniform(0.5, 1.0)
    return img * (1 - k * blob) + white * k * blob


def augment(batch, specks=None):
    out = np.empty((len(batch), 3, P, P), np.float32)
    for i, p in enumerate(batch):
        img = p.transpose(1, 2, 0).astype(np.float32)
        if specks is not None and specks[i]:
            img = add_speck(img)
        ang = rng.uniform(0, 360)
        sc = math.exp(rng.uniform(math.log(0.82), math.log(1.22)))
        M = cv2.getRotationMatrix2D(((STORE - 1) / 2, (STORE - 1) / 2), ang, sc)
        M[:, 2] += rng.normal(0, 0.8, 2)  # candidate position error
        img = cv2.warpAffine(img, M, (STORE, STORE), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
        if rng.random() < 0.5:
            img = img[:, ::-1]
        o = (STORE - P) // 2
        img = img[o:o + P, o:o + P]
        # photometric
        m = np.median(img.reshape(-1, 3), 0)
        img = (img - m) * rng.uniform(0.65, 1.35) * rng.uniform(0.92, 1.08, 3) + m + rng.normal(0, 8, 3)
        if rng.random() < 0.3:
            img = cv2.GaussianBlur(img, (0, 0), rng.uniform(0.4, 0.9))
        img += rng.normal(0, rng.uniform(0, 4), img.shape)
        out[i] = np.clip(img, 0, 255).transpose(2, 0, 1)
    return out


# ---------------- model ----------------
SPEC = [('conv', 3, 12), ('pool',), ('conv', 12, 24), ('pool',), ('conv', 24, 32), ('pool',), ('dense', 512, 48), ('dense', 48, 1)]


def init(key):
    params = []
    for layer in SPEC:
        if layer[0] == 'conv':
            key, k = jax.random.split(key)
            fan = layer[1] * 9
            params.append({'w': jax.random.normal(k, (layer[2], layer[1], 3, 3)) * math.sqrt(2 / fan), 'b': jnp.zeros(layer[2])})
        elif layer[0] == 'dense':
            key, k = jax.random.split(key)
            params.append({'w': jax.random.normal(k, (layer[1], layer[2])) * math.sqrt(2 / layer[1]), 'b': jnp.zeros(layer[2])})
        else:
            params.append({})
    return params


def forward(params, x):
    for layer, p in zip(SPEC, params):
        if layer[0] == 'conv':
            x = jax.lax.conv_general_dilated(x, p['w'], (1, 1), 'SAME', dimension_numbers=('NCHW', 'OIHW', 'NCHW')) + p['b'][None, :, None, None]
            x = jax.nn.relu(x)
        elif layer[0] == 'pool':
            x = jax.lax.reduce_window(x, -jnp.inf, jax.lax.max, (1, 1, 2, 2), (1, 1, 2, 2), 'VALID')
        else:
            if x.ndim > 2:
                x = x.reshape(x.shape[0], -1)
            x = x @ p['w'] + p['b']
            if layer[2] != 1:
                x = jax.nn.relu(x)
    return x[:, 0]


def loss_fn(params, x, y):
    logit = forward(params, x)
    l = optax.sigmoid_binary_cross_entropy(logit, y)
    wd = sum(jnp.sum(p['w'] ** 2) for p in params if 'w' in p)
    return jnp.mean(l) + 1e-5 * wd


sched = optax.warmup_cosine_decay_schedule(0, 2e-3, 300, steps, 2e-5)
opt = optax.adamw(sched, weight_decay=1e-4)
params = init(jax.random.PRNGKey(0))
state = opt.init(params)


@jax.jit
def step(params, state, x, y):
    l, g = jax.value_and_grad(loss_fn)(params, x, y)
    upd, state = opt.update(g, state, params)
    return optax.apply_updates(params, upd), state, l


predict = jax.jit(lambda p, x: jax.nn.sigmoid(forward(p, x)))


def scores(x):
    out = []
    for i in range(0, len(x), 1024):
        out.append(np.asarray(predict(params, jnp.asarray(normalise(center(x[i:i + 1024]))))))
    return np.concatenate(out) if out else np.zeros(0)


def report(tag):
    for name, (x, y) in tests.items():
        s = scores(x)
        pos = s[y > 0.5]
        neg = s[y < 0.5]
        line = f'  {name}: pos {len(pos)} neg {len(neg)}'
        for t in (0.5, 0.75, 0.85, 0.95):
            line += f' | t={t}: found {(pos >= t).sum()}/{len(pos)} false {(neg >= t).sum()}'
        if len(pos):
            line += f' | hole scores {np.round(np.sort(pos), 2).tolist()[:8]} top neg {np.round(np.sort(neg)[-5:], 2).tolist()}'
        print(tag, line)


B = 256
t0 = time.time()
for it in range(1, steps + 1):
    xb, y, sp = sample_batch(B)
    x = normalise(augment(xb, sp))
    params, state, l = step(params, state, jnp.asarray(x), jnp.asarray(y))
    if it % 500 == 0 or it == steps:
        print(f'step {it} loss {float(l):.4f} {time.time() - t0:.0f}s', flush=True)
    if it % 2000 == 0 or it == steps:
        report(f'[{it}]')

# ---------- export for the browser (float32, little endian, base64) ----------
layers = []
for layer, p in zip(SPEC, params):
    if layer[0] == 'pool':
        layers.append({'type': 'pool'})
    elif layer[0] == 'conv':
        layers.append({'type': 'conv', 'cin': layer[1], 'cout': layer[2], 'w': base64.b64encode(np.asarray(p['w'], '<f4').tobytes()).decode(), 'b': base64.b64encode(np.asarray(p['b'], '<f4').tobytes()).decode()})
    else:
        layers.append({'type': 'dense', 'nin': layer[1], 'nout': layer[2], 'relu': layer[2] != 1, 'w': base64.b64encode(np.asarray(p['w'], '<f4').tobytes()).decode(), 'b': base64.b64encode(np.asarray(p['b'], '<f4').tobytes()).decode()})
# parity vectors: a few real patches and their probabilities
px = normalise(center(rte_x[:4]))
probe = {'input': base64.b64encode(px.astype('<f4').tobytes()).decode(), 'prob': np.asarray(predict(params, jnp.asarray(px))).tolist()}
model = {'name': 'holenet', 'input': [3, P, P], 'layers': layers, 'probe': probe, 'trained': time.strftime('%Y-%m-%d'), 'final': final}
with open(out_ts, 'w') as f:
    f.write('// Generated by ml/train_holenet.py. Do not edit.\n')
    f.write('import type { ModelSpec } from "../nn";\n')
    f.write('export const HOLENET: ModelSpec = ' + json.dumps(model) + ';\n')
print('wrote', out_ts)
