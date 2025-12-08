// server/routes/projects.js
const express = require('express');
const router = express.Router();
const { 
  getUserProjects, 
  getProjectById, 
  createProject, 
  updateProject,
  deleteProject,
  getAllProjectsForAssignment
} = require('../controllers/projectsController');

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

// All routes require authentication
// Oracle P6 API equivalent endpoints
router.get('/all-for-assignment', ensureAuth, getAllProjectsForAssignment);  // Get all projects for assignment dropdown (PMAG and Site PM only)
router.get('/', ensureAuth, getUserProjects);  // Equivalent to GET /project
router.get('/:id', ensureAuth, getProjectById);  // Equivalent to GET /project/{id}
router.post('/', ensureAuth, createProject);  // Equivalent to POST /project
router.put('/:id', ensureAuth, updateProject);  // Equivalent to PUT /project/{id}
router.delete('/:id', ensureAuth, deleteProject);  // Equivalent to DELETE /project/{id}

module.exports = { router, setPool };