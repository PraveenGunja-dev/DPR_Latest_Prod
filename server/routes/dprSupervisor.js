// server/routes/dprSupervisor.js
const express = require('express');
const router = express.Router();
const {
  getDraftEntry,
  saveDraftEntry,
  submitEntry,
  getEntriesForPMReview,
  approveEntryByPM,
  updateEntryByPM,
  rejectEntryByPM,
  getEntryById,
  getEntriesForPMAGReview,
  getEntriesHistoryForPMAG,
  getArchivedEntriesForPMAG,
  finalApproveByPMAG,
  rejectEntryByPMAG
} = require('../controllers/dprSupervisorController');

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
// Oracle P6 API equivalent endpoints for DPR Supervisor

// Supervisor routes
router.get('/draft', ensureAuth, getDraftEntry);  // Get or create draft entry
router.post('/save-draft', ensureAuth, saveDraftEntry);  // Save draft
router.post('/submit', ensureAuth, submitEntry);  // Submit to PM

// PM routes
router.get('/pm/entries', ensureAuth, getEntriesForPMReview);  // Get entries for PM review
router.post('/pm/approve', ensureAuth, approveEntryByPM);  // Approve entry
router.put('/pm/update', ensureAuth, updateEntryByPM);  // Update/edit entry
router.post('/pm/reject', ensureAuth, rejectEntryByPM);  // Reject entry

// PMAG routes
router.get('/pmag/entries', ensureAuth, getEntriesForPMAGReview);  // Get entries for PMAG review
router.get('/pmag/history', ensureAuth, getEntriesHistoryForPMAG);  // Get entries history
router.get('/pmag/archived', ensureAuth, getArchivedEntriesForPMAG);  // Get archived entries
router.post('/pmag/approve', ensureAuth, finalApproveByPMAG);  // Final approval
router.post('/pmag/reject', ensureAuth, rejectEntryByPMAG);  // Reject back to PM

// Common routes
router.get('/entry/:entryId', ensureAuth, getEntryById);  // Get specific entry

module.exports = { router, setPool };