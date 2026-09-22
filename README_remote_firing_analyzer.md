# Remote Firing Analyzer

A web-based digital target analysis and rifle zeroing system designed to assist instructors and firers in analyzing firing results from target images and live/recorded camera feeds.

The system currently supports **manual bullet-hole marking** and is being upgraded to support **automatic bullet-hole detection using a Machine Learning (ML) model**, while keeping the manual method available as a fallback.

---

## 1. Project Overview

The **Remote Firing Analyzer (RFA)** is intended to make rifle zeroing and firing analysis faster, more consistent, and easier to document.

The system can:

- Load a target image from a computer.
- Capture a target image from a camera/CCTV source.
- Calibrate the target using a known reference distance.
- Mark bullet holes manually.
- **Automatically detect bullet holes using an ML model** *(planned/upcoming upgrade)*.
- Allow the user to review, add, move, or remove automatically detected marks.
- Mark the Point of Aim (POA).
- Calculate grouping size.
- Calculate Mean Point of Impact (MPI).
- Calculate radial error.
- Determine whether the weapon is zeroed.
- Suggest BD-08 sight correction.
- Show firing classification and training feedback.
- Save firing sessions.
- Export a printable firing report.

---

## 2. Main Features

### Target Image Input

The system supports:

- Image upload
- Local/browser camera capture
- CCTV / HLS camera stream
- Multiple camera selection

### Manual Bullet Marking

The existing system allows the operator to manually mark bullet impacts on the target.

Manual marking remains available even after automatic detection is introduced.

### Automatic Bullet Detection — ML Upgrade

A new **Auto Detect** option will be added.

When the operator selects **Auto Detect**:

1. The target image is sent to the bullet-hole detection model.
2. The ML model identifies probable bullet impacts.
3. Detected bullet coordinates are returned to the application.
4. The detected points are shown on the target.
5. The operator reviews the result.
6. Incorrect marks can be deleted or adjusted.
7. Missing bullet holes can be added manually.
8. Confirmed marks are used for firing analysis.

The system will therefore support two marking methods:

```text
                TARGET IMAGE
                     |
              Choose Marking Mode
                     |
          +----------+----------+
          |                     |
     MANUAL MARK            AUTO DETECT
          |                     |
   User clicks holes        ML model detects
          |                     |
          +----------+----------+
                     |
               Review Marks
                     |
              Mark Point of Aim
                     |
             Analyze Firing
```

---

## 3. Current Analysis Rules

The present implementation is based on a five-round zeroing group.

| Parameter | Rule |
|---|---|
| Required rounds | 5 |
| Maximum accepted grouping | 10 inches |
| Zeroing tolerance | 5 cm radial error |
| BD-08 lateral adjustment | 32 cm per full rotation |
| BD-08 vertical adjustment | 24 cm per full rotation |

### Result Status

The system can return:

- **ZEROED**
- **ADJUSTMENT REQUIRED**
- **WASHOUT**
- **INCOMPLETE**

A firing group is treated as **WASHOUT** if the number of rounds is not exactly five or if the grouping exceeds the accepted limit.

---

## 4. Firing Classification

The application currently uses the following grouping-based classification:

| Grouping | Classification |
|---|---|
| Up to 4 inches | Marksman |
| Above 4 to 7 inches | First Class Firer |
| Above 7 to 10 inches | Standard Firer |
| Above 10 inches | Requires Training |

---

## 5. System Workflow

```text
START
  |
  v
Load / Capture Target Image
  |
  v
Calibrate Target
  |
  v
Choose Bullet Marking Method
  |
  +-----------------------------+
  |                             |
  v                             v
Manual Marking              Auto Detect
  |                             |
  |                       ML Detection Model
  |                             |
  +-------------+---------------+
                |
                v
        Review / Edit Marks
                |
                v
        Mark Point of Aim
                |
                v
     Grouping + MPI Calculation
                |
                v
        Zeroing Assessment
                |
                v
     Correction + Feedback
                |
                v
      Save / Export Report
                |
                v
               END
```

---

## 6. System Architecture

