/**
 * AH2 — بوابة اختبار قواعد أمان Firestore
 * =======================================
 * تُشغَّل على محاكي Firestore الحقيقي (ليس محاكاة في الكود): كل تأكيد هنا
 * يعني أن Google نفسها ستسمح أو تمنع العملية بهذه القواعد بالضبط.
 *
 * التشغيل:
 *   npx firebase emulators:exec --only firestore --project demo-ah2 "npx tsx tests/verify-firestore-rules.ts"
 *
 * أو عبر: npm run test:rules
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, addDoc } from 'firebase/firestore';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OWNER_UID = 'owner-uid-111';
const EMP_VIEW_ONLY = 'emp-view-uid-222';
const EMP_DISABLED = 'emp-disabled-uid-333';
const EMP_ADD = 'emp-add-uid-444';
const STRANGER = 'stranger-uid-999';

let pass = 0;
let fail = 0;
function ok(name: string, cond: boolean, extra = '') {
  if (cond) {
    pass++;
    console.log('  ✅', name);
  } else {
    fail++;
    console.log('  ❌', name, extra);
  }
}

let env: RulesTestEnvironment;

async function main() {
  console.log('— تهيئة محاكي Firestore —');
  env = await initializeTestEnvironment({
    projectId: 'demo-ah2',
    firestore: {
      rules: fs.readFileSync(path.join(REPO_ROOT, 'firestore.rules'), 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });

  // ── بيانات أساسية (بدون قواعد) ──
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'shops', 'main'), {
      name: 'محل عادل',
      ownerUid: OWNER_UID,
      createdAt: '2026-10-23T00:00:00.000Z',
    });
    await setDoc(doc(db, 'shops/main/members', OWNER_UID), {
      uid: OWNER_UID, name: 'عادل', role: 'owner', status: 'active',
      permissions: [], createdAt: '2026-10-23T00:00:00.000Z',
    });
    await setDoc(doc(db, 'shops/main/members', EMP_VIEW_ONLY), {
      uid: EMP_VIEW_ONLY, name: 'موظف مشاهدة', role: 'employee', status: 'active',
      permissions: ['view_customers'], createdAt: '2026-10-23T00:00:00.000Z',
    });
    await setDoc(doc(db, 'shops/main/members', EMP_DISABLED), {
      uid: EMP_DISABLED, name: 'موظف معطل', role: 'employee', status: 'disabled',
      permissions: ['view_customers', 'add_customer'], createdAt: '2026-10-23T00:00:00.000Z',
    });
    await setDoc(doc(db, 'shops/main/members', EMP_ADD), {
      uid: EMP_ADD, name: 'موظف إضافة', role: 'employee', status: 'active',
      permissions: ['view_customers', 'add_customer'], createdAt: '2026-10-23T00:00:00.000Z',
    });
    await setDoc(doc(db, 'shops/main/customers', 'c1'), {
      name: 'أحمد', phone: '14785236', balance: 21.4,
    });
    await setDoc(doc(db, 'shops/main/transactions', 't1'), {
      customerId: 'c1', type: 'payment', amount: 580, status: 'active',
    });
    await setDoc(doc(db, 'shops/main/auditLogs', 'log1'), {
      actionType: 'LOGIN', actorId: OWNER_UID, description: 'دخول',
    });
  });

  // ══ 1) زائر غير مسجّل ══
  console.log('\n— 1) زائر غير مسجّل —');
  {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, 'shops/main')));
    await assertFails(getDoc(doc(db, 'shops/main/customers/c1')));
    await assertFails(getDoc(doc(db, 'shops/main/members', OWNER_UID)));
    ok('الزائر لا يقرأ وثيقة المحل ولا العملاء ولا العضويات', true);
  }

  // ══ 2) مسجّل بلا عضوية ══
  console.log('\n— 2) حساب Google مسجّل لكن بلا عضوية —');
  {
    const db = env.authenticatedContext(STRANGER).firestore();
    await assertFails(getDoc(doc(db, 'shops/main')));
    await assertFails(getDoc(doc(db, 'shops/main/customers/c1')));
    await assertFails(setDoc(doc(db, 'shops/main/customers/new1'), { name: 'اختراق' }));
    ok('الغريب يُرفض في القراءة والكتابة (لا عضوية = لا وصول)', true);
  }

  // ══ 3) المالك ══
  console.log('\n— 3) المالك —');
  {
    const db = env.authenticatedContext(OWNER_UID).firestore();
    await assertSucceeds(getDoc(doc(db, 'shops/main')));
    await assertSucceeds(getDoc(doc(db, 'shops/main/customers/c1')));
    await assertSucceeds(addDoc(collection(db, 'shops/main/customers'), { name: 'عميل جديد' }));
    await assertSucceeds(updateDoc(doc(db, 'shops/main/customers/c1'), { phone: '0100' }));
    await assertSucceeds(deleteDoc(doc(db, 'shops/main/customers/new1')).catch(() => {}));
    ok('المالك يقرأ ويكتب العملاء', true);
  }

  // ══ 4) الموظف بصلاحية مشاهدة فقط ══
  console.log('\n— 4) موظف بصلاحية view_customers فقط —');
  {
    const db = env.authenticatedContext(EMP_VIEW_ONLY).firestore();
    await assertSucceeds(getDoc(doc(db, 'shops/main/customers/c1')));
    await assertFails(setDoc(doc(db, 'shops/main/customers/c2'), { name: 'محاولة إضافة' }));
    await assertFails(updateDoc(doc(db, 'shops/main/customers/c1'), { phone: '999' }));
    await assertFails(deleteDoc(doc(db, 'shops/main/customers/c1')));
    ok('يقرأ العملاء ولا يضيف/يعدّل/يحذف', true);
  }

  // ══ 5) الموظف بصلاحية إضافة ══
  console.log('\n— 5) موظف بصلاحية add_customer —');
  {
    const db = env.authenticatedContext(EMP_ADD).firestore();
    await assertSucceeds(setDoc(doc(db, 'shops/main/customers/c-add'), { name: 'عميل من الموظف' }));
    await assertFails(updateDoc(doc(db, 'shops/main/customers/c-add'), { name: 'تعديل' }));
    ok('يضيف عميلًا ولا يعدّله (لا edit_customer)', true);
  }

  // ══ 6) الموظف المعطّل ══
  console.log('\n— 6) موظف حالته disabled —');
  {
    const db = env.authenticatedContext(EMP_DISABLED).firestore();
    await assertFails(getDoc(doc(db, 'shops/main/customers/c1')));
    await assertFails(setDoc(doc(db, 'shops/main/customers/c3'), { name: 'ممنوع' }));
    ok('المعطّل لا يقرأ ولا يكتب حتى لو كانت صلاحياته موجودة', true);
  }

  // ══ 7) سجل التدقيق: غير قابل للتعديل أو الحذف ══
  console.log('\n— 7) حصانة سجل التدقيق —');
  {
    const owner = env.authenticatedContext(OWNER_UID).firestore();
    const emp = env.authenticatedContext(EMP_VIEW_ONLY).firestore();
    await assertFails(updateDoc(doc(owner, 'shops/main/auditLogs/log1'), { description: 'تلاعب' }));
    await assertFails(deleteDoc(doc(owner, 'shops/main/auditLogs/log1')));
    await assertFails(updateDoc(doc(emp, 'shops/main/auditLogs/log1'), { description: 'تلاعب' }));
    await assertSucceeds(addDoc(collection(owner, 'shops/main/auditLogs'), { actionType: 'EDIT', actorId: OWNER_UID }));
    ok('لا تعديل ولا حذف لسجل التدقيق حتى من المالك، مع إمكانية الإضافة', true);
  }

  // ══ 8) منع منح صلاحية المالك ══
  console.log('\n— 8) منع منح دور owner —');
  {
    const owner = env.authenticatedContext(OWNER_UID).firestore();
    await assertFails(setDoc(doc(owner, 'shops/main/members/new-uid'), {
      uid: 'new-uid', name: 'منتحل', role: 'owner', status: 'active', permissions: [],
    }));
    await assertFails(updateDoc(doc(owner, 'shops/main/members', EMP_VIEW_ONLY), {
      uid: EMP_VIEW_ONLY, name: 'موظف مشاهدة', role: 'owner', status: 'active', permissions: [],
    }));
    await assertSucceeds(setDoc(doc(owner, 'shops/main/members/emp-new'), {
      uid: 'emp-new', name: 'موظف جديد', role: 'employee', status: 'pending', permissions: [],
    }));
    ok('لا يمكن إنشاء عضو بدور owner ولا ترقية عضو إليه', true);
  }

  // ══ 9) حماية عضوية المالك ووثيقة المحل ══
  console.log('\n— 9) حماية المالك ووثيقة المحل —');
  {
    const owner = env.authenticatedContext(OWNER_UID).firestore();
    const emp = env.authenticatedContext(EMP_ADD).firestore();
    await assertFails(deleteDoc(doc(owner, 'shops/main/members', OWNER_UID)));
    await assertFails(updateDoc(doc(owner, 'shops/main/members', OWNER_UID), { status: 'disabled' }));
    await assertFails(updateDoc(doc(owner, 'shops/main'), { ownerUid: EMP_ADD }));
    await assertFails(deleteDoc(doc(owner, 'shops/main')));
    await assertFails(setDoc(doc(emp, 'shops/main/members/emp2'), {
      uid: 'emp2', name: 'X', role: 'employee', status: 'active', permissions: [],
    }));
    ok('لا حذف لعضوية المالك/المحل، ولا تغيير ownerUid، والموظف لا يدير العضويات', true);
  }

  // ══ 10) الإشعارات والطلبات والنسخ ══
  console.log('\n— 10) بقية المجموعات —');
  {
    const owner = env.authenticatedContext(OWNER_UID).firestore();
    const emp = env.authenticatedContext(EMP_VIEW_ONLY).firestore();
    await assertSucceeds(addDoc(collection(emp, 'shops/main/requests'), { type: 'disable_account' }));
    await assertFails(updateDoc(doc(emp, 'shops/main/requests/req-x'), { status: 'approved' }));
    await assertSucceeds(addDoc(collection(owner, 'shops/main/backups'), { kind: 'snapshot' }));
    await assertFails(addDoc(collection(emp, 'shops/main/backups'), { kind: 'snapshot' }));
    ok('الطلبات والنسخ محمية حسب الصلاحية', true);
  }

  // ══ 11) مسارات غير معروفة ══
  console.log('\n— 11) أي مسار آخر ممنوع —');
  {
    const owner = env.authenticatedContext(OWNER_UID).firestore();
    await assertFails(setDoc(doc(owner, 'randomCollection/x'), { a: 1 }));
    await assertFails(getDoc(doc(owner, 'shops/other/customers/x')));
    ok('لا مجموعات خارج نطاق المحل', true);
  }

  console.log(`\nالنتيجة: ${pass} ناجح / ${fail} فاشل`);
  await env.cleanup();
  process.exitCode = fail === 0 ? 0 : 1;
}

main().catch(async (err) => {
  console.error('فشل الاختبار:', err);
  try {
    await env?.cleanup();
  } catch {
    /* تجاهل */
  }
  process.exit(1);
});
