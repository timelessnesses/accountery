# accountery

accountery is a simple "weekly obligations" tracker thingy for my faculty. This entire repository uses Cloudflare infrastructure stack. Meaning you need to have a Cloudflare account and a Cloudflare Worker instance running for the main app paired with R1 storage for slip images and D2 database for storing students and their obligations.  
The main Worker also runs the scheduled jobs; no separate cron Worker is required.

## Features

- Google OAuth2 (Google Sign-In or GSI) for authentication (with domain restriction)
- Student ID whitelisting (admin can import students from CSV or XLSX file)
- Automatic weekly obligations creator (scheduled in the main Worker)
- Slip image verification using SlipOK API (optional)

## Requirements

- Cloudflare account
- Cloudflare Worker instance for the main app
- R1 storage for slip images
- D2 database for storing students and their obligations
- Google Cloud project with OAuth2 client credentials set up
- SlipOK API key (optional, for slip image verification)
- Google Workspace for the organization

## Setup

0. Install dependencies (`pnpm install`)
1. Create a Cloudflare Worker instance and set up R1 storage and D2 database. You can use the `wrangler.jsonc` file in this repository as a reference for the configuration. Make sure to set the correct values for your R1 storage and D2 database in the `wrangler.jsonc` file.
2. You need to get OAuth2 credentials from Google Cloud Console. Create a new project, enable the Google Identity Services API, and create OAuth2 client credentials. Set the `GOOGLE_OAUTH_CLIENT_SECRET` and `PUBLIC_GOOGLE_OAUTH_CLIENT_ID` environment variables to the client secret and client ID of your OAuth2 credentials, respectively.
3. You need to set up secrets (`pnpm wrangler secret put` on each variable) or [.env](#environment-variables) and secret stores (pnpm wrangler secrets-store) for `ACCOUNTERY_JWT_SECRET` where the value is a random string of at least 32 characters encoded in base64. This is used for signing JWT tokens for the app. You can generate a random string using `openssl rand -base64 32` or any other method you prefer.
4. Migrate the D2 database schema using `pnpm wrangler d1 migrations apply --database accountingdb` (replace `accountingdb` with your D2 database name if you have a different one). This will create the necessary tables for the app.
5. Open **Admin → PromptPay settings** and upload the receiving PromptPay QR image from your banking app. Review the extracted recipient and save it. Apply `0018_raw_promptpay_data.sql` before using this feature.
6. You can either deploy with `pnpm deploy` or run locally with `pnpm dev`.

## Environment Variables

```dotenv
GOOGLE_OAUTH_CLIENT_SECRET=
PUBLIC_GOOGLE_OAUTH_CLIENT_ID=
ADMIN_EMAIL=
PUBLIC_ORGANIZATION_DOMAIN=

SLIP_OK_API_ENDPOINT=
SLIP_OK_API_KEY=
AUTHENTICATION_METHOD=
```

- `GOOGLE_OAUTH_CLIENT_SECRET`: Google OAuth client secret (Required)
- `PUBLIC_GOOGLE_OAUTH_CLIENT_ID`: Google OAuth client ID (Required)
- `ADMIN_EMAIL`: The email address of the admin user for setting up the app (Required)
- `PUBLIC_ORGANIZATION_DOMAIN`: The domain name of the organization or a suffix to the email addresses of the students (Required) (Example: [6910310259@tsu.ac.th] will have `tsu.ac.th` as the domain name, this will help Google Identity Services to narrow the account selection to only the students of the organization)
- `SLIP_OK_API_ENDPOINT`: The URL of the SlipOK API endpoint (Optional)
- `SLIP_OK_API_KEY`: The API key for the SlipOK API (Optional)
- `AUTHENTICATION_METHOD`: How server would identify user logging in using either JSON Web Token (JWT) or session token (SESSION). Trade off is for JWT you can't revoke the key, and role reflection will not be updated until next login, for SESSION it's extra database hops but you can revoke the key and role reflection will be updated immediately. Default is JWT.

### Login as Student setup

This app uses Google OAuth2 (Google Sign-In or GSI) for authentication. You need a Google Cloud project with OAuth2 client credentials set up. The `GOOGLE_OAUTH_CLIENT_SECRET` and `PUBLIC_GOOGLE_OAUTH_CLIENT_ID` environment variables should be set to the client secret and client ID of your OAuth2 credentials, respectively.

### SlipOK API setup

This app uses the [SlipOK API](https://slipok.com/api) for checking slip images. You need to set the `SLIP_OK_API_ENDPOINT` and `SLIP_OK_API_KEY` environment variables to the URL of the SlipOK API endpoint and the API key, respectively.

### Student ID whitelisting

You need an admin email logged in (`ADMIN_EMAIL`) and then you can import students with CSV or XLSX file (indexing starts at 0 sorry!) then select which row to be student ID, name and even nickname and individually select which student can have admin role.

### Automatic Weekly Obligations Creator

The main Worker's `src/platform.cloudflare.ts` handles weekly obligations and notification
reminders. `wrangler.jsonc` includes the former cron Worker's Sunday schedule (`0 0 * * SUN`,
07:00 Asia/Bangkok) and hourly catch-up (`0 * * * *`). These create the next Sunday's ฿30
obligation only if it does not already exist and its start date is not paused. Duplicate
invocations and soft-deleted weeks are not recreated.

Deploy the main app with `pnpm deploy`. If the separate `accounting-cron` Worker is already
deployed, disable its cron triggers when switching over. The legacy submodule is no longer
used by the main app and does not need to be built or deployed.

### Known Issues

- No resetting session tokens, we switched from session tokens to JWT for performance with expiration time of one hour. You can log out and log back in to refresh the token.
- No password reset or account logins, GSI handles that.
- You can't really delete student account once they've made an action (like logging in) because of SQLite's foreign key constraints. You can only delete students that have no obligations or actions in the logs.

### Backfill

Edit the `0021_backfill_transaction_processors.sql` file to add processors for your transactions if you're updating.

### Notifications and installed app sharing

Apply migrations through `0023_notifications.sql`; its `notifications` table stores device
push subscriptions only. Notifications go directly to Cloudflare Queue (`NotificationQueue`),
which handles delivery retries and sends exhausted messages to `notification-dead-letter`.
There is no in-app inbox, D1 outbox, or delivery ledger. Configure `VAPID_PUBLIC_KEY` and
`VAPID_PRIVATE_KEY` for push, and `RESEND_API_KEY` for messages requesting email delivery.

Payment submissions, processing results, and newly created obligations enqueue alerts after
the database write. All producers and scheduled jobs use the main Worker's `NotificationQueue`
binding. Daily payment reminders run at 09:00 Asia/Bangkok (`0 2 * * *` UTC).
Queue retries can resend successful pushes; stable tags let browsers replace matching alerts,
and email requests use provider idempotency keys. A queue outage before enqueueing is logged;
it does not roll back a saved payment or obligation, and there is no database backlog to replay.

Shared slips use the existing SlipOK verification and `slipok_cache`. The cache's bank and
transfer reference are checked atomically with payment creation to prevent concurrent duplicate
shares. No separate slip claims table or additional migration is required. Automatic approval
still requires the opt-in setting and all recipient, amount, and duplicate checks to pass.
