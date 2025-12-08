// server/controllers/oracleP6Controller.js
// Controller for Oracle Primavera P6 API integration

/**
 * Fetch DP Qty data from Oracle P6 for a specific project
 * Maps P6 data to the DP Qty table format
 */
const getDPQtyData = async (req, res) => {
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
      data: dpQtyData
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
};

/**
 * Fetch all projects from Oracle P6
 */
const getP6Projects = async (req, res) => {
  try {
    const result = await req.pool.query('SELECT id, name, location FROM projects ORDER BY name');
    
    res.status(200).json({
      message: 'Projects fetched successfully from Oracle P6',
      projects: result.rows
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
};

/**
 * Get available activity fields from Oracle P6
 */
const getActivityFields = (req, res) => {
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
    ]
  });
};

/**
 * Sync project data from Oracle P6 to local database
 */
const syncProject = async (req, res) => {
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
    res.status(200).json({
      message: 'Project sync initiated with Oracle P6',
      projectId: projectId,
      status: 'pending',
      details: 'Sync process started. This may take a few minutes depending on the project size.'
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
};

/**
 * Fetch WBS structure for a project from Oracle P6
 */
const getWBS = async (req, res) => {
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
      wbsItems: result.rows
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
};

/**
 * Fetch resources for a project from Oracle P6
 */
const getResources = async (req, res) => {
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
      resources: result.rows
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
};

module.exports = {
  getDPQtyData,
  getP6Projects,
  getActivityFields,
  syncProject,
  getWBS,
  getResources
};