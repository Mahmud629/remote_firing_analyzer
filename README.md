# Remote Firing Analyzer v3.0

Remote Firing Analyzer v3 adds automatic target calibration, an ML-ready bullet detection pipeline, and Firebase/Firestore record storage while keeping manual marking and manual calibration fallback.

## V3 workflow

~~~text
Target Upload / Live Camera Capture
              |
              v
Automatic Outer-Circle Detection
              |
              v
Scale Calibration from Known Radius
              |
              v
Normalize Target to 1024 x 1024
              |
              v
ML Bullet-Hole Detection
              |
              v
Operator Review / Manual Correction
              |
              v
Mark Point of Aim
              |
              v
Grouping + MPI + Radial Error
              |
              v
Save Firer + Session Record
              |
              v
Print / Export Report
~~~

## Automatic calibration

The application detects the large outer target circle automatically.

Current configured target geometry:

~~~text
Outer-circle radius = 32 inches
~~~

The detected radius in pixels becomes the image scale:

~~~text
pixels per inch = detected circle radius in pixels / 32
~~~

The detected circle is drawn on the target with a confidence percentage.

> Important: the project currently treats 32 inches as the radius because that is the current requirement. If 32 inches is actually the full diameter, set NEXT_PUBLIC_TARGET_OUTER_RADIUS_INCHES=16.

If automatic circle detection fails, Manual Cal remains available as a fallback.

## Camera/CCTV behavior

When Capture Target is pressed from the live camera view, the application automatically:

1. Captures the current frame.
2. Detects the outer target circle.
3. Sets the calibration scale.
4. Crops and normalizes the target.
5. Sends the normalized target to the configured ML endpoint.
6. Maps detected bullet coordinates back to the original target image.
7. Displays the detected marks for operator verification.

If the ML service is not configured, automatic calibration still works and the application switches to manual bullet marking.

## ML API contract

The ML model receives a normalized square target image.

Default normalized size:

~~~text
1024 x 1024 pixels
~~~

Expected response:

~~~json
{
  "detections": [
    { "x": 420, "y": 315, "confidence": 0.97 },
    { "x": 506, "y": 402, "confidence": 0.93 }
  ],
  "model": "bullet-detector-v1",
  "inferenceMs": 85
}
~~~

The x/y coordinates must refer to the normalized target image.

## Database

V3 can store two types of Firestore records.

### firers

~~~text
firers/{BA-or-Snk-No}
  serviceNumber
  name
  rank
  weaponSerial
  lastRange
  lastSessionAt
  updatedAt
~~~

### sessions

~~~text
sessions/{sessionId}
  firerId
  firerInfo
  results
  calibration
  markingMode
  sourceType
  savedAt
  createdAt
~~~

Large target images are not stored directly inside Firestore documents.

The browser continues to save the current session locally as a fallback.

## Firebase setup

The project already contains Firestore security rules requiring an authenticated Firebase user.

For the present prototype the application uses Firebase Anonymous Authentication. Before operational deployment, replace this with controlled user accounts if individual accountability is required.

In Firebase Console:

1. Open the remote-firing-analyzer project.
2. Create a Firestore database.
3. Enable Authentication > Sign-in method > Anonymous.
4. Create a Web App and copy its Firebase configuration.
5. Copy .env.example to .env.local and fill in the Firebase values.

Example:

~~~env
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=remote-firing-analyzer
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.firebasestorage.app
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
~~~

Deploy Firestore rules with:

~~~bash
firebase deploy --only firestore:rules
~~~

## Target / camera / ML environment

~~~env
NEXT_PUBLIC_TARGET_OUTER_RADIUS_INCHES=32
NEXT_PUBLIC_NORMALIZED_TARGET_SIZE=1024
NEXT_PUBLIC_AUTO_CALIBRATION_MIN_CONFIDENCE=0.55

NEXT_PUBLIC_STREAM_BASE_URL=http://localhost:8888
NEXT_PUBLIC_STREAM_CAMERA_COUNT=12

NEXT_PUBLIC_ML_API_URL=http://localhost:8000/detect
NEXT_PUBLIC_ML_CONFIDENCE_THRESHOLD=0.50
~~~

## Development

~~~bash
pnpm install
pnpm dev
~~~

Open:

~~~text
http://localhost:3000
~~~

Build check:

~~~bash
pnpm typecheck
pnpm build
~~~

## Project structure

~~~text
app/
components/
hooks/
lib/
  calculations.ts
  config.ts
  db/
    firebase.ts
  ml/
    detector.ts
  vision/
    autoCalibration.ts
types/
firestore.rules
firebase.json
~~~

## Main design principles

- Automatic calibration first
- ML detection after calibration
- Normalized target input for the ML model
- Manual correction always available
- Manual calibration fallback retained
- Firer and session records separated
- Firestore protected by authentication
- Local session fallback
- Strict TypeScript build
- Static Next.js export compatible with Firebase Hosting
