# Remote Firing Analyzer

Rifle zeroing analysis from a **photo**, a **camera** or a **CCTV lane**.

The app finds the 32 in outer ring of the target by itself to calibrate the picture, detects every
bullet hole, and works out the group size, the mean point of impact (MPI), the radial error and the
BD-08 sight correction. Results are saved per firer, with a printable PDF result sheet.

Everything runs in the browser. There is no server to maintain and no internet is needed once it is
installed. The camera server (MediaMTX) is the only extra program, and only for CCTV cameras.

> Bangladesh Army | Digital Target Analysis and Rifle Zeroing System
> *Zero the weapon, zero the target, zero the doubt.*

---

## Features

- **Automatic calibration** from the 32 in outer ring (handles a camera that looks slightly up or
  sideways at the target). Manual options: drag the ring, or click two points a known distance apart.
- **Automatic hole detection** on photos and live video: on white paper, inside the black aiming
  mark, on the thick ring bands, and touching holes (flagged for a check). The calibre is only a
  starting size, so smaller and torn holes are found too.
- **Live view** from a USB/laptop camera or a CCTV camera: the ring locks, the clean target is read,
  then only new holes are counted, in firing order. A frame is captured by itself when all rounds are in.
- **Sessions:** one firer fires several groups. Earlier groups stay on screen as see-through marks
  and are not counted again.
- **BD-08 sight correction** in cm and in sight turns, with the direction the MPI must move.
- **Records** in the browser (IndexedDB): firers (personal number, rank, name, unit, sub unit / Coy,
  photo), every group with its target picture, a trend chart, a weapons view, backup / restore and CSV export.
- **PDF result sheet** with status, firer, measurements, correction, the whole target, a group
  close-up, the session table, coaching notes and signature lines.
- **CCTV set-up inside the app:** add a camera by IP, username and password; the app registers it in
  MediaMTX for you, and a **Test** button says what is wrong if a camera does not play.
- Light and dark themes, phone layout, keyboard shortcuts, undo.

---

## Quick start (Windows)

