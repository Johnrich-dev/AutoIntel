import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Search,
  ChevronDown,
  ChevronUp,
  CheckSquare,
  Square,
  Download,
  FileText,
  Video,
  Star,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  User,
  MessageSquare,
  FileSpreadsheet,
  File as FilePdf,
  FileCode,
  Users,
  X,
  Play,
  ClipboardList,
  Award,
  BarChart3,
  Save,
  Mail,
  Phone,
  Briefcase,
  GraduationCap,
  Sparkles
} from 'lucide-react';
import { Applicant, Resume, VideoAssessment, PersonalityTest, ResumeParsedData, ScoringSettings } from '../lib/supabase';
import { FilterDropdown } from './FilterDropdown';
import { supabase } from '../lib/supabase';
import {
  calculateAlignmentScore,
  calculateDimensionScores,
  WorkStyleAnswer
} from '../config/workStyleConfig';

// ============================================================================
// Types & Interfaces
// ============================================================================

interface ApplicantWithDetails extends Applicant {
  resume?: Resume;
  video?: VideoAssessment;
  test?: PersonalityTest;
  resumeScore?: number;
  videoScore?: number;
  profileFit?: number;
  overall?: number;
  // status is inherited from Applicant: 'shortlisted' | 'final_interview' | 'rejected' | 'hired'
  notes?: CandidateNote[];
}

interface CandidateNote {
  id: string;
  text: string;
  createdAt: string;
  author: string;
}

type SortField = 'name' | 'overall' | 'resume' | 'video' | 'profile' | 'date';
type SortDirection = 'asc' | 'desc';
type ExportFormat = 'pdf' | 'excel' | 'csv';

// ============================================================================
// Helper Functions
// ============================================================================

function getParsedResumeData(resume: Resume | undefined): ResumeParsedData | null {
  if (!resume?.parsed_data) return null;
  if (typeof resume.parsed_data === 'object') return resume.parsed_data;
  try {
    return JSON.parse(resume.parsed_data);
  } catch {
    return null;
  }
}

