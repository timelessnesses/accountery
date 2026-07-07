# accountery

accountery is a simple "weekly obligations" tracker thingy for my faculty. This entire repository uses Cloudflare infrastructure stack. Meaning you need to have a Cloudflare account and a Cloudflare Worker instance running for the main app paired with R1 storage for slip images and D2 database for storing students and their obligations.  
You also need to have a separate CF Worker instance running for the cronjob.

## Features

- Google OAuth2 (Google Sign-In or GSI) for authentication (with domain restriction)
- Student ID whitelisting (admin can import students from CSV or XLSX file)
- Automatic weekly obligations creator (with a separate cronjob worker)
- Slip image verification using SlipOK API (optional)

## Requirements

- Cloudflare account
- Cloudflare Worker instance for the main app
- Cloudflare Worker instance for the cronjob (optional)
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
5. Replaces `static/cropped-qr.jpg` with your own PromptPay QR code image with the same name.
6. You can either deploy with `pnpm deploy` or run locally with `pnpm dev`.

## Environment Variables

```dotenv
GOOGLE_OAUTH_CLIENT_SECRET=
PUBLIC_GOOGLE_OAUTH_CLIENT_ID=
ADMIN_EMAIL=
PUBLIC_ORGANIZATION_DOMAIN=

PUBLIC_RECEPIENT_EXPECTED_PROXY=
PUBLIC_RECEPIENT_EXPECTED_PROXY_VALUE_ENDING=
PUBLIC_RECEPIENT_NAME_ENG=
PUBLIC_RECEPIENT_NAME_THAI=
SLIP_OK_API_ENDPOINT=
SLIP_OK_API_KEY=
```

- `GOOGLE_OAUTH_CLIENT_SECRET`: Google OAuth client secret (Required)
- `PUBLIC_GOOGLE_OAUTH_CLIENT_ID`: Google OAuth client ID (Required)
- `ADMIN_EMAIL`: The email address of the admin user for setting up the app (Required)
- `PUBLIC_ORGANIZATION_DOMAIN`: The domain name of the organization or a suffix to the email addresses of the students (Required) (Example: [6910310259@tsu.ac.th] will have `tsu.ac.th` as the domain name, this will help Google Identity Services to narrow the account selection to only the students of the organization)
- `PUBLIC_RECEPIENT_EXPECTED_PROXY`: The expected proxy for the recipient (Required if SLIP_OK_API_ENDPOINT and SLIP_OK_API_KEY are set)
- `PUBLIC_RECEPIENT_EXPECTED_PROXY_VALUE_ENDING`: The expected proxy value ending (Required if SLIP_OK_API_ENDPOINT and SLIP_OK_API_KEY are set)
- `PUBLIC_RECEPIENT_NAME_ENG`: The expected recipient name in English (Required if SLIP_OK_API_ENDPOINT and SLIP_OK_API_KEY are set)
- `PUBLIC_RECEPIENT_NAME_THAI`: The expected recipient name in Thai (Required if SLIP_OK_API_ENDPOINT and SLIP_OK_API_KEY are set)
- `SLIP_OK_API_ENDPOINT`: The URL of the SlipOK API endpoint (Optional)
- `SLIP_OK_API_KEY`: The API key for the SlipOK API (Optional)

### Login as Student setup

This app uses Google OAuth2 (Google Sign-In or GSI) for authentication. You need a Google Cloud project with OAuth2 client credentials set up. The `GOOGLE_OAUTH_CLIENT_SECRET` and `PUBLIC_GOOGLE_OAUTH_CLIENT_ID` environment variables should be set to the client secret and client ID of your OAuth2 credentials, respectively.

### SlipOK API setup

This app uses the [SlipOK API](https://slipok.com/api) for checking slip images. You need to set the `SLIP_OK_API_ENDPOINT` and `SLIP_OK_API_KEY` environment variables to the URL of the SlipOK API endpoint and the API key, respectively.

### Student ID whitelisting

You need an admin email logged in (`ADMIN_EMAIL`) and then you can import students with CSV or XLSX file (indexing starts at 0 sorry!) then select which row to be student ID, name and even nickname and individually select which student can have admin role.

### Automatic Weekly Obligations Creator

You can also deploy [`accountery-cron`](https://github.com/timelessnesses/accountery-cron) to automatically create weekly obligations for students. You need to set up a separate Cloudflare Worker instance for the cronjob and tie the main D2 database to it.

### Known Issues

- No resetting session tokens, we switched from session tokens to JWT for performance with expiration time of one hour. You can log out and log back in to refresh the token.
- No password reset or account logins, GSI handles that.
- You can't really delete student account once they've made an action (like logging in) because of SQLite's foreign key constraints. You can only delete students that have no obligations or actions in the logs.
