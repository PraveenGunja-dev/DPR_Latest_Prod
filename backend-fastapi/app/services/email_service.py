# app/services/email_service.py
"""
Email service using aiosmtplib.
Direct port of Express services/emailService.js
"""

import logging
import asyncio
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional

import aiosmtplib

from app.config import settings

logger = logging.getLogger("adani-flow.email")


def _get_from_address() -> str:
    return settings.EMAIL_FROM or settings.SMTP_USERNAME or "no-reply-ai-agel@adani.com"


def _get_app_base_url() -> str:
    return settings.APP_BASE_URL


def _get_email_base(title: str, subtitle: str, content: str) -> str:
    """Generate the HTML email base template with a clean, professional corporate design."""
    base_url = _get_app_base_url()
    return f"""<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>{title}</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;">
<tr><td align="center" style="padding:40px 10px;">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,.05);text-align:left;">
<tr><td style="background-color: #1e3a8a; padding: 30px 40px; border-bottom: 4px solid #3b82f6;">
  <h1 style="color:#ffffff;margin:0;font-size:22px;font-weight:600;letter-spacing:0.5px;">{title}</h1>
  <p style="color:#bfdbfe;margin:5px 0 0;font-size:14px;font-weight:400;">{subtitle}</p>
</td></tr>
<tr><td style="padding:35px 40px;">{content}</td></tr>
<tr><td style="background:#f8fafc;padding:20px 40px;text-align:center;border-top:1px solid #e2e8f0;">
<p style="color:#64748b;font-size:12px;margin:0;line-height:1.5;">This is an automated notification from <b>Digitalized DPR</b>.<br>
Please do not reply to this email.</p>
</td></tr>
</table></td></tr></table></body></html>"""


def _write_dev_outbox(to: str, subject: str, html: str) -> Optional[str]:
    """
    Development helper: drop the rendered email into a local directory.

    Only active when SMTP_DEV_OUTBOX_ENABLE is true AND SMTP_DEV_OUTBOX names a
    directory. It exists so the OTP flows can be exercised on a machine that
    cannot reach the internal SMTP host. The files contain live verification
    codes, so this must stay off in production.
    """
    if not (settings.SMTP_DEV_OUTBOX_ENABLE and settings.SMTP_DEV_OUTBOX):
        return None
    try:
        import datetime
        import os
        import re

        os.makedirs(settings.SMTP_DEV_OUTBOX, exist_ok=True)
        stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S-%f")
        safe_to = re.sub(r"[^A-Za-z0-9._@-]", "_", to)
        path = os.path.join(settings.SMTP_DEV_OUTBOX, f"{stamp}_{safe_to}.html")
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(f"<!-- To: {to}\n     Subject: {subject} -->\n{html}")
        logger.warning(f"[EmailService] DEV OUTBOX: email written to {path} (not sent by SMTP)")
        return path
    except Exception as e:
        logger.error(f"[EmailService] Could not write to the dev outbox: {e}")
        return None


async def _send_mail(to: str, subject: str, html: str, attachment: Optional[dict] = None, cc: Optional[str] = None) -> dict:
    """
    Send an email via SMTP.

    Returns {"success": bool, ...}. Callers that gate a user flow on delivery
    (the OTP paths) must check `success` - reporting "code sent" when nothing
    left the building strands the user on a verification screen.
    """
    smtp_server = settings.SMTP_SERVER
    smtp_port = settings.SMTP_PORT

    outbox_path = _write_dev_outbox(to, subject, html)

    if not smtp_server:
        if outbox_path:
            return {"success": True, "devOutbox": outbox_path}
        logger.warning("[EmailService] No SMTP configuration found. Email not sent.")
        return {"success": False, "error": "Email service is not configured"}

    msg = MIMEMultipart("alternative")
    msg["From"] = _get_from_address()
    msg["To"] = to
    if cc:
        msg["Cc"] = cc
    msg["Subject"] = subject
    msg.attach(MIMEText(html, "html"))

    if attachment:
        from email.mime.application import MIMEApplication
        part = MIMEApplication(attachment["content"], Name=attachment["filename"])
        part["Content-Disposition"] = f'attachment; filename="{attachment["filename"]}"'
        msg.attach(part)

    try:
        use_tls = smtp_port == 465
        start_tls = smtp_port != 465 and smtp_port != 25

        # Only provide username/password if authentication is required (password is set)
        username = settings.SMTP_USERNAME if settings.SMTP_PASSWORD else None
        password = settings.SMTP_PASSWORD if settings.SMTP_PASSWORD else None

        await aiosmtplib.send(
            msg,
            hostname=smtp_server,
            port=smtp_port,
            use_tls=use_tls,
            start_tls=start_tls,
            username=username,
            password=password,
            validate_certs=False,
        )
        logger.info(f"[EmailService] Email sent to {to}: {subject}")
        return {"success": True}
    except Exception as e:
        logger.error(f"[EmailService] Error sending email: {e}")
        # A dev outbox copy still counts as delivered for local testing.
        if outbox_path:
            return {"success": True, "devOutbox": outbox_path, "smtpError": str(e)}
        return {"success": False, "error": str(e)}


