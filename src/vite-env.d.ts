/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Clerk publishable key for the SPA (Dashboard → API keys). Pair with `CLERK_SECRET_KEY` on the API.
   * When set, wraps the app in `ClerkProvider` and sends Bearer tokens to `/api/*`.
   */
  readonly VITE_CLERK_PUBLISHABLE_KEY?: string
  /**
   * Public origin of the Hono API in production, e.g. `https://your-api.onrender.com`
   * (no path, no trailing slash). Empty in dev: requests use same-origin `/api/...` via the Vite proxy.
   */
  readonly VITE_API_ORIGIN?: string
  /** Set to `1` to push/pull corpora to Postgres when `DATABASE_URL` is set on the API. Also makes Retrieve (cosine) prefer `POST /api/retrieve` so chunk/query vectors are not written to the client embed IndexedDB when the server succeeds. */
  readonly VITE_SYNC_SERVER?: string
  /** Optional; if `1`, same server-side cosine retrieve as `VITE_SYNC_SERVER` (useful without corpus sync). */
  readonly VITE_SERVER_COSINE_RETRIEVE?: string
  /**
   * If `1` and server cosine fails, fall back to in-browser cosine (may fill `flow-prompt-embed-v1` in IndexedDB).
   * If unset, failed server retrieve throws instead (no silent client cache).
   */
  readonly VITE_COSINE_CLIENT_FALLBACK?: string
  /** If `1`, never use IndexedDB for the embed vector cache (memory only). Redundant when `VITE_SYNC_SERVER=1`. */
  readonly VITE_NO_CLIENT_EMBED_IDB?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
