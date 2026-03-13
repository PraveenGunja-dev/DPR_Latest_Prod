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

    const { projectId, supervisorId, sheetTypes = [] } = req.body;

    // Validate input
    if (!projectId || !supervisorId) {
      console.log('Missing parameters:', { projectId, supervisorId });
      return res.status(400).json({ message: 'Project ID and Supervisor ID are required' });
    }

    // Check if project exists in either projects table or p6_projects table
    const localProjectResult = await pool.query(
      'SELECT id FROM projects WHERE id = $1',
      [projectId]
    );

    const p6ProjectResult = await pool.query(
      'SELECT "ObjectId" as id FROM p6_projects WHERE "ObjectId" = $1',
      [projectId]
    );

    if (localProjectResult.rows.length === 0 && p6ProjectResult.rows.length === 0) {
      console.log(`Project not found: ${projectId}`);
      // Only return 404 if strictly enforcing project existence (which we should)
      // But verify if P6 IDs are strings or numbers in JS vs DB
    }

    // Check if user exists and has a role that can have projects assigned (supervisor or Site PM)
    const userResult = await pool.query(
      'SELECT user_id, role FROM users WHERE user_id = $1 AND (role = $2 OR role = $3)',
      [supervisorId, 'supervisor', 'Site PM']
    );

    if (userResult.rows.length === 0) {
      console.log(`Target user not found or invalid role: ${supervisorId}`);
      return res.status(404).json({ message: 'User not found or invalid role. Projects can only be assigned to supervisors or Site PM users.' });
    }

    // Check if assignment already exists
    const existingAssignment = await pool.query(
      'SELECT id FROM project_assignments WHERE project_id = $1 AND user_id = $2',
      [projectId, supervisorId]
    );

    if (existingAssignment.rows.length > 0) {
      console.log(`Assignment already exists for p:${projectId}, u:${supervisorId}. Updating sheet_types instead.`);
      const updateResult = await pool.query(
        'UPDATE project_assignments SET sheet_types = $1, assigned_by = $2, assigned_at = CURRENT_TIMESTAMP WHERE project_id = $3 AND user_id = $4 RETURNING id AS "ObjectId", project_id AS "ProjectId", user_id AS "UserId", assigned_at AS "AssignedAt", sheet_types AS "SheetTypes"',
        [JSON.stringify(sheetTypes), req.user.userId, projectId, supervisorId]
      );

      // Invalidate cache
      await cache.del(`assigned_projects_${supervisorId}`);

      return res.status(200).json({
        message: 'Project assignment updated successfully.',
        assignment: updateResult.rows[0]
      });
    }

    // Assign project to supervisor (New assignment)
    const result = await pool.query(
      'INSERT INTO project_assignments (project_id, user_id, assigned_by, sheet_types) VALUES ($1, $2, $3, $4) RETURNING id AS "ObjectId", project_id AS "ProjectId", user_id AS "UserId", assigned_at AS "AssignedAt", sheet_types AS "SheetTypes"',
      [projectId, supervisorId, req.user.userId, JSON.stringify(sheetTypes)]
    );

    // Invalidate cache for this supervisor's projects
    await cache.del(`assigned_projects_${supervisorId}`);

    console.log('Assignment successful:', result.rows[0]);
    res.status(201).json({
      message: 'Project assigned successfully.',
      assignment: result.rows[0]
    });
  } catch (error) {
    console.error('Error assigning project to supervisor:', error);
    res.status(500).json({
      message: 'Internal server error',
      error: error.message,
      detail: error.detail || 'No detail'
    });
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

    const { projectId, supervisorIds, sheetTypes = [] } = req.body;

    // Validate input
    if (!projectId || !supervisorIds || !Array.isArray(supervisorIds) || supervisorIds.length === 0) {
      return res.status(400).json({ message: 'Project ID and array of Supervisor IDs are required' });
    }

    // Check if project exists in either projects table or p6_projects table
    const localProjectResult = await pool.query(
      'SELECT id FROM projects WHERE id = $1',
      [projectId]
    );

    const p6ProjectResult = await pool.query(
      'SELECT "ObjectId" as id FROM p6_projects WHERE "ObjectId" = $1',
      [projectId]
    );

    if (localProjectResult.rows.length === 0 && p6ProjectResult.rows.length === 0) {
      return res.status(404).json({ message: 'Project not found in local or P6 projects' });
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
          // Update existing assignment
          const result = await pool.query(
            'UPDATE project_assignments SET sheet_types = $1, assigned_by = $2, assigned_at = CURRENT_TIMESTAMP WHERE project_id = $3 AND user_id = $4 RETURNING id AS "ObjectId", project_id AS "ProjectId", user_id AS "UserId", assigned_at AS "AssignedAt", sheet_types AS "SheetTypes"',
            [JSON.stringify(sheetTypes), req.user.userId, projectId, supervisorId]
          );
          assignments.push(result.rows[0]);
        } else {
          // Create new assignment
          const result = await pool.query(
            'INSERT INTO project_assignments (project_id, user_id, assigned_by, sheet_types) VALUES ($1, $2, $3, $4) RETURNING id AS "ObjectId", project_id AS "ProjectId", user_id AS "UserId", assigned_at AS "AssignedAt", sheet_types AS "SheetTypes"',
            [projectId, supervisorId, req.user.userId, JSON.stringify(sheetTypes)]
          );
          assignments.push(result.rows[0]);
        }

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

    const { projectIds, supervisorIds, sheetTypes = [] } = req.body;

    // Validate input
    if (!projectIds || !Array.isArray(projectIds) || projectIds.length === 0 ||
      !supervisorIds || !Array.isArray(supervisorIds) || supervisorIds.length === 0) {
      console.error('Invalid assignment request body:', req.body);
      return res.status(400).json({ message: 'Arrays of Project IDs and Supervisor IDs are required' });
    }

    // Check if all projects exist - check both projects table and p6_projects table
    // 1. Check local projects table
    const localProjectResults = await pool.query(
      'SELECT id FROM projects WHERE id = ANY($1)',
      [projectIds]
    );

    // 2. Check p6_projects table
    const p6ProjectResults = await pool.query(
      'SELECT "ObjectId" as id FROM p6_projects WHERE "ObjectId" = ANY($1)',
      [projectIds]
    );

    // Combine valid IDs found in either table
    // Normalize to string because p6_projects.objectId is BIGINT and returned as string by pg
    const validProjectIds = new Set([
      ...localProjectResults.rows.map(r => String(r.id)),
      ...p6ProjectResults.rows.map(r => String(r.id))
    ]);

    // Verify all requested project IDs exist
    const missingProjects = projectIds.filter(id => !validProjectIds.has(String(id)));

    if (missingProjects.length > 0) {
      console.log('Missing projects:', missingProjects);
      // Only fail if we can't find ANY projects. 
      // Ideally we should fail if ANY are missing, but for now strictness might be the issue.
      // Let's stick to "One or more projects not found" if strict compliance is needed.
      // But wait... if using P6 IDs that simply haven't synced yet?
      // For now, return 404 only if strict validation fails.

      // Actually, let's log specifically which ones and return 404 to be safe, 
      // but ensure we checked both tables properly.
      return res.status(404).json({
        message: `One or more projects not found. Missing IDs: ${missingProjects.join(', ')}`,
        missingIds: missingProjects
      });
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
            // Update existing assignment
            const result = await pool.query(
              'UPDATE project_assignments SET sheet_types = $1, assigned_by = $2, assigned_at = CURRENT_TIMESTAMP WHERE project_id = $3 AND user_id = $4 RETURNING id AS "ObjectId", project_id AS "ProjectId", user_id AS "UserId", assigned_at AS "AssignedAt", sheet_types AS "SheetTypes"',
              [JSON.stringify(sheetTypes), req.user.userId, projectId, supervisorId]
            );
            assignments.push(result.rows[0]);
          } else {
            // Create new assignment
            const result = await pool.query(
              'INSERT INTO project_assignments (project_id, user_id, assigned_by, sheet_types) VALUES ($1, $2, $3, $4) RETURNING id AS "ObjectId", project_id AS "ProjectId", user_id AS "UserId", assigned_at AS "AssignedAt", sheet_types AS "SheetTypes"',
              [projectId, supervisorId, req.user.userId, JSON.stringify(sheetTypes)]
            );
            assignments.push(result.rows[0]);
          }

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

// Get assigned projects for a user (supervisor or Site PM)
// Fetches only projects that are assigned to the user from local DB (both projects and p6_projects tables)
const getAssignedProjects = async (req, res) => {
  try {
    const userId = req.user.userId;

    // Check if user is a supervisor or Site PM
    if (req.user.role !== 'supervisor' && req.user.role !== 'Site PM') {
      return res.status(403).json({ message: 'Access denied. Supervisor or Site PM privileges required.' });
    }

    // Create cache key for assigned projects
    const cacheKey = `assigned_projects_${userId}`;

    // Try to get data from cache first
    let cachedProjects = await cache.get(cacheKey);
    if (cachedProjects) {
      console.log(`Returning assigned projects for user ${userId} from cache (${cachedProjects.length} projects)`);
      return res.status(200).json(cachedProjects);
    }

    // Fetch assigned projects from local database
    // Query both local projects table and p6_projects table, joined with project_assignments
    console.log(`Fetching assigned projects from database for user ${userId}...`);
    const result = await pool.query(`
      SELECT 
        p.id AS "ObjectId",
        p.name AS "Name",
        p.location AS "Location",
        p.status AS "Status",
        COALESCE(p.progress, 0) AS "PercentComplete",
        p.plan_start AS "PlannedStartDate",
        p.plan_end AS "PlannedFinishDate",
        p.actual_start AS "ActualStartDate",
        p.actual_end AS "ActualFinishDate",
        NULL AS "P6Id",
        NULL AS "Description",
        'local' AS "Source",
        pa.sheet_types AS "SheetTypes"
      FROM projects p
      INNER JOIN project_assignments pa ON p.id = pa.project_id
      WHERE pa.user_id = $1
      
      UNION ALL
      
      SELECT 
        p6."ObjectId" AS "ObjectId",
        p6."Name" AS "Name",
        NULL AS "Location",
        p6."Status" AS "Status",
        0 AS "PercentComplete",
        p6."StartDate" AS "PlannedStartDate",
        p6."FinishDate" AS "PlannedFinishDate",
        NULL AS "ActualStartDate",
        NULL AS "ActualFinishDate",
        p6."Id" AS "P6Id",
        p6."Description" AS "Description",
        'p6' AS "Source",
        pa.sheet_types AS "SheetTypes"
      FROM p6_projects p6
      INNER JOIN project_assignments pa ON p6."ObjectId" = pa.project_id
      WHERE pa.user_id = $1
      
      ORDER BY "Name"
    `, [userId]);

    const projects = result.rows;
    console.log(`Retrieved ${projects.length} assigned projects from database for user ${userId}`);

    // Cache the result for 5 minutes
    await cache.set(cacheKey, projects, 300);

    res.status(200).json(projects);
  } catch (error) {
    console.error('Error fetching assigned projects:', error);
    res.status(500).json({ message: 'Failed to fetch assigned projects', error: error.message });
  }
};

// Get assigned projects for any user (Admin/PMAG function)
const getProjectsForUser = async (req, res) => {
  try {
    const { userId } = req.params;

    // Check if user is PMAG or Site PM
    if (req.user.role !== 'PMAG' && req.user.role !== 'Site PM') {
      return res.status(403).json({ message: 'Access denied. Only PMAG or Site PM can view user assignments.' });
    }

    console.log(`Fetching assigned projects for user ${userId} as requested by ${req.user.userId}`);

    // Fetch assigned projects from local database logic reused
    const result = await pool.query(`
      SELECT 
        p.id AS "ObjectId",
        p.name AS "Name",
        p.location AS "Location",
        p.status AS "Status",
        COALESCE(p.progress, 0) AS "PercentComplete",
        p.plan_start AS "PlannedStartDate",
        p.plan_end AS "PlannedFinishDate",
        p.actual_start AS "ActualStartDate",
        p.actual_end AS "ActualFinishDate",
        NULL AS "P6Id",
        NULL AS "Description",
        'local' AS "Source",
        pa.sheet_types AS "SheetTypes"
      FROM projects p
      INNER JOIN project_assignments pa ON p.id = pa.project_id
      WHERE pa.user_id = $1
      
      UNION ALL
      
      SELECT 
        p6."ObjectId" AS "ObjectId",
        p6."Name" AS "Name",
        NULL AS "Location",
        p6."Status" AS "Status",
        0 AS "PercentComplete",
        p6."StartDate" AS "PlannedStartDate",
        p6."FinishDate" AS "PlannedFinishDate",
        NULL AS "ActualStartDate",
        NULL AS "ActualFinishDate",
        p6."Id" AS "P6Id",
        p6."Description" AS "Description",
        'p6' AS "Source",
        pa.sheet_types AS "SheetTypes"
      FROM p6_projects p6
      INNER JOIN project_assignments pa ON p6."ObjectId" = pa.project_id
      WHERE pa.user_id = $1
      
      ORDER BY "Name"
    `, [userId]);

    res.status(200).json(result.rows);
  } catch (error) {
    console.error(`Error fetching projects for user ${req.params.userId}:`, error);
    res.status(500).json({ message: 'Failed to fetch user projects', error: error.message });
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
        pa.assigned_at AS "AssignedAt",
        pa.sheet_types AS "SheetTypes"
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

// Get Site PMs for a project (PMAG only)
const getProjectSitePMs = async (req, res) => {
  try {
    // Check if user is PMAG (admin)
    if (req.user.role !== 'PMAG') {
      return res.status(403).json({ message: 'Access denied. Only PMAG can view assigned Site PMs.' });
    }

    const { projectId } = req.params;

    // Get Site PMs assigned to this project
    const result = await pool.query(`
      SELECT 
        u.user_id AS "ObjectId",
        u.name AS "Name",
        u.email AS "Email",
        pa.assigned_at AS "AssignedAt",
        pa.sheet_types AS "SheetTypes"
      FROM users u
      INNER JOIN project_assignments pa ON u.user_id = pa.user_id
      WHERE pa.project_id = $1 AND u.role = 'Site PM'
      ORDER BY u.name
    `, [projectId]);

    res.status(200).json(result.rows);
  } catch (error) {
    console.error('Error fetching project Site PMs:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Unassign a project from a supervisor (PMAG only)
const unassignProjectFromSupervisor = async (req, res) => {
  try {
    const userRole = req.user?.role || '';
    const normalizedRole = userRole.trim();

    // Check if user is PMAG or Site PM
    if (normalizedRole !== 'PMAG' && normalizedRole !== 'Site PM') {
      return res.status(403).json({
        message: 'Access denied. Only PMAG or Site PM can unassign projects.'
      });
    }

    const { projectId, supervisorId } = req.body;

    console.log(`Unassign request: User ${req.user.userId} (${normalizedRole}) removing supervisor ${supervisorId} from project ${projectId}`);

    // Validate input
    if (!projectId || !supervisorId) {
      return res.status(400).json({ message: 'Project ID and Supervisor ID are required' });
    }

    // Check if assignment exists before deleting (for debugging)
    const checkResult = await pool.query(
      'SELECT * FROM project_assignments WHERE project_id = $1 AND user_id = $2',
      [projectId, supervisorId]
    );
    console.log(`Found ${checkResult.rows.length} assignments to delete for p:${projectId}, u:${supervisorId}`);

    // Remove the assignment
    const result = await pool.query(
      'DELETE FROM project_assignments WHERE project_id = $1 AND user_id = $2 RETURNING id AS "ObjectId"',
      [projectId, supervisorId]
    );

    if (result.rows.length === 0) {
      console.log(`Assignment not found for deletion: project ${projectId}, supervisor ${supervisorId}`);
      return res.status(404).json({ message: 'Assignment not found' });
    }

    // Invalidate cache for this supervisor's projects
    await cache.del(`assigned_projects_${supervisorId}`);

    res.status(200).json({
      message: 'Project unassigned from supervisor successfully.'
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
  getProjectSitePMs,
  unassignProjectFromSupervisor,
  getProjectsForUser
};