async def send_account_setup_email(user_email: str, user_name: str, role: Optional[str] = None) -> dict:
    """
    Notify a newly created email-login user that their account exists.

    Deliberately carries NO credentials. The administrator hands over the
    temporary password out of band; the user is then forced to replace it on
    first login, so no password ever travels by email.
    """
    base_url = _get_app_base_url()
    role_row = f'<p style="margin:0;"><strong style="color:#64748b;">Role:</strong> <span style="color:#0f172a;">{role}</span></p>' if role else ""
    content = f"""
    <p style="color:#334155;font-size:16px;line-height:1.6;margin-top:0;margin-bottom:24px;">
      Hello <b>{user_name}</b>,<br><br>
      An account has been created for you on Digitalized DPR.
    </p>
    <div style="background:#f8fafc;border-radius:8px;margin-bottom:24px;border:1px solid #e2e8f0;padding:20px;">
      <p style="margin:0 0 12px;"><strong style="color:#64748b;">Login Email:</strong> <span style="color:#0f172a;">{user_email}</span></p>
      {role_row}
    </div>
    <div style="background:#eff6ff;border-radius:8px;border:1px solid #3b82f6;padding:20px;margin-bottom:24px;">
      <p style="margin:0 0 8px;color:#1e3a8a;font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:0.08em;">Getting Started</p>
      <p style="margin:0;color:#1e40af;font-size:14px;line-height:1.6;">
        Your administrator will share a temporary password with you separately.
        For your security it is never sent by email. On your first sign in you
        will be asked to create your own password and confirm it with a
        verification code.
      </p>
    </div>
    <div style="text-align:center;"><a href="{base_url}" style="background:#09090b;color:#fff;font-size:15px;font-weight:600;text-decoration:none;padding:14px 36px;border-radius:8px;display:inline-block;">Sign In</a></div>
    """
    html = _get_email_base("Your Digitalized DPR Account", "Account created - action required", content)
    return await _send_mail(user_email, "Digitalized DPR - Your account is ready", html)


async def send_otp_email(
    to_email: str,
    user_name: str,
    otp: str,
    purpose_label: str,
    expiry_minutes: int,
) -> dict:
    """
    Deliver a one-time verification code.

    The code appears in the message body only. It is never logged here or in
    _send_mail, which records the recipient and subject alone.
    """
    content = f"""
    <p style="color:#334155;font-size:16px;">Hello <b>{user_name}</b>,</p>
    <p style="color:#334155;font-size:16px;">Use the verification code below to continue: <b>{purpose_label}</b>.</p>
    <div style="background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;padding:28px 20px;margin:24px 0;text-align:center;">
      <p style="margin:0 0 12px;color:#64748b;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:0.12em;">Verification Code</p>
      <p style="margin:0;color:#0f172a;font-family:'Courier New',monospace;font-size:34px;font-weight:700;letter-spacing:0.35em;">{otp}</p>
    </div>
    <p style="color:#334155;font-size:15px;line-height:1.6;">
      This code expires in <b>{expiry_minutes} minutes</b> and can be used once.
    </p>
    <div style="background:#fef2f2;border-radius:8px;border:1px solid #ef4444;padding:16px;margin-top:24px;">
      <p style="margin:0;color:#991b1b;font-size:14px;line-height:1.6;">
        Digitalized DPR will never ask you for this code. If you did not request
        it, ignore this email and notify your administrator.
      </p>
    </div>
    """
    html = _get_email_base("Verification Code", purpose_label, content)
    return await _send_mail(to_email, f"Digitalized DPR - Your verification code", html)


