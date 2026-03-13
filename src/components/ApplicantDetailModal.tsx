import { useState, useEffect } from 'react';
import {
  X,
  Mail,
  Phone,
  MapPin,
  Calendar,
  Briefcase,
  FileText,
  Video,
  ClipboardCheck,
  Star,
  Send,
  Tag,
  Clock,
  CheckCircle,
  AlertCircle,
  ChevronRight,
  MessageSquare,
  Trash2,
  Edit3,
  Plus,
  Download,
  ExternalLink,
  User
} from 'lucide-react';
import { Applicant, Resume, VideoAssessment, PersonalityTest, ResumeParsedData } from '../lib/supabase';
import { 
  getWorkStyleResult, 
  calculateAlignmentScore,
  calculateDimensionScores,
  DIMENSION_LABELS,
  WorkStyleAnswer
} from '../config/workStyleConfig';

interface ApplicantWithDetails extends Applicant {
  resume?: Resume;
  video?: VideoAssessment;
  test?: PersonalityTest;
  resumeScore?: number;
  videoScore?: number;
  profileFit?: number;
  overall?: number;
  status?: string;
}

interface ApplicantDetailModalProps {
  applicant: ApplicantWithDetails | null;
  isOpen: boolean;
  onClose: () => void;
  onStatusChange?: (id: string, status: string) => void;
  onAddNote?: (id: string, note: string) => void;
  onAddTag?: (id: string, tag: string) => void;
  onRemoveTag?: (id: string, tag: string) => void;
  onSendEmail?: (id: string, template: string) => void;
}

// Helper to parse resume data
function getParsedResumeData(resume: Resume | undefined): ResumeParsedData | null {
  if (!resume?.parsed_data) return null;
  if (typeof resume.parsed_data === 'object') return resume.parsed_data;
  try {
    return JSON.parse(resume.parsed_data);
  } catch {
    return null;
  }
}

// Available tags
const AVAILABLE_TAGS = ['Priority', 'Referral', 'Follow-up', 'Top Pick', 'Fast Track', 'Interview Scheduled', 'Background Check', 'Offer Sent'];

// Email templates
const EMAIL_TEMPLATES = [
  { id: 'interview_invite', name: 'Interview Invitation', subject: 'Interview Invitation - {{position}}' },
  { id: 'assessment_reminder', name: 'Assessment Reminder', subject: 'Reminder: Complete Your Assessment' },
  { id: 'rejection', name: 'Rejection Email', subject: 'Update on Your Application' },
  { id: 'offer', name: 'Offer Letter', subject: 'Job Offer - {{position}}' },
  { id: 'follow_up', name: 'Follow Up', subject: 'Following Up on Your Application' },
];

