/**
 * تهيئة Firebase للتطبيق (المسار السحابي — Firestore هو مصدر البيانات)
 * ==================================================================
 * لا توجد أي مفاتيح سرية هنا: كل ما في هذا الملف معرّفات عامة تظهر أصلًا في
 * حزمة المتصفح. الحماية الفعلية كلها في `firestore.rules` على خوادم Google.
 *
 * القيم تأتي من متغيّرات البيئة (`.env.local` — مستثنى من git):
 *   VITE_FIREBASE_API_KEY
 *   VITE_FIREBASE_AUTH_DOMAIN
 *   VITE_FIREBASE_PROJECT_ID
 *   VITE_FIREBASE_STORAGE_BUCKET
 *   VITE_FIREBASE_MESSAGING_SENDER_ID
 *   VITE_FIREBASE_APP_ID
 *
 * إن لم تكن المضبوطة، يعمل التطبيق بالوضع المحلي القديم (SQLite) — لا شيء يتعطّل.
 */
import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, type Firestore } from 'firebase/firestore';

/**
 * مصدر متغيّرات البيئة:
 * - في المتصفح (Vite) تكون `import.meta.env`.
 * - في الاختبارات (Node/tsx) لا يوجد `import.meta.env`، فنقرأ من
 *   `globalThis.__AH2_ENV__` — وهذا **لا يؤثر إطلاقًا** على نسخة الإنتاج.
 */
const viteEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
const env: Record<string, string | undefined> =
  viteEnv ?? ((globalThis as unknown as { __AH2_ENV__?: Record<string, string | undefined> }).__AH2_ENV__ ?? {});

export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY ?? '',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN ?? '',
  projectId: env.VITE_FIREBASE_PROJECT_ID ?? '',
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET ?? '',
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '',
  appId: env.VITE_FIREBASE_APP_ID ?? '',
  measurementId: env.VITE_FIREBASE_MEASUREMENT_ID ?? '',
  /**
   * معرّف قاعدة Firestore. الغالب `(default)`، لكن لو القاعدة أُنشئت بمعرّف
   * صريح مثل `default` (وهو ما حدث في مشروع المحل) يُضبط من البيئة.
   */
  databaseId: env.VITE_FIREBASE_DATABASE_ID || '(default)',
};

/** هل إعدادات Firebase مكتملة؟ (بدونها يبقى التطبيق على الوضع المحلي) */
export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId
);

/** هل نستخدم Firestore كمصدر بيانات؟ */
export const useFirestoreData = isFirebaseConfigured && env.VITE_DATA_MODE === 'firestore';

/**
 * إعدادات مؤكدة للاستخدام: لو لم تُسجّل تطبيق ويب في الكونسول (خطوة اختيارية)
 * نكمل الناقص تلقائيًا — authDomain مشتق من projectId، وappId اختياري تمامًا
 * لخدمتي Authentication وFirestore.
 */
export function resolvedFirebaseConfig() {
  const { databaseId: _db, ...rest } = firebaseConfig;
  return {
    ...rest,
    authDomain: firebaseConfig.authDomain || `${firebaseConfig.projectId}.firebaseapp.com`,
  };
}

/** إعدادات قاعدة Firestore (المعرّف منفصل عن إعدادات التطبيق) */
export function firestoreConfig() {
  return { databaseId: firebaseConfig.databaseId };
}

let app: FirebaseApp | null = null;

export function firebaseApp(): FirebaseApp {
  if (!isFirebaseConfigured) {
    throw new Error('إعدادات Firebase غير مكتملة — راجع متغيّرات البيئة VITE_FIREBASE_*');
  }
  if (!app) app = getApps().length ? getApp() : initializeApp(resolvedFirebaseConfig());
  return app;
}

export function firebaseAuth(): Auth {
  return getAuth(firebaseApp());
}

let emulatorWired = false;

/**
 * اتصال المحاكي (للاختبارات فقط): يُفعَّل فقط إذا وُضع `globalThis.__AH2_EMULATOR__`.
 * في نسخة الإنتاج هذا المتغيّر غير موجود — فلا يحدث أي اتصال بمحاكي.
 */
export function firestoreDb(): Firestore {
  const databaseId = firestoreConfig().databaseId;
  const db = getFirestore(firebaseApp(), databaseId);
  const hook = (globalThis as unknown as { __AH2_EMULATOR__?: { host: string; port: number } }).__AH2_EMULATOR__;
  if (hook && !emulatorWired) {
    connectFirestoreEmulator(db, hook.host, hook.port);
    emulatorWired = true;
  }
  return db;
}

/** معرّف المحل الوحيد (التطبيق مخصّص لمحل واحد) */
export const SHOP_ID = 'main';
