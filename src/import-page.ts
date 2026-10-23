/**
 * صفحة الاستيراد الإدارية (تشغيل لمرة واحدة)
 * ==========================================
 * - الدخول بحساب Google (نفس حساب مالك المحل).
 * - اختيار ملف `ah2-export.json` من الجهاز (لا يُرفع إلى أي مكان غير Firestore).
 * - «تشغيل تجريبي» يقرأ ويحسب المطابقة بدون كتابة أي وثيقة.
 * - «تنفيذ الاستيراد» يكتب ثم يقرأ من جديد ويطابق؛ ويتوقف عند أي اختلاف.
 */
import { firebaseAuthInstance as auth, loadSessionFor } from './services/firebase/auth';
import { signInWithGoogle } from './services/firebase/auth';
import { onAuthStateChanged } from 'firebase/auth';
import { firestoreDb, SHOP_ID, isFirebaseConfigured } from './services/firebase/config';
import { importBackup, type BackupExport, type ImportReport } from './services/firestore/import';

const $ = (id: string) => document.getElementById(id) as HTMLElement;
const loginBtn = $('login') as HTMLButtonElement;
const who = $('who');
const stepFile = $('step-file');
const fileInput = $('file') as HTMLInputElement;
const fileInfo = $('fileinfo');
const dryBtn = $('dry') as HTMLButtonElement;
const runBtn = $('run') as HTMLButtonElement;
const out = $('out');

let backup: BackupExport | null = null;
let uid: string | null = null;

function show(html: string, tone: 'good' | 'bad' | 'plain' = 'plain') {
  const cls = tone === 'good' ? 'card good' : tone === 'bad' ? 'card warn' : 'card';
  out.insertAdjacentHTML('afterbegin', `<div class="${cls}">${html}</div>`);
}

