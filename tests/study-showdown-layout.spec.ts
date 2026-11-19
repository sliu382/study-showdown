import { expect, test } from '@playwright/test'

test('keeps the landing cards readable across desktop, laptop, and mobile widths', async ({ page }) => {
  await page.goto('/')
  const form = page.getByRole('region', { name: 'Create your game.' })
  const preview = page.getByRole('region', { name: 'Try a sample' })
  await expect(preview.getByRole('heading', { name: 'Databases' })).toBeVisible()

  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 })
    const configBox = (await form.boundingBox())!
    const previewBox = (await preview.boundingBox())!
    expect(configBox.x).toBeGreaterThan(0)
    expect(previewBox.x + previewBox.width).toBeLessThan(width)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)

    if (width >= 1024) {
      expect(configBox.x + configBox.width).toBeLessThan(previewBox.x)
      expect(configBox.y).toBeCloseTo(previewBox.y)
      expect(Math.abs(configBox.width - previewBox.width)).toBeLessThan(1)
      expect(configBox.height).toBeCloseTo(previewBox.height)
      const generateBox = (await form.getByRole('button', { name: 'Generate Game' }).boundingBox())!
      const sampleBox = (await preview.getByRole('link', { name: 'Play Sample Game' }).boundingBox())!
      expect(generateBox.y).toBeCloseTo(sampleBox.y)
      expect(generateBox.height).toBeCloseTo(sampleBox.height)

      const advanced = form.getByRole('button', { name: 'Advanced options (optional)' })
      await advanced.click()
      await expect(form.getByLabel('Additional study context')).toBeVisible()
      expect((await form.boundingBox())!.height).toBeGreaterThan(configBox.height)
      expect((await preview.boundingBox())!.height).toBeLessThanOrEqual(previewBox.height)
      await advanced.click()
      const headlineLines = await page.getByRole('heading', { level: 1 }).evaluate((heading) =>
        heading.getBoundingClientRect().height / parseFloat(getComputedStyle(heading).lineHeight),
      )
      expect(headlineLines).toBeLessThanOrEqual(2.01)
    } else {
      expect(configBox.y + configBox.height).toBeLessThan(previewBox.y)
      expect(configBox.x).toBeCloseTo(previewBox.x)
    }
  }
})
