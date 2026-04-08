import { useState, useEffect } from 'react';
import {
  Settings,
  Mail,
  Bell,
  Shield,
  Database,
  Palette,
  Save,
  CheckCircle,
  AlertCircle,
  Clock,
  FileText,
  RefreshCw,
  Download,
  ChevronRight,
} from 'lucide-react';
import { getSupabaseAdminClient } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { useTranslation } from 'react-i18next';

export function AdminSettings() {
  const { adminSession } = useAuth();
  const { updateSettings } = useSettings();
  const { t } = useTranslation();
  const [activeSection, setActiveSection] = useState<'general' | 'notifications' | 'security' | 'integrations' | 'appearance' | 'advanced'>('general');
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState({
    // General
    companyName: 'AutoIntel Recruitment',
    adminEmail: 'admin@autointel.com',
    timezone: 'Asia/Manila',
    dateFormat: 'MM/DD/YYYY',
    language: 'en',
    
    // Notifications
    emailNewApplicant: true,
    emailAssessmentComplete: true,
    emailDailyDigest: false,
    browserNotifications: true,
    webhook: '',
    
    // Security
    twoFactorAuth: false,
    passwordExpiry: '90',
    sessionTimeout: '30',
    ipWhitelist: '',
    
    // Scoring
    autoRejectThreshold: '30',
    autoShortlistThreshold: '85',
    
    // Appearance
    sidebarCollapsed: false,
    compactView: false,
    
    // Advanced
    dataRetention: '365',
    autoArchive: true,
  });

  // Fetch settings from Supabase
  useEffect(() => {
    const fetchSettings = async () => {
      if (!adminSession?.user_id) {
        setLoading(false);
        return;
      }

      try {
        const adminClient = getSupabaseAdminClient();
        const { data, error } = await adminClient
          .from('admin_users')
          .select('*')
          .eq('id', adminSession.user_id)
          .maybeSingle();

        if (error) {
          console.error('Error fetching settings:', error);
          setLoading(false);
          return;
        }

        if (data) {
          // Map database fields to state
          setSettings({
            companyName: data.company_name || 'AutoIntel Recruitment',
            adminEmail: data.email || adminSession.email || 'admin@autointel.com',
            timezone: data.timezone || 'Asia/Manila',
            dateFormat: data.date_format || 'MM/DD/YYYY',
            language: data.language || 'en',
            emailNewApplicant: data.email_new_applicant ?? true,
            emailAssessmentComplete: data.email_assessment_complete ?? true,
            emailDailyDigest: data.email_daily_digest ?? false,
            browserNotifications: data.browser_notifications ?? true,
            webhook: data.slack_webhook || '',
            twoFactorAuth: data.two_factor_auth ?? false,
            passwordExpiry: data.password_expiry || '90',
            sessionTimeout: data.session_timeout || '30',
            ipWhitelist: data.ip_whitelist || '',
            autoRejectThreshold: String(data.auto_reject_threshold || 30),
            autoShortlistThreshold: String(data.auto_shortlist_threshold || 85),
            sidebarCollapsed: data.sidebar_collapsed ?? false,
            compactView: data.compact_view ?? false,
            dataRetention: data.data_retention || '365',
            autoArchive: data.auto_archive ?? true,
          });
        }
      } catch (error) {
        console.error('Error fetching settings:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchSettings();
  }, [adminSession?.user_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = async () => {
    setSaveError(null);

    if (!adminSession?.user_id) {
      setSaveError('No admin session — please log in again.');
      return;
    }

    try {
      const adminClient = getSupabaseAdminClient();

      // Debug: confirm what we're targeting
      console.log('[Settings] Saving for user_id:', adminSession.user_id);
      console.log('[Settings] language:', settings.language, 'timezone:', settings.timezone);

      const { error, count } = await adminClient
        .from('admin_users')
        .update({
          company_name: settings.companyName,
          timezone: settings.timezone,
          date_format: settings.dateFormat,
          language: settings.language,
          email_new_applicant: settings.emailNewApplicant,
          email_assessment_complete: settings.emailAssessmentComplete,
          email_daily_digest: settings.emailDailyDigest,
          browser_notifications: settings.browserNotifications,
          slack_webhook: settings.webhook,
          two_factor_auth: settings.twoFactorAuth,
          password_expiry: settings.passwordExpiry,
          session_timeout: settings.sessionTimeout,
          ip_whitelist: settings.ipWhitelist,
          auto_reject_threshold: parseInt(settings.autoRejectThreshold),
          auto_shortlist_threshold: parseInt(settings.autoShortlistThreshold),
          sidebar_collapsed: settings.sidebarCollapsed,
          compact_view: settings.compactView,
          data_retention: settings.dataRetention,
          auto_archive: settings.autoArchive,
        })
        .eq('id', adminSession.user_id)
        .select('id');

      console.log('[Settings] Update result — error:', error, 'count:', count);

      if (error) {
        setSaveError(`DB error: ${error.message}`);
        return;
      }

      // Propagate to SettingsContext
      updateSettings({
        timezone: settings.timezone,
        dateFormat: settings.dateFormat,
        language: settings.language,
        browserNotifications: settings.browserNotifications,
      });

      // Notify AuthContext of session timeout change
      window.dispatchEvent(new CustomEvent('autointel:settings-saved', {
        detail: { sessionTimeout: settings.sessionTimeout },
      }));

      // Run auto-archive if enabled
      if (settings.autoArchive && settings.dataRetention !== 'forever') {
        try {
          const archived = await archiveOldApplicants();
          if (archived > 0) console.log(`[Settings] Auto-archived ${archived} applicant(s).`);
        } catch (archiveErr) {
          console.warn('[Settings] Auto-archive failed:', archiveErr);
        }
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unexpected error saving settings.';
      console.error('[Settings] Save exception:', err);
      setSaveError(msg);
    }
  };

  const archiveOldApplicants = async (): Promise<number> => {
    if (settings.dataRetention === 'forever') return 0;
    const days = parseInt(settings.dataRetention);
    if (isNaN(days)) return 0;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const adminClient = getSupabaseAdminClient();
    const { data, error } = await adminClient
      .from('applicants')
      .update({ status: 'archived' })
      .lt('created_at', cutoff.toISOString())
      .neq('status', 'archived')
      .select('id');
    if (error) throw new Error(error.message);
    return data?.length ?? 0;
  };

  const exportAllData = async () => {
    const adminClient = getSupabaseAdminClient();
    const { data, error } = await adminClient
      .from('applicants')
      .select('id, name, email, position, status, overall_score, screening_score, created_at, decision_date')
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) {
      alert('No applicant data to export.');
      return;
    }
    const headers = ['ID', 'Name', 'Email', 'Position', 'Status', 'Overall Score', 'Screening Score', 'Applied At', 'Decision Date'];
    const rows = data.map(a => [
      a.id,
      a.name,
      a.email,
      a.position,
      a.status ?? '',
      a.overall_score ?? '',
      a.screening_score ?? '',
      a.created_at ? new Date(a.created_at).toLocaleDateString() : '',
      a.decision_date ? new Date(a.decision_date).toLocaleDateString() : '',
    ]);
    const csv = [headers, ...rows]
      .map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `applicants_export_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const sections = [
    { id: 'general', label: t('settings.general'), icon: Settings },
    { id: 'notifications', label: t('settings.notifications'), icon: Bell },
    { id: 'security', label: t('settings.security'), icon: Shield },
    { id: 'integrations', label: t('settings.integrations'), icon: Database },
    { id: 'appearance', label: t('settings.appearance'), icon: Palette },
    { id: 'advanced', label: t('settings.advanced'), icon: Clock },
  ];

  const renderSettingItem = (
    label: string,
    description: string,
    control: React.ReactNode
  ) => (
    <div className="flex items-start justify-between py-4 border-b border-gray-100 last:border-0">
      <div className="flex-1 pr-4">
        <h4 className="font-medium text-gray-900">{label}</h4>
        <p className="text-sm text-gray-500 mt-1">{description}</p>
      </div>
      <div className="flex-shrink-0">
        {control}
      </div>
    </div>
  );

  const renderToggle = (key: keyof typeof settings) => (
    <button
      onClick={() => setSettings({ ...settings, [key]: !settings[key] })}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
        settings[key] ? 'bg-blue-600' : 'bg-gray-200'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          settings[key] ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );

  // Show loading state
  if (loading) {
    return (
      <div className="p-8 lg:p-10 space-y-6 bg-slate-50 min-h-screen flex items-center justify-center">
        <div className="flex items-center gap-3 text-gray-600">
          <RefreshCw className="w-6 h-6 animate-spin" />
          <span>Loading settings...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 lg:p-10 space-y-6 bg-slate-50 min-h-screen">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('settings.title')}</h1>
          <p className="text-gray-600 mt-1">{t('settings.subtitle')}</p>
        </div>
        <div className="flex items-center gap-3">
          {saved && (
            <span className="flex items-center gap-2 text-green-600 bg-green-50 px-3 py-1.5 rounded-lg">
              <CheckCircle className="w-4 h-4" />
              {t('settings.saved')}
            </span>
          )}
          {saveError && (
            <span className="flex items-center gap-2 text-red-600 bg-red-50 px-3 py-1.5 rounded-lg text-sm max-w-xs truncate" title={saveError}>
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {saveError}
            </span>
          )}
          <button
            onClick={handleSave}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Save className="w-4 h-4" />
            {t('settings.save_changes')}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar Navigation */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden sticky top-4">
            {sections.map((section) => (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id as typeof activeSection)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                  activeSection === section.id
                    ? 'bg-blue-50 text-blue-700 border-l-4 border-blue-600'
                    : 'text-gray-700 hover:bg-gray-50 border-l-4 border-transparent'
                }`}
              >
                <section.icon className={`w-5 h-5 ${activeSection === section.id ? 'text-blue-600' : 'text-gray-400'}`} />
                <span className="font-medium">{section.label}</span>
                <ChevronRight className={`w-4 h-4 ml-auto ${activeSection === section.id ? 'text-blue-600' : 'text-gray-300'}`} />
              </button>
            ))}
          </div>

          {/* Quick Info */}
          <div className="mt-6 bg-blue-50 rounded-xl p-4 border border-blue-100">
            <div className="flex items-center gap-2 mb-2">
              <Shield className="w-5 h-5 text-blue-600" />
              <h4 className="font-semibold text-blue-900">Account Status</h4>
            </div>
            <p className="text-sm text-blue-700 mb-3">
              {adminSession?.email ? `Logged in as ${adminSession.email}` : 'Your account is active and in good standing.'}
            </p>
            <div className="flex items-center gap-2 text-sm text-blue-600">
              <CheckCircle className="w-4 h-4" />
              <span>Last backup: Today, 2:00 AM</span>
            </div>
          </div>
        </div>

        {/* Settings Content */}
        <div className="lg:col-span-3">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200">
            {/* General Settings */}
            {activeSection === 'general' && (
              <div className="p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-6 flex items-center gap-2">
                  <Settings className="w-5 h-5 text-blue-600" />
                  {t('settings.general')}
                </h2>
                
                <div className="space-y-4">
                  {renderSettingItem(
                    t('settings.company_name'),
                    t('settings.company_name_desc'),
                    <input
                      type="text"
                      value={settings.companyName}
                      onChange={(e) => setSettings({ ...settings, companyName: e.target.value })}
                      className="w-64 px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  )}
                  
                  {renderSettingItem(
                    t('settings.admin_email'),
                    t('settings.admin_email_desc'),
                    <input
                      type="email"
                      value={settings.adminEmail}
                      readOnly
                      className="w-64 px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-500 cursor-not-allowed"
                    />
                  )}
                  
                  {renderSettingItem(
                    t('settings.timezone'),
                    t('settings.timezone_desc'),
                    <select
                      value={settings.timezone}
                      onChange={(e) => setSettings({ ...settings, timezone: e.target.value })}
                      className="w-64 px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="Asia/Manila">Asia/Manila (PHT)</option>
                      <option value="Asia/Singapore">Asia/Singapore (SGT)</option>
                      <option value="Asia/Tokyo">Asia/Tokyo (JST)</option>
                      <option value="America/New_York">America/New_York (EST)</option>
                      <option value="America/Los_Angeles">America/Los_Angeles (PST)</option>
                      <option value="Europe/London">Europe/London (GMT)</option>
                      <option value="Australia/Sydney">Australia/Sydney (AEDT)</option>
                    </select>
                  )}
                  
                  {renderSettingItem(
                    t('settings.date_format'),
                    t('settings.date_format_desc'),
                    <select
                      value={settings.dateFormat}
                      onChange={(e) => setSettings({ ...settings, dateFormat: e.target.value })}
                      className="w-64 px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                      <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                      <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                      <option value="MMM DD, YYYY">MMM DD, YYYY</option>
                    </select>
                  )}
                  
                  {renderSettingItem(
                    t('settings.language'),
                    t('settings.language_desc'),
                    <select
                      value={settings.language}
                      onChange={(e) => setSettings({ ...settings, language: e.target.value })}
                      className="w-64 px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="en">English</option>
                      <option value="es">Español</option>
                      <option value="fr">Français</option>
                      <option value="de">Deutsch</option>
                      <option value="ja">日本語</option>
                      <option value="zh">中文</option>
                    </select>
                  )}
                </div>
              </div>
            )}

            {/* Notifications */}
            {activeSection === 'notifications' && (
              <div className="p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-6 flex items-center gap-2">
                  <Bell className="w-5 h-5 text-blue-600" />
                  Notification Settings
                </h2>
                
                <div className="space-y-4">
                  {renderSettingItem(
                    'New Applicant Alerts',
                    'Send a Teams notification when a new applicant submits their resume',
                    renderToggle('emailNewApplicant')
                  )}
                  
                  {renderSettingItem(
                    'Assessment Completion',
                    'Send a Teams notification when an applicant completes all assessments',
                    renderToggle('emailAssessmentComplete')
                  )}
                  
                  {renderSettingItem(
                    'Daily Digest',
                    'Receive a daily summary of activities',
                    renderToggle('emailDailyDigest')
                  )}
                  
                  {renderSettingItem(
                    'Browser Notifications',
                    'Show desktop notifications when a new applicant arrives',
                    <button
                      onClick={() => {
                        const next = !settings.browserNotifications;
                        setSettings({ ...settings, browserNotifications: next });
                        if (next && 'Notification' in window) {
                          Notification.requestPermission().then(perm => {
                            if (perm !== 'granted') {
                              setSettings(s => ({ ...s, browserNotifications: false }));
                            }
                          });
                        }
                      }}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        settings.browserNotifications ? 'bg-blue-600' : 'bg-gray-200'
                      }`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        settings.browserNotifications ? 'translate-x-6' : 'translate-x-1'
                      }`} />
                    </button>
                  )}
                  
                  <div className="py-4 border-b border-gray-100">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 pr-4">
                        <h4 className="font-medium text-gray-900">Microsoft Teams Webhook</h4>
                        <p className="text-sm text-gray-500 mt-1">
                          Receive notifications in a Teams channel when applicants apply, are screened, or complete assessments.
                        </p>
                        <p className="text-xs text-blue-600 mt-2">
                          To get a URL: Teams channel → ··· → Connectors → Incoming Webhook → Configure
                        </p>
                      </div>
                      <div className="flex-shrink-0">
                        <input
                          type="url"
                          value={settings.webhook}
                          onChange={(e) => setSettings({ ...settings, webhook: e.target.value })}
                          placeholder="https://outlook.office.com/webhook/..."
                          className="w-72 px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                        />
                        {settings.webhook && (
                          <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                            <CheckCircle className="w-3 h-3" /> Webhook configured
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Security */}
            {activeSection === 'security' && (
              <div className="p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-6 flex items-center gap-2">
                  <Shield className="w-5 h-5 text-blue-600" />
                  Security Settings
                </h2>
                
                <div className="space-y-4">
                  {renderSettingItem(
                    'Two-Factor Authentication',
                    'Require 2FA for all admin logins',
                    renderToggle('twoFactorAuth')
                  )}
                  
                  {renderSettingItem(
                    'Password Expiry',
                    'Force password reset after days',
                    <select
                      value={settings.passwordExpiry}
                      onChange={(e) => setSettings({ ...settings, passwordExpiry: e.target.value })}
                      className="w-48 px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="30">30 days</option>
                      <option value="60">60 days</option>
                      <option value="90">90 days</option>
                      <option value="never">Never</option>
                    </select>
                  )}
                  
                  {renderSettingItem(
                    'Session Timeout',
                    'Automatically logout after minutes of inactivity',
                    <select
                      value={settings.sessionTimeout}
                      onChange={(e) => setSettings({ ...settings, sessionTimeout: e.target.value })}
                      className="w-48 px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="15">15 minutes</option>
                      <option value="30">30 minutes</option>
                      <option value="60">1 hour</option>
                      <option value="120">2 hours</option>
                    </select>
                  )}
                  
                  {renderSettingItem(
                    'IP Whitelist',
                    'Restrict access to specific IP addresses (comma-separated)',
                    <input
                      type="text"
                      value={settings.ipWhitelist}
                      onChange={(e) => setSettings({ ...settings, ipWhitelist: e.target.value })}
                      placeholder="192.168.1.1, 10.0.0.1"
                      className="w-64 px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  )}
                  
                  <div className="mt-6 p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5" />
                      <div>
                        <h4 className="font-medium text-yellow-900">Security Recommendation</h4>
                        <p className="text-sm text-yellow-700 mt-1">
                          Enable two-factor authentication to add an extra layer of security to your account.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Integrations */}
            {activeSection === 'integrations' && (
              <div className="p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-6 flex items-center gap-2">
                  <Database className="w-5 h-5 text-blue-600" />
                  Integrations & Scoring
                </h2>
                
                <div className="mb-8">
                  <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Auto-Actions</h3>
                  <div className="space-y-4">
                    {renderSettingItem(
                      'Auto-Reject Threshold',
                      'Automatically reject applicants below this overall score',
                      <select
                        value={settings.autoRejectThreshold}
                        onChange={(e) => setSettings({ ...settings, autoRejectThreshold: e.target.value })}
                        className="w-48 px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="0">Disabled</option>
                        <option value="30">Below 30</option>
                        <option value="40">Below 40</option>
                        <option value="50">Below 50</option>
                      </select>
                    )}
                    
                    {renderSettingItem(
                      'Auto-Shortlist Threshold',
                      'Automatically flag applicants above this score',
                      <select
                        value={settings.autoShortlistThreshold}
                        onChange={(e) => setSettings({ ...settings, autoShortlistThreshold: e.target.value })}
                        className="w-48 px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="0">Disabled</option>
                        <option value="80">Above 80</option>
                        <option value="85">Above 85</option>
                        <option value="90">Above 90</option>
                      </select>
                    )}
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Connected Services</h3>
                  <div className="space-y-3">
                    {[
                      { name: 'Supabase', status: 'Connected', icon: Database },
                      { name: 'Email SMTP', status: 'Connected', icon: Mail },
                      { name: 'Video Storage', status: 'Connected', icon: FileText },
                    ].map((service, idx) => (
                      <div key={idx} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center shadow-sm">
                            <service.icon className="w-5 h-5 text-gray-600" />
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">{service.name}</p>
                            <p className="text-sm text-green-600 flex items-center gap-1">
                              <CheckCircle className="w-3 h-3" />
                              {service.status}
                            </p>
                          </div>
                        </div>
                        <button className="text-sm text-blue-600 hover:text-blue-800">
                          Configure
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Appearance */}
            {activeSection === 'appearance' && (
              <div className="p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-6 flex items-center gap-2">
                  <Palette className="w-5 h-5 text-blue-600" />
                  Appearance
                </h2>
                
                <div className="space-y-4">
                  {renderSettingItem(
                    'Compact View',
                    'Show more content with less spacing',
                    renderToggle('compactView')
                  )}
                  
                  {renderSettingItem(
                    'Collapsed Sidebar',
                    'Start with sidebar collapsed by default',
                    renderToggle('sidebarCollapsed')
                  )}
                </div>
              </div>
            )}

            {/* Advanced */}
            {activeSection === 'advanced' && (
              <div className="p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-6 flex items-center gap-2">
                  <Clock className="w-5 h-5 text-blue-600" />
                  Advanced Settings
                </h2>
                
                <div className="space-y-4">
                  {renderSettingItem(
                    'Data Retention',
                    'Applicants older than this period will be auto-archived when saving',
                    <select
                      value={settings.dataRetention}
                      onChange={(e) => setSettings({ ...settings, dataRetention: e.target.value })}
                      className="w-48 px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="90">90 days</option>
                      <option value="180">180 days</option>
                      <option value="365">1 year</option>
                      <option value="730">2 years</option>
                      <option value="forever">Forever</option>
                    </select>
                  )}
                  
                  {renderSettingItem(
                    'Auto-Archive Old Data',
                    'When enabled, applicants past the retention period are archived on save',
                    renderToggle('autoArchive')
                  )}
                </div>

                <div className="mt-8 pt-6 border-t border-gray-200">
                  <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Data Export</h3>
                  
                  <div className="flex items-start justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
                    <div>
                      <h4 className="font-medium text-gray-900">Export All Applicants</h4>
                      <p className="text-sm text-gray-500 mt-1">Download a CSV of all applicant records including scores and status</p>
                    </div>
                    <button
                      onClick={async () => {
                        try {
                          await exportAllData();
                        } catch (err) {
                          alert(`Export failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
                        }
                      }}
                      className="flex items-center gap-2 px-4 py-2 bg-white text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors"
                    >
                      <Download className="w-4 h-4" />
                      Export CSV
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
