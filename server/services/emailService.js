const nodemailer = require('nodemailer');

// Create a transporter object using SMTP transport
const createTransporter = () => {
  // For development, we'll use a simple SMTP configuration
  // In production, you would use your actual email service credentials
  
  // Check if we have email configuration in environment variables
  if (process.env.EMAIL_HOST && process.env.EMAIL_PORT) {
    return nodemailer.createTransporter({
      host: process.env.EMAIL_HOST,
      port: process.env.EMAIL_PORT,
      secure: process.env.EMAIL_SECURE === 'true', // true for 465, false for other ports
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });
  }
  
  // For development/testing, you can use Ethereal.email or similar services
  // This is a fallback for local development
  console.warn('No email configuration found. Emails will not be sent in production.');
  return null;
};

// Send welcome email with credentials (simplified version without SSO)
const sendWelcomeEmail = async (userEmail, userName, password) => {
  try {
    const transporter = createTransporter();
    
    // If no transporter is configured, don't send email but don't fail
    if (!transporter) {
      console.log('Email service not configured. Skipping email send.');
      return { success: true, message: 'Email service not configured' };
    }
    
    const mailOptions = {
      from: process.env.EMAIL_FROM || 'noreply@adaniflow.com',
      to: userEmail,
      subject: 'Welcome to Adani Flow - Your Account Credentials',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #0B74B0;">Welcome to Adani Flow</h2>
          <p>Hello ${userName},</p>
          <p>Your account has been successfully created on Adani Flow. Here are your login credentials:</p>
          
          <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p><strong>Email:</strong> ${userEmail}</p>
            <p><strong>Password:</strong> ${password}</p>
          </div>
          
          <p>To log in, please visit the login page and enter the credentials above.</p>
          <p>Please change your password after your first login for security reasons.</p>
          
          <p>Best regards,<br/>Adani Flow Team</p>
          
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
          <p style="font-size: 12px; color: #999;">
            This is an automated message. Please do not reply to this email.
          </p>
        </div>
      `
    };
    
    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent successfully:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending welcome email:', error);
    return { success: false, error: error.message };
  }
};
// Send SSO login instructions
const sendSSOLoginInstructions = async (userEmail, userName) => {
  try {
    const transporter = createTransporter();
    
    // If no transporter is configured, don't send email but don't fail
    if (!transporter) {
      console.log('Email service not configured. Skipping email send.');
      return { success: true, message: 'Email service not configured' };
    }
    
    const loginUrl = process.env.FRONTEND_URL || 'http://localhost:8080';
    const ssoLoginUrl = `${loginUrl}/sso`;
    
    const mailOptions = {
      from: process.env.EMAIL_FROM || 'noreply@adaniflow.com',
      to: userEmail,
      subject: 'Adani Flow - SSO Login Instructions',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #0B74B0;">Adani Flow SSO Login</h2>
          <p>Hello ${userName},</p>
          <p>You can now log in to Adani Flow using Single Sign-On (SSO).</p>
          
          <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0; text-align: center;">
            <p><a href="${ssoLoginUrl}" style="background-color: #0B74B0; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Login to Adani Flow</a></p>
          </div>
          
          <p>If the button above doesn't work, copy and paste this link into your browser:</p>
          <p>${ssoLoginUrl}</p>
          
          <p>Alternatively, you can use the standard login with your email and password.</p>
          
          <p>Best regards,<br/>Adani Flow Team</p>
          
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
          <p style="font-size: 12px; color: #999;">
            This is an automated message. Please do not reply to this email.
          </p>
        </div>
      `
    };
    
    const info = await transporter.sendMail(mailOptions);
    console.log('SSO instructions email sent successfully:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending SSO instructions email:', error);
    return { success: false, error: error.message };
  }
};

module.exports = {
  sendWelcomeEmail,
  sendSSOLoginInstructions
};