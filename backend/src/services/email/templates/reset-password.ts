import type { EmailLocale } from "../locale.js";
import { renderEmail, type RenderedEmail } from "./layout.js";

export function resetPasswordTemplate(
  locale: EmailLocale,
  { name, url }: { name: string; url: string }
): RenderedEmail {
  return renderEmail(
    locale,
    url,
    locale === "ar"
      ? {
          subject: "إعادة تعيين كلمة المرور في Becan",
          greeting: `مرحبًا ${name}،`,
          body: "تلقينا طلبًا لإعادة تعيين كلمة المرور لحسابك. اضغط الزر أدناه لاختيار كلمة مرور جديدة. تنتهي صلاحية الرابط خلال ساعة واحدة، وسيتم تسجيل خروجك من جميع الأجهزة.",
          action: "إعادة تعيين كلمة المرور",
          footer: "إذا لم تطلب ذلك، تجاهل هذه الرسالة وستبقى كلمة المرور كما هي."
        }
      : {
          subject: "Reset your Becan password",
          greeting: `Hi ${name},`,
          body: "We received a request to reset your password. Click the button below to choose a new one. The link expires in 1 hour, and you'll be signed out on all devices.",
          action: "Reset password",
          footer:
            "If you didn't ask for this, ignore this email and your password stays the same."
        }
  );
}
