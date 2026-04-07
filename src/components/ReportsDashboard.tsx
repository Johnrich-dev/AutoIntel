import { useState, useMemo } from 'react';
import {
  BarChart3,
  TrendingUp,
  Users,
  Clock,
  Download,
  FileText,
  Video,
  ClipboardCheck,
  ArrowUpRight,
  ArrowDownRight,
  Award,
  Briefcase,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Info,
  Star,
  Calendar,
  TrendingDown,
  Printer,
} from 'lucide-react';
import { Applicant, Resume, VideoAssessment, PersonalityTest } from '../lib/supabase';

// ============================================================================
// Types
// ============================================================================

interface ApplicantWithDetails extends Applicant {
  resume?: Resume;
  video?: VideoAssessment;
  test?: PersonalityTest;
  screened_at?: string;
  decision_date?: string | null;
  interview_scheduled?: boolean;
}

interface ReportsDashboardProps {
  applicants: ApplicantWithDetails[];
}

type DateRange = '7d' | '30d' | '90d' | 'all';
type ReportTab = 'overview' | 'pipeline' | 'scores' | 'time';

// ============================================================================
// Helpers
// ============================================================================

function daysBetween(date1: string, date2: string): number {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  return Math.max(0, Math.floor((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)));
}

function safeAvg(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

function getVideoScore(video?: VideoAssessment): number | null {
  if (!video) return null;
  if (video.transcript_score != null) return Math.round(video.transcript_score * 10);
  return null;
}

function getWorkStyleScore(test?: PersonalityTest): number | null {
  if (!test || test.status !== 'completed') return null;
  if (test.semantic_score != null) return Math.round(test.semantic_score);
  return null;
}

function getResumeScore(a: ApplicantWithDetails): number | null {
  if (a.screening_score != null) return Math.round(a.screening_score);
  return null;
}

// ============================================================================
// Sub-components
// ============================================================================

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-3">
        <Info className="w-6 h-6 text-gray-400" />
      </div>
      <p className="text-sm text-gray-500">{message}</p>
    </div>
  );
}

