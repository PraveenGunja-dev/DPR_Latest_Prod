#!/bin/bash
# PostgreSQL Setup Script for Adani Flow Deployment

set -e  # Exit on any error

echo "==========================================="
echo "Adani Flow - PostgreSQL Setup for VM Cloud"
echo "==========================================="

# Check if running on Windows (PowerShell/CMD)
if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" ]]; then
    echo "Detected Windows environment"
    export PLATFORM="windows"
else
    export PLATFORM="linux"
fi

# Function to check if PostgreSQL is installed
check_postgres() {
    if command -v psql &> /dev/null; then
        echo "✓ PostgreSQL client is installed"
        return 0
    else
        echo "✗ PostgreSQL client not found"
        return 1
    fi
}

# Function to check if PostgreSQL server is running
check_postgres_server() {
    if pg_isready -h localhost -p 5432 &> /dev/null; then
        echo "✓ PostgreSQL server is running"
        return 0
    else
        echo "✗ PostgreSQL server is not running"
        return 1
    fi
}

# Function to create database and run migrations
setup_database() {
    echo ""
    echo "--- Setting up PostgreSQL Database ---"
    
    # Create database if it doesn't exist
    echo "Creating database 'adani_flow'..."
    psql -U postgres -c "CREATE DATABASE IF NOT EXISTS adani_flow;" 2>/dev/null || \
    psql -U postgres -c "SELECT 'Database already exists' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'adani_flow');"
    
    # Alternative way to check and create database on Windows
    if [ "$PLATFORM" = "windows" ]; then
        # On Windows, the above command might not work, try direct approach
        echo "Checking if database exists..."
        RESULT=$(psql -U postgres -tAc "SELECT 1 FROM pg_database WHERE datname = 'adani_flow'")
        if [ "$RESULT" != "1" ]; then
            echo "Creating database 'adani_flow'..."
            psql -U postgres -c "CREATE DATABASE adani_flow;"
        else
            echo "Database 'adani_flow' already exists"
        fi
    fi
    
    echo "✓ Database setup complete"
}

# Function to run all migrations
run_migrations() {
    echo ""
    echo "--- Running Database Migrations ---"
    
    cd backend
    
    # Run main schema migrations
    echo "Running main schema migrations..."
    psql -U postgres -d adani_flow -f database/schema.sql
    echo "✓ Main schema migrated"
    
    # Run P6 data schema migrations
    echo "Running P6 data schema migrations..."
    psql -U postgres -d adani_flow -f database/p6-data-schema.sql
    echo "✓ P6 data schema migrated"
    
    # Run additional migrations
    echo "Running additional migrations..."
    
    # Check if specific migration files exist and run them
    if [ -f "database/migrations/p6_schema_rewrite.sql" ]; then
        psql -U postgres -d adani_flow -f database/migrations/p6_schema_rewrite.sql
        echo "✓ P6 schema rewrite migration completed"
    fi
    
    # Run migration scripts via Node.js
    if [ -f "database/migrations/run_new_migrations.js" ]; then
        node database/migrations/run_new_migrations.js
        echo "✓ New migrations completed"
    fi
    
    # Run UDF migration
    if [ -f "database/migrations/run_add_audit_fields.js" ]; then
        node database/migrations/run_add_audit_fields.js
        echo "✓ Audit fields migration completed"
    fi
    
    # Run UDF columns migration
    if [ -f "database/run-udf-migration.js" ]; then
        node database/run-udf-migration.js
        echo "✓ UDF columns migration completed"
    fi
    
    # Run system logs and user status migration
    if [ -f "database/migrations/add_system_logs_and_user_status.sql" ]; then
        psql -U postgres -d adani_flow -f database/migrations/add_system_logs_and_user_status.sql
        echo "✓ System logs and user status migration completed"
    fi
    
    # Run issue logs migration
    if [ -f "database/migrations/007_issue_logs.sql" ]; then
        psql -U postgres -d adani_flow -f database/migrations/007_issue_logs.sql
        echo "✓ Issue logs migration completed"
    fi
    
    # Run cell comments migration
    if [ -f "database/migrations/create_cell_comments.sql" ]; then
        psql -U postgres -d adani_flow -f database/migrations/create_cell_comments.sql
        echo "✓ Cell comments migration completed"
    fi
    
    # Run extra fields migration
    if [ -f "database/migrations/008_issue_logs_extra_fields.sql" ]; then
        psql -U postgres -d adani_flow -f database/migrations/008_issue_logs_extra_fields.sql
        echo "✓ Issue logs extra fields migration completed"
    fi
    
    # Run rejections reason migration
    if [ -f "database/migrations/add_rejection_reason_column.sql" ]; then
        psql -U postgres -d adani_flow -f database/migrations/add_rejection_reason_column.sql
        echo "✓ Rejection reason column migration completed"
    fi
    
    echo "✓ All database migrations completed"
}

