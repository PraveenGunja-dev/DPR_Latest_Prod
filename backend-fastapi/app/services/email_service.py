# app/services/email_service.py
"""
Email service using aiosmtplib.
Direct port of Express services/emailService.js
"""

import logging
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
    """Generate the HTML email base template (matching Express template)."""
    base_url = _get_app_base_url()
    return f"""<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>{title}</title></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:'Adani',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;">
<tr><td align="center" style="padding:50px 20px;">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 10px 40px rgba(0,0,0,.08);text-align:left;">
<tr><td style="background-image: url('https://digitalized-dpr.adani.com/coverPhoto.png'); background-size: cover; background-position: center; border-radius: 16px 16px 0 0; background-color: #1B4F72; padding: 40px 40px 30px;">
  <table width="100%"><tr><td>
    <h1 style="color:#ffffff;margin:0;font-size:24px;font-weight:700;text-shadow: 0 2px 4px rgba(0,0,0,0.5);">{title}</h1>
    <p style="color:rgba(255,255,255,0.9);margin:6px 0 0;font-size:14px;text-shadow: 0 1px 3px rgba(0,0,0,0.5);">{subtitle}</p>
  </td><td align="right" valign="middle">
    <img src="https://digitalized-dpr.adani.com/logo.png" alt="Adani Logo" height="35" style="display:block;margin-left:auto;filter: brightness(0) invert(1);">
  </td></tr></table>
</td></tr>
<tr><td style="padding:30px 40px;">{content}</td></tr>
<tr><td style="background:#f1f5f9;padding:24px 40px;text-align:center;">
<p style="color:#94a3b8;font-size:12px;margin:0;line-height:1.6;">This is an automated notification from <b>Digitalized DPR</b>.<br>
Please do not reply to this email. Secure your credentials at all times.</p>
</td></tr>
</table></td></tr></table></body></html>"""


async def _send_mail(to: str, subject: str, html: str) -> dict:
    """Send an email via SMTP."""
    smtp_server = settings.SMTP_SERVER
    smtp_port = settings.SMTP_PORT

    if not smtp_server:
        logger.warning("[EmailService] No SMTP configuration found. Email not sent.")
        return {"success": True, "message": "Email service not configured"}

    msg = MIMEMultipart("alternative")
    msg["From"] = _get_from_address()
    msg["To"] = to
    msg["Subject"] = subject
    msg.attach(MIMEText(html, "html"))

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
        return {"success": False, "error": str(e)}


async def send_welcome_email(user_email: str, user_name: str, password: str) -> dict:
    base_url = _get_app_base_url()
    content = f"""
    <p style="color:#334155;font-size:16px;line-height:1.6;margin-top:0;margin-bottom:24px;">
      Hello <b>{user_name}</b>,<br><br>
      Your account has been successfully created on Digitalized DPR.
    </p>
    <div style="background:#f8fafc;border-radius:8px;margin-bottom:30px;border:1px solid #e2e8f0;padding:20px;">
      <p style="margin:0 0 12px;"><strong style="color:#64748b;">Email:</strong> <span style="color:#0f172a;">{user_email}</span></p>
      <p style="margin:0;"><strong style="color:#64748b;">Password:</strong> <span style="color:#0f172a;font-family:monospace;font-weight:600;">{password}</span></p>
    </div>
    <div style="text-align:center;"><a href="{base_url}" style="background:#09090b;color:#fff;font-size:15px;font-weight:600;text-decoration:none;padding:14px 36px;border-radius:8px;display:inline-block;">Access Platform</a></div>
    """
    html = _get_email_base("Welcome to Digitalized DPR", "Your Account Credentials", content)
    return await _send_mail(user_email, "Welcome to Digitalized DPR - Your Account Credentials", html)


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
    return await _send_mail(user_email, f"DPR Status Update - {project_name} - {sheet_type}", html)
