import { useState, useEffect, useRef } from 'react';
import { 
  Video, X, User, FileText, Brain, Star, TrendingUp, AlertCircle, CheckCircle, Loader2, 
  Shield, Check, AlertTriangle, Play, Pause, SkipBack, SkipForward, Volume2, VolumeX,
  Search, MessageSquare, ThumbsUp, ThumbsDown, Flag, Clock, ChevronRight, BarChart3
} from 'lucide-react';
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
  relevance_score?: number;
  experience_score?: number;
  skills_score?: number;
  completeness_score?: number;
  relevance_justification?: string;
  experience_justification?: string;
  skills_justification?: string;
  completeness_justification?: string;
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

interface TimestampComment {
  id: string;
  time: number;
  comment: string;
  type: 'positive' | 'concern' | 'neutral';
}

interface AICategoryScore {
  category: string;
  score: number;
  feedback: string;
}

export function VideoAssessmentTab({ applicantId, videoScore, onClose }: VideoAssessmentTabProps) {
  const [videoData, setVideoData] = useState<VideoAssessmentData | null>(null);
  const [applicantData, setApplicantData] = useState<ApplicantData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Identity verification state
  const [identityStatus, setIdentityStatus] = useState<'pending' | 'verified' | 'needs_review'>('pending');
  const [identityNotes, setIdentityNotes] = useState('');
  
  // Video player state
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  
  // Transcript state
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedTranscript, setHighlightedTranscript] = useState<string>('');
  
  // Timestamp comments
  const [timestampComments, setTimestampComments] = useState<TimestampComment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [newCommentType, setNewCommentType] = useState<'positive' | 'concern' | 'neutral'>('neutral');
  
  // HR Actions
  const [hrDecision, setHrDecision] = useState<'approve' | 'reject' | 'next_stage' | null>(null);
  const [hrNotes, setHrNotes] = useState('');
  const [flaggedForReview, setFlaggedForReview] = useState(false);
  
  // Active sub-tab
  const [activeSubTab, setActiveSubTab] = useState<'overview' | 'video_transcript' | 'ai_evaluation'>('overview');

  // AI Category Scores (from real video assessment data)
  const aiCategoryScores: AICategoryScore[] = videoData ? [
    { 
      category: 'Relevance to Job', 
      score: videoData.relevance_score ? Math.round(videoData.relevance_score * 10) : 0, 
      feedback: videoData.relevance_justification || 'Assessment of how well the response relates to the position' 
    },
    { 
      category: 'Experience Alignment', 
      score: videoData.experience_score ? Math.round(videoData.experience_score * 10) : 0, 
      feedback: videoData.experience_justification || 'Assessment of relevant work experience mentioned' 
    },
    { 
      category: 'Skill Evidence', 
      score: videoData.skills_score ? Math.round(videoData.skills_score * 10) : 0, 
      feedback: videoData.skills_justification || 'Assessment of skills demonstrated or mentioned' 
    },
    { 
      category: 'Completeness', 
      score: videoData.completeness_score ? Math.round(videoData.completeness_score * 10) : 0, 
      feedback: videoData.completeness_justification || 'Assessment of response completeness and structure' 
    },
  ] : [];

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

  // Video player controls
  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
    }
  };

  const seekTo = (time: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const skipForward = () => {
    if (videoRef.current) {
      videoRef.current.currentTime = Math.min(videoRef.current.currentTime + 10, duration);
    }
  };

  const skipBackward = () => {
    if (videoRef.current) {
      videoRef.current.currentTime = Math.max(videoRef.current.currentTime - 10, 0);
    }
  };

  const changePlaybackSpeed = () => {
    const speeds = [0.5, 0.75, 1, 1.25, 1.5, 2];
    const currentIndex = speeds.indexOf(playbackSpeed);
    const nextIndex = (currentIndex + 1) % speeds.length;
    const newSpeed = speeds[nextIndex];
    if (videoRef.current) {
      videoRef.current.playbackRate = newSpeed;
    }
    setPlaybackSpeed(newSpeed);
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Add timestamp comment
  const addTimestampComment = () => {
    if (newComment.trim()) {
      const comment: TimestampComment = {
        id: Date.now().toString(),
        time: currentTime,
        comment: newComment,
        type: newCommentType
      };
      setTimestampComments([...timestampComments, comment]);
      setNewComment('');
    }
  };

  // Search and highlight transcript
  useEffect(() => {
    if (videoData?.transcription) {
      if (searchQuery.trim()) {
        const regex = new RegExp(`(${searchQuery})`, 'gi');
        const highlighted = videoData.transcription.replace(regex, '<mark class="bg-yellow-200">$1</mark>');
        setHighlightedTranscript(highlighted);
      } else {
        setHighlightedTranscript(videoData.transcription);
      }
    }
  }, [searchQuery, videoData?.transcription]);

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

  const getScoreRating = (score: number) => {
    if (score >= 80) return 'Strong';
    if (score >= 60) return 'Medium';
    return 'Weak';
  };

  const getScoreBarColor = (score: number) => {
    if (score >= 80) return 'bg-green-500';
    if (score >= 60) return 'bg-amber-500';
    return 'bg-red-500';
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

      {/* Sub-tabs Navigation */}
      <div className="px-4 border-b border-gray-200 bg-gray-50">
        <div className="flex gap-1 -mb-px">
          {[
            { id: 'overview', label: 'Overview', icon: BarChart3 },
            { id: 'video_transcript', label: 'Video & Transcript', icon: Video },
            { id: 'ai_evaluation', label: 'AI Evaluation', icon: Brain },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id as typeof activeSubTab)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeSubTab === tab.id
                  ? 'border-indigo-600 text-indigo-600 bg-white rounded-t-lg'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-t-lg'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        
        {/* ===== OVERVIEW TAB ===== */}
        {activeSubTab === 'overview' && (
          <div className="space-y-6">
            {/* Overall Score & Recommendation */}
            <div className={`${getScoreBgColor(videoData?.transcript_score ? Math.round(videoData.transcript_score * 10) : 0)} rounded-xl p-5 border border-gray-200`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={`w-16 h-16 rounded-xl flex items-center justify-center ${getScoreBgColor(videoData?.transcript_score ? Math.round(videoData.transcript_score * 10) : 0)}`}>
                    <Star className={`w-8 h-8 ${getScoreColor(videoData?.transcript_score ? Math.round(videoData.transcript_score * 10) : 0)}`} />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Overall Assessment Score</p>
                    <div className="flex items-baseline gap-2">
                      <p className={`text-3xl font-bold ${getScoreColor(videoData?.transcript_score ? Math.round(videoData.transcript_score * 10) : 0)}`}>
                        {videoData?.transcript_score ? Math.round(videoData.transcript_score * 10) : 0}%
                      </p>
                      <span className={`text-sm font-medium px-2 py-0.5 rounded-full ${
                        videoData?.transcript_score && videoData.transcript_score >= 8 ? 'bg-green-200 text-green-800' :
                        videoData?.transcript_score && videoData.transcript_score >= 6 ? 'bg-amber-200 text-amber-800' :
                        'bg-red-200 text-red-800'
                      }`}>
                        {getScoreRating(videoData?.transcript_score ? Math.round(videoData.transcript_score * 10) : 0)}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-500 mb-1">AI Recommendation</p>
                  <p className={`text-sm font-semibold ${
                    videoData?.transcript_score && videoData.transcript_score >= 7 ? 'text-green-700' : 'text-amber-700'
                  }`}>
                    {videoData?.transcript_score && videoData.transcript_score >= 7 ? '✓ Recommended for next stage' : '⚠ Requires additional review'}
                  </p>
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
          </div>
        )}

        {/* ===== VIDEO & TRANSCRIPT TAB ===== */}
        {activeSubTab === 'video_transcript' && (
          <div className="space-y-6">
            {/* Video Player with Full Controls */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h4 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Video className="w-4 h-4 text-indigo-600" />
                Video Player
              </h4>
              
              {/* Video Element */}
              <div className="relative bg-black rounded-lg overflow-hidden mb-4">
                {videoData?.video_url ? (
                  <video
                    ref={videoRef}
                    src={videoData.video_url}
                    className="w-full aspect-video"
                    onTimeUpdate={handleTimeUpdate}
                    onLoadedMetadata={handleLoadedMetadata}
                    onPlay={() => setIsPlaying(true)}
                    onPause={() => setIsPlaying(false)}
                  />
                ) : (
                  <div className="w-full aspect-video flex items-center justify-center bg-gray-900">
                    <Video className="w-16 h-16 text-gray-600" />
                  </div>
                )}
              </div>

              {/* Video Controls */}
              <div className="space-y-3">
                {/* Progress Bar */}
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-500 w-12">{formatTime(currentTime)}</span>
                  <div 
                    className="flex-1 bg-gray-200 rounded-full h-2 cursor-pointer"
                    onClick={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const percent = (e.clientX - rect.left) / rect.width;
                      seekTo(percent * duration);
                    }}
                  >
                    <div 
                      className="bg-indigo-600 h-2 rounded-full transition-all"
                      style={{ width: `${(currentTime / duration) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-500 w-12">{formatTime(duration)}</span>
                </div>

                {/* Control Buttons */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={skipBackward}
                      className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                      title="Skip back 10s"
                    >
                      <SkipBack className="w-4 h-4 text-gray-600" />
                    </button>
                    <button
                      onClick={togglePlay}
                      className="p-3 bg-indigo-600 hover:bg-indigo-700 rounded-full transition-colors"
                    >
                      {isPlaying ? (
                        <Pause className="w-5 h-5 text-white" />
                      ) : (
                        <Play className="w-5 h-5 text-white" />
                      )}
                    </button>
                    <button
                      onClick={skipForward}
                      className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                      title="Skip forward 10s"
                    >
                      <SkipForward className="w-4 h-4 text-gray-600" />
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={changePlaybackSpeed}
                      className="px-3 py-1.5 text-xs font-medium bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                    >
                      {playbackSpeed}x
                    </button>
                    <button
                      onClick={toggleMute}
                      className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                      {isMuted ? (
                        <VolumeX className="w-4 h-4 text-gray-600" />
                      ) : (
                        <Volume2 className="w-4 h-4 text-gray-600" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Timestamp Markers */}
                {timestampComments.length > 0 && (
                  <div className="mt-4 space-y-2">
                    <p className="text-xs text-gray-500 font-medium">Timestamp Markers</p>
                    <div className="flex flex-wrap gap-2">
                      {timestampComments.map((comment) => (
                        <button
                          key={comment.id}
                          onClick={() => seekTo(comment.time)}
                          className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium transition-colors ${
                            comment.type === 'positive' ? 'bg-green-100 text-green-700 hover:bg-green-200' :
                            comment.type === 'concern' ? 'bg-red-100 text-red-700 hover:bg-red-200' :
                            'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }`}
                        >
                          <Clock className="w-3 h-3" />
                          {formatTime(comment.time)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Add Comment at Timestamp */}
                <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500 font-medium mb-2">Add Comment at {formatTime(currentTime)}</p>
                  <div className="flex gap-2">
                    <select
                      value={newCommentType}
                      onChange={(e) => setNewCommentType(e.target.value as typeof newCommentType)}
                      className="px-2 py-1.5 text-xs border border-gray-200 rounded-lg"
                    >
                      <option value="positive">Positive</option>
                      <option value="concern">Concern</option>
                      <option value="neutral">Neutral</option>
                    </select>
                    <input
                      type="text"
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      placeholder="Add comment..."
                      className="flex-1 px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                    <button
                      onClick={addTimestampComment}
                      className="px-3 py-1.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
                    >
                      Add
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Transcribed Responses */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-indigo-600" />
                  Transcribed Responses
                </h4>
                {/* Search within transcript */}
                <div className="relative">
                  <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search transcript..."
                    className="pl-9 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>
              </div>
              {videoData?.transcription ? (
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200 max-h-96 overflow-y-auto">
                  <p 
                    className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap"
                    dangerouslySetInnerHTML={{ __html: highlightedTranscript }}
                  />
                </div>
              ) : (
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200 text-center">
                  <FileText className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">No transcription available</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ===== AI EVALUATION TAB ===== */}
        {activeSubTab === 'ai_evaluation' && (
          <div className="space-y-6">
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
                      ? `The response demonstrates communication skills with an overall score of ${Math.round(videoData.transcript_score * 10)}%. ${videoData.relevance_justification || 'The content addresses the key points relevant to the position.'}`
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
                    {videoData?.transcript_score && videoData.transcript_score < 8
                      ? (videoData.completeness_justification || 'Consider providing more specific examples and elaborating on key points. Adding concrete details would strengthen the response.')
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
                    {videoData?.skills_justification && (
                      <li className="flex items-start gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 mt-2 flex-shrink-0" />
                        <span>{videoData.skills_justification}</span>
                      </li>
                    )}
                    {videoData?.experience_justification && (
                      <li className="flex items-start gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 mt-2 flex-shrink-0" />
                        <span>{videoData.experience_justification}</span>
                      </li>
                    )}
                    {videoData?.relevance_justification && (
                      <li className="flex items-start gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 mt-2 flex-shrink-0" />
                        <span>{videoData.relevance_justification}</span>
                      </li>
                    )}
                    {!videoData?.skills_justification && !videoData?.experience_justification && !videoData?.relevance_justification && (
                      <li className="flex items-start gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 mt-2 flex-shrink-0" />
                        <span>Assessment insights will appear here once processing is complete</span>
                      </li>
                    )}
                  </ul>
                </div>

                {/* AI Rationale */}
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <div className="flex items-center gap-2 mb-2">
                    <MessageSquare className="w-4 h-4 text-gray-600" />
                    <p className="text-sm font-medium text-gray-900">AI Rationale</p>
                  </div>
                  <p className="text-sm text-gray-700">
                    {videoData?.transcript_score 
                      ? `The assessment score is based on analysis of communication patterns, response relevance, and professional presentation. ${videoData.completeness_justification || 'The AI evaluates clarity of speech, structure of answers, and alignment with job requirements to provide a comprehensive assessment.'}`
                      : 'The assessment score is based on analysis of communication patterns, response relevance, and professional presentation. The AI evaluates clarity of speech, structure of answers, and alignment with job requirements to provide a comprehensive assessment.'}
                  </p>
                </div>
              </div>
            </div>

            {/* Strengths & Weaknesses */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <ThumbsUp className="w-4 h-4 text-green-600" />
                  Strengths
                </h4>
                <ul className="space-y-2">
                  {videoData?.relevance_score && videoData.relevance_score >= 7 && (
                    <li className="flex items-start gap-2 text-sm text-gray-700">
                      <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                      <span>Strong relevance to job requirements</span>
                    </li>
                  )}
                  {videoData?.experience_score && videoData.experience_score >= 7 && (
                    <li className="flex items-start gap-2 text-sm text-gray-700">
                      <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                      <span>Good experience alignment</span>
                    </li>
                  )}
                  {videoData?.skills_score && videoData.skills_score >= 7 && (
                    <li className="flex items-start gap-2 text-sm text-gray-700">
                      <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                      <span>Clear skill evidence</span>
                    </li>
                  )}
                  {videoData?.completeness_score && videoData.completeness_score >= 7 && (
                    <li className="flex items-start gap-2 text-sm text-gray-700">
                      <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                      <span>Well-structured response</span>
                    </li>
                  )}
                  {(!videoData?.relevance_score || videoData.relevance_score < 7) && 
                   (!videoData?.experience_score || videoData.experience_score < 7) && 
                   (!videoData?.skills_score || videoData.skills_score < 7) && 
                   (!videoData?.completeness_score || videoData.completeness_score < 7) && (
                    <li className="flex items-start gap-2 text-sm text-gray-700">
                      <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                      <span>Assessment pending</span>
                    </li>
                  )}
                </ul>
              </div>

              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <ThumbsDown className="w-4 h-4 text-red-600" />
                  Areas for Improvement
                </h4>
                <ul className="space-y-2">
                  {videoData?.relevance_score && videoData.relevance_score < 6 && (
                    <li className="flex items-start gap-2 text-sm text-gray-700">
                      <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                      <span>Improve relevance to job requirements</span>
                    </li>
                  )}
                  {videoData?.experience_score && videoData.experience_score < 6 && (
                    <li className="flex items-start gap-2 text-sm text-gray-700">
                      <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                      <span>Provide more specific experience examples</span>
                    </li>
                  )}
                  {videoData?.skills_score && videoData.skills_score < 6 && (
                    <li className="flex items-start gap-2 text-sm text-gray-700">
                      <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                      <span>Demonstrate skills more clearly</span>
                    </li>
                  )}
                  {videoData?.completeness_score && videoData.completeness_score < 6 && (
                    <li className="flex items-start gap-2 text-sm text-gray-700">
                      <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                      <span>Elaborate on key points</span>
                    </li>
                  )}
                  {(!videoData?.relevance_score || videoData.relevance_score >= 6) && 
                   (!videoData?.experience_score || videoData.experience_score >= 6) && 
                   (!videoData?.skills_score || videoData.skills_score >= 6) && 
                   (!videoData?.completeness_score || videoData.completeness_score >= 6) && (
                    <li className="flex items-start gap-2 text-sm text-gray-700">
                      <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                      <span>No major areas for improvement identified</span>
                    </li>
                  )}
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* HR Actions Panel - Sticky Footer */}
      <div className="sticky bottom-0 bg-white border-t border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setHrDecision('approve')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                hrDecision === 'approve'
                  ? 'bg-green-600 text-white'
                  : 'bg-green-50 text-green-700 hover:bg-green-100 border border-green-200'
              }`}
            >
              <ThumbsUp className="w-4 h-4" />
              Approve
            </button>
            <button
              onClick={() => setHrDecision('reject')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                hrDecision === 'reject'
                  ? 'bg-red-600 text-white'
                  : 'bg-red-50 text-red-700 hover:bg-red-100 border border-red-200'
              }`}
            >
              <ThumbsDown className="w-4 h-4" />
              Reject
            </button>
            <button
              onClick={() => setHrDecision('next_stage')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                hrDecision === 'next_stage'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200'
              }`}
            >
              <ChevronRight className="w-4 h-4" />
              Move to Next Stage
            </button>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setFlaggedForReview(!flaggedForReview)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                flaggedForReview
                  ? 'bg-amber-600 text-white'
                  : 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200'
              }`}
            >
              <Flag className="w-4 h-4" />
              {flaggedForReview ? 'Flagged' : 'Flag for Review'}
            </button>
            <input
              type="text"
              value={hrNotes}
              onChange={(e) => setHrNotes(e.target.value)}
              placeholder="Add internal notes..."
              className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent w-48"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
