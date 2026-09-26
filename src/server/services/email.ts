import { Resend } from "resend";

const resendApiKey = process.env.RESEND_API_KEY;
export const resend = resendApiKey ? new Resend(resendApiKey) : null;

export const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "noreply@yourdomain.com";
export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "صيانة العقارات";

export async function sendOtpEmail(email: string, otp: string, name: string) {
  const subject = `رمز التحقق الخاص بك - ${APP_NAME}`;

  const html = `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif;direction:rtl;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
          <tr>
            <td style="background:linear-gradient(135deg,#0d9488,#0891b2);padding:32px 40px;text-align:center;">
              <div style="font-size:36px;margin-bottom:8px;">🏢</div>
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">${APP_NAME}</h1>
              <p style="margin:4px 0 0;color:#ccfbf1;font-size:13px;">منصة إدارة الصيانة العقارية</p>
            </td>
          </tr>
          <tr>
            <td style="padding:40px;">
              <h2 style="margin:0 0 8px;color:#111827;font-size:20px;">مرحباً ${name} 👋</h2>
              <p style="margin:0 0 24px;color:#6b7280;font-size:15px;line-height:1.6;">
                شكراً لتسجيلك في المنصة! أدخل رمز التحقق أدناه لإتمام إنشاء حسابك.
              </p>

              <div style="background:#f0fdfa;border:2px dashed #0d9488;border-radius:12px;padding:28px;text-align:center;margin-bottom:24px;">
                <p style="margin:0 0 8px;color:#0d9488;font-size:13px;font-weight:600;letter-spacing:1px;">رمز التحقق لمرة واحدة</p>
                <div style="font-size:42px;font-weight:800;color:#0d9488;letter-spacing:10px;font-family:monospace;">${otp}</div>
                <p style="margin:12px 0 0;color:#9ca3af;font-size:12px;">⏱️ صالح لمدة <strong>10 دقائق</strong></p>
              </div>

              <div style="background:#fef3c7;border-radius:8px;padding:14px 16px;margin-bottom:24px;">
                <p style="margin:0;color:#92400e;font-size:13px;">
                  ⚠️ <strong>لا تشارك هذا الرمز مع أي شخص.</strong> فريق ${APP_NAME} لن يطلب منك هذا الرمز أبداً.
                </p>
              </div>

              <p style="margin:0;color:#9ca3af;font-size:13px;">
                إذا لم تطلب إنشاء حساب، يمكنك تجاهل هذا البريد بأمان.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background:#f9fafb;padding:20px 40px;text-align:center;border-top:1px solid #f3f4f6;">
              <p style="margin:0;color:#9ca3af;font-size:12px;">
                © ${new Date().getFullYear()} ${APP_NAME} · جميع الحقوق محفوظة
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;

  if (!resend) {
    console.warn("RESEND_API_KEY is not configured. Skipping OTP email send.");
    return;
  }

  await resend.emails.send({
    from: FROM_EMAIL,
    to: email,
    subject,
    html,
  });
}

export async function sendWelcomeEmail(email: string, name: string) {
  const subject = `مرحباً بك في ${APP_NAME}`;
  const html = `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif;direction:rtl;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
          <tr>
            <td style="background:linear-gradient(135deg,#0d9488,#0891b2);padding:32px 40px;text-align:center;">
              <div style="font-size:36px;margin-bottom:8px;">🎉</div>
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">${APP_NAME}</h1>
              <p style="margin:4px 0 0;color:#ccfbf1;font-size:13px;">تم تسجيلك بنجاح</p>
            </td>
          </tr>
          <tr>
            <td style="padding:40px;">
              <h2 style="margin:0 0 12px;color:#111827;font-size:20px;">مرحباً ${name} 👋</h2>
              <p style="margin:0 0 16px;color:#6b7280;font-size:15px;line-height:1.6;">
                شكراً لك على إنشاء حسابك في منصة ${APP_NAME}. يمكنك الآن الدخول إلى حسابك والبدء في استخدام الخدمات المتاحة.
              </p>
              <p style="margin:0;color:#4b5563;font-size:14px;line-height:1.7;">
                البريد الإلكتروني المسجل: <strong>${email}</strong>
              </p>
            </td>
          </tr>
          <tr>
            <td style="background:#f9fafb;padding:20px 40px;text-align:center;border-top:1px solid #f3f4f6;">
              <p style="margin:0;color:#9ca3af;font-size:12px;">
                © ${new Date().getFullYear()} ${APP_NAME} · جميع الحقوق محفوظة
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;

  if (!resend) {
    console.warn("RESEND_API_KEY is not configured. Skipping welcome email.");
    return;
  }

  await resend.emails.send({
    from: FROM_EMAIL,
    to: email,
    subject,
    html,
  });
}