```text
+----------------------+
|     IMAGE SOURCE     |
|----------------------|
| Upload Image         |
| Local Camera         |
| CCTV / HLS Stream    |
+----------+-----------+
           |
           v
+------------------------------+
|      NEXT.JS WEB APP         |
|------------------------------|
| Image Capture                |
| Calibration                  |
| Manual Marking               |
| Auto Detect Interface        |
| Mark Review / Editing        |
| Zeroing Calculation          |
| Session Management           |
| Report Generation            |
+-----------+------------------+
            |
            | Auto Detect
            v
+------------------------------+
|     ML DETECTION MODULE      |
|------------------------------|
| Image Pre-processing         |
| Bullet-hole Detection Model  |
| Confidence Filtering         |
| Coordinate Output            |
+-----------+------------------+
            |
            v
+------------------------------+
|           OUTPUT             |
|------------------------------|
| Bullet Markers               |
| Grouping                     |
| MPI                          |
| Radial Error                 |
| Zeroing Correction           |
| Classification               |
| Training Feedback            |
| Printable Report             |
+------------------------------+
```

---

## 7. Technology Stack

### Frontend

- Next.js
- React
- TypeScript
- Tailwind CSS
- shadcn/Radix UI components

### Video / Camera

- Browser camera APIs
- HLS video streaming
- `hls.js`
- CCTV / MediaMTX-compatible HLS streams

### Analysis

- Custom TypeScript calculation engine
- Pixel-to-real-world scale calibration
- Grouping and MPI calculation
- BD-08 sight correction calculation

### Storage

Current version:

- Browser `localStorage`

Future options:

- Firebase / Firestore
- Supabase
- Central server/database

### Machine Learning Upgrade

Planned ML module:

- Bullet-hole object detection
- Confidence-based filtering
- Automatic coordinate generation
- Human verification before analysis

The final framework/model may be selected after dataset preparation and testing.

---

## 8. Project Structure

```text
remote_firing_analyzer/
|
+-- app/
|   +-- page.tsx
|   +-- layout.tsx
|   +-- globals.css
|
+-- components/
|   +-- AnalyzerContainer.tsx
|   +-- CameraCapture.tsx
|   +-- StreamPlayer.tsx
|   +-- ImageCanvas.tsx
|   +-- ControlsSidebar.tsx
|   +-- ResultsSidebar.tsx
|   +-- FirerInfoModal.tsx
|   +-- SessionsModal.tsx
|   +-- ResultsModal.tsx
|   +-- WpnDetailsModal.tsx
|   +-- Header.tsx
|   +-- Footer.tsx
|   +-- ui/
|
+-- hooks/
|   +-- useSessions.ts
|
+-- lib/
|   +-- calculations.ts
|   +-- firingClassification.ts
|   +-- firingFeedback.ts
|   +-- exportReport.ts
|
+-- public/
|
+-- types/
|   +-- index.ts
|
+-- firebase.json
+-- next.config.mjs
+-- package.json
+-- pnpm-lock.yaml
+-- postcss.config.mjs
+-- tsconfig.json
```

---

## 9. Getting Started

### Requirements

Install:

- Node.js LTS
- pnpm
- Git

### Clone the Repository

```bash
git clone https://github.com/Mahmud629/remote_firing_analyzer.git
cd remote_firing_analyzer
```

### Install Dependencies

```bash
pnpm install
```

### Run the Development Server

```bash
pnpm dev
```

Open:

```text
http://localhost:3000
```

---

## 10. Production Build

The project currently uses Next.js static export.

Run:

```bash
pnpm build
```

The generated static site is created in:

```text
out/
```

---

## 11. Firebase Hosting

The project is configured for Firebase Hosting.

Firebase project:

```text
remote-firing-analyzer
```

Deploy using:

```bash
firebase login
firebase use remote-firing-analyzer
firebase deploy --only hosting
```

---

## 12. CCTV / HLS Camera Support

The current project supports HLS streams such as:

```text
http://localhost:8888/cam1/index.m3u8
http://localhost:8888/cam2/index.m3u8
...
```

For real deployment, the stream server address should be changed from `localhost` to the actual MediaMTX/CCTV server address.

Example:

```text
http://192.168.1.100:8888/cam1/index.m3u8
```

or, for secure web deployment:

```text
https://your-stream-server/cam1/index.m3u8
```

> Cross-origin/CORS settings must allow video frame capture when the HLS server and web application are hosted on different origins.

---

## 13. ML Bullet Detection Upgrade

The automatic detection upgrade should follow this pipeline:

```text
Target Image
     |
     v
Image Pre-processing
     |
     v
ML Detection Model
     |
     v
Detected Bullet Candidates
     |
     v
Confidence Filtering
     |
     v
Bullet Coordinates
     |
     v
Display on Target
     |
     v
Human Review
     |
     v
Confirm / Edit / Delete / Add
     |
     v
Zeroing Analysis
```