async def send_password_changed_email(user_email: str, user_name: str, expires_at: str) -> dict:
    """Confirm a completed password change and state the next expiry date."""
    base_url = _get_app_base_url()
    content = f"""
    <p style="color:#334155;font-size:16px;">Hello <b>{user_name}</b>,</p>
    <p style="color:#334155;font-size:16px;">Your Digitalized DPR password was changed successfully.</p>
    <div style="background:#ecfdf5;border-radius:8px;border:1px solid #10b981;padding:20px;margin-bottom:24px;">
      <p style="margin:0 0 10px;"><strong style="color:#065f46;">Account:</strong> <span style="color:#064e3b;">{user_email}</span></p>
      <p style="margin:0;"><strong style="color:#065f46;">Next expiry:</strong> <span style="color:#064e3b;">{expires_at}</span></p>
    </div>
    <div style="background:#fef2f2;border-radius:8px;border:1px solid #ef4444;padding:16px;margin-bottom:24px;">
      <p style="margin:0;color:#991b1b;font-size:14px;line-height:1.6;">
        If you did not make this change, contact your administrator immediately.
      </p>
    </div>
    <div style="text-align:center;"><a href="{base_url}" style="background:#09090b;color:#fff;padding:14px 36px;border-radius:8px;display:inline-block;text-decoration:none;">Go to Digitalized DPR</a></div>
    """
    html = _get_email_base("Password Changed", "Security notification", content)
    return await _send_mail(user_email, "Digitalized DPR - Your password was changed", html)


async def send_password_expiry_warning_email(user_email: str, user_name: str, days_left: int) -> dict:
    """Warn an email-login user that their password is about to expire."""
    base_url = _get_app_base_url()
    day_word = "day" if days_left == 1 else "days"
    urgency = "#ef4444" if days_left <= 1 else "#f59e0b"
    content = f"""
    <p style="color:#334155;font-size:16px;">Hello <b>{user_name}</b>,</p>
    <p style="color:#334155;font-size:16px;">
      Your Digitalized DPR password will expire in <b style="color:{urgency};">{days_left} {day_word}</b>.
      Please change it before then to avoid losing access.
    </p>
    <div style="background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;padding:20px;margin-bottom:24px;">
      <p style="margin:0 0 10px;"><strong style="color:#64748b;">Account:</strong> {user_email}</p>
      <p style="margin:0;"><strong style="color:#64748b;">Expires in:</strong> <span style="font-weight:700;color:{urgency};">{days_left} {day_word}</span></p>
    </div>
    <p style="color:#64748b;font-size:15px;">Change it from <b>Profile &rsaquo; Security &rsaquo; Change Password</b>.</p>
    <div style="text-align:center;margin-top:24px;"><a href="{base_url}/profile/security" style="background:#09090b;color:#fff;padding:14px 36px;border-radius:8px;display:inline-block;text-decoration:none;">Change Password</a></div>
    """
    html = _get_email_base("Password Expiring Soon", f"Action required in {days_left} {day_word}", content)
    return await _send_mail(user_email, f"Digitalized DPR - Your password expires in {days_left} {day_word}", html)


