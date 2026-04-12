import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next-auth/react', () => ({
  SessionProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="session-provider">{children}</div>
  ),
}))

import { Providers } from '@/app/providers'

describe('Providers', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
      })),
    })
  })

  it('children을 렌더링한다', () => {
    render(
      <Providers>
        <div data-testid="child">Hello</div>
      </Providers>,
    )
    expect(screen.getByTestId('child')).toBeInTheDocument()
    expect(screen.getByText('Hello')).toBeInTheDocument()
  })

  it('SessionProvider로 감싸진다', () => {
    render(
      <Providers>
        <span>Test</span>
      </Providers>,
    )
    expect(screen.getByTestId('session-provider')).toBeInTheDocument()
  })
})