### ML Dataset Requirements

The dataset should include:

- Clean target images
- Used target images
- Different lighting conditions
- Different camera distances
- Different target angles
- Different bullet-hole sizes
- Torn paper around bullet impacts
- Overlapping or closely grouped bullet holes
- Shadows
- Printed target markings
- Previous bullet holes where applicable
- Background/noise examples

Each bullet hole should be accurately annotated.

### Recommended ML Output

The model should return at least:

```text
x-coordinate
y-coordinate
confidence score
```

Example:

```json
[
  {
    "x": 412,
    "y": 318,
    "confidence": 0.96
  },
  {
    "x": 505,
    "y": 401,
    "confidence": 0.93
  }
]
```

The web application can convert these coordinates directly into target markers.

---

## 14. Manual + Automatic Detection Logic

Automatic detection must not replace manual control.

The intended rule is:

```text
AUTO DETECT = Faster marking
MANUAL MARK = Operator-controlled fallback
```

After auto detection, the operator must be able to:

- Accept all detected marks
- Remove false detections
- Add missed bullet holes
- Re-run detection
- Clear detected marks
- Switch to manual mode

This keeps the final firing analysis under instructor/operator control.

---

## 15. Session and Report Data

A firing session may contain:

- Firer name
- Rank
- BA/Soldier number
- Weapon serial number
- Date
- Range
- Target image
- Calibration information
- Bullet coordinates
- Marking method (`manual` or `auto`)
- ML confidence values where applicable
- Point of Aim
- Grouping
- MPI
- Radial error
- Zeroing status
- Sight correction
- Classification
- Training feedback
- Saved date/time

---

## 16. Known Limitations of the Current Version

Current limitations include:

- Bullet holes must presently be marked manually.
- Session data is primarily stored in browser local storage.
- CCTV URLs are currently configured for local development.
- Historical target-image storage is limited by browser storage.
- The application is mainly optimized for desktop use.
- Firing-pattern feedback still contains some pixel-based thresholds.
- The current system does not yet perform automatic computer-vision detection.

---

## 17. Planned Improvements

### Version 2.0

- [ ] Train bullet-hole detection ML model
- [ ] Add **Auto Detect** button
- [ ] Display detected bullet holes automatically
- [ ] Add confidence threshold
- [ ] Add operator review/edit step
- [ ] Allow switching between Manual and Auto modes
- [ ] Save detection method with session
- [ ] Improve CCTV stream configuration
- [ ] Improve report generation

### Future

- [ ] Central database
- [ ] User authentication
- [ ] Multiple instructor/operator accounts
- [ ] Weapon history
- [ ] Firer performance history
- [ ] Multiple target types
- [ ] Multiple weapon profiles
- [ ] Automatic POA detection
- [ ] Multi-camera range dashboard
- [ ] Automatic firing-session tracking
- [ ] Mobile/tablet optimization
- [ ] CSV/Excel export
- [ ] Statistical firing analysis

---

## 18. Development Principle

The project follows a **human-in-the-loop** approach.

Machine Learning will assist the instructor by detecting bullet holes automatically, but the operator will still be able to verify and correct the detected points before the final zeroing calculation is performed.

This provides both:

- **Speed through automation**
- **Reliability through human verification**

---

## 19. Safety and Intended Use

The Remote Firing Analyzer is a **training and analysis aid**.

The system should not replace authorized firing-range procedures, weapon safety rules, instructor supervision, or official weapon-zeroing instructions.

All firing and weapon adjustments must be carried out by trained and authorized personnel.

---

## 20. Repository

**GitHub:** `Mahmud629/remote_firing_analyzer`

Repository:

```text
https://github.com/Mahmud629/remote_firing_analyzer
```

---

## 21. Project Status

**Current:** Functional manual target-analysis prototype

**Next major upgrade:** ML-based automatic bullet-hole detection with manual verification and fallback

```text
Manual Detection       : AVAILABLE
Image Upload           : AVAILABLE
Camera Capture         : AVAILABLE
CCTV / HLS             : AVAILABLE
Calibration            : AVAILABLE
Grouping Calculation   : AVAILABLE
MPI Calculation        : AVAILABLE
Zeroing Assessment     : AVAILABLE
BD-08 Correction       : AVAILABLE
Session Save           : AVAILABLE
Printable Report       : AVAILABLE
Automatic ML Detection : UNDER DEVELOPMENT
```

---

## License

No open-source license has currently been specified for this repository.
