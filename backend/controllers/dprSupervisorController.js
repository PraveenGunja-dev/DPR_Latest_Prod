// server/controllers/dprSupervisorController.js
const pool = require('../db');
const { cache } = require('../cache/redisClient');
const { createSystemLog } = require('../utils/systemLogger');

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

// Helper function to synchronize daily values to standard DB format
const syncDailyValues = async (entryRow) => {
  try {
    const { id, project_id, supervisor_id, sheet_type, entry_date, data_json } = entryRow;
    if (!data_json || !data_json.rows || !Array.isArray(data_json.rows)) return;

    // First clear existing daily values for this specific entry to re-insert fresh ones
    await pool.query('DELETE FROM dpr_daily_values WHERE entry_id = $1', [id]);

    for (const row of data_json.rows) {
      // Determine the best identifier and value columns depending on the sheet type
      let activityId = row.activityId || row.rfiNo || row.slNo || null;
      let todayValue = row.todayValue || row.actual || null;
      let yesterdayValue = row.yesterdayValue || row.totalQuantity || null;
      let remarks = row.remarks || null;

      // Clean/parse numbers safely
      todayValue = todayValue ? parseFloat(todayValue) : null;
      yesterdayValue = yesterdayValue ? parseFloat(yesterdayValue) : null;
      if (isNaN(todayValue)) todayValue = null;
      if (isNaN(yesterdayValue)) yesterdayValue = null;

      // Ensure we don't insert completely blank tracking rows 
      if (!activityId) continue;

      await pool.query(
        `INSERT INTO dpr_daily_values 
        (entry_id, project_id, supervisor_id, sheet_type, activity_id, reporting_date, today_value, yesterday_value, remarks, full_row_data) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [id, project_id, supervisor_id, sheet_type, entry_date, activityId, todayValue, yesterdayValue, remarks, JSON.stringify(row)]
      );
    }
    console.log(`Synced daily values to standard tables for entry ${id}`);
  } catch (error) {
    console.error('Error syncing daily values:', error);
  }
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

    // Verify supervisor has access to this specific sheet
    const assignmentCheck = await pool.query(
      `SELECT sheet_types FROM project_assignments WHERE user_id = $1 AND project_id = $2`,
      [userId, projectId]
    );

    if (assignmentCheck.rows.length === 0) {
      return res.status(403).json({ message: 'Access denied to this project' });
    }

    // Support legacy empty array as full access OR strictly enforce sheet array
    const permittedSheets = assignmentCheck.rows[0].sheet_types || [];
    if (permittedSheets.length > 0 && !permittedSheets.includes(sheetType)) {
      return res.status(403).json({ message: `Access denied. You do not have permission for the sheet: ${sheetType}` });
    }

    let targetDate = req.query.date;
    let today, yesterday, result;

    if (targetDate) {
      // Validate date is within last 7 days
      const requestObj = new Date(targetDate);
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      requestObj.setHours(0, 0, 0, 0);
      const diffTime = Math.abs(now.getTime() - requestObj.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays > 7) {
        return res.status(400).json({ message: 'Can only access dates within the last 7 days.' });
      }
      today = targetDate;
      const yesterdayObj = new Date(requestObj);
      yesterdayObj.setDate(yesterdayObj.getDate() - 1);
      yesterday = yesterdayObj.toLocaleDateString('en-CA');
    } else {
      const dates = getTodayAndYesterday();
      today = dates.today;
      yesterday = dates.yesterday;
    }

    // First, check if there's a rejected entry for this sheet type that should be shown to the supervisor
    if (!targetDate || targetDate === getTodayAndYesterday().today) {
      result = await pool.query(
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
          rejectionMessage: 'This entry was rejected by PM. Please review and resubmit.',
          rejectionReason: result.rows[0].rejection_reason || null
        };
        return res.status(200).json(rejectedEntry);
      }
    }

    // Check if draft already exists for the target date
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
      const entry = result.rows[0];
      const actualToday = getTodayAndYesterday().today;
      const dbDateMatch = entry.entry_date ? new Date(entry.entry_date).toISOString().split('T')[0] : null;

      if (dbDateMatch && dbDateMatch < actualToday) {
        entry.isPastEdit = true;
        entry.readOnlyMessage = 'This is an edit for a past date. A reason is required upon submission.';
      }
      return res.status(200).json(entry);
    }

    // Check if there's a submitted/approved entry for the date
    result = await pool.query(
      `SELECT * FROM dpr_supervisor_entries 
       WHERE supervisor_id = $1 
       AND project_id = $2 
       AND sheet_type = $3 
       AND entry_date = $4
       AND status IN ('submitted_to_pm', 'approved_by_pm', 'final_approved')`,
      [userId, projectId, sheetType, today]
    );

    if (result.rows.length > 0) {
      const entry = result.rows[0];
      // If submitted but not approved
      if (entry.status === 'submitted_to_pm') {
        const submittedEntry = {
          ...entry,
          isReadOnly: true,
          readOnlyMessage: 'This entry has been submitted and cannot be edited.'
        };
        return res.status(200).json(submittedEntry);
      } else {
        // If approved_by_pm or final_approved AND requested a specific past date
        // Allow editing! It's an approved entry but they want to edit past data
        const approvedEntry = {
          ...entry,
          isPastEdit: true,
          readOnlyMessage: 'This is an approved past entry. Any edits require a reason and will revert to Pending Review.'
        };
        return res.status(200).json(approvedEntry);
      }
    }

    // Create new draft with appropriate structure based on sheet type
    let emptyData = { rows: [] };

    // Initialize with appropriate column structure based on sheet type
    switch (sheetType) {
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
    ); const newEntry = result.rows[0];
    const actualToday = getTodayAndYesterday().today;
    const dbDateMatch = newEntry.entry_date ? new Date(newEntry.entry_date).toISOString().split('T')[0] : null;

    if (dbDateMatch && dbDateMatch < actualToday) {
      newEntry.isPastEdit = true;
      newEntry.readOnlyMessage = 'This is an edit for a past date. A reason is required upon submission.';
    }

    res.status(201).json(newEntry);
  } catch (error) {
    console.error('Error getting draft entry:', error.message);
    console.error('Error details:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};

// Save draft entry data
const saveDraftEntry = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { entryId, data } = req.body;

    // Verify ownership
    // Allow saving of draft, rejected, and approved entries (for past edits)
    const checkResult = await pool.query(
      'SELECT * FROM dpr_supervisor_entries WHERE id = $1 AND supervisor_id = $2 AND status IN ($3, $4, $5, $6)',
      [entryId, userId, 'draft', 'rejected_by_pm', 'approved_by_pm', 'final_approved']
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ message: 'Entry not found, access denied, or invalid status for saving' });
    }

    // Update entry data
    const result = await pool.query(
      `UPDATE dpr_supervisor_entries 
       SET data_json = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [JSON.stringify(data), entryId]
    );

    // Sync to standard normalized table for reporting/BI immediately upon save
    // REMOVED: Syncing only happens when PMAG pushes to P6
    // if (result.rows.length > 0) {
    //   await syncDailyValues(result.rows[0]);
    // }

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
    const { entryId, editReason } = req.body;

    console.log(`Supervisor ${userId} attempting to submit entry ${entryId}`);

    // Verify ownership and status
    // Allow submission of draft, rejected, and approved (past edit) entries
    const checkResult = await pool.query(
      'SELECT * FROM dpr_supervisor_entries WHERE id = $1 AND supervisor_id = $2 AND status IN ($3, $4, $5, $6)',
      [entryId, userId, 'draft', 'rejected_by_pm', 'approved_by_pm', 'final_approved']
    );

    if (checkResult.rows.length === 0) {
      console.log(`Entry ${entryId} not found or already submitted`);
      return res.status(404).json({ message: 'Entry not found, access denied, or invalid status for submission' });
    }

    const currentEntry = checkResult.rows[0];

    const actualToday = getTodayAndYesterday().today;
    const dbDateMatch = currentEntry.entry_date ? new Date(currentEntry.entry_date).toISOString().split('T')[0] : null;

    const isApprovedPastEdit = currentEntry.status === 'approved_by_pm' || currentEntry.status === 'final_approved';
    const isPastDateDraft = dbDateMatch && dbDateMatch < actualToday;
    const isPastEdit = isApprovedPastEdit || isPastDateDraft;

    // Update status to submitted_to_pm and record who submitted. Add a suffix if it's a past edit.
    let reasonText = editReason || null;
    if (isPastEdit && editReason) {
      reasonText = `PAST EDIT REASON: ${editReason}`;
    }

    const result = await pool.query(
      `UPDATE dpr_supervisor_entries 
       SET status = 'submitted_to_pm', submitted_at = CURRENT_TIMESTAMP, submitted_by = $2, updated_at = CURRENT_TIMESTAMP, rejection_reason = COALESCE($3, rejection_reason)
       WHERE id = $1
       RETURNING *`,
      [entryId, userId, reasonText]
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

    // Update status to approved_by_pm and record who approved
    const result = await pool.query(
      `UPDATE dpr_supervisor_entries 
       SET status = 'approved_by_pm', pm_reviewed_at = CURRENT_TIMESTAMP, pm_reviewed_by = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND status = 'submitted_to_pm'
       RETURNING *`,
      [entryId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Entry not found or invalid status' });
    }

    // Sync to standard table for reports (track when approved by PM)
    await syncDailyValues(result.rows[0]);

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

    // Sync changes to standard table for reports
    await syncDailyValues(result.rows[0]);

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
    const { entryId, rejectionReason } = req.body;

    if (userRole !== 'Site PM') {
      return res.status(403).json({ message: 'Only PM can reject entries' });
    }

    // Validate that at least one cell rejection comment exists
    // First check if cell_comments table exists
    let tableExists = true;
    try {
      const tableCheck = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = 'cell_comments'
        ) as exists
      `);
      tableExists = tableCheck.rows[0].exists;
    } catch (err) {
      console.log('Could not check for cell_comments table:', err.message);
      tableExists = false;
    }

    if (tableExists) {
      const commentsCheck = await pool.query(
        `SELECT COUNT(*) as count FROM cell_comments 
         WHERE sheet_id = $1 AND comment_type = 'REJECTION' AND is_deleted = FALSE`,
        [entryId]
      );

      if (parseInt(commentsCheck.rows[0].count) === 0) {
        return res.status(400).json({
          message: 'Please add rejection comments on specific cells before rejecting the sheet',
          requiresComments: true
        });
      }
    }

    // Update status to rejected_by_pm and store rejection reason with audit trail
    const result = await pool.query(
      `UPDATE dpr_supervisor_entries 
       SET status = 'rejected_by_pm', rejection_reason = $2, pm_reviewed_at = CURRENT_TIMESTAMP, pm_reviewed_by = $3, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND status = 'submitted_to_pm'
       RETURNING *`,
      [entryId, rejectionReason || null, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Entry not found or invalid status' });
    }

    // Invalidate cache for PM entries since we've made a change
    await cache.flushAll();

    // Log entry rejection
    const entry = result.rows[0];
    await createSystemLog(
      'SHEET_REJECTED',
      userId,
      `Entry: ${entryId}, Project: ${entry.project_id}, Type: ${entry.sheet_type}`,
      `Entry ${entryId} (${entry.sheet_type}) rejected by PM. Reason: ${rejectionReason || 'No reason provided'}`
    );

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

// Get history of entries for PMAG (only approved_by_pm entries) with date filtering
const getEntriesHistoryForPMAG = async (req, res) => {
  try {
    const userRole = req.user.role;
    const { projectId, days } = req.query;

    if (userRole !== 'PMAG') {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Calculate the date threshold if days parameter is provided
    let dateCondition = '';
    let queryParams = [];
    let paramIndex = 1;

    if (projectId) {
      queryParams.push(projectId);
      paramIndex = 2;
    }

    if (days) {
      const daysAgo = new Date();
      daysAgo.setDate(daysAgo.getDate() - parseInt(days));
      dateCondition = ` AND dse.updated_at >= $${paramIndex}`;
      queryParams.push(daysAgo);
    }

    // Only show entries that have been approved by PM (approved_by_pm or final_approved status)
    const query = projectId
      ? `SELECT dse.*, u.name as supervisor_name, u.email as supervisor_email
         FROM dpr_supervisor_entries dse
         JOIN users u ON dse.supervisor_id = u.user_id
         WHERE dse.project_id = $1 AND dse.status IN ('approved_by_pm', 'final_approved')${dateCondition}
         ORDER BY dse.updated_at DESC`
      : `SELECT dse.*, u.name as supervisor_name, u.email as supervisor_email
         FROM dpr_supervisor_entries dse
         JOIN users u ON dse.supervisor_id = u.user_id
         WHERE dse.status IN ('approved_by_pm', 'final_approved')${dateCondition}
         ORDER BY dse.updated_at DESC`;

    const result = await pool.query(query, queryParams);

    res.status(200).json(result.rows);
  } catch (error) {
    console.error('Error getting entries history for PMAG:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Get archived entries (final approved entries older than 2 days)
const getArchivedEntriesForPMAG = async (req, res) => {
  try {
    const userRole = req.user.role;
    const { projectId } = req.query;

    if (userRole !== 'PMAG') {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Calculate the date 2 days ago
    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

    const query = projectId
      ? `SELECT dse.*, u.name as supervisor_name, u.email as supervisor_email
         FROM dpr_supervisor_entries dse
         JOIN users u ON dse.supervisor_id = u.user_id
         WHERE dse.project_id = $1 
         AND dse.status = 'final_approved'
         AND dse.updated_at < $2
         ORDER BY dse.updated_at DESC`
      : `SELECT dse.*, u.name as supervisor_name, u.email as supervisor_email
         FROM dpr_supervisor_entries dse
         JOIN users u ON dse.supervisor_id = u.user_id
         WHERE dse.status = 'final_approved'
         AND dse.updated_at < $1
         ORDER BY dse.updated_at DESC`;

    const result = projectId
      ? await pool.query(query, [projectId, twoDaysAgo])
      : await pool.query(query, [twoDaysAgo]);

    res.status(200).json(result.rows);
  } catch (error) {
    console.error('Error getting archived entries for PMAG:', error);
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

    // Update status to final approved (pushed) and record who pushed it
    const result = await pool.query(
      `UPDATE dpr_supervisor_entries 
       SET status = 'final_approved', pushed_at = CURRENT_TIMESTAMP, pushed_by = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND status = 'approved_by_pm'
       RETURNING *`,
      [entryId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Entry not found or invalid status' });
    }

    // Sync to standard table for reports (track when pushed/final approved)
    await syncDailyValues(result.rows[0]);

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
    const { entryId, rejectionReason } = req.body;

    if (userRole !== 'PMAG') {
      return res.status(403).json({ message: 'Only PMAG can reject entries' });
    }

    // Update status back to submitted_to_pm and store rejection reason
    const result = await pool.query(
      `UPDATE dpr_supervisor_entries 
       SET status = 'submitted_to_pm', rejection_reason = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND status = 'approved_by_pm'
       RETURNING *`,
      [entryId, rejectionReason || null]
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
  getEntriesHistoryForPMAG,
  getArchivedEntriesForPMAG,
  finalApproveByPMAG,
  rejectEntryByPMAG,
  syncDailyValues
};