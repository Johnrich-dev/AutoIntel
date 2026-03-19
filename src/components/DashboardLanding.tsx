import { useMemo } from 'react';
import { Users, FileText, Video, ClipboardCheck, TrendingUp, CheckCircle, Briefcase, UserPlus, FileCheck } from 'lucide-react';
import { Applicant, Resume, VideoAssessment, PersonalityTest } from '../lib/supabase';

interface ApplicantWithDetails extends Applicant {
  resume?: Resume;
  video?: VideoAssessment;
  test?: PersonalityTest;
}

interface DashboardLandingProps {
  applicants: ApplicantWithDetails[];
  onMenuChange?: (menuId: string) => void;
}

export function DashboardLanding({ applicants, onMenuChange }: DashboardLandingProps) {
  const totalApplicants = applicants.length;

  const resumeStages = {
    pending: applicants.filter(a => !a.resume || a.resume.status === 'pending').length,
    suitable: applicants.filter(a => a.resume?.status === 'suitable').length,
    notSuitable: applicants.filter(a => a.resume?.status === 'not_suitable').length,
  };

  const videoStages = {
    notStarted: applicants.filter(a => a.resume?.status === 'suitable' && (!a.video || a.video.status === 'pending')).length,
    submitted: applicants.filter(a => a.video?.status === 'submitted').length,
    completed: applicants.filter(a => a.video?.status === 'completed').length,
  };

  const testStages = {
    notStarted: applicants.filter(a => a.video?.status === 'completed' && (!a.test || a.test.status === 'pending')).length,
    completed: applicants.filter(a => a.test?.status === 'completed').length,
  };

  const fullyCompleted = applicants.filter(a => 
    a.resume?.status === 'suitable' && 
    a.video?.status === 'completed' && 
    a.test?.status === 'completed'
  ).length;

  const completionRate = totalApplicants > 0 ? Math.round((fullyCompleted / totalApplicants) * 100) : 0;

  // Stats cards - Gradient backgrounds
  const statsCards = [
    { title: 'Total Applicants', value: totalApplicants, icon: Users, gradient: 'from-blue-500 to-blue-600' },
    { title: 'Resume Reviewed', value: resumeStages.suitable + resumeStages.notSuitable, subValue: `${resumeStages.suitable} suitable`, icon: FileText, gradient: 'from-green-500 to-emerald-600' },
    { title: 'Video Completed', value: videoStages.completed, subValue: `${videoStages.submitted} pending`, icon: Video, gradient: 'from-purple-500 to-violet-600' },
    { title: 'Tests Done', value: testStages.completed, subValue: `${testStages.notStarted} pending`, icon: ClipboardCheck, gradient: 'from-orange-500 to-amber-500' },
  ];

  // Hiring funnel - Gradients with black numbers
  const funnelStages = [
    { name: 'Applications', count: applicants.length, gradient: 'from-blue-400 to-blue-500' },
    { name: 'Reviewed', count: resumeStages.suitable + resumeStages.notSuitable, gradient: 'from-indigo-400 to-indigo-500' },
    { name: 'Shortlisted', count: resumeStages.suitable, gradient: 'from-green-400 to-emerald-500' },
    { name: 'Video', count: videoStages.completed, gradient: 'from-purple-400 to-violet-500' },
    { name: 'Completed', count: testStages.completed, gradient: 'from-orange-400 to-amber-500' },
  ];

  const maxFunnelCount = Math.max(...funnelStages.map(s => s.count), 1);

  const jobPerformance = useMemo(() => {
    const jobCounts: Record<string, { count: number; suitable: number }> = {};
    applicants.forEach(app => {
      const position = app.position || 'Unknown';
      if (!jobCounts[position]) jobCounts[position] = { count: 0, suitable: 0 };
      jobCounts[position].count++;
      if (app.resume?.status === 'suitable') jobCounts[position].suitable++;
    });
    return Object.entries(jobCounts)
      .map(([position, data]) => ({
        position,
        applicants: data.count,
        suitable: data.suitable,
        conversionRate: data.count > 0 ? Math.round((data.suitable / data.count) * 100) : 0,
      }))
      .sort((a, b) => b.applicants - a.applicants)
      .slice(0, 5);
  }, [applicants]);

  const totalJobs = jobPerformance.length;

  const generateRecentActivity = () => {
    const activities: Array<{
      type: 'new_applicant' | 'resume_reviewed' | 'video_submitted' | 'test_completed';
      message: string;
      time: string;
      applicantName: string;
    }> = [];

    const recentApplicants = [...applicants]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 5);

    recentApplicants.forEach(applicant => {
      if (applicant.created_at) activities.push({ type: 'new_applicant', message: `applied for ${applicant.position}`, time: applicant.created_at, applicantName: applicant.name });
      if (applicant.resume?.status === 'suitable' || applicant.resume?.status === 'not_suitable') {
        const resumeTime = applicant.resume?.uploaded_at;
        if (resumeTime) activities.push({ type: 'resume_reviewed', message: `resume ${applicant.resume.status}`, time: resumeTime, applicantName: applicant.name });
      }
      if (applicant.video?.status === 'submitted' || applicant.video?.status === 'completed') {
        const videoTime = applicant.video.submitted_at || applicant.video.created_at;
        if (videoTime) activities.push({ type: 'video_submitted', message: `video ${applicant.video.status}`, time: videoTime, applicantName: applicant.name });
      }
      if (applicant.test?.status === 'completed') {
        const testTime = applicant.test.submitted_at || applicant.test.created_at;
        if (testTime) activities.push({ type: 'test_completed', message: 'test completed', time: testTime, applicantName: applicant.name });
      }
    });
    return activities.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()).slice(0, 6);
  };

  const recentActivity = generateRecentActivity();

  const getRelativeTime = (dateString: string | null | undefined): string => {
    if (!dateString) return 'Unknown';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'Unknown';
    const now = new Date();
    const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));
    if (diffInHours < 1) return 'Just now';
    if (diffInHours < 24) return `${diffInHours}h ago`;
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 7) return `${diffInDays}d ago`;
    return date.toLocaleDateString();
  };

  // Gradient quick actions
  const quickActions = [
    { label: 'Pending Reviews', count: resumeStages.pending, action: () => onMenuChange?.('applicants'), gradient: 'from-blue-500 to-blue-600' },
    { label: 'Shortlisted', count: resumeStages.suitable, action: () => onMenuChange?.('shortlisted'), gradient: 'from-green-500 to-emerald-600' },
    { label: 'Pending Videos', count: videoStages.notStarted, action: () => onMenuChange?.('applicants'), gradient: 'from-purple-500 to-violet-600' },
    { label: 'All Jobs', count: totalJobs, action: () => onMenuChange?.('job-management'), gradient: 'from-cyan-500 to-teal-600' },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
            <p className="text-slate-500 text-sm mt-0.5">Recruitment overview</p>
          </div>
          <div className="flex items-center gap-3 px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-500 rounded-lg shadow-lg">
            <TrendingUp className="w-4 h-4 text-white" />
            <span className="text-sm font-bold text-white">{completionRate}%</span>
            <span className="text-sm text-white/80">complete</span>
          </div>
        </div>

        {/* Quick Actions - Gradient buttons */}
        <div className="flex gap-3">
          {quickActions.map((action, idx) => (
            <button
              key={idx}
              onClick={action.action}
              className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-lg text-white text-sm font-semibold shadow-lg hover:shadow-xl transition-all bg-gradient-to-r ${action.gradient}`}
            >
              <span>{action.label}</span>
              <span className="opacity-90">({action.count})</span>
            </button>
          ))}
        </div>

        {/* Stats Cards - Gradient icons */}
        <div className="grid grid-cols-4 gap-4">
          {statsCards.map((stat, idx) => {
            const Icon = stat.icon;
            return (
              <div key={idx} className="bg-white rounded-xl p-4 shadow-lg border-t-4" style={{ borderColor: stat.gradient.includes('blue') ? '#3b82f6' : stat.gradient.includes('green') ? '#22c55e' : stat.gradient.includes('purple') ? '#a855f7' : '#f97316' }}>
                <div className="flex items-center gap-3">
                  <div className={`p-3 rounded-xl bg-gradient-to-br ${stat.gradient} shadow-md`}>
                    <Icon className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <p className="text-3xl font-black text-slate-900">{stat.value}</p>
                    <p className="text-xs text-slate-500 font-medium">{stat.title}</p>
                  </div>
                </div>
                {stat.subValue && (
                  <p className="text-xs text-slate-400 mt-3 pt-3 border-t border-slate-100">{stat.subValue}</p>
                )}
              </div>
            );
          })}
        </div>

        {/* Two Column Layout */}
        <div className="grid grid-cols-3 gap-6">
          {/* Left - 2/3 width */}
          <div className="col-span-2 space-y-6">
            {/* Recent Activity - Gradients */}
            <div className="bg-white rounded-xl p-5 shadow-lg">
              <h2 className="text-sm font-bold text-slate-900 mb-4">Recent Activity</h2>
              <div className="space-y-3">
                {recentActivity.length > 0 ? recentActivity.map((activity, idx) => {
                  const icons: Record<string, typeof UserPlus> = { new_applicant: UserPlus, resume_reviewed: FileCheck, video_submitted: Video, test_completed: ClipboardCheck };
                  const gradients: Record<string, string> = {
                    new_applicant: 'from-blue-400 to-blue-500',
                    resume_reviewed: 'from-green-400 to-emerald-500',
                    video_submitted: 'from-purple-400 to-violet-500',
                    test_completed: 'from-orange-400 to-amber-500',
                  };
                  const Icon = icons[activity.type] || UserPlus;
                  return (
                    <div key={idx} className="flex items-start gap-3 p-2 rounded-lg hover:bg-slate-50 transition-colors">
                      <div className={`p-2 rounded-lg bg-gradient-to-br ${gradients[activity.type]} shadow-md`}>
                        <Icon className="w-3.5 h-3.5 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-slate-900 truncate">{activity.applicantName} {activity.message}</p>
                        <p className="text-xs text-slate-400">{getRelativeTime(activity.time)}</p>
                      </div>
                    </div>
                  );
                }) : (
                  <p className="text-xs text-slate-400 text-center py-2">No activity yet</p>
                )}
              </div>
            </div>

            {/* Job Performance - Gradients */}
            <div className="bg-white rounded-xl p-5 shadow-lg">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-bold text-slate-900">Job Performance</h2>
                <div className="flex gap-4 text-xs font-medium">
                  <span className="text-blue-600">{totalJobs} jobs</span>
                  <span className="text-purple-600">{totalApplicants} apps</span>
                </div>
              </div>
              <div className="space-y-3">
                {jobPerformance.length > 0 ? jobPerformance.map((job, idx) => {
                  const barColor = job.conversionRate >= 50 ? 'from-green-400 to-emerald-500' : job.conversionRate >= 25 ? 'from-yellow-400 to-orange-500' : 'from-red-400 to-rose-500';
                  const iconColor = job.conversionRate >= 50 ? 'from-green-500 to-emerald-600' : job.conversionRate >= 25 ? 'from-yellow-500 to-orange-600' : 'from-red-500 to-rose-600';
                  return (
                    <div key={idx} className="flex items-center gap-3 p-3 bg-gradient-to-r from-slate-50 to-slate-100 rounded-xl">
                      <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${iconColor} flex items-center justify-center shadow-md`}>
                        <Briefcase className="w-5 h-5 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-slate-900 truncate">{job.position}</p>
                        <p className="text-xs text-slate-500">{job.applicants} applicants</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-green-600">{job.suitable}</p>
                        <p className="text-xs text-slate-400">{job.conversionRate}%</p>
                      </div>
                      <div className="w-20 h-3 bg-slate-200 rounded-full overflow-hidden">
                        <div className={`h-full bg-gradient-to-r ${barColor} rounded-full`} style={{ width: `${job.conversionRate}%` }} />
                      </div>
                    </div>
                  );
                }) : (
                  <p className="text-sm text-slate-400 text-center py-4">No data yet</p>
                )}
              </div>
            </div>
          </div>

          {/* Right - 1/3 width */}
          <div className="space-y-6">
            {/* Stage Breakdown - Gradients */}
            <div className="bg-white rounded-xl p-5 shadow-lg">
              <h2 className="text-sm font-bold text-slate-900 mb-4">Stage Breakdown</h2>
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-gradient-to-r from-blue-400 to-blue-500" />
                      <span className="text-sm font-semibold text-slate-700">Resume</span>
                    </div>
                    <span className="text-sm font-bold text-blue-600">{resumeStages.suitable}/{resumeStages.suitable + resumeStages.notSuitable}</span>
                  </div>
                  <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-blue-400 to-blue-500 rounded-full" style={{ width: `${totalApplicants > 0 ? Math.round(((resumeStages.suitable + resumeStages.notSuitable) / totalApplicants) * 100) : 0}%` }} />
                  </div>
                </div>
                
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-gradient-to-r from-purple-400 to-violet-500" />
                      <span className="text-sm font-semibold text-slate-700">Video</span>
                    </div>
                    <span className="text-sm font-bold text-violet-600">{videoStages.completed}/{resumeStages.suitable}</span>
                  </div>
                  <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-purple-400 to-violet-500 rounded-full" style={{ width: `${resumeStages.suitable > 0 ? Math.round((videoStages.completed / resumeStages.suitable) * 100) : 0}%` }} />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-gradient-to-r from-orange-400 to-amber-500" />
                      <span className="text-sm font-semibold text-slate-700">Test</span>
                    </div>
                    <span className="text-sm font-bold text-orange-600">{testStages.completed}/{videoStages.completed}</span>
                  </div>
                  <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-orange-400 to-amber-500 rounded-full" style={{ width: `${videoStages.completed > 0 ? Math.round((testStages.completed / videoStages.completed) * 100) : 0}%` }} />
                  </div>
                </div>
              </div>

              {/* Summary box - Gradient */}
              <div className="mt-5 pt-4 border-t border-slate-100">
                <div className="flex items-center gap-3 p-3 bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl border border-green-200">
                  <div className="p-2 bg-gradient-to-r from-green-500 to-emerald-500 rounded-lg shadow-md">
                    <CheckCircle className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-green-800">{fullyCompleted} fully qualified</p>
                    <p className="text-xs text-green-600">Completed all stages</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Hiring Funnel - Gradients with BLACK numbers - Compact for narrow column */}
            <div className="bg-white rounded-xl p-4 shadow-lg">
              <h2 className="text-sm font-bold text-slate-900 mb-3">Hiring Pipeline</h2>
              <div className="flex items-center gap-1">
                {funnelStages.map((stage, idx) => {
                  const pct = maxFunnelCount > 0 ? Math.round((stage.count / maxFunnelCount) * 100) : 0;
                  return (
                    <div key={idx} className="flex-1">
                      <div className="text-center mb-1.5">
                        <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${stage.gradient} flex items-center justify-center mx-auto mb-1 shadow-md`}>
                          <span className="text-black font-black text-sm">{stage.count}</span>
                        </div>
                        <p className="text-[10px] font-bold text-slate-700">{stage.name}</p>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className={`h-full bg-gradient-to-r ${stage.gradient} rounded-full`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
