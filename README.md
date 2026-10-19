# SmartShip — Smart Shipment Management System

A full-stack **MERN** (MongoDB · Express · React · Node.js) application for managing shipments end-to-end, with exception triage, severity & team assignment, multi-level escalation and **Gemini AI recovery planning** (with a resilient rule-based fallback).

## Features

| Area | What's included |
|---|---|
| **AI Logistics Assistant** | Floating chatbot on every page — ask about shipments, delays, critical exceptions, performance or request the daily operations report. Answers come from **live DB data**, supports contextual follow-ups (e.g. "what are its risks?" after mentioning a tracking ID), suggestion chips, and respects your role. Gemini-powered with rule-based fallback. |
| **Complete Audit Trail** | Append-only `AuditLog` collection capturing shipment create/update/status/delete, exception create/moderation/escalation/resolution, role changes, registrations and AI plan generation — with **who, what changed (before → after), and when**. Admin-only **Audit Logs page** with search, category/action/date filters and expandable before/after comparisons. No update/delete endpoints exist — records are tamper-proof. |
| **Dashboard** | Live stats (auto-refresh 30s), shipments-by-status donut, exception severity/status bars, delayed & overdue list, critical exceptions, recent activity feed. |
| **Shipments** | Create / view / edit / delete (Admin), search, status & "delayed/overdue" filters, pagination, auto-generated tracking IDs (`SHP-XXXX…`). |
| **Status & timeline** | Status updates write to an immutable timeline (status changes, exceptions, assignments, escalations, resolutions, AI events). |
| **Exceptions** | 8 types (Delivery Delay, Vehicle Breakdown, Missing Documents, Unreachable Recipient, Damaged, Lost, Weather, Other) with type → team auto-assignment. A *Delivery Delay* automatically marks the shipment **Delayed**; resolving the last open exception returns it to **In Transit**. |
| **Severity & teams** | Low / Medium / High / Critical, assignable to 6 operations teams. |
| **Escalation** | Dispatcher → Supervisor → Senior Management → External Partner, with reason capture, full history, and a visual ladder. |
| **Gemini AI recovery plans** | Risk assessment, risk level, priority (P1–P4), recommended team, numbered recovery actions with owners & ETAs, escalation suggestion, customer communication draft, preventive measures. Per-shipment *and* per-exception. |
| **Robustness** | API errors surface as clear messages; if Gemini is missing/unreachable, a rule-based plan is returned — core operations are never blocked by AI failures. |
| **Notifications (role-targeted)** | **Persisted per-user notifications** — events are addressed only to relevant roles/users: escalation→Supervisor alerts go to Supervisors+Admins only, Senior Management escalations to Admins only, team assignments to that team's role, delays to ops+dispatch+customer service, role changes notify the affected user directly. Own actions never notify yourself. Unread state is tracked per user with mark-read / read-all. State-based alerts (overdue, critical, deep escalations) are also filtered by role relevance. |
| **Auth & roles** | JWT login/register. Roles: **Admin, Dispatcher, Operations, Customer Service, Supervisor** with route-level permissions enforced on the server and mirrored in the UI. |
| **Public tracking** | `/track` — no login needed; customer-safe projection only. Shows carrier, **tracking data source** (manual / carrier webhook / seed) and **last update time**. |
| **Carrier tracking webhook** | `POST /api/integrations/carrier-webhook` — HMAC-SHA256 signed (`x-carrier-signature`), raw-body verified (401 on bad signature), carrier status synonyms mapped to internal statuses, updates labeled `webhook` with timeline + audit trail. Unknown status → 400, unknown shipment → 404 (acked JSON). When no real provider is configured, a built-in **simulator** (`POST /api/integrations/simulate`, Admin/Dispatcher/Operations) pushes a realistic signed event through the *same* pipeline — try the "📡 Simulate carrier webhook" button on any shipment. |
| **Business-rule alerts** | Rule **DM-01 (Overdue auto-delay)**: active shipments past ETA are automatically flagged *Delayed*, timeline-logged (`System · rule DM-01`), audited, and role-targeted notifications sent. Runs on a scheduler every 5 min (`RULES_SWEEP=off`, `RULES_SWEEP_INTERVAL_MIN` to tune) plus manual `POST /api/rules/sweep` and readable rules registry at `GET /api/rules`. |
| **Notification delivery tracking** | Every notification persists a `delivery[]` array per channel: in-app (always delivered) + optional webhook channel (`NOTIFICATION_WEBHOOK_URL`). Config missing → `skipped` with reason; unreachable → `failed` after **2 attempts with backoff**, attempt count + last error stored. Delivery problems never interrupt core operations. |
| **Trustworthy AI** | Assistant statistics are **computed by MongoDB aggregation** and quoted verbatim (Gemini is forbidden from recomputing). Assistant sees **only data your role can read**; Admin-only topics (audit, user administration) are politely refused for other roles. Recovery plans are clamped to approved teams/levels/priorities with a `validation` report shown in the UI ("auto-corrected by validation"), clearly labeled **advisory suggestions, never confirmed actions**. Every AI/assistant output reports its engine (Gemini model vs. fallback, incl. 429/timeout reasons) and each assistant answer is itself audit-recorded. |

