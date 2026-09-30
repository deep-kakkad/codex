import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider, RequireAuth } from './auth';
import { AppLayout } from './components/AppLayout';
import { AssessmentPage } from './pages/AssessmentPage';
import { AuthPage } from './pages/AuthPage';
import { CandidateReportPage } from './pages/CandidateReport';
import { Dashboard } from './pages/Dashboard';
import { Landing } from './pages/Landing';
import { NewAssessment } from './pages/NewAssessment';
import { NotFound } from './pages/NotFound';
import { RoleLibrary } from './pages/RoleLibrary';
import { RolePreview } from './pages/RolePreview';
import { TakeAssessment } from './pages/TakeAssessment';
import { Team } from './pages/Team';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<AuthPage mode="login" />} />
          <Route path="/signup" element={<AuthPage mode="signup" />} />
          <Route path="/c/:token" element={<TakeAssessment />} />
          <Route
            path="/app"
            element={
              <RequireAuth>
                <AppLayout />
              </RequireAuth>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="new" element={<NewAssessment />} />
            <Route path="assessments/:id" element={<AssessmentPage />} />
            <Route path="candidates/:id" element={<CandidateReportPage />} />
            <Route path="library" element={<RoleLibrary />} />
            <Route path="library/:id" element={<RolePreview />} />
            <Route path="team" element={<Team />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
