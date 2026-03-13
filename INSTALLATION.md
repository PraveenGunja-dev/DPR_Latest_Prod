# Adani Flow - Installation Guide

Complete installation guide for deploying the DPR Management System.

---

## Prerequisites

| Requirement | Version | Purpose |
|------------|---------|---------|
| **Node.js** | 18.x or higher | Runtime for backend and frontend build |
| **npm** | 9.x or higher | Package management |
| **PostgreSQL** | 14.x or higher | Database |
| **Git** | Latest | Version control |

---

## Quick Start

### 1. Clone and Setup Environment

```bash
# Clone the repository
git clone <repository-url>
cd adani-flow

# Copy environment template
cp .env.example .env
```

### 2. Configure Environment Variables

Edit `.env` and update the following:

```env
# Database - Update with your PostgreSQL credentials
DB_HOST=localhost
DB_PORT=5432
DB_NAME=adani_flow
DB_USER=postgres
DB_PASSWORD=<your-password>

# Oracle P6 - Get from your P6 Cloud administrator
ORACLE_P6_AUTH_TOKEN=<your-p6-token>
ORACLE_P6_BASE_URL=<your-p6-instance-url>

# Security - Generate secure random strings
JWT_SECRET=<generate-random-32-char-string>
REFRESH_TOKEN_SECRET=<generate-random-32-char-string>
```

### 3. Database Setup

```bash
# Connect to PostgreSQL and create database
psql -U postgres
CREATE DATABASE adani_flow;
\q

# Run migrations
cd backend
node database/run_p6_migrations.js
```

### 4. Install Dependencies

```bash
# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install
```

### 5. Start Development Servers

```bash
# Terminal 1 - Backend
cd backend
npm run dev

# Terminal 2 - Frontend
cd frontend
npm run dev
```

- Backend: http://localhost:3002
- Frontend: http://localhost:5173

---

## Production Deployment

### Backend

```bash
cd backend
npm install --production
npm start
```

### Frontend

```bash
cd frontend
npm install
npm run build
# Deploy the 'dist' folder to your static hosting (Nginx, Apache, CDN)
```

### Environment Variables for Production

```env
NODE_ENV=production
VITE_API_BASE_URL=https://your-api-domain.com
```

---

## Database Migrations

All SQL migration files are in `backend/database/migrations/`:

```bash
# Run all migrations
cd backend
node database/run_p6_migrations.js
```

---

## Oracle P6 Integration

### Getting P6 Auth Token

1. Log in to Oracle P6 Cloud
2. Navigate to **Administration > Security > API Tokens**
3. Generate a new token with required permissions
4. Copy the token to your `.env` file

### Required P6 Permissions

- Read access to Projects
- Read access to Activities
- Read access to Resources
- Read access to UDFs (User Defined Fields)

---

## Troubleshooting

### Database Connection Failed

```bash
# Check PostgreSQL is running
pg_isready -h localhost -p 5432

# Verify credentials
psql -h localhost -U postgres -d adani_flow
```

### P6 API Errors

- Verify `ORACLE_P6_AUTH_TOKEN` is not expired
- Check `ORACLE_P6_BASE_URL` format matches your instance
- Ensure firewall allows outbound HTTPS to Oracle Cloud

### Frontend Build Errors

```bash
# Clear cache and rebuild
cd frontend
rm -rf node_modules dist
npm install
npm run build
```

---

## Project Structure

```
adani-flow/
├── backend/
│   ├── controllers/     # API route handlers
│   ├── database/        # Migrations and schema
│   ├── routes/          # API route definitions
│   ├── services/        # Business logic
│   └── server.js        # Entry point
├── frontend/
│   ├── src/
│   │   ├── components/  # React components
│   │   ├── pages/       # Page components
│   │   └── services/    # API clients
│   └── dist/            # Production build
└── docs/                # Documentation
```

---

## Support

For issues or questions, contact the development team.
