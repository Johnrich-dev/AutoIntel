import { useState, useRef, useEffect, useCallback } from 'react';
import { Video, Upload, ArrowLeft, CheckCircle, XCircle, AlertCircle, Camera, Mic, MicOff, Video as VideoIcon, VideoOff, RefreshCw, Square, Download, Save, User, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getSupabaseAdminClient } from '../lib/supabase';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';

interface VideoAssessmentProps {
  onComplete: () => void;
  onBack: () => void;
}

export function VideoAssessment({ onComplete, onBack }: VideoAssessmentProps) {
  const { applicant } = useAuth();
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordingTime, setRecordingTime] = useState<number>(0);
  const [videoBlob, setVideoBlob] = useState<Blob | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState<boolean>(false);
  const [permissionDenied, setPermissionDenied] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'record' | 'upload'>('record');
  const [isVideoMuted, setIsVideoMuted] = useState<boolean>(false);
  const [isAudioMuted, setIsAudioMuted] = useState<boolean>(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'warning' } | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  const showToast = (message: string, type: 'success' | 'error' | 'warning' = 'success') => {
    setToast({ message, type });
  };
  
  // New state for preview mode
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [isPreviewMode, setIsPreviewMode] = useState<boolean>(false);

  // Refs with proper TypeScript typing
  const liveVideoRef = useRef<HTMLVideoElement>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Initialize camera - only called on user action, not in useEffect
  const initCamera = useCallback(async (): Promise<void> => {
    try {
      // Clean up any existing stream first
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track: MediaStreamTrack) => track.stop());
        streamRef.current = null;
      }

      setCameraError(null);
      setPermissionDenied(false);
      setCameraReady(false);

      const stream: MediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user'
        },
        audio: true
      });

      streamRef.current = stream;

      if (liveVideoRef.current) {
        liveVideoRef.current.srcObject = stream;
        liveVideoRef.current.onloadedmetadata = () => {
          setCameraReady(true);
        };
      }
    } catch (error) {
      console.error('Error accessing camera:', error);
      if (error instanceof DOMException) {
        if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
          setPermissionDenied(true);
          setCameraError('Camera permission denied. Please allow camera access and try again.');
        } else if (error.name === 'NotFoundError') {
          setCameraError('No camera found. Please connect a camera and try again.');
        } else {
          setCameraError(`Camera error: ${error.message}`);
        }
      } else {
        setCameraError('Failed to access camera. Please check your device settings.');
      }
    }
  }, []);

  // Cleanup function for recorded URL
  const clearRecordedPreview = useCallback((): void => {
    if (recordedUrl) {
      URL.revokeObjectURL(recordedUrl);
      setRecordedUrl(null);
    }
    setIsPreviewMode(false);
    setVideoBlob(null);
    setVideoFile(null);
    setRecordingTime(0);
  }, [recordedUrl]);

  // Initialize camera only when tab changes to record and not in preview mode
  useEffect(() => {
    if (activeTab === 'record' && !isPreviewMode) {
      initCamera();
    }
    
    return () => {
      // Cleanup timer only - don't stop camera here to avoid issues
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, isPreviewMode]);

  // Cleanup on component unmount
  useEffect(() => {
    return () => {
      // Stop all tracks on unmount
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track: MediaStreamTrack) => {
          track.stop();
        });
        streamRef.current = null;
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      // Clean up recorded URL
      if (recordedUrl) {
        URL.revokeObjectURL(recordedUrl);
      }
    };
  }, [recordedUrl]);

  // Handle recording timer
  useEffect(() => {
    if (isRecording) {
      timerRef.current = setInterval(() => {
        setRecordingTime((prev: number) => {
          if (prev >= 299) { // Stop at 4:59 to avoid issues
            stopRecording();
            return prev;
          }
          return prev + 1;
        });
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isRecording]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const toggleVideo = (): void => {
    if (streamRef.current) {
      const videoTrack: MediaStreamTrack | undefined = streamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoMuted(!videoTrack.enabled);
      }
    }
  };

  const toggleAudio = (): void => {
    if (streamRef.current) {
      const audioTrack: MediaStreamTrack | undefined = streamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsAudioMuted(!audioTrack.enabled);
      }
    }
  };

  const startRecording = (): void => {
    if (!streamRef.current) return;

    // Reset chunks
    chunksRef.current = [];
    
    // Determine supported mime type - prefer mp4 if supported
    const mimeType: string = MediaRecorder.isTypeSupported('video/mp4')
      ? 'video/mp4'
      : MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
      ? 'video/webm;codecs=vp9,opus'
      : MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
      ? 'video/webm;codecs=vp8,opus'
      : 'video/webm';

    try {
      const mediaRecorder: MediaRecorder = new MediaRecorder(streamRef.current, { mimeType });

      mediaRecorder.ondataavailable = (event: BlobEvent): void => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = (): void => {
        // Create blob from chunks with mp4 type
        const blob: Blob = new Blob(chunksRef.current, { type: 'video/mp4' });
        setVideoBlob(blob);
        
        // Convert blob to file for upload
        const file: File = new File([blob], `recording-${Date.now()}.mp4`, { type: 'video/mp4' });
        setVideoFile(file);

        // Generate preview URL
        const url: string = URL.createObjectURL(blob);
        setRecordedUrl(url);
        setIsPreviewMode(true);

        // IMPORTANT: Stop all tracks to release camera and microphone
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track: MediaStreamTrack) => {
            track.stop();
          });
          streamRef.current = null;
        }
        
        setCameraReady(false);
      };

      mediaRecorder.onerror = (event: Event): void => {
        console.error('MediaRecorder error:', event);
        setCameraError('Recording error occurred. Please try again.');
        setIsRecording(false);
      };

      mediaRecorderRef.current = mediaRecorder;
      
      // Start recording with 1 second timeslice for periodic data collection
      mediaRecorder.start(1000);
      setIsRecording(true);
      setRecordingTime(0);
    } catch (error) {
      console.error('Error starting recording:', error);
      setCameraError('Failed to start recording. Please try again.');
    }
  };

  const stopRecording = (): void => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        // Request final data chunk before stopping
        mediaRecorderRef.current.requestData();
        // Small delay to ensure data is collected
        setTimeout(() => {
          if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
          }
          setIsRecording(false);
        }, 100);
      } catch (error) {
        console.error('Error stopping recording:', error);
        setIsRecording(false);
      }
    } else {
      setIsRecording(false);
    }
  };

  const retakeVideo = (): void => {
    // Clear the recorded preview
    clearRecordedPreview();
    
    // Re-initialize camera after a short delay
    setTimeout(() => {
      initCamera();
    }, 100);
  };

  const downloadVideo = (): void => {
    if (!videoBlob) return;
    
    const url: string = URL.createObjectURL(videoBlob);
    const a: HTMLAnchorElement = document.createElement('a');
    a.href = url;
    a.download = `video-assessment-${Date.now()}.mp4`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    // Clean up the URL object after download starts
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file: File | undefined = e.target.files?.[0];
    if (file) {
      setVideoFile(file);
      setVideoBlob(null);
      setRecordedUrl(null);
      setIsPreviewMode(false);
    }
  };

  const handleSubmit = async (): Promise<void> => {
    if (!applicant || !videoFile) {
      showToast('Please record or upload a video before submitting.', 'warning');
      return;
    }
    // Minimum duration check for recorded videos (not uploads)
    if (videoBlob && recordingTime < 60) {
      showToast('Your video is too short. Please record at least 1 minute.', 'warning');
      return;
    }
    setShowConfirmModal(true);
  };

  const confirmSubmit = async (): Promise<void> => {
    if (!applicant || !videoFile) return;
    setShowConfirmModal(false);
    setUploading(true);

    try {
      // Use admin client to bypass RLS for storage upload
      const adminClient = getSupabaseAdminClient();
      
      // Upload video to storage
      const fileExt: string | undefined = videoFile.name.split('.').pop();
      const fileName: string = `${applicant.id}-${Date.now()}.${fileExt}`;
      
      const { data: uploadData, error: uploadError } = await adminClient.storage
        .from('applicant-videos')
        .upload(fileName, videoFile, {
          contentType: videoFile.type,
          upsert: false
        });

      if (uploadError) {
        throw new Error(`Upload failed: ${uploadError.message}`);
      }

      const { data: { publicUrl } } = adminClient.storage
        .from('applicant-videos')
        .getPublicUrl(fileName);

      const { data: assessment, error: selectError } = await adminClient
        .from('video_assessments')
        .select('*')
        .eq('applicant_id', applicant.id)
        .maybeSingle();

      if (selectError) {
        console.error('Error checking existing assessment:', selectError);
      }

      let assessmentId: string | undefined;
      
      if (assessment) {
        const { error: updateError } = await adminClient
          .from('video_assessments')
          .update({
            video_url: publicUrl,
            status: 'submitted',
            submitted_at: new Date().toISOString(),
            transcription_status: 'pending',
          })
          .eq('id', assessment.id);

        if (updateError) {
          throw new Error(`Failed to update record: ${updateError.message}`);
        }
        assessmentId = assessment.id;
      } else {
        const { data: newAssessment, error: insertError } = await adminClient.from('video_assessments').insert({
          applicant_id: applicant.id,
          video_url: publicUrl,
          status: 'submitted',
          submitted_at: new Date().toISOString(),
          transcription_status: 'pending',
        }).select().single();

        if (insertError) {
          throw new Error(`Failed to create record: ${insertError.message}`);
        }
        assessmentId = newAssessment?.id;
      }

      // Trigger automatic transcription
      if (assessmentId) {
        try {
          const response = await fetch(`${API_BASE}/api/trigger-transcription`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ assessment_id: assessmentId, language: 'en' })
          });
          if (!response.ok) {
            console.warn('Transcription trigger returned non-ok status:', response.status);
          }
        } catch {
          // background worker will pick it up
        }
      }

      showToast('Video assessment submitted. Transcription will begin shortly.', 'success');
      setShowSuccessModal(true);
    } catch (error) {
      console.error('Error submitting video:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      showToast(`Submission failed: ${errorMessage}`, 'error');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top Navigation Bar */}
      <nav className="sticky top-0 z-50 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            {/* Back to Dashboard Link */}
            <button
              onClick={onBack}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-800 transition-colors font-medium"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Dashboard
            </button>

            {/* User Profile Avatar */}
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center overflow-hidden">
                {applicant?.photo_url ? (
                  <img src={applicant.photo_url} alt={applicant?.name} className="w-full h-full object-cover" />
                ) : (
                  <User className="w-4 h-4 text-gray-500" />
                )}
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-800">Video Assessment</h1>
          <p className="text-gray-500 mt-1">Record or upload your video introduction.</p>
        </div>

        {/* Main Content - Two Column Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column - Instructions Card */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#B4D3D9' }}>
                  <Video className="w-4 h-4 text-gray-700" />
                </div>
                <h2 className="text-lg font-bold text-gray-800">Instructions</h2>
              </div>
              
              <ul className="text-gray-600 text-sm space-y-3">
                <li className="flex items-start gap-2">
                  <span className="text-gray-400 mt-1">•</span>
                  <span>Introduce yourself and explain why you're interested in this position.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-gray-400 mt-1">•</span>
                  <span>Highlight your relevant experience, skills, and qualifications.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-gray-400 mt-1">•</span>
                  <span>Keep your video response between 2-5 minutes.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-gray-400 mt-1">•</span>
                  <span>Ensure good lighting and clear audio.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-gray-400 mt-1">•</span>
                  <span>Record in a quiet environment with minimal distractions.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-gray-400 mt-1">•</span> 
                  <span>Speak clearly and present professionally.</span>
                </li>
              </ul>

              {/* Tab Navigation */}
              <div className="flex gap-2 mt-6">
                <button
                  onClick={() => {
                    setActiveTab('record');
                    if (videoFile && !recordedUrl) {
                      setVideoFile(null);
                    }
                  }}
                  className={`flex-1 py-2.5 px-3 rounded-lg font-medium text-sm transition-colors flex items-center justify-center gap-2 ${
                    activeTab === 'record'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  <Camera className="w-4 h-4" />
                  Record
                </button>
                <button
                  onClick={() => {
                    setActiveTab('upload');
                    if (isPreviewMode) {
                      clearRecordedPreview();
                    }
                  }}
                  className={`flex-1 py-2.5 px-3 rounded-lg font-medium text-sm transition-colors flex items-center justify-center gap-2 ${
                    activeTab === 'upload'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  <Upload className="w-4 h-4" />
                  Upload
                </button>
              </div>
            </div>
          </div>

          {/* Right Column - Video Interface */}
          <div className="lg:col-span-2">
            {/* Recording Section */}
            {activeTab === 'record' && (
              <div className="space-y-4">
                {/* Camera Error */}
                {(cameraError || permissionDenied) && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                    <p className="text-red-700 text-sm">{cameraError}</p>
                    <button
                      onClick={initCamera}
                      className="mt-2 text-red-600 hover:text-red-800 text-sm font-medium"
                    >
                      Try Again
                    </button>
                  </div>
                )}

                {/* Video Container */}
                <div className="relative bg-gray-900 rounded-2xl overflow-hidden shadow-lg aspect-video">
                  {/* Live Camera Feed */}
                  {!isPreviewMode && (
                    <video
                      ref={liveVideoRef}
                      autoPlay
                      playsInline
                      muted
                      className={`w-full h-full object-cover ${isVideoMuted ? 'hidden' : 'block'}`}
                    />
                  )}
                  
                  {/* Preview Video */}
                  {isPreviewMode && recordedUrl && (
                    <video
                      ref={previewVideoRef}
                      src={recordedUrl}
                      controls
                      className="w-full h-full object-contain"
                    />
                  )}
                    
                  {/* Camera Off Placeholder */}
                  {!isPreviewMode && isVideoMuted && (
                    <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
                      <VideoOff className="w-20 h-20 text-gray-600" />
                    </div>
                  )}

                  {/* Recording Indicator */}
                  {isRecording && (
                    <div className="absolute top-4 left-4 flex items-center gap-2 bg-red-600/90 backdrop-blur-sm px-3 py-1.5 rounded-full">
                      <div className="w-2.5 h-2.5 bg-white rounded-full animate-pulse" />
                      <span className="text-white text-sm font-medium">
                        REC {formatTime(recordingTime)}
                      </span>
                    </div>
                  )}
                  {/* Max time warning */}
                  {isRecording && recordingTime >= 240 && (
                    <div className="absolute top-4 right-4 bg-amber-500/90 backdrop-blur-sm px-3 py-1.5 rounded-full">
                      <span className="text-white text-xs font-medium">
                        {formatTime(300 - recordingTime)} remaining
                      </span>
                    </div>
                  )}

                  {/* Preview Mode Indicator */}
                  {isPreviewMode && (
                    <div className="absolute top-4 left-4 flex items-center gap-2 bg-green-600/90 backdrop-blur-sm px-3 py-1.5 rounded-full">
                      <CheckCircle className="w-4 h-4 text-white" />
                      <span className="text-white text-sm font-medium">
                        Preview
                      </span>
                    </div>
                  )}

                  {/* Camera Controls - Bottom Left */}
                  {!isPreviewMode && cameraReady && !isRecording && (
                    <div className="absolute bottom-4 left-4 flex gap-2">
                      <button
                        onClick={toggleVideo}
                        className={`w-10 h-10 rounded-full flex items-center justify-center backdrop-blur-sm transition-colors ${
                          isVideoMuted ? 'bg-red-600/80 text-white' : 'bg-black/50 text-white hover:bg-black/70'
                        }`}
                        title={isVideoMuted ? 'Enable Camera' : 'Disable Camera'}
                      >
                        {isVideoMuted ? <VideoOff className="w-5 h-5" /> : <VideoIcon className="w-5 h-5" />}
                      </button>
                      <button
                        onClick={toggleAudio}
                        className={`w-10 h-10 rounded-full flex items-center justify-center backdrop-blur-sm transition-colors ${
                          isAudioMuted ? 'bg-red-600/80 text-white' : 'bg-black/50 text-white hover:bg-black/70'
                        }`}
                        title={isAudioMuted ? 'Enable Microphone' : 'Disable Microphone'}
                      >
                        {isAudioMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                      </button>
                    </div>
                  )}

                  {/* Loading State */}
                  {!isPreviewMode && !cameraReady && !cameraError && (
                    <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
                      <div className="text-center">
                        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                        <p className="text-gray-400 text-sm">Initializing camera...</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Recording Controls */}
                <div className="flex items-center justify-center gap-4">
                  {!isPreviewMode ? (
                    // Recording controls
                    !isRecording ? (
                      <button
                        onClick={startRecording}
                        disabled={!cameraReady}
                        className="flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-semibold py-3 px-8 rounded-full transition-colors animate-pulse"
                      >
                        <div className="w-3 h-3 bg-white rounded-full" />
                        <span>Start Recording</span>
                      </button>
                    ) : (
                      <button
                        onClick={stopRecording}
                        className="flex items-center justify-center gap-2 bg-gray-800 hover:bg-gray-900 text-white font-semibold py-3 px-8 rounded-full transition-colors"
                      >
                        <Square className="w-4 h-4 fill-current" />
                        <span>Stop ({formatTime(recordingTime)})</span>
                      </button>
                    )
                  ) : (
                    // Post-Recording Actions
                    <div className="flex items-center gap-3">
                      <button
                        onClick={retakeVideo}
                        className="flex items-center justify-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2.5 px-5 rounded-lg transition-colors text-sm"
                      >
                        <RefreshCw className="w-4 h-4" />
                        Retake
                      </button>
                      <button
                        onClick={downloadVideo}
                        className="flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white font-medium py-2.5 px-5 rounded-lg transition-colors text-sm"
                      >
                        <Download className="w-4 h-4" />
                        Download
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Upload Section */}
            {activeTab === 'upload' && (
              <div className="border-2 border-dashed border-gray-300 rounded-2xl p-8 flex flex-col justify-center min-h-[400px]">
                <div className="text-center">
                  <Upload className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Upload Video File</h3>
                  <p className="text-gray-500 mb-4 text-sm">
                    Choose a pre-recorded video (MP4, MOV, WEBM, or AVI)
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
                    className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 px-6 rounded-lg cursor-pointer transition-colors"
                  >
                    Choose File
                  </label>
                  
                  {/* Selected File Preview */}
                  {videoFile && activeTab === 'upload' && (
                    <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-xl">
                      <div className="flex items-center justify-center gap-2 text-green-700 mb-2">
                        <CheckCircle className="w-5 h-5" />
                        <span className="font-medium truncate max-w-[300px]">{videoFile.name}</span>
                      </div>
                      <p className="text-green-600 text-sm">
                        Size: {(videoFile.size / (1024 * 1024)).toFixed(2)} MB
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Submit Section */}
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={onBack}
                className="px-6 py-2.5 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={!videoFile || uploading}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors flex items-center gap-2"
              >
                {uploading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Submit Assessment
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Confirm Submit Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                <Save className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900">Submit Video Assessment?</h2>
                <p className="text-sm text-gray-500">This action cannot be undone.</p>
              </div>
            </div>
            <p className="text-gray-600 text-sm mb-6">
              Are you sure you want to submit your video assessment? Once submitted, you will not be able to re-record or replace your video.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowConfirmModal(false)}
                className="px-5 py-2.5 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmSubmit}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
              >
                Yes, Submit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success Modal */}
      {showSuccessModal && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4 text-center">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Video Submitted!</h2>
            <p className="text-gray-500 text-sm mb-6">
              Your video assessment has been submitted successfully. Transcription will begin shortly. Our team will review your submission and contact you within 5-7 business days.
            </p>
            <button
              onClick={onComplete}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 rounded-lg transition-colors"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      )}

      {/* Toast notification */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-[200] flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl text-sm font-medium max-w-sm ${
          toast.type === 'success' ? 'bg-green-600 text-white' :
          toast.type === 'error' ? 'bg-red-600 text-white' :
          'bg-amber-500 text-white'
        }`}>
          {toast.type === 'success' ? <CheckCircle className="w-4 h-4 flex-shrink-0" /> :
           toast.type === 'error' ? <XCircle className="w-4 h-4 flex-shrink-0" /> :
           <AlertCircle className="w-4 h-4 flex-shrink-0" />}
          <span>{toast.message}</span>
          <button onClick={() => setToast(null)} className="ml-1 opacity-70 hover:opacity-100">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
