"""Shared HTML email template + sender for AquaGraph.

All outbound mail (verification codes, advanced reports, future alerts)
goes through `send_email()` here so:
  - branding is consistent (purple gradient header + logo + signature),
  - the SMTP_PASSWORD_FILE secret-mount convention is honoured in one
    place,
  - both a `text/plain` and a `text/html` part are sent (clients that
    block HTML still get a readable message),
  - the logo is embedded as a related part (no third-party image host,
    no remote tracking pixel - the GDPR claim in our Terms still holds).
"""

from __future__ import annotations

import logging
import os
import smtplib
from email.message import EmailMessage
from typing import Iterable, Optional, Tuple

logger = logging.getLogger("aquagraph.email")

# Brand palette - mirrors the App-level theme used in the frontend.
_C = {
    "ink":         "#1f1b2e",
    "muted":       "#6b7280",
    "border":      "#ede9fe",
    "tint":        "#faf5ff",
    "brand":       "#5a189a",
    "brand_deep":  "#3c096c",
    "brand_pop":   "#7b2cbf",
    "brand_dark":  "#10002b",
    "panel":       "#ffffff",
}

# No raster logo embedded in the email body. Gmail, Yahoo, and Apple Mail
# all surface inline `cid:` images as "attached" chips in their UI even
# with `Content-Disposition: inline` set properly - it's a long-standing
# client quirk every transactional-email provider hits. To keep the
# inbox view clean (and avoid making this look spammier than it is) we
# fall back to a CSS-only "AG" badge that matches the LogoBadge styling
# the frontend uses, rendered entirely with inline CSS so it works in
# every client that supports HTML email at all.


def _smtp_password() -> Optional[str]:
    """Resolve SMTP_PASSWORD or fall back to SMTP_PASSWORD_FILE (Docker
    secrets convention used by Postgres/Redis images). Centralising it
    here means new senders don't have to re-implement the lookup."""
    pw = os.getenv("SMTP_PASSWORD", "").strip()
    if pw:
        return pw
    pw_file = os.getenv("SMTP_PASSWORD_FILE", "").strip()
    if pw_file and os.path.exists(pw_file):
        try:
            with open(pw_file) as f:
                return f.read().strip()
        except Exception as e:
            logger.warning("could not read SMTP_PASSWORD_FILE %s: %s",
                           pw_file, e)
    return None


def _smtp_from() -> str:
    """Just the bare email address - the display name is added at the
    message-header level so it doesn't get baked into SMTP_FROM_EMAIL."""
    return (os.getenv("SMTP_FROM_EMAIL") or
            os.getenv("SMTP_USERNAME") or "")


def _wrap_html(body_html: str, *, preheader: str) -> str:
    """Wrap the per-email body fragment in our branded shell. The
    `preheader` is the small grey snippet inbox clients show next to the
    subject line - filling it improves open-rate signals and avoids
    leaking the first sentence of body text into that slot."""
    # CSS-only badge - never shows as an attachment, looks the same in
    # every modern client (Gmail web, Outlook, Apple Mail, Yahoo). The
    # white "AG" + brand gradient mirrors the frontend's LogoBadge.
    logo_html = (
        '<div style="width:44px;height:44px;border-radius:10px;'
        f'background:linear-gradient(135deg,{_C["brand_deep"]} 0%,'
        f'{_C["brand"]} 60%,{_C["brand_pop"]} 100%);display:inline-block;'
        'text-align:center;line-height:44px;color:#ffffff;font-weight:800;'
        'font-family:Inter,-apple-system,BlinkMacSystemFont,Arial,sans-serif;'
        'font-size:17px;letter-spacing:-0.5px;'
        f'box-shadow:0 2px 8px rgba(60,9,108,0.35),'
        f'inset 0 0 0 1px rgba(255,255,255,0.18);">AG</div>'
    )
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>AquaGraph</title>
</head>
<body style="margin:0;padding:0;background:{_C['tint']};font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:{_C['ink']};line-height:1.55;">
  <!-- preheader: invisible-by-design line that some inboxes show next
       to the subject. Improves preview without leaking body content. -->
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:{_C['tint']};">
    {preheader}
  </div>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:{_C['tint']};">
    <tr>
      <td align="center" style="padding:24px 16px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;background:{_C['panel']};border-radius:14px;overflow:hidden;box-shadow:0 4px 22px rgba(60,9,108,0.10);">
          <!-- Header band -->
          <tr>
            <td style="background:linear-gradient(135deg,{_C['brand_dark']} 0%,{_C['brand_deep']} 60%,{_C['brand_pop']} 100%);padding:20px 24px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td width="44" valign="middle" style="padding-right:14px;">{logo_html}</td>
                  <td valign="middle">
                    <div style="color:#ffffff;font-size:18px;font-weight:800;line-height:1.15;letter-spacing:-0.3px;">AquaGraph</div>
                    <div style="color:#e0aaff;font-size:11px;letter-spacing:1px;text-transform:uppercase;margin-top:3px;">Satellite Water Pollution Monitor</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:28px 28px 12px 28px;font-size:14.5px;color:{_C['ink']};">
              {body_html}
            </td>
          </tr>
          <!-- Signature -->
          <tr>
            <td style="padding:6px 28px 22px 28px;font-size:13px;color:{_C['ink']};">
              <p style="margin:18px 0 4px 0;">Best,</p>
              <p style="margin:0;font-weight:700;color:{_C['brand_deep']};">The AquaGraph Team</p>
              <p style="margin:2px 0 0 0;color:{_C['muted']};font-size:12px;">
                <a href="https://aquagraph.org" style="color:{_C['brand']};text-decoration:none;">aquagraph.org</a>
                &nbsp;·&nbsp;
                <a href="mailto:privacy@aquagraph.org" style="color:{_C['brand']};text-decoration:none;">privacy@aquagraph.org</a>
              </p>
            </td>
          </tr>
          <!-- Footer band -->
          <tr>
            <td style="background:{_C['tint']};border-top:1px solid {_C['border']};padding:14px 28px;font-size:11px;color:{_C['muted']};line-height:1.5;">
              Sentinel via Earth Engine. Indicative, not regulatory. You
              received this because you have an AquaGraph account and
              this address is on it. We only email you for sign-in and
              service-critical updates - never marketing.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
