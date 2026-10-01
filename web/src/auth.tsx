import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import type { Me } from '../../shared/api';
import type { CandidateAccount } from '../../shared/candidateApi';
import { api } from './api';

interface AuthState {
  /** Signed-in recruiter, if any. */
  user: Me | null;
  /** Signed-in candidate, if any. Recruiter and candidate sessions are separate. */
  candidate: CandidateAccount | null;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  logoutCandidate: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [candidate, setCandidate] = useState<CandidateAccount | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const [recruiter, candidateMe] = await Promise.all([
      api.get<{ user: Me | null }>('/api/auth/me').catch(() => ({ user: null })),
      api.get<{ candidate: CandidateAccount | null }>('/api/candidate/auth/me').catch(() => ({ candidate: null })),
    ]);
    setUser(recruiter.user);
    setCandidate(candidateMe.candidate);
    setLoading(false);
  }, []);

  const logout = useCallback(async () => {
    await api.post('/api/auth/logout');
    setUser(null);
  }, []);

  const logoutCandidate = useCallback(async () => {
    await api.post('/api/candidate/auth/logout');
    setCandidate(null);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <AuthContext.Provider value={{ user, candidate, loading, refresh, logout, logoutCandidate }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="page-loading">Loading…</div>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

export function RequireCandidate({ children }: { children: ReactNode }) {
  const { candidate, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="page-loading">Loading…</div>;
  if (!candidate) return <Navigate to={`/login?as=candidate&next=${encodeURIComponent(location.pathname)}`} replace />;
  return <>{children}</>;
}
