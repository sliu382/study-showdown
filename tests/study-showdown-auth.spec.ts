import { expect, test } from '@playwright/test'

test('prompts for sign-in and restores the form after a redirect', async ({ page }) => {
  let generationCalls = 0
  await page.route('**/api/auth/token', (route) => route.fulfill({ status: 401, json: {} }))
  await page.route('**/api/auth/get-session*', (route) => route.fulfill({ body: 'null', contentType: 'application/json' }))
  await page.route('**/api/quiz/generate', async (route) => {
    generationCalls++
    await route.abort()
  })

  await page.goto('/')
  await page.getByLabel('Study topic').fill('Astronomy')
  await page.getByRole('group', { name: 'Number of categories' }).getByText('5', { exact: true }).click()
  await page.getByRole('button', { name: 'Advanced options (optional)' }).click()
  await page.getByLabel('Category 5 (optional)').fill('Comets')
  await page.getByLabel('Learning level').selectOption('college')
  await page.getByLabel('Additional study context').fill('Focus on comets.')
  await page.getByRole('button', { name: 'Generate Game' }).click()
  await expect(page.getByRole('alert')).toContainText('A DeepSpace session is required')
  await page.getByRole('navigation').getByRole('button', { name: 'Sign In', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Sign in to generate a game' })).toBeVisible()

  // Simulate returning to the landing page from OAuth without calling an auth provider.
  const callback = await page.request.get('/api/auth/oauth-complete', { maxRedirects: 0 })
  expect(callback.status()).toBe(302)
  expect(new URL(callback.headers().location).pathname).toBe('/')
  await page.reload()
  await expect(page.getByLabel('Study topic')).toHaveValue('Astronomy')
  await expect(page.getByLabel('Category 5 (optional)')).toHaveValue('Comets')
  await expect(page.getByLabel('Learning level')).toHaveValue('college')
  await expect(page.getByLabel('Additional study context')).toHaveValue('Focus on comets.')
  expect(generationCalls).toBe(0)
})
