// Simple test script to verify email service functionality
const { sendWelcomeEmail, sendSSOLoginInstructions } = require('./services/emailService');

async function testEmailService() {
  console.log('Testing email service...');
  
  // Test welcome email
  console.log('Sending welcome email...');
  const welcomeResult = await sendWelcomeEmail(
    'test@example.com',
    'Test User',
    'testpassword123'
  );
  console.log('Welcome email result:', welcomeResult);
  
  // Test SSO instructions email
  console.log('Sending SSO instructions email...');
  const ssoResult = await sendSSOLoginInstructions(
    'test@example.com',
    'Test User'
  );
  console.log('SSO instructions email result:', ssoResult);
}

testEmailService().catch(console.error);