export function ApplicantDetailModal({
  applicant,
  isOpen,
  onClose,
  onStatusChange,
  onAddNote,
  onAddTag,
  onRemoveTag,
  onSendEmail
}: ApplicantDetailModalProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'resume' | 'video' | 'test' | 'notes' | 'emails'>('overview');
  const [newNote, setNewNote] = useState('');
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [emailContent, setEmailContent] = useState('');
  const [notes, setNotes] = useState<Array<{ id: string; text: string; date: string; author: string }>>([]);
  const [emails, setEmails] = useState<Array<{ id: string; subject: string; date: string; type: string }>>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [showTagDropdown, setShowTagDropdown] = useState(false);

  // Load data from localStorage when applicant changes
  useEffect(() => {
    if (applicant) {
      const savedNotes = localStorage.getItem(`applicant_notes_${applicant.id}`);
      const savedEmails = localStorage.getItem(`applicant_emails_${applicant.id}`);
      const savedTags = localStorage.getItem(`applicant_tags_${applicant.id}`);
      
      if (savedNotes) setNotes(JSON.parse(savedNotes));
      if (savedEmails) setEmails(JSON.parse(savedEmails));
      if (savedTags) setTags(JSON.parse(savedTags));
    }
  }, [applicant]);

  // Save notes to localStorage
  const saveNotes = (newNotes: typeof notes) => {
    if (applicant) {
      localStorage.setItem(`applicant_notes_${applicant.id}`, JSON.stringify(newNotes));
      setNotes(newNotes);
    }
  };

  // Save emails to localStorage
  const saveEmails = (newEmails: typeof emails) => {
    if (applicant) {
      localStorage.setItem(`applicant_emails_${applicant.id}`, JSON.stringify(newEmails));
      setEmails(newEmails);
    }
  };

  // Save tags to localStorage
  const saveTags = (newTags: string[]) => {
    if (applicant) {
      localStorage.setItem(`applicant_tags_${applicant.id}`, JSON.stringify(newTags));
      setTags(newTags);
    }
  };

  const handleAddNote = () => {
    if (newNote.trim() && applicant) {
      const note = {
        id: Date.now().toString(),
        text: newNote.trim(),
        date: new Date().toISOString(),
        author: 'HR Manager'
      };
      const updatedNotes = [note, ...notes];
      saveNotes(updatedNotes);
      onAddNote?.(applicant.id, newNote);
      setNewNote('');
    }
  };

  const handleDeleteNote = (noteId: string) => {
    const updatedNotes = notes.filter(n => n.id !== noteId);
    saveNotes(updatedNotes);
  };

  const handleAddTag = (tag: string) => {
    if (!tags.includes(tag)) {
      const newTags = [...tags, tag];
      saveTags(newTags);
      onAddTag?.(applicant?.id || '', tag);
    }
    setShowTagDropdown(false);
  };

  const handleRemoveTag = (tag: string) => {
    const newTags = tags.filter(t => t !== tag);
    saveTags(newTags);
    onRemoveTag?.(applicant?.id || '', tag);
  };

  const handleSendEmail = () => {
    if (selectedTemplate && applicant) {
      const template = EMAIL_TEMPLATES.find(t => t.id === selectedTemplate);
      if (template) {
        const email = {
          id: Date.now().toString(),
          subject: template.subject.replace('{{position}}', applicant.position),
          date: new Date().toISOString(),
          type: template.name
        };
        const updatedEmails = [email, ...emails];
        saveEmails(updatedEmails);
        onSendEmail?.(applicant.id, selectedTemplate);
        setShowEmailModal(false);
        setSelectedTemplate('');
        setEmailContent('');
      }
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'submitted': return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'reviewed': return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case 'not_suitable': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    }
  };

  const getTagColor = (tag: string) => {
    const colors: Record<string, string> = {
      'Priority': 'bg-red-100 text-red-700 border-red-200',
      'Referral': 'bg-blue-100 text-blue-700 border-blue-200',
      'Follow-up': 'bg-yellow-100 text-yellow-700 border-yellow-200',
      'Top Pick': 'bg-purple-100 text-purple-700 border-purple-200',
      'Fast Track': 'bg-green-100 text-green-700 border-green-200',
      'Interview Scheduled': 'bg-indigo-100 text-indigo-700 border-indigo-200',
      'Background Check': 'bg-orange-100 text-orange-700 border-orange-200',
      'Offer Sent': 'bg-emerald-100 text-emerald-700 border-emerald-200',
    };
    return colors[tag] || 'bg-gray-100 text-gray-700 border-gray-200';
  };

  if (!isOpen || !applicant) return null;

  const parsedResume = getParsedResumeData(applicant.resume);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gradient-to-r from-blue-50 to-indigo-50">
          <div className="flex items-center gap-4">
            {applicant.photo_url ? (
              <img 
                src={applicant.photo_url} 
                alt={applicant.name}
                className="w-14 h-14 rounded-2xl object-cover shadow-lg"
              />
            ) : (
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xl font-bold shadow-lg">
                {applicant.name.charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <h2 className="text-xl font-bold text-gray-900">{applicant.name}</h2>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Briefcase className="w-4 h-4" />
                <span>{applicant.position}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Tags */}
            <div className="flex items-center gap-1 flex-wrap max-w-md justify-end">
              {tags.map(tag => (
                <span key={tag} className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${getTagColor(tag)}`}>
                  {tag}
                  <button onClick={() => handleRemoveTag(tag)} className="hover:text-red-500">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
              <div className="relative">
                <button
                  onClick={() => setShowTagDropdown(!showTagDropdown)}
                  className="p-1.5 hover:bg-gray-200 rounded-full transition-colors"
                >
                  <Plus className="w-4 h-4 text-gray-500" />
                </button>
                {showTagDropdown && (
                  <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-lg shadow-xl border border-gray-200 z-10">
                    {AVAILABLE_TAGS.filter(t => !tags.includes(t)).map(tag => (
                      <button
                        key={tag}
                        onClick={() => handleAddTag(tag)}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 first:rounded-t-lg last:rounded-b-lg"
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Quick Actions Bar */}
        <div className="px-6 py-3 border-b border-gray-200 bg-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`px-3 py-1.5 rounded-full text-sm font-medium border ${getStatusColor(applicant.status || 'pending')}`}>
              {applicant.status?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            <button
              onClick={() => setShowEmailModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
            >
              <Mail className="w-4 h-4" />
              <span className="hidden sm:inline">Send Email</span>
              <span className="sm:hidden">Email</span>
            </button>
            <button className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors text-sm">
              <Calendar className="w-4 h-4" />
              <span className="hidden sm:inline">Schedule Interview</span>
              <span className="sm:hidden">Schedule</span>
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="px-6 border-b border-gray-200 bg-gray-50">
          <div className="flex gap-1">
            {[
              { id: 'overview', label: 'Overview', icon: User },
              { id: 'resume', label: 'Resume', icon: FileText },
              { id: 'video', label: 'Video Assessment', icon: Video },
              { id: 'test', label: 'Personality Test', icon: ClipboardCheck },
              { id: 'notes', label: `Notes (${notes.length})`, icon: MessageSquare },
              { id: 'emails', label: `Emails (${emails.length})`, icon: Mail },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-blue-600 text-blue-600 bg-white'
                    : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Scores Overview */}
              <div className="grid grid-cols-4 gap-4">
                {[
                  { label: 'Resume Score', score: applicant.resumeScore, icon: FileText, color: 'emerald' },
                  { label: 'Video Score', score: applicant.videoScore, icon: Video, color: 'purple' },
                  { label: 'Profile Fit', score: applicant.profileFit, icon: ClipboardCheck, color: 'orange' },
                  { label: 'Overall', score: applicant.overall, icon: Star, color: 'blue' },
                ].map((item, idx) => (
                  <div key={idx} className="bg-gray-50 rounded-xl p-4 text-center">
                    <div className={`w-10 h-10 mx-auto mb-2 rounded-lg bg-${item.color}-100 flex items-center justify-center`}>
                      <item.icon className={`w-5 h-5 text-${item.color}-600`} />
                    </div>
                    <p className="text-2xl font-bold text-gray-900">{item.score || '-'}</p>
                    <p className="text-xs text-gray-500">{item.label}</p>
                  </div>
                ))}
              </div>

              {/* Contact Info */}
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <h3 className="font-semibold text-gray-900 mb-4">Contact Information</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-3">
                    <Mail className="w-5 h-5 text-gray-400" />
                    <div>
                      <p className="text-sm text-gray-500">Email</p>
                      <p className="text-sm font-medium text-gray-900">{applicant.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Calendar className="w-5 h-5 text-gray-400" />
                    <div>
                      <p className="text-sm text-gray-500">Applied On</p>
                      <p className="text-sm font-medium text-gray-900">
                        {new Date(applicant.created_at).toLocaleDateString(undefined, { 
                          weekday: 'long', 
                          year: 'numeric', 
                          month: 'long', 
                          day: 'numeric' 
                        })}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Recent Activity */}
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <h3 className="font-semibold text-gray-900 mb-4">Recent Activity</h3>
                <div className="space-y-3">
                  {/* Build activity from applicant data */}
                  {(() => {
                    const activities: Array<{ id: string; type: string; icon: React.ReactNode; color: string; title: string; date: string }> = [];
                    
                    // Resume uploaded
                    if (applicant.resume?.uploaded_at) {
                      activities.push({
                        id: 'resume_upload',
                        type: 'resume',
                        icon: <FileText className="w-4 h-4" />,
                        color: 'text-emerald-500',
                        title: 'Resume uploaded',
                        date: applicant.resume.uploaded_at
                      });
                    }
                    
                    // Resume status
                    if (applicant.resume?.status) {
                      const statusMap: Record<string, string> = {
                        'pending': 'Resume pending review',
                        'parsing': 'Resume being parsed',
                        'parsed': 'Resume parsed successfully',
                        'suitable': 'Resume marked as suitable',
                        'not_suitable': 'Resume marked as not suitable',
                        'error': 'Resume parsing error'
                      };
                      activities.push({
                        id: 'resume_status',
                        type: 'resume',
                        icon: <FileText className="w-4 h-4" />,
                        color: 'text-blue-500',
                        title: statusMap[applicant.resume.status] || `Resume status: ${applicant.resume.status}`,
                        date: applicant.resume.parsed_at || applicant.resume.uploaded_at
                      });
                    }
                    
                    // Video assessment
                    if (applicant.video?.created_at) {
                      activities.push({
                        id: 'video_created',
                        type: 'video',
                        icon: <Video className="w-4 h-4" />,
                        color: 'text-purple-500',
                        title: 'Video assessment started',
                        date: applicant.video.created_at
                      });
                    }
                    
                    if (applicant.video?.submitted_at) {
                      const videoStatusMap: Record<string, string> = {
                        'pending': 'Video pending review',
                        'transcribing': 'Video being transcribed',
                        'transcribed': 'Video transcribed',
                        'completed': 'Video assessment completed',
                        'error': 'Video processing error'
                      };
                      activities.push({
                        id: 'video_submit',
                        type: 'video',
                        icon: <Video className="w-4 h-4" />,
                        color: 'text-purple-500',
                        title: videoStatusMap[applicant.video.status] || 'Video submitted',
                        date: applicant.video.submitted_at
                      });
                    }
                    
                    // Personality test
                    if (applicant.test?.created_at) {
                      activities.push({
                        id: 'test_created',
                        type: 'test',
                        icon: <ClipboardCheck className="w-4 h-4" />,
                        color: 'text-orange-500',
                        title: 'Personality test started',
                        date: applicant.test.created_at
                      });
                    }
                    
                    if (applicant.test?.submitted_at) {
                      activities.push({
                        id: 'test_submit',
                        type: 'test',
                        icon: <ClipboardCheck className="w-4 h-4" />,
                        color: 'text-orange-500',
                        title: applicant.test.status === 'completed' ? 'Personality test completed' : 'Personality test submitted',
                        date: applicant.test.submitted_at
                      });
                    }
                    
                    // Application date
                    if (applicant.created_at) {
                      activities.push({
                        id: 'application',
                        type: 'application',
                        icon: <User className="w-4 h-4" />,
                        color: 'text-gray-500',
                        title: `Applied for ${applicant.position}`,
                        date: applicant.created_at
                      });
                    }
                    
                    // Add notes
                    notes.slice(0, 3).forEach(note => {
                      activities.push({
                        id: note.id,
                        type: 'note',
                        icon: <MessageSquare className="w-4 h-4" />,
                        color: 'text-blue-500',
                        title: note.text.length > 50 ? note.text.substring(0, 50) + '...' : note.text,
                        date: note.date
                      });
                    });
                    
                    // Add emails
                    emails.slice(0, 2).forEach(email => {
                      activities.push({
                        id: email.id,
                        type: 'email',
                        icon: <Mail className="w-4 h-4" />,
                        color: 'text-emerald-500',
                        title: email.subject,
                        date: email.date
                      });
                    });
                    
                    // Sort by date descending
                    activities.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
                    
                    return activities.length > 0 ? (
                      activities.slice(0, 8).map(activity => (
                        <div key={activity.id} className="flex items-start gap-3 text-sm">
                          <div className={`mt-0.5 ${activity.color}`}>
                            {activity.icon}
                          </div>
                          <div>
                            <p className="text-gray-700">{activity.title}</p>
                            <p className="text-xs text-gray-400">
                              {new Date(activity.date).toLocaleDateString('en-US', { 
                                month: 'short', 
                                day: 'numeric',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </p>
                          </div>
                        </div>
                      ))
                    ) : null;
                  })()}
                  {notes.length === 0 && emails.length === 0 && !applicant.resume && !applicant.video && !applicant.test && (
                    <p className="text-gray-400 text-sm">No recent activity</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'resume' && parsedResume && (
            <div className="space-y-6">
              {/* Resume File Download */}
              {applicant.resume?.resume_url && (
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-200 p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                        <FileText className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900">Resume File</h3>
                        <p className="text-sm text-gray-500">View or download the original resume</p>
                      </div>
                    </div>
                    <a
                      href={applicant.resume.resume_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      <Download className="w-4 h-4" />
                      View Resume
                    </a>
                  </div>
                </div>
              )}

              {/* Education */}
              {parsedResume.education && parsedResume.education.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <h3 className="font-semibold text-gray-900 mb-3">Education</h3>
                  <div className="space-y-3">
                    {parsedResume.education.map((edu, idx) => (
                      <div key={idx} className="border-l-2 border-emerald-200 pl-4">
                        <p className="font-medium text-gray-900">{(edu as any).course_or_strand || (edu as any).degree || (edu as any).field || 'Education'}</p>
                        <p className="text-sm text-gray-600">{(edu as any).school || (edu as any).institution || 'Unknown School'}</p>
                        <p className="text-xs text-gray-400">{(edu as any).year_range || (edu as any).years || ''}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Skills */}
              {parsedResume.skills && (
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <h3 className="font-semibold text-gray-900 mb-3">Skills</h3>
                  
                  {/* Handle both old format (hard_skills/soft_skills) and new NER format (category-based dict) */}
                  {((parsedResume.skills as any).hard_skills || (parsedResume.skills as any).soft_skills) ? (
                    <>
                      {/* Hard Skills */}
                      {(parsedResume.skills as any).hard_skills && (parsedResume.skills as any).hard_skills.length > 0 && (
                        <div className="mb-4">
                          <h4 className="text-sm font-medium text-gray-700 mb-2">Hard Skills</h4>
                          <div className="flex flex-wrap gap-2">
                            {(parsedResume.skills as any).hard_skills.map((skill: string, idx: number) => (
                              <span key={idx} className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm">
                                {skill}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {/* Soft Skills */}
                      {(parsedResume.skills as any).soft_skills && (parsedResume.skills as any).soft_skills.length > 0 && (
                        <div>
                          <h4 className="text-sm font-medium text-gray-700 mb-2">Soft Skills</h4>
                          <div className="flex flex-wrap gap-2">
                            {(parsedResume.skills as any).soft_skills.map((skill: string, idx: number) => (
                              <span key={idx} className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm">
                                {skill}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    /* NER format: skills is a dict with categories */
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(parsedResume.skills as any).map(([category, skills]) => (
                        typeof skills === 'string' 
                          ? skills.split(',').map((skill: string, idx: number) => (
                              <span key={`${category}-${idx}`} className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm">
                                {skill.trim()}
                              </span>
                            ))
                          : Array.isArray(skills)
                            ? skills.map((skill: string, idx: number) => (
                                <span key={`${category}-${idx}`} className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm">
                                  {skill}
                                </span>
                              ))
                            : null
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Experience */}
              {parsedResume.experience && parsedResume.experience.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <h3 className="font-semibold text-gray-900 mb-3">Experience</h3>
                  <div className="space-y-3">
                    {parsedResume.experience.map((exp, idx) => (
                      <div key={idx} className="border-l-2 border-blue-200 pl-4">
                        <p className="font-medium text-gray-900">{(exp as any).role || (exp as any).title || 'Professional Experience'}</p>
                        <p className="text-sm text-gray-600">{(exp as any).company || (exp as any).organization || ''}</p>
                        <p className="text-xs text-gray-400">{(exp as any).years || (exp as any).duration || (exp as any).year_range || ''}</p>
                        {(exp as any).summary || (exp as any).description ? (
                          <p className="text-sm text-gray-500 mt-2">{(exp as any).summary || (exp as any).description}</p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Projects */}
              {parsedResume.projects && parsedResume.projects.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <h3 className="font-semibold text-gray-900 mb-3">Projects</h3>
                  <div className="space-y-4">
                    {parsedResume.projects.map((project, idx) => (
                      <div key={idx} className="border-l-2 border-purple-200 pl-4">
                        <p className="font-medium text-gray-900">{(project as any).name || (project as any).title || 'Untitled Project'}</p>
                        {(project as any).details && (
                          <p className="text-sm text-gray-600 mt-1">
                            {typeof (project as any).details === 'string' 
                              ? (project as any).details 
                              : Array.isArray((project as any).details) 
                                ? (project as any).details.join(' ') 
                                : JSON.stringify((project as any).details)}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Certifications & Trainings */}
              {parsedResume.trainings && parsedResume.trainings.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <h3 className="font-semibold text-gray-900 mb-3">Certifications & Trainings</h3>
                  <div className="space-y-2">
                    {parsedResume.trainings.map((training, idx) => (
                      <div key={idx} className="border-l-2 border-green-200 pl-4">
                        <p className="text-sm text-gray-700 font-medium">
                          {typeof training === 'string' 
                            ? training 
                            : training.title || JSON.stringify(training)}
                        </p>
                        {typeof training !== 'string' && training.date && (
                          <p className="text-xs text-gray-500 mt-1">{training.date}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'video' && (
            <div className="space-y-6">
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h3 className="font-semibold text-gray-900 mb-4">Video Assessment</h3>
                {applicant.video ? (
                  <div className="space-y-4">
                    <div className="aspect-video bg-gray-900 rounded-lg flex items-center justify-center">
                      {applicant.video.video_url ? (
                        <video 
                          src={applicant.video.video_url} 
                          controls 
                          className="w-full h-full rounded-lg"
                        />
                      ) : (
                        <div className="text-white text-center">
                          <Video className="w-12 h-12 mx-auto mb-2 opacity-50" />
                          <p>Video not available</p>
                        </div>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-gray-500">Status:</span>
                        <span className="ml-2 font-medium capitalize">{applicant.video.status}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Submitted:</span>
                        <span className="ml-2 font-medium">
                          {applicant.video.submitted_at 
                            ? new Date(applicant.video.submitted_at).toLocaleString() 
                            : 'Not submitted'}
                        </span>
                      </div>
                    </div>
                    {applicant.video.transcription && (
                      <div className="bg-gray-50 rounded-lg p-4">
                        <h4 className="font-medium text-gray-900 mb-2">Transcription</h4>
                        <p className="text-sm text-gray-600">{applicant.video.transcription}</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-gray-500 text-center py-8">No video assessment submitted yet</p>
                )}
              </div>
            </div>
          )}

          {activeTab === 'test' && (
            <div className="space-y-6">
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h3 className="font-semibold text-gray-900 mb-4">Work Style Assessment Results</h3>
                {applicant.test && applicant.test.status === 'submitted' ? (
                  <div className="space-y-4">
                    {/* Calculate Work Style Result */}
                    {(() => {
                      const answers: WorkStyleAnswer[] = applicant.test?.answers?.map((a: any) => ({
                        question: a.question,
                        answer: a.answer,
                      })) || [];
                      const dimensionScores = calculateDimensionScores(answers);
                      const targetPosition = applicant.position || 'Default';
                      const { score: alignmentScore, breakdown, matchedFamily } = calculateAlignmentScore(dimensionScores, targetPosition);
                      const result = getWorkStyleResult(answers, targetPosition);
                      
                      return (
                        <>
                          {/* Overall Alignment Score */}
                          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-6 border border-blue-100">
                            <div className="flex items-center justify-between mb-4">
                              <div>
                                <p className="text-sm text-gray-600 mb-1">Work Style Alignment Score</p>
                                <p className="text-4xl font-bold text-blue-700">{alignmentScore}%</p>
                              </div>
                              <div className="text-right">
                                <p className="text-sm text-gray-600">Target Role</p>
                                <p className="font-semibold text-gray-900">{applicant.position}</p>
                              </div>
                            </div>
                            <p className="text-xs text-gray-500 mt-2">
                              This score reflects self-reported work style tendencies and should be used only as a supplementary decision-support metric.
                            </p>
                          </div>

                          {/* Dimension Scores */}
                          <div className="bg-gray-50 rounded-lg p-4">
                            <h4 className="font-medium text-gray-900 mb-4">Dimension Scores</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              {dimensionScores.map((ds) => {
                                const normalizedScore = Math.round((ds.score / 5) * 100);
                                const barColor = normalizedScore >= 70 ? 'bg-green-500' : normalizedScore >= 50 ? 'bg-amber-500' : 'bg-red-500';
                                return (
                                  <div key={ds.dimension} className="flex items-center gap-3">
                                    <span className="text-sm text-gray-600 w-32 truncate">{DIMENSION_LABELS[ds.dimension]}</span>
                                    <div className="flex-1 bg-gray-200 rounded-full h-2">
                                      <div className={`h-2 rounded-full ${barColor}`} style={{ width: `${normalizedScore}%` }} />
                                    </div>
                                    <span className="text-sm font-medium text-gray-700 w-10">{normalizedScore}%</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          {/* Areas Summary */}
                          <div className="grid grid-cols-3 gap-4">
                            <div className="bg-green-50 rounded-lg p-4">
                              <p className="text-green-700 font-medium mb-2">Strong Areas</p>
                              <p className="text-sm text-green-600">
                                {result.strongAreas.length > 0 
                                  ? result.strongAreas.map(d => DIMENSION_LABELS[d]).join(', ') 
                                  : 'None'}
                              </p>
                            </div>
                            <div className="bg-amber-50 rounded-lg p-4">
                              <p className="text-amber-700 font-medium mb-2">Moderate Areas</p>
                              <p className="text-sm text-amber-600">
                                {result.moderateAreas.length > 0 
                                  ? result.moderateAreas.map(d => DIMENSION_LABELS[d]).join(', ') 
                                  : 'None'}
                              </p>
                            </div>
                            <div className="bg-red-50 rounded-lg p-4">
                              <p className="text-red-700 font-medium mb-2">Development Areas</p>
                              <p className="text-sm text-red-600">
                                {result.developmentAreas.length > 0 
                                  ? result.developmentAreas.map(d => DIMENSION_LABELS[d]).join(', ') 
                                  : 'None'}
                              </p>
                            </div>
                          </div>

                          {/* Submission Info */}
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div className="bg-blue-50 rounded-lg p-4">
                              <p className="text-blue-600 font-medium mb-1">Submitted On</p>
                              <p className="text-lg font-bold text-blue-700">
                                {applicant.test.submitted_at 
                                  ? new Date(applicant.test.submitted_at).toLocaleDateString() 
                                  : 'N/A'}
                              </p>
                            </div>
                            <div className="bg-purple-50 rounded-lg p-4">
                              <p className="text-purple-600 font-medium mb-1">Questions Answered</p>
                              <p className="text-lg font-bold text-purple-700">
                                {applicant.test.answers.length}
                              </p>
                            </div>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                ) : (
                  <p className="text-gray-500 text-center py-8">
                    {applicant.test 
                      ? 'Work Style assessment not completed yet' 
                      : 'No work style assessment data available'}
                  </p>
                )}
              </div>
            </div>
          )}

          {activeTab === 'notes' && (
            <div className="space-y-4">
              {/* Add Note */}
              <div className="bg-gray-50 rounded-xl p-4">
                <h3 className="font-semibold text-gray-900 mb-3">Add Note</h3>
                <textarea
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Type your note here..."
                  className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                  rows={3}
                />
                <div className="flex justify-end mt-2">
                  <button
                    onClick={handleAddNote}
                    disabled={!newNote.trim()}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Add Note
                  </button>
                </div>
              </div>

              {/* Notes List */}
              <div className="space-y-3">
                {notes.length > 0 ? (
                  notes.map(note => (
                    <div key={note.id} className="bg-white rounded-xl border border-gray-200 p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                            <User className="w-4 h-4 text-blue-600" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-900">{note.author}</p>
                            <p className="text-xs text-gray-500">
                              {new Date(note.date).toLocaleString()}
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => handleDeleteNote(note.id)}
                          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <p className="text-gray-700 text-sm pl-10">{note.text}</p>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 text-gray-400">
                    <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>No notes yet</p>
                    <p className="text-sm">Add a note to keep track of your thoughts</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'emails' && (
            <div className="space-y-4">
              {emails.length > 0 ? (
                emails.map(email => (
                  <div key={email.id} className="bg-white rounded-xl border border-gray-200 p-4">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                        <Mail className="w-5 h-5 text-emerald-600" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <h4 className="font-medium text-gray-900">{email.subject}</h4>
                          <span className="text-xs text-gray-500">
                            {new Date(email.date).toLocaleString()}
                          </span>
                        </div>
                        <p className="text-sm text-gray-500 mt-1">{email.type}</p>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-gray-400">
                  <Mail className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>No emails sent yet</p>
                  <button
                    onClick={() => setShowEmailModal(true)}
                    className="mt-2 text-blue-600 hover:underline"
                  >
                    Send your first email
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Email Modal */}
      {showEmailModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900">Send Email</h3>
              <button onClick={() => setShowEmailModal(false)} className="p-1 hover:bg-gray-100 rounded">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Template</label>
                <select
                  value={selectedTemplate}
                  onChange={(e) => setSelectedTemplate(e.target.value)}
                  className="w-full p-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select a template...</option>
                  {EMAIL_TEMPLATES.map(template => (
                    <option key={template.id} value={template.id}>{template.name}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">To</label>
                <input
                  type="text"
                  value={applicant?.email || ''}
                  disabled
                  className="w-full p-2.5 border border-gray-200 rounded-lg bg-gray-50 text-gray-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
                <input
                  type="text"
                  value={selectedTemplate ? EMAIL_TEMPLATES.find(t => t.id === selectedTemplate)?.subject.replace('{{position}}', applicant?.position || '') : ''}
                  disabled
                  className="w-full p-2.5 border border-gray-200 rounded-lg bg-gray-50 text-gray-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
                <textarea
                  value={emailContent}
                  onChange={(e) => setEmailContent(e.target.value)}
                  placeholder="Enter your message..."
                  rows={5}
                  className="w-full p-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
            </div>
            
            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setShowEmailModal(false)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSendEmail}
                disabled={!selectedTemplate}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Send className="w-4 h-4" />
                Send Email
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

