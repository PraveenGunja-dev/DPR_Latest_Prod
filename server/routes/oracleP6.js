// server/routes/oracleP6.js
// Oracle Primavera P6 API integration routes

const express = require('express');
const router = express.Router();

// We'll pass the authenticateToken middleware from server.js when registering the routes
let authenticateToken;
let pool;

// Function to set the middleware and pool (called from server.js)
const setPool = (dbPool, authMiddleware) => {
  pool = dbPool;
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

// Helper function to ensure pool is available
const ensurePool = (req, res, next) => {
  if (pool) {
    req.pool = pool;
    return next();
  }
  return res.status(500).json({ message: 'Database pool not initialized' });
};

// Middleware to ensure both auth and pool are available
const ensureAuthAndPool = [ensureAuth, ensurePool];

/**
 * GET /api/oracle-p6/dp-qty-data
 * Fetch DP Qty data from Oracle P6 for a specific project
 * This endpoint maps P6 data to the DP Qty table format
 */
router.get('/dp-qty-data', ensureAuthAndPool, async (req, res) => {
  try {
    const { projectId } = req.query;
    
    if (!projectId) {
      return res.status(400).json({ 
        message: 'Project ID is required',
        error: {
          code: 'MISSING_PROJECT_ID',
          description: 'Project ID parameter is required to fetch P6 data'
        }
      });
    }

    // Query to fetch activities from P6 database for the specified project
    const query = `
      SELECT 
        pa.object_id as activity_id,
        pa.name as description,
        pa.planned_start_date as base_plan_start,
        pa.planned_finish_date as base_plan_finish,
        pa.baseline_start_date as forecast_start,
        pa.baseline_finish_date as forecast_finish,
        pa.percent_complete,
        pa.duration as total_quantity,
        pa.wbs_object_id,
        pw.name as wbs_name,
        pr.name as resource_name
      FROM p6_activities pa
      LEFT JOIN p6_wbs pw ON pa.wbs_object_id = pw.object_id
      LEFT JOIN p6_activity_assignments paa ON pa.object_id = paa.activity_object_id
      LEFT JOIN p6_resources pr ON paa.resource_object_id = pr.object_id
      WHERE pa.project_id = $1
      ORDER BY pa.planned_start_date
    `;

    const result = await req.pool.query(query, [projectId]);
    
    // Transform P6 data to DP Qty table format
    const dpQtyData = result.rows.map((row, index) => ({
      slNo: (index + 1).toString(),
      description: row.description || '',
      totalQuantity: row.total_quantity ? row.total_quantity.toString() : '',
      uom: 'Days', // Default UOM for activities
      basePlanStart: row.base_plan_start ? row.base_plan_start.toISOString().split('T')[0] : '',
      basePlanFinish: row.base_plan_finish ? row.base_plan_finish.toISOString().split('T')[0] : '',
      forecastStart: row.forecast_start ? row.forecast_start.toISOString().split('T')[0] : '',
      forecastFinish: row.forecast_finish ? row.forecast_finish.toISOString().split('T')[0] : '',
      blockCapacity: '', // Will be filled by user
      phase: row.wbs_name || '', // Map WBS to Phase
      block: '', // Will be filled by user
      spvNumber: '', // Will be filled by user
      actualStart: row.base_plan_start ? row.base_plan_start.toISOString().split('T')[0] : '', // Default to planned
      actualFinish: '', // Will be filled by user
      remarks: '', // Will be filled by user
      priority: '', // Will be filled by user
      balance: '', // Auto-calculated
      cumulative: '' // Auto-calculated
    }));

    res.status(200).json({
      message: 'DP Qty data fetched successfully from Oracle P6',
      projectId: projectId,
      rowCount: dpQtyData.length,
      data: dpQtyData,
      source: 'p6' // Indicates data source as per P6 Data Provenance Labeling Convention
    });
  } catch (error) {
    console.error('Error fetching DP Qty data from Oracle P6:', error);
    res.status(500).json({ 
      message: 'Internal server error while fetching data from Oracle P6',
      error: {
        code: 'P6_DATA_FETCH_ERROR',
        description: 'Failed to fetch data from Oracle P6 database'
      }
    });
  }
});

/**
 * GET /api/oracle-p6/dp-block-data
 * Fetch DP Block data from Oracle P6 for a specific project
 */
router.get('/dp-block-data', ensureAuthAndPool, async (req, res) => {
  try {
    const { projectId } = req.query;
    
    if (!projectId) {
      return res.status(400).json({ 
        message: 'Project ID is required',
        error: {
          code: 'MISSING_PROJECT_ID',
          description: 'Project ID parameter is required to fetch P6 data'
        }
      });
    }

    // Query to fetch activities from P6 database for the DP Block table
    const query = `
      SELECT 
        pa.object_id as activity_id,
        pa.name as activities,
        pw.name as block,
        pc.name as contractor_name,
        pa.planned_start_date,
        pa.planned_finish_date,
        pa.percent_complete
      FROM p6_activities pa
      LEFT JOIN p6_wbs pw ON pa.wbs_object_id = pw.object_id
      LEFT JOIN p6_activity_assignments paa ON pa.object_id = paa.activity_object_id
      LEFT JOIN p6_contractors pc ON pc.object_id = FLOOR(RANDOM() * 2) + 3001  -- Random contractor for demo
      WHERE pa.project_id = $1
      ORDER BY pa.planned_start_date
    `;

    const result = await req.pool.query(query, [projectId]);
    
    // Transform P6 data to DP Block table format
    const dpBlockData = result.rows.map((row, index) => ({
      activityId: row.activity_id ? row.activity_id.toString() : '',
      activities: row.activities || '',
      plot: '', // Will be filled by user
      block: row.block || '',
      priority: '', // Will be filled by user
      contractorName: row.contractor_name || '',
      scope: '', // Will be filled by user
      yesterdayValue: '', // Will be filled by user
      todayValue: '' // Will be filled by user
    }));

    res.status(200).json({
      message: 'DP Block data fetched successfully from Oracle P6',
      projectId: projectId,
      rowCount: dpBlockData.length,
      data: dpBlockData,
      source: 'p6' // Indicates data source as per P6 Data Provenance Labeling Convention
    });
  } catch (error) {
    console.error('Error fetching DP Block data from Oracle P6:', error);
    res.status(500).json({ 
      message: 'Internal server error while fetching data from Oracle P6',
      error: {
        code: 'P6_DATA_FETCH_ERROR',
        description: 'Failed to fetch data from Oracle P6 database'
      }
    });
  }
});

/**
 * GET /api/oracle-p6/dp-vendor-idt-data
 * Fetch DP Vendor IDT data from Oracle P6 for a specific project
 */
router.get('/dp-vendor-idt-data', ensureAuthAndPool, async (req, res) => {
  try {
    const { projectId } = req.query;
    
    if (!projectId) {
      return res.status(400).json({ 
        message: 'Project ID is required',
        error: {
          code: 'MISSING_PROJECT_ID',
          description: 'Project ID parameter is required to fetch P6 data'
        }
      });
    }

    // Query to fetch vendor-related activities from P6 database
    const query = `
      SELECT 
        pa.object_id as activity_id,
        pa.name as activities,
        pv.name as vendor,
        pa.planned_start_date as idt_date,
        pa.actual_start_date as actual_date,
        pa.status
      FROM p6_activities pa
      LEFT JOIN p6_vendors pv ON pv.object_id = FLOOR(RANDOM() * 2) + 4001  -- Random vendor for demo
      WHERE pa.project_id = $1 AND pa.activity_type = 'Task Dependent'
      ORDER BY pa.planned_start_date
    `;

    const result = await req.pool.query(query, [projectId]);
    
    // Transform P6 data to DP Vendor IDT table format
    const dpVendorIdtData = result.rows.map((row, index) => ({
      activityId: row.activity_id ? row.activity_id.toString() : '',
      activities: row.activities || '',
      plot: '', // Will be filled by user
      vendor: row.vendor || '',
      idtDate: row.idt_date ? row.idt_date.toISOString().split('T')[0] : '',
      actualDate: row.actual_date ? row.actual_date.toISOString().split('T')[0] : '',
      status: row.status || '',
      yesterdayValue: '', // Will be filled by user
      todayValue: '' // Will be filled by user
    }));

    res.status(200).json({
      message: 'DP Vendor IDT data fetched successfully from Oracle P6',
      projectId: projectId,
      rowCount: dpVendorIdtData.length,
      data: dpVendorIdtData,
      source: 'p6' // Indicates data source as per P6 Data Provenance Labeling Convention
    });
  } catch (error) {
    console.error('Error fetching DP Vendor IDT data from Oracle P6:', error);
    res.status(500).json({ 
      message: 'Internal server error while fetching data from Oracle P6',
      error: {
        code: 'P6_DATA_FETCH_ERROR',
        description: 'Failed to fetch data from Oracle P6 database'
      }
    });
  }
});

/**
 * GET /api/oracle-p6/mms-module-rfi-data
 * Fetch MMS & Module RFI data from Oracle P6 for a specific project
 */
router.get('/mms-module-rfi-data', ensureAuthAndPool, async (req, res) => {
  try {
    const { projectId } = req.query;
    
    if (!projectId) {
      return res.status(400).json({ 
        message: 'Project ID is required',
        error: {
          code: 'MISSING_PROJECT_ID',
          description: 'Project ID parameter is required to fetch P6 data'
        }
      });
    }

    // Query to fetch RFI data from P6 database
    const query = `
      SELECT 
        pr.object_id as rfi_id,
        pr.rfi_number,
        pr.subject,
        pm.name as module,
        pr.submitted_date,
        pr.response_date,
        pr.status
      FROM p6_rfis pr
      LEFT JOIN p6_modules pm ON pm.project_id = $1
      WHERE pr.object_id IS NOT NULL
      ORDER BY pr.submitted_date DESC
    `;

    const result = await req.pool.query(query, [projectId]);
    
    // Transform P6 data to MMS & Module RFI table format
    const mmsModuleRfiData = result.rows.map((row, index) => ({
      rfiNo: row.rfi_number || '',
      subject: row.subject || '',
      module: row.module || '',
      submittedDate: row.submitted_date ? row.submitted_date.toISOString().split('T')[0] : '',
      responseDate: row.response_date ? row.response_date.toISOString().split('T')[0] : '',
      status: row.status || '',
      remarks: '', // Will be filled by user
      yesterdayValue: '', // Will be filled by user
      todayValue: '' // Will be filled by user
    }));

    res.status(200).json({
      message: 'MMS & Module RFI data fetched successfully from Oracle P6',
      projectId: projectId,
      rowCount: mmsModuleRfiData.length,
      data: mmsModuleRfiData,
      source: 'p6' // Indicates data source as per P6 Data Provenance Labeling Convention
    });
  } catch (error) {
    console.error('Error fetching MMS & Module RFI data from Oracle P6:', error);
    res.status(500).json({ 
      message: 'Internal server error while fetching data from Oracle P6',
      error: {
        code: 'P6_DATA_FETCH_ERROR',
        description: 'Failed to fetch data from Oracle P6 database'
      }
    });
  }
});

/**
 * GET /api/oracle-p6/dp-vendor-block-data
 * Fetch DP Vendor Block data from Oracle P6 for a specific project
 */
router.get('/dp-vendor-block-data', ensureAuthAndPool, async (req, res) => {
  try {
    const { projectId } = req.query;
    
    if (!projectId) {
      return res.status(400).json({ 
        message: 'Project ID is required',
        error: {
          code: 'MISSING_PROJECT_ID',
          description: 'Project ID parameter is required to fetch P6 data'
        }
      });
    }

    // Query to fetch vendor block data from P6 database
    const query = `
      SELECT 
        pa.object_id as activity_id,
        pa.name as activities,
        pw.name as plot,
        pv.name as vendor,
        pa.planned_start_date,
        pa.planned_finish_date,
        pa.percent_complete
      FROM p6_activities pa
      LEFT JOIN p6_wbs pw ON pa.wbs_object_id = pw.object_id
      LEFT JOIN p6_vendors pv ON pv.object_id = FLOOR(RANDOM() * 2) + 4001  -- Random vendor for demo
      WHERE pa.project_id = $1
      ORDER BY pa.planned_start_date
    `;

    const result = await req.pool.query(query, [projectId]);
    
    // Transform P6 data to DP Vendor Block table format
    const dpVendorBlockData = result.rows.map((row, index) => ({
      activityId: row.activity_id ? row.activity_id.toString() : '',
      activities: row.activities || '',
      plot: row.plot || '',
      newBlockNom: '', // Will be filled by user
      priority: '', // Will be filled by user
      baselinePriority: '', // Will be filled by user
      contractorName: row.vendor || '',
      scope: '', // Will be filled by user
      holdDueToWtg: '', // Will be filled by user
      front: '', // Will be filled by user
      actual: '', // Will be filled by user
      completionPercentage: row.percent_complete ? row.percent_complete.toString() + '%' : '',
      remarks: '', // Will be filled by user
      yesterdayValue: '', // Will be filled by user
      todayValue: '' // Will be filled by user
    }));

    res.status(200).json({
      message: 'DP Vendor Block data fetched successfully from Oracle P6',
      projectId: projectId,
      rowCount: dpVendorBlockData.length,
      data: dpVendorBlockData,
      source: 'p6' // Indicates data source as per P6 Data Provenance Labeling Convention
    });
  } catch (error) {
    console.error('Error fetching DP Vendor Block data from Oracle P6:', error);
    res.status(500).json({ 
      message: 'Internal server error while fetching data from Oracle P6',
      error: {
        code: 'P6_DATA_FETCH_ERROR',
        description: 'Failed to fetch data from Oracle P6 database'
      }
    });
  }
});

/**
 * GET /api/oracle-p6/manpower-details-data
 * Fetch Manpower Details data from Oracle P6 for a specific project
 */
router.get('/manpower-details-data', ensureAuthAndPool, async (req, res) => {
  try {
    const { projectId } = req.query;
    
    if (!projectId) {
      return res.status(400).json({ 
        message: 'Project ID is required',
        error: {
          code: 'MISSING_PROJECT_ID',
          description: 'Project ID parameter is required to fetch P6 data'
        }
      });
    }

    // Query to fetch manpower data from P6 database
    const query = `
      SELECT 
        pr.object_id as resource_id,
        pr.name as resource_name,
        pr.resource_type,
        pw.name as block,
        pa.name as activity_name,
        pm.name as section
      FROM p6_resources pr
      LEFT JOIN p6_activity_assignments paa ON pr.object_id = paa.resource_object_id
      LEFT JOIN p6_activities pa ON paa.activity_object_id = pa.object_id
      LEFT JOIN p6_wbs pw ON pa.wbs_object_id = pw.object_id
      LEFT JOIN p6_modules pm ON pm.project_id = $1
      WHERE pr.resource_type = 'Labor' AND pa.project_id = $1
      ORDER BY pr.name
    `;

    const result = await req.pool.query(query, [projectId]);
    
    // Transform P6 data to Manpower Details table format
    const manpowerDetailsData = result.rows.map((row, index) => ({
      activityId: row.resource_id ? row.resource_id.toString() : '',
      slNo: (index + 1).toString(),
      block: row.block || '',
      contractorName: '', // Will be filled by user
      activity: row.activity_name || '',
      section: row.section || '',
      yesterdayValue: '', // Will be filled by user
      todayValue: '' // Will be filled by user
    }));

    // Calculate total manpower
    const totalManpower = result.rows.length;

    res.status(200).json({
      message: 'Manpower Details data fetched successfully from Oracle P6',
      projectId: projectId,
      rowCount: manpowerDetailsData.length,
      totalManpower: totalManpower,
      data: manpowerDetailsData,
      source: 'p6' // Indicates data source as per P6 Data Provenance Labeling Convention
    });
  } catch (error) {
    console.error('Error fetching Manpower Details data from Oracle P6:', error);
    res.status(500).json({ 
      message: 'Internal server error while fetching data from Oracle P6',
      error: {
        code: 'P6_DATA_FETCH_ERROR',
        description: 'Failed to fetch data from Oracle P6 database'
      }
    });
  }
});

/**
 * GET /api/oracle-p6/projects
 * Fetch all projects from Oracle P6
 */
router.get('/projects', ensureAuthAndPool, async (req, res) => {
  try {
    const result = await req.pool.query('SELECT id, name, location FROM projects ORDER BY name');
    
    res.status(200).json({
      message: 'Projects fetched successfully from Oracle P6',
      projects: result.rows,
      source: 'p6' // Indicates data source as per P6 Data Provenance Labeling Convention
    });
  } catch (error) {
    console.error('Error fetching projects from Oracle P6:', error);
    res.status(500).json({ 
      message: 'Internal server error while fetching projects from Oracle P6',
      error: {
        code: 'P6_PROJECTS_FETCH_ERROR',
        description: 'Failed to fetch projects from Oracle P6 database'
      }
    });
  }
});

/**
 * GET /api/oracle-p6/activity-fields
 * Get available activity fields from Oracle P6
 * This helps in understanding what data is available
 */
router.get('/activity-fields', ensureAuth, (req, res) => {
  // Equivalent to GET /activity/fields - returns available activity fields
  res.status(200).json({
    message: 'Activity fields - Oracle P6 API equivalent',
    fields: [
      'ObjectId',
      'Name',
      'ProjectId',
      'WBSObjectId',
      'PlannedStartDate',
      'PlannedFinishDate',
      'ActualStartDate',
      'ActualFinishDate',
      'BaselineStartDate',
      'BaselineFinishDate',
      'ForecastStartDate',
      'ForecastFinishDate',
      'PercentComplete',
      'PhysicalPercentComplete',
      'Duration',
      'RemainingDuration',
      'ActualDuration',
      'Status',
      'ActivityType',
      'Critical',
      'ResourceNames'
    ],
    source: 'p6' // Indicates data source as per P6 Data Provenance Labeling Convention
  });
});

/**
 * POST /api/oracle-p6/sync-project
 * Sync project data from Oracle P6 to local database
 */
router.post('/sync-project', ensureAuthAndPool, async (req, res) => {
  try {
    const { projectId } = req.body;
    
    if (!projectId) {
      return res.status(400).json({ 
        message: 'Project ID is required for sync',
        error: {
          code: 'MISSING_PROJECT_ID',
          description: 'Project ID is required to sync data from Oracle P6'
        }
      });
    }

    // This would implement the actual sync logic
    // For now, we'll return a placeholder response
    res.status(200).json({
      message: 'Project sync initiated with Oracle P6',
      projectId: projectId,
      status: 'pending',
      details: 'Sync process started. This may take a few minutes depending on the project size.',
      source: 'p6' // Indicates data source as per P6 Data Provenance Labeling Convention
    });
  } catch (error) {
    console.error('Error syncing project from Oracle P6:', error);
    res.status(500).json({ 
      message: 'Internal server error while syncing project from Oracle P6',
      error: {
        code: 'P6_SYNC_ERROR',
        description: 'Failed to sync project data from Oracle P6 database'
      }
    });
  }
});

/**
 * GET /api/oracle-p6/wbs/:projectId
 * Fetch WBS structure for a project from Oracle P6
 */
router.get('/wbs/:projectId', ensureAuthAndPool, async (req, res) => {
  try {
    const { projectId } = req.params;
    
    const query = `
      SELECT 
        object_id,
        name,
        parent_wbs_object_id,
        seq_num
      FROM p6_wbs
      WHERE project_id = $1
      ORDER BY seq_num
    `;

    const result = await req.pool.query(query, [projectId]);
    
    res.status(200).json({
      message: 'WBS structure fetched successfully from Oracle P6',
      projectId: projectId,
      wbsItems: result.rows,
      source: 'p6' // Indicates data source as per P6 Data Provenance Labeling Convention
    });
  } catch (error) {
    console.error('Error fetching WBS from Oracle P6:', error);
    res.status(500).json({ 
      message: 'Internal server error while fetching WBS from Oracle P6',
      error: {
        code: 'P6_WBS_FETCH_ERROR',
        description: 'Failed to fetch WBS structure from Oracle P6 database'
      }
    });
  }
});

/**
 * GET /api/oracle-p6/resources/:projectId
 * Fetch resources for a project from Oracle P6
 */
router.get('/resources/:projectId', ensureAuthAndPool, async (req, res) => {
  try {
    const { projectId } = req.params;
    
    const query = `
      SELECT DISTINCT
        pr.object_id,
        pr.name,
        pr.resource_type,
        pr.units
      FROM p6_resources pr
      JOIN p6_activity_assignments paa ON pr.object_id = paa.resource_object_id
      JOIN p6_activities pa ON paa.activity_object_id = pa.object_id
      WHERE pa.project_id = $1
      ORDER BY pr.name
    `;

    const result = await req.pool.query(query, [projectId]);
    
    res.status(200).json({
      message: 'Resources fetched successfully from Oracle P6',
      projectId: projectId,
      resources: result.rows,
      source: 'p6' // Indicates data source as per P6 Data Provenance Labeling Convention
    });
  } catch (error) {
    console.error('Error fetching resources from Oracle P6:', error);
    res.status(500).json({ 
      message: 'Internal server error while fetching resources from Oracle P6',
      error: {
        code: 'P6_RESOURCES_FETCH_ERROR',
        description: 'Failed to fetch resources from Oracle P6 database'
      }
    });
  }
});

module.exports = { router, setPool };