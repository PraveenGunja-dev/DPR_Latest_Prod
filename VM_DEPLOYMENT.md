# Adani Flow - VM Cloud Deployment Guide

This document provides detailed instructions for deploying the Adani Flow application with PostgreSQL in a VM cloud environment.

## Prerequisites

| Requirement | Version | Purpose |
|------------|---------|---------|
| **Node.js** | 18.x or higher | Runtime for backend and frontend |
| **npm** | 9.x or higher | Package management |
| **PostgreSQL** | 14.x or higher | Database |
| **Git** | Latest | Version control |

## Environment Setup

### 1. Clone and Prepare Repository

```bash
# Clone the repository
git clone <repository-url>
cd adani-flow

# Copy environment template
cp .env.example .env
```

### 2. Configure Environment Variables

Edit the `.env` file with your specific configuration:

```env
# Frontend Configuration
VITE_API_BASE_URL=http://your-vm-ip:3002

# Oracle P6 Configuration
ORACLE_P6_AUTH_TOKEN=your_p6_auth_token_here
ORACLE_P6_BASE_URL=https://your-instance.p6.oraclecloud.com/your-tenant/p6ws/restapi

# Server Configuration
PORT=3002
NODE_ENV=production

# PostgreSQL Database Configuration
DB_HOST=your-vm-ip-or-localhost
DB_PORT=5432
DB_NAME=adani_flow
DB_USER=postgres
DB_PASSWORD=your_secure_password_here

# JWT Configuration
JWT_SECRET=generate_a_secure_random_string_here
REFRESH_TOKEN_SECRET=generate_another_secure_random_string_here
```

## PostgreSQL Setup Commands

### 1. Create Database

```bash
# Connect to PostgreSQL as superuser
psql -U postgres

# Create database
CREATE DATABASE adani_flow;

# Grant privileges (optional but recommended)
GRANT ALL PRIVILEGES ON DATABASE adani_flow TO postgres;

# Exit psql
\q
```

### 2. Run Database Migrations

```bash
# Navigate to backend directory
cd backend

# Run main schema
psql -U postgres -d adani_flow -f database/schema.sql

# Run P6 data schema
psql -U postgres -d adani_flow -f database/p6-data-schema.sql

# Run additional migrations
node database/run_p6_migrations.js
```

### 3. Run Individual Migration Scripts

If needed, run specific migration scripts separately:

```bash
# Run P6 schema rewrite migration
node database/migrations/run_p6_schema_rewrite.js

# Run new migrations (Activity Codes and Resources)
node database/migrations/run_new_migrations.js

# Run audit fields migration
node database/migrations/run_add_audit_fields.js

# Run UDF columns migration
node database/run-udf-migration.js

# Run system logs migration
psql -U postgres -d adani_flow -f database/migrations/add_system_logs_and_user_status.sql

# Run issue logs migration
psql -U postgres -d adani_flow -f database/migrations/007_issue_logs.sql

# Run cell comments migration
psql -U postgres -d adani_flow -f database/migrations/create_cell_comments.sql
```

## Installation Commands

### 1. Install Dependencies

```bash
# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

### 2. Build Frontend for Production

```bash
cd frontend
npm run build
```

## Data Synchronization Commands

### 1. Run Full P6 Data Sync

```bash
# Navigate to backend directory
cd backend

# Run full sync script (requires Oracle P6 credentials)
node scripts/full-sync.js
```

### 2. Sync Individual Components

```bash
# Sync projects only
node -e "
const { syncProjectsFromP6 } = require('./services/oracleP6SyncService');
const pool = require('./db');
syncProjectsFromP6(pool).then(result => console.log(result)).catch(console.error);
"
```

## Complete Deployment Script

We've provided a PowerShell script for Windows environments and a bash script for Linux environments to automate the entire deployment process.

### For Windows (PowerShell):

```powershell
# Run the deployment script
cd backend
.\deploy-postgres-setup.ps1
```

### For Linux:

```bash
# Make the script executable and run it
chmod +x deploy-postgres-setup.sh
./deploy-postgres-setup.sh
```

## Running the Application

### 1. Start Backend Server

```bash
cd backend
npm start
```

### 2. Serve Frontend

The frontend build is located in `frontend/dist`. You can serve it using:

#### Option A: Using a simple HTTP server
```bash
# Install a simple server globally
npm install -g http-server

