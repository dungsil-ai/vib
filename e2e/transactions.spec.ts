import { test, expect } from '@playwright/test'

test.use({ storageState: 'e2e/.auth/user.json' })

test.describe('거래 생성', () => {
  test('거래를 성공적으로 생성하고 목록에 표시된다', async ({ page }) => {
    await page.goto('/transactions')

    // 계정 목록이 로드될 때까지 대기
    await expect(page.getByText('차변 (Debit)', { exact: true })).toBeVisible({ timeout: 10000 })

    // 날짜 입력 (로컬 타임존 기준 YYYY-MM-DD)
    const d = new Date()
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    await page.locator('input[type="date"]').fill(today)

    // 고유 거래 설명 입력
    const description = `e2e 월급 수령 ${Date.now()}`
    await page.getByPlaceholder('거래 내용을 입력하세요').fill(description)

    // 차변 계정 선택: 현금 (1001)
    await page
      .getByText('차변 (Debit)', { exact: true })
      .locator('..')
      .getByRole('button', { name: '1001 현금' })
      .click()

    // 대변 계정 선택: 급여 (4001)
    await page
      .getByText('대변 (Credit)', { exact: true })
      .locator('..')
      .getByRole('button', { name: '4001 급여' })
      .click()

    // 금액 입력
    await page.getByPlaceholder('0').fill('300000')

    // 거래 저장
    await page.getByRole('button', { name: '거래 저장' }).click()

    // 거래 목록에 표시 확인
    await expect(page.getByText(description)).toBeVisible({ timeout: 10000 })
  })

  test('차변·대변 계정 미선택 시 오류 메시지가 표시된다', async ({ page }) => {
    await page.goto('/transactions')

    // 계정 로드 대기
    await expect(page.getByText('차변 (Debit)', { exact: true })).toBeVisible({ timeout: 10000 })

    // 계정 미선택 상태에서 설명·금액만 입력
    await page.getByPlaceholder('거래 내용을 입력하세요').fill(`e2e 유효성 테스트 ${Date.now()}`)
    await page.getByPlaceholder('0').fill('10000')

    // 저장 시도
    await page.getByRole('button', { name: '거래 저장' }).click()

    // 오류 메시지 확인
    await expect(
      page.getByText('모든 항목의 차변 계정, 대변 계정, 금액을 입력해주세요.')
    ).toBeVisible()
  })

  test('차변·대변 계정이 동일할 때 오류 메시지가 표시된다', async ({ page }) => {
    await page.goto('/transactions')

    await expect(page.getByText('차변 (Debit)', { exact: true })).toBeVisible({ timeout: 10000 })

    await page.getByPlaceholder('거래 내용을 입력하세요').fill(`e2e 동일 계정 테스트 ${Date.now()}`)
    await page.getByPlaceholder('0').fill('5000')

    // 차변과 대변에 동일한 계정(현금) 선택
    await page
      .getByText('차변 (Debit)', { exact: true })
      .locator('..')
      .getByRole('button', { name: '1001 현금' })
      .click()
    await page
      .getByText('대변 (Credit)', { exact: true })
      .locator('..')
      .getByRole('button', { name: '1001 현금' })
      .click()

    await page.getByRole('button', { name: '거래 저장' }).click()

    await expect(
      page.getByText('차변 계정과 대변 계정은 달라야 합니다.')
    ).toBeVisible()
  })
})
