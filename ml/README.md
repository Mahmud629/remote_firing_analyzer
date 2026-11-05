# Machine learning: data, training, evaluation

The app ships with two trained networks in `src/vision/models/` (plain TypeScript, no
downloads). This folder is only needed to **retrain** or **re-test** them.

| Network | Input | Decides | Used in |
|---|---|---|---|
| HoleNet | 3 x 32 x 32 colour patch, hole ~6 px | is this spot a bullet hole? | photo / captured frame |
| ChangeNet | 2 x 32 x 32 luma, before + after, hole ~5 px | is this change a NEW bullet hole? | live view |

Both: conv3x3 -> ReLU -> maxpool (x3), dense 512->48->1, about 35 000 weights. Inference is
`src/vision/nn.ts`; `tests/nn.test.ts` checks it against the training framework.

## Setup (Linux / WSL / Windows with Python 3.11+)

```bash
pip install numpy opencv-python-headless "jax[cpu]" optax
npm install                      # the data builders run the app's own TypeScript (jiti)
```

## Files

| File | What it does |
|---|---|
| `render.py` | Renders range scenes with ground truth (target designs, cloth wrinkles, folds, dirt, patches, perspective, CCTV blur / sharpening / noise / JPEG). |
| `render_seq.py` | Live sequences: sway, light drift, shadows, insects, camera bump; shots at known frames. |
| `real_seq.py` | Live sequences from a REAL camera frame with new holes added at known frames. |
| `augment_real.py` | Range-camera versions of real close-up photos (shrink, rotate, perspective, camera effects). |
| `real_paste.py` | Pictures from YOUR targets: real holes cut out and blended into other places of the real target, then CCTV effects. Every other spot becomes a "not a hole" example. |
| `lists.py` | Builds the input lists for `extract.ts`. |
| `extract.ts` | Runs the app's candidate finder and saves training patches (so training sees exactly what the app sees). |
| `gen_batch.sh` | render + list + extract for one batch of synthetic scenes. |
| `train_holenet.py` | Trains HoleNet, reports on held-out photos, writes `src/vision/models/holenet.ts`. |
| `livesim.ts` | Replays sequences through the live engine; `--net` uses ChangeNet; `--dump` saves before/after pairs for training. |
| `train_changenet.py` | Trains ChangeNet, writes `src/vision/models/changenet.ts`. |
| `eval_photo.ts`, `eval_calib.ts` | End-to-end photo and calibration accuracy. |

## Retrain HoleNet

```bash
mkdir -p /tmp/ds
# real photos with holes circled in red (see tests/fixtures/prep_real.py) -> /tmp/real
python3 tests/fixtures/prep_real.py my_photos/
python3 ml/lists.py real /tmp/ds/real_list.json && npx jiti ml/extract.ts /tmp/ds/real_list.json /tmp/ds/real
python3 ml/augment_real.py /tmp/ds/realaug 60 <photo names...>
npx jiti ml/extract.ts /tmp/ds/realaug/list.json /tmp/ds/realaug_p
for s in 11 12 13 14 21 22 23 24 31 32 33 34; do ml/gen_batch.sh $s 400; done   # ~4 800 scenes
# your own pictures (list each with its holes and ring radius in px, see the script header)
python3 ml/real_paste.py my_spec.json /tmp/ds/pasteA 150 11
npx jiti ml/extract.ts /tmp/ds/pasteA/list.json /tmp/ds/pasteA_p
npx jiti ml/extract.ts my_pictures_list.json /tmp/ds/newclose --all-neg
python3 ml/train_holenet.py src/vision/models/holenet.ts --steps 6000 --final
```

## Retrain ChangeNet

```bash
for s in $(seq 1001 1030) $(seq 2001 2030); do python3 ml/render_seq.py /tmp/seqtr/s$s $s --shots 10 --frames 80; done
# 55 sequences for training, the last 5 for validation
npx jiti ml/livesim.ts $(ls -d /tmp/seqtr/* | head -55) --dump /tmp/ds/chg_train
npx jiti ml/livesim.ts $(ls -d /tmp/seqtr/* | tail -5) --dump /tmp/ds/chg_val
python3 ml/train_changenet.py src/vision/models/changenet.ts --steps 3500
```

## Test

```bash
npx jiti ml/livesim.ts SEQ_DIRS... --net        # live: counted / false / before first shot
npx jiti ml/eval_photo.ts --real <names> --syn DIR
npm test
```

## Using your own camera recordings (recommended)

The most valuable data is **raw frames from your own CCTV**, without the app's marks:
a few seconds before firing and after each shot. Put frames in a folder, note the frame
and pixel position of each new hole in a `meta.json` like the one `real_seq.py` writes,
and add them to the `livesim.ts` evaluation and the `--dump` training pairs.