function MetricCard({
  label,
  value,
  icon: Icon,
  colorClass,
  sub,
  trend,
  trendUp,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  colorClass: string;
  sub?: string;
  trend?: string;
  trendUp?: boolean;
}) {
  return (
    <div className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm">
      <div className="flex items-start justify-between mb-3">
        <div className={`p-2.5 rounded-lg ${colorClass} bg-opacity-10`}>
          <Icon className={`w-5 h-5 ${colorClass.replace('bg-', 'text-')}`} />
        </div>
        {trend && (
          <span className={`flex items-center gap-0.5 text-xs font-medium ${trendUp ? 'text-green-600' : 'text-red-500'}`}>
            {trendUp ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
            {trend}
          </span>
        )}
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-sm text-gray-500 mt-0.5">{label}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

function BarRow({
  label,
  count,
  total,
  colorClass,
  sub,
}: {
  label: string;
  count: number;
  total: number;
  colorClass: string;
  sub?: string;
}) {
  const pct = total > 0 ? Math.max((count / total) * 100, count > 0 ? 4 : 0) : 0;
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium text-gray-700">{label}</span>
        <span className="text-sm text-gray-500">{count}{sub ? ` · ${sub}` : ''}</span>
      </div>
      <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full ${colorClass} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function ReportsDashboard({ applicants }: ReportsDashboardProps) {
  const [dateRange, setDateRange] = useState<DateRange>('30d');
  const [selectedReport, setSelectedReport] = useState<ReportTab>('overview');

  // ── Date filter ──────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (dateRange === 'all') return applicants;
    const days = dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : 90;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    return applicants.filter(a => new Date(a.created_at) >= cutoff);
  }, [applicants, dateRange]);

  // ── Core counts ──────────────────────────────────────────────────────────
  const counts = useMemo(() => {
    const total = filtered.length;
    const resumePassed = filtered.filter(a =>
      a.screening_status === 'passed' || a.screening_status === 'in_review'
    ).length;
    const needsReview = filtered.filter(a => a.screening_status === 'in_review').length;
    const shortlisted = filtered.filter(a => a.status === 'shortlisted' || a.status === 'final_interview').length;
    const hired = filtered.filter(a => a.status === 'hired').length;
    const rejected = filtered.filter(a => a.status === 'rejected').length;
    const videoCompleted = filtered.filter(a => a.video?.status === 'completed').length;
    const assessmentCompleted = filtered.filter(a => a.test?.status === 'completed').length;

    const conversionRate = total > 0 ? Math.round((hired / total) * 100) : 0;
    const assessmentRate = total > 0 ? Math.round((assessmentCompleted / total) * 100) : 0;

    // Avg time to hire: created_at → decision_date (only for hired)
    const hiredWithDate = filtered.filter(a => a.status === 'hired' && a.decision_date);
    const avgTimeToHire = hiredWithDate.length > 0
      ? safeAvg(hiredWithDate.map(a => daysBetween(a.created_at, a.decision_date!)))
      : null;

    return {
      total, resumePassed, needsReview, shortlisted, hired, rejected,
      videoCompleted, assessmentCompleted, conversionRate, assessmentRate, avgTimeToHire,
    };
  }, [filtered]);

  // ── Pipeline funnel ───────────────────────────────────────────────────────
  const funnel = useMemo(() => {
    const stages = [
      { label: 'Applied', count: filtered.length },
      { label: 'Resume Screened', count: filtered.filter(a => a.screening_status && a.screening_status !== 'not_scored').length },
      { label: 'Passed Screening', count: filtered.filter(a => a.screening_status === 'passed' || a.screening_status === 'in_review').length },
      { label: 'Needs Review', count: filtered.filter(a => a.screening_status === 'in_review').length },
      { label: 'Video Assessment', count: filtered.filter(a => a.video?.status === 'completed' || a.video?.status === 'submitted').length },
      { label: 'Work Style Assessment', count: filtered.filter(a => a.test?.status === 'completed').length },
      { label: 'Shortlisted', count: filtered.filter(a => a.status === 'shortlisted' || a.status === 'final_interview').length },
      { label: 'Interview Scheduled', count: filtered.filter(a => a.status === 'final_interview' || a.interview_scheduled).length },
      { label: 'Hired', count: filtered.filter(a => a.status === 'hired').length },
    ];

    return stages.map((s, i) => {
      const prev = i > 0 ? stages[i - 1].count : s.count;
      const convPct = prev > 0 ? Math.round((s.count / prev) * 100) : 0;
      const dropPct = 100 - convPct;
      return { ...s, convPct, dropPct };
    });
  }, [filtered]);

  // Biggest drop-off stage
  const biggestDropoff = useMemo(() => {
    let maxDrop = 0;
    let maxIdx = -1;
    funnel.forEach((s, i) => {
      if (i > 0 && s.dropPct > maxDrop) { maxDrop = s.dropPct; maxIdx = i; }
    });
    return maxIdx;
  }, [funnel]);

  // ── Score analytics ───────────────────────────────────────────────────────
  const scoreAnalytics = useMemo(() => {
    const groups = {
      hired: filtered.filter(a => a.status === 'hired'),
      rejected: filtered.filter(a => a.status === 'rejected'),
      inReview: filtered.filter(a => a.screening_status === 'in_review'),
    };

    function avgScores(list: ApplicantWithDetails[]) {
      const resumes = list.map(getResumeScore).filter((s): s is number => s !== null);
      const videos = list.map(a => getVideoScore(a.video)).filter((s): s is number => s !== null);
      const ws = list.map(a => getWorkStyleScore(a.test)).filter((s): s is number => s !== null);
      return {
        resume: resumes.length > 0 ? safeAvg(resumes) : null,
        video: videos.length > 0 ? safeAvg(videos) : null,
        workStyle: ws.length > 0 ? safeAvg(ws) : null,
      };
    }

    // Score distribution buckets
    const dist = [
      { range: '90–100', label: 'Excellent', count: 0 },
      { range: '80–89', label: 'Good', count: 0 },
      { range: '70–79', label: 'Average', count: 0 },
      { range: '60–69', label: 'Below Avg', count: 0 },
      { range: 'Below 60', label: 'Poor', count: 0 },
    ];
    filtered.forEach(a => {
      const s = getResumeScore(a) ?? getVideoScore(a.video) ?? getWorkStyleScore(a.test);
      if (s == null) return;
      if (s >= 90) dist[0].count++;
      else if (s >= 80) dist[1].count++;
      else if (s >= 70) dist[2].count++;
      else if (s >= 60) dist[3].count++;
      else dist[4].count++;
    });

    return {
      byOutcome: {
        hired: avgScores(groups.hired),
        rejected: avgScores(groups.rejected),
        inReview: avgScores(groups.inReview),
      },
      dist,
    };
  }, [filtered]);

  // ── Job performance ───────────────────────────────────────────────────────
  const jobPerformance = useMemo(() => {
    const map: Record<string, ApplicantWithDetails[]> = {};
    filtered.forEach(a => {
      const key = a.position || 'Unknown';
      if (!map[key]) map[key] = [];
      map[key].push(a);
    });
    return Object.entries(map)
      .map(([position, list]) => {
        const total = list.length;
        const passed = list.filter(a => a.screening_status === 'passed' || a.screening_status === 'in_review').length;
        const completed = list.filter(a => a.test?.status === 'completed').length;
        const shortlisted = list.filter(a => a.status === 'shortlisted' || a.status === 'final_interview').length;
        const hired = list.filter(a => a.status === 'hired').length;
        const hiredWithDate = list.filter(a => a.status === 'hired' && a.decision_date);
        const timeToFill = hiredWithDate.length > 0
          ? safeAvg(hiredWithDate.map(a => daysBetween(a.created_at, a.decision_date!)))
          : null;
        return {
          position, total,
          passRate: total > 0 ? Math.round((passed / total) * 100) : 0,
          completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
          shortlisted, hired, timeToFill,
        };
      })
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
  }, [filtered]);

  // ── Insights / alerts ─────────────────────────────────────────────────────
  const insights = useMemo(() => {
    const msgs: { type: 'warn' | 'info' | 'ok'; text: string }[] = [];
    const { total, resumePassed, assessmentCompleted, hired, videoCompleted } = counts;

    if (total > 0) {
      const dropAfterScreening = total > 0 ? Math.round(((total - resumePassed) / total) * 100) : 0;
      if (dropAfterScreening > 60) msgs.push({ type: 'warn', text: `High drop-off after resume screening: ${dropAfterScreening}% of applicants did not pass.` });

      const assessmentRate = resumePassed > 0 ? Math.round((assessmentCompleted / resumePassed) * 100) : 0;
      if (assessmentRate < 30 && resumePassed > 0) msgs.push({ type: 'warn', text: `Low assessment completion: only ${assessmentRate}% of passed candidates completed the work style assessment.` });

      if (videoCompleted > 0 && assessmentCompleted === 0) msgs.push({ type: 'info', text: 'Candidates have completed video assessments but none have completed the work style assessment yet.' });

      if (hired === 0 && total > 0) msgs.push({ type: 'info', text: 'No hires recorded in the selected period.' });

      if (total > 0 && hired > 0) msgs.push({ type: 'ok', text: `${hired} candidate${hired > 1 ? 's' : ''} hired in the selected period. Overall conversion: ${counts.conversionRate}%.` });
    }

    return msgs;
  }, [counts]);

  // ── Time analytics ────────────────────────────────────────────────────────
  const timeAnalytics = useMemo(() => {
    // Resume screening time: created_at → screened_at
    const screened = filtered.filter(a => a.screened_at);
    const resumeScreeningDays = screened.length > 0
      ? safeAvg(screened.map(a => daysBetween(a.created_at, a.screened_at!)))
      : null;

    // Video completion time: created_at → video.submitted_at
    const videoComp = filtered.filter(a => a.video?.submitted_at);
    const videoCompDays = videoComp.length > 0
      ? safeAvg(videoComp.map(a => daysBetween(a.created_at, a.video!.submitted_at!)))
      : null;

    // Assessment completion time: created_at → test.submitted_at
    const testComp = filtered.filter(a => a.test?.submitted_at);
    const assessmentDays = testComp.length > 0
      ? safeAvg(testComp.map(a => daysBetween(a.created_at, a.test!.submitted_at!)))
      : null;

    // Time to hire: created_at → decision_date
    const hiredWithDate = filtered.filter(a => a.status === 'hired' && a.decision_date);
    const timeToHireDays = hiredWithDate.length > 0
      ? safeAvg(hiredWithDate.map(a => daysBetween(a.created_at, a.decision_date!)))
      : null;

    const stages = [
      { label: 'Resume Screening', days: resumeScreeningDays, count: screened.length, color: 'bg-blue-500' },
      { label: 'Video Assessment', days: videoCompDays, count: videoComp.length, color: 'bg-purple-500' },
      { label: 'Work Style Assessment', days: assessmentDays, count: testComp.length, color: 'bg-orange-500' },
      { label: 'Time to Hire', days: timeToHireDays, count: hiredWithDate.length, color: 'bg-green-500' },
    ];

    // Bottleneck = stage with most days (excluding nulls)
    const withData = stages.filter(s => s.days !== null);
    const bottleneck = withData.length > 0
      ? withData.reduce((a, b) => (a.days! > b.days! ? a : b)).label
      : null;

    return { stages, bottleneck };
  }, [filtered]);

  // ── Export CSV ────────────────────────────────────────────────────────────
  const handleExport = () => {
    const rows = [
      ['Name', 'Email', 'Position', 'Status', 'Screening Status', 'Resume Score', 'Video Score', 'Work Style Score', 'Applied At'],
      ...filtered.map(a => [
        a.name, a.email, a.position,
        a.status || '', a.screening_status || '',
        getResumeScore(a) ?? '',
        getVideoScore(a.video) ?? '',
        getWorkStyleScore(a.test) ?? '',
        new Date(a.created_at).toLocaleDateString(),
      ]),
    ];
    const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `recruitment_report_${dateRange}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 lg:p-8 space-y-6 bg-slate-50 min-h-screen">

      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reports & Analytics</h1>
          <p className="text-sm text-gray-500 mt-0.5">Recruitment performance and hiring insights</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Date range */}
          <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden bg-white">
            {(['7d', '30d', '90d', 'all'] as DateRange[]).map(r => (
              <button
                key={r}
                onClick={() => setDateRange(r)}
                className={`px-3 py-2 text-sm font-medium transition-colors ${
                  dateRange === r ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                {r === '7d' ? '7 Days' : r === '30d' ? '30 Days' : r === '90d' ? '90 Days' : 'All Time'}
              </button>
            ))}
          </div>
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg bg-white hover:bg-gray-50 text-sm text-gray-700 transition-colors"
          >
            <Download className="w-4 h-4" /> Export CSV
          </button>
          <button
            onClick={() => window.print()}
            className="p-2 border border-gray-200 rounded-lg bg-white hover:bg-gray-50 transition-colors"
            title="Print"
          >
            <Printer className="w-4 h-4 text-gray-600" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <div className="flex gap-1">
          {([
            { id: 'overview', label: 'Overview', icon: BarChart3 },
            { id: 'pipeline', label: 'Pipeline', icon: TrendingUp },
            { id: 'scores', label: 'Scores', icon: Award },
            { id: 'time', label: 'Time Analytics', icon: Clock },
          ] as { id: ReportTab; label: string; icon: React.ElementType }[]).map(tab => (
            <button
              key={tab.id}
              onClick={() => setSelectedReport(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                selectedReport === tab.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── OVERVIEW TAB ─────────────────────────────────────────────────── */}
      {selectedReport === 'overview' && (
        <div className="space-y-6">

          {/* KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            <MetricCard label="Total Applicants" value={counts.total} icon={Users} colorClass="bg-blue-500" />
            <MetricCard label="Resume Passed" value={counts.resumePassed} icon={FileText} colorClass="bg-emerald-500"
              sub={counts.total > 0 ? `${Math.round((counts.resumePassed / counts.total) * 100)}% pass rate` : undefined} />
            <MetricCard label="Needs Review" value={counts.needsReview} icon={ClipboardCheck} colorClass="bg-yellow-500" />
            <MetricCard label="Shortlisted" value={counts.shortlisted} icon={Star} colorClass="bg-purple-500" />
            <MetricCard label="Hired" value={counts.hired} icon={CheckCircle} colorClass="bg-green-500" />
            <MetricCard label="Rejected" value={counts.rejected} icon={XCircle} colorClass="bg-red-500" />
            <MetricCard label="Assessment Completion" value={`${counts.assessmentRate}%`} icon={Award} colorClass="bg-orange-500"
              sub={`${counts.assessmentCompleted} of ${counts.total} applicants`} />
            {counts.avgTimeToHire !== null
              ? <MetricCard label="Avg. Time to Hire" value={`${counts.avgTimeToHire}d`} icon={Clock} colorClass="bg-indigo-500"
                  sub={`Based on ${filtered.filter(a => a.status === 'hired' && a.decision_date).length} hire(s)`} />
              : <MetricCard label="Avg. Time to Hire" value="—" icon={Clock} colorClass="bg-indigo-500" sub="No hire data yet" />
            }
          </div>

          {/* Insights panel */}
          {insights.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <Info className="w-4 h-4 text-blue-500" /> Insights & Alerts
              </h3>
              <div className="space-y-2">
                {insights.map((ins, i) => (
                  <div key={i} className={`flex items-start gap-2.5 p-3 rounded-lg text-sm ${
                    ins.type === 'warn' ? 'bg-amber-50 text-amber-800 border border-amber-100' :
                    ins.type === 'ok' ? 'bg-green-50 text-green-800 border border-green-100' :
                    'bg-blue-50 text-blue-800 border border-blue-100'
                  }`}>
                    {ins.type === 'warn' ? <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" /> :
                     ins.type === 'ok' ? <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" /> :
                     <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />}
                    {ins.text}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Job Performance */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <h3 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-gray-500" /> Job Performance
            </h3>
            {jobPerformance.length === 0 ? (
              <EmptyState message="No applicant data for the selected period." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      {['Position', 'Applicants', 'Pass Rate', 'Completion Rate', 'Shortlisted', 'Hired', 'Time to Fill'].map(h => (
                        <th key={h} className="text-left py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {jobPerformance.map((row, i) => (
                      <tr key={i} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                        <td className="py-3 px-3 font-medium text-gray-900 max-w-[180px] truncate">{row.position}</td>
                        <td className="py-3 px-3 text-gray-700">{row.total}</td>
                        <td className="py-3 px-3">
                          <span className={`font-medium ${row.passRate >= 60 ? 'text-green-600' : row.passRate >= 30 ? 'text-yellow-600' : 'text-red-500'}`}>
                            {row.passRate}%
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          <span className={`font-medium ${row.completionRate >= 50 ? 'text-green-600' : row.completionRate >= 20 ? 'text-yellow-600' : 'text-gray-400'}`}>
                            {row.completionRate}%
                          </span>
                        </td>
                        <td className="py-3 px-3 text-gray-700">{row.shortlisted}</td>
                        <td className="py-3 px-3">
                          <span className={`font-semibold ${row.hired > 0 ? 'text-green-600' : 'text-gray-400'}`}>{row.hired}</span>
                        </td>
                        <td className="py-3 px-3 text-gray-500">
                          {row.timeToFill !== null ? `${row.timeToFill}d` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── PIPELINE TAB ─────────────────────────────────────────────────── */}
      {selectedReport === 'pipeline' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-base font-semibold text-gray-900">Recruitment Funnel</h3>
              {biggestDropoff >= 0 && (
                <span className="flex items-center gap-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-100 px-3 py-1.5 rounded-full">
                  <TrendingDown className="w-3.5 h-3.5" />
                  Biggest drop-off: {funnel[biggestDropoff].label}
                </span>
              )}
            </div>

            {counts.total === 0 ? (
              <EmptyState message="No applicants in the selected period." />
            ) : (
              <div className="space-y-3">
                {funnel.map((stage, i) => {
                  const widthPct = counts.total > 0
                    ? Math.max((stage.count / counts.total) * 100, stage.count > 0 ? 3 : 0)
                    : 0;
                  const isBottleneck = i === biggestDropoff;
                  const colors = [
                    'bg-blue-500', 'bg-blue-400', 'bg-emerald-500', 'bg-yellow-500',
                    'bg-purple-500', 'bg-orange-500', 'bg-pink-500', 'bg-indigo-500', 'bg-green-600',
                  ];
                  return (
                    <div key={i} className={`p-3 rounded-lg ${isBottleneck ? 'bg-amber-50 border border-amber-100' : 'bg-gray-50'}`}>
                      <div className="flex items-center gap-3 mb-2">
                        <span className="w-5 h-5 rounded-full bg-gray-200 text-gray-600 text-xs flex items-center justify-center font-semibold flex-shrink-0">{i + 1}</span>
                        <span className="text-sm font-medium text-gray-800 flex-1">{stage.label}</span>
                        <span className="text-sm font-bold text-gray-900 w-8 text-right">{stage.count}</span>
                        {i > 0 && (
                          <span className={`text-xs font-medium w-16 text-right ${stage.convPct >= 70 ? 'text-green-600' : stage.convPct >= 40 ? 'text-yellow-600' : 'text-red-500'}`}>
                            {stage.convPct}% conv.
                          </span>
                        )}
                      </div>
                      <div className="h-2 bg-gray-200 rounded-full overflow-hidden ml-8">
                        <div
                          className={`h-full ${colors[i % colors.length]} rounded-full transition-all duration-500`}
                          style={{ width: `${widthPct}%` }}
                        />
                      </div>
                      {i > 0 && stage.dropPct > 30 && (
                        <p className="text-xs text-amber-600 mt-1 ml-8">
                          {stage.dropPct}% drop-off from previous stage
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Stage summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { label: 'Awaiting Screening', count: filtered.filter(a => !a.screening_status || a.screening_status === 'not_scored').length, icon: FileText, color: 'bg-gray-500' },
              { label: 'Needs Review', count: counts.needsReview, icon: ClipboardCheck, color: 'bg-yellow-500' },
              { label: 'Video Submitted', count: filtered.filter(a => a.video?.status === 'submitted' || a.video?.status === 'completed').length, icon: Video, color: 'bg-purple-500' },
              { label: 'Assessment Done', count: counts.assessmentCompleted, icon: Award, color: 'bg-orange-500' },
              { label: 'Shortlisted', count: counts.shortlisted, icon: Star, color: 'bg-pink-500' },
              { label: 'Hired', count: counts.hired, icon: CheckCircle, color: 'bg-green-500' },
            ].map((item, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center gap-4">
                <div className={`w-10 h-10 ${item.color} rounded-xl flex items-center justify-center flex-shrink-0`}>
                  <item.icon className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-xl font-bold text-gray-900">{item.count}</p>
                  <p className="text-xs text-gray-500">{item.label}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── SCORES TAB ───────────────────────────────────────────────────── */}
      {selectedReport === 'scores' && (
        <div className="space-y-6">

          {/* Avg scores by outcome */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <h3 className="text-base font-semibold text-gray-900 mb-5">Average Scores by Outcome</h3>
            {counts.total === 0 ? (
              <EmptyState message="No score data available for the selected period." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Outcome</th>
                      <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Count</th>
                      <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Resume Score</th>
                      <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Video Score</th>
                      <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Work Style Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { label: 'Hired', key: 'hired' as const, color: 'text-green-600', count: counts.hired },
                      { label: 'Rejected', key: 'rejected' as const, color: 'text-red-500', count: counts.rejected },
                      { label: 'In Review', key: 'inReview' as const, color: 'text-yellow-600', count: counts.needsReview },
                    ].map(row => {
                      const scores = scoreAnalytics.byOutcome[row.key];
                      return (
                        <tr key={row.key} className="border-b border-gray-50 hover:bg-gray-50">
                          <td className={`py-3 px-3 font-semibold ${row.color}`}>{row.label}</td>
                          <td className="py-3 px-3 text-gray-600">{row.count}</td>
                          <td className="py-3 px-3">
                            {scores.resume !== null ? (
                              <span className={`font-medium ${scores.resume >= 70 ? 'text-green-600' : scores.resume >= 50 ? 'text-yellow-600' : 'text-red-500'}`}>
                                {scores.resume}
                              </span>
                            ) : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="py-3 px-3">
                            {scores.video !== null ? (
                              <span className={`font-medium ${scores.video >= 70 ? 'text-green-600' : scores.video >= 50 ? 'text-yellow-600' : 'text-red-500'}`}>
                                {scores.video}
                              </span>
                            ) : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="py-3 px-3">
                            {scores.workStyle !== null ? (
                              <span className={`font-medium ${scores.workStyle >= 70 ? 'text-green-600' : scores.workStyle >= 50 ? 'text-yellow-600' : 'text-red-500'}`}>
                                {scores.workStyle}
                              </span>
                            ) : <span className="text-gray-300">—</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Score distribution */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
              <h3 className="text-base font-semibold text-gray-900 mb-4">Score Distribution (Resume)</h3>
              {counts.total === 0 ? (
                <EmptyState message="No score data available." />
              ) : (
                <div className="space-y-4">
                  {scoreAnalytics.dist.map((d, i) => {
                    const colors = ['bg-green-500', 'bg-blue-500', 'bg-yellow-500', 'bg-orange-500', 'bg-red-500'];
                    return (
                      <BarRow
                        key={i}
                        label={d.label}
                        count={d.count}
                        total={counts.total}
                        colorClass={colors[i]}
                        sub={d.range}
                      />
                    );
                  })}
                </div>
              )}
            </div>

            {/* Threshold effectiveness */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
              <h3 className="text-base font-semibold text-gray-900 mb-4">Threshold Effectiveness</h3>
              {counts.total === 0 ? (
                <EmptyState message="No data available." />
              ) : (
                <div className="space-y-5">
                  {[
                    {
                      label: 'Above 80 (Qualified)',
                      count: filtered.filter(a => (getResumeScore(a) ?? 0) >= 80).length,
                      sub: 'Resume score ≥ 80',
                      color: 'bg-green-500',
                    },
                    {
                      label: 'Above 60 (For Review)',
                      count: filtered.filter(a => { const s = getResumeScore(a); return s !== null && s >= 60 && s < 80; }).length,
                      sub: 'Resume score 60–79',
                      color: 'bg-yellow-500',
                    },
                    {
                      label: 'Below 60 (Rejected)',
                      count: filtered.filter(a => (getResumeScore(a) ?? 100) < 60).length,
                      sub: 'Resume score < 60',
                      color: 'bg-red-500',
                    },
                  ].map((item, i) => (
                    <BarRow key={i} label={item.label} count={item.count} total={counts.total} colorClass={item.color} sub={item.sub} />
                  ))}

                  <div className="pt-3 border-t border-gray-100">
                    <p className="text-xs text-gray-500 mb-2 font-medium">Component Weight Breakdown</p>
                    <div className="flex gap-2 flex-wrap">
                      {[
                        { label: 'Resume', pct: 50, color: 'bg-blue-500' },
                        { label: 'Video', pct: 30, color: 'bg-purple-500' },
                        { label: 'Work Style', pct: 20, color: 'bg-orange-500' },
                      ].map(w => (
                        <div key={w.label} className="flex items-center gap-1.5 text-xs text-gray-600">
                          <span className={`w-2.5 h-2.5 rounded-full ${w.color}`} />
                          {w.label} {w.pct}%
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── TIME ANALYTICS TAB ───────────────────────────────────────────── */}
      {selectedReport === 'time' && (
        <div className="space-y-6">

          {/* Stage duration cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {timeAnalytics.stages.map((stage, i) => (
              <div key={i} className={`bg-white rounded-xl border shadow-sm p-5 ${
                stage.label === timeAnalytics.bottleneck ? 'border-amber-300 bg-amber-50' : 'border-gray-200'
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${stage.color}`} />
                  {stage.label === timeAnalytics.bottleneck && (
                    <span className="text-xs font-medium text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">Bottleneck</span>
                  )}
                </div>
                {stage.days !== null ? (
                  <>
                    <p className="text-3xl font-bold text-gray-900">{stage.days}d</p>
                    <p className="text-sm text-gray-500 mt-0.5">{stage.label}</p>
                    <p className="text-xs text-gray-400 mt-1">Based on {stage.count} record{stage.count !== 1 ? 's' : ''}</p>
                  </>
                ) : (
                  <>
                    <p className="text-2xl font-bold text-gray-300">—</p>
                    <p className="text-sm text-gray-500 mt-0.5">{stage.label}</p>
                    <p className="text-xs text-gray-400 mt-1">No data available</p>
                  </>
                )}
              </div>
            ))}
          </div>

          {/* Bottleneck callout */}
          {timeAnalytics.bottleneck && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-800">Bottleneck Identified: {timeAnalytics.bottleneck}</p>
                <p className="text-sm text-amber-700 mt-0.5">
                  This stage has the longest average duration. Consider reviewing the process to reduce delays.
                </p>
              </div>
            </div>
          )}

          {/* Timeline visualization */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <h3 className="text-base font-semibold text-gray-900 mb-6">Candidate Journey Timeline</h3>
            {timeAnalytics.stages.every(s => s.days === null) ? (
              <EmptyState message="No timestamp data available to build the timeline. Timestamps are recorded as candidates progress through each stage." />
            ) : (
              <div className="relative">
                <div className="absolute top-5 left-5 right-5 h-0.5 bg-gray-200" />
                <div className="relative flex justify-between">
                  {[
                    { label: 'Applied', day: 'Day 0', icon: Calendar },
                    { label: 'Screened', day: timeAnalytics.stages[0].days !== null ? `~Day ${timeAnalytics.stages[0].days}` : '—', icon: FileText },
                    { label: 'Video Done', day: timeAnalytics.stages[1].days !== null ? `~Day ${timeAnalytics.stages[1].days}` : '—', icon: Video },
                    { label: 'Assessment', day: timeAnalytics.stages[2].days !== null ? `~Day ${timeAnalytics.stages[2].days}` : '—', icon: ClipboardCheck },
                    { label: 'Hired', day: timeAnalytics.stages[3].days !== null ? `~Day ${timeAnalytics.stages[3].days}` : '—', icon: CheckCircle },
                  ].map((step, i) => (
                    <div key={i} className="flex flex-col items-center bg-white px-1 z-10">
                      <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white mb-2 shadow-sm">
                        <step.icon className="w-4 h-4" />
                      </div>
                      <p className="text-xs font-medium text-gray-800 text-center">{step.label}</p>
                      <p className="text-xs text-gray-400 text-center">{step.day}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
