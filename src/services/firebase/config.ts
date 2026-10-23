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
import { getFirestore, type Firestore } from 'firebase/firestore';

const env = import.meta.env as Record<string, string | undefined>;

export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY ?? '',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN ?? '',
  projectId: env.VITE_FIREBASE_PROJECT_ID ?? '',
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET ?? '',
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '',
  appId: env.VITE_FIREBASE_APP_ID ?? '',
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
  return {
    ...firebaseConfig,
    authDomain: firebaseConfig.authDomain || `${firebaseConfig.projectId}.firebaseapp.com`,
  };
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

export function firestoreDb(): Firestore {
  return getFirestore(firebaseApp());
}

/** معرّف المحل الوحيد (التطبيق مخصّص لمحل واحد) */
export const SHOP_ID = 'main';
