import { test, expect } from '@playwright/test'

test.use({ storageState: 'e2e/.auth/user.json' })

test.describe('예산 관리', () => {
  test('비용 계정에 예산을 설정하고 저장할 수 있다', async ({ page }) => {
    await page.goto('/budget')

    // 예산 관리 페이지 로드 대기
    await expect(page.getByRole('heading', { name: '예산 관리' })).toBeVisible()

    // 식비 행이 표시될 때까지 대기
    await expect(page.getByText('식비', { exact: true })).toBeVisible({ timeout: 10000 })

    // 식비 행 컨테이너를 찾아 예산 버튼 클릭 (편집 모드 진입)
    // 예산 행은 div.p-4 내에 계정명 span이 있는 구조
    const 식비Row = page
      .locator('.p-4')
      .filter({ has: page.getByText('식비', { exact: true }) })
      .first()

    await 식비Row.getByRole('button', { name: /예산:/ }).click()

    // 예산 금액 입력란이 표시되는지 확인
    const amountInput = 식비Row.getByPlaceholder('예산 금액')
    await expect(amountInput).toBeVisible()

    // 예산 금액 입력 후 저장
    await amountInput.fill('500000')
    await 식비Row.getByRole('button', { name: '저장' }).click()

    // 저장된 예산이 버튼에 반영되는지 확인 (₩500,000)
    await expect(
      식비Row.getByRole('button', { name: /예산: ₩/ })
    ).toBeVisible({ timeout: 10000 })
  })

  test('예산 편집 중 취소하면 원래 상태로 돌아온다', async ({ page }) => {
    await page.goto('/budget')

    await expect(page.getByRole('heading', { name: '예산 관리' })).toBeVisible()
    await expect(page.getByText('교통비', { exact: true })).toBeVisible({ timeout: 10000 })

    const 교통비Row = page
      .locator('.p-4')
      .filter({ has: page.getByText('교통비', { exact: true }) })
      .first()

    // 편집 모드 진입
    await 교통비Row.getByRole('button', { name: /예산:/ }).click()
    await expect(교통비Row.getByPlaceholder('예산 금액')).toBeVisible()

    // 금액 입력 후 취소
    await 교통비Row.getByPlaceholder('예산 금액').fill('200000')
    await 교통비Row.getByRole('button', { name: '취소' }).click()

    // 입력란이 사라지고 예산 버튼이 다시 표시되는지 확인
    await expect(교통비Row.getByRole('button', { name: /예산:/ })).toBeVisible()
    await expect(교통비Row.getByPlaceholder('예산 금액')).not.toBeVisible()
  })
})
