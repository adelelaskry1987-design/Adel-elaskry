import crypto from 'node:crypto';
import { db } from './db.js';

export interface ProviderStatus {
  emailProviderConfigured: boolean;
  smsProviderConfigured: boolean;
  emailProviderName: string | null;
  smsProviderName: string | null;
}

/**
 * Inspect server environment variables to determine whether a real Email or SMS provider is configured.
 * Secrets never leave the server.
 */
export function getRecoveryProviderStatus(): ProviderStatus {
  const hasResend = Boolean(process.env.RESEND_API_KEY && process.env.RECOVERY_EMAIL_FROM);
  const hasSendGrid = Boolean(process.env.SENDGRID_API_KEY && process.env.RECOVERY_EMAIL_FROM);
  const hasBrevo = Boolean(process.env.BREVO_API_KEY && process.env.RECOVERY_EMAIL_FROM);
  const hasEmailWebhook = Boolean(process.env.EMAIL_WEBHOOK_URL);

  const hasTwilio = Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_FROM_NUMBER
  );
  const hasVonage = Boolean(process.env.VONAGE_API_KEY && process.env.VONAGE_API_SECRET);
  const hasSmsGateway = Boolean(process.env.SMS_GATEWAY_URL);

  const emailProviderName = hasResend
    ? 'resend'
    : hasSendGrid
    ? 'sendgrid'
    : hasBrevo
    ? 'brevo'
    : hasEmailWebhook
    ? 'webhook'
    : null;

  const smsProviderName = hasTwilio
    ? 'twilio'
    : hasVonage
    ? 'vonage'
    : hasSmsGateway
    ? 'gateway'
    : null;

  return {
    emailProviderConfigured: Boolean(emailProviderName),
    smsProviderConfigured: Boolean(smsProviderName),
    emailProviderName,
    smsProviderName,
  };
}

/**
 * Persistent rate limiter backed by SQLite recovery_rate_limits table.
 */
export function checkAndIncrementRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number,
  lockoutMs: number = windowMs
): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
  const existing = db
    .prepare('SELECT * FROM recovery_rate_limits WHERE key = ?')
    .get(key) as any;

  if (existing) {
    if (existing.locked_until && existing.locked_until > now) {
      return {
        allowed: false,
        retryAfterSec: Math.max(1, Math.ceil((existing.locked_until - now) / 1000)),
      };
    }

    if (now - existing.window_start > windowMs) {
      db.prepare(
        'UPDATE recovery_rate_limits SET count = 1, window_start = ?, locked_until = 0 WHERE key = ?'
      ).run(now, key);
      return { allowed: true, retryAfterSec: 0 };
    }

    const nextCount = existing.count + 1;
    if (nextCount > maxRequests) {
      const lockedUntil = now + lockoutMs;
      db.prepare(
        'UPDATE recovery_rate_limits SET count = ?, locked_until = ? WHERE key = ?'
      ).run(nextCount, lockedUntil, key);
      return {
        allowed: false,
        retryAfterSec: Math.max(1, Math.ceil(lockoutMs / 1000)),
      };
    }

    db.prepare('UPDATE recovery_rate_limits SET count = ? WHERE key = ?').run(
      nextCount,
      key
    );
    return { allowed: true, retryAfterSec: 0 };
  }

  db.prepare(
    'INSERT INTO recovery_rate_limits (key, count, window_start, locked_until) VALUES (?, 1, ?, 0)'
  ).run(key, now);
  return { allowed: true, retryAfterSec: 0 };
}

export function generateSecureLinkToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function generateSecureOtpCode(): string {
  return crypto.randomInt(100000, 1000000).toString();
}

/**
 * Send password reset link via the configured real Email provider.
 * Throws if no provider is configured or if the provider rejects delivery.
 */
