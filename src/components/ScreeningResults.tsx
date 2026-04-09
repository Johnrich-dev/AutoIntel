import { useState, useMemo, useEffect } from 'react';
import { useFormatDate } from '../hooks/useFormatDate';
import {
  Search,
  FileText,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Calendar,
  Filter,
  X,
} from 'lucide-react';
import { Applicant, Resume, ResumeParsedData, getSupabaseAdminClient } from '../lib/supabase';
import { FilterDropdown } from './FilterDropdown';
import { ScreeningDetailModal } from './ScreeningDetailModal';

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
  // count breakdown — actual item counts from resume
  count_breakdown?: Record<string, { count: number; score: number }> | null;
  screening_status?: 'passed' | 'in_review' | 'failed' | 'not_scored';
  screened_at?: string | null;
  matched_skills?: string[];
  missing_skills?: string[];
  video_submitted?: boolean;
  work_style_completed?: boolean;
}

interface JobOption {
  id: string;
  title: string;
  count: number;
}

type StatusFilter = 'all' | 'passed' | 'in_review' | 'failed' | 'not_scored';
type AssessmentFilter = 'all' | 'both' | 'video_only' | 'work_only' | 'none';
type SortOption = 'score_desc' | 'score_asc' | 'date_desc' | 'date_asc' | 'name_asc';

interface StatusConfig {
  label: string;
  bg: string;
  text: string;
  border: string;
  icon: React.ElementType;
}

