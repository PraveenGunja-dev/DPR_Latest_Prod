// server/routes/oracleP6.js
// Oracle Primavera P6 API integration routes

const express = require('express');
const router = express.Router();
// Note: oracleP6ProjectService and oracleP6ActivityService now export functions, not classes
const { testConnection } = require('../services/oracleP6AuthService');
const { restClient } = require('../services/oracleP6RestClient');
const p6DataService = require('../services/p6DataService');
const { syncProjectsFromP6, getProjectsFromDb, getProjectByObjectId } = require('../services/oracleP6SyncService');

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
 * GET /api/oracle-p6/activities
 * Fetch activities from Oracle P6 REST API for a specific project
 * @query projectId - The P6 ProjectObjectId to filter activities
 */
router.get('/activities', ensureAuth, async (req, res) => {
  try {
    const { projectId } = req.query;

    if (!projectId) {
      return res.status(400).json({
        message: 'Project ID is required',
        error: {
          code: 'MISSING_PROJECT_ID',
          description: 'projectId query parameter is required'
        }
      });
    }

    console.log(`Fetching P6 activities for project ObjectId: ${projectId}`);

    // Use the database caching layer for performance
    try {
      let activities = await p6DataService.getActivities(parseInt(projectId));

      // If DB is empty, trigger an initial sync
      if (!activities || activities.length === 0) {
        console.log(`[P6 Cache] Miss for project ${projectId}, triggering sync...`);
        await p6DataService.syncProject(parseInt(projectId));
        activities = await p6DataService.getActivities(parseInt(projectId));
      } else {
        console.log(`[P6 Cache] Hit for project ${projectId}: ${activities.length} activities`);
      }

      // Return the activities (p6DataService already maps them to frontend format)
      res.status(200).json({
        message: 'Activities fetched from P6 Database Cache',
        projectId: projectId,
        count: activities.length,
        activities: activities,
        source: 'p6_db_cache'
      });

    } catch (error) {
      console.error('Error fetching activities from P6 Cache:', error);
      res.status(500).json({
        message: 'Failed to fetch activities from P6 Cache',
        error: {
          code: 'P6_CACHE_ERROR',
          description: error.message
        }
      });
    }
  } catch (outerError) {
    console.error('Unexpected error in /activities:', outerError);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

// Sync Endpoint
router.post('/sync', ensureAuth, async (req, res) => {
  try {
    const { projectId } = req.body;
    if (!projectId) return res.status(400).json({ message: 'Project ID required' });

    console.log(`[P6 Sync] Manual sync requested for ${projectId}`);
    await p6DataService.syncProject(parseInt(projectId));

    res.json({ success: true, message: 'Sync completed successfully' });
  } catch (error) {
    console.error('Sync failed:', error);
    res.status(500).json({ message: 'Sync failed', error: error.message });
  }
});

/**
 * GET /api/oracle-p6/wbs
 * Fetch WBS (Work Breakdown Structure) from Oracle P6 for a project
 */
router.get('/wbs-data', ensureAuth, async (req, res) => {
  try {
    const { projectId } = req.query;

    if (!projectId) {
      return res.status(400).json({ message: 'projectId is required' });
    }

    const wbsData = await restClient.get('/wbs', {
      Fields: 'ObjectId,Name,Code,ProjectObjectId',
      Filter: `ProjectObjectId = ${projectId}`
    });

    const wbsItems = Array.isArray(wbsData) ? wbsData : (wbsData.data || []);

    res.status(200).json({
      message: 'WBS fetched from Oracle P6',
      projectId: projectId,
      count: wbsItems.length,
      wbs: wbsItems,
      source: 'p6_live_api'
    });
  } catch (error) {
    console.error('Error fetching WBS:', error);
    res.status(500).json({ message: 'Failed to fetch WBS', error: error.message });
  }
});

/**
 * GET /api/oracle-p6/projects
 * Fetch all projects from local database (synced from Oracle P6)
 */
router.get('/projects', ensureAuthAndPool, async (req, res) => {
  try {
    const result = await req.pool.query(
      'SELECT id, name, location, status, progress, p6_object_id, p6_last_sync FROM projects ORDER BY name'
    );

    res.status(200).json({
      message: 'Projects fetched successfully',
      projects: result.rows,
      source: 'local-db' // Data synced from P6
    });
  } catch (error) {
    console.error('Error fetching projects:', error);
    res.status(500).json({
      message: 'Internal server error while fetching projects',
      error: {
        code: 'PROJECTS_FETCH_ERROR',
        description: 'Failed to fetch projects from database'
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
 * POST /api/oracle-p6/sync-all-projects
 * Sync all projects from Oracle P6 to local database
 */
router.post('/sync-all-projects', ensureAuthAndPool, async (req, res) => {
  try {
    if (!projectService) {
      return res.status(500).json({
        message: 'Project service not initialized',
        error: { code: 'SERVICE_NOT_INITIALIZED' }
      });
    }

    const result = await projectService.syncAllProjects();

    res.status(200).json({
      message: 'Projects synced successfully from Oracle P6',
      ...result
    });
  } catch (error) {
    console.error('Error syncing projects from Oracle P6:', error);
    res.status(500).json({
      message: 'Internal server error while syncing projects from Oracle P6',
      error: {
        code: 'P6_SYNC_ERROR',
        description: error.message
      }
    });
  }
});

/**
 * POST /api/oracle-p6/sync-activities
 * Sync activities for a specific project from Oracle P6
 */
router.post('/sync-activities', ensureAuthAndPool, async (req, res) => {
  try {
    const { p6ProjectId, localProjectId } = req.body;

    if (!p6ProjectId || !localProjectId) {
      return res.status(400).json({
        message: 'Both p6ProjectId and localProjectId are required',
        error: { code: 'MISSING_PARAMETERS' }
      });
    }

    if (!activityService) {
      return res.status(500).json({
        message: 'Activity service not initialized',
        error: { code: 'SERVICE_NOT_INITIALIZED' }
      });
    }

    const result = await activityService.syncActivitiesForProject(p6ProjectId, localProjectId);

    res.status(200).json({
      message: 'Activities synced successfully from Oracle P6',
      ...result
    });
  } catch (error) {
    console.error('Error syncing activities from Oracle P6:', error);
    res.status(500).json({
      message: 'Internal server error while syncing activities from Oracle P6',
      error: {
        code: 'P6_SYNC_ERROR',
        description: error.message
      }
    });
  }
});

/**
 * GET /api/oracle-p6/sync-status/:projectId
 * Get sync status for a project
 */
router.get('/sync-status/:projectId', ensureAuthAndPool, async (req, res) => {
  try {
    const { projectId } = req.params;

    if (!projectService) {
      return res.status(500).json({
        message: 'Project service not initialized',
        error: { code: 'SERVICE_NOT_INITIALIZED' }
      });
    }

    const status = await projectService.getSyncStatus(projectId);

    res.status(200).json({
      message: 'Sync status retrieved successfully',
      ...status
    });
  } catch (error) {
    console.error('Error getting sync status:', error);
    res.status(500).json({
      message: 'Internal server error while getting sync status',
      error: {
        code: 'SYNC_STATUS_ERROR',
        description: error.message
      }
    });
  }
});

/**
 * GET /api/oracle-p6/test-connection
 * Test Oracle P6 API connection
 */
router.get('/test-connection', ensureAuth, async (req, res) => {
  try {
    const isConnected = await testConnection();

    res.status(200).json({
      message: isConnected ? 'Oracle P6 API connection successful' : 'Oracle P6 API connection failed',
      connected: isConnected
    });
  } catch (error) {
    console.error('Error testing Oracle P6 connection:', error);
    res.status(500).json({
      message: 'Error testing Oracle P6 connection',
      error: {
        code: 'CONNECTION_TEST_ERROR',
        description: error.message
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

// ============================================================================
// Oracle P6 REST API Endpoints
// These endpoints fetch data directly from Oracle P6 using REST API
// ============================================================================

/**
 * GET /api/oracle-p6/p6-projects
 * Fetch all projects from Oracle P6 via REST API
 * Query params:
 *   - status: Filter by status (e.g., 'Active')
 *   - search: Search by name/ID
 *   - token: OAuth token (optional, uses env if not provided)
 */
router.get('/p6-projects', async (req, res) => {
  try {
    const { status, search, token } = req.query;

    // Use provided token or fall back to env variable
    const authToken = token || process.env.ORACLE_P6_AUTH_TOKEN;

    if (!authToken) {
      return res.status(401).json({
        success: false,
        message: 'OAuth token required. Provide via query param or ORACLE_P6_AUTH_TOKEN env variable.',
        error: { code: 'MISSING_TOKEN' }
      });
    }

    // Set token in REST client
    restClient.setToken(authToken);

    // Fetch projects from P6 REST API
    let projects = await restClient.readProjects([
      'ObjectId', 'Id', 'Name', 'Status', 'StartDate', 'FinishDate',
      'Description', 'PlannedStartDate', 'ParentEPSName'
    ]);

    // Apply client-side filtering if needed
    if (search) {
      const term = search.toLowerCase();
      projects = projects.filter(p =>
        (p.Name && p.Name.toLowerCase().includes(term)) ||
        (p.Id && p.Id.toLowerCase().includes(term))
      );
    } else if (status) {
      projects = projects.filter(p =>
        p.Status && p.Status.toLowerCase() === status.toLowerCase()
      );
    }

    res.status(200).json({
      success: true,
      message: `Retrieved ${projects.length} projects from Oracle P6`,
      count: projects.length,
      projects: projects,
      source: 'p6-rest'
    });

  } catch (error) {
    console.error('Error fetching P6 projects via REST:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch projects from Oracle P6',
      error: {
        code: 'P6_REST_ERROR',
        description: error.message
      }
    });
  }
});

/**
 * POST /api/oracle-p6/set-token
 * Set the OAuth token for P6 REST client
 */
router.post('/set-token', (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Token is required in request body'
      });
    }

    restClient.setToken(token);

    res.status(200).json({
      success: true,
      message: 'OAuth token set successfully'
    });

  } catch (error) {
    console.error('Error setting P6 token:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to set token',
      error: { description: error.message }
    });
  }
});

/**
 * GET /api/oracle-p6/test-rest
 * Test REST connection to Oracle P6
 */
router.get('/test-rest', async (req, res) => {
  try {
    const { token } = req.query;

    const authToken = token || process.env.ORACLE_P6_AUTH_TOKEN;

    if (!authToken) {
      return res.status(401).json({
        success: false,
        message: 'OAuth token required'
      });
    }

    restClient.setToken(authToken);

    // Try to fetch just a few projects
    const projects = await restClient.readProjects(['ObjectId', 'Id', 'Name', 'Status']);

    res.status(200).json({
      success: true,
      message: 'REST API connection successful',
      projectCount: projects.length,
      sampleProjects: projects.slice(0, 5)
    });

  } catch (error) {
    console.error('REST API test failed:', error);
    res.status(500).json({
      success: false,
      message: 'REST API connection failed',
      error: { description: error.message }
    });
  }
});

// ============================================================================
// Oracle P6 Sync Endpoints
// These endpoints sync P6 data to local database
// ============================================================================

/**
 * POST /api/oracle-p6/sync-projects
 * Sync all projects from Oracle P6 to local database
 */
router.post('/sync-projects', ensurePool, async (req, res) => {
  try {
    const { token } = req.body;

    const authToken = token || process.env.ORACLE_P6_AUTH_TOKEN;

    if (!authToken) {
      return res.status(401).json({
        success: false,
        message: 'OAuth token required. Provide in body or set ORACLE_P6_AUTH_TOKEN env variable.'
      });
    }

    const result = await syncProjectsFromP6(req.pool, authToken);

    res.status(200).json({
      success: true,
      message: `Synced ${result.totalFromP6} projects from Oracle P6`,
      ...result
    });

  } catch (error) {
    console.error('Project sync failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to sync projects from Oracle P6',
      error: { description: error.message }
    });
  }
});

/**
 * GET /api/oracle-p6/synced-projects
 * Get all projects from local database (synced from P6)
 */
router.get('/synced-projects', ensurePool, async (req, res) => {
  try {
    const { status, search } = req.query;

    const projects = await getProjectsFromDb(req.pool, { status, search });

    res.status(200).json({
      success: true,
      message: `Retrieved ${projects.length} synced projects`,
      count: projects.length,
      projects: projects,
      source: 'local-db-synced-from-p6'
    });

  } catch (error) {
    console.error('Error fetching synced projects:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch synced projects',
      error: { description: error.message }
    });
  }
});

/**
 * GET /api/oracle-p6/synced-projects/:objectId
 * Get a single project by ObjectId from local database
 */
router.get('/synced-projects/:objectId', ensurePool, async (req, res) => {
  try {
    const { objectId } = req.params;

    const project = await getProjectByObjectId(req.pool, parseInt(objectId));

    if (!project) {
      return res.status(404).json({
        success: false,
        message: `Project with ObjectId ${objectId} not found`
      });
    }

    res.status(200).json({
      success: true,
      project: project
    });

  } catch (error) {
    console.error('Error fetching project:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch project',
      error: { description: error.message }
    });
  }
});

// ============================================================================
// NEW ENDPOINTS FOR UI TABLE DATA
// ============================================================================

/**
 * GET /api/oracle-p6/wbs-full
 * Fetch complete WBS data from Oracle P6 for a project (for plots/blocks)
 */
router.get('/wbs-full', ensureAuth, async (req, res) => {
  try {
    const { projectId } = req.query;

    if (!projectId) {
      return res.status(400).json({
        message: 'Project ID is required',
        error: { code: 'MISSING_PROJECT_ID' }
      });
    }

    console.log(`Fetching WBS data for project ${projectId}`);

    const wbsData = await restClient.get('/wbs', {
      Fields: 'ObjectId,Name,Code,ProjectObjectId,ParentObjectId,SequenceNumber,Status',
      Filter: `ProjectObjectId = ${projectId}`
    });

    const wbsItems = Array.isArray(wbsData) ? wbsData : (wbsData.data || []);
    console.log(`Found ${wbsItems.length} WBS items for project ${projectId}`);

    // Create a lookup map for parent names
    const wbsMap = {};
    wbsItems.forEach(w => {
      wbsMap[w.ObjectId] = w;
    });

    // Map to UI-friendly format
    const mappedWbs = wbsItems.map(wbs => ({
      objectId: wbs.ObjectId,
      name: wbs.Name || '',
      code: wbs.Code || '',
      parentObjectId: wbs.ParentObjectId,
      parentName: wbs.ParentObjectId ? (wbsMap[wbs.ParentObjectId]?.Name || '') : '',
      sequenceNumber: wbs.SequenceNumber,
      status: wbs.Status || 'Active'
    }));

    res.status(200).json({
      message: 'WBS data fetched from Oracle P6',
      projectId: projectId,
      count: mappedWbs.length,
      wbs: mappedWbs,
      source: 'p6_live_api'
    });

  } catch (error) {
    console.error('Error fetching WBS from P6:', error);
    res.status(500).json({
      message: 'Failed to fetch WBS from Oracle P6',
      error: { code: 'P6_WBS_FETCH_ERROR', description: error.message }
    });
  }
});

/**
 * GET /api/oracle-p6/resource-assignments
 * Fetch resource assignments from Oracle P6 (for contractor/vendor names)
 */
router.get('/resource-assignments', ensureAuth, async (req, res) => {
  try {
    const { projectId } = req.query;

    if (!projectId) {
      return res.status(400).json({
        message: 'Project ID is required',
        error: { code: 'MISSING_PROJECT_ID' }
      });
    }

    console.log(`Fetching resource assignments for project ${projectId}`);

    const assignments = await restClient.get('/resourceassignment', {
      Fields: 'ObjectId,ActivityObjectId,ResourceObjectId,ResourceName,PlannedUnits,ActualUnits,RemainingUnits,StartDate,FinishDate,IsPrimaryResource',
      Filter: `ProjectObjectId = ${projectId}`
    });

    const assignmentItems = Array.isArray(assignments) ? assignments : (assignments.data || []);
    console.log(`Found ${assignmentItems.length} resource assignments for project ${projectId}`);

    // Map to UI-friendly format
    const mappedAssignments = assignmentItems.map(ra => ({
      objectId: ra.ObjectId,
      activityObjectId: ra.ActivityObjectId,
      resourceObjectId: ra.ResourceObjectId,
      resourceName: ra.ResourceName || '',
      plannedUnits: ra.PlannedUnits || 0,
      actualUnits: ra.ActualUnits || 0,
      remainingUnits: ra.RemainingUnits || 0,
      startDate: ra.StartDate ? ra.StartDate.split('T')[0] : '',
      finishDate: ra.FinishDate ? ra.FinishDate.split('T')[0] : '',
      isPrimary: ra.IsPrimaryResource || false
    }));

    res.status(200).json({
      message: 'Resource assignments fetched from Oracle P6',
      projectId: projectId,
      count: mappedAssignments.length,
      assignments: mappedAssignments,
      source: 'p6_live_api'
    });

  } catch (error) {
    console.error('Error fetching resource assignments from P6:', error);
    res.status(500).json({
      message: 'Failed to fetch resource assignments from Oracle P6',
      error: { code: 'P6_RA_FETCH_ERROR', description: error.message }
    });
  }
});

/**
 * GET /api/oracle-p6/project-issues
 * Fetch project issues from Oracle P6 (for RFI tracking)
 */
router.get('/project-issues', ensureAuth, async (req, res) => {
  try {
    const { projectId } = req.query;

    if (!projectId) {
      return res.status(400).json({
        message: 'Project ID is required',
        error: { code: 'MISSING_PROJECT_ID' }
      });
    }

    console.log(`Fetching project issues for project ${projectId}`);

    const issues = await restClient.get('/projectissue', {
      Fields: 'ObjectId,Name,Status,Priority,CreateDate,DueDate,Description,ResponsibleManagerName,WBSObjectId',
      Filter: `ProjectObjectId = ${projectId}`
    });

    const issueItems = Array.isArray(issues) ? issues : (issues.data || []);
    console.log(`Found ${issueItems.length} project issues for project ${projectId}`);

    // Map to UI-friendly format for MMS & RFI table
    const mappedIssues = issueItems.map((issue, index) => ({
      objectId: issue.ObjectId,
      rfiNo: `RFI-${String(index + 1).padStart(3, '0')}`,
      name: issue.Name || '',
      status: issue.Status || '',
      priority: issue.Priority || '',
      createDate: issue.CreateDate ? issue.CreateDate.split('T')[0] : '',
      dueDate: issue.DueDate ? issue.DueDate.split('T')[0] : '',
      description: issue.Description || '',
      responsibleManager: issue.ResponsibleManagerName || '',
      wbsObjectId: issue.WBSObjectId
    }));

    res.status(200).json({
      message: 'Project issues fetched from Oracle P6',
      projectId: projectId,
      count: mappedIssues.length,
      issues: mappedIssues,
      source: 'p6_live_api'
    });

  } catch (error) {
    console.error('Error fetching project issues from P6:', error);
    res.status(500).json({
      message: 'Failed to fetch project issues from Oracle P6',
      error: { code: 'P6_ISSUES_FETCH_ERROR', description: error.message }
    });
  }
});

/**
 * GET /api/oracle-p6/activities-full
 * Fetch complete activity data including WBS names and resource names
 * This is the main endpoint for populating all supervisor dashboard tables
 */
router.get('/activities-full', ensureAuth, async (req, res) => {
  try {
    const { projectId } = req.query;
    if (!projectId) {
      return res.status(400).json({
        message: 'Project ID is required',
        error: { code: 'MISSING_PROJECT_ID' }
      });
    }

    console.log(`Fetching full activity data (cached) for project ${projectId}`);

    // Use the database caching layer for performance
    try {
      let activities = await p6DataService.getActivities(parseInt(projectId));

      // If DB is empty, trigger an initial sync
      if (!activities || activities.length === 0) {
        console.log(`[P6 Cache] Miss for project ${projectId}, triggering sync...`);
        await p6DataService.syncProject(parseInt(projectId));
        activities = await p6DataService.getActivities(parseInt(projectId));
      } else {
        console.log(`[P6 Cache] Hit for project ${projectId}: ${activities.length} activities`);
      }

      res.status(200).json({
        message: 'Full activity data fetched from P6 Database Cache',
        projectId: projectId,
        count: activities.length,
        activities: activities,
        source: 'p6_db_cache'
      });

    } catch (error) {
      console.error('Error fetching full activity data from P6 Cache:', error);
      res.status(500).json({
        message: 'Failed to fetch activity data from P6 Cache',
        error: { code: 'P6_ACTIVITIES_FULL_ERROR', description: error.message }
      });
    }
  } catch (outerError) {
    console.error('Unexpected error in /activities-full:', outerError);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

module.exports = { router, setPool };