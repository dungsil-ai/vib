import { test, expect } from '@playwright/test'

test.describe('인증 페이지', () => {
  test('로그인 페이지가 정상적으로 로드된다', async ({ page }) => {
    await page.goto('/auth/login')

    await expect(page).toHaveTitle(/가계부/)
    await expect(page.getByRole('heading', { name: '가계부 로그인' })).toBeVisible()
    await expect(page.getByLabel('이메일')).toBeVisible()
    await expect(page.getByLabel('비밀번호')).toBeVisible()
    await expect(page.getByRole('button', { name: '로그인' })).toBeVisible()
  })

  test('회원가입 링크가 존재한다', async ({ page }) => {
    await page.goto('/auth/login')

    const registerLink = page.getByRole('link', { name: '회원가입' })
    await expect(registerLink).toBeVisible()
    await expect(registerLink).toHaveAttribute('href', '/auth/register')
  })

  test('이메일/비밀번호 미입력 시 로그인 버튼이 비활성화 상태가 아니다', async ({ page }) => {
    await page.goto('/auth/login')

    const submitButton = page.getByRole('button', { name: '로그인' })
    await expect(submitButton).toBeEnabled()
  })

  test('잘못된 자격증명으로 로그인 시 에러 메시지가 표시된다', async ({ page }) => {
    await page.goto('/auth/login')

    await page.getByLabel('이메일').fill('wrong@example.com')
    await page.getByLabel('비밀번호').fill('wrongpassword')
    await page.getByRole('button', { name: '로그인' }).click()

    await expect(
      page.getByText('이메일 또는 비밀번호가 올바르지 않습니다.')
    ).toBeVisible()
  })

  test('인증되지 않은 사용자가 대시보드에 접근하면 로그인 페이지로 리다이렉트된다', async ({ page }) => {
    await page.goto('/dashboard')

    await expect(page).toHaveURL(/\/auth\/login/)
  })
})
