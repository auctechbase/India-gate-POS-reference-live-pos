# POS frontend (recovered source)

This React project was **recovered from the compiled build** in
`backend/client/build` using its source maps (`*.js.map` → `sourcesContent`).

- `src/`: original components, reducers, helpers (from the source maps)
- `src/asset/images`, `src/asset/fonts`: from `build/static/media` (content hash removed);
  `default.png` and `profile.png` were inlined in the JS as `data:` URLs and decoded back
- `src/index.css`, `src/components/layouts/loader.scss`: empty (they produced no CSS in the original build)
- `public/`: `index.html`, `style.css`, `css.css`, images, icons from the original build
- Library versions taken from the bundle where detectable
  (React 19.0.0, React Router 6.28.1, Bootstrap 5.3.3, jQuery 3.7.1, axios 1.7.9,
  DataTables 2.2.1, Select2 4.1.0-rc.0); the others are close matches.

## Commands

```
npm install
npm start          # dev server on http://localhost:3000 (backend must run on 5101)
npm run build      # production build in frontend/build
npm run build:pos  # build + copy into backend/client/build (old one kept as build.bak-<time>)
```

API/image URLs come from `.env` (`REACT_APP_BACKEND_URI`, `REACT_APP_IMAGE_URI`).
