const express = require('express');
const router = express.Router();

let pool;
let authenticateToken;

// Set pool and authenticateToken from server
const setPool = (dbPool, authMiddleware) => {
    pool = dbPool;
    authenticateToken = authMiddleware;
};

// Middleware to check if user is Site PM or Admin (PMAG/Super Admin)
const ensurePMOrAdmin = (req, res, next) => {
    const allowedRoles = ['Site PM', 'PMAG', 'Super Admin'];
    if (!allowedRoles.includes(req.user.role)) {
        return res.status(403).json({ error: 'Access denied. Site PM or Admin required.' });
    }
    next();
};

/**
 * GET /api/issues
 * Get all issue logs (with filters)
 * Accessible by: Site PM, PMAG, Super Admin
 */
router.get('/', (req, res, next) => authenticateToken(req, res, next), ensurePMOrAdmin, async (req, res) => {
    try {
        const { status, priority, project_id, issue_type, limit = 50, offset = 0 } = req.query;

        let query = `
      SELECT 
        il.*,
        u1.name as created_by_name,
        u1.email as created_by_email,
        u2.name as assigned_to_name,
        u3.name as resolved_by_name,
        p.name as project_name
      FROM issue_logs il
      LEFT JOIN users u1 ON il.created_by = u1.user_id
      LEFT JOIN users u2 ON il.assigned_to = u2.user_id
      LEFT JOIN users u3 ON il.resolved_by = u3.user_id
      LEFT JOIN projects p ON il.project_id = p.id
      WHERE 1=1
    `;

        const params = [];
        let paramIndex = 1;

        if (status) {
            query += ` AND il.status = $${paramIndex++}`;
            params.push(status);
        }

        if (priority) {
            query += ` AND il.priority = $${paramIndex++}`;
            params.push(priority);
        }

        if (project_id) {
            query += ` AND il.project_id = $${paramIndex++}`;
            params.push(project_id);
        }

        if (issue_type) {
            query += ` AND il.issue_type = $${paramIndex++}`;
            params.push(issue_type);
        }

        query += ` ORDER BY 
      CASE il.priority 
        WHEN 'critical' THEN 1 
        WHEN 'high' THEN 2 
        WHEN 'medium' THEN 3 
        WHEN 'low' THEN 4 
      END,
      il.created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;

        params.push(limit, offset);

        const result = await pool.query(query, params);

        // Get total count
        let countQuery = 'SELECT COUNT(*) FROM issue_logs il WHERE 1=1';
        const countParams = [];
        let countParamIndex = 1;

        if (status) {
            countQuery += ` AND il.status = $${countParamIndex++}`;
            countParams.push(status);
        }
        if (priority) {
            countQuery += ` AND il.priority = $${countParamIndex++}`;
            countParams.push(priority);
        }
        if (project_id) {
            countQuery += ` AND il.project_id = $${countParamIndex++}`;
            countParams.push(project_id);
        }
        if (issue_type) {
            countQuery += ` AND il.issue_type = $${countParamIndex++}`;
            countParams.push(issue_type);
        }

        const countResult = await pool.query(countQuery, countParams);

        res.json({
            success: true,
            issues: result.rows,
            total: parseInt(countResult.rows[0].count),
            limit: parseInt(limit),
            offset: parseInt(offset)
        });
    } catch (error) {
        console.error('Error fetching issues:', error);
        res.status(500).json({ error: 'Failed to fetch issues', details: error.message });
    }
});

/**
 * GET /api/issues/stats/summary
 * Get issue statistics
 */
router.get('/stats/summary', (req, res, next) => authenticateToken(req, res, next), ensurePMOrAdmin, async (req, res) => {
    try {
        const stats = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'open') as open_count,
        COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress_count,
        COUNT(*) FILTER (WHERE status = 'resolved') as resolved_count,
        COUNT(*) FILTER (WHERE status = 'closed') as closed_count,
        COUNT(*) FILTER (WHERE priority = 'critical') as critical_count,
        COUNT(*) FILTER (WHERE priority = 'high') as high_count,
        COUNT(*) as total_count
      FROM issue_logs
    `);

        res.json({
            success: true,
            stats: stats.rows[0]
        });
    } catch (error) {
        console.error('Error fetching issue stats:', error);
        res.status(500).json({ error: 'Failed to fetch issue stats', details: error.message });
    }
});

/**
 * GET /api/issues/:id
 * Get a single issue by ID
 */
