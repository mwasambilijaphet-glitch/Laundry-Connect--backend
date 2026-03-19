# Fashion.co.tz — Production SaaS Platform

AI-powered fashion design, outfit recommendations, and a bilingual (Swahili + English) fashion assistant for Tanzania.

## Project Structure

```
fashion-backend/     Express.js API
fashion-frontend/    Next.js 14 App Router frontend
```

## Quick Start

### Backend
```bash
cd fashion-backend && npm install
cp .env.example .env  # configure
npm run db:migrate
npm run dev
```

### Frontend
```bash
cd fashion-frontend && npm install
cp .env.local.example .env.local  # configure
npm run dev
```

## Architecture

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router), Tailwind CSS, Framer Motion |
| Backend | Node.js, Express.js |
| Database | PostgreSQL |
| Auth | JWT + bcrypt + Email OTP |
| Payments | Snippe.sh (M-Pesa mobile money) |
| AI | OpenAI GPT-4o + DALL-E 3 |
| Storage | Cloudinary |
| Email | Nodemailer (SMTP) |

## API Endpoints

| Route | Auth | Subscription |
|---|---|---|
| `POST /api/auth/signup` | — | — |
| `POST /api/auth/login` | — | — |
| `POST /api/auth/verify-otp` | — | — |
| `POST /api/payments/subscribe` | ✅ | — |
| `POST /api/payments/webhook` | Snippe sig | — |
| `POST /api/ai/generate-design` | ✅ | ✅ |
| `POST /api/ai/recommend-outfit` | ✅ | ✅ |
| `POST /api/ai/chat` | ✅ | ✅ |
| `GET /api/designer/portfolio` | — | — |
| `POST /api/designer/upload` | ✅ | ✅ |

## Subscription Flow

1. User enters Tanzanian phone number
2. Backend calls Snippe.sh API → initiates M-Pesa push
3. Frontend polls `/api/payments/status/:id` every 5 seconds
4. Snippe sends webhook on completion → subscription activated for 7 days
5. Email confirmation sent via SMTP
6. `requireSubscription` middleware blocks premium routes after expiry

## Security

- Helmet.js for HTTP security headers
- Rate limiting (20 req/15min for auth, 200 req/15min globally)
- JWT with 7-day expiry
- Webhook HMAC-SHA256 signature verification (timing-safe)
- bcrypt (cost 12) for password hashing
- Input validation with express-validator
- CORS restricted to frontend URL
