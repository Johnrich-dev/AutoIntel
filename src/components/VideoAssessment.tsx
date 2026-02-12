import { useState } from 'react';
import { Video, Upload, ArrowLeft, CheckCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

interface VideoAssessmentProps {
  onComplete: () => void;
  onBack: () => void;
}

export function VideoAssessment({ onComplete, onBack }: VideoAssessmentProps) {
  const { applicant } = useAuth();
  const [isRecording, setIsRecording] = useState(false);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setVideoFile(file);
    }
  };

  const handleSubmit = async () => {
    if (!applicant || !videoFile) return;

    setUploading(true);

    try {
      const { data: assessment } = await supabase
        .from('video_assessments')
        .select('*')
        .eq('applicant_id', applicant.id)
        .maybeSingle();

      if (assessment) {
        await supabase
          .from('video_assessments')
          .update({
            video_url: `https://example.com/videos/${applicant.email}_${Date.now()}.mp4`,
            status: 'submitted',
            submitted_at: new Date().toISOString(),
          })
          .eq('id', assessment.id);
      } else {
        await supabase.from('video_assessments').insert({
          applicant_id: applicant.id,
          video_url: `https://example.com/videos/${applicant.email}_${Date.now()}.mp4`,
          status: 'submitted',
          submitted_at: new Date().toISOString(),
        });
      }

      alert('Video assessment submitted successfully!');
      onComplete();
    } catch (error) {
      console.error('Error submitting video:', error);
      alert('Failed to submit video. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const toggleRecording = () => {
    if (!isRecording) {
      alert('Recording started! (This is a mock recording interface)');
    } else {
      alert('Recording stopped! (This is a mock recording interface)');
    }
    setIsRecording(!isRecording);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4 py-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 p-6 text-white">
            <button
              onClick={onBack}
              className="flex items-center gap-2 text-white/90 hover:text-white mb-4 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Dashboard
            </button>
            <h1 className="text-2xl font-bold">Video Assessment</h1>
            <p className="text-blue-100 mt-1">Record or upload your video introduction</p>
          </div>

          <div className="p-8">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <h3 className="font-semibold text-blue-900 mb-2">Instructions</h3>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• Introduce yourself and explain why you're interested in this position</li>
                <li>• Describe your relevant experience and skills</li>
                <li>• Keep your video between 2-5 minutes</li>
                <li>• Ensure good lighting and clear audio</li>
              </ul>
            </div>

            <div className="border-2 border-dashed border-gray-300 rounded-lg p-12 mb-6">
              <div className="text-center">
                <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Video className={`w-10 h-10 ${isRecording ? 'text-red-600' : 'text-gray-400'}`} />
                </div>
                {isRecording ? (
                  <div>
                    <div className="flex items-center justify-center gap-2 mb-4">
                      <div className="w-3 h-3 bg-red-600 rounded-full animate-pulse" />
                      <span className="text-red-600 font-semibold">Recording...</span>
                    </div>
                    <p className="text-gray-600 mb-4">Speak clearly and look at the camera</p>
                  </div>
                ) : (
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">Camera Preview</h3>
                    <p className="text-gray-600 mb-4">
                      This is a mock interface. In production, your camera feed would appear here.
                    </p>
                  </div>
                )}

                <button
                  onClick={toggleRecording}
                  className={`${
                    isRecording
                      ? 'bg-red-600 hover:bg-red-700'
                      : 'bg-blue-600 hover:bg-blue-700'
                  } text-white font-semibold py-3 px-6 rounded-lg transition-colors mb-4`}
                >
                  {isRecording ? 'Stop Recording' : 'Start Recording'}
                </button>
              </div>
            </div>

            <div className="relative mb-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-4 bg-white text-gray-500">OR</span>
              </div>
            </div>

            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8">
              <div className="text-center">
                <Upload className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Upload Video File</h3>
                <p className="text-gray-600 mb-4">
                  Choose a pre-recorded video file (MP4, MOV, or AVI)
                </p>
                <input
                  type="file"
                  accept="video/*"
                  onChange={handleFileSelect}
                  className="hidden"
                  id="video-upload"
                />
                <label
                  htmlFor="video-upload"
                  className="inline-block bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2 px-4 rounded-lg cursor-pointer transition-colors"
                >
                  Choose File
                </label>
                {videoFile && (
                  <div className="mt-4 flex items-center justify-center gap-2 text-green-600">
                    <CheckCircle className="w-5 h-5" />
                    <span className="font-medium">{videoFile.name}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-8 flex justify-end gap-4">
              <button
                onClick={onBack}
                className="px-6 py-3 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={!videoFile || uploading}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {uploading ? 'Submitting...' : 'Submit Video Assessment'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
