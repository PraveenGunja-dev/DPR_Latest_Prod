// server/server.js
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const path = require('path');
const schedule = require('node-schedule');
// Load environment variables
const result = dotenv.config({ override: true });
if (result.error) {
  // If default load fails, try explicit path in backend folder
  const envPath = path.resolve(__dirname, '.env');
  console.log('Loading .env from explicit path:', envPath);
  const result2 = dotenv.config({ path: envPath, override: true });

  if (result2.error) {
    // Also try parent directory (root .env)
    const rootEnvPath = path.resolve(__dirname, '..', '.env');
    console.log('Loading .env from root path:', rootEnvPath);
    dotenv.config({ path: rootEnvPath, override: true });
  }
}

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3315;

// Security middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Middleware to strip /dpr-project prefix from API requests (fixing local dev 404s)
app.use((req, res, next) => {
  if (req.url.startsWith('/dpr-project/api')) {
    req.url = req.url.replace('/dpr-project/api', '/api');
  }
  next();
});

// ... logging code ...

// PostgreSQL connection pool
// Supports both DATABASE_URL (connection string) and individual PG* variables
const databaseUrl = process.env.DATABASE_URL;
const dbHost = process.env.PGHOST || process.env.DB_HOST;

// Validate that we have either DATABASE_URL or individual variables
if (!databaseUrl && (!dbHost || !process.env.PGUSER && !process.env.DB_USER)) {
  console.error('ERROR: Missing required database environment variables!');
  console.error('Either set DATABASE_URL or set PGHOST, PGUSER, PGPASSWORD');
  process.exit(1);
}

// Determine if connection is local (for SSL config when using individual vars)
const isLocal = dbHost === 'localhost' || dbHost === '127.0.0.1';

// Build pool configuration
let poolConfig;
if (databaseUrl) {
  console.log('Using DATABASE_URL connection string');
  poolConfig = {
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 15000,
  };
} else {
  const dbPort = process.env.PGPORT || process.env.DB_PORT;
  const dbName = process.env.PGDATABASE || process.env.DB_NAME;
  const dbUser = process.env.PGUSER || process.env.DB_USER;
  const dbPassword = process.env.PGPASSWORD || process.env.DB_PASSWORD;

  console.log(`Configuring DB Connection to: ${dbHost} (SSL: ${!isLocal})`);

  poolConfig = {
    host: dbHost,
    port: parseInt(dbPort, 10) || 5432,
    database: dbName || 'postgres',
    user: dbUser,
    password: dbPassword,
    ssl: isLocal ? false : { rejectUnauthorized: false },
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 15000,
  };
}

// PostgreSQL connection pool
const pool = new Pool(poolConfig);

// Test database connection
const testDatabaseConnection = () => {
  pool.query('SELECT NOW()', (err, res) => {
    if (err) {
      console.error('Database connection error:', err.message);
      if (process.env.NODE_ENV !== 'production') {
        console.log('Retrying in 5 seconds...');
        setTimeout(testDatabaseConnection, 5000); // Retry after 5 seconds
      }
    } else {
      console.log('Database connected successfully');
    }
  });
};

// Test database connection
testDatabaseConnection();