"""


def _text_signature(text: str) -> str:
    return (text.rstrip() +
            "\n\n"
            "- The AquaGraph Team\n"
            "  https://aquagraph.org · privacy@aquagraph.org\n\n"
            "Sentinel via Earth Engine. Indicative, not regulatory.\n"
            "You received this because this address is on an AquaGraph "
            "account. We only email for sign-in and service-critical "
            "updates - never marketing.\n")


def send_email(
    to_addr: str,
    subject: str,
    *,
    text_body: str,
    html_body: str,
    preheader: Optional[str] = None,
    attachments: Iterable[Tuple[str, bytes, str]] = (),
) -> None:
    """Send a single branded email. `attachments` is a tuple of
    (filename, bytes, mimetype) triples (e.g. the advanced-report PDF).

    Raises RuntimeError when SMTP isn't configured - the job worker
    catches it and stamps the failure on the row so it surfaces in the
    UI / API. We never silently drop a queued send."""
    smtp_host = os.getenv("SMTP_HOST")
    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    smtp_user = os.getenv("SMTP_USERNAME")
    smtp_pw   = _smtp_password()
    sender    = _smtp_from()
    use_tls   = os.getenv("SMTP_USE_TLS", "true").lower() != "false"
    if not smtp_host or not sender:
        raise RuntimeError("SMTP configuration is missing")

    # Optional friendly display name for the From header. Defaults to
    # "AquaGraph"; override via SMTP_FROM_NAME if needed.
    from_name = os.getenv("SMTP_FROM_NAME", "AquaGraph")

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"]    = f'"{from_name}" <{sender}>' if from_name else sender
    msg["To"]      = to_addr

    # Plain-text first (so non-HTML clients fall through to it), then
    # add the HTML alternative. No `related` images: the branding is
    # CSS-only so nothing shows up as an attachment chip in Gmail or
    # Yahoo (see _wrap_html for the why).
    msg.set_content(_text_signature(text_body))
    msg.add_alternative(
        _wrap_html(html_body, preheader=preheader or subject),
        subtype="html",
    )

    for filename, data, mime in attachments:
        maintype, _, subtype = (mime or "application/octet-stream").partition("/")
        msg.add_attachment(data, maintype=maintype or "application",
                            subtype=subtype or "octet-stream",
                            filename=filename)

    with smtplib.SMTP(smtp_host, smtp_port, timeout=30) as smtp:
        if use_tls:
            smtp.starttls()
        if smtp_user and smtp_pw:
            smtp.login(smtp_user, smtp_pw)
        smtp.send_message(msg)
    logger.info("email sent to=%s subject=%s attachments=%d",
                to_addr, subject, sum(1 for _ in attachments))
