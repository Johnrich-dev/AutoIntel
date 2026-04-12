import { useEffect, useState, Fragment, useRef, useCallback } from 'react';
import { Briefcase, Plus, Search, Edit2, Power, PowerOff, Copy, X, ChevronDown, ChevronUp, Sparkles, Loader2, AlertTriangle, ArrowRight, Upload, FileText, CheckCircle } from 'lucide-react';
import { getSupabaseAdminClient, JobPosting, JobPostingFormData } from '../lib/supabase';
import { FilterDropdown } from './FilterDropdown';
import { TagInput } from './TagInput';

// Role family options — must include all departments used by dataset + AI parser
const ROLE_FAMILIES = [
  'MIS / IT',
  'Finance',
  'Marketing',
  'HR',
  'Operations',
  'Sales',
  'Data Science',
  'Machine Learning',
  'Software Engineering',
  'Data Engineering',
  'DevOps',
  'Product Management',
  'Other',
];

const DEFAULT_FORM_DATA: JobPostingFormData = {
  title: '',
  description: '',
  department: '',
  skills: [],
  keywords: [],
  required_education: [],
  expected_projects: [],
  preferred_certifications: [],
  min_years_experience: '',
  max_years_experience: '',
};

// Helper to check if error is due to table not existing
const isTableNotExistError = (error: { code?: string; message?: string; status?: number }): boolean => {
  return error?.code === '42P01' || 
         error?.message?.includes('does not exist') ||
         error?.status === 404;
};

