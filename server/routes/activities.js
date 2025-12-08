// server/routes/activities.js
// Oracle P6 API equivalent routes for activity management
const express = require('express');
const router = express.Router();
const { 
  getActivities,
  getActivityById,
  createActivity,
  updateActivity,
  deleteActivity
} = require('../controllers/activitiesController');

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
// Oracle P6 API equivalent endpoints for activities
router.get('/', ensureAuth, getActivities);              // Equivalent to GET /activity
router.get('/:id', ensureAuth, getActivityById);        // Equivalent to GET /activity/{id}
router.post('/', ensureAuth, createActivity);           // Equivalent to POST /activity
router.put('/:id', ensureAuth, updateActivity);         // Equivalent to PUT /activity/{id}
router.delete('/:id', ensureAuth, deleteActivity);      // Equivalent to DELETE /activity/{id}

// Additional Oracle P6 API endpoints for activities
router.get('/fields', ensureAuth, (req, res) => {
  // Equivalent to GET /activity/fields - returns available activity fields
  res.status(200).json({
    message: 'Activity fields - Oracle P6 API equivalent',
    fields: [
      'ObjectId',
      'Name',
      'ProjectId',
      'PlannedStartDate',
      'PlannedFinishDate',
      'ActualStartDate',
      'ActualFinishDate',
      'PercentComplete',
      'Status',
      'WBSId'
    ]
  });
});

module.exports = { router, setPool };