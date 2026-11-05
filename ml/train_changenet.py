"""
ChangeNet: small CNN that decides whether a change between the learned target
(before) and the current frame (after) is a NEW bullet hole.

Input 2 x 32 x 32 luma (before, after; a hole ~5 px wide), both minus the median
of `before`, divided by 48 (see src/vision/change_ml.ts). Pairs come from the
live engine itself replaying rendered sequences (ml/livesim.ts --dump).
  conv3x3 2->12, ReLU, maxpool 2   (16 x 16)
  conv3x3 12->24, ReLU, maxpool 2  (8 x 8)
  conv3x3 24->32, ReLU, maxpool 2  (4 x 4)
  dense 512->48, ReLU, dense 48->1 (logit)

python3 train_changenet.py OUT_TS [--steps N]
"""
import glob, json, math, os, sys, time, base64
import numpy as np
import cv2
import jax, jax.numpy as jnp
import optax

P = 32
DS = '/tmp/ds'
args = sys.argv[1:]
out_ts = args[0]
steps = int(args[args.index('--steps') + 1]) if '--steps' in args else 5000
final = True
rng = np.random.default_rng(0)


def load(prefix):
    info = np.array(json.load(open(prefix + '.json'))['info'], np.float32).reshape(-1, 5)
    x = np.fromfile(prefix + '.u8', np.uint8).reshape(-1, 2, P, P)
    assert len(x) == len(info), prefix
    return x, info


X, I = load(f'{DS}/chg_train')
VX, VI = load(f'{DS}/chg_val')
Y = I[:, 0]
pos_idx = np.nonzero(Y > 0.5)[0]
neg_idx = np.nonzero(Y < 0.5)[0]
print('train', len(X), 'pos', len(pos_idx), 'neg', len(neg_idx), '| val', len(VX), 'pos', int(VI[:, 0].sum()))
tests = {'held-out sequences': (VX, VI[:, 0])}


def normalise(p):  # (N, 2, 32, 32) float
    med = np.median(p[:, 0].reshape(p.shape[0], -1), axis=1)[:, None, None, None]
    return (p - med) / 48.0


def center(p):
    return p.astype(np.float32)


def augment(batch, fake_neg=None):
    out = np.empty((len(batch), 2, P, P), np.float32)
    for i, p in enumerate(batch):
        a = p.astype(np.float32)
        if fake_neg is not None and fake_neg[i]:
            # "nothing happened": the before patch seen again (misregistration, light, noise below)
            a = np.stack([a[0], a[0]])
        k = rng.integers(0, 4)
        a = np.rot90(a, k, axes=(1, 2))
        if rng.random() < 0.5:
            a = a[:, :, ::-1]
        b, c = a[0].copy(), a[1].copy()
        # residual misregistration between before and after
        M = np.float32([[1, 0, rng.normal(0, 0.25)], [0, 1, rng.normal(0, 0.25)]])
        c = cv2.warpAffine(c, M, (P, P), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
        # light change between before and after, sensor noise
        m = np.median(b)
        g = rng.uniform(0.85, 1.15)
        c = (c - m) * g + m + rng.normal(0, 4)
        c += rng.normal(0, rng.uniform(0, 3), c.shape)
        # overall contrast of the scene
        s_ = rng.uniform(0.7, 1.3)
        b = (b - m) * s_ + m
        c = (c - m) * s_ + m
        out[i, 0] = b
        out[i, 1] = c
    return out


# ---------------- model ----------------
SPEC = [('conv', 2, 12), ('pool',), ('conv', 12, 24), ('pool',), ('conv', 24, 32), ('pool',), ('dense', 512, 48), ('dense', 48, 1)]


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
        for t in (0.5, 0.7, 0.85):
            line += f' | t={t}: found {(pos >= t).sum()}/{len(pos)} false {(neg >= t).sum()}'
        if len(pos):
            line += f' | hole scores {np.round(np.sort(pos), 2).tolist()[:8]} top neg {np.round(np.sort(neg)[-5:], 2).tolist()}'
        print(tag, line)


B = 256
t0 = time.time()
for it in range(1, steps + 1):
    bp = rng.choice(pos_idx, B // 3)
    nn_ = B - B // 3
    bn = rng.choice(neg_idx, nn_ - nn_ // 3)
    bf = rng.choice(len(X), nn_ // 3)  # any pair, turned into a no-change pair
    idx = np.concatenate([bp, bn, bf])
    fake = np.concatenate([np.zeros(len(bp) + len(bn), bool), np.ones(len(bf), bool)])
    x = normalise(augment(X[idx], fake))
    y = np.concatenate([np.ones(len(bp)), np.zeros(len(bn) + len(bf))]).astype(np.float32)
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
px = normalise(center(VX[:4]))
probe = {'input': base64.b64encode(px.astype('<f4').tobytes()).decode(), 'prob': np.asarray(predict(params, jnp.asarray(px))).tolist()}
model = {'name': 'changenet', 'input': [2, P, P], 'layers': layers, 'probe': probe, 'trained': time.strftime('%Y-%m-%d'), 'final': final}
with open(out_ts, 'w') as f:
    f.write('// Generated by ml/train_changenet.py. Do not edit.\n')
    f.write('import type { ModelSpec } from "../nn";\n')
    f.write('export const CHANGENET: ModelSpec = ' + json.dumps(model) + ';\n')
print('wrote', out_ts)
