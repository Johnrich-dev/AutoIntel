import { useEffect, useState } from 'react';
import { Video, ClipboardList, CheckCircle, Clock, LogOut, Camera } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getSupabaseClient, getSupabaseAdminClient, VideoAssessment, PersonalityTest } from '../lib/supabase';

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

  console.log('Applicant photo_url:', applicant?.photo_url);

  useEffect(() => {
    loadAssessmentStatus();
  }, [applicant, accessToken]);

  const loadAssessmentStatus = async () => {
    if (!applicant) return;

    try {
      // Use admin client to bypass RLS
      const client = getSupabaseAdminClient();
      
      const [videoResult, testResult] = await Promise.all([
        client
          .from('video_assessments')
          .select('*')
          .eq('applicant_id', applicant.id)
          .maybeSingle(),
        // Check new work_style_assessments table first, fallback to old personality_tests
        client
          .from('work_style_assessments')
          .select('*')
          .eq('applicant_id', applicant.id)
          .maybeSingle()
          .then(({ data }) => {
            if (data) return { data };
            // Fallback to old personality_tests table
            return client
              .from('personality_tests')
              .select('*')
              .eq('applicant_id', applicant.id)
              .maybeSingle();
          }),
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
      const client = getSupabaseClient(accessToken ?? undefined);

      // First convert file to base64 for immediate local update
      const base64Promise = new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      // Try to upload to Supabase Storage
      const fileExt = file.name.split('.').pop();
      const fileName = `${applicant.id}-${Date.now()}.${fileExt}`;

      const { data: uploadData, error: uploadError } = await client.storage
        .from('applicant-photos')
        .upload(fileName, file);

      let photoUrl: string;

      if (uploadError) {
        console.log('Storage upload failed, using base64 approach:', uploadError);
        photoUrl = await base64Promise;
      } else {
        // Get public URL
        const { data: { publicUrl } } = client.storage
          .from('applicant-photos')
          .getPublicUrl(fileName);
        photoUrl = publicUrl;
      }

      // Update database with photo URL (use admin client to bypass RLS)
      const { error: updateError } = await getSupabaseAdminClient()
        .from('applicants')
        .update({ photo_url: photoUrl })
        .eq('id', applicant.id);

      if (updateError) {
        console.error('Failed to update photo_url in database:', updateError);
        alert('Failed to save photo. Please make sure the photo_url column exists in your database.');
        setUploadingPhoto(false);
        return;
      }

      console.log('Photo URL saved successfully:', photoUrl);
      // Update local state
      updateApplicant({ photo_url: photoUrl });
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

    if (hoursLeft < 24) {
      return `${hoursLeft} hours remaining`;
    }
    return `${Math.floor(hoursLeft / 24)} days remaining`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-white text-lg">Loading...</div>
      </div>
    );
  }

  const videoCompleted = videoStatus?.status === 'submitted';
  const testCompleted = testStatus?.status === 'submitted';
  const allCompleted = videoCompleted && testCompleted;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4 py-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 p-6 text-white">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="relative">
                  {applicant?.photo_url ? (
                    <img
                      src={applicant.photo_url}
                      alt={applicant?.name}
                      className="w-16 h-16 rounded-full object-cover border-2 border-white"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-white/20 border-2 border-dashed border-white/50 flex items-center justify-center">
                      <Camera className="w-8 h-8 text-white/70" />
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
                    <span className={`w-6 h-6 bg-white rounded-full flex items-center justify-center text-blue-600 shadow-md ${uploadingPhoto ? 'opacity-50' : 'hover:bg-gray-100'}`}>
                      {uploadingPhoto ? (
                        <span className="animate-spin text-xs">⏳</span>
                      ) : (
                        <Camera className="w-3 h-3" />
                      )}
                    </span>
                  </label>
                </div>
                <div>
                  <h1 className="text-2xl font-bold mb-1">Welcome, {applicant?.name}</h1>
                  <p className="text-blue-100">Position: {applicant?.position}</p>
                </div>
              </div>
              <button
                onClick={logout}
                className="flex items-center gap-2 bg-white/20 hover:bg-white/30 px-4 py-2 rounded-lg transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Logout
              </button>
            </div>
            <div className="mt-4 flex items-center gap-2 text-sm">
              <Clock className="w-4 h-4" />
              <span>Access expires: {getExpiryText()}</span>
            </div>
          </div>

          <div className="p-8">
            {allCompleted ? (
              <div className="bg-green-50 border border-green-200 rounded-lg p-6 mb-6">
                <div className="flex items-center gap-3 mb-2">
                  <CheckCircle className="w-6 h-6 text-green-600" />
                  <h2 className="text-lg font-semibold text-green-900">All Assessments Complete!</h2>
                </div>
                <p className="text-green-700">
                  Thank you for completing all assessments. Our team will review your submission and
                  contact you within 5-7 business days.
                </p>
              </div>
            ) : (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                <p className="text-blue-900 font-medium">
                  Please complete all required assessments before the access token expires.
                </p>
              </div>
            )}

            <h2 className="text-xl font-bold text-gray-900 mb-6">Assessment Progress</h2>

            <div className="space-y-4">
              <div className="border border-gray-200 rounded-lg p-6 hover:border-blue-300 transition-colors">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4 flex-1">
                    <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                      videoCompleted ? 'bg-green-100' : 'bg-blue-100'
                    }`}>
                      <Video className={`w-6 h-6 ${
                        videoCompleted ? 'text-green-600' : 'text-blue-600'
                      }`} />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-gray-900 mb-1">
                        Video Assessment
                      </h3>
                      <p className="text-gray-600 text-sm mb-3">
                        Record a brief video introducing yourself and answering assessment questions.
                      </p>
                      {videoCompleted ? (
                        <div className="flex items-center gap-2 text-green-600 text-sm font-medium">
                          <CheckCircle className="w-4 h-4" />
                          <span>Completed on {new Date(videoStatus?.submitted_at!).toLocaleDateString()}</span>
                        </div>
                      ) : (
                        <button
                          onClick={onStartVideo}
                          className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors text-sm"
                        >
                          Start Video Assessment
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="border border-gray-200 rounded-lg p-6 hover:border-blue-300 transition-colors">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4 flex-1">
                    <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                      testCompleted ? 'bg-green-100' : 'bg-blue-100'
                    }`}>
                      <ClipboardList className={`w-6 h-6 ${
                        testCompleted ? 'text-green-600' : 'text-blue-600'
                      }`} />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-gray-900 mb-1">
                        Work Style and Job Preference Assessment
                      </h3>
                      <p className="text-gray-600 text-sm mb-3">
                        Complete a 15-question work style assessment to help us understand your preferences.
                      </p>
                      {testCompleted ? (
                        <div className="flex items-center gap-2 text-green-600 text-sm font-medium">
                          <CheckCircle className="w-4 h-4" />
                          <span>Completed on {new Date(testStatus?.submitted_at!).toLocaleDateString()}</span>
                        </div>
                      ) : (
                        <button
                          onClick={onStartPersonalityTest}
                          className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors text-sm"
                        >
                          Start Work Style Assessment
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
