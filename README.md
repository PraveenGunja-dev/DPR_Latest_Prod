# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/a19185a8-7bd5-48dd-9c32-4add2286ebe6

## Authentication System

This project now includes a complete authentication system with:
- User registration with roles (supervisor, Site PM, PMAG)
- Secure login with JWT tokens
- PostgreSQL database integration
- Protected routes based on user roles
- Session management with localStorage

### Default Credentials

For testing purposes, the following default users are available:

3. **PMRG User**
   - Email: admin@adani.com
   - Role: PMAG
   - Password: admin123

4. **Super Admin**
   - Email: superadmin@adani.com
   - Role: Super Admin
   - Password: superadmin123

To register new users, use the registration form in the application.

### Setting up the Backend

1. Navigate to the server directory:
   ```bash
   cd server
   ```

2. Install backend dependencies:
   ```bash
   npm install
   ```

3. Set up your PostgreSQL database and update the `.env` file with your database credentials.

4. Run the database schema:
   ```bash
   # Execute the schema.sql file in your PostgreSQL database
   ```

5. Start the backend server:
   ```bash
   npm run dev
   ```

### Environment Variables

Create a `.env` file in the server directory with the following variables:
```
DB_HOST=your_database_host
DB_PORT=5432
DB_NAME=your_database_name
DB_USER=your_database_user
DB_PASSWORD=your_database_password
JWT_SECRET=your_jwt_secret_key
REFRESH_TOKEN_SECRET=your_refresh_token_secret_key
PORT=3001
```

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/a19185a8-7bd5-48dd-9c32-4add2286ebe6) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/a19185a8-7bd5-48dd-9c32-4add2286ebe6) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)

# Adani Flow Project

## Project Overview
Adani Flow is a project management system designed for Adani Projects, featuring role-based dashboards for supervisors, project managers, and PMAG (PM Advisory Group) members.

## Default Credentials
For initial setup and testing purposes, the following default credentials are provided:

| Role | Email | Password |
|------|-------|----------|
| Admin (PMAG) | admin@adani.com | admin123 |

## Setup Instructions

1. Install dependencies:
   ```
   npm install
   ```

2. Set up the database:
   - Make sure PostgreSQL is running
   - Create a database named `dpr_project`
   - Update the `.env` file with your database credentials

3. Run the database schema:
   ```
   psql -U postgres -d dpr_project -f server/database/schema.sql
   ```

4. Reset users and create admin (optional):
   ```
   node server/reset-users.js
   ```

5. Start the development server:
   ```
   npm run dev
   ```

## Available Roles
- Supervisor
- Site PM (Project Manager)
- PMAG (PM Advisory Group) - Admin role

## Development

To start the development server:
```
npm run dev
```

To build for production:
```
npm run build
```

To preview the production build:
```
npm run preview
```

Frontend Tech Stack:


Vite - Build tool and development server
React - JavaScript library for building user interfaces
TypeScript - Typed superset of JavaScript
Tailwind CSS - Utility-first CSS framework
shadcn/ui - Reusable component library built on Tailwind CSS and Radix UI
React Router - Declarative routing for React applications
Framer Motion - Animation library for React
Axios - Promise-based HTTP client for making API requests


Backend Tech Stack:

Node.js - JavaScript runtime environment
Express.js - Web application framework for Node.js
PostgreSQL - Relational database (using pg driver)
JWT - JSON Web Tokens for authentication
Bcrypt - Password hashing library
Cors - Cross-Origin Resource Sharing middleware

Development Tools:

ESLint - Code linting utility
Nodemon - Development server that auto-restarts
SWC - Super-fast TypeScript/JavaScript compiler (via @vitejs/plugin-react-swc)