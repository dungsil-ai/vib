import { chromium, FullConfig } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'

const TEST_USER = {
  name: 'E2E 테스트 사용자',
  email: 'e2e-test@vib.example.com',
  password: 'e2eTestPassword123',
}

async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0].use?.baseURL ?? 'http://localhost:3000'

  const authDir = path.join(__dirname, '.auth')
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true })
  }

  // 테스트 사용자 등록 (이미 존재하면 무시, 그 외 오류는 예외 처리)
  const res = await fetch(`${baseURL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(TEST_USER),
  })

  if (!res.ok) {
    const status = res.status
    // 400/409는 이미 존재하는 사용자로 간주해 계속 진행
    if (status !== 400 && status !== 409) {
      const body = await res.text().catch(() => '(응답 없음)')
      throw new Error(`테스트 사용자 등록 실패 (HTTP ${status}): ${body}`)
    }
  }

  // 브라우저로 로그인 후 인증 상태 저장
  const browser = await chromium.launch()
  const page = await browser.newPage()

  await page.goto(`${baseURL}/auth/login`)
  await page.getByLabel('이메일').fill(TEST_USER.email)
  await page.getByLabel('비밀번호').fill(TEST_USER.password)
  await page.getByRole('button', { name: '로그인' }).click()
  await page.waitForURL(/\/dashboard/, { timeout: 15000 })

  await page.context().storageState({ path: path.join(authDir, 'user.json') })
  await browser.close()
}

export default globalSetup
