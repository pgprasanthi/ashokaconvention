# Deploying the backend to Render

The frontend is already hosted on Render as a Static Site. This adds the
Express backend (`server/`) as a second Render service in the same repo.

## 1. Push the latest code

Make sure everything is committed and pushed to GitHub before starting -
Render builds from the repo, not your local machine.

## 2. Create the Web Service

- Render dashboard -> **New +** -> **Web Service**
- Connect the same GitHub repo (`pgprasanthi/ashokaconvention`)
- **Root Directory**: `ashokaconvention-website/server`
- **Runtime**: Node
- **Build Command**: `npm install`
- **Start Command**: `npm start`

## 3. Set environment variables

In the new service's **Environment** tab, add everything from
`server/.env.example` except `PORT` (Render sets that automatically):

- `GOOGLE_CLIENT_ID`
- `GOOGLE_SHEETS_ID`
- `TEAM_RANGE`
- `TEAM_CACHE_TTL_MS`
- `GOOGLE_CALENDAR_ID`
- `SESSION_SECRET`
- `CLIENT_ORIGIN` - set this to the frontend's actual Render URL (not
  `localhost`), e.g. `https://ashokaconvention.onrender.com`

## 4. Upload the service account key as a Secret File

The service account JSON is deliberately gitignored, so it won't exist in
what Render builds from git. Use Render's **Secret Files** instead:

- In the service settings -> **Secret Files** -> add a file named
  `google-service-account.json`, paste in the JSON content
- Render mounts it at `/etc/secrets/google-service-account.json`
- Set the env var `GOOGLE_SERVICE_ACCOUNT_KEY_PATH` to that exact path

## 5. Update the frontend

- In the frontend's Render Static Site settings, set `VITE_API_URL` to the
  backend service's Render URL (e.g. `https://ashokaconvention-api.onrender.com`)
- Trigger a redeploy/rebuild of the frontend so the new value gets baked in
  (Vite env vars are resolved at build time, not runtime)

## 6. Update Google Cloud Console

- **APIs & Services -> Credentials** -> your OAuth Client ID -> add the
  frontend's Render URL to **Authorized JavaScript origins**
- **APIs & Services -> OAuth consent screen** -> click **Publish App** to
  move it from *Testing* to *In production*. While it's in Testing, only
  emails manually added as test users can sign in at all - publishing is
  what actually lets the public sign in as guests. For basic scopes like
  this (email/profile only) this does not require Google's verification
  review.

## Already handled in code

These were fixed ahead of time so deployment doesn't need further changes:

- Session cookie uses `sameSite: 'none'` + `secure: true` in production
  (`server/auth.js`), required since frontend and backend are on different
  subdomains
- `app.set('trust proxy', 1)` (`server/index.js`), required because Render
  terminates HTTPS in front of the app
- `server/package.json` has a `start` script matching Render's convention

## Verify after deploying

- Open the deployed frontend, sign in, confirm the session persists on
  refresh (checks the cookie settings are correct)
- Open the Calendar page and add/edit a booking (checks Sheets + Calendar
  API access from the deployed environment)
- Sign in with an account *not* in the Team sheet and confirm it resolves
  to guest (checks the OAuth consent screen is actually published)
