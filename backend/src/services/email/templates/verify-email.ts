import type { EmailLocale } from "../locale.js";
import { renderEmail, type RenderedEmail } from "./layout.js";

export function verifyEmailTemplate(
  locale: EmailLocale,
  { name, url }: { name: string; url: string }
): RenderedEmail {
  return renderEmail(
    locale,
    url,
    locale === "ar"
      ? {
          subject: "تأكيد بريدك الإلكتروني في Becan",
          greeting: `مرحبًا ${name}،`,
          body: "اضغط الزر أدناه لتأكيد بريدك الإلكتروني وتفعيل حسابك. تنتهي صلاحية الرابط خلال ساعة واحدة.",
          action: "تأكيد البريد الإلكتروني",
          footer: "إذا لم تنشئ حسابًا في Becan، تجاهل هذه الرسالة."
        }
      : {
          subject: "Verify your email for Becan",
          greeting: `Hi ${name},`,
          body: "Click the button below to verify your email and activate your account. The link expires in 1 hour.",
          action: "Verify email",
          footer: "If you didn't create a Becan account, you can ignore this email."
        }
  );
}
