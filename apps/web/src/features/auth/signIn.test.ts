import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { SignInForm } from './SignInForm';
import { SIGN_IN_GENERIC_ERROR } from './useSignIn';

// Not React Testing Library — see docs/standards/testing.md; a minimal
// react-dom harness is the permitted pattern for jsdom-scoped tests here.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const RAW_SUPABASE_ERROR_MESSAGE = 'Invalid login credentials for user xyz@internal.example';

const signInWithPasswordMock = vi.fn();

vi.mock('../../lib/supabaseClient', () => ({
  supabase: {
    auth: {
      signInWithPassword: (...args: unknown[]) => signInWithPasswordMock(...args),
    },
  },
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

describe('SignInForm', () => {
  beforeEach(() => {
    signInWithPasswordMock.mockReset();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
    }
    container?.remove();
    container = null;
    root = null;
  });

  test('a failed sign-in renders the generic message and never the raw Supabase error text', async () => {
    signInWithPasswordMock.mockResolvedValue({
      data: { session: null, user: null },
      error: { message: RAW_SUPABASE_ERROR_MESSAGE },
    });

    await act(async () => {
      root?.render(createElement(MemoryRouter, null, createElement(SignInForm)));
    });

    const emailInput = container?.querySelector<HTMLInputElement>('#signin-email');
    const passwordInput = container?.querySelector<HTMLInputElement>('#signin-password');
    const form = container?.querySelector('form');

    await act(async () => {
      emailInput?.dispatchEvent(new Event('focus'));
    });

    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value'
    )?.set;

    await act(async () => {
      nativeInputValueSetter?.call(emailInput, 'person@example.test');
      emailInput?.dispatchEvent(new Event('input', { bubbles: true }));
      nativeInputValueSetter?.call(passwordInput, 'wrong-password');
      passwordInput?.dispatchEvent(new Event('input', { bubbles: true }));
    });

    await act(async () => {
      form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    const renderedText = container?.textContent ?? '';
    expect(renderedText).toContain(SIGN_IN_GENERIC_ERROR);
    expect(renderedText).not.toContain(RAW_SUPABASE_ERROR_MESSAGE);
    expect(renderedText).not.toContain('Invalid login credentials');
  });
});
