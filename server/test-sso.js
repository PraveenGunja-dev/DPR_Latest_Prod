// Simple test script to verify SSO functionality
const jwt = require('jsonwebtoken');

// Test SSO token generation
const testUser = {
  user_id: 1,
  email: 'test@example.com',
  role: 'supervisor'
};

const secret = 'adani_flow_secret_key';
const ssoToken = jwt.sign(
  { userId: testUser.user_id, email: testUser.email, role: testUser.role, sso: true },
  secret,
  { expiresIn: '1h' }
);

console.log('Generated SSO Token:', ssoToken);

// Test token verification
try {
  const decoded = jwt.verify(ssoToken, secret);
  console.log('Decoded Token:', decoded);
  console.log('Is SSO Token:', !!decoded.sso);
} catch (error) {
  console.error('Token verification failed:', error.message);
}