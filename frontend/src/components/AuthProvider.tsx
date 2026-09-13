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

const AuthContext = createContext<CurrentProfile | null>(null);

export function useCurrentProfile() { return useContext(AuthContext); }

export function AuthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<CurrentProfile | null>(null);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((response) => response.ok ? response.json() : null)
      .then((value: CurrentProfile | null) => setProfile(value))
      .catch(() => setProfile(null));
  }, []);

  return <AuthContext.Provider value={profile}>{children}</AuthContext.Provider>;
}