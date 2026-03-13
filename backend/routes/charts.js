// server/routes/charts.js
const express = require('express');
const router = express.Router();

let pool;
let authenticateToken;

// Function to set the middleware and pool (called from server.js)
const setPool = (dbPool, authMiddleware) => {
  pool = dbPool;
  authenticateToken = authMiddleware;
};

// Helper to ensure auth and pool
const ensureAuthAndPool = (req, res, next) => {
  if (!pool) {
    return res.status(500).json({ message: 'Database pool not initialized' });
  }
  if (typeof authenticateToken === 'function') {
    return authenticateToken(req, res, next);
  }
  return res.status(401).json({ message: 'Authentication middleware not initialized' });
};

// --- Chart Routes ---

// 1. Planned vs Actual Progress (Grouped by Month)
router.get('/planned-vs-actual', ensureAuthAndPool, async (req, res) => {
  try {
    const { projectId } = req.query;

    let query, params;

    if (projectId) {
      // Specific project
      query = `
        SELECT
          TO_CHAR(pa."PlannedFinishDate", 'Mon-YY') as name,
          COALESCE(SUM(pra."PlannedUnits"), 0) as planned,
          COALESCE(SUM(pra."ActualUnits"), 0) as actual
        FROM p6_activities pa
        LEFT JOIN p6_resource_assignments pra ON pa."ObjectId" = pra."ActivityObjectId"
        WHERE pa."ProjectObjectId" = $1
          AND pa."PlannedFinishDate" IS NOT NULL
        GROUP BY 1, pa."PlannedFinishDate"
        ORDER BY MIN(pa."PlannedFinishDate")
        LIMIT 12
      `;
      params = [projectId];
    } else {
      // All projects - aggregate by month
      query = `
        SELECT
          TO_CHAR(pa."PlannedFinishDate", 'Mon-YY') as name,
          COALESCE(SUM(pra."PlannedUnits"), 0) as planned,
          COALESCE(SUM(pra."ActualUnits"), 0) as actual
        FROM p6_activities pa
        LEFT JOIN p6_resource_assignments pra ON pa."ObjectId" = pra."ActivityObjectId"
        WHERE pa."PlannedFinishDate" IS NOT NULL
          AND pa."PlannedFinishDate" >= NOW() - INTERVAL '6 months'
        GROUP BY 1
        ORDER BY MIN(pa."PlannedFinishDate")
        LIMIT 12
      `;
      params = [];
    }

    const result = await pool.query(query, params);

    const data = result.rows.map(row => ({
      name: row.name,
      planned: parseFloat(row.planned || 0),
      actual: parseFloat(row.actual || 0)
    }));

    res.json(data);
  } catch (error) {
    console.error('Error fetching planned-vs-actual:', error);
    res.json([]);
  }
});

// 2. Completion & Delay (Top Delayed Activities)
router.get('/completion-delay', ensureAuthAndPool, async (req, res) => {
  try {
    const { projectId } = req.query;

    let query, params;

    if (projectId) {
      query = `
        SELECT DISTINCT ON (pa."ObjectId")
          pa."Name" as "name",
          COALESCE(
            (CASE WHEN pra."PlannedUnits" > 0 THEN (pra."ActualUnits" / pra."PlannedUnits") * 100 ELSE 0 END), 
            0
          ) as completion,
          GREATEST(0, EXTRACT(DAY FROM (COALESCE(pa."ActualFinishDate", CURRENT_DATE) - pa."PlannedFinishDate"))) as delay
        FROM p6_activities pa
        LEFT JOIN p6_resource_assignments pra ON pa."ObjectId" = pra."ActivityObjectId"
        WHERE pa."ProjectObjectId" = $1
          AND pa."PlannedFinishDate" IS NOT NULL
          AND (
              (pa."ActualFinishDate" > pa."PlannedFinishDate") 
              OR 
              (pa."ActualFinishDate" IS NULL AND CURRENT_DATE > pa."PlannedFinishDate")
          )
        ORDER BY pa."ObjectId", delay DESC
        LIMIT 10
      `;
      params = [projectId];
    } else {
      query = `
        SELECT 
          pa."Name" as "name",
          GREATEST(0, EXTRACT(DAY FROM (COALESCE(pa."ActualFinishDate", CURRENT_DATE) - pa."PlannedFinishDate"))) as delay
        FROM p6_activities pa
        WHERE pa."PlannedFinishDate" IS NOT NULL
          AND (
              (pa."ActualFinishDate" > pa."PlannedFinishDate") 
              OR 
              (pa."ActualFinishDate" IS NULL AND CURRENT_DATE > pa."PlannedFinishDate")
          )
        ORDER BY delay DESC
        LIMIT 10
      `;
      params = [];
    }

    const result = await pool.query(query, params);

    const data = result.rows.map(row => ({
      name: (row.name || 'Unknown').substring(0, 30),
      completion: parseFloat(row.completion || 0).toFixed(1),
      delay: Math.max(0, parseInt(row.delay || 0))
    }));

    res.json(data);
  } catch (error) {
    console.error('Error fetching completion-delay:', error);
    res.json([]);
  }
});

