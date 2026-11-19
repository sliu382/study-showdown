import { RECORD_NOT_FOUND } from 'deepspace/worker'
import type { Env } from '../../worker'
import { ATTEMPTS } from '../schemas/study-schema'

type Row = { recordId: string; data: Record<string, unknown>; createdAt: string; updatedAt: string; createdBy: string }

export function mockStudyRoom() {
  const collections = new Map<string, Map<string, Row>>()
  const failures = new Set<string>()
  const fetch = async (request: Request) => {
    const { tool, params } = await request.json() as {
      tool: string
      params: { collection: string; recordId?: string; data?: Row['data']; where?: Record<string, unknown> }
    }
    const userId = request.headers.get('x-user-id')!
    const trusted = request.headers.get('x-app-action') === 'true'
    const collection = collections.get(params.collection) ?? new Map<string, Row>()
    collections.set(params.collection, collection)

    if (tool === 'records.create') {
      if (!trusted) throw new Error('Expected server-only write')
      if (failures.has(params.collection)) return Response.json({ success: false, error: 'Simulated database refusal' })
      const data = params.data!
      if (params.collection === ATTEMPTS && [...collection.values()].some((row) =>
        row.data.gameId === data.gameId && row.data.attemptKey === data.attemptKey)) {
        return Response.json({ success: false, error: 'Duplicate' })
      }
      const recordId = params.recordId ?? crypto.randomUUID()
      const now = new Date().toISOString()
      collection.set(recordId, { recordId, data, createdBy: userId, createdAt: now, updatedAt: now })
      return Response.json({ success: true, data: { recordId } })
    }
    if (trusted) throw new Error('Read unexpectedly bypassed ownership permissions')
    if (tool === 'records.get') {
      const record = collection.get(params.recordId!)
      if (!record) return Response.json({ success: false, error: RECORD_NOT_FOUND })
      if (record.createdBy !== userId) return Response.json({ success: false, error: 'READ DENIED: mock owner scope' })
      return Response.json({ success: true, data: { record } })
    }
    if (tool === 'records.query') {
      const records = [...collection.values()].filter((row) => row.createdBy === userId &&
        Object.entries(params.where ?? {}).every(([key, value]) =>
          (key === 'createdBy' ? row.createdBy : row.data[key]) === value))
      return Response.json({ success: true, data: { records, count: records.length } })
    }
    throw new Error('Unexpected RecordRoom operation')
  }
  const env = {
    DEEPSPACE_APP_ID: 'mock-test-app',
    APP_OWNER_JWT: 'mock-test-signing-secret',
    RECORD_ROOMS: { idFromName: (name: string) => name, get: () => ({ fetch }) },
  } as unknown as Env
  return { env, collections, failures }
}