export function AdminJobManagement() {
  const [jobs, setJobs] = useState<JobPosting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSource, setFilterSource] = useState<'all' | 'admin' | 'dataset'>('all');
  const [filterDepartment, setFilterDepartment] = useState<string>('all');
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('active');
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  
  // Modal states
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<JobPosting | null>(null);
  const [formData, setFormData] = useState<JobPostingFormData>(DEFAULT_FORM_DATA);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // AI Import modal states
  const [isAIImportOpen, setIsAIImportOpen] = useState(false);
  const [aiStep, setAiStep] = useState<'paste' | 'complete'>('paste');
  const [rawJDText, setRawJDText] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showSuccess = useCallback((msg: string) => {
    if (successTimerRef.current) clearTimeout(successTimerRef.current);
    setSuccessMessage(msg);
    successTimerRef.current = setTimeout(() => setSuccessMessage(null), 4000);
  }, []);

  useEffect(() => () => { if (successTimerRef.current) clearTimeout(successTimerRef.current); }, []);
  const [parsedResult, setParsedResult] = useState<JobPostingFormData | null>(null);
  const [missingFields, setMissingFields] = useState<string[]>([]);
  const [gapData, setGapData] = useState<Partial<JobPostingFormData>>({});

  // Bulk import modal states
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false);
  const [bulkFile, setBulkFile] = useState<File | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkPreview, setBulkPreview] = useState<Array<JobPostingFormData & { _issues: string[] }>>([]);
  const [bulkImporting, setBulkImporting] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ imported: number; skipped: number } | null>(null);
  const bulkFileRef = useRef<HTMLInputElement>(null);

  // Modal-level error for create/update (shown inside the modal, not behind it)
  const [modalError, setModalError] = useState<string | null>(null);

  useEffect(() => {
    loadJobs();
  }, []);

  const loadJobs = async () => {
    try {
      setLoading(true);
      setError(null);
      const adminClient = getSupabaseAdminClient();
      
      const { data, error: fetchError } = await adminClient
        .from('job_postings')
        .select('*')
        .order('created_at', { ascending: false });

      if (fetchError) {
        // Check if table doesn't exist
        if (isTableNotExistError(fetchError)) {
          setError('Database table "job_postings" does not exist. Please run the database migration first.');
          setJobs([]);
          return;
        }
        throw fetchError;
      }
      setJobs(data || []);
    } catch (err) {
      console.error('Error loading jobs:', err);
      setError(err instanceof Error ? err.message : 'Failed to load jobs');
    } finally {
      setLoading(false);
    }
  };

  const filteredJobs = jobs.filter((job) => {
    // Source filter
    if (filterSource !== 'all' && job.source !== filterSource) return false;

    // Department filter
    if (filterDepartment !== 'all') {
      if ((job.department || '') !== filterDepartment) return false;
    }

    // Active filter
    if (filterActive === 'active' && !job.is_active) return false;
    if (filterActive === 'inactive' && job.is_active) return false;
    
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesTitle = job.title.toLowerCase().includes(query);
        const matchesDepartment = job.department?.toLowerCase().includes(query) ?? false;
      
      // Safely check skills array (might be null or undefined)
      const matchesSkills = Array.isArray(job.skills) && 
        job.skills.some((s: string) => typeof s === 'string' && s.toLowerCase().includes(query));
      
      // Safely check keywords array (might be null or undefined)
      const matchesKeywords = Array.isArray(job.keywords) && 
        job.keywords.some((k: string) => typeof k === 'string' && k.toLowerCase().includes(query));
      
      if (!matchesTitle && !matchesDepartment && !matchesSkills && !matchesKeywords) {
        return false;
      }
    }
    
    return true;
  });

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!formData.title.trim()) {
      errors.title = 'Job title is required';
    }

    if (!formData.department) {
      errors.department = 'Department is required';
    }

    const minExp = formData.min_years_experience;
    const maxExp = formData.max_years_experience;

    if (minExp !== '' && maxExp !== '' && Number(minExp) > Number(maxExp)) {
      errors.experience = 'Minimum years cannot be greater than maximum years';
    }

    if (minExp !== '' && (Number(minExp) < 0 || Number(minExp) > 50)) {
      errors.min_years = 'Must be between 0 and 50';
    }

    if (maxExp !== '' && (Number(maxExp) < 0 || Number(maxExp) > 50)) {
      errors.max_years = 'Must be between 0 and 50';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleCreateJob = async () => {
    if (!validateForm()) return;

    try {
      setIsSubmitting(true);
      setModalError(null);
      const adminClient = getSupabaseAdminClient();

      const jobId = `admin-${crypto.randomUUID()}`;

      const newJob = {
        job_id: jobId,
        title: formData.title.trim(),
        description: formData.description.trim() || null,
        department: formData.department || null,
        skills: formData.skills,
        keywords: formData.keywords,
        required_education: formData.required_education,
        expected_projects: formData.expected_projects,
        preferred_certifications: formData.preferred_certifications,
        min_years_experience: formData.min_years_experience === '' ? null : Number(formData.min_years_experience),
        max_years_experience: formData.max_years_experience === '' ? null : Number(formData.max_years_experience),
        source: 'admin',
        is_active: true,
        deleted_at: null,
      };

      const { error: insertError } = await adminClient
        .from('job_postings')
        .insert(newJob);

      if (insertError) {
        if (isTableNotExistError(insertError)) {
          throw new Error('Database table "job_postings" does not exist. Please run the database migration first.');
        }
        throw insertError;
      }

      setIsCreateModalOpen(false);
      setFormData(DEFAULT_FORM_DATA);
      showSuccess('Job posting created successfully.');
      await loadJobs();
    } catch (err) {
      console.error('Error creating job:', err);
      setModalError(err instanceof Error ? err.message : 'Failed to create job');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateJob = async () => {
    if (!editingJob || !validateForm()) return;

    try {
      setIsSubmitting(true);
      setModalError(null);
      const adminClient = getSupabaseAdminClient();

      const updates = {
        title: formData.title.trim(),
        description: formData.description.trim() || null,
        department: formData.department || null,
        skills: formData.skills,
        keywords: formData.keywords,
        required_education: formData.required_education,
        expected_projects: formData.expected_projects,
        preferred_certifications: formData.preferred_certifications,
        min_years_experience: formData.min_years_experience === '' ? null : Number(formData.min_years_experience),
        max_years_experience: formData.max_years_experience === '' ? null : Number(formData.max_years_experience),
        updated_at: new Date().toISOString(),
      };

      const { error: updateError } = await adminClient
        .from('job_postings')
        .update(updates)
        .eq('job_id', editingJob.job_id);

      if (updateError) {
        if (isTableNotExistError(updateError)) {
          throw new Error('Database table "job_postings" does not exist. Please run the database migration first.');
        }
        throw updateError;
      }

      setIsEditModalOpen(false);
      setEditingJob(null);
      setFormData(DEFAULT_FORM_DATA);
      showSuccess('Job posting updated successfully.');
      await loadJobs();
    } catch (err) {
      console.error('Error updating job:', err);
      setModalError(err instanceof Error ? err.message : 'Failed to update job');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleActive = async (job: JobPosting) => {
    try {
      setError(null);
      const adminClient = getSupabaseAdminClient();

      const updates = {
        is_active: !job.is_active,
        deleted_at: job.is_active ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      };

      const { error: updateError } = await adminClient
        .from('job_postings')
        .update(updates)
        .eq('job_id', job.job_id);

      if (updateError) {
        if (isTableNotExistError(updateError)) {
          throw new Error('Database table "job_postings" does not exist. Please run the database migration first.');
        }
        throw updateError;
      }

      await loadJobs();
    } catch (err) {
      console.error('Error toggling job status:', err);
      setError(err instanceof Error ? err.message : 'Failed to update job status');
    }
  };

  const handleDuplicateJob = async (job: JobPosting) => {
    try {
      setError(null);
      const adminClient = getSupabaseAdminClient();

      const newJobId = `admin-${crypto.randomUUID()}`;

      const duplicatedJob = {
        job_id: newJobId,
        title: `${job.title} (Copy)`,
        description: job.description,
        department: job.department,
        skills: job.skills,
        keywords: job.keywords,
        required_education: job.required_education,
        expected_projects: job.expected_projects,
        preferred_certifications: job.preferred_certifications,
        min_years_experience: job.min_years_experience,
        max_years_experience: job.max_years_experience,
        source: 'admin',
        is_active: true,
        deleted_at: null,
      };

      const { error: insertError } = await adminClient
        .from('job_postings')
        .insert(duplicatedJob);

      if (insertError) {
        if (isTableNotExistError(insertError)) {
          throw new Error('Database table "job_postings" does not exist. Please run the database migration first.');
        }
        throw insertError;
      }

      await loadJobs();
    } catch (err) {
      console.error('Error duplicating job:', err);
      setError(err instanceof Error ? err.message : 'Failed to duplicate job');
    }
  };

  const openEditModal = (job: JobPosting) => {
    setEditingJob(job);
    setFormData({
      title: job.title,
      description: job.description || '',
      department: job.department || '',
      skills: job.skills,
      keywords: job.keywords,
      required_education: job.required_education,
      expected_projects: job.expected_projects,
      preferred_certifications: job.preferred_certifications,
      min_years_experience: job.min_years_experience ?? '',
      max_years_experience: job.max_years_experience ?? '',
    });
    setFormErrors({});
    setModalError(null);
    setIsEditModalOpen(true);
  };

  const openCreateModal = () => {
    setFormData(DEFAULT_FORM_DATA);
    setFormErrors({});
    setModalError(null);
    setIsCreateModalOpen(true);
  };

  const openAIImport = () => {
    setRawJDText('');
    setParseError(null);
    setAiStep('paste');
    setParsedResult(null);
    setMissingFields([]);
    setGapData({});
    setIsAIImportOpen(true);
  };

  // Detect which critical fields are missing from parsed result
  const detectMissingFields = (result: JobPostingFormData): string[] => {
    const missing: string[] = [];
    if (!result.title?.trim()) missing.push('title');
    if (!result.skills || result.skills.length === 0) missing.push('skills');
    if (!result.required_education || result.required_education.length === 0) missing.push('required_education');
    // Flag experience only if BOTH min and max are absent
    const minMissing = result.min_years_experience === '' || result.min_years_experience === null || result.min_years_experience === undefined;
    const maxMissing = result.max_years_experience === '' || result.max_years_experience === null || result.max_years_experience === undefined;
    if (minMissing && maxMissing) missing.push('experience');
    return missing;
  };

  const handleParseJD = async () => {
    if (!rawJDText.trim()) return;
    if (rawJDText.trim().length < 50) {
      setParseError('Please paste a more complete job description (at least 50 characters).');
      return;
    }
    try {
      setIsParsing(true);
      setParseError(null);
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000';
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout
      let res: Response;
      try {
        res = await fetch(`${apiUrl}/api/parse-job-description`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ raw_description: rawJDText }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }
      const result = await res.json();
      if (!res.ok || result.error) {
        throw new Error(result.error || 'Failed to parse job description');
      }

      const filled: JobPostingFormData = {
        title: result.title || '',
        description: result.description || rawJDText,
        department: result.department || '',
        skills: result.skills || [],
        keywords: result.keywords || [],
        required_education: result.required_education || [],
        expected_projects: result.expected_projects || [],
        preferred_certifications: result.preferred_certifications || [],
        min_years_experience: result.min_years_experience ?? '',
        max_years_experience: result.max_years_experience ?? '',
      };

      const missing = detectMissingFields(filled);

      if (missing.length > 0) {
        // Go to the "complete missing fields" step
        setParsedResult(filled);
        setMissingFields(missing);
        setGapData({});
        setAiStep('complete');
      } else {
        // All critical fields found — go straight to create form
        setFormData(filled);
        setFormErrors({});
        setIsAIImportOpen(false);
        setIsCreateModalOpen(true);
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        setParseError('Request timed out. The AI service took too long — please try again.');
      } else {
        setParseError(err instanceof Error ? err.message : 'Parsing failed. Please try again.');
      }
    } finally {
      setIsParsing(false);
    }
  };

  const handleCompleteGaps = () => {
    if (!parsedResult) return;
    // Merge gap data into parsed result
    const merged: JobPostingFormData = {
      ...parsedResult,
      title: gapData.title?.trim() || parsedResult.title,
      skills: (gapData.skills && gapData.skills.length > 0) ? gapData.skills : parsedResult.skills,
      required_education: (gapData.required_education && gapData.required_education.length > 0)
        ? gapData.required_education
        : parsedResult.required_education,
      min_years_experience: gapData.min_years_experience !== undefined && gapData.min_years_experience !== ''
        ? gapData.min_years_experience
        : parsedResult.min_years_experience,
      max_years_experience: gapData.max_years_experience !== undefined && gapData.max_years_experience !== ''
        ? gapData.max_years_experience
        : parsedResult.max_years_experience,
    };
    setFormData(merged);
    setFormErrors({});
    setIsAIImportOpen(false);
    setIsCreateModalOpen(true);
  };

  // ── Bulk Import ──────────────────────────────────────────────
  const validateBulkRow = (job: JobPostingFormData): string[] => {
    const issues: string[] = [];
    if (!job.title.trim()) issues.push('Missing title');
    if (!job.skills || job.skills.length === 0) issues.push('No skills listed');
    if (!job.required_education || job.required_education.length === 0) issues.push('No required education');
    // Flag experience only if BOTH min and max are absent (0 is valid for entry-level)
    const minMissing = job.min_years_experience === '' || job.min_years_experience === null || job.min_years_experience === undefined;
    const maxMissing = job.max_years_experience === '' || job.max_years_experience === null || job.max_years_experience === undefined;
    if (minMissing && maxMissing) issues.push('Experience range not specified');
    return issues;
  };

  const parseBulkFile = async (file: File) => {
    setBulkFile(file);
    setBulkError(null);
    setBulkPreview([]);
    setBulkResult(null);
    const ext = file.name.split('.').pop()?.toLowerCase();
    try {
      const text = await file.text();
      let rows: JobPostingFormData[] = [];

      if (ext === 'json') {
        const parsed = JSON.parse(text);
        const arr = Array.isArray(parsed) ? parsed : [parsed];
        rows = arr.map((item: Record<string, unknown>) => ({
          title: String(item.title || ''),
          description: String(item.description || ''),
          department: String(item.department || ''),
          skills: Array.isArray(item.skills) ? item.skills.map(String) : [],
          keywords: Array.isArray(item.keywords) ? item.keywords.map(String) : [],
          required_education: Array.isArray(item.required_education) ? item.required_education.map(String) : [],
          expected_projects: Array.isArray(item.expected_projects) ? item.expected_projects.map(String) : [],
          preferred_certifications: Array.isArray(item.preferred_certifications) ? item.preferred_certifications.map(String) : [],
          min_years_experience: item.min_years_experience !== undefined ? Number(item.min_years_experience) : '',
          max_years_experience: item.max_years_experience !== undefined ? Number(item.max_years_experience) : '',
        }));
      } else if (ext === 'csv') {
        const lines = text.split('\n').filter(l => l.trim());
        // RFC-4180 compliant CSV parser — handles quoted fields with commas inside
        const parseCSVLine = (line: string): string[] => {
          const result: string[] = [];
          let current = '';
          let inQuotes = false;
          for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') {
              if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
              else inQuotes = !inQuotes;
            } else if (ch === ',' && !inQuotes) {
              result.push(current.trim()); current = '';
            } else {
              current += ch;
            }
          }
          result.push(current.trim());
          return result;
        };
        const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase());
        rows = lines.slice(1).map(line => {
          const values = parseCSVLine(line);
          const obj: Record<string, string> = {};
          headers.forEach((h, i) => { obj[h] = values[i] || ''; });
          const splitArr = (v: string) => v ? v.split('|').map(s => s.trim()).filter(Boolean) : [];
          return {
            title: obj.title || '',
            description: obj.description || '',
            department: obj.department || '',
            skills: splitArr(obj.skills),
            keywords: splitArr(obj.keywords),
            required_education: splitArr(obj.required_education),
            expected_projects: splitArr(obj.expected_projects),
            preferred_certifications: splitArr(obj.preferred_certifications),
            min_years_experience: obj.min_years_experience ? Number(obj.min_years_experience) : '',
            max_years_experience: obj.max_years_experience ? Number(obj.max_years_experience) : '',
          };
        });
      } else {
        setBulkError('Only .json and .csv files are supported.');
        return;
      }

      if (rows.length === 0) {
        setBulkError('No entries found in the file.');
        return;
      }

      // Validate each row and attach issues
      const annotated = rows.map(job => ({ ...job, _issues: validateBulkRow(job) }));
      setBulkPreview(annotated);
    } catch {
      setBulkError('Could not parse the file. Check the format and try again.');
    }
  };

  const handleBulkImport = async () => {
    if (bulkPreview.length === 0) return;
    const importable = bulkPreview.filter(job => job.title.trim());
    if (importable.length === 0) {
      setBulkError('No importable jobs — all rows are missing a title.');
      return;
    }
    try {
      setBulkImporting(true);
      setBulkError(null);
      const adminClient = getSupabaseAdminClient();

      // Batch insert — single round trip instead of N+1
      const rows = importable.map(job => ({
        job_id: `admin-${crypto.randomUUID()}`,
        title: job.title.trim(),
        description: job.description || null,
        department: job.department || null,
        skills: job.skills,
        keywords: job.keywords,
        required_education: job.required_education,
        expected_projects: job.expected_projects,
        preferred_certifications: job.preferred_certifications,
        min_years_experience: job.min_years_experience === '' ? null : Number(job.min_years_experience),
        max_years_experience: job.max_years_experience === '' ? null : Number(job.max_years_experience),
        source: 'admin',
        is_active: true,
        deleted_at: null,
      }));

      const { error } = await adminClient.from('job_postings').insert(rows);
      const titlelessCount = bulkPreview.length - importable.length;

      if (error) {
        console.error('Bulk import error:', error);
        setBulkError(`Import failed: ${error.message}`);
        return;
      }

      setBulkResult({ imported: rows.length, skipped: titlelessCount });
      await loadJobs();
    } catch (err) {
      console.error('Bulk import exception:', err);
      setBulkError(err instanceof Error ? err.message : 'Import failed.');
    } finally {
      setBulkImporting(false);
    }
  };

  const closeModals = () => {
    setIsCreateModalOpen(false);
    setIsEditModalOpen(false);
    setIsAIImportOpen(false);
    setIsBulkImportOpen(false);
    setEditingJob(null);
    setFormData(DEFAULT_FORM_DATA);
    setFormErrors({});
    setModalError(null);
    setParseError(null);
    setAiStep('paste');
    setParsedResult(null);
    setMissingFields([]);
    setGapData({});
    setBulkFile(null);
    setBulkError(null);
    setBulkPreview([]);
    setBulkResult(null);
  };

  const renderJobForm = () => (
    <div className="space-y-6">
      {/* Modal-level error — shown inside the modal so it's always visible */}
      {modalError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {modalError}
        </div>
      )}

      {/* Title */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Job Title <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={formData.title}
          onChange={(e) => setFormData({ ...formData, title: e.target.value })}
          className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
            formErrors.title ? 'border-red-500' : 'border-gray-300'
          }`}
          placeholder="e.g., Senior Machine Learning Engineer"
        />
        {formErrors.title && (
          <p className="mt-1 text-sm text-red-600">{formErrors.title}</p>
        )}
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Job Description
        </label>
        <textarea
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          rows={4}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          placeholder="Enter job description..."
        />
      </div>

      {/* Role Family */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Department <span className="text-red-500">*</span>
        </label>
        <select
          value={formData.department}
          onChange={(e) => setFormData({ ...formData, department: e.target.value })}
          className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
            formErrors.department ? 'border-red-500' : 'border-gray-300'
          }`}
        >
          <option value="">Select a role family...</option>
          {ROLE_FAMILIES.map((family) => (
            <option key={family} value={family}>
              {family}
            </option>
          ))}
        </select>
        {formErrors.department && (
          <p className="mt-1 text-sm text-red-600">{formErrors.department}</p>
        )}
      </div>

      {/* Experience Range */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Years of Experience
        </label>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <input
              type="number"
              min="0"
              max="50"
              value={formData.min_years_experience}
              onChange={(e) => setFormData({ ...formData, min_years_experience: e.target.value === '' ? '' : Number(e.target.value) })}
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                formErrors.min_years || formErrors.experience ? 'border-red-500' : 'border-gray-300'
              }`}
              placeholder="Min"
            />
            <p className="text-xs text-gray-500 mt-1">Minimum</p>
          </div>
          <div>
            <input
              type="number"
              min="0"
              max="50"
              value={formData.max_years_experience}
              onChange={(e) => setFormData({ ...formData, max_years_experience: e.target.value === '' ? '' : Number(e.target.value) })}
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                formErrors.max_years || formErrors.experience ? 'border-red-500' : 'border-gray-300'
              }`}
              placeholder="Max"
            />
            <p className="text-xs text-gray-500 mt-1">Maximum</p>
          </div>
        </div>
        {(formErrors.experience || formErrors.min_years || formErrors.max_years) && (
          <p className="mt-1 text-sm text-red-600">
            {formErrors.experience || formErrors.min_years || formErrors.max_years}
          </p>
        )}
      </div>

      {/* Skills */}
      <TagInput
        label="Required Skills"
        tags={formData.skills}
        onChange={(skills) => setFormData({ ...formData, skills })}
        placeholder="e.g., Python, TensorFlow, SQL..."
      />

      {/* Keywords */}
      <TagInput
        label="Keywords"
        tags={formData.keywords}
        onChange={(keywords) => setFormData({ ...formData, keywords })}
        placeholder="e.g., NLP, computer vision, deep learning..."
      />

      {/* Required Education */}
      <TagInput
        label="Required Education"
        tags={formData.required_education}
        onChange={(required_education) => setFormData({ ...formData, required_education })}
        placeholder="e.g., Bachelor's in Computer Science, Master's in Data Science..."
      />

      {/* Expected Projects */}
      <TagInput
        label="Expected Projects"
        tags={formData.expected_projects}
        onChange={(expected_projects) => setFormData({ ...formData, expected_projects })}
        placeholder="e.g., recommendation systems, fraud detection..."
      />

      {/* Preferred Certifications */}
      <TagInput
        label="Preferred Certifications"
        tags={formData.preferred_certifications}
        onChange={(preferred_certifications) => setFormData({ ...formData, preferred_certifications })}
        placeholder="e.g., AWS Certified, Google Cloud Professional..."
      />
    </div>
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-gray-600 text-lg">Loading jobs...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-8 lg:p-10">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            <Briefcase className="w-8 h-8 text-blue-600" />
            Job Management
          </h1>
          <p className="text-gray-600 mt-1">
            Create, edit, and manage job postings for the recruitment system
          </p>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}

        {/* Success Display */}
        {successMessage && (
          <div className="mb-6 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
            {successMessage}
          </div>
        )}

        {/* Filters and Actions */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="flex flex-col gap-4">
            {/* Top row: search + action buttons */}
            <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
              <div className="relative flex-1 sm:max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search jobs..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={openAIImport}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg font-medium transition-colors text-sm"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Import with AI</span>
                </button>
                <button
                  onClick={() => { setBulkFile(null); setBulkError(null); setBulkPreview([]); setBulkResult(null); setIsBulkImportOpen(true); }}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium transition-colors text-sm"
                >
                  <Upload className="w-4 h-4" />
                  <span>Bulk Import</span>
                </button>
                <button
                  onClick={openCreateModal}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors text-sm"
                >
                  <Plus className="w-4 h-4" />
                  <span>Create Job</span>
                </button>
              </div>
            </div>

            {/* Bottom row: filters */}
            <div className="grid grid-cols-3 gap-2">
              <FilterDropdown
                value={filterSource}
                onChange={(v) => setFilterSource(v as typeof filterSource)}
                options={[
                  { value: 'all', label: 'All Sources' },
                  { value: 'admin', label: 'Admin Created' },
                  { value: 'dataset', label: 'Dataset Imported' },
                ]}
              />
              <FilterDropdown
                value={filterDepartment}
                onChange={(v) => setFilterDepartment(v)}
                options={[
                  { value: 'all', label: 'All Departments' },
                  ...Array.from(new Set(jobs.map(j => j.department).filter(Boolean))).sort().map(dept => ({
                    value: dept!,
                    label: dept!,
                  }))
                ]}
              />
              <FilterDropdown
                value={filterActive}
                onChange={(v) => setFilterActive(v as typeof filterActive)}
                options={[
                  { value: 'all', label: 'All Status' },
                  { value: 'active', label: 'Active Only' },
                  { value: 'inactive', label: 'Inactive Only' },
                ]}
              />
            </div>
          </div>

          <div className="mt-3 text-sm text-gray-500">
            Showing {filteredJobs.length} of {jobs.length} jobs
          </div>
        </div>

        {/* Jobs Table — desktop */}
        <div className="bg-white rounded-lg shadow overflow-hidden hidden md:block">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Job Details
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Department
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Experience
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Source
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredJobs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                      No jobs found matching your criteria
                    </td>
                  </tr>
                ) : (
                  filteredJobs.map((job) => (
                    <Fragment key={job.job_id}>
                      <tr className={`hover:bg-gray-50 ${!job.is_active ? 'opacity-60' : ''}`}>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => setExpandedJobId(expandedJobId === job.job_id ? null : job.job_id)}
                              className="text-gray-400 hover:text-gray-600 shrink-0"
                            >
                              {expandedJobId === job.job_id ? (
                                <ChevronUp className="w-4 h-4" />
                              ) : (
                                <ChevronDown className="w-4 h-4" />
                              )}
                            </button>
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-gray-900 truncate max-w-xs">{job.title}</div>
                              <div className="text-xs text-gray-500 truncate max-w-xs">
                                {Array.isArray(job.skills) && job.skills.length > 0
                                  ? `${job.skills.slice(0, 3).join(', ')}${job.skills.length > 3 ? ` +${job.skills.length - 3} more` : ''}`
                                  : 'No skills listed'}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {job.department || <span className="text-gray-400">—</span>}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {job.min_years_experience !== null && job.max_years_experience !== null
                            ? `${job.min_years_experience}–${job.max_years_experience} yrs`
                            : job.min_years_experience !== null
                            ? `${job.min_years_experience}+ yrs`
                            : job.max_years_experience !== null
                            ? `Up to ${job.max_years_experience} yrs`
                            : <span className="text-gray-400">—</span>}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                            job.source === 'admin' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                          }`}>
                            {job.source === 'admin' ? 'Admin' : 'Dataset'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <button
                            onClick={() => handleToggleActive(job)}
                            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                              job.is_active
                                ? 'bg-green-100 text-green-700 hover:bg-green-200'
                                : 'bg-red-100 text-red-700 hover:bg-red-200'
                            }`}
                          >
                            {job.is_active ? <><Power className="w-3 h-3" />Active</> : <><PowerOff className="w-3 h-3" />Inactive</>}
                          </button>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <button onClick={() => openEditModal(job)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors" title="Edit job">
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button onClick={() => handleDuplicateJob(job)} className="p-1.5 text-purple-600 hover:bg-purple-50 rounded transition-colors" title="Duplicate job">
                              <Copy className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Expanded Details */}
                      {expandedJobId === job.job_id && (
                        <tr className="bg-gray-50">
                          <td colSpan={6} className="px-6 py-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                              {job.description && (
                                <div className="col-span-full">
                                  <h4 className="text-xs font-medium text-gray-500 uppercase mb-1">Description</h4>
                                  <p className="text-sm text-gray-700 whitespace-pre-wrap line-clamp-6">{job.description}</p>
                                </div>
                              )}
                              {Array.isArray(job.skills) && job.skills.length > 0 && (
                                <div>
                                  <h4 className="text-xs font-medium text-gray-500 uppercase mb-1">Skills ({job.skills.length})</h4>
                                  <div className="flex flex-wrap gap-1">
                                    {job.skills.map((skill, i) => (
                                      <span key={i} className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded">{skill}</span>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {Array.isArray(job.keywords) && job.keywords.length > 0 && (
                                <div>
                                  <h4 className="text-xs font-medium text-gray-500 uppercase mb-1">Keywords ({job.keywords.length})</h4>
                                  <div className="flex flex-wrap gap-1">
                                    {job.keywords.map((kw, i) => (
                                      <span key={i} className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded">{kw}</span>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {Array.isArray(job.required_education) && job.required_education.length > 0 && (
                                <div>
                                  <h4 className="text-xs font-medium text-gray-500 uppercase mb-1">Required Education</h4>
                                  <ul className="text-sm text-gray-700 space-y-0.5">
                                    {job.required_education.map((edu, i) => <li key={i}>• {edu}</li>)}
                                  </ul>
                                </div>
                              )}
                              {Array.isArray(job.expected_projects) && job.expected_projects.length > 0 && (
                                <div>
                                  <h4 className="text-xs font-medium text-gray-500 uppercase mb-1">Expected Projects</h4>
                                  <ul className="text-sm text-gray-700 space-y-0.5">
                                    {job.expected_projects.map((p, i) => <li key={i}>• {p}</li>)}
                                  </ul>
                                </div>
                              )}
                              {Array.isArray(job.preferred_certifications) && job.preferred_certifications.length > 0 && (
                                <div>
                                  <h4 className="text-xs font-medium text-gray-500 uppercase mb-1">Preferred Certifications</h4>
                                  <ul className="text-sm text-gray-700 space-y-0.5">
                                    {job.preferred_certifications.map((c, i) => <li key={i}>• {c}</li>)}
                                  </ul>
                                </div>
                              )}
                            </div>
                            <div className="mt-4 pt-4 border-t border-gray-200 text-xs text-gray-400 flex flex-wrap gap-4">
                              <span>ID: {job.job_id}</span>
                              <span>Created: {new Date(job.created_at).toLocaleDateString()}</span>
                              {job.deleted_at && <span className="text-red-500">Deactivated: {new Date(job.deleted_at).toLocaleDateString()}</span>}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Jobs Cards — mobile */}
        <div className="md:hidden space-y-3">
          {filteredJobs.length === 0 ? (
            <div className="bg-white rounded-lg shadow px-6 py-12 text-center text-gray-500">
              No jobs found matching your criteria
            </div>
          ) : (
            filteredJobs.map((job) => (
              <div key={job.job_id} className={`bg-white rounded-lg shadow p-4 ${!job.is_active ? 'opacity-60' : ''}`}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{job.title}</p>
                    <p className="text-xs text-gray-500">{job.department || 'No department'}</p>
                  </div>
                  <span className={`shrink-0 px-2 py-1 text-xs font-medium rounded-full ${
                    job.source === 'admin' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                  }`}>
                    {job.source === 'admin' ? 'Admin' : 'Dataset'}
                  </span>
                </div>

                {Array.isArray(job.skills) && job.skills.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-3">
                    {job.skills.slice(0, 4).map((s, i) => (
                      <span key={i} className="px-2 py-0.5 bg-blue-50 text-blue-700 text-xs rounded">{s}</span>
                    ))}
                    {job.skills.length > 4 && <span className="text-xs text-gray-400">+{job.skills.length - 4} more</span>}
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <button
                    onClick={() => handleToggleActive(job)}
                    className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium transition-colors ${
                      job.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                    }`}
                  >
                    {job.is_active ? <><Power className="w-3 h-3" />Active</> : <><PowerOff className="w-3 h-3" />Inactive</>}
                  </button>
                  <div className="flex gap-2">
                    <button onClick={() => openEditModal(job)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded" title="Edit">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDuplicateJob(job)} className="p-1.5 text-purple-600 hover:bg-purple-50 rounded" title="Duplicate">
                      <Copy className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Bulk Import Modal */}
      {isBulkImportOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end sm:items-center justify-center p-0 sm:p-4 z-50">
          <div className="bg-white rounded-t-2xl sm:rounded-lg shadow-2xl w-full sm:max-w-2xl max-h-[95vh] sm:max-h-[90vh] flex flex-col overflow-hidden">
            <div className="bg-gradient-to-r from-green-600 to-green-700 px-4 sm:px-6 py-4 text-white flex items-start justify-between gap-3 shrink-0">
              <div>
                <h2 className="text-lg sm:text-xl font-bold flex items-center gap-2">
                  <Upload className="w-5 h-5 shrink-0" />
                  Bulk Import Jobs
                </h2>
                <p className="text-green-100 text-xs sm:text-sm mt-1">Upload a CSV or JSON file to import multiple job postings at once</p>
              </div>
              <button onClick={closeModals} className="shrink-0 w-8 h-8 bg-white/20 hover:bg-white/30 rounded-lg flex items-center justify-center transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-4 sm:px-6 py-4 space-y-4 overflow-y-auto flex-1">
              {/* Success result */}
              {bulkResult ? (
                <div className="space-y-4">
                  <div className="flex items-start gap-3 bg-green-50 border border-green-200 rounded-lg p-4">
                    <CheckCircle className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-green-800">Import complete</p>
                      <p className="text-sm text-green-700 mt-1">{bulkResult.imported} job{bulkResult.imported !== 1 ? 's' : ''} imported successfully{bulkResult.skipped > 0 ? `, ${bulkResult.skipped} skipped` : ''}.</p>
                    </div>
                  </div>
                  <button onClick={closeModals} className="w-full px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium text-sm">Done</button>
                </div>
              ) : (
                <>
                  {/* File upload area */}
                  <div>
                    <input
                      ref={bulkFileRef}
                      type="file"
                      accept=".csv,.json"
                      className="hidden"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) parseBulkFile(f); }}
                    />
                    {!bulkFile ? (
                      <button
                        onClick={() => bulkFileRef.current?.click()}
                        className="w-full border-2 border-dashed border-green-300 rounded-lg p-8 flex flex-col items-center gap-3 hover:border-green-500 hover:bg-green-50 transition-colors"
                      >
                        <Upload className="w-8 h-8 text-green-400" />
                        <div className="text-center">
                          <p className="text-sm font-medium text-gray-700">Click to upload CSV or JSON</p>
                          <p className="text-xs text-gray-400 mt-1">Each row/entry = one job posting</p>
                        </div>
                      </button>
                    ) : (
                      <div className="flex items-center justify-between border border-gray-200 rounded-lg p-3">
                        <div className="flex items-center gap-2 text-sm text-gray-700 min-w-0">
                          <FileText className="w-4 h-4 text-green-600 shrink-0" />
                          <span className="truncate font-medium">{bulkFile.name}</span>
                        </div>
                        <button onClick={() => { setBulkFile(null); setBulkPreview([]); setBulkError(null); if (bulkFileRef.current) bulkFileRef.current.value = ''; }} className="shrink-0 text-gray-400 hover:text-red-500 ml-2">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Format hint */}
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs text-gray-600 space-y-1">
                    <p className="font-medium text-gray-700">Expected format:</p>
                    <p>CSV columns: <code className="bg-gray-200 px-1 rounded">title, department, skills, required_education, expected_projects, min_years_experience, max_years_experience</code></p>
                    <p>For array fields in CSV, separate values with <code className="bg-gray-200 px-1 rounded">|</code> — e.g. <code className="bg-gray-200 px-1 rounded">Python|SQL|React</code></p>
                    <p>JSON: array of objects with the same field names.</p>
                  </div>

                  {bulkError && (
                    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{bulkError}</div>
                  )}

                  {/* Preview */}
                  {bulkPreview.length > 0 && (
                    <div>
                      {/* Summary counts */}
                      <div className="flex items-center gap-3 mb-2 flex-wrap">
                        <p className="text-sm font-medium text-gray-700">{bulkPreview.length} job{bulkPreview.length !== 1 ? 's' : ''} found</p>
                        {bulkPreview.filter(j => j._issues.length === 0).length > 0 && (
                          <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full">
                            {bulkPreview.filter(j => j._issues.length === 0).length} ready
                          </span>
                        )}
                        {bulkPreview.filter(j => j._issues.length > 0).length > 0 && (
                          <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full">
                            {bulkPreview.filter(j => j._issues.length > 0).length} with warnings
                          </span>
                        )}
                        {bulkPreview.filter(j => !j.title.trim()).length > 0 && (
                          <span className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded-full">
                            {bulkPreview.filter(j => !j.title.trim()).length} will be skipped (no title)
                          </span>
                        )}
                      </div>

                      <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-56 overflow-y-auto">
                        {bulkPreview.map((job, i) => (
                          <div key={i} className={`px-3 py-2.5 ${!job.title.trim() ? 'bg-red-50' : job._issues.length > 0 ? 'bg-amber-50' : ''}`}>
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className={`text-sm font-medium truncate ${!job.title.trim() ? 'text-red-500 italic' : 'text-gray-800'}`}>
                                  {job.title.trim() || `Row ${i + 1} — no title`}
                                </p>
                                <p className="text-xs text-gray-400">{job.department || 'No department'} · {job.skills.length} skills</p>
                              </div>
                              {!job.title.trim() ? (
                                <span className="shrink-0 text-xs text-red-500 font-medium">Skipped</span>
                              ) : job._issues.length > 0 ? (
                                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                              ) : (
                                <CheckCircle className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                              )}
                            </div>
                            {job._issues.length > 0 && job.title.trim() && (
                              <p className="text-xs text-amber-700 mt-1">{job._issues.join(' · ')}</p>
                            )}
                          </div>
                        ))}
                      </div>

                      {bulkPreview.some(j => j._issues.length > 0 && j.title.trim()) && (
                        <p className="text-xs text-amber-700 mt-2">
                          Jobs with warnings will still be imported — you can edit them after import to fill in the missing fields.
                        </p>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            {!bulkResult && (
              <div className="px-4 sm:px-6 py-4 border-t border-gray-200 bg-gray-50 flex flex-col-reverse sm:flex-row gap-2 sm:justify-end shrink-0">
                <button onClick={closeModals} className="w-full sm:w-auto px-4 py-2.5 text-gray-700 bg-white border border-gray-300 hover:bg-gray-100 rounded-lg font-medium transition-colors text-sm">
                  Cancel
                </button>
                <button
                  onClick={handleBulkImport}
                  disabled={bulkImporting || bulkPreview.filter(j => j.title.trim()).length === 0}
                  className="w-full sm:w-auto px-4 py-2.5 bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2 text-sm"
                >
                  {bulkImporting ? (
                    <><Loader2 className="w-4 h-4 animate-spin" />Importing...</>
                  ) : (
                    <><Upload className="w-4 h-4" />Import {bulkPreview.filter(j => j.title.trim()).length > 0 ? `${bulkPreview.filter(j => j.title.trim()).length} Jobs` : 'Jobs'}</>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* AI Import Modal */}
      {isAIImportOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end sm:items-center justify-center p-0 sm:p-4 z-50">
          <div className="bg-white rounded-t-2xl sm:rounded-lg shadow-2xl w-full sm:max-w-2xl max-h-[95vh] sm:max-h-[90vh] flex flex-col overflow-hidden">

            {/* Header */}
            <div className="bg-gradient-to-r from-purple-600 to-purple-700 px-4 sm:px-6 py-4 text-white flex items-start justify-between gap-3 shrink-0">
              <div className="min-w-0">
                <h2 className="text-lg sm:text-xl font-bold flex items-center gap-2">
                  <Sparkles className="w-5 h-5 shrink-0" />
                  {aiStep === 'paste' ? 'Import Job with AI' : 'Complete Missing Fields'}
                </h2>
                <p className="text-purple-100 text-xs sm:text-sm mt-1 leading-snug">
                  {aiStep === 'paste'
                    ? 'Paste any job description — GPT extracts the fields automatically'
                    : 'GPT could not find some required fields. Please fill them in below.'}
                </p>
              </div>
              {/* Step indicator */}
              <div className="flex items-center gap-1.5 shrink-0">
                <div className={`w-2 h-2 rounded-full ${aiStep === 'paste' ? 'bg-white' : 'bg-white/40'}`} />
                <div className={`w-2 h-2 rounded-full ${aiStep === 'complete' ? 'bg-white' : 'bg-white/40'}`} />
                <button
                  onClick={closeModals}
                  className="ml-2 w-8 h-8 bg-white/20 hover:bg-white/30 rounded-lg flex items-center justify-center transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Step 1 — Paste JD */}
            {aiStep === 'paste' && (
              <>
                <div className="px-4 sm:px-6 py-4 space-y-4 overflow-y-auto flex-1">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Paste Job Description
                    </label>
                    <textarea
                      value={rawJDText}
                      onChange={(e) => setRawJDText(e.target.value)}
                      rows={8}
                      disabled={isParsing}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-sm resize-none disabled:bg-gray-50 disabled:text-gray-400"
                      placeholder="Paste the full job description here — from LinkedIn, JobStreet, Indeed, or any internal document."
                    />
                    <p className="text-xs text-gray-400 mt-1">{rawJDText.length} characters</p>
                  </div>
                  {parseError && (
                    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                      {parseError}
                    </div>
                  )}
                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 text-xs sm:text-sm text-purple-800">
                    GPT will extract skills, education, projects, experience range, and more. If any critical fields are missing, you'll be asked to fill them in before the form opens.
                  </div>
                </div>
                <div className="px-4 sm:px-6 py-4 border-t border-gray-200 bg-gray-50 flex flex-col-reverse sm:flex-row gap-2 sm:justify-end shrink-0">
                  <button
                    onClick={closeModals}
                    className="w-full sm:w-auto px-4 py-2.5 text-gray-700 bg-white border border-gray-300 hover:bg-gray-100 rounded-lg font-medium transition-colors text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleParseJD}
                    disabled={isParsing || !rawJDText.trim()}
                    className="w-full sm:w-auto px-4 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2 text-sm"
                  >
                    {isParsing ? (
                      <><Loader2 className="w-4 h-4 animate-spin" />Parsing with GPT...</>
                    ) : (
                      <><Sparkles className="w-4 h-4" />Parse & Fill Form</>
                    )}
                  </button>
                </div>
              </>
            )}

            {/* Step 2 — Complete missing fields */}
            {aiStep === 'complete' && (
              <>
                <div className="px-4 sm:px-6 py-4 space-y-5 overflow-y-auto flex-1">
                  {/* Warning banner */}
                  <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-lg p-3">
                    <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                    <div className="text-sm text-amber-800">
                      <p className="font-medium mb-1">Some fields couldn't be extracted from the JD</p>
                      <p className="text-xs">These fields are important for accurate candidate scoring. Please fill them in before continuing.</p>
                    </div>
                  </div>

                  {/* What GPT found — summary */}
                  {parsedResult && (
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-1">
                      <p className="text-xs font-medium text-gray-500 uppercase mb-2">What GPT extracted</p>
                      <p className="text-sm text-gray-700"><span className="font-medium">Title:</span> {parsedResult.title || <span className="text-red-500 italic">missing</span>}</p>
                      <p className="text-sm text-gray-700"><span className="font-medium">Department:</span> {parsedResult.department || '—'}</p>
                      <p className="text-sm text-gray-700"><span className="font-medium">Skills:</span> {parsedResult.skills.length > 0 ? parsedResult.skills.slice(0, 5).join(', ') + (parsedResult.skills.length > 5 ? ` +${parsedResult.skills.length - 5} more` : '') : <span className="text-red-500 italic">missing</span>}</p>
                      <p className="text-sm text-gray-700"><span className="font-medium">Education:</span> {parsedResult.required_education.length > 0 ? parsedResult.required_education.join(', ') : <span className="text-red-500 italic">missing</span>}</p>
                      <p className="text-sm text-gray-700"><span className="font-medium">Experience:</span> {(parsedResult.min_years_experience !== '' && parsedResult.min_years_experience !== 0) || parsedResult.max_years_experience !== '' ? `${parsedResult.min_years_experience ?? 0}–${parsedResult.max_years_experience ?? '?'} years` : <span className="text-red-500 italic">not specified</span>}</p>
                    </div>
                  )}

                  {/* Missing field inputs */}
                  <div className="space-y-4">
                    {missingFields.includes('title') && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Job Title <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={gapData.title || ''}
                          onChange={(e) => setGapData({ ...gapData, title: e.target.value })}
                          className="w-full px-3 py-2 border border-amber-300 rounded-lg focus:ring-2 focus:ring-amber-400 focus:border-amber-400 text-sm"
                          placeholder="e.g., Data Scientist, Backend Developer..."
                        />
                      </div>
                    )}

                    {missingFields.includes('skills') && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Required Skills <span className="text-red-500">*</span>
                        </label>
                        <TagInput
                          label=""
                          tags={gapData.skills || []}
                          onChange={(skills) => setGapData({ ...gapData, skills })}
                          placeholder="Type a skill and press Enter — e.g., Python, SQL..."
                        />
                      </div>
                    )}

                    {missingFields.includes('required_education') && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Required Education <span className="text-red-500">*</span>
                        </label>
                        <TagInput
                          label=""
                          tags={gapData.required_education || []}
                          onChange={(required_education) => setGapData({ ...gapData, required_education })}
                          placeholder="e.g., computer science, information technology..."
                        />
                      </div>
                    )}

                    {missingFields.includes('experience') && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Years of Experience <span className="text-red-500">*</span>
                        </label>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <input
                              type="number"
                              min="0"
                              max="50"
                              value={gapData.min_years_experience ?? ''}
                              onChange={(e) => setGapData({ ...gapData, min_years_experience: e.target.value === '' ? '' : Number(e.target.value) })}
                              className="w-full px-3 py-2 border border-amber-300 rounded-lg focus:ring-2 focus:ring-amber-400 text-sm"
                              placeholder="Min"
                            />
                            <p className="text-xs text-gray-400 mt-1">Minimum</p>
                          </div>
                          <div>
                            <input
                              type="number"
                              min="0"
                              max="50"
                              value={gapData.max_years_experience ?? ''}
                              onChange={(e) => setGapData({ ...gapData, max_years_experience: e.target.value === '' ? '' : Number(e.target.value) })}
                              className="w-full px-3 py-2 border border-amber-300 rounded-lg focus:ring-2 focus:ring-amber-400 text-sm"
                              placeholder="Max"
                            />
                            <p className="text-xs text-gray-400 mt-1">Maximum</p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="px-4 sm:px-6 py-4 border-t border-gray-200 bg-gray-50 flex flex-col-reverse sm:flex-row gap-2 sm:justify-between shrink-0">
                  <button
                    onClick={() => setAiStep('paste')}
                    className="w-full sm:w-auto px-4 py-2.5 text-gray-700 bg-white border border-gray-300 hover:bg-gray-100 rounded-lg font-medium transition-colors text-sm"
                  >
                    ← Back
                  </button>
                  <button
                    onClick={handleCompleteGaps}
                    className="w-full sm:w-auto px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2 text-sm"
                  >
                    Continue to Form
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </>
            )}

          </div>
        </div>
      )}

      {/* Create Job Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end sm:items-center justify-center p-0 sm:p-4 z-50">
          <div className="bg-white rounded-t-2xl sm:rounded-lg shadow-2xl w-full sm:max-w-3xl max-h-[95vh] sm:max-h-[90vh] flex flex-col overflow-hidden">
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-4 sm:px-6 py-4 text-white flex items-start justify-between gap-3 shrink-0">
              <div>
                <h2 className="text-lg sm:text-xl font-bold">Create New Job</h2>
                <p className="text-blue-100 text-xs sm:text-sm mt-0.5">Add a new job posting to the system</p>
              </div>
              <button
                onClick={closeModals}
                className="shrink-0 w-8 h-8 bg-white/20 hover:bg-white/30 rounded-lg flex items-center justify-center transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-4 sm:px-6 py-4 overflow-y-auto flex-1">
              {renderJobForm()}
            </div>

            <div className="px-4 sm:px-6 py-4 border-t border-gray-200 bg-gray-50 flex flex-col-reverse sm:flex-row gap-2 sm:justify-end shrink-0">
              <button
                onClick={closeModals}
                className="w-full sm:w-auto px-4 py-2.5 text-gray-700 bg-white border border-gray-300 hover:bg-gray-100 rounded-lg font-medium transition-colors text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateJob}
                disabled={isSubmitting}
                className="w-full sm:w-auto px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2 text-sm"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    Create Job
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Job Modal */}
      {isEditModalOpen && editingJob && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end sm:items-center justify-center p-0 sm:p-4 z-50">
          <div className="bg-white rounded-t-2xl sm:rounded-lg shadow-2xl w-full sm:max-w-3xl max-h-[95vh] sm:max-h-[90vh] flex flex-col overflow-hidden">
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-4 sm:px-6 py-4 text-white flex items-start justify-between gap-3 shrink-0">
              <div>
                <h2 className="text-lg sm:text-xl font-bold">Edit Job</h2>
                <p className="text-blue-100 text-xs sm:text-sm mt-0.5">Update job posting details</p>
              </div>
              <button
                onClick={closeModals}
                className="shrink-0 w-8 h-8 bg-white/20 hover:bg-white/30 rounded-lg flex items-center justify-center transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-4 sm:px-6 py-4 overflow-y-auto flex-1">
              {renderJobForm()}
            </div>

            <div className="px-4 sm:px-6 py-4 border-t border-gray-200 bg-gray-50 flex flex-col-reverse sm:flex-row gap-2 sm:justify-end shrink-0">
              <button
                onClick={closeModals}
                className="w-full sm:w-auto px-4 py-2.5 text-gray-700 bg-white border border-gray-300 hover:bg-gray-100 rounded-lg font-medium transition-colors text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateJob}
                disabled={isSubmitting}
                className="w-full sm:w-auto px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2 text-sm"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Edit2 className="w-4 h-4" />
                    Save Changes
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