You need **Node.js 20 or newer** (https://nodejs.org, LTS) and a modern browser (Chrome or Edge).

```bash
npm install
npm run dev
```

Open **http://localhost:3000**.

| Command | What it does |
|---|---|
| `npm run dev` | Development server on port 3000 |
| `npm run build` | Builds the static site into `out/` |
| `npm start` | Serves the built `out/` folder |
| `npm run lint` | Type-check (`tsc --noEmit`) |
| `npm test` | Runs the unit, vision and replay tests |

**Shortcut:** double-click `start-app.bat`. It starts MediaMTX, the analyzer, and opens the browser.

Cameras need a secure page: use `http://localhost` or `https://`. A plain `http://192.168.x.x`
address makes the browser block the camera.

---

## Using it

1. **Load a picture.** Choose a photo (or drop one on the picture), start a camera, or start a CCTV camera.
2. **Calibration.** The 32 in ring is found automatically. If it is off, use **Ring** (drag the
   handles) or **Points** (click two points a known distance apart, type the distance).
3. **Bullets.** Holes are marked automatically. Drag a mark to move it, use **Add** for a missed hole,
   right-click a mark to delete it. Orange marks need a look.
4. **Point of aim.** **Centre** (the ring centre) or **Place POA** (click where the firer aimed).
5. **Save group.** Choose the firer, add the weapon number and range, press **Save group**.
   **Next group** keeps the earlier holes as an overlay for the same firer. **PDF** downloads the result sheet.

### Live view

- Start it **before** firing. The ring locks, then the app reads the clean target (hold fire for a few
  seconds); marks already on the paper are ignored.
- A hole counts once it is seen on several frames and its spot really changed. Hits are numbered in order.
- When all rounds are in and nothing changes for 2.5 s, the frame is frozen for review (switch off in
  Settings). **Capture** does it by hand.
- If the camera feed drops after hits were counted, the last picture and the hits are kept for review.
- To analyse a target that already has holes, press **Capture** or load a photo.

### Keyboard

| Key | Action |
|---|---|
| V | Move |
| A | Add hit |
| P | Place aiming point |
| R | Adjust ring |
| M | Two-point calibration |
| Delete / right-click | Delete a mark |
| Ctrl + Z | Undo |
| + / − / 0 | Zoom in / out / fit |

Mouse wheel zooms; on a phone or tablet, pinch.

---

## CCTV cameras (MediaMTX)

Browsers cannot play a camera's RTSP stream. **MediaMTX** (free, MIT licence) converts it into video
the browser can play. The analyzer talks to it for you.

**1. Get and start MediaMTX**

- Put `mediamtx.exe` (Windows 64-bit, v1.21.1 or newer) into the `mediamtx` folder. Download it from
  https://github.com/bluenviron/mediamtx/releases if it is not already there.
- Double-click **`mediamtx/start-mediamtx.bat`**. A black window opens: **keep it open** while you use CCTV.
  If Windows asks about the firewall, choose Allow access.
- In the app, **Settings > CCTV cameras** should say *MediaMTX running*.

On Linux or macOS, download the matching build and run `./mediamtx mediamtx.yml` in the `mediamtx` folder.

**2. Add a camera**

Settings > CCTV cameras > **Add camera**: name, brand (Hikvision, Dahua / CP Plus, other RTSP path, or
a direct HLS link), IP address, username, password, channel and main or sub stream.
**Save and connect** registers it. Green dot: picture arriving. Amber: MediaMTX has no picture yet
(check IP, password, channel). Red: MediaMTX is not running.

**3. Use it.** Analyze > **CCTV** > pick the camera > **Start live**. A check runs first and shows what
is wrong, if anything.

**Camera settings that matter** (Dahua: web page > Setting > Camera > Video; Hikvision:
Configuration > Video/Audio):

- Encode mode **H.264**. H.265 only plays in browsers with H.265 support, and **MJPEG cannot be played
  by any browser**. Switch off Smart Codec / H.264+ / H.265+.
- **I Frame Interval 25 to 50** (one to two seconds). A long interval makes the video start slowly or not at all.
- Use the **main stream**. Sub streams are small (often 704×576), and bullet holes need the target to
  fill the picture.

**Camera not playing?** Press the **Test** button (pulse icon) next to it in Settings. It checks
MediaMTX, the camera picture, the video format, the playlist and whether your browser can play it, and
tells you what to change. **Copy report** gives you text to send for support.

Good to know:

- Run the analyzer and MediaMTX on the **same computer**. The control API only answers that computer.
- Open the analyzer at `http://localhost:3000` (or the built `out/` folder served locally). A copy hosted
  on the internet cannot reach MediaMTX.
- After changing `mediamtx.yml`, close the MediaMTX window and start it again.
- Cameras added from the app are forgotten when MediaMTX restarts; the app adds them again when you
  press Start live. **Export mediamtx.yml** writes a permanent config with your cameras. It contains
  passwords, so **never commit it**.

---

## Rules

The defaults follow the original RFA rule set and can be changed in **Settings**.

| Rule | Default |
|---|---|
| Rounds per group | 5 |
| Largest group allowed | 10 in |
| Zero tolerance (MPI to aiming point) | 5 cm |
| BD-08 lateral / vertical | 32 cm / 24 cm per sight turn |
| Calibration ring | 32 in diameter |
| Marksman / First class / Standard firer | group up to 4 / 7 / 10 in |

**Zeroed**: the MPI is within tolerance. **Adjust sights**: the MPI is outside tolerance. **Washout**:
wrong number of rounds, or a group over the limit. While rounds are missing the status is *Waiting for
rounds*, and a group saved in that state is stored as a washout.

The correction says which way the **MPI must move** to reach the aiming point, in cm and in sight turns.

---

## Records and backup

Firers and groups are stored in the browser (IndexedDB) on **this computer**.

- **Records > Firers:** search, history, trend chart, edit, delete.
- **Records > Weapons:** latest result per weapon number and when it was last zeroed.
- **Back up / Restore:** one JSON file with everything, including pictures. Back up regularly: browser
  data is lost if someone clears the site data.
- **Export CSV:** all groups for Excel.

---

## Getting good results

- **Fill the frame.** Aim for the outer ring to be about 1000 px or more across in the picture.
  Below roughly 600 px, holes and printed numerals start to look alike. The app warns about small pictures.
- **Square-on.** Mild tilt is corrected; strong side angles are not.
- **Even light**, no hard shadows across the target.
- **Holes show the backing board.** On the issued green target the holes show tan board, which gives the
  most reliable detection. Black-and-white pictures (for example night-vision CCTV) use brightness only
  and are less certain.
- Check the first sessions against manual marking and adjust *Sensitivity* and *Minimum certainty*
  in Settings if needed.

---

## How it works

Layers, each using only the ones below it:

```text
UI         src/components   Analyze, Records, Settings screens
State      src/state        analyzer store, settings, live session controller
Services   src/services     IndexedDB, camera, MediaMTX, PDF, annotation, worker client
Vision     src/vision       ring finder, hole detector, trackers (runs in a Web Worker)
Core       src/core         units, calibration maths, zeroing rules, coaching notes
```

`core` and `vision` are plain TypeScript with no browser APIs, so they run in Node for tests and in a
Web Worker in the browser.

- **Ring calibration.** Edges vote for ring centres (gradient Hough transform); the largest ring traced
  around enough of its circumference is the outer ring; an ellipse fit on the inner and outer edge of the
  printed line gives the centre of the line. Horizontal and vertical scales are separate.
- **Hole detection.** The ring area is resampled so a hole is about 7 px wide. Morphological top-hats find
  dark spots (holes in paper) and light spots (holes in the black mark), and a colour channel finds the
  tan backing board. Printed ring lines are suppressed per radius and angle; each candidate must be
  hole-sized, round, solid and different from its surroundings. Pairs of touching holes are split and flagged.
- **Live tracking.** A ring lock fixes the calibration. The clean target is read first; each new hole must
  appear on several frames and differ from the reference picture.

All measurements are made in inches on the target, so results do not depend on camera resolution.

---

## Tech stack

Next.js 16 (static export) · React 19 · TypeScript · Tailwind CSS 4 · Zustand · Dexie (IndexedDB) ·
hls.js · jsPDF · lucide-react · Barlow / Barlow Condensed fonts (bundled, work offline) · MediaMTX.

---

## Project structure

```text
mediamtx/              MediaMTX config and start script (put mediamtx.exe here)
src/
  app/                 Next.js routes: / (Analyze), /records, /settings
  components/
    analyzer/          target stage, step cards, result, firer, action and status bars
    records/           records screen, firer and group dialogs, trend chart
    settings/          settings screen, camera dialogs and camera check
  core/                types, rules, geometry, calibration, analysis, diagnostics
  vision/              image operations, ring, holes, ellipse fit, trackers, worker
  services/            database, records, camera, MediaMTX, PDF, annotation
  state/               analyzer store, settings store, live session
  lib/                 formatting and helpers
tests/                 unit, vision and replay tests, fixtures, browser tests
start-app.bat          starts MediaMTX and the analyzer together (Windows)
```

---

## Tests

```bash
npm test
```

- `analysis.test.ts`: zeroing rules, BD-08 turns and direction, classification.
- `vision.test.ts`: ring detection (straight, tilted, large photo, no target), holes (in the aiming mark, on
  a ring line, touching, mixed sizes, clean target, accuracy), live lock and tracking, grayscale pictures.
- `real.test.ts`: real target photos with hand-marked holes (needs the photo set; see
  `tests/fixtures/README.md`; skipped when absent).
- `realistic.test.ts`, `livesim.test.ts`: rendered photo and a replayed live session (need fixtures; skipped when absent).
- `tests/e2e/`: browser tests (Playwright): live mode with a scripted camera, the main screens, and the CCTV
  chain with a real MediaMTX and a fake camera.

To add your own photos to the test set: circle every hole in pure red, put the photos in a folder and run
`python3 tests/fixtures/prep_real.py <folder>`, then `npm test`.

---

## Build and deploy

```bash
npm run build      # static site in out/
```

Copy `out/` to any web server, or to Firebase Hosting (`firebase deploy --only hosting`). A hosted copy
works for photos and USB cameras, but **not for CCTV**, because the browser cannot reach MediaMTX from there.

---

## Known limits

- Strong camera perspective is not corrected, only mild tilt.
- A hole cutting the edge of the black aiming mark in low contrast can be missed: add it with **Add**.
- Touching holes are split by size; check the orange marks.
- In live view, a new hole within about 0.6 in of a printed numeral is ignored: add it in review after capture.
- Detection was tuned on rendered targets and six real photos. Check new targets, cameras and lighting
  against manual marking.

---

## Version history

| Version | Highlights |
|---|---|
| 2.0 | Rebuild: automatic calibration, automatic hole detection, live view, local records |
| 2.1 | Sessions with overlays, CCTV set-up through MediaMTX, new PDF sheet, two-point calibration |
| 2.2 | Detection tuned on real target photos (colour channel, torn and small holes) |
| 2.3 | Full-window layout with step cards and status bar |
| 2.4 | Cleaner cards, sub unit / Coy, bundled MediaMTX with start scripts |
| 2.5 | Camera check (Test button), fMP4 playlists for H.265 cameras, plain error messages |
| 2.5.1 | Screens render in the browser only (no hydration warnings) |

---

## Credits and licence

© BA-9388 Maj Noor Mohammad Nofaer, Sigs & BA-11108 Capt Asif Mahmud, Sigs

All rights reserved unless the authors state otherwise.

[MediaMTX](https://github.com/bluenviron/mediamtx) is a separate project by bluenviron, released under
the MIT licence.
