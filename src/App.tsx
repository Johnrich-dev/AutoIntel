import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ApplicantLogin } from './components/ApplicantLogin';
import { RulesAndTerms } from './components/RulesAndTerms';
import { AssessmentDashboard } from './components/AssessmentDashboard';
import { VideoAssessment } from './components/VideoAssessment';
import { PersonalityTest } from './components/PersonalityTest';
import { AdminDashboard } from './components/AdminDashboard';
import { AdminLogin } from './components/AdminLogin';
import { getSupabaseConfigError } from './lib/supabase';

type ApplicantView = 'rules' | 'dashboard' | 'video' | 'test';

// Determine the current route from the URL path
function getRoute(): 'applicant-login' | 'admin-login' | 'applicant-app' | 'not-found' {
  const path = window.location.pathname;
  if (path === '/applicant/login') return 'applicant-login';
  if (path === '/admin/login' || path === '/admin') return 'admin-login';
  // Legacy /login path → redirect to applicant login
  if (path === '/login' || path === '/') return 'applicant-login';
  return 'not-found';
}

// ─── Applicant flow ───────────────────────────────────────────────────────────
function ApplicantApp() {
  const { applicant, loading, logout } = useAuth();
  const [view, setView] = useState<ApplicantView>('dashboard');

  // Apply saved theme on mount
  useEffect(() => {
    const savedSettings = localStorage.getItem('admin_settings');
    if (savedSettings) {
      try {
        const settings = JSON.parse(savedSettings);
        document.documentElement.classList.toggle('dark', settings.theme === 'dark');
      } catch (_) { /* ignore */ }
    }
  }, []);

  useEffect(() => {
    if (loading || !applicant) return;
    // Key acceptance to the specific access token so re-created applicants
    // with the same email always see the rules screen on their new token.
    const tokenKey = `rules_accepted_${applicant.access_token}`;
    const localRulesAccepted = localStorage.getItem(tokenKey) === 'true';
    const rulesAccepted = localRulesAccepted || applicant.rules_accepted === true;
    // Only set view when first determining it — don't override if already past rules
    setView(prev => {
      if (prev === 'rules' || prev === 'dashboard') {
        return rulesAccepted ? 'dashboard' : 'rules';
      }
      return prev; // keep video/test view intact
    });
  }, [applicant, loading]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-white text-lg">Loading...</div>
      </div>
    );
  }

  // Not authenticated → show applicant login
  if (!applicant) {
    return <ApplicantLogin onLoginSuccess={() => { /* useEffect handles view */ }} />;
  }

  if (view === 'rules') {
    return <RulesAndTerms onAccept={() => setView('dashboard')} />;
  }

  if (view === 'video') {
    return (
      <VideoAssessment
        onComplete={() => setView('dashboard')}
        onBack={() => setView('dashboard')}
      />
    );
  }

  if (view === 'test') {
    return (
      <PersonalityTest
        onComplete={() => setView('dashboard')}
        onBack={() => setView('dashboard')}
      />
    );
  }

  return (
    <AssessmentDashboard
      onStartVideo={() => setView('video')}
      onStartPersonalityTest={() => setView('test')}
    />
  );
}

// ─── Admin flow ───────────────────────────────────────────────────────────────
function AdminApp() {
  const { isAdminAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-white text-lg">Loading...</div>
      </div>
    );
  }

  if (!isAdminAuthenticated) {
    return (
      <AdminLogin
        onLoginSuccess={() => {
          // Push to /admin so the route resolves to AdminDashboard on next render
          window.history.pushState({}, '', '/admin');
          window.dispatchEvent(new PopStateEvent('popstate'));
        }}
        onCancel={() => {
          window.history.pushState({}, '', '/applicant/login');
          window.dispatchEvent(new PopStateEvent('popstate'));
        }}
      />
    );
  }

  return <AdminDashboard />;
}

// ─── Router ───────────────────────────────────────────────────────────────────
function AppRouter() {
  const [route, setRoute] = useState(getRoute);
  const { userType, loading } = useAuth();

  useEffect(() => {
    const handlePop = () => setRoute(getRoute());
    window.addEventListener('popstate', handlePop);
    return () => window.removeEventListener('popstate', handlePop);
  }, []);

  // Route guard: authenticated applicant trying to access admin → redirect
  useEffect(() => {
    if (loading) return;
    if (userType === 'applicant' && (route === 'admin-login')) {
      window.history.replaceState({}, '', '/applicant/login');
      setRoute('applicant-login');
    }
  }, [userType, route, loading]);

  if (route === 'admin-login' || route === 'not-found') {
    // Block applicants from reaching admin routes
    if (!loading && userType === 'applicant') {
      return <ApplicantApp />;
    }
    return <AdminApp />;
  }

  // applicant-login and default → applicant flow
  return <ApplicantApp />;
}

// ─── Root ─────────────────────────────────────────────────────────────────────
function App() {
  const configError = getSupabaseConfigError();
  if (configError) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-6">
        <div className="max-w-xl w-full bg-white rounded-2xl shadow-2xl p-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Frontend configuration required</h1>
          <p className="text-gray-700 mb-4">
            The app can't connect to Supabase yet, so nothing loads.
          </p>
          <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg text-sm mb-4">
            {configError}
          </div>
          <p className="text-sm text-gray-700 mb-2">Add these to your project `.env` then restart `npm run dev`:</p>
          <pre className="text-xs bg-gray-100 rounded-lg p-3 overflow-auto">
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
          </pre>
        </div>
      </div>
    );
  }

  return (
    <AuthProvider>
      <AppRouter />
    </AuthProvider>
  );
}

export default App;
