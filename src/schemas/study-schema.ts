import type { CollectionSchema, RolePermissions } from 'deepspace/schema'
import { CATEGORY_MAX_LENGTH, STUDY_CONTEXT_MAX_LENGTH, TOPIC_MAX_LENGTH } from '../game/generation'

export const GAMES = 'study-games'
export const ATTEMPTS = 'study-attempts'

// RecordRoom's default owner check uses the server-assigned createdBy.
const ownRead: RolePermissions = { read: 'own', create: false, update: false, delete: false }
const permissions = { viewer: ownRead, member: ownRead, admin: ownRead }

export const gamesSchema: CollectionSchema = {
  name: GAMES,
  permissions,
  columns: [
    { name: 'topic', storage: 'text', interpretation: 'plain', required: true, maxLength: TOPIC_MAX_LENGTH },
    { name: 'learningLevel', storage: 'text', interpretation: 'plain', maxLength: CATEGORY_MAX_LENGTH },
    { name: 'studyContext', storage: 'text', interpretation: 'plain', maxLength: STUDY_CONTEXT_MAX_LENGTH },
    { name: 'categories', storage: 'text', interpretation: { kind: 'json' }, required: true },
  ],
}

export const attemptsSchema: CollectionSchema = {
  name: ATTEMPTS,
  permissions,
  uniqueOn: ['gameId', 'attemptKey'],
  columns: [
    { name: 'gameId', storage: 'text', interpretation: { kind: 'reference', targetTable: GAMES, displayColumn: 'topic' }, required: true },
    { name: 'attemptKey', storage: 'text', interpretation: 'plain', required: true },
    { name: 'score', storage: 'number', interpretation: 'plain', required: true },
    { name: 'possibleScore', storage: 'number', interpretation: 'plain', required: true },
    { name: 'correctCount', storage: 'number', interpretation: 'plain', required: true },
    { name: 'total', storage: 'number', interpretation: 'plain', required: true },
    { name: 'missedQuestionIds', storage: 'text', interpretation: { kind: 'json' }, required: true },
  ],
}