## Quick start

```bash
# 1) install
cd smartship
npm run setup          # installs server + client deps

# 2) build the React client (served by Express at :5000)
npm run build

# 3) run everything
npm start              # http://localhost:5000
```

Dev mode (hot reload): `npm run dev:server` (port 5000) + `npm run dev:client` (port 5173, proxies `/api`).

## Gemini API key (server-only)

1. Get a key at <https://aistudio.google.com/app/apikey>.
2. Put it in `server/.env`:
   ```
   GEMINI_API_KEY=your-key-here
   ```
3. Restart the server. The `/api/health` endpoint and the sidebar indicator switch from *"AI fallback mode"* to *"Gemini AI connected"*.

Without a key (or if the API errors/times out — 20s timeout), every plan is generated by the **rule-based engine** and labeled `rule-based (…)`, so demos never break.

## Database

* If `MONGODB_URI` is set in `server/.env` → connects to that MongoDB (Atlas/local).
* Otherwise → an **embedded real MongoDB** starts automatically with a persistent on-disk data directory at `server/.cache/db` (data survives restarts).
* On first run with an empty DB, demo data is seeded: **5 users, 16 shipments, 10 exceptions** (with escalations & resolutions).

## Demo accounts

| Role | Email | Password |
|---|---|---|
| Admin | `admin@smartship.io` | `Admin@123` |
| Dispatcher | `dispatcher@smartship.io` | `Dispatch@123` |
| Operations | `ops@smartship.io` | `Ops@1234` |
| Customer Service | `service@smartship.io` | `Service@123` |
| Supervisor | `supervisor@smartship.io` | `Super@123` |

## Permission matrix (enforced server-side)

| Action | Admin | Dispatcher | Operations | Customer Service | Supervisor |
|---|:-:|:-:|:-:|:-:|:-:|
| Create / edit shipments, update status | ✔ | ✔ | ✔ | — | — |
| Delete shipments | ✔ | — | — | — | — |
| Report exceptions + generate AI plans | ✔ | ✔ | ✔ | ✔ | ✔ |
| Change severity / team / status | ✔ | — | ✔ | — | ✔ |
| Escalate | ✔ | ✔ | — | — | ✔ |
| Resolve | ✔ | — | ✔ | — | ✔ |
| Manage users & roles | ✔ | — | — | — | — |

## API overview

```
POST /api/auth/register | login        GET  /api/auth/me
GET/POST /api/shipments                GET/PUT/DELETE /api/shipments/:id
PATCH /api/shipments/:id/status        POST /api/shipments/:id/ai-plan
GET/POST /api/exceptions               GET/PATCH /api/exceptions/:id
POST /api/exceptions/:id/escalate      POST /api/exceptions/:id/resolve
POST /api/exceptions/:id/ai-plan
POST /api/assistant/chat               (AI Logistics Assistant — all roles)
GET  /api/audit  · /api/audit/meta  · /api/audit/:id   (Admin, read-only)
GET  /api/dashboard/stats
GET  /api/notifications  (per-user, role-targeted)  POST /api/notifications/:id/read  ·  /read-all
GET  /api/users  · PATCH /api/users/:id/role   (Admin)
GET  /api/track/:trackingId            (public; carrier + source + last-update)
POST /api/integrations/carrier-webhook (HMAC-signed carrier events)
POST /api/integrations/simulate        (Admin/Dispatcher/Operations — signed test event)
GET  /api/integrations/carrier         (provider info)
GET  /api/rules  · POST /api/rules/sweep (Admin/Supervisor/Operations)
GET  /api/health                       (db + AI mode + rules + carrier)
```

All lists support `q`, filters and `page`/`limit`. Errors return `{ message }` with proper status codes.

Carrier webhook signature: `x-carrier-signature: sha256=<HMAC-SHA256(rawBody, CARRIER_WEBHOOK_SECRET)>` — default secret `smartship-simulated-secret` (set in `server/.env` for production). Unknown-status events return 400 (no side effects); unknown shipments 404 (no record created). Configurable env vars: `CARRIER_WEBHOOK_SECRET`, `NOTIFICATION_WEBHOOK_URL`, `RULES_SWEEP=off`, `RULES_SWEEP_INTERVAL_MIN`.
