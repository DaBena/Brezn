import { expect, test } from '@playwright/test'

test.describe('smoke', () => {
  test('document title contains Brezn', async ({ page }) => {
    await page.goto('./')
    await expect(page).toHaveTitle(/Brezn/i)
  })

  test('leaves bootstrap loading and shows main shell', async ({ page }) => {
    await page.goto('./')
    // Locale follows navigator (e.g. de → "Laden…"); avoid coupling to English copy.
    await expect(page.getByTestId('bootstrap-loading')).toBeHidden({ timeout: 60_000 })
    await expect(page.getByRole('main')).toBeVisible({ timeout: 30_000 })
  })
})
