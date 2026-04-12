import { useEffect, useState } from 'react';
import { Video, ClipboardList, CheckCircle, Clock, LogOut, Camera, User, ChevronDown, ArrowRight } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getSupabaseClient, getSupabaseAdminClient, VideoAssessment, PersonalityTest } from '../lib/supabase';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';

interface AssessmentDashboardProps {
  onStartVideo: () => void;
  onStartPersonalityTest: () => void;
}

export function AssessmentDashboard({ onStartVideo, onStartPersonalityTest }: AssessmentDashboardProps) {
  const { applicant, logout, accessToken, updateApplicant } = useAuth();
  const [videoStatus, setVideoStatus] = useState<VideoAssessment | null>(null);
  const [testStatus, setTestStatus] = useState<PersonalityTest | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  useEffect(() => {
    loadAssessmentStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applicant, accessToken]);

  // Derived state — computed here so the Teams notification useEffect can reference them
  const videoCompleted = videoStatus?.status === 'submitted';
  const testCompleted = testStatus?.status === 'submitted' || testStatus?.status === 'completed';
  const allCompleted = videoCompleted && testCompleted;

  // Fire Teams notification once when all assessments are completed
  useEffect(() => {
    if (!allCompleted || !applicant) return;
    const notified = sessionStorage.getItem(`notified_complete_${applicant.id}`);
    if (notified) return;
    sessionStorage.setItem(`notified_complete_${applicant.id}`, 'true');

    const completed: string[] = [];
    if (videoCompleted) completed.push('Video Assessment');
    if (testCompleted) completed.push('Personality Test');

    fetch(`${API_BASE}/api/notify-assessment-complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        applicant_name: applicant.name,
        applicant_email: applicant.email,
        position: applicant.position,
        completed,
      }),
    }).catch(() => { /* non-critical */ });
  }, [allCompleted]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadAssessmentStatus = async () => {    if (!applicant) return;

    try {
      // Use admin client to bypass RLS
      const client = getSupabaseAdminClient();
      
      const [videoResult, testResult] = await Promise.all([
        client
          .from('video_assessments')
          .select('*')
          .eq('applicant_id', applicant.id)
          .maybeSingle(),
        // Only query work_style_assessments
        client
          .from('work_style_assessments')
          .select('*')
          .eq('applicant_id', applicant.id)
          .maybeSingle(),
      ]);

      if (videoResult.data) setVideoStatus(videoResult.data);
      if (testResult.data) setTestStatus(testResult.data);
    } catch (error) {
      console.error('Error loading assessment status:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePhotoUpload = async (file: File) => {
    if (!applicant) return;

    try {
      setUploadingPhoto(true);

      // Use admin client to bypass RLS for storage upload
      const adminClient = getSupabaseAdminClient();
      const fileExt = file.name.split('.').pop();
      const fileName = `${applicant.id}-${Date.now()}.${fileExt}`;

      const { error: uploadError } = await adminClient.storage
        .from('applicant-photos')
        .upload(fileName, file, { upsert: true });

      if (uploadError) {
        console.error('Storage upload failed:', uploadError);
        alert(`Failed to upload photo: ${uploadError.message}. Please try again.`);
        setUploadingPhoto(false);
        return;
      }

      const { data: { publicUrl } } = adminClient.storage
        .from('applicant-photos')
        .getPublicUrl(fileName);

      // Update database using token-authenticated client
      const { error: updateError } = await getSupabaseClient(accessToken ?? undefined)
        .from('applicants')
        .update({ photo_url: publicUrl })
        .eq('id', applicant.id);

      if (updateError) {
        console.error('Failed to update photo_url in database:', updateError);
        alert('Photo uploaded but failed to save. Please try again.');
        setUploadingPhoto(false);
        return;
      }

      updateApplicant({ photo_url: publicUrl });
      setUploadingPhoto(false);
    } catch (error) {
      console.error('Error uploading photo:', error);
      setUploadingPhoto(false);
      alert('Failed to upload photo. Please try again.');
    }
  };

  const getExpiryText = () => {
    if (!applicant) return '';
    const expiresAt = new Date(applicant.access_expires_at);
    const now = new Date();
    const hoursLeft = Math.floor((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60));
    if (hoursLeft < 1) return 'Expiring soon';
    if (hoursLeft < 24) return `${hoursLeft} hours remaining`;
    return `${Math.floor(hoursLeft / 24)} days remaining`;
  };

  const getExpiryHours = () => {
    if (!applicant) return 0;
    const expiresAt = new Date(applicant.access_expires_at);
    const now = new Date();
    return Math.floor((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <div className="text-gray-500 text-sm font-medium">Loading...</div>
        </div>
      </div>
    );
  }

  const completedCount = (videoCompleted ? 1 : 0) + (testCompleted ? 1 : 0);
  const totalAssessments = 2;
  const progressPercent = Math.round((completedCount / totalAssessments) * 100);
  const expiryHours = getExpiryHours();
  const isExpiringSoon = expiryHours < 6;
  const showExpiryBadge = expiryHours < 24;
  const hasProfilePhoto = !!applicant?.photo_url;

  const handleStartVideo = () => {
    if (!hasProfilePhoto) {
      alert('Please upload a profile photo before starting the Video Assessment.');
      return;
    }
    onStartVideo();
  };

  const handleStartPersonalityTest = () => {
    if (!hasProfilePhoto) {
      alert('Please upload a profile photo before starting the Work Style Assessment.');
      return;
    }
    onStartPersonalityTest();
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top Navigation Bar */}
      <nav className="sticky top-0 z-50 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            {/* Logo Placeholder */}
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#B4D3D9' }}>
                <span className="text-gray-700 font-bold text-sm">AI</span>
              </div>
              <span className="text-lg font-bold text-gray-800">AutoIntel</span>
            </div>

            {/* User Profile Dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-gray-50 transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center overflow-hidden">
                  {applicant?.photo_url ? (
                    <img src={applicant.photo_url} alt={applicant?.name} className="w-full h-full object-cover" />
                  ) : (
                    <User className="w-4 h-4 text-gray-500" />
                  )}
                </div>
                <div className="text-left hidden sm:block">
                  <p className="text-sm font-medium text-gray-800">{applicant?.name}</p>
                  <p className="text-xs text-gray-500">{applicant?.email}</p>
                </div>
                <ChevronDown className="w-4 h-4 text-gray-400" />
              </button>

              {showUserMenu && (
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-50">
                  <button
                    onClick={() => { logout(); window.location.href = '/applicant'; }}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Welcome Header */}
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-md mb-6">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="relative flex-shrink-0">
                {applicant?.photo_url ? (
                  <img
                    src={applicant.photo_url}
                    alt={applicant?.name}
                    className="w-16 h-16 rounded-full object-cover border-2 border-gray-100"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-gray-100 border-2 border-dashed border-gray-200 flex items-center justify-center">
                    <Camera className="w-6 h-6 text-gray-400" />
                  </div>
                )}
                <label className="absolute bottom-0 right-0 cursor-pointer">
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handlePhotoUpload(file);
                    }}
                    disabled={uploadingPhoto}
                  />
                  <span className={`w-6 h-6 bg-white rounded-full flex items-center justify-center text-gray-600 shadow-md border border-gray-200 ${uploadingPhoto ? 'opacity-50' : 'hover:bg-gray-50'}`}>
                    {uploadingPhoto ? (
                      <span className="animate-spin text-xs">⏳</span>
                    ) : (
                      <Camera className="w-3 h-3" />
                    )}
                  </span>
                </label>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-800 mb-1">Welcome, {applicant?.name}</h1>
                <p className="text-gray-500">Position: {applicant?.position}</p>
              </div>
            </div>
            
            {/* Expiry Badge — only show when under 24 hours */}
            {showExpiryBadge && (
            <div className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium ${
              isExpiringSoon 
                ? 'bg-red-50 text-red-700 border border-red-200' 
                : 'bg-amber-50 text-amber-700 border border-amber-200'
            }`}>
              <Clock className="w-4 h-4" />
              <span>Access expires: {getExpiryText()}</span>
            </div>
            )}
          </div>
        </div>

        {/* Photo Upload Banner — shown prominently if no photo */}
        {!hasProfilePhoto && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-6 flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
              <Camera className="w-5 h-5 text-amber-600" />
            </div>
            <div className="flex-1">
              <p className="text-amber-800 font-semibold text-sm">Upload your profile photo to unlock assessments</p>
              <p className="text-amber-600 text-xs mt-0.5">Click the camera icon on your avatar above to upload a photo.</p>
            </div>
          </div>
        )}

        {/* Completion Message */}
        {allCompleted && (
          <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-md mb-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#98D8AA' }}>
                <CheckCircle className="w-6 h-6 text-gray-700" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-800 mb-1">All Assessments Complete!</h2>
                <p className="text-gray-500 text-sm">
                  Thank you for completing all assessments. Our team will review your submission and contact you within 5-7 business days.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Progress Overview */}
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-md mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold text-gray-800">Progress Overview</h2>
            <span className="text-sm font-semibold text-gray-600">{progressPercent}% Complete</span>
          </div>
          
          {/* Integrated instruction text */}
          <p className="text-sm text-gray-500 mb-3">
            {!hasProfilePhoto ? (
              <span className="text-amber-600 font-medium">
                ⚠️ Please upload your profile photo first to unlock assessments.
              </span>
            ) : (
              <span>
                Please complete all required assessments before the access token expires.
              </span>
            )}
          </p>
          
          {/* Progress Bar */}
          <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
            <div 
              className="h-full rounded-full transition-all duration-500 ease-out"
              style={{ 
                width: `${progressPercent}%`,
                backgroundColor: progressPercent === 100 ? '#98D8AA' : '#B4D3D9'
              }}
            />
          </div>
        </div>

        {/* Assessment Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Video Assessment Card */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-md hover:shadow-lg transition-all duration-300 p-6">
            <div className="flex items-start justify-between mb-4">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                videoCompleted ? 'bg-green-100' : 'bg-blue-50'
              }`}>
                <Video className={`w-6 h-6 ${
                  videoCompleted ? 'text-green-600' : 'text-blue-600'
                }`} />
              </div>
              {videoCompleted && (
                <div className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                  <CheckCircle className="w-3 h-3" />
                  Completed
                </div>
              )}
            </div>
            
            <h3 className="text-lg font-bold text-gray-800 mb-2">Video Assessment</h3>
            <p className="text-gray-500 text-sm mb-4">
              Record a brief video introducing yourself and answering assessment questions.
            </p>
            
            <div className="flex items-center justify-between mt-auto">
              <span className="text-xs text-gray-400 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                ⏱️ 5-10 mins
              </span>
              
              {videoCompleted ? (
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2 text-green-600 text-sm font-medium">
                    <CheckCircle className="w-4 h-4" />
                    <span>Submitted</span>
                  </div>
                  <span className={`text-xs ${
                    videoStatus?.transcription_status === 'completed' ? 'text-green-500' :
                    videoStatus?.transcription_status === 'failed' ? 'text-red-500' :
                    'text-amber-500'
                  }`}>
                    {videoStatus?.transcription_status === 'completed' ? '✓ Transcription complete' :
                     videoStatus?.transcription_status === 'failed' ? '✗ Transcription failed' :
                     '⏳ Transcription in progress...'}
                  </span>
                </div>
              ) : (
                <button
                  onClick={handleStartVideo}
                  disabled={!hasProfilePhoto}
                  className={`bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 px-5 rounded-lg transition-colors text-sm max-w-[160px] flex items-center justify-center gap-2 ${
                    !hasProfilePhoto ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  Start Assessment
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Work Style Assessment Card */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-md hover:shadow-lg transition-all duration-300 p-6">
            <div className="flex items-start justify-between mb-4">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                testCompleted ? 'bg-green-100' : 'bg-purple-50'
              }`}>
                <ClipboardList className={`w-6 h-6 ${
                  testCompleted ? 'text-green-600' : 'text-purple-600'
                }`} />
              </div>
              {testCompleted && (
                <div className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                  <CheckCircle className="w-3 h-3" />
                  Completed
                </div>
              )}
            </div>
            
            <h3 className="text-lg font-bold text-gray-800 mb-2">Work Style and Job Preference Assessment</h3>
            <p className="text-gray-500 text-sm mb-4">
              Complete a 20-question Likert-scale assessment and one short essay.
            </p>
            
            <div className="flex items-center justify-between mt-auto">
              <span className="text-xs text-gray-400 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                ⏱️ 15-20 mins
              </span>
              
              {testCompleted ? (
                <div className="flex items-center gap-2 text-green-600 text-sm font-medium">
                  <CheckCircle className="w-4 h-4" />
                  <span>Submitted</span>
                </div>
              ) : (
                <button
                  onClick={handleStartPersonalityTest}
                  disabled={!hasProfilePhoto}
                  className={`bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 px-5 rounded-lg transition-colors text-sm max-w-[160px] flex items-center justify-center gap-2 ${
                    !hasProfilePhoto ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  Start Assessment
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* What's Next */}
        {!allCompleted && (
          <div className="mt-8 bg-white rounded-2xl p-5 border border-gray-100 shadow-md">
            <h2 className="text-base font-bold text-gray-800 mb-3">What happens after you submit?</h2>
            <div className="flex flex-col sm:flex-row gap-4">
              {[
                { step: '1', label: 'Complete assessments', done: completedCount > 0 },
                { step: '2', label: 'HR team reviews your submission', done: false },
                { step: '3', label: 'You receive a decision within 5–7 business days', done: false },
              ].map((item) => (
                <div key={item.step} className="flex items-center gap-3 flex-1">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${item.done ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {item.done ? <CheckCircle className="w-4 h-4" /> : item.step}
                  </div>
                  <span className="text-sm text-gray-600">{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