export async function sendPasswordResetEmail(params: {
  toEmail: string;
  userName: string;
  resetUrl: string;
  expiresInMinutes: number;
}): Promise<void> {
  const status = getRecoveryProviderStatus();
  if (!status.emailProviderConfigured) {
    throw new Error(
      'خدمة إرسال البريد الإلكتروني غير مهيأة حاليًا على الخادم. يرجى ضبط مفاتيح مزود البريد (RESEND_API_KEY أو SENDGRID_API_KEY أو BREVO_API_KEY أو EMAIL_WEBHOOK_URL) في إعدادات الخادم.'
    );
  }

  const fromEmail = process.env.RECOVERY_EMAIL_FROM || 'no-reply@ah2-system.com';
  const subject = 'استعادة كلمة المرور - نظام AH2 المعتمد';
  const htmlBody = `
    <div dir="rtl" style="font-family: Cairo, Arial, sans-serif; color: #0f233c; line-height: 1.7; max-width: 520px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 16px;">
      <h2 style="color: #0f233c; margin-top: 0;">مرحبًا ${params.userName}،</h2>
      <p>تلقينا طلبًا لإعادة تعيين كلمة المرور الخاصة بحسابك في <strong>نظام AH2 لإدارة الحسابات والعمليات</strong>.</p>
      <p style="margin: 24px 0;">
        <a href="${params.resetUrl}" style="display: inline-block; background-color: #0f233c; color: #f3d27a; text-decoration: none; font-weight: bold; padding: 12px 24px; border-radius: 10px; border: 1px solid #c59a3f;">
          إعادة تعيين كلمة المرور الآن
        </a>
      </p>
      <p style="font-size: 13px; color: #475569;">هذا الرابط صالح لمدة <strong>${params.expiresInMinutes} دقيقة</strong> فقط ويُستخدم لمرة واحدة فقط.</p>
      <p style="font-size: 12px; color: #64748b; word-break: break-all;">أو انسخ الرابط التالي في المتصفح:<br/>${params.resetUrl}</p>
      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
      <p style="font-size: 11px; color: #94a3b8;">إذا لم تطلب استعادة كلمة المرور، يمكنك تجاهل هذه الرسالة بأمان ولن يتم إجراء أي تغيير على حسابك.</p>
    </div>
  `;

  if (status.emailProviderName === 'resend') {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [params.toEmail],
        subject,
        html: htmlBody,
      }),
    });
    if (!resp.ok) {
      const errBody = await resp.text();
      throw new Error(`فشل إرسال البريد عبر مزود Resend (${resp.status}): ${errBody}`);
    }
    return;
  }

  if (status.emailProviderName === 'sendgrid') {
    const resp = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: params.toEmail }] }],
        from: { email: fromEmail },
        subject,
        content: [{ type: 'text/html', value: htmlBody }],
      }),
    });
    if (!resp.ok) {
      const errBody = await resp.text();
      throw new Error(`فشل إرسال البريد عبر مزود SendGrid (${resp.status}): ${errBody}`);
    }
    return;
  }

  if (status.emailProviderName === 'brevo') {
    const resp = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': process.env.BREVO_API_KEY as string,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender: { email: fromEmail, name: 'نظام AH2 المعتمد' },
        to: [{ email: params.toEmail, name: params.userName }],
        subject,
        htmlContent: htmlBody,
      }),
    });
    if (!resp.ok) {
      const errBody = await resp.text();
      throw new Error(`فشل إرسال البريد عبر مزود Brevo (${resp.status}): ${errBody}`);
    }
    return;
  }

  if (status.emailProviderName === 'webhook') {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (process.env.EMAIL_WEBHOOK_SECRET) {
      headers['X-Webhook-Secret'] = process.env.EMAIL_WEBHOOK_SECRET;
    }
    const resp = await fetch(process.env.EMAIL_WEBHOOK_URL as string, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        to: params.toEmail,
        from: fromEmail,
        subject,
        html: htmlBody,
        resetUrl: params.resetUrl,
        expiresInMinutes: params.expiresInMinutes,
      }),
    });
    if (!resp.ok) {
      const errBody = await resp.text();
      throw new Error(`فشل إرسال البريد عبر خدمة البريد المهيأة (${resp.status}): ${errBody}`);
    }
  }
}

