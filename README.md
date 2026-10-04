# Remote Firing Analyzer 2.5.1

Rifle zeroing from a photo, a camera or a CCTV lane. The app finds the 32 in outer ring
by itself, uses it to calibrate the picture, detects every bullet hole, works out the
group, MPI and BD-08 sight correction, and keeps each firer's record on the computer.

Everything runs in the browser: no server, no internet and no model files. Build it
once and copy the `out/` folder to a range laptop, Firebase Hosting or any web server.

---

## Quick start

```bash
npm install        # or: pnpm install
npm run dev        # http://localhost:3000
npm test           # 21 unit, vision and replay tests
npm run build      # static site in out/
```

Deploy to the existing Firebase project:

```bash
npm run build
firebase deploy --only hosting
```

Cameras need a secure page: `https://…` or `http://localhost`. A plain `http://` address
on the network will block the camera (CCTV streams still work).

---

## Using it

1. **Picture.** Choose a photo (or drop one on the picture area), start a USB/laptop
   camera, or start a CCTV lane.
2. **Ring calibration.** The outer 32 in ring is found automatically. Pixels are
   converted to inches from it, with separate horizontal and vertical scales, so a camera
   looking slightly up at the target still measures correctly.
3. **Hole detection.** Holes are found on white paper, inside the black aiming mark, on
   printed ring lines, and where two holes touch (those are marked orange to check).
4. **Review.** Drag marks, add missed holes, delete false ones, move the aiming point or
   the ring. Everything recalculates instantly.
5. **Record.** Choose the firer, add the weapon number and save. Print gives an A4
   record with signature lines.

### Sessions (several groups by one firer)

1. Fire group 1, analyse it, choose the firer and press **Save group 1**.
2. Press **Next group**. Group 1 stays on screen as see-through coloured marks.
3. Fire group 2 and analyse a new photo (or keep the live view running). Holes of
   earlier groups are recognised and **not counted again**.
4. Every group is saved in the firer's record with its session and group number.
   Use the eye buttons to hide a group, the layers button to hide all, and
   **End session** when the firer is finished.

### Calibration

- **Automatic:** the outer 32 in ring (blue) is found by itself.
- **Adjust ring (R):** drag the handles onto the outer ring if it is off.
- **Two points (M):** click point A and point B a known distance apart (for example
  two ring lines on the same axis), type the distance in inches, cm or mm, then click
  the aiming point.

### Result sheet (PDF)

**PDF** downloads an A4 sheet: status banner, firer and result tables, BD-08
correction, the whole target, a close-up of the group (earlier groups see-through),
the session table, coaching notes and signature lines. Records → a group → **PDF**
gives the same sheet later.

### Live view (camera or CCTV)

- The ring is searched every frame until it holds steady for 6 frames, then the
  calibration is **locked**.
- The app then spends a few seconds **reading the clean target**. Anything it sees
  then (printed numerals, line artefacts, old patched holes) is noted and never counted,
  and a reference picture is kept.
- From then on only **new** holes count. A hole is counted once it is seen on 4 of the
  last 6 frames and its spot has really changed compared with the reference picture.
  Hits are numbered in firing order.
- When all 5 hits are found and nothing changes for 2.5 s, the frame is frozen for
  review automatically (switch this off in Settings). **Capture** does it by hand.
- **Next group** keeps the holes already on the target (shown dashed grey) and counts
  only the next group. **Find ring** re-locks if the camera was moved; this also
  happens by itself when the ring moves.

Start the live view **before** firing. To analyse a target that already has holes,
press Capture: with no new hits counted, the frame is analysed like a photo.

### Keyboard (review)

| Key | Action |
|---|---|
| V | Move tool (drag marks, aiming point, picture) |
| A | Add hit |
| P | Set aiming point |
| R | Adjust ring |
| M | Two-point calibration |
| Delete / Backspace | Delete the selected mark |
| Right-click a mark | Delete it |
| Ctrl+Z | Undo |
| + / − / 0 | Zoom in, zoom out, fit |

Mouse wheel zooms at the pointer; on phones and tablets pinch to zoom.

---

## Rules (unchanged from version 1, editable in Settings)

