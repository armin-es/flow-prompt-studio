let getToken: (() => Promise<string | null>) | null = null

export function setClerkTokenGetter(fn: (() => Promise<string | null>) | null): void {
  getToken = fn
}

export async function getClerkTokenOptional(): Promise<string | null> {
  if (!getToken) {
    return null
  }
  try {
    return await getToken()
  } catch {
    return null
  }
}
