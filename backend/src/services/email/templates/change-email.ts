import type { EmailLocale } from "../locale.js";
import { renderEmail, type RenderedEmail } from "./layout.js";

export function changeEmailTemplate(
  locale: EmailLocale,
  { name, url }: { name: string; url: string }
): RenderedEmail {
  return renderEmail(
    locale,
    url,
    locale === "ar"
      ? {
          subject: "تأكيد بريدك الإلكتروني الجديد في Becan",
          greeting: `مرحبًا ${name}،`,
          body: "طلبت تغيير البريد الإلكتروني لحسابك في Becan إلى هذا العنوان. اضغط الزر أدناه لتأكيد التغيير. تنتهي صلاحية الرابط خلال ساعة واحدة.",
          action: "تأكيد البريد الإلكتروني الجديد",
          footer: "إذا لم تطلب ذلك، تجاهل هذه الرسالة ولن يتغير بريدك الإلكتروني."
        }
      : {
          subject: "Confirm your new email for Becan",
          greeting: `Hi ${name},`,
          body: "You asked to change your Becan account email to this address. Click the button below to confirm. The link expires in 1 hour.",
          action: "Confirm new email",
          footer:
            "If you didn't ask for this, ignore this email and your email stays the same."
        }
  );
}
