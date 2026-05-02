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

## Fetch from Google Places (May 2026)
New admin feature: **"Fetch from Google Places"** card in admin dashboard (placed above "Meta Ads Lead Import"). Admin enters **city + work/service**, hits **"Fetch from Google"** button — backend calls **Google Places API (New) Text Search** (`POST https://places.googleapis.com/v1/places:searchText`, `regionCode: "IN"`, max 20 per page, supports `nextPageToken` for "Load more"). Returns businesses with name, formatted address, lat/lng, national/international phone, website, rating. Frontend shows scrollable checkbox list — places with phone are auto-selected. Admin picks a co-admin, optionally toggles "Allow Duplicates", and clicks "Import" — selected businesses are bulk-inserted into `pending_providers` with `source: "google"` (alongside existing `"meta"` and bulk-import sources). Includes lat/lng so providers don't need re-geocoding when approved. Endpoints: `POST /api/admin/google-places-search`, `POST /api/admin/google-places-import` (accepts `autoApprove` flag — when true, immediately calls `approvePendingProvider` on the just-inserted Google rows and they go live as actual providers, skipping the verify dashboard), `POST /api/admin/approve-google-bulk` (one-shot bulk approve mirror of `/approve-meta-bulk`). Storage method `bulkCreateGooglePlaces` de-dupes against existing pending + local users by mobile, batches 500. UI has a green "Direct Live Karein ⚡" toggle (default ON) next to the existing duplicate toggle, plus a separate "Google Leads — Bulk Approve" card below the import card for already-imported pending Google leads. Requires `GOOGLE_PLACES_API_KEY` secret (Places API New, Pro tier needed for phone numbers).

## Auto-Generate Provider Tags (May 2026)
New admin card **"Auto-Generate Provider Tags"** in admin dashboard (placed between Meta Ads Lead Import and the Bulk-Approve card). One-click backfill of 5–10 Hinglish + English hashtags for **all** providers using a **hybrid** approach: (1) server-side dictionary first (`server/lib/tag-dictionary.ts`, ~33 common Indian professions like plumber, electrician, ac-mechanic, beautician, mehndi-artist, pandit, RO-repair, mason, packers-movers, pest-control, etc., each with 8–10 curated tags + synonym list); (2) **Google Gemini API fallback** (`gemini-flash-latest` via `X-goog-api-key` header, REST call — no SDK needed) when the dictionary returns < 5 tags or no match. Existing tags are **always preserved** — new tags merge case-insensitively (lowercase, hyphenated, max 10 per provider). Endpoints: `POST /api/admin/auto-generate-tags` (accepts `dryRun` + optional `limit`, returns `{jobId, total, geminiAvailable}`) and `GET /api/admin/auto-generate-tags/status/:jobId` (polled every 2s by the UI). Job runs in-process with concurrency 4, single retry on Gemini 429s, in-memory progress (jobs auto-GC after 30 min). UI shows confirmation dialog → progress bar + 5-counter grid (Dictionary / AI / Hybrid / Skipped / Failed) → final toast and TanStack Query invalidation. Dry-run toggle previews counts without DB writes. Requires optional `GOOGLE_API_KEY` (or legacy `GEMINI_API_KEY`) secret — if missing, dictionary-only mode runs silently (UI shows an amber notice). Implementation file: `server/lib/auto-tags.ts`.

## Cleanup (Apr 2026)
Removed dead code & assets to shrink the repo: deleted orphan `customer-login.tsx` and `provider-login.tsx` (no longer routed in `App.tsx`), pruned 66 unreferenced files from `attached_assets/` (kept only the logo and founder image actually imported via `@assets/`), removed 4 unused server endpoints (`POST /api/local/reset-password`, `GET /api/profiles/roles`, `GET /api/admin/subscriptions`, `GET /api/employees/coadmin/:coAdminId`) and their `shared/routes.ts` spec entry, and dropped 7 unused `IStorage` methods (`getPromoCodeByOwner`, `getProfileById`, `createCreditPayment`, `getCreditPaymentByOrderId`, `markCreditPaymentPaid`, `listPendingProviders`, `deleteEmployee`) plus their implementations and now-unused type imports. App behavior unchanged.
