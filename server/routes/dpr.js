// server/routes/dpr.js
const express = require('express');
const router = express.Router();
const {
  getDraftSheet,
  saveDraftSheet,
  submitSheet,
  getSheetsForPMReview,
  updateSheetByPM,
  approveSheetByPM,
  rejectSheetByPM,
  getSheetsForPMAGReview,
  finalApprovalByPMAG,
  rejectByPMAG,
  getSheetComments,
  getSheetById
} = require('../controllers/dprController');

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
// Oracle P6 API equivalent endpoints for DPR

// Supervisor routes
router.get('/draft', ensureAuth, getDraftSheet);  // Get or create draft sheet
router.post('/save-draft', ensureAuth, saveDraftSheet);  // Save draft
router.post('/submit', ensureAuth, submitSheet);  // Submit to PM

// PM routes
router.get('/pm/sheets', ensureAuth, getSheetsForPMReview);  // Get sheets for PM review
router.put('/pm/update', ensureAuth, updateSheetByPM);  // Update sheet data
router.post('/pm/approve', ensureAuth, approveSheetByPM);  // Approve and send to PMAG
router.post('/pm/reject', ensureAuth, rejectSheetByPM);  // Reject and send back to supervisor

// PMAG routes
router.get('/pmag/sheets', ensureAuth, getSheetsForPMAGReview);  // Get sheets for PMAG review
router.post('/pmag/approve', ensureAuth, finalApprovalByPMAG);  // Final approval
router.post('/pmag/reject', ensureAuth, rejectByPMAG);  // Reject and send back to PM

// Common routes
router.get('/sheet/:sheetId', ensureAuth, getSheetById);  // Get specific sheet
router.get('/sheet/:sheetId/comments', ensureAuth, getSheetComments);  // Get comments

module.exports = { router, setPool };