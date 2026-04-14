import { test, expect } from '@playwright/test'

test.use({ storageState: 'e2e/.auth/user.json' })

test.describe('계정 생성', () => {
  test('새 비용 계정을 생성하면 목록에 표시된다', async ({ page }) => {
    await page.goto('/accounts')

    // 계정 관리 페이지 로드 대기
    await expect(page.getByRole('heading', { name: '계정 관리' })).toBeVisible()

    // ACCOUNT_TYPE_LABELS 순서: 자산(0), 부채(1), 자본(2), 수익(3), 비용(4)
    // 비용 섹션의 "+ 계정 추가" 버튼 클릭 (5번째)
    await page.getByRole('button', { name: '+ 계정 추가' }).nth(4).click()

    // 계정명 입력란이 나타날 때까지 대기
    const nameInput = page.getByPlaceholder('예: 현금')
    await expect(nameInput).toBeVisible()

    // 고유한 계정명 입력 후 저장
    const accountName = `e2e 테스트 비용 ${Date.now()}`
    await nameInput.fill(accountName)
    await page.getByRole('button', { name: '저장' }).click()

    // 새로 생성된 계정이 목록에 표시되는지 확인
    await expect(page.getByText(accountName)).toBeVisible({ timeout: 10000 })
  })
})

test.describe('계정 삭제 제한', () => {
  test('거래 내역이 있는 계정은 삭제할 수 없다', async ({ page }) => {
    // 1단계: 현금(1001) 계정을 사용하는 거래 생성
    await page.goto('/transactions')
    await expect(page.getByText('차변 (Debit)', { exact: true })).toBeVisible({ timeout: 10000 })

    const d = new Date()
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    await page.getByLabel('날짜').fill(today)
    await page.getByPlaceholder('거래 내용을 입력하세요').fill(`e2e 삭제 제한 테스트 ${Date.now()}`)

    // 차변: 현금 (1001)
    await page
      .getByText('차변 (Debit)', { exact: true })
      .locator('..')
      .getByRole('button', { name: '1001 현금' })
      .click()

    // 대변: 급여 (4001)
    await page
      .getByText('대변 (Credit)', { exact: true })
      .locator('..')
      .getByRole('button', { name: '4001 급여' })
      .click()

    await page.getByPlaceholder('0').fill('50000')
    await page.getByRole('button', { name: '거래 저장' }).click()

    // 거래가 목록에 나타날 때까지 대기
    await expect(page.getByText(/e2e 삭제 제한 테스트/)).toBeVisible({ timeout: 10000 })

    // 2단계: 계정 관리 페이지로 이동해 현금 계정 삭제 시도
    await page.goto('/accounts')
    await expect(page.getByRole('heading', { name: '계정 관리' })).toBeVisible()

    // 현금 행을 찾아 삭제 버튼 클릭
    const cashRow = page.locator('tr:has(td:first-child:text-is("현금"))').first()
    await expect(cashRow).toBeVisible({ timeout: 10000 })

    // 확인 대화상자를 1회만 수락하도록 등록
    page.once('dialog', dialog => dialog.accept())
    await cashRow.getByRole('button', { name: '삭제' }).click()

    // 삭제 불가 오류 메시지 확인
    await expect(
      page.getByText('거래 내역이 있는 계정은 삭제할 수 없습니다.')
    ).toBeVisible({ timeout: 10000 })
  })
})
