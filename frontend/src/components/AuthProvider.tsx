'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type CurrentProfile = {
  id: string;
  email: string;
  username: string;
  display_name: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  role: 'USER' | 'ADMIN';
};

/** plan_ui_foundation D6: lets TopNav tell "we don't know yet" (loading, reserve space
 *  for placeholders) apart from "checked, nobody's signed in" (signed-out, render
 *  nothing) instead of collapsing both into the same `null` profile. */
export type AuthStatus = 'loading' | 'signed-out' | 'signed-in';

const AuthContext = createContext<CurrentProfile | null>(null);
const AuthStatusContext = createContext<AuthStatus>('loading');

export function useCurrentProfile() { return useContext(AuthContext); }
export function useAuthStatus() { return useContext(AuthStatusContext); }

export function AuthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<CurrentProfile | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');

  useEffect(() => {
    fetch('/api/auth/me')
      .then((response) => response.ok ? response.json() : null)
      .then((value: CurrentProfile | null) => {
        setProfile(value);
        setStatus(value ? 'signed-in' : 'signed-out');
      })
      .catch(() => {
        setProfile(null);
        setStatus('signed-out');
      });
  }, []);

  return (
    <AuthContext.Provider value={profile}>
      <AuthStatusContext.Provider value={status}>{children}</AuthStatusContext.Provider>
    </AuthContext.Provider>
  );
}
