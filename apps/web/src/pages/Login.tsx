import { useState } from 'react';
import { SignInForm } from '../features/auth/SignInForm';
import { SignUpForm } from '../features/auth/SignUpForm';
import '../features/auth/auth.css';

type Mode = 'sign-in' | 'sign-up';

export default function Login() {
  const [mode, setMode] = useState<Mode>('sign-in');

  return (
    <main className="page">
      <h1 className="page__title">Sign in</h1>
      <div className="card">
        <div className="auth-toggle" role="tablist" aria-label="Sign in or sign up">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'sign-in'}
            className={mode === 'sign-in' ? 'button' : 'button button--secondary'}
            onClick={() => setMode('sign-in')}
          >
            Sign in
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'sign-up'}
            className={mode === 'sign-up' ? 'button' : 'button button--secondary'}
            onClick={() => setMode('sign-up')}
          >
            Sign up
          </button>
        </div>
        {mode === 'sign-in' ? <SignInForm /> : <SignUpForm />}
      </div>
    </main>
  );
}
