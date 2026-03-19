# Fashion.co.tz — Backend Deployment

## Local Development

```bash
cd fashion-backend
npm install
cp .env.example .env       # Fill in your env vars
npm run db:migrate          # Run database migrations
npm run dev                 # Start dev server (port 5001)
```

## Environment Variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Min 32-char random string |
| `SMTP_HOST/PORT/USER/PASS` | SMTP credentials for emails |
| `SNIPPE_API_KEY` | Your Snippe.sh API key |
| `SNIPPE_WEBHOOK_SECRET` | Snippe webhook secret for signature verification |
| `BACKEND_URL` | Publicly accessible URL (for webhook callback) |
| `OPENAI_API_KEY` | OpenAI API key (GPT-4 + DALL-E 3) |
| `CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET` | Cloudinary credentials |

## Deploy to Railway / Render / Fly.io

1. Connect your repo to Railway/Render
2. Set all environment variables
3. Set start command: `npm start`
4. Run `npm run db:migrate` once after first deploy

## Snippe Webhook Setup

After deploying, configure your Snippe.sh dashboard to send webhooks to:
```
https://your-api-domain.com/api/payments/webhook
```

Events to subscribe to: `payment.completed`, `payment.failed`
