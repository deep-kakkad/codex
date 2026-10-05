import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, RequireAuth, RequireCandidate } from './auth';
import { AppLayout } from './components/AppLayout';
import { AdminPage } from './pages/AdminPage';
import { AssessmentPage } from './pages/AssessmentPage';
import { AuthPage } from './pages/AuthPage';
import { CandidateHome } from './pages/CandidateHome';
import { CandidateReportPage } from './pages/CandidateReport';
import { DemoBanner, DemoStart } from './demo/DemoBanner';
import { TourOverlay } from './demo/TourOverlay';
import { ComparePage } from './pages/ComparePage';
import { Dashboard } from './pages/Dashboard';
import { Landing } from './pages/Landing';
import { NewAssessment } from './pages/NewAssessment';
import { NotFound } from './pages/NotFound';
import { PlanPage } from './pages/PlanPage';
import { SettingsPage } from './pages/SettingsPage';
import { FromJobDescription } from './pages/FromJobDescription';
import { RoleLibrary } from './pages/RoleLibrary';
import { RolePreview } from './pages/RolePreview';
import { TakeAssessment } from './pages/TakeAssessment';
import { Team } from './pages/Team';
import '@fontsource-variable/inter';
import '@fontsource-variable/newsreader/opsz.css';
import './styles.css';
import { reportBrowserErrors } from './errorReport';

reportBrowserErrors();

/** A candidate's assessment. The demo walkthrough moves between screens by query, so each one loads afresh. */
function TakeAssessmentRoute() {
  const { search } = useLocation();
  return <TakeAssessment key={search} />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <DemoBanner />
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/demo" element={<DemoStart side="recruiter" />} />
          <Route path="/demo/recruiter" element={<DemoStart side="recruiter" />} />
          <Route path="/demo/candidate" element={<DemoStart side="candidate" />} />
          <Route path="/login" element={<AuthPage mode="login" />} />
          <Route path="/signup" element={<AuthPage mode="signup" />} />
          <Route path="/c/:token" element={<TakeAssessmentRoute />} />
          <Route path="/admin" element={<AdminPage />} />
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
            <Route path="candidates/:id" element={<CandidateReportPage />} />
            <Route path="library" element={<RoleLibrary />} />
            <Route path="library/:id" element={<RolePreview />} />
            <Route path="team" element={<Team />} />
            <Route path="plan" element={<PlanPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="new/from-jd/:id" element={<FromJobDescription />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
        <TourOverlay />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
