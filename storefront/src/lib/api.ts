const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api'
const STORE_ID = process.env.NEXT_PUBLIC_STORE_ID ?? ''

async function req<T>(path: string, init?: RequestInit, locale?: string): Promise<T> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('customer_token') : null
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(STORE_ID ? { 'X-Store-Id': STORE_ID } : {}),
      ...(locale ? { 'X-Locale': locale } : {}),
      ...(init?.headers ?? {}),
    },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message ?? err?.message ?? res.statusText ?? 'Request failed')
  }
  return res.json()
}

// `locale` (from next-intl's useLocale()) is optional but should be passed by
// storefront-facing callers so translated product/category content resolves —
// this is a plain browser fetch (no Next Data Cache involved), so a header is
// safe here, unlike server-rendered fetches which must use a `?locale=` query
// param instead (see app/[locale]/**/page.tsx) to avoid Next's fetch cache
// key not reliably varying on headers.
export const api = {
  get: <T>(path: string, locale?: string) => req<T>(path, undefined, locale),
  post: <T>(path: string, body: unknown, locale?: string) =>
    req<T>(path, { method: 'POST', body: JSON.stringify(body) }, locale),
  put: <T>(path: string, body: unknown, locale?: string) =>
    req<T>(path, { method: 'PUT', body: JSON.stringify(body) }, locale),
  del: <T>(path: string, locale?: string) => req<T>(path, { method: 'DELETE' }, locale),
}