async def send_recovery_email_changed_email(user_email: str, user_name: str, new_recovery: str) -> dict:
    """Tell the primary address that a recovery address was verified and set."""
    content = f"""
    <p style="color:#334155;font-size:16px;">Hello <b>{user_name}</b>,</p>
    <p style="color:#334155;font-size:16px;">A recovery email address was verified and added to your Digitalized DPR account.</p>
    <div style="background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;padding:20px;margin-bottom:24px;">
      <p style="margin:0 0 10px;"><strong style="color:#64748b;">Login Email:</strong> {user_email}</p>
      <p style="margin:0;"><strong style="color:#64748b;">Recovery Email:</strong> {new_recovery}</p>
    </div>
    <div style="background:#fef2f2;border-radius:8px;border:1px solid #ef4444;padding:16px;">
      <p style="margin:0;color:#991b1b;font-size:14px;line-height:1.6;">
        If you did not make this change, contact your administrator immediately.
      </p>
    </div>
    """
    html = _get_email_base("Recovery Email Updated", "Security notification", content)
    return await _send_mail(user_email, "Digitalized DPR - Recovery email updated", html)


async def send_access_request_email(admin_email: str, user_name: str, user_email: str, requested_role: str, justification: Optional[str] = None) -> dict:
    base_url = _get_app_base_url()
    justification_row = f'<p style="margin:0;"><strong style="color:#64748b;">Justification:</strong> {justification}</p>' if justification else ""
    content = f"""
    <p style="color:#334155;font-size:16px;line-height:1.6;">A new user has requested platform access via SSO.</p>
    <div style="background:#f8fafc;border-radius:8px;margin-bottom:30px;border:1px solid #e2e8f0;padding:20px;">
      <p style="margin:0 0 16px;"><strong>Name:</strong> {user_name}</p>
      <p style="margin:0 0 16px;"><strong>Email:</strong> {user_email}</p>
      <p style="margin:0;"><strong>Requested Role:</strong> <span style="background:#2563eb;color:#fff;padding:4px 12px;border-radius:20px;font-size:12px;">{requested_role}</span></p>
      {justification_row}
    </div>
    <div style="text-align:center;"><a href="{base_url}/superadmin" style="background:#09090b;color:#fff;padding:14px 36px;border-radius:8px;display:inline-block;text-decoration:none;">Review Request</a></div>
    """
    html = _get_email_base("New Access Request", "Action Required", content)
    return await _send_mail(admin_email, f"\U0001f510 Digitalized DPR - Access Request: {user_name}", html)


async def send_access_approved_email(user_email: str, user_name: str, assigned_role: str) -> dict:
    base_url = _get_app_base_url()
    content = f"""
    <p style="color:#334155;font-size:16px;">Hello <b>{user_name}</b>, your access request has been <b>approved</b>.</p>
    <div style="background:#ecfdf5;border-radius:8px;border:1px solid #10b981;padding:24px;margin-bottom:30px;text-align:center;">
      <div style="margin-bottom:15px;"><img src="{base_url}/adani-a.svg" height="40" alt="Success"></div>
      <p style="margin:0 0 8px;color:#064e3b;font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:0.1em;">Assigned Role</p>
      <span style="background:#10b981;color:#fff;padding:6px 16px;border-radius:20px;font-size:15px;font-weight:600;display:inline-block;">{assigned_role}</span>
    </div>
    <div style="text-align:center;"><a href="{base_url}" style="background:#10b981;color:#fff;padding:14px 36px;border-radius:8px;display:inline-block;text-decoration:none;">Access Digitalized DPR</a></div>
    """
    html = _get_email_base("Access Approved", "Your role has been granted", content)
    return await _send_mail(user_email, "\u2705 Digitalized DPR - Access Approved", html)


async def send_access_rejected_email(user_email: str, user_name: str, reason: Optional[str] = None) -> dict:
    reason_block = f'<div style="background:#fef2f2;border-radius:8px;border:1px solid #ef4444;padding:20px;margin-bottom:24px;"><p style="margin:0 0 6px;color:#7f1d1d;font-weight:600;">REASON</p><p style="margin:0;color:#991b1b;">{reason}</p></div>' if reason else ""
    content = f"""
    <p style="color:#334155;font-size:16px;">Hello <b>{user_name}</b>, your access request has been <b>declined</b>.</p>
    {reason_block}
    <p style="color:#64748b;font-size:15px;">Please contact your supervisor or IT team for clarification.</p>
    """
    html = _get_email_base("Access Request Declined", "Update on your account", content)
    return await _send_mail(user_email, "Digitalized DPR - Access Request Update", html)


