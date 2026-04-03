import { useState, useMemo, useEffect } from 'react';
import {
  Search,
  Filter,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Plus,
  Calendar as CalendarIcon,
  Clock,
  Video,
  MapPin,
  Users,
  X,
  Edit2,
  Trash2,
  CheckCircle,
  Eye,
  CalendarDays,
  List,
  Briefcase,
  User,
  Mail,
  FileText,
  Check,
  ExternalLink
} from 'lucide-react';
import { getSupabaseAdminClient, Applicant, Resume } from '../lib/supabase';

// ============================================================================
// Types & Interfaces
// ============================================================================

interface ScheduledInterview {
  id: string;
  applicantId: string;
  applicantName: string;
  applicantEmail: string;
  jobTitle: string;
  interviewDate?: string;
  interviewTime?: string;
  interviewType?: 'online' | 'in-person';
  meetingLink?: string;
  meetingId?: string;
  meetingPasscode?: string;
  location?: string;
  interviewerId?: string;
  interviewerName?: string;
  status: 'pending' | 'scheduled' | 'completed' | 'cancelled';
  notes?: string;
  createdAt: string;
}

interface JobPosting {
  job_id: string;
  title: string;
  department?: string;
}

interface HRManager {
  id: string;
  name: string;
  email: string;
  role?: string;
  department?: string;
}

interface InterviewFormData {
  applicantId: string;
  jobId: string;
  interviewDate: string;
  interviewTime: string;
  interviewType: '' | 'online' | 'in-person';
  meetingLink: string;
  meetingId: string;
  meetingPasscode: string;
  location: string;
  interviewerId: string;
  notes: string;
}

type ViewMode = 'table' | 'calendar';
type CalendarView = 'day' | 'week';
type StatusFilter = 'all' | 'scheduled' | 'completed' | 'cancelled';

// ============================================================================
// Mock Data for Demo
// ============================================================================

const mockInterviews: ScheduledInterview[] = [
  {
    id: '1',
    applicantId: 'app1',
    applicantName: 'Sarah Johnson',
    applicantEmail: 'sarah.johnson@email.com',
    jobTitle: 'Senior Frontend Developer',
    interviewDate: '2026-03-25',
    interviewTime: '10:00',
    interviewType: 'online',
    meetingLink: 'https://meet.google.com/abc-defg-hij',
    interviewerId: 'int1',
    interviewerName: 'Michael Chen',
    status: 'scheduled',
    notes: 'Technical interview for React position',
    createdAt: '2026-03-20T10:00:00Z'
  },
  {
    id: '2',
    applicantId: 'app2',
    applicantName: 'James Wilson',
    applicantEmail: 'james.wilson@email.com',
    jobTitle: 'Product Manager',
    interviewDate: '2026-03-26',
    interviewTime: '14:00',
    interviewType: 'in-person',
    location: 'Conference Room A, Floor 3',
    interviewerId: 'int2',
    interviewerName: 'Emily Rodriguez',
    status: 'scheduled',
    notes: 'First round interview',
    createdAt: '2026-03-21T09:00:00Z'
  },
  {
    id: '3',
    applicantId: 'app3',
    applicantName: 'Lisa Anderson',
    applicantEmail: 'lisa.anderson@email.com',
    jobTitle: 'UX Designer',
    interviewDate: '2026-03-22',
    interviewTime: '11:00',
    interviewType: 'online',
    meetingLink: 'https://meet.google.com/xyz-uvwx-rst',
    interviewerId: 'int1',
    interviewerName: 'Michael Chen',
    status: 'completed',
    notes: 'Portfolio review completed',
    createdAt: '2026-03-18T14:00:00Z'
  },
  {
    id: '4',
    applicantId: 'app4',
    applicantName: 'Robert Martinez',
    applicantEmail: 'robert.martinez@email.com',
    jobTitle: 'Backend Developer',
    interviewDate: '2026-03-24',
    interviewTime: '09:00',
    interviewType: 'online',
    meetingLink: 'https://zoom.us/j/123456789',
    interviewerId: 'int3',
    interviewerName: 'David Kim',
    status: 'cancelled',
    notes: 'Candidate requested reschedule',
    createdAt: '2026-03-19T11:00:00Z'
  },
  {
    id: '5',
    applicantId: 'app5',
    applicantName: 'Jennifer Lee',
    applicantEmail: 'jennifer.lee@email.com',
    jobTitle: 'Senior Frontend Developer',
    interviewDate: '2026-03-27',
    interviewTime: '15:00',
    interviewType: 'in-person',
    location: 'Meeting Room B, Floor 2',
    interviewerId: 'int2',
    interviewerName: 'Emily Rodriguez',
    status: 'scheduled',
    notes: 'Final round interview',
    createdAt: '2026-03-22T16:00:00Z'
  }
];

const mockJobs: JobPosting[] = [
  { id: 'job1', title: 'Senior Frontend Developer', department: 'Engineering' },
  { id: 'job2', title: 'Product Manager', department: 'Product' },
  { id: 'job3', title: 'UX Designer', department: 'Design' },
  { id: 'job4', title: 'Backend Developer', department: 'Engineering' },
  { id: 'job5', title: 'Data Analyst', department: 'Analytics' }
];

