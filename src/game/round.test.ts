import { describe, expect, it } from 'vitest'
import {
  assessRound, closeLocalClue, rankPlayers, selectLocalClue, startRound, submitLocalAttempt, summarizePlayers,
} from './round'
import type { LocalOutcome, LocalPlayerCount, RoundState } from './round'
import { sampleGame } from './sample'
import { summarizeGame } from './game'

const questions = sampleGame.categories.flatMap(({ questions }) => questions)
const category = sampleGame.categories[0].title

type LocalRound = Extract<RoundState, { mode: 'local' }>

function localRound(playerCount: LocalPlayerCount) {
  const round = startRound({ mode: 'local', playerCount, names: [] })
  if (round.mode !== 'local') throw new Error('Expected local round')
  return round
}

function attempt(round: LocalRound, outcome: LocalOutcome) {
  if (!round.clue) throw new Error('Expected open clue')
  return submitLocalAttempt(round, round.clue, outcome)
}

function close(round: LocalRound) {
  if (!round.clue) throw new Error('Expected open clue')
  return closeLocalClue(round, round.clue)
}

function playCorrect(round: LocalRound, questionIndex: number) {
  return close(attempt(selectLocalClue(round, questions[questionIndex], category), 'correct'))
}

describe('round state', () => {
  it('keeps solo scoring and progress unchanged', () => {
    const start = startRound({ mode: 'solo' })
    const round = assessRound(assessRound(start, questions[0], 'correct'), questions[1], 'incorrect')
    expect(round).toEqual({
      mode: 'solo', progress: { assessments: { [questions[0].id]: 'correct', [questions[1].id]: 'incorrect' } },
    })
    expect(summarizeGame(sampleGame, round.progress)).toMatchObject({ score: 100, answered: 2, accuracy: 50 })
    expect(assessRound(round, questions[0], 'incorrect')).toBe(round)
  })

  it('initializes names, independent progress and first turn', () => {
    const round = startRound({ mode: 'local', playerCount: 4, names: ['  Ana  ', '', 'Lee'] })
    if (round.mode !== 'local') throw new Error('Expected local round')
    expect(round.players.map(({ name }) => name)).toEqual(['Ana', 'Player 2', 'Lee', 'Player 4'])
    expect(round.activePlayer).toBe(0)
    expect(round.progress.assessments).toEqual({})
    expect(new Set(round.players.map(({ progress }) => progress)).size).toBe(4)
  })

  it('awards points and rotates normally when the original player is correct', () => {
    const round = attempt(selectLocalClue(localRound(2), questions[0], category), 'correct')
    expect(round.clue).toMatchObject({ phase: 'resolved', originalPlayer: 0, winner: 0, attemptedPlayers: [0] })
    expect(round.activePlayer).toBe(1)
    expect(summarizeGame(sampleGame, round.progress)).toMatchObject({ score: 100, answered: 1 })
    expect(summarizePlayers(sampleGame, round.players)).toMatchObject([
      { score: 100, accuracy: 100, correct: 1, incorrect: 0 },
      { score: 0, accuracy: 0, correct: 0, incorrect: 0 },
    ])
  })

  it.each([2, 3, 4] as const)('offers each of %i players one opportunity in round-robin order', (playerCount) => {
    const start = playCorrect(localRound(playerCount), 0)
    let round = selectLocalClue(start, questions[1], category)
    for (let index = 0; index < playerCount; index++) {
      expect(round.clue).toMatchObject({
        phase: index === 0 ? 'answering' : 'stealing',
        originalPlayer: 1, answeringPlayer: (index + 1) % playerCount,
      })
      expect(round.progress.assessments[questions[1].id]).toBeUndefined()
      round = attempt(round, index === 0 ? 'incorrect' : 'pass')
    }
    expect(round.clue).toMatchObject({ phase: 'resolved', winner: null })
    expect(round.clue?.attemptedPlayers).toEqual(Array.from({ length: playerCount }, (_, index) => (index + 1) % playerCount))
    expect(round.progress.assessments[questions[1].id]).toBe('incorrect')
    expect(round.activePlayer).toBe(2 % playerCount)
    expect(summarizePlayers(sampleGame, round.players).map(({ incorrect }) => incorrect))
      .toEqual(Array.from({ length: playerCount }, (_, seat) => seat === 1 ? 1 : 0))
  })

  it('credits a successful steal and starts the next turn after the original selector', () => {
    const start = selectLocalClue(localRound(4), questions[2], category)
    const stealing = attempt(start, 'incorrect')
    expect(close(stealing)).toBe(stealing)
    const passed = attempt(stealing, 'pass')
    const round = attempt(passed, 'correct')

    expect(round.clue).toMatchObject({ phase: 'resolved', originalPlayer: 0, winner: 2, attemptedPlayers: [0, 1, 2] })
    expect(round.activePlayer).toBe(1)
    expect(summarizePlayers(sampleGame, round.players)).toMatchObject([
      { score: 0, accuracy: 0, incorrect: 1, missed: [questions[2]] },
      { score: 0, answered: 0, correct: 0, incorrect: 0 },
      { score: 300, accuracy: 100, correct: 1, incorrect: 0 },
      { score: 0, answered: 0 },
    ])
  })

  it('records unsuccessful steals and resolves the clue when every player answers incorrectly', () => {
    let round = selectLocalClue(localRound(3), questions[1], category)
    round = attempt(attempt(attempt(round, 'incorrect'), 'incorrect'), 'incorrect')
    expect(round.clue).toMatchObject({ phase: 'resolved', winner: null, attemptedPlayers: [0, 1, 2] })
    expect(summarizeGame(sampleGame, round.progress)).toMatchObject({ score: 0, answered: 1 })
    for (const stats of summarizePlayers(sampleGame, round.players)) {
      expect(stats).toMatchObject({ score: 0, incorrect: 1, accuracy: 0, missed: [questions[1]] })
    }
  })

  it('ignores duplicate submissions and keeps a resolved clue unavailable to everyone', () => {
    const start = selectLocalClue(localRound(2), questions[0], category)
    const stealing = attempt(start, 'pass')
    expect(submitLocalAttempt(stealing, start.clue!, 'correct')).toBe(stealing)
    const resolved = attempt(stealing, 'correct')
    expect(submitLocalAttempt(resolved, stealing.clue!, 'correct')).toBe(resolved)
    expect(attempt(resolved, 'correct')).toBe(resolved)
    const closed = close(resolved)
    expect(selectLocalClue(closed, questions[0], category)).toBe(closed)
    expect(summarizePlayers(sampleGame, closed.players).map(({ score }) => score)).toEqual([0, 100])
    expect(closed.activePlayer).toBe(1)
  })

  it('ranks by points with ties and safely handles players with no answers', () => {
    const start = startRound({ mode: 'local', playerCount: 4, names: [] })
    if (start.mode !== 'local') throw new Error('Expected local round')
    expect(rankPlayers(summarizePlayers(sampleGame, start.players)).map(({ rank, accuracy }) => [rank, accuracy]))
      .toEqual([[1, 0], [1, 0], [1, 0], [1, 0]])

    const tied = playCorrect(playCorrect(start, 0), 3)
    const missed = selectLocalClue(tied, questions[1], category)
    const round = close(attempt(attempt(attempt(attempt(missed, 'incorrect'), 'pass'), 'pass'), 'pass'))
    expect(rankPlayers(summarizePlayers(sampleGame, round.players)).map(({ rank, score }) => [rank, score]))
      .toEqual([[1, 100], [1, 100], [3, 0], [3, 0]])
    const next = playCorrect(round, 2)
    expect(rankPlayers(summarizePlayers(sampleGame, next.players))[0]).toMatchObject({ name: 'Player 4', rank: 1, score: 300 })
  })

  it('restarts with the same players, all tiles available and the first turn reset', () => {
    const config = { mode: 'local', playerCount: 2, names: ['Ana', 'Lee'] } as const
    const start = startRound(config)
    if (start.mode !== 'local') throw new Error('Expected local round')
    const first = playCorrect(start, 0)
    const played = attempt(selectLocalClue(first, questions[1], category), 'incorrect')
    expect(played).toMatchObject({ activePlayer: 1, clue: { phase: 'stealing' } })
    const restarted = startRound(config)
    if (restarted.mode !== 'local') throw new Error('Expected local round')
    expect(restarted.activePlayer).toBe(0)
    expect(restarted.clue).toBeNull()
    expect(restarted.progress.assessments).toEqual({})
    expect(summarizePlayers(sampleGame, restarted.players)).toMatchObject([
      { name: 'Ana', score: 0, answered: 0 }, { name: 'Lee', score: 0, answered: 0 },
    ])
  })
})
