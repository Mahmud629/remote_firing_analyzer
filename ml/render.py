"""
Synthetic range-scene renderer for training and testing the hole detectors.

Each scene is a target on a canvas board, seen by a camera:
  * target designs: green cloth face with dark rings (range target), green
    paper target (close-up photos), plain white paper target with black rings;
  * rings at 16 / 12 / 8 in radius, black aiming disc, white aiming rectangle,
    crosshair lines, optional ring numerals;
  * cloth wrinkles, folds, creases, dirt specks, repair patches, shadows;
  * bullet holes: dark (cloth), backlit (sky shows through), torn paper with
    tan backing and white fringe, dark core with light fringe;
  * camera: tilt/turn (perspective), distance (hole 1.5..14 px), defocus,
    CCTV sharpening, sensor noise, colour cast, JPEG.
Ground truth: hole centres in image px, outer ring ellipse, hole size.

Usage: python3 render.py OUT_DIR N [seed] [--seq]   (writes NNNN.rgb + NNNN.json)
"""
import json, math, os, sys
import numpy as np
import cv2

CAL_IN = 0.30  # 7.62 mm


def lognormal(rng, lo, hi):
    return math.exp(rng.uniform(math.log(lo), math.log(hi)))


def smooth_noise(rng, h, w, cell, amp):
    gh, gw = max(2, h // cell + 2), max(2, w // cell + 2)
    n = rng.normal(0, 1, (gh, gw)).astype(np.float32)
    return cv2.resize(n, (w, h), interpolation=cv2.INTER_CUBIC) * amp


class Design:
    def __init__(self, rng, kind):
        self.kind = kind
        self.ring_w = rng.uniform(0.28, 0.5)  # inches
        self.disc_r = rng.uniform(3.8, 4.6) if kind != 'white' else rng.uniform(3.8, 4.2)
        self.rect = rng.random() < 0.85
        self.rect_w = rng.uniform(2.2, 3.6)
        self.rect_h = self.rect_w * rng.uniform(1.15, 1.5)
        self.rect_dy = rng.uniform(0.3, 1.6)  # rectangle centre above ring centre
        self.cross = rng.random() < 0.8
        self.numerals = kind == 'white' and rng.random() < 0.7
        if kind == 'cloth':
            h = rng.uniform(85, 115)  # HSV-ish green
            self.face = np.array(hsv2rgb(h, rng.uniform(0.35, 0.65), rng.uniform(0.32, 0.55)))
            self.board = np.array([rng.uniform(150, 205), rng.uniform(140, 195), rng.uniform(110, 165)])
        elif kind == 'paper':
            h = rng.uniform(80, 110)
            self.face = np.array(hsv2rgb(h, rng.uniform(0.2, 0.42), rng.uniform(0.5, 0.72)))
            self.board = np.array([rng.uniform(200, 240)] * 3) - np.array([0, 2, 6]) * rng.random()
        else:
            self.face = None
            self.board = np.array([rng.uniform(205, 240)] * 3)
        self.ink = np.array([rng.uniform(15, 50)] * 3) + np.array([rng.uniform(0, 12), rng.uniform(0, 8), 0])
        self.disc = self.ink * rng.uniform(0.8, 1.15)


def hsv2rgb(hdeg, s, v):
    hsv = np.uint8([[[int(hdeg / 2), int(s * 255), int(v * 255)]]])
    return [float(x) for x in cv2.cvtColor(hsv, cv2.COLOR_HSV2RGB)[0, 0]]


def draw_texture(rng, d: Design, P: float, holes, distract):
    """Target plane image, P px per inch. Board is 44 x 44 in, centre = ring centre."""
    B = 44.0
    S = int(B * P)
    c = S / 2
    img = np.zeros((S, S, 3), np.float32)
    img[:] = d.board
    # fabric / paper texture and low-frequency dirt
    img += smooth_noise(rng, S, S, max(4, int(P * 5)), rng.uniform(1, 4))[..., None]
    img += rng.normal(0, rng.uniform(0.5, 3), (S, S, 1)).astype(np.float32)
    ip = lambda x, y: (int(round((c + x * P) * 16)), int(round((c - y * P) * 16)))
    sh = 4  # cv2 shift for sub-pixel drawing
    if d.face is not None:
        cv2.circle(img, ip(0, 0), int(16 * P * 16), d.face.tolist(), -1, cv2.LINE_AA, sh)
    for R in (16, 12, 8):
        cv2.circle(img, ip(0, 0), int((R - d.ring_w / 2) * P * 16), d.ink.tolist(), max(1, int(round(d.ring_w * P))), cv2.LINE_AA, sh)
    cv2.circle(img, ip(0, 0), int(d.disc_r * P * 16), d.disc.tolist(), -1, cv2.LINE_AA, sh)
    if d.cross:
        lw = max(1, int(round(rng.uniform(0.04, 0.12) * P)))
        col = (d.ink * rng.uniform(0.9, 1.6)).tolist()
        for (x0, y0, x1, y1) in [(0, 16, 0, d.disc_r), (0, -d.disc_r, 0, -16), (-16, 0, -d.disc_r, 0), (d.disc_r, 0, 16, 0)]:
            if rng.random() < 0.85:
                cv2.line(img, ip(x0, y0), ip(x1, y1), col, lw, cv2.LINE_AA, sh)
    if d.rect:
        col = np.array([rng.uniform(205, 245)] * 3) - np.array([0, 3, 10]) * rng.random()
        x0, x1 = -d.rect_w / 2, d.rect_w / 2
        y0, y1 = d.rect_dy - d.rect_h / 2, d.rect_dy + d.rect_h / 2
        cv2.rectangle(img, ip(x0, y1), ip(x1, y0), col.tolist(), -1, cv2.LINE_AA, sh)
    if d.numerals:  # putText needs 8-bit: draw a mask, then paint with the ink colour
        tm = np.zeros((S, S), np.uint8)
        for R, n in [(14, '1'), (10, '2'), (6, '3')]:
            for ang in (0, math.pi / 2, math.pi, 3 * math.pi / 2):
                x, y = math.cos(ang) * R - 0.3, math.sin(ang) * R - 0.3
                cv2.putText(tm, n, (int(c + x * P), int(c - y * P)), cv2.FONT_HERSHEY_SIMPLEX, 0.035 * P, 255, max(1, int(0.07 * P)), cv2.LINE_AA)
        a = (tm.astype(np.float32) / 255)[..., None]
        img[:] = img * (1 - a) + d.ink * a

    # distractors (never labelled as holes)
    for kind, x, y, s in distract:
        px, py = c + x * P, c - y * P
        if kind == 'speck':  # small faint dirt
            base = img[int(np.clip(py, 0, S - 1)), int(np.clip(px, 0, S - 1))]
            col = (base * rng.uniform(0.55, 0.8)).tolist()
            cv2.ellipse(img, (int(px * 16), int(py * 16)), (int(s * P * 16 * rng.uniform(0.6, 1)), int(s * P * 16)), rng.uniform(0, 180), 0, 360, col, -1, cv2.LINE_AA, sh)
        elif kind == 'patch':  # repair sticker over an old hole
            base = img[int(np.clip(py, 0, S - 1)), int(np.clip(px, 0, S - 1))]
            col = np.clip(base * rng.uniform(0.85, 1.2) + rng.normal(0, 6, 3), 0, 255).tolist()
            a = rng.uniform(0, 90)
            box = cv2.boxPoints(((px, py), (s * P, s * P * rng.uniform(0.7, 1.3)), a))
            cv2.fillPoly(img, [np.int32(box * 16)], col, cv2.LINE_AA, sh)
        elif kind == 'stroke':  # pen mark / scratch
            ang = rng.uniform(0, math.pi)
            L = s * P
            p0 = (int((px - math.cos(ang) * L) * 16), int((py - math.sin(ang) * L) * 16))
            p1 = (int((px + math.cos(ang) * L) * 16), int((py + math.sin(ang) * L) * 16))
            cv2.line(img, p0, p1, (d.ink * rng.uniform(1, 2.5)).tolist(), max(1, int(0.06 * P)), cv2.LINE_AA, sh)
        elif kind == 'dropping':  # bird dropping / paint splash
            col = [rng.uniform(200, 250)] * 3
            for _ in range(rng.integers(2, 5)):
                cv2.circle(img, (int((px + rng.normal(0, s * P * 0.4)) * 16), int((py + rng.normal(0, s * P * 0.4)) * 16)), int(s * P * rng.uniform(0.2, 0.5) * 16), col, -1, cv2.LINE_AA, sh)

    # cloth wrinkles / paper creases: shading field with thin dark/bright ridges
    shade = np.ones((S, S), np.float32)
    nw = rng.integers(0, 9) if d.kind == 'cloth' else rng.integers(0, 4)
    for _ in range(nw):
        ang = rng.uniform(0, math.pi)
        x0, y0 = rng.uniform(-20, 20), rng.uniform(-20, 20)
        L = rng.uniform(4, 30)
        pts = []
        bend = rng.normal(0, 0.15)
        for t in np.linspace(-L / 2, L / 2, 20):
            a = ang + bend * t / max(L, 1)
            pts.append([c + (x0 + math.cos(a) * t) * P, c - (y0 + math.sin(a) * t) * P])
        pts = np.int32(np.array(pts) * 16)
        w = max(1, int(lognormal(rng, 0.06, 0.9) * P))
        dark = rng.uniform(0.6, 0.93)
        cv2.polylines(shade, [pts], False, dark, w, cv2.LINE_AA, sh)
        if rng.random() < 0.6:
            off = (np.array([math.sin(ang), math.cos(ang)]) * w * 1.5 * 16).astype(np.int32)
            cv2.polylines(shade, [pts + off], False, rng.uniform(1.05, 1.25), w, cv2.LINE_AA, sh)
    if d.kind != 'white' and rng.random() < 0.6:  # straight fold lines
        for _ in range(rng.integers(1, 3)):
            if rng.random() < 0.5:
                y = c + rng.uniform(-18, 18) * P
                cv2.line(shade, (0, int(y)), (S, int(y + rng.normal(0, 0.3) * P)), rng.uniform(0.85, 1.12), max(1, int(0.08 * P)), cv2.LINE_AA)
            else:
                x = c + rng.uniform(-18, 18) * P
                cv2.line(shade, (int(x), 0), (int(x + rng.normal(0, 0.3) * P), S), rng.uniform(0.85, 1.12), max(1, int(0.08 * P)), cv2.LINE_AA)
    shade = cv2.GaussianBlur(shade, (0, 0), max(0.6, rng.uniform(0.04, 0.2) * P))
    # shiny vinyl / plastic creases: short sharp bright streaks with a dark shadow side
    if d.kind != 'white' and rng.random() < 0.8:
        crk = np.ones((S, S), np.float32)
        for _ in range(int(rng.integers(5, 45))):
            x0, y0 = rng.uniform(-17, 17, 2)
            L = lognormal(rng, 0.3, 2.5)
            ang = rng.uniform(0, math.pi)
            bend = rng.normal(0, 0.6)
            pts = []
            for t in np.linspace(-L / 2, L / 2, 8):
                a = ang + bend * t / max(L, 0.1)
                pts.append([c + (x0 + math.cos(a) * t) * P, c - (y0 + math.sin(a) * t) * P])
            pts = np.array(pts)
            w = max(1, int(rng.uniform(0.04, 0.16) * P))
            nrm = np.array([math.sin(ang), math.cos(ang)]) * w * 1.2
            cv2.polylines(crk, [np.int32((pts + nrm) * 16)], False, rng.uniform(0.6, 0.85), w, cv2.LINE_AA, 4)
            cv2.polylines(crk, [np.int32(pts * 16)], False, rng.uniform(1.25, 1.7), w, cv2.LINE_AA, 4)
        crk = cv2.GaussianBlur(crk, (0, 0), max(0.5, 0.03 * P))
        shade *= crk
    shade *= 1 + smooth_noise(rng, S, S, max(8, int(P * 6)), rng.uniform(0.02, 0.08))
    img *= shade[..., None]

    # holes (drawn after shading: the hole is not shaded by the cloth)
    for hx, hy, r, kind in holes:
        draw_hole(rng, img, c + hx * P, c - hy * P, r * P, kind, d)
    return np.clip(img, 0, 255)


def draw_hole(rng, img, x, y, r, kind, d):
    sh = 4
    X, Y = int(x * 16), int(y * 16)
    rr = max(0.6, r)
    if kind in ('torn', 'darkfringe'):
        # torn fibres / white paper fringe
        n = 14
        pts = []
        k = rng.uniform(1.2, 1.6)
        for a in np.linspace(0, 2 * math.pi, n, endpoint=False):
            q = rr * k * (1 + 0.2 * rng.standard_normal())
            pts.append((x + math.cos(a) * q, y + math.sin(a) * q))
        fr = np.array([rng.uniform(215, 250)] * 3) - np.array([0, 2, 8]) * rng.random()
        cv2.fillPoly(img, [np.int32(np.array(pts) * 16)], fr.tolist(), cv2.LINE_AA, sh)
    if kind == 'torn':
        core = np.array([rng.uniform(150, 205), rng.uniform(105, 150), rng.uniform(55, 100)])  # tan backing
    elif kind == 'backlit':
        core = np.array([rng.uniform(150, 220), rng.uniform(165, 225), rng.uniform(185, 240)])  # sky
    else:  # dark / darkfringe
        core = np.array([rng.uniform(8, 45)] * 3) + np.array([rng.uniform(0, 10), rng.uniform(0, 6), 0])
    pts = []
    for a in np.linspace(0, 2 * math.pi, 12, endpoint=False):
        q = rr * (1 + 0.12 * rng.standard_normal())
        pts.append((x + math.cos(a) * q, y + math.sin(a) * q))
    cv2.fillPoly(img, [np.int32(np.array(pts) * 16)], core.tolist(), cv2.LINE_AA, sh)
    if kind == 'dark' and rng.random() < 0.35:  # frayed light rim on cloth
        cv2.circle(img, (X, Y), int(rr * 1.25 * 16), (img[int(np.clip(y, 0, img.shape[0] - 1)), int(np.clip(x, 0, img.shape[1] - 1))] * 1.0).tolist(), 1, cv2.LINE_AA, sh)


def sample_holes(rng, d: Design, n):
    """Positions in inches (y up) and radius (inches)."""
    holes = []
    mode = rng.random()
    if mode < 0.55:  # a group
        gx, gy = rng.normal(0, 4, 2)
        spread = lognormal(rng, 0.8, 5)
        pos = [(gx + rng.normal(0, spread), gy + rng.normal(0, spread)) for _ in range(n)]
    else:
        pos = []
        while len(pos) < n:
            x, y = rng.uniform(-16.5, 16.5, 2)
            if math.hypot(x, y) < 16.3:
                pos.append((x, y))
    for x, y in pos:
        if math.hypot(x, y) > 16.6:
            continue
        r = CAL_IN / 2 * rng.uniform(0.6, 1.35)
        in_disc = math.hypot(x, y) < d.disc_r
        if d.kind == 'cloth':
            kind = rng.choice(['dark', 'backlit', 'darkfringe'], p=[0.80, 0.05, 0.15])
        elif d.kind == 'paper':
            kind = rng.choice(['torn', 'dark', 'darkfringe'], p=[0.75, 0.1, 0.15])
        else:
            kind = rng.choice(['darkfringe', 'torn', 'dark'], p=[0.6, 0.25, 0.15])
        if in_disc and kind in ('dark',):
            kind = 'backlit' if rng.random() < 0.5 else 'torn'
        holes.append((x, y, r, kind))
    # occasional touching pair
    if holes and rng.random() < 0.15:
        x, y, r, k = holes[0]
        a = rng.uniform(0, 2 * math.pi)
        dd = 2 * r * rng.uniform(0.8, 1.3)
        holes.append((x + math.cos(a) * dd, y + math.sin(a) * dd, r, k))
    return holes


def sample_distractors(rng, d: Design):
    out = []
    for _ in range(rng.integers(0, 10)):
        x, y = rng.uniform(-17, 17, 2)
        out.append(('speck', x, y, CAL_IN / 2 * rng.uniform(0.15, 0.45)))
    for _ in range(rng.integers(0, 3)):
        x, y = rng.uniform(-15, 15, 2)
        out.append(('patch', x, y, rng.uniform(0.6, 1.4)))
    for _ in range(rng.integers(0, 3)):
        x, y = rng.uniform(-15, 15, 2)
        out.append(('stroke', x, y, rng.uniform(0.2, 1.0)))
    if rng.random() < 0.2:
        x, y = rng.uniform(-15, 15, 2)
        out.append(('dropping', x, y, rng.uniform(0.15, 0.4)))
    return out


def camera_homography(rng, P, S, R_px, W, H):
    """Target plane px -> image px. Camera looks up at the raised target, may be to one side."""
    pitch = math.radians(rng.uniform(-8, 38))  # looking up: board top farther away
    yaw = math.radians(rng.normal(0, 12))
    roll = math.radians(rng.normal(0, 2.5))
    f = 1.0
    dist = rng.uniform(3, 12)
    # rotation (board in camera frame)
    Rx = np.array([[1, 0, 0], [0, math.cos(pitch), -math.sin(pitch)], [0, math.sin(pitch), math.cos(pitch)]])
    Ry = np.array([[math.cos(yaw), 0, math.sin(yaw)], [0, 1, 0], [-math.sin(yaw), 0, math.cos(yaw)]])
    Rz = np.array([[math.cos(roll), -math.sin(roll), 0], [math.sin(roll), math.cos(roll), 0], [0, 0, 1]])
    Rm = Rz @ Ry @ Rx
    # plane point (u, v) in inches (v down) -> camera coords; project
    def proj(u, v):
        p = Rm @ np.array([u, v, 0.0]) + np.array([0, 0, dist * 16])
        return np.array([p[0] / p[2], p[1] / p[2]])
    src = np.float32([[0, 0], [S, 0], [S, S], [0, S]])
    corners_in = [(-22, -22), (22, -22), (22, 22), (-22, 22)]
    dst = np.array([proj(u, v) for u, v in corners_in])
    # scale so ring radius ~ R_px; centre in the image with some offset
    ring = np.array([proj(16 * math.cos(a), 16 * math.sin(a)) for a in np.linspace(0, 2 * math.pi, 64)])
    rr = (ring.max(0) - ring.min(0)).mean() / 2
    k = R_px / rr
    cen = proj(0, 0)
    off = np.array([W / 2 + rng.normal(0, 0.08 * W), H / 2 + rng.normal(0, 0.06 * H) - 0.15 * R_px])
    dst = (dst - cen) * k + off
    return cv2.getPerspectiveTransform(src, np.float32(dst))


def render_scene(rng, kind=None, dh_px=None, n_holes=None, seq=False):
    kind = kind or rng.choice(['cloth', 'paper', 'white'], p=[0.55, 0.25, 0.20])
    d = Design(rng, kind)
    dh = dh_px or lognormal(rng, 1.6, 14)  # native hole diameter in px
    R_px = 16 / CAL_IN * dh
    # target texture at ~ 3x the final scale (max 48 px/in)
    P = float(min(48, max(10, 3 * R_px / 16)))
    n = rng.integers(0, 16) if n_holes is None else n_holes
    holes = sample_holes(rng, d, n)
    distract = sample_distractors(rng, d)
    tex = draw_texture(rng, d, P, holes, distract)
    S = tex.shape[0]
    # final frame
    W = int(min(1920, max(320, R_px * rng.uniform(2.6, 4.2))))
    H = int(min(1200, max(240, W * rng.uniform(0.56, 0.95))))
    Hm = camera_homography(rng, P, S, R_px, W, H)
    # pre-shrink texture with area averaging so the warp itself only scales by ~1
    J = np.linalg.svd(Hm[:2, :2])[1]
    shrink = float(np.clip(1.0 / max(J[0], 1e-3) * 0.8, 0.05, 1))
    if shrink < 0.95:
        tex_s = cv2.resize(tex, (int(S * shrink), int(S * shrink)), interpolation=cv2.INTER_AREA)
        Ssc = np.diag([1 / (tex_s.shape[1] / S), 1 / (tex_s.shape[0] / S), 1.0])
        Hm2 = Hm @ Ssc
    else:
        tex_s, Hm2 = tex, Hm
    scene = background(rng, W, H)
    warped = cv2.warpPerspective(tex_s, Hm2, (W, H), flags=cv2.INTER_LINEAR, borderValue=(0, 0, 0))
    mask = cv2.warpPerspective(np.ones(tex_s.shape[:2], np.float32), Hm2, (W, H), flags=cv2.INTER_LINEAR)
    # posts under the board
    draw_posts(rng, scene, Hm, S, P)
    img = scene * (1 - mask[..., None]) + warped * mask[..., None]
    img = camera_effects(rng, img)
    # ground truth
    def to_img(x, y):
        p = Hm @ np.array([S / 2 + x * P, S / 2 - y * P, 1.0])
        return [float(p[0] / p[2]), float(p[1] / p[2])]
    gt = [to_img(x, y) + [x, y, kind_] for (x, y, r, kind_) in holes]
    ring = np.float32([to_img(16 * math.cos(a), 16 * math.sin(a)) for a in np.linspace(0, 2 * math.pi, 90, endpoint=False)])
    (ex, ey), (ea, eb), eang = cv2.fitEllipse(ring)
    meta = dict(w=W, h=H, kind=kind, dh=dh, holes=gt, ring=[ex, ey, ea / 2, eb / 2, eang], H=Hm.tolist(), P=P, S=S)
    return img, meta


def background(rng, W, H):
    top = np.array([rng.uniform(120, 200), rng.uniform(150, 210), rng.uniform(180, 240)])
    bot = np.array([rng.uniform(170, 230), rng.uniform(170, 220), rng.uniform(160, 215)])
    t = np.linspace(0, 1, H, dtype=np.float32)[:, None, None]
    img = top * (1 - t) + bot * t
    img = np.broadcast_to(img, (H, W, 3)).astype(np.float32).copy()
    if rng.random() < 0.6:  # tree line / ground at the bottom
        y0 = int(H * rng.uniform(0.75, 0.97))
        band = smooth_noise(rng, H - y0, W, 6, 25) + np.array([rng.uniform(40, 90)])
        img[y0:] = np.stack([band * 0.8, band * 1.0, band * 0.6], -1)
    return img


def draw_posts(rng, scene, Hm, S, P):
    if rng.random() < 0.25:
        return
    col = [rng.uniform(50, 110), rng.uniform(35, 70), rng.uniform(25, 50)]
    def pt(u, v):
        q = Hm @ np.array([S / 2 + u * P, S / 2 + v * P, 1.0])
        return q[:2] / q[2]
    for x in (-19, 17):
        quad = np.array([pt(x, 22), pt(x + 2.5, 22), pt(x + 2.5, 80), pt(x, 80)])
        cv2.fillPoly(scene, [np.int32(quad)], col)


def camera_effects(rng, img):
    img = img.astype(np.float32)
    # exposure / colour cast / gamma
    img *= rng.uniform(0.7, 1.15)
    img *= np.array([rng.uniform(0.9, 1.1), 1.0, rng.uniform(0.88, 1.12)])
    img = 255 * np.clip(img / 255, 0, 1) ** rng.uniform(0.8, 1.25)
    # light gradient / vignette
    H, W = img.shape[:2]
    gx = np.linspace(-1, 1, W)[None, :]
    gy = np.linspace(-1, 1, H)[:, None]
    img *= (1 + rng.uniform(-0.12, 0.12) * gx + rng.uniform(-0.1, 0.1) * gy)[..., None]
    # optics
    s = rng.uniform(0.3, 1.2)
    img = cv2.GaussianBlur(img, (0, 0), s)
    if rng.random() < 0.15:
        k = np.zeros((7, 7), np.float32)
        k[3, :] = 1
        M = cv2.getRotationMatrix2D((3, 3), rng.uniform(0, 180), 1)
        k = cv2.warpAffine(k, M, (7, 7))
        k /= k.sum()
        img = cv2.filter2D(img, -1, k)
    # CCTV sharpening halos
    if rng.random() < 0.6:
        amt = rng.uniform(0.2, 1.2)
        bl = cv2.GaussianBlur(img, (0, 0), rng.uniform(0.8, 2.0))
        img = img + amt * (img - bl)
    img += rng.normal(0, rng.uniform(0.8, 6), img.shape).astype(np.float32)
    img = np.clip(img, 0, 255).astype(np.uint8)
    q = int(rng.uniform(30, 92))
    ok, buf = cv2.imencode('.jpg', cv2.cvtColor(img, cv2.COLOR_RGB2BGR), [cv2.IMWRITE_JPEG_QUALITY, q])
    return cv2.cvtColor(cv2.imdecode(buf, cv2.IMREAD_COLOR), cv2.COLOR_BGR2RGB)


if __name__ == '__main__':
    out = sys.argv[1]
    n = int(sys.argv[2])
    seed = int(sys.argv[3]) if len(sys.argv) > 3 else 0
    os.makedirs(out, exist_ok=True)
    for i in range(n):
        rng = np.random.default_rng(seed * 100003 + i)
        img, meta = render_scene(rng)
        name = f'{seed:03d}_{i:05d}'
        img.tofile(os.path.join(out, name + '.rgb'))
        json.dump(meta, open(os.path.join(out, name + '.json'), 'w'))
        if i < 6 and '--preview' in sys.argv:
            cv2.imwrite(os.path.join(out, name + '.png'), cv2.cvtColor(img, cv2.COLOR_RGB2BGR))
