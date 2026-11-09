import nodemailer from "nodemailer";

export interface OutgoingMail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

type Sender = (message: OutgoingMail) => Promise<void>;

let testSender: Sender | null = null;

/** Подмена отправки в тестах. Боевой SMTP при этом не вызывается. */
export function setMailSenderForTests(sender: Sender | null): void {
  testSender = sender;
}

export function mailConfigured(): boolean {
  if (process.env["SVERKO_EMAIL_VERIFICATION"] === "off") return false;
  return Boolean(process.env["SMTP_HOST"]?.trim());
}

export function publicOrigin(request: Request): string {
  const configured = process.env["APP_URL"]?.trim();
  if (configured) return configured.replace(/\/$/, "");
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  if (host) {
    const proto = request.headers.get("x-forwarded-proto") || "http";
    return `${proto}://${host}`;
  }
  return new URL(request.url).origin;
}

export async function sendMail(message: OutgoingMail): Promise<void> {
  if (testSender) {
    await testSender(message);
    return;
  }
  const host = process.env["SMTP_HOST"]?.trim();
  if (!host) throw new Error("SMTP не настроен");
  const port = Number(process.env["SMTP_PORT"] || 465);
  const secure = process.env["SMTP_SECURE"] ? process.env["SMTP_SECURE"] === "true" : port === 465;
  const user = process.env["SMTP_USER"]?.trim();
  const pass = process.env["SMTP_PASS"] ?? "";
  const from = process.env["MAIL_FROM"]?.trim() || user;
  if (!from) throw new Error("Не задан адрес отправителя");
  const transport = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user ? { user, pass } : undefined,
  });
  await transport.sendMail({
    from,
    to: message.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });
}

export function verificationLetter(verifyUrl: string): Pick<OutgoingMail, "subject" | "text" | "html"> {
  const subject = "Подтвердите почту — Sverko";
  const text = `Подтвердите почту, чтобы открыть аккаунт Sverko:\n\n${verifyUrl}\n\nСсылка действует 48 часов. Если вы не регистрировались, письмо можно не открывать.`;
  const html = `<!DOCTYPE html>
<html lang="ru"><body style="margin:0;padding:24px;background:#f4f6f8;font-family:Arial,sans-serif;color:#17202a">
  <table role="presentation" width="100%" style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:28px">
    <tr><td>
      <p style="margin:0 0 8px;font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:#5b6b7c">Sverko</p>
      <h1 style="margin:0 0 12px;font-size:22px">Подтвердите почту</h1>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.5">После подтверждения можно входить и открывать свои проверки.</p>
      <p style="margin:0 0 20px"><a href="${verifyUrl}" style="display:inline-block;background:#17324d;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px">Подтвердить почту</a></p>
      <p style="margin:0;font-size:12px;line-height:1.5;color:#5b6b7c">Ссылка действует 48 часов. Если вы не создавали аккаунт, это письмо можно не открывать.</p>
    </td></tr>
  </table>
</body></html>`;
  return { subject, text, html };
}
