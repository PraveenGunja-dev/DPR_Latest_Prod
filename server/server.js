// server/server.js
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const path = require('path');

// Load environment variables from the root directory
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3001; // Changed from 3000 to 3001

// Security middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Log environment variables for debugging (only in development)
if (process.env.NODE_ENV !== 'production') {
  console.log('DB_HOST:', process.env.DB_HOST);
  console.log('DB_PORT:', process.env.DB_PORT);
  console.log('DB_NAME:', process.env.DB_NAME);
  console.log('DB_USER:', process.env.DB_USER);
  console.log('JWT_SECRET:', process.env.JWT_SECRET ? 'SET' : 'NOT SET');
  console.log('REFRESH_TOKEN_SECRET:', process.env.REFRESH_TOKEN_SECRET ? 'SET' : 'NOT SET');
}

// PostgreSQL connection pool
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  // Production-ready connection pool settings
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 2000, // Return an error after 2 seconds if connection could not be established
});

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

console.log('Loading dpr route...');
const dprRouteModule = require('./routes/dpr');
console.log('DPR route loaded:', dprRouteModule);

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
if (dprRouteModule.setPool) {
  console.log('Setting pool for dpr route...');
  dprRouteModule.setPool(pool, authenticateToken);
}
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
  setSsoPool(pool);
}
if (oracleP6RouteModule.setPool) {
  console.log('Setting pool for oracle p6 route...');
  oracleP6RouteModule.setPool(pool, authenticateToken);
}

// Register routes
console.log('Registering routes...');
app.use('/api/auth', authRouter);
// For routes that don't export a setPool function, we just use the router directly
app.use('/api/projects', projectsRouteModule.router || projectsRouteModule);
app.use('/api/activities', activitiesRouteModule.router || activitiesRouteModule);
app.use('/api/dpr', dprRouteModule.router || dprRouteModule);
app.use('/api/dpr-supervisor', dprSupervisorRouteModule.router || dprSupervisorRouteModule);
app.use('/api/project-assignment', projectAssignmentRouteModule.router || projectAssignmentRouteModule);
app.use('/api/sso', ssoRouter);
app.use('/api/oracle-p6', oracleP6RouteModule.router || oracleP6RouteModule);
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
app.get('/', (req, res) => {
  res.status(200).json({ 
    message: 'Adani Flow Backend API', 
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ 
    message: 'Internal server error',
    ...(process.env.NODE_ENV !== 'production' && { error: err.message })
  });
});

// 404 handler for undefined routes
app.use('*', (req, res) => {
  res.status(404).json({ 
    message: 'Route not found',
    path: req.originalUrl
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`NODE_ENV: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = { app, pool, authenticateToken };