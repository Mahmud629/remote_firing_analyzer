# Browser test of live mode

`fakecam.js` replaces `getUserMedia` with a canvas stream that follows an exact
timeline (25 s clean target, then one new hole every 6 s), so the real browser
path is exercised: video element, frame grab, Web Worker, ring lock, clean-target
learning, change check, tracker and auto capture.

```bash
npm run build
mkdir -p out/e2e && cp /tmp/e2e/frames/* out/e2e/      # see tests/fixtures
(cd out && python3 -m http.server 4173) &
pip install playwright && python3 -m playwright install chromium
python3 tests/e2e/e2e_live.py
```

Expected: `0 of 5 hits` while the target is clean, hits counted one by one as they
appear, then `AUTO-CAPTURED` with `Zeroed 5/5` and a grouping close to 5.57 in.

## Feature test

`e2e_features.py` runs the main screens in a real browser: photo analysis, firer, saving two
groups with the see-through overlay, PDF download, two-point calibration, the help guide and
adding a CCTV camera. `mock_mediamtx.py` stands in for the MediaMTX Control API
(`python3 tests/e2e/mock_mediamtx.py`, listens on 127.0.0.1:9997). Both read the rendered
fixtures from `/tmp/e2e` (see `tests/fixtures/README.md`).