// 3. Approval Flow (Based on dpr_supervisor_entries)
router.get('/approval-flow', ensureAuthAndPool, async (req, res) => {
  try {
    const { projectId } = req.query;

    let query, params;

    if (projectId) {
      query = `
        SELECT
          TO_CHAR(submitted_at, 'DD-Mon') as name,
          SUM(CASE WHEN status = 'submitted_to_pm' THEN 1 ELSE 0 END) as submitted,
          SUM(CASE WHEN status IN ('approved_by_pm', 'final_approved') THEN 1 ELSE 0 END) as approved,
          SUM(CASE WHEN status LIKE '%rejected%' THEN 1 ELSE 0 END) as rejected
        FROM dpr_supervisor_entries
        WHERE project_id = $1
        GROUP BY 1, DATE(submitted_at)
        ORDER BY DATE(submitted_at) DESC
        LIMIT 7
      `;
      params = [projectId];
    } else {
      query = `
        SELECT
          TO_CHAR(submitted_at, 'DD-Mon') as name,
          SUM(CASE WHEN status = 'submitted_to_pm' THEN 1 ELSE 0 END) as submitted,
          SUM(CASE WHEN status IN ('approved_by_pm', 'final_approved') THEN 1 ELSE 0 END) as approved,
          SUM(CASE WHEN status LIKE '%rejected%' THEN 1 ELSE 0 END) as rejected
        FROM dpr_supervisor_entries
        GROUP BY 1, DATE(submitted_at)
        ORDER BY DATE(submitted_at) DESC
        LIMIT 7
      `;
      params = [];
    }

    const result = await pool.query(query, params);

    const data = result.rows.map(row => ({
      name: row.name,
      submitted: parseInt(row.submitted || 0),
      approved: parseInt(row.approved || 0),
      rejected: parseInt(row.rejected || 0)
    })).reverse(); // Reverse to show oldest first

    res.json(data);
  } catch (error) {
    console.error('Error fetching approval-flow:', error);
    res.json([]);
  }
});

// 4. Submission Trends
router.get('/submission-trends', ensureAuthAndPool, async (req, res) => {
  try {
    const { projectId } = req.query;

    let query, params;

    if (projectId) {
      query = `
        SELECT
          TO_CHAR(submitted_at, 'DD-Mon') as name,
          submitted_at::date as date,
          COUNT(*) as submissions
        FROM dpr_supervisor_entries
        WHERE project_id = $1 AND status != 'draft'
        GROUP BY 1, 2
        ORDER BY 2 DESC
        LIMIT 14
      `;
      params = [projectId];
    } else {
      query = `
        SELECT
          TO_CHAR(submitted_at, 'DD-Mon') as name,
          submitted_at::date as date,
          COUNT(*) as submissions
        FROM dpr_supervisor_entries
        WHERE status != 'draft'
        GROUP BY 1, 2
        ORDER BY 2 DESC
        LIMIT 14
      `;
      params = [];
    }

    const result = await pool.query(query, params);

    const data = result.rows.map(row => ({
      name: row.name,
      date: row.date,
      submissions: parseInt(row.submissions)
    })).reverse();

    res.json(data);
  } catch (error) {
    console.error('Error fetching submission-trends:', error);
    res.json([]);
  }
});

// 5. Rejection Distribution
router.get('/rejection-distribution', ensureAuthAndPool, async (req, res) => {
  try {
    const { projectId } = req.query;

    let query, params;

    if (projectId) {
      query = `
        SELECT
          COALESCE(rejection_reason, 'Other') as name,
          COUNT(*) as value
        FROM dpr_supervisor_entries
        WHERE project_id = $1
          AND status LIKE '%rejected%'
        GROUP BY 1
        ORDER BY value DESC
        LIMIT 5
      `;
      params = [projectId];
    } else {
      query = `
        SELECT
          COALESCE(rejection_reason, 'Other') as name,
          COUNT(*) as value
        FROM dpr_supervisor_entries
        WHERE status LIKE '%rejected%'
        GROUP BY 1
        ORDER BY value DESC
        LIMIT 5
      `;
      params = [];
    }

    const result = await pool.query(query, params);

    const data = result.rows.map(row => ({
      name: row.name || 'Unspecified',
      value: parseInt(row.value)
    }));

    res.json(data);
  } catch (error) {
    console.error('Error fetching rejection-distribution:', error);
    res.json([]);
  }
});

