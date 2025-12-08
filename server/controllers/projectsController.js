// server/controllers/projectsController.js
const pool = require('../db');

// Import cache with error handling
let cache;
try {
  const redisModule = require('../cache/redisClient');
  cache = redisModule.cache;
} catch (error) {
  console.warn('Redis cache not available, using in-memory cache as fallback');
  // Simple in-memory cache as fallback
  const memoryCache = new Map();
  cache = {
    get: async (key) => {
      const item = memoryCache.get(key);
      if (item && item.expire > Date.now()) {
        return item.value;
      }
      memoryCache.delete(key);
      return null;
    },
    set: async (key, value, expireTime = 300) => {
      memoryCache.set(key, {
        value,
        expire: Date.now() + (expireTime * 1000)
      });
      return true;
    },
    del: async (key) => {
      memoryCache.delete(key);
      return true;
    },
    flushAll: async () => {
      memoryCache.clear();
      return true;
    }
  };
}

// Get all projects for a user based on their role with caching
const getUserProjects = async (req, res) => {
  try {
    console.log('getUserProjects called with user:', req.user);
    const userId = req.user.userId;
    const userRole = req.user.role;
    
    // Create cache key based on user ID and role
    const cacheKey = `user_projects_${userId}_${userRole}`;
    console.log('Cache key:', cacheKey);
    
    // Try to get data from cache first
    let cachedProjects = await cache.get(cacheKey);
    if (cachedProjects) {
      console.log(`Returning projects for user ${userId} from cache`);
      return res.status(200).json(cachedProjects);
    }
    
    let result;
    
    if (userRole === 'supervisor' || userRole === 'Site PM') {
      console.log('Fetching assigned projects for supervisor/Site PM');
      // For supervisors and Site PM, get only assigned projects
      result = await pool.query(`
        SELECT 
          p.id AS "ObjectId", 
          p.name AS "Name", 
          p.location AS "Location", 
          p.status AS "Status", 
          p.progress AS "PercentComplete", 
          p.plan_start as "PlannedStartDate", 
          p.plan_end as "PlannedFinishDate", 
          p.actual_start as "ActualStartDate", 
          p.actual_end as "ActualFinishDate"
        FROM projects p
        INNER JOIN project_assignments pa ON p.id = pa.project_id
        WHERE pa.user_id = $1
        ORDER BY p.name
      `, [userId]);
    } else {
      console.log('Fetching all projects for PMAG');
      // For PMAG, get all projects
      result = await pool.query(`
        SELECT 
          id AS "ObjectId", 
          name AS "Name", 
          location AS "Location", 
          status AS "Status", 
          progress AS "PercentComplete", 
          plan_start as "PlannedStartDate", 
          plan_end as "PlannedFinishDate", 
          actual_start as "ActualStartDate", 
          actual_end as "ActualFinishDate"
        FROM projects
        ORDER BY name
      `);
    }
    
    console.log('Query result rows:', result.rows.length);
    
    // Cache the result for 5 minutes
    await cache.set(cacheKey, result.rows, 300);
    
    res.status(200).json(result.rows);
  } catch (error) {
    console.error('Error fetching user projects:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};

// Get a specific project by ID with caching
const getProjectById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    const userRole = req.user.role;
    
    // Create cache key for specific project
    const cacheKey = `project_${id}_${userId}_${userRole}`;
    
    // Try to get data from cache first
    let cachedProject = await cache.get(cacheKey);
    if (cachedProject) {
      console.log(`Returning project ${id} from cache`);
      return res.status(200).json(cachedProject);
    }
    
    let result;
    
    if (userRole === 'supervisor' || userRole === 'Site PM') {
      // For supervisors and Site PM, check if they're assigned to this project
      result = await pool.query(`
        SELECT 
          p.id AS "ObjectId", 
          p.name AS "Name", 
          p.location AS "Location", 
          p.status AS "Status", 
          p.progress AS "PercentComplete", 
          p.plan_start as "PlannedStartDate", 
          p.plan_end as "PlannedFinishDate", 
          p.actual_start as "ActualStartDate", 
          p.actual_end as "ActualFinishDate"
        FROM projects p
        INNER JOIN project_assignments pa ON p.id = pa.project_id
        WHERE p.id = $1 AND pa.user_id = $2
      `, [id, userId]);
    } else {
      // For PMAG, get the project directly
      result = await pool.query(`
        SELECT 
          id AS "ObjectId", 
          name AS "Name", 
          location AS "Location", 
          status AS "Status", 
          progress AS "PercentComplete", 
          plan_start as "PlannedStartDate", 
          plan_end as "PlannedFinishDate", 
          actual_start as "ActualStartDate", 
          actual_end as "ActualFinishDate"
        FROM projects
        WHERE id = $1
      `, [id]);
    }
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Project not found or not assigned to you' });
    }
    
    // Cache the result for 5 minutes
    await cache.set(cacheKey, result.rows[0], 300);
    
    res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching project:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Create a new project (PMAG/admin only)
const createProject = async (req, res) => {
  try {
    // Check if user is PMAG (admin)
    if (req.user.role !== 'PMAG') {
      return res.status(403).json({ message: 'Access denied. PMAG privileges required.' });
    }
    
    const { name, location, status, progress, planStart, planEnd, actualStart, actualEnd } = req.body;
    
    const result = await pool.query(`
      INSERT INTO projects 
      (name, location, status, progress, plan_start, plan_end, actual_start, actual_end)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING 
        id AS "ObjectId", 
        name AS "Name", 
        location AS "Location", 
        status AS "Status", 
        progress AS "PercentComplete", 
        plan_start as "PlannedStartDate", 
        plan_end as "PlannedFinishDate", 
        actual_start as "ActualStartDate", 
        actual_end as "ActualFinishDate"
    `, [name, location, status, progress, planStart, planEnd, actualStart, actualEnd]);
    
    // Invalidate cache for all users since we've added a new project
    await cache.flushAll();
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating project:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Update a project (PMAG/admin only)
const updateProject = async (req, res) => {
  try {
    // Check if user is PMAG (admin)
    if (req.user.role !== 'PMAG') {
      return res.status(403).json({ message: 'Access denied. PMAG privileges required.' });
    }
    
    const { id } = req.params;
    const { name, location, status, progress, planStart, planEnd, actualStart, actualEnd } = req.body;
    
    const result = await pool.query(`
      UPDATE projects 
      SET 
        name = COALESCE($1, name),
        location = COALESCE($2, location),
        status = COALESCE($3, status),
        progress = COALESCE($4, progress),
        plan_start = COALESCE($5, plan_start),
        plan_end = COALESCE($6, plan_end),
        actual_start = COALESCE($7, actual_start),
        actual_end = COALESCE($8, actual_end)
      WHERE id = $9
      RETURNING 
        id AS "ObjectId", 
        name AS "Name", 
        location AS "Location", 
        status AS "Status", 
        progress AS "PercentComplete", 
        plan_start as "PlannedStartDate", 
        plan_end as "PlannedFinishDate", 
        actual_start as "ActualStartDate", 
        actual_end as "ActualFinishDate"
    `, [name, location, status, progress, planStart, planEnd, actualStart, actualEnd, id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Project not found' });
    }
    
    // Invalidate cache for all users since we've updated a project
    await cache.flushAll();
    
    res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error('Error updating project:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Delete a project (PMAG/admin only)
const deleteProject = async (req, res) => {
  try {
    // Check if user is PMAG (admin)
    if (req.user.role !== 'PMAG') {
      return res.status(403).json({ message: 'Access denied. PMAG privileges required.' });
    }
    
    const { id } = req.params;
    
    // First delete any project assignments
    await pool.query('DELETE FROM project_assignments WHERE project_id = $1', [id]);
    
    // Then delete the project
    const result = await pool.query(
      'DELETE FROM projects WHERE id = $1 RETURNING id AS "ObjectId"',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Project not found' });
    }
    
    // Invalidate cache for all users since we've deleted a project
    await cache.flushAll();
    
    res.status(200).json({ message: 'Project deleted successfully', project: result.rows[0] });
  } catch (error) {
    console.error('Error deleting project:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Get projects for assignment (PMAG and Site PM only) - used in dropdowns when assigning projects
// PMAG sees all projects, Site PM sees only projects assigned to them
const getAllProjectsForAssignment = async (req, res) => {
  try {
    const userId = req.user.userId;
    const userRole = req.user.role;
    
    // Only PMAG and Site PM can get projects for assignment
    if (userRole !== 'PMAG' && userRole !== 'Site PM') {
      return res.status(403).json({ message: 'Access denied. PMAG or Site PM privileges required.' });
    }
    
    // Create cache key (user-specific for Site PM, global for PMAG)
    const cacheKey = userRole === 'PMAG' 
      ? 'all_projects_for_assignment_pmag' 
      : `projects_for_assignment_sitepm_${userId}`;
    
    // Try to get data from cache first
    let cachedProjects = await cache.get(cacheKey);
    if (cachedProjects) {
      console.log(`Returning projects for assignment from cache for ${userRole}`);
      return res.status(200).json(cachedProjects);
    }
    
    let result;
    
    if (userRole === 'PMAG') {
      // PMAG sees all projects
      result = await pool.query(`
        SELECT 
          id AS "ObjectId", 
          name AS "Name", 
          location AS "Location", 
          status AS "Status", 
          progress AS "PercentComplete", 
          plan_start as "PlannedStartDate", 
          plan_end as "PlannedFinishDate", 
          actual_start as "ActualStartDate", 
          actual_end as "ActualFinishDate"
        FROM projects
        ORDER BY name
      `);
    } else {
      // Site PM sees only projects assigned to them
      result = await pool.query(`
        SELECT 
          p.id AS "ObjectId", 
          p.name AS "Name", 
          p.location AS "Location", 
          p.status AS "Status", 
          p.progress AS "PercentComplete", 
          p.plan_start as "PlannedStartDate", 
          p.plan_end as "PlannedFinishDate", 
          p.actual_start as "ActualStartDate", 
          p.actual_end as "ActualFinishDate"
        FROM projects p
        INNER JOIN project_assignments pa ON p.id = pa.project_id
        WHERE pa.user_id = $1
        ORDER BY p.name
      `, [userId]);
    }
    
    // Cache the result for 5 minutes
    await cache.set(cacheKey, result.rows, 300);
    
    res.status(200).json(result.rows);
  } catch (error) {
    console.error('Error fetching projects for assignment:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

module.exports = {
  getUserProjects,
  getProjectById,
  createProject,
  updateProject,
  deleteProject,
  getAllProjectsForAssignment
};