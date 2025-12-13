// server/routes/projectAssignment.js
const express = require('express');
const router = express.Router();
const { 
  assignProjectToSupervisor,
  assignProjectToMultipleSupervisors,
  assignProjectsToMultipleSupervisors,
  getAssignedProjects,
  getProjectSupervisors,
  unassignProjectFromSupervisor
} = require('../controllers/projectAssignmentController');

// We'll pass the authenticateToken middleware from server.js when registering the routes
let authenticateToken;

// Function to set the middleware (called from server.js)
const setPool = (dbPool, authMiddleware) => {
  authenticateToken = authMiddleware;
};

// Helper function to ensure authenticateToken is available
const ensureAuth = (req, res, next) => {
  if (typeof authenticateToken === 'function') {
    return authenticateToken(req, res, next);
  }
  // If authenticateToken is not set yet, deny access
  return res.status(401).json({ message: 'Authentication middleware not initialized' });
};

// Oracle P6 API equivalent endpoints for project assignments
// In Oracle P6, this would typically be handled through resource assignments or project team management

// Assign a project to a supervisor (Oracle P6 equivalent might be adding a team member)
router.post('/assign', ensureAuth, assignProjectToSupervisor);

// Assign a project to multiple supervisors
router.post('/assign-multiple', ensureAuth, assignProjectToMultipleSupervisors);

// Assign multiple projects to multiple supervisors
router.post('/assign-projects-multiple', ensureAuth, assignProjectsToMultipleSupervisors);

// Unassign a project from a supervisor (Oracle P6 equivalent might be removing a team member)
router.post('/unassign', ensureAuth, unassignProjectFromSupervisor);

// Get supervisors for a project (Oracle P6 equivalent might be getting project team members)
router.get('/project/:projectId/supervisors', ensureAuth, getProjectSupervisors);

// Get assigned projects for a supervisor (Oracle P6 equivalent might be getting projects for a resource)
router.get('/assigned', ensureAuth, getAssignedProjects);

// Additional Oracle P6 equivalent endpoints that could be implemented
router.get('/resources', ensureAuth, (req, res) => {
  // Placeholder for getting project resources
  res.status(200).json([]);
});

router.post('/resources', ensureAuth, (req, res) => {
  // Placeholder for assigning resources to projects
  res.status(201).json({ message: 'Resource assignment not implemented yet' });
});

module.exports = { router, setPool };