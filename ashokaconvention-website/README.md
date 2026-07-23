# AshokaConvention Website

Starter React + Vite website scaffold for `ashokaconvention`.

Quick start:

```bash
npm install
npm run dev
```

Build:

```bash
npm run build
npm run preview
```

## Google sign-in (admin / guest roles)

The site supports "Sign in with Google". Anyone can sign in as a guest; emails
listed as admins get an extra "Admin" nav item.

Frontend setup:

```bash
cp .env.example .env
# fill in VITE_GOOGLE_CLIENT_ID and VITE_API_URL
```

Backend (`server/`) setup:

```bash
cd server
npm install
cp .env.example .env
# fill in GOOGLE_CLIENT_ID, ADMIN_EMAILS, SESSION_SECRET, CLIENT_ORIGIN
npm run dev
```

Both the frontend (`VITE_GOOGLE_CLIENT_ID`) and backend (`GOOGLE_CLIENT_ID`)
must use the same OAuth Client ID from the Google Cloud Console (Credentials >
OAuth 2.0 Client IDs), with your dev/prod origins added as authorized
JavaScript origins.
