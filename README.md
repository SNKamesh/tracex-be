# tracex-be

Express backend with Firebase token verification.

## Local setup

```bash
npm install
npm run dev
```

## Endpoints

- `GET /` -> `{ status: "ok" }`
- `GET /health` -> `{ status: "healthy" }`
- `GET /me` (requires Bearer token)

## Firebase setup

Set one of these:

- `GOOGLE_APPLICATION_CREDENTIALS` to a service account JSON file path
- `FIREBASE_SERVICE_ACCOUNT` to the JSON string of your service account

## Deploy (Render)

Build: `npm install`
Start: `npm start`
