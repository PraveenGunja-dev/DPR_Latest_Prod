const express = require('express');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { sendSSOLoginInstructions } = require('../services/emailService');

// We'll pass the pool from server.js when registering the routes
let pool;

const router = express.Router();

// Function to set the pool (called from server.js)
const setPool = (dbPool) => {
  pool = dbPool;
};

// Generate SSO token function
const generateSSOToken = (user) => {
  // Short-lived SSO token (1 hour)
  const ssoToken = jwt.sign(
    { userId: user.user_id, email: user.email, role: user.role, sso: true },
    process.env.JWT_SECRET || 'adani_flow_secret_key',
    { expiresIn: '1h' }
  );
  
  return ssoToken;
};

// Initiate SSO login - sends email with SSO link
router.post('/initiate', async (req, res) => {
  try {
    const { email } = req.body;

    // Validate required fields
    if (!email) {
      return res.status(400).json({ 
        message: 'Email is required' 
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ 
        message: 'Invalid email format' 
      });
    }

    // Find user by email
    const result = await pool.query(
      'SELECT user_id, name, email, role FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      // For security reasons, we don't reveal if email exists or not
      // But we'll still send a generic response
      return res.status(200).json({ 
        message: 'If the email exists in our system, SSO login instructions have been sent.' 
      });
    }

    const user = result.rows[0];

    // Generate SSO token
    const ssoToken = generateSSOToken(user);
    
    // In a real SSO implementation, you would redirect to an SSO provider
    // For this implementation, we'll send an email with the token
    
    // Send SSO login instructions email
    const emailResult = await sendSSOLoginInstructions(email, user.name);
    if (!emailResult.success) {
      console.error('Failed to send SSO instructions email:', emailResult.error);
    }

    res.status(200).json({
      message: 'SSO login instructions have been sent to your email.',
      ssoToken: ssoToken // Include the token in the response for direct use
    });
  } catch (error) {
    console.error('SSO initiation error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// SSO callback - validates token and generates auth tokens
router.post('/callback', async (req, res) => {
  try {
    const { ssoToken } = req.body;

    if (!ssoToken) {
      return res.status(400).json({ message: 'SSO token is required' });
    }

    // Verify SSO token
    const decoded = jwt.verify(ssoToken, process.env.JWT_SECRET || 'adani_flow_secret_key');
    
    // Check if it's a valid SSO token
    if (!decoded.sso) {
      return res.status(403).json({ message: 'Invalid SSO token' });
    }

    // Get user from database
    const result = await pool.query(
      'SELECT user_id, name, email, role FROM users WHERE user_id = $1',
      [decoded.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    const user = result.rows[0];

    // Generate auth tokens
    const accessToken = jwt.sign(
      { userId: user.user_id, email: user.email, role: user.role },
      process.env.JWT_SECRET || 'adani_flow_secret_key',
      { expiresIn: '15m' }
    );
    
    const refreshToken = jwt.sign(
      { userId: user.user_id, email: user.email, role: user.role, tokenId: uuidv4() },
      process.env.REFRESH_TOKEN_SECRET || 'adani_flow_refresh_secret_key',
      { expiresIn: '7d' }
    );
    
    // Remove password from user object
    const { password: _, ...userWithoutPassword } = user;

    res.status(200).json({
      message: 'SSO login successful',
      accessToken,
      refreshToken,
      user: {
        ObjectId: userWithoutPassword.user_id,
        Name: userWithoutPassword.name,
        Email: userWithoutPassword.email,
        Role: userWithoutPassword.role
      }
    });
  } catch (error) {
    console.error('SSO callback error:', error);
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'SSO token expired' });
    }
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Direct SSO login with email - generates and sends SSO token
router.post('/login', async (req, res) => {
  try {
    const { email } = req.body;

    // Validate required fields
    if (!email) {
      return res.status(400).json({ 
        message: 'Email is required' 
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ 
        message: 'Invalid email format' 
      });
    }

    // Find user by email
    const result = await pool.query(
      'SELECT user_id, name, email, role FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      // For security reasons, we don't reveal if email exists or not
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const user = result.rows[0];

    // Generate SSO token
    const ssoToken = generateSSOToken(user);
    
    // Send SSO login instructions email with the token
    const emailResult = await sendSSOLoginInstructions(email, user.name);
    if (!emailResult.success) {
      console.error('Failed to send SSO instructions email:', emailResult.error);
    }

    res.status(200).json({
      message: 'SSO login instructions have been sent to your email.',
      ssoToken: ssoToken
    });
  } catch (error) {
    console.error('SSO login error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Export the router and setPool function
module.exports = { router, setPool };