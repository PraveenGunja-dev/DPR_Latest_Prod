// server/controllers/dprSupervisorController.js
const pool = require('../db');
const { cache } = require('../cache/redisClient');

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

// Get or create draft entry for supervisor
const getDraftEntry = async (req, res) => {
  try {
    const userId = req.user.userId;
    const userRole = req.user.role;
    const { projectId, sheetType } = req.query;

    if (!projectId || !sheetType) {
      return res.status(400).json({ message: 'Project ID and sheet type are required' });
    }

    // Only supervisors can get/create drafts
    if (userRole !== 'supervisor') {
      return res.status(403).json({ message: 'Only supervisors can create draft entries' });
    }

    const { today, yesterday } = getTodayAndYesterday();

    // First, check if there's a rejected entry for this sheet type that should be shown to the supervisor
    let result = await pool.query(
      `SELECT * FROM dpr_supervisor_entries 
       WHERE supervisor_id = $1 
       AND project_id = $2 
       AND sheet_type = $3 
       AND status = 'rejected_by_pm'
       ORDER BY updated_at DESC
       LIMIT 1`,
      [userId, projectId, sheetType]
    );

    if (result.rows.length > 0) {
      // Return the rejected entry with a special flag so the frontend knows it's rejected
      const rejectedEntry = {
        ...result.rows[0],
        isRejected: true,
        rejectionMessage: 'This entry was rejected by PM. Please review and resubmit.'
      };
      return res.status(200).json(rejectedEntry);
    }

    // Check if draft already exists for today
    result = await pool.query(
      `SELECT * FROM dpr_supervisor_entries 
       WHERE supervisor_id = $1 
       AND project_id = $2 
       AND sheet_type = $3 
       AND entry_date = $4
       AND status = 'draft'`,
      [userId, projectId, sheetType, today]
    );

    if (result.rows.length > 0) {
      return res.status(200).json(result.rows[0]);
    }

    // Check if there's a submitted entry for today (supervisor can view but not edit)
    result = await pool.query(
      `SELECT * FROM dpr_supervisor_entries 
       WHERE supervisor_id = $1 
       AND project_id = $2 
       AND sheet_type = $3 
       AND entry_date = $4
       AND status IN ('submitted_to_pm', 'approved_by_pm')`,
      [userId, projectId, sheetType, today]
    );

    if (result.rows.length > 0) {
      // Return submitted entry with read-only flag
      const submittedEntry = {
        ...result.rows[0],
        isReadOnly: true,
        readOnlyMessage: 'This entry has been submitted and cannot be edited.'
      };
      return res.status(200).json(submittedEntry);
    }

    // Create new draft with appropriate structure based on sheet type
    let emptyData = { rows: [] };
    
    // Initialize with appropriate column structure based on sheet type
    switch(sheetType) {
      case 'dp_qty':
        emptyData = {
          staticHeader: {
            projectInfo: 'PLOT - A-06 135 MW - KHAVDA HYBRID SOLAR PHASE 3 (YEAR 2025-26)',
            reportingDate: today,
            progressDate: yesterday
          },
          rows: [
            {
              slNo: '',
              description: '',
              totalQuantity: '',
              uom: '',
              basePlanStart: '',
              basePlanFinish: '',
              forecastStart: '',
              forecastFinish: '',
              blockCapacity: '',
              phase: '',
              block: '',
              spvNumber: '',
              actualStart: '',
              actualFinish: '',
              remarks: '',
              priority: '',
              balance: '',
              cumulative: ''
            }
          ]
        };
        break;
      case 'dp_vendor_block':
        emptyData = {
          rows: [
            {
              activityId: '',
              activities: '',
              plot: '',
              newBlockNom: '',
              priority: '',
              baselinePriority: '',
              contractorName: '',
              scope: '',
              holdDueToWtg: '',
              front: '',
              actual: '',
              completionPercentage: '',
              remarks: '',
              yesterdayValue: '',
              todayValue: ''
            }
          ]
        };
        break;
      case 'manpower_details':
        emptyData = {
          totalManpower: 0,
          rows: [
            {
              activityId: '',
              slNo: '',
              block: '',
              contractorName: '',
              activity: '',
              section: '',
              yesterdayValue: '',
              todayValue: ''
            }
          ]
        };
        break;
      case 'dp_block':
        emptyData = {
          rows: [
            {
              slNo: '',
              description: '',
              totalQuantity: '',
              uom: '',
              basePlanStart: '',
              basePlanFinish: '',
              forecastStart: '',
              forecastFinish: '',
              blockCapacity: '',
              phase: '',
              block: '',
              spvNumber: '',
              actualStart: '',
              actualFinish: '',
              remarks: '',
              priority: '',
              balance: '',
              cumulative: ''
            }
          ]
        };
        break;
      case 'dp_vendor_idt':
        emptyData = {
          rows: [
            {
              activityId: '',
              activities: '',
              plot: '',
              vendor: '',
              idtDate: '',
              actualDate: '',
              status: '',
              yesterdayValue: '',
              todayValue: ''
            }
          ]
        };
        break;
      case 'mms_module_rfi':
        emptyData = {
          rows: [
            {
              rfiNo: '',
              subject: '',
              module: '',
              submittedDate: '',
              responseDate: '',
              status: '',
              remarks: '',
              yesterdayValue: '',
              todayValue: ''
            }
          ]
        };
        break;
      default:
        // Default structure
        emptyData = { rows: [{}] };
    }
    
    result = await pool.query(
      `INSERT INTO dpr_supervisor_entries 
       (supervisor_id, project_id, sheet_type, entry_date, previous_date, data_json, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'draft')
       RETURNING *`,
      [userId, projectId, sheetType, today, yesterday, JSON.stringify(emptyData)]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error getting draft entry:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Save draft entry data
const saveDraftEntry = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { entryId, data } = req.body;

    // Verify ownership
    const checkResult = await pool.query(
      'SELECT * FROM dpr_supervisor_entries WHERE id = $1 AND supervisor_id = $2 AND status = $3',
      [entryId, userId, 'draft']
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ message: 'Draft entry not found or access denied' });
    }

    // Update entry data
    const result = await pool.query(
      `UPDATE dpr_supervisor_entries 
       SET data_json = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [JSON.stringify(data), entryId]
    );

    res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error('Error saving draft entry:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Submit entry (Supervisor → PM)
const submitEntry = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { entryId } = req.body;

    console.log(`Supervisor ${userId} attempting to submit entry ${entryId}`);

    // Verify ownership and status
    const checkResult = await pool.query(
      'SELECT * FROM dpr_supervisor_entries WHERE id = $1 AND supervisor_id = $2 AND status = $3',
      [entryId, userId, 'draft']
    );

    if (checkResult.rows.length === 0) {
      console.log(`Entry ${entryId} not found or already submitted`);
      return res.status(404).json({ message: 'Draft entry not found or already submitted' });
    }

    // Update status to submitted_to_pm
    const result = await pool.query(
      `UPDATE dpr_supervisor_entries 
       SET status = 'submitted_to_pm', submitted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [entryId]
    );

    console.log(`Entry ${entryId} submitted successfully. Status: ${result.rows[0].status}`);
    res.status(200).json({ message: 'Entry submitted successfully', entry: result.rows[0] });
  } catch (error) {
    console.error('Error submitting entry:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Get entries for PM review with caching
const getEntriesForPMReview = async (req, res) => {
  try {
    const userRole = req.user.role;
    const { projectId } = req.query;

    if (userRole !== 'Site PM') {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Create cache key based on user role and project ID
    const cacheKey = `pm_entries_${userRole}_${projectId || 'all'}`;
    
    // Try to get data from cache first
    let cachedEntries = await cache.get(cacheKey);
    if (cachedEntries) {
      console.log(`PM review: Returning ${cachedEntries.length} entries from cache for project ${projectId || 'all'}`);
      return res.status(200).json(cachedEntries);
    }

    // Include submitted, approved, and rejected entries for PM to see complete history
    // If projectId is provided and valid, filter by it; otherwise show all
    const isValidProjectId = projectId && projectId !== 'null' && projectId !== 'undefined' && !isNaN(parseInt(projectId));
    
    const query = isValidProjectId
      ? `SELECT dse.*, u.name as supervisor_name, u.email as supervisor_email
         FROM dpr_supervisor_entries dse
         JOIN users u ON dse.supervisor_id = u.user_id
         WHERE dse.project_id = $1 AND dse.status IN ('submitted_to_pm', 'approved_by_pm', 'rejected_by_pm')
         ORDER BY dse.submitted_at DESC`
      : `SELECT dse.*, u.name as supervisor_name, u.email as supervisor_email
         FROM dpr_supervisor_entries dse
         JOIN users u ON dse.supervisor_id = u.user_id
         WHERE dse.status IN ('submitted_to_pm', 'approved_by_pm', 'rejected_by_pm')
         ORDER BY dse.submitted_at DESC`;

    const result = isValidProjectId
      ? await pool.query(query, [parseInt(projectId)])
      : await pool.query(query);

    console.log(`PM review: Found ${result.rows.length} entries for project ${isValidProjectId ? projectId : 'all'} (Role: ${userRole})`);
    if (result.rows.length > 0) {
      console.log('Sample entry:', result.rows[0]);
    }
    
    // Cache the result for 2 minutes
    await cache.set(cacheKey, result.rows, 120);
    
    res.status(200).json(result.rows);
  } catch (error) {
    console.error('Error getting entries for PM review:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Approve entry by PM
const approveEntryByPM = async (req, res) => {
  try {
    const userId = req.user.userId;
    const userRole = req.user.role;
    const { entryId } = req.body;

    if (userRole !== 'Site PM') {
      return res.status(403).json({ message: 'Only PM can approve entries' });
    }

    // Update status to approved_by_pm
    const result = await pool.query(
      `UPDATE dpr_supervisor_entries 
       SET status = 'approved_by_pm', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND status = 'submitted_to_pm'
       RETURNING *`,
      [entryId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Entry not found or invalid status' });
    }
    
    // Invalidate cache for PM entries since we've made a change
    await cache.flushAll();

    res.status(200).json({ message: 'Entry approved successfully', entry: result.rows[0] });
  } catch (error) {
    console.error('Error approving entry by PM:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Update entry by PM (edit submitted entry)
const updateEntryByPM = async (req, res) => {
  try {
    const userId = req.user.userId;
    const userRole = req.user.role;
    const { entryId, data } = req.body;

    if (userRole !== 'Site PM') {
      return res.status(403).json({ message: 'Only Site PM can update entries' });
    }

    if (!entryId || !data) {
      return res.status(400).json({ message: 'Entry ID and data are required' });
    }

    // Check if entry exists and is in a state that can be edited by PM
    const checkResult = await pool.query(
      'SELECT * FROM dpr_supervisor_entries WHERE id = $1 AND status IN ($2, $3)',
      [entryId, 'submitted_to_pm', 'rejected_by_pm']
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ message: 'Entry not found or cannot be edited' });
    }

    // Update the entry data
    const result = await pool.query(
      `UPDATE dpr_supervisor_entries 
       SET data_json = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [JSON.stringify(data), entryId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Entry not found' });
    }
    
    // Invalidate cache for PM entries since we've made a change
    await cache.flushAll();

    res.status(200).json({ message: 'Entry updated successfully', entry: result.rows[0] });
  } catch (error) {
    console.error('Error updating entry by PM:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Reject entry by PM (back to Supervisor)
const rejectEntryByPM = async (req, res) => {
  try {
    const userId = req.user.userId;
    const userRole = req.user.role;
    const { entryId } = req.body;

    if (userRole !== 'Site PM') {
      return res.status(403).json({ message: 'Only PM can reject entries' });
    }

    // Update status to rejected_by_pm
    const result = await pool.query(
      `UPDATE dpr_supervisor_entries 
       SET status = 'rejected_by_pm', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND status = 'submitted_to_pm'
       RETURNING *`,
      [entryId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Entry not found or invalid status' });
    }
    
    // Invalidate cache for PM entries since we've made a change
    await cache.flushAll();

    res.status(200).json({ message: 'Entry rejected and sent back to Supervisor', entry: result.rows[0] });
  } catch (error) {
    console.error('Error rejecting entry by PM:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Get entry by ID
const getEntryById = async (req, res) => {
  try {
    const { entryId } = req.params;
    const userId = req.user.userId;
    const userRole = req.user.role;

    const result = await pool.query(
      `SELECT dse.*, u.name as supervisor_name
       FROM dpr_supervisor_entries dse
       JOIN users u ON dse.supervisor_id = u.user_id
       WHERE dse.id = $1`,
      [entryId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Entry not found' });
    }

    const entry = result.rows[0];

    // Check access permissions
    if (userRole === 'supervisor' && entry.supervisor_id !== userId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.status(200).json(entry);
  } catch (error) {
    console.error('Error getting entry by ID:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Get entries approved by PM for PMAG review
const getEntriesForPMAGReview = async (req, res) => {
  try {
    const userRole = req.user.role;
    const { projectId } = req.query;

    if (userRole !== 'PMAG') {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Create cache key for PMAG entries
    const cacheKey = `pmag_entries_${userRole}_${projectId || 'all'}`;
    
    // Try to get data from cache first
    let cachedEntries = await cache.get(cacheKey);
    if (cachedEntries) {
      console.log(`PMAG review: Returning ${cachedEntries.length} entries from cache for project ${projectId || 'all'}`);
      return res.status(200).json(cachedEntries);
    }

    const query = projectId
      ? `SELECT dse.*, u.name as supervisor_name, u.email as supervisor_email
         FROM dpr_supervisor_entries dse
         JOIN users u ON dse.supervisor_id = u.user_id
         WHERE dse.project_id = $1 AND dse.status = 'approved_by_pm'
         ORDER BY dse.updated_at DESC`
      : `SELECT dse.*, u.name as supervisor_name, u.email as supervisor_email
         FROM dpr_supervisor_entries dse
         JOIN users u ON dse.supervisor_id = u.user_id
         WHERE dse.status = 'approved_by_pm'
         ORDER BY dse.updated_at DESC`;

    const result = projectId
      ? await pool.query(query, [projectId])
      : await pool.query(query);
      
    // Cache the result for 2 minutes
    await cache.set(cacheKey, result.rows, 120);

    res.status(200).json(result.rows);
  } catch (error) {
    console.error('Error getting entries for PMAG review:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Final approve entry by PMAG
const finalApproveByPMAG = async (req, res) => {
  try {
    const userId = req.user.userId;
    const userRole = req.user.role;
    const { entryId } = req.body;

    if (userRole !== 'PMAG') {
      return res.status(403).json({ message: 'Only PMAG can give final approval' });
    }

    // Update status to final approved
    const result = await pool.query(
      `UPDATE dpr_supervisor_entries 
       SET status = 'final_approved', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND status = 'approved_by_pm'
       RETURNING *`,
      [entryId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Entry not found or invalid status' });
    }
    
    // Invalidate cache for PMAG entries since we've made a change
    await cache.flushAll();

    res.status(200).json({ message: 'Entry given final approval successfully', entry: result.rows[0] });
  } catch (error) {
    console.error('Error giving final approval by PMAG:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Reject entry by PMAG (back to PM)
const rejectEntryByPMAG = async (req, res) => {
  try {
    const userId = req.user.userId;
    const userRole = req.user.role;
    const { entryId } = req.body;

    if (userRole !== 'PMAG') {
      return res.status(403).json({ message: 'Only PMAG can reject entries' });
    }

    // Update status back to submitted_to_pm
    const result = await pool.query(
      `UPDATE dpr_supervisor_entries 
       SET status = 'submitted_to_pm', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND status = 'approved_by_pm'
       RETURNING *`,
      [entryId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Entry not found or invalid status' });
    }
    
    // Invalidate cache for PMAG entries since we've made a change
    await cache.flushAll();

    res.status(200).json({ message: 'Entry rejected and sent back to PM', entry: result.rows[0] });
  } catch (error) {
    console.error('Error rejecting entry by PMAG:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

module.exports = {
  getDraftEntry,
  saveDraftEntry,
  submitEntry,
  getEntriesForPMReview,
  approveEntryByPM,
  updateEntryByPM,
  rejectEntryByPM,
  getEntryById,
  getEntriesForPMAGReview,
  finalApproveByPMAG,
  rejectEntryByPMAG
};