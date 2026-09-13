'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';

type AuthFormProps = { mode: 'login' | 'signup' };

export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/signup';
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, displayName, next: new URL(window.location.href).searchParams.get('next') }),
    });
    const result = await response.json() as { error?: string; redirect?: string; autoApproved?: boolean };
    setBusy(false);
    if (!response.ok) {
      setError(result.error ?? 'Something went wrong.');
      return;
    }
    if (mode === 'signup') {
      setMessage(result.autoApproved ? 'Your account is ready. You can log in now.' : 'Account created. An admin must approve it before you can play.');
      setPassword('');
      return;
    }
    router.push(result.redirect ?? '/');
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {mode === 'signup' && (
        <label className="block">
          <span className="mb-1 block text-xs font-bold uppercase tracking-[0.2em] text-stone-400">Display name</span>
          <input required value={displayName} onChange={(event) => setDisplayName(event.target.value)} className="auth-input" autoComplete="name" />
        </label>
      )}
      <label className="block">
        <span className="mb-1 block text-xs font-bold uppercase tracking-[0.2em] text-stone-400">Email</span>
        <input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="auth-input" autoComplete="email" />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-bold uppercase tracking-[0.2em] text-stone-400">Password</span>
        <input required minLength={10} type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="auth-input" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
      </label>
      {error && <p role="alert" className="border border-red-400/40 bg-red-950/40 px-3 py-2 text-sm text-red-200">{error}</p>}
      {message && <p role="status" className="border border-yellow-400/40 bg-yellow-950/40 px-3 py-2 text-sm text-yellow-100">{message}</p>}
      <button disabled={busy} className="auth-button" type="submit">{busy ? 'PLEASE WAIT...' : mode === 'login' ? 'ENTER THE LEAGUE' : 'REQUEST A SPOT'}</button>
      <p className="text-center text-sm text-stone-400">
        {mode === 'login' ? 'Need an account? ' : 'Already registered? '}
        <Link className="font-bold text-yellow-300 hover:text-white" href={mode === 'login' ? '/signup' : '/login'}>{mode === 'login' ? 'Sign up' : 'Log in'}</Link>
      </p>
    </form>
  );
}