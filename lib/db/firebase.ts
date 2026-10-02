import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import {
  doc,
  getFirestore,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { FIREBASE_CONFIG } from '@/lib/config';
import type { SavedSession } from '@/types';

export type DatabaseMode = 'cloud' | 'local';

function configured() {
  return Boolean(
    FIREBASE_CONFIG.apiKey &&
      FIREBASE_CONFIG.authDomain &&
      FIREBASE_CONFIG.projectId &&
      FIREBASE_CONFIG.appId,
  );
}

export function getDatabaseMode(): DatabaseMode {
  return configured() ? 'cloud' : 'local';
}

function getFirebaseApp() {
  if (!configured()) return null;

  return getApps().length
    ? getApp()
    : initializeApp(FIREBASE_CONFIG);
}

async function ensureSignedIn() {
  const app = getFirebaseApp();
  if (!app) return null;

  const auth = getAuth(app);
  if (auth.currentUser) return auth.currentUser;

  const credential = await signInAnonymously(auth);
  return credential.user;
}

function safeObject<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function documentId(value: string) {
  return value.trim().replace(/[\/\\.#$\[\]]+/g, '_').slice(0, 160);
}

export async function saveSessionToCloud(
  session: SavedSession,
): Promise<{ mode: DatabaseMode; saved: boolean }> {
  if (!configured()) {
    return { mode: 'local', saved: false };
  }

  const app = getFirebaseApp();
  if (!app) return { mode: 'local', saved: false };

  await ensureSignedIn();

  const db = getFirestore(app);
  const serviceNumber =
    session.firerInfo.serviceNumber ||
    session.firerInfo.weaponNumber ||
    '';

  if (serviceNumber.trim()) {
    const firerId = documentId(serviceNumber);
    await setDoc(
      doc(db, 'firers', firerId),
      {
        serviceNumber,
        name: session.firerInfo.name || '',
        rank: session.firerInfo.rank || '',
        weaponSerial:
          session.firerInfo.weaponSerial ||
          session.firerInfo.wpnNo ||
          '',
        lastRange: session.firerInfo.range,
        lastSessionAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  }

  const sessionPayload = safeObject({
    id: session.id,
    firerId: serviceNumber ? documentId(serviceNumber) : null,
    firerInfo: {
      name: session.firerInfo.name || '',
      rank: session.firerInfo.rank || '',
      serviceNumber,
      weaponSerial:
        session.firerInfo.weaponSerial ||
        session.firerInfo.wpnNo ||
        '',
      date: session.firerInfo.date,
      range: session.firerInfo.range,
    },
    results: session.results,
    calibration: session.calibration || null,
    markingMode: session.markingMode || 'manual',
    sourceType: session.sourceType || 'upload',
    savedAt: session.savedAt,
  });

  await setDoc(
    doc(db, 'sessions', documentId(session.id)),
    {
      ...sessionPayload,
      createdAt: serverTimestamp(),
    },
    { merge: true },
  );

  return { mode: 'cloud', saved: true };
}
