// server/controllers/dprController.js
const pool = require('../db');

// Helper function to get today and yesterday dates
const getTodayAndYesterday = () => {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  
  return {
    today: today.toISOString().split('T')[0],
    yesterday: yesterday.toISOString().split('T')[0]
  };
};

// Get or create draft sheet for supervisor
const getDraftSheet = async (req, res) => {
  try {
    const userId = req.user.userId;
    const userRole = req.user.role;
    const { projectId, sheetType } = req.query;

    if (!projectId || !sheetType) {
      return res.status(400).json({ message: 'Project ID and sheet type are required' });
    }

    // Only supervisors can get/create drafts
    if (userRole !== 'supervisor') {
      return res.status(403).json({ message: 'Only supervisors can create draft sheets' });
    }

    const { today, yesterday } = getTodayAndYesterday();

    // Check if draft already exists for today
    let result = await pool.query(
      `SELECT * FROM dpr_sheets 
       WHERE supervisor_id = $1 
       AND project_id = $2 
       AND sheet_type = $3 
       AND today_date = $4
       AND status = 'draft'`,
      [userId, projectId, sheetType, today]
    );

    if (result.rows.length > 0) {
      return res.status(200).json(result.rows[0]);
    }

    // Create new draft
    const emptySheetData = { rows: [] };
    result = await pool.query(
      `INSERT INTO dpr_sheets 
       (project_id, supervisor_id, sheet_type, submission_date, yesterday_date, today_date, sheet_data, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'draft')
       RETURNING *`,
      [projectId, userId, sheetType, today, yesterday, today, JSON.stringify(emptySheetData)]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error getting draft sheet:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Save draft sheet data
const saveDraftSheet = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { sheetId, sheetData } = req.body;

    // Verify ownership
    const checkResult = await pool.query(
      'SELECT * FROM dpr_sheets WHERE id = $1 AND supervisor_id = $2 AND status = $3',
      [sheetId, userId, 'draft']
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ message: 'Draft sheet not found or access denied' });
    }

    // Update sheet data
    const result = await pool.query(
      `UPDATE dpr_sheets 
       SET sheet_data = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [JSON.stringify(sheetData), sheetId]
    );

    res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error('Error saving draft sheet:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Submit sheet (Supervisor → PM)
const submitSheet = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { sheetId } = req.body;

    // Verify ownership and status
    const checkResult = await pool.query(
      'SELECT * FROM dpr_sheets WHERE id = $1 AND supervisor_id = $2 AND status = $3',
      [sheetId, userId, 'draft']
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ message: 'Draft sheet not found or already submitted' });
    }

    // Update status to submitted and lock
    const result = await pool.query(
      `UPDATE dpr_sheets 
       SET status = 'submitted', is_locked = true, submitted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [sheetId]
    );

    // Add history record
    await pool.query(
      `INSERT INTO dpr_sheet_history (sheet_id, action, performed_by, old_status, new_status)
       VALUES ($1, 'submitted', $2, 'draft', 'submitted')`,
      [sheetId, userId]
    );

    // Log sheet submission
    const { createSystemLog } = require('../utils/systemLogger');
    const sheet = result.rows[0];
    await createSystemLog(
      'SHEET_SUBMITTED',
      userId,
      `Sheet: ${sheetId}, Project: ${sheet.project_id}`,
      `Sheet ${sheetId} submitted by supervisor`
    );

    res.status(200).json({ message: 'Sheet submitted successfully', sheet: result.rows[0] });
  } catch (error) {
    console.error('Error submitting sheet:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Get sheets for PM review
const getSheetsForPMReview = async (req, res) => {
  try {
    const userRole = req.user.role;
    const { projectId } = req.query;

    if (userRole !== 'Site PM') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const query = projectId
      ? `SELECT ds.*, u.name as supervisor_name, u.email as supervisor_email
         FROM dpr_sheets ds
         JOIN users u ON ds.supervisor_id = u.user_id
         WHERE ds.project_id = $1 AND ds.status IN ('submitted', 'pm_review')
         ORDER BY ds.submitted_at DESC`
      : `SELECT ds.*, u.name as supervisor_name, u.email as supervisor_email
         FROM dpr_sheets ds
         JOIN users u ON ds.supervisor_id = u.user_id
         WHERE ds.status IN ('submitted', 'pm_review')
         ORDER BY ds.submitted_at DESC`;

    const result = projectId
      ? await pool.query(query, [projectId])
      : await pool.query(query);

    res.status(200).json(result.rows);
  } catch (error) {
    console.error('Error getting sheets for PM review:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Update sheet by PM
const updateSheetByPM = async (req, res) => {
  try {
    const userId = req.user.userId;
    const userRole = req.user.role;
    const { sheetId, sheetData } = req.body;

    if (userRole !== 'Site PM') {
      return res.status(403).json({ message: 'Only PM can edit sheets' });
    }

    // Check if sheet is in correct status
    const checkResult = await pool.query(
      'SELECT * FROM dpr_sheets WHERE id = $1 AND status IN ($2, $3)',
      [sheetId, 'submitted', 'pm_review']
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ message: 'Sheet not found or not available for editing' });
    }

    // Update sheet data and status
    const result = await pool.query(
      `UPDATE dpr_sheets 
       SET sheet_data = $1, status = 'pm_review', updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [JSON.stringify(sheetData), sheetId]
    );

    res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error('Error updating sheet by PM:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Approve sheet by PM (PM → PMAG)
const approveSheetByPM = async (req, res) => {
  try {
    const userId = req.user.userId;
    const userRole = req.user.role;
    const { sheetId, comment } = req.body;

    if (userRole !== 'Site PM') {
      return res.status(403).json({ message: 'Only PM can approve sheets' });
    }

    // Update status to pm_approved
    const result = await pool.query(
      `UPDATE dpr_sheets 
       SET status = 'pm_approved', pm_reviewed_by = $1, pm_reviewed_at = CURRENT_TIMESTAMP, 
           is_locked = true, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND status IN ('submitted', 'pm_review')
       RETURNING *`,
      [userId, sheetId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Sheet not found or invalid status' });
    }

    // Add comment if provided
    if (comment) {
      await pool.query(
        `INSERT INTO dpr_comments (sheet_id, user_id, user_role, comment_text)
         VALUES ($1, $2, $3, $4)`,
        [sheetId, userId, 'Site PM', comment]
      );
    }

    // Add history
    await pool.query(
      `INSERT INTO dpr_sheet_history (sheet_id, action, performed_by, old_status, new_status, comments)
       VALUES ($1, 'pm_approved', $2, 'pm_review', 'pm_approved', $3)`,
      [sheetId, userId, comment]
    );

    res.status(200).json({ message: 'Sheet approved and sent to PMAG', sheet: result.rows[0] });
  } catch (error) {
    console.error('Error approving sheet by PM:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Reject sheet by PM (back to Supervisor)
const rejectSheetByPM = async (req, res) => {
  try {
    const userId = req.user.userId;
    const userRole = req.user.role;
    const { sheetId, comment } = req.body;

    if (userRole !== 'Site PM') {
      return res.status(403).json({ message: 'Only PM can reject sheets' });
    }

    if (!comment) {
      return res.status(400).json({ message: 'Comment is required for rejection' });
    }

    // Update status to pm_rejected and unlock
    const result = await pool.query(
      `UPDATE dpr_sheets 
       SET status = 'pm_rejected', pm_reviewed_by = $1, pm_reviewed_at = CURRENT_TIMESTAMP, 
           is_locked = false, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND status IN ('submitted', 'pm_review')
       RETURNING *`,
      [userId, sheetId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Sheet not found or invalid status' });
    }

    // Add rejection comment
    await pool.query(
      `INSERT INTO dpr_comments (sheet_id, user_id, user_role, comment_text)
       VALUES ($1, $2, $3, $4)`,
      [sheetId, userId, 'Site PM', `REJECTED: ${comment}`]
    );

    // Add history
    await pool.query(
      `INSERT INTO dpr_sheet_history (sheet_id, action, performed_by, old_status, new_status, comments)
       VALUES ($1, 'pm_rejected', $2, 'pm_review', 'pm_rejected', $3)`,
      [sheetId, userId, comment]
    );

    // Log sheet rejection
    const { createSystemLog } = require('../utils/systemLogger');
    const sheet = result.rows[0];
    await createSystemLog(
      'SHEET_REJECTED',
      userId,
      `Sheet: ${sheetId}, Project: ${sheet.project_id}`,
      `Sheet ${sheetId} rejected by PM. Reason: ${comment}`
    );

    res.status(200).json({ message: 'Sheet rejected and sent back to Supervisor', sheet: result.rows[0] });
  } catch (error) {
    console.error('Error rejecting sheet by PM:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Get sheets for PMAG review
const getSheetsForPMAGReview = async (req, res) => {
  try {
    const userRole = req.user.role;
    const { projectId } = req.query;

    if (userRole !== 'PMAG') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const query = projectId
      ? `SELECT ds.*, u.name as supervisor_name, pm.name as pm_name
         FROM dpr_sheets ds
         JOIN users u ON ds.supervisor_id = u.user_id
         LEFT JOIN users pm ON ds.pm_reviewed_by = pm.user_id
         WHERE ds.project_id = $1 AND ds.status IN ('pm_approved', 'pmag_review')
         ORDER BY ds.pm_reviewed_at DESC`
      : `SELECT ds.*, u.name as supervisor_name, pm.name as pm_name
         FROM dpr_sheets ds
         JOIN users u ON ds.supervisor_id = u.user_id
         LEFT JOIN users pm ON ds.pm_reviewed_by = pm.user_id
         WHERE ds.status IN ('pm_approved', 'pmag_review')
         ORDER BY ds.pm_reviewed_at DESC`;

    const result = projectId
      ? await pool.query(query, [projectId])
      : await pool.query(query);

    res.status(200).json(result.rows);
  } catch (error) {
    console.error('Error getting sheets for PMAG review:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Final approval by PMAG
const finalApprovalByPMAG = async (req, res) => {
  try {
    const userId = req.user.userId;
    const userRole = req.user.role;
    const { sheetId, comment } = req.body;

    if (userRole !== 'PMAG') {
      return res.status(403).json({ message: 'Only PMAG can give final approval' });
    }

    // Update status to final
    const result = await pool.query(
      `UPDATE dpr_sheets 
       SET status = 'final', pmag_reviewed_by = $1, pmag_reviewed_at = CURRENT_TIMESTAMP, 
           is_locked = true, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND status IN ('pm_approved', 'pmag_review')
       RETURNING *`,
      [userId, sheetId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Sheet not found or invalid status' });
    }

    // Add comment if provided
    if (comment) {
      await pool.query(
        `INSERT INTO dpr_comments (sheet_id, user_id, user_role, comment_text)
         VALUES ($1, $2, $3, $4)`,
        [sheetId, userId, 'PMAG', comment]
      );
    }

    // Add history
    await pool.query(
      `INSERT INTO dpr_sheet_history (sheet_id, action, performed_by, old_status, new_status, comments)
       VALUES ($1, 'final_approved', $2, 'pm_approved', 'final', $3)`,
      [sheetId, userId, comment]
    );

    res.status(200).json({ message: 'Sheet finally approved and stored', sheet: result.rows[0] });
  } catch (error) {
    console.error('Error final approval by PMAG:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Reject by PMAG (back to PM)
const rejectByPMAG = async (req, res) => {
  try {
    const userId = req.user.userId;
    const userRole = req.user.role;
    const { sheetId, comment } = req.body;

    if (userRole !== 'PMAG') {
      return res.status(403).json({ message: 'Only PMAG can reject sheets' });
    }

    if (!comment) {
      return res.status(400).json({ message: 'Comment is required for rejection' });
    }

    // Update status back to pm_review and unlock for PM
    const result = await pool.query(
      `UPDATE dpr_sheets 
       SET status = 'pmag_rejected', pmag_reviewed_by = $1, pmag_reviewed_at = CURRENT_TIMESTAMP, 
           is_locked = false, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND status IN ('pm_approved', 'pmag_review')
       RETURNING *`,
      [userId, sheetId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Sheet not found or invalid status' });
    }

    // Add rejection comment
    await pool.query(
      `INSERT INTO dpr_comments (sheet_id, user_id, user_role, comment_text)
       VALUES ($1, $2, $3, $4)`,
      [sheetId, userId, 'PMAG', `REJECTED BY PMAG: ${comment}`]
    );

    // Add history
    await pool.query(
      `INSERT INTO dpr_sheet_history (sheet_id, action, performed_by, old_status, new_status, comments)
       VALUES ($1, 'pmag_rejected', $2, 'pmag_review', 'pmag_rejected', $3)`,
      [sheetId, userId, comment]
    );

    // Log sheet rejection
    const { createSystemLog } = require('../utils/systemLogger');
    const sheet = result.rows[0];
    await createSystemLog(
      'SHEET_REJECTED',
      userId,
      `Sheet: ${sheetId}, Project: ${sheet.project_id}`,
      `Sheet ${sheetId} rejected by PMAG. Reason: ${comment}`
    );

    res.status(200).json({ message: 'Sheet rejected and sent back to PM', sheet: result.rows[0] });
  } catch (error) {
    console.error('Error rejecting by PMAG:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Get sheet comments
const getSheetComments = async (req, res) => {
  try {
    const { sheetId } = req.params;

    const result = await pool.query(
      `SELECT dc.*, u.name as user_name
       FROM dpr_comments dc
       JOIN users u ON dc.user_id = u.user_id
       WHERE dc.sheet_id = $1
       ORDER BY dc.created_at DESC`,
      [sheetId]
    );

    res.status(200).json(result.rows);
  } catch (error) {
    console.error('Error getting comments:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Get sheet by ID
const getSheetById = async (req, res) => {
  try {
    const { sheetId } = req.params;
    const userId = req.user.userId;
    const userRole = req.user.role;

    const result = await pool.query(
      `SELECT ds.*, u.name as supervisor_name, pm.name as pm_name, pmag.name as pmag_name
       FROM dpr_sheets ds
       JOIN users u ON ds.supervisor_id = u.user_id
       LEFT JOIN users pm ON ds.pm_reviewed_by = pm.user_id
       LEFT JOIN users pmag ON ds.pmag_reviewed_by = pmag.user_id
       WHERE ds.id = $1`,
      [sheetId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Sheet not found' });
    }

    const sheet = result.rows[0];

    // Check access permissions
    if (userRole === 'supervisor' && sheet.supervisor_id !== userId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.status(200).json(sheet);
  } catch (error) {
    console.error('Error getting sheet by ID:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

module.exports = {
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
};
