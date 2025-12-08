# SSO (Single Sign-On) Setup and Usage Guide

## Overview

This document explains how to set up and use the Single Sign-On (SSO) functionality in the Adani Flow application. The SSO feature allows users to log in using email-based tokens, providing a secure and convenient alternative to traditional username/password authentication.

## How SSO Works

1. User initiates SSO login by providing their email address
2. System generates a time-limited SSO token (valid for 1 hour)
3. System sends an email with SSO login instructions to the user
4. User clicks the SSO link or enters the token to authenticate
5. System validates the token and grants access

## Setup Instructions

### 1. Email Configuration

The application uses nodemailer for sending emails. Configure the following environment variables in your `.env` file:

```env
# Email Configuration
EMAIL_HOST=smtp.your-email-provider.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=your-email@domain.com
EMAIL_PASS=your-app-password
EMAIL_FROM=noreply@adaniflow.com
FRONTEND_URL=http://localhost:8080
```

For development/testing, you can use Ethereal.email:
1. Visit https://ethereal.email/
2. Create a free account
3. Use the provided SMTP settings in your `.env` file

### 2. JWT Secret Keys

Ensure the following JWT secrets are set in your `.env` file:

```env
# JWT Configuration
JWT_SECRET=your-secret-key-for-access-tokens
REFRESH_TOKEN_SECRET=your-secret-key-for-refresh-tokens
```

## Using SSO

### For End Users

1. Navigate to the SSO login page (`/sso`)
2. Enter your email address
3. Click "Send SSO Login Link"
4. Check your email for the SSO instructions
5. Click the "Login to Adani Flow" button in the email
6. You will be redirected to your dashboard

### For Administrators

When creating new users:
1. The system automatically sends a welcome email with credentials
2. The email includes both standard login instructions and SSO login options
3. Users can choose either method to access the system

## API Endpoints

### SSO Initiation
```
POST /api/sso/initiate
Body: { "email": "user@example.com" }
```
Generates an SSO token and sends it to the user's email.

### SSO Callback
```
POST /api/sso/callback
Body: { "ssoToken": "generated-jwt-token" }
```
Validates the SSO token and returns authentication tokens.

### Direct SSO Login
```
POST /api/sso/login
Body: { "email": "user@example.com" }
```
Sends SSO login instructions directly to the user's email.

## Security Considerations

1. SSO tokens are time-limited (1 hour expiration)
2. Tokens are cryptographically signed using JWT
3. Email addresses are validated before token generation
4. Failed attempts are logged for security monitoring
5. Tokens can only be used once for authentication

## Troubleshooting

### Common Issues

1. **Emails not being sent**
   - Check email configuration in `.env`
   - Verify SMTP credentials
   - Ensure firewall allows outbound connections

2. **SSO token validation failures**
   - Check JWT secret keys match between services
   - Verify token hasn't expired
   - Confirm token wasn't tampered with

3. **Redirect issues**
   - Check FRONTEND_URL configuration
   - Ensure CORS settings allow the frontend origin

### Logs

Check server logs for detailed error information:
- SSO token generation logs
- Email sending success/failure logs
- Authentication attempt logs

## Customization

You can customize the email templates by modifying:
- `server/services/emailService.js` - Welcome email template
- `server/services/emailService.js` - SSO instructions template

Adjust the styling and content as needed for your organization.