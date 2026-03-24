import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
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
  User,
  GraduationCap,
  Award,
  TrendingUp,
  TrendingDown,
  Target,
  Zap,
  Shield,
  AlertTriangle,
  Check,
  MoreHorizontal,
  ChevronDown,
  Inbox,
  Eye,
  Clock3,
  ArrowUpRight,
  Sparkles,
  Brain,
  MessageCircle,
  ListChecks
} from 'lucide-react';
import { Applicant, Resume, VideoAssessment, PersonalityTest, ResumeParsedData } from '../lib/supabase';
import { 
  getWorkStyleResult, 
  calculateAlignmentScore,
  calculateDimensionScores,
  DIMENSION_LABELS,
  WorkStyleAnswer,
  WorkStyleDimension
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
  applicantId?: string;
  applicant?: ApplicantWithDetails | null;
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

// Helper function to format timestamp from seconds to MM:SS
const formatTimestamp = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

// Email templates
const EMAIL_TEMPLATES = [
  { id: 'interview_invite', name: 'Interview Invitation', subject: 'Interview Invitation - {{position}}' },
  { id: 'assessment_reminder', name: 'Assessment Reminder', subject: 'Reminder: Complete Your Assessment' },
  { id: 'rejection', name: 'Rejection Email', subject: 'Update on Your Application' },
  { id: 'offer', name: 'Offer Letter', subject: 'Job Offer - {{position}}' },
  { id: 'follow_up', name: 'Follow Up', subject: 'Following Up on Your Application' },
];

// Status configurations
const STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string; dotColor: string }> = {
  passed: { label: 'Passed', color: 'text-emerald-700', bgColor: 'bg-emerald-50 border-emerald-200', dotColor: 'bg-emerald-500' },
  needs_review: { label: 'Needs Review', color: 'text-amber-700', bgColor: 'bg-amber-50 border-amber-200', dotColor: 'bg-amber-500' },
  failed: { label: 'Failed', color: 'text-red-700', bgColor: 'bg-red-50 border-red-200', dotColor: 'bg-red-500' },
  shortlisted: { label: 'Shortlisted', color: 'text-purple-700', bgColor: 'bg-purple-50 border-purple-200', dotColor: 'bg-purple-500' },
  pending: { label: 'Pending', color: 'text-gray-700', bgColor: 'bg-gray-50 border-gray-200', dotColor: 'bg-gray-500' },
  completed: { label: 'Completed', color: 'text-blue-700', bgColor: 'bg-blue-50 border-blue-200', dotColor: 'bg-blue-500' },
  submitted: { label: 'Submitted', color: 'text-indigo-700', bgColor: 'bg-indigo-50 border-indigo-200', dotColor: 'bg-indigo-500' },
  reviewed: { label: 'Reviewed', color: 'text-emerald-700', bgColor: 'bg-emerald-50 border-emerald-200', dotColor: 'bg-emerald-500' },
  not_suitable: { label: 'Not Suitable', color: 'text-red-700', bgColor: 'bg-red-50 border-red-200', dotColor: 'bg-red-500' },
};

const getStatusConfig = (status: string) => {
  return STATUS_CONFIG[status] || STATUS_CONFIG.pending;
};

const getTagColor = (tag: string) => {
  const colors: Record<string, string> = {
    'Priority': 'bg-red-100 text-red-700 border-red-200',
    'Referral': 'bg-blue-100 text-blue-700 border-blue-200',
    'Follow-up': 'bg-amber-100 text-amber-700 border-amber-200',
    'Top Pick': 'bg-purple-100 text-purple-700 border-purple-200',
    'Fast Track': 'bg-green-100 text-green-700 border-green-200',
    'Interview Scheduled': 'bg-indigo-100 text-indigo-700 border-indigo-200',
    'Background Check': 'bg-orange-100 text-orange-700 border-orange-200',
    'Offer Sent': 'bg-emerald-100 text-emerald-700 border-emerald-200',
  };
  return colors[tag] || 'bg-gray-100 text-gray-700 border-gray-200';
};

