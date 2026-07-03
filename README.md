# accountery

accountery is a simple "weekly obligations" tracker thingy for my faculty.
You also need to have a separate CF Worker instance running for the cronjob.

## Environment Variables

```dotenv
GOOGLE_OAUTH_CLIENT_SECRET=
PUBLIC_GOOGLE_OAUTH_CLIENT_ID=
ADMIN_EMAIL=

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
