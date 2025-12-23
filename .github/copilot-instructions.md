# EaGCart - AI Coding Agent Instructions

## Project Overview

EaGCart is an e-commerce shopping mall application built with **Express.js** and **Oracle Database**. The architecture follows MVC pattern with session-based authentication, supporting user management, product browsing, cart operations, and admin functionality.

## Architecture & Data Flow

### Connection Model

- **Database**: Oracle (Thin/Thick mode via `config/db.js`)
- **Connection Pool**: 10 minimum/maximum connections (poolMin/poolMax: 10)
- **Pattern**: All controllers obtain connections via `db.getConnection()`, must call `connection.close()` in finally block
- **Example**: `models/userModel.js` - All query functions follow try/finally pattern

### Request Flow

```
Express Route → Middleware (auth check) → Controller → Model (DB query) → EJS View
```

### Authentication & Session

- **Session Storage**: `express-session` with 24-hour cookie expiration
- **Key Property**: `req.session.user` contains authenticated user object
- **User Object**: Contains `USER_ID`, `EMAIL`, `USER_NAME`, `STATUS` (roles: 'USER', 'ADMIN')
- **Global Access**: `res.locals.user` automatically set in middleware for EJS templates

## Critical Patterns & Conventions

### Database Query Pattern (REQUIRED)

Always use this structure in models to prevent connection leaks:

```javascript
async function queryExample(param) {
  let connection;
  try {
    connection = await db.getConnection();
    const result = await connection.execute(
      `SELECT * FROM TABLE_NAME WHERE COL = :param`,
      { param },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    return result.rows[0]; // or .rows for multiple results
  } finally {
    if (connection) await connection.close();
  }
}
```

### Middleware Application

- **Admin Routes** (`/admin/*`): Use `auth.isAdmin` middleware
- **Protected Routes**: Use `auth.isLoggedIn` middleware
- **Error Response Format**: HTML script tags with alert + redirect (see `middleware/auth.js`)

### File Organization

- **Routes**: Each feature has dedicated route file (`routes/*.js`)
- **Controllers**: Business logic in `controllers/*.js`
- **Models**: DB queries in `models/*.js`
- **Views**: EJS templates in `views/*/` organized by feature
- **Admin**: Separate controller path `controllers/admin/*.js`

## Technology Stack & Dependencies

- **Framework**: Express 5.1.0
- **Database**: OracleDB 6.10.0 (connection pooling)
- **Authentication**: bcrypt 6.0.0, express-session 1.18.2
- **Email**: Nodemailer 7.0.11 (Gmail SMTP)
- **Templating**: EJS 3.1.10
- **File Upload**: Multer 2.0.2
- **Utilities**: dayjs 1.11.19 for date handling

## Environment & Configuration

- **Port**: 3000 (hardcoded in `server.js`)
- **Required .env Variables**:
  - `SESSION_SECRET` (session encryption)
  - `GMAIL_USER` & `GMAIL_APP_PASS` (email service)
- **Oracle Config**: Database credentials in `config/db.js`

## Development Workflows

### Starting Server

```bash
npm start  # or node server.js
```

No build step required - runs directly with Node.js.

### Database Connection

1. Server initializes pool via `db.initialize()` on startup
2. Controllers call `db.getConnection()` to get connection from pool
3. Must call `connection.close()` in finally block to return to pool

### Adding New Feature

1. Create route file in `routes/feature.js`
2. Create model queries in `models/featureModel.js`
3. Create controller in `controllers/featureController.js`
4. Register route in `server.js`: `app.use("/", require("./routes/feature"))`
5. Create view templates in `views/feature/`

## Common Patterns to Recognize

### Sample Data Usage

`models/sampleData.js` provides mock data for development (cart, products). Controllers like `cartController.js` and `productController.js` reference this.

### Email Verification

`authController.js` implements email verification codes:

- Code stored in `req.session.verification` with 5-minute expiration
- Used for registration and password recovery flows

### Role-Based Access

- Check `req.session.user.STATUS` for 'ADMIN' or 'USER'
- Admin middleware in `middleware/auth.js` handles authorization

## File Reference Guide

- **Core Setup**: `server.js`, `config/db.js`, `package.json`
- **Authentication**: `routes/auth.js`, `controllers/authController.js`, `models/userModel.js`
- **Key Middleware**: `middleware/auth.js` (isAdmin, isLoggedIn)
- **Admin Routes**: `routes/admin.js`, `controllers/admin/`
- **Frontend Integration**: `views/partials/` (header, footer, banner)
