const nodemailer = require('nodemailer');

// Create a transporter object using SMTP transport
const createTransporter = () => {
  // Use SMTP configuration from environment variables
  const smtpServer = process.env.SMTP_SERVER || process.env.EMAIL_HOST;
  const smtpPort = process.env.SMTP_PORT || process.env.EMAIL_PORT;
  
  if (smtpServer && smtpPort) {
    const config = {
      host: smtpServer,
      port: parseInt(smtpPort),
      secure: parseInt(smtpPort) === 465,
    };

    // Add auth if username is provided
    const username = process.env.SMTP_USERNAME || process.env.EMAIL_USER;
    const password = process.env.SMTP_PASSWORD || process.env.EMAIL_PASS;
    
    if (username && password) {
      config.auth = {
        user: username,
        pass: password,
      };
    } else if (username) {
      // Some SMTP servers (internal) don't require password
      config.auth = {
        user: username,
        pass: password || '',
      };
    }

    // For port 25 (unencrypted), disable TLS requirement
    if (parseInt(smtpPort) === 25) {
      config.secure = false;
      config.tls = {
        rejectUnauthorized: false,
      };
    }

    return nodemailer.createTransport(config);
  }
  
  console.warn('[EmailService] No SMTP configuration found. Emails will not be sent.');
  return null;
};

const getFromAddress = () => {
  return process.env.EMAIL_FROM || process.env.SMTP_USERNAME || 'no-reply-ai-agel@adani.com';
};

const getAppBaseUrl = () => {
  return process.env.APP_BASE_URL || 'http://localhost:5173';
};