| Rule | Default |
|---|---|
| Rounds per group | 5 |
| Largest group allowed | 10 in |
| Zero tolerance (MPI to aiming point) | 5 cm |
| BD-08 lateral | 32 cm per sight turn |
| BD-08 vertical | 24 cm per sight turn |
| Calibration ring | 32 in diameter |
| Marksman / First class / Standard | up to 4 / 7 / 10 in |

Result: **Zeroed** (MPI within tolerance), **Adjust sights**, **Washout** (wrong number of
rounds or group over the limit). While rounds are still missing the screen shows
*Waiting for rounds*; a record saved in that state is stored as a washout.

The correction says which way the **MPI must move** to reach the aiming point, in cm and
in sight turns. Apply it with your normal BD-08 sight drill.

---

## Records

Firers and their groups are stored in the browser's IndexedDB on this computer:
personal number, rank, name, unit, photo, left-handed flag, and for every group the
date, weapon number, range, result, all measurements, hit positions in inches and the
marked target picture.

- **Records → Firers:** search, history table, trend chart of group size, edit, delete.
- **Records → Weapons:** latest result per weapon number and when it was last zeroed.
- **Back up / Restore:** one JSON file with everything, including pictures. Use it to
  move records to another computer and back it up regularly.
- **Export CSV:** all groups for Excel.

Browser data can be lost if someone clears the browser's site data, so keep backups.

---

## Getting good results

- **Fill the frame.** Aim for the outer ring to be at least ~1000 px across in the
  picture (a 1080p camera zoomed so the ring fills most of the height). The app warns
  when the target is too small; below ~600 px numerals and holes start to look alike.
- **Square-on.** Mild tilt is corrected; strong side angles are not (see limits).
- **Even light** and no hard shadows across the target.
- **Backing.** Holes are found as dark spots on white paper and light spots in the black
  aiming mark. A dark backing behind the paper and some light behind the black mark give
  the clearest holes.
- **CCTV.** See the next section.

## CCTV cameras (MediaMTX included)

Browsers cannot play a camera's RTSP stream, so a small free program, **MediaMTX**, turns it
into video the browser can play. It is **included** in the `mediamtx` folder (v1.21.1,
Windows 64-bit, MIT licence); you only add cameras in the app.

**Start it** (Windows):

1. Open the `mediamtx` folder and double-click **`start-mediamtx.bat`**.
2. A black window opens. **Keep it open** while you use CCTV cameras. If Windows asks about
   the firewall, choose Allow access.
3. In the app, Settings > CCTV cameras shows **MediaMTX running**.

Shortcut: **`start-app.bat`** in the main folder starts MediaMTX and the analyzer together and
opens the browser.

**Add a camera:** Settings > CCTV cameras > Add camera: name, brand (Hikvision, Dahua / CP Plus,
other RTSP path, or a direct HLS link), IP address, username, password, channel and main or sub
stream. **Save and connect** registers it in MediaMTX. Green dot = picture arriving, amber =
MediaMTX has no picture yet (check IP, password, channel), red = MediaMTX not running. Then
Analyze > CCTV > pick the camera > Start live.

**If a camera does not play: press Test.** The pulse button next to each camera (Settings >
CCTV cameras) checks every step (MediaMTX, the camera picture, the video format, the playlist,
whether this browser can play it) and says what to change. **Start live** runs the same check
first and starts by itself when all is well.

**Camera settings that matter** (Dahua: camera web page > Setting > Camera > Video; Hikvision:
Configuration > Video/Audio):
- Encode mode **H.264**. **H.265 and MJPEG often fail**: MJPEG cannot be played by any browser,
  H.265 only by browsers with H.265 support. Switch off Smart Codec / H.264+ / H.265+.
- **I Frame Interval 25 to 50** (one to two seconds). A long interval makes the video start slowly
  or not at all.
- Use the **main stream**. Sub streams are small (often 704x576): bullet holes need the target to
  fill the picture.

Good to know:
- Run the analyzer and MediaMTX on the **same computer**; the control API refuses other
  computers. Open the analyzer at `http://localhost:3000` (`npm run dev`) or from the built
  `out` folder served locally; a copy hosted on the internet cannot reach MediaMTX.
