'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { Button } from '@/components/ui';

type AuthFormProps = { mode: 'login' | 'signup' };

const inputClass =
  'h-control w-full rounded-control border border-line-inverse bg-surface-inverse-deep px-3 text-ink-inverse outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-focus/40';

const labelClass = 'mb-1 block text-xs font-bold uppercase tracking-[0.2em] text-ink-inverse-muted';

export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const [identifier, setIdentifier] = useState('');
  const [username, setUsername] = useState('');
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
    const body = mode === 'login'
      ? { identifier, password, next: new URL(window.location.href).searchParams.get('next') }
      : { email, password, displayName, username };
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const result = await response.json() as { error?: string; redirect?: string };
    setBusy(false);
    if (!response.ok) {
      setError(result.error ?? 'Something went wrong.');
      return;
    }
    if (mode === 'signup') {
      setMessage('Account created. An admin must approve it before you can play.');
      setPassword('');
      return;
    }
    router.push(result.redirect ?? '/');
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {mode === 'signup' && (
        <>
          <label className="block">
            <span className={labelClass}>Display name</span>
            <input required value={displayName} onChange={(event) => setDisplayName(event.target.value)} className={inputClass} autoComplete="name" />
          </label>
          <label className="block">
            <span className={labelClass}>Username</span>
            <input
              required
              minLength={3}
              maxLength={20}
              pattern="[a-zA-Z0-9_]+"
              title="3-20 letters, numbers, or underscores"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className={inputClass}
              autoComplete="username"
            />
          </label>
          <label className="block">
            <span className={labelClass}>Email</span>
            <input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} className={inputClass} autoComplete="email" />
          </label>
        </>
      )}
      {mode === 'login' && (
        <label className="block">
          <span className={labelClass}>Username or email</span>
          <input required value={identifier} onChange={(event) => setIdentifier(event.target.value)} className={inputClass} autoComplete="username" />
        </label>
      )}
      <label className="block">
        <span className={labelClass}>Password</span>
        <input required minLength={10} type="password" value={password} onChange={(event) => setPassword(event.target.value)} className={inputClass} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
      </label>
      {error && (
        <p role="alert" className="rounded-control border border-danger-line bg-danger-soft/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="rounded-control border border-warn bg-warn-soft/10 px-3 py-2 text-sm text-warn">
          {message}
        </p>
      )}
      <Button type="submit" size="lg" disabled={busy} className="w-full">
        {busy ? 'PLEASE WAIT...' : mode === 'login' ? 'ENTER THE LEAGUE' : 'REQUEST A SPOT'}
      </Button>
      <p className="text-center text-sm text-ink-inverse-muted">
        {mode === 'login' ? 'Need an account? ' : 'Already registered? '}
        <Link className="font-bold text-accent hover:text-ink-inverse" href={mode === 'login' ? '/signup' : '/login'}>{mode === 'login' ? 'Sign up' : 'Log in'}</Link>
      </p>
    </form>
  );
}
