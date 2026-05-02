# Mitrify - Fast Service, Instant Connect

## Overview
Mitrify is a service marketplace web application designed to connect customers with nearby service providers. It supports a multi-role system including Customer, Service Provider, Admin, and Co-Admin. The project aims to provide a seamless experience for service discovery and delivery, featuring a credit-based payment system, robust authentication, and comprehensive administrative controls. The business vision is to create a leading platform for local service fulfillment, offering convenience and reliability to users while empowering service providers.

## User Preferences
- Mobile-first design
- Clean, minimal UI
- Professional look with subtle animations

## System Architecture
The application is built with a modern web stack. The **frontend** uses React, TypeScript, Vite, Tailwind CSS, and Shadcn UI, providing a responsive and multi-language (EN/हिंदी/Hinglish) user interface with dark mode support. Client-side routing is managed by `wouter`. The **backend** is powered by Node.js and Express, exposing a comprehensive API. **PostgreSQL** is the primary database, accessed via Drizzle ORM.

**Core architectural decisions and features include:**
-   **Multi-Role System:** Supports Customer, Provider, Admin, and Co-Admin roles, each with distinct functionalities and dashboards.
-   **Unified Authentication:** Integrates Google OAuth 2.0, local username/password, and OTP-based login (Firebase Phone Auth, Gmail SMTP). Users can access both Customer and Provider roles under a single account.
-   **Provider Onboarding & Management:** Co-admins can bulk import potential providers, who then undergo an admin verification workflow. Approved providers are onboarded with auto-generated credentials and can manage their service areas and visibility.
-   **Service Discovery:** Location-based search for providers, displaying distance to customers.
-   **Credit-Based System:** A credit system for interactions, with free monthly credits and options for additional purchases.
-   **Jobs Feature:** Functionality for users to post, search, and manage job listings.
-   **Comprehensive Admin Panel:** A dashboard for user management, credit adjustments, content management (e.g., "About Us," "Terms & Conditions"), job management, and co-admin administration, with search, filter, sort, and CSV export capabilities.
-   **Guest Mode:** Allows unauthenticated users to search for providers with restricted actions.
-   **Call Masking:** Privacy feature to protect user and provider phone numbers.
-   **Dynamic Content:** Admin-editable content for recruitment links and site information.
-   **Provider Tag Generation:** Automated and persistent job-based system for generating Hinglish and English hashtags for providers using a hybrid approach of a server-side dictionary and Google Gemini API, with error reporting and job recovery mechanisms.
-   **Google Places Integration:** Admin feature to fetch and import potential provider leads directly from Google Places API (New) Text Search. Bulk fan-out mode scans up to 6,000 unique businesses per (city × service) via a circle-grid `locationRestriction` strategy with live polling progress, Stop control, dedupe by `placeId` and normalized `(address, city)`, target dropdown (500/1k/3k/6k), and a per-admin daily rate limit (3 runs/day).
-   **Editable Contact Emails:** Contact emails displayed in customer and provider UIs are now editable via the admin panel.

## External Dependencies
-   **Google OAuth 2.0:** For social authentication.
-   **Firebase Phone Auth:** For SMS OTP verification.
-   **Nodemailer (via Gmail SMTP):** For email OTP verification.
-   **Cashfree Payments:** Payment gateway for credit purchases.
-   **OpenStreetMap Nominatim:** For geocoding and location-based services.
-   **XLSX & Multer:** For handling Excel/CSV file uploads.
-   **Google Gemini API:** For AI-driven provider tag generation and Google Places integration.