import { Lock, Mail, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

interface ApplicantLoginProps {
  onLoginSuccess: () => void;
}

export function ApplicantLogin({ onLoginSuccess }: ApplicantLoginProps) {
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [tokenFromUrl, setTokenFromUrl] = useState(false);
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [showAdminPassword, setShowAdminPassword] = useState(false);
  const { login, adminPreviewLogin } = useAuth();

  // Auto-populate token from URL query param (?token=...)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get('token');
    if (urlToken) {
      setToken(urlToken);
      setTokenFromUrl(true);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // Maintenance preview: email prefixed with "admin:" triggers admin credential check
    if (email.startsWith('admin:')) {
      const adminEmail = email.slice(6).trim();
      const result = await adminPreviewLogin(adminEmail, adminPassword);
      if (result.success) {
        window.history.replaceState({}, '', window.location.pathname);
        onLoginSuccess();
      } else {
        setError(result.error || 'Invalid admin credentials.');
      }
      setLoading(false);
      return;
    }

    const success = await login(token, email);

    if (success) {
      window.history.replaceState({}, '', window.location.pathname);
      onLoginSuccess();
    } else {
      if (!token) {
        setError('Please enter your access token from the email we sent you.');
      } else if (!email) {
        setError('Please enter your email address.');
      } else {
        setError('Invalid email or access token. Please double-check the token from your email.');
      }
    }
    setLoading(false);
  };

  // Show maintenance password field when email starts with "admin:"
  const isMaintenance = email.startsWith('admin:');
  if (isMaintenance !== maintenanceMode) setMaintenanceMode(isMaintenance);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-full mb-4">
              <Lock className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">AutoIntel</h1>
            <p className="text-gray-600">Applicant Assessment Portal</p>
          </div>

          {tokenFromUrl && (
            <div className="mb-4 bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded-lg text-sm">
              Access token loaded from your email link. Enter your email to continue.
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                <Mail className="w-4 h-4 inline mr-1" />
                Email Address
              </label>
              <input
                type={maintenanceMode ? 'text' : 'email'}
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email address"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                required
              />
            </div>

            {maintenanceMode ? (
              <div>
                <label htmlFor="adminPassword" className="block text-sm font-medium text-gray-700 mb-2">
                  <Lock className="w-4 h-4 inline mr-1" />
                  Admin Password
                </label>
              <div className="relative">
                <input
                  type={showAdminPassword ? 'text' : 'password'}
                  id="adminPassword"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  placeholder="Enter admin password"
                  className="w-full px-4 py-3 pr-12 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowAdminPassword(!showAdminPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  tabIndex={-1}
                >
                  {showAdminPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
                <p className="mt-2 text-xs text-gray-500">Maintenance preview mode — use your admin credentials</p>
              </div>
            ) : (
              <div>
                <label htmlFor="token" className="block text-sm font-medium text-gray-700 mb-2">
                  <Lock className="w-4 h-4 inline mr-1" />
                  Access Token
                </label>
                <input
                  type="text"
                  id="token"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="Enter your access token from email"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                  required
                />
                {!tokenFromUrl && (
                  <p className="mt-2 text-sm text-gray-500">
                    Check your email for the access token we sent you
                  </p>
                )}
              </div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm flex items-start gap-2">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Verifying...' : 'Access Assessment'}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-gray-200">
            <p className="text-xs text-gray-500 text-center">
              Access tokens are valid for a limited time from the time of issue.
              <br />
              If your link has expired, contact the recruitment team.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
