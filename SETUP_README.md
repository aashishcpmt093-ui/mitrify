# Mitrify - Setup Guide for Engineers

## Tech Stack
- **Frontend:** React + TypeScript + Vite + Tailwind CSS + Shadcn UI
- **Backend:** Node.js + Express (TypeScript)
- **Database:** PostgreSQL with Drizzle ORM
- **Auth:** Google OAuth 2.0 + Local (username/password + Firebase Phone OTP)

## Project Structure
```
client/src/pages/     - All frontend pages
server/               - Backend API (routes.ts, storage.ts, db.ts)
shared/schema.ts      - Database schema (Drizzle ORM)
database_export.sql   - Full PostgreSQL database dump
```

## Required Environment Variables
Set these in your hosting environment:

```
DATABASE_URL=postgresql://...        # PostgreSQL connection string

SESSION_SECRET=...                   # Express session secret (any random string)

GOOGLE_CLIENT_ID=...                 # Google OAuth App Client ID
GOOGLE_CLIENT_SECRET=...             # Google OAuth App Client Secret

GMAIL_APP_PASSWORD=...               # Gmail App Password for OTP emails (16-char)
# Gmail account used: aashidhcpmt09@gmail.com

CASHFREE_APP_ID=...                  # Cashfree Payment Gateway App ID
CASHFREE_SECRET_KEY=...              # Cashfree Payment Gateway Secret Key
# Note: Uses sandbox in development, production keys when REPLIT_DEPLOYMENT=1

VITE_FIREBASE_API_KEY=AIzaSyDz4zDta6PTPsQ8QlQyaQnQ0BPen8JPiSk
VITE_FIREBASE_PROJECT_ID=mitrify-india
# Firebase used for Phone OTP (SMS verification)
```

## Database Import
```bash
psql $DATABASE_URL < database_export.sql
```

## Run Locally
```bash
npm install
npm run dev        # Starts both frontend (Vite) and backend (Express) on port 5000
```

## Build for Production
```bash
npm run build      # Builds frontend to dist/
npm start          # Runs production server
```

## Admin Panel
- URL: /admin/login
- ID: aashishcpmt09
- Password: 7742039808

## Key Features
- 3-role system: Customer, Provider, Admin
- Credit system: 5 free credits/month, 1 credit per call (both customer and provider)
- Cashfree payment gateway for credit purchase
- Firebase Phone OTP for signup/login verification
- Provider search with geolocation (OpenStreetMap Nominatim)
- Provider profile photos (base64 stored in DB)
- Real phone calls via tel: links
- Promo/referral code system
- PWA installable

## Google OAuth Callback URL
Set this in Google Console:
- Development: http://localhost:5000/api/auth/google/callback
- Production: https://yourdomain.com/api/auth/google/callback
