import { useEffect, useState, useCallback } from 'react';
import { Settings, Save, RotateCcw, AlertCircle, CheckCircle, Sliders, Target, GraduationCap, Briefcase, FolderGit2, Award, BookOpen, AlertTriangle } from 'lucide-react';
import { getSupabaseAdminClient, ScoringSettings } from '../lib/supabase';

const DEFAULT_SETTINGS = {
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
  // Overall score composition
  resume_weight: 50,
  video_weight: 40,
  profile_weight: 10,
  // Resume formula split
  requirement_weight: 60,
  count_weight: 40,
};

type FormValues = typeof DEFAULT_SETTINGS;

interface ValidationErrors {
  weights?: string;
  overall_weights?: string;
  formula_weights?: string;
  qualified_threshold?: string;
  review_threshold?: string;
  baseline?: string;
}

const isTableNotExistError = (error: unknown): boolean => {
  if (error && typeof error === 'object' && 'code' in error) {
    return (error as { code?: string }).code === '42P01' ||
      (error as { message?: string }).message?.includes('does not exist') ||
      (error as { status?: number }).status === 404;
  }
  return false;
};

// Defined outside the component to prevent remounting on every render
function WeightInput({
  label,
  icon: Icon,
  value,
  onChange,
  color,
}: {
  label: string;
  icon: React.ElementType;
  value: number;
  onChange: (value: number) => void;
  color: string;
}) {
  return (
    <div className="bg-white p-4 rounded-lg border border-gray-200">
      <div className="flex items-center gap-2 mb-3">
        <div className={`p-2 rounded-lg ${color}`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        <label className="font-medium text-gray-900">{label}</label>
      </div>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min="0"
          max="100"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
        />
        <input
          type="number"
          min="0"
          max="100"
          value={value}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
          className="w-20 px-3 py-2 border border-gray-300 rounded-lg text-center font-medium focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
        <span className="text-gray-500 font-medium">%</span>
      </div>
    </div>
  );
}

export function AdminScoringSettings() {
  const [settings, setSettings] = useState<ScoringSettings | null>(null);
  const [formValues, setFormValues] = useState<FormValues>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({});
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const totalWeight =
    (formValues.experience_weight || 0) +
    (formValues.skills_weight || 0) +
    (formValues.education_weight || 0) +
    (formValues.projects_weight || 0) +
    (formValues.traincert_weight || 0) +
    (formValues.achievements_weight || 0);

  const validateForm = useCallback((): boolean => {
    const errors: ValidationErrors = {};

    const expWeight = formValues.experience_weight || 0;
    const skillWeight = formValues.skills_weight || 0;
    const eduWeight = formValues.education_weight || 0;
    const projWeight = formValues.projects_weight || 0;
    const tcWeight = formValues.traincert_weight || 0;
    const achWeight = formValues.achievements_weight || 0;
    const qualThresh = formValues.qualified_threshold || 0;
    const revThresh = formValues.review_threshold || 0;

    const weightsSum = expWeight + skillWeight + eduWeight + projWeight + tcWeight + achWeight;
    if (weightsSum !== 100) {
      errors.weights = `Weights must sum to 100 (currently: ${weightsSum})`;
    }

    // Overall score composition must sum to 100
    const overallSum = (formValues.resume_weight || 0) + (formValues.video_weight || 0) + (formValues.profile_weight || 0);
    if (overallSum !== 100) {
      errors.overall_weights = `Overall score weights must sum to 100 (currently: ${overallSum})`;
    }

    // Resume formula split must sum to 100
    const formulaSum = (formValues.requirement_weight || 0) + (formValues.count_weight || 0);
    if (formulaSum !== 100) {
      errors.formula_weights = `Resume formula weights must sum to 100 (currently: ${formulaSum})`;
    }

    const weights = [
      { name: 'Experience', value: expWeight },
      { name: 'Skills', value: skillWeight },
      { name: 'Education', value: eduWeight },
      { name: 'Projects', value: projWeight },
      { name: 'Trainings & Certs', value: tcWeight },
      { name: 'Achievements', value: achWeight },
    ];
    for (const weight of weights) {
      if (weight.value < 0 || weight.value > 100) {
        errors.weights = `${weight.name} weight must be between 0 and 100`;
        break;
      }
    }

    if (qualThresh < 0 || qualThresh > 100) {
      errors.qualified_threshold = 'Qualified threshold must be between 0 and 100';
    }
    if (revThresh < 0 || revThresh > 100) {
      errors.review_threshold = 'Review threshold must be between 0 and 100';
    }
    if (qualThresh <= revThresh) {
      errors.qualified_threshold = 'Qualified threshold must be greater than review threshold';
      errors.review_threshold = 'Review threshold must be less than qualified threshold';
    }

    const baselines = [
      formValues.baseline_experience,
      formValues.baseline_skills,
      formValues.baseline_education,
      formValues.baseline_projects,
      formValues.baseline_traincert,
      formValues.baseline_achievements,
    ];
    if (baselines.some(b => (b || 0) < 0 || (b || 0) > 100)) {
      errors.baseline = 'All baselines must be between 0 and 100';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  }, [formValues]);

  useEffect(() => {
    if (!loading) validateForm();
  }, [formValues, validateForm, loading]);

  const loadSettings = async () => {
    try {
      setLoading(true);
      setError(null);
      const adminClient = getSupabaseAdminClient();

      const { data, error: fetchError } = await adminClient
        .from('scoring_settings')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (fetchError) {
        if (isTableNotExistError(fetchError)) {
          console.warn('scoring_settings table does not exist, using defaults');
          setSettings(null);
          setFormValues(DEFAULT_SETTINGS);
          setLoading(false);
          return;
        }
        throw fetchError;
      }

      if (data) {
        setSettings(data);
        setFormValues({
          experience_weight: data.experience_weight ?? 28,
          skills_weight: data.skills_weight ?? 30,
          education_weight: data.education_weight ?? 18,
          projects_weight: data.projects_weight ?? 14,
          traincert_weight: data.traincert_weight ?? 6,
          achievements_weight: data.achievements_weight ?? 4,
          qualified_threshold: data.qualified_threshold ?? 78,
          review_threshold: data.review_threshold ?? 65,
          baseline_experience: data.baseline_experience ?? 2,
          baseline_skills: data.baseline_skills ?? 10,
          baseline_education: data.baseline_education ?? 2,
          baseline_projects: data.baseline_projects ?? 2,
          baseline_traincert: data.baseline_traincert ?? 2,
          baseline_achievements: data.baseline_achievements ?? 1,
          resume_weight: data.resume_weight ?? 50,
          video_weight: data.video_weight ?? 40,
          profile_weight: data.profile_weight ?? 10,
          requirement_weight: data.requirement_weight ?? 60,
          count_weight: data.count_weight ?? 40,
        });
      } else {
        setSettings(null);
        setFormValues(DEFAULT_SETTINGS);
      }
    } catch (err) {
      console.error('Error loading settings:', err);
      setError(err instanceof Error ? err.message : 'Failed to load scoring settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!validateForm()) return;

    try {
      setSaving(true);
      setError(null);
      setSaveSuccess(false);
      const adminClient = getSupabaseAdminClient();

      // Always upsert into the singleton row. If settings_id exists we reuse it,
      // otherwise Supabase will insert a new row. updated_at is set explicitly so
      // both the frontend and backend can reliably order by it.
      const saveData = {
        ...(settings ? { settings_id: settings.settings_id } : {}),
        scoring_type: 'hybrid',
        updated_at: new Date().toISOString(),
        experience_weight: formValues.experience_weight,
        skills_weight: formValues.skills_weight,
        education_weight: formValues.education_weight,
        projects_weight: formValues.projects_weight,
        traincert_weight: formValues.traincert_weight,
        achievements_weight: formValues.achievements_weight,
        qualified_threshold: formValues.qualified_threshold,
        review_threshold: formValues.review_threshold,
        baseline_experience: formValues.baseline_experience,
        baseline_skills: formValues.baseline_skills,
        baseline_education: formValues.baseline_education,
        baseline_projects: formValues.baseline_projects,
        baseline_traincert: formValues.baseline_traincert,
        baseline_achievements: formValues.baseline_achievements,
        resume_weight: formValues.resume_weight,
        video_weight: formValues.video_weight,
        profile_weight: formValues.profile_weight,
        requirement_weight: formValues.requirement_weight,
        count_weight: formValues.count_weight,
      };

      const { error: upsertError } = await adminClient
        .from('scoring_settings')
        .upsert(saveData, { onConflict: 'settings_id' });

      if (upsertError) {
        if (upsertError.message?.includes('column') || upsertError.code === '42703') {
          throw new Error(`Database column missing: ${upsertError.message}. Please run the migration add_hybrid_scoring_columns.sql in Supabase.`);
        }
        if (isTableNotExistError(upsertError)) {
          throw new Error('Database table "scoring_settings" does not exist. Please run the database migration first.');
        }
        throw new Error(`Save failed: ${upsertError.message}`);
      }

      setSaveSuccess(true);
      await loadSettings();
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error('Error saving settings:', err);
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (settings) {
      setFormValues({
        experience_weight: settings.experience_weight || 28,
        skills_weight: settings.skills_weight || 30,
        education_weight: settings.education_weight || 18,
        projects_weight: settings.projects_weight || 14,
        traincert_weight: settings.traincert_weight || 6,
        achievements_weight: settings.achievements_weight || 4,
        qualified_threshold: settings.qualified_threshold || 78,
        review_threshold: settings.review_threshold || 65,
        baseline_experience: settings.baseline_experience || 2,
        baseline_skills: settings.baseline_skills || 10,
        baseline_education: settings.baseline_education || 2,
        baseline_projects: settings.baseline_projects || 2,
        baseline_traincert: settings.baseline_traincert || 2,
        baseline_achievements: settings.baseline_achievements || 1,
        resume_weight: settings.resume_weight ?? 50,
        video_weight: settings.video_weight ?? 40,
        profile_weight: settings.profile_weight ?? 10,
        requirement_weight: settings.requirement_weight ?? 60,
        count_weight: settings.count_weight ?? 40,
      });
    } else {
      setFormValues(DEFAULT_SETTINGS);
    }
    setValidationErrors({});
    setError(null);
  };

  const handleResetToDefaults = () => {
    setShowResetConfirm(true);
  };

  const confirmResetToDefaults = () => {
    setFormValues(DEFAULT_SETTINGS);
    setValidationErrors({});
    setShowResetConfirm(false);
  };

  useEffect(() => {
    loadSettings();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-gray-600 text-lg">Loading scoring settings...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-8 lg:p-10">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            <Settings className="w-8 h-8 text-blue-600" />
            Scoring Settings
          </h1>
          <p className="text-gray-600 mt-1">
            Configure unified scoring weights and thresholds for all applicants
          </p>
          <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <div className="flex items-center gap-2 text-blue-800 font-medium">
              <Target className="w-5 h-5" />
              Unified Scoring — Same for All Applicants
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            {error}
          </div>
        )}

        {saveSuccess && (
          <div className="mb-6 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 flex items-center gap-2">
            <CheckCircle className="w-5 h-5" />
            Settings saved successfully!
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Score Thresholds — full width at the top */}
          <div className="lg:col-span-2 bg-white rounded-lg shadow">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-50 rounded-lg">
                  <Target className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Score Thresholds</h2>
                  <p className="text-sm text-gray-500">Set the score boundaries that determine each applicant's qualification status</p>
                </div>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {/* Sliders */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {/* Qualified Threshold */}
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="text-sm font-semibold text-gray-800">Qualified Threshold</p>
                      <p className="text-xs text-gray-500 mt-0.5">Minimum score to be considered qualified</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <input
                        type="number" min="0" max="100"
                        value={formValues.qualified_threshold}
                        onChange={(e) => setFormValues({ ...formValues, qualified_threshold: Number(e.target.value) || 0 })}
                        className={`w-16 px-2 py-1.5 border rounded-lg text-center text-lg font-bold text-green-600 focus:ring-2 focus:ring-green-500 focus:border-green-500 bg-white ${validationErrors.qualified_threshold ? 'border-red-400' : 'border-gray-200'}`}
                      />
                      <span className="text-sm font-medium text-gray-500">%</span>
                    </div>
                  </div>
                  <input
                    type="range" min="0" max="100"
                    value={formValues.qualified_threshold}
                    onChange={(e) => setFormValues({ ...formValues, qualified_threshold: Number(e.target.value) })}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-green-500"
                  />
                  {validationErrors.qualified_threshold && (
                    <p className="text-red-500 text-xs mt-2 flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" />{validationErrors.qualified_threshold}</p>
                  )}
                </div>

                {/* Review Threshold */}
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="text-sm font-semibold text-gray-800">Review Threshold</p>
                      <p className="text-xs text-gray-500 mt-0.5">Minimum score to trigger manual review</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <input
                        type="number" min="0" max="100"
                        value={formValues.review_threshold}
                        onChange={(e) => setFormValues({ ...formValues, review_threshold: Number(e.target.value) || 0 })}
                        className={`w-16 px-2 py-1.5 border rounded-lg text-center text-lg font-bold text-yellow-600 focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 bg-white ${validationErrors.review_threshold ? 'border-red-400' : 'border-gray-200'}`}
                      />
                      <span className="text-sm font-medium text-gray-500">%</span>
                    </div>
                  </div>
                  <input
                    type="range" min="0" max="100"
                    value={formValues.review_threshold}
                    onChange={(e) => setFormValues({ ...formValues, review_threshold: Number(e.target.value) })}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-yellow-500"
                  />
                  {validationErrors.review_threshold && (
                    <p className="text-red-500 text-xs mt-2 flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" />{validationErrors.review_threshold}</p>
                  )}
                </div>
              </div>

              {/* Visualization Bar */}
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Score Range Preview</p>
                <div className="relative h-6 rounded-full overflow-hidden flex">
                  <div className="h-full bg-red-400 transition-all duration-200" style={{ width: `${formValues.review_threshold}%` }} />
                  <div className="h-full bg-yellow-400 transition-all duration-200" style={{ width: `${Math.max(0, formValues.qualified_threshold - formValues.review_threshold)}%` }} />
                  <div className="h-full bg-green-400 transition-all duration-200 flex-1" />
                </div>
                <div className="flex justify-between mt-1.5 text-xs text-gray-400">
                  <span>0%</span>
                  <span className="text-red-500 font-medium">{formValues.review_threshold}%</span>
                  <span className="text-yellow-600 font-medium">{formValues.qualified_threshold}%</span>
                  <span>100%</span>
                </div>
                <div className="flex gap-4 mt-2">
                  <span className="flex items-center gap-1.5 text-xs text-gray-500"><span className="w-2.5 h-2.5 rounded-full bg-red-400 inline-block" />Rejected</span>
                  <span className="flex items-center gap-1.5 text-xs text-gray-500"><span className="w-2.5 h-2.5 rounded-full bg-yellow-400 inline-block" />Needs Review</span>
                  <span className="flex items-center gap-1.5 text-xs text-gray-500"><span className="w-2.5 h-2.5 rounded-full bg-green-400 inline-block" />Qualified</span>
                </div>
              </div>
            </div>
          </div>

          {/* Resume Component Weights */}
          <div className="bg-white rounded-lg shadow flex flex-col">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-50 rounded-lg">
                  <Sliders className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Resume Scoring Weights</h2>
                  <p className="text-sm text-gray-500">How much each factor contributes to the resume score</p>
                </div>
              </div>
            </div>

            <div className="p-6 space-y-4 flex-1">
              <WeightInput label="Experience Weight" icon={Briefcase} value={formValues.experience_weight} onChange={(v) => setFormValues({ ...formValues, experience_weight: v })} color="bg-blue-600" />
              <WeightInput label="Skills Weight" icon={Target} value={formValues.skills_weight} onChange={(v) => setFormValues({ ...formValues, skills_weight: v })} color="bg-green-600" />
              <WeightInput label="Education Weight" icon={GraduationCap} value={formValues.education_weight} onChange={(v) => setFormValues({ ...formValues, education_weight: v })} color="bg-purple-600" />
              <WeightInput label="Projects Weight" icon={FolderGit2} value={formValues.projects_weight} onChange={(v) => setFormValues({ ...formValues, projects_weight: v })} color="bg-orange-600" />
              <WeightInput label="Trainings & Certifications Weight" icon={BookOpen} value={formValues.traincert_weight} onChange={(v) => setFormValues({ ...formValues, traincert_weight: v })} color="bg-teal-600" />
              <WeightInput label="Achievements Weight" icon={Award} value={formValues.achievements_weight} onChange={(v) => setFormValues({ ...formValues, achievements_weight: v })} color="bg-yellow-600" />

              <div className={`p-4 rounded-lg border-2 ${totalWeight === 100 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                <div className="flex items-center justify-between">
                  <span className="font-medium text-gray-900">Total Weight:</span>
                  <span className={`text-2xl font-bold ${totalWeight === 100 ? 'text-green-600' : 'text-red-600'}`}>
                    {totalWeight}%
                  </span>
                </div>
                {validationErrors.weights && (
                  <p className="text-red-600 text-sm mt-2 flex items-center gap-1">
                    <AlertCircle className="w-4 h-4" />
                    {validationErrors.weights}
                  </p>
                )}
                
              </div>
            </div>
          </div>

          {/* Threshold + Baselines */}
          <div className="space-y-6">
            {/* Resume Formula Split */}
            <div className="bg-white rounded-lg shadow">
              <div className="p-6 border-b border-gray-200">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-50 rounded-lg">
                    <Sliders className="w-6 h-6 text-blue-600" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">Resume Formula Split</h2>
                    <p className="text-sm text-gray-500">Match weight prioritizes fit; count weight rewards breadth.
</p>
                  </div>
                </div>
              </div>
              <div className="p-6 space-y-4">
                <WeightInput label="Requirement Match Weight" icon={Target} value={formValues.requirement_weight} onChange={(v) => setFormValues({ ...formValues, requirement_weight: v })} color="bg-blue-600" />
                <WeightInput label="Count Score Weight" icon={FolderGit2} value={formValues.count_weight} onChange={(v) => setFormValues({ ...formValues, count_weight: v })} color="bg-orange-600" />
              </div>
              <div className="px-6 pb-6">
                <div className={`p-3 rounded-lg border-2 flex items-center justify-between ${
                  formValues.requirement_weight + formValues.count_weight === 100
                    ? 'bg-green-50 border-green-200'
                    : 'bg-red-50 border-red-200'
                }`}>
                  <span className="text-sm font-medium text-gray-700">Total:</span>
                  <span className={`text-lg font-bold ${
                    formValues.requirement_weight + formValues.count_weight === 100
                      ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {formValues.requirement_weight + formValues.count_weight}%
                  </span>
                </div>
                {validationErrors.formula_weights && (
                  <p className="text-red-600 text-sm mt-2 flex items-center gap-1">
                    <AlertCircle className="w-4 h-4" />
                    {validationErrors.formula_weights}
                  </p>
                )}
              </div>
            </div>

            {/* Count Baselines */}
            <div className="bg-white rounded-lg shadow">
              <div className="p-6 border-b border-gray-200">
                <div className="flex items-center gap-3">
                  <FolderGit2 className="w-6 h-6 text-blue-600" />
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">Count Baselines</h2>
                    <p className="text-sm text-gray-500">Minimum counts for full score in each category</p>
                  </div>
                </div>
              </div>

              <div className="p-6 space-y-4">
                {(
                  [
                    { key: 'baseline_experience', label: 'Experience Baseline', suffix: 'experiences needed for 100%', max: 20, ring: 'focus:ring-blue-500 focus:border-blue-500' },
                    { key: 'baseline_skills', label: 'Skills Baseline', suffix: 'skills needed for 100%', max: 50, ring: 'focus:ring-green-500 focus:border-green-500' },
                    { key: 'baseline_education', label: 'Education Baseline', suffix: 'educations needed for 100%', max: 10, ring: 'focus:ring-purple-500 focus:border-purple-500' },
                    { key: 'baseline_projects', label: 'Projects Baseline', suffix: 'projects needed for 100%', max: 20, ring: 'focus:ring-orange-500 focus:border-orange-500' },
                    { key: 'baseline_traincert', label: 'Trainings & Certifications Baseline', suffix: 'trainings/certs needed for 100%', max: 20, ring: 'focus:ring-teal-500 focus:border-teal-500' },
                    { key: 'baseline_achievements', label: 'Achievements Baseline', suffix: 'achievements needed for 100%', max: 20, ring: 'focus:ring-yellow-500 focus:border-yellow-500' },
                  ] as const
                ).map(({ key, label, suffix, max, ring }) => (
                  <div key={key}>
                    <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
                    <div className="flex items-center gap-3">
                      <input
                        type="number"
                        min="0"
                        max={max}
                        value={formValues[key]}
                        onChange={(e) => setFormValues({ ...formValues, [key]: Number(e.target.value) || 0 })}
                        className={`w-24 px-3 py-2 border border-gray-300 rounded-lg text-center font-medium ${ring}`}
                      />
                      <span className="text-gray-500 text-sm">{suffix}</span>
                    </div>
                  </div>
                ))}

                {validationErrors.baseline && (
                  <p className="text-red-600 text-sm flex items-center gap-1">
                    <AlertCircle className="w-4 h-4" />
                    {validationErrors.baseline}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Overall Score Composition */}
          <div className="lg:col-span-2 bg-white rounded-lg shadow">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center gap-3">
                <Target className="w-6 h-6 text-indigo-600" />
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Overall Score Composition</h2>
                  <p className="text-sm text-gray-500">How much each assessment type contributes to the final candidate score</p>
                </div>
              </div>
            </div>
            <div className="p-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
              <WeightInput label="Resume Score" icon={Briefcase} value={formValues.resume_weight} onChange={(v) => setFormValues({ ...formValues, resume_weight: v })} color="bg-blue-600" />
              <WeightInput label="Video Assessment" icon={BookOpen} value={formValues.video_weight} onChange={(v) => setFormValues({ ...formValues, video_weight: v })} color="bg-purple-600" />
              <WeightInput label="Profile Fit" icon={Award} value={formValues.profile_weight} onChange={(v) => setFormValues({ ...formValues, profile_weight: v })} color="bg-emerald-600" />
            </div>
            <div className="px-6 pb-6">
              <div className={`p-3 rounded-lg border-2 flex items-center justify-between ${
                formValues.resume_weight + formValues.video_weight + formValues.profile_weight === 100
                  ? 'bg-green-50 border-green-200'
                  : 'bg-red-50 border-red-200'
              }`}>
                <span className="text-sm font-medium text-gray-700">Total:</span>
                <span className={`text-lg font-bold ${
                  formValues.resume_weight + formValues.video_weight + formValues.profile_weight === 100
                    ? 'text-green-600'
                    : 'text-red-600'
                }`}>
                  {formValues.resume_weight + formValues.video_weight + formValues.profile_weight}%
                </span>
              </div>
              {validationErrors.overall_weights && (
                <p className="text-red-600 text-sm mt-2 flex items-center gap-1">
                  <AlertCircle className="w-4 h-4" />
                  {validationErrors.overall_weights}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-end">
          <button onClick={handleResetToDefaults} className="flex items-center justify-center gap-2 px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-lg font-medium transition-colors">
            <RotateCcw className="w-4 h-4" />
            Reset to Defaults
          </button>
          <button onClick={handleCancel} className="flex items-center justify-center gap-2 px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-lg font-medium transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || Object.keys(validationErrors).length > 0}
            className="flex items-center justify-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors"
          >
            {saving ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Save Settings
              </>
            )}
          </button>
        </div>

        {settings?.updated_at && (
          <div className="mt-4 text-right text-sm text-gray-500">
            Last updated: {new Date(settings.updated_at).toLocaleString()}
          </div>
        )}
      </div>

      {/* Reset to Defaults Confirmation Modal */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-6 h-6 text-amber-600" />
            </div>
            <h3 className="text-base font-semibold text-gray-900 text-center mb-1">Reset to Default Settings?</h3>
            <p className="text-sm text-gray-500 text-center mb-5">
              All scoring weights, thresholds, and baselines will be restored to their original default values. Any unsaved changes will be lost.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowResetConfirm(false)}
                className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                Keep Current Settings
              </button>
              <button
                onClick={confirmResetToDefaults}
                className="flex-1 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-sm font-medium transition-colors"
              >
                Reset to Defaults
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
