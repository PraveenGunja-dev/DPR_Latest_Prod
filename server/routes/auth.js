// server/routes/auth.js
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { sendWelcomeEmail } = require('../services/emailService');

// We'll pass the pool from server.js when registering the routes
let pool;

const router = express.Router();

// We'll pass the authenticateToken middleware from server.js when registering the routes
let authenticateToken;

// Function to set the pool and middleware (called from server.js)
const setPool = (dbPool, authMiddleware) => {
  pool = dbPool;
  authenticateToken = authMiddleware;
};







// Middleware to check if user is admin
const isAdmin = (req, res, next) => {
  if (req.user && (req.user.role === 'admin' || req.user.role === 'Super Admin')) {
    next();
  } else {
    res.status(403).json({ message: 'Access denied. Admin privileges required.' });
  }
};

// Middleware to check if user is Super Admin
const isSuperAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'Super Admin') {
    next();
  } else {
    res.status(403).json({ message: 'Access denied. Super Admin privileges required.' });
  }
};

// Middleware to check if user is PMAG or Super Admin
const isPMAGOrSuperAdmin = (req, res, next) => {
  if (req.user && (req.user.role === 'PMAG' || req.user.role === 'Super Admin')) {
    next();
  } else {
    res.status(403).json({ message: 'Access denied. PMAG or Super Admin privileges required.' });
  }
};

// Middleware to check if user is Site PM or Super Admin
const isSitePMOrSuperAdmin = (req, res, next) => {
  if (req.user && (req.user.role === 'Site PM' || req.user.role === 'Super Admin')) {
    next();
  } else {
    res.status(403).json({ message: 'Access denied. Site PM or Super Admin privileges required.' });
  }
};







// Middleware to check if user is PMAG
const isPMAG = (req, res, next) => {
  console.log("isPMAG middleware - req.user:", req.user); // Debug log
  if (req.user && req.user.role === 'PMAG') {
    console.log("User is PMAG, allowing access"); // Debug log
    next();
  } else {
    console.log("User is not PMAG, denying access"); // Debug log
    res.status(403).json({ message: 'Access denied. PMAG privileges required.' });
  }
};

// Middleware to check if user is Site PM
const isSitePM = (req, res, next) => {
  if (req.user && req.user.role === 'Site PM') {
    next();
  } else {
    res.status(403).json({ message: 'Access denied. Site PM privileges required.' });
  }
};

// In-memory store for refresh tokens (in production, use Redis or database)
const refreshTokens = new Map();

// Generate tokens function
const generateTokens = (user) => {
  // Short-lived access token (15 minutes)
  const accessToken = jwt.sign(
    { userId: user.user_id || user.userId, email: user.email, role: user.role },
    process.env.JWT_SECRET || 'adani_flow_secret_key',
    { expiresIn: '15m' }
  );
  
  // Long-lived refresh token (7 days)
  const refreshToken = jwt.sign(
    { userId: user.user_id || user.userId, email: user.email, role: user.role, tokenId: uuidv4() },
    process.env.REFRESH_TOKEN_SECRET || 'adani_flow_refresh_secret_key',
    { expiresIn: '7d' }
  );
  
  return { accessToken, refreshToken };
};