const STATUS_CONFIGS: Record<string, StatusConfig> = {
  passed:     { label: 'Passed',     bg: 'bg-green-50',  text: 'text-green-700',  border: 'border-green-200',  icon: CheckCircle },
  in_review:  { label: 'In Review',  bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-200', icon: AlertCircle },
  failed:     { label: 'Failed',     bg: 'bg-red-50',    text: 'text-red-700',    border: 'border-red-200',    icon: XCircle },
  not_scored: { label: 'Not Scored', bg: 'bg-gray-50',   text: 'text-gray-500',   border: 'border-gray-200',   icon: Clock },
};

function TableSkeleton() {
  return (
    <>
      {[...Array(5)].map((_, i) => (
        <tr key={i} className="border-b border-gray-100">
          <td className="px-4 py-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gray-200 rounded-lg animate-pulse" />
              <div className="space-y-2">
                <div className="h-4 w-32 bg-gray-200 rounded animate-pulse" />
                <div className="h-3 w-24 bg-gray-100 rounded animate-pulse" />
              </div>
            </div>
          </td>
          <td className="px-4 py-5"><div className="h-4 w-28 bg-gray-200 rounded animate-pulse" /></td>
          <td className="px-4 py-5"><div className="h-8 w-16 bg-gray-200 rounded-lg animate-pulse mx-auto" /></td>
          <td className="px-4 py-5"><div className="h-6 w-24 bg-gray-200 rounded-full animate-pulse mx-auto" /></td>
          <td className="px-4 py-5"><div className="h-4 w-24 bg-gray-200 rounded animate-pulse" /></td>
          <td className="px-4 py-5"><div className="h-4 w-24 bg-gray-200 rounded animate-pulse" /></td>
        </tr>
      ))}
    </>
  );
}

function EmptyState() {
  return (
    <tr>
      <td colSpan={6} className="px-4 py-16">
        <div className="flex flex-col items-center justify-center text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mb-4">
            <FileText className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-1">No screened applicants yet</h3>
          <p className="text-sm text-gray-500 max-w-sm">
            Applicants processed through the AI screening system will appear here with their evaluation results.
          </p>
        </div>
      </td>
    </tr>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 78 ? 'bg-green-100 text-green-700' : score >= 65 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700';
  return <div className={`inline-block px-3 py-1.5 rounded-lg font-semibold text-sm ${color}`}>{Math.round(score)}%</div>;
}

function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIGS[status] || STATUS_CONFIGS.failed;
  const Icon = config.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${config.bg} ${config.text} ${config.border}`}>
      <Icon className="w-3.5 h-3.5" />
      {config.label}
    </span>
  );
}

export function ScreeningResults() {
  const formatDate = useFormatDate();
  const [applicants, setApplicants] = useState<ScreenedApplicant[]>([]);
  const [jobs, setJobs] = useState<JobOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedJob, setSelectedJob] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [assessmentFilter, setAssessmentFilter] = useState<AssessmentFilter>('all');
  const [sortBy, setSortBy] = useState<SortOption>('date_desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedApplicant, setSelectedApplicant] = useState<ScreenedApplicant | null>(null);
  const [selectedApplicantIndex, setSelectedApplicantIndex] = useState<number>(-1);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showFilters, setShowFilters] = useState(false);  const itemsPerPage = 10;

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const adminClient = getSupabaseAdminClient();

      const { data: settingsData } = await adminClient
        .from('scoring_settings').select('*').order('created_at', { ascending: false }).limit(1).maybeSingle();
      const qualifiedThreshold = settingsData?.qualified_threshold ?? 78;
      const reviewThreshold = settingsData?.review_threshold ?? 65;

      // Load auto-action thresholds from admin settings
      const { data: adminSettingsData } = await adminClient
        .from('admin_users').select('auto_reject_threshold, auto_shortlist_threshold').limit(1).maybeSingle();
      const autoRejectThreshold: number = adminSettingsData?.auto_reject_threshold ?? 0;
      const autoShortlistThreshold: number = adminSettingsData?.auto_shortlist_threshold ?? 0;

      const { data: applicantsData, error: applicantsError } = await adminClient
        .from('applicants').select('*').order('created_at', { ascending: false });
      if (applicantsError) throw applicantsError;

      const { data: resumesData } = await adminClient.from('resumes').select('*');
      const { data: resumeScoresData } = await adminClient.from('resume_scores').select('applicant_id, skills_score, experience_score, education_score, match_explain');
      const { data: jobPostingsData } = await adminClient.from('job_postings').select('job_id, title, skills');
      const { data: videoAssessmentsData } = await adminClient.from('video_assessments').select('*');
      const { data: workStyleAssessmentsData } = await adminClient.from('work_style_assessments').select('*');

      if (!applicantsData) return;

      const screenedApplicants: ScreenedApplicant[] = applicantsData.map((applicant) => {
        const resume = resumesData?.find((r) => r.applicant_id === applicant.id);
        const resumeScore = resumeScoresData?.find((rs) => rs.applicant_id === applicant.id);
        const videoAssessment = videoAssessmentsData?.find((va) => va.applicant_id === applicant.id);
        const workStyleAssessment = workStyleAssessmentsData?.find((wsa) => wsa.applicant_id === applicant.id);
        const hasVideoSubmitted = !!(videoAssessment && (
          videoAssessment.status === 'submitted' ||
          videoAssessment.status === 'completed' ||
          !!videoAssessment.submitted_at
        ));
        const workStyleRecord = workStyleAssessment;
        const hasWorkStyleCompleted = !!(workStyleRecord && (
          workStyleRecord.status === 'submitted' ||
          workStyleRecord.status === 'completed' ||
          !!workStyleRecord.submitted_at
        ));
        const overallScore = applicant.screening_score ?? 0;

        let status: 'passed' | 'in_review' | 'failed' | 'not_scored';
        if (applicant.screening_status && ['passed', 'in_review', 'failed'].includes(applicant.screening_status)) {
          status = applicant.screening_status as 'passed' | 'in_review' | 'failed';
        } else if (overallScore === 0) {
          // No score yet — don't treat as failed
          status = 'not_scored';
        } else if (overallScore >= qualifiedThreshold) {
          status = 'passed';
        } else if (overallScore >= reviewThreshold) {
          status = 'in_review';
        } else {
          status = 'failed';
        }

        let matchedSkills: string[] = [];
        let missingSkills: string[] = [];
        let skillsScore: number | null       = resumeScore?.skills_score ?? null;
        let experienceScore: number | null   = resumeScore?.experience_score ?? null;
        let educationScore: number | null    = resumeScore?.education_score ?? null;
        let projectsScore: number | null     = null;
        let traincertScore: number | null    = null;
        let achievementsScore: number | null = null;
        let requirementMatchScore: number | null = null;
        let countScore: number | null = null;
        let countBreakdown: Record<string, { count: number; score: number }> | null = null;

        // Pull real component scores from match_explain (requirement_match breakdown)
        let dbMissingSkills: string[] | null = null;
        if (resumeScore?.match_explain) {
          try {
            const matchExplain = typeof resumeScore.match_explain === 'string'
              ? JSON.parse(resumeScore.match_explain)
              : resumeScore.match_explain;
            const rb = matchExplain?.component_breakdown?.requirement_match || {};
            if (rb.skills        != null) skillsScore       = Math.round(rb.skills);
            if (rb.experience    != null) experienceScore   = Math.round(rb.experience);
            if (rb.education     != null) educationScore    = Math.round(rb.education);
            if (rb.projects      != null) projectsScore     = Math.round(rb.projects);
            if (rb.traincert     != null) traincertScore    = Math.round(rb.traincert);
            if (rb.achievements  != null) achievementsScore = Math.round(rb.achievements);
            const cb = matchExplain?.component_breakdown?.count || {};
            if (Object.keys(cb).length > 0) countBreakdown = cb;
            if (matchExplain?.requirement_match_score != null) requirementMatchScore = Math.round(matchExplain.requirement_match_score);
            if (matchExplain?.count_score != null) countScore = Math.round(matchExplain.count_score);
            // Read backend-computed missing skills for the gap panel
            if (Array.isArray(matchExplain?.missing_skills))
              dbMissingSkills = matchExplain.missing_skills;
          } catch { /* keep DB values */ }
        }

        // If all DB sub-scores are 0 (known bug in screening_service), treat as unavailable
        if (skillsScore === 0 && experienceScore === 0 && educationScore === 0) {
          skillsScore = null;
          experienceScore = null;
          educationScore = null;
        }

        let parsedData: ResumeParsedData | null = null;
        if (resume?.parsed_data) {
          parsedData = typeof resume.parsed_data === 'object'
            ? resume.parsed_data
            : (() => { try { return JSON.parse(resume.parsed_data as string) as ResumeParsedData; } catch { return null; } })();
        }

        if (parsedData) {
          // Collect ALL skills from parsed_data — no cap
          const allResumeSkills: string[] = [];
          if (Array.isArray(parsedData.skills)) {
            allResumeSkills.push(...parsedData.skills);
          } else if (parsedData.skills?.hard_skills && Array.isArray(parsedData.skills.hard_skills)) {
            allResumeSkills.push(...parsedData.skills.hard_skills);
          } else if (parsedData.skills && typeof parsedData.skills === 'object') {
            Object.values(parsedData.skills).forEach((v: unknown) => {
              if (Array.isArray(v)) allResumeSkills.push(...(v as string[]));
              else if (typeof v === 'string') allResumeSkills.push(v);
            });
          }

          // Also scrape tech keywords from experience bullets (catches skills only mentioned in experience)
          if (Array.isArray(parsedData.experience)) {
            parsedData.experience.forEach((exp: Record<string, unknown>) => {
              const desc = [exp.description, exp.role, exp.company].filter(Boolean).join(' ');
              const techMatches = desc.match(/\b(ETL|AWS|GCP|Azure|Spark|Hadoop|Airflow|Kafka|Docker|Kubernetes|MongoDB|Redis|Linux|Scala|Terraform|Ansible|Jenkins|CI\/CD|n8n|Talend|SAP|Flask|Django|FastAPI|React|Angular|Vue|TypeScript|PostgreSQL|MySQL|MSSQL|Git|GitHub)\b/gi) || [];
              allResumeSkills.push(...techMatches);
            });
          }
          // Deduplicate and display up to 20 for the UI
          const seen = new Set<string>();
          const cleanSkills: string[] = [];
          const labelPattern = /^(skills?|technical|soft|hard|tools?|languages?|frameworks?|platforms?|databases?|other|additional|core|key|professional|personal)$/i;
          for (const s of allResumeSkills) {
            if (!s || typeof s !== 'string') continue;
            const key = s.toLowerCase().trim();
            if (!seen.has(key) && !labelPattern.test(key)) {
              seen.add(key);
              cleanSkills.push(s.trim());
            }
          }
          matchedSkills = cleanSkills;

          // ── Step 3: fallback sub-scores if not from DB ────────────────────
          if (skillsScore === null && experienceScore === null && educationScore === null) {
            if (cleanSkills.length > 0 || parsedData.experience?.length > 0 || parsedData.education?.length > 0) {
              skillsScore    = Math.min(Math.round((cleanSkills.length / 15) * 100), 100);
              experienceScore = Math.min(Math.round(((parsedData.experience?.length || 0) / 5) * 100), 100);
              educationScore  = Math.min(Math.round(((parsedData.education?.length  || 0) / 3) * 100), 100);
            }
          }

          // ── Step 4: compute skill gap (only used as fallback when DB has no missing_skills) ──
          if (applicant.position && !dbMissingSkills) {
            let requiredSkills: string[] = [];
            if (jobPostingsData) {
              const match = jobPostingsData.find(j => j.title?.toLowerCase() === applicant.position?.toLowerCase())
                || jobPostingsData.find(j =>
                    j.title?.toLowerCase().includes(applicant.position?.toLowerCase() || '') ||
                    applicant.position?.toLowerCase().includes(j.title?.toLowerCase() || ''));
              if (match?.skills?.length) requiredSkills = match.skills;
            }
            if (requiredSkills.length === 0) {
              const pos = applicant.position.toLowerCase();
              if (pos.includes('data engineer'))       requiredSkills = ['Python', 'SQL', 'Spark', 'Airflow', 'AWS', 'Kafka'];
              else if (pos.includes('data scientist')) requiredSkills = ['Python', 'Machine Learning', 'TensorFlow', 'SQL', 'Statistics'];
              else if (pos.includes('data analyst'))   requiredSkills = ['Excel', 'SQL', 'Tableau', 'PowerBI', 'Python'];
              else if (pos.includes('backend'))        requiredSkills = ['Python', 'Java', 'Node.js', 'PostgreSQL', 'Docker'];
              else if (pos.includes('frontend'))       requiredSkills = ['JavaScript', 'React', 'TypeScript', 'CSS', 'HTML'];
              else if (pos.includes('full stack'))     requiredSkills = ['JavaScript', 'React', 'Node.js', 'SQL', 'Docker'];
              else if (pos.includes('devops'))         requiredSkills = ['Docker', 'Kubernetes', 'AWS', 'Linux', 'CI/CD'];
              else if (pos.includes('ml') || pos.includes('machine learning')) requiredSkills = ['Python', 'TensorFlow', 'PyTorch', 'Machine Learning', 'SQL'];
              else requiredSkills = ['Python', 'SQL', 'JavaScript', 'Git'];
            }

            // Alias map: canonical key → list of equivalent strings
            const ALIASES: Record<string, string[]> = {
              'aws':              ['amazon web services', 'aws cloud', 'aws s3', 'aws ec2', 'aws lambda', 'aws rds', 'aws automation', 'aws databases'],
              'gcp':              ['google cloud', 'google cloud platform', 'google cloud platforms'],
              'azure':            ['microsoft azure', 'azure cloud', 'azure services', 'azure devops', 'azure fundamentals', 'azure basics'],
              'etl':              ['etl pipelines', 'etl pipeline', 'etl tools', 'extract transform load'],
              'spark':            ['apache spark', 'pyspark', 'spark sql'],
              'airflow':          ['apache airflow'],
              'hadoop':           ['apache hadoop', 'hdfs', 'mapreduce'],
              'kafka':            ['apache kafka'],
              'sql':              ['mysql', 'postgresql', 'postgres', 'mssql', 'ms sql server', 'sqlite', 'supabase'],
              'mongodb':          ['mongo', 'nosql'],
              'linux':            ['unix', 'bash', 'shell scripting'],
              'python':           ['py', 'django', 'flask', 'fastapi'],
              'javascript':       ['js', 'node.js', 'nodejs', 'react', 'vue', 'angular', 'typescript'],
              'git':              ['github', 'gitlab', 'version control'],
              'dotnet':           ['.net', '.net core', '.net framework', 'asp.net', 'asp.net core', 'asp.net mvc'],
              'csharp':           ['c#', 'c sharp'],
              'mssql':            ['ms sql', 'ms sql server', 'microsoft sql server'],
              'entity framework': ['ef core', 'entity framework core'],
              'unit testing':     ['nunit', 'xunit', 'mstest', 'jest', 'pytest'],
              'data modeling':    ['data models', 'schema design', 'database design'],
              'data structures':  ['algorithms', 'data structure'],
              'analytical thinking': ['analytical skills', 'data analysis', 'eda', 'exploratory data analysis'],
            };

            const aliasToCanon: Record<string, string> = {};
            for (const [canon, variants] of Object.entries(ALIASES)) {
              aliasToCanon[canon] = canon;
              for (const v of variants) aliasToCanon[v] = canon;
            }

            const stripQ = (s: string) =>
              s.toLowerCase()
               .replace(/\b(basics?|fundamentals?|introduction|intro|beginner|advanced|essentials?|overview)\b/g, '')
               .replace(/\s+/g, ' ').trim();

            const canon = (s: string): string => {
              const stripped = stripQ(s);
              return aliasToCanon[stripped] ?? aliasToCanon[s.toLowerCase()] ?? stripped;
            };

            const resumeCanons = cleanSkills.map(canon);

            missingSkills = requiredSkills.filter(req => {
              const rc = canon(req);
              const rs = stripQ(req);
              return !resumeCanons.some(mc => mc === rc || mc.includes(rs) || rs.includes(mc) || mc.includes(rc) || rc.includes(mc));
            });
          }
        }

        return {
          ...applicant,
          resume,
          overall_score: overallScore,
          requirement_match_score: requirementMatchScore,
          count_score: countScore,
          count_breakdown: countBreakdown,
          skills_score:       skillsScore       !== null ? Math.round(skillsScore)       : null,
          experience_score:   experienceScore   !== null ? Math.round(experienceScore)   : null,
          education_score:    educationScore    !== null ? Math.round(educationScore)    : null,
          projects_score:     projectsScore     !== null ? Math.round(projectsScore)     : null,
          traincert_score:    traincertScore    !== null ? Math.round(traincertScore)    : null,
          achievements_score: achievementsScore !== null ? Math.round(achievementsScore) : null,
          screening_status: status,
          screened_at: applicant.screened_at ?? null,
          // Prefer backend-stored skill lists (accurate, matches scoring logic).
          // Fall back to frontend-computed lists only for old records without DB data.
          // NOTE: matched_skills (Resume Skills panel) always comes from parsedData —
          // it shows ALL skills on the resume, not just the ones that matched the job.
          // dbMatchedSkills/dbMissingSkills are only used for the Skills Gap panel.
          matched_skills: matchedSkills,
          missing_skills: dbMissingSkills ?? missingSkills,
          video_submitted: hasVideoSubmitted,
          work_style_completed: hasWorkStyleCompleted,
        };
      });

      setApplicants(screenedApplicants);

      // Apply auto-reject / auto-shortlist thresholds
      // Only act on applicants that haven't been manually decided yet
      const DECIDED_STATUSES = new Set(['shortlisted', 'rejected', 'hired', 'final_interview']);
      const toAutoReject: string[] = [];
      const toAutoShortlist: string[] = [];

      if (autoRejectThreshold > 0 || autoShortlistThreshold > 0) {
        for (const a of screenedApplicants) {
          if (DECIDED_STATUSES.has(a.status ?? '')) continue;
          const score = a.overall_score ?? 0;
          if (score === 0) continue; // not scored yet
          if (autoRejectThreshold > 0 && score < autoRejectThreshold) {
            toAutoReject.push(a.id);
          } else if (autoShortlistThreshold > 0 && score >= autoShortlistThreshold) {
            toAutoShortlist.push(a.id);
          }
        }

        if (toAutoReject.length > 0) {
          await adminClient.from('applicants').update({ status: 'rejected' }).in('id', toAutoReject);
        }
        if (toAutoShortlist.length > 0) {
          await adminClient.from('applicants').update({ status: 'shortlisted' }).in('id', toAutoShortlist);
        }

        // Reflect auto-actions in local state
        if (toAutoReject.length > 0 || toAutoShortlist.length > 0) {
          const rejectSet = new Set(toAutoReject);
          const shortlistSet = new Set(toAutoShortlist);
          setApplicants(prev => prev.map(a => {
            if (rejectSet.has(a.id)) return { ...a, status: 'rejected' };
            if (shortlistSet.has(a.id)) return { ...a, status: 'shortlisted' };
            return a;
          }));
          console.log(`[AutoAction] Rejected: ${toAutoReject.length}, Shortlisted: ${toAutoShortlist.length}`);
        }
      }

      const positionCounts = applicantsData.reduce((acc, a) => {
        if (a.position) acc[a.position] = (acc[a.position] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      setJobs((Object.entries(positionCounts) as [string, number][])
        .map(([position, count]) => ({ id: position, title: position, count }))
        .sort((a, b) => a.title.localeCompare(b.title)));
    } catch (error) {
      console.error('Error loading screening results:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredApplicants = useMemo(() => {
    let filtered = [...applicants];
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(a => a.name?.toLowerCase().includes(q) || a.position?.toLowerCase().includes(q) || a.email?.toLowerCase().includes(q));
    }
    if (selectedJob !== 'all') filtered = filtered.filter(a => a.position === selectedJob);
    if (statusFilter !== 'all') filtered = filtered.filter(a => a.screening_status === statusFilter);
    if (assessmentFilter !== 'all') {
      filtered = filtered.filter(a => {
        const v = !!a.video_submitted;
        const w = !!a.work_style_completed;
        if (assessmentFilter === 'both')       return v && w;
        if (assessmentFilter === 'video_only') return v && !w;
        if (assessmentFilter === 'work_only')  return !v && w;
        if (assessmentFilter === 'none')       return !v && !w;
        return true;
      });
    }
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'score_desc': return (b.overall_score || 0) - (a.overall_score || 0);
        case 'score_asc':  return (a.overall_score || 0) - (b.overall_score || 0);
        case 'date_desc':  return new Date(b.screened_at || b.created_at).getTime() - new Date(a.screened_at || a.created_at).getTime();
        case 'date_asc':   return new Date(a.screened_at || a.created_at).getTime() - new Date(b.screened_at || b.created_at).getTime();
        case 'name_asc':   return (a.name || '').localeCompare(b.name || '');
        default: return 0;
      }
    });
    return filtered;
  }, [applicants, searchQuery, selectedJob, statusFilter, assessmentFilter, sortBy]);

  const totalPages = Math.ceil(filteredApplicants.length / itemsPerPage);
  const paginatedApplicants = filteredApplicants.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const handleViewDetails = (applicant: ScreenedApplicant) => {
    const index = filteredApplicants.findIndex(a => a.id === applicant.id);
    setSelectedApplicant(applicant);
    setSelectedApplicantIndex(index);
    setShowDetailModal(true);
  };

  const handlePrev = () => {
    const prev = selectedApplicantIndex - 1;
    if (prev >= 0) {
      setSelectedApplicant(filteredApplicants[prev]);
      setSelectedApplicantIndex(prev);
    }
  };

  const handleNext = () => {
    const next = selectedApplicantIndex + 1;
    if (next < filteredApplicants.length) {
      setSelectedApplicant(filteredApplicants[next]);
      setSelectedApplicantIndex(next);
    }
  };

  const handleUpdateStatus = (applicantId: string, newStatus: 'passed' | 'failed') => {
    setApplicants(prev => prev.map(a => a.id === applicantId ? { ...a, screening_status: newStatus } : a));
    if (selectedApplicant?.id === applicantId) {
      setSelectedApplicant(prev => prev ? { ...prev, screening_status: newStatus } : null);
    }
  };

  const stats = useMemo(() => ({
    total: applicants.length,
    passed: applicants.filter(a => a.screening_status === 'passed').length,
    inReview: applicants.filter(a => a.screening_status === 'in_review').length,
    failed: applicants.filter(a => a.screening_status === 'failed').length,
    notScored: applicants.filter(a => a.screening_status === 'not_scored').length,
  }), [applicants]);

  const SORT_LABELS: Record<SortOption, string> = {
    date_desc: 'Newest First', date_asc: 'Oldest First',
    score_desc: 'Highest Score', score_asc: 'Lowest Score', name_asc: 'Name A-Z',
  };

  const hasActiveFilters = sortBy !== 'date_desc' || assessmentFilter !== 'all';

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Screening Results</h1>
            <p className="text-sm text-gray-500 mt-0.5">AI-powered resume evaluation results</p>
          </div>
          <button onClick={loadData} title="Refresh" className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-400 hover:text-gray-600">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
        {/* KPI Cards */}
        <div className="flex items-center gap-3">
          {[
            { label: 'Total',      value: stats.total,     bg: 'bg-white',     border: 'border-gray-200',  text: 'text-gray-900',   sub: 'text-gray-500'   },
            { label: 'Passed',     value: stats.passed,    bg: 'bg-green-50',  border: 'border-green-200', text: 'text-green-700',  sub: 'text-green-600'  },
            { label: 'In Review',  value: stats.inReview,  bg: 'bg-yellow-50', border: 'border-yellow-200',text: 'text-yellow-700', sub: 'text-yellow-600' },
            { label: 'Failed',     value: stats.failed,    bg: 'bg-red-50',    border: 'border-red-200',   text: 'text-red-700',    sub: 'text-red-600'    },
            { label: 'Not Scored', value: stats.notScored, bg: 'bg-gray-50',   border: 'border-gray-200',  text: 'text-gray-600',   sub: 'text-gray-400'   },
          ].map(card => (
            <div key={card.label} className={`${card.bg} rounded-xl border ${card.border} shadow-sm w-28 px-3 py-2`}>
              <p className={`text-xs ${card.sub}`}>{card.label}</p>
              <p className={`text-lg font-bold ${card.text}`}>{card.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 space-y-3">
        {/* Primary row: search + job + filters button */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input
              type="text" placeholder="Search candidate name or position..." value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full h-10 pl-9 pr-4 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
            />
          </div>
          <FilterDropdown
            value={selectedJob}
            onChange={(v) => setSelectedJob(v)}
            options={[
              { value: 'all', label: 'All Positions' },
              ...jobs.map(j => ({ value: j.title, label: `${j.title} (${j.count})` }))
            ]}
            width="w-full sm:w-52"
          />
          {/* Filters toggle */}
          <button
            onClick={() => setShowFilters(f => !f)}
            className={`relative flex items-center justify-center gap-2 h-10 px-4 border rounded-lg text-sm font-medium transition-colors flex-shrink-0 ${
              showFilters || hasActiveFilters
                ? 'bg-blue-50 border-blue-200 text-blue-700'
                : 'border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Filter className="w-4 h-4" />
            Filters
            {hasActiveFilters && (
              <span className="w-2 h-2 rounded-full bg-blue-500 absolute -top-0.5 -right-0.5" />
            )}
          </button>
        </div>

        {/* Status tabs — always visible */}
        <div className="flex items-center bg-gray-100 rounded-xl p-1">
          {(['all', 'passed', 'in_review', 'failed', 'not_scored'] as StatusFilter[]).map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-all ${statusFilter === s ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}>
              <span className="whitespace-nowrap">
                {s === 'all' ? 'All' : s === 'in_review' ? 'In Review' : s === 'not_scored' ? 'Not Scored' : s.charAt(0).toUpperCase() + s.slice(1)}
              </span>
              {s !== 'all' && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full min-w-[20px] text-center ${statusFilter === s ? 'bg-gray-200 text-gray-700' : 'bg-gray-200 text-gray-400'}`}>
                  {s === 'passed' ? stats.passed : s === 'in_review' ? stats.inReview : s === 'failed' ? stats.failed : stats.notScored}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Expandable: sort + assessment filter */}
        {showFilters && (
          <div className="pt-3 border-t border-gray-100 flex flex-wrap items-start gap-6">
            {/* Sort */}
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Sort by</p>
              <div className="flex items-center bg-gray-100 rounded-xl p-1 gap-0.5">
                {(Object.entries(SORT_LABELS) as [SortOption, string][]).map(([val, label]) => (
                  <button key={val} onClick={() => setSortBy(val)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                      sortBy === val ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'
                    }`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Assessment filter */}
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Assessments done</p>
              <div className="flex items-center bg-gray-100 rounded-xl p-1 gap-0.5">
                {([
                  { value: 'all',        label: 'Any' },
                  { value: 'both',       label: 'Both' },
                  { value: 'video_only', label: 'Video only' },
                  { value: 'work_only',  label: 'Work only' },
                  { value: 'none',       label: 'None' },
                ] as { value: AssessmentFilter; label: string }[]).map(opt => (
                  <button key={opt.value} onClick={() => setAssessmentFilter(opt.value)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                      assessmentFilter === opt.value ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'
                    }`}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Clear */}
            {hasActiveFilters && (
              <button
                onClick={() => { setSortBy('date_desc'); setAssessmentFilter('all'); }}
                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium mt-6"
              >
                <X className="w-3 h-3" /> Clear
              </button>
            )}
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Applicant</th>
                <th className="px-4 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Job Applied</th>
                <th className="px-4 py-4 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Score</th>
                <th className="px-4 py-4 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Status</th>
                <th className="px-4 py-4 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Assessments</th>
                <th className="px-4 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Date Screened</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? <TableSkeleton /> : paginatedApplicants.length === 0 ? <EmptyState /> : (
                paginatedApplicants.map(applicant => (
                  <tr key={applicant.id} onClick={() => handleViewDetails(applicant)} className="hover:bg-blue-50/40 transition-colors cursor-pointer group">
                    <td className="px-4 py-5">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0">
                          {applicant.photo_url ? (
                            <img src={applicant.photo_url} alt={applicant.name || ''} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-semibold text-sm">
                              {applicant.name?.charAt(0).toUpperCase() || '?'}
                            </div>
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900 group-hover:text-blue-600 transition-colors">{applicant.name || 'Unknown'}</p>
                          <p className="text-xs text-gray-500">{applicant.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-5"><span className="text-sm text-gray-700">{applicant.position || 'N/A'}</span></td>
                    <td className="px-4 py-5 text-center">
                      {applicant.screening_status === 'not_scored'
                        ? <span className="text-xs text-gray-400">Pending</span>
                        : <ScoreBadge score={applicant.overall_score || 0} />
                      }
                    </td>
                    <td className="px-4 py-5 text-center"><StatusBadge status={applicant.screening_status || 'not_scored'} /></td>
                    <td className="px-4 py-5 text-center">
                      {applicant.screening_status === 'passed' || applicant.screening_status === 'in_review' ? (() => {
                        const done = (applicant.video_submitted ? 1 : 0) + (applicant.work_style_completed ? 1 : 0);
                        return (
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${
                            done === 2 ? 'bg-green-50 text-green-700 border-green-200' :
                            done === 1 ? 'bg-yellow-50 text-yellow-700 border-yellow-200' :
                            'bg-gray-50 text-gray-400 border-gray-200'
                          }`}>
                            {done === 2 ? <CheckCircle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                            {done}/2 Done
                          </span>
                        );
                      })() : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-5">
                      <div className="flex items-center gap-2 text-sm text-gray-500">
                        <Calendar className="w-4 h-4" />
                        {formatDate(applicant.screened_at || applicant.created_at)}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {!loading && filteredApplicants.length > 0 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 bg-gray-50/50">
            <p className="text-sm text-gray-500">
              Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filteredApplicants.length)} of {filteredApplicants.length} results
            </p>
            <div className="flex items-center gap-2">
              <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}
                className="p-2 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                <ChevronLeft className="w-4 h-4" />
              </button>
              {[...Array(totalPages)].map((_, i) => (
                <button key={i} onClick={() => setCurrentPage(i + 1)}
                  className={`w-10 h-10 rounded-lg text-sm font-medium transition-colors ${currentPage === i + 1 ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
                  {i + 1}
                </button>
              ))}
              <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}
                className="p-2 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {showDetailModal && selectedApplicant && (
        <ScreeningDetailModal
          applicant={selectedApplicant}
          onClose={() => { setShowDetailModal(false); setSelectedApplicantIndex(-1); }}
          onUpdateStatus={handleUpdateStatus}
          onPrev={selectedApplicantIndex > 0 ? handlePrev : undefined}
          onNext={selectedApplicantIndex < filteredApplicants.length - 1 ? handleNext : undefined}
          currentIndex={selectedApplicantIndex}
          totalCount={filteredApplicants.length}
        />
      )}
    </div>
  );
}