async def send_access_request_confirmation(user_email: str, user_name: str, requested_role: str) -> dict:
    base_url = _get_app_base_url()
    content = f"""
    <p style="color:#334155;font-size:16px;">Hello <b>{user_name}</b>,</p>
    <p style="color:#334155;font-size:16px;">Your access request for <b>Digitalized DPR</b> has been received and is currently being reviewed by our system administrators.</p>
    <div style="background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;padding:20px;margin-bottom:24px;">
      <p style="margin:0 0 10px;"><strong style="color:#64748b;">Requested Role:</strong> {requested_role}</p>
      <p style="margin:0;"><strong style="color:#64748b;">Status:</strong> <span style="font-weight:700;color:#f59e0b;">Pending Approval</span></p>
    </div>
    <p style="color:#64748b;font-size:15px;">You will receive another email once your request has been processed (typically within 24 hours).</p>
    <div style="text-align:center;margin-top:30px;"><a href="{base_url}" style="background:#09090b;color:#fff;padding:14px 36px;border-radius:8px;display:inline-block;text-decoration:none;">Go to Platform</a></div>
    """
    html = _get_email_base("Access Request Received", "Your request is being reviewed", content)
    return await _send_mail(user_email, "\u23f3 Digitalized DPR - Access Request Received", html)


async def send_dpr_status_email(user_email: str, user_name: str, sheet_type: str, status: str, project_name: str, entry_date: str, reason: Optional[str] = None) -> dict:
    base_url = _get_app_base_url()
    status_label = status.replace("_", " ").title()
    reason_block = f'<div style="background:#fef2f2;border-radius:8px;border:1px solid #ef4444;padding:15px;margin-bottom:20px;"><p style="margin:0;color:#991b1b;"><b>Reason:</b> {reason}</p></div>' if reason else ""
    
    content = f"""
    <p style="color:#334155;font-size:16px;">Hello <b>{user_name}</b>,</p>
    <p style="color:#334155;font-size:16px;">The status of your DPR entry has been updated:</p>
    <div style="background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;padding:20px;margin-bottom:24px;">
      <p style="margin:0 0 10px;"><strong style="color:#64748b;">Project:</strong> {project_name}</p>
      <p style="margin:0 0 10px;"><strong style="color:#64748b;">Sheet Type:</strong> {sheet_type}</p>
      <p style="margin:0 0 10px;"><strong style="color:#64748b;">Entry Date:</strong> {entry_date}</p>
      <p style="margin:0;"><strong style="color:#64748b;">New Status:</strong> <span style="font-weight:700;color:#09090b;">{status_label}</span></p>
    </div>
    {reason_block}
    <div style="text-align:center;"><a href="{base_url}" style="background:#09090b;color:#fff;padding:14px 36px;border-radius:8px;display:inline-block;text-decoration:none;">View in Platform</a></div>
    """
    html = _get_email_base(f"DPR Status Update: {status_label}", "Update on your submission", content)
    try:
        return await asyncio.wait_for(_send_mail(user_email, f"DPR Status Update - {project_name} - {sheet_type}", html), timeout=3.0)
    except (asyncio.TimeoutError, TimeoutError):
        logger.warning(f"[EmailService] SMTP timeout (3s) exceeded for DPR status email to {user_email}. Skipping.")
        return {"success": False, "error": "Timeout"}


