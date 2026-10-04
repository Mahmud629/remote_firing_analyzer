import numpy as np, cv2, math, json, sys
rng = np.random.default_rng(3)
HOLES = [(1.1, 2.3), (-2.0, 0.9), (0.6, -1.7), (2.6, -0.6), (-0.9, -2.9)]  # inches, y up (group shifted up-right a bit)

def render(W, H, ppi, holes, seed=0, persp=True, light=True):
    rng = np.random.default_rng(seed)
    S = 2  # supersample
    w, h = W*S, H*S
    img = np.full((h, w), 0, np.float32)
    # grass / berm background texture
    noise = cv2.resize(rng.normal(0, 1, (h//40+2, w//40+2)).astype(np.float32), (w, h), interpolation=cv2.INTER_CUBIC)
    img[:] = 95 + 22*noise
    cx, cy = w/2, h/2
    P = ppi*S
    # paper
    half = int(19*P)
    cv2.rectangle(img, (int(cx-half), int(cy-half*1.15)), (int(cx+half), int(cy+half)), 218, -1)
    # rings
    for R, t in [(16, 0.16), (12, 0.08), (8, 0.08)]:
        cv2.circle(img, (int(cx), int(cy)), int(R*P), 28, max(1, int(t*P)), lineType=cv2.LINE_AA)
    cv2.circle(img, (int(cx), int(cy)), int(4*P), 22, -1, lineType=cv2.LINE_AA)  # 8 in black aiming mark
    # printed ring numbers
    for R, n in [(14, '1'), (10, '2'), (6, '3')]:
        for ang in (0, math.pi/2, math.pi, 3*math.pi/2):
            x = cx + math.cos(ang)*R*P - 0.3*P; y = cy - math.sin(ang)*R*P + 0.3*P
            cv2.putText(img, n, (int(x), int(y)), cv2.FONT_HERSHEY_SIMPLEX, 0.035*P, 40, max(1, int(0.07*P)), cv2.LINE_AA)
    # holes: torn light fringe + dark core (on paper) or light core (in aiming mark)
    for (hx, hy) in holes:
        x = cx + hx*P; y = cy - hy*P
        inbull = math.hypot(hx, hy) < 4
        rr = 0.15*P
        if not inbull:
            pts = [(x + math.cos(a)*rr*1.35*(1+0.15*rng.standard_normal()), y + math.sin(a)*rr*1.35*(1+0.15*rng.standard_normal())) for a in np.linspace(0, 2*math.pi, 14, endpoint=False)]
            cv2.fillPoly(img, [np.array(pts, np.int32)], 236, lineType=cv2.LINE_AA)
            cv2.circle(img, (int(x), int(y)), int(rr), 38, -1, lineType=cv2.LINE_AA)
        else:
            cv2.circle(img, (int(x), int(y)), int(rr), 150, -1, lineType=cv2.LINE_AA)
    img = cv2.resize(img, (W, H), interpolation=cv2.INTER_AREA)
    if light:
        xs = np.linspace(0, 1, W)[None, :]; ys = np.linspace(0, 1, H)[:, None]
        img = img*(0.72 + 0.28*xs)*(0.9+0.1*ys)
    if persp:
        src = np.float32([[0,0],[W,0],[W,H],[0,H]])
        d = 0.035
        dst = np.float32([[W*d,H*0.02],[W*(1-d*0.3),0],[W,H],[0,H*(1-0.01)]])
        M = cv2.getPerspectiveTransform(src, dst)
        img = cv2.warpPerspective(img, M, (W, H), borderMode=cv2.BORDER_REPLICATE)
    img = cv2.GaussianBlur(img, (0,0), 0.8)
    img += rng.normal(0, 4, img.shape)
    return np.clip(img, 0, 255).astype(np.uint8)

# still photo: 3000x2250, ring diameter ~ 1800 px
g = render(3000, 2250, 56, HOLES, seed=1)
col = cv2.merge([np.clip(g*0.97,0,255).astype(np.uint8), g, np.clip(g*1.02,0,255).astype(np.uint8)])
cv2.imwrite('target.jpg', col, [cv2.IMWRITE_JPEG_QUALITY, 85])

print(json.dumps({'holes': HOLES}))
