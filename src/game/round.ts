import { assessQuestion, summarizeGame } from './game'
import type { Assessment, Game, PlayerProgress, Question } from './game'

export const LOCAL_PLAYER_COUNTS = [2, 3, 4] as const
export type LocalPlayerCount = typeof LOCAL_PLAYER_COUNTS[number]

export type RoundConfig =
  | { mode: 'solo' }
  | { mode: 'local'; playerCount: LocalPlayerCount; names: readonly string[] }

interface LocalPlayer {
  name: string
  progress: PlayerProgress
}

export type LocalOutcome = Assessment | 'pass'

export type LocalClue = {
  question: Question
  category: string
  originalPlayer: number
  answeringPlayer: number
  attemptedPlayers: readonly number[]
} & (
  | { phase: 'answering' }
  | { phase: 'stealing'; previousOutcome: 'incorrect' | 'pass' }
  | { phase: 'resolved'; winner: number | null }
)

type LocalRound = {
  mode: 'local'
  progress: PlayerProgress
  players: readonly LocalPlayer[]
  activePlayer: number
  clue: LocalClue | null
}

export type RoundState = { mode: 'solo'; progress: PlayerProgress } | LocalRound

export function defaultPlayerName(index: number) {
  return `Player ${index + 1}`
}

export function startRound(config: RoundConfig): RoundState {
  const progress: PlayerProgress = { assessments: {} }
  if (config.mode === 'solo') return { mode: 'solo', progress }

  const names = Array.from({ length: config.playerCount }, (_, index) =>
    config.names[index]?.trim() || defaultPlayerName(index))
  const players = names.map((name, index) => ({
    name: names.some((other, seat) => seat !== index && other.toLowerCase() === name.toLowerCase())
      ? `${name} (${defaultPlayerName(index)})` : name,
    progress: { assessments: {} },
  }))
  return { mode: 'local', progress, players, activePlayer: 0, clue: null }
}

export function assessRound(round: RoundState, question: Question, assessment: Assessment): RoundState {
  if (round.mode !== 'solo') return round
  const progress = assessQuestion(round.progress, question, assessment)
  return progress === round.progress ? round : { ...round, progress }
}

export function selectLocalClue(round: LocalRound, question: Question, category: string): LocalRound {
  if (round.clue || Object.hasOwn(round.progress.assessments, question.id)) return round
  return {
    ...round,
    clue: {
      phase: 'answering', question, category, originalPlayer: round.activePlayer,
      answeringPlayer: round.activePlayer, attemptedPlayers: [],
    },
  }
}

export function submitLocalAttempt(round: LocalRound, clue: LocalClue, outcome: LocalOutcome): LocalRound {
  // The current clue object identifies one opportunity. Late clicks from an
  // earlier opportunity cannot score or move the next player on.
  if (round.clue !== clue || clue.phase === 'resolved') return round

  const { answeringPlayer, originalPlayer, question } = clue
  if (clue.attemptedPlayers.includes(answeringPlayer)) return round
  const attemptedPlayers = [...clue.attemptedPlayers, answeringPlayer]
  const players = outcome === 'pass' ? round.players : round.players.map((player, index) =>
    index === answeringPlayer ? { ...player, progress: assessQuestion(player.progress, question, outcome) } : player)

  if (outcome !== 'correct' && attemptedPlayers.length < players.length) {
    return {
      ...round, players,
      clue: { ...clue, phase: 'stealing', previousOutcome: outcome, attemptedPlayers, answeringPlayer: (answeringPlayer + 1) % players.length },
    }
  }

  return {
    ...round, players,
    progress: assessQuestion(round.progress, question, outcome === 'correct' ? 'correct' : 'incorrect'),
    activePlayer: (originalPlayer + 1) % players.length,
    clue: { ...clue, phase: 'resolved', attemptedPlayers, winner: outcome === 'correct' ? answeringPlayer : null },
  }
}

export function closeLocalClue(round: LocalRound, clue: LocalClue): LocalRound {
  if (round.clue !== clue || clue.phase === 'stealing') return round
  return { ...round, clue: null }
}

export function summarizePlayers(game: Game, players: readonly LocalPlayer[]) {
  return players.map(({ name, progress }, seat) => {
    const stats = summarizeGame(game, progress)
    return { name, seat, ...stats, correct: stats.answered - stats.missed.length, incorrect: stats.missed.length }
  })
}

export function rankPlayers(players: ReturnType<typeof summarizePlayers>) {
  const ordered = [...players].sort((a, b) => b.score - a.score)
  return ordered.map((player, index) => ({
    ...player,
    rank: index > 0 && player.score === ordered[index - 1].score
      ? ordered.findIndex(({ score }) => score === player.score) + 1
      : index + 1,
  }))
}