/**
 * Format local Egyptian phone number (01xxxxxxxxx) to E.164 (+201xxxxxxxxx) for international SMS gateways.
 */
function toE164Phone(normalizedPhone: string): string {
  if (normalizedPhone.startsWith('01') && normalizedPhone.length === 11) {
    return `+2${normalizedPhone}`;
  }
  if (!normalizedPhone.startsWith('+')) {
    return `+${normalizedPhone}`;
  }
  return normalizedPhone;
}

/**
 * Send temporary OTP code via the configured real SMS provider.
 * Never fakes delivery or returns a fake OTP code.
 */
export async function sendOtpSms(params: {
  phone: string;
  otpCode: string;
  purpose: 'reset_password_sms' | 'forgot_email_sms';
  expiresInMinutes: number;
}): Promise<void> {
  const status = getRecoveryProviderStatus();
  if (!status.smsProviderConfigured) {
    throw new Error(
      'خدمة الرسائل النصية (SMS) غير مهيأة حاليًا على الخادم. يرجى ضبط مفاتيح مزود الرسائل (TWILIO أو VONAGE أو SMS_GATEWAY_URL) في إعدادات الخادم.'
    );
  }

  const e164Phone = toE164Phone(params.phone);
  const purposeText =
    params.purpose === 'forgot_email_sms'
      ? 'لاستعادة بيانات الدخول والبريد الإلكتروني'
      : 'لإعادة تعيين كلمة المرور';
  const messageBody = `نظام AH2 المعتمد: رمز التحقق الخاص بك ${purposeText} هو ${params.otpCode} (صالح لمدة ${params.expiresInMinutes} دقائق ولا يُستخدم إلا مرة واحدة).`;

  if (status.smsProviderName === 'twilio') {
    const sid = process.env.TWILIO_ACCOUNT_SID as string;
    const authToken = process.env.TWILIO_AUTH_TOKEN as string;
    const fromNumber = process.env.TWILIO_FROM_NUMBER as string;
    const basicAuth = Buffer.from(`${sid}:${authToken}`).toString('base64');

    const form = new URLSearchParams();
    form.append('To', e164Phone);
    form.append('From', fromNumber);
    form.append('Body', messageBody);

    const resp = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${basicAuth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: form.toString(),
      }
    );
    if (!resp.ok) {
      const errBody = await resp.text();
      throw new Error(`فشل إرسال الرسالة النصية عبر Twilio (${resp.status}): ${errBody}`);
    }
    return;
  }

  if (status.smsProviderName === 'vonage') {
    const resp = await fetch('https://rest.nexmo.com/sms/json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: process.env.VONAGE_API_KEY,
        api_secret: process.env.VONAGE_API_SECRET,
        to: e164Phone.replace(/^\+/, ''),
        from: process.env.VONAGE_FROM || 'AH2',
        text: messageBody,
        type: 'unicode',
      }),
    });
    const data = (await resp.json().catch(() => null)) as any;
    if (!resp.ok || data?.messages?.[0]?.status !== '0') {
      throw new Error(
        `فشل إرسال الرسالة النصية عبر Vonage: ${
          data?.messages?.[0]?.['error-text'] || resp.statusText
        }`
      );
    }
    return;
  }

  if (status.smsProviderName === 'gateway') {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (process.env.SMS_GATEWAY_API_KEY) {
      headers['Authorization'] = `Bearer ${process.env.SMS_GATEWAY_API_KEY}`;
    }
    const resp = await fetch(process.env.SMS_GATEWAY_URL as string, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        to: e164Phone,
        normalizedPhone: params.phone,
        senderId: process.env.SMS_SENDER_ID || 'AH2',
        message: messageBody,
        otpCode: params.otpCode,
        purpose: params.purpose,
        expiresInMinutes: params.expiresInMinutes,
      }),
    });
    if (!resp.ok) {
      const errBody = await resp.text();
      throw new Error(`فشل إرسال الرسالة النصية عبر بوابة SMS (${resp.status}): ${errBody}`);
    }
  }
}
