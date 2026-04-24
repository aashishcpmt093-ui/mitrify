# Mitrify - Fast Service, Instant Connect

## Overview
Mitrify is a service marketplace web application designed to connect customers with nearby service providers. It supports a multi-role system including Customer, Service Provider, Admin, and Co-Admin. The project aims to provide a seamless experience for service discovery and delivery, featuring a credit-based payment system, robust authentication, and comprehensive administrative controls.

## User Preferences
- Mobile-first design
- Clean, minimal UI
- Professional look with subtle animations

## System Architecture
**Frontend:** The application is built with React, TypeScript, Vite, Tailwind CSS, and Shadcn UI, focusing on a responsive and modern user interface. It supports dark mode and offers multi-language support (EN/हिंदी/Hinglish) with a language picker and locale persistence.
**Backend:** The backend is powered by Node.js and Express, providing a robust API layer for all application functionalities.
**Database:** PostgreSQL is used as the primary database, managed with the Drizzle ORM for efficient data interaction.
**Authentication:** A flexible authentication system is implemented, supporting Google OAuth 2.0, local username/password, and OTP-based login (via Firebase Phone Auth and Gmail SMTP for email OTP). A unified login flow ensures users can select their role (Customer/Provider) after initial authentication, with both roles accessible under a single user account.
**Routing:** Client-side routing is handled by `wouter`.

**Core Features:**
- **Multi-Role System:** Supports Customer, Provider, Admin, and Co-Admin roles, with distinct dashboards and functionalities for each.
- **Provider Management:** Co-admins can bulk import potential providers, who then go through a verification workflow by main admins. Approved providers are onboarded with auto-generated credentials. Providers can set their service area and hide their profiles from public search.
- **Service Discovery:** Customers can search for providers based on location, service, and other criteria, with results displaying distance.
- **Credit-Based System:** A credit system governs interactions. Users receive free monthly credits, and additional credits can be purchased. Calls deduct credits from both customer and provider accounts.
- **Jobs Feature:** Users can post jobs, search for jobs, and manage their own posted jobs.
- **Admin Panel:** A comprehensive admin dashboard provides tools for user management, credit adjustments, content management (e.g., "About Us," "Terms & Conditions"), job management, and co-admin administration. It includes search, filter, and sort capabilities, along with CSV export.
- **Guest Mode:** Allows unauthenticated users to search for providers, with restricted actions prompting login.
- **Call Masking:** Ensures privacy by not exposing actual phone numbers between customers and providers.
- **Dynamic Content:** Admin-editable content for recruitment links and site information.

## External Dependencies
- **Google OAuth 2.0:** For social login integration.
- **Firebase Phone Auth:** For SMS OTP verification.
- **Nodemailer (via Gmail SMTP):** For email OTP verification.
- **Cashfree Payments:** Integrated as the payment gateway for credit purchases, supporting various payment methods.
- **OpenStreetMap Nominatim:** Used for geocoding and location-based services (current location, custom location).
- **XLSX & Multer:** For handling Excel/CSV file uploads in the bulk contact import feature.
## Restore Merge Mode (Apr 2026)
Backup restore now supports two modes: **Merge** (default, safe) and **Overwrite** (original destructive behaviour). Merge mode transforms every INSERT into `INSERT ... ON CONFLICT DO NOTHING`, skips TRUNCATE/DELETE entirely, and keeps all existing rows unchanged — only new rows from the backup are inserted. The restore dialog now shows a 2-card mode toggle (green for Merge, red for Overwrite), mode-aware warning panels and confirmation checkbox text, and a per-table summary showing "Added / Skipped" columns for merge vs the original "Before / After / Δ" for overwrite. The dry-run preview table gains an "In DB now" column in merge mode. All 6 restore API routes (`/api/admin/restore`, `/api/admin/restore/preview`, `/api/admin/restore/gcs`, `/api/admin/restore/gcs-preview`, `/api/admin/restore/stored`, `/api/admin/restore/stored/preview`) accept a `mode` field (default `"merge"`). `countRowsPerTable` is now exported from `backupJob.ts` so routes can inject live DB counts into preview responses.

## Cleanup (Apr 2026)
Removed dead code & assets to shrink the repo: deleted orphan `customer-login.tsx` and `provider-login.tsx` (no longer routed in `App.tsx`), pruned 66 unreferenced files from `attached_assets/` (kept only the logo and founder image actually imported via `@assets/`), removed 4 unused server endpoints (`POST /api/local/reset-password`, `GET /api/profiles/roles`, `GET /api/admin/subscriptions`, `GET /api/employees/coadmin/:coAdminId`) and their `shared/routes.ts` spec entry, and dropped 7 unused `IStorage` methods (`getPromoCodeByOwner`, `getProfileById`, `createCreditPayment`, `getCreditPaymentByOrderId`, `markCreditPaymentPaid`, `listPendingProviders`, `deleteEmployee`) plus their implementations and now-unused type imports. App behavior unchanged.
