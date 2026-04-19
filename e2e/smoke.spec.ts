import { expect, test } from '@playwright/test'

test.describe('smoke', () => {
  test('document title contains Brezn', async ({ page }) => {
    await page.goto('./')
    await expect(page).toHaveTitle(/Brezn/i)
  })

  test('leaves bootstrap loading and shows main shell', async ({ page }) => {
    await page.goto('./')
    await expect(page.getByText('Loading…')).toBeHidden({ timeout: 60_000 })
    await expect(page.locator('#root')).toBeVisible()
    await expect(page.getByRole('main')).toBeVisible()
  })
})
