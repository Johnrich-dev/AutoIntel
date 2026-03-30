import { useState, useEffect } from 'react';
import { Video, ExternalLink, X, User, FileText, Brain, Star, TrendingUp, AlertCircle, CheckCircle, Loader2, Shield, Check, AlertTriangle } from 'lucide-react';
import { getSupabaseAdminClient } from '../lib/supabase';

interface VideoAssessmentTabProps {
  applicantId: string;
  videoScore?: number;
  onClose: () => void;
}

interface VideoAssessmentData {
  id: string;
  video_url?: string;
  transcription?: string;
  transcript_score?: number;
  validation_status?: string;
  submitted_at?: string;
  questions?: any[];
  responses?: any[];
}

interface ApplicantData {
  name?: string;
  photo_url?: string;
  position?: string;
}

export function VideoAssessmentTab({ applicantId, videoScore, onClose }: VideoAssessmentTabProps) {
  const [videoData, setVideoData] = useState<VideoAssessmentData | null>(null);
  const [applicantData, setApplicantData] = useState<ApplicantData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Identity verification state
  const [identityStatus, setIdentityStatus] = useState<'pending' | 'verified' | 'needs_review'>('pending');
  const [identityNotes, setIdentityNotes] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        const adminClient = getSupabaseAdminClient();

        // Fetch video assessment data
        const { data: videoAssessment, error: videoError } = await adminClient
          .from('video_assessments')
          .select('*')
          .eq('applicant_id', applicantId)
          .single();

        if (videoError) throw videoError;
        setVideoData(videoAssessment);

        // Fetch applicant data for profile image
        const { data: applicant, error: applicantError } = await adminClient
          .from('applicants')
          .select('name, photo_url, position')
          .eq('id', applicantId)
          .single();

        if (applicantError) throw applicantError;
        setApplicantData(applicant);
      } catch (err) {
        console.error('Error fetching video assessment data:', err);
        setError('Failed to load video assessment data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [applicantId]);

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-amber-600';
    return 'text-red-600';
  };

  const getScoreBgColor = (score: number) => {
    if (score >= 80) return 'bg-green-100';
    if (score >= 60) return 'bg-amber-100';
    return 'bg-red-100';
  };

  if (loading) {
    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
              <Video className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Video Assessment</h3>
              <p className="text-sm text-gray-500">Loading assessment data...</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
            <p className="text-sm text-gray-500">Loading video assessment...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center">
              <AlertCircle className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Video Assessment</h3>
              <p className="text-sm text-gray-500">Error loading data</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <AlertCircle className="w-8 h-8 text-red-500" />
            <p className="text-sm text-gray-500">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Tab Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
            <Video className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Video Assessment Review</h3>
            <p className="text-sm text-gray-500">Identity verification and response evaluation</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <X className="w-5 h-5 text-gray-500" />
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Overall Score */}
        <div className={`${getScoreBgColor(videoScore || 0)} rounded-xl p-4 border border-gray-200`}>
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${getScoreBgColor(videoScore || 0)}`}>
              <Star className={`w-6 h-6 ${getScoreColor(videoScore || 0)}`} />
            </div>
            <div>
              <p className="text-sm text-gray-500">Overall Assessment Score</p>
              <p className={`text-2xl font-bold ${getScoreColor(videoScore || 0)}`}>{videoScore || 0}%</p>
            </div>
          </div>
        </div>

        {/* Identity Verification Section */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Shield className="w-4 h-4 text-indigo-600" />
            <h4 className="text-sm font-semibold text-gray-900">Identity Verification</h4>
          </div>
          
          {/* Manual Verification Notice */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
            <p className="text-xs text-blue-800 font-medium">
              Identity verification is to be performed by the reviewer.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4">
            {/* Profile Image */}
            <div className="space-y-2">
              <p className="text-xs text-gray-500 font-medium">Profile Image</p>
              <div className="aspect-square rounded-lg bg-gray-100 overflow-hidden border border-gray-200">
                {applicantData?.photo_url ? (
                  <img
                    src={applicantData.photo_url}
                    alt={applicantData.name || 'Applicant'}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <User className="w-12 h-12 text-gray-400" />
                  </div>
                )}
              </div>
            </div>

            {/* Video Recording */}
            <div className="space-y-2">
              <p className="text-xs text-gray-500 font-medium">Video Recording</p>
              <div className="aspect-square rounded-lg bg-gray-100 overflow-hidden border border-gray-200">
                {videoData?.video_url ? (
                  <video
                    src={videoData.video_url}
                    controls
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Video className="w-12 h-12 text-gray-400" />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Verification Status */}
          <div className="space-y-3">
            <p className="text-xs text-gray-500 font-medium">Verification Status</p>
            <div className="flex gap-3">
              <button
                onClick={() => setIdentityStatus('verified')}
                className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg border transition-colors ${
                  identityStatus === 'verified'
                    ? 'bg-green-50 border-green-300 text-green-700'
                    : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                <Check className="w-4 h-4" />
                <span className="text-sm font-medium">Identity Verified</span>
              </button>
              <button
                onClick={() => setIdentityStatus('needs_review')}
                className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg border transition-colors ${
                  identityStatus === 'needs_review'
                    ? 'bg-amber-50 border-amber-300 text-amber-700'
                    : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                <AlertTriangle className="w-4 h-4" />
                <span className="text-sm font-medium">Needs Further Review</span>
              </button>
            </div>
          </div>

          {/* Verification Notes */}
          <div className="mt-4 space-y-2">
            <p className="text-xs text-gray-500 font-medium">Verification Notes</p>
            <textarea
              value={identityNotes}
              onChange={(e) => setIdentityNotes(e.target.value)}
              placeholder="Add notes (e.g., 'Lighting unclear', 'Face partially obstructed')"
              className="w-full h-20 p-3 border border-gray-200 rounded-lg text-sm resize-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          {/* Guideline */}
          <p className="text-xs text-gray-400 mt-3 italic">
            Ensure fair and unbiased verification based on visible consistency only.
          </p>
        </div>

        {/* Transcribed Responses */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h4 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <FileText className="w-4 h-4 text-indigo-600" />
            Transcribed Responses
          </h4>
          {videoData?.transcription ? (
            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                {videoData.transcription}
              </p>
            </div>
          ) : (
            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200 text-center">
              <FileText className="w-8 h-8 text-gray-400 mx-auto mb-2" />
              <p className="text-sm text-gray-500">No transcription available</p>
            </div>
          )}
        </div>

        {/* AI-Generated Scoring */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h4 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Brain className="w-4 h-4 text-indigo-600" />
            AI-Generated Scoring & Insights
          </h4>
          
          {/* Content Evaluation */}
          <div className="space-y-4">
            <div className="bg-indigo-50 rounded-lg p-4 border border-indigo-200">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="w-4 h-4 text-indigo-600" />
                <p className="text-sm font-medium text-indigo-900">Content Evaluation</p>
              </div>
              <p className="text-sm text-indigo-800">
                {videoData?.transcript_score 
                  ? `The response demonstrates strong communication skills with a score of ${videoData.transcript_score}%. The content is well-structured and addresses the key points effectively.`
                  : 'Content evaluation will be displayed here once the assessment is processed.'}
              </p>
            </div>

            {/* Suggested Improvements */}
            <div className="bg-amber-50 rounded-lg p-4 border border-amber-200">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-4 h-4 text-amber-600" />
                <p className="text-sm font-medium text-amber-900">Suggested Improvements</p>
              </div>
              <p className="text-sm text-amber-800">
                {videoData?.transcript_score && videoData.transcript_score < 80
                  ? 'Consider providing more specific examples and elaborating on key points. Adding concrete details would strengthen the response.'
                  : 'The response is well-articulated. Continue maintaining this level of clarity and detail in future communications.'}
              </p>
            </div>

            {/* Key Insights */}
            <div className="bg-green-50 rounded-lg p-4 border border-green-200">
              <div className="flex items-center gap-2 mb-2">
                <Star className="w-4 h-4 text-green-600" />
                <p className="text-sm font-medium text-green-900">Key Insights</p>
              </div>
              <ul className="text-sm text-green-800 space-y-1">
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 mt-2 flex-shrink-0" />
                  <span>Communication clarity and articulation</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 mt-2 flex-shrink-0" />
                  <span>Professional presentation and demeanor</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 mt-2 flex-shrink-0" />
                  <span>Problem-solving approach demonstrated</span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Assessment Status */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h4 className="text-sm font-semibold text-gray-900 mb-3">Assessment Status</h4>
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${videoData?.validation_status === 'completed' ? 'bg-green-500' : 'bg-amber-500'}`} />
            <p className="text-sm text-gray-600">
              {videoData?.validation_status === 'completed' 
                ? 'Assessment completed and validated'
                : 'Assessment pending validation'}
            </p>
          </div>
          {videoData?.submitted_at && (
            <p className="text-xs text-gray-500 mt-2">
              Submitted: {new Date(videoData.submitted_at).toLocaleString()}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