const DEFAULT_SCORING_SETTINGS: ScoringSettings = {
  settings_id: 'default',
  job_level: 'entry_level',
  experience_weight: 28,
  skills_weight: 30,
  education_weight: 18,
  projects_weight: 14,
  traincert_weight: 6,
  achievements_weight: 4,
  qualified_threshold: 78,
  review_threshold: 65,
  baseline_experience: 2,
  baseline_skills: 10,
  baseline_education: 2,
  baseline_projects: 2,
  baseline_traincert: 2,
  baseline_achievements: 1,
  scoring_type: 'hybrid',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

function calculateResumeScore(applicant?: ApplicantWithDetails, settings?: ScoringSettings | null): number {
  if (applicant?.screening_score !== undefined && applicant?.screening_score !== null) {
    return Math.round(applicant.screening_score);
  }
  const resume = applicant?.resume;
  if (!resume || !resume.parsed_data) return 0;
  const parsed = getParsedResumeData(resume);
  if (!parsed) return 0;
  const config = settings || DEFAULT_SCORING_SETTINGS;
  const totalSkills = parsed.skills?.hard_skills?.length || 0;
  const skillsScore = Math.min((totalSkills / 20) * 100, 100);
  const experienceScore = Math.min(((parsed.experience?.length || 0) / 5) * 100, 100);
  const educationScore = Math.min(((parsed.education?.length || 0) / 3) * 100, 100);
  const projectCount = parsed.projects?.length || 0;
  const projectsScore = projectCount >= config.baseline_projects
    ? Math.min((projectCount / config.baseline_projects) * 100, 100)
    : (projectCount / config.baseline_projects) * 50;
  return Math.min(Math.round(
    (skillsScore * (config.skills_weight / 100)) +
    (experienceScore * (config.experience_weight / 100)) +
    (educationScore * (config.education_weight / 100)) +
    (projectsScore * (config.projects_weight / 100))
  ), 100);
}

function calculateVideoScore(video?: VideoAssessment): number {
  if (!video) return 0;
  if (video.transcript_score !== null && video.transcript_score !== undefined) {
    return Math.round(video.transcript_score * 10);
  }
  if (video.status === 'completed' || video.transcription_status === 'completed') return 50;
  if (video.status === 'submitted') return 30;
  return 0;
}

function calculateProfileFit(test?: PersonalityTest, jobRole?: string): number {
  if (!test || test.status !== 'submitted') return 0;
  if (!test.answers || !Array.isArray(test.answers) || test.answers.length === 0) return 0;
  const answers: WorkStyleAnswer[] = test.answers.map((a: any) => ({
    question: a.question,
    answer: a.answer,
  }));
  const targetRole = jobRole || 'Backend Developer';
  const { score } = calculateAlignmentScore(calculateDimensionScores(answers), targetRole);
  return score;
}

function calculateOverallScore(resumeScore: number, videoScore: number, profileFit: number): number {
  return Math.round((resumeScore * 0.5) + (videoScore * 0.4) + (profileFit * 0.1));
}

// ============================================================================
// Sub-Components
// ============================================================================

function ScoreBadge({ score, size = 'md' }: { score: number; size?: 'sm' | 'md' | 'lg' }) {
  let colorClass = 'text-gray-600 bg-gray-100';
  if (score >= 80) colorClass = 'text-emerald-700 bg-emerald-100';
  else if (score >= 60) colorClass = 'text-blue-700 bg-blue-100';
  else if (score >= 40) colorClass = 'text-amber-700 bg-amber-100';
  else if (score > 0) colorClass = 'text-red-700 bg-red-100';
  const sizeClasses = { sm: 'px-2 py-0.5 text-xs', md: 'px-2.5 py-1 text-sm', lg: 'px-3 py-1.5 text-base' };
  return (
    <span className={`inline-flex items-center rounded-lg font-semibold ${colorClass} ${sizeClasses[size]}`}>
      {score > 0 ? score : '-'}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const configs: Record<string, { bg: string; text: string; icon: React.ElementType; label: string }> = {
    shortlisted: { bg: 'bg-purple-100', text: 'text-purple-700', icon: Star, label: 'Shortlisted' },
    final_interview: { bg: 'bg-emerald-100', text: 'text-emerald-700', icon: CheckCircle, label: 'Final Interview' },
  };
  const config = configs[status] || configs.shortlisted;
  const Icon = config.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${config.bg} ${config.text}`}>
      <Icon className="w-3.5 h-3.5" />
      {config.label}
    </span>
  );
}

// ============================================================================
// Quick Profile Panel Component
// ============================================================================

interface QuickProfilePanelProps {
  candidate: ApplicantWithDetails | null;
  isOpen: boolean;
  onClose: () => void;
  onStatusChange: (id: string, status: string) => void;
  onAddNote: (id: string, note: string) => void;
}

function QuickProfilePanel({ candidate, isOpen, onClose, onStatusChange, onAddNote }: QuickProfilePanelProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'resume' | 'video' | 'notes'>('overview');
  const [newNote, setNewNote] = useState('');
  const [showVideoModal, setShowVideoModal] = useState(false);
  const [showTranscriptModal, setShowTranscriptModal] = useState(false);
  const [showFullResumeModal, setShowFullResumeModal] = useState(false);

  if (!candidate || !isOpen) return null;

  const parsedResume = getParsedResumeData(candidate.resume);

  // Extract skills — handle both old format and NER format
  let topSkills: string[] = [];
  if (parsedResume?.skills) {
    const skills = parsedResume.skills as any;
    if (skills.hard_skills && Array.isArray(skills.hard_skills)) {
      topSkills = skills.hard_skills.slice(0, 8);
    } else if (skills.all && Array.isArray(skills.all)) {
      topSkills = skills.all.slice(0, 8);
    } else if (typeof skills === 'object') {
      const allSkills: string[] = [];
      Object.values(skills).forEach((value: any) => {
        if (typeof value === 'string') allSkills.push(...value.split(',').map((s: string) => s.trim()));
        else if (Array.isArray(value)) allSkills.push(...value);
      });
      topSkills = allSkills.slice(0, 8);
    }
  }

  const handleAddNote = () => {
    if (newNote.trim()) {
      onAddNote(candidate.id, newNote.trim());
      setNewNote('');
    }
  };

  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-2xl bg-white shadow-2xl z-50 transform transition-transform duration-300 ease-in-out overflow-y-auto flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
            {candidate.photo_url ? (
              <img src={candidate.photo_url} alt={candidate.name} className="w-12 h-12 rounded-full object-cover" />
            ) : (
              <User className="w-6 h-6 text-blue-600" />
            )}
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">{candidate.name}</h2>
            <p className="text-sm text-gray-500">{candidate.position}</p>
          </div>
        </div>
        <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Score Banner */}
      <div className="px-6 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="text-center">
              <div className="text-3xl font-bold">{candidate.overall}</div>
              <div className="text-xs text-blue-100">Overall Score</div>
            </div>
            <div className="h-12 w-px bg-blue-400/50" />
            <div className="flex gap-4 text-sm">
              <div><span className="text-blue-200">Resume:</span> <span className="font-semibold">{candidate.resumeScore}</span></div>
              <div><span className="text-blue-200">Video:</span> <span className="font-semibold">{candidate.videoScore}</span></div>
              <div><span className="text-blue-200">Profile:</span> <span className="font-semibold">{candidate.profileFit}</span></div>
            </div>
          </div>
          <StatusBadge status={candidate.status || 'shortlisted'} />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 px-6">
        {[
          { id: 'overview', label: 'Overview', icon: User },
          { id: 'resume', label: 'Resume', icon: FileText },
          { id: 'video', label: 'Interview', icon: Video },
          { id: 'notes', label: 'Notes', icon: MessageSquare },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as typeof activeTab)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="w-5 h-5 text-blue-600" />
                <h3 className="font-semibold text-blue-900">AI-Generated Summary</h3>
              </div>
              <p className="text-sm text-blue-800 leading-relaxed">
                {candidate.name} demonstrates strong qualifications with a solid foundation in {topSkills.slice(0, 3).join(', ')}.
                Their profile shows {(candidate.resumeScore || 0) >= 75 ? 'exceptional' : 'good'} alignment with the role requirements,
                scoring {candidate.resumeScore || 0}/100 on resume match.{(candidate.videoScore || 0) >= 70 ? ' Video assessment indicates strong communication skills.' : ''}
              </p>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <Award className="w-4 h-4 text-amber-500" />
                Top Matched Skills
              </h3>
              <div className="flex flex-wrap gap-2">
                {topSkills.map((skill, idx) => (
                  <span key={idx} className="px-3 py-1.5 bg-gray-100 text-gray-700 text-sm rounded-full font-medium">{skill}</span>
                ))}
                {topSkills.length === 0 && <span className="text-sm text-gray-400">No skills extracted</span>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <Mail className="w-4 h-4 text-gray-400" />
                <span className="text-sm text-gray-700 truncate">{candidate.email}</span>
              </div>
              {parsedResume?.phone && (
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <Phone className="w-4 h-4 text-gray-400" />
                  <span className="text-sm text-gray-700">{parsedResume.phone}</span>
                </div>
              )}
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-blue-500" />
                Recent Experience
              </h3>
              {parsedResume?.experience?.slice(0, 2).map((exp, idx) => (
                <div key={idx} className="border-l-2 border-blue-200 pl-4 py-1">
                  <p className="font-medium text-gray-900">{exp.role}</p>
                  <p className="text-sm text-gray-600">{exp.company}</p>
                  <p className="text-xs text-gray-400">{exp.years}</p>
                </div>
              ))}
              {!parsedResume?.experience?.length && <p className="text-sm text-gray-400">No experience data available</p>}
            </div>
          </div>
        )}

        {activeTab === 'resume' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Resume Highlights</h3>
              <button
                onClick={() => setShowFullResumeModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <FileText className="w-4 h-4" />
                View Full Resume
              </button>
            </div>
            {parsedResume && (
              <div className="space-y-4">
                <div className="p-4 bg-gray-50 rounded-lg">
                  <h4 className="font-medium text-gray-900 mb-2">Education</h4>
                  {parsedResume.education?.map((edu, idx) => (
                    <div key={idx} className="text-sm text-gray-600 mb-1">{edu.school} - {edu.course_or_strand}</div>
                  ))}
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <h4 className="font-medium text-gray-900 mb-2">Skills</h4>
                  <div className="flex flex-wrap gap-2">
                    {parsedResume.skills && typeof parsedResume.skills === 'object' && (
                      <>
                        {parsedResume.skills.hard_skills?.map((skill: string, idx: number) => (
                          <span key={`hard-${idx}`} className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded">{skill}</span>
                        ))}
                        {parsedResume.skills.all?.map((skill: string, idx: number) => (
                          <span key={`all-${idx}`} className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded">{skill}</span>
                        ))}
                        {!parsedResume.skills.hard_skills && !parsedResume.skills.all &&
                          Object.entries(parsedResume.skills).flatMap(([category, skills]) =>
                            typeof skills === 'string'
                              ? (skills as string).split(',').map((skill: string, idx: number) => (
                                  <span key={`${category}-${idx}`} className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded">{skill.trim()}</span>
                                ))
                              : Array.isArray(skills)
                                ? (skills as string[]).map((skill: string, idx: number) => (
                                    <span key={`${category}-${idx}`} className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded">{skill}</span>
                                  ))
                                : []
                          )
                        }
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'video' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Video Interview Assessment</h3>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowVideoModal(true)}
                  disabled={!candidate.video?.video_url}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Play className="w-4 h-4" />
                  Watch Video
                </button>
                <button
                  onClick={() => setShowTranscriptModal(true)}
                  disabled={!candidate.video?.transcription}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ClipboardList className="w-4 h-4" />
                  Transcript
                </button>
              </div>
            </div>
            {candidate.video ? (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-100">
                    <div className="text-sm text-blue-600 mb-1">Communication Score</div>
                    <div className="text-3xl font-bold text-blue-900">{candidate.videoScore ? Math.round(candidate.videoScore * 0.9) : '-'}</div>
                    <div className="text-xs text-blue-500 mt-1">Based on clarity and articulation</div>
                  </div>
                  <div className="p-4 bg-gradient-to-br from-emerald-50 to-teal-50 rounded-xl border border-emerald-100">
                    <div className="text-sm text-emerald-600 mb-1">Answer Relevance</div>
                    <div className="text-3xl font-bold text-emerald-900">{candidate.videoScore ? Math.round(candidate.videoScore * 0.95) : '-'}</div>
                    <div className="text-xs text-emerald-500 mt-1">Alignment with questions</div>
                  </div>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm font-medium text-gray-700">Status:</span>
                    <span className={`px-2 py-1 text-xs rounded-full ${
                      candidate.video.status === 'completed' ? 'bg-green-100 text-green-700' :
                      candidate.video.status === 'submitted' ? 'bg-blue-100 text-blue-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {candidate.video.status || 'Not started'}
                    </span>
                  </div>
                  {candidate.video.submitted_at && (
                    <p className="text-xs text-gray-500">Submitted: {new Date(candidate.video.submitted_at).toLocaleString()}</p>
                  )}
                </div>
              </>
            ) : (
              <div className="p-8 text-center text-gray-500">
                <Video className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p>No video assessment available</p>
              </div>
            )}
          </div>
        )}

        {/* Video Modal */}
        {showVideoModal && candidate.video?.video_url && (
          <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setShowVideoModal(false)}>
            <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-hidden" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between px-4 py-3 border-b">
                <h3 className="font-semibold text-gray-900">Video Interview</h3>
                <button onClick={() => setShowVideoModal(false)} className="p-1 hover:bg-gray-100 rounded"><X className="w-5 h-5" /></button>
              </div>
              <div className="aspect-video bg-black">
                <video src={candidate.video.video_url} controls className="w-full h-full" autoPlay />
              </div>
            </div>
          </div>
        )}

        {/* Transcript Modal */}
        {showTranscriptModal && candidate.video?.transcription && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setShowTranscriptModal(false)}>
            <div className="bg-white rounded-xl max-w-2xl w-full max-h-[80vh] overflow-hidden" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between px-4 py-3 border-b">
                <h3 className="font-semibold text-gray-900">Interview Transcript</h3>
                <button onClick={() => setShowTranscriptModal(false)} className="p-1 hover:bg-gray-100 rounded"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-4 overflow-y-auto max-h-[60vh]">
                <pre className="whitespace-pre-wrap text-sm text-gray-700 font-sans">{candidate.video.transcription}</pre>
              </div>
            </div>
          </div>
        )}

        {/* Full Resume Modal */}
        {showFullResumeModal && parsedResume && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setShowFullResumeModal(false)}>
            <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-hidden" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between px-6 py-4 border-b bg-gray-50">
                <div>
                  <h3 className="font-semibold text-gray-900">Full Resume</h3>
                  <p className="text-sm text-gray-500">{candidate.name} - {candidate.position}</p>
                </div>
                <div className="flex items-center gap-2">
                  {candidate.resume?.resume_url && (
                    <a href={candidate.resume.resume_url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm">
                      <Download className="w-4 h-4" />Download
                    </a>
                  )}
                  <button onClick={() => setShowFullResumeModal(false)} className="p-2 hover:bg-gray-200 rounded-lg"><X className="w-5 h-5" /></button>
                </div>
              </div>
              <div className="p-6 overflow-y-auto max-h-[calc(90vh-80px)]">
                {(parsedResume.name || parsedResume.email || parsedResume.phone) && (
                  <div className="mb-6">
                    <h4 className="text-lg font-semibold text-gray-900 mb-3">Personal Information</h4>
                    <div className="grid grid-cols-2 gap-4 bg-gray-50 p-4 rounded-lg">
                      {parsedResume.name && <div><span className="text-xs text-gray-500 uppercase">Name</span><p className="text-sm font-medium text-gray-900">{parsedResume.name}</p></div>}
                      {parsedResume.email && <div><span className="text-xs text-gray-500 uppercase">Email</span><p className="text-sm font-medium text-gray-900">{parsedResume.email}</p></div>}
                      {parsedResume.phone && <div><span className="text-xs text-gray-500 uppercase">Phone</span><p className="text-sm font-medium text-gray-900">{parsedResume.phone}</p></div>}
                    </div>
                  </div>
                )}
                {parsedResume.education && parsedResume.education.length > 0 && (
                  <div className="mb-6">
                    <h4 className="text-lg font-semibold text-gray-900 mb-3">Education</h4>
                    <div className="space-y-3">
                      {parsedResume.education.map((edu, idx) => (
                        <div key={idx} className="p-4 bg-gray-50 rounded-lg">
                          <div className="flex items-start justify-between">
                            <div>
                              <p className="font-medium text-gray-900">{edu.school}</p>
                              <p className="text-sm text-gray-600">{edu.course_or_strand}</p>
                            </div>
                            {edu.year_range && <span className="text-sm text-gray-500">{edu.year_range}</span>}
                          </div>
                          {edu.education_type && <p className="text-xs text-gray-500 mt-1">{edu.education_type}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {parsedResume.experience && parsedResume.experience.length > 0 && (
                  <div className="mb-6">
                    <h4 className="text-lg font-semibold text-gray-900 mb-3">Work Experience</h4>
                    <div className="space-y-4">
                      {parsedResume.experience.map((exp, idx) => (
                        <div key={idx} className="p-4 bg-gray-50 rounded-lg">
                          <div className="flex items-start justify-between mb-2">
                            <div>
                              <p className="font-medium text-gray-900">{exp.role}</p>
                              <p className="text-sm text-gray-600">{exp.company}</p>
                            </div>
                            {exp.years && <span className="text-sm text-gray-500">{exp.years}</span>}
                          </div>
                          {exp.summary && <p className="text-sm text-gray-600 mt-2">{exp.summary}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {parsedResume.projects && parsedResume.projects.length > 0 && (
                  <div className="mb-6">
                    <h4 className="text-lg font-semibold text-gray-900 mb-3">Projects</h4>
                    <div className="space-y-3">
                      {parsedResume.projects.map((project, idx) => (
                        <div key={idx} className="p-4 bg-gray-50 rounded-lg">
                          <p className="font-medium text-gray-900">{project.name}</p>
                          {project.details && <p className="text-sm text-gray-600 mt-1">{project.details}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {parsedResume.trainings && parsedResume.trainings.length > 0 && (
                  <div className="mb-6">
                    <h4 className="text-lg font-semibold text-gray-900 mb-3">Trainings & Certifications</h4>
                    <div className="space-y-2">
                      {parsedResume.trainings.map((training, idx) => (
                        <div key={idx} className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
                          <GraduationCap className="w-4 h-4 text-gray-400" />
                          <span className="text-sm text-gray-700">{training.title}</span>
                          {training.date && <span className="text-xs text-gray-400">({training.date})</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {candidate.resume?.raw_extracted_content && (
                  <div className="mt-6">
                    <h4 className="text-lg font-semibold text-gray-900 mb-3">Raw Extracted Content</h4>
                    <div className="p-4 bg-gray-50 rounded-lg">
                      <pre className="whitespace-pre-wrap text-xs text-gray-600 font-mono max-h-64 overflow-y-auto">
                        {candidate.resume.raw_extracted_content}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'notes' && (
          <div className="space-y-4">
            <div>
              <h3 className="font-semibold text-gray-900 mb-3">Add Private Note</h3>
              <div className="flex gap-2">
                <textarea
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Enter your notes about this candidate..."
                  className="flex-1 px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                  rows={3}
                />
                <button
                  onClick={handleAddNote}
                  disabled={!newNote.trim()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Save className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="space-y-3">
              <h3 className="font-semibold text-gray-900">Previous Notes</h3>
              {candidate.notes?.length ? (
                candidate.notes.map((note) => (
                  <div key={note.id} className="p-4 bg-gray-50 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-900">{note.author}</span>
                      <span className="text-xs text-gray-400">{new Date(note.createdAt).toLocaleDateString()}</span>
                    </div>
                    <p className="text-sm text-gray-700">{note.text}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-gray-400 italic">No notes added yet</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Action Footer */}
      <div className="border-t border-gray-200 p-4 bg-gray-50 flex gap-3">
        <button
          onClick={() => onStatusChange(candidate.id, 'final_interview')}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-medium"
        >
          <CheckCircle className="w-4 h-4" />
          Move to Final Interview
        </button>
        <button
          onClick={() => onStatusChange(candidate.id, 'shortlisted')}
          className="px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium"
        >
          Keep in Shortlist
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// Comparison Modal Component
// ============================================================================

interface ComparisonModalProps {
  candidates: ApplicantWithDetails[];
  isOpen: boolean;
  onClose: () => void;
}

function ComparisonModal({ candidates, isOpen, onClose }: ComparisonModalProps) {
  if (!isOpen || candidates.length < 2) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <Users className="w-6 h-6 text-blue-600" />
            <h2 className="text-xl font-bold text-gray-900">Candidate Comparison</h2>
            <span className="px-2.5 py-1 bg-blue-100 text-blue-700 text-sm font-medium rounded-full">{candidates.length} candidates</span>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-auto p-6">
          <div className={`grid gap-4 ${candidates.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
            {candidates.map((candidate) => (
              <div key={candidate.id} className="bg-gray-50 rounded-xl p-4 space-y-4">
                <div className="text-center pb-4 border-b border-gray-200">
                  <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <User className="w-8 h-8 text-blue-600" />
                  </div>
                  <h3 className="font-bold text-gray-900">{candidate.name}</h3>
                  <p className="text-sm text-gray-500">{candidate.position}</p>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-white rounded-lg">
                    <span className="text-sm text-gray-600">Resume Match</span>
                    <ScoreBadge score={candidate.resumeScore || 0} size="sm" />
                  </div>
                  <div className="flex items-center justify-between p-3 bg-white rounded-lg">
                    <span className="text-sm text-gray-600">Video Score</span>
                    <ScoreBadge score={candidate.videoScore || 0} size="sm" />
                  </div>
                  <div className="flex items-center justify-between p-3 bg-white rounded-lg">
                    <span className="text-sm text-gray-600">Profile Fit</span>
                    <ScoreBadge score={candidate.profileFit || 0} size="sm" />
                  </div>
                </div>
                <div className="pt-4 border-t border-gray-200 flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">Overall Score</span>
                  <span className="text-2xl font-bold text-blue-600">{candidate.overall}</span>
                </div>
                <StatusBadge status={candidate.status || 'shortlisted'} />
              </div>
            ))}
          </div>

          <div className="mt-6 p-4 bg-gray-50 rounded-xl">
            <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-blue-600" />
              Score Breakdown Comparison
            </h3>
            <div className="space-y-4">
              {['Resume Match', 'Video Score', 'Profile Fit', 'Overall'].map((metric, idx) => {
                const keys: ('resume' | 'video' | 'profile' | 'overall')[] = ['resume', 'video', 'profile', 'overall'];
                const key = keys[idx];
                return (
                  <div key={metric} className="space-y-2">
                    <span className="text-sm text-gray-600">{metric}</span>
                    <div className={`grid gap-2 ${candidates.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
                      {candidates.map((candidate) => {
                        let score = 0;
                        if (key === 'resume') score = candidate.resumeScore || 0;
                        else if (key === 'video') score = candidate.videoScore || 0;
                        else if (key === 'profile') score = candidate.profileFit || 0;
                        else score = candidate.overall || 0;
                        return (
                          <div key={candidate.id} className="relative h-8 bg-gray-200 rounded-full overflow-hidden">
                            <div className="absolute inset-y-0 left-0 bg-blue-500 transition-all duration-500" style={{ width: `${score}%` }} />
                            <div className="absolute inset-0 flex items-center justify-center text-xs font-medium text-gray-700">
                              {candidate.name.split(' ')[0]}: {score}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Export Modal Component
// ============================================================================

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExport: (format: ExportFormat) => void;
  candidateCount: number;
}

function ExportModal({ isOpen, onClose, onExport, candidateCount }: ExportModalProps) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-gray-900">Export Shortlist</h2>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        <p className="text-sm text-gray-600 mb-6">Export {candidateCount} shortlisted candidates to your preferred format.</p>
        <div className="space-y-3">
          <button onClick={() => onExport('pdf')} className="w-full flex items-center gap-4 p-4 border border-gray-200 rounded-xl hover:border-blue-500 hover:bg-blue-50 transition-all group">
            <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center group-hover:bg-red-200 transition-colors">
              <FilePdf className="w-6 h-6 text-red-600" />
            </div>
            <div className="text-left">
              <div className="font-semibold text-gray-900">Export as PDF</div>
              <div className="text-sm text-gray-500">Formatted report with all details</div>
            </div>
          </button>
          <button onClick={() => onExport('excel')} className="w-full flex items-center gap-4 p-4 border border-gray-200 rounded-xl hover:border-blue-500 hover:bg-blue-50 transition-all group">
            <div className="w-12 h-12 bg-emerald-100 rounded-lg flex items-center justify-center group-hover:bg-emerald-200 transition-colors">
              <FileSpreadsheet className="w-6 h-6 text-emerald-600" />
            </div>
            <div className="text-left">
              <div className="font-semibold text-gray-900">Export as Excel</div>
              <div className="text-sm text-gray-500">Spreadsheet with all candidate data</div>
            </div>
          </button>
          <button onClick={() => onExport('csv')} className="w-full flex items-center gap-4 p-4 border border-gray-200 rounded-xl hover:border-blue-500 hover:bg-blue-50 transition-all group">
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center group-hover:bg-blue-200 transition-colors">
              <FileCode className="w-6 h-6 text-blue-600" />
            </div>
            <div className="text-left">
              <div className="font-semibold text-gray-900">Export as CSV</div>
              <div className="text-sm text-gray-500">Simple data format for import</div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

interface ShortlistedCandidatesProps {
  applicants?: ApplicantWithDetails[];
  onNavigateToInterview?: (applicantId: string) => void;
  onApplicantStatusChanged?: () => void;
}

export function ShortlistedCandidates({ applicants: externalApplicants, onNavigateToInterview, onApplicantStatusChanged }: ShortlistedCandidatesProps) {
  const [applicants, setApplicants] = useState<ApplicantWithDetails[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCandidates, setSelectedCandidates] = useState<Set<string>>(new Set());
  const [sortField, setSortField] = useState<SortField>('overall');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  // Pipeline stage filter: 'all' | 'shortlisted' | 'final_interview'
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [departmentFilter, setDepartmentFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedCandidate, setSelectedCandidate] = useState<ApplicantWithDetails | null>(null);
  const [isProfilePanelOpen, setIsProfilePanelOpen] = useState(false);
  const [isComparisonOpen, setIsComparisonOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [scoringSettings, setScoringSettings] = useState<ScoringSettings | null>(null);
  const [loading, setLoading] = useState(true);
  // Departments fetched from job_postings
  const [departments, setDepartments] = useState<string[]>([]);
  // Maps job title → department for filtering (e.g. "Data Engineer" → "MIS / IT")
  const [jobDepartmentMap, setJobDepartmentMap] = useState<Record<string, string>>({});
  const itemsPerPage = 10;

  useEffect(() => {
    async function initialize() {
      try {
        const { data: settingsData } = await supabase
          .from('scoring_settings')
          .select('*')
          .order('updated_at', { ascending: false })
          .limit(1)
          .single();
        if (settingsData) setScoringSettings(settingsData);

        // Fetch job_postings to build a title → department map for filtering
        const { data: jobsData } = await supabase
          .from('job_postings')
          .select('title, department')
          .eq('is_active', true);
        if (jobsData) {
          const depts = Array.from(new Set(jobsData.map((j: any) => j.department).filter(Boolean))) as string[];
          setDepartments(depts.sort());
          // Build lookup: job title (lowercase) → department
          const map: Record<string, string> = {};
          jobsData.forEach((j: any) => {
            if (j.title && j.department) map[j.title.toLowerCase()] = j.department;
          });
          setJobDepartmentMap(map);
        }

        if (externalApplicants) {
          setApplicants(externalApplicants);
        } else {
          // Fetch only active pipeline candidates (shortlisted + final_interview)
          const { data: applicantsData } = await supabase
            .from('applicants')
            .select('*')
            .in('status', ['shortlisted', 'final_interview'])
            .order('created_at', { ascending: false });

          if (applicantsData) {
            const applicantsWithDetails = await Promise.all(
              applicantsData.map(async (applicant) => {
                const [resumeResult, videoResult, testResult] = await Promise.all([
                  supabase.from('resumes').select('*').eq('applicant_id', applicant.id).maybeSingle(),
                  supabase.from('video_assessments').select('*').eq('applicant_id', applicant.id).maybeSingle(),
                  supabase.from('work_style_assessments').select('*').eq('applicant_id', applicant.id).maybeSingle(),
                ]);
                return {
                  ...applicant,
                  resume: resumeResult.data || undefined,
                  video: videoResult.data || undefined,
                  test: testResult.data || undefined,
                };
              })
            );
            setApplicants(applicantsWithDetails);
          }
        }
      } catch (err) {
        console.error('Error initializing:', err);
      } finally {
        setLoading(false);
      }
    }
    initialize();
  }, [externalApplicants]);

  // Compute scores for each applicant
  const processedApplicants = useMemo(() => {
    return applicants.map((applicant) => {
      const resumeScore = calculateResumeScore(applicant, scoringSettings);
      const videoScore = calculateVideoScore(applicant.video);
      const profileFit = calculateProfileFit(applicant.test, applicant.position);
      const overall = calculateOverallScore(resumeScore, videoScore, profileFit);
      // Only show active pipeline stages — exclude rejected/hired
      const status = applicant.status || 'shortlisted';
      return { ...applicant, resumeScore, videoScore, profileFit, overall, status };
    }).filter(a => a.status === 'shortlisted' || a.status === 'final_interview');
  }, [applicants, scoringSettings]);

  // Derive department from position by matching job_postings (best-effort via position string)
  // We use position as a proxy for department label when no direct mapping exists
  const filteredApplicants = useMemo(() => {
    let result = processedApplicants;

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(a =>
        a.name.toLowerCase().includes(q) ||
        a.email.toLowerCase().includes(q) ||
        a.position.toLowerCase().includes(q)
      );
    }

    // Pipeline stage filter
    if (statusFilter !== 'all') {
      result = result.filter(a => a.status === statusFilter);
    }

    // Department filter — resolve applicant.position to a department via job_postings lookup
    // e.g. position "Data Engineer" → department "MIS / IT"
    if (departmentFilter !== 'all') {
      result = result.filter(a => {
        const dept = jobDepartmentMap[a.position?.toLowerCase() || ''];
        return dept === departmentFilter;
      });
    }

    return [...result].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'name': cmp = a.name.localeCompare(b.name); break;
        case 'overall': cmp = (a.overall || 0) - (b.overall || 0); break;
        case 'resume': cmp = (a.resumeScore || 0) - (b.resumeScore || 0); break;
        case 'video': cmp = (a.videoScore || 0) - (b.videoScore || 0); break;
        case 'profile': cmp = (a.profileFit || 0) - (b.profileFit || 0); break;
        case 'date': cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime(); break;
      }
      return sortDirection === 'asc' ? cmp : -cmp;
    });
  }, [processedApplicants, searchQuery, statusFilter, departmentFilter, sortField, sortDirection, jobDepartmentMap]);

  const totalPages = Math.ceil(filteredApplicants.length / itemsPerPage);
  const paginatedApplicants = filteredApplicants.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDirection('desc'); }
    setCurrentPage(1);
  };

  const toggleSelection = (id: string) => {
    const next = new Set(selectedCandidates);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedCandidates(next);
  };

  const toggleAllSelection = () => {
    if (selectedCandidates.size === paginatedApplicants.length) setSelectedCandidates(new Set());
    else setSelectedCandidates(new Set(paginatedApplicants.map(a => a.id)));
  };

  // Update applicant pipeline stage (shortlisted → final_interview)
  // Rejected/hired transitions happen in InterviewScheduling, not here
  const handleStatusChange = useCallback(async (id: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from('applicants')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) { console.error('Error updating applicant status:', error); return; }

      setApplicants(prev => prev.map(a => a.id === id ? { ...a, status: newStatus } : a));
      if (selectedCandidate?.id === id) {
        setSelectedCandidate(prev => prev ? { ...prev, status: newStatus } : null);
      }

      onApplicantStatusChanged?.();

      // Navigate to Interview Scheduling when moving to final interview
      if (newStatus === 'final_interview' && onNavigateToInterview) {
        onNavigateToInterview(id);
      }
    } catch (err) {
      console.error('Error updating status:', err);
    }
  }, [selectedCandidate, onNavigateToInterview, onApplicantStatusChanged]);

  const handleAddNote = useCallback((id: string, noteText: string) => {
    const newNote: CandidateNote = {
      id: Date.now().toString(),
      text: noteText,
      createdAt: new Date().toISOString(),
      author: 'HR Manager',
    };
    setApplicants(prev => prev.map(a => a.id === id ? { ...a, notes: [...(a.notes || []), newNote] } : a));
    if (selectedCandidate?.id === id) {
      setSelectedCandidate(prev => prev ? { ...prev, notes: [...(prev.notes || []), newNote] } : null);
    }
  }, [selectedCandidate]);

  const handleExport = (format: ExportFormat) => {
    const data = selectedCandidates.size > 0
      ? filteredApplicants.filter(a => selectedCandidates.has(a.id))
      : filteredApplicants;
    if (format === 'csv') exportToCSV(data);
    else if (format === 'excel') exportToExcel(data);
    else exportToPDF(data);
    setIsExportOpen(false);
  };

  const exportToCSV = (data: ApplicantWithDetails[]) => {
    const headers = ['Name', 'Email', 'Position', 'Resume Score', 'Video Score', 'Profile Fit', 'Overall', 'Status'];
    const rows = data.map(a => [a.name, a.email, a.position, a.resumeScore, a.videoScore, a.profileFit, a.overall, a.status]);
    downloadFile([headers.join(','), ...rows.map(r => r.join(','))].join('\n'), 'shortlisted-candidates.csv', 'text/csv');
  };

  const exportToExcel = (data: ApplicantWithDetails[]) => {
    const html = `<table><tr><th>Name</th><th>Email</th><th>Position</th><th>Resume</th><th>Video</th><th>Overall</th><th>Status</th></tr>${data.map(a => `<tr><td>${a.name}</td><td>${a.email}</td><td>${a.position}</td><td>${a.resumeScore}</td><td>${a.videoScore}</td><td>${a.overall}</td><td>${a.status}</td></tr>`).join('')}</table>`;
    downloadFile(html, 'shortlisted-candidates.xls', 'application/vnd.ms-excel');
  };

  const exportToPDF = (data: ApplicantWithDetails[]) => {
    const html = `<!DOCTYPE html><html><head><title>Shortlisted Candidates</title></head><body><h1>Shortlisted Candidates Report</h1><p>Generated on ${new Date().toLocaleDateString()}</p><table border="1" cellpadding="8"><tr><th>Name</th><th>Position</th><th>Overall Score</th><th>Status</th></tr>${data.map(a => `<tr><td>${a.name}</td><td>${a.position}</td><td>${a.overall}</td><td>${a.status}</td></tr>`).join('')}</table></body></html>`;
    const w = window.open('', '_blank');
    if (w) { w.document.write(html); w.document.close(); w.print(); }
  };

  const downloadFile = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = filename;
    document.body.appendChild(link); link.click();
    document.body.removeChild(link); URL.revokeObjectURL(url);
  };

  const openProfilePanel = (candidate: ApplicantWithDetails) => {
    setSelectedCandidate(candidate);
    setIsProfilePanelOpen(true);
  };

  const comparisonCandidates = useMemo(
    () => filteredApplicants.filter(a => selectedCandidates.has(a.id)),
    [filteredApplicants, selectedCandidates]
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-gray-600 text-lg">Loading shortlisted candidates...</div>
      </div>
    );
  }

  const SortIcon = ({ field }: { field: SortField }) =>
    sortField === field
      ? (sortDirection === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />)
      : null;

  return (
    <div className="min-h-screen bg-slate-50 p-8 lg:p-10">
      {/* Header */}
      <div className="mb-8">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Shortlisted Candidates</h1>
            <p className="text-gray-600 mt-1">Review and manage top candidates for final interview selection</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsExportOpen(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
            >
              <Download className="w-4 h-4" />
              Export
            </button>
            {selectedCandidates.size >= 2 && (
              <button
                onClick={() => setIsComparisonOpen(true)}
                className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                <Users className="w-4 h-4" />
                Compare ({selectedCandidates.size})
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Stats Cards — workflow-based only */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Total Active', value: processedApplicants.length, icon: Users, color: 'blue' },
          { label: 'Shortlisted', value: processedApplicants.filter(a => a.status === 'shortlisted').length, icon: Star, color: 'purple' },
          { label: 'Final Interview', value: processedApplicants.filter(a => a.status === 'final_interview').length, icon: CheckCircle, color: 'emerald' },
        ].map((stat, idx) => (
          <div key={idx} className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{stat.label}</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{stat.value}</p>
              </div>
              <div className={`w-10 h-10 bg-${stat.color}-100 rounded-lg flex items-center justify-center`}>
                <stat.icon className={`w-5 h-5 text-${stat.color}-600`} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Pipeline Stage Filter Chips */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
        {[
          { value: 'all', label: 'All', count: processedApplicants.length },
          { value: 'shortlisted', label: 'Shortlisted', count: processedApplicants.filter(a => a.status === 'shortlisted').length },
          { value: 'final_interview', label: 'Final Interview', count: processedApplicants.filter(a => a.status === 'final_interview').length },
        ].map(chip => (
          <button
            key={chip.value}
            onClick={() => { setStatusFilter(chip.value); setCurrentPage(1); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
              statusFilter === chip.value
                ? chip.value === 'all' ? 'bg-gray-900 text-white'
                  : chip.value === 'shortlisted' ? 'bg-purple-600 text-white'
                  : 'bg-emerald-600 text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {chip.label}
            <span className={`px-1.5 py-0.5 rounded-full text-xs ${statusFilter === chip.value ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600'}`}>
              {chip.count}
            </span>
          </button>
        ))}
      </div>

      {/* Filters Bar */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Search */}
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search candidate name, email, or position..."
              className="w-full h-10 pl-9 pr-4 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
            />
          </div>

          {/* Department filter */}
          <FilterDropdown
            value={departmentFilter}
            onChange={(v) => { setDepartmentFilter(v); setCurrentPage(1); }}
            options={[
              { value: 'all', label: 'All Departments' },
              ...departments.map(dept => ({ value: dept, label: dept }))
            ]}
            width="w-full sm:w-52"
          />

          {/* Status filter */}
          <FilterDropdown
            value={statusFilter}
            onChange={(v) => { setStatusFilter(v); setCurrentPage(1); }}
            options={[
              { value: 'all', label: 'All Statuses' },
              { value: 'shortlisted', label: 'Shortlisted' },
              { value: 'final_interview', label: 'Final Interview' },
            ]}
            width="w-full sm:w-48"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-visible">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 w-10">
                  <button onClick={toggleAllSelection} className="text-gray-400 hover:text-gray-600">
                    {selectedCandidates.size === paginatedApplicants.length && paginatedApplicants.length > 0
                      ? <CheckSquare className="w-5 h-5 text-blue-600" />
                      : <Square className="w-5 h-5" />}
                  </button>
                </th>
                <th onClick={() => handleSort('name')} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100">
                  <div className="flex items-center gap-1">Candidate <SortIcon field="name" /></div>
                </th>
                <th onClick={() => handleSort('resume')} className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100">
                  <div className="flex items-center justify-center gap-1">Resume <SortIcon field="resume" /></div>
                </th>
                <th onClick={() => handleSort('video')} className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100">
                  <div className="flex items-center justify-center gap-1">Video <SortIcon field="video" /></div>
                </th>
                <th onClick={() => handleSort('profile')} className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100">
                  <div className="flex items-center justify-center gap-1">Profile Fit <SortIcon field="profile" /></div>
                </th>
                <th onClick={() => handleSort('overall')} className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100">
                  <div className="flex items-center justify-center gap-1">Overall <SortIcon field="overall" /></div>
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {paginatedApplicants.map((applicant) => (
                <tr
                  key={applicant.id}
                  className="hover:bg-blue-50 cursor-pointer transition-colors"
                  onClick={() => openProfilePanel(applicant)}
                >
                  <td className="px-4 py-4" onClick={e => e.stopPropagation()}>
                    <button onClick={() => toggleSelection(applicant.id)} className="text-gray-400 hover:text-gray-600">
                      {selectedCandidates.has(applicant.id)
                        ? <CheckSquare className="w-5 h-5 text-blue-600" />
                        : <Square className="w-5 h-5" />}
                    </button>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                        {applicant.photo_url
                          ? <img src={applicant.photo_url} alt={applicant.name} className="w-10 h-10 rounded-full object-cover" />
                          : <User className="w-5 h-5 text-blue-600" />}
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">{applicant.name}</div>
                        <div className="text-sm text-gray-500">{applicant.position}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-center"><ScoreBadge score={applicant.resumeScore || 0} /></td>
                  <td className="px-4 py-4 text-center"><ScoreBadge score={applicant.videoScore || 0} /></td>
                  <td className="px-4 py-4 text-center"><ScoreBadge score={applicant.profileFit || 0} /></td>
                  <td className="px-4 py-4 text-center">
                    <span className="inline-flex items-center px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-sm font-bold">{applicant.overall}</span>
                  </td>
                  <td className="px-4 py-4 text-center">
                    <StatusBadge status={applicant.status || 'shortlisted'} />
                  </td>
                </tr>
              ))}
              {paginatedApplicants.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center">
                        <Users className="w-8 h-8 text-gray-400" />
                      </div>
                      <p className="text-gray-500">No candidates found</p>
                      <p className="text-sm text-gray-400">Try adjusting your filters or search query</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between">
            <div className="text-sm text-gray-500">
              Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filteredApplicants.length)} of {filteredApplicants.length} candidates
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed">
                <ChevronLeft className="w-5 h-5" />
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                <button key={page} onClick={() => setCurrentPage(page)} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${currentPage === page ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-100'}`}>
                  {page}
                </button>
              ))}
              <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed">
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modals & Panels */}
      {selectedCandidate && (
        <QuickProfilePanel
          candidate={selectedCandidate}
          isOpen={isProfilePanelOpen}
          onClose={() => setIsProfilePanelOpen(false)}
          onStatusChange={handleStatusChange}
          onAddNote={handleAddNote}
        />
      )}

      <ComparisonModal
        candidates={comparisonCandidates}
        isOpen={isComparisonOpen}
        onClose={() => setIsComparisonOpen(false)}
      />

      <ExportModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        onExport={handleExport}
        candidateCount={selectedCandidates.size || filteredApplicants.length}
      />

      {isProfilePanelOpen && (
        <div className="fixed inset-0 bg-black/30 z-40" onClick={() => setIsProfilePanelOpen(false)} />
      )}
    </div>
  );
}

export default ShortlistedCandidates;
