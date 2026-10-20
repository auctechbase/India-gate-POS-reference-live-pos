// Where the backend is. The UI is served by the backend itself, so use the address the page
// was loaded from: no port or host is baked into the build (it used to be localhost:5100).
// REACT_APP_BACKEND_URI can still override it, e.g. for `npm start` on :3000.
const origin = typeof window !== 'undefined' ? window.location.origin : '';

export const BACKEND_URL = (process.env.REACT_APP_BACKEND_URI || `${origin}/`).replace(/\/?$/, '/');
export const IMAGE_URL = `${BACKEND_URL}images`;
