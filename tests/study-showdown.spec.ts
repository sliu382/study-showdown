import { expect, test } from '@playwright/test'
import { sampleGame } from '../src/game/sample'

test('plays a full sample round and starts over', async ({ page }) => {
  await page.goto('/')

  await page.getByRole('link', { name: 'Play Sample Game' }).click()
  await expect(page.getByRole('radio', { name: 'Solo Study', exact: true })).toBeChecked()
  await page.getByRole('button', { name: 'Start Game' }).click()
  const board = page.getByRole('region', { name: 'Question board' })
  const questions = sampleGame.categories.flatMap(({ questions }) => questions)
  const firstQuestion = sampleGame.categories[0].questions[0]
  const possibleScore = questions.reduce((sum, question) => sum + question.points, 0)
  await expect(board.getByRole('button')).toHaveCount(questions.length)
  const dialog = page.getByRole('dialog')
  const firstTile = board.getByRole('button', { name: 'Data Structures, 100 points', exact: true })
  await firstTile.click()
  await expect(dialog.getByRole('button', { name: 'Correct', exact: true })).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Reveal Answer' }).click()
  await expect(dialog.getByText(/A stack/)).toBeVisible()
  await dialog.getByRole('button', { name: 'Incorrect', exact: true }).click()
  await expect(board.getByRole('button', { name: 'Data Structures, 100 points, incorrect' })).toBeDisabled()

  for (let question = 0; question < questions.length - 1; question++) {
    await board.getByRole('button').and(page.locator(':enabled')).first().click()
    await dialog.getByRole('button', { name: 'Reveal Answer' }).click()
    await dialog.getByRole('button', { name: 'Correct', exact: true }).click()
  }

  await expect(page.getByRole('heading', { name: 'Round complete' })).toBeVisible()
  await expect(page.getByText('Sample results are not saved.')).toBeVisible()
  await expect(page.getByText(`${possibleScore - firstQuestion.points} / ${possibleScore}`)).toBeVisible()
  await expect(page.getByText(`${Math.round((questions.length - 1) / questions.length * 100)}%`)).toBeVisible()
  await expect(page.getByRole('region', { name: 'Missed questions' }).getByText(/A stack/)).toBeVisible()
  await page.getByRole('button', { name: 'Restart Game' }).click()
  await expect(firstTile).toBeEnabled()
  await expect(page.getByText(`0 / ${questions.length}`)).toBeVisible()
})

test('an older board without reliable typed answers can still be played in Solo Study', async ({ page }) => {
  const gameId = '48e1ebee-e0ee-43e3-8bd6-81076c301e64'
  const game = {
    ...sampleGame, id: gameId, createdAt: '2026-11-19T14:00:00.000Z',
    categories: sampleGame.categories.map((category) => ({
      ...category, questions: category.questions.map(({ acceptedAnswers: _aliases, ...question }) => question.id === 'stack' ? {
        ...question,
        prompt: 'Which **data structure** removes the most recently added item first?',
        answer: '*A stack.* It follows last in, first out (LIFO) order.',
        explanation: String.raw`Remember this with \(x^{2}\) and H₂O as notation examples.`,
      } : question),
    })),
  }
  await page.route('**/api/auth/get-session*', (route) => route.fulfill({
    json: { user: { id: 'test-student', name: 'Student', email: 'student@example.test' }, session: { id: 'mock-session' } },
  }))
  await page.route('**/api/auth/token', (route) => route.fulfill({ json: { token: 'mock-session-token' } }))
  await page.route(`**/api/study/games/${gameId}`, (route) => route.fulfill({ json: { game } }))

  await page.goto(`/play?game=${gameId}`)
  await expect(page.getByRole('radio', { name: 'Local Multiplayer' })).toBeDisabled()
  await expect(page.getByText(/This older board is available in Solo Study/)).toBeVisible()
  await page.getByRole('button', { name: 'Start Game' }).click()
  await page.getByRole('button', { name: 'Data Structures, 100 points', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading')).toHaveText('Which data structure removes the most recently added item first?')
  await dialog.getByRole('button', { name: 'Reveal Answer' }).click()
  await expect(dialog.getByText('A stack. It follows last in, first out (LIFO) order.', { exact: true })).toBeVisible()
  await expect(dialog.getByText('Remember this with x² and H₂O as notation examples.')).toBeVisible()
  await dialog.getByRole('button', { name: 'Correct', exact: true }).click()
  await expect(page.getByText(`1 / ${sampleGame.categories.flatMap(({ questions }) => questions).length}`, { exact: true })).toBeVisible()
})
