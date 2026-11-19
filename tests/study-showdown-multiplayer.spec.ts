import { expect, test } from '@playwright/test'
import { sampleGame } from '../src/game/sample'

test('guests can steal or pass on the sample board without seeing the shared answer early', async ({ page }) => {
  await page.route('**/api/auth/get-session*', (route) => route.fulfill({ json: null }))
  await page.goto('/')
  await page.getByRole('link', { name: 'Play Sample Game' }).click()
  await page.getByRole('radio', { name: 'Local Multiplayer' }).check()
  await page.getByLabel('Number of players').selectOption('4')
  await page.getByLabel('Player 1', { exact: true }).fill('Ana')
  await page.getByRole('button', { name: 'Start Game' }).click()
  const scoreboard = page.getByRole('region', { name: 'Scoreboard' })
  await expect(scoreboard.getByRole('listitem')).toHaveCount(4)
  await expect(scoreboard.getByRole('status')).toHaveText('Current turn: Ana')

  await page.getByRole('button', { name: 'Data Structures, 100 points', exact: true }).click()
  const dialog = page.getByRole('dialog')
  const answer = dialog.getByRole('textbox', { name: 'Your answer' })
  const submit = dialog.getByRole('button', { name: 'Submit Answer' })
  const pass = dialog.getByRole('button', { name: 'Pass', exact: true })
  await expect(dialog.getByText('Data Structures · 100 points')).toBeVisible()
  await expect(dialog.getByText(/A stack/)).toHaveCount(0)
  await expect(submit).toBeDisabled()
  await answer.fill('   ')
  await expect(submit).toBeDisabled()
  await answer.press('Enter')
  await expect(dialog.getByRole('status')).toHaveText('Current turn: Ana')

  await answer.fill('queue')
  await answer.press('Enter')
  await expect(dialog.getByRole('status')).toHaveText('Player 2 — Your chance to steal!')
  await expect(dialog.getByText('Incorrect answer. The clue is still open.')).toBeVisible()
  await expect(page.locator('.study-scoreboard [aria-current="true"]')).toContainText('Player 2')
  await expect(dialog.getByText(/A stack/)).toHaveCount(0)
  await expect(answer).toHaveValue('')
  await expect(answer).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeVisible()

  await answer.fill('discard this draft')
  await pass.click()
  await expect(dialog.getByRole('status')).toHaveText('Player 3 — Your chance to steal!')
  await expect(answer).toHaveValue('')
  await expect(dialog.getByText(/Incorrect answer/)).toHaveCount(0)
  await answer.fill('  LIFO   STACK. ')
  await submit.click()
  await expect(dialog.getByRole('status')).toHaveText('Player 3 stole the clue for 100 points!')
  await expect(dialog.getByText(/A stack/)).toBeVisible()
  await dialog.getByRole('button', { name: 'Continue' }).click()
  await expect(scoreboard.getByRole('status')).toHaveText('Current turn: Player 2')
  await expect(scoreboard.getByRole('listitem').filter({ hasText: 'Player 3' })).toContainText('100 pts')
  await expect(page.getByRole('button', { name: 'Data Structures, 100 points, correct', exact: true })).toBeDisabled()

  await page.getByRole('button', { name: 'Data Structures, 200 points', exact: true }).click()
  for (const player of ['Player 3', 'Player 4', 'Ana']) {
    await pass.click()
    await expect(dialog.getByRole('status')).toHaveText(`${player} — Your chance to steal!`)
    await expect(dialog.getByText(/A queue/)).toHaveCount(0)
  }
  await pass.click()
  await expect(dialog.getByRole('status')).toHaveText('No one earned points.')
  await expect(dialog.getByText(/A queue/)).toBeVisible()
  await dialog.getByRole('button', { name: 'Continue' }).click()
  await expect(scoreboard.getByRole('status')).toHaveText('Current turn: Player 3')
})

test('saved multiplayer replay keeps scores out of personal history and restarts locally', async ({ page }) => {
  const gameId = '48e1ebee-e0ee-43e3-8bd6-81076c301e64'
  const game = { ...sampleGame, id: gameId, createdAt: '2026-11-19T14:00:00.000Z' }
  const questionCount = game.categories.reduce((total, category) => total + category.questions.length, 0)
  let studyGameReads = 0
  let attemptSaves = 0
  let generations = 0
  await page.route('**/api/auth/get-session*', (route) => route.fulfill({
    json: { user: { id: 'test-student', name: 'Student', email: 'student@example.test' }, session: { id: 'mock-session' } },
  }))
  await page.route('**/api/auth/token', (route) => route.fulfill({ json: { token: 'mock-session-token' } }))
  await page.route('**/api/study/history', (route) => route.fulfill({
    json: { entries: [{ game: { id: gameId, topic: game.topic, createdAt: game.createdAt, categoryCount: game.categories.length, questionCount }, attempts: [] }] },
  }))
  await page.route(`**/api/study/games/${gameId}`, (route) => {
    studyGameReads++
    return route.fulfill({ json: { game } })
  })
  await page.route('**/api/study/games/*/attempts', (route) => {
    attemptSaves++
    return route.abort()
  })
  await page.route('**/api/quiz/generate', (route) => {
    generations++
    return route.abort()
  })

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/history')
  await page.getByRole('link', { name: 'Replay Game' }).click()
  await page.getByRole('radio', { name: 'Local Multiplayer' }).check()
  await page.getByRole('button', { name: 'Start Game' }).click()
  const board = page.getByRole('region', { name: 'Question board' })
  const scoreboard = page.getByRole('region', { name: 'Scoreboard' })
  const dialog = page.getByRole('dialog')
  await expect(scoreboard.getByRole('status')).toHaveText('Current turn: Player 1')
  for (let index = 0; index < questionCount; index++) {
    await board.getByRole('button').and(page.locator(':enabled')).first().click()
    await dialog.getByRole('textbox', { name: 'Your answer' }).fill(index === 0 ? 'a stack' : 'incorrect guess')
    await dialog.getByRole('button', { name: 'Submit Answer' }).click()
    if (index > 0) await dialog.getByRole('button', { name: 'Pass', exact: true }).click()
    await dialog.getByRole('button', { name: 'Continue' }).click()
  }

  await expect(page.getByRole('region', { name: 'Final rankings' })).toContainText('Winner: Player 1')
  await expect(page.getByText('Multiplayer scores aren’t saved to study history.')).toBeVisible()
  const review = page.getByRole('region', { name: 'Missed questions' })
  await review.getByText(/Player 2 · \d+ missed/).click()
  await expect(review.getByText(/A queue/)).toBeVisible()
  await page.getByRole('button', { name: 'Play Again' }).click()
  await expect(scoreboard.getByRole('status')).toHaveText('Current turn: Player 1')
  await expect(scoreboard.getByRole('listitem').filter({ hasText: '0 pts' })).toHaveCount(2)
  await expect(board.getByRole('button').and(page.locator(':enabled'))).toHaveCount(questionCount)
  await page.getByRole('link', { name: 'My History', exact: true }).click()
  await expect(page.getByText('No completed attempts yet.')).toBeVisible()
  expect(studyGameReads).toBe(1)
  expect(attemptSaves).toBe(0)
  expect(generations).toBe(0)
})
