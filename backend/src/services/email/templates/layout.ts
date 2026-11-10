import type { EmailLocale } from "../locale.js";

export type RenderedEmail = { subject: string; html: string; text: string };

export type EmailContent = {
  subject: string;
  greeting: string;
  body: string;
  action: string;
  footer: string;
};

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// Arabic renders right-to-left, English left-to-right. Both use Western digits (0-9).
export function renderEmail(
  locale: EmailLocale,
  url: string,
  content: EmailContent
): RenderedEmail {
  const dir = locale === "ar" ? "rtl" : "ltr";
  const align = locale === "ar" ? "right" : "left";
  const href = escapeHtml(url);

  const html = `<!doctype html>
<html lang="${locale}" dir="${dir}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(content.subject)}</title>
  </head>
  <body style="margin:0;padding:24px;background:#f5f5f4;font-family:Tahoma,Arial,sans-serif;color:#1c1917;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" dir="${dir}">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:12px;padding:32px;text-align:${align};">
            <tr><td style="font-size:20px;font-weight:bold;padding-bottom:16px;">Becan</td></tr>
            <tr><td style="font-size:16px;line-height:1.7;padding-bottom:8px;">${escapeHtml(content.greeting)}</td></tr>
            <tr><td style="font-size:16px;line-height:1.7;padding-bottom:24px;">${escapeHtml(content.body)}</td></tr>
            <tr>
              <td style="padding-bottom:24px;">
                <a href="${href}" style="display:inline-block;background:#1c1917;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:16px;">${escapeHtml(content.action)}</a>
              </td>
            </tr>
            <tr><td style="font-size:13px;line-height:1.7;color:#78716c;word-break:break-all;">${href}</td></tr>
            <tr><td style="font-size:13px;line-height:1.7;color:#78716c;padding-top:16px;">${escapeHtml(content.footer)}</td></tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    content.greeting,
    "",
    content.body,
    "",
    `${content.action}: ${url}`,
    "",
    content.footer
  ].join("\n");

  return { subject: content.subject, html, text };
}
