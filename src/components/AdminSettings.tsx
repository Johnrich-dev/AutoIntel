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
  Moon,
  Sun,
  RefreshCw,
  Download,
  Trash2,
  ChevronRight,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export function AdminSettings() {
  const { adminSession } = useAuth();
  const [activeSection, setActiveSection] = useState<'general' | 'notifications' | 'security' | 'integrations' | 'appearance' | 'advanced'>('general');
  const [saved, setSaved] = useState(false);
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
    resumeWeight: '40',
    videoWeight: '35',
    profileWeight: '25',
    autoRejectThreshold: '30',
    autoShortlistThreshold: '85',
    
    // Appearance
    theme: 'light',
    sidebarCollapsed: false,
    compactView: false,
    
    // Advanced
    dataRetention: '365',
    autoArchive: true,
    apiAccess: false,
    debugMode: false,
  });

  // Fetch settings from Supabase
  useEffect(() => {
    const fetchSettings = async () => {
      if (!adminSession?.user_id) {
        setLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
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
            webhook: data.webhook || '',
            twoFactorAuth: data.two_factor_auth ?? false,
            passwordExpiry: data.password_expiry || '90',
            sessionTimeout: data.session_timeout || '30',
            ipWhitelist: data.ip_whitelist || '',
            resumeWeight: String(data.resume_weight || 40),
            videoWeight: String(data.video_weight || 35),
            profileWeight: String(data.profile_weight || 25),
            autoRejectThreshold: String(data.auto_reject_threshold || 30),
            autoShortlistThreshold: String(data.auto_shortlist_threshold || 85),
            theme: data.theme || 'light',
            sidebarCollapsed: data.sidebar_collapsed ?? false,
            compactView: data.compact_view ?? false,
            dataRetention: data.data_retention || '365',
            autoArchive: data.auto_archive ?? true,
            apiAccess: data.api_access ?? false,
            debugMode: data.debug_mode ?? false,
          });
          applyTheme(data.theme || 'light');
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
    if (!adminSession?.user_id) {
      console.error('No admin session found');
      return;
    }

    try {
      // Prepare data for Supabase - update admin_users table
      const { error } = await supabase
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
          resume_weight: parseInt(settings.resumeWeight),
          video_weight: parseInt(settings.videoWeight),
          profile_weight: parseInt(settings.profileWeight),
          auto_reject_threshold: parseInt(settings.autoRejectThreshold),
          auto_shortlist_threshold: parseInt(settings.autoShortlistThreshold),
          theme: settings.theme,
          sidebar_collapsed: settings.sidebarCollapsed,
          compact_view: settings.compactView,
          data_retention: settings.dataRetention,
          auto_archive: settings.autoArchive,
          api_access: settings.apiAccess,
          debug_mode: settings.debugMode,
        })
        .eq('id', adminSession.user_id);

      if (error) {
        console.error('Error saving settings:', error);
        return;
      }

      // Apply theme when saving
      applyTheme(settings.theme);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (error) {
      console.error('Error saving settings:', error);
    }
  };

  // Apply theme to document
  const applyTheme = (theme: string) => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  const sections = [
    { id: 'general', label: 'General', icon: Settings },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'security', label: 'Security', icon: Shield },
    { id: 'integrations', label: 'Integrations', icon: Database },
    { id: 'appearance', label: 'Appearance', icon: Palette },
    { id: 'advanced', label: 'Advanced', icon: Clock },
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
          <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
          <p className="text-gray-600 mt-1">Manage your account and application preferences</p>
        </div>
        <div className="flex items-center gap-3">
          {saved && (
            <span className="flex items-center gap-2 text-green-600 bg-green-50 px-3 py-1.5 rounded-lg">
              <CheckCircle className="w-4 h-4" />
              Settings saved
            </span>
          )}
          <button
            onClick={handleSave}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Save className="w-4 h-4" />
            Save Changes
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
                  General Settings
                </h2>
                
                <div className="space-y-4">
                  {renderSettingItem(
                    'Company Name',
                    'This will be displayed on reports and emails',
                    <input
                      type="text"
                      value={settings.companyName}
                      onChange={(e) => setSettings({ ...settings, companyName: e.target.value })}
                      className="w-64 px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  )}
                  
                  {renderSettingItem(
                    'Admin Email',
                    'Primary contact email for notifications',
                    <input
                      type="email"
                      value={settings.adminEmail}
                      onChange={(e) => setSettings({ ...settings, adminEmail: e.target.value })}
                      className="w-64 px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  )}
                  
                  {renderSettingItem(
                    'Timezone',
                    'All dates and times will be displayed in this timezone',
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
                    'Date Format',
                    'Choose your preferred date format',
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
                    'Language',
                    'Interface language',
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
                    'Receive email when a new applicant applies',
                    renderToggle('emailNewApplicant')
                  )}
                  
                  {renderSettingItem(
                    'Assessment Completion',
                    'Receive email when an applicant completes all assessments',
                    renderToggle('emailAssessmentComplete')
                  )}
                  
                  {renderSettingItem(
                    'Daily Digest',
                    'Receive a daily summary of activities',
                    renderToggle('emailDailyDigest')
                  )}
                  
                  {renderSettingItem(
                    'Browser Notifications',
                    'Show desktop notifications for important events',
                    renderToggle('browserNotifications')
                  )}
                  
                  {renderSettingItem(
                    'Webhook URL',
                    'Send notifications to a custom endpoint',
                    <input
                      type="text"
                      value={settings.webhook}
                      onChange={(e) => setSettings({ ...settings, webhook: e.target.value })}
                      placeholder="https://hooks.slack.com/..."
                      className="w-64 px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  )}
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
                  <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Scoring Weights</h3>
                  <div className="space-y-4">
                    {renderSettingItem(
                      'Resume Score Weight',
                      'Percentage weight for resume evaluation',
                      <div className="flex items-center gap-3">
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={settings.resumeWeight}
                          onChange={(e) => setSettings({ ...settings, resumeWeight: e.target.value })}
                          className="w-32"
                        />
                        <span className="text-sm font-medium w-12">{settings.resumeWeight}%</span>
                      </div>
                    )}
                    
                    {renderSettingItem(
                      'Video Assessment Weight',
                      'Percentage weight for video interview',
                      <div className="flex items-center gap-3">
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={settings.videoWeight}
                          onChange={(e) => setSettings({ ...settings, videoWeight: e.target.value })}
                          className="w-32"
                        />
                        <span className="text-sm font-medium w-12">{settings.videoWeight}%</span>
                      </div>
                    )}
                    
                    {renderSettingItem(
                      'Profile Fit Weight',
                      'Percentage weight for personality test',
                      <div className="flex items-center gap-3">
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={settings.profileWeight}
                          onChange={(e) => setSettings({ ...settings, profileWeight: e.target.value })}
                          className="w-32"
                        />
                        <span className="text-sm font-medium w-12">{settings.profileWeight}%</span>
                      </div>
                    )}
                  </div>
                </div>

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
                    'Theme',
                    'Choose your preferred color scheme',
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setSettings({ ...settings, theme: 'light' });
                          document.documentElement.classList.remove('dark');
                        }}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors ${
                          settings.theme === 'light' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 hover:bg-gray-50'
                        }`}
                      >
                        <Sun className="w-4 h-4" />
                        Light
                      </button>
                      <button
                        onClick={() => {
                          setSettings({ ...settings, theme: 'dark' });
                          document.documentElement.classList.add('dark');
                        }}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors ${
                          settings.theme === 'dark' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 hover:bg-gray-50'
                        }`}
                      >
                        <Moon className="w-4 h-4" />
                        Dark
                      </button>
                    </div>
                  )}
                  
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
                    'Keep applicant data for days before auto-archive',
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
                    'Automatically archive applicants after retention period',
                    renderToggle('autoArchive')
                  )}
                  
                  {renderSettingItem(
                    'API Access',
                    'Enable API access for external integrations',
                    renderToggle('apiAccess')
                  )}
                  
                  {renderSettingItem(
                    'Debug Mode',
                    'Enable detailed error logging (developers only)',
                    renderToggle('debugMode')
                  )}
                </div>

                <div className="mt-8 pt-6 border-t border-gray-200">
                  <h3 className="text-sm font-semibold text-red-500 uppercase tracking-wider mb-4">Danger Zone</h3>
                  
                  <div className="space-y-4">
                    <div className="flex items-start justify-between p-4 bg-red-50 rounded-lg border border-red-100">
                      <div>
                        <h4 className="font-medium text-red-900">Export All Data</h4>
                        <p className="text-sm text-red-600 mt-1">Download a complete backup of all your data</p>
                      </div>
                      <button className="flex items-center gap-2 px-4 py-2 bg-white text-red-600 border border-red-200 rounded-lg hover:bg-red-100 transition-colors">
                        <Download className="w-4 h-4" />
                        Export
                      </button>
                    </div>
                    
                    <div className="flex items-start justify-between p-4 bg-red-50 rounded-lg border border-red-100">
                      <div>
                        <h4 className="font-medium text-red-900">Clear All Data</h4>
                        <p className="text-sm text-red-600 mt-1">Permanently delete all applicants and settings. This cannot be undone.</p>
                      </div>
                      <button className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">
                        <Trash2 className="w-4 h-4" />
                        Delete All
                      </button>
                    </div>
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
