import { expect, test, type Page } from '@playwright/test'

const BREZN_APP_IDB_PREFIX = 'brezn'

async function listBreznAppIndexedDbNames(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const listFn = indexedDB.databases?.bind(indexedDB)
    if (!listFn) return []
    const dbs = await listFn()
    return dbs
      .map((d) => d.name)
      .filter((n): n is string => typeof n === 'string' && n.startsWith(BREZN_APP_IDB_PREFIX))
      .sort()
  })
}

async function listAllIndexedDbNames(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const listFn = indexedDB.databases?.bind(indexedDB)
    if (!listFn) return []
    const dbs = await listFn()
    return dbs
      .map((d) => d.name)
      .filter((n): n is string => typeof n === 'string' && n.length > 0)
      .sort()
  })
}

test.describe('storage consent / IndexedDB', () => {
  test('no brezn:v1 localStorage before user interaction (identity stays in-memory only)', async ({
    page,
  }) => {
    await page.goto('./')
    await expect(page.getByTestId('bootstrap-loading')).toBeHidden({ timeout: 60_000 })
    await expect(page.getByRole('main')).toBeVisible({ timeout: 30_000 })

    const breznV1 = await page.evaluate(() => localStorage.getItem('brezn:v1'))
    expect(breznV1).toBeNull()

    const consentFlag = await page.evaluate(() =>
      localStorage.getItem('brezn:storage-write-consent:v1'),
    )
    expect(consentFlag).toBeNull()
  })

  test('no Brezn IndexedDB databases before user interaction', async ({ page }) => {
    await page.goto('./')
    await expect(page.getByTestId('bootstrap-loading')).toBeHidden({ timeout: 60_000 })
    await expect(page.getByRole('main')).toBeVisible({ timeout: 30_000 })

    await expect
      .poll(
        async () =>
          page.evaluate(async () => {
            if (!('serviceWorker' in navigator)) return 0
            const regs = await navigator.serviceWorker.getRegistrations()
            return regs.length
          }),
        { timeout: 15_000, intervals: [100, 250, 500, 1000] },
      )
      .toBe(0)

    await expect
      .poll(async () => listBreznAppIndexedDbNames(page), {
        timeout: 15_000,
        intervals: [100, 250, 500, 1000],
      })
      .toEqual([])

    await expect
      .poll(async () => listAllIndexedDbNames(page), {
        timeout: 15_000,
        intervals: [100, 250, 500, 1000],
      })
      .toEqual([])

    await page.waitForTimeout(4100)
    await expect(page.getByTestId('adblock-warning')).toHaveCount(0)
  })
})
