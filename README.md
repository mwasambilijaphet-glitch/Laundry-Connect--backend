# 🧺 Laundry Connect — Setup Guide

> A two-sided laundry marketplace for Tanzania. Customers find shops, owners set prices, everyone pays via M-Pesa.

---

## 📁 Project Structure

```
laundry-connect-frontend/     ← React + Vite + Tailwind
├── src/
│   ├── components/           ← Reusable UI components
│   ├── context/              ← Auth & Cart state management
│   ├── data/                 ← Mock data (replace with API calls)
│   ├── pages/                ← All screens (10 pages)
│   ├── App.jsx               ← Router setup
│   ├── main.jsx              ← Entry point
│   └── index.css             ← Tailwind + custom styles
├── package.json
├── tailwind.config.js
└── vite.config.js

laundry-connect-backend/      ← Express.js + PostgreSQL
├── src/
│   ├── db/
│   │   ├── pool.js           ← Database connection
│   │   ├── migrate.js        ← Create all tables
│   │   └── seed.js           ← Sample data
│   ├── middleware/
│   │   └── auth.js           ← JWT authentication
│   ├── routes/
│   │   ├── auth.js           ← Register, login, OTP
│   │   ├── shops.js          ← Shop listing & details
│   │   ├── orders.js         ← Order CRUD
│   │   ├── payments.js       ← Snippe integration
│   │   └── admin.js          ← Admin dashboard & management
│   └── server.js             ← Express app entry
├── .env.example              ← Environment variables template
└── package.json
```

---

## 🚀 Quick Start

### Step 1: Install PostgreSQL (if not already done)

You already have PostgreSQL from BetVision. Open pgAdmin or terminal:

```sql
CREATE DATABASE laundry_connect;
```

### Step 2: Set up the Backend

```bash
cd laundry-connect-backend

# Install dependencies
npm install

# Create your .env file
cp .env.example .env
# Edit .env with your actual values (database URL, Gmail app password, etc.)

# Create tables
npm run db:migrate

# Seed with sample data
npm run db:seed

# Start the server
npm run dev
```

You should see:
```
🧺 Laundry Connect API running on http://localhost:5000
```

Test it: Visit http://localhost:5000/api/health

### Step 3: Set up the Frontend

```bash
cd laundry-connect-frontend

# Install dependencies
npm install

# Start dev server
npm run dev
```

Visit http://localhost:5173 — you should see the welcome screen!

---

## 🔑 Test Credentials

After running `npm run db:seed`, these accounts are ready:

| Role     | Email/Phone                    | Password      |
|----------|-------------------------------|---------------|
| Admin    | admin@laundryconnect.co.tz    | admin123456   |
| Owner    | salma@example.com             | owner123456   |
| Customer | customer@example.com          | customer123   |

**OTP Demo**: Use `123456` as the OTP code in the frontend.

---

## 🔌 API Endpoints

### Auth
| Method | Endpoint              | Description            |
|--------|-----------------------|------------------------|
| POST   | /api/auth/register    | Create account         |
| POST   | /api/auth/login       | Login with phone/pass  |
| POST   | /api/auth/verify-otp  | Verify email OTP       |
| POST   | /api/auth/refresh     | Refresh JWT token      |
| GET    | /api/auth/me          | Get current user       |

### Shops
| Method | Endpoint                  | Description              |
|--------|---------------------------|--------------------------|
| GET    | /api/shops                | List approved shops      |
| GET    | /api/shops/:id            | Shop detail + services   |
| POST   | /api/shops                | Create shop (owner)      |
| PUT    | /api/shops/:id/services   | Update pricing (owner)   |

### Orders
| Method | Endpoint                    | Description                |
|--------|-----------------------------|----------------------------|
| POST   | /api/orders                 | Place new order            |
| GET    | /api/orders                 | My orders (customer)       |
| GET    | /api/orders/:orderNumber    | Order detail               |
| PATCH  | /api/orders/:id/status      | Update status (owner)      |

### Payments
| Method | Endpoint                   | Description              |
|--------|----------------------------|--------------------------|
| POST   | /api/payments/initiate     | Start Snippe payment     |
| POST   | /api/payments/webhook      | Snippe webhook receiver  |

### Admin
| Method | Endpoint                      | Description            |
|--------|-------------------------------|------------------------|
| GET    | /api/admin/dashboard          | Platform analytics     |
| GET    | /api/admin/shops/pending      | Pending approvals      |
| PATCH  | /api/admin/shops/:id/approve  | Approve/reject shop    |
| GET    | /api/admin/users              | All users              |
| GET    | /api/admin/transactions       | All transactions       |

---

## 📱 Pages Built (Frontend)

1. **Welcome Screen** — `/` — Splash with "Anza Sasa" CTA
2. **Auth** — `/auth` — Login, Register, OTP verification
3. **Home** — `/home` — Search, services, featured shops
4. **Shop Listing** — `/shops` — Sort by rating/price/popular
5. **Shop Detail** — `/shop/:id` — Services, pricing, reviews, delivery zones
6. **Order Builder** — `/order/build` — Cart, delivery address, zone, checkout
7. **Payment** — `/order/pay` — M-Pesa/Airtel/Card selection, simulated payment
8. **Order Tracking** — `/order/:id` — Status timeline with all stages
9. **Order History** — `/orders` — Active + completed orders
10. **Profile** — `/profile` — User info, stats, settings, logout

---

## 🔗 Connecting Frontend to Backend

The frontend currently uses mock data in `src/data/mockData.js`. To connect to the real API:

1. The Vite proxy is already configured — API calls to `/api/*` will forward to `localhost:5000`
2. Replace mock data calls with `fetch('/api/...')` calls
3. Store JWT token from login response
4. Add `Authorization: Bearer <token>` header to authenticated requests

Example:
```javascript
// Before (mock):
const shops = mockShops;

// After (real API):
const response = await fetch('/api/shops');
const data = await response.json();
const shops = data.shops;
```

---

## 📝 What's Next

**Phase 3** — Laundry Owner Panel:
- Owner dashboard with earnings
- Service management (add/edit prices)
- Order management (accept/decline, update status)

**Phase 4** — Admin Panel:
- Admin dashboard at `/admin`
- Shop approvals
- User & transaction management

**Phase 5** — Polish:
- Connect Snippe API with real keys
- Add Leaflet maps for shop locations
- Email notifications via Nodemailer
- Mobile responsiveness fine-tuning
- Deploy to Vercel + Render

---

## 🛠 Tech Stack

| Layer      | Technology                    |
|------------|-------------------------------|
| Frontend   | React 18 + Vite + Tailwind    |
| Backend    | Express.js + Node.js          |
| Database   | PostgreSQL                    |
| Auth       | JWT + Email OTP (Nodemailer)  |
| Payments   | Snippe (M-Pesa, Airtel, Card) |
| Maps       | Leaflet.js + OpenStreetMap    |
| Deploy     | Vercel (FE) + Render (BE)     |

Built with ❤️ in Dar es Salaam
