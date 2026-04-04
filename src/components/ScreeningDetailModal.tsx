import { useState, useEffect } from 'react';
import {
  X, CheckCircle, XCircle, TrendingUp, Star, Briefcase,
  AlertCircle, ChevronLeft, ChevronRight, FileText, Download, Clock,
  Video, ClipboardList, Wrench, GraduationCap, Award, User,
} from 'lucide-react';
import { Applicant, Resume } from '../lib/supabase';

interface ScreenedApplicant extends Omit<Applicant, 'screening_status' | 'screened_at'> {
  resume?: Resume;
  overall_score?: number;
  requirement_match_score?: number | null;
  count_score?: number | null;
  skills_score?: number | null;
  experience_score?: number | null;
  education_score?: number | null;
  projects_score?: number | null;
  traincert_score?: number | null;
  achievements_score?: number | null;
  count_breakdown?: Record<string, { count: number; score: number }> | null;
  screening_status?: 'passed' | 'in_review' | 'failed' | 'not_scored';
  screened_at?: string | null;
  matched_skills?: string[];
  missing_skills?: string[];
  video_submitted?: boolean;
  work_style_completed?: boolean;
}

const STATUS_CONFIGS = {
  passed:     { label: 'Passed',     bg: 'bg-green-50',  text: 'text-green-700',  border: 'border-green-200',  icon: CheckCircle },
  in_review:  { label: 'In Review',  bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-200', icon: AlertCircle },
  failed:     { label: 'Failed',     bg: 'bg-red-50',    text: 'text-red-700',    border: 'border-red-200',    icon: XCircle },
  not_scored: { label: 'Not Scored', bg: 'bg-gray-50',   text: 'text-gray-500',   border: 'border-gray-200',   icon: Clock },
} as const;

function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIGS[status as keyof typeof STATUS_CONFIGS] ?? STATUS_CONFIGS.not_scored;
  const Icon = config.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${config.bg} ${config.text} ${config.border}`}>
      <Icon className="w-3.5 h-3.5" />
      {config.label}
    </span>
  );
}

function ScoreBar({ score, color }: { score: number; color: string }) {
  return (
    <div className="w-full h-1.5 bg-gray-100 rounded-full mt-2 overflow-hidden">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(Math.max(score, 0), 100)}%` }} />
    </div>
  );
}

