import { useState, useRef, useEffect, useCallback } from 'react';
import { Video, Upload, ArrowLeft, CheckCircle, Camera, Mic, MicOff, Video as VideoIcon, VideoOff, RefreshCw, Square, Download, Save, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getSupabaseClient, getSupabaseAdminClient } from '../lib/supabase';

interface VideoAssessmentProps {
  onComplete: () => void;
  onBack: () => void;
}

export function VideoAssessment({ onComplete, onBack }: VideoAssessmentProps) {
  const { applicant, accessToken } = useAuth();
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
        streamRef.current.getTracks().forEach((track: MediaStreamTrack) => track.stop());
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
      console.error('Submit failed: Missing applicant or video file', { applicant, videoFile });
      alert('Missing required data. Please record or upload a video first.');
      return;
    }

    setUploading(true);
    console.log('Starting video submission for applicant:', applicant.id);

    try {
      // Use admin client to bypass RLS for storage upload
      const adminClient = getSupabaseAdminClient();
      
      // Upload video to storage
      const fileExt: string | undefined = videoFile.name.split('.').pop();
      const fileName: string = `${applicant.id}-${Date.now()}.${fileExt}`;
      
      console.log('Uploading video to storage:', fileName, 'Size:', videoFile.size, 'bytes');
      
      const { data: uploadData, error: uploadError } = await adminClient.storage
        .from('applicant-videos')
        .upload(fileName, videoFile, {
          contentType: videoFile.type,
          upsert: false
        });

      if (uploadError) {
        console.error('Storage upload error:', uploadError);
        throw new Error(`Upload failed: ${uploadError.message}`);
      }

      console.log('Video uploaded successfully:', uploadData);

      // Get public URL
      const { data: { publicUrl } } = adminClient.storage
        .from('applicant-videos')
        .getPublicUrl(fileName);

      console.log('Public URL generated:', publicUrl);

      // Use admin client to bypass RLS for database operations
      const { data: assessment, error: selectError } = await adminClient
        .from('video_assessments')
        .select('*')
        .eq('applicant_id', applicant.id)
        .maybeSingle();

      if (selectError) {
        console.error('Error checking existing assessment:', selectError);
      }

      console.log('Existing assessment:', assessment);

      if (assessment) {
        const { error: updateError } = await adminClient
          .from('video_assessments')
          .update({
            video_url: publicUrl,
            status: 'submitted',
            submitted_at: new Date().toISOString(),
          })
          .eq('id', assessment.id);

        if (updateError) {
          console.error('Update error:', updateError);
          throw new Error(`Failed to update record: ${updateError.message}`);
        }
        console.log('Assessment record updated successfully');
      } else {
        const { error: insertError } = await adminClient.from('video_assessments').insert({
          applicant_id: applicant.id,
          video_url: publicUrl,
          status: 'submitted',
          submitted_at: new Date().toISOString(),
        });

        if (insertError) {
          console.error('Insert error:', insertError);
          throw new Error(`Failed to create record: ${insertError.message}`);
        }
        console.log('Assessment record created successfully');
      }

      // Trigger automatic transcription
      const assessmentId = assessment?.id;
      if (assessmentId) {
        console.log('Triggering automatic transcription for assessment:', assessmentId);
        
        // Option 1: Call the Flask API (if running)
        try {
          const response = await fetch('http://localhost:5000/api/trigger-transcription', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              assessment_id: assessmentId,
              language: 'en'
            })
          });
          
          if (response.ok) {
            console.log('Transcription triggered successfully');
          } else {
            console.warn('Transcription trigger returned non-ok status');
          }
        } catch (apiError) {
          // API might not be running, log but don't block
          console.log('Transcription API not available, will process later:', apiError);
        }
      }

      alert('Video assessment submitted successfully! Transcription will begin shortly.');
      onComplete();
    } catch (error) {
      console.error('Error submitting video:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      alert(`Failed to submit video: ${errorMessage}`);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 px-2 sm:px-4 lg:px-6 py-4">
      <div className="max-w-7xl mx-auto h-[calc(100vh-2rem)] flex flex-col">
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden flex-1 flex flex-col">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 p-4 sm:p-6 text-white flex-shrink-0">
            <button
              onClick={onBack}
              className="flex items-center gap-2 text-white/90 hover:text-white mb-2 transition-colors text-sm"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Back to Dashboard</span>
              <span className="sm:hidden">Back</span>
            </button>
            <h1 className="text-lg sm:text-xl lg:text-2xl font-bold">Video Assessment</h1>
            <p className="text-blue-100 mt-0.5 text-xs sm:text-sm">Record or upload your video introduction</p>
          </div>

          <div className="flex-1 p-3 sm:p-4 lg:p-6 overflow-hidden">
            {/* Main Content - Two Column Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 lg:gap-4 h-full">
              {/* Left Column - Instructions */}
              <div className="lg:col-span-4 xl:col-span-3">
                {/* Instructions */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg py-10 px-4 mb-4">
                  <h3 className="font-semibold text-blue-900 mb-3 text-sm sm:text-base">Instructions</h3>
                  <ul className="text-sm text-blue-800 space-y-2">
                    <li className="flex items-start gap-1.5">
                      <span className="text-blue-600 mt-0.5">•</span>
                      <span>Introduce yourself and explain why you're interested in this position.</span>
                    </li>
                    <li className="flex items-start gap-1.5">
                      <span className="text-blue-600 mt-0.5">•</span>
                      <span>Highlight your relevant experience, skills, and qualifications.</span>
                    </li>
                    <li className="flex items-start gap-1.5">
                      <span className="text-blue-600 mt-0.5">•</span>
                      <span>Keep your video response between 2-5 minutes</span>
                    </li>
                    <li className="flex items-start gap-1.5">
                      <span className="text-blue-600 mt-0.5">•</span>
                      <span>Ensure good lighting and clear audio.</span>
                    </li>
                    <li className="flex items-start gap-1.5">
                      <span className="text-blue-600 mt-0.5">•</span>
                      <span>Record in a quiet environment with minimal distractions.</span>
                    </li>
                    <li className="flex items-start gap-1.5">
                      <span className="text-blue-600 mt-0.5">•</span> 
                      <span>Speak clearly and present professionally.</span>
                    </li>
                  </ul>
                </div>

                {/* Tab Navigation */}
                <div className="flex gap-2 mb-3">
                  <button
                    onClick={() => {
                      setActiveTab('record');
                      if (videoFile && !recordedUrl) {
                        setVideoFile(null);
                      }
                    }}
                    className={`flex-1 py-2 px-3 rounded-lg font-medium text-xs transition-colors flex items-center justify-center gap-1.5 ${
                      activeTab === 'record'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Record</span>
                  </button>
                  <button
                    onClick={() => {
                      setActiveTab('upload');
                      if (isPreviewMode) {
                        clearRecordedPreview();
                      }
                    }}
                    className={`flex-1 py-2 px-3 rounded-lg font-medium text-xs transition-colors flex items-center justify-center gap-1.5 ${
                      activeTab === 'upload'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Upload</span>
                  </button>
                </div>
              </div>

              {/* Right Column - Video Area */}
              <div className="lg:col-span-8 xl:col-span-9 flex flex-col h-full">

            {/* Recording Section */}
            {activeTab === 'record' && (
              <div className="space-y-3 flex-1 flex flex-col">
                {/* Camera Error */}
                {(cameraError || permissionDenied) && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-2 sm:p-3">
                    <p className="text-red-700 text-xs">{cameraError}</p>
                    <button
                      onClick={initCamera}
                      className="mt-1.5 text-red-600 hover:text-red-800 text-xs font-medium"
                    >
                      Try Again
                    </button>
                  </div>
                )}

                {/* Video Display Area - Conditional Rendering */}
                <div className="relative bg-black rounded-lg overflow-hidden flex-1 min-h-0" style={{ maxHeight: 'calc(100% - 60px)' }}>
                  {/* Live Camera Feed - shown when not in preview mode */}
                  {!isPreviewMode && (
                    <video
                      ref={liveVideoRef}
                      autoPlay
                      playsInline
                      muted
                      className={`w-full h-full object-cover ${isVideoMuted ? 'hidden' : 'block'}`}
                    />
                  )}
                  
                  {/* Preview Video - shown when in preview mode */}
                  {isPreviewMode && recordedUrl && (
                    <video
                      ref={previewVideoRef}
                      src={recordedUrl}
                      controls
                      className="w-full h-full"
                    />
                  )}
                    
                  {/* Camera Off Placeholder - only show in live mode when muted */}
                  {!isPreviewMode && isVideoMuted && (
                    <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
                      <VideoOff className="w-12 h-12 sm:w-16 sm:h-16 text-gray-600" />
                    </div>
                  )}

                  {/* Recording Indicator - only show when recording */}
                  {isRecording && (
                    <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-black/50 backdrop-blur-sm px-2 py-1 rounded-full">
                      <div className="w-2 h-2 bg-red-600 rounded-full animate-pulse" />
                      <span className="text-white text-xs font-medium">
                        REC {formatTime(recordingTime)}
                      </span>
                    </div>
                  )}

                  {/* Preview Mode Indicator */}
                  {isPreviewMode && (
                    <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-green-600/80 backdrop-blur-sm px-2 py-1 rounded-full">
                      <CheckCircle className="w-3 h-3 text-white" />
                      <span className="text-white text-xs font-medium">
                        Preview
                      </span>
                    </div>
                  )}

                  {/* Camera Controls - only show in live mode when ready and not recording */}
                  {!isPreviewMode && cameraReady && !isRecording && (
                    <div className="absolute bottom-2 left-2 flex gap-1.5">
                      <button
                        onClick={toggleVideo}
                        className={`p-1.5 rounded-full backdrop-blur-sm transition-colors ${
                          isVideoMuted ? 'bg-red-600/80 text-white' : 'bg-black/50 text-white hover:bg-black/70'
                        }`}
                        title={isVideoMuted ? 'Enable Camera' : 'Disable Camera'}
                      >
                        {isVideoMuted ? <VideoOff className="w-3.5 h-3.5" /> : <VideoIcon className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        onClick={toggleAudio}
                        className={`p-1.5 rounded-full backdrop-blur-sm transition-colors ${
                          isAudioMuted ? 'bg-red-600/80 text-white' : 'bg-black/50 text-white hover:bg-black/70'
                        }`}
                        title={isAudioMuted ? 'Enable Microphone' : 'Disable Microphone'}
                      >
                        {isAudioMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  )}

                  {/* Loading State - only show in live mode */}
                  {!isPreviewMode && !cameraReady && !cameraError && (
                    <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
                      <div className="text-center">
                        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                        <p className="text-gray-400 text-xs">Initializing camera...</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Recording Controls */}
                <div className="flex justify-center gap-2 mt-2">
                  {!isPreviewMode ? (
                    // Recording controls
                    !isRecording ? (
                      <button
                        onClick={startRecording}
                        disabled={!cameraReady}
                        className="flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-semibold py-2 px-4 sm:px-5 rounded-full transition-colors text-xs sm:text-sm"
                      >
                        <div className="w-2.5 h-2.5 bg-white rounded-full" />
                        Start Recording
                      </button>
                    ) : (
                      <button
                        onClick={stopRecording}
                        className="flex items-center justify-center gap-2 bg-gray-800 hover:bg-gray-900 text-white font-semibold py-2 px-4 sm:px-5 rounded-full transition-colors text-xs sm:text-sm"
                      >
                        <Square className="w-3.5 h-3.5 fill-current" />
                        Stop ({formatTime(recordingTime)})
                      </button>
                    )
                  ) : (
                    // Post-Recording Actions
                    <>
                      <button
                        onClick={retakeVideo}
                        className="flex items-center justify-center gap-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2 px-3 sm:px-4 rounded-lg transition-colors text-xs"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        Retake
                      </button>
                      <button
                        onClick={downloadVideo}
                        className="flex items-center justify-center gap-1.5 bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-3 sm:px-4 rounded-lg transition-colors text-xs"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Download
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Upload Section */}
            {activeTab === 'upload' && (
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-3 sm:p-4 flex-1 flex flex-col justify-center">
                <div className="text-center">
                  <Upload className="w-8 h-8 sm:w-10 sm:h-10 text-gray-400 mx-auto mb-2" />
                  <h3 className="text-sm sm:text-base font-semibold text-gray-900 mb-1.5">Upload Video File</h3>
                  <p className="text-gray-600 mb-3 text-xs">
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
                    className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-medium py-1.5 px-4 rounded-lg cursor-pointer transition-colors text-xs sm:text-sm"
                  >
                    Choose File
                  </label>
                  
                  {/* Selected File Preview */}
                  {videoFile && activeTab === 'upload' && (
                    <div className="mt-3 p-2 sm:p-3 bg-green-50 border border-green-200 rounded-lg">
                      <div className="flex items-center justify-center gap-2 text-green-700 mb-1">
                        <CheckCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        <span className="font-medium text-xs truncate max-w-[180px]">{videoFile.name}</span>
                      </div>
                      <p className="text-green-600 text-xs">
                        Size: {(videoFile.size / (1024 * 1024)).toFixed(2)} MB
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Submit Section */}
            <div className="mt-3 flex justify-end gap-2">
              <button
                onClick={onBack}
                className="w-full sm:w-auto px-4 sm:px-5 py-2 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors text-xs sm:text-sm order-2 sm:order-1"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={!videoFile || uploading}
                className="w-full sm:w-auto px-4 sm:px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors text-xs sm:text-sm order-1 sm:order-2"
              >
                {uploading ? (
                  <span className="flex items-center justify-center gap-1.5">
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Submitting...
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-1.5">
                    <Save className="w-3.5 h-3.5" />
                    Submit
                  </span>
                )}
              </button>
            </div>
            </div>{/* End Right Column */}
            </div>{/* End Grid */}
          </div>
        </div>
      </div>
    </div>
  );
}
