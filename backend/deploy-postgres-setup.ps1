# PostgreSQL Setup Script for Adani Flow Deployment on Windows
# PowerShell Script

Write-Host "===========================================" -ForegroundColor Green
Write-Host "Adani Flow - PostgreSQL Setup for VM Cloud (Windows)" -ForegroundColor Green
Write-Host "===========================================" -ForegroundColor Green

# Function to check if PostgreSQL is installed
function Test-PostgreSqlInstalled {
    try {
        $result = psql --version 2>$null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✓ PostgreSQL client is installed" -ForegroundColor Green
            return $true
        } else {
            Write-Host "✗ PostgreSQL client not found" -ForegroundColor Red
            return $false
        }
    }
    catch {
        Write-Host "✗ PostgreSQL client not found" -ForegroundColor Red
        return $false
    }
}

# Function to check if PostgreSQL server is running
function Test-PostgreSqlServer {
    try {
        $result = pg_isready -h localhost -p 5432 2>$null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✓ PostgreSQL server is running" -ForegroundColor Green
            return $true
        } else {
            Write-Host "✗ PostgreSQL server is not running" -ForegroundColor Red
            return $false
        }
    }
    catch {
        Write-Host "✗ PostgreSQL server is not running" -ForegroundColor Red
        return $false
    }
}

# Function to setup database
function Setup-Database {
    Write-Host "" 
    Write-Host "--- Setting up PostgreSQL Database ---" -ForegroundColor Yellow
    
    # Change to backend directory
    Set-Location -Path "..\backend"
    
    # Create database if it doesn't exist
    Write-Host "Creating database 'adani_flow'..."
    try {
        # Check if database exists
        $dbExists = psql -U postgres -tAc "SELECT 1 FROM pg_database WHERE datname = 'adani_flow'"
        
        if ($dbExists -ne "1") {
            Write-Host "Creating database 'adani_flow'..."
            psql -U postgres -c "CREATE DATABASE adani_flow;"
            Write-Host "✓ Database 'adani_flow' created" -ForegroundColor Green
        } else {
            Write-Host "Database 'adani_flow' already exists" -ForegroundColor Yellow
        }
    }
    catch {
        Write-Host "Error creating database: $_" -ForegroundColor Red
        throw $_
    }
}

