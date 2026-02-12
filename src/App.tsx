import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ApplicantLogin } from './components/ApplicantLogin';
import { RulesAndTerms } from './components/RulesAndTerms';
import { AssessmentDashboard } from './components/AssessmentDashboard';
import { VideoAssessment } from './components/VideoAssessment';
import { PersonalityTest } from './components/PersonalityTest';
import { AdminDashboard } from './components/AdminDashboard';
import { RoleSelection } from './components/RoleSelection';

type View =
  | 'choice'
  | 'login'
  | 'rules'
  | 'dashboard'
  | 'video'
  | 'test'
  | 'admin';

function AppContent() {
  const { applicant, loading } = useAuth();
  const [view, setView] = useState<View>('login');

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const mode = urlParams.get('mode');

    if (mode === 'admin') {
      setView('admin');
      return;
    }

    if (applicant && !loading) {
      if (!applicant.rules_accepted) {
        setView('rules');
      } else {
        setView('dashboard');
      }
    } else if (!loading) {
      setView('choice');
    }
  }, [applicant, loading]);

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
        onSelectAdmin={() => setView('admin')}
      />
    );
  }

  if (view === 'admin') {
    return <AdminDashboard />;
  }

  if (!applicant) {
    return <ApplicantLogin onLoginSuccess={() => setView('rules')} />;
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

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