// ==========================================
// Base Template Components
// ==========================================
const getEmailBase = (title, subtitle, content) => `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>${title}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: 'Adani', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5;">
    <tr>
      <td align="center" style="padding: 50px 20px;">
        
        <table width="600" cellpadding="0" cellspacing="0" style="background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 40px rgba(0,0,0,0.08); text-align: left;">
          <!-- Top Cover Image -->
          <tr>
            <td style="line-height: 0; background: #09090b;">
              <img src="${getAppBaseUrl()}/coverPhoto.png" width="600" alt="Cover" style="display: block; width: 100%; max-width: 600px; height: auto;">
            </td>
          </tr>
          
          <!-- Header with Title & Logo -->
          <tr>
            <td style="padding: 30px 40px 20px 40px; border-bottom: 1px solid #f0f0f0;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <h1 style="color: #09090b; margin: 0; font-size: 24px; font-weight: 700; letter-spacing: -0.5px;">${title}</h1>
                    <p style="color: #64748b; margin: 6px 0 0 0; font-size: 14px;">${subtitle}</p>
                  </td>
                  <td align="right" valign="top">
                    <!-- Text fallback if logo isn't accessible, otherwise uses Adani Flow text -->
                    <div style="font-weight: 800; font-size: 18px; color: #09090b; letter-spacing: -0.5px;">Digitalized DPR</div>
                    <!-- Alternatively use the image: <img src="${getAppBaseUrl()}/logo.png" height="28" alt="Adani" style="display: block;"> -->
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Dynamic Content Area -->
          <tr>
            <td style="padding: 30px 40px;">
              ${content}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background: #f1f5f9; padding: 24px 40px; text-align: center;">
              <p style="color: #94a3b8; font-size: 12px; margin: 0; line-height: 1.6;">
                This is an automated notification from <b>Digitalized DPR</b>.<br>
                Please do not reply to this email. Secure your credentials at all times.
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

// ==========================================
// Welcome Email (for credential-based users)
// ==========================================
const sendWelcomeEmail = async (userEmail, userName, password) => {
  try {
    const transporter = createTransporter();
    if (!transporter) return { success: true, message: 'Email service not configured' };
    
    const content = `
      <p style="color: #334155; font-size: 16px; line-height: 1.6; margin-top: 0; margin-bottom: 24px;">
        Hello <b>${userName}</b>,<br><br>
        Your account has been successfully created on Digitalized DPR. We are excited to have you onboard. Here are your system login credentials:
      </p>
      
      <div style="background: #f8fafc; border-radius: 8px; margin-bottom: 30px; border: 1px solid #e2e8f0; padding: 20px;">
        <p style="margin: 0 0 12px 0;"><strong style="color: #64748b; font-size: 14px; margin-right: 12px;">Email:</strong> <span style="color: #0f172a; font-size: 15px; font-weight: 500;">${userEmail}</span></p>
        <p style="margin: 0;"><strong style="color: #64748b; font-size: 14px; margin-right: 12px;">Password:</strong> <span style="color: #0f172a; font-size: 15px; font-family: monospace; font-weight: 600; letter-spacing: 1px;">${password}</span></p>
      </div>
      
      <p style="color: #64748b; font-size: 14px; line-height: 1.6; margin-bottom: 30px;">
        * For security reasons, please change your password immediately after your first login.
      </p>
      
      <div style="text-align: center; margin-top: 20px;">
        <a href="${getAppBaseUrl()}" style="background: #09090b; color: #ffffff; font-size: 15px; font-weight: 600; text-decoration: none; padding: 14px 36px; border-radius: 8px; display: inline-block; transition: background 0.3s;">Access Platform</a>
      </div>
    `;

    const html = getEmailBase('Welcome to Digitalized DPR', 'Your Account Credentials', content);
    
    const info = await transporter.sendMail({
      from: getFromAddress(),
      to: userEmail,
      subject: 'Welcome to Digitalized DPR - Your Account Credentials',
      html
    });
    
    console.log('[EmailService] Welcome email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('[EmailService] Error sending welcome email:', error);
    return { success: false, error: error.message };
  }
};

// ==========================================
// Access Request Email (to Super Admin)
// ==========================================
const sendAccessRequestEmail = async (superAdminEmail, userName, userEmail, requestedRole, justification) => {
  try {
    const transporter = createTransporter();
    if (!transporter) return { success: true, message: 'Email service not configured' };
    
    const justificationRow = justification ? `
      <p style="margin: 0;"><strong style="color: #64748b; font-size: 14px; margin-right: 12px; display: inline-block; width: 120px;">Justification:</strong> <span style="color: #0f172a; font-size: 14px; line-height: 1.5;">${justification}</span></p>
    ` : '';

    const content = `
      <p style="color: #334155; font-size: 16px; line-height: 1.6; margin-top: 0; margin-bottom: 24px;">
        A new user has requested platform access via Single Sign-On. Please review the request details below.
      </p>
      
      <div style="background: #f8fafc; border-radius: 8px; margin-bottom: 30px; border: 1px solid #e2e8f0; padding: 20px;">
        <p style="margin: 0 0 16px 0;"><strong style="color: #64748b; font-size: 14px; margin-right: 12px; display: inline-block; width: 120px;">Name:</strong> <span style="color: #0f172a; font-size: 15px; font-weight: 500;">${userName}</span></p>
        <p style="margin: 0 0 16px 0;"><strong style="color: #64748b; font-size: 14px; margin-right: 12px; display: inline-block; width: 120px;">Email:</strong> <span style="color: #0f172a; font-size: 15px; font-weight: 500;">${userEmail}</span></p>
        <p style="margin: 0 ${justification ? '0 16px 0' : '0'};"><strong style="color: #64748b; font-size: 14px; margin-right: 12px; display: inline-block; width: 120px;">Requested Role:</strong> 
          <span style="background: #2563eb; color: #ffffff; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; letter-spacing: 0.5px; display: inline-block;">${requestedRole}</span>
        </p>
        ${justificationRow}
      </div>
      
      <div style="text-align: center; margin-top: 20px;">
        <a href="${getAppBaseUrl()}/superadmin" style="background: #09090b; color: #ffffff; font-size: 15px; font-weight: 600; text-decoration: none; padding: 14px 36px; border-radius: 8px; display: inline-block; transition: background 0.3s;">Review Request in Dashboard</a>
      </div>
    `;

    const html = getEmailBase('New Access Request', 'Action Required - Role Assignment', content);

    const info = await transporter.sendMail({
      from: getFromAddress(),
      to: superAdminEmail,
      subject: `🔐 Digitalized DPR - Access Request: ${userName}`,
      html
    });
    
    console.log('[EmailService] Access request email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('[EmailService] Error sending access request email:', error);
    return { success: false, error: error.message };
  }
};

// ==========================================
// Access Approved Email (to user)
// ==========================================
const sendAccessApprovedEmail = async (userEmail, userName, assignedRole) => {
  try {
    const transporter = createTransporter();
    if (!transporter) return { success: true, message: 'Email service not configured' };
    
    const roleDescriptions = {
      'supervisor': 'Manage daily data entry and field operations',
      'Site PM': 'Review operations, modify workflows and approve submissions',
      'PMAG': 'Access advanced analytics and perform final approvals',
      'Super Admin': 'Administer full system settings and platform users',
    };

    const description = roleDescriptions[assignedRole] || 'System User';

    const content = `
      <p style="color: #334155; font-size: 16px; line-height: 1.6; margin-top: 0; margin-bottom: 24px;">
        Hello <b>${userName}</b>,<br><br>
        Great news. Your system access request has been officially <b>approved</b> by the administrator. 
      </p>
      
      <div style="background: #ecfdf5; border-radius: 8px; margin-bottom: 30px; border: 1px solid #10b981; border-left: 4px solid #10b981; padding: 20px;">
        <p style="margin: 0 0 8px 0; color: #064e3b; font-size: 14px; font-weight: 600;">ASSIGNED ROLE</p>
        <p style="margin: 0 0 4px 0;">
          <span style="background: #10b981; color: #ffffff; padding: 4px 12px; border-radius: 20px; font-size: 13px; font-weight: 600; letter-spacing: 0.5px; display: inline-block;">${assignedRole}</span>
        </p>
        <p style="margin: 8px 0 0 0; color: #047857; font-size: 14px; line-height: 1.5;">${description}</p>
      </div>
      
      <p style="color: #64748b; font-size: 15px; line-height: 1.6; margin-bottom: 30px;">
        You can now log in securely using your Microsoft Single Sign-On credentials.
      </p>
      
      <div style="text-align: center; margin-top: 20px;">
        <a href="${getAppBaseUrl()}" style="background: #10b981; color: #ffffff; font-size: 15px; font-weight: 600; text-decoration: none; padding: 14px 36px; border-radius: 8px; display: inline-block; transition: background 0.3s; box-shadow: 0 4px 14px rgba(16, 185, 129, 0.4);">Access Digitalized DPR</a>
      </div>
    `;

    const html = getEmailBase('Access Approved', 'Your role has been verified and granted', content);

    const info = await transporter.sendMail({
      from: getFromAddress(),
      to: userEmail,
      subject: '✅ Digitalized DPR - Access Approved',
      html
    });
    
    console.log('[EmailService] Access approved email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('[EmailService] Error sending approval email:', error);
    return { success: false, error: error.message };
  }
};

// ==========================================
// Access Rejected Email (to user)
// ==========================================
const sendAccessRejectedEmail = async (userEmail, userName, reason) => {
  try {
    const transporter = createTransporter();
    if (!transporter) return { success: true, message: 'Email service not configured' };
    
    const reasonBlock = reason ? `
      <div style="background: #fef2f2; border-radius: 8px; margin-bottom: 24px; border: 1px solid #ef4444; border-left: 4px solid #ef4444; padding: 20px;">
        <p style="margin: 0 0 6px 0; color: #7f1d1d; font-size: 14px; font-weight: 600;">REASON FOR REJECTION</p>
        <p style="margin: 0; color: #991b1b; font-size: 15px; line-height: 1.5;">${reason}</p>
      </div>
    ` : '';

    const content = `
      <p style="color: #334155; font-size: 16px; line-height: 1.6; margin-top: 0; margin-bottom: 24px;">
        Hello <b>${userName}</b>,<br><br>
        We regret to inform you that your recent request for access to the Digitalized DPR Platform has been <b>declined</b> following administrative review.
      </p>
      
      ${reasonBlock}
      
      <p style="color: #64748b; font-size: 15px; line-height: 1.6; margin-bottom: 0;">
        If you believe this decision is in error or require further clarification, please contact your immediate supervisor or the IT administration team.
      </p>
    `;

    const html = getEmailBase('Access Request Declined', 'Update on your account status', content);

    const info = await transporter.sendMail({
      from: getFromAddress(),
      to: userEmail,
      subject: 'Digitalized DPR - Access Request Update',
      html
    });
    
    console.log('[EmailService] Access rejected email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('[EmailService] Error sending rejection email:', error);
    return { success: false, error: error.message };
  }
};

// ==========================================
// SSO Login Instructions (legacy)
// ==========================================
const sendSSOLoginInstructions = async (userEmail, userName) => {
  try {
    const transporter = createTransporter();
    if (!transporter) return { success: true, message: 'Email service not configured' };
    
    const content = `
      <p style="color: #334155; font-size: 16px; line-height: 1.6; margin-top: 0; margin-bottom: 24px;">
        Hello <b>${userName}</b>,<br><br>
        Your Digitalized DPR account has been successfully linked to Microsoft Single Sign-On (SSO). You can now utilize your primary corporate credentials to access the platform securely.
      </p>
      
      <div style="text-align: center; margin-top: 20px;">
        <a href="${getAppBaseUrl()}" style="background: #09090b; color: #ffffff; font-size: 15px; font-weight: 600; text-decoration: none; padding: 14px 36px; border-radius: 8px; display: inline-block; transition: background 0.3s; margin-top: 10px;">Sign In with Microsoft</a>
      </div>
    `;

    const html = getEmailBase('SSO Configuration Details', 'Seamless Platform Authentication', content);

    const info = await transporter.sendMail({
      from: getFromAddress(),
      to: userEmail,
      subject: 'Digitalized DPR - SSO Login Instructions',
      html
    });
    
    console.log('[EmailService] SSO instructions email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('[EmailService] Error sending SSO instructions:', error);
    return { success: false, error: error.message };
  }
};

module.exports = {
  sendWelcomeEmail,
  sendSSOLoginInstructions,
  sendAccessRequestEmail,
  sendAccessApprovedEmail,
  sendAccessRejectedEmail,
};