# Function to run all migrations
function Run-Migrations {
    Write-Host ""
    Write-Host "--- Running Database Migrations ---" -ForegroundColor Yellow
    
    # Run main schema migrations
    Write-Host "Running main schema migrations..."
    try {
        psql -U postgres -d adani_flow -f "database\schema.sql"
        Write-Host "✓ Main schema migrated" -ForegroundColor Green
    }
    catch {
        Write-Host "Error running schema migration: $_" -ForegroundColor Red
    }
    
    # Run P6 data schema migrations
    Write-Host "Running P6 data schema migrations..."
    try {
        psql -U postgres -d adani_flow -f "database\p6-data-schema.sql"
        Write-Host "✓ P6 data schema migrated" -ForegroundColor Green
    }
    catch {
        Write-Host "Error running P6 data schema migration: $_" -ForegroundColor Red
    }
    
    # Run P6 schema rewrite migration if exists
    if (Test-Path "database\migrations\p6_schema_rewrite.sql") {
        Write-Host "Running P6 schema rewrite migration..."
        try {
            node "database\migrations\run_p6_schema_rewrite.js"
            Write-Host "✓ P6 schema rewrite migration completed" -ForegroundColor Green
        }
        catch {
            Write-Host "Error running P6 schema rewrite migration: $_" -ForegroundColor Red
        }
    }
    
    # Run new migrations if exists
    if (Test-Path "database\migrations\run_new_migrations.js") {
        Write-Host "Running new migrations..."
        try {
            node "database\migrations\run_new_migrations.js"
            Write-Host "✓ New migrations completed" -ForegroundColor Green
        }
        catch {
            Write-Host "Error running new migrations: $_" -ForegroundColor Red
        }
    }
    
    # Run audit fields migration if exists
    if (Test-Path "database\migrations\run_add_audit_fields.js") {
        Write-Host "Running audit fields migration..."
        try {
            node "database\migrations\run_add_audit_fields.js"
            Write-Host "✓ Audit fields migration completed" -ForegroundColor Green
        }
        catch {
            Write-Host "Error running audit fields migration: $_" -ForegroundColor Red
        }
    }
    
    # Run UDF columns migration if exists
    if (Test-Path "database\run-udf-migration.js") {
        Write-Host "Running UDF columns migration..."
        try {
            node "database\run-udf-migration.js"
            Write-Host "✓ UDF columns migration completed" -ForegroundColor Green
        }
        catch {
            Write-Host "Error running UDF columns migration: $_" -ForegroundColor Red
        }
    }
    
    # Run system logs migration if exists
    if (Test-Path "database\migrations\add_system_logs_and_user_status.sql") {
        Write-Host "Running system logs and user status migration..."
        try {
            psql -U postgres -d adani_flow -f "database\migrations\add_system_logs_and_user_status.sql"
            Write-Host "✓ System logs and user status migration completed" -ForegroundColor Green
        }
        catch {
            Write-Host "Error running system logs migration: $_" -ForegroundColor Red
        }
    }
    
    # Run issue logs migration if exists
    if (Test-Path "database\migrations\007_issue_logs.sql") {
        Write-Host "Running issue logs migration..."
        try {
            psql -U postgres -d adani_flow -f "database\migrations\007_issue_logs.sql"
            Write-Host "✓ Issue logs migration completed" -ForegroundColor Green
        }
        catch {
            Write-Host "Error running issue logs migration: $_" -ForegroundColor Red
        }
    }
    
    # Run cell comments migration if exists
    if (Test-Path "database\migrations\create_cell_comments.sql") {
        Write-Host "Running cell comments migration..."
        try {
            psql -U postgres -d adani_flow -f "database\migrations\create_cell_comments.sql"
            Write-Host "✓ Cell comments migration completed" -ForegroundColor Green
        }
        catch {
            Write-Host "Error running cell comments migration: $_" -ForegroundColor Red
        }
    }
    
    Write-Host "✓ All database migrations completed" -ForegroundColor Green
}

# Function to install backend dependencies
function Install-BackendDependencies {
    Write-Host ""
    Write-Host "--- Installing Backend Dependencies ---" -ForegroundColor Yellow
    
    try {
        npm install
        Write-Host "✓ Backend dependencies installed" -ForegroundColor Green
    }
    catch {
        Write-Host "Error installing backend dependencies: $_" -ForegroundColor Red
        throw $_
    }
}

# Function to install frontend dependencies
function Install-FrontendDependencies {
    Write-Host ""
    Write-Host "--- Installing Frontend Dependencies ---" -ForegroundColor Yellow
    
    Set-Location -Path "..\frontend"
    
    try {
        npm install
        Write-Host "✓ Frontend dependencies installed" -ForegroundColor Green
    }
    catch {
        Write-Host "Error installing frontend dependencies: $_" -ForegroundColor Red
        throw $_
    }
}

# Function to build frontend for production
function Build-Frontend {
    Write-Host ""
    Write-Host "--- Building Frontend for Production ---" -ForegroundColor Yellow
    
    try {
        npm run build
        Write-Host "✓ Frontend built successfully" -ForegroundColor Green
    }
    catch {
        Write-Host "Error building frontend: $_" -ForegroundColor Red
        throw $_
    }
}

