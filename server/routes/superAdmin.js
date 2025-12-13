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
    const columnCheck = await pool.query(`
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
    
    const result = await pool.query(query);
    
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
    const bcrypt = require('bcrypt');
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    
    // Insert user into database
    const result = await pool.query(
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
    const columnCheck = await pool.query(`
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
    
    const oldUserResult = await pool.query(oldUserQuery, [userId]);
    
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
    
    const result = await pool.query(
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
    
    const result = await pool.query(
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
    const bcrypt = require('bcrypt');
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);
    
    const result = await pool.query(
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
    const result = await pool.query(
      'SELECT DISTINCT id AS "ObjectId", name AS "Name", location AS "Location", status AS "Status", progress AS "Progress", plan_start AS "PlanStart", plan_end AS "PlanEnd", created_at AS "CreatedAt" FROM projects ORDER BY name'
    );
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching projects:', error);
    res.status(500).json({ message: 'Internal server error' });
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
    
    const result = await pool.query(
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
    
    const result = await pool.query(
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
    
    const result = await pool.query(
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
    const userStats = await pool.query(`
      SELECT role, COUNT(*) as count
      FROM users
      GROUP BY role
      ORDER BY role
    `);
    
    // Get project counts by status
    const projectStats = await pool.query(`
      SELECT status, COUNT(*) as count
      FROM projects
      GROUP BY status
      ORDER BY status
    `);
    
    // Get total sheets count
    const sheetsStats = await pool.query(`
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
    const columnCheck = await pool.query(`
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
    
    const result = await pool.query(query, [userId]);
    
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
    const result = await pool.query(`
      SELECT p.id, p.name
      FROM projects p
      JOIN project_assignments pa ON p.id = pa.project_id
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
    const result = await pool.query(`
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
    const result = await pool.query(`
      SELECT 
        ds.id,
        ds.sheet_date as date,
        ds.status,
        p.name as project
      FROM dpr_sheets ds
      JOIN projects p ON ds.project_id = p.id
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
    const { userId, projectId } = req.body;
    
    if (!userId || !projectId) {
      return res.status(400).json({ message: 'User ID and Project ID are required' });
    }
    
    // Check if project exists
    const projectResult = await pool.query('SELECT id, name FROM projects WHERE id = $1', [projectId]);
    if (projectResult.rows.length === 0) {
      return res.status(404).json({ message: 'Project not found' });
    }
    
    // Check if user exists
    const userResult = await pool.query('SELECT user_id, name FROM users WHERE user_id = $1', [userId]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Check if assignment already exists
    const existingAssignment = await pool.query(
      'SELECT id FROM project_assignments WHERE project_id = $1 AND user_id = $2',
      [projectId, userId]
    );
    
    if (existingAssignment.rows.length > 0) {
      return res.status(400).json({ message: 'Project is already assigned to this user' });
    }
    
    // Assign project
    const result = await pool.query(
      'INSERT INTO project_assignments (project_id, user_id, assigned_by) VALUES ($1, $2, $3) RETURNING id',
      [projectId, userId, req.user.userId]
    );
    
    // Log project assignment
    await logAction(
      'PROJECT_ASSIGNED',
      req.user.userId,
      `User: ${userResult.rows[0].name}, Project: ${projectResult.rows[0].name}`,
      `Assigned project ${projectResult.rows[0].name} to user ${userResult.rows[0].name}`
    );
    
    res.status(201).json({
      message: 'Project assigned successfully',
      assignment: result.rows[0]
    });
  } catch (error) {
    console.error('Error assigning project:', error);
    res.status(500).json({ message: 'Internal server error' });
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
    
    const result = await pool.query(
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
    const result = await pool.query(`
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
    
    const result = await pool.query(query, params);
    
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
    const result = await pool.query(`
      SELECT 
        role AS name,
        COUNT(*) AS userCount
      FROM users 
      GROUP BY role
      ORDER BY role
    `);
    
    // Define role permissions (these could be stored in a separate table in a more complex system)
    const rolePermissions = {
      'supervisor': 'Basic data entry, sheet submission',
      'Site PM': 'Review and approve sheets',
      'PMAG': 'Final approval, analytics',
      'Super Admin': 'Full system access'
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

// Export the router and setPool function
module.exports = { router, setPool };