- Cameras added from the app are forgotten when MediaMTX restarts; the app adds them again
  when you press Start live.
- If the camera feed drops during live view after hits were counted, the last picture and the
  hits are kept for review instead of being lost.
- After updating the analyzer, **close the old MediaMTX window and start it again** so it reads the new `mediamtx.yml`.
- On Linux or macOS download the matching MediaMTX build from
  https://github.com/bluenviron/mediamtx/releases and run `./mediamtx mediamtx.yml` in the
  `mediamtx` folder.
- **Export mediamtx.yml** writes a permanent config with all your cameras (it contains passwords).

---

## How it works

The code is split into layers. Each layer only uses the ones below it.

```text
 UI            src/components   Analyze, Records, Settings screens
 State         src/state        analyzer store, settings, live session controller
 Services      src/services     IndexedDB, camera, worker client, annotation, report
 Vision        src/vision       ring finder, hole detector, trackers (runs in a Web Worker)
 Core          src/core         units, calibration maths, zeroing rules, coaching notes
```

`core` and `vision` are plain TypeScript with no browser APIs, which is why they can be
unit-tested in Node and run inside a Web Worker.

### Ring calibration (`src/vision/ring.ts`)

1. **Coarse (≈480 px):** edges vote along their gradient for possible centres (gradient
   Hough transform). Concentric rings vote for the same centre, so the target centre
   stands out. A tilted ring splits the vote into lobes, so their centroid is tried too.
2. Around the best centres, edges are binned by "elliptical radius" for aspect ratios
   0.75 to 1.32. Rings appear as peaks; a ring must be traced around enough of its
   circumference with continuous edges. The **largest** such ring is the outer ring.
3. **Refine (≈1000 px crop):** edge points near that ring are split into the inner and
   outer edge of the printed line, each gets a robust ellipse fit, and the two are
   averaged. **The calibration sits on the centre of the printed line.**

### Hole detection (`src/vision/holes.ts`)

1. Crop the ring and resample so one hole is about 7–8 px wide.
2. Morphological top-hats: `closing − image` lights up dark spots smaller than a hole
   (holes in white paper); `image − opening` lights up bright spots (holes in the black
   aiming mark). Large printed areas give no response, so holes at the edge of the
   aiming mark are still found.
3. A robust threshold (median + k·MAD) inside the ring. On printed ring radii, measured
   separately in 12 sectors to cope with perspective, the threshold is raised so the line
   thins enough to be removed while a hole on the line keeps its round shape.
4. Each blob must be **hole-sized**, **round**, have a **solid core**, and be darker (or
   lighter) than its surroundings. Blobs the size of two or three holes are split along
   their long axis and flagged.

On the rendered test targets: calibration within about 0.1 %, hole positions within
0.02–0.04 in, and about 1 s per 3000×2250 photo on the (slow, single-core) test machine.

### Live tracking (`src/vision/tracker.ts`, `src/state/live.ts`)

`RingLock` turns noisy ring detections into one fixed calibration and notices if the
camera moves. `HoleTracker` keeps holes in target inches, confirms them over several
frames, keeps marks learned from the clean target out of the count, and numbers hits in
order. Each confirmed hole must also differ from the clean reference picture.

---

## What changed in 2.5.1

- Fixed the Next.js development warning "A tree hydrated but some attributes of the server rendered
  HTML didn't match". Every screen depends on things that exist only in the browser (camera, saved
  records and settings, today's date), so the Analyze, Records and Settings screens are now rendered
  in the browser only (`src/components/ClientOnly.tsx`). If you ever still see it, open the app in a
  private window: a browser extension that edits the page before it loads can cause it.

## What changed in 2.5

- **Fixed: "Live view stopped: manifestLoadError" with a camera that is online.** Cause (reproduced
  with real MediaMTX): the camera sends H.265 or MJPEG, which MediaMTX refused to turn into the old
  playlist format (HTTP 500). MediaMTX now uses fMP4 playlists and keeps them ready all the time, so
  H.265 cameras at least load (browsers with H.265 support play them); MJPEG can never play.
