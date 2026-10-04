# Test fixtures

Rendered targets for the realistic tests (`tests/realistic.test.ts`, `tests/livesim.test.ts`)
and the browser test (`tests/e2e`). They are generated, not stored, because the session video
is large. Everything is written to `/tmp/e2e`; the tests skip themselves when it is missing.

```bash
pip install numpy opencv-python-headless
mkdir -p /tmp/e2e && cp tests/fixtures/*.py /tmp/e2e && cd /tmp/e2e
python3 make_target.py   # target.jpg (3000x2250 photo)
python3 make_live.py     # 40 s session: seq/*.gray frames for the replay test
python3 make_frames.py   # JPEG frames for the browser fake camera (frames/)
python3 -c "import cv2;g=cv2.imread('target.jpg',0);open('target.gray','wb').write(g.tobytes())"
```

The rendering includes perspective tilt, uneven light, torn holes, holes inside the
black aiming mark, printed ring numerals, sensor noise and JPEG compression.
