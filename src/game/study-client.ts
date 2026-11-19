import { clearAuthToken, getAuthToken } from 'deepspace'
import { STUDY_API } from './history'

export async function studyRequest<T>(path: string, options: { body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const jwt = await getAuthToken()
  if (!jwt) throw new Error('Sign in to access your study records.')
  const response = await fetch(`${STUDY_API}${path}`, {
    method: options.body === undefined ? 'GET' : 'POST',
    headers: {
      Authorization: `Bearer ${jwt}`,
      ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000),
  })
  if (response.status === 401) clearAuthToken()
  const data = await response.json().catch(() => null)
  if (!response.ok || !data) {
    const message = data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
      ? data.error : 'Study records are temporarily unavailable. Please try again.'
    throw new Error(message)
  }
  return data as T
}