- **Camera check** (Test button in Settings; also runs when you press Start live) names the real
  cause and what to change in the camera, instead of a code like manifestLoadError. It also warns
  about small pictures (sub streams) and slow keyframes.
- Live errors are explained in plain words; the video player waits up to a minute for slow cameras.

## What changed in 2.4

- **Cleaner cards.** Calibrate shows only Auto / Ring / Points; Bullets shows Bullet 1, 2, ...;
  Point of aim shows Centre / Place POA. Tiles and the status strip are equal-size with centred
  text. Result shows Grouping, Error and the Solution, with MPI, sight turns and the length unit
  under a Details dropdown. Group analysis shows grouping type, error and the fix, with the long
  explanations under Details.
- The banner tagline scrolls right to left; the rifle picture is gone.
- **Sub unit / Coy** field for firers (shown in Records, the PDF and the CSV export).
- **Fixed the switch button** (Fires left-handed, Auto capture): its knob overflowed the label.
- **MediaMTX is bundled** with start scripts and in-app instructions. Verified against the real
  MediaMTX v1.21.1: the config, every API call the app makes, camera registration from the form,
  and a full live session (fake RTSP camera, HLS, ring lock, 0 to 5 hits counted, auto capture).
- A dropped camera feed no longer loses the counted hits.
- Length unit (inch / cm / mm) moved to Result > Details and Settings.

## What changed in 2.3: screen layout

The Analyze screen now uses the whole window, in the style of the earlier version:

- **Camo banner** with the title, subtitle, tagline and a How to use button.
- **Left: four numbered steps.** 1 Load picture, 2 Calibrate (Auto, Ring, Points), 3 Bullets
  (every hole with its distance from the aim, Add / Again / Clear) and 4 Point of aim with the
  length unit (inch, cm or mm). A step turns green with a tick when it is done.
- **Centre:** a button bar (Save group, PDF, Re-detect, overlay, End session, Clear target),
  the target, and a status bar (status, grouping, radial error, correction, sight turns).
- **Right:** Result, Firer details, and a Session and notes card with the groups of the
  session and the coaching notes.
- Both side columns stretch to the bottom of the window on every screen size; on small
  screens they scroll, and on phones everything stacks under the target.

Detection fix in the same release: the colour logic added in 2.2 is used only when the
picture really has colour. Grayscale pictures and night-vision (infrared) CCTV use the plain
brightness detector, as before. A test now covers a gray picture sent through the colour path.

## What changed in 2.2: detection tuned on real targets

Tested on six real photos of the issued target (green face, thick black bands,
black aiming mark with a white patch, 30 hand-marked holes):

| Photos | Holes found | False marks |
|---|---|---|
| 5 photos, holes showing the tan backing board | 25 of 25 | 0 |
| 1 photo, crumpled glossy paper, tiny dark holes | 2 of 5 | 5 (shown orange) |

What made the difference:
- **Colour.** Holes show the tan backing board, which differs sharply from green,
  black, white and grey print. A "warm" (red minus green) channel finds holes on green,
  inside the black mark, on the white patch and on the thick bands. When most holes on a
  target are tan, marks without that colour (fold creases, glare, print edges) are dropped.
- **Torn holes** count as one hole, not two.
- **Small holes:** paper often closes up to about half the calibre; photos get a second
  pass at half size.
- **Holes on the outer band** are searched for (tan holes up to the outer edge).
- Printed-line rejection now uses shape (narrow and stretched along the ring), so small
  round holes on ring radii are kept.

Add your own photos to the test set: circle every hole in pure red, put the photos in a
folder and run `python3 tests/fixtures/prep_real.py <folder>`, then `npm test`.

## What changed in 2.1

- Cleaner screens: one-word steps bar, short labels, details folded away; navy and
  brass colour scheme; pop-ups for calibration, bullet marks, saving and cameras.
- Sessions with see-through overlays of earlier groups; earlier holes are not counted
  again (photo and live).
- CCTV cameras added in Settings with IP, username and password; registered in MediaMTX
  automatically through its Control API, with live status.
- New PDF result sheet with group close-up and session table.
- Two-point manual calibration.
- "How to use" guide and credit footer.

## What changed from version 1

