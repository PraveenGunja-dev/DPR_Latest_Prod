// server/routes/superAdmin.js
const express = require('express');
const router = express.Router();

// We'll pass the pool from server.js when registering the routes
let pool;
let authenticateToken;

// Function to set the pool and middleware (called from server.js)
const setPool = (dbPool, authMiddleware) => {
  pool = dbPool;
  authenticateToken = authMiddleware;
};

// Helper to get pool or fallback
const getPool = () => {
  if (pool) return pool;
  try {
    const db = require('../db');
    return db;
  } catch (err) {
    console.error('Failed to require ../db fallback:', err);
    throw new Error('Database pool not initialized');
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

// Import system logger
const { createSystemLog: logAction } = require('../utils/systemLogger');

// Get all users (Super Admin only)
router.get('/users', (req, res, next) => {
  // Make sure authenticateToken is available and properly defined
  if (typeof authenticateToken === 'function') {
    authenticateToken(req, res, next);
  } else {
    // If authenticateToken is not set yet, deny access
    res.status(401).json({ message: 'Authentication middleware not initialized' });
  }
}, isSuperAdmin, async (req, res) => {
  try {
    // Check if is_active column exists
    const columnCheck = await getPool().query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'users' AND column_name = 'is_active'
    `);

    const hasIsActiveColumn = columnCheck.rows.length > 0;

    let query;
    if (hasIsActiveColumn) {
      query = `SELECT user_id AS "ObjectId", name AS "Name", email AS "Email", role AS "Role", 
                      COALESCE(is_active, true) AS "IsActive", created_at AS "CreatedAt" 
               FROM users ORDER BY name`;
    } else {
      query = `SELECT user_id AS "ObjectId", name AS "Name", email AS "Email", role AS "Role", 
                      true AS "IsActive", created_at AS "CreatedAt" 
               FROM users ORDER BY name`;
    }

    const result = await getPool().query(query);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

// Create a new user (Super Admin only)
router.post('/users', (req, res, next) => {
  // Make sure authenticateToken is available and properly defined
  if (typeof authenticateToken === 'function') {
    authenticateToken(req, res, next);
  } else {
    // If authenticateToken is not set yet, deny access
    res.status(401).json({ message: 'Authentication middleware not initialized' });
  }
}, isSuperAdmin, async (req, res) => {
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
    const validRoles = ['supervisor', 'Site PM', 'PMAG', 'admin', 'Super Admin'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        message: 'Invalid role. Must be one of: ' + validRoles.join(', ')
      });
    }

    // Hash password
    const bcrypt = require('bcryptjs');
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Insert user into database
    const result = await getPool().query(
      'INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4) RETURNING user_id, name, email, role',
      [name, email, hashedPassword, role]
    );

    const user = result.rows[0];

    // Log user creation
    await logAction(
      'USER_CREATED',
      req.user.userId,
      `User: ${user.name} (${user.email})`,
      `Created user ${user.name} with role ${user.role}`
    );

    res.status(201).json({
      message: 'User created successfully',
      user: {
        ObjectId: user.user_id,
        Name: user.name,
        Email: user.email,
        Role: user.role
      }
    });
  } catch (error) {
    console.error('Error creating user:', error);
    if (error.code === '23505') {
      return res.status(400).json({ message: 'Email already exists' });
    }
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Update user (Super Admin only)
router.put('/users/:userId', (req, res, next) => {
  // Make sure authenticateToken is available and properly defined
  if (typeof authenticateToken === 'function') {
    authenticateToken(req, res, next);
  } else {
    // If authenticateToken is not set yet, deny access
    res.status(401).json({ message: 'Authentication middleware not initialized' });
  }
}, isSuperAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { name, email, role, isActive } = req.body;

    // Build update query dynamically based on provided fields
    const updates = [];
    const values = [];
    let index = 1;

    if (name !== undefined) {
      updates.push(`name = $${index++}`);
      values.push(name);
    }

    if (email !== undefined) {
      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({
          message: 'Invalid email format'
        });
      }
      updates.push(`email = $${index++}`);
      values.push(email);
    }

    if (role !== undefined) {
      // Validate role
      const validRoles = ['supervisor', 'Site PM', 'PMAG', 'admin', 'Super Admin'];
      if (!validRoles.includes(role)) {
        return res.status(400).json({
          message: 'Invalid role. Must be one of: ' + validRoles.join(', ')
        });
      }
      updates.push(`role = $${index++}`);
      values.push(role);
    }

    // Check if is_active column exists before processing updates
    const columnCheck = await getPool().query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'users' AND column_name IN ('is_active', 'updated_at')
    `);
    const hasIsActiveColumn = columnCheck.rows.some(row => row.column_name === 'is_active');
    const hasUpdatedAtColumn = columnCheck.rows.some(row => row.column_name === 'updated_at');

    if (isActive !== undefined) {
      if (hasIsActiveColumn) {
        updates.push(`is_active = $${index++}`);
        values.push(isActive);
      } else {
        // Column doesn't exist, skip this update
        console.warn('is_active column does not exist, skipping isActive update');
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ message: 'No fields to update' });
    }

    // Get old user data for logging before update
    let oldUserQuery;
    if (hasIsActiveColumn) {
      oldUserQuery = 'SELECT role, COALESCE(is_active, true) as is_active FROM users WHERE user_id = $1';
    } else {
      oldUserQuery = 'SELECT role, true as is_active FROM users WHERE user_id = $1';
    }

    const oldUserResult = await getPool().query(oldUserQuery, [userId]);

    if (oldUserResult.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    const oldUser = oldUserResult.rows[0];

    // Add updated_at if column exists
    if (hasUpdatedAtColumn) {
      updates.push(`updated_at = CURRENT_TIMESTAMP`);
    }

    values.push(userId);

    let returnFields = 'user_id, name, email, role';
    if (hasIsActiveColumn) {
      returnFields += ', COALESCE(is_active, true) as is_active';
    } else {
      returnFields += ', true as is_active';
    }

    const result = await getPool().query(
      `UPDATE users SET ${updates.join(', ')} WHERE user_id = $${index} RETURNING ${returnFields}`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    const user = result.rows[0];

    // Log role change if role was updated
    if (role !== undefined && role !== oldUser.role) {
      await logAction(
        'USER_ROLE_CHANGED',
        req.user.userId,
        `User: ${user.name} (${user.email})`,
        `Role changed from ${oldUser.role} to ${role}`
      );
    }

    // Log activation/deactivation if status was updated
    if (isActive !== undefined && isActive !== oldUser.is_active) {
      await logAction(
        isActive ? 'USER_ACTIVATED' : 'USER_DEACTIVATED',
        req.user.userId,
        `User: ${user.name} (${user.email})`,
        `User ${isActive ? 'activated' : 'deactivated'}`
      );
    }

    res.json({
      message: 'User updated successfully',
      user: {
        ObjectId: user.user_id,
        Name: user.name,
        Email: user.email,
        Role: user.role,
        IsActive: user.is_active
      }
    });
  } catch (error) {
    console.error('Error updating user:', error);
    if (error.code === '23505') {
      return res.status(400).json({ message: 'Email already exists' });
    }
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Delete user (Super Admin only)
router.delete('/users/:userId', (req, res, next) => {
  // Make sure authenticateToken is available and properly defined
  if (typeof authenticateToken === 'function') {
    authenticateToken(req, res, next);
  } else {
    // If authenticateToken is not set yet, deny access
    res.status(401).json({ message: 'Authentication middleware not initialized' });
  }
}, isSuperAdmin, async (req, res) => {
  try {
    const { userId } = req.params;

    // Prevent deletion of self
    if (parseInt(userId) === req.user.userId) {
      return res.status(400).json({ message: 'Cannot delete your own account' });
    }

    const result = await getPool().query(
      'DELETE FROM users WHERE user_id = $1 RETURNING user_id',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Reset user password (Super Admin only)
router.post('/users/:userId/reset-password', (req, res, next) => {
  // Make sure authenticateToken is available and properly defined
  if (typeof authenticateToken === 'function') {
    authenticateToken(req, res, next);
  } else {
    // If authenticateToken is not set yet, deny access
    res.status(401).json({ message: 'Authentication middleware not initialized' });
  }
}, isSuperAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { newPassword } = req.body;

    // Validate password strength
    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({
        message: 'Password must be at least 8 characters long'
      });
    }

    // Hash new password
    const bcrypt = require('bcryptjs');
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    const result = await getPool().query(
      'UPDATE users SET password = $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2 RETURNING user_id, name, email',
      [hashedPassword, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    const user = result.rows[0];

    res.json({
      message: 'Password reset successfully',
      user: {
        ObjectId: user.user_id,
        Name: user.name,
        Email: user.email
      }
    });
  } catch (error) {
    console.error('Error resetting password:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get all projects (Super Admin only)
router.get('/projects', (req, res, next) => {
  // Make sure authenticateToken is available and properly defined
  if (typeof authenticateToken === 'function') {
    authenticateToken(req, res, next);
  } else {
    // If authenticateToken is not set yet, deny access
    res.status(401).json({ message: 'Authentication middleware not initialized' });
  }
}, isSuperAdmin, async (req, res) => {
  try {
    // Fetch only P6 projects
    const result = await getPool().query(`
      SELECT 
        "ObjectId" AS "ObjectId", 
        "Name" AS "Name", 
        NULL AS "Location", 
        "Status" AS "Status", 
        0 AS "Progress", 
        "PlannedStartDate" AS "PlanStart", 
        "PlannedFinishDate" AS "PlanEnd",
        COALESCE("LastSyncAt", CURRENT_TIMESTAMP) AS "CreatedAt",
        'p6' AS "Source"
      FROM p6_projects
      ORDER BY "Name"
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching projects:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

// Create a new project (Super Admin only)
router.post('/projects', (req, res, next) => {
  // Make sure authenticateToken is available and properly defined
  if (typeof authenticateToken === 'function') {
    authenticateToken(req, res, next);
  } else {
    // If authenticateToken is not set yet, deny access
    res.status(401).json({ message: 'Authentication middleware not initialized' });
  }
}, isSuperAdmin, async (req, res) => {
  try {
    const { name, location, status, progress, planStart, planEnd } = req.body;

    // Validate required fields
    if (!name) {
      return res.status(400).json({
        message: 'Project name is required'
      });
    }

    const result = await getPool().query(
      'INSERT INTO projects (name, location, status, progress, plan_start, plan_end) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, name, location, status, progress, plan_start, plan_end',
      [name, location || null, status || 'planning', progress || 0, planStart || null, planEnd || null]
    );

    const project = result.rows[0];

    res.status(201).json({
      message: 'Project created successfully',
      project: {
        ObjectId: project.id,
        Name: project.name,
        Location: project.location,
        Status: project.status,
        Progress: project.progress,
        PlanStart: project.plan_start,
        PlanEnd: project.plan_end
      }
    });
  } catch (error) {
    console.error('Error creating project:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Update project (Super Admin only)
router.put('/projects/:projectId', (req, res, next) => {
  // Make sure authenticateToken is available and properly defined
  if (typeof authenticateToken === 'function') {
    authenticateToken(req, res, next);
  } else {
    // If authenticateToken is not set yet, deny access
    res.status(401).json({ message: 'Authentication middleware not initialized' });
  }
}, isSuperAdmin, async (req, res) => {
  try {
    const { projectId } = req.params;
    const { name, location, status, progress, planStart, planEnd } = req.body;

    // Build update query dynamically based on provided fields
    const updates = [];
    const values = [];
    let index = 1;

    if (name !== undefined) {
      updates.push(`name = $${index++}`);
      values.push(name);
    }

    if (location !== undefined) {
      updates.push(`location = $${index++}`);
      values.push(location);
    }

    if (status !== undefined) {
      updates.push(`status = $${index++}`);
      values.push(status);
    }

    if (progress !== undefined) {
      updates.push(`progress = $${index++}`);
      values.push(progress);
    }

    if (planStart !== undefined) {
      updates.push(`plan_start = $${index++}`);
      values.push(planStart);
    }

    if (planEnd !== undefined) {
      updates.push(`plan_end = $${index++}`);
      values.push(planEnd);
    }

    if (updates.length === 0) {
      return res.status(400).json({ message: 'No fields to update' });
    }

    values.push(projectId);

    const result = await getPool().query(
      `UPDATE projects SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${index} RETURNING id, name, location, status, progress, plan_start, plan_end`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Project not found' });
    }

    const project = result.rows[0];

    res.json({
      message: 'Project updated successfully',
      project: {
        ObjectId: project.id,
        Name: project.name,
        Location: project.location,
        Status: project.status,
        Progress: project.progress,
        PlanStart: project.plan_start,
        PlanEnd: project.plan_end
      }
    });
  } catch (error) {
    console.error('Error updating project:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Delete project (Super Admin only)
router.delete('/projects/:projectId', (req, res, next) => {
  // Make sure authenticateToken is available and properly defined
  if (typeof authenticateToken === 'function') {
    authenticateToken(req, res, next);
  } else {
    // If authenticateToken is not set yet, deny access
    res.status(401).json({ message: 'Authentication middleware not initialized' });
  }
}, isSuperAdmin, async (req, res) => {
  try {
    const { projectId } = req.params;

    const result = await getPool().query(
      'DELETE FROM projects WHERE id = $1 RETURNING id',
      [projectId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Project not found' });
    }

    res.json({ message: 'Project deleted successfully' });
  } catch (error) {
    console.error('Error deleting project:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get system statistics (Super Admin only)
router.get('/stats', (req, res, next) => {
  // Make sure authenticateToken is available and properly defined
  if (typeof authenticateToken === 'function') {
    authenticateToken(req, res, next);
  } else {
    // If authenticateToken is not set yet, deny access
    res.status(401).json({ message: 'Authentication middleware not initialized' });
  }
}, isSuperAdmin, async (req, res) => {
  try {
    // Get user counts by role
    const userStats = await getPool().query(`
      SELECT role, COUNT(*) as count
      FROM users
      GROUP BY role
      ORDER BY role
    `);

    // Get project counts by status (only P6 projects)
    const projectStats = await getPool().query(`
      SELECT "Status" as status, COUNT(*) as count
      FROM p6_projects
      GROUP BY "Status"
      ORDER BY "Status"
    `);

    // Get total sheets count
    const sheetsStats = await getPool().query(`
      SELECT COUNT(*) as total_sheets,
             COUNT(CASE WHEN status = 'draft' THEN 1 END) as draft_sheets,
             COUNT(CASE WHEN status = 'submitted' THEN 1 END) as submitted_sheets,
             COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved_sheets
      FROM dpr_sheets
    `);

    res.json({
      userStats: userStats.rows,
      projectStats: projectStats.rows,
      sheetsStats: sheetsStats.rows[0]
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get specific user details (Super Admin only)
router.get('/users/:userId', (req, res, next) => {
  // Make sure authenticateToken is available and properly defined
  if (typeof authenticateToken === 'function') {
    authenticateToken(req, res, next);
  } else {
    // If authenticateToken is not set yet, deny access
    res.status(401).json({ message: 'Authentication middleware not initialized' });
  }
}, isSuperAdmin, async (req, res) => {
  try {
    const { userId } = req.params;

    // Check if is_active column exists
    const columnCheck = await getPool().query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'users' AND column_name = 'is_active'
    `);

    const hasIsActiveColumn = columnCheck.rows.length > 0;

    let query;
    if (hasIsActiveColumn) {
      query = `SELECT user_id AS "ObjectId", name AS "Name", email AS "Email", role AS "Role", 
                      COALESCE(is_active, true) AS "IsActive", created_at AS "CreatedAt" 
               FROM users WHERE user_id = $1`;
    } else {
      query = `SELECT user_id AS "ObjectId", name AS "Name", email AS "Email", role AS "Role", 
                      true AS "IsActive", created_at AS "CreatedAt" 
               FROM users WHERE user_id = $1`;
    }

    const result = await getPool().query(query, [userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

// Get user's assigned projects (Super Admin only)
router.get('/users/:userId/projects', (req, res, next) => {
  // Make sure authenticateToken is available and properly defined
  if (typeof authenticateToken === 'function') {
    authenticateToken(req, res, next);
  } else {
    // If authenticateToken is not set yet, deny access
    res.status(401).json({ message: 'Authentication middleware not initialized' });
  }
}, isSuperAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    console.log('Fetching projects for user:', userId);

    // Query to get user's assigned projects
    const result = await getPool().query(`
      SELECT p."ObjectId" as id, p."Name" as name
      FROM p6_projects p
      JOIN project_assignments pa ON p."ObjectId" = pa.project_id
      WHERE pa.user_id = $1
      ORDER BY p.name
    `, [userId]);

    console.log('Projects query result:', result.rows);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching user projects:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get user analytics (Super Admin only)
router.get('/users/:userId/analytics', (req, res, next) => {
  // Make sure authenticateToken is available and properly defined
  if (typeof authenticateToken === 'function') {
    authenticateToken(req, res, next);
  } else {
    // If authenticateToken is not set yet, deny access
    res.status(401).json({ message: 'Authentication middleware not initialized' });
  }
}, isSuperAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    console.log('Fetching analytics for user:', userId);

    // Query to get user analytics
    const result = await getPool().query(`
      SELECT 
        COUNT(*) as total_sheets,
        COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved_sheets,
        COUNT(CASE WHEN status = 'submitted' THEN 1 END) as pending_sheets,
        MAX(created_at) as last_submission
      FROM dpr_sheets 
      WHERE user_id = $1
    `, [userId]);

    console.log('Analytics query result:', result.rows);
    const analytics = result.rows[0];

    res.json({
      totalSheets: parseInt(analytics.total_sheets) || 0,
      approvedSheets: parseInt(analytics.approved_sheets) || 0,
      pendingSheets: parseInt(analytics.pending_sheets) || 0,
      lastSubmission: analytics.last_submission ? new Date(analytics.last_submission).toISOString().split('T')[0] : null
    });
  } catch (error) {
    console.error('Error fetching user analytics:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get user's submitted sheets (Super Admin only)
router.get('/users/:userId/sheets', (req, res, next) => {
  // Make sure authenticateToken is available and properly defined
  if (typeof authenticateToken === 'function') {
    authenticateToken(req, res, next);
  } else {
    // If authenticateToken is not set yet, deny access
    res.status(401).json({ message: 'Authentication middleware not initialized' });
  }
}, isSuperAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    console.log('Fetching sheets for user:', userId);

    // Query to get user's submitted sheets with project names
    const result = await getPool().query(`
      SELECT 
        ds.id,
        ds.sheet_date as date,
        ds.status,
        p.name as project
      FROM dpr_sheets ds
      JOIN p6_projects p ON ds.project_id = p."ObjectId"
      WHERE ds.user_id = $1
      ORDER BY ds.sheet_date DESC
      LIMIT 10
    `, [userId]);

    console.log('Sheets query result:', result.rows);
    const sheets = result.rows.map(row => ({
      id: `SHT-${row.id.toString().padStart(3, '0')}`,
      date: new Date(row.date).toISOString().split('T')[0],
      status: row.status.charAt(0).toUpperCase() + row.status.slice(1),
      project: row.project
    }));

    res.json(sheets);
  } catch (error) {
    console.error('Error fetching user sheets:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Assign project to user (Super Admin only)
router.post('/users/assign-project', (req, res, next) => {
  if (typeof authenticateToken === 'function') {
    authenticateToken(req, res, next);
  } else {
    res.status(401).json({ message: 'Authentication middleware not initialized' });
  }
}, isSuperAdmin, async (req, res) => {
  try {
    const { userId, projectId, sheetTypes = [] } = req.body;

    if (!userId || !projectId) {
      return res.status(400).json({ message: 'User ID and Project ID are required' });
    }

    // Check if project exists in either local projects or p6_projects
    const projectResult = await getPool().query(`
      SELECT id AS project_id, name, 'local' AS source FROM projects WHERE id = $1
      UNION ALL
      SELECT "objectId" AS project_id, "name", 'p6' AS source FROM p6_projects WHERE "objectId" = $1
    `, [projectId]);

    if (projectResult.rows.length === 0) {
      return res.status(404).json({ message: 'Project not found' });
    }

    const project = projectResult.rows[0];

    // Check if user exists
    const userResult = await getPool().query('SELECT user_id, name FROM users WHERE user_id = $1', [userId]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if assignment already exists
    const existingAssignment = await getPool().query(
      'SELECT id FROM project_assignments WHERE project_id = $1 AND user_id = $2',
      [projectId, userId]
    );

    if (existingAssignment.rows.length > 0) {
      return res.status(400).json({ message: 'Project is already assigned to this user' });
    }

    // Assign project
    const result = await getPool().query(
      'INSERT INTO project_assignments (project_id, user_id, assigned_by, sheet_types) VALUES ($1, $2, $3, $4) RETURNING id',
      [projectId, userId, req.user.userId, JSON.stringify(sheetTypes)]
    );

    // Log project assignment
    await logAction(
      'PROJECT_ASSIGNED',
      req.user.userId,
      `User: ${userResult.rows[0].name}, Project: ${project.name}`,
      `Assigned project ${project.name} to user ${userResult.rows[0].name}`
    );

    res.status(201).json({
      message: 'Project assigned successfully',
      assignment: result.rows[0]
    });
  } catch (error) {
    console.error('Error assigning project:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

// Get specific project details (Super Admin only)
router.get('/projects/:projectId', (req, res, next) => {
  // Make sure authenticateToken is available and properly defined
  if (typeof authenticateToken === 'function') {
    authenticateToken(req, res, next);
  } else {
    // If authenticateToken is not set yet, deny access
    res.status(401).json({ message: 'Authentication middleware not initialized' });
  }
}, isSuperAdmin, async (req, res) => {
  try {
    const { projectId } = req.params;

    const result = await getPool().query(
      'SELECT id AS "ObjectId", name AS "Name", location AS "Location", status AS "Status", progress AS "Progress", plan_start AS "PlanStart", plan_end AS "PlanEnd", created_at AS "CreatedAt" FROM projects WHERE id = $1',
      [projectId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Project not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching project:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get users assigned to a project (Super Admin only)
router.get('/projects/:projectId/users', (req, res, next) => {
  // Make sure authenticateToken is available and properly defined
  if (typeof authenticateToken === 'function') {
    authenticateToken(req, res, next);
  } else {
    // If authenticateToken is not set yet, deny access
    res.status(401).json({ message: 'Authentication middleware not initialized' });
  }
}, isSuperAdmin, async (req, res) => {
  try {
    const { projectId } = req.params;

    // Query to get users assigned to this project
    const result = await getPool().query(`
      SELECT u.user_id AS "ObjectId", u.name AS "Name", u.email AS "Email", u.role AS "Role"
      FROM users u
      JOIN project_assignments pa ON u.user_id = pa.user_id
      WHERE pa.project_id = $1
      ORDER BY u.name
    `, [projectId]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching project users:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get system logs (Super Admin only)
router.get('/logs', (req, res, next) => {
  if (typeof authenticateToken === 'function') {
    authenticateToken(req, res, next);
  } else {
    res.status(401).json({ message: 'Authentication middleware not initialized' });
  }
}, isSuperAdmin, async (req, res) => {
  try {
    const { actionType } = req.query;

    let query = `
      SELECT 
        sl.id,
        sl.action_type,
        sl.performed_by,
        u.name AS performed_by_name,
        sl.target_entity,
        sl.remarks,
        sl.created_at AS timestamp
      FROM system_logs sl
      LEFT JOIN users u ON sl.performed_by = u.user_id
    `;

    const params = [];
    if (actionType) {
      query += ' WHERE sl.action_type = $1';
      params.push(actionType);
    }

    query += ' ORDER BY sl.created_at DESC LIMIT 1000';

    const result = await getPool().query(query, params);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching system logs:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get role statistics (Super Admin only)
router.get('/roles', (req, res, next) => {
  if (typeof authenticateToken === 'function') {
    authenticateToken(req, res, next);
  } else {
    res.status(401).json({ message: 'Authentication middleware not initialized' });
  }
}, isSuperAdmin, async (req, res) => {
  try {
    // Get role distribution from users table
    const result = await getPool().query(`
      SELECT 
        role AS name,
        COUNT(*) AS userCount
      FROM users 
      GROUP BY role
      ORDER BY role
    `);

    // Define role permissions (these could be stored in a separate table in a more complex system)
    const rolePermissions = {
      'supervisor': 'Create and submit DPR sheets, View assigned projects, Update personal profile',
      'Site PM': 'Review and approve supervisor submissions, View all project data, Assign projects to supervisors, Generate reports',
      'PMAG': 'Final approval of PM-reviewed sheets, System-wide analytics and reporting, User management, Project oversight',
      'Super Admin': 'Full system access, User and role management, System configuration, All project access, Audit logs'
    };

    // Format the response to match the frontend expectations
    const roles = result.rows.map((roleRow, index) => ({
      id: index + 1,
      name: roleRow.name,
      permissions: rolePermissions[roleRow.name] || 'Standard permissions',
      userCount: parseInt(roleRow.usercount) // PostgreSQL returns lowercase column names
    }));

    res.json(roles);
  } catch (error) {
    console.error('Error fetching roles:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get all sheet entries (Super Admin only)
router.get('/entries', (req, res, next) => {
  if (typeof authenticateToken === 'function') {
    authenticateToken(req, res, next);
  } else {
    res.status(401).json({ message: 'Authentication middleware not initialized' });
  }
}, isSuperAdmin, async (req, res) => {
  try {
    const { status, projectId, sheetType, limit = 50, offset = 0 } = req.query;

    let query = `
      WITH combined_entries AS (
        SELECT 
          d.id,
          d.sheet_type::text,
          d.project_id,
          d.supervisor_id AS user_id,
          d.status,
          d.data_json,
          d.created_at,
          d.updated_at,
          d.submitted_at,
          d.pm_reviewed_at AS approved_at,
          NULL::timestamp AS final_approved_at
        FROM dpr_supervisor_entries d
        
        UNION ALL
        
        SELECT 
          c.id,
          c.sheet_type::text,
          c.project_id,
          c.supervisor_id AS user_id,
          c.status,
          c.data_json,
          c.created_at,
          c.updated_at,
          c.submitted_at,
          NULL::timestamp AS approved_at,
          NULL::timestamp AS final_approved_at
        FROM custom_sheet_entries c
      )
      SELECT 
        e.id,
        e.sheet_type,
        e.project_id,
        COALESCE(p.name, p6.name) AS project_name,
        e.user_id,
        u.name AS submitted_by,
        e.status,
        e.data_json,
        e.created_at,
        e.updated_at,
        e.submitted_at,
        e.approved_at,
        e.final_approved_at
      FROM combined_entries e
      LEFT JOIN projects p ON e.project_id = p.id
      LEFT JOIN p6_projects p6 ON e.project_id = p6."objectId"
      LEFT JOIN users u ON e.user_id = u.user_id
      WHERE 1=1
    `;

    const params = [];
    let paramIndex = 1;

    // Filter by status
    if (status && status !== 'all') {
      query += ` AND e.status = $${paramIndex++}`;
      params.push(status);
    }

    // Filter by project
    if (projectId && projectId !== 'all') {
      query += ` AND e.project_id = $${paramIndex++}`;
      params.push(projectId);
    }

    // Filter by sheet type
    if (sheetType && sheetType !== 'all') {
      query += ` AND e.sheet_type = $${paramIndex++}`;
      params.push(sheetType);
    }

    // Add ordering and pagination
    query += ` ORDER BY e.updated_at DESC, e.created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await getPool().query(query, params);

    // Get total count for pagination
    let countQuery = `
      WITH combined_entries AS (
        SELECT d.sheet_type::text, d.project_id, d.status FROM dpr_supervisor_entries d
        UNION ALL
        SELECT c.sheet_type::text, c.project_id, c.status FROM custom_sheet_entries c
      )
      SELECT COUNT(*) as total
      FROM combined_entries e
      WHERE 1=1
    `;

    const countParams = [];
    let countParamIndex = 1;

    if (status && status !== 'all') {
      countQuery += ` AND e.status = $${countParamIndex++}`;
      countParams.push(status);
    }

    if (projectId && projectId !== 'all') {
      countQuery += ` AND e.project_id = $${countParamIndex++}`;
      countParams.push(projectId);
    }

    if (sheetType && sheetType !== 'all') {
      countQuery += ` AND e.sheet_type = $${countParamIndex++}`;
      countParams.push(sheetType);
    }

    const countResult = await getPool().query(countQuery, countParams);

    res.json({
      entries: result.rows,
      total: parseInt(countResult.rows[0].total),
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('Error fetching sheet entries:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

// Get snapshot data with filters (Super Admin only)
router.get('/snapshot', (req, res, next) => {
  if (typeof authenticateToken === 'function') {
    authenticateToken(req, res, next);
  } else {
    res.status(401).json({ message: 'Authentication middleware not initialized' });
  }
}, isSuperAdmin, async (req, res) => {
  try {
    const { startDate, endDate, projectId, sheetType } = req.query;

    // Build query
    let query = `
      WITH combined_entries AS (
        SELECT 
          d.id,
          d.sheet_type::text,
          d.project_id,
          d.supervisor_id AS user_id,
          d.status,
          d.data_json,
          d.created_at,
          d.updated_at,
          d.submitted_at,
          d.pm_reviewed_at AS approved_at,
          NULL::timestamp AS final_approved_at,
          d.rejection_reason
        FROM dpr_supervisor_entries d
        
        UNION ALL
        
        SELECT 
          c.id,
          c.sheet_type::text,
          c.project_id,
          c.supervisor_id AS user_id,
          c.status,
          c.data_json,
          c.created_at,
          c.updated_at,
          c.submitted_at,
          NULL::timestamp AS approved_at,
          NULL::timestamp AS final_approved_at,
          NULL::text AS rejection_reason
        FROM custom_sheet_entries c
      )
      SELECT 
        e.id,
        e.sheet_type,
        e.project_id,
        COALESCE(p.name, p6.name) AS project_name,
        e.user_id,
        u.name AS submitted_by,
        u.role AS user_role,
        e.status,
        e.data_json,
        e.created_at,
        e.updated_at,
        e.submitted_at,
        e.approved_at,
        e.final_approved_at,
        e.rejection_reason
      FROM combined_entries e
      LEFT JOIN projects p ON e.project_id = p.id
      LEFT JOIN p6_projects p6 ON e.project_id = p6."objectId"
      LEFT JOIN users u ON e.user_id = u.user_id
      WHERE 1=1
    `;

    const params = [];
    let paramIndex = 1;

    // Date range filter
    if (startDate) {
      query += ` AND e.created_at >= $${paramIndex++}`;
      params.push(startDate);
    }

    if (endDate) {
      // Add one day to include the entire end date
      query += ` AND e.created_at < ($${paramIndex++}::date + interval '1 day')`;
      params.push(endDate);
    }

    // Project filter
    if (projectId && projectId !== 'all') {
      query += ` AND e.project_id = $${paramIndex++}`;
      params.push(projectId);
    }

    // Sheet type filter (can be comma-separated for multiple types)
    if (sheetType && sheetType !== 'all') {
      const sheetTypes = sheetType.split(',');
      query += ` AND e.sheet_type = ANY($${paramIndex++}::text[])`;
      params.push(sheetTypes);
    }

    // Order by most recent first
    query += ` ORDER BY e.created_at DESC, e.id DESC`;

    // Limit to prevent excessive data
    query += ` LIMIT 1000`;

    const result = await getPool().query(query, params);

    // Get summary statistics
    const statsQuery = `
      WITH combined_entries AS (
        SELECT 
          d.id,
          d.sheet_type::text,
          d.project_id,
          d.supervisor_id AS user_id,
          d.status,
          d.created_at
        FROM dpr_supervisor_entries d
        
        UNION ALL
        
        SELECT 
          c.id,
          c.sheet_type::text,
          c.project_id,
          c.supervisor_id AS user_id,
          c.status,
          c.created_at
        FROM custom_sheet_entries c
      )
      SELECT 
        COUNT(*) as total_entries,
        COUNT(CASE WHEN status = 'draft' THEN 1 END) as draft_count,
        COUNT(CASE WHEN status = 'submitted_to_pm' THEN 1 END) as submitted_count,
        COUNT(CASE WHEN status = 'approved_by_pm' THEN 1 END) as approved_count,
        COUNT(CASE WHEN status = 'final_approved' THEN 1 END) as final_approved_count,
        COUNT(CASE WHEN status = 'rejected_by_pm' OR status = 'rejected_by_pmag' THEN 1 END) as rejected_count,
        COUNT(DISTINCT project_id) as unique_projects,
        COUNT(DISTINCT user_id) as unique_users
      FROM combined_entries e
      WHERE 1=1
      ${startDate ? `AND e.created_at >= '${startDate}'` : ''}
      ${endDate ? `AND e.created_at < ('${endDate}'::date + interval '1 day')` : ''}
      ${projectId && projectId !== 'all' ? `AND e.project_id = ${projectId}` : ''}
      ${sheetType && sheetType !== 'all' ? `AND e.sheet_type = ANY(ARRAY[${sheetType.split(',').map(t => `'${t}'`).join(',')}])` : ''}
    `;

    const statsResult = await getPool().query(statsQuery);

    res.json({
      entries: result.rows,
      statistics: statsResult.rows[0],
      filters: {
        startDate: startDate || null,
        endDate: endDate || null,
        projectId: projectId || null,
        sheetType: sheetType || null
      }
    });
  } catch (error) {
    console.error('Error fetching snapshot data:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

// Export the router and setPool function
module.exports = { router, setPool };