# Remote Firing Analyzer v2.0

A redesigned digital target-analysis workspace with a clear layer-by-layer workflow, improved CCTV/camera handling, manual bullet marking, and an ML-ready Auto Detect path.

## What changed in v2

The application is now organized around seven operator stages:

1. Target Source
2. Calibration
3. Bullet Marking
4. Point of Aim
5. Analysis
6. Review
7. Save / Report

The frontend has been rebuilt as a responsive three-panel workspace:

- Left: workflow progress and firer/weapon details
- Centre: target source, camera, marking tools and image canvas
- Right: result summary, MPI/correction, feedback and report actions

## Manual and ML marking

Manual marking remains fully available.

Auto Detect is implemented as an integration layer. The web application sends the target image to a configurable ML endpoint and converts returned bullet coordinates into editable target marks. If the ML endpoint is not configured, the application clearly reports that condition and does not generate fake detections.

Expected ML response:

~~~json
{
  "detections": [
    { "x": 412, "y": 318, "confidence": 0.96 },
    { "x": 506, "y": 401, "confidence": 0.92 }
  ],
  "model": "bullet-detector-v1",
  "inferenceMs": 84
}
~~~

After Auto Detect, the operator can remove incorrect detections and use Manual Mark to add missed bullet holes.

## Architecture

~~~text
Target Source
   |
   +-- Upload
   +-- Local Camera
   +-- CCTV / HLS
   |
   v
Presentation Layer
   |
   v
Workflow Controller
   |
   +-- Calibration
   +-- Manual Marking
   +-- ML Auto Detect Adapter
   +-- POA Marking
   |
   v
Analysis Domain
   |
   +-- Grouping
   +-- MPI
   +-- Radial Error
   +-- Configured Zeroing Assessment
   |
   v
Review / Persistence / Report
~~~

## Main folders

~~~text
app/
  page.tsx
  layout.tsx
  globals.css

components/
  AnalyzerContainer.tsx
  AppHeader.tsx
  WorkflowRail.tsx
  AnalysisPanel.tsx
  ImageCanvas.tsx
  CameraCapture.tsx
  StreamPlayer.tsx

hooks/
  useSessions.ts

lib/
  config.ts
  calculations.ts
  exportReport.ts
  firingClassification.ts
  ml/
    detector.ts

types/
  index.ts
~~~

## Environment

Copy .env.example to .env.local when running locally.

~~~text
NEXT_PUBLIC_STREAM_BASE_URL=http://localhost:8888
NEXT_PUBLIC_STREAM_CAMERA_COUNT=12
NEXT_PUBLIC_ML_API_URL=http://localhost:8000/detect
NEXT_PUBLIC_ML_CONFIDENCE_THRESHOLD=0.50
~~~

For a deployed system, replace localhost with the actual range streaming server and ML inference service.

## Development

~~~bash
pnpm install
pnpm dev
~~~

Open http://localhost:3000.

Run strict checks with:

~~~bash
pnpm typecheck
pnpm build
~~~

The project uses Next.js static export, so the production output is generated in out/.

## Camera notes

HLS playback uses hls.js where native HLS is unavailable. Network camera URLs are generated from NEXT_PUBLIC_STREAM_BASE_URL and NEXT_PUBLIC_STREAM_CAMERA_COUNT.

To capture a frame from a network stream, the HLS server must allow the web application's origin through CORS.

## Session storage

The current version stores sessions in browser localStorage. Small marked-target images may be stored inline, while large images are omitted to avoid browser quota failures.

A central database/storage service can be added later without changing the analysis layer.

## Design principles

- Layer-by-layer operator workflow
- Manual fallback remains available
- Human verification of ML output
- No fabricated ML result when the model service is unavailable
- Typed domain model
- Strict TypeScript build
- Configuration separated from UI
- Camera and ML integrations isolated from analysis logic
- One report generator
- Responsive desktop/tablet layout

## Deployment

The repository remains compatible with Firebase Hosting through static export.

~~~bash
pnpm build
firebase deploy --only hosting
~~~

## Current ML status

The frontend Auto Detect workflow and ML service adapter are ready.

The actual trained bullet-hole detection model is a separate component and must be connected through NEXT_PUBLIC_ML_API_URL.
