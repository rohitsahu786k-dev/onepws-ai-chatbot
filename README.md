# OnePWS AI Chatbot

Production-minded monorepo for the OnePWS single-brand AI chatbot platform described in the build specification. The repo includes:

- `apps/widget`: embeddable Next.js chat widget with session persistence, multilingual chat flow, quick replies, and fallback lead form
- `apps/admin`: Next.js admin dashboard with login, leads, sessions, analytics, routing, prompt, settings, and log views
- `apps/api`: Express + Socket.IO API for chat, lead capture, admin APIs, auth, routing, and queue submission
- `apps/worker`: BullMQ worker for email and Google Sheets jobs
- `packages/core`: shared backend domain logic, models, AI orchestration, routing, queue, integrations, and seed data
- `packages/types`, `packages/config`, `packages/utils`, `packages/ui`: shared contracts, env parsing, helpers, and UI primitives

## Architecture Overview

High-level flow:

1. Visitor opens the widget on `onepws.com` or via the embed script.
2. Widget initializes a chat session with page URL, title, referrer, and UTM metadata.
3. User messages hit the Express API.
4. The AI pipeline detects language, classifies intent, classifies solution category, retrieves website knowledge-base snippets when enabled, extracts fields, scores the lead, and decides the next reply.
5. Chat messages and lead drafts are persisted in MongoDB.
6. Qualified leads are queued for email routing and Google Sheets sync.
7. Admin users review leads, transcripts, routing rules, prompts, analytics, settings, and audit logs in the admin app.

## Stack

- Frontend: Next.js App Router, TypeScript, Tailwind CSS, Zustand, Framer Motion, Recharts
- Backend: Node.js, Express, Socket.IO, MongoDB/Mongoose, BullMQ, Redis, OpenAI, Google Sheets API, Nodemailer
- Shared: Zod, JWT auth, RBAC, shared domain types and utilities

## Local Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Copy `.env.example` to `.env` and fill the required values:

```bash
copy .env.example .env
```

Minimum local values:

- `MONGODB_URI`
- `REDIS_URL`
- `JWT_SECRET`
- `JWT_REFRESH_SECRET`
- `MARKETING_CC_EMAIL`
- `FALLBACK_LEAD_EMAIL`

Optional integrations:

- `OPENAI_API_KEY` for OpenAI-based extraction enhancement
- `ENABLE_RAG=true` plus imported website knowledge for website-grounded answers
- Google Sheets service account credentials for Sheets sync
- SMTP or Gmail credentials for email routing

### 3. Start local infrastructure

```bash
docker-compose up -d
```

This starts:

- MongoDB on `27017`
- Redis on `6379`

### 4. Seed the database

```bash
npm run seed
```

Default seeded admin users:

- `admin@onepws.com` / `OnepwsAdmin@123`
- `marketing@onepws.com` / `OnepwsMarketing@123`

### 5. Import website knowledge

```bash
npm run import:website -w @onepws/api -- --url=https://onepws.com --maxPages=80
```

This crawls same-domain HTML pages, chunks the page text, and stores active knowledge-base documents in MongoDB for RAG replies.

### 6. Run the apps

In separate terminals:

```bash
npm run dev:api
npm run dev:worker
npm run dev:widget
npm run dev:admin
```

Default URLs:

- Widget preview: `https://chat.onepws.com` (or `http://localhost:3000` for development)
- Admin app: `https://admin.chat.onepws.com` (or `http://localhost:3001` for development)
- API: `https://api.chat.onepws.com` (or `http://localhost:5000` for development)

## Build

```bash
npm run build -w @onepws/api
npm run build -w @onepws/worker
npm run build -w @onepws/widget
npm run build -w @onepws/admin
```

## WordPress Embed

Use the script-based embed snippet below:

```html
<script async src="https://chat.onepws.com/embed.js"></script>
```

For production, replace the URL with the deployed widget app URL.

## Google Sheets Setup

1. Create a Google Cloud project and enable the Google Sheets API.
2. Create a service account and download the credentials.
3. Share the target spreadsheet with the service account email.
4. Add these values to `.env`:
   - `GOOGLE_CLIENT_EMAIL`
   - `GOOGLE_PRIVATE_KEY`
   - `GOOGLE_SHEETS_ONEPWS_ID`
   - `GOOGLE_SHEETS_MASTER_ID` if you want a second sheet

Qualified leads are appended through the worker queue.

## Gmail / SMTP Setup

Use either SMTP or Gmail credentials:

- SMTP:
  - `SMTP_HOST`
  - `SMTP_PORT`
  - `SMTP_USER`
  - `SMTP_PASS`
  - `SMTP_FROM`
- Gmail fallback:
  - `GMAIL_FROM_EMAIL`
  - `GMAIL_REFRESH_TOKEN`

Every internal routing email includes `MARKETING_CC_EMAIL`.

## Routing and Lead Logic

- The chatbot remains branded as OnePWS.
- Solution classification covers control rooms, consoles, auditoriums, interiors, flooring, healthcare infrastructure, clean room, modular OT, and mixed requirements.
- Person and department routing are both supported.
- Duplicate lead detection is based on session, email, and phone where available.
- Queue submission happens when a lead is sufficiently qualified.

## Deployment Notes

- Deploy `apps/widget` and `apps/admin` as separate Next.js apps.
- Deploy `apps/api` and `apps/worker` as separate Node services.
- Back the API and worker with shared MongoDB and Redis infrastructure.
- Set production CORS values for `WIDGET_URL`, `ADMIN_URL`, and `ONEPWS_DOMAIN`.
- Store all secrets in the deployment platform secret manager, not in code.

## Current Scope Notes

- The AI pipeline includes a heuristic base implementation and optional OpenAI enhancement when `OPENAI_API_KEY` is configured.
- Website-grounded answers use MongoDB knowledge-base chunks when `ENABLE_RAG=true`; refresh them with `npm run import:website -w @onepws/api`.
- The queue layer falls back to inline processing if Redis is unavailable, which keeps local development usable.
- The admin UI currently prioritizes coverage of the required operational pages and API integration over final design polish.
