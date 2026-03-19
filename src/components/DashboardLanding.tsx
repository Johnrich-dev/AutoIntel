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

  // Stats cards - Pastel backgrounds
  const statsCards = [
    { title: 'Total Applicants', value: totalApplicants, icon: Users, gradient: 'from-blue-200 to-blue-300', iconBg: 'bg-blue-100' },
    { title: 'Resume Reviewed', value: resumeStages.suitable + resumeStages.notSuitable, subValue: `${resumeStages.suitable} suitable`, icon: FileText, gradient: 'from-green-200 to-green-300', iconBg: 'bg-green-100' },
    { title: 'Video Completed', value: videoStages.completed, subValue: `${videoStages.submitted} pending`, icon: Video, gradient: 'from-violet-200 to-violet-300', iconBg: 'bg-violet-100' },
    { title: 'Tests Done', value: testStages.completed, subValue: `${testStages.notStarted} pending`, icon: ClipboardCheck, gradient: 'from-amber-200 to-amber-300', iconBg: 'bg-amber-100' },
  ];

  // Hiring funnel - Pastel colors
  const funnelStages = [
    { name: 'Applications', count: applicants.length, gradient: 'from-blue-200 to-blue-300' },
    { name: 'Reviewed', count: resumeStages.suitable + resumeStages.notSuitable, gradient: 'from-indigo-200 to-indigo-300' },
    { name: 'Shortlisted', count: resumeStages.suitable, gradient: 'from-green-200 to-green-300' },
    { name: 'Video', count: videoStages.completed, gradient: 'from-violet-200 to-violet-300' },
    { name: 'Completed', count: testStages.completed, gradient: 'from-amber-200 to-amber-300' },
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

  // Pastel quick actions
  const quickActions = [
    { label: 'Pending Reviews', count: resumeStages.pending, action: () => onMenuChange?.('applicants'), gradient: 'from-blue-200 to-blue-300', textColor: 'text-blue-700' },
    { label: 'Shortlisted', count: resumeStages.suitable, action: () => onMenuChange?.('shortlisted'), gradient: 'from-green-200 to-green-300', textColor: 'text-green-700' },
    { label: 'Pending Videos', count: videoStages.notStarted, action: () => onMenuChange?.('applicants'), gradient: 'from-violet-200 to-violet-300', textColor: 'text-violet-700' },
    { label: 'All Jobs', count: totalJobs, action: () => onMenuChange?.('job-management'), gradient: 'from-teal-200 to-teal-300', textColor: 'text-teal-700' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>
            <p className="text-gray-400 text-sm mt-0.5">Recruitment overview</p>
          </div>
          <div className="flex items-center gap-3 px-4 py-2 bg-gradient-to-r from-green-200 to-emerald-200 rounded-lg">
            <TrendingUp className="w-4 h-4 text-green-600" />
            <span className="text-sm font-bold text-green-700">{completionRate}%</span>
            <span className="text-sm text-green-600/80">complete</span>
          </div>
        </div>

        {/* Quick Actions - Pastel buttons */}
        <div className="flex gap-3">
          {quickActions.map((action, idx) => (
            <button
              key={idx}
              onClick={action.action}
              className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-lg text-sm font-semibold transition-all bg-gradient-to-r ${action.gradient} ${action.textColor} hover:opacity-80`}
            >
              <span>{action.label}</span>
              <span className="opacity-80">({action.count})</span>
            </button>
          ))}
        </div>

        {/* Stats Cards - Pastel icons */}
        <div className="grid grid-cols-4 gap-4">
          {statsCards.map((stat, idx) => {
            const Icon = stat.icon;
            return (
              <div key={idx} className="bg-white rounded-xl p-4 border border-gray-100 hover:shadow-md transition-shadow">
                <div className="flex items-center gap-3">
                  <div className={`p-3 rounded-xl ${stat.iconBg}`}>
                    <Icon className="w-6 h-6 text-gray-600" />
                  </div>
                  <div>
                    <p className="text-3xl font-bold text-gray-800">{stat.value}</p>
                    <p className="text-xs text-gray-400 font-medium">{stat.title}</p>
                  </div>
                </div>
                {stat.subValue && (
                  <p className="text-xs text-gray-400 mt-3 pt-3 border-t border-gray-50">{stat.subValue}</p>
                )}
              </div>
            );
          })}
        </div>

        {/* Two Column Layout */}
        <div className="grid grid-cols-3 gap-6">
          {/* Left - 2/3 width */}
          <div className="col-span-2 space-y-6">
            {/* Recent Activity - Pastel */}
            <div className="bg-white rounded-xl p-5 border border-gray-100">
              <h2 className="text-sm font-bold text-gray-700 mb-4">Recent Activity</h2>
              <div className="space-y-3">
                {recentActivity.length > 0 ? recentActivity.map((activity, idx) => {
                  const icons: Record<string, typeof UserPlus> = { new_applicant: UserPlus, resume_reviewed: FileCheck, video_submitted: Video, test_completed: ClipboardCheck };
                  const pastelBg: Record<string, string> = {
                    new_applicant: 'bg-blue-100',
                    resume_reviewed: 'bg-green-100',
                    video_submitted: 'bg-violet-100',
                    test_completed: 'bg-amber-100',
                  };
                  const Icon = icons[activity.type] || UserPlus;
                  return (
                    <div key={idx} className="flex items-start gap-3 p-2 rounded-lg hover:bg-gray-50 transition-colors">
                      <div className={`p-2 rounded-lg ${pastelBg[activity.type]}`}>
                        <Icon className="w-3.5 h-3.5 text-gray-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-gray-700 truncate">{activity.applicantName} {activity.message}</p>
                        <p className="text-xs text-gray-400">{getRelativeTime(activity.time)}</p>
                      </div>
                    </div>
                  );
                }) : (
                  <p className="text-xs text-gray-400 text-center py-2">No activity yet</p>
                )}
              </div>
            </div>

            {/* Job Performance - Pastel */}
            <div className="bg-white rounded-xl p-5 border border-gray-100">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-bold text-gray-700">Job Performance</h2>
                <div className="flex gap-4 text-xs font-medium">
                  <span className="text-blue-500">{totalJobs} jobs</span>
                  <span className="text-violet-500">{totalApplicants} apps</span>
                </div>
              </div>
              <div className="space-y-3">
                {jobPerformance.length > 0 ? jobPerformance.map((job, idx) => {
                  const barColor = job.conversionRate >= 50 ? 'from-green-300 to-green-400' : job.conversionRate >= 25 ? 'from-yellow-300 to-yellow-400' : 'from-red-300 to-rose-400';
                  const iconBg = job.conversionRate >= 50 ? 'bg-green-100' : job.conversionRate >= 25 ? 'bg-yellow-100' : 'bg-red-100';
                  return (
                    <div key={idx} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                      <div className={`w-10 h-10 rounded-lg ${iconBg} flex items-center justify-center`}>
                        <Briefcase className="w-5 h-5 text-gray-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-gray-700 truncate">{job.position}</p>
                        <p className="text-xs text-gray-400">{job.applicants} applicants</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-green-600">{job.suitable}</p>
                        <p className="text-xs text-gray-400">{job.conversionRate}%</p>
                      </div>
                      <div className="w-20 h-3 bg-gray-200 rounded-full overflow-hidden">
                        <div className={`h-full bg-gradient-to-r ${barColor} rounded-full`} style={{ width: `${job.conversionRate}%` }} />
                      </div>
                    </div>
                  );
                }) : (
                  <p className="text-sm text-gray-400 text-center py-4">No data yet</p>
                )}
              </div>
            </div>
          </div>

          {/* Right - 1/3 width */}
          <div className="space-y-6">
            {/* Stage Breakdown - Pastel */}
            <div className="bg-white rounded-xl p-5 border border-gray-100">
              <h2 className="text-sm font-bold text-gray-700 mb-4">Stage Breakdown</h2>
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-blue-300" />
                      <span className="text-sm font-semibold text-gray-600">Resume</span>
                    </div>
                    <span className="text-sm font-bold text-blue-500">{resumeStages.suitable}/{resumeStages.suitable + resumeStages.notSuitable}</span>
                  </div>
                  <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-300 rounded-full" style={{ width: `${totalApplicants > 0 ? Math.round(((resumeStages.suitable + resumeStages.notSuitable) / totalApplicants) * 100) : 0}%` }} />
                  </div>
                </div>
                
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-violet-300" />
                      <span className="text-sm font-semibold text-gray-600">Video</span>
                    </div>
                    <span className="text-sm font-bold text-violet-500">{videoStages.completed}/{resumeStages.suitable}</span>
                  </div>
                  <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-violet-300 rounded-full" style={{ width: `${resumeStages.suitable > 0 ? Math.round((videoStages.completed / resumeStages.suitable) * 100) : 0}%` }} />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-amber-300" />
                      <span className="text-sm font-semibold text-gray-600">Test</span>
                    </div>
                    <span className="text-sm font-bold text-amber-500">{testStages.completed}/{videoStages.completed}</span>
                  </div>
                  <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-amber-300 rounded-full" style={{ width: `${videoStages.completed > 0 ? Math.round((testStages.completed / videoStages.completed) * 100) : 0}%` }} />
                  </div>
                </div>
              </div>

              {/* Summary box - Pastel */}
              <div className="mt-5 pt-4 border-t border-gray-100">
                <div className="flex items-center gap-3 p-3 bg-green-50 rounded-xl border border-green-100">
                  <div className="p-2 bg-green-200 rounded-lg">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-green-700">{fullyCompleted} fully qualified</p>
                    <p className="text-xs text-green-500">Completed all stages</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Hiring Funnel - Pastel - Compact for narrow column */}
            <div className="bg-white rounded-xl p-4 border border-gray-100">
              <h2 className="text-sm font-bold text-gray-700 mb-3">Hiring Pipeline</h2>
              <div className="flex items-center gap-1">
                {funnelStages.map((stage, idx) => {
                  const pct = maxFunnelCount > 0 ? Math.round((stage.count / maxFunnelCount) * 100) : 0;
                  return (
                    <div key={idx} className="flex-1">
                      <div className="text-center mb-1.5">
                        <div className={`w-8 h-8 rounded-lg ${stage.gradient} flex items-center justify-center mx-auto mb-1`}>
                          <span className="text-gray-700 font-bold text-sm">{stage.count}</span>
                        </div>
                        <p className="text-[10px] font-medium text-gray-500">{stage.name}</p>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className={`h-full ${stage.gradient} rounded-full`} style={{ width: `${pct}%` }} />
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
