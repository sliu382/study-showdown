import { describe, expect, it } from 'vitest'
import { POINT_VALUES, assessQuestion, summarizeGame, type PlayerProgress } from '../game/game'
import type { QuizRequest } from '../game/generation'
import { InvalidQuizError, validateGeneratedBoard } from './quiz'

const request: QuizRequest = {
  topic: 'Astronomy',
  learningLevel: 'college',
  studyContext: 'Focus on orbital mechanics.',
  categoryCount: 6,
  customCategories: [null, 'Moons', null, null, null, 'Comets'],
}

function fixture() {
  return {
    categories: ['Stars', 'Moons', 'Planets', 'Orbits', 'Galaxies', 'Comets'].map((title) => ({
      title,
      questions: [...POINT_VALUES].reverse().map((points) => ({
        points,
        prompt: `What is a ${title} concept at level ${points}?`,
        answer: 'An example answer.',
        explanation: 'An example explanation.',
      })),
    })),
  }
}

describe('validateGeneratedBoard with mock model output', () => {
  it('keeps custom positions, orders questions, and adds IDs and timestamps', () => {
    const game = validateGeneratedBoard(fixture(), request)
    const questions = game.categories.flatMap((category) => category.questions)
    expect(game).toMatchObject({
      topic: 'Astronomy', learningLevel: 'college', studyContext: 'Focus on orbital mechanics.',
    })
    expect(game.categories.map((category) => category.title)).toEqual(['Stars', 'Moons', 'Planets', 'Orbits', 'Galaxies', 'Comets'])
    expect(game.categories[1].questions.map((question) => question.points)).toEqual(POINT_VALUES)
    expect(new Set(questions.map((question) => question.id)).size).toBe(18)
    expect(game.createdAt).toBe(new Date(game.createdAt!).toISOString())
    expect(questions.every((question) => question.createdAt === game.createdAt)).toBe(true)
  })

  it.each([
    ['malformed data', () => ({ categories: [null] })],
    ['a wrong category count', (board) => board.categories.pop() && board],
    ['a wrong question count', (board) => board.categories[0].questions.pop() && board],
    ['duplicate points', (board) => {
      board.categories[0].questions[0].points = board.categories[0].questions[1].points
      return board
    }],
    ['a disallowed point value', (board) => ({
      categories: [{ ...board.categories[0], questions: [
        { ...board.categories[0].questions[0], points: 400 }, ...board.categories[0].questions.slice(1),
      ] }, ...board.categories.slice(1)],
    })],
    ['a missing answer', (board) => ({
      categories: [{ ...board.categories[0], questions: [
        { points: 300, prompt: 'A prompt', explanation: 'An explanation' }, ...board.categories[0].questions.slice(1),
      ] }, ...board.categories.slice(1)],
    })],
    ['an empty answer', (board) => {
      board.categories[0].questions[0].answer = '  '
      return board
    }],
    ['an overly long explanation', (board) => {
      board.categories[0].questions[0].explanation = 'x'.repeat(361)
      return board
    }],
    ['duplicate categories', (board) => {
      board.categories[2].title = ' stars '
      return board
    }],
    ['duplicate normalized questions', (board) => {
      board.categories[2].questions[0].prompt = `  ${board.categories[0].questions[0].prompt.toUpperCase().replaceAll(' ', '   ')}  `
      return board
    }],
    ['a replaced custom category', (board) => {
      board.categories[1].title = 'Satellites'
      return board
    }],
    ['reordered custom categories', (board) => {
      ;[board.categories[1], board.categories[5]] = [board.categories[5], board.categories[1]]
      return board
    }],
  ] satisfies [string, (board: ReturnType<typeof fixture>) => unknown][])('rejects %s', (_label, change) => {
    expect(() => validateGeneratedBoard(change(fixture()), request)).toThrow(InvalidQuizError)
  })

  it('scores and completes a six-category round from its actual questions', () => {
    const game = validateGeneratedBoard(fixture(), request)
    const [missed, ...correct] = game.categories.flatMap((category) => category.questions)
    let progress: PlayerProgress = { assessments: {} }
    expect(summarizeGame(game, progress)).toMatchObject({ total: 18, possibleScore: 3600, answered: 0 })
    progress = assessQuestion(progress, missed, 'incorrect')
    expect(assessQuestion(progress, missed, 'correct')).toBe(progress)
    for (const question of correct) progress = assessQuestion(progress, question, 'correct')
    expect(summarizeGame(game, progress)).toMatchObject({
      score: 3500, possibleScore: 3600, answered: 18, total: 18, accuracy: 94, missed: [missed],
    })
  })
})