router.get('/:id', (req, res, next) => authenticateToken(req, res, next), ensurePMOrAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        const result = await pool.query(`
      SELECT 
        il.*,
        u1.name as created_by_name,
        u1.email as created_by_email,
        u2.name as assigned_to_name,
        u3.name as resolved_by_name,
        p.name as project_name
      FROM issue_logs il
      LEFT JOIN users u1 ON il.created_by = u1.user_id
      LEFT JOIN users u2 ON il.assigned_to = u2.user_id
      LEFT JOIN users u3 ON il.resolved_by = u3.user_id
      LEFT JOIN projects p ON il.project_id = p.id
      WHERE il.id = $1
    `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Issue not found' });
        }

        res.json({ success: true, issue: result.rows[0] });
    } catch (error) {
        console.error('Error fetching issue:', error);
        res.status(500).json({ error: 'Failed to fetch issue', details: error.message });
    }
});

/**
 * POST /api/issues
 * Create a new issue log
 * Accessible by: Any authenticated user
 */
router.post('/', (req, res, next) => authenticateToken(req, res, next), async (req, res) => {
    try {
        const {
            project_id,
            entry_id,
            sheet_type,
            issue_type = 'general',
            title,
            description,
            priority = 'medium',
            assigned_to
        } = req.body;

        if (!title || !description) {
            return res.status(400).json({ error: 'Title and description are required' });
        }

        const result = await pool.query(`
      INSERT INTO issue_logs (
        project_id, entry_id, sheet_type, issue_type, title, description, priority, status, created_by, assigned_to
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'open', $8, $9)
      RETURNING *
    `, [
            project_id || null,
            entry_id || null,
            sheet_type || null,
            issue_type,
            title,
            description,
            priority,
            req.user.userId,
            assigned_to || null
        ]);

        console.log(`Issue created by user ${req.user.userId}: ${title}`);

        res.status(201).json({
            success: true,
            message: 'Issue created successfully',
            issue: result.rows[0]
        });
    } catch (error) {
        console.error('Error creating issue:', error);
        res.status(500).json({ error: 'Failed to create issue', details: error.message });
    }
});

/**
 * PUT /api/issues/:id
 * Update an issue
 * Accessible by: Site PM, PMAG, Super Admin
 */
router.put('/:id', (req, res, next) => authenticateToken(req, res, next), ensurePMOrAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const {
            title,
            description,
            issue_type,
            priority,
            status,
            assigned_to,
            resolution_notes
        } = req.body;

        // Build dynamic update query
        const updates = [];
        const params = [];
        let paramIndex = 1;

        if (title !== undefined) {
            updates.push(`title = $${paramIndex++}`);
            params.push(title);
        }
        if (description !== undefined) {
            updates.push(`description = $${paramIndex++}`);
            params.push(description);
        }
        if (issue_type !== undefined) {
            updates.push(`issue_type = $${paramIndex++}`);
            params.push(issue_type);
        }
        if (priority !== undefined) {
            updates.push(`priority = $${paramIndex++}`);
            params.push(priority);
        }
        if (status !== undefined) {
            updates.push(`status = $${paramIndex++}`);
            params.push(status);

            // If status is resolved or closed, set resolved_by and resolved_at
            if (status === 'resolved' || status === 'closed') {
                updates.push(`resolved_by = $${paramIndex++}`);
                params.push(req.user.userId);
                updates.push(`resolved_at = CURRENT_TIMESTAMP`);
            }
        }
        if (assigned_to !== undefined) {
            updates.push(`assigned_to = $${paramIndex++}`);
            params.push(assigned_to);
        }
        if (resolution_notes !== undefined) {
            updates.push(`resolution_notes = $${paramIndex++}`);
            params.push(resolution_notes);
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        params.push(id);

        const result = await pool.query(`
      UPDATE issue_logs SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `, params);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Issue not found' });
        }

        res.json({
            success: true,
            message: 'Issue updated successfully',
            issue: result.rows[0]
        });
    } catch (error) {
        console.error('Error updating issue:', error);
        res.status(500).json({ error: 'Failed to update issue', details: error.message });
    }
});

/**
 * DELETE /api/issues/:id
 * Delete an issue
 * Accessible by: PMAG, Super Admin only
 */
router.delete('/:id', (req, res, next) => authenticateToken(req, res, next), async (req, res) => {
    try {
        // Only PMAG and Super Admin can delete
        if (!['PMAG', 'Super Admin'].includes(req.user.role)) {
            return res.status(403).json({ error: 'Only Admin can delete issues' });
        }

        const { id } = req.params;

        const result = await pool.query('DELETE FROM issue_logs WHERE id = $1 RETURNING *', [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Issue not found' });
        }

        res.json({
            success: true,
            message: 'Issue deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting issue:', error);
        res.status(500).json({ error: 'Failed to delete issue', details: error.message });
    }
});

module.exports = { router, setPool };
