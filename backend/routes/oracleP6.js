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
 * @query page - Optional. Page number (1-indexed), default 1
 * @query limit - Optional. Items per page, default 50
 */
router.get('/activities', ensureAuth, async (req, res) => {
  try {
    const { projectId, page = 1, limit = 50 } = req.query;

    if (!projectId) {
      return res.status(400).json({
        message: 'Project ID is required',
        error: {
          code: 'MISSING_PROJECT_ID',
          description: 'projectId query parameter is required'
        }
      });
    }

    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 50;

    console.log(`Fetching P6 activities for project ObjectId: ${projectId}, page ${pageNum}`);

    // Use the database caching layer for performance
    try {
      let result = await p6DataService.getActivities(parseInt(projectId), {
        page: pageNum,
        limit: limitNum
      });

      // If DB is empty, trigger an initial sync
      if (!result.activities || result.activities.length === 0) {
        console.log(`[P6 Cache] Miss for project ${projectId}, triggering sync...`);
        await p6DataService.syncProject(parseInt(projectId));
        result = await p6DataService.getActivities(parseInt(projectId), {
          page: pageNum,
          limit: limitNum
        });
      } else {
        console.log(`[P6 Cache] Hit for project ${projectId}: ${result.activities.length} activities`);
      }

      // Return the activities (p6DataService already maps them to frontend format)
      res.status(200).json({
        message: 'Activities fetched from P6 Database Cache',
        projectId: projectId,
        count: result.activities.length,
        activities: result.activities,
        pagination: result.pagination,
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
 * POST /api/oracle-p6/sync-resources
 * Sync ALL resources from Oracle P6 globally (resources are not project-specific)
 */
router.post('/sync-resources', ensureAuth, async (req, res) => {
  try {
    console.log('[P6 Sync] Syncing ALL global resources from P6...');

    // Fetch all resources from P6 (globally - not project-specific)
    const resources = await restClient.readResources();

    if (!resources || resources.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No resources found in P6',
        count: 0
      });
    }

    console.log(`[P6 Sync] Found ${resources.length} resources in P6, syncing to database...`);

    // Use pool directly for the sync
    const pool = require('../db');
    let syncedCount = 0;
    let errorCount = 0;

    for (const resource of resources) {
      try {
        await pool.query(
          `INSERT INTO p6_resources (object_id, resource_id, name, type, email, parent_object_id)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (object_id) DO UPDATE SET
              resource_id = EXCLUDED.resource_id,
              name = EXCLUDED.name,
              type = EXCLUDED.type,
              email = EXCLUDED.email,
              parent_object_id = EXCLUDED.parent_object_id,
              last_sync_at = CURRENT_TIMESTAMP`,
          [
            resource.ObjectId,
            resource.Id,
            resource.Name,
            resource.ResourceType || null,
            resource.EmailAddress || null,
            resource.ParentObjectId || null
          ]
        );
        syncedCount++;
      } catch (insertErr) {
        console.error(`Failed to sync resource ${resource.ObjectId}:`, insertErr.message);
        errorCount++;
      }
    }

    console.log(`[P6 Sync] Resources sync complete: ${syncedCount} synced, ${errorCount} errors`);

    res.json({
      success: true,
      message: `Resources synced successfully from P6`,
      total: resources.length,
      synced: syncedCount,
      errors: errorCount
    });
  } catch (error) {
    console.error('[P6 Sync] Resource sync failed:', error);
    res.status(500).json({ message: 'Resource sync failed', error: error.message });
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

    // First try to get resources with assignments for this project
    let query = `
      SELECT 
        pr.object_id,
        pr.resource_id,
        pr.name,
        pr.type as resource_type,
        COALESCE(SUM(pra.planned_units), 0) as total_units,
        COALESCE(SUM(pra.actual_units), 0) as actual_units
      FROM p6_resources pr
      LEFT JOIN p6_resource_assignments pra ON pr.object_id = pra.resource_object_id AND pra.project_object_id = $1
      GROUP BY pr.object_id, pr.resource_id, pr.name, pr.type
      HAVING COALESCE(SUM(pra.planned_units), 0) > 0 OR COALESCE(SUM(pra.actual_units), 0) > 0
      ORDER BY pr.name
      LIMIT 30
    `;

    let result = await req.pool.query(query, [projectId]);

    // If no resources with assignments found, return resources limited to 30
    if (result.rows.length === 0) {
      query = `
        SELECT 
          object_id,
          resource_id,
          name,
          type as resource_type,
          0 as total_units,
          0 as actual_units
        FROM p6_resources
        WHERE name IS NOT NULL AND name != ''
        ORDER BY name
        LIMIT 30
      `;
      result = await req.pool.query(query);
    }

    // Map to format expected by frontend - NO FALLBACK VALUES
    const resources = result.rows.map(row => ({
      object_id: row.object_id,
      resource_id: row.resource_id || null,
      name: row.name || null,
      resource_type: row.resource_type || null,
      total_units: row.total_units,
      actual_units: row.actual_units
    }));

    res.status(200).json({
      message: 'Resources fetched successfully from Oracle P6',
      projectId: projectId,
      resources: resources,
      count: resources.length,
      source: 'p6'
    });
  } catch (error) {
    console.error('Error fetching resources from Oracle P6:', error);
    res.status(500).json({
      message: 'Internal server error while fetching resources from Oracle P6',
      error: {
        code: 'P6_RESOURCES_FETCH_ERROR',
        description: error.message
      }
    });
  }
});

/**
 * GET /api/oracle-p6/all-resources
 * Fetch all resources (global, not project-specific)
 */
router.get('/all-resources', ensureAuthAndPool, async (req, res) => {
  try {
    const { limit = 100, type } = req.query;

    let query = `SELECT object_id, resource_id, name, type as resource_type FROM p6_resources`;
    const params = [];

    if (type) {
      params.push(type);
      query += ` WHERE type = $${params.length}`;
    }

    query += ` ORDER BY name LIMIT $${params.length + 1}`;
    params.push(parseInt(limit));

    const result = await req.pool.query(query, params);

    res.status(200).json({
      success: true,
      resources: result.rows,
      count: result.rows.length
    });
  } catch (error) {
    console.error('Error fetching all resources:', error);
    res.status(500).json({
      message: 'Error fetching resources',
      error: { description: error.message }
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
 * @query projectId - Required. The P6 ProjectObjectId
 * @query page - Optional. Page number (1-indexed), default 1
 * @query limit - Optional. Items per page, default 50
 */
router.get('/activities-full', ensureAuth, async (req, res) => {
  try {
    const { projectId, page = 1, limit = 50 } = req.query;
    if (!projectId) {
      return res.status(400).json({
        message: 'Project ID is required',
        error: { code: 'MISSING_PROJECT_ID' }
      });
    }

    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 50;

    console.log(`Fetching full activity data (cached) for project ${projectId}, page ${pageNum}, limit ${limitNum}`);

    // Use the database caching layer for performance
    try {
      let result = await p6DataService.getActivities(parseInt(projectId), {
        page: pageNum,
        limit: limitNum
      });

      // If DB is empty, trigger an initial sync
      if (!result.activities || result.activities.length === 0) {
        console.log(`[P6 Cache] Miss for project ${projectId}, triggering sync...`);
        await p6DataService.syncProject(parseInt(projectId));
        result = await p6DataService.getActivities(parseInt(projectId), {
          page: pageNum,
          limit: limitNum
        });
      } else {
        console.log(`[P6 Cache] Hit for project ${projectId}: ${result.activities.length} activities (page ${pageNum}/${result.pagination.totalPages})`);
      }

      res.status(200).json({
        message: 'Full activity data fetched from P6 Database Cache',
        projectId: projectId,
        count: result.activities.length,
        activities: result.activities,
        pagination: result.pagination,
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

/**
 * POST /api/oracle-p6/push-entry/:entryId
 * Push approved DPR entry data directly to Oracle P6 (STAGING environment)
 * Uses PUT /activity endpoint to update activities in P6
 */
router.post('/push-entry/:entryId', ensureAuthAndPool, async (req, res) => {
  try {
    const { entryId } = req.params;
    const userId = req.user.userId;

    console.log(`[Push to P6] Starting push for entry ${entryId}...`);

    // 1. Fetch the entry
    const entryResult = await req.pool.query(
      'SELECT * FROM dpr_supervisor_entries WHERE id = $1',
      [entryId]
    );

    if (entryResult.rows.length === 0) {
      return res.status(404).json({ message: 'Entry not found' });
    }

    const entry = entryResult.rows[0];
    const entryData = typeof entry.data_json === 'string' ? JSON.parse(entry.data_json) : entry.data_json;

    // 2. Validate entry status
    if (entry.status === 'final_approved') {
      return res.status(400).json({ message: 'Entry is already pushed to P6' });
    }

    // 3. Build P6 activity update payloads
    // First, we need to get ObjectIds from our local DB for the activities
    const p6Updates = [];
    const localUpdates = [];

    if (entryData && entryData.rows) {
      for (const row of entryData.rows) {
        // The row may have: activityId (string ID), description, objectId, etc.
        const identifier = row.activityId || row.description || row.activities;

        if (!identifier) continue;

        // Query local DB to get the P6 ObjectId for this activity
        const activityResult = await req.pool.query(
          `SELECT object_id, activity_id, name, percent_complete 
           FROM p6_activities 
           WHERE activity_id = $1 OR name = $2
           LIMIT 1`,
          [identifier, identifier]
        );

        if (activityResult.rows.length > 0) {
          const activity = activityResult.rows[0];
          const objectId = activity.object_id;

          // Parse progress values from DPR entry
          let percentComplete = 0;

          if (entry.sheet_type === 'dp_qty') {
            // For DP Qty, calculate percent from cumulative/scope or use direct value
            const scope = parseFloat(row.scope || row.totalQuantity || '0') || 0;
            const cumulative = parseFloat(row.cumulative || row.completed || row.actualQuantity || '0') || 0;
            percentComplete = parseFloat(row.percentComplete || row.completionPercentage || '0') || 0;

            // If percent not provided but scope and cumulative are, calculate it
            if (percentComplete === 0 && scope > 0 && cumulative > 0) {
              percentComplete = Math.round((cumulative / scope) * 100 * 100) / 100; // Round to 2 decimals
            }
          } else {
            // For DP Block and other types
            percentComplete = parseFloat(row.completionPercentage || row.percentStatus || row.percentComplete || '0') || 0;
          }

          // Cap at 100%
          percentComplete = Math.min(100, Math.max(0, percentComplete));

          // Build P6 update payload
          // P6 REST API expects ObjectId to identify the activity
          p6Updates.push({
            ObjectId: objectId,
            PercentComplete: percentComplete
            // Note: P6 may also support: ActualDuration, RemainingDuration, ActualStart, ActualFinish
          });

          // Also track for local DB update
          localUpdates.push({
            objectId,
            percentComplete,
            identifier
          });
        }
      }
    }

    console.log(`[Push to P6] Found ${p6Updates.length} activities to update`);

    // 4. Push to Oracle P6 via REST API
    let p6Response = null;
    let p6Error = null;

    if (p6Updates.length > 0) {
      try {
        // Use the restClient to push to P6 (staging environment)
        // The restClient baseUrl defaults to staging: https://sin1.p6.oraclecloud.com/adani/stage/p6ws/restapi
        p6Response = await restClient.updateActivities(p6Updates);
        console.log(`[Push to P6] P6 API response:`, p6Response);
      } catch (apiError) {
        console.error(`[Push to P6] P6 API error:`, apiError.message);
        p6Error = apiError.message;
        // Continue to update local DB and mark as pushed even if P6 fails
        // This allows for retry or manual sync later
      }
    }

    // 5. Update local database cache as well
    for (const update of localUpdates) {
      await req.pool.query(
        `UPDATE p6_activities 
         SET percent_complete = $1,
             updated_at = CURRENT_TIMESTAMP
         WHERE object_id = $2`,
        [update.percentComplete, update.objectId]
      );
    }

    // 5.5 Store daily values in dpr_daily_progress table (only essential columns)
    const progressDate = entry.progress_date || entry.reporting_date || new Date().toISOString().split('T')[0];

    if (entryData && entryData.rows) {
      for (const row of entryData.rows) {
        const identifier = row.activityId || row.description || row.activities;
        if (!identifier) continue;

        const matchedUpdate = localUpdates.find(u => u.identifier === identifier);
        if (!matchedUpdate) continue;

        const todayValue = parseFloat(row.today || '0') || 0;
        const cumulativeValue = parseFloat(row.cumulative || row.completed || '0') || 0;

        // Simple upsert - only daily values
        await req.pool.query(
          `INSERT INTO dpr_daily_progress (activity_object_id, progress_date, today_value, cumulative_value)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (activity_object_id, progress_date) 
           DO UPDATE SET today_value = EXCLUDED.today_value, cumulative_value = EXCLUDED.cumulative_value`,
          [matchedUpdate.objectId, progressDate, todayValue, cumulativeValue]
        );
      }
      console.log(`[Push to P6] Stored daily values for ${entryData.rows.length} activities`);
    }


    // 6. Update entry status to final_approved
    await req.pool.query(
      `UPDATE dpr_supervisor_entries 
       SET status = 'final_approved',
           pushed_at = CURRENT_TIMESTAMP,
           pushed_by = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [userId, entryId]
    );

    // 7. Return response
    const response = {
      success: true,
      message: p6Error
        ? `Pushed ${localUpdates.length} activities to local DB. P6 API failed: ${p6Error}`
        : `Successfully pushed ${p6Updates.length} activities to Oracle P6 (Staging)`,
      entryId: entryId,
      updatedCount: p6Updates.length,
      p6Response: p6Response,
      p6Error: p6Error
    };

    console.log(`[Push to P6] Complete:`, response);
    res.status(200).json(response);

  } catch (error) {
    console.error('Error pushing data to P6:', error);
    res.status(500).json({
      message: 'Internal server error while pushing data to P6',
      error: { description: error.message }
    });
  }
});

/**
 * GET /api/oracle-p6/daily-progress/:activityObjectId
 * Fetch daily progress history for a specific activity
 */
router.get('/daily-progress/:activityObjectId', ensureAuthAndPool, async (req, res) => {
  try {
    const { activityObjectId } = req.params;
    const { limit = 30 } = req.query;

    // Simple query - only daily values
    const result = await req.pool.query(
      `SELECT * FROM dpr_daily_progress 
       WHERE activity_object_id = $1 
       ORDER BY progress_date DESC 
       LIMIT $2`,
      [activityObjectId, parseInt(limit)]
    );

    res.status(200).json({
      success: true,
      activityObjectId: activityObjectId,
      dailyProgress: result.rows,
      count: result.rows.length
    });

  } catch (error) {
    console.error('Error fetching daily progress:', error);
    res.status(500).json({
      message: 'Error fetching daily progress',
      error: { description: error.message }
    });
  }
});

/**
 * GET /api/oracle-p6/daily-values-by-date
 * Fetch all daily values for a specific date (for Snapshot Filter)
 * Returns activities with their daily progress for the selected date
 */
router.get('/daily-values-by-date', ensureAuthAndPool, async (req, res) => {
  try {
    const { date, projectObjectId } = req.query;

    if (!date) {
      return res.status(400).json({ message: 'Date parameter is required' });
    }

    // Query daily progress joined with P6 activities
    let query = `
      SELECT 
        dp.id,
        dp.activity_object_id,
        dp.progress_date,
        dp.today_value,
        dp.cumulative_value,
        dp.created_at,
        pa.activity_id,
        pa.name as activity_name,
        pa.percent_complete,
        pa.total_quantity,
        pa.project_object_id,
        pp.name as project_name
      FROM dpr_daily_progress dp
      JOIN p6_activities pa ON dp.activity_object_id = pa.object_id
      LEFT JOIN p6_projects pp ON pa.project_object_id = pp.object_id
      WHERE dp.progress_date = $1
    `;
    const params = [date];

    // Optional project filter
    if (projectObjectId && projectObjectId !== 'all') {
      params.push(projectObjectId);
      query += ` AND pa.project_object_id = $${params.length}`;
    }

    query += ` ORDER BY pa.name`;

    const result = await req.pool.query(query, params);

    res.status(200).json({
      success: true,
      date: date,
      activities: result.rows,
      count: result.rows.length
    });

  } catch (error) {
    console.error('Error fetching daily values by date:', error);
    res.status(500).json({
      message: 'Error fetching daily values',
      error: { description: error.message }
    });
  }
});

/**
 * GET /api/oracle-p6/yesterday-values
 * Fetch yesterday's daily values for activities (to pre-fill 'yesterday' column in DPR form)
 * Yesterday's "today_value" becomes today's "yesterday" display
 */
router.get('/yesterday-values', ensureAuthAndPool, async (req, res) => {
  try {
    const { projectObjectId } = req.query;

    // Calculate yesterday's date
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    let query = `
      SELECT 
        dp.activity_object_id,
        dp.progress_date,
        dp.today_value as yesterday_value,
        dp.cumulative_value,
        pa.activity_id,
        pa.name as activity_name
      FROM dpr_daily_progress dp
      JOIN p6_activities pa ON dp.activity_object_id = pa.object_id
      WHERE dp.progress_date = $1
    `;
    const params = [yesterdayStr];

    if (projectObjectId && projectObjectId !== 'all') {
      params.push(projectObjectId);
      query += ` AND pa.project_object_id = $${params.length}`;
    }

    query += ` ORDER BY pa.name`;

    const result = await req.pool.query(query, params);

    res.status(200).json({
      success: true,
      yesterdayDate: yesterdayStr,
      activities: result.rows,
      count: result.rows.length
    });

  } catch (error) {
    console.error('Error fetching yesterday values:', error);
    res.status(500).json({
      message: 'Error fetching yesterday values',
      error: { description: error.message }
    });
  }
});

module.exports = { router, setPool };