// Run database migrations on startup
const runMigrations = async () => {
  console.log('Running database migrations...');
  try {
    // Drop the foreign key constraint on project_id to support P6 projects
    await pool.query(`
      ALTER TABLE dpr_supervisor_entries 
      DROP CONSTRAINT IF EXISTS dpr_supervisor_entries_project_id_fkey
    `);

    // Drop the foreign key constraint on project_assignments to support P6 projects
    await pool.query(`
        ALTER TABLE project_assignments 
        DROP CONSTRAINT IF EXISTS project_assignments_project_id_fkey
    `);

    // Ensure project_id is BIGINT to accommodate P6 ObjectIds
    await pool.query('ALTER TABLE project_assignments ALTER COLUMN project_id TYPE BIGINT');
    await pool.query('ALTER TABLE dpr_supervisor_entries ALTER COLUMN project_id TYPE BIGINT');
    try {
      await pool.query('ALTER TABLE dpr_sheets ALTER COLUMN project_id TYPE BIGINT');
    } catch (e) { /* ignore if table missing */ }

    // Add sheet_types column to project_assignments if it doesn't exist
    await pool.query(`
      ALTER TABLE project_assignments 
      ADD COLUMN IF NOT EXISTS sheet_types JSONB
    `);

    // Ensure p6_projects table has all necessary columns for sync
    await pool.query(`ALTER TABLE p6_projects ADD COLUMN IF NOT EXISTS "Description" TEXT`);
    await pool.query(`ALTER TABLE p6_projects ADD COLUMN IF NOT EXISTS "PlannedStartDate" TIMESTAMP WITH TIME ZONE`);
    await pool.query(`ALTER TABLE p6_projects ADD COLUMN IF NOT EXISTS "PlannedFinishDate" TIMESTAMP WITH TIME ZONE`);
    await pool.query(`ALTER TABLE p6_projects ADD COLUMN IF NOT EXISTS "DataDate" TIMESTAMP WITH TIME ZONE`);
    await pool.query(`ALTER TABLE p6_projects ALTER COLUMN "ObjectId" TYPE BIGINT`);

    // Ensure p6_projects and p6_activities columns are BIGINT for large Object IDs
    console.log('Ensuring P6 tables use BIGINT for Object IDs...');
    try {
      // p6_projects
      await pool.query('ALTER TABLE p6_projects ALTER COLUMN "ObjectId" TYPE BIGINT');

      // p6_activities
      await pool.query('ALTER TABLE p6_activities ALTER COLUMN "ObjectId" TYPE BIGINT');
      await pool.query('ALTER TABLE p6_activities ALTER COLUMN "ProjectObjectId" TYPE BIGINT');
      await pool.query('ALTER TABLE p6_activities ALTER COLUMN "WBSObjectId" TYPE BIGINT');

      // Other P6 metadata tables
      try { await pool.query('ALTER TABLE p6_wbs ALTER COLUMN object_id TYPE BIGINT'); } catch (e) { }
      try { await pool.query('ALTER TABLE p6_wbs ALTER COLUMN project_object_id TYPE BIGINT'); } catch (e) { }
      try { await pool.query('ALTER TABLE p6_wbs ALTER COLUMN parent_object_id TYPE BIGINT'); } catch (e) { }
      try { await pool.query('ALTER TABLE p6_resource_assignments ALTER COLUMN object_id TYPE BIGINT'); } catch (e) { }
      try { await pool.query('ALTER TABLE p6_resource_assignments ALTER COLUMN project_object_id TYPE BIGINT'); } catch (e) { }
      try { await pool.query('ALTER TABLE p6_resource_assignments ALTER COLUMN activity_object_id TYPE BIGINT'); } catch (e) { }
      try { await pool.query('ALTER TABLE p6_resource_assignments ALTER COLUMN resource_object_id TYPE BIGINT'); } catch (e) { }
      try { await pool.query('ALTER TABLE p6_activity_codes ALTER COLUMN "ObjectId" TYPE BIGINT'); } catch (e) { }
      try { await pool.query('ALTER TABLE p6_activity_code_assignments ALTER COLUMN "ObjectId" TYPE BIGINT'); } catch (e) { }
      try { await pool.query('ALTER TABLE p6_activity_code_assignments ALTER COLUMN "ActivityObjectId" TYPE BIGINT'); } catch (e) { }
      try { await pool.query('ALTER TABLE p6_activity_code_assignments ALTER COLUMN "ActivityCodeObjectId" TYPE BIGINT'); } catch (e) { }
    } catch (e) {
      console.warn('One or more P6 tables or columns missing for BIGINT conversion:', e.message);
    }

    // Add audit tracking fields to dpr_supervisor_entries if they don't exist
    await pool.query(`
      ALTER TABLE dpr_supervisor_entries 
      ADD COLUMN IF NOT EXISTS submitted_by INTEGER REFERENCES users(user_id)
    `);
    await pool.query(`
      ALTER TABLE dpr_supervisor_entries 
      ADD COLUMN IF NOT EXISTS pm_reviewed_at TIMESTAMP
    `);
    await pool.query(`
      ALTER TABLE dpr_supervisor_entries 
      ADD COLUMN IF NOT EXISTS pm_reviewed_by INTEGER REFERENCES users(user_id)
    `);
    await pool.query(`
      ALTER TABLE dpr_supervisor_entries 
      ADD COLUMN IF NOT EXISTS rejection_reason TEXT
    `);
    await pool.query(`
      ALTER TABLE dpr_supervisor_entries 
      ADD COLUMN IF NOT EXISTS pushed_at TIMESTAMP
    `);
    await pool.query(`
      ALTER TABLE dpr_supervisor_entries 
      ADD COLUMN IF NOT EXISTS pushed_by INTEGER REFERENCES users(user_id)
    `);

    // Create cell_comments table for cell-level commenting
    await pool.query(`
      CREATE TABLE IF NOT EXISTS cell_comments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        sheet_id INTEGER NOT NULL,
        row_index INTEGER NOT NULL,
        column_key VARCHAR(100) NOT NULL,
        parent_comment_id UUID REFERENCES cell_comments(id) ON DELETE CASCADE,
        comment_text TEXT NOT NULL,
        comment_type VARCHAR(20) NOT NULL CHECK (comment_type IN ('REJECTION', 'GENERAL')),
        created_by INTEGER NOT NULL REFERENCES users(user_id),
        role VARCHAR(50) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        is_deleted BOOLEAN DEFAULT FALSE
      )
    `);

    // Create indexes for cell_comments
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_cell_comments_cell ON cell_comments(sheet_id, row_index, column_key)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_cell_comments_sheet ON cell_comments(sheet_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_cell_comments_parent ON cell_comments(parent_comment_id)`);

    // Add P6 UDF columns to p6_activities table
    console.log('Adding P6 UDF columns to p6_activities...');
    await pool.query(`ALTER TABLE p6_activities ADD COLUMN IF NOT EXISTS total_quantity DECIMAL(15,4)`);
    await pool.query(`ALTER TABLE p6_activities ADD COLUMN IF NOT EXISTS uom VARCHAR(50)`);
    await pool.query(`ALTER TABLE p6_activities ADD COLUMN IF NOT EXISTS block_capacity DECIMAL(15,4)`);
    await pool.query(`ALTER TABLE p6_activities ADD COLUMN IF NOT EXISTS phase VARCHAR(255)`);
    await pool.query(`ALTER TABLE p6_activities ADD COLUMN IF NOT EXISTS spv_no VARCHAR(100)`);
    await pool.query(`ALTER TABLE p6_activities ADD COLUMN IF NOT EXISTS scope TEXT`);
    await pool.query(`ALTER TABLE p6_activities ADD COLUMN IF NOT EXISTS hold VARCHAR(100)`);
    await pool.query(`ALTER TABLE p6_activities ADD COLUMN IF NOT EXISTS front VARCHAR(255)`);

    // Create issue_logs table for issue tracking
    console.log('Creating issue_logs table if not exists...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS issue_logs (
        id SERIAL PRIMARY KEY,
        project_id INTEGER,
        entry_id INTEGER,
        sheet_type VARCHAR(50),
        issue_type VARCHAR(50) NOT NULL DEFAULT 'general',
        title VARCHAR(255) NOT NULL,
        description TEXT NOT NULL,
        priority VARCHAR(20) NOT NULL DEFAULT 'medium',
        status VARCHAR(20) NOT NULL DEFAULT 'open',
        created_by INTEGER NOT NULL,
        assigned_to INTEGER,
        resolved_by INTEGER,
        resolved_at TIMESTAMP,
        resolution_notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_issue_logs_status ON issue_logs(status)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_issue_logs_priority ON issue_logs(priority)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_issue_logs_created_at ON issue_logs(created_at)`);

    // Create dpr_daily_progress table for tracking daily performance
    console.log('Creating dpr_daily_progress table if not exists...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS dpr_daily_progress (
        id SERIAL PRIMARY KEY,
        activity_object_id BIGINT NOT NULL,
        progress_date DATE NOT NULL,
        today_value DECIMAL(15,4) DEFAULT 0,
        cumulative_value DECIMAL(15,4) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(activity_object_id, progress_date)
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_dpr_daily_progress_date ON dpr_daily_progress(progress_date)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_dpr_daily_progress_activity ON dpr_daily_progress(activity_object_id)`);

    // SSO and Access Request tables
    console.log('Creating SSO-related tables...');
    
    // Add SSO columns to users table
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS sso_provider VARCHAR(50)`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS azure_oid VARCHAR(255)`);
    
    // Allow 'pending_approval' role and 'admin' role
    // First try dropping and re-adding the constraint
    try {
      await pool.query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check`);
      await pool.query(`ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('supervisor', 'Site PM', 'PMAG', 'admin', 'Super Admin', 'pending_approval'))`);
    } catch (e) {
      console.warn('Could not update role constraint (may already be correct):', e.message);
    }

    // Make password nullable for SSO users
    try {
      await pool.query(`ALTER TABLE users ALTER COLUMN password DROP NOT NULL`);
    } catch (e) {
      // Ignore if already nullable
    }

    // Create access_requests table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS access_requests (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        requested_role VARCHAR(50) NOT NULL,
        justification TEXT,
        status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
        reviewed_by INTEGER REFERENCES users(user_id) ON DELETE SET NULL,
        review_notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        reviewed_at TIMESTAMP
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_access_requests_status ON access_requests(status)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_access_requests_user_id ON access_requests(user_id)`);

    console.log('✓ Migrations completed successfully');
  } catch (error) {
    console.error('Migration error (non-fatal):', error.message);
  }
};

// Run migrations after a short delay to ensure DB connection is ready
setTimeout(runMigrations, 2000);

// Import Redis cache with error handling
let cache;
try {
  const redisModule = require('./cache/redisClient');
  cache = redisModule.cache;
} catch (error) {
  console.warn('Redis cache not available, using dummy cache implementation');
  // Dummy cache implementation that does nothing
  cache = {
    get: async () => null,
    set: async () => true,
    del: async () => true,
    flushAll: async () => true
  };
}

// Authentication middleware - Oracle P6 API compatible
// Supports both Bearer token (JWT) and session-based authentication
const authenticateToken = (req, res, next) => {
  console.log('Authentication middleware called for:', req.path);

  // Check for Authorization header with Bearer token (JWT)
  const authHeader = req.headers['authorization'];
  let token = authHeader && authHeader.split(' ')[1];

  // If no Bearer token, check for custom token header (Oracle P6 style)
  if (!token) {
    token = req.headers['x-adani-token'] || req.headers['x-p6-token'];
  }

  // If still no token, check for token in query parameters (less secure but Oracle P6 compatible)
  if (!token) {
    token = req.query.token;
  }

  if (!token) {
    console.log('No token found in request');
    return res.status(401).json({
      message: 'Access token required',
      // Oracle P6 compatible error format
      error: {
        code: 'AUTH_TOKEN_MISSING',
        description: 'Authentication token is required'
      }
    });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'adani_flow_secret_key', (err, user) => {
    if (err) {
      console.log('Token verification failed:', err);
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
          message: 'Token expired',
          error: {
            code: 'AUTH_TOKEN_EXPIRED',
            description: 'Authentication token has expired'
          }
        });
      }
      return res.status(403).json({
        message: 'Invalid token',
        error: {
          code: 'AUTH_TOKEN_INVALID',
          description: 'Authentication token is invalid'
        }
      });
    }
    console.log('Token verified, user:', user);
    req.user = user; // Attach the decoded user data to the request object
    next();
  });
};

// Import and register routes with the pool and middleware
console.log('Loading auth route...');
const { router: authRouter, setPool: setAuthPool } = require('./routes/auth');
console.log('Auth route loaded:', !!authRouter, !!setAuthPool);

console.log('Loading projects route...');
const projectsRouteModule = require('./routes/projects');
console.log('Projects route loaded:', projectsRouteModule);

console.log('Loading activities route...');
const activitiesRouteModule = require('./routes/activities');
console.log('Activities route loaded:', activitiesRouteModule);

// console.log('Loading dpr route...');
// const dprRouteModule = require('./routes/dpr');
// console.log('DPR route loaded:', dprRouteModule);

console.log('Loading dpr supervisor route...');
const dprSupervisorRouteModule = require('./routes/dprSupervisor');
console.log('DPR supervisor route loaded:', dprSupervisorRouteModule);

console.log('Loading project assignment route...');
const projectAssignmentRouteModule = require('./routes/projectAssignment');
console.log('Project assignment route loaded:', projectAssignmentRouteModule);

console.log('Loading sso route...');
const { router: ssoRouter, setPool: setSsoPool } = require('./routes/sso');
console.log('SSO route loaded:', !!ssoRouter, !!setSsoPool);

console.log('Loading oracle p6 route...');
const oracleP6RouteModule = require('./routes/oracleP6');
console.log('Oracle P6 route loaded:', oracleP6RouteModule);

console.log('Loading super admin route...');
const superAdminRouteModule = require('./routes/superAdmin');
console.log('Super Admin route loaded:', superAdminRouteModule);

// console.log('Loading custom sheets route...');
// const customSheetsRouteModule = require('./routes/customSheets');
// console.log('Custom sheets route loaded:', customSheetsRouteModule);

// console.log('Loading MMS & RFI route...');
// const mmsRfiRouteModule = require('./routes/mmsRfi');
// console.log('MMS & RFI route loaded:', mmsRfiRouteModule);

console.log('Loading issues route...');
const issuesRouteModule = require('./routes/issues');
console.log('Issues route loaded:', issuesRouteModule);

// Set the pool for each router that supports it
if (setAuthPool) {
  console.log('Setting pool for auth route...');
  setAuthPool(pool, authenticateToken);
}
if (projectsRouteModule.setPool) {
  console.log('Setting pool for projects route...');
  projectsRouteModule.setPool(pool, authenticateToken);
}
if (activitiesRouteModule.setPool) {
  console.log('Setting pool for activities route...');
  activitiesRouteModule.setPool(pool, authenticateToken);
}
// if (dprRouteModule.setPool) {
//   console.log('Setting pool for dpr route...');
//   dprRouteModule.setPool(pool, authenticateToken);
// }
if (dprSupervisorRouteModule.setPool) {
  console.log('Setting pool for dpr supervisor route...');
  dprSupervisorRouteModule.setPool(pool, authenticateToken);
}
if (projectAssignmentRouteModule.setPool) {
  console.log('Setting pool for project assignment route...');
  projectAssignmentRouteModule.setPool(pool, authenticateToken);
}
if (setSsoPool) {
  console.log('Setting pool for sso route...');
  setSsoPool(pool, authenticateToken);
}
if (oracleP6RouteModule.setPool) {
  console.log('Setting pool for oracle p6 route...');
  oracleP6RouteModule.setPool(pool, authenticateToken);
}
if (superAdminRouteModule.setPool) {
  console.log('Setting pool for super admin route...');
  superAdminRouteModule.setPool(pool, authenticateToken);
}

// if (customSheetsRouteModule.setPool) {
//   console.log('Setting pool for custom sheets route...');
//   customSheetsRouteModule.setPool(pool, authenticateToken);
// }

// if (mmsRfiRouteModule.setPool) {
//   console.log('Setting pool for MMS & RFI route...');
//   mmsRfiRouteModule.setPool(pool, authenticateToken);
// }

if (issuesRouteModule.setPool) {
  console.log('Setting pool for issues route...');
  issuesRouteModule.setPool(pool, authenticateToken);
}

// Initialize system logger
const { setPool: setLoggerPool } = require('./utils/systemLogger');
setLoggerPool(pool);

// Register routes
console.log('Registering routes...');
app.use('/api/auth', authRouter);
// For routes that don't export a setPool function, we just use the router directly
app.use('/api/projects', projectsRouteModule.router || projectsRouteModule);
app.use('/api/activities', activitiesRouteModule.router || activitiesRouteModule);
// app.use('/api/dpr', dprRouteModule.router || dprRouteModule);
app.use('/api/dpr-supervisor', dprSupervisorRouteModule.router || dprSupervisorRouteModule);
app.use('/api/project-assignment', projectAssignmentRouteModule.router || projectAssignmentRouteModule);
app.use('/api/sso', ssoRouter);
app.use('/api/oracle-p6', oracleP6RouteModule.router || oracleP6RouteModule);
app.use('/api/super-admin', superAdminRouteModule.router || superAdminRouteModule);
// app.use('/api/custom-sheets', customSheetsRouteModule.router || customSheetsRouteModule);
// app.use('/api/mms-rfi', mmsRfiRouteModule.router || mmsRfiRouteModule);
app.use('/api/issues', issuesRouteModule.router || issuesRouteModule);

// Register charts route
const chartsRouteModule = require('./routes/charts');
chartsRouteModule.setPool(pool, authenticateToken);
app.use('/api/charts', chartsRouteModule.router || chartsRouteModule);

// Register cell comments route
console.log('Loading cell comments route...');
const cellCommentsRouteModule = require('./routes/cellComments');
cellCommentsRouteModule.setPool(pool, authenticateToken);
app.use('/api/cell-comments', cellCommentsRouteModule.router || cellCommentsRouteModule);
console.log('Cell comments route registered.');

// Register DPR Activities route (clean P6 data API)
console.log('Loading dpr activities route...');
const dprActivitiesRouteModule = require('./routes/dprActivities');
dprActivitiesRouteModule.setPool(pool, authenticateToken);
app.use('/api/dpr-activities', dprActivitiesRouteModule.router || dprActivitiesRouteModule);
console.log('DPR Activities route registered.');

// Register P6 Token route
console.log('Loading P6 token route...');
const p6TokenRouteModule = require('./routes/p6Token');
if (p6TokenRouteModule.setPool) {
  console.log('Setting pool for P6 token route...');
  p6TokenRouteModule.setPool(pool, authenticateToken);
}
app.use('/api/p6-token', p6TokenRouteModule.router || p6TokenRouteModule);
console.log('P6 Token route registered.');

console.log('Routes registered.');

// Refresh token endpoint
app.post('/refresh-token', async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(401).json({ message: 'Refresh token required' });
  }

  try {
    // Verify refresh token
    const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET || 'adani_flow_refresh_secret_key');

    // In production, check if refresh token exists in database/Redis
    // For now, we'll assume it's valid

    // Generate new tokens
    const accessToken = jwt.sign(
      { userId: decoded.userId, email: decoded.email, role: decoded.role },
      process.env.JWT_SECRET || 'adani_flow_secret_key',
      { expiresIn: '15m' }
    );

    res.json({
      accessToken
    });
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Refresh token expired' });
    }
    res.status(403).json({ message: 'Invalid refresh token' });
  }
});

// Logout endpoint
app.post('/logout', (req, res) => {
  // In a real implementation, you would invalidate the refresh token
  // For now, we'll just send a success response
  res.status(200).json({ message: 'Logout successful' });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Root endpoint for basic server info
// app.get('/', (req, res) => {
//   res.status(200).json({
//     message: 'Adani Flow Backend API',
//     version: '1.0.0',
//     timestamp: new Date().toISOString()
//   });
// });

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    message: 'Internal server error',
    ...(process.env.NODE_ENV !== 'production' && { error: err.message })
  });
});

// Serve static files from the React frontend app
const frontendBuildPath = path.join(__dirname, '..', 'frontend', 'dist');

// Middleware to serve static files under /dpr-project
app.use('/dpr-project', express.static(frontendBuildPath));
app.use(express.static(frontendBuildPath)); // Fallback if they access root

// Catch-all for API 404s
app.use('/api/*', (req, res) => {
  res.status(404).json({
    message: 'API Route not found',
    path: req.originalUrl
  });
});

// Any other GET request not handled gets the React app
app.get('/dpr-project/*', (req, res) => {
  res.sendFile(path.join(frontendBuildPath, 'index.html'));
});

// Fallback for root React app
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendBuildPath, 'index.html'));
});

// Schedule the automatic approval job to run daily at midnight
const { autoApprovePendingSheets } = require('./jobs/automaticApprovalJob');
const job = schedule.scheduleJob('0 0 * * *', function () {
  console.log('Scheduled automatic approval job triggered');
  autoApprovePendingSheets();
});

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`NODE_ENV: ${process.env.NODE_ENV || 'development'}`);
  console.log('Automatic approval job scheduled to run daily at midnight');
});
module.exports = { app, pool, authenticateToken };