- **Automatic calibration** from the 32 in ring replaces the two-click scale.
- **Automatic hole detection** for photos and live video, with manual editing kept.
- **Resolution-independent analysis.** Everything is measured in inches on the target.
  Version 1's coaching rules used raw pixel thresholds, so the same group gave different
  advice on different photos.
- **Correct correction direction.** Version 1 stored sight rotations without a sign, so
  the report always printed RIGHT/UP. Corrections now state the direction.
- **Records in IndexedDB** (version 1 used localStorage, which fills up quickly with
  images), with per-firer history, trend, weapons view, backup/restore and CSV.
- **Detection off the main thread** in a Web Worker; video and UI stay smooth.
- **Printing** through a hidden frame instead of a pop-up window.
- CCTV lanes are edited in Settings instead of being hard-coded.
- Lighter dependency set (no unused UI kit), light and dark themes, phone layout,
  keyboard shortcuts, undo.
- The firing-cycle animation from version 1 was not carried over; the files are still in
  the old repository if you want it back.

---

## Limits to know

- **Strong perspective** (camera well off to the side) is not corrected; only mild tilt
  is. Keep the camera roughly square-on.
- A **hole cutting the edge of the black aiming mark** in low contrast can be missed:
  part of it is light and part dark. Add it in review with one click.
- **Touching holes** are split by size; check orange marks.
- In live view, a new hole landing within ~0.6 in of a printed numeral is ignored. Add it
  in review after capture.
- Hole size: the calibre setting is only a starting size. Holes from about 0.7x to
  1.7x of it are found (tested from 5.56 mm holes to 12.7 mm torn holes with the 7.62 mm
  setting). Wider differences need tuning on real photos.
- The detector was tuned and tested on **rendered** targets. Real targets, cameras and
  lighting differ, so check the first sessions against manual marking and adjust
  *Sensitivity* and *Minimum certainty* in Settings if needed. If you share a few real
  photos (clean and fired), the thresholds can be tuned to your exact targets.

---

## Tests

```bash
npm test
```

- `tests/analysis.test.ts`: zeroing rules, BD-08 turns and direction, classification.
- `tests/vision.test.ts`: ring detection (straight, tilted, large photo, no target), holes
  (in the aiming mark, on a ring line, touching, clean target, positional accuracy),
  live lock and tracking, uneven light and noise.
- `tests/realistic.test.ts` and `tests/livesim.test.ts`: rendered photo and a replayed
  40 s live session (needs fixtures, see `tests/fixtures/README.md`; skipped otherwise).
- `tests/e2e/`: browser tests. `e2e_live.py` (scripted camera), `e2e_features.py` (sessions, PDF,
  calibration, camera form) and `cctv_e2e.py` (real MediaMTX + ffmpeg fake RTSP camera + HLS;
  needs MediaMTX, ffmpeg and Playwright; see the comments in the file) and `camera_check_e2e.py`
  (the camera check against fake H.264 / H.265 / MJPEG / VP9 cameras).

For diagnosis in the browser console during live view: `__rfaLive.debug()`.

---

## Project structure

```text
mediamtx/              mediamtx.yml ready for the app (Control API + HLS)
src/
  app/                 Next.js routes: / (Analyze), /records, /settings
  components/
    analyzer/          TargetStage, StageToolbar, SourcePanel, PipelineRail,
                       ResultPanel, SessionPanel, useAnalysis
    records/           RecordsScreen, FirerDialog, SessionDialog, TrendChart
    settings/          SettingsScreen
    ui.tsx, AppShell.tsx
  core/                types, rules, geometry, calibration, analysis, diagnostics
  vision/              image ops, frame sources, ring, holes, ellipse fit,
                       tracker, pipeline, worker
  services/            db (Dexie), records, camera, vision client, annotate, report
  state/               analyzer store, settings store, live session
  lib/                 formatting, session builder, hooks
tests/                 unit, vision, replay tests; fixtures; browser test
```

Stack: Next.js 16 (static export), React 19, TypeScript, Tailwind CSS 4, Zustand, Dexie,
hls.js, lucide-react, Barlow / Barlow Condensed (bundled, works offline).
