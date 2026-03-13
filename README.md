# Adani Flow - DPR Management System

Enterprise-grade Daily Progress Report (DPR) management system with Oracle P6 integration.

## Features

- **DPR Management** - Daily progress tracking with Excel-like tables
- **Oracle P6 Integration** - Real-time sync with P6 projects/activities
- **Role-Based Access** - PMAG, Site PM, Supervisor roles
- **State Monitoring** - Track project status across states
- **User Management** - SSO integration with Azure AD
- **Excel Export** - Generate formatted DPR reports

---

## Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL 14+
- npm 9+

### 1. Setup Environment

```bash
cp .env.example .env
# Edit .env with your database and P6 credentials
```

### 2. Install & Run

```bash
# Backend
cd backend
npm install
npm run dev

# Frontend (new terminal)
cd frontend
npm install
npm run dev
```

- **Frontend**: http://localhost:5173  
- **Backend API**: http://localhost:3002

---

## Documentation

| Document | Description |
|----------|-------------|
| [INSTALLATION.md](./INSTALLATION.md) | Complete deployment guide |
| [docs/sso-setup.md](./docs/sso-setup.md) | Azure AD SSO configuration |
| [docs/ORACLE_P6_API_DOCS.md](./docs/ORACLE_P6_API_DOCS.md) | P6 API integration details |

---

## Project Structure

```
adani-flow/
├── backend/          # Express.js API server
│   ├── controllers/  # Route handlers
│   ├── services/     # Business logic
│   ├── routes/       # API endpoints
│   └── database/     # Migrations & schema
├── frontend/         # React + Vite application
│   ├── src/components/
│   └── src/pages/
└── docs/             # Documentation
```

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, TypeScript, Vite, TailwindCSS, Handsontable |
| Backend | Node.js, Express.js |
| Database | PostgreSQL |
| Integration | Oracle P6 REST API |
| Auth | JWT, Azure AD SSO |

---

## Deployment

See [INSTALLATION.md](./INSTALLATION.md) for complete deployment instructions.

### Quick Production Deploy

```bash
# Backend
cd backend && npm install --production && npm start

# Frontend
cd frontend && npm run build
# Deploy dist/ folder to static hosting
```

---

## License

Proprietary - Adani Group