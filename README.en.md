<div align="center">

# AH2 — إيه إتش تو

### Customer & Ledger Management System for Shops and Small Businesses

An Arabic-first (RTL), mobile-first web app that records every customer and every financial movement, computes balances instantly, and exports a ready-to-share statement or invoice as text, image, or PDF.

[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Vite](https://img.shields.io/badge/Vite-8-646FDD?logo=vite&logoColor=white)](https://vite.dev)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![Express](https://img.shields.io/badge/Express-4-000000?logo=express&logoColor=white)](https://expressjs.com)
[![SQLite](https://img.shields.io/badge/SQLite-node%3Asqlite-003B57?logo=sqlite&logoColor=white)](https://nodejs.org/api/sqlite.html)
[![License](https://img.shields.io/badge/License-Private-lightgrey)](#-license)

**🌍 [العربية](README.md) · English**

</div>

---

## 📖 Table of Contents

- [Concept](#-concept)
- [Problem It Solves](#-problem-it-solves)
- [Key Features](#-key-features)
- [Balance Logic](#-balance-logic)
- [Tech Stack](#-tech-stack)
- [Project Structure](#-project-structure)
- [Quick Start](#-quick-start)
- [Environment Variables](#-environment-variables)
- [Database](#-database)
- [API Reference](#-api-reference)
- [Roles & Permissions](#-roles--permissions)
- [Account Recovery](#-account-recovery)
- [Security](#-security)
- [Screen Map (35 screens)](#-screen-map-35-screens)
- [Production Deployment](#-production-deployment)
- [Roadmap](#-roadmap)
- [Contributing](#-contributing)
- [License](#-license)

---

## 💡 Concept

Instead of a paper ledger or scattered Excel sheets, **AH2** gives the shop owner one dashboard that answers, at any moment:

- **Who owes money and to whom** — total positive and negative balances right on the home screen.
- **Each customer's full account** — every deposit and withdrawal with date, time, and description.
- **A ready-to-send statement** — text, image, or PDF delivered via WhatsApp or any other app.
- **A backup of their data** — stored inside the database or exported as a JSON file.

The accounting model is intentionally simple: every customer has a **running account** at the shop (wallet-like), and the balance equals deposits minus withdrawals. A positive balance means the shop owes the customer; a negative balance means the customer owes the shop.

---

## 🎯 Problem It Solves

| Problem | AH2's answer |
| --- | --- |
| Paper ledgers get lost, and manual balance math is error-prone | Every movement is stored in a database and the balance is computed automatically |
| Customer invoices are handwritten or delayed | A statement/invoice is generated in one tap and sent via WhatsApp |
| Movements edited or deleted without the owner's knowledge | Movements are never deleted — they are cancelled with reason, user, and timestamp, plus an activity log |
| Multiple people working on the same account | Roles (owner/manager/employee) with 12 configurable permissions |
| Data lost when switching devices | JSON export/import plus internal backup and restore |
| Heavy accounting suites are hard to adopt | A simple Arabic UI, mobile-first, light/dark themes, and an offline notice |

---

## ✨ Key Features

### 🔐 Accounts & Authentication
- Registration creates a **user + project (shop)** together, with a separate project password.
- Sign in with phone number or email; sessions valid for **30 days**.
- Automatic phone normalization (Arabic/Persian digits → ASCII, `+20` / `0020` → local format).
- Change password, update profile, and an extra project password to confirm sensitive actions.

### 👥 Customers
- Add / edit / delete a customer (individual or company) with address and notes.
- Customer phone number is **unique per project** (duplicates rejected).
- Customer detail page: balance, transaction count, and the full statement.
- Fast search across the customer list.

### 💰 Financial Movements
- Two types only: **deposit/payment (+)** and **withdrawal (−)** — with amount, date, time, and description.
- **Cancel a movement** (never delete it) recording `cancelled_by`, `cancelled_at`, and `cancellation_reason`.
- "All transactions" and "Customer transactions" screens with filtering and full detail.

### 📤 Sharing & Reports
- Generate a statement/invoice in three formats: **formatted text**, **PNG image** (html2canvas), **PDF file** (jsPDF).
- Two content scopes: **balance only** or **full statement**.
- Direct sharing to: WhatsApp, Telegram, Messenger, IMO, Gmail, SMS, More (Web Share API), or Bluetooth.
- Reports with date filters: total customers, transactions, deposits, withdrawals, net financial position — plus print preview.

### 🗂️ Data Management
- Internal backups (create / restore) with file size and creation date.
- Full JSON export/import with counters for imported records.
- Reset all data (with confirmation).

### 🎨 User Experience
- Arabic RTL design with Cairo and IBM Plex Sans Arabic fonts, in a navy + gold + functional-green palette.
- **Light / Dark / System theme**, saved per user.
- A custom shop logo rendered on invoices and reports.
- Notifications with an unread counter and a full activity log.
- Automatic **offline banner**, plus clear success/error feedback on every step.
- A **Screen Switcher** for fast navigation across all 35 screens during development and demos.

---

## 🧮 Balance Logic

All math flows through a single module: `src/utils/balanceUtils.ts`

```
Balance = sum(active deposits) − sum(active withdrawals)
(cancelled movements, status = 'cancelled', are excluded entirely)
```

| Balance state | Meaning | Display |
| --- | --- | --- |
| `> 0` | Credit in the customer's favor — the shop owes them | Green: `رصيد لصالح العميل` |
| `< 0` | Amount due to the shop from the customer | Red: `مبلغ مستحق للمحل` |
| `= 0` | Settled account | Neutral: `الحساب متعادل` |

> The logic is centralized in one place, so the home screen, customer details, invoices, and reports always agree — no contradictory numbers.

---

## 🛠 Tech Stack

### Frontend
| Technology | Purpose |
| --- | --- |
| **React 19** + **TypeScript** | UI and components |
| **Vite 8** | Dev server and build |
| **Tailwind CSS 4** | Styling and theme system (CSS variables) |
| **lucide-react** | Icons |
| **motion** | Transitions and animations |
| **html2canvas** + **jsPDF** | Invoice images and PDF files |

### Backend
| Technology | Purpose |
| --- | --- |
| **Express 4** | API server and static hosting for the UI |
| **node:sqlite** (built into Node) | SQLite storage with zero external DB dependencies |
| **node:crypto (scrypt)** | Password and token hashing |
| **tsx** | Run TypeScript directly |

> The server serves both the UI and the API on the **same port (3000)**, so there is no CORS setup at all.

---

## 📁 Project Structure

```
Adel-elaskry/
├── server.ts                     # Express server + all API endpoints (auth, customers, transactions, …)
├── server/
│   ├── db.ts                     # Database schema + password hashing + phone normalization
│   └── recovery.ts               # Email/SMS providers for account recovery (Resend / Twilio / …)
├── src/
│   ├── App.tsx                   # Main router, app state, route guards
│   ├── main.tsx                  # Entry point
│   ├── index.css                 # Theme variables and global styles
│   ├── types/index.ts            # TypeScript types + the 35 screen IDs
│   ├── context/
│   │   ├── AuthContext.tsx        # User, project, permissions
│   │   └── ThemeContext.tsx       # Light / dark / system (saved per user)
│   ├── services/api.ts            # API client + token management
│   ├── utils/balanceUtils.ts      # Unified balance logic
│   ├── assets/                    # Logos (jpg / png / emblem)
│   └── components/
│       ├── screens/ScreensPart1..5.tsx   # The 35 screens across 5 files
│       ├── ShareModal.tsx         # Share sheet and invoice generation (text/image/PDF)
│       ├── Header.tsx / BottomNav.tsx / PageTitle.tsx
│       ├── CustomerBalanceBadge.tsx / InvoiceFooter.tsx
│       └── ScreenSwitcher.tsx     # Quick screen switcher
├── public/                       # Static logos
├── data/                         # Database files (ah2.db + WAL) — git-ignored
├── index.html                    # HTML template (RTL + Google Fonts)
├── vite.config.ts / tsconfig.json
├── metadata.json                 # App metadata and description
└── .env.example                  # Environment variable template
```

---

## 🚀 Quick Start

### Requirements
- **Node.js 22.5+** (recommended: **24 LTS**) — the project uses the built-in `node:sqlite` module.
- Any package manager: `npm` or `bun`.

> ⚠️ On Node 22.x you may need to start the server with `--experimental-sqlite`. On Node 24 it works out of the box.

### Steps

```bash
# 1) Clone
git clone https://github.com/adelelaskry1987-design/Adel-elaskry.git
cd Adel-elaskry

# 2) Install dependencies
npm install        # or: bun install

# 3) Configure environment
cp .env.example .env
# then fill in the values (see the table below)

# 4) Start dev (UI + API on the same port)
npm run dev        # or: bun run dev
```

Open **http://localhost:3000**

The database is created automatically at `data/ah2.db` on first run — no manual setup or migration scripts needed.

### Available scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Run the server + UI (Vite in middleware mode) |
| `npm run build` | Build the UI into `dist` |
| `npm start` | Run the production server (`dist` + API) |
| `npm run preview` | Preview the production build |
| `npm run lint` | Type-check with `tsc --noEmit` |
| `npm run clean` | Remove `dist` |

---

## 🔧 Environment Variables

Copy `.env.example` to `.env`. **Every** secret is read on the server only and is never sent to the browser.

### Core
| Variable | Description | Required |
| --- | --- | --- |
| `APP_URL` | Public URL of the app, used to build password-reset links | Yes in production |
| `GEMINI_API_KEY` | Gemini key (reserved for upcoming AI features) | No |

### Email delivery (password-reset links) — pick one provider
| Variable | Provider |
| --- | --- |
| `RECOVERY_EMAIL_FROM` | Sender address (shared by all providers) |
| `RESEND_API_KEY` | Resend |
| `SENDGRID_API_KEY` | SendGrid |
| `BREVO_API_KEY` | Brevo / Sendinblue |
| `EMAIL_WEBHOOK_URL` + `EMAIL_WEBHOOK_SECRET` | Custom webhook/SMTP relay |

### SMS delivery (OTP codes) — pick one provider
| Variable | Provider |
| --- | --- |
| `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` + `TWILIO_FROM_NUMBER` | Twilio |
| `VONAGE_API_KEY` + `VONAGE_API_SECRET` + `VONAGE_FROM` | Vonage / Nexmo |
| `SMS_GATEWAY_URL` + `SMS_GATEWAY_API_KEY` + `SMS_SENDER_ID` | Local SMS gateway (VictoryLink / WhySMS / custom) |

> Without these settings the app still works normally: the recovery screen reports that the email/SMS channel is not configured and offers a **manual support request** as a fallback.

---

## 🗄 Database

SQLite via `node:sqlite`; the schema is created automatically in `server/db.ts`:

| Table | Purpose |
| --- | --- |
| `users` | Users (unique phone, optional email, hashed password) |
| `projects` | Projects/shops + project password |
| `project_memberships` | Links users to projects with role and permissions (JSON) |
| `customers` | Customers (phone unique within a project) |
| `transactions` | Financial movements + cancellation state and metadata |
| `notifications` | Notifications and unread counter |
| `activity_logs` | Who did what and when |
| `backups` | Backups (JSON stored inside the database) |
| `auth_tokens` | Session tokens and expiry |
| `account_recovery_tokens` | Recovery tokens/codes with attempts and validity |
| `recovery_rate_limits` | Attempt limits to prevent recovery abuse |
| `support_recovery_requests` | Manual recovery requests via support |

The schema includes **safe migrations** (e.g. adding a `phone_verified` column when missing) and creates unique indexes only after verifying there are no duplicates — so an existing database never breaks.

---

## 🔌 API Reference

All routes live under `/api`. Everything outside `/api/auth/*` requires the header:

```
Authorization: Bearer <token>
```

### Auth & account
| Method | Endpoint | Description |
| --- | --- | --- |
| `POST` | `/api/auth/register` | Create user + project + session |
| `POST` | `/api/auth/login` | Sign in (phone or email) |
| `GET` | `/api/auth/me` | Current user, project, and permissions |
| `POST` | `/api/auth/logout` | End the session |
| `POST` | `/api/auth/change-password` | Change password |
| `POST` | `/api/auth/update-profile` | Update name/email/phone |
| `POST` | `/api/auth/set-project-password` | Set the project password |
| `POST` | `/api/auth/verify-project-password` | Verify the project password |
| `GET` | `/api/auth/recovery/status` | Are email/SMS channels configured? |
| `POST` | `/api/auth/recovery/email/request` | Send a reset link by email |
| `POST` | `/api/auth/recovery/email/verify-token` | Validate the reset link |
| `POST` | `/api/auth/recovery/email/reset` | Set a new password |
| `POST` | `/api/auth/recovery/phone/request` | Send an OTP code |
| `POST` | `/api/auth/recovery/phone/verify-otp` | Verify the OTP |
| `POST` | `/api/auth/recovery/phone/reset-password` | Set a new password |
| `POST` | `/api/auth/recovery/support-request` | Manual recovery request |

### Customers
| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/customers` | List customers with balances |
| `POST` | `/api/customers` | Create a customer |
| `GET` | `/api/customers/:id` | Customer details |
| `PUT` | `/api/customers/:id` | Update a customer |
| `DELETE` | `/api/customers/:id` | Delete a customer |

### Transactions & reports
| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/transactions` | Transactions (with filters) |
| `POST` | `/api/transactions` | Record a movement (deposit/withdrawal) |
| `POST` | `/api/transactions/:id/cancel` | Cancel a movement with a reason |
| `GET` | `/api/reports/summary` | Aggregated stats (optionally date-filtered) |

### Notifications & activity
| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/notifications` | List notifications |
| `POST` | `/api/notifications/:id/read` | Mark one as read |
| `POST` | `/api/notifications/read-all` | Mark all as read |
| `GET` | `/api/activity-logs` | Activity log |

### Backups & data
| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/backups` | List backups |
| `POST` | `/api/backups/create` | Create a backup |
| `POST` | `/api/backups/restore/:id` | Restore a backup |
| `POST` | `/api/data/export` | Export JSON |
| `POST` | `/api/data/import` | Import JSON |
| `POST` | `/api/data/reset` | Reset all data |

### Employees
| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/employees` | List project members |
| `POST` | `/api/employees` | Add an employee with specific permissions |
| `DELETE` | `/api/employees/:membershipId` | Remove an employee |

> **38 endpoints** in total; all error messages are returned in Arabic, ready to display to users.

---

## 🛡 Roles & Permissions

Three roles: **owner** / **manager** / **employee**, with 12 granular permissions stored per member:

| Permission | Meaning |
| --- | --- |
| `view_customers` | View customers |
| `add_customers` | Add a customer |
| `edit_customers` | Edit a customer |
| `delete_customers` | Delete a customer |
| `view_transactions` | View transactions |
| `create_transactions` | Record a movement |
| `cancel_transactions` | Cancel a movement |
| `view_reports` | View reports |
| `manage_employees` | Manage employees |
| `manage_backups` | Manage backups |
| `restore_data` | Restore data |
| `reset_data` | Reset data |

The owner automatically receives all 12 permissions at registration, and the UI uses `hasPermission()` to hide or disable anything the current user cannot do.

---

## 🔁 Account Recovery

A complete recovery flow with three channels:

1. **Email** — a link containing a hashed token, time-limited and single-use.
2. **Phone (OTP)** — a code sent through an SMS provider, with an attempt counter and a maximum.
3. **Manual support** — a form capturing name, project, and an alternative contact, stored for review.

All attempts are governed by the `recovery_rate_limits` table (time window + temporary lock) to prevent guessing and abuse, and codes/links are stored hashed — never in plain text.

---

## 🔒 Security

- Passwords hashed with **scrypt** and a random **salt**, compared in constant time (`timingSafeEqual`).
- Recovery tokens are stored hashed, with expiry and an attempt limit.
- Sessions last 30 days and are deleted on expiry or logout.
- All database queries use **prepared statements** (SQL-injection safe).
- Data is isolated per project: every query is scoped to the `project_id` taken from the token.
- Provider secrets (Resend/Twilio/…) are read server-side only and never exposed to the UI.

> ⚠️ Before a real launch: serve the app over **HTTPS**, add rate limiting to `/api/auth/*`, and review your data-retention policy.

---

## 🖥 Screen Map (35 screens)

| # | Screen | # | Screen | # | Screen |
| --- | --- | --- | --- | --- | --- |
| 1 | Splash | 13 | Transaction saved | 25 | Import data |
| 2 | Customer added | 14 | New transaction (deposit/withdrawal) | 26 | Import done |
| 3 | Profile | 15 | Customers & accounts | 27 | Export data |
| 4 | Login & sign-up | 16 | Customer updated | 28 | Export done |
| 5 | Home (positive/negative balance) | 17 | Share sheet | 29 | Notifications |
| 6 | Delete customer (password) | 18 | All transactions | 30 | About |
| 7 | Add new customer | 19 | Customer transactions | 31 | Edit customer |
| 8 | Password changed | 20 | Backups | 32 | Settings |
| 9 | App logo | 21 | Create backup | 33 | Reports & statistics |
| 10 | Customer deleted | 22 | Restore backup | 34 | Data management |
| 11 | Customer details | 23 | Data reset done | 35 | Support & help |
| 12 | Change password | 24 | Reset data | | |

The screens live in `ScreensPart1` → `ScreensPart5`, their IDs (`screen-1-splash` …) are defined in `src/types/index.ts`, and the **Screen Switcher** lets you jump to any of them directly.

---

## ☁️ Production Deployment

```bash
# 1) Build the UI
npm run build

# 2) Start the server in production mode
NODE_ENV=production npm start
```

- The server serves `dist` and the API together on port **3000** (ready for Railway / Render / Fly.io / a VPS).
- Set `APP_URL` to the real domain so password-reset links work.
- Make sure you **persist the `data/` directory** (or back it up regularly) — it holds the entire database.

---

## 🗺 Roadmap

- [x] Add a README and repository description
- [x] Stop tracking `data/` and `.aistudio/` in Git
- [ ] Use `@google/genai` to add an AI assistant (balance analysis, report summaries, reminder suggestions)
- [ ] Advanced reporting (monthly charts, receivables ageing)
- [ ] Excel export + automatic invoice delivery
- [ ] PWA with push notifications
- [ ] Automated tests (Vitest + Supertest) and splitting `server.ts` into route modules

---

## 🤝 Contributing

1. Create a branch: `git checkout -b feature/your-feature`
2. Make sure type-checking passes: `npm run lint`
3. Follow the existing style (functional components, explicit types, Arabic UI copy)
4. Open a Pull Request with a clear description of the change

---

## 📄 License

This project is **private** — all rights reserved by its owner. No open-source license file is included; please contact the owner before any use or redistribution.

---

<div align="center">

**AH2 — إيه إتش تو**
Customers, accounts, and financial movements — in a single app.
Made with ❤️ for the Arabic market.

</div>
