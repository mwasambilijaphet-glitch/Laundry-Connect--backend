# CLAUDE.md — Laundry Connect Backend

This file provides guidance for AI assistants working on the `laundry-connect-api` codebase.

---

## Project Overview

**Laundry Connect** is a Node.js/Express REST API for a laundry marketplace platform in Tanzania. It connects customers with laundry shop owners, supporting order placement, payment processing via Snippe, OTP-based email verification, and a full admin management panel.

- **Runtime:** Node.js with Express 4
- **Database:** PostgreSQL (hosted on Supabase)
- **Auth:** JWT (access + refresh tokens) with bcryptjs password hashing
- **Email:** Nodemailer (SMTP) for OTP verification
- **Payments:** Snippe payment gateway (partially integrated)
- **Default port:** 5000

---

## Repository Structure

```
/
├── src/
│   ├── server.js              # Express app entry point; mounts routes, CORS, error handler
│   ├── middleware/
│   │   └── auth.js            # JWT authenticate() + authorize(...roles) middleware
│   ├── routes/
│   │   ├── auth.js            # /api/auth — register, verify-otp, login, refresh, me
│   │   ├── shops.js           # /api/shops — public listing and owner shop creation
│   │   ├── orders.js          # /api/orders — place order, list, detail, status update
│   │   ├── payments.js        # /api/payments — initiate payment, Snippe webhook
│   │   ├── owner.js           # /api/owner — owner dashboard and order management
│   │   └── admin.js           # /api/admin — platform analytics and administration
│   └── db/
│       ├── pool.js            # PostgreSQL connection pool (DATABASE_URL env)
│       ├── migrate.js         # Creates all database tables (run once or to reset)
│       ├── seed.js            # Inserts sample data (admin, owners, shops, services)
│       ├── check-admin.js     # Utility: verify admin credentials
│       └── fix-admin.js       # Utility: reset admin password
├── package.json
└── package-lock.json
```

---

## Development Setup

### Prerequisites
- Node.js 18+
- PostgreSQL database (Supabase recommended)
- SMTP credentials for email
- A `.env` file (see section below)

### Install and Run

```bash
npm install          # Install dependencies
npm run db:migrate   # Create database schema
npm run db:seed      # Populate sample data
npm run dev          # Start with hot-reload (nodemon)
npm start            # Start production server
npm run db:reset     # migrate + seed (full reset)
```

### Environment Variables

Create a `.env` file in the project root. All required variables:

```env
PORT=5000
FRONTEND_URL=http://localhost:5173

# PostgreSQL (Supabase)
DATABASE_URL=postgresql://...

# JWT
JWT_SECRET=your-secret-key
JWT_REFRESH_SECRET=your-refresh-secret
JWT_EXPIRES_IN=1h
JWT_REFRESH_EXPIRES_IN=7d

# SMTP (email for OTP)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=user@example.com
SMTP_PASS=yourpassword

# Admin account (used by seed.js)
ADMIN_EMAIL=admin@laundryconnect.co.tz
ADMIN_PHONE=+255700000000
ADMIN_PASSWORD=secure-password

# Platform commission (default 10%)
PLATFORM_COMMISSION_RATE=0.10

# Snippe payment gateway (TODO: not yet active)
SNIPPE_API_KEY=
SNIPPE_WEBHOOK_SECRET=
```

---

## Database Schema

Eight tables in PostgreSQL:

| Table | Purpose |
|---|---|
| `users` | Customers, shop owners, admins. Roles: `customer`, `owner`, `admin` |
| `shops` | Laundry shops; require admin approval (`approval_status`) |
| `services` | Per-shop pricing by `clothing_type` × `service_type` combination |
| `delivery_zones` | Per-shop delivery areas with fees (TZS) |
| `orders` | Customer orders with full lifecycle status tracking |
| `order_items` | Line items linking orders to services |
| `reviews` | Customer ratings (1–5) per order |
| `transactions` | Payment, payout, and commission records |
| `otp_codes` | 6-digit OTPs for email verification (10-min TTL) |

### Order Statuses (in sequence)
`placed` → `confirmed` → `picked_up` → `washing` → `ready` → `out_for_delivery` → `delivered` / `cancelled`

### Payment Statuses
`pending` → `paid` / `failed` / `refunded`

---

## API Endpoints

### Authentication — `/api/auth`
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/register` | No | Register customer or owner; sends OTP via email |
| POST | `/verify-otp` | No | Verify OTP; returns JWT tokens |
| POST | `/login` | No | Login by phone or email; requires verified account |
| POST | `/refresh` | No | Exchange refresh token for new access token |
| GET | `/me` | JWT | Get authenticated user's profile |

### Shops — `/api/shops`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | No | List approved shops (filter: search, city; sort: price, orders) |
| GET | `/:id` | No | Shop detail with services, delivery zones, 10 latest reviews |
| POST | `/` | owner | Create shop (one per owner; pending admin approval) |
| PUT | `/:id/services` | owner | Upsert service pricing for the shop |

### Orders — `/api/orders`
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/` | customer | Place order; calculates subtotal, delivery fee, commission |
| GET | `/` | customer | List own orders (filter by status) |
| GET | `/:orderNumber` | customer/owner | Order detail (accessible to customer or shop owner) |
| PATCH | `/:id/status` | owner/admin | Update order status |

### Payments — `/api/payments`
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/initiate` | customer | Initiate payment (mobile_money, card, qr); currently simulated |
| POST | `/webhook` | No | Snippe webhook for payment events |

### Owner Dashboard — `/api/owner`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/shop` | owner | Owner's shop details |
| GET | `/dashboard` | owner | Analytics: today's orders, revenue, totals, status breakdown |
| GET | `/orders` | owner | Shop orders (filter by status) |