function Toast({ message, type, onDismiss }: { message: string; type: 'success' | 'error'; onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 5000);
    return () => clearTimeout(t);
  }, [onDismiss]);
  return (
    <div className={`fixed bottom-6 right-6 z-[60] flex items-start gap-3 px-4 py-3 rounded-xl shadow-lg border max-w-sm w-[calc(100vw-3rem)]
      ${type === 'success' ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
      {type === 'success'
        ? <CheckCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
        : <XCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />}
      <p className="text-sm flex-1">{message}</p>
      <button onClick={onDismiss} className="opacity-60 hover:opacity-100 flex-shrink-0"><X className="w-4 h-4" /></button>
    </div>
  );
}

interface ScreeningDetailModalProps {
  applicant: ScreenedApplicant;
  onClose: () => void;
  onUpdateStatus?: (applicantId: string, newStatus: 'passed' | 'failed') => void;
  onPrev?: () => void;
  onNext?: () => void;
  currentIndex?: number;
  totalCount?: number;
}

export function ScreeningDetailModal({
  applicant, onClose, onUpdateStatus, onPrev, onNext, currentIndex, totalCount,
}: ScreeningDetailModalProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [showRejectConfirm, setShowRejectConfirm] = useState(false);

  useEffect(() => { setShowRejectConfirm(false); }, [applicant.id]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (showRejectConfirm) return;
      if (e.key === 'ArrowLeft') onPrev?.();
      if (e.key === 'ArrowRight') onNext?.();
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onPrev, onNext, onClose, showRejectConfirm]);

  const handleDecision = async (decision: 'approved' | 'rejected') => {
    if (!applicant.id || !applicant.email) return;
    setShowRejectConfirm(false);
    setIsProcessing(true);
    try {
      const response = await fetch(
        `http://localhost:5000${decision === 'approved' ? '/api/grant-access' : '/api/reject-applicant'}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            applicant_id: applicant.id,
            applicant_email: applicant.email,
            applicant_name: applicant.name,
            position: applicant.position,
            overall_score: applicant.overall_score ?? 0,
            skills_score: applicant.skills_score ?? 0,
            experience_score: applicant.experience_score ?? 0,
            education_score: applicant.education_score ?? 0,
          }),
        }
      );
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Failed to process request');
      onUpdateStatus?.(applicant.id, decision === 'approved' ? 'passed' : 'failed');
      setToast({
        type: 'success',
        message: decision === 'approved'
          ? `Access granted. Email sent to ${applicant.email}.`
          : `${applicant.name} rejected. Notification email sent.`,
      });
    } catch (error) {
      setToast({ type: 'error', message: `Error: ${(error as Error).message}` });
    } finally {
      setIsProcessing(false);
    }
  };

  // ── Derived values ──────────────────────────────────────────────────────────
  const overallScore          = applicant.overall_score ?? 0;
  const requirementMatchScore = applicant.requirement_match_score ?? null;
  const countScore            = applicant.count_score ?? null;
  const matchedSkills         = applicant.matched_skills ?? [];
  const missingSkills         = applicant.missing_skills ?? [];
  const resumeUrl             = applicant.resume?.resume_url ?? null;
  const assessmentsDone       = (applicant.video_submitted ? 1 : 0) + (applicant.work_style_completed ? 1 : 0);

  const status      = applicant.screening_status ?? 'not_scored';
  const isPassed    = status === 'passed';
  const isInReview  = status === 'in_review';
  const isFailed    = status === 'failed';
  const isNotScored = status === 'not_scored';
  const hasScore    = !isNotScored && overallScore > 0;

  // Per-category requirement match — only show categories with real values
  const reqCategories: { label: string; score: number; Icon: React.ElementType; iconColor: string }[] = [];
  const pushReq = (label: string, val: number | null | undefined, Icon: React.ElementType, iconColor: string) => {
    if (val != null && val > 0) reqCategories.push({ label, score: val, Icon, iconColor });
  };
  pushReq('Skills',       applicant.skills_score,      Star,          'text-purple-500');
  pushReq('Experience',   applicant.experience_score,  Briefcase,     'text-blue-500');
  pushReq('Education',    applicant.education_score,   GraduationCap, 'text-green-500');
  pushReq('Projects',     applicant.projects_score,    Award,         'text-orange-500');
  pushReq('Train/Certs',  applicant.traincert_score,   Wrench,        'text-teal-500');
  pushReq('Achievements', applicant.achievements_score, TrendingUp,   'text-pink-500');

  const scoreColor      = (s: number) => s >= 78 ? 'bg-green-500' : s >= 65 ? 'bg-yellow-400' : 'bg-red-400';
  const scoreLabel      = (s: number) => s >= 78 ? 'Strong' : s >= 65 ? 'Moderate' : 'Weak';
  const scoreLabelColor = (s: number) => s >= 78 ? 'text-green-600' : s >= 65 ? 'text-yellow-600' : 'text-red-500';

  const screenedDate = applicant.screened_at
    ? new Date(applicant.screened_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
    : new Date(applicant.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />

      <div className="fixed inset-0 sm:inset-y-0 sm:right-0 sm:left-auto z-50 bg-white shadow-2xl w-full sm:max-w-2xl flex flex-col">

        {/* ── Header ── */}
        <div className="px-4 sm:px-6 py-4 border-b border-gray-100 bg-white flex-shrink-0">
          <div className="flex items-start justify-between gap-3">
            {/* Photo + identity */}
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 bg-gradient-to-br from-blue-500 to-indigo-600">
                {applicant.photo_url
                  ? <img src={applicant.photo_url} alt={applicant.name} className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center text-white font-semibold text-lg">
                      {applicant.name?.charAt(0).toUpperCase() ?? <User className="w-5 h-5" />}
                    </div>
                }
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-lg font-semibold text-gray-900 truncate">{applicant.name}</h2>
                  <StatusBadge status={status} />
                </div>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <span className="text-sm text-gray-500 truncate">{applicant.position || '—'}</span>
                  <span className="text-gray-300 hidden sm:inline">·</span>
                  <a href={`mailto:${applicant.email}`} className="text-sm text-indigo-500 hover:underline truncate hidden sm:inline">
                    {applicant.email}
                  </a>
                </div>
              </div>
            </div>

            {/* Nav + close */}
            <div className="flex items-center gap-1 flex-shrink-0">
              {totalCount != null && totalCount > 1 && (
                <>
                  <span className="text-xs text-gray-400 mr-1 hidden sm:inline">
                    {currentIndex != null ? currentIndex + 1 : '—'}/{totalCount}
                  </span>
                  <button onClick={onPrev} disabled={!onPrev}
                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Previous (←)">
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button onClick={onNext} disabled={!onNext}
                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Next (→)">
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <div className="w-px h-5 bg-gray-200 mx-1" />
                </>
              )}
              <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* ── Content ── */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5 space-y-4">

          {/* Score + Resume — side by side */}
          <div className="flex gap-3">
            {/* Score card */}
            <div className="flex-1 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-100">
              <p className="text-xs text-blue-500 font-medium mb-1">AI Screening Score</p>
              {isNotScored
                ? <p className="text-2xl font-semibold text-gray-400">Pending</p>
                : <>
                    <p className="text-4xl font-bold text-blue-900">{Math.round(overallScore)}%</p>
                    {requirementMatchScore != null && countScore != null && (
                      <p className="text-xs text-blue-400 mt-1">
                        {Math.round(requirementMatchScore)}% match · {Math.round(countScore)}% completeness
                      </p>
                    )}
                  </>
              }
            </div>

            {/* Resume + quick info */}
            <div className="flex flex-col gap-2 justify-between">
              {resumeUrl ? (
                <>
                  <a href={resumeUrl} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-all shadow-sm whitespace-nowrap">
                    <FileText className="w-4 h-4 text-indigo-500 flex-shrink-0" />View Resume
                  </a>
                  <a href={resumeUrl} download
                    className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-all shadow-sm whitespace-nowrap">
                    <Download className="w-4 h-4 text-gray-400 flex-shrink-0" />Download
                  </a>
                </>
              ) : (
                <span className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl text-sm text-gray-400 whitespace-nowrap">
                  <FileText className="w-4 h-4 flex-shrink-0" />No Resume
                </span>
              )}
              <p className="text-xs text-gray-400 text-right">Screened {screenedDate}</p>
            </div>
          </div>

          {/* Assessment progress — only for passed / in_review */}
          {(isPassed || isInReview) && (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-900">Assessments</h3>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  assessmentsDone === 2 ? 'bg-green-100 text-green-700' :
                  assessmentsDone === 1 ? 'bg-yellow-100 text-yellow-700' :
                  'bg-gray-100 text-gray-500'
                }`}>{assessmentsDone}/2 Complete</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className={`flex items-center gap-3 p-3 rounded-lg border ${applicant.video_submitted ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
                  <Video className={`w-4 h-4 flex-shrink-0 ${applicant.video_submitted ? 'text-green-600' : 'text-gray-400'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-700">Video</p>
                    <p className={`text-xs ${applicant.video_submitted ? 'text-green-600 font-medium' : 'text-gray-400'}`}>
                      {applicant.video_submitted ? 'Submitted' : 'Pending'}
                    </p>
                  </div>
                  {applicant.video_submitted && <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />}
                </div>
                <div className={`flex items-center gap-3 p-3 rounded-lg border ${applicant.work_style_completed ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
                  <ClipboardList className={`w-4 h-4 flex-shrink-0 ${applicant.work_style_completed ? 'text-green-600' : 'text-gray-400'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-700">Work Style</p>
                    <p className={`text-xs ${applicant.work_style_completed ? 'text-green-600 font-medium' : 'text-gray-400'}`}>
                      {applicant.work_style_completed ? 'Submitted' : 'Pending'}
                    </p>
                  </div>
                  {applicant.work_style_completed && <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />}
                </div>
              </div>
            </div>
          )}

          {/* Score breakdown — only when real data exists */}
          {hasScore && reqCategories.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-gray-400" />
                  Score Breakdown
                </h3>
                {requirementMatchScore != null && countScore != null && (
                  <span className="text-xs text-gray-400">
                    {Math.round(requirementMatchScore)}% job match · {Math.round(countScore)}% profile completeness
                  </span>
                )}
              </div>
              <div className={`grid gap-2 ${reqCategories.length <= 3 ? 'grid-cols-3' : 'grid-cols-2 sm:grid-cols-3'}`}>
                {reqCategories.map(({ label, score, Icon, iconColor }) => (
                  <div key={label} className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                    <div className="flex items-center justify-between mb-1 gap-1">
                      <div className="flex items-center gap-1">
                        <Icon className={`w-3.5 h-3.5 ${iconColor} flex-shrink-0`} />
                        <span className="text-xs font-medium text-gray-500 truncate">{label}</span>
                      </div>
                      <span className={`text-xs font-semibold flex-shrink-0 ${scoreLabelColor(score)}`}>{scoreLabel(score)}</span>
                    </div>
                    <p className="text-xl font-bold text-gray-900">{Math.round(score)}%</p>
                    <ScoreBar score={score} color={scoreColor(score)} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Skills */}
          {hasScore && (matchedSkills.length > 0 || missingSkills.length > 0) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="bg-green-50 rounded-xl p-4 border border-green-100">
                <h4 className="text-xs font-semibold text-green-800 mb-2 flex items-center gap-1.5">
                  <CheckCircle className="w-3.5 h-3.5" />
                  Resume Skills ({matchedSkills.length})
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {matchedSkills.length > 0
                    ? matchedSkills.map((s, i) => (
                        <span key={i} className="px-2 py-0.5 bg-green-100 text-green-700 rounded-md text-xs font-medium">{s}</span>
                      ))
                    : <span className="text-xs text-green-600 italic">No data</span>
                  }
                </div>
              </div>
              <div className="bg-red-50 rounded-xl p-4 border border-red-100">
                <h4 className="text-xs font-semibold text-red-800 mb-2 flex items-center gap-1.5">
                  <XCircle className="w-3.5 h-3.5" />
                  Skills Gap ({missingSkills.length})
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {missingSkills.length > 0
                    ? missingSkills.map((s, i) => (
                        <span key={i} className="px-2 py-0.5 bg-red-100 text-red-700 rounded-md text-xs font-medium">{s}</span>
                      ))
                    : <span className="text-xs text-red-500 italic">None detected</span>
                  }
                </div>
              </div>
            </div>
          )}

          {/* Context note for in_review */}
          {isInReview && (
            <div className="bg-yellow-50 rounded-xl p-3 border border-yellow-100 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-yellow-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-yellow-700">
                Scored {Math.round(overallScore)}% — below the qualified threshold. Grant access if you think this candidate is worth reviewing further.
              </p>
            </div>
          )}

          {/* Not scored */}
          {isNotScored && (
            <div className="bg-gray-50 rounded-xl p-4 border border-gray-200 flex items-start gap-2">
              <Clock className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-gray-500">Resume hasn't been processed yet. Score will appear once the AI screener runs.</p>
            </div>
          )}

          {/* Reject confirm */}
          {showRejectConfirm && (
            <div className="bg-red-50 rounded-xl p-4 border border-red-200">
              <p className="text-sm font-semibold text-red-800 mb-1">Confirm rejection</p>
              <p className="text-sm text-red-700 mb-3">
                Reject <span className="font-medium">{applicant.name}</span> and send a rejection email. This cannot be undone.
              </p>
              <div className="flex gap-2">
                <button onClick={() => setShowRejectConfirm(false)}
                  className="px-3 py-1.5 text-sm text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                  Cancel
                </button>
                <button onClick={() => handleDecision('rejected')} disabled={isProcessing}
                  className="px-3 py-1.5 text-sm text-white bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-50 flex items-center gap-1.5 transition-colors">
                  {isProcessing && <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                  Yes, Reject
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="flex-shrink-0 flex items-center justify-between px-4 sm:px-6 py-4 border-t border-gray-100 bg-gray-50 gap-3">
          {/* Left: passed/failed/pending label */}
          <div>
            {isPassed    && <span className="text-xs text-green-600 font-medium">✓ Access granted</span>}
            {isFailed    && <span className="text-xs text-red-500 font-medium">✕ Rejected</span>}
            {isNotScored && <span className="text-xs text-gray-400">Pending screening</span>}
            {isInReview  && !showRejectConfirm && <span className="text-xs text-yellow-600 font-medium">Awaiting your decision</span>}
          </div>

          {/* Right: action buttons — only for in_review */}
          {isInReview && !showRejectConfirm && (
            <div className="flex items-center gap-2">
              <button onClick={() => setShowRejectConfirm(true)} disabled={isProcessing}
                className="px-4 py-2 text-sm font-medium text-red-700 bg-white hover:bg-red-50 border border-red-200 rounded-lg transition-colors disabled:opacity-50">
                Reject
              </button>
              <button onClick={() => handleDecision('approved')} disabled={isProcessing}
                className="px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2">
                {isProcessing
                  ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Processing...</>
                  : <><CheckCircle className="w-4 h-4" />Grant Access</>
                }
              </button>
            </div>
          )}
        </div>
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}
    </>
  );
}
