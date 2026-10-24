/**
 * الدخول بحساب Google عبر Firebase Authentication
 * ===============================================
 * - لا كلمات مرور ولا تخزين اعتماد: Google يتحقق من الهوية.
 * - الهوية وحدها لا تمنح أي وصول: بعد الدخول نقرأ وثيقة العضوية
 *   `shops/main/members/{uid}` — إن لم تكن موجودة أو ليست `active` يُرفض الدخول.
 * - لا يوجد أي مسار يمنح دور `owner` تلقائيًا: `ownerUid` يُكتب يدويًا مرة واحدة
 *   في وثيقة المحل، وقواعد Firestore تمنع تغييره.
 */
import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  type User as FirebaseUser,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { firebaseAuth as fbAuth, firestoreDb, SHOP_ID } from './config';
import type { AccountStatus, UserRole } from '../../types';

export interface ShopMember {
  uid: string;
  name: string;
  email: string | null;
  phone: string;
  role: UserRole;
  status: AccountStatus;
  permissions: string[];
  createdAt?: string;
  lastLoginAt?: string | null;
}

export interface ShopDoc {
  name: string;
  ownerUid: string;
  createdAt?: string;
}

/** أسباب رفض الدخول — تُعرض للمستخدم بنفس صياغة رسائل النظام الحالية */
export class GoogleAuthError extends Error {
  code: 'NO_MEMBERSHIP' | 'ACCOUNT_NOT_ACTIVE' | 'SHOP_MISSING' | 'POPUP_BLOCKED' | 'UNKNOWN';
  status?: AccountStatus;
  constructor(code: GoogleAuthError['code'], message: string, status?: AccountStatus) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const provider = () => {
  const p = new GoogleAuthProvider();
  p.setCustomParameters({ prompt: 'select_account' });
  return p;
};

/** يفتح نافذة اختيار حساب Google (مع بديل redirect لو مُنع الـpopup) */
export async function signInWithGoogle(): Promise<FirebaseUser> {
  const auth = fbAuth();
  await setPersistence(auth, browserLocalPersistence).catch(() => {});
  try {
    const cred = await signInWithPopup(auth, provider());
    return cred.user;
  } catch (err: any) {
    const code = String(err?.code ?? '');
    // نُبقي السبب الحقيقي ظاهرًا في الكونسول — الرسائل العامة تُخفي المشكلة
    console.error('[GoogleAuth]', code || '(no-code)', err?.message ?? err);

    if (code.includes('popup-blocked') || code.includes('popup-closed-by-user') || code.includes('cancelled-popup-request')) {
      if (code.includes('popup-closed-by-user') || code.includes('cancelled-popup-request')) {
        throw new GoogleAuthError('POPUP_BLOCKED', 'تم إلغاء تسجيل الدخول بحساب Google');
      }
      await signInWithRedirect(auth, provider());
      // النتيجة تُلتقط عند إعادة تحميل الصفحة
      throw new GoogleAuthError('POPUP_BLOCKED', 'جارٍ تحويلك إلى Google لإكمال الدخول…');
    }

    // نطاق التطبيق غير مسجَّل في Firebase — أشهر سبب لفشل الدخول بعد النشر
    if (code.includes('unauthorized-domain')) {
      throw new GoogleAuthError(
        'UNKNOWN',
        `هذا النطاق (${location.hostname}) غير مصرّح به في Firebase. أضِفه في: Authentication ← Settings ← Authorized domains ثم أعد المحاولة. [auth/unauthorized-domain]`
      );
    }
    if (code.includes('operation-not-allowed')) {
      throw new GoogleAuthError('UNKNOWN', 'تسجيل الدخول بجوجل غير مُفعّل في Firebase Authentication. [auth/operation-not-allowed]');
    }
    if (code.includes('operation-not-supported-in-this-environment') || code.includes('web-storage-unsupported')) {
      throw new GoogleAuthError('UNKNOWN', 'المتصفح يمنع التخزين/النوافذ المطلوبة للدخول — افتح التطبيق في نافذة عادية (لا وضع خاص). [auth/environment]');
    }
    if (code.includes('network-request-failed')) {
      throw new GoogleAuthError('UNKNOWN', 'تعذّر الوصول إلى خوادم Google — تحقّق من الاتصال ثم أعد المحاولة. [auth/network-request-failed]');
    }
    throw new GoogleAuthError(
      'UNKNOWN',
      `تعذّر تسجيل الدخول بحساب Google — تحقّق من الاتصال وحاول مرة أخرى. [${code || 'unknown'}]`
    );
  }
}

/** يلتقط نتيجة الدخول بعد إعادة التوجيه (إن استُخدم redirect) */
export async function consumeRedirectResult(): Promise<FirebaseUser | null> {
  try {
    const res = await getRedirectResult(fbAuth());
    return res?.user ?? null;
  } catch {
    return null;
  }
}

export async function signOutGoogle(): Promise<void> {
  await signOut(fbAuth()).catch(() => {});
}

/** يستمع لتغيّر حالة الدخول */
export function onGoogleAuthChange(cb: (user: FirebaseUser | null) => void): () => void {
  return onAuthStateChanged(fbAuth(), cb);
}

/** يقرأ وثيقة المحل — إن لم تكن موجودة فالمشروع غير مهيّأ */
export async function loadShop(): Promise<ShopDoc> {
  let snap;
  try {
    snap = await getDoc(doc(firestoreDb(), 'shops', SHOP_ID));
  } catch (e: any) {
    console.error('[loadShop]', e?.code ?? '', e?.message ?? e);
    if (String(e?.code ?? '').includes('permission-denied')) {
      throw new GoogleAuthError(
        'SHOP_MISSING',
        'قواعد Firestore منعت قراءة بيانات المحل — تأكّد أن وثيقة shops/main ووثيقة عضويتك منشورتان في القاعدة. [permission-denied]'
      );
    }
    throw e;
  }
  if (!snap.exists()) {
    throw new GoogleAuthError('SHOP_MISSING', 'لم يتم تهيئة المحل بعد في قاعدة البيانات السحابية');
  }
  return snap.data() as ShopDoc;
}

/**
 * يبني جلسة التطبيق من هوية Google:
 * هوية صحيحة + عضوية نشطة = جلسة، وأي شيء غير ذلك يُرفض برسالة واضحة.
 */
export async function loadSessionFor(fbUser: FirebaseUser): Promise<{ member: ShopMember; shop: ShopDoc }> {
  const shop = await loadShop();
  let snap;
  try {
    snap = await getDoc(doc(firestoreDb(), 'shops', SHOP_ID, 'members', fbUser.uid));
  } catch (e: any) {
    console.error('[loadSessionFor]', e?.code ?? '', e?.message ?? e);
    throw new GoogleAuthError(
      'NO_MEMBERSHIP',
      'تعذّر التحقّق من عضويتك (منعته قواعد Firestore). راجع صاحب المحل. [permission-denied]'
    );
  }

  if (!snap.exists()) {
    throw new GoogleAuthError(
      'NO_MEMBERSHIP',
      'هذا الحساب لا يملك عضوية في هذا المحل. راجع صاحب المحل لإضافتك.'
    );
  }

  const data = snap.data() as Partial<ShopMember>;
  const status = (data.status ?? 'pending') as AccountStatus;

  if (status !== 'active') {
    const labels: Record<string, string> = {
      pending: 'حسابك في انتظار اعتماد صاحب المحل',
      disabled: 'حسابك معطّل — راجع صاحب المحل',
      rejected: 'تم رفض طلب حسابك',
      deleted: 'تم حذف هذا الحساب',
    };
    throw new GoogleAuthError('ACCOUNT_NOT_ACTIVE', labels[status] ?? 'الحساب غير نشط', status);
  }

  // المالك يملك المصفوفة كاملة دائمًا (نفس منطق الخادم الحالي)
  const isOwner = shop.ownerUid === fbUser.uid;
  const permissions = isOwner ? ALL_PERMISSIONS : Array.isArray(data.permissions) ? data.permissions : [];

  return {
    shop,
    member: {
      uid: fbUser.uid,
      name: data.name ?? fbUser.displayName ?? '',
      email: data.email ?? fbUser.email ?? null,
      phone: data.phone ?? '',
      role: isOwner ? 'owner' : ((data.role ?? 'employee') as UserRole),
      status,
      permissions,
      createdAt: data.createdAt,
      lastLoginAt: data.lastLoginAt ?? null,
    },
  };
}

/** المصفوفة المركزية للصلاحيات (مطابقة لـ server/permissions.ts) */
export const ALL_PERMISSIONS: string[] = [
  'view_customers', 'add_customer', 'edit_customer', 'delete_customer',
  'create_transaction', 'view_customer_transactions', 'edit_transaction', 'cancel_transaction',
  'view_balances', 'view_all_transactions', 'view_reports', 'share_invoices',
  'manage_users', 'create_employees', 'request_disable_account', 'request_delete_account',
  'request_enable_account', 'approve_requests', 'manage_backups', 'restore_data', 'reset_data',
];


/** واجهة جلسة Google الحالية (للاستخدام في طبقة البيانات) */
export const firebaseAuthInstance = fbAuth;