// 6. Bottlenecks (Delayed Resources/Contractors)
router.get('/bottlenecks', ensureAuthAndPool, async (req, res) => {
  try {
    const { projectId } = req.query;

    let query, params;

    if (projectId) {
      query = `
        SELECT 
          r."Name" as "name",
          SUM(GREATEST(0, EXTRACT(DAY FROM (COALESCE(pa."ActualFinishDate", CURRENT_DATE) - pa."PlannedFinishDate")))) as delay
        FROM p6_activities pa
        JOIN p6_resource_assignments pra ON pa."ObjectId" = pra."ActivityObjectId"
        JOIN p6_resources r ON pra."ResourceObjectId" = r."ObjectId"
        WHERE pa."ProjectObjectId" = $1
          AND pa."PlannedFinishDate" IS NOT NULL
          AND (pa."ActualFinishDate" > pa."PlannedFinishDate" OR (pa."ActualFinishDate" IS NULL AND CURRENT_DATE > pa."PlannedFinishDate"))
        GROUP BY r."Name"
        ORDER BY delay DESC
        LIMIT 5
      `;
      params = [projectId];
    } else {
      query = `
        SELECT 
          r."Name" as "name",
          SUM(GREATEST(0, EXTRACT(DAY FROM (COALESCE(pa."ActualFinishDate", CURRENT_DATE) - pa."PlannedFinishDate")))) as delay
        FROM p6_activities pa
        JOIN p6_resource_assignments pra ON pa."ObjectId" = pra."ActivityObjectId"
        JOIN p6_resources r ON pra."ResourceObjectId" = r."ObjectId"
        WHERE pa."PlannedFinishDate" IS NOT NULL
          AND (pa."ActualFinishDate" > pa."PlannedFinishDate" OR (pa."ActualFinishDate" IS NULL AND CURRENT_DATE > pa."PlannedFinishDate"))
        GROUP BY r."Name"
        ORDER BY delay DESC
        LIMIT 5
      `;
      params = [];
    }

    const result = await pool.query(query, params);

    const data = result.rows.map(row => ({
      name: (row.name || 'Unknown').substring(0, 20),
      delay: parseInt(row.delay || 0)
    }));

    res.json(data);
  } catch (error) {
    console.error('Error fetching bottlenecks:', error);
    res.json([]);
  }
});

// 7. Health Comparison (Cross Project)
router.get('/health-comparison', ensureAuthAndPool, async (req, res) => {
  try {
    const query = `
      SELECT
        p."Name" as "name",
        COALESCE(SUM(pra."PlannedUnits"), 0) as total_target,
        COALESCE(SUM(pra."ActualUnits"), 0) as total_actual
      FROM p6_projects p
      JOIN p6_activities pa ON p."ObjectId" = pa."ProjectObjectId"
      LEFT JOIN p6_resource_assignments pra ON pa."ObjectId" = pra."ActivityObjectId"
      GROUP BY p."Name"
      HAVING SUM(pra."PlannedUnits") > 0
      ORDER BY (COALESCE(SUM(pra."ActualUnits"), 0) / NULLIF(SUM(pra."PlannedUnits"), 0)) DESC
      LIMIT 10
    `;

    const result = await pool.query(query);

    const data = result.rows.map(row => ({
      name: (row.name || 'Unknown').substring(0, 15),
      health: Math.min(100, Math.round((parseFloat(row.total_actual) / parseFloat(row.total_target)) * 100))
    }));

    res.json(data);
  } catch (error) {
    console.error('Error fetching health-comparison:', error);
    res.json([]);
  }
});

// 8. Workflow Scatter
router.get('/workflow-scatter', ensureAuthAndPool, async (req, res) => {
  try {
    const { projectId } = req.query;

    let query, params;

    if (projectId) {
      query = `
        SELECT
          TO_CHAR(submitted_at, 'YYYY-MM-DD') as date,
          status,
          COUNT(*) as count
        FROM dpr_supervisor_entries
        WHERE project_id = $1 AND status != 'draft'
        GROUP BY 1, 2
        ORDER BY 1
      `;
      params = [projectId];
    } else {
      query = `
        SELECT
          TO_CHAR(submitted_at, 'YYYY-MM-DD') as date,
          status,
          COUNT(*) as count
        FROM dpr_supervisor_entries
        WHERE status != 'draft'
        GROUP BY 1, 2
        ORDER BY 1
        LIMIT 50
      `;
      params = [];
    }

    const result = await pool.query(query, params);

    const data = result.rows.map(row => ({
      date: row.date,
      status: row.status,
      count: parseInt(row.count),
      role: 'Supervisor',
      size: parseInt(row.count) * 2
    }));

    res.json(data);
  } catch (error) {
    console.error('Error fetching workflow-scatter:', error);
    res.json([]);
  }
});

module.exports = { router, setPool };