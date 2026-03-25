import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ApplicantLogin } from './components/ApplicantLogin';
import { RulesAndTerms } from './components/RulesAndTerms';
import { AssessmentDashboard } from './components/AssessmentDashboard';
import { VideoAssessment } from './components/VideoAssessment';
import { PersonalityTest } from './components/PersonalityTest';
import { AdminDashboard } from './components/AdminDashboard';
import { RoleSelection } from './components/RoleSelection';
import { AdminLogin } from './components/AdminLogin';
import { getSupabaseConfigError } from './lib/supabase';

type View =
  | 'choice'
  | 'login'
  | 'rules'
  | 'dashboard'
  | 'video'
  | 'test'
  | 'admin-login'
  | 'admin';

function AppContent() {
  const { applicant, loading, isAdminAuthenticated, adminSession } = useAuth();
  const [view, setView] = useState<View>('login');

  // Apply saved theme on mount
  useEffect(() => {
    const savedSettings = localStorage.getItem('admin_settings');
    if (savedSettings) {
      try {
        const settings = JSON.parse(savedSettings);
        if (settings.theme === 'dark') {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
      } catch (e) {
        // Ignore parse errors
      }
    }
  }, []);

  useEffect(() => {
    // Debug: log current state
    console.log('[ViewEffect] loading:', loading, 'applicant:', !!applicant, 'view:', view);
    
    // Skip if still loading or no applicant yet
    if (loading || !applicant) return;
    
    const urlParams = new URLSearchParams(window.location.search);
    const mode = urlParams.get('mode');

    // If mode=admin in URL, go to admin-login view (will check auth)
    if (mode === 'admin') {
      setView('admin-login');
      return;
    }

    // If admin is authenticated, show admin dashboard
    if (isAdminAuthenticated) {
      setView('admin');
      return;
    }

    // Check localStorage first for rules acceptance (more reliable)
    const localRulesAccepted = localStorage.getItem('rules_accepted') === 'true';
    
    // Also check database value
    const dbRulesAccepted = applicant.rules_accepted === true;
    
    // Use localStorage as the primary check, fallback to database
    const rulesAccepted = localRulesAccepted || dbRulesAccepted;
    
    console.log('[ViewEffect] localStorage rules_accepted:', localRulesAccepted);
    console.log('[ViewEffect] database rules_accepted:', dbRulesAccepted);
    console.log('[ViewEffect] final rulesAccepted:', rulesAccepted);
    
    if (!rulesAccepted) {
      console.log('[ViewEffect] Setting view to rules');
      setView('rules');
    } else {
      console.log('[ViewEffect] Setting view to dashboard');
      setView('dashboard');
    }
  }, [applicant, loading, isAdminAuthenticated]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-white text-lg">Loading...</div>
      </div>
    );
  }

  if (view === 'choice') {
    return (
      <RoleSelection
        onSelectApplicant={() => setView('login')}
        onSelectAdmin={() => setView('admin-login')}
      />
    );
  }

  if (view === 'admin-login') {
    return (
      <AdminLogin
        onLoginSuccess={() => setView('admin')}
        onCancel={() => setView('choice')}
      />
    );
  }

  if (view === 'admin') {
    // Protect admin route - require authentication
    if (!isAdminAuthenticated) {
      return (
        <AdminLogin
          onLoginSuccess={() => setView('admin')}
          onCancel={() => setView('choice')}
        />
      );
    }
    return <AdminDashboard />;
  }

  // Early return for unauthenticated state
  if (!applicant) {
    return <ApplicantLogin onLoginSuccess={() => {
      // Don't do anything here - the useEffect will detect the new applicant
      // and set the correct view based on rules_accepted
    }} />;
  }

  // Handle specific views - only if applicant is authenticated
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

  // Default to assessment dashboard
  return (
    <AssessmentDashboard
      onStartVideo={() => setView('video')}
      onStartPersonalityTest={() => setView('test')}
    />
  );
}

function App() {
  const configError = getSupabaseConfigError();
  if (configError) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-6">
        <div className="max-w-xl w-full bg-white rounded-2xl shadow-2xl p-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Frontend configuration required</h1>
          <p className="text-gray-700 mb-4">
            The app can’t connect to Supabase yet, so nothing loads.
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
      <AppContent />
    </AuthProvider>
  );
}

export default App;
