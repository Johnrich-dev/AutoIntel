import { Lock } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

interface ApplicantLoginProps {
  onLoginSuccess: () => void;
}

export function ApplicantLogin({ onLoginSuccess }: ApplicantLoginProps) {
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const success = await login(token);

    if (success) {
      onLoginSuccess();
    } else {
      setError('Invalid or expired access token. Please check your email for the correct token.');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-full mb-4">
              <Lock className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">AutoIntel</h1>
            <p className="text-gray-600">Automated Hiring System</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="token" className="block text-sm font-medium text-gray-700 mb-2">
                Access Token
              </label>
              <input
                type="text"
                id="token"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Enter your access token"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                required
              />
              <p className="mt-2 text-sm text-gray-500">
                Check your email for the temporary access token
              </p>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
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
              Access tokens are valid for 1-2 days from the time of issue.
              <br />
              <span className="font-medium">Test Tokens:</span>
              <br />
              <code className="bg-gray-100 px-2 py-1 rounded text-blue-600">token_john_123</code> (rules accepted)
              <br />
              <code className="bg-gray-100 px-2 py-1 rounded">token_jane_456</code> (needs to accept rules)
              <br />
              <code className="bg-gray-100 px-2 py-1 rounded">token_bob_789</code> (needs to accept rules)
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