# Function to install backend dependencies
install_backend_deps() {
    echo ""
    echo "--- Installing Backend Dependencies ---"
    
    cd backend
    npm install
    echo "✓ Backend dependencies installed"
}

# Function to install frontend dependencies
install_frontend_deps() {
    echo ""
    echo "--- Installing Frontend Dependencies ---"
    
    cd frontend
    npm install
    echo "✓ Frontend dependencies installed"
}

# Function to build frontend for production
build_frontend() {
    echo ""
    echo "--- Building Frontend for Production ---"
    
    cd frontend
    npm run build
    echo "✓ Frontend built successfully"
}

# Function to run data synchronization from P6
sync_p6_data() {
    echo ""
    echo "--- Starting P6 Data Synchronization ---"
    
    cd backend
    
    # Check if .env file exists and has required variables
    if [ ! -f ".env" ]; then
        echo "⚠️  Warning: .env file not found. Please create one with required P6 credentials."
        echo "Please copy .env.example to .env and update the Oracle P6 configuration."
        return 1
    fi
    
    # Source environment variables
    export $(grep -v '^#' .env | xargs)
    
    # Validate required environment variables
    if [ -z "$ORACLE_P6_AUTH_TOKEN" ] || [ -z "$ORACLE_P6_BASE_URL" ]; then
        echo "⚠️  Warning: Oracle P6 credentials not configured in .env file."
        echo "Skipping P6 data synchronization."
        return 1
    fi
    
    # Run the full sync script
    node scripts/full-sync.js
    echo "✓ P6 data synchronization completed"
}

# Function to start the application
start_application() {
    echo ""
    echo "--- Starting Application ---"
    
    cd backend
    
    # Start the server in background
    npm start &
    SERVER_PID=$!
    echo "✓ Application started with PID: $SERVER_PID"
    
    # Wait a moment for the server to start
    sleep 5
    
    # Check if the server is running
    if ps -p $SERVER_PID > /dev/null; then
        echo "✓ Application is running on http://localhost:3002"
    else
        echo "⚠️  Application may not have started properly"
    fi
}

# Function to display deployment summary
show_summary() {
    echo ""
    echo "==========================================="
    echo "DEPLOYMENT SUMMARY"
    echo "==========================================="
    echo "✓ PostgreSQL database 'adani_flow' created"
    echo "✓ All database migrations completed"
    echo "✓ Backend dependencies installed"
    echo "✓ Frontend dependencies installed and built"
    echo ""
    echo "Environment Configuration:"
    echo "- Backend API: http://localhost:3002"
    echo "- Frontend: Serve the 'frontend/dist' folder via web server (Nginx/Apache)"
    echo ""
    echo "Next Steps:"
    echo "1. Configure your web server to serve frontend/dist"
    echo "2. Update VITE_API_BASE_URL in frontend/.env.production if needed"
    echo "3. Set up reverse proxy if required"
    echo "4. Configure SSL certificates for production"
    echo "5. Set up process manager (PM2) for backend"
    echo "==========================================="
}

# Main execution
main() {
    echo "Starting PostgreSQL setup for Adani Flow deployment..."
    
    # Check prerequisites
    if ! check_postgres; then
        echo "Please install PostgreSQL client before proceeding."
        exit 1
    fi
    
    if ! check_postgres_server; then
        echo "Please start PostgreSQL server before proceeding."
        exit 1
    fi
    
    # Setup database
    setup_database
    
    # Run migrations
    run_migrations
    
    # Install dependencies
    install_backend_deps
    install_frontend_deps
    
    # Build frontend
    build_frontend
    
    # Optionally sync P6 data (only if credentials are available)
    sync_p6_data || echo "⚠️  P6 sync skipped - configure credentials in .env file"
    
    # Show summary
    show_summary
    
    echo ""
    echo "Deployment completed! 🚀"
}

# Run main function
main "$@"