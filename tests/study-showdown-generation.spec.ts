import { expect, test } from '@playwright/test'
import { POINT_VALUES } from '../src/game/game'

test('customizes categories, retries a mock failure, and plays the generated board', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const titles = ['Stars', 'Moons', 'Planets', 'Orbits', 'Galaxies', 'Comets']
  const studyContext = 'Focus on orbital motion.\nAvoid calculus.'
  const contextDraft = `  ${studyContext}  `
  let generationCalls = 0
  let releaseResponse: () => void = () => {}
  const responseGate = new Promise<void>((resolve) => { releaseResponse = resolve })

  const gameId = '48e1ebee-e0ee-43e3-8bd6-81076c301e64'
  const createdAt = '2026-11-19T14:00:00.000Z'
  const game = {
    id: gameId, createdAt, topic: 'Astronomy', learningLevel: 'high-school', studyContext,
    categories: titles.map((title) => ({
      id: title,
      title,
      questions: POINT_VALUES.map((points) => ({
        id: `${title}-${points}`, points,
        prompt: `${title} mock question`, answer: 'Mock answer', acceptedAnswers: ['Mock answer'], explanation: 'Mock explanation',
      })),
    })),
  }
  await page.route('**/api/auth/get-session*', (route) => route.fulfill({
    json: { user: { id: 'test-student', name: 'Student', email: 'student@example.test' }, session: { id: 'mock-session' } },
  }))
  let gameReads = 0
  await page.route(`**/api/study/games/${gameId}`, (route) => {
    gameReads++
    return route.fulfill({ json: { game } })
  })
  const attemptKeys: string[] = []
  const savedAttempt = {
    id: 'mock-attempt', gameId, score: 3600, possibleScore: 3600,
    correctCount: 18, total: 18, missedQuestionIds: [], completedAt: createdAt,
  }
  await page.route(`**/api/study/games/${gameId}/attempts`, (route) => {
    const { attemptKey, assessments } = route.request().postDataJSON()
    expect(Object.keys(assessments)).toHaveLength(18)
    attemptKeys.push(attemptKey)
    return attemptKeys.length === 1
      ? route.fulfill({ status: 503, json: { error: 'Study records are temporarily unavailable.' } })
      : route.fulfill({ json: { attempt: savedAttempt } })
  })
  await page.route('**/api/study/history', (route) => route.fulfill({
    json: { entries: [{
      game: { id: gameId, createdAt, topic: game.topic, learningLevel: game.learningLevel, categoryCount: 6, questionCount: 18 },
      attempts: [savedAttempt],
    }] },
  }))
  await page.route('**/api/auth/token', (route) => route.fulfill({ json: { token: 'mock-test-session' } }))
  await page.route('**/api/quiz/generate', async (route) => {
    generationCalls++
    expect(route.request().postDataJSON()).toEqual({
      topic: 'Astronomy', categoryCount: 6, customCategories: ['Stars', null, null, null, null, 'Comets'],
      learningLevel: 'high-school', studyContext,
    })
    if (generationCalls === 1) {
      await responseGate
      return route.fulfill({ status: 502, json: { code: 'invalid_quiz', error: 'Please try generating the board again.' } })
    }
    return route.fulfill({ json: { game } })
  })

  await page.goto('/')
  await expect(page.getByText('9 questions', { exact: true })).toBeVisible()
  const level = page.getByLabel('Learning level')
  const context = page.getByLabel('Additional study context')
  const advanced = page.getByRole('button', { name: 'Advanced options (optional)' })
  await expect(level).toHaveValue('general')
  await expect(advanced).toHaveAttribute('aria-expanded', 'false')
  await expect(context).toBeHidden()
  await level.selectOption('high-school')
  await page.getByRole('button', { name: 'Generate Game' }).click()
  await expect(page.getByRole('alert')).toHaveText('Enter a study topic with at least 2 characters.')
  await page.getByLabel('Study topic').fill('  Astronomy  ')
  const categoryPicker = page.getByRole('group', { name: 'Number of categories' })
  const threeCategories = categoryPicker.getByRole('radio', { name: '3', exact: true })
  await expect(threeCategories).toBeChecked()
  await threeCategories.focus()
  await page.keyboard.press('ArrowRight')
  await expect(categoryPicker.getByRole('radio', { name: '4', exact: true })).toBeChecked()
  await expect(page.getByText('12 questions', { exact: true })).toBeVisible()
  await categoryPicker.getByText('6', { exact: true }).click()
  await expect(page.getByText('18 questions', { exact: true })).toBeVisible()
  await advanced.click()
  await expect(context).toHaveAttribute('maxlength', '500')
  await context.fill(contextDraft)
  await expect(page.getByText(`${contextDraft.length} / 500 characters`)).toBeVisible()
  await page.getByLabel('Category 1 (optional)').fill(' Stars ')
  await page.getByLabel('Category 6 (optional)').fill('Comets')
  await categoryPicker.getByText('3', { exact: true }).click()
  await expect(page.getByLabel('Category 6 (optional)')).toHaveCount(0)
  await categoryPicker.getByText('6', { exact: true }).click()
  await expect(page.getByLabel('Category 6 (optional)')).toHaveValue('Comets')
  await advanced.click()
  await expect(context).toBeHidden()

  await page.getByRole('button', { name: 'Generate Game' }).click()
  await expect(page.getByRole('button', { name: 'Generating…' })).toBeDisabled()
  releaseResponse()
  await expect(page.getByRole('alert')).toHaveText('Please try generating the board again.')
  await expect(page.getByLabel('Study topic')).toHaveValue('  Astronomy  ')
  await expect(level).toHaveValue('high-school')
  await expect(advanced).toHaveAttribute('aria-expanded', 'false')
  await advanced.click()
  await expect(context).toHaveValue(contextDraft)
  await expect(page.getByLabel('Category 1 (optional)')).toHaveValue(' Stars ')
  await advanced.click()
  await page.getByRole('button', { name: 'Retry Generation' }).click()
  await expect(page.getByRole('radio', { name: 'Solo Study', exact: true })).toBeChecked()
  await expect(page.getByRole('radio', { name: 'Local Multiplayer' })).toBeVisible()
  await page.getByRole('button', { name: 'Start Game' }).click()

  await expect(page.getByRole('heading', { name: 'Astronomy' })).toBeVisible()
  await expect(page.getByText('AI-generated game · High school', { exact: true })).toBeVisible()
  const board = page.getByRole('region', { name: 'Question board' })
  await expect(board.getByRole('button')).toHaveCount(18)
  await expect(page.locator('.study-board')).toHaveCSS('grid-template-columns', /^\S+px \S+px$/)
  await page.setViewportSize({ width: 1280, height: 900 })
  await expect(page.locator('.study-board')).toHaveCSS('grid-template-columns', /^(\S+px ){5}\S+px$/)
  await board.getByRole('button', { name: 'Comets, 300 points' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Reveal Answer' }).click()
  await expect(dialog.getByText('Mock explanation')).toBeVisible()
  await dialog.getByRole('button', { name: 'Correct', exact: true }).click()
  await expect(page.getByText('1 / 18', { exact: true })).toBeVisible()
  for (let index = 1; index < 18; index++) {
    await board.getByRole('button').and(page.locator(':enabled')).first().click()
    await dialog.getByRole('button', { name: 'Reveal Answer' }).click()
    await dialog.getByRole('button', { name: 'Correct', exact: true }).click()
  }
  await expect(page.getByRole('alert')).toContainText('Attempt not saved.')
  await expect(page.getByText('3600 / 3600')).toBeVisible()
  await page.getByRole('button', { name: 'Retry Save' }).click()
  await expect(page.getByText('Attempt saved to your study history.')).toBeVisible()
  expect(attemptKeys).toHaveLength(2)
  expect(attemptKeys[0]).toBe(attemptKeys[1])

  await page.getByRole('link', { name: 'My Study History' }).click()
  await expect(page.getByRole('heading', { name: 'My Study History' })).toBeVisible()
  await expect(page.getByText('High school · 6 categories · 18 questions')).toBeVisible()
  await expect(page.getByText('100% accuracy')).toBeVisible()
  await page.getByRole('link', { name: 'Replay Game' }).click()
  await expect(page.getByRole('radio', { name: 'Solo Study', exact: true })).toBeChecked()
  await page.getByRole('button', { name: 'Start Game' }).click()
  await expect(page.getByText('0 / 18', { exact: true })).toBeVisible()
  expect(gameReads).toBe(2)
  expect(generationCalls).toBe(2)
})