### Admin — `/api/admin`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/dashboard` | admin | Platform-wide analytics |
| GET | `/shops/pending` | admin | Shops awaiting approval |
| PATCH | `/shops/:id/approve` | admin | Approve or reject a shop |
| GET | `/users` | admin | List all users (filter by role) |
| GET | `/orders` | admin | All platform orders (limit 100) |
| GET | `/transactions` | admin | All transactions (limit 100) |
| PATCH | `/settings` | admin | Platform settings (placeholder) |

---

## Authentication & Authorization

- Tokens are sent as `Authorization: Bearer <token>` headers.
- `authenticate()` middleware validates the token and sets `req.user = { id, role, email }`.
- `authorize(...roles)` middleware checks `req.user.role` against allowed roles.
- Access tokens expire per `JWT_EXPIRES_IN` (default 1h); use `/api/auth/refresh` with the refresh token.

**User Roles:** `customer`, `owner`, `admin`

---

## Code Conventions

### Response Format
All responses use a consistent JSON structure:
```json
{ "success": true, "message": "Human-readable message", "data": { ... } }
```

Error responses:
```json
{ "success": false, "message": "Error description" }
```

### HTTP Status Codes
| Code | Usage |
|---|---|
| 200 | Success |
| 201 | Resource created |
| 400 | Validation error / bad request |
| 401 | Not authenticated |
| 403 | Not authorized (wrong role) |
| 404 | Resource not found |
| 409 | Conflict (duplicate, e.g. email already exists) |
| 500 | Internal server error (global handler) |

### Database Queries
- Always use **parameterized queries** with numbered placeholders (`$1`, `$2`, ...) — never string interpolation.
- Use `ON CONFLICT ... DO UPDATE` for upsert operations (e.g., service pricing).
- Prefer JOINs over multiple queries for related data.

### Route Structure
- All routes use `async`/`await` wrapped in try-catch.
- Errors pass to global handler via `next(err)`.
- Business logic lives in route handlers (no separate service layer currently).

### Currency
- All monetary values are stored in **Tanzanian Shillings (TZS)** as integers.
- Platform commission: `subtotal × PLATFORM_COMMISSION_RATE` (default 10%).
- Customer total: `subtotal + delivery_fee` (commission is not added to customer bill).

### Order Number Format
Generated as `LC-{YEAR}-{4-digit-random}`, e.g., `LC-2024-4829`.

---

## Seed Data (Test Credentials)

After `npm run db:seed`:

| Role | Email | Password |
|---|---|---|
| Admin | `admin@laundryconnect.co.tz` | `admin123456` (override via `ADMIN_PASSWORD`) |
| Owner | `salma@example.com` | `owner123456` |
| Customer | `customer@example.com` | `customer123` |

Five pre-approved shops are seeded across Dar es Salaam.

---

## Known Limitations & TODOs

These are known gaps — do not treat them as bugs to auto-fix without instructions:

1. **No test suite** — No test framework is configured. If adding tests, use Jest.
2. **Snippe payment API** — The actual API call in `/api/payments/initiate` is commented out (marked `// TODO`). Webhook signature verification is also not yet implemented.
3. **No input validation** — No library like Joi or express-validator. Validation relies on database constraints and manual checks.
4. **No rate limiting** — Auth endpoints are not rate-limited. Consider `express-rate-limit` if adding.
5. **Admin settings endpoint** — `/api/admin/settings` PATCH is a placeholder; it only reads an env variable.
6. **Hardcoded password in utility scripts** — `fix-admin.js` contains a hardcoded password. Do not use in production.
7. **No logging framework** — Only `console.log` is used. Consider `winston` or `pino` for production.
8. **No API documentation** — No OpenAPI/Swagger spec exists.

---

## Security Practices

**Already in place:**
- Parameterized SQL queries (no injection risk)
- bcryptjs with 10 salt rounds for passwords
- JWT-based stateless auth
- Role-based access control on all protected routes
- CORS restricted to `FRONTEND_URL`

**Not yet implemented (do not add without instruction):**
- Rate limiting on auth endpoints
- Webhook signature verification for Snippe
- Input sanitization / XSS prevention
- HTTPS enforcement

---

## Adding New Features — Guidelines

1. **New route file:** Create in `src/routes/`, register in `src/server.js` with `app.use('/api/<resource>', require('./routes/<resource>'))`.
2. **Auth protection:** Always apply `authenticate` and `authorize` middleware to protected routes.
3. **Database changes:** Add migrations to `src/db/migrate.js` (not separate migration files). Update `seed.js` if sample data is affected.
4. **Response format:** Follow the `{ success, message, data }` structure consistently.
5. **SQL queries:** Parameterize all user inputs. Never concatenate variables into SQL strings.
6. **Error handling:** Use try-catch with `next(err)` — the global handler in `server.js` will format the response.

---

## File Reference

| File | Lines | Purpose |
|---|---|---|
| `src/server.js` | ~60 | App bootstrap, middleware, health check |
| `src/middleware/auth.js` | ~50 | JWT validation and role authorization |
| `src/routes/auth.js` | ~200 | Registration, OTP, login, token refresh |
| `src/routes/shops.js` | ~150 | Shop listing and service management |
| `src/routes/orders.js` | ~200 | Order lifecycle management |
| `src/routes/payments.js` | ~130 | Payment initiation and webhook handling |
| `src/routes/owner.js` | ~120 | Owner analytics and order management |
| `src/routes/admin.js` | ~200 | Admin platform management |
| `src/db/pool.js` | ~20 | PostgreSQL pool configuration |
| `src/db/migrate.js` | ~200 | Full schema DDL |
| `src/db/seed.js` | ~350 | Sample data for development/testing |
