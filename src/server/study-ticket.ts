import { computeHmacHex, timingSafeEqualHex } from 'deepspace/worker'
import type { SavedGame, StudySaveTicket } from '../game/history'

// Domain-separate this proof from other uses of the Worker-only owner credential.
const signerInput = (payload: string) => `study-save-v1:${payload}`

export async function makeStudySaveTicket(secret: string, userId: string, game: SavedGame): Promise<StudySaveTicket> {
  if (!secret) throw new Error('Missing retry signing credential')
  const payload = JSON.stringify({ userId, expiresAt: Date.now() + 30 * 60_000, game })
  return { payload, signature: await computeHmacHex(secret, signerInput(payload)) }
}

export async function readStudySaveTicket(secret: string, userId: string, ticket: StudySaveTicket): Promise<SavedGame | null> {
  if (!secret || !/^[a-f0-9]{64}$/.test(ticket.signature)) return null
  const expected = await computeHmacHex(secret, signerInput(ticket.payload))
  if (!(await timingSafeEqualHex(expected, ticket.signature))) return null

  // Only parse the board after proving the payload came from this Worker.
  const { userId: owner, expiresAt, game } = JSON.parse(ticket.payload) as {
    userId: string
    expiresAt: number
    game: SavedGame
  }
  return owner === userId && expiresAt > Date.now() ? game : null
}
