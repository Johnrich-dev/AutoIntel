import { Shield, Users } from 'lucide-react';

interface RoleSelectionProps {
  onSelectApplicant: () => void;
  onSelectAdmin: () => void;
}

export function RoleSelection({ onSelectApplicant, onSelectAdmin }: RoleSelectionProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-full mb-4">
              <Shield className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">AutoIntel</h1>
            <p className="text-gray-600">Automated Hiring System</p>
            <p className="text-sm text-gray-500 mt-2">Select your role to continue</p>
          </div>

          <div className="space-y-4">
            <button
              onClick={onSelectApplicant}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-4 px-4 rounded-lg transition-colors flex items-center justify-center gap-3"
            >
              <Users className="w-5 h-5" />
              Applicant Login
            </button>

            <button
              onClick={onSelectAdmin}
              className="w-full bg-gray-600 hover:bg-gray-700 text-white font-semibold py-4 px-4 rounded-lg transition-colors flex items-center justify-center gap-3"
            >
              <Shield className="w-5 h-5" />
              Admin Dashboard
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}