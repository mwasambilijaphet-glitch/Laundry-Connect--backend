# Fashion.co.tz — Frontend Deployment

## Local Development

```bash
cd fashion-frontend
npm install
cp .env.local.example .env.local   # Fill in your API URL
npm run dev                         # Starts on http://localhost:3000
```

## Environment Variables (.env.local)

```
NEXT_PUBLIC_API_URL=https://your-api.railway.app/api
NEXT_PUBLIC_APP_NAME=Fashion.co.tz
NEXT_PUBLIC_APP_URL=https://fashion.co.tz
```

## Deploy to Vercel

```bash
npm install -g vercel
vercel --prod
```

Or connect your GitHub repo to Vercel (recommended):
1. Go to vercel.com → New Project
2. Import your repository
3. Set root directory to `fashion-frontend`
4. Add environment variables
5. Deploy

## Vercel Project Settings

- **Framework Preset**: Next.js
- **Root Directory**: `fashion-frontend`
- **Build Command**: `npm run build`
- **Output Directory**: `.next`

## Custom Domain

In Vercel → Settings → Domains → Add `fashion.co.tz`

Configure DNS:
- Type: CNAME
- Name: @
- Value: cname.vercel-dns.com
