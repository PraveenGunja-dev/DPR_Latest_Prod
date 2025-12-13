// server/controllers/projectAssignmentController.js
const pool = require('../db');
const { cache } = require('../cache/redisClient');

// Assign a project to a supervisor
const assignProjectToSupervisor = async (req, res) => {
  try {
    // Normalize role for comparison (handle case variations)
    const userRole = req.user?.role || '';
    const normalizedRole = userRole.trim();
    
    // Debug logging
    console.log('Assign project request:', {
      userId: req.user?.userId,
      role: userRole,
      normalizedRole: normalizedRole,
      projectId: req.body?.projectId,
      supervisorId: req.body?.supervisorId
    });
    
    // Check if user is PMAG (admin) or Site PM
    if (normalizedRole !== 'PMAG' && normalizedRole !== 'Site PM') {
      return res.status(403).json({ message: 'Access denied. PMAG or Site PM privileges required.' });
    }
    
    const { projectId, supervisorId } = req.body;
    
    // Validate input
    if (!projectId || !supervisorId) {
      return res.status(400).json({ message: 'Project ID and Supervisor ID are required' });
    }
    
    // Check if project exists
    const projectResult = await pool.query(
      'SELECT id FROM projects WHERE id = $1',
      [projectId]
    );
    
    if (projectResult.rows.length === 0) {
      return res.status(404).json({ message: 'Project not found' });
    }
    
    // Check if user exists and has a role that can have projects assigned (supervisor or Site PM)
    const userResult = await pool.query(
      'SELECT user_id, role FROM users WHERE user_id = $1 AND (role = $2 OR role = $3)',
      [supervisorId, 'supervisor', 'Site PM']
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: 'User not found or invalid role. Projects can only be assigned to supervisors or Site PM users.' });
    }
    
    const targetUser = userResult.rows[0];
    
    // Check if assignment already exists
    const existingAssignment = await pool.query(
      'SELECT id FROM project_assignments WHERE project_id = $1 AND user_id = $2',
      [projectId, supervisorId]
    );
    
    if (existingAssignment.rows.length > 0) {
      return res.status(400).json({ 
        message: 'Project is already assigned to this supervisor and cannot be reassigned. Projects can only be assigned at user creation time.' 
      });
    }
    
    // PMAG users can assign any project without restriction
    // Site PM users can assign projects to supervisors (they can see all projects in the assignment dropdown)
    // Note: Site PM can only VIEW projects that are assigned to them, but can ASSIGN any project to supervisors
    if (normalizedRole === 'PMAG' || normalizedRole === 'Site PM') {
      console.log(`${normalizedRole} ${req.user.userId} assigning project ${projectId} to user ${supervisorId}`);
      // No additional access check needed - both PMAG and Site PM can assign any project to supervisors
    }
    
    // Assign project to supervisor
    const result = await pool.query(
      'INSERT INTO project_assignments (project_id, user_id, assigned_by) VALUES ($1, $2, $3) RETURNING id AS "ObjectId", project_id AS "ProjectId", user_id AS "UserId", assigned_at AS "AssignedAt"',
      [projectId, supervisorId, req.user.userId]
    );
    
    // Invalidate cache for this supervisor's projects
    await cache.del(`assigned_projects_${supervisorId}`);
    
    res.status(201).json({ 
      message: 'Project assigned successfully. Note: This project cannot be reassigned.',
      assignment: result.rows[0]
    });
  } catch (error) {
    console.error('Error assigning project to supervisor:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Assign a project to multiple supervisors
const assignProjectToMultipleSupervisors = async (req, res) => {
  try {
    // Normalize role for comparison (handle case variations)
    const userRole = req.user?.role || '';
    const normalizedRole = userRole.trim();
    
    // Debug logging
    console.log('Assign project to multiple supervisors request:', {
      userId: req.user?.userId,
      role: userRole,
      normalizedRole: normalizedRole,
      projectIds: req.body?.projectIds,
      supervisorIds: req.body?.supervisorIds
    });
    
    // Check if user is PMAG (admin) or Site PM
    if (normalizedRole !== 'PMAG' && normalizedRole !== 'Site PM') {
      return res.status(403).json({ message: 'Access denied. PMAG or Site PM privileges required.' });
    }
    
    const { projectId, supervisorIds } = req.body;
    
    // Validate input
    if (!projectId || !supervisorIds || !Array.isArray(supervisorIds) || supervisorIds.length === 0) {
      return res.status(400).json({ message: 'Project ID and array of Supervisor IDs are required' });
    }
    
    // Check if project exists
    const projectResult = await pool.query(
      'SELECT id FROM projects WHERE id = $1',
      [projectId]
    );
    
    if (projectResult.rows.length === 0) {
      return res.status(404).json({ message: 'Project not found' });
    }
    
    // Track successful assignments and errors
    const assignments = [];
    const errors = [];
    
    // Process each supervisor assignment
    for (const supervisorId of supervisorIds) {
      try {
        // Check if user exists and has a role that can have projects assigned (supervisor or Site PM)
        const userResult = await pool.query(
          'SELECT user_id, role FROM users WHERE user_id = $1 AND (role = $2 OR role = $3)',
          [supervisorId, 'supervisor', 'Site PM']
        );
        
        if (userResult.rows.length === 0) {
          errors.push({ supervisorId, message: 'User not found or invalid role' });
          continue;
        }
        
        // Check if assignment already exists
        const existingAssignment = await pool.query(
          'SELECT id FROM project_assignments WHERE project_id = $1 AND user_id = $2',
          [projectId, supervisorId]
        );
        
        if (existingAssignment.rows.length > 0) {
          errors.push({ supervisorId, message: 'Project is already assigned to this supervisor' });
          continue;
        }
        
        // Assign project to supervisor
        const result = await pool.query(
          'INSERT INTO project_assignments (project_id, user_id, assigned_by) VALUES ($1, $2, $3) RETURNING id AS "ObjectId", project_id AS "ProjectId", user_id AS "UserId", assigned_at AS "AssignedAt"',
          [projectId, supervisorId, req.user.userId]
        );
        
        assignments.push(result.rows[0]);
        
        // Invalidate cache for this supervisor's projects
        await cache.del(`assigned_projects_${supervisorId}`);
      } catch (error) {
        console.error(`Error assigning project to supervisor ${supervisorId}:`, error);
        errors.push({ supervisorId, message: 'Internal server error' });
      }
    }
    
    // Prepare response
    const response = {
      message: `Successfully assigned project to ${assignments.length} user(s).`,
      assignments,
      errors
    };
    
    // Return appropriate status code based on results
    if (assignments.length > 0 && errors.length === 0) {
      res.status(201).json(response);
    } else if (assignments.length > 0 && errors.length > 0) {
      res.status(207).json(response); // Multi-status
    } else {
      res.status(400).json({ 
        message: 'No assignments were successful',
        errors
      });
    }
  } catch (error) {
    console.error('Error assigning project to multiple supervisors:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Assign multiple projects to multiple supervisors
const assignProjectsToMultipleSupervisors = async (req, res) => {
  try {
    // Normalize role for comparison (handle case variations)
    const userRole = req.user?.role || '';
    const normalizedRole = userRole.trim();
    
    // Debug logging
    console.log('Assign multiple projects to multiple supervisors request:', {
      userId: req.user?.userId,
      role: userRole,
      normalizedRole: normalizedRole,
      projectIds: req.body?.projectIds,
      supervisorIds: req.body?.supervisorIds
    });
    
    // Check if user is PMAG (admin) or Site PM
    if (normalizedRole !== 'PMAG' && normalizedRole !== 'Site PM') {
      return res.status(403).json({ message: 'Access denied. PMAG or Site PM privileges required.' });
    }
    
    const { projectIds, supervisorIds } = req.body;
    
    // Validate input
    if (!projectIds || !Array.isArray(projectIds) || projectIds.length === 0 || 
        !supervisorIds || !Array.isArray(supervisorIds) || supervisorIds.length === 0) {
      return res.status(400).json({ message: 'Arrays of Project IDs and Supervisor IDs are required' });
    }
    
    // Check if all projects exist
    const projectResults = await pool.query(
      'SELECT id FROM projects WHERE id = ANY($1)',
      [projectIds]
    );
    
    if (projectResults.rows.length !== projectIds.length) {
      return res.status(404).json({ message: 'One or more projects not found' });
    }
    
    // Track successful assignments and errors
    const assignments = [];
    const errors = [];
    
    // Process each project and supervisor combination
    for (const projectId of projectIds) {
      for (const supervisorId of supervisorIds) {
        try {
          // Check if user exists and has a role that can have projects assigned (supervisor or Site PM)
          const userResult = await pool.query(
            'SELECT user_id, role FROM users WHERE user_id = $1 AND (role = $2 OR role = $3)',
            [supervisorId, 'supervisor', 'Site PM']
          );
          
          if (userResult.rows.length === 0) {
            errors.push({ projectId, supervisorId, message: 'User not found or invalid role' });
            continue;
          }
          
          // Check if assignment already exists
          const existingAssignment = await pool.query(
            'SELECT id FROM project_assignments WHERE project_id = $1 AND user_id = $2',
            [projectId, supervisorId]
          );
          
          if (existingAssignment.rows.length > 0) {
            errors.push({ projectId, supervisorId, message: 'Project is already assigned to this supervisor' });
            continue;
          }
          
          // Assign project to supervisor
          const result = await pool.query(
            'INSERT INTO project_assignments (project_id, user_id, assigned_by) VALUES ($1, $2, $3) RETURNING id AS "ObjectId", project_id AS "ProjectId", user_id AS "UserId", assigned_at AS "AssignedAt"',
            [projectId, supervisorId, req.user.userId]
          );
          
          assignments.push(result.rows[0]);
          
          // Invalidate cache for this supervisor's projects
          await cache.del(`assigned_projects_${supervisorId}`);
        } catch (error) {
          console.error(`Error assigning project ${projectId} to supervisor ${supervisorId}:`, error);
          errors.push({ projectId, supervisorId, message: 'Internal server error' });
        }
      }
    }
    
    // Prepare response
    const response = {
      message: `Successfully assigned ${assignments.length} project(s) to ${supervisorIds.length} user(s).`,
      assignments,
      errors
    };
    
    // Return appropriate status code based on results
    if (assignments.length > 0 && errors.length === 0) {
      res.status(201).json(response);
    } else if (assignments.length > 0 && errors.length > 0) {
      res.status(207).json(response); // Multi-status
    } else {
      res.status(400).json({ 
        message: 'No assignments were successful',
        errors
      });
    }
  } catch (error) {
    console.error('Error assigning multiple projects to multiple supervisors:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Get assigned projects for a user (supervisor or Site PM) with caching
const getAssignedProjects = async (req, res) => {
  try {
    const userId = req.user.userId;
    
    // Check if user is a supervisor or Site PM (both can have assigned projects)
    if (req.user.role !== 'supervisor' && req.user.role !== 'Site PM') {
      return res.status(403).json({ message: 'Access denied. Supervisor or Site PM privileges required.' });
    }
    
    // Create cache key for assigned projects
    const cacheKey = `assigned_projects_${userId}`;
    
    // Try to get data from cache first
    let cachedProjects = await cache.get(cacheKey);
    if (cachedProjects) {
      console.log(`Returning assigned projects for user ${userId} from cache`);
      return res.status(200).json(cachedProjects);
    }
    
    // Get projects assigned to this user
    const result = await pool.query(`
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
    
    // Cache the result for 5 minutes
    await cache.set(cacheKey, result.rows, 300);
    
    res.status(200).json(result.rows);
  } catch (error) {
    console.error('Error fetching assigned projects:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Get supervisors for a project (PMAG and Site PM only)
const getProjectSupervisors = async (req, res) => {
  try {
    // Check if user is PMAG (admin) or Site PM
    if (req.user.role !== 'PMAG' && req.user.role !== 'Site PM') {
      return res.status(403).json({ message: 'Access denied. PMAG or Site PM privileges required.' });
    }
    
    const { projectId } = req.params;
    
    // Create cache key for project supervisors
    const cacheKey = `project_supervisors_${projectId}`;
    
    // Try to get data from cache first
    let cachedSupervisors = await cache.get(cacheKey);
    if (cachedSupervisors) {
      console.log(`Returning supervisors for project ${projectId} from cache`);
      return res.status(200).json(cachedSupervisors);
    }
    
    // Get supervisors assigned to this project
    const result = await pool.query(`
      SELECT 
        u.user_id AS "ObjectId",
        u.name AS "Name",
        u.email AS "Email",
        pa.assigned_at AS "AssignedAt"
      FROM users u
      INNER JOIN project_assignments pa ON u.user_id = pa.user_id
      WHERE pa.project_id = $1 AND u.role = 'supervisor'
      ORDER BY u.name
    `, [projectId]);
    
    // Cache the result for 5 minutes
    await cache.set(cacheKey, result.rows, 300);
    
    res.status(200).json(result.rows);
  } catch (error) {
    console.error('Error fetching project supervisors:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Unassign a project from a supervisor (PMAG only)
const unassignProjectFromSupervisor = async (req, res) => {
  try {
    // Check if user is PMAG (admin) - only PMAG can unassign projects
    if (req.user.role !== 'PMAG') {
      return res.status(403).json({ 
        message: 'Access denied. Only PMAG can unassign projects. Projects can only be reassigned by creating a new user.' 
      });
    }
    
    const { projectId, supervisorId } = req.body;
    
    // Validate input
    if (!projectId || !supervisorId) {
      return res.status(400).json({ message: 'Project ID and Supervisor ID are required' });
    }
    
    // Remove the assignment
    const result = await pool.query(
      'DELETE FROM project_assignments WHERE project_id = $1 AND user_id = $2 RETURNING id AS "ObjectId"',
      [projectId, supervisorId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Assignment not found' });
    }
    
    // Invalidate cache for this supervisor's projects
    await cache.del(`assigned_projects_${supervisorId}`);
    
    res.status(200).json({ 
      message: 'Project unassigned from supervisor successfully. Note: Projects can only be reassigned by creating a new user.'
    });
  } catch (error) {
    console.error('Error unassigning project from supervisor:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

module.exports = {
  assignProjectToSupervisor,
  assignProjectToMultipleSupervisors,
  assignProjectsToMultipleSupervisors,
  getAssignedProjects,
  getProjectSupervisors,
  unassignProjectFromSupervisor
};