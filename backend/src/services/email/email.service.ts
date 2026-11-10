// Account emails. Each send is fire-and-forget: callers return before delivery so response timing
// does not reveal whether an email exists. Failures are logged, never thrown.
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { resend } from "../../lib/resend.js";
import { resolveEmailLocale } from "./locale.js";
import { changeEmailTemplate } from "./templates/change-email.js";
import type { RenderedEmail } from "./templates/layout.js";
import { resetPasswordTemplate } from "./templates/reset-password.js";

type EmailKind = "reset-password" | "change-email";

type Recipient = { id: string; name: string; email: string };

async function deliver(
  kind: EmailKind,
  recipient: Recipient,
  email: RenderedEmail
): Promise<void> {
  if (!resend || !env.EMAIL_FROM) {
    logger.info(
      { kind, to: recipient.email, text: email.text },
      "Email not sent: no Resend client"
    );

    return;
  }

  const { error } = await resend.emails.send({
    from: env.EMAIL_FROM,
    to: recipient.email,
    subject: email.subject,
    html: email.html,
    text: email.text
  });

  if (error) {
    throw new Error(`${error.name}: ${error.message}`);
  }
}

function send(kind: EmailKind, recipient: Recipient, email: RenderedEmail): void {
  void deliver(kind, recipient, email).catch((error: unknown) => {
    logger.error({ error, kind, userId: recipient.id }, "Email delivery failed");
  });
}

// `recipient.email` is the new address; the link goes there, not to the current one.
export function sendChangeEmailVerification(
  recipient: Recipient,
  url: string,
  request?: Request
): void {
  const locale = resolveEmailLocale(request);

  send(
    "change-email",
    recipient,
    changeEmailTemplate(locale, { name: recipient.name, url })
  );
}

export function sendResetPasswordEmail(
  recipient: Recipient,
  url: string,
  request?: Request
): void {
  const locale = resolveEmailLocale(request);

  send(
    "reset-password",
    recipient,
    resetPasswordTemplate(locale, { name: recipient.name, url })
  );
}