export function ApplicantDetailModal({
  applicantId,
  applicant: initialApplicant,
  isOpen,
  onClose,
  onStatusChange,
  onAddNote,
  onAddTag,
  onRemoveTag,
  onSendEmail
}: ApplicantDetailModalProps) {
  const [activeTab, setActiveTab] = useState<'summary' | 'resume' | 'video' | 'test' | 'notes' | 'emails'>('summary');
  const [newNote, setNewNote] = useState('');
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [emailContent, setEmailContent] = useState('');
  const [notes, setNotes] = useState<Array<{ id: string; text: string; date: string; author: string; tag?: string }>>([]);
  const [emails, setEmails] = useState<Array<{ id: string; subject: string; date: string; type: string; status: string }>>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [showTagDropdown, setShowTagDropdown] = useState(false);
  const [showActionsDropdown, setShowActionsDropdown] = useState(false);
  
  // Data fetching state
  const [applicant, setApplicant] = useState<ApplicantWithDetails | null>(initialApplicant || null);
  const [isLoading, setIsLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Fetch applicant data from Supabase
  const fetchApplicantData = async () => {
    // Use applicantId if provided, otherwise use applicant.id
    const id = applicantId || applicant?.id;
    if (!id) {
      setFetchError('No applicant ID provided');
      return;
    }
    
    setIsLoading(true);
    setFetchError(null);
    
    try {
      // Fetch applicant with related data
      const { data: applicantData, error: applicantError } = await supabase
        .from('applicants')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      
      if (applicantError) {
        console.error('Error fetching applicant:', applicantError);
        throw new Error(`Failed to fetch applicant: ${applicantError.message}`);
      }
      if (!applicantData) throw new Error('Applicant not found');
      
      // Fetch resume data
      const { data: resumeData } = await supabase
        .from('resumes')
        .select('*')
        .eq('applicant_id', id)
        .single();
      
      // Fetch video assessment
      const { data: videoData } = await supabase
        .from('video_assessments')
        .select('*')
        .eq('applicant_id', id)
        .single();
      
      // Fetch work style assessment - check work_style_assessments first, fallback to personality_tests
      let testData = null;
      const { data: workStyleData } = await supabase
        .from('work_style_assessments')
        .select('*')
        .eq('applicant_id', id)
        .maybeSingle();
      
      if (workStyleData) {
        testData = workStyleData;
      } else {
        // Fallback to old personality_tests table
        const { data: personalityData } = await supabase
          .from('personality_tests')
          .select('*')
          .eq('applicant_id', id)
          .single();
        testData = personalityData;
      }
      
      // Combine all data
      const fullApplicant: ApplicantWithDetails = {
        ...applicantData,
        resume: resumeData || undefined,
        video: videoData || undefined,
        test: testData || undefined,
      };
      
      setApplicant(fullApplicant);
      
      // Load local storage data
      const savedNotes = localStorage.getItem(`applicant_notes_${id}`);
      const savedEmails = localStorage.getItem(`applicant_emails_${id}`);
      const savedTags = localStorage.getItem(`applicant_tags_${id}`);
      
      if (savedNotes) setNotes(JSON.parse(savedNotes));
      if (savedEmails) setEmails(JSON.parse(savedEmails));
      if (savedTags) setTags(JSON.parse(savedTags));
      
    } catch (err) {
      console.error('Error fetching applicant data:', err);
      setFetchError(err instanceof Error ? err.message : 'Failed to load applicant data');
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch data when modal opens or applicantId changes
  useEffect(() => {
    if (isOpen) {
      // Reset to initial state
      setActiveTab('summary');
      setNotes([]);
      setEmails([]);
      setTags([]);
      
      // If we have an applicantId, fetch fresh data
      if (applicantId) {
        fetchApplicantData();
      } else if (initialApplicant) {
        // Use the pre-loaded applicant data
        setApplicant(initialApplicant);
        const savedNotes = localStorage.getItem(`applicant_notes_${initialApplicant.id}`);
        const savedEmails = localStorage.getItem(`applicant_emails_${initialApplicant.id}`);
        const savedTags = localStorage.getItem(`applicant_tags_${initialApplicant.id}`);
        
        if (savedNotes) setNotes(JSON.parse(savedNotes));
        if (savedEmails) setEmails(JSON.parse(savedEmails));
        if (savedTags) setTags(JSON.parse(savedTags));
      }
    }
  }, [isOpen, applicantId]);

  // Real-time subscription to applicant changes
  useEffect(() => {
    if (!isOpen || !applicant?.id) return;
    
    const channel = supabase
      .channel(`applicant-${applicant.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'applicants',
          filter: `id=eq.${applicant.id}`
        },
        (payload) => {
          // Update applicant with new data
          if (payload.new) {
            setApplicant(prev => prev ? { ...prev, ...payload.new } : null);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'resumes',
          filter: `applicant_id=eq.${applicant.id}`
        },
        (payload) => {
          if (payload.new) {
            setApplicant(prev => prev ? { ...prev, resume: payload.new as any } : null);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'video_assessments',
          filter: `applicant_id=eq.${applicant.id}`
        },
        (payload) => {
          if (payload.new) {
            setApplicant(prev => prev ? { ...prev, video: payload.new as any } : null);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'work_style_assessments',
          filter: `applicant_id=eq.${applicant.id}`
        },
        (payload) => {
          if (payload.new) {
            setApplicant(prev => prev ? { ...prev, test: payload.new as any } : null);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'personality_tests',
          filter: `applicant_id=eq.${applicant.id}`
        },
        (payload) => {
          if (payload.new) {
            setApplicant(prev => prev ? { ...prev, test: payload.new as any } : null);
          }
        }
      )
      .subscribe();
    
    return () => {
      supabase.removeChannel(channel);
    };
  }, [isOpen, applicant?.id]);

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
          type: template.name,
          status: 'sent'
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

  const getScoreLabel = (score: number | undefined): { label: string; color: string } => {
    if (score === undefined || score === null) return { label: 'No Data', color: 'text-gray-500' };
    if (score >= 80) return { label: 'Strong Match', color: 'text-emerald-600' };
    if (score >= 60) return { label: 'Moderate Fit', color: 'text-amber-600' };
    if (score >= 40) return { label: 'Needs Review', color: 'text-orange-600' };
    return { label: 'Low Match', color: 'text-red-600' };
  };

  const getScoreBarColor = (score: number | undefined): string => {
    if (score === undefined || score === null) return 'bg-gray-200';
    if (score >= 80) return 'bg-emerald-500';
    if (score >= 60) return 'bg-amber-500';
    if (score >= 40) return 'bg-orange-500';
    return 'bg-red-500';
  };

  const parsedResume = applicant ? getParsedResumeData(applicant.resume) : null;

  // Determine screening stage
  const getScreeningStage = (): 'pending' | 'processing' | 'completed' => {
    if (!applicant) return 'pending';
    
    const resumeStatus = applicant.resume?.status;
    const videoStatus = applicant.video?.status;
    const testStatus = applicant.test?.status;
    
    // Check if all major components are complete
    const resumeComplete = resumeStatus === 'parsed' || resumeStatus === 'suitable' || resumeStatus === 'not_suitable';
    const videoComplete = videoStatus === 'completed' || videoStatus === 'transcribed';
    const testComplete = testStatus === 'submitted';
    
    // If any component is still processing
    if (resumeStatus === 'pending' || resumeStatus === 'parsing' || 
        videoStatus === 'pending' || videoStatus === 'transcribing' ||
        (!testComplete && applicant.test)) {
      return 'processing';
    }
    
    // If at least resume is complete, consider it done for decision purposes
    if (resumeComplete) {
      return 'completed';
    }
    
    return 'pending';
  };

  const screeningStage = getScreeningStage();
  const isScreeningComplete = screeningStage === 'completed';

  // Generate key insights from available data
  const getKeyInsights = () => {
    const insights: Array<{ type: 'strength' | 'concern' | 'info'; icon: React.ReactNode; text: string }> = [];
    
    if (applicant?.resumeScore && applicant.resumeScore >= 70) {
      insights.push({
        type: 'strength',
        icon: <CheckCircle className="w-4 h-4" />,
        text: `Strong resume with ${Math.round(applicant.resumeScore)}% score`
      });
    }
    
    if (applicant?.videoScore && applicant.videoScore >= 70) {
      insights.push({
        type: 'strength',
        icon: <CheckCircle className="w-4 h-4" />,
        text: `Confident video presence (${Math.round(applicant.videoScore)}% score)`
      });
    }
    
    if (parsedResume?.experience && parsedResume.experience.length > 0) {
      insights.push({
        type: 'info',
        icon: <Briefcase className="w-4 h-4" />,
        text: `${parsedResume.experience.length} professional experience${parsedResume.experience.length > 1 ? 's' : ''} detected`
      });
    }
    
    if (parsedResume?.skills) {
      const skillCount = Object.values(parsedResume.skills as Record<string, string | string[]>).flat().length;
      insights.push({
        type: 'info',
        icon: <Award className="w-4 h-4" />,
        text: `${skillCount} skills identified`
      });
    }
    
    if (applicant?.overall && applicant.overall < 50) {
      insights.push({
        type: 'concern',
        icon: <AlertTriangle className="w-4 h-4" />,
        text: 'Overall score below threshold'
      });
    }
    
    if (!applicant?.video) {
      insights.push({
        type: 'concern',
        icon: <AlertCircle className="w-4 h-4" />,
        text: 'No video assessment submitted'
      });
    }
    
    if (!applicant?.test || applicant.test.status !== 'submitted') {
      insights.push({
        type: 'concern',
        icon: <AlertCircle className="w-4 h-4" />,
        text: 'Work profiling not completed'
      });
    }
    
    return insights;
  };

  // Get work style interpretation
  const getWorkStyleInterpretation = (dimension: string, score: number): string => {
    const normalized = Math.round((score / 5) * 100);
    const interpretations: Record<string, { high: string; medium: string; low: string }> = {
      structure: {
        high: 'Thrives in structured, organized environments with clear processes',
        medium: 'Comfortable with moderate structure and guidance',
        low: 'Prefers flexible, fluid work arrangements'
      },
      social_energy: {
        high: 'Energized by team collaboration and social interaction',
        medium: 'Balances team and independent work effectively',
        low: 'Prefers focused, independent work'
      },
      change_adaptation: {
        high: 'Thrives in dynamic, fast-changing environments',
        medium: 'Adaptable to moderate changes in priorities',
        low: 'Prefers stable, consistent work conditions'
      },
      achievement_orientation: {
        high: 'Highly motivated by measurable goals and achievements',
        medium: 'Driven by a mix of goals and process',
        low: 'More process-focused than target-driven'
      },
      learning_style: {
        high: 'Hands-on, practical learner who prefers experimentation',
        medium: 'Balances practical and theoretical learning',
        low: 'Prefers theoretical, conceptual learning approaches'
      }
    };
    
    const config = interpretations[dimension];
    if (!config) return '';
    
    if (normalized >= 70) return config.high;
    if (normalized >= 40) return config.medium;
    return config.low;
  };

  // Get high score trait label
  const getHighScoreTrait = (dimension: string): { label: string; type: 'high' } | null => {
    const traits: Record<string, string> = {
      structure: 'Prefers Structure',
      social_energy: 'Team-Oriented',
      change_adaptation: 'Adaptable',
      achievement_orientation: 'Goal-Driven',
      learning_style: 'Practical Learner',
      conflict_resolution: 'Collaborative',
      risk_tolerance: 'Comfortable with Risk',
      planning: 'Strategic',
      independence: 'Self-Directed',
      feedback_responsiveness: 'Receptive to Feedback',
      creativity: 'Creative',
      persistence: 'Persistent',
      adaptability: 'Flexible',
      leadership: 'Leadership Potential',
      teamwork: 'Team Player'
    };
    const label = traits[dimension];
    return label ? { label, type: 'high' as const } : null;
  };

  // Get low score trait label
  const getLowScoreTrait = (dimension: string): { label: string; type: 'low' } | null => {
    const traits: Record<string, string> = {
      structure: 'Flexible Approach',
      social_energy: 'Independent',
      change_adaptation: 'Prefers Stability',
      achievement_orientation: 'Process-Focused',
      learning_style: 'Theory-Oriented',
      conflict_resolution: 'Independent Resolver',
      risk_tolerance: 'Risk-Averse',
      planning: 'Spontaneous',
      independence: 'Collaborative',
      feedback_responsiveness: 'Self-Reliant',
      creativity: 'Practical',
      persistence: 'Adaptive',
      adaptability: 'Fixed Approach',
      leadership: 'Individual Contributor',
      teamwork: 'Independent'
    };
    const label = traits[dimension];
    return label ? { label, type: 'low' as const } : null;
  };

  // Format dimension name to readable label
  const formatDimensionLabel = (dimension: string): string => {
    // Check if DIMENSION_LABELS has it - cast to WorkStyleDimension for indexing
    if (dimension in DIMENSION_LABELS) return DIMENSION_LABELS[dimension as WorkStyleDimension];
    // Otherwise convert snake_case to Title Case
    return dimension
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  if (!isOpen) return null;
  
  // Show loading state
  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[92vh] overflow-hidden flex flex-col">
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-4" />
              <p className="text-gray-600 font-medium">Loading applicant data...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  // Show error state
  if (fetchError || !applicant) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[92vh] overflow-hidden flex flex-col">
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
              <p className="text-gray-900 font-semibold mb-2">Failed to load applicant</p>
              <p className="text-gray-500 text-sm mb-4">{fetchError || 'Applicant not found'}</p>
              <button
                onClick={fetchApplicantData}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium"
              >
                Try Again
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[92vh] overflow-hidden flex flex-col">
        
        {/* ===== HEADER SECTION ===== */}
        <div className="px-6 py-5 border-b border-gray-100 bg-gradient-to-r from-slate-50 to-white">
          <div className="flex items-start justify-between gap-6">
            {/* Left: Identity */}
            <div className="flex items-center gap-4 flex-1 min-w-0">
              {applicant.photo_url ? (
                <img 
                  src={applicant.photo_url} 
                  alt={applicant.name}
                  className="w-16 h-16 rounded-2xl object-cover shadow-lg ring-2 ring-white"
                />
              ) : (
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-slate-600 to-slate-800 flex items-center justify-center text-white text-2xl font-bold shadow-lg ring-2 ring-white">
                  {applicant.name.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-3 flex-wrap">
                  <h2 className="text-2xl font-bold text-gray-900">{applicant.name}</h2>
                  {/* Status Badge */}
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium border ${getStatusConfig(applicant.status || 'pending').bgColor} ${getStatusConfig(applicant.status || 'pending').color}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${getStatusConfig(applicant.status || 'pending').dotColor}`} />
                    {getStatusConfig(applicant.status || 'pending').label}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-1 text-gray-500">
                  <Briefcase className="w-4 h-4" />
                  <span className="text-sm">{applicant.position}</span>
                </div>
                {/* Tags */}
                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                  {tags.map(tag => (
                    <span key={tag} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${getTagColor(tag)}`}>
                      {tag}
                      <button onClick={() => handleRemoveTag(tag)} className="hover:text-red-500 ml-0.5">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                  <div className="relative">
                    <button
                      onClick={() => setShowTagDropdown(!showTagDropdown)}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border border-dashed border-gray-300 text-gray-500 hover:border-gray-400 hover:text-gray-600 transition-colors"
                    >
                      <Plus className="w-3 h-3" /> Add Tag
                    </button>
                    {showTagDropdown && (
                      <div className="absolute left-0 top-full mt-1 w-44 bg-white rounded-xl shadow-xl border border-gray-200 z-20 py-1">
                        {AVAILABLE_TAGS.filter(t => !tags.includes(t)).map(tag => (
                          <button
                            key={tag}
                            onClick={() => handleAddTag(tag)}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition-colors"
                          >
                            {tag}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Right: Overall Score - Only show when screening complete */}
            {isScreeningComplete ? (
              <div className="flex-shrink-0 text-center px-6 border-l border-gray-100">
                <div className="text-4xl font-bold text-gray-900">{applicant.overall ? Math.round(applicant.overall) : '-'}</div>
                <div className="text-xs text-gray-500 font-medium uppercase tracking-wide mt-1">Overall Score</div>
                {applicant.overall && (
                  <div className={`text-sm font-medium mt-1 ${getScoreLabel(applicant.overall).color}`}>
                    {getScoreLabel(applicant.overall).label}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex-shrink-0 text-center px-6 border-l border-gray-100">
                <div className="text-2xl font-bold text-gray-400">-</div>
                <div className="text-xs text-gray-400 font-medium uppercase tracking-wide mt-1">Awaiting</div>
              </div>
            )}

            {/* Close Button */}
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors flex-shrink-0">
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>
        </div>

        {/* ===== SCREENING STATUS BANNER ===== */}
        <div className={`px-6 py-3 border-b flex items-center justify-between gap-4 ${
          isScreeningComplete 
            ? 'bg-emerald-50/70 border-emerald-100' 
            : 'bg-amber-50/70 border-amber-100'
        }`}>
          <div className="flex items-center gap-3">
            {isScreeningComplete ? (
              <>
                <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center">
                  <CheckCircle className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-emerald-800">Screening Complete</p>
                  <p className="text-xs text-emerald-600">Ready for review and decision-making</p>
                </div>
              </>
            ) : (
              <>
                <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center">
                  <Clock className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-amber-800">Screening In Progress</p>
                  <p className="text-xs text-amber-600">
                    {screeningStage === 'pending' 
                      ? 'Awaiting initial processing' 
                      : 'AI evaluation in progress, no action needed yet'}
                  </p>
                </div>
              </>
            )}
          </div>
          {/* Screening Progress Indicator */}
          {!isScreeningComplete && (
            <div className="flex items-center gap-4 text-xs text-amber-700">
              <div className="flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-full ${applicant.resume?.status === 'parsed' ? 'bg-emerald-500' : 'bg-amber-400'}`} />
                <span>Resume</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-full ${applicant.video?.status === 'completed' ? 'bg-emerald-500' : 'bg-amber-400'}`} />
                <span>Video</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-full ${applicant.test?.status === 'submitted' ? 'bg-emerald-500' : 'bg-amber-400'}`} />
                <span>Profiling</span>
              </div>
            </div>
          )}
        </div>

        {/* ===== QUICK ACTION BAR ===== */}
        <div className="px-6 py-3 border-b border-gray-100 bg-white flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Mail className="w-4 h-4" />
            <span className="truncate max-w-[200px]">{applicant.email}</span>
            {parsedResume?.phone && (
              <>
                <span className="text-gray-300">•</span>
                <Phone className="w-4 h-4" />
                <span>{parsedResume.phone}</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Decision Actions - Only enabled when screening is complete */}
            {isScreeningComplete ? (
              <>
                <button className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors text-sm font-medium shadow-sm">
                  <AlertCircle className="w-4 h-4" />
                  Needs Review
                </button>
                <button className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors text-sm font-medium shadow-sm">
                  <CheckCircle className="w-4 h-4" />
                  Shortlist
                </button>
                <button className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors text-sm font-medium border border-red-200">
                  <X className="w-4 h-4" />
                  Reject
                </button>
              </>
            ) : (
              <>
                <button disabled className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-400 rounded-lg text-sm font-medium cursor-not-allowed opacity-60">
                  <AlertCircle className="w-4 h-4" />
                  Needs Review
                </button>
                <button disabled className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-400 rounded-lg text-sm font-medium cursor-not-allowed opacity-60">
                  <CheckCircle className="w-4 h-4" />
                  Shortlist
                </button>
                <button disabled className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-400 rounded-lg text-sm font-medium cursor-not-allowed opacity-60">
                  <X className="w-4 h-4" />
                  Reject
                </button>
              </>
            )}
            
            {/* Secondary Actions Dropdown - Always available but some disabled */}
            <div className="relative">
              <button
                onClick={() => setShowActionsDropdown(!showActionsDropdown)}
                className="flex items-center gap-2 px-3 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors text-sm"
              >
                <MoreHorizontal className="w-4 h-4" />
                <ChevronDown className="w-3 h-3" />
              </button>
              {showActionsDropdown && (
                <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-xl shadow-xl border border-gray-200 z-20 py-1">
                  <button
                    onClick={() => { setShowEmailModal(true); setShowActionsDropdown(false); }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors"
                  >
                    <Mail className="w-4 h-4 text-gray-400" />
                    Send Email
                  </button>
                  <button className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors">
                    <Download className="w-4 h-4 text-gray-400" />
                    Export Report
                  </button>
                  <button className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors">
                    <ExternalLink className="w-4 h-4 text-gray-400" />
                    Open in New Tab
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ===== NAVIGATION TABS ===== */}
        <div className="px-6 border-b border-gray-200 bg-gray-50/50">
          <div className="flex gap-1 -mb-px">
            {[
              { id: 'summary', label: 'Summary', icon: Sparkles },
              { id: 'resume', label: 'Resume Details', icon: FileText },
              { id: 'video', label: 'Video Interview', icon: Video },
              { id: 'test', label: 'Work Profiling', icon: ListChecks },
              { id: 'notes', label: 'Internal Notes', icon: MessageCircle, count: notes.length },
              { id: 'emails', label: 'Communication', icon: Inbox, count: emails.length },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-indigo-600 text-indigo-600 bg-white rounded-t-lg'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-t-lg'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
                {tab.count !== undefined && tab.count > 0 && (
                  <span className={`px-1.5 py-0.5 rounded-full text-xs ${activeTab === tab.id ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-200 text-gray-600'}`}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* ===== CONTENT AREA ===== */}
        <div className="flex-1 overflow-y-auto p-6 bg-gray-50/30">
          
          {/* ===== SUMMARY TAB ===== */}
          {activeTab === 'summary' && (
            <div className="space-y-6 max-w-5xl">
              
              {/* Section 1: AI Evaluation Summary - Only show when screening complete */}
              {isScreeningComplete ? (
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-indigo-50/50 to-white">
                    <div className="flex items-center gap-2">
                      <Brain className="w-5 h-5 text-indigo-600" />
                      <h3 className="font-semibold text-gray-900">AI Evaluation Summary</h3>
                    </div>
                  </div>
                  <div className="p-5">
                  {/* Score Cards Grid */}
                  <div className="grid grid-cols-4 gap-4 mb-5">
                    {[
                      { label: 'Resume Score', score: applicant.resumeScore, icon: FileText, color: 'emerald' },
                      { label: 'Video Score', score: applicant.videoScore, icon: Video, color: 'violet' },
                      { label: 'Profile Fit', score: applicant.profileFit, icon: Target, color: 'amber' },
                      { label: 'Overall Score', score: applicant.overall, icon: Star, color: 'indigo', highlight: true },
                    ].map((item, idx) => (
                      <div key={idx} className={`rounded-xl p-4 ${item.highlight ? 'bg-indigo-50 border border-indigo-100' : 'bg-gray-50/50 border border-gray-100'}`}>
                        <div className={`w-10 h-10 mx-auto mb-3 rounded-lg flex items-center justify-center ${item.highlight ? 'bg-indigo-100' : 'bg-gray-100'}`}>
                          <item.icon className={`w-5 h-5 ${item.highlight ? 'text-indigo-600' : 'text-gray-500'}`} />
                        </div>
                        <div className="text-center">
                          <p className={`text-2xl font-bold ${item.highlight ? 'text-indigo-700' : 'text-gray-900'}`}>
                            {item.score ? Math.round(item.score) : '-'}
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5">{item.label}</p>
                          {item.score && (
                            <p className={`text-xs font-medium mt-1 ${getScoreLabel(item.score).color}`}>
                              {getScoreLabel(item.score).label}
                            </p>
                          )}
                        </div>
                        {/* Progress Bar */}
                        {item.score !== undefined && item.score !== null && (
                          <div className="mt-3 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                            <div 
                              className={`h-full rounded-full ${getScoreBarColor(item.score)} transition-all`}
                              style={{ width: `${item.score}%` }}
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  
                  {/* Score Breakdown Legend */}
                  <div className="flex items-center gap-4 text-xs text-gray-500 justify-center">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      <span>Strong (80+)</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-amber-500" />
                      <span>Moderate (60-79)</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-orange-500" />
                      <span>Review (40-59)</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-red-500" />
                      <span>Low (&lt;40)</span>
                    </div>
                  </div>
                </div>
              </div>
              ) : (
                /* Placeholder when screening not complete */
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-gray-50/50 to-white">
                    <div className="flex items-center gap-2">
                      <Brain className="w-5 h-5 text-gray-400" />
                      <h3 className="font-semibold text-gray-900">AI Evaluation Summary</h3>
                    </div>
                  </div>
                  <div className="p-8 text-center">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
                      <Clock className="w-8 h-8 text-gray-400" />
                    </div>
                    <p className="text-sm font-medium text-gray-700 mb-1">Scores not yet available</p>
                    <p className="text-xs text-gray-500">AI evaluation is in progress. Check back once screening is complete.</p>
                  </div>
                </div>
              )}

              {/* Two Column Layout: Candidate Snapshot + Key Insights */}
              <div className="grid grid-cols-2 gap-6">
                
                {/* Section 2: Candidate Snapshot */}
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-slate-50/50 to-white">
                    <div className="flex items-center gap-2">
                      <User className="w-5 h-5 text-slate-600" />
                      <h3 className="font-semibold text-gray-900">Candidate Snapshot</h3>
                    </div>
                  </div>
                  <div className="p-5 space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                        <Mail className="w-4 h-4 text-blue-500" />
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Email</p>
                        <p className="text-sm font-medium text-gray-900">{applicant.email}</p>
                      </div>
                    </div>
                    {parsedResume?.phone && (
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center">
                          <Phone className="w-4 h-4 text-green-500" />
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Phone</p>
                          <p className="text-sm font-medium text-gray-900">{parsedResume.phone}</p>
                        </div>
                      </div>
                    )}
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center">
                        <Briefcase className="w-4 h-4 text-purple-500" />
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Applied Position</p>
                        <p className="text-sm font-medium text-gray-900">{applicant.position}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
                        <Calendar className="w-4 h-4 text-amber-500" />
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Applied Date</p>
                        <p className="text-sm font-medium text-gray-900">
                          {new Date(applicant.created_at).toLocaleDateString('en-US', { 
                            month: 'short', 
                            day: 'numeric',
                            year: 'numeric'
                          })}
                        </p>
                      </div>
                    </div>
                    {parsedResume?.experience && parsedResume.experience.length > 0 && (
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-cyan-50 flex items-center justify-center">
                          <TrendingUp className="w-4 h-4 text-cyan-500" />
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Experience</p>
                          <p className="text-sm font-medium text-gray-900">
                            {parsedResume.experience.length} position{parsedResume.experience.length > 1 ? 's' : ''}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Section 3: Key Insights */}
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-amber-50/50 to-white">
                    <div className="flex items-center gap-2">
                      <Zap className="w-5 h-5 text-amber-600" />
                      <h3 className="font-semibold text-gray-900">Key Insights</h3>
                    </div>
                  </div>
                  <div className="p-5">
                    {getKeyInsights().length > 0 ? (
                      <div className="space-y-3">
                        {getKeyInsights().map((insight, idx) => (
                          <div key={idx} className={`flex items-start gap-3 p-3 rounded-lg ${
                            insight.type === 'strength' ? 'bg-emerald-50/50' : 
                            insight.type === 'concern' ? 'bg-red-50/50' : 'bg-blue-50/50'
                          }`}>
                            <div className={`flex-shrink-0 mt-0.5 ${
                              insight.type === 'strength' ? 'text-emerald-600' : 
                              insight.type === 'concern' ? 'text-red-600' : 'text-blue-600'
                            }`}>
                              {insight.icon}
                            </div>
                            <p className={`text-sm ${
                              insight.type === 'strength' ? 'text-emerald-800' : 
                              insight.type === 'concern' ? 'text-red-800' : 'text-gray-700'
                            }`}>
                              {insight.text}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-6 text-gray-400">
                        <Brain className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">No insights available yet</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Section 4: Activity Timeline */}
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-slate-50/50 to-white">
                  <div className="flex items-center gap-2">
                    <Clock3 className="w-5 h-5 text-slate-600" />
                    <h3 className="font-semibold text-gray-900">Activity Timeline</h3>
                  </div>
                </div>
                <div className="p-5">
                  <div className="relative">
                    {/* Vertical Timeline Line */}
                    <div className="absolute left-5 top-0 bottom-0 w-px bg-gray-200" />
                    
                    <div className="space-y-4">
                      {/* Build timeline from applicant data */}
                      {(() => {
                        const activities: Array<{ id: string; type: string; icon: React.ReactNode; color: string; bgColor: string; title: string; subtitle?: string; date: string }> = [];
                        
                        // Application submitted
                        if (applicant.created_at) {
                          activities.push({
                            id: 'application',
                            type: 'application',
                            icon: <User className="w-4 h-4" />,
                            color: 'text-gray-500',
                            bgColor: 'bg-gray-100',
                            title: 'Application submitted',
                            subtitle: `Applied for ${applicant.position}`,
                            date: applicant.created_at
                          });
                        }
                        
                        // Resume uploaded
                        if (applicant.resume?.uploaded_at) {
                          activities.push({
                            id: 'resume_upload',
                            type: 'resume',
                            icon: <FileText className="w-4 h-4" />,
                            color: 'text-emerald-600',
                            bgColor: 'bg-emerald-50',
                            title: 'Resume uploaded & parsed',
                            date: applicant.resume.uploaded_at
                          });
                        }
                        
                        // Video assessment
                        if (applicant.video?.submitted_at) {
                          activities.push({
                            id: 'video_submit',
                            type: 'video',
                            icon: <Video className="w-4 h-4" />,
                            color: 'text-violet-600',
                            bgColor: 'bg-violet-50',
                            title: 'Video assessment completed',
                            date: applicant.video.submitted_at
                          });
                        }
                        
                        // Work profiling test
                        if (applicant.test?.submitted_at) {
                          activities.push({
                            id: 'test_submit',
                            type: 'test',
                            icon: <ClipboardCheck className="w-4 h-4" />,
                            color: 'text-amber-600',
                            bgColor: 'bg-amber-50',
                            title: 'Work profiling test completed',
                            date: applicant.test.submitted_at
                          });
                        }
                        
                        // Recent notes
                        notes.slice(0, 2).forEach(note => {
                          activities.push({
                            id: note.id,
                            type: 'note',
                            icon: <MessageSquare className="w-4 h-4" />,
                            color: 'text-blue-600',
                            bgColor: 'bg-blue-50',
                            title: 'Note added',
                            subtitle: note.text.length > 40 ? note.text.substring(0, 40) + '...' : note.text,
                            date: note.date
                          });
                        });
                        
                        // Recent emails
                        emails.slice(0, 2).forEach(email => {
                          activities.push({
                            id: email.id,
                            type: 'email',
                            icon: <Mail className="w-4 h-4" />,
                            color: 'text-cyan-600',
                            bgColor: 'bg-cyan-50',
                            title: 'Email sent',
                            subtitle: email.subject,
                            date: email.date
                          });
                        });
                        
                        // Sort by date descending
                        activities.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
                        
                        return activities.length > 0 ? (
                          activities.slice(0, 8).map((activity, idx) => (
                            <div key={activity.id} className="relative flex items-start gap-4 pl-2">
                              {/* Timeline Dot */}
                              <div className={`relative z-10 w-8 h-8 rounded-full ${activity.bgColor} flex items-center justify-center ${activity.color} flex-shrink-0 ring-4 ring-white`}>
                                {activity.icon}
                              </div>
                              {/* Content */}
                              <div className="flex-1 min-w-0 pb-4">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-sm font-medium text-gray-900">{activity.title}</p>
                                  <span className="text-xs text-gray-400 flex-shrink-0">
                                    {new Date(activity.date).toLocaleDateString('en-US', { 
                                      month: 'short', 
                                      day: 'numeric',
                                      hour: '2-digit',
                                      minute: '2-digit'
                                    })}
                                  </span>
                                </div>
                                {activity.subtitle && (
                                  <p className="text-xs text-gray-500 mt-0.5">{activity.subtitle}</p>
                                )}
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="text-center py-8 text-gray-400">
                            <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
                            <p className="text-sm">No activity recorded yet</p>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ===== RESUME TAB ===== */}
          {activeTab === 'resume' && parsedResume && (
            <div className="space-y-6 max-w-5xl">
              
              {/* Resume File Card */}
              {applicant.resume?.resume_url && (
                <div className="bg-gradient-to-r from-indigo-50/50 to-violet-50/50 rounded-2xl border border-indigo-100 p-5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-indigo-100 flex items-center justify-center">
                        <FileText className="w-6 h-6 text-indigo-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900">Original Resume</h3>
                        <p className="text-sm text-gray-500">View or download the uploaded document</p>
                      </div>
                    </div>
                    <a
                      href={applicant.resume.resume_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium shadow-sm"
                    >
                      <Download className="w-4 h-4" />
                      View Resume
                    </a>
                  </div>
                </div>
              )}

              {/* Match Indicator */}
              {applicant.resumeScore && (
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                        applicant.resumeScore >= 70 ? 'bg-emerald-100' : applicant.resumeScore >= 50 ? 'bg-amber-100' : 'bg-red-100'
                      }`}>
                        <Target className={`w-5 h-5 ${
                          applicant.resumeScore >= 70 ? 'text-emerald-600' : applicant.resumeScore >= 50 ? 'text-amber-600' : 'text-red-600'
                        }`} />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">Job Match Indicator</p>
                        <p className="text-xs text-gray-500">
                          {applicant.resumeScore >= 70 ? 'Strong alignment with job requirements' :
                           applicant.resumeScore >= 50 ? 'Moderate alignment, review recommended' :
                           'Low alignment with position requirements'}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className={`text-2xl font-bold ${
                        applicant.resumeScore >= 70 ? 'text-emerald-600' : applicant.resumeScore >= 50 ? 'text-amber-600' : 'text-red-600'
                      }`}>
                        {Math.round(applicant.resumeScore)}%
                      </span>
                      <p className="text-xs text-gray-500">match score</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Education Card */}
              {parsedResume.education && parsedResume.education.length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-emerald-50/50 to-white flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                      <GraduationCap className="w-4 h-4 text-emerald-600" />
                    </div>
                    <h3 className="font-semibold text-gray-900">Education</h3>
                  </div>
                  <div className="p-5 space-y-4">
                    {parsedResume.education.map((edu, idx) => (
                      <div key={idx} className="flex items-start gap-4">
                        <div className="w-2 h-2 rounded-full bg-emerald-400 mt-2 flex-shrink-0" />
                        <div>
                          <p className="font-medium text-gray-900">{(edu as any).course_or_strand || (edu as any).degree || (edu as any).field || 'Education'}</p>
                          <p className="text-sm text-gray-600">{(edu as any).school || (edu as any).institution || 'Unknown School'}</p>
                          {(edu as any).year_range || (edu as any).years ? (
                            <p className="text-xs text-gray-400 mt-1">{(edu as any).year_range || (edu as any).years}</p>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Skills Card */}
              {parsedResume.skills && (
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-blue-50/50 to-white flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                      <Award className="w-4 h-4 text-blue-600" />
                    </div>
                    <h3 className="font-semibold text-gray-900">Skills</h3>
                    <span className="ml-auto text-xs text-gray-500">
                      {Object.values(parsedResume.skills as Record<string, string | string[]>).flat().length} detected
                    </span>
                  </div>
                  <div className="p-5">
                    {/* Handle old format (hard_skills) and new NER format (category-based dict) */}
                    {(parsedResume.skills as any).hard_skills ? (
                      <div className="flex flex-wrap gap-2">
                        {(parsedResume.skills as any).hard_skills.map((skill: string, idx: number) => (
                          <span key={idx} className="px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-sm font-medium border border-blue-100">
                            {skill}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(parsedResume.skills as any).map(([category, skills]) => (
                          typeof skills === 'string' 
                            ? skills.split(',').map((skill: string, idx: number) => (
                                <span key={`${category}-${idx}`} className="px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-sm font-medium border border-blue-100">
                                  {skill.trim()}
                                </span>
                              ))
                            : Array.isArray(skills)
                              ? skills.map((skill: string, idx: number) => (
                                  <span key={`${category}-${idx}`} className="px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-sm font-medium border border-blue-100">
                                    {skill}
                                  </span>
                                ))
                              : null
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Experience Card */}
              {parsedResume.experience && parsedResume.experience.length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-violet-50/50 to-white flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center">
                      <Briefcase className="w-4 h-4 text-violet-600" />
                    </div>
                    <h3 className="font-semibold text-gray-900">Work Experience</h3>
                  </div>
                  <div className="p-5 space-y-5">
                    {parsedResume.experience.map((exp, idx) => (
                      <div key={idx} className="flex items-start gap-4">
                        <div className="w-2 h-2 rounded-full bg-violet-400 mt-2 flex-shrink-0" />
                        <div className="flex-1">
                          <p className="font-medium text-gray-900">{(exp as any).role || (exp as any).title || 'Professional Experience'}</p>
                          <p className="text-sm text-gray-600">{(exp as any).company || (exp as any).organization || ''}</p>
                          {(exp as any).years || (exp as any).duration || (exp as any).year_range ? (
                            <p className="text-xs text-gray-400 mt-1">{(exp as any).years || (exp as any).duration || (exp as any).year_range}</p>
                          ) : null}
                          {(exp as any).summary || (exp as any).description ? (
                            <p className="text-sm text-gray-500 mt-2 leading-relaxed">{(exp as any).summary || (exp as any).description}</p>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Projects Card */}
              {parsedResume.projects && parsedResume.projects.length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-purple-50/50 to-white flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center">
                      <Sparkles className="w-4 h-4 text-purple-600" />
                    </div>
                    <h3 className="font-semibold text-gray-900">Projects</h3>
                  </div>
                  <div className="p-5 space-y-4">
                    {parsedResume.projects.map((project, idx) => (
                      <div key={idx} className="flex items-start gap-4">
                        <div className="w-2 h-2 rounded-full bg-purple-400 mt-2 flex-shrink-0" />
                        <div>
                          <p className="font-medium text-gray-900">{(project as any).name || (project as any).title || 'Untitled Project'}</p>
                          {(project as any).details && (
                            <p className="text-sm text-gray-600 mt-1 leading-relaxed">
                              {typeof (project as any).details === 'string' 
                                ? (project as any).details 
                                : Array.isArray((project as any).details) 
                                  ? (project as any).details.join(' ') 
                                  : JSON.stringify((project as any).details)}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Certifications Card */}
              {parsedResume.trainings && parsedResume.trainings.length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-amber-50/50 to-white flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
                      <Shield className="w-4 h-4 text-amber-600" />
                    </div>
                    <h3 className="font-semibold text-gray-900">Certifications & Training</h3>
                  </div>
                  <div className="p-5 space-y-3">
                    {parsedResume.trainings.map((training, idx) => (
                      <div key={idx} className="flex items-center gap-3">
                        <Check className="w-4 h-4 text-amber-500 flex-shrink-0" />
                        <p className="text-sm text-gray-700 font-medium">
                          {typeof training === 'string' 
                            ? training 
                            : training.title || JSON.stringify(training)}
                        </p>
                        {typeof training !== 'string' && training.date && (
                          <span className="text-xs text-gray-400 ml-auto">{training.date}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ===== VIDEO TAB ===== */}
          {activeTab === 'video' && (
            <div className="space-y-6 max-w-5xl">
              {applicant.video ? (
                <>
                  {/* Video Player Card */}
                  <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="aspect-video bg-gray-900 flex items-center justify-center">
                      {applicant.video.video_url ? (
                        <video 
                          src={applicant.video.video_url} 
                          controls 
                          className="w-full h-full"
                          poster={applicant.photo_url || undefined}
                        />
                      ) : (
                        <div className="text-white text-center">
                          <Video className="w-16 h-16 mx-auto mb-3 opacity-40" />
                          <p className="text-gray-400">Video not available</p>
                        </div>
                      )}
                    </div>
                    <div className="p-5 flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-500">Status</p>
                        <p className="font-medium text-gray-900 capitalize">{applicant.video.status}</p>
                      </div>
                      {applicant.video.video_duration_seconds && (
                        <div>
                          <p className="text-sm text-gray-500">Duration</p>
                          <p className="font-medium text-gray-900">
                            {Math.floor(applicant.video.video_duration_seconds / 60)}:{(applicant.video.video_duration_seconds % 60).toString().padStart(2, '0')}
                          </p>
                        </div>
                      )}
                      {applicant.video.submitted_at && (
                        <div>
                          <p className="text-sm text-gray-500">Submitted</p>
                          <p className="font-medium text-gray-900">
                            {new Date(applicant.video.submitted_at).toLocaleDateString()}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* AI Video Score */}
                  {applicant.video.transcript_score !== null && applicant.video.transcript_score !== undefined && (
                    <div className="bg-gradient-to-br from-indigo-50/50 to-violet-50/50 rounded-2xl border border-indigo-100 p-6">
                      <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-xl bg-indigo-100 flex items-center justify-center">
                            <Brain className="w-6 h-6 text-indigo-600" />
                          </div>
                          <div>
                            <h3 className="font-semibold text-gray-900">AI Interview Analysis</h3>
                            <p className="text-sm text-gray-500">Based on transcript evaluation</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-5xl font-bold text-indigo-700">
                            {applicant.video.transcript_score}/10
                          </div>
                          <p className={`text-sm font-medium ${getScoreLabel(applicant.video.transcript_score * 10).color}`}>
                            {getScoreLabel(applicant.video.transcript_score * 10).label}
                          </p>
                        </div>
                      </div>

                      {/* Score Breakdown Bars */}
                      <div className="space-y-4 mb-6">
                        {[
                          { label: 'Relevance', score: applicant.video.relevance_score },
                          { label: 'Experience', score: applicant.video.experience_score },
                          { label: 'Skills', score: applicant.video.skills_score },
                          { label: 'Completeness', score: applicant.video.completeness_score },
                        ].map((item, idx) => (
                          <div key={idx} className="flex items-center gap-4">
                            <span className="text-sm text-gray-600 w-28 flex-shrink-0">{item.label}</span>
                            <div className="flex-1 h-3 bg-gray-200 rounded-full overflow-hidden">
                              <div 
                                className={`h-full rounded-full transition-all ${getScoreBarColor(item.score ? item.score * 10 : undefined)}`}
                                style={{ width: `${item.score ? item.score * 10 : 0}%` }}
                              />
                            </div>
                            <span className="text-sm font-semibold text-gray-900 w-10 text-right">
                              {item.score ? item.score.toFixed(1) : '-'}
                            </span>
                          </div>
                        ))}
                      </div>

                      {/* AI Insight Summary */}
                      <div className="bg-white/60 rounded-xl p-4 border border-indigo-100/50">
                        <h4 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
                          <Zap className="w-4 h-4 text-amber-500" />
                          AI Insight Summary
                        </h4>
                        <div className="grid grid-cols-3 gap-4">
                          <div className="text-center p-3 bg-white/80 rounded-lg">
                            <MessageCircle className="w-5 h-5 mx-auto mb-1 text-blue-500" />
                            <p className="text-xs text-gray-500">Communication</p>
                            <p className="text-sm font-medium text-gray-900 mt-1">
                              {applicant.video.relevance_score && applicant.video.relevance_score >= 7 ? 'Clear & Direct' : 
                               applicant.video.relevance_score && applicant.video.relevance_score >= 5 ? 'Adequate' : 'Needs Improvement'}
                            </p>
                          </div>
                          <div className="text-center p-3 bg-white/80 rounded-lg">
                            <User className="w-5 h-5 mx-auto mb-1 text-violet-500" />
                            <p className="text-xs text-gray-500">Confidence Level</p>
                            <p className="text-sm font-medium text-gray-900 mt-1">
                              {applicant.video.experience_score && applicant.video.experience_score >= 7 ? 'High Confidence' : 
                               applicant.video.experience_score && applicant.video.experience_score >= 5 ? 'Moderate' : 'Appears Uncertain'}
                            </p>
                          </div>
                          <div className="text-center p-3 bg-white/80 rounded-lg">
                            <Target className="w-5 h-5 mx-auto mb-1 text-emerald-500" />
                            <p className="text-xs text-gray-500">Role Relevance</p>
                            <p className="text-sm font-medium text-gray-900 mt-1">
                              {applicant.video.skills_score && applicant.video.skills_score >= 7 ? 'Highly Relevant' : 
                               applicant.video.skills_score && applicant.video.skills_score >= 5 ? 'Partially Relevant' : 'Low Relevance'}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Validation Message */}
                      {applicant.video.validation_message && applicant.video.validation_status !== 'validated' && (
                        <div className={`mt-4 text-sm px-4 py-3 rounded-lg ${
                          applicant.video.validation_status === 'insufficient_response' 
                            ? 'bg-red-50 text-red-700 border border-red-200' 
                            : 'bg-gray-100 text-gray-700 border border-gray-200'
                        }`}>
                          <div className="flex items-center gap-2">
                            <AlertCircle className="w-4 h-4 flex-shrink-0" />
                            {applicant.video.validation_message}
                          </div>
                        </div>
                      )}

                      {/* Video Info */}
                      {applicant.video.transcript_word_count && (
                        <div className="mt-4 flex gap-4 text-xs text-gray-500 justify-center">
                          <span>Words: {applicant.video.transcript_word_count}</span>
                          {applicant.video.transcription_segments && (
                            <span>Segments: {applicant.video.transcription_segments.length}</span>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Transcription */}
                  {applicant.video.transcription && (
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                      <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-slate-50/50 to-white">
                        <h3 className="font-semibold text-gray-900">Transcript</h3>
                      </div>
                      <div className="p-5 max-h-80 overflow-y-auto">
                        {applicant.video.transcription_segments && applicant.video.transcription_segments.length > 0 ? (
                          <div className="space-y-3">
                            {applicant.video.transcription_segments.map((segment, index) => (
                              <div key={index} className="flex gap-3 text-sm hover:bg-gray-50/50 p-2 -mx-2 rounded-lg transition-colors">
                                <span className="text-indigo-600 font-mono text-xs whitespace-nowrap min-w-[50px] flex-shrink-0 pt-0.5">
                                  {formatTimestamp(segment.start)}
                                </span>
                                <span className="text-gray-700 leading-relaxed">{segment.text}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">
                            {applicant.video.transcription}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-16 bg-white rounded-2xl border border-gray-200">
                  <Video className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                  <h3 className="text-lg font-medium text-gray-900 mb-1">No Video Assessment</h3>
                  <p className="text-sm text-gray-500">This candidate hasn't submitted a video assessment yet.</p>
                </div>
              )}
            </div>
          )}

          {/* ===== WORK PROFILING TAB ===== */}
          {activeTab === 'test' && (
            <div className="space-y-5 max-w-5xl">
              {applicant.test && applicant.test.status === 'submitted' ? (
                <>
                  {(() => {
                    const answers: WorkStyleAnswer[] = applicant.test?.answers?.map((a: any) => ({
                      question: a.question,
                      answer: a.answer,
                    })) || [];
                    const dimensionScores = calculateDimensionScores(answers);
                    const targetPosition = applicant.position || 'Default';
                    const { score: alignmentScore, breakdown, matchedFamily } = calculateAlignmentScore(dimensionScores, targetPosition);
                    const result = getWorkStyleResult(answers, targetPosition);
                    
                    // Generate key characteristic tags based on high/low scores
                    const keyTraits: string[] = [];
                    dimensionScores.forEach(ds => {
                      const normalizedScore = Math.round((ds.score / 5) * 100);
                      if (normalizedScore >= 75) {
                        const highTrait = getHighScoreTrait(ds.dimension);
                        if (highTrait) keyTraits.push(highTrait.label);
                      } else if (normalizedScore <= 35) {
                        const lowTrait = getLowScoreTrait(ds.dimension);
                        if (lowTrait) keyTraits.push(lowTrait.label);
                      }
                    });
                    
                    return (
                      <>
                        {/* Header Card - Overall Score */}
                        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-4">
                              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-sm">
                                <Brain className="w-7 h-7 text-white" />
                              </div>
                              <div>
                                <p className="text-sm text-gray-500 font-medium">Work Style Assessment</p>
                                <h3 className="text-lg font-semibold text-gray-900">Psychological Profile Summary</h3>
                                <p className="text-sm text-gray-400">Based on {applicant.test.answers.length} behavioral responses</p>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-4xl font-bold bg-gradient-to-br from-violet-600 to-purple-700 bg-clip-text text-transparent">
                                {alignmentScore}%
                              </div>
                              <p className="text-xs text-gray-500 mt-0.5">role alignment</p>
                            </div>
                          </div>
                          
                          {/* Key Traits Tags */}
                          {keyTraits.length > 0 && (
                            <div className="mt-4 pt-4 border-t border-gray-100">
                              <p className="text-xs text-gray-500 mb-2 uppercase tracking-wide font-medium">Key Characteristics</p>
                              <div className="flex flex-wrap gap-2">
                                {keyTraits.slice(0, 6).map((trait, idx) => (
                                  <span 
                                    key={idx}
                                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${
                                      trait.type === 'high' 
                                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                                        : 'bg-amber-50 text-amber-700 border border-amber-200'
                                    }`}
                                  >
                                    {trait.type === 'high' && <TrendingUp className="w-3 h-3" />}
                                    {trait.type === 'low' && <TrendingDown className="w-3 h-3" />}
                                    {trait.label}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Dimension Breakdown Grid */}
                        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                          <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50">
                            <h3 className="font-semibold text-gray-900">Behavioral Dimensions</h3>
                            <p className="text-xs text-gray-500 mt-0.5">Detailed scoring across personality traits</p>
                          </div>
                          <div className="p-5">
                            <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                              {dimensionScores.map((ds) => {
                                const normalizedScore = Math.round((ds.score / 5) * 100);
                                const barColor = normalizedScore >= 70 ? 'bg-emerald-500' : normalizedScore >= 45 ? 'bg-amber-500' : 'bg-gray-300';
                                const interpretation = getWorkStyleInterpretation(ds.dimension, ds.score);
                                
                                return (
                                  <div key={ds.dimension} className="space-y-2">
                                    <div className="flex items-center justify-between">
                                      <span className="text-sm font-medium text-gray-800">{ds.dimension in DIMENSION_LABELS ? DIMENSION_LABELS[ds.dimension as WorkStyleDimension] : formatDimensionLabel(ds.dimension)}</span>
                                      <span className={`text-sm font-bold ${normalizedScore >= 70 ? 'text-emerald-600' : normalizedScore >= 45 ? 'text-amber-600' : 'text-gray-500'}`}>
                                        {normalizedScore}%
                                      </span>
                                    </div>
                                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                      <div className={`h-full rounded-full ${barColor} transition-all duration-500`} style={{ width: `${normalizedScore}%` }} />
                                    </div>
                                    {interpretation && (
                                      <p className="text-xs text-gray-500 leading-relaxed">{interpretation}</p>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>

                        {/* Profile Interpretation */}
                        <div className="bg-gradient-to-br from-slate-50 to-gray-50 rounded-xl border border-gray-200 p-5">
                          <div className="flex items-start gap-3">
                            <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                              <MessageCircle className="w-4 h-4 text-violet-600" />
                            </div>
                            <div>
                              <h4 className="font-medium text-gray-900 mb-1.5">Profile Interpretation</h4>
                              <p className="text-sm text-gray-600 leading-relaxed">
                                {result?.strongAreas?.length > 0 
                                  ? `This candidate demonstrates strong alignment in ${result.strongAreas.slice(0, 3).map(formatDimensionLabel).join(', ')}. `
                                  : ''}
                                {result?.moderateAreas?.length > 0 
                                  ? `Shows moderate tendencies in ${result.moderateAreas.slice(0, 2).map(formatDimensionLabel).join(', ')}.`
                                  : ''}
                                {result?.developmentAreas?.length > 0
                                  ? ` Areas that may need development include ${result.developmentAreas.slice(0, 2).map(formatDimensionLabel).join(', ')}.`
                                  : ''}
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Submission Info Row */}
                        <div className="flex items-center gap-4 text-sm text-gray-500">
                          <div className="flex items-center gap-1.5">
                            <Clock className="w-4 h-4" />
                            <span>Completed {applicant.test.submitted_at ? new Date(applicant.test.submitted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A'}</span>
                          </div>
                          <span className="text-gray-300">•</span>
                          <div className="flex items-center gap-1.5">
                            <CheckCircle className="w-4 h-4 text-emerald-500" />
                            <span>{applicant.test.answers.length} responses recorded</span>
                          </div>
                        </div>

                        {/* Essay & AI Insights */}
                        {(applicant.test.essay || (applicant.test as any).essay_insights) && (
                          <div className="space-y-4">
                            {(applicant.test as any).essay_insights && (
                              <div className="bg-gradient-to-br from-amber-50/50 to-orange-50/50 rounded-xl border border-amber-200/50 p-5">
                                <div className="flex items-center gap-2 mb-2">
                                  <Sparkles className="w-4 h-4 text-amber-500" />
                                  <h4 className="font-medium text-gray-900">AI Behavioral Analysis</h4>
                                </div>
                                <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">
                                  {(applicant.test as any).essay_insights}
                                </p>
                              </div>
                            )}
                            {applicant.test.essay && (
                              <div className="bg-white rounded-xl border border-gray-200 p-5">
                                <h4 className="font-medium text-gray-900 mb-2">Written Response</h4>
                                <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">
                                  {applicant.test.essay}
                                </p>
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    );
                  })()}
                </>
              ) : (
                <div className="text-center py-16 bg-white rounded-2xl border border-gray-200">
                  <ClipboardCheck className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                  <h3 className="text-lg font-medium text-gray-900 mb-1">Work Profiling Not Completed</h3>
                  <p className="text-sm text-gray-500">This candidate hasn't completed the work style assessment yet.</p>
                </div>
              )}
            </div>
          )}

          {/* ===== NOTES TAB ===== */}
          {activeTab === 'notes' && (
            <div className="space-y-5 max-w-3xl">
              
              {/* Add Note Input - Sticky Style */}
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                <div className="flex items-center gap-2 mb-3">
                  <MessageCircle className="w-4 h-4 text-indigo-600" />
                  <h3 className="font-semibold text-gray-900">Add Internal Note</h3>
                </div>
                <textarea
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Add a note about this candidate..."
                  className="w-full p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none bg-gray-50/50"
                  rows={3}
                />
                <div className="flex justify-end mt-3">
                  <button
                    onClick={handleAddNote}
                    disabled={!newNote.trim()}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
                  >
                    <Plus className="w-4 h-4" />
                    Add Note
                  </button>
                </div>
              </div>

              {/* Notes List */}
              <div className="space-y-4">
                {notes.length > 0 ? (
                  notes.map(note => (
                    <div key={note.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 hover:border-gray-300 transition-colors">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-400 to-indigo-600 flex items-center justify-center text-white text-sm font-bold">
                            {note.author.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-gray-900">{note.author}</p>
                            <p className="text-xs text-gray-500">
                              {new Date(note.date).toLocaleDateString('en-US', { 
                                month: 'short', 
                                day: 'numeric',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => handleDeleteNote(note.id)}
                          className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <p className="text-gray-700 text-sm mt-3 leading-relaxed pl-13">{note.text}</p>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-12 bg-white rounded-2xl border border-gray-200">
                    <MessageSquare className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                    <h3 className="text-base font-medium text-gray-900 mb-1">No Notes Yet</h3>
                    <p className="text-sm text-gray-500">Add a note to keep track of your thoughts</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ===== COMMUNICATION TAB ===== */}
          {activeTab === 'emails' && (
            <div className="space-y-4 max-w-3xl">
              {emails.length > 0 ? (
                <div className="relative">
                  {/* Timeline Line */}
                  <div className="absolute left-[19px] top-0 bottom-0 w-px bg-gray-200" />
                  
                  <div className="space-y-4">
                    {emails.map((email, idx) => (
                      <div key={email.id} className="relative flex items-start gap-4">
                        {/* Timeline Dot */}
                        <div className="relative z-10 w-10 h-10 rounded-full bg-gradient-to-br from-cyan-400 to-cyan-600 flex items-center justify-center text-white flex-shrink-0 ring-4 ring-white">
                          <Mail className="w-5 h-5" />
                        </div>
                        {/* Content Card */}
                        <div className="flex-1 bg-white rounded-2xl border border-gray-200 shadow-sm p-5 hover:border-gray-300 transition-colors">
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                              <h4 className="font-semibold text-gray-900 truncate">{email.subject}</h4>
                              <p className="text-sm text-gray-500 mt-0.5">{email.type}</p>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              {/* Status Badge */}
                              <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                                email.status === 'opened' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                                email.status === 'delivered' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                                'bg-gray-50 text-gray-700 border border-gray-200'
                              }`}>
                                {email.status === 'opened' ? <Eye className="w-3 h-3" /> :
                                 email.status === 'delivered' ? <Check className="w-3 h-3" /> :
                                 <Clock className="w-3 h-3" />}
                                {email.status || 'Sent'}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 mt-3 text-xs text-gray-500">
                            <Clock3 className="w-3 h-3" />
                            <span>
                              {new Date(email.date).toLocaleDateString('en-US', { 
                                month: 'short', 
                                day: 'numeric',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-center py-16 bg-white rounded-2xl border border-gray-200">
                  <Inbox className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                  <h3 className="text-lg font-medium text-gray-900 mb-1">No Communication Yet</h3>
                  <p className="text-sm text-gray-500 mb-4">Start communicating with this candidate</p>
                  <button
                    onClick={() => setShowEmailModal(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium"
                  >
                    <Mail className="w-4 h-4" />
                    Send First Email
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Email Modal */}
      {showEmailModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold text-gray-900">Send Email</h3>
              <button onClick={() => setShowEmailModal(false)} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Template</label>
                <select
                  value={selectedTemplate}
                  onChange={(e) => setSelectedTemplate(e.target.value)}
                  className="w-full p-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-gray-50/50"
                >
                  <option value="">Select a template...</option>
                  {EMAIL_TEMPLATES.map(template => (
                    <option key={template.id} value={template.id}>{template.name}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">To</label>
                <input
                  type="text"
                  value={applicant?.email || ''}
                  disabled
                  className="w-full p-2.5 border border-gray-200 rounded-lg bg-gray-100 text-gray-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Subject</label>
                <input
                  type="text"
                  value={selectedTemplate ? EMAIL_TEMPLATES.find(t => t.id === selectedTemplate)?.subject.replace('{{position}}', applicant?.position || '') : ''}
                  disabled
                  className="w-full p-2.5 border border-gray-200 rounded-lg bg-gray-100 text-gray-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Message</label>
                <textarea
                  value={emailContent}
                  onChange={(e) => setEmailContent(e.target.value)}
                  placeholder="Enter your message..."
                  rows={5}
                  className="w-full p-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none bg-gray-50/50"
                />
              </div>
            </div>
            
            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setShowEmailModal(false)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleSendEmail}
                disabled={!selectedTemplate}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
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
