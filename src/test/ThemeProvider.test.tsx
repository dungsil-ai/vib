import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider, useTheme } from '@/components/ThemeProvider'

function TestConsumer() {
  const { theme, toggleTheme } = useTheme()
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <button onClick={toggleTheme}>토글</button>
    </div>
  )
}

describe('ThemeProvider', () => {
  let matchMediaListeners: Array<(e: { matches: boolean }) => void>

  beforeEach(() => {
    matchMediaListeners = []
    localStorage.clear()
    document.documentElement.classList.remove('dark')

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        addEventListener: vi.fn((_event: string, handler: (e: { matches: boolean }) => void) => {
          matchMediaListeners.push(handler)
        }),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
      })),
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('기본 테마는 light이다', () => {
    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>,
    )
    expect(screen.getByTestId('theme').textContent).toBe('light')
  })

  it('localStorage에 dark가 저장되면 dark 테마로 시작한다', () => {
    localStorage.setItem('theme', 'dark')
    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>,
    )
    expect(screen.getByTestId('theme').textContent).toBe('dark')
  })

  it('localStorage에 light가 저장되면 light 테마로 시작한다', () => {
    localStorage.setItem('theme', 'light')
    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>,
    )
    expect(screen.getByTestId('theme').textContent).toBe('light')
  })

  it('prefers-color-scheme: dark이면 dark 테마로 시작한다', () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: true,
        media: query,
        addEventListener: vi.fn((_event: string, handler: (e: { matches: boolean }) => void) => {
          matchMediaListeners.push(handler)
        }),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
      })),
    })

    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>,
    )
    expect(screen.getByTestId('theme').textContent).toBe('dark')
  })

  it('toggleTheme로 테마를 전환할 수 있다', async () => {
    const user = userEvent.setup()
    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>,
    )

    expect(screen.getByTestId('theme').textContent).toBe('light')

    await user.click(screen.getByRole('button', { name: '토글' }))
    expect(screen.getByTestId('theme').textContent).toBe('dark')

    await user.click(screen.getByRole('button', { name: '토글' }))
    expect(screen.getByTestId('theme').textContent).toBe('light')
  })

  it('토글 후 localStorage에 테마가 저장된다', async () => {
    const user = userEvent.setup()
    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>,
    )

    await user.click(screen.getByRole('button', { name: '토글' }))
    expect(localStorage.getItem('theme')).toBe('dark')
  })

  it('dark 테마일 때 document에 dark 클래스가 추가된다', async () => {
    const user = userEvent.setup()
    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>,
    )

    await user.click(screen.getByRole('button', { name: '토글' }))
    expect(document.documentElement.classList.contains('dark')).toBe(true)

    await user.click(screen.getByRole('button', { name: '토글' }))
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('시스템 테마 변경 시 사용자 override가 없으면 반영된다', () => {
    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>,
    )

    expect(screen.getByTestId('theme').textContent).toBe('light')

    // 시스템 테마가 dark로 변경됨을 시뮬레이션
    act(() => {
      for (const listener of matchMediaListeners) {
        listener({ matches: true } as MediaQueryListEvent)
      }
    })

    expect(screen.getByTestId('theme').textContent).toBe('dark')
  })

  it('사용자가 토글 후 시스템 테마 변경을 무시한다', async () => {
    const user = userEvent.setup()
    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>,
    )

    await user.click(screen.getByRole('button', { name: '토글' }))
    expect(screen.getByTestId('theme').textContent).toBe('dark')

    act(() => {
      for (const listener of matchMediaListeners) {
        listener({ matches: false } as MediaQueryListEvent)
      }
    })

    // 사용자 override로 인해 시스템 변경이 무시됨
    expect(screen.getByTestId('theme').textContent).toBe('dark')
  })

  it('localStorage에 저장된 값이 있으면 시스템 테마 변경을 무시한다', () => {
    localStorage.setItem('theme', 'light')
    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>,
    )

    act(() => {
      for (const listener of matchMediaListeners) {
        listener({ matches: true } as MediaQueryListEvent)
      }
    })

    expect(screen.getByTestId('theme').textContent).toBe('light')
  })

  it('localStorage 접근 에러 시에도 기본값으로 동작한다', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('localStorage unavailable')
    })

    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>,
    )
    expect(screen.getByTestId('theme').textContent).toBe('light')
  })
})

describe('useTheme', () => {
  it('ThemeProvider 없이도 기본값을 반환한다', () => {
    function Bare() {
      const { theme } = useTheme()
      return <span data-testid="bare-theme">{theme}</span>
    }
    render(<Bare />)
    expect(screen.getByTestId('bare-theme').textContent).toBe('light')
  })
})