const mockInterviewers = [
  { id: 'int1', name: 'Michael Chen', email: 'michael.chen@company.com' },
  { id: 'int2', name: 'Emily Rodriguez', email: 'emily.rodriguez@company.com' },
  { id: 'int3', name: 'David Kim', email: 'david.kim@company.com' },
  { id: 'int4', name: 'Jessica Taylor', email: 'jessica.taylor@company.com' }
];

// ============================================================================
// Status Badge Component
// ============================================================================

type InterviewDisplayStatus = 'pending' | 'scheduled' | 'completed' | 'cancelled';

function StatusBadge({ status }: { status: InterviewDisplayStatus }) {
  const configs = {
    pending: { bg: 'bg-purple-100', text: 'text-purple-700', icon: Clock, label: 'Pending' },
    scheduled: { bg: 'bg-blue-100', text: 'text-blue-700', icon: CalendarIcon, label: 'Scheduled' },
    completed: { bg: 'bg-green-100', text: 'text-green-700', icon: CheckCircle, label: 'Completed' },
    cancelled: { bg: 'bg-red-100', text: 'text-red-700', icon: X, label: 'Cancelled' }
  };

  const config = configs[status] || configs.pending;
  const Icon = config.icon;

  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${config.bg} ${config.text}`}>
      <Icon className="w-3 h-3 mr-1" />
      {config.label}
    </span>
  );
}

// ============================================================================
// Google Meet Link Generator
// ============================================================================

function generateMeetingLink(): string {
  // Return a placeholder indicating Teams meeting will be generated
  // The actual Teams link will be created by the backend via Microsoft Graph API
  return 'Teams Meeting (auto-generated after scheduling)';
}

// ============================================================================
// Action Button Component
// ============================================================================

function ActionButton({
  onClick,
  icon: Icon,
  title,
  variant = 'default'
}: {
  onClick: () => void;
  icon: React.ElementType;
  title: string;
  variant?: 'default' | 'danger' | 'success';
}) {
  const variants = {
    default: 'text-gray-400 hover:text-gray-600 hover:bg-gray-100',
    danger: 'text-gray-400 hover:text-red-600 hover:bg-red-50',
    success: 'text-gray-400 hover:text-green-600 hover:bg-green-50'
  };

  return (
    <button
      onClick={onClick}
      title={title}
      className={`p-1.5 rounded-lg transition-colors ${variants[variant]}`}
    >
      <Icon className="w-4 h-4" />
    </button>
  );
}

// ============================================================================
// Interview Modal Component
// ============================================================================

function InterviewModal({
  isOpen,
  onClose,
  onSave,
  interview,
  applicants,
  jobs,
  hrManagers,
  isScheduling = false,
  formData,
  setFormData
}: {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: InterviewFormData) => void;
  interview?: ScheduledInterview | null;
  applicants: Applicant[];
  jobs: JobPosting[];
  hrManagers?: HRManager[];
  isScheduling?: boolean;
  formData: InterviewFormData;
  setFormData: (data: InterviewFormData) => void;
}) {

  useEffect(() => {
    if (interview) {
      setFormData({
        applicantId: interview.applicantId,
        jobId: mockJobs.find(j => j.title === interview.jobTitle)?.job_id || '',
        interviewDate: interview.interviewDate || '',
        interviewTime: interview.interviewTime || '',
        interviewType: (interview.interviewType || '') as '' | 'online' | 'in-person',
        meetingLink: interview.meetingLink || '',
        meetingId: interview.meetingId || '',
        meetingPasscode: '',
        location: interview.location || '',
        interviewerId: interview.interviewerId || '',
        notes: interview.notes || ''
      });
    }
  }, [interview]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="fixed inset-0 bg-black/50 transition-opacity" onClick={onClose} />
        <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-gray-900">
              {interview ? 'Reschedule Interview' : 'Schedule Interview'}
            </h2>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Applicant Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Applicant Name <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.applicantId}
                onChange={(e) => {
                  const selectedId = e.target.value;
                  setFormData(prev => {
                    // Find the selected applicant
                    const selectedApp = applicants.find(a => a.id === selectedId);
                    
                    // Auto-fill job based on selected applicant's position
                    let jobIdValue = prev.jobId;
                    if (selectedApp?.position) {
                      // Try to find matching job in the jobs list
                      const matchingJob = jobs.find(j => j.title === selectedApp.position);
                      jobIdValue = matchingJob?.job_id || selectedApp.position;
                    }
                    
                    return { 
                      ...prev, 
                      applicantId: selectedId,
                      jobId: jobIdValue
                    };
                  });
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
              >
                <option value="">Select Applicant</option>
                {applicants.length > 0 ? (
                  applicants.map((app) => (
                    <option key={app.id} value={app.id}>
                      {app.name} - {app.position}
                    </option>
                  ))
                ) : (
                  <option value="app1">Sarah Johnson - Senior Frontend Developer</option>
                )}
              </select>
            </div>

            {/* Job Selection - Auto-filled based on applicant */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Job Applied <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={(() => {
                  const selectedApp = applicants.find(a => a.id === formData.applicantId);
                  return selectedApp?.position || '';
                })()}
                readOnly
                className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-600"
                placeholder="Select an applicant to auto-fill"
              />
            </div>

            {/* Date and Time */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Interview Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={formData.interviewDate}
                  onChange={(e) => setFormData({ ...formData, interviewDate: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Time <span className="text-red-500">*</span>
                </label>
                <input
                  type="time"
                  value={formData.interviewTime}
                  onChange={(e) => setFormData({ ...formData, interviewTime: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>
            </div>

            {/* Interview Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Interview Type <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.interviewType}
                onChange={(e) => {
                  const newType = e.target.value as 'online' | 'in-person';
                  setFormData({ 
                    ...formData, 
                    interviewType: newType,
                    // Clear meeting link when switching type
                    meetingLink: '',
                    meetingId: '',
                    meetingPasscode: '',
                    // Clear location when switching to online
                    location: newType === 'online' ? '' : formData.location
                  });
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
              >
                <option value="">Select Type</option>
                <option value="online">Online</option>
                <option value="in-person">In-person</option>
              </select>
            </div>

            {/* Meeting Link or Location */}
            {formData.interviewType === 'online' || formData.interviewType === '' ? (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Meeting Link
                </label>
                <input
                  type="url"
                  value={formData.meetingLink}
                  onChange={(e) => setFormData({ ...formData, meetingLink: e.target.value })}
                  placeholder={formData.interviewType === 'online' ? "Paste Teams meeting link here" : "Select Online type first"}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <div className="grid grid-cols-2 gap-4 mt-2">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Meeting ID
                    </label>
                    <input
                      type="text"
                      value={formData.meetingId}
                      onChange={(e) => setFormData({ ...formData, meetingId: e.target.value })}
                      placeholder="e.g., abcdefgh"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Meeting Passcode
                    </label>
                    <input
                      type="text"
                      value={formData.meetingPasscode}
                      onChange={(e) => setFormData({ ...formData, meetingPasscode: e.target.value })}
                      placeholder="e.g., rE9YH7Ca"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Location <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  placeholder="Conference Room, Floor, Building..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>
            )}

            {/* Interviewer */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Assign Hiring Manager / Interviewer <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.interviewerId}
                onChange={(e) => setFormData({ ...formData, interviewerId: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
              >
                <option value="">Select Interviewer</option>
                {(hrManagers && hrManagers.length > 0) ? (
                  hrManagers.map((interviewer) => (
                    <option key={interviewer.id} value={interviewer.id}>
                      {interviewer.name}
                    </option>
                  ))
                ) : (
                  // Fallback to mock data if hrManagers not available
                  mockInterviewers.map((interviewer) => (
                    <option key={interviewer.id} value={interviewer.id}>
                      {interviewer.name}
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Notes (Optional)
              </label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Add any additional notes..."
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
              />
            </div>

            {/* Buttons */}
            <div className="flex justify-end gap-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isScheduling}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isScheduling ? (
                  <>
                    <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Scheduling...
                  </>
                ) : (
                  interview ? 'Update Interview' : 'Schedule Interview'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// View Details Modal
// ============================================================================

function ViewDetailsModal({
  isOpen,
  onClose,
  interview,
  isManagerView = false,
  onSchedule,
  onHire,
  onReject
}: {
  isOpen: boolean;
  onClose: () => void;
  interview: ScheduledInterview | null;
  isManagerView?: boolean;
  onSchedule?: () => void;
  onHire?: () => void;
  onReject?: () => void;
}) {
  if (!isOpen || !interview) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="fixed inset-0 bg-black/50 transition-opacity" onClick={onClose} />
        <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-gray-900">Interview Details</h2>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                <User className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <h3 className="font-medium text-gray-900">{interview.applicantName}</h3>
                <p className="text-sm text-gray-500">{interview.applicantEmail}</p>
              </div>
            </div>

            <div className="border-t pt-4 space-y-3">
              <div className="flex items-center gap-3">
                <Briefcase className="w-4 h-4 text-gray-400" />
                <span className="text-sm text-gray-700">{interview.jobTitle}</span>
              </div>

              <div className="flex items-center gap-3">
                <CalendarIcon className="w-4 h-4 text-gray-400" />
                <span className="text-sm text-gray-700">
                  {interview.interviewDate ? new Date(interview.interviewDate).toLocaleDateString('en-US', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  }) : 'Not scheduled'}
                </span>
              </div>

              <div className="flex items-center gap-3">
                <Clock className="w-4 h-4 text-gray-400" />
                <span className="text-sm text-gray-700">{interview.interviewTime}</span>
              </div>

              <div className="flex items-center gap-3">
                {interview.interviewType === 'online' ? (
                  <Video className="w-4 h-4 text-gray-400" />
                ) : (
                  <MapPin className="w-4 h-4 text-gray-400" />
                )}
                <span className="text-sm text-gray-700">
                  {interview.interviewType === 'online' ? 'Online Interview' : 'In-person Interview'}
                </span>
              </div>

              {interview.interviewType === 'online' && interview.meetingLink && (
                <div className="flex items-center gap-3">
                  <ExternalLink className="w-4 h-4 text-gray-400" />
                  <a
                    href={interview.meetingLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-600 hover:text-blue-700 underline"
                  >
                    {interview.meetingLink}
                  </a>
                </div>
              )}

              {interview.interviewType === 'online' && interview.meetingId && (
                <div className="flex items-center gap-3">
                  <Video className="w-4 h-4 text-gray-400" />
                  <span className="text-sm text-gray-700">Meeting ID: {interview.meetingId}</span>
                </div>
              )}

              {interview.interviewType === 'online' && interview.meetingPasscode && (
                <div className="flex items-center gap-3">
                  <FileText className="w-4 h-4 text-gray-400" />
                  <span className="text-sm text-gray-700">Passcode: {interview.meetingPasscode}</span>
                </div>
              )}

              {interview.interviewType === 'in-person' && interview.location && (
                <div className="flex items-center gap-3">
                  <MapPin className="w-4 h-4 text-gray-400" />
                  <span className="text-sm text-gray-700">{interview.location}</span>
                </div>
              )}

              {interview.interviewerName && (
                <div className="flex items-center gap-3">
                  <Users className="w-4 h-4 text-gray-400" />
                  <span className="text-sm text-gray-700">{interview.interviewerName}</span>
                </div>
              )}

              <div className="pt-2">
                <StatusBadge status={interview.status} />
              </div>

              {/* Notes - Only visible to hiring managers */}
              {isManagerView && interview.notes && (
                <div className="border-t pt-3">
                  <p className="text-sm text-gray-500 mb-1">Notes</p>
                  <p className="text-sm text-gray-700">{interview.notes}</p>
                </div>
              )}
            </div>
          </div>

          <div className="mt-6 flex gap-3">
            {/* Pending status - Show Schedule button */}
            {interview.status === 'pending' && onSchedule && (
              <button
                onClick={() => {
                  onSchedule();
                  onClose();
                }}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
              >
                Schedule Interview
              </button>
            )}
            
            {/* Scheduled status - Show Hired/Rejected buttons */}
            {interview.status === 'scheduled' && (
              <>
                {onHire && (
                  <button
                    onClick={() => {
                      onHire();
                      onClose();
                    }}
                    className="flex-1 px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors"
                  >
                    Hired
                  </button>
                )}
                {onReject && (
                  <button
                    onClick={() => {
                      onReject();
                      onClose();
                    }}
                    className="flex-1 px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
                  >
                    Rejected
                  </button>
                )}
              </>
            )}
            
            {/* Default Close button */}
            {(interview.status !== 'pending' && interview.status !== 'scheduled') && (
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Close
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Helper Link component
function Link({ className, children }: { className?: string; children: React.ReactNode }) {
  return <span className={className}>{children}</span>;
}

// ============================================================================
// Calendar View Component
// ============================================================================

function CalendarViewComponent({
  interviews,
  currentDate,
  view,
  onInterviewClick
}: {
  interviews: ScheduledInterview[];
  currentDate: Date;
  view: CalendarView;
  onInterviewClick: (interview: ScheduledInterview) => void;
}) {
  const getDaysInWeek = (date: Date) => {
    const start = new Date(date);
    start.setDate(start.getDate() - start.getDay());
    const days = [];
    for (let i = 0; i < 7; i++) {
      const day = new Date(start);
      day.setDate(start.getDate() + i);
      days.push(day);
    }
    return days;
  };

  const getDaysInDay = (date: Date) => {
    return [date];
  };

  const days = view === 'week' ? getDaysInWeek(currentDate) : getDaysInDay(currentDate);
  const hours = Array.from({ length: 12 }, (_, i) => i + 8); // 8 AM to 7 PM

  const getInterviewsForDay = (day: Date) => {
    return interviews.filter((interview) => {
      if (!interview.interviewDate) return false;
      const interviewDate = new Date(interview.interviewDate);
      return (
        interviewDate.getDate() === day.getDate() &&
        interviewDate.getMonth() === day.getMonth() &&
        interviewDate.getFullYear() === day.getFullYear()
      );
    });
  };

  const getInterviewPosition = (time: string) => {
    const [hours, minutes] = time.split(':').map(Number);
    const top = ((hours - 8) * 60 + minutes) * (60 / 60); // 60px per hour
    return top;
  };

  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
      {/* Calendar Header */}
      <div className="border-b border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <h3 className="font-medium text-gray-900">
            {view === 'week' ? 'Week View' : 'Day View'} -{' '}
            {days.length === 1
              ? days[0].toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
              : `${days[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${days[days.length - 1].toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`}
          </h3>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="overflow-x-auto">
        <div className="min-w-[800px]">
          {/* Day Headers */}
          <div className="grid grid-cols-7 border-b border-gray-200">
            <div className="p-2 text-center text-xs font-medium text-gray-500 bg-gray-50"></div>
            {days.map((day, idx) => (
              <div
                key={idx}
                className={`p-2 text-center border-l border-gray-200 ${
                  day.toDateString() === new Date().toDateString() ? 'bg-blue-50' : 'bg-gray-50'
                }`}
              >
                <div className="text-xs text-gray-500">{weekDays[day.getDay()]}</div>
                <div className={`text-sm font-medium ${day.toDateString() === new Date().toDateString() ? 'text-blue-600' : 'text-gray-900'}`}>
                  {day.getDate()}
                </div>
              </div>
            ))}
          </div>

          {/* Time Grid */}
          <div className="relative">
            {hours.map((hour) => (
              <div key={hour} className="grid grid-cols-7 border-b border-gray-100">
                <div className="p-2 text-xs text-gray-500 text-right pr-3 bg-gray-50">
                  {hour > 12 ? hour - 12 : hour}:00 {hour >= 12 ? 'PM' : 'AM'}
                </div>
                {days.map((day, dayIdx) => {
                  const dayInterviews = getInterviewsForDay(day);
                  const hourInterview = dayInterviews.find((interview) => {
                    if (!interview.interviewTime) return false;
                    const [interviewHour] = interview.interviewTime.split(':').map(Number);
                    return interviewHour === hour;
                  });

                  return (
                    <div
                      key={dayIdx}
                      className={`relative min-h-[60px] border-l border-gray-100 p-1 ${
                        day.toDateString() === new Date().toDateString() ? 'bg-blue-50/30' : ''
                      }`}
                    >
                      {hourInterview && (
                        <button
                          onClick={() => onInterviewClick(hourInterview)}
                          className={`absolute left-1 right-1 px-2 py-1 rounded text-xs text-left overflow-hidden truncate ${
                            hourInterview.status === 'scheduled'
                              ? 'bg-blue-500 text-white'
                              : hourInterview.status === 'completed'
                              ? 'bg-green-500 text-white'
                              : 'bg-red-500 text-white'
                          }`}
                          style={{ top: '4px' }}
                        >
                          <div className="font-medium">{hourInterview.applicantName}</div>
                          <div className="opacity-80">{hourInterview.interviewTime}</div>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Main Interview Scheduling Component
// ============================================================================

export function InterviewScheduling({ preSelectedApplicantId, onPreSelectedConsumed }: { preSelectedApplicantId?: string | null; onPreSelectedConsumed?: () => void }) {
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [calendarView, setCalendarView] = useState<CalendarView>('week');
  const [interviews, setInterviews] = useState<ScheduledInterview[]>([]);
  const [selectedJob, setSelectedJob] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [dateFilter, setDateFilter] = useState<string>('');
  const [currentPage, setCurrentPage] = useState(1);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [editingInterview, setEditingInterview] = useState<ScheduledInterview | null>(null);
  const [viewingInterview, setViewingInterview] = useState<ScheduledInterview | null>(null);
  const [currentCalendarDate, setCurrentCalendarDate] = useState(new Date());
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [hrManagers, setHRManagers] = useState<HRManager[]>([]);
  const [jobs, setJobs] = useState<JobPosting[]>([]);
  const [loading, setLoading] = useState(true);
  const [isScheduling, setIsScheduling] = useState(false);
  const [notification, setNotification] = useState<{type: 'success' | 'error', message: string} | null>(null);
  const [formData, setFormData] = useState<InterviewFormData>({
    applicantId: '',
    jobId: '',
    interviewDate: '',
    interviewTime: '',
    interviewType: '' as '' | 'online' | 'in-person',
    meetingLink: '',
    meetingId: '',
    meetingPasscode: '',
    location: '',
    interviewerId: '',
    notes: ''
  });

  const itemsPerPage = 5;

  useEffect(() => {
    loadData();
  }, []);

  // Pre-fill modal when applicants are loaded and a preSelectedApplicantId prop is provided
  useEffect(() => {
    if (preSelectedApplicantId && applicants.length > 0) {
      const applicant = applicants.find(a => a.id === preSelectedApplicantId);
      if (applicant) {
        const matchedJob = jobs.find(j => j.title === applicant.position);
        setFormData({
          applicantId: applicant.id,
          jobId: matchedJob?.job_id || '',
          interviewDate: '',
          interviewTime: '',
          interviewType: '' as '' | 'online' | 'in-person',
          meetingLink: '',
          meetingId: '',
          meetingPasscode: '',
          location: '',
          interviewerId: '',
          notes: ''
        });
        setShowScheduleModal(true);
        onPreSelectedConsumed?.();
      }
    }
  }, [preSelectedApplicantId, applicants, jobs]);

  const loadData = async () => {
    try {
      setLoading(true);
      const adminClient = getSupabaseAdminClient();

      // Load applicants for the dropdown
      const { data: applicantsData } = await adminClient
        .from('applicants')
        .select('*')
        .order('created_at', { ascending: false });

      if (applicantsData) {
        setApplicants(applicantsData);
      }

      // Load HR managers for the interviewer dropdown
      const { data: hrManagersData } = await adminClient
        .from('hr_managers')
        .select('*')
        .eq('is_active', true)
        .order('name', { ascending: true });

      if (hrManagersData) {
        setHRManagers(hrManagersData);
      }

      // Load job postings for the filter dropdown
      const { data: jobsData } = await adminClient
        .from('job_postings')
        .select('*')
        .eq('is_active', true)
        .order('title', { ascending: true });

      if (jobsData) {
        setJobs(jobsData);
      }

      // Load scheduled interviews from the database only
      const { data: scheduledData, error: scheduledError } = await adminClient
        .from('scheduled_interviews')
        .select(`
          *,
          applicant:applicant_id(name, email, position),
          interviewer:interviewer_id(name, email),
          job:job_id(title)
        `)
        .order('interview_date', { ascending: true });

      // Only add scheduled interviews
      const combinedInterviews: ScheduledInterview[] = [];

      if (scheduledData && scheduledData.length > 0) {
        for (const record of scheduledData) {
          combinedInterviews.push({
            id: record.id,
            applicantId: record.applicant_id,
            applicantName: record.applicant?.name || 'Unknown',
            applicantEmail: record.applicant?.email || '',
            jobTitle: record.job?.title || record.applicant?.position || 'Unknown',
            interviewDate: record.interview_date,
            interviewTime: record.interview_time,
            interviewType: record.interview_type,
            meetingLink: record.meeting_link || undefined,
            meetingId: (record as any).meeting_id || undefined,
            meetingPasscode: record.meeting_passcode || undefined,
            location: record.location || undefined,
            interviewerId: record.interviewer_id,
            interviewerName: record.interviewer?.name || undefined,
            status: record.status,
            notes: record.notes || undefined,
            createdAt: record.created_at
          });
        }
      }

      // Set the interviews
      setInterviews(combinedInterviews);
    } catch (error) {
      console.error('Error loading data:', error);
      // Set empty on error - don't show mock data
      setInterviews([]);
    } finally {
      setLoading(false);
    }
  };

  // Filter interviews
  const filteredInterviews = useMemo(() => {
    return interviews.filter((interview) => {
      // Job filter
      if (selectedJob !== 'all' && interview.jobTitle !== selectedJob) {
        return false;
      }

      // Search filter
      if (
        searchQuery &&
        !interview.applicantName.toLowerCase().includes(searchQuery.toLowerCase())
      ) {
        return false;
      }

      // Status filter
      if (statusFilter !== 'all' && interview.status !== statusFilter) {
        return false;
      }

      // Date filter
      if (dateFilter && interview.interviewDate !== dateFilter) {
        return false;
      }

      return true;
    });
  }, [interviews, selectedJob, searchQuery, statusFilter, dateFilter]);

  // Pagination
  const totalPages = Math.ceil(filteredInterviews.length / itemsPerPage);
  const paginatedInterviews = filteredInterviews.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handleScheduleInterview = async (data: InterviewFormData) => {
    const selectedApplicant = applicants.find((a) => a.id === data.applicantId);
    const selectedJobPosting = jobs.find((j) => j.job_id === data.jobId);
    const selectedInterviewer = hrManagers.find((i) => i.id === data.interviewerId);

    // Get job title from applicant position directly (more reliable)
    const jobTitle = selectedApplicant?.position || selectedJobPosting?.title || 'Unknown Position';

    // Show loading state
    setIsScheduling(true);
    setNotification(null);

    try {
      // Call the Flask API to schedule the interview
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000';
      const response = await fetch(`${apiUrl}/api/schedule-interview`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          applicant_email: selectedApplicant?.email || '',
          applicant_name: selectedApplicant?.name || data.applicantId,
          position: jobTitle,
          interview_date: data.interviewDate,
          interview_time: data.interviewTime,
          interview_type: data.interviewType,
          meeting_link: data.meetingLink || '',
          meeting_id: data.meetingId || '',
          meeting_passcode: data.meetingPasscode || '',
          location: data.location || '',
          interviewer_name: selectedInterviewer?.name || '',
          interviewer_email: selectedInterviewer?.email || '',
          interview_notes: data.notes || '',
          duration_minutes: 60
        })
      });

      const result = await response.json();

      if (result.success || result.email_sent) {
        // Validate interview type
        if (!data.interviewType) {
          setNotification({ type: 'error', message: 'Please select an interview type' });
          setIsScheduling(false);
          return;
        }

        // Build the interview object
        const newInterview: ScheduledInterview = {
          id: result.calendar_event_id || `interview-${Date.now()}`,
          applicantId: data.applicantId,
          applicantName: selectedApplicant?.name || 'Unknown Applicant',
          applicantEmail: selectedApplicant?.email || '',
          jobTitle: selectedJobPosting?.title || 'Unknown Position',
          interviewDate: data.interviewDate,
          interviewTime: data.interviewTime,
          interviewType: data.interviewType as 'online' | 'in-person',
          meetingLink: result.meet_link || data.meetingLink || undefined,
          meetingId: data.meetingId || undefined,
          meetingPasscode: data.meetingPasscode || undefined,
          location: data.location || undefined,
          interviewerId: data.interviewerId || undefined,
          interviewerName: selectedInterviewer?.name,
          status: 'scheduled',
          notes: data.notes,
          createdAt: new Date().toISOString()
        };

        // Save to database
        try {
          const adminClient = getSupabaseAdminClient();
          const insertData: any = {
            applicant_id: data.applicantId,
            interviewer_id: data.interviewerId || null,
            job_id: data.jobId || null,
            interview_date: data.interviewDate,
            interview_time: data.interviewTime,
            interview_type: data.interviewType,
            meeting_link: data.meetingLink || null,
            meeting_passcode: data.meetingPasscode || null,
            location: data.location || null,
            status: 'scheduled',
            notes: data.notes || null
          };
          // Add meeting_id if column exists
          if (data.meetingId) {
            insertData.meeting_id = data.meetingId;
          }
          await adminClient.from('scheduled_interviews').insert(insertData);
        } catch (dbError) {
          console.log('Could not save to scheduled_interviews table:', dbError);
        }

        setInterviews((prev) => [...prev, newInterview]);

        // Show success notification
        let message = 'Interview scheduled successfully!';
        if (result.calendar_created && result.email_sent) {
          message = 'Interview scheduled! Calendar event created and email sent to applicant.';
        } else if (result.calendar_created) {
          message = 'Interview scheduled! Calendar event created but email failed.';
        } else if (result.email_sent) {
          message = 'Interview scheduled! Email sent but calendar event creation failed.';
        }
        setNotification({ type: 'success', message });
      } else {
        setNotification({ type: 'error', message: result.error || 'Failed to schedule interview' });
      }
    } catch (error) {
      console.error('Error scheduling interview:', error);
      setNotification({ type: 'error', message: 'Failed to schedule interview. Please check if the API server is running.' });
    } finally {
      setIsScheduling(false);
    }
  };

  const handleCancelInterview = async (interviewId: string) => {
    if (confirm('Are you sure you want to cancel this interview?')) {
      // Update in database
      try {
        const adminClient = getSupabaseAdminClient();
        await adminClient
          .from('scheduled_interviews')
          .update({ status: 'cancelled', updated_at: new Date().toISOString() })
          .eq('id', interviewId);
      } catch (dbError) {
        console.log('Could not update scheduled_interviews table:', dbError);
      }
      
      setInterviews((prev) =>
        prev.map((interview) =>
          interview.id === interviewId ? { ...interview, status: 'cancelled' as const } : interview
        )
      );
    }
  };

  const handleMarkCompleted = (interviewId: string) => {
    setInterviews((prev) =>
      prev.map((interview) =>
        interview.id === interviewId ? { ...interview, status: 'completed' as const } : interview
      )
    );
  };

  const handleMarkHired = async (applicantId: string) => {
    if (!confirm('Are you sure you want to mark this applicant as HIRED? This will update their status and send a confirmation email.')) {
      return;
    }
    
    setNotification(null);
    
    try {
      const adminClient = getSupabaseAdminClient();
      
      // Update applicant's status to hired
      await adminClient
        .from('applicants')
        .update({ status: 'hired', updated_at: new Date().toISOString() })
        .eq('id', applicantId);
      
      // Optionally notify the applicant via API
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000';
      try {
        await fetch(`${apiUrl}/api/send-hired-notification`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ applicant_id: applicantId })
        });
      } catch (apiError) {
        console.log('Could not send hired notification email:', apiError);
      }
      
      setNotification({ type: 'success', message: 'Applicant marked as HIRED! Confirmation email sent.' });
      setViewingInterview(null);
      loadData();
    } catch (error) {
      console.error('Error marking applicant as hired:', error);
      setNotification({ type: 'error', message: 'Failed to mark applicant as hired.' });
    }
  };

  const handleMarkRejected = async (applicantId: string) => {
    if (!confirm('Are you sure you want to mark this applicant as REJECTED?')) {
      return;
    }
    
    setNotification(null);
    
    try {
      const adminClient = getSupabaseAdminClient();
      
      // Update applicant's status to rejected
      await adminClient
        .from('applicants')
        .update({ status: 'rejected', updated_at: new Date().toISOString() })
        .eq('id', applicantId);
      
      setNotification({ type: 'success', message: 'Applicant marked as REJECTED.' });
      setViewingInterview(null);
      loadData();
    } catch (error) {
      console.error('Error marking applicant as rejected:', error);
      setNotification({ type: 'error', message: 'Failed to mark applicant as rejected.' });
    }
  };

  const handleEditInterview = (interview: ScheduledInterview) => {
    setEditingInterview(interview);
    setShowScheduleModal(true);
  };

  const navigateCalendar = (direction: 'prev' | 'next') => {
    const newDate = new Date(currentCalendarDate);
    if (calendarView === 'week') {
      newDate.setDate(newDate.getDate() + (direction === 'next' ? 7 : -7));
    } else {
      newDate.setDate(newDate.getDate() + (direction === 'next' ? 1 : -1));
    }
    setCurrentCalendarDate(newDate);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Interview Scheduling</h1>
        <p className="text-sm text-gray-500 mt-1">
          Manage and schedule interviews for shortlisted candidates
        </p>
      </div>

      {/* Notification Banner */}
      {notification && (
        <div className={`p-4 rounded-lg border ${
          notification.type === 'success' 
            ? 'bg-green-50 border-green-200 text-green-800' 
            : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {notification.type === 'success' ? (
                <CheckCircle className="w-5 h-5" />
              ) : (
                <X className="w-5 h-5" />
              )}
              <span>{notification.message}</span>
            </div>
            <button 
              onClick={() => setNotification(null)}
              className="text-sm hover:opacity-70"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Top Section: Filters and Actions */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4">
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Left side: Filters */}
          <div className="flex-1 flex flex-col sm:flex-row gap-3">
            {/* Job Selector */}
            <div className="w-full sm:w-48">
              <select
                value={selectedJob}
                onChange={(e) => setSelectedJob(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="all">All Jobs</option>
                {jobs.map((job) => (
                  <option key={job.job_id} value={job.title}>
                    {job.title}
                  </option>
                ))}
              </select>
            </div>

            {/* Search Bar */}
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search by applicant name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* Status Filter */}
            <div className="w-full sm:w-40">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="all">All Status</option>
                <option value="scheduled">Scheduled</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>

            {/* Date Filter */}
            <div className="w-full sm:w-40">
              <input
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          {/* Right side: Actions */}
          <div className="flex items-center gap-3">
            {/* View Toggle */}
            <div className="flex bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setViewMode('table')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  viewMode === 'table'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <List className="w-4 h-4" />
                Table
              </button>
              <button
                onClick={() => setViewMode('calendar')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  viewMode === 'calendar'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <CalendarDays className="w-4 h-4" />
                Calendar
              </button>
            </div>

            {/* Schedule Interview Button */}
            <button
              onClick={() => {
                setEditingInterview(null);
                setShowScheduleModal(true);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Schedule Interview
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      {viewMode === 'table' ? (
        /* Table View */
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          {loading ? (
            /* Loading State */
            <div className="flex flex-col items-center justify-center py-16 px-4">
              <svg className="animate-spin h-12 w-12 text-blue-600 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <h3 className="text-lg font-medium text-gray-900 mb-1">Loading interviews...</h3>
              <p className="text-sm text-gray-500">Fetching scheduled interviews and candidates</p>
            </div>
          ) : filteredInterviews.length === 0 ? (
            /* Empty State */
            <div className="flex flex-col items-center justify-center py-16 px-4">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                <CalendarIcon className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-1">No interviews scheduled yet</h3>
              <p className="text-sm text-gray-500 text-center mb-4">
                Start by scheduling an interview with a shortlisted candidate
              </p>
              <button
                onClick={() => setShowScheduleModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Schedule Interview
              </button>
            </div>
          ) : (
            <>
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Name
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Job Applied
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Interview Date
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Time
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Type
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Interviewer
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {paginatedInterviews.map((interview) => (
                    <tr 
                      key={interview.id} 
                      className="hover:bg-gray-50 transition-colors cursor-pointer"
                      onClick={() => setViewingInterview(interview)}
                    >
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setViewingInterview(interview)}
                          className="flex items-center gap-2 text-left hover:text-blue-600 transition-colors"
                        >
                          <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                            <span className="text-xs font-medium text-blue-600">
                              {interview.applicantName
                                .split(' ')
                                .map((n) => n[0])
                                .join('')}
                            </span>
                          </div>
                          <div>
                            <div className="text-sm font-medium text-gray-900">
                              {interview.applicantName}
                            </div>
                            <div className="text-xs text-gray-500">{interview.applicantEmail}</div>
                          </div>
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-gray-700">{interview.jobTitle}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-gray-700">
                          {interview.interviewDate ? new Date(interview.interviewDate).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric'
                          }) : '-'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-gray-700">{interview.interviewTime || '-'}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          {interview.interviewType === 'online' ? (
                            <Video className="w-4 h-4 text-gray-400" />
                          ) : (
                            <MapPin className="w-4 h-4 text-gray-400" />
                          )}
                          <span className="text-sm text-gray-700 capitalize">
                            {interview.interviewType === 'online' ? 'Online' : 'In-person'}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-gray-700">
                          {interview.interviewerName || '-'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={interview.status} />
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-gray-400">Click row for details</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
                  <div className="text-sm text-gray-500">
                    Showing {(currentPage - 1) * itemsPerPage + 1} to{' '}
                    {Math.min(currentPage * itemsPerPage, filteredInterviews.length)} of{' '}
                    {filteredInterviews.length} results
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="p-1.5 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                      <button
                        key={page}
                        onClick={() => setCurrentPage(page)}
                        className={`w-8 h-8 rounded-lg text-sm font-medium ${
                          currentPage === page
                            ? 'bg-blue-600 text-white'
                            : 'text-gray-700 hover:bg-gray-100'
                        }`}
                      >
                        {page}
                      </button>
                    ))}
                    <button
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      className="p-1.5 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        /* Calendar View */
        <div className="space-y-4">
          {/* Calendar Controls */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={() => navigateCalendar('prev')}
                className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => navigateCalendar('next')}
                className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => setCurrentCalendarDate(new Date())}
                className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                Today
              </button>
            </div>
            <div className="flex bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setCalendarView('day')}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  calendarView === 'day'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Day
              </button>
              <button
                onClick={() => setCalendarView('week')}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  calendarView === 'week'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Week
              </button>
            </div>
          </div>

          <CalendarViewComponent
            interviews={filteredInterviews}
            currentDate={currentCalendarDate}
            view={calendarView}
            onInterviewClick={setViewingInterview}
          />
        </div>
      )}

      {/* Schedule/Edit Interview Modal */}
      <InterviewModal
        isOpen={showScheduleModal}
        onClose={() => {
          setShowScheduleModal(false);
          setEditingInterview(null);
          setFormData({
            applicantId: '',
            jobId: '',
            interviewDate: '',
            interviewTime: '',
            interviewType: '' as '' | 'online' | 'in-person',
            meetingLink: '',
            meetingId: '',
            meetingPasscode: '',
            location: '',
            interviewerId: '',
            notes: ''
          });
        }}
        onSave={handleScheduleInterview}
        interview={editingInterview}
        applicants={applicants}
        jobs={mockJobs}
        hrManagers={hrManagers}
        isScheduling={isScheduling}
        formData={formData}
        setFormData={setFormData}
      />

      {/* View Details Modal */}
      <ViewDetailsModal
        isOpen={!!viewingInterview}
        onClose={() => setViewingInterview(null)}
        interview={viewingInterview}
        isManagerView={true}
        onSchedule={() => {
          if (viewingInterview) {
            setShowScheduleModal(true);
          }
        }}
        onHire={viewingInterview ? () => handleMarkHired(viewingInterview.applicantId) : undefined}
        onReject={viewingInterview ? () => handleMarkRejected(viewingInterview.applicantId) : undefined}
      />
    </div>
  );
}