// Register a new user (requires authentication based on role hierarchy)
// Oracle P6 equivalent would be creating a new user in the system
router.post('/register', async (req, res, next) => {
  // First authenticate the requesting user
  if (authenticateToken) {
    authenticateToken(req, res, () => {
      // After authentication, check role-based permissions
      const { role } = req.body;
      
      // Validate role hierarchy:
      // - Super Admin can create any user
      // - PMAG can create Site PM and PMAG users
      // - Site PM can create Supervisor users
      // - Others cannot create users
      
      if (req.user.role === 'Super Admin') {
        // Super Admin can create any user
        next(); // Allow registration
      } else if (req.user.role === 'PMAG') {
        // PMAG can create Site PM and PMAG users
        if (role !== 'Site PM' && role !== 'PMAG') {
          return res.status(403).json({ 
            message: 'PMAG users can only create Site PM and PMAG users.' 
          });
        }
        next(); // Allow registration
      } else if (req.user.role === 'Site PM') {
        // Site PM can only create Supervisor users
        if (role !== 'supervisor') {
          return res.status(403).json({ 
            message: 'Site PM users can only create Supervisor users.' 
          });
        }
        next(); // Allow registration
      } else {
        // Other roles cannot create users
        return res.status(403).json({ 
          message: 'Access denied. Only Super Admin, PMAG and Site PM users can create new users.' 
        });
      }
    });
  } else {
    next();
  }
}, async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    // Validate required fields
    if (!name || !email || !password || !role) {
      return res.status(400).json({ 
        message: 'All fields are required: name, email, password, role' 
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ 
        message: 'Invalid email format' 
      });
    }

    // Validate password strength (at least 8 characters)
    if (password.length < 8) {
      return res.status(400).json({ 
        message: 'Password must be at least 8 characters long' 
      });
    }

    // Validate role
    const validRoles = ['supervisor', 'Site PM', 'PMAG', 'Super Admin'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ 
        message: 'Invalid role. Must be one of: ' + validRoles.join(', ')
      });
    }

    // Hash password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Insert user into database
    const result = await pool.query(
      'INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4) RETURNING user_id, name, email, role',
      [name, email, hashedPassword, role]
    );

    const user = result.rows[0];

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user);
    
    // Store refresh token
    refreshTokens.set(refreshToken, { 
      userId: user.user_id, 
      email: user.email, 
      role: user.role 
    });

    // Send welcome email with credentials
    const emailResult = await sendWelcomeEmail(email, name, password);
    if (!emailResult.success) {
      console.error('Failed to send welcome email:', emailResult.error);
    }

    // Oracle P6 API compatible response format
    res.status(201).json({
      message: 'User registered successfully. Note: Projects can only be assigned at user creation time.',
      accessToken,
      refreshToken,
      user: {
        ObjectId: user.user_id,  // Oracle P6 uses ObjectId
        Name: user.name,         // Oracle P6 uses PascalCase
        Email: user.email,
        Role: user.role
      },
      // Additional Oracle P6 compatible fields
      sessionId: accessToken,
      loginStatus: 'SUCCESS'
    });
  } catch (error) {
    console.error('Registration error:', error);
    if (error.code === '23505') {
      return res.status(400).json({ message: 'Email already exists' });
    }
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Login user (no authentication required)
// Oracle P6 equivalent - authenticates user and returns session/token
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate required fields
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
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
      'SELECT user_id, name, email, password, role, is_active FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const user = result.rows[0];

    // Check if user is active
    if (!user.is_active) {
      return res.status(401).json({ message: 'You are inactive. Contact admin to make your account active.' });
    }

    // Compare passwords
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user);
    
    // Store refresh token
    refreshTokens.set(refreshToken, { 
      userId: user.user_id, 
      email: user.email, 
      role: user.role 
    });

    // Remove password from user object
    const { password: _, ...userWithoutPassword } = user;

    // Oracle P6 API compatible response format
    res.status(200).json({
      message: 'Login successful',
      accessToken,
      refreshToken,
      user: {
        ObjectId: userWithoutPassword.user_id,  // Oracle P6 uses ObjectId
        Name: userWithoutPassword.name,         // Oracle P6 uses PascalCase
        Email: userWithoutPassword.email,
        Role: userWithoutPassword.role
      },
      // Additional Oracle P6 compatible fields
      sessionId: accessToken,
      loginStatus: 'SUCCESS'
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Refresh token endpoint
router.post('/refresh-token', async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(401).json({ message: 'Refresh token required' });
  }

  try {
    // Verify refresh token
    const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET || 'adani_flow_refresh_secret_key');
    
    // Check if refresh token exists in our store
    if (!refreshTokens.has(refreshToken)) {
      return res.status(403).json({ message: 'Invalid refresh token' });
    }

    // Get user data from refresh token store
    const userData = refreshTokens.get(refreshToken);
    
    // Generate new tokens
    const { accessToken: newAccessToken, refreshToken: newRefreshToken } = generateTokens(userData);
    
    // Remove old refresh token and store new one
    refreshTokens.delete(refreshToken);
    refreshTokens.set(newRefreshToken, userData);

    res.json({
      accessToken: newAccessToken,
      refreshToken: newRefreshToken
    });
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Refresh token expired' });
    }
    res.status(403).json({ message: 'Invalid refresh token' });
  }
});

// Logout endpoint
router.post('/logout', (req, res) => {
  const { refreshToken } = req.body;

  if (refreshToken) {
    refreshTokens.delete(refreshToken);
  }

  res.status(200).json({ message: 'Logout successful' });
});
// Get user profile (requires authentication)
router.get('/profile', (req, res, next) => {
  // Make sure authenticateToken is available and properly defined
  if (typeof authenticateToken === 'function') {
    authenticateToken(req, res, next);
  } else {
    // If authenticateToken is not set yet, deny access
    res.status(401).json({ message: 'Authentication middleware not initialized' });
  }
}, async (req, res) => {
  try {
    // Get user from database (excluding password)
    const result = await pool.query(
      'SELECT user_id, name, email, role, is_active FROM users WHERE user_id = $1',
      [req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    const user = result.rows[0];

    // Check if user is still active
    if (!user.is_active) {
      return res.status(401).json({ message: 'You are inactive. Contact admin to make your account active.' });
    }

    res.json({
      user: {
        ObjectId: user.user_id,
        Name: user.name,
        Email: user.email,
        Role: user.role
      }
    });
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get all supervisors (PMAG and Site PM only) - Oracle P6 API compatible
router.get('/supervisors', (req, res, next) => {
  // Make sure authenticateToken is available and properly defined
  if (typeof authenticateToken === 'function') {
    authenticateToken(req, res, next);
  } else {
    // If authenticateToken is not set yet, deny access
    res.status(401).json({ message: 'Authentication middleware not initialized' });
  }
}, async (req, res) => {
  try {
    // Check if user is PMAG (admin) or Site PM - both can get all supervisors for assignment
    if (req.user.role !== 'PMAG' && req.user.role !== 'Site PM') {
      return res.status(403).json({ message: 'Access denied. PMAG or Site PM privileges required.' });
    }
    
    // Get all supervisors from database
    const result = await pool.query(
      'SELECT user_id AS "ObjectId", name AS "Name", email AS "Email", role AS "Role" FROM users WHERE role = $1 ORDER BY name',
      ['supervisor']
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Supervisors error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});
// Export the setPool function so it can be called from server.js
module.exports = { router, setPool };