/**
 * Fetch for same-origin `/api` routes (or `VITE_API_ORIGIN`) when the API may require
 * cookie sessions (`AUTH_SECRET` + `AUTH_PASSWORD` on the server).
 */
export function apiFetch(
  input: string | URL | Request,
  init?: RequestInit,
): Promise<Response> {
  return fetch(input, {
    ...init,
    credentials: init?.credentials ?? 'include',
  })
}
