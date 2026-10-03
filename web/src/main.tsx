import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider, RequireAuth, RequireCandidate } from './auth';
import { AppLayout } from './components/AppLayout';
import { AssessmentPage } from './pages/AssessmentPage';
import { AuthPage } from './pages/AuthPage';
import { CandidateHome } from './pages/CandidateHome';
import { CandidateReportPage } from './pages/CandidateReport';
import { CandidateReportPageV1 } from './pages/CandidateReportV1';
import { ComparePage } from './pages/ComparePage';
import { Dashboard } from './pages/Dashboard';
import { Landing } from './pages/Landing';
import { NewAssessment } from './pages/NewAssessment';
import { NotFound } from './pages/NotFound';
import { PlanPage } from './pages/PlanPage';
import { FromJobDescription } from './pages/FromJobDescription';
import { RoleLibrary } from './pages/RoleLibrary';
import { RolePreview } from './pages/RolePreview';
import { TakeAssessment } from './pages/TakeAssessment';
import { Team } from './pages/Team';
import '@fontsource-variable/inter';
import '@fontsource-variable/newsreader/opsz.css';
import './styles.css';
import { applyUi, useUi } from './ui';

applyUi();

/** The review page in whichever interface the recruiter chose in the sidebar. */
function CandidateReportRoute() {
  return useUi() === 'v1' ? <CandidateReportPageV1 /> : <CandidateReportPage />;
}

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
            path="/candidate"
            element={
              <RequireCandidate>
                <CandidateHome />
              </RequireCandidate>
            }
          />
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
            <Route path="assessments/:id/compare" element={<ComparePage />} />
            <Route path="candidates/:id" element={<CandidateReportRoute />} />
            <Route path="library" element={<RoleLibrary />} />
            <Route path="library/:id" element={<RolePreview />} />
            <Route path="team" element={<Team />} />
            <Route path="plan" element={<PlanPage />} />
            <Route path="new/from-jd/:id" element={<FromJobDescription />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