function f(n: number) {
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function renderReport(report: ImportReport, fatal?: string, dry = false) {
  const rows = [
    ['العملاء', report.source.customers, report.readBack.customers],
    ['العمليات', report.source.transactions, report.readBack.transactions],
    ['سجل التدقيق', report.source.auditLogs, report.readBack.auditLogs],
    ['الإشعارات', report.source.notifications, report.readBack.notifications],
  ];

  const head = dry
    ? `<div class="big">تشغيل تجريبي — لم تُكتب أي بيانات</div>`
    : `<div class="big">${report.ok ? 'الاستيراد نجح والمطابقة تامة' : 'المطابقة فشلت — توقف'}</div>`;

  let html = `${head}
    <div class="row"><span class="muted">المصدر</span><span>${report.source.customers} عميل · ${report.source.transactions} عملية</span></div>`;

  if (!dry) {
    for (const [label, src, back] of rows as [string, number, number][]) {
      html += `<div class="row"><span>${label}</span><span class="${src === back ? 'ok' : 'bad'}">${src} → ${back}</span></div>`;
    }
    html += `<div class="row"><span>تم تخطيها (موجودة مسبقًا)</span><span>${report.written.skippedExisting}</span></div>`;
  }

  html += `<div class="row"><span>صافي الأرصدة (المصدر)</span><span class="big">${f(report.source.net)}</span></div>`;
  if (!dry) {
    html += `<div class="row"><span>صافي الأرصدة (بعد الاستيراد)</span><span class="big ${report.source.net === report.readBack.net ? 'ok' : 'bad'}">${f(report.readBack.net)}</span></div>`;
  }

  html += `<div style="margin-top:10px" class="big">أرصدة العملاء</div>`;
  for (const b of report.balancesAfter.length ? report.balancesAfter : report.balancesBefore) {
    html += `<div class="row"><span>${b.name}</span><span>${f(b.balance)}</span></div>`;
  }

  if (report.checks.length) {
    html += `<div style="margin-top:10px" class="big">فحوص المطابقة (${report.checks.filter((c) => c.pass).length}/${report.checks.length})</div>`;
    for (const c of report.checks) {
      html += `<div class="row"><span>${c.label}</span><span class="${c.pass ? 'ok' : 'bad'}">${c.pass ? '✔' : `✘ ${c.expected} ≠ ${c.actual}`}</span></div>`;
    }
  }

  if (report.notes.length) {
    html += `<div style="margin-top:10px" class="muted" style="font-size:11.5px">${report.notes.map((n) => `• ${n}`).join('<br />')}</div>`;
  }

  if (fatal) html += `<div class="row bad" style="margin-top:8px">${fatal}</div>`;

  show(html, report.ok && !fatal ? 'good' : 'bad');
}

function enableButtons() {
  const ready = !!backup && !!uid;
  dryBtn.disabled = !ready;
  runBtn.disabled = !ready;
}

fileInput.addEventListener('change', async () => {
  const f0 = fileInput.files?.[0];
  if (!f0) return;
  try {
    const text = await f0.text();
    const parsed = JSON.parse(text);
    if (!parsed?.tables?.customers) throw new Error('ملف غير صالح: لا يحتوي جدول العملاء');
    backup = parsed as BackupExport;
    fileInfo.innerHTML = `تم التحميل: <b>${backup.tables.customers.length}</b> عميل · <b>${backup.tables.transactions?.length ?? 0}</b> عملية · <b>${backup.tables.activity_logs?.length ?? 0}</b> سجل تدقيق`;
    enableButtons();
  } catch (e: any) {
    backup = null;
    fileInfo.textContent = `تعذّر قراءة الملف: ${e?.message ?? e}`;
    enableButtons();
  }
});

dryBtn.addEventListener('click', async () => {
  if (!backup || !uid) return;
  dryBtn.disabled = true;
  show('<div class="big">جارٍ التشغيل التجريبي…</div>');
  const res = await importBackup(firestoreDb(), SHOP_ID, uid, backup, { dryRun: true });
  renderReport(res.report, res.fatal, true);
  dryBtn.disabled = false;
});

runBtn.addEventListener('click', async () => {
  if (!backup || !uid) return;
  if (!confirm('سيتم كتابة بيانات النسخة الاحتياطية في Firestore. لا حذف ولا استبدال. متابعة؟')) return;
  runBtn.disabled = true;
  dryBtn.disabled = true;
  show('<div class="big">جارٍ الاستيراد… لا تغلق الصفحة</div>');
  try {
    const res = await importBackup(firestoreDb(), SHOP_ID, uid, backup);
    renderReport(res.report, res.fatal, false);
    if (!res.report.ok) {
      show('<div class="bad big">توقف: راجع الفشل أعلاه. البيانات المكتوبة لم تُحذف.</div>');
    } else {
      show('<div class="ok big">تم. يمكنك الآن فتح التطبيق والدخول بحساب Google.</div>');
    }
  } catch (e: any) {
    show(`<div class="bad big">خطأ غير متوقع: ${e?.message ?? e}</div>`);
  } finally {
    runBtn.disabled = false;
    dryBtn.disabled = false;
  }
});

loginBtn.addEventListener('click', async () => {
  loginBtn.disabled = true;
  who.textContent = 'جارٍ الدخول…';
  try {
    await signInWithGoogle();
  } catch (e: any) {
    who.textContent = e?.message ?? 'تعذّر الدخول';
    loginBtn.disabled = false;
  }
});

if (!isFirebaseConfigured) {
  who.innerHTML = '<span class="bad">إعدادات Firebase غير مضبوطة في هذه النسخة.</span>';
  loginBtn.disabled = true;
}

onAuthStateChanged(auth(), async (fbUser) => {
  if (!fbUser) {
    uid = null;
    loginBtn.disabled = false;
    who.textContent = '';
    stepFile.classList.add('hidden');
    enableButtons();
    return;
  }
  uid = fbUser.uid;
  loginBtn.disabled = true;
  who.innerHTML = `مسجّل الدخول: <b dir="ltr">${fbUser.email ?? ''}</b><br />UID: <code dir="ltr">${fbUser.uid}</code>`;

  try {
    const { member, shop } = await loadSessionFor(fbUser);
    who.innerHTML += `<br /><span class="ok">عضوية نشطة — ${member.role === 'owner' ? 'صاحب المحل' : member.role}</span>
      <br /><span class="muted">المحل: ${shop.name}</span>`;
    if (shop.ownerUid !== fbUser.uid) {
      who.innerHTML += `<br /><span class="bad">هذا الحساب ليس مالك المحل — الاستيراد محجوب.</span>`;
    }
    stepFile.classList.remove('hidden');
  } catch (e: any) {
    who.innerHTML += `<br /><span class="bad">${e?.message ?? 'لا تملك عضوية في هذا المحل'}</span>`;
  }
  enableButtons();
});