# Serve the frontend
cd frontend/dist
http-server -p 8080
```

#### Option B: Using Nginx (recommended for production)
```nginx
server {
    listen 80;
    server_name your-domain.com;

    # Serve frontend
    location / {
        root /path/to/adani-flow/frontend/dist;
        try_files $uri $uri/ /index.html;
    }

    # Proxy API requests to backend
    location /api {
        proxy_pass http://localhost:3002;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Environment-Specific Commands for VM Deployment

### 1. Configure Firewall (Linux)

```bash
# Allow traffic on required ports
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 3002/tcp
sudo ufw allow 5432/tcp  # Only if DB is on same VM
```

### 2. Set up Process Manager (PM2) for Production

```bash
# Install PM2 globally
npm install -g pm2

# Create ecosystem file for PM2
cd backend
pm2 start ecosystem.config.js

# Or start directly
pm2 start server.js --name adani-flow-backend
pm2 startup  # Enable auto-start on boot
pm2 save     # Save current processes
```

### 3. PostgreSQL Optimization for Production

Add these settings to your PostgreSQL configuration (`postgresql.conf`):

```conf
# Connection settings
max_connections = 200

# Memory settings
shared_buffers = 256MB
effective_cache_size = 1GB
work_mem = 4MB
maintenance_work_mem = 64MB

# Logging
log_statement = 'all'
log_directory = 'log'
log_filename = 'postgresql-%Y-%m-%d_%H%M%S.log'
logging_collector = on
```

## Verification Commands

### 1. Check Database Connection

```bash
# Test database connection
psql -h your-db-host -U postgres -d adani_flow -c "SELECT NOW();"
```

### 2. Check Application Health

```bash
# Check if backend is responding
curl http://localhost:3002/health

# Check if frontend is accessible
curl http://your-frontend-url
```

### 3. Monitor Active Connections

```bash
# Check active connections to PostgreSQL
psql -U postgres -c "SELECT pid, usename, application_name, state, query FROM pg_stat_activity;"

# Check backend processes
pm2 status
```

## Troubleshooting

### Common Issues and Solutions

1. **Database Connection Failed**
   ```bash
   # Check if PostgreSQL is running
   systemctl status postgresql
   
   # Check connection
   pg_isready -h localhost -p 5432
   
   # Verify credentials
   psql -h localhost -U postgres -d adani_flow
   ```

2. **P6 API Errors**
   - Verify `ORACLE_P6_AUTH_TOKEN` is not expired
   - Check `ORACLE_P6_BASE_URL` format matches your instance
   - Ensure firewall allows outbound HTTPS to Oracle Cloud

3. **Frontend Build Errors**
   ```bash
   # Clear cache and rebuild
   cd frontend
   rm -rf node_modules
   npm install
   npm run build
   ```

4. **Permission Issues**
   ```bash
   # Ensure correct ownership
   chown -R www-data:www-data /path/to/frontend/dist
   chmod -R 755 /path/to/frontend/dist
   ```

## Security Best Practices

1. **Environment Variables**: Never commit sensitive information to version control
2. **Database Access**: Restrict database access to specific IP addresses
3. **HTTPS**: Always use HTTPS in production
4. **Regular Updates**: Keep all dependencies updated
5. **Backups**: Schedule regular database backups

### Example Backup Command:
```bash
# Backup database
pg_dump -U postgres -h localhost adani_flow > backup_$(date +%Y%m%d_%H%M%S).sql

# Schedule with cron
0 2 * * * pg_dump -U postgres -h localhost adani_flow > /backups/backup_$(date +\%Y\%m\%d).sql
```

## Performance Optimization

1. **Database Indexes**: Ensure proper indexing on frequently queried columns
2. **Connection Pooling**: Optimize database connection pool size
3. **Caching**: Implement Redis caching for frequently accessed data
4. **CDN**: Serve static assets through a CDN

## Rollback Procedure

If deployment fails, you can rollback using:

```bash
# Stop the application
pm2 stop adani-flow-backend

# Restore database from backup
psql -U postgres -d adani_flow < backup_file.sql

# Restart application
pm2 start adani-flow-backend
```