async def send_dpr_submission_email(approver_email: str, approver_name: str, supervisor_name: str, project_name: str, entry_date: str) -> dict:
    base_url = _get_app_base_url()
    
    content = f"""
    <p style="color:#334155;font-size:16px;">Hello <b>{approver_name}</b>,</p>
    <p style="color:#334155;font-size:16px;">A new DPR entry has been submitted and is pending your approval:</p>
    <div style="background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;padding:20px;margin-bottom:24px;">
      <p style="margin:0 0 10px;"><strong style="color:#64748b;">Project:</strong> {project_name}</p>
      <p style="margin:0 0 10px;"><strong style="color:#64748b;">Entry Date:</strong> {entry_date}</p>
      <p style="margin:0;"><strong style="color:#64748b;">Submitted By:</strong> <span style="font-weight:700;color:#09090b;">{supervisor_name}</span></p>
    </div>
    <div style="text-align:center;"><a href="{base_url}" style="background:#09090b;color:#fff;padding:14px 36px;border-radius:8px;display:inline-block;text-decoration:none;">Review in Platform</a></div>
    """
    subject = f"Action Required: DPR Submitted for {project_name} - Assigned To: {approver_name} - Date: {entry_date}"
    html = _get_email_base("DPR Submission - Pending Approval", "Action Required", content)
    
    try:
        return await asyncio.wait_for(_send_mail(approver_email, subject, html), timeout=3.0)
    except (asyncio.TimeoutError, TimeoutError):
        logger.warning(f"[EmailService] SMTP timeout (3s) exceeded for DPR submission email to {approver_email}. Skipping.")
        return {"success": False, "error": "Timeout"}


async def send_drone_report_email(to_email: str, sender_name: str, project_name: str, report_date: str, excel_bytes: bytes) -> dict:
    base_url = _get_app_base_url()
    content = f"""
    <p style="color:#334155;font-size:16px;">Hello,</p>
    <p style="color:#334155;font-size:16px;">Please find the attached Drone Verification Export for <b>{project_name}</b>.</p>
    <div style="background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;padding:20px;margin-bottom:24px;">
      <p style="margin:0 0 10px;"><strong style="color:#64748b;">Project:</strong> {project_name}</p>
      <p style="margin:0 0 10px;"><strong style="color:#64748b;">Report Date:</strong> {report_date}</p>
      <p style="margin:0;"><strong style="color:#64748b;">Sent By:</strong> {sender_name}</p>
    </div>
    <p style="color:#64748b;font-size:15px;">The attached Excel file contains detailed block-wise variation reports comparing DPR vs Drone actuals for Construction, Inverter, Robot, and AC Works.</p>
    <br/>
    <p style="color:#334155;font-size:15px;margin:0;">Regards,</p>
    <p style="color:#334155;font-size:15px;font-weight:bold;margin:0;">Digitalized DPR Team</p>
    """
    html = _get_email_base("Drone Verification Report", "Automated Excel Export", content)
    
    attachment = {
        "filename": f"Drone_Report_{report_date}.xlsx",
        "content": excel_bytes
    }
    
    return await _send_mail(to_email, f"Drone Verification Report - {project_name}", html, attachment=attachment)

async def send_p6_password_expiry_email(to_emails: list[str], days_left: int) -> dict:
    base_url = _get_app_base_url()
    is_expired = days_left <= 0
    
    if is_expired:
        title = "P6 Password Expired"
        subtitle = "Action Required: Update P6 Credentials"
        message = "The Oracle P6 password has expired. Please update it immediately to restore P6 integrations."
        status_color = "#ef4444"
        days_text = "Expired"
    else:
        title = "P6 Password Expiring Soon"
        subtitle = f"Action Required in {days_left} days"
        message = f"The Oracle P6 password will expire in {days_left} days. Please update it to prevent integration failures."
        status_color = "#f59e0b"
        days_text = f"{days_left} Days"

    content = f"""
    <p style="color:#334155;font-size:16px;">Hello Super Admin,</p>
    <p style="color:#334155;font-size:16px;">{message}</p>
    <div style="background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;padding:20px;margin-bottom:24px;">
      <p style="margin:0 0 10px;"><strong style="color:#64748b;">Account:</strong> agel.forecasting@adani.com</p>
      <p style="margin:0;"><strong style="color:#64748b;">Status:</strong> <span style="font-weight:700;color:{status_color};">{days_text}</span></p>
    </div>
    <div style="text-align:center;"><a href="{base_url}/superadmin" style="background:#09090b;color:#fff;padding:14px 36px;border-radius:8px;display:inline-block;text-decoration:none;">Update Password in Dashboard</a></div>
    """
    html = _get_email_base(title, subtitle, content)
    
    results = []
    for email in to_emails:
        res = await _send_mail(email, f"⚠️ Digitalized DPR - {title}", html)
        results.append(res)
        
    return {"success": all(r.get("success") for r in results)}


async def send_delay_alerts_email(to_email: str, sender_name: str, excel_bytes: bytes, cc_email: Optional[str] = None) -> dict:
    base_url = _get_app_base_url()
    content = f"""
    <p style="color:#334155;font-size:16px;">Hello,</p>
    <p style="color:#334155;font-size:16px;">Please find the attached <b>Delayed Activities Report</b> for the Wind Projects.</p>
    <div style="background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;padding:20px;margin-bottom:24px;">
      <p style="margin:0 0 10px;"><strong style="color:#64748b;">Report Type:</strong> Delayed Activities / Issues</p>
      <p style="margin:0;"><strong style="color:#64748b;">Requested By:</strong> {sender_name}</p>
    </div>
    <p style="color:#64748b;font-size:15px;">The attached Excel file contains detailed delayed activities grouped by project.</p>
    <br/>
    <p style="color:#334155;font-size:15px;margin:0;">Regards,</p>
    <p style="color:#334155;font-size:15px;font-weight:bold;margin:0;">Digitalized DPR Team</p>
    """
    html = _get_email_base("Delay Alerts Report", "Automated Excel Export", content)
    
    import datetime
    report_date = datetime.date.today().strftime("%d_%b_%Y")
    
    attachment = {
        "filename": f"Delayed_Activities_{report_date}.xlsx",
        "content": excel_bytes
    }
    
    return await _send_mail(to_email, f"Delayed Activities Report - Wind Projects", html, attachment=attachment, cc=cc_email)


async def send_issue_notification_email(to_email: str, issue_data: dict, attachment_bytes: Optional[bytes] = None, attachment_name: Optional[str] = None) -> dict:
    base_url = _get_app_base_url()
    project_name = issue_data.get('project_name', 'Unknown Project')
    location = issue_data.get('location', 'N/A')
    activity = issue_data.get('activity', 'N/A')
    description = issue_data.get('description', '')
    priority = issue_data.get('priority', 'Medium')
    status = issue_data.get('status', 'Open')
    remarks = issue_data.get('remarks', 'None')
    wbs = issue_data.get('wbs', 'N/A')
    action_required = issue_data.get('actionRequired', 'None')

    subject = f"[{project_name}] - [{location}] - [{activity}] - Issue"

    content = f"""
    <p style="color:#334155;font-size:16px;margin-bottom:12px;">Dear Project Team,</p>
    <p style="color:#334155;font-size:16px;">A new issue has been logged and assigned for your attention. Please find the details below:</p>
    <div style="background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;padding:20px;margin-bottom:24px;">
      <p style="margin:0 0 10px;"><strong style="color:#64748b;">Project Name:</strong> {project_name}</p>
      <p style="margin:0 0 10px;"><strong style="color:#64748b;">Block/Location:</strong> {location}</p>
      <p style="margin:0 0 10px;"><strong style="color:#64748b;">WBS:</strong> {wbs}</p>
      <p style="margin:0 0 10px;"><strong style="color:#64748b;">Activity:</strong> {activity}</p>
      <p style="margin:0 0 10px;"><strong style="color:#64748b;">Priority:</strong> {priority}</p>
      <p style="margin:0 0 10px;"><strong style="color:#64748b;">Status:</strong> {status}</p>
      <p style="margin:0 0 10px;"><strong style="color:#64748b;">Action Required:</strong> {action_required}</p>
      <p style="margin:0 0 10px;"><strong style="color:#64748b;">Remarks:</strong> {remarks}</p>
      <p style="margin:16px 0 6px;"><strong style="color:#64748b;">Issue Description:</strong></p>
      <p style="margin:0;color:#0f172a;background:#fff;padding:12px;border:1px solid #e2e8f0;border-radius:6px;white-space:pre-wrap;">{description}</p>
    </div>
    """
    html = _get_email_base("New Issue Notification", "Action Required", content)
    
    attachment = None
    if attachment_bytes and attachment_name:
        attachment = {
            "filename": attachment_name,
            "content": attachment_bytes
        }
        
    return await _send_mail(to_email, subject, html, attachment=attachment)
