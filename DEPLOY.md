# Deployment Guide

## Environment Variable Split

This project separates environment variables into two categories:

### Frontend (Browser-safe, VITE_ prefix)

These are embedded into the client-side bundle at build time. **Only include public/non-secret values.**

| Variable | Description | Required |
|---|---|---|
| `VITE_API_URL` | Backend API base URL (Flask / API Gateway) | Yes |
| `VITE_APP_URL` | Frontend app URL (for redirects) | Yes |
| `VITE_SUPABASE_URL` | Supabase project URL | Yes |
| `VITE_SUPABASE_ANON_KEY` | Supabase anonymous key (public, RLS-protected) | Yes |

See `.env.frontend.example` for a template.

### Backend (Secrets, Python Lambda / Flask only)

These are loaded by the Python backend via `python-dotenv` or Lambda environment variables. **Never prefix these with `VITE_`.**

| Variable | Description | Required |
|---|---|---|
| `SUPABASE_URL` | Supabase project URL | Yes |
| `SUPABASE_SERVICE_KEY` | Supabase service role key (bypasses RLS) | Yes |
| `OPENAI_API_KEY` | OpenAI API key for GPT extraction | Yes |
| `APP_URL` | Frontend URL used in email links | Yes |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` | Email sending config | Yes |
| `FROM_EMAIL` / `FROM_NAME` | Email sender identity | Yes |
| `GMAIL_APP_PASSWORD` | Gmail App Password for IMAP resume collection | Yes |
| `GOOGLE_PRIVATE_KEY` | Google Calendar service account private key | For scheduling |
| `TOKEN_EXPIRY_HOURS` | Applicant access token lifetime (default: 24) | No |
| `FFMPEG_PATH` | Path to FFmpeg binary for video transcription | No |

See `.env.backend.example` for a template.

---

## Security Rules

> **NEVER expose `SUPABASE_SERVICE_KEY` (or any service role key) in a `VITE_` variable.**
> Service role keys bypass Row Level Security and grant full database access.
> Any `VITE_` variable is visible to anyone who inspects the browser bundle.

The frontend uses only the Supabase **anon key** with RLS-protected queries.
All privileged database operations (granting access, rejecting applicants, etc.) go through the Flask backend API.

---

## Local Development Setup

1. Copy `.env.frontend.example` and `.env.backend.example` into a single `.env` file at the project root (both frontend and backend read from it locally).
2. Fill in your actual values.
3. Start the backend: `cd backend && python scoring_api.py`
4. Start the frontend: `npm run dev`

## Production Deployment (AWS Lambda + CloudFront)

### Frontend (CloudFront + S3)
1. Set the following environment variables at build time (CI/CD or `.env.production`):
   - `VITE_API_URL=https://your-api-gateway-url.execute-api.region.amazonaws.com/prod`
   - `VITE_APP_URL=https://your-cloudfront-domain.com`
   - `VITE_SUPABASE_URL=https://your-project.supabase.co`
   - `VITE_SUPABASE_ANON_KEY=your-anon-key`
2. Run `npm run build` — output goes to `dist/`
3. Upload `dist/` to S3 and invalidate CloudFront cache.

### Backend (AWS Lambda)
1. Set all backend env vars as Lambda environment variables (or use AWS Secrets Manager).
2. Set `APP_URL` to your CloudFront domain so email links point to production.
3. Deploy the Python backend as Lambda functions behind API Gateway.

---

## Pre-Deploy Verification Checklist

Run these checks before every production deployment:

```bash
# 1. Build must succeed with only frontend-safe env vars
npm run build

# 2. No hardcoded localhost:5000 in frontend source
grep -r "localhost:5000" src/
# Expected: no output

# 3. No service role key exposed in frontend
grep -r "VITE_SUPABASE_SERVICE_ROLE_KEY" src/
# Expected: no output

# 4. Only one backend base URL var used in frontend
grep -r "VITE_SCORING_API_URL\|VITE_BACKEND_URL" src/
# Expected: no output (only VITE_API_URL should be used)

# 5. Backend uses APP_URL (not VITE_APP_URL) for email links
grep -r "VITE_APP_URL" backend/
# Expected: no output
```
