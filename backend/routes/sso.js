// server/routes/sso.js - Azure AD SSO Authentication
const express = require('express');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const { ConfidentialClientApplication } = require('@azure/msal-node');
const { sendAccessRequestEmail, sendAccessApprovedEmail, sendAccessRejectedEmail } = require('../services/emailService');

let pool;
let authenticateToken;

const router = express.Router();

const setPool = (dbPool, authMiddleware) => {
  pool = dbPool;
  authenticateToken = authMiddleware;
};

// Azure AD MSAL Configuration
const msalConfig = {
  auth: {
    clientId: process.env.AZURE_CLIENT_ID,
    authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`,
    clientSecret: process.env.AZURE_CLIENT_SECRET,
  },
};

let msalClient = null;
try {
  if (process.env.AZURE_CLIENT_ID && process.env.AZURE_TENANT_ID) {
    msalClient = new ConfidentialClientApplication(msalConfig);
    console.log('[SSO] MSAL client initialized successfully');
  } else {
    console.warn('[SSO] Azure AD credentials not configured - SSO will be disabled');
  }
} catch (err) {
  console.error('[SSO] Failed to initialize MSAL client:', err.message);
}

// Middleware to check if user is Super Admin
const isSuperAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'Super Admin') {
    next();
  } else {
    res.status(403).json({ message: 'Access denied. Super Admin privileges required.' });
  }
};

// Generate JWT tokens for authenticated user
const generateTokens = (user) => {
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

  return { accessToken, refreshToken };
};

// ==========================================
// SSO Login - Validate Azure AD token from frontend
// ==========================================
router.post('/azure-login', async (req, res) => {
  try {
    const { idToken, accessToken: azureAccessToken } = req.body;

    if (!idToken && !azureAccessToken) {
      return res.status(400).json({ message: 'Azure AD token is required' });
    }

    // Decode the ID token to get user info
    // In production, you should validate the token signature against Azure AD JWKS
    let userInfo;
    
    if (azureAccessToken) {
      // Use Microsoft Graph API to get user profile
      try {
        const graphResponse = await axios.get('https://graph.microsoft.com/v1.0/me', {
          headers: { Authorization: `Bearer ${azureAccessToken}` }
        });
        userInfo = {
          email: graphResponse.data.mail || graphResponse.data.userPrincipalName,
          name: graphResponse.data.displayName,
          oid: graphResponse.data.id,
        };
      } catch (graphErr) {
        console.error('[SSO] Graph API error:', graphErr.response?.data || graphErr.message);
        return res.status(401).json({ message: 'Invalid Azure AD access token' });
      }
    } else {
      // Decode ID token (basic decode - in production validate with JWKS)
      try {
        const decoded = jwt.decode(idToken);
        if (!decoded) {
          return res.status(401).json({ message: 'Invalid ID token' });
        }
        userInfo = {
          email: decoded.preferred_username || decoded.email || decoded.upn,
          name: decoded.name,
          oid: decoded.oid,
        };
      } catch (decodeErr) {
        return res.status(401).json({ message: 'Failed to decode ID token' });
      }
    }

    if (!userInfo.email) {
      return res.status(400).json({ message: 'Could not extract email from Azure AD token' });
    }

    const email = userInfo.email.toLowerCase();
    const name = userInfo.name || email.split('@')[0];

    console.log(`[SSO] Azure AD login attempt for: ${email} (${name})`);

    // Check if user exists in our database
    const existingUser = await pool.query(
      'SELECT user_id, name, email, role, is_active, sso_provider, azure_oid FROM users WHERE email = $1',
      [email]
    );

    if (existingUser.rows.length > 0) {
      const user = existingUser.rows[0];

      // Update Azure OID if not set
      if (!user.azure_oid && userInfo.oid) {
        await pool.query('UPDATE users SET azure_oid = $1, sso_provider = $2 WHERE user_id = $3', 
          [userInfo.oid, 'azure_ad', user.user_id]);
      }

      // Check if user is active
      if (!user.is_active) {
        return res.status(403).json({ 
          message: 'Your account has been deactivated. Please contact the administrator.',
          status: 'inactive'
        });
      }

      // Check if user has pending_approval role
      if (user.role === 'pending_approval') {
        // Check if they have a pending access request
        const pendingRequest = await pool.query(
          'SELECT id, status, requested_role FROM access_requests WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
          [user.user_id]
        );

        return res.status(200).json({
          message: 'Your access request is pending approval.',
          status: 'pending_approval',
          user: {
            ObjectId: user.user_id,
            Name: user.name,
            Email: user.email,
            Role: user.role,
          },
          accessRequest: pendingRequest.rows[0] || null,
        });
      }

      // User exists and has a valid role - generate tokens
      const { accessToken, refreshToken } = generateTokens(user);

      return res.status(200).json({
        message: 'SSO login successful',
        status: 'authenticated',
        accessToken,
        refreshToken,
        user: {
          ObjectId: user.user_id,
          Name: user.name,
          Email: user.email,
          Role: user.role,
        },
        sessionId: accessToken,
        loginStatus: 'SUCCESS',
      });
    }

    // New user - create with pending_approval role
    const newUser = await pool.query(
      `INSERT INTO users (name, email, password, role, sso_provider, azure_oid, is_active) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) 
       RETURNING user_id, name, email, role`,
      [name, email, 'SSO_AUTH_NO_PASSWORD', 'pending_approval', 'azure_ad', userInfo.oid, true]
    );

    const createdUser = newUser.rows[0];
    console.log(`[SSO] New SSO user created: ${email} with pending_approval status`);

    return res.status(200).json({
      message: 'Account created. Please request access to use the application.',
      status: 'pending_approval',
      isNewUser: true,
      user: {
        ObjectId: createdUser.user_id,
        Name: createdUser.name,
        Email: createdUser.email,
        Role: createdUser.role,
      },
    });

  } catch (error) {
    console.error('[SSO] Azure login error:', error);
    res.status(500).json({ message: 'Internal server error during SSO login' });
  }
});

// ==========================================
// Request Access - SSO users request role access
// ==========================================
router.post('/request-access', async (req, res) => {
  try {
    const { userId, requestedRole, justification } = req.body;

    if (!userId || !requestedRole) {
      return res.status(400).json({ message: 'User ID and requested role are required' });
    }

    // Validate requested role
    const validRoles = ['supervisor', 'Site PM', 'PMAG', 'Super Admin'];
    if (!validRoles.includes(requestedRole)) {
      return res.status(400).json({ 
        message: 'Invalid role. Must be one of: ' + validRoles.join(', ') 
      });
    }

    // Check if user exists
    const userResult = await pool.query(
      'SELECT user_id, name, email, role FROM users WHERE user_id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    const user = userResult.rows[0];

    // Check for existing pending request
    const existingRequest = await pool.query(
      "SELECT id FROM access_requests WHERE user_id = $1 AND status = 'pending'",
      [userId]
    );

    if (existingRequest.rows.length > 0) {
      return res.status(409).json({ 
        message: 'You already have a pending access request. Please wait for admin approval.' 
      });
    }

    // Create access request
    const requestResult = await pool.query(
      `INSERT INTO access_requests (user_id, requested_role, justification, status) 
       VALUES ($1, $2, $3, 'pending') 
       RETURNING id, requested_role, status, created_at`,
      [userId, requestedRole, justification || '']
    );

    const accessRequest = requestResult.rows[0];

    // Send email notification to super admin
    const superAdminEmail = process.env.SUPER_ADMIN_EMAIL || 'rohit.sharma6@adani.com';
    try {
      await sendAccessRequestEmail(superAdminEmail, user.name, user.email, requestedRole, justification);
      console.log(`[SSO] Access request email sent to ${superAdminEmail} for user ${user.email}`);
    } catch (emailErr) {
      console.error('[SSO] Failed to send access request email:', emailErr.message);
      // Don't fail the request if email fails
    }

    res.status(201).json({
      message: 'Access request submitted successfully. The administrator will review your request.',
      accessRequest: {
        id: accessRequest.id,
        requestedRole: accessRequest.requested_role,
        status: accessRequest.status,
        createdAt: accessRequest.created_at,
      },
    });

  } catch (error) {
    console.error('[SSO] Access request error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ==========================================
// Get Access Requests - Super Admin only
// ==========================================
router.get('/access-requests', (req, res, next) => {
  if (typeof authenticateToken === 'function') {
    authenticateToken(req, res, next);
  } else {
    res.status(401).json({ message: 'Authentication middleware not initialized' });
  }
}, isSuperAdmin, async (req, res) => {
  try {
    const { status } = req.query;
    
    let query = `
      SELECT ar.id, ar.user_id, ar.requested_role, ar.justification, ar.status,
             ar.reviewed_by, ar.review_notes, ar.created_at, ar.reviewed_at,
             u.name as user_name, u.email as user_email,
             reviewer.name as reviewer_name
      FROM access_requests ar
      JOIN users u ON ar.user_id = u.user_id
      LEFT JOIN users reviewer ON ar.reviewed_by = reviewer.user_id
    `;
    
    const params = [];
    if (status) {
      query += ' WHERE ar.status = $1';
      params.push(status);
    }
    
    query += ' ORDER BY ar.created_at DESC';
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('[SSO] Error fetching access requests:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ==========================================
// Approve/Reject Access Request - Super Admin only
// ==========================================
router.put('/access-requests/:requestId', (req, res, next) => {
  if (typeof authenticateToken === 'function') {
    authenticateToken(req, res, next);
  } else {
    res.status(401).json({ message: 'Authentication middleware not initialized' });
  }
}, isSuperAdmin, async (req, res) => {
  try {
    const { requestId } = req.params;
    const { action, role, reviewNotes } = req.body;

    if (!action || !['approve', 'reject'].includes(action)) {
      return res.status(400).json({ message: 'Action must be "approve" or "reject"' });
    }

    // Get the access request
    const requestResult = await pool.query(
      `SELECT ar.*, u.name as user_name, u.email as user_email 
       FROM access_requests ar 
       JOIN users u ON ar.user_id = u.user_id 
       WHERE ar.id = $1`,
      [requestId]
    );

    if (requestResult.rows.length === 0) {
      return res.status(404).json({ message: 'Access request not found' });
    }

    const accessRequest = requestResult.rows[0];

    if (accessRequest.status !== 'pending') {
      return res.status(400).json({ message: 'This request has already been processed' });
    }

    const newStatus = action === 'approve' ? 'approved' : 'rejected';
    const assignedRole = action === 'approve' ? (role || accessRequest.requested_role) : null;

    // Update access request
    await pool.query(
      `UPDATE access_requests 
       SET status = $1, reviewed_by = $2, review_notes = $3, reviewed_at = CURRENT_TIMESTAMP 
       WHERE id = $4`,
      [newStatus, req.user.userId, reviewNotes || '', requestId]
    );

    if (action === 'approve') {
      // Update user role
      await pool.query(
        'UPDATE users SET role = $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2',
        [assignedRole, accessRequest.user_id]
      );

      // Send approval email
      try {
        await sendAccessApprovedEmail(accessRequest.user_email, accessRequest.user_name, assignedRole);
      } catch (emailErr) {
        console.error('[SSO] Failed to send approval email:', emailErr.message);
      }

      // Log action
      try {
        const { createSystemLog } = require('../utils/systemLogger');
        await createSystemLog(
          'ACCESS_REQUEST_APPROVED',
          req.user.userId,
          `User: ${accessRequest.user_name} (${accessRequest.user_email})`,
          `Approved with role: ${assignedRole}`
        );
      } catch (logErr) {
        console.error('[SSO] Failed to log action:', logErr.message);
      }
    } else {
      // Send rejection email
      try {
        await sendAccessRejectedEmail(accessRequest.user_email, accessRequest.user_name, reviewNotes);
      } catch (emailErr) {
        console.error('[SSO] Failed to send rejection email:', emailErr.message);
      }

      // Log action
      try {
        const { createSystemLog } = require('../utils/systemLogger');
        await createSystemLog(
          'ACCESS_REQUEST_REJECTED',
          req.user.userId,
          `User: ${accessRequest.user_name} (${accessRequest.user_email})`,
          `Rejected: ${reviewNotes || 'No reason provided'}`
        );
      } catch (logErr) {
        console.error('[SSO] Failed to log action:', logErr.message);
      }
    }

    res.json({
      message: `Access request ${newStatus} successfully`,
      accessRequest: {
        id: parseInt(requestId),
        status: newStatus,
        assignedRole,
        reviewedAt: new Date().toISOString(),
      },
    });

  } catch (error) {
    console.error('[SSO] Error processing access request:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ==========================================
// Get pending access request count (for badge)
// ==========================================
router.get('/access-requests/count', (req, res, next) => {
  if (typeof authenticateToken === 'function') {
    authenticateToken(req, res, next);
  } else {
    res.status(401).json({ message: 'Authentication middleware not initialized' });
  }
}, isSuperAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT COUNT(*) as count FROM access_requests WHERE status = 'pending'"
    );
    res.json({ count: parseInt(result.rows[0].count) });
  } catch (error) {
    console.error('[SSO] Error fetching access request count:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = { router, setPool };