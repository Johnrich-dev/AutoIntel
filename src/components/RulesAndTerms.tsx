import { CheckCircle2, FileText } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

interface RulesAndTermsProps {
  onAccept: () => void;
}

export function RulesAndTerms({ onAccept }: RulesAndTermsProps) {
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const { applicant, updateApplicant } = useAuth();

  const handleAccept = async () => {
    if (!agreed || !applicant) return;

    setLoading(true);

    try {
      const { error } = await supabase
        .from('applicants')
        .update({
          rules_accepted: true,
          rules_accepted_at: new Date().toISOString(),
        })
        .eq('id', applicant.id);

      if (error) throw error;

      updateApplicant({
        rules_accepted: true,
        rules_accepted_at: new Date().toISOString(),
      });

      onAccept();
    } catch (error) {
      console.error('Error accepting terms:', error);
      alert('Failed to save your acceptance. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-3xl">
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-blue-600 rounded-full">
              <FileText className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Assessment Rules & Terms</h1>
              <p className="text-sm text-gray-600">Please review carefully before proceeding</p>
            </div>
          </div>

          <div className="bg-gray-50 rounded-lg p-6 mb-6 max-h-96 overflow-y-auto space-y-4">
            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Assessment Guidelines</h2>
              <ul className="space-y-2 text-gray-700">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <span>Complete all assessments honestly and to the best of your ability</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <span>Video assessments must be recorded in a quiet, well-lit environment</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <span>Ensure your face is clearly visible throughout the video recording</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <span>No external assistance is permitted during any assessment</span>
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Data Privacy & Usage</h2>
              <p className="text-gray-700 leading-relaxed mb-2">
                Your assessment data, including video recordings and test responses, will be processed
                by SentinelAI's automated hiring system. This data will be used solely for evaluation
                purposes and shared only with authorized hiring personnel.
              </p>
              <p className="text-gray-700 leading-relaxed">
                We employ industry-standard security measures to protect your information. Your data
                will be retained for 90 days after the hiring decision and then securely deleted.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Important Notes</h2>
              <ul className="space-y-2 text-gray-700">
                <li className="flex items-start gap-2">
                  <span className="text-blue-600 font-bold flex-shrink-0">•</span>
                  <span>Your access token expires in 1-2 days from issue date</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-600 font-bold flex-shrink-0">•</span>
                  <span>Incomplete assessments may affect your application status</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-600 font-bold flex-shrink-0">•</span>
                  <span>AI analysis results are reviewed by human hiring managers</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-600 font-bold flex-shrink-0">•</span>
                  <span>You will be notified of the hiring decision within 5-7 business days</span>
                </li>
              </ul>
            </section>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-1 w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">
                I have read and agree to the assessment rules and terms. I understand that my data
                will be processed by SentinelAI's automated hiring system and consent to this processing.
              </span>
            </label>
          </div>

          <button
            onClick={handleAccept}
            disabled={!agreed || loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Processing...' : 'I Agree - Continue to Assessment'}
          </button>
        </div>
      </div>
    </div>
  );
}
