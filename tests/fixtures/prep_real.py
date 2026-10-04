"""Turns target photos with holes circled in red into a test set.

Usage: python3 tests/fixtures/prep_real.py <folder with photos>
Writes /tmp/real/<name>.rgb (red circles painted out) and truth.json; then run
`npm test` and see tests/real.test.ts for found / missed / false marks.
"""
import cv2, numpy as np, json, glob, os
out = {}
import sys
SRC = sys.argv[1] if len(sys.argv) > 1 else 'photos'
os.makedirs('/tmp/real', exist_ok=True); os.chdir('/tmp/real')
for p in sorted(glob.glob(os.path.join(os.path.abspath(SRC), '*.png')) + glob.glob(os.path.join(os.path.abspath(SRC), '*.jpg'))):
    name = os.path.basename(p).split('.')[0]
    im = cv2.imread(p, cv2.IMREAD_COLOR)  # BGR
    b, g, r = [im[:, :, i].astype(int) for i in range(3)]
    red = ((r > 170) & (g < 90) & (b < 90) & (r - g > 110)).astype(np.uint8)
    n, lab, stats, cent = cv2.connectedComponentsWithStats(red, 8)
    truth = []
    for i in range(1, n):
        x, y, w, h, a = stats[i]
        if a < 150 or w < 25 or h < 25: continue
        ys, xs = np.nonzero(lab == i)
        truth.append([float((x + x + w) / 2), float((y + y + h) / 2), float(max(w, h) / 2)])
    mask = cv2.dilate(red, np.ones((5, 5), np.uint8))
    clean = cv2.inpaint(im, mask, 5, cv2.INPAINT_TELEA)
    cv2.imwrite(f'{name}_clean.png', clean)
    rgb = cv2.cvtColor(clean, cv2.COLOR_BGR2RGB)
    rgb.tofile(f'{name}.rgb')
    out[name] = {'w': im.shape[1], 'h': im.shape[0], 'truth': truth}
    print(name, im.shape[1], 'x', im.shape[0], 'circles:', len(truth), [ (round(t[0]),round(t[1]),round(t[2])) for t in truth])
json.dump(out, open('truth.json', 'w'))
print('wrote', len(out), 'photos to /tmp/real')