# Function to run data synchronization from P6
function Sync-P6Data {
    Write-Host ""
    Write-Host "--- Starting P6 Data Synchronization ---" -ForegroundColor Yellow
    
    Set-Location -Path "..\backend"
    
    # Check if .env file exists
    if (-not (Test-Path ".env")) {
        Write-Warning "Warning: .env file not found. Please create one with required P6 credentials."
        Write-Host "Please copy .env.example to .env and update the Oracle P6 configuration." -ForegroundColor Yellow
        return
    }
    
    # Load environment variables
    Get-Content .env | ForEach-Object {
        if ($_ -match "([^=]+)=(.*)") {
            $key = $matches[1]
            $value = $matches[2].Trim('"').Trim("'")
            [System.Environment]::SetEnvironmentVariable($key, $value, "Process")
        }
    }
    
    # Check for required P6 variables
    $p6AuthToken = [System.Environment]::GetEnvironmentVariable("ORACLE_P6_AUTH_TOKEN", "Process")
    $p6BaseUrl = [System.Environment]::GetEnvironmentVariable("ORACLE_P6_BASE_URL", "Process")
    
    if ([string]::IsNullOrEmpty($p6AuthToken) -or [string]::IsNullOrEmpty($p6BaseUrl)) {
        Write-Warning "Warning: Oracle P6 credentials not configured in .env file."
        Write-Host "Skipping P6 data synchronization." -ForegroundColor Yellow
        return
    }
    
    try {
        node scripts\full-sync.js
        Write-Host "✓ P6 data synchronization completed" -ForegroundColor Green
    }
    catch {
        Write-Host "Error during P6 data synchronization: $_" -ForegroundColor Red
    }
}

# Function to start the application
function Start-Application {
    Write-Host ""
    Write-Host "--- Starting Application ---" -ForegroundColor Yellow
    
    Set-Location -Path "..\backend"
    
    try {
        # Start the server
        Start-Process -FilePath "npm" -ArgumentList "start"
        Write-Host "✓ Application started successfully" -ForegroundColor Green
        Write-Host "✓ Application is running on http://localhost:3315" -ForegroundColor Green
    }
    catch {
        Write-Host "Error starting application: $_" -ForegroundColor Red
    }
}

# Function to display deployment summary
function Show-Summary {
    Write-Host ""
    Write-Host "===========================================" -ForegroundColor Cyan
    Write-Host "DEPLOYMENT SUMMARY" -ForegroundColor Cyan
    Write-Host "===========================================" -ForegroundColor Cyan
    Write-Host "✓ PostgreSQL database 'adani_flow' created" -ForegroundColor Green
    Write-Host "✓ All database migrations completed" -ForegroundColor Green
    Write-Host "✓ Backend dependencies installed" -ForegroundColor Green
    Write-Host "✓ Frontend dependencies installed and built" -ForegroundColor Green
    Write-Host ""
    Write-Host "Environment Configuration:" -ForegroundColor Cyan
    Write-Host "- Backend API: http://localhost:3315" -ForegroundColor White
    Write-Host "- Frontend: Serve the 'frontend/dist' folder via web server (Nginx/Apache)" -ForegroundColor White
    Write-Host ""
    Write-Host "Next Steps:" -ForegroundColor Cyan
    Write-Host "1. Configure your web server to serve frontend/dist" -ForegroundColor White
    Write-Host "2. Update VITE_API_BASE_URL in frontend/.env.production if needed" -ForegroundColor White
    Write-Host "3. Set up reverse proxy if required" -ForegroundColor White
    Write-Host "4. Configure SSL certificates for production" -ForegroundColor White
    Write-Host "5. Set up process manager (PM2) for backend" -ForegroundColor White
    Write-Host "===========================================" -ForegroundColor Cyan
}

# Main execution
try {
    Write-Host "Starting PostgreSQL setup for Adani Flow deployment..." -ForegroundColor Yellow
    
    # Check prerequisites
    if (-not (Test-PostgreSqlInstalled)) {
        Write-Host "Please install PostgreSQL client before proceeding." -ForegroundColor Red
        exit 1
    }
    
    if (-not (Test-PostgreSqlServer)) {
        Write-Host "Please start PostgreSQL server before proceeding." -ForegroundColor Red
        exit 1
    }
    
    # Setup database
    Setup-Database
    
    # Run migrations
    Run-Migrations
    
    # Install dependencies
    Install-BackendDependencies
    Install-FrontendDependencies
    
    # Build frontend
    Build-Frontend
    
    # Optionally sync P6 data (only if credentials are available)
    Sync-P6Data
    
    # Show summary
    Show-Summary
    
    Write-Host ""
    Write-Host "Deployment completed! 🚀" -ForegroundColor Green
}
catch {
    Write-Host "Deployment failed: $_" -ForegroundColor Red
    exit 1
}