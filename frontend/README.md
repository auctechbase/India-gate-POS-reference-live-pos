# POS frontend (React)

This is the source of the POS screen, recovered from the source maps (`*.js.map`) that were
shipped inside the old production build. Building it gives a UI that is pixel-identical to the
one that was in use (checked on dashboard, POS, inventory, products, configuration, sales,
orders and reports).

What could not be recovered and was rebuilt:
- `package.json`: library versions read from the bundle (React 19.0.0, Bootstrap 5.3.3,
  jQuery 3.7.1, axios 1.7.9, react-router 6) or picked from early 2025.
- `public/index.html`: rebuilt from the built `index.html`.
- Images: copied from the build; `profile.png` and `default.png` were embedded in the JS.

## Backend address

The UI talks to the address it was loaded from (`src/config.js`), so no port is baked into
the build. The backend listens on **5200** by default (`POS_PORT` to change it); the original
POS uses 5100, so both can run on the same computer. `.env.development` points `npm start`
(dev server on :3000) at the backend.

## Commands

```bash
cd frontend
npm install
npm start               # dev server on :3000, talks to the backend on :5200
npm run build:backend   # production build into backend/client/build (what Electron serves)
```

`npm run build:backend` empties `backend/client/build` first and builds without source maps.

## Watch out

The **Update** button in the app downloads the vendor's UI from pos.dftech.in and unpacks it
into `backend/client`, replacing this build. Disable or repoint it before changing the UI here.
