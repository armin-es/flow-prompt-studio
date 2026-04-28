import { getClerkTokenOptional } from './clerkTokenRegistry'

/**
 * Fetch for same-origin `/api` routes (or `VITE_API_ORIGIN`) when the API may require
 * cookie sessions (`AUTH_SECRET` + `AUTH_PASSWORD`) or Clerk JWTs (`CLERK_SECRET_KEY`).
 */
export async function apiFetch(
  input: string | URL | Request,
  init?: RequestInit,
): Promise<Response> {
  const headers = new Headers(init?.headers)
  if (!headers.has('Authorization')) {
    const token = await getClerkTokenOptional()
    if (token) {
      headers.set('Authorization', `Bearer ${token}`)
    }
  }
  return fetch(input, {
    ...init,
    headers,
    credentials: init?.credentials ?? 'include',
  })
}
