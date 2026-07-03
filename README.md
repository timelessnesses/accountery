# accountery

accountery is a simple "weekly obligations" tracker thingy for my faculty. This entire repository uses Cloudflare infrastructure stack. Meaning you need to have a Cloudflare account and a Cloudflare Worker instance running for the main app paired with R1 storage for slip images and D2 database for storing students and their obligations.  
You also need to have a separate CF Worker instance running for the cronjob.

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

## Login as Student setup

This app uses Google OAuth2 (Google Sign-In or GSI) for authentication. You need a Google Cloud project with OAuth2 client credentials set up. The `GOOGLE_OAUTH_CLIENT_SECRET` and `PUBLIC_GOOGLE_OAUTH_CLIENT_ID` environment variables should be set to the client secret and client ID of your OAuth2 credentials, respectively.

## SlipOK API setup

This app uses the [SlipOK API](https://slipok.com/api) for checking slip images. You need to set the `SLIP_OK_API_ENDPOINT` and `SLIP_OK_API_KEY` environment variables to the URL of the SlipOK API endpoint and the API key, respectively.

## Student ID whitelisting

You need an admin email logged in (`ADMIN_EMAIL`) and then you can import students with CSV or XLSX file (indexing starts at 0 sorry!) then select which row to be student ID, name and even nickname and individually select which student can have admin role.

## Automatic Weekly Obligations Creator

You can also deploy [`accountery-cron`](https://github.com/timelessnesses/accountery-cron) to automatically create weekly obligations for students. You need to set up a separate Cloudflare Worker instance for the cronjob and tie the main D2 database to it.
