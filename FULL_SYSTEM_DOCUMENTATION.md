# AutoIntel Recruitment System - Full System Documentation

Last Updated: April 2026
Version: 1.0 (Thesis Build)

This document is the complete technical and functional reference for the AutoIntel Recruitment System.
It covers every feature, every component, every AI model, every database table, and every user flow
in plain language so that anyone reading it can understand how the system works end to end.

================================================================================
TABLE OF CONTENTS
================================================================================

1.  What Is AutoIntel?
2.  Technology Stack
3.  System Architecture Overview
4.  User Roles
5.  Applicant Flow (Step by Step)
6.  HR / Admin Flow (Step by Step)
7.  Frontend Components Reference
8.  Backend Services Reference
9.  AI and ML Models Used
10. Scoring System Explained
11. Database Schema Reference
12. API Endpoints
13. Authentication and Security
14. Internationalization (Multi-Language)
15. Configuration and Environment Variables
16. Incomplete / Partially Connected Features
17. Known Limitations and Notes

================================================================================
1. WHAT IS AUTOINTEL?
================================================================================

AutoIntel is an AI-powered recruitment automation platform built as a thesis project.
Its purpose is to reduce the manual effort involved in hiring by automating the most
time-consuming parts: reading resumes, scoring candidates, scheduling assessments,
and managing the recruitment pipeline.

The system handles everything from the moment a candidate sends their resume by email,
all the way through to the final hire or reject decision. Admins and HR managers use
a web dashboard to manage the pipeline, review candidates, and configure scoring rules.
Applicants interact through a separate portal where they complete video and personality
assessments after passing the initial resume screening.

Key capabilities:
- Automated resume collection from Gmail
- AI-powered resume parsing using GPT and BERT
- Hybrid semantic scoring against job requirements
- Automated email notifications with score breakdowns
- Token-based applicant login portal
- Video assessment with automatic Whisper AI transcription
- Work style personality test with semantic scoring
- Full admin dashboard with recruitment pipeline management
- Configurable scoring weights and thresholds
- Multi-language support (6 languages)
- Light and dark theme

================================================================================
2. TECHNOLOGY STACK
================================================================================

FRONTEND
  Framework:     React 18.3 with TypeScript 5.5
  Styling:       Tailwind CSS 3.4
  Icons:         Lucide React
  Build Tool:    Vite 7.2
  Database SDK:  Supabase JS 2.57
  i18n:          i18next 26 + react-i18next 17
  Routing:       Custom path-based routing (no React Router)

BACKEND
  Language:      Python 3.x
  API Server:    Flask 2.3 with Flask-CORS and Flask-Limiter
  Database SDK:  supabase-py 2.3

DATABASE
  Provider:      Supabase (hosted PostgreSQL)
  Auth:          Supabase Auth + custom token system
  Storage:       Supabase Storage (resumes, videos, photos)
  Security:      Row Level Security (RLS) policies

AI / ML MODELS
  GPT (OpenAI):           Resume text cleaning, essay evaluation
  BERT NER:               Named entity recognition from resume text
  all-MiniLM-L6-v2:       Sentence embeddings for semantic matching
  Whisper (OpenAI):       Video transcription (speech to text)

EXTERNAL SERVICES
  Gmail IMAP:             Resume collection from email inbox
  SMTP (Gmail):           Sending notification emails to applicants
  Google Calendar API:    Interview scheduling (partially integrated)
  Microsoft Teams:        Webhook notifications (optional)


================================================================================
3. SYSTEM ARCHITECTURE OVERVIEW
================================================================================

The system is split into two main parts: a frontend web application and a set of
backend Python services. They both connect to the same Supabase database.

  [Applicant Email]
        |
        v
  [resume_collector.py]  <-- Polls Gmail IMAP for new emails
        |
        v
  [resume_parser.py]     <-- Extracts and structures resume content
        |
        v
  [screening_service.py] <-- Scores the resume against job requirements
        |
        v
  [email_service.py]     <-- Sends result email to applicant
        |
        v
  [Supabase Database]    <-- Stores all applicant data, scores, assessments
        |
        v
  [React Frontend]       <-- Applicant portal + Admin dashboard
        |
        v
  [Flask API Server]     <-- Handles transcription, work style scoring, fit scoring

The frontend reads and writes directly to Supabase using the anon key with RLS.
The backend Python services use the service role key which bypasses RLS.
The Flask API server is a separate process that the frontend calls for AI scoring tasks.

Data flow summary:
  - Applicant submits resume via email
  - Backend processes it automatically (no human needed at this stage)
  - Applicant receives email with result and login link if they passed
  - Applicant logs in and completes video + personality assessments
  - Admin reviews everything in the dashboard and makes final decisions

================================================================================
4. USER ROLES
================================================================================

There are three types of users in the system:

APPLICANT
  - Accesses the system via a unique token sent to their email
  - Token expires after 24 hours
  - Can only see their own assessment portal
  - Cannot access any admin or HR features
  - Flow: Login -> Accept Rules -> Upload Photo -> Video Assessment -> Personality Test

HR MANAGER
  - Logs in with email and password at /hr/login
  - Has the same dashboard access as Admin
  - Role stored in admin_users table with role = 'hr'
  - Can review applicants, add notes, shortlist, schedule interviews
  - Cannot manage other admin users or change scoring settings
    (Note: role-based permission enforcement depends on implementation)

ADMIN
  - Logs in with email and password at /admin/login
  - Full access to all dashboard features
  - Can manage job postings, scoring settings, admin users
  - Can configure system settings (theme, language, notifications, security)
  - Role stored in admin_users table with role = 'admin'

MAINTENANCE PREVIEW MODE
  - Admins can preview the applicant portal without logging out
  - Activated via a flag stored in localStorage
  - Useful for testing the applicant experience

================================================================================
5. APPLICANT FLOW (STEP BY STEP)
================================================================================

This section explains exactly what happens from the moment an applicant sends
their resume to the moment they complete all assessments.

--------------------------------------------------------------------------------
STEP 1: APPLICATION SUBMISSION
--------------------------------------------------------------------------------

The applicant sends an email to the company recruitment inbox with:
  - Subject line containing the word "Applicant" or "Application" or "Resume"
    (configurable via GMAIL_SEARCH_SUBJECTS environment variable)
  - Their resume attached as a PDF or DOCX file

The resume_collector.py script runs periodically (manually or on a schedule)
and connects to Gmail via IMAP. It searches for unread emails matching the
subject keywords. For each matching email it:

  1. Extracts the sender name and email address
  2. Parses the job title from the subject line
     (e.g., "Applicant - Software Engineer" -> position = "Software Engineer")
  3. Downloads the resume attachment
  4. Checks for duplicate applications using fuzzy matching on name and email
     (handled by duplicate_detector.py using the rapidfuzz library)
  5. Uploads the resume file to Supabase Storage
  6. Creates a new record in the applicants table with:
     - name, email, position
     - status = 'pending_screening'
     - A unique access_token (UUID)
     - access_expires_at = now + 24 hours
  7. Marks the email as read so it is not processed again
  8. Triggers resume parsing (calls resume_parser.py)

If a duplicate is detected, the application is flagged with duplicate_matches
and duplicate_layer fields. The system still processes it but marks it clearly.

--------------------------------------------------------------------------------
STEP 2: RESUME PARSING
--------------------------------------------------------------------------------

resume_parser.py takes the raw resume file and converts it into structured data.

Text Extraction (tries in order until one works):
  1. pdfplumber - best for text-based PDFs
  2. PyMuPDF (fitz) - good for complex PDFs
  3. PyPDF2 - fallback for simple PDFs
  4. python-docx - for DOCX files

After extracting raw text, the parser:

  1. Cleans the text using GPT (gpt_extractor.py)
     - Fixes spacing artifacts from PDF extraction
     - Normalizes formatting
     - Removes headers/footers/page numbers
     - Preserves all actual content

  2. Detects resume sections using keyword matching
     The parser looks for section headers like:
     - "Work Experience", "Employment History", "Professional Experience" -> EXPERIENCE
     - "Education", "Academic Background" -> EDUCATION
     - "Skills", "Technical Skills", "Core Competencies" -> SKILLS
     - "Projects", "Personal Projects", "Academic Projects" -> PROJECTS
     - "Certifications", "Trainings", "Seminars", "Workshops" -> TRAININGS
     - "Achievements", "Awards", "Accomplishments" -> ACHIEVEMENTS
     - "Summary", "Profile", "Objective", "About Me" -> SUMMARY

  3. Applies BERT NER (Named Entity Recognition) as enrichment
     - Extracts names, emails, phone numbers
     - Identifies company names and job titles
     - Identifies skills and technologies

  4. Normalizes skill names using a canonical mapping
     Examples: "html" -> "HTML", "node.js" -> "Node.js", "c#" -> "C#"

  5. Stores the structured result as JSON in:
     - applicants.parsed_resume_json (main storage)
     - resumes.parsed_data (detailed storage with metadata)

The parsed JSON structure looks like:
  {
    "name": "...",
    "email": "...",
    "phone": "...",
    "summary": "...",
    "experience": [ { "title": "...", "company": "...", "duration": "...", "description": "..." } ],
    "education": [ { "degree": "...", "institution": "...", "year": "..." } ],
    "skills": { "technical": [...], "soft": [...] },
    "projects": [ { "name": "...", "description": "...", "technologies": [...] } ],
    "trainings": [ { "name": "...", "issuer": "...", "year": "..." } ],
    "achievements": [...]
  }

--------------------------------------------------------------------------------
STEP 3: AUTOMATIC SCREENING (SCORING)
--------------------------------------------------------------------------------

screening_service.py takes the parsed resume and scores it against the job
requirements. This is the core AI scoring step.

First, it loads the scoring settings from the scoring_settings table in the
database. This allows the company to adjust weights without changing code.

The scoring uses a HYBRID approach combining two methods:

  METHOD 1: Requirement Match Score (60% of final score)
  This measures how well the resume content semantically matches the job
  requirements. It uses sentence embeddings (all-MiniLM-L6-v2 model) to
  calculate cosine similarity between resume text and job requirement text.
  This is done for each of the 6 categories separately.

  METHOD 2: Count Score (40% of final score)
  This measures whether the applicant meets the minimum quantity requirements.
  For example: does the applicant have at least 2 years of experience?
  Does the resume list at least 10 skills? Does it have at least 2 projects?
  These baselines are configurable in the scoring_settings table.

  FINAL SCORE = (Requirement Match Score x 0.6) + (Count Score x 0.4)

The 6 categories and their default weights:
  Experience:       28%  (baseline: 2 years)
  Skills:           30%  (baseline: 10 skills)
  Education:        18%  (baseline: 2 degrees/credentials)
  Projects:         14%  (baseline: 2 projects)
  Training/Cert:     6%  (baseline: 2 certifications)
  Achievements:      4%  (baseline: 1 achievement)

The weighted category scores are combined into a single final score (0-100).

Decision thresholds (configurable):
  score >= qualified_threshold (default 78) -> passed_screening
  score >= review_threshold (default 65)    -> needs_review
  score < review_threshold                  -> failed_screening

The applicant record is updated with:
  - screening_score (the numeric score)
  - screening_fit_category (passed/needs_review/failed)
  - screening_status
  - status updated accordingly

--------------------------------------------------------------------------------
STEP 4: EMAIL NOTIFICATION
--------------------------------------------------------------------------------

email_service.py sends an email to the applicant based on their screening result.

PASSED EMAIL contains:
  - Congratulations message
  - Their unique access token (login key)
  - A direct login link: APP_URL/applicant/login?token=XXXX
  - Full score breakdown showing all 6 categories
  - Instructions for completing the assessments
  - Token expiry warning (24 hours)

NEEDS REVIEW EMAIL contains:
  - A message saying their application is under review
  - No score details
  - They are told they will hear back soon

FAILED EMAIL contains:
  - A professional regret message
  - Encouragement to apply for future positions
  - No score details shared

All emails are sent via SMTP using Gmail. The FROM_NAME and FROM_EMAIL are
configurable via environment variables.

--------------------------------------------------------------------------------
STEP 5: APPLICANT LOGIN
--------------------------------------------------------------------------------

The applicant receives their token and visits the login page at /applicant/login.

ApplicantLogin.tsx handles this. The applicant can:
  - Paste their token directly into the token field
  - Or the token is auto-filled if they clicked the link in the email

On login, the system:
  1. Looks up the token in the applicants table
  2. Checks that access_expires_at is in the future
  3. If valid, stores the token in localStorage as 'sentinel_access_token'
  4. Loads the full applicant record into AuthContext
  5. Redirects to the assessment flow

If the token is expired or invalid, an error message is shown.

--------------------------------------------------------------------------------
STEP 6: RULES AND TERMS ACCEPTANCE
--------------------------------------------------------------------------------

RulesAndTerms.tsx is shown to the applicant on their first login.

It displays the terms and conditions for participating in the recruitment process.
The applicant must scroll through and click Accept.

On acceptance:
  - rules_accepted = true is saved to the applicants table
  - rules_accepted_at timestamp is recorded
  - A localStorage key is set: rules_accepted_{access_token} = 'true'
  - The applicant is redirected to the Assessment Dashboard

The rules check is tied to the specific access token, not just the email.
This means if an applicant gets a new token (re-applied), they see the rules again.

--------------------------------------------------------------------------------
STEP 7: ASSESSMENT DASHBOARD
--------------------------------------------------------------------------------

AssessmentDashboard.tsx is the main hub for the applicant after login.

It shows:
  - The applicant's name and position they applied for
  - A profile photo upload section (required before starting assessments)
  - Status cards for each assessment (Video Assessment, Work Style Test)
  - Progress indicators showing what is complete and what is pending

Profile Photo Upload:
  - The applicant must upload a photo before they can start assessments
  - Photo is uploaded to Supabase Storage
  - URL is saved to applicants.photo_url
  - This is enforced in the UI (assessments are locked until photo is uploaded)

Assessment Status Cards:
  - Each card shows: Not Started / In Progress / Completed
  - Clicking a card navigates to that assessment
  - Once completed, the card shows a checkmark and cannot be re-taken

--------------------------------------------------------------------------------
STEP 8: VIDEO ASSESSMENT
--------------------------------------------------------------------------------

VideoAssessment.tsx handles the video recording and upload.

The applicant is given a prompt/question to respond to on video.
They have two options:
  1. Record directly in the browser using the device camera and microphone
  2. Upload a pre-recorded video file

Requirements:
  - Video should be 2 to 5 minutes long
  - The system validates duration before accepting

After submission:
  1. The video file is uploaded to Supabase Storage
  2. A record is created in video_assessments table with status = 'pending'
  3. The frontend calls /api/trigger-transcription on the Flask API
  4. transcription_service.py downloads the video and runs Whisper AI
  5. Whisper converts speech to text
  6. The transcription is stored in video_assessments.transcription
  7. transcription_status is updated to 'completed' or 'failed'

The transcription is later used by admins to review what the applicant said
without having to watch the entire video.

Video scoring dimensions (stored in video_assessments):
  - transcript_score: overall quality of the transcript
  - relevance_score: how relevant the answer is to the question
  - experience_score: mentions of relevant experience
  - skills_score: mentions of relevant skills
  - completeness_score: whether the response was complete

--------------------------------------------------------------------------------
STEP 9: WORK STYLE PERSONALITY TEST
--------------------------------------------------------------------------------

PersonalityTest.tsx presents the work style assessment.

The test consists of:
  - 20 Likert-scale questions (1 = Strongly Disagree, 5 = Strongly Agree)
  - 1 open-ended essay question

The 20 questions cover 15 personality/work style dimensions:
  1. Conscientiousness
  2. Teamwork
  3. Adaptability
  4. Communication
  5. Leadership
  6. Problem Solving
  7. Initiative
  8. Attention to Detail
  9. Stress Management
  10. Creativity
  11. Reliability
  12. Empathy
  13. Time Management
  14. Learning Agility
  15. Integrity

Some questions are reverse-coded (a high score on the question means a low
score on the dimension) to prevent pattern answering.

After submission:
  1. Answers are sent to /api/workstyle/score on the Flask API
  2. work_style_scorer.py processes the answers
  3. Each Likert answer is scored using sentence embeddings
     - The answer value is converted to a text description
     - That text is compared semantically to the ideal answer for that dimension
  4. The essay is evaluated by GPT for additional insights
  5. A semantic_score (0-100) is calculated
  6. Dimension scores are categorized as:
     - Strong Areas (score >= 70)
     - Moderate Areas (score 50-69)
     - Development Areas (score < 50)
  7. Role family is detected from the job title to contextualize results
  8. All results stored in work_style_assessments table

--------------------------------------------------------------------------------
STEP 10: ASSESSMENT COMPLETE
--------------------------------------------------------------------------------

Once both assessments are done, the applicant sees a completion screen.
The system fires a notification to /api/notify-assessment on the Flask API
to alert the admin that assessments are complete (non-blocking, failure is silent).

The applicant cannot re-take assessments once submitted.
The admin can now see all results in the Applicant Detail Modal.


================================================================================
6. HR / ADMIN FLOW (STEP BY STEP)
================================================================================

This section explains how HR managers and admins use the dashboard.

--------------------------------------------------------------------------------
STEP 1: LOGIN
--------------------------------------------------------------------------------

AdminLogin.tsx handles login for both admin and HR users.

The login page is at /admin/login (or /hr/login, both work the same way).

On login:
  1. Email and password are submitted
  2. The frontend calls the Supabase RPC function verify_admin_password
  3. The RPC checks the password_hash in admin_users table
  4. If valid, a session is created with a 24-hour expiry
  5. The session is stored in localStorage as 'admin_session'
  6. The user's role (admin or hr) is loaded into AuthContext
  7. If must_change_password = true, the user is redirected to ChangePassword.tsx

Password policies:
  - Password expiry is configurable per user (default 90 days)
  - If the password has expired, the user is forced to change it
  - Session timeout is configurable (default 30 minutes of inactivity)
  - Idle timer resets on mouse movement, clicks, and key presses

--------------------------------------------------------------------------------
STEP 2: DASHBOARD LANDING
--------------------------------------------------------------------------------

DashboardLanding.tsx is the first screen after login.

It shows:
  - Total applicants count
  - Applicants by status (pending, passed, needs review, failed, shortlisted, etc.)
  - Recent applicants list with quick status view
  - Quick action buttons to navigate to key pipeline stages
  - Summary statistics for the current recruitment cycle

All data is fetched live from the Supabase database.

--------------------------------------------------------------------------------
STEP 3: JOB MANAGEMENT
--------------------------------------------------------------------------------

AdminJobManagement.tsx handles creating and managing job postings.

Admins can:
  - Create new job postings with:
    - Title and description
    - Department
    - Required skills (tag input, multi-select)
    - Required education levels
    - Minimum and maximum years of experience
    - Expected projects/portfolio requirements
    - Preferred certifications
    - Role family (used for work style scoring context)
  - Edit existing job postings
  - Soft-delete job postings (deleted_at timestamp, not hard delete)
  - Toggle job active/inactive status

Job postings are stored in the job_postings table.
The source field distinguishes between admin-created jobs ('admin') and
jobs imported from the dataset ('dataset').

There is also a script backend/scripts/import_enriched_jobs.py that can
bulk-import job postings from the data/job_postings_dataset.json file.

--------------------------------------------------------------------------------
STEP 4: APPLICATIONS LIST
--------------------------------------------------------------------------------

ApplicantsList.tsx shows all applicants in a filterable, sortable table.

Columns shown:
  - Name, email, position applied for
  - Application date
  - Screening score
  - Current status
  - Actions (view details, change status)

Filters available:
  - By status (pending, passed, needs review, failed, shortlisted, etc.)
  - By position/job
  - By date range
  - Search by name or email

Clicking an applicant opens ApplicantDetailModal.tsx which shows the full profile.

--------------------------------------------------------------------------------
STEP 5: SCREENING RESULTS
--------------------------------------------------------------------------------

ScreeningResults.tsx shows applicants who passed the automated screening.

These are applicants with status = 'passed_screening'.
The view shows their screening scores and score breakdowns.
Admins can click through to the full detail modal.

From here, admins can:
  - Move applicants to shortlisted
  - Move applicants to needs_review for manual review
  - Reject applicants

--------------------------------------------------------------------------------
STEP 6: NEEDS REVIEW QUEUE
--------------------------------------------------------------------------------

NeedsReview.tsx shows applicants in the borderline score range (65-78 by default).

These applicants scored too low to auto-pass but too high to auto-fail.
A human needs to look at their resume and make a judgment call.

NeedsReviewDetailPanel.tsx opens when an applicant is selected, showing:
  - Full resume content
  - Score breakdown by category
  - Parsed resume sections
  - HR notes field for adding comments

Actions available:
  - Approve (move to passed_screening / shortlisted)
  - Reject (move to failed_screening)
  - Add HR notes

--------------------------------------------------------------------------------
STEP 7: SHORTLISTED CANDIDATES
--------------------------------------------------------------------------------

ShortlistedCandidates.tsx shows candidates approved for the interview stage.

These are applicants with status = 'shortlisted'.
The view shows their full assessment results:
  - Resume screening score
  - Video assessment status and scores
  - Work style test score and dimension breakdown

From here, admins can:
  - Schedule an interview (opens InterviewScheduling)
  - View full applicant details
  - Move back to review if needed

--------------------------------------------------------------------------------
STEP 8: INTERVIEW SCHEDULING
--------------------------------------------------------------------------------

InterviewScheduling.tsx manages interview scheduling.

STATUS: PARTIALLY CONNECTED - The UI exists and has a full form, but the
interview data is currently loaded from a mockInterviews array in the component
rather than from the scheduled_interviews database table.

The database table scheduled_interviews IS fully defined and ready to use.
The connection between the UI and the database just needs to be implemented.

What the UI supports:
  - Schedule new interviews with date, time, type (online/in-person)
  - Assign an HR manager as interviewer
  - Add meeting link and passcode for online interviews
  - Add location for in-person interviews
  - Set duration and timezone
  - Add additional attendees
  - Add applicant instructions and internal notes
  - Calendar view showing scheduled interviews by day/week/month
  - Status tracking (scheduled, completed, cancelled)

The backend has calendar_service.py for Google Calendar integration and
ics_calendar_service.py for generating ICS calendar files for email invites.
These are built but may not be fully wired to the scheduling UI.

--------------------------------------------------------------------------------
STEP 9: FINAL DECISIONS
--------------------------------------------------------------------------------

FinalDecisions.tsx handles the hire or reject decision for each candidate.

Admins can:
  - Mark a candidate as Hired
  - Mark a candidate as Rejected
  - Add decision notes
  - Send offer email (with optional attachment like offer letter PDF)
  - Send rejection email

The system tracks:
  - decision_date
  - decision_notes
  - offer_email_sent and offer_email_sent_at
  - rejection_email_sent and rejection_email_sent_at

--------------------------------------------------------------------------------
STEP 10: APPLICANT DETAIL MODAL
--------------------------------------------------------------------------------

ApplicantDetailModal.tsx is the central view for reviewing a single applicant.

It is opened from any pipeline stage and shows all information about the applicant.

Tabs in the modal:
  - Overview: Basic info, status, screening score, timeline
  - Resume: Full parsed resume content, raw text, score breakdown
  - Video Assessment (VideoAssessmentTab.tsx):
    - Video player to watch the recording
    - Transcription text
    - Video scores (relevance, experience, skills, completeness)
  - Work Style (WorkProfilingTab.tsx):
    - Dimension scores with visual bars
    - Strong, moderate, and development areas
    - Essay response and GPT insights
    - Role family detected
  - Actions: Change status, add notes, send emails, schedule interview

--------------------------------------------------------------------------------
STEP 11: ANALYTICS AND REPORTS
--------------------------------------------------------------------------------

ReportsDashboard.tsx shows analytics for the recruitment pipeline.

STATUS: USES REAL DATA - The component receives applicant data as props from
the parent and calculates metrics from it. It does not use mock data.

Metrics shown:
  - Average screening score
  - Pass/fail/review rates
  - Average time to screen
  - Score distribution charts
  - Assessment completion rates
  - Video score averages
  - Work style score averages

--------------------------------------------------------------------------------
STEP 12: SCORING CONFIGURATION
--------------------------------------------------------------------------------

AdminScoringSettings.tsx allows admins to adjust the scoring system.

Settings that can be changed:
  - Weight for each of the 6 categories (must sum to 100%)
  - Baseline counts for each category
  - Qualified threshold (default 78)
  - Review threshold (default 65)
  - Requirement match weight vs count weight (default 60/40)

Changes are saved to the scoring_settings table and take effect immediately
for all future screenings. Past scores are not recalculated.

--------------------------------------------------------------------------------
STEP 13: SYSTEM SETTINGS
--------------------------------------------------------------------------------

AdminSettings.tsx manages per-user settings for the logged-in admin.

Settings available:
  - Profile: name, company name
  - Appearance: theme (light/dark), sidebar collapsed, compact view
  - Localization: timezone, date format, language (6 options)
  - Notifications: email alerts for new applicants, assessment completions, daily digest
  - Security: session timeout, password expiry, two-factor auth toggle, IP whitelist
  - Integrations: webhook URL, Slack webhook
  - Data: data retention period, auto-archive toggle

Settings are saved to the admin_users table and loaded on each login.


================================================================================
7. FRONTEND COMPONENTS REFERENCE
================================================================================

This section lists every React component, what it does, and what data it uses.

--------------------------------------------------------------------------------
APPLICANT PORTAL COMPONENTS
--------------------------------------------------------------------------------

ApplicantLogin.tsx
  Purpose:    Token-based login screen for applicants
  Route:      /applicant/login or /applicant
  Data:       Reads applicants table by access_token
  Actions:    Validates token, stores in localStorage, loads applicant into context
  Notes:      Token can be auto-filled from URL query param ?token=XXXX

RulesAndTerms.tsx
  Purpose:    Terms and conditions acceptance screen
  Route:      Shown after login if rules not yet accepted
  Data:       Updates applicants.rules_accepted and rules_accepted_at
  Actions:    Accept button saves to DB and localStorage
  Notes:      Tied to specific access_token, not just email

AssessmentDashboard.tsx
  Purpose:    Main hub showing assessment status and photo upload
  Route:      Default view after rules acceptance
  Data:       Reads applicant record, video_assessments, work_style_assessments
  Actions:    Photo upload to Supabase Storage, navigation to assessments
  Notes:      Photo upload is required before assessments can be started

VideoAssessment.tsx
  Purpose:    Video recording and upload interface
  Route:      Navigated to from AssessmentDashboard
  Data:       Creates/updates video_assessments record
  Actions:    Browser recording or file upload, triggers transcription API call
  Notes:      Validates video duration (2-5 minutes)

PersonalityTest.tsx
  Purpose:    20-question Likert test + essay
  Route:      Navigated to from AssessmentDashboard
  Data:       Creates work_style_assessments record, calls /api/workstyle/score
  Actions:    Submits answers to Flask API for scoring, saves results to DB
  Notes:      Cannot be re-taken once submitted

--------------------------------------------------------------------------------
ADMIN DASHBOARD COMPONENTS
--------------------------------------------------------------------------------

AdminDashboard.tsx
  Purpose:    Main admin shell with sidebar navigation
  Route:      /admin (after login)
  Data:       Loads all applicants, jobs, settings on mount
  Actions:    Navigation between pipeline stages, HR user management
  Notes:      Contains the sidebar menu and renders child views

AdminLogin.tsx
  Purpose:    Email + password login for admin and HR users
  Route:      /admin/login or /hr/login
  Data:       Calls verify_admin_password RPC, reads admin_users
  Actions:    Creates session, stores in localStorage
  Notes:      Handles must_change_password redirect

ChangePassword.tsx
  Purpose:    Forced password change screen
  Route:      Shown after login if must_change_password = true
  Data:       Updates admin_users.password_hash via RPC
  Actions:    Validates new password, saves, clears must_change_password flag

DashboardLanding.tsx
  Purpose:    Overview stats and recent activity
  Data:       Aggregates from applicants table
  Actions:    Quick navigation to pipeline stages

AdminJobManagement.tsx
  Purpose:    CRUD interface for job postings
  Data:       Reads/writes job_postings table
  Actions:    Create, edit, soft-delete, toggle active status
  Notes:      Uses TagInput.tsx for skills and keywords

ApplicantsList.tsx
  Purpose:    Full list of all applicants with filters
  Data:       Reads applicants table with joins to job_postings
  Actions:    Filter, sort, open detail modal, bulk status changes
  Notes:      Uses FilterDropdown.tsx for filter UI

ScreeningResults.tsx
  Purpose:    Shows applicants who passed automated screening
  Data:       Reads applicants where screening_status = 'passed'
  Actions:    View details, shortlist, reject

NeedsReview.tsx
  Purpose:    Manual review queue for borderline applicants
  Data:       Reads applicants where screening_status = 'needs_review'
  Actions:    Approve, reject, add notes

NeedsReviewDetailPanel.tsx
  Purpose:    Detailed view for a single needs-review applicant
  Data:       Full applicant record with parsed resume
  Actions:    Approve/reject with notes

ShortlistedCandidates.tsx
  Purpose:    Candidates approved for interview
  Data:       Reads applicants where status = 'shortlisted'
  Actions:    Schedule interview, view full details

InterviewScheduling.tsx
  Purpose:    Interview scheduling interface
  Data:       PARTIALLY MOCK - reads from mockInterviews array, not database
              The scheduled_interviews table exists but is not yet connected
  Actions:    Create/edit/cancel interviews, calendar view
  Notes:      Needs database connection to be fully functional

FinalDecisions.tsx
  Purpose:    Hire or reject decisions
  Data:       Reads shortlisted/interviewed applicants
  Actions:    Mark hired/rejected, send offer/rejection emails, add notes

ApplicantDetailModal.tsx
  Purpose:    Full applicant profile modal
  Data:       Reads applicant + video_assessments + work_style_assessments
  Actions:    Status changes, notes, email sending, interview scheduling
  Notes:      Contains VideoAssessmentTab and WorkProfilingTab as sub-components

VideoAssessmentTab.tsx
  Purpose:    Admin view of applicant video and transcription
  Data:       Reads video_assessments for the applicant
  Actions:    Play video, read transcription, view scores

WorkProfilingTab.tsx
  Purpose:    Admin view of work style test results
  Data:       Reads work_style_assessments for the applicant
  Actions:    View dimension scores, strong/moderate/development areas, essay

ReportsDashboard.tsx
  Purpose:    Analytics and metrics for the recruitment pipeline
  Data:       Receives applicant data as props, calculates metrics in-component
  Actions:    View charts and statistics (read-only)

AdminScoringSettings.tsx
  Purpose:    Configure scoring weights and thresholds
  Data:       Reads/writes scoring_settings table
  Actions:    Adjust weights, baselines, thresholds, save changes

AdminSettings.tsx
  Purpose:    Per-user system settings
  Data:       Reads/writes admin_users table for the logged-in user
  Actions:    Change theme, language, notifications, security settings

--------------------------------------------------------------------------------
UTILITY COMPONENTS
--------------------------------------------------------------------------------

FilterDropdown.tsx
  Purpose:    Reusable dropdown filter component
  Used by:    ApplicantsList, ScreeningResults, and other list views

TagInput.tsx
  Purpose:    Multi-value tag input for skills, keywords, etc.
  Used by:    AdminJobManagement for skills and keywords fields

RoleSelection.tsx
  Purpose:    Role picker shown at the root URL
  Notes:      Allows choosing between applicant, HR, and admin login paths

================================================================================
8. BACKEND SERVICES REFERENCE
================================================================================

--------------------------------------------------------------------------------
resume_collector.py
--------------------------------------------------------------------------------

Purpose: Automated email collection and initial applicant creation

How it works:
  1. Connects to Gmail via IMAP using GMAIL_EMAIL and GMAIL_APP_PASSWORD
  2. Searches for emails matching GMAIL_SEARCH_SUBJECTS keywords
  3. For each matching unread email:
     a. Parses sender name and email from headers
     b. Extracts job title from subject line
     c. Downloads resume attachment (PDF or DOCX)
     d. Runs duplicate detection (fuzzy name + email matching)
     e. Uploads resume to Supabase Storage bucket 'resumes'
     f. Creates applicant record in database
     g. Generates unique access_token (UUID)
     h. Sets access_expires_at to now + TOKEN_EXPIRY_HOURS
     i. Calls resume_parser.py to parse the resume
     j. Calls screening_service.py to score the applicant
     k. Marks email as read

Key functions:
  - collect_resumes(): Main entry point, runs the full collection loop
  - extract_applicant_info(): Parses name/email/position from email
  - download_attachment(): Gets the resume file from the email
  - create_applicant_record(): Inserts into Supabase applicants table
  - check_duplicate(): Calls duplicate_detector.py

Dependencies: imaplib, email, supabase-py, resume_parser, screening_service

--------------------------------------------------------------------------------
resume_parser.py
--------------------------------------------------------------------------------

Purpose: Convert raw resume files into structured JSON data

How it works:
  1. Receives applicant_id and resume file path
  2. Extracts text using pdfplumber / PyMuPDF / PyPDF2 / python-docx
  3. Cleans text with GPT via gpt_extractor.py
  4. Detects section boundaries using SECTION_ALIASES keyword matching
  5. Parses each section into structured data
  6. Applies BERT NER for entity enrichment
  7. Normalizes skill names using TECH_CANONICAL mapping
  8. Saves parsed JSON to applicants.parsed_resume_json
  9. Also saves detailed record to resumes table

Key functions:
  - parse_resume(): Main entry point
  - extract_text_from_pdf(): Multi-method PDF text extraction
  - detect_sections(): Finds section boundaries in text
  - parse_experience_section(): Extracts job entries
  - parse_education_section(): Extracts degree entries
  - parse_skills_section(): Extracts and normalizes skills
  - apply_bert_ner(): Runs BERT NER model for entity extraction
  - normalize_skill(): Applies canonical skill name mapping

Dependencies: pdfplumber, pymupdf, PyPDF2, transformers (BERT), openai (GPT)

--------------------------------------------------------------------------------
screening_service.py
--------------------------------------------------------------------------------

Purpose: Score applicants and determine pass/review/fail decision

How it works:
  1. Loads scoring settings from scoring_settings table
  2. Gets the applicant's parsed_resume_json
  3. Gets the job posting requirements for the applied position
  4. Calls job_alignment.py to calculate the hybrid score
  5. Compares score against thresholds
  6. Updates applicant record with score and decision
  7. Generates access token if passed
  8. Calls email_service.py to send notification

Key functions:
  - screen_applicant(): Main entry point
  - load_scoring_settings(): Fetches weights from database
  - determine_decision(): Applies threshold logic
  - generate_access_token(): Creates UUID token for passed applicants
  - update_applicant_status(): Writes results to database

Dependencies: job_alignment, email_service, supabase-py

--------------------------------------------------------------------------------
job_alignment.py
--------------------------------------------------------------------------------

Purpose: Semantic job-resume matching and hybrid scoring engine

This is the largest and most complex backend file (2908 lines).
It implements the core AI scoring logic.

How it works:
  1. Loads the all-MiniLM-L6-v2 sentence transformer model
  2. Encodes resume text and job requirement text as embeddings
  3. Calculates cosine similarity between embeddings
  4. Also does keyword-based matching for each category
  5. Combines semantic and keyword scores into a hybrid result
  6. Applies category weights to get final score

Key functions:
  - get_model(): Loads/caches the sentence transformer model
  - encode_text(): Converts text to embedding vector
  - calculate_semantic_similarity(): Cosine similarity between two texts
  - calculate_hybrid_job_fit_score(): Main scoring function
  - calculate_requirement_match_score(): Semantic match component (60%)
  - calculate_category_count_score(): Count/baseline component (40%)
  - calculate_final_hybrid_score(): Combines both components
  - calculate_skills_keyword_match(): Skills-specific matching with normalization
  - calculate_experience_keyword_match(): Experience years extraction and matching
  - calculate_education_keyword_match(): Degree level matching
  - calculate_projects_keyword_match(): Project relevance matching
  - calculate_traincert_keyword_match(): Certification matching
  - calculate_achievement_keyword_match(): Achievement matching
  - normalize_skill(): Canonical skill name normalization
  - build_job_requirements_text(): Converts job posting to text for embedding
  - get_unified_scoring_profile(): Returns the single scoring profile used for all jobs

The model (all-MiniLM-L6-v2) is approximately 80MB and is cached after first load.
It runs on CPU by default (configurable via MODEL_DEVICE environment variable).

Dependencies: sentence-transformers, scikit-learn, torch, supabase-py

--------------------------------------------------------------------------------
email_service.py
--------------------------------------------------------------------------------

Purpose: Send HTML emails to applicants with score breakdowns

How it works:
  1. Receives applicant data and screening result
  2. Selects the appropriate email template (pass/review/fail)
  3. Builds HTML email with score breakdown table
  4. Sends via SMTP using Gmail credentials
  5. Optionally attaches ICS calendar file for interview invites

Email types:
  - Pass email: Token, login link, score breakdown, assessment instructions
  - Needs review email: Pending message, no score details
  - Fail email: Professional regret, no score details
  - Interview invite: Date/time, meeting link, ICS attachment
  - Offer email: Congratulations, offer details, optional PDF attachment
  - Rejection email: Professional rejection after final decision

Key functions:
  - send_screening_result_email(): Main notification function
  - send_interview_invite(): Interview scheduling email with ICS
  - send_offer_email(): Final offer email
  - send_rejection_email(): Final rejection email
  - build_score_breakdown_html(): Creates the score table HTML

Dependencies: smtplib, email, ics_calendar_service

--------------------------------------------------------------------------------
work_style_scorer.py
--------------------------------------------------------------------------------

Purpose: Score the 20-question personality test using semantic embeddings

How it works:
  1. Receives the list of answers (question_id, answer value 1-5)
  2. Loads the all-MiniLM-L6-v2 model
  3. For each question, converts the Likert answer to a text description
     (e.g., answer=5 -> "I strongly agree with this statement")
  4. Compares the answer text to the ideal answer text for that dimension
     using cosine similarity
  5. Applies reverse coding for negatively-worded questions
  6. Aggregates scores per dimension
  7. Evaluates the essay with GPT for additional insights
  8. Combines Likert scores and essay insights into final dimension scores
  9. Categorizes dimensions as strong/moderate/development
  10. Detects role family from job title for context
  11. Returns WorkStyleResult with all scores and insights

Key classes:
  - DimensionScore: Holds score, label, and description for one dimension
  - WorkStyleResult: Full result with all dimensions, areas, and essay insights
  - WorkStyleScorer: Main scoring class

Key functions:
  - score_assessment(): Main entry point
  - _score_likert_with_embeddings(): Semantic scoring of Likert answers
  - _evaluate_essay_with_gpt(): GPT evaluation of essay response
  - _combine_hybrid_scores(): Merges Likert and essay scores
  - _detect_role_family(): Identifies job category from title
  - _categorize_areas(): Splits dimensions into strong/moderate/development

Dependencies: sentence-transformers, openai, numpy

--------------------------------------------------------------------------------
transcription_service.py
--------------------------------------------------------------------------------

Purpose: Transcribe video assessments using Whisper AI

How it works:
  1. Receives video_assessment_id
  2. Downloads the video from Supabase Storage
  3. Extracts audio using FFmpeg (FFMPEG_PATH configurable)
  4. Runs Whisper AI (whisper-small model) on the audio
  5. Returns transcription text with timestamps
  6. Updates video_assessments.transcription
  7. Updates transcription_status to 'completed' or 'failed'
  8. Stores word count and segment data

The Whisper model used is 'whisper-small' which balances accuracy and speed.
FFmpeg must be installed and accessible (path configurable via FFMPEG_PATH).

Dependencies: openai-whisper, librosa, soundfile, ffmpeg (system binary)

--------------------------------------------------------------------------------
duplicate_detector.py
--------------------------------------------------------------------------------

Purpose: Detect duplicate applications before creating a new applicant record

How it works:
  1. Receives name and email of new applicant
  2. Queries existing applicants from database
  3. Uses rapidfuzz for fuzzy string matching on name
  4. Exact match on email
  5. Returns match results with similarity scores
  6. Duplicate layers:
     - Layer 1: Exact email match (definite duplicate)
     - Layer 2: High name similarity + same position (likely duplicate)
     - Layer 3: Moderate name similarity (possible duplicate)

Dependencies: rapidfuzz, supabase-py

--------------------------------------------------------------------------------
calendar_service.py
--------------------------------------------------------------------------------

Purpose: Google Calendar integration for interview scheduling

Status: Built but may not be fully connected to the scheduling UI

How it works:
  1. Uses Google Service Account credentials
  2. Creates calendar events for scheduled interviews
  3. Sends invites to interviewer and applicant
  4. Returns calendar_event_id for tracking

Dependencies: google-api-python-client, google-auth

--------------------------------------------------------------------------------
ics_calendar_service.py
--------------------------------------------------------------------------------

Purpose: Generate ICS calendar files for email attachments

How it works:
  1. Receives interview details (date, time, location, attendees)
  2. Generates a standard ICS file
  3. Returns the file for attachment in emails

Dependencies: Python standard library (datetime, uuid)

--------------------------------------------------------------------------------
teams_notify.py
--------------------------------------------------------------------------------

Purpose: Send Microsoft Teams notifications for new applicants

How it works:
  1. Receives notification data
  2. Posts to Teams webhook URL (TEAMS_WEBHOOK_URL environment variable)
  3. Sends a card with applicant name, position, and score

Status: Working but optional (requires webhook URL to be configured)

Dependencies: requests

--------------------------------------------------------------------------------
gpt_extractor.py
--------------------------------------------------------------------------------

Purpose: GPT-based text cleaning and normalization for resumes

How it works:
  1. Receives raw extracted resume text
  2. Sends to GPT with a prompt to clean and normalize
  3. GPT fixes spacing, removes artifacts, preserves content
  4. Returns cleaned text for further parsing

Model used: gpt-4o-mini (configurable via GPT_MODEL environment variable)

Dependencies: openai

--------------------------------------------------------------------------------
scoring_api.py
--------------------------------------------------------------------------------

Purpose: Flask API server exposing scoring endpoints to the frontend

Endpoints:
  POST /api/trigger-transcription
    - Receives video_assessment_id
    - Triggers transcription_service.py asynchronously
    - Returns immediately with status 'processing'

  POST /api/workstyle/score
    - Receives applicant_id, answers array, essay, job_title
    - Calls work_style_scorer.py
    - Returns dimension scores and semantic_score

  POST /api/calculate-hybrid-fit
    - Receives applicant_id and job_id
    - Calls job_alignment.py
    - Returns hybrid fit score and breakdown

  POST /api/notify-assessment
    - Receives applicant_id and completed assessments list
    - Sends notification to admin (Teams or email)
    - Non-blocking, failure is silent

Rate limiting is applied via Flask-Limiter.
CORS is configured to allow requests from the frontend origin.


================================================================================
9. AI AND ML MODELS USED
================================================================================

The system uses four distinct AI/ML models, each serving a specific purpose.

--------------------------------------------------------------------------------
MODEL 1: GPT (OpenAI) - gpt-4o-mini
--------------------------------------------------------------------------------

Used for:
  - Resume text cleaning and normalization (gpt_extractor.py)
  - Essay evaluation in work style assessment (work_style_scorer.py)

What it does:
  For resume cleaning: GPT receives the raw extracted text from a PDF and is
  asked to fix formatting issues, remove page numbers and headers, normalize
  spacing, and return clean readable text while preserving all actual content.

  For essay evaluation: GPT receives the applicant's essay response and is
  asked to evaluate it for communication quality, self-awareness, and
  alignment with professional work values. It returns structured insights.

Why this model:
  gpt-4o-mini is used because it is fast and cost-effective for text processing
  tasks that do not require the full capability of GPT-4. The model is
  configurable via the GPT_MODEL environment variable.

Configuration:
  OPENAI_API_KEY must be set in the backend environment.
  GPT_MODEL defaults to 'gpt-4o-mini' if not set.

--------------------------------------------------------------------------------
MODEL 2: BERT NER (Hugging Face Transformers)
--------------------------------------------------------------------------------

Used for:
  - Named entity recognition during resume parsing (resume_parser.py)

What it does:
  BERT (Bidirectional Encoder Representations from Transformers) is used in
  its NER (Named Entity Recognition) variant. It identifies and classifies
  named entities in the resume text such as:
  - Person names
  - Organization names (companies, universities)
  - Locations
  - Job titles
  - Technologies and skills

  The BERT NER results are used as enrichment and fallback. The primary
  parsing is done by the deterministic section parser. BERT fills in gaps
  and validates extracted entities.

Model used: A pre-trained NER model from Hugging Face transformers library.
The specific model checkpoint is loaded via the transformers pipeline.

Configuration:
  MODEL_DEVICE environment variable controls CPU vs GPU (defaults to CPU).
  The model is loaded once and cached for the session.

--------------------------------------------------------------------------------
MODEL 3: all-MiniLM-L6-v2 (Sentence Transformers)
--------------------------------------------------------------------------------

Used for:
  - Resume-to-job semantic matching (job_alignment.py)
  - Work style answer scoring (work_style_scorer.py)

What it does:
  This model converts text into dense vector embeddings (384 dimensions).
  Two texts can then be compared by calculating the cosine similarity between
  their embeddings. A similarity of 1.0 means identical meaning, 0.0 means
  completely unrelated.

  For resume scoring: The resume text for each category (experience, skills,
  education, etc.) is encoded as an embedding. The job requirement text for
  the same category is also encoded. The cosine similarity between them
  becomes the Requirement Match Score for that category.

  For work style scoring: Each Likert answer is converted to a text description
  and encoded. The ideal answer for that dimension is also encoded. The
  similarity score represents how well the applicant's answer aligns with
  the ideal response for that personality dimension.

Why this model:
  all-MiniLM-L6-v2 is a lightweight but highly effective sentence embedding
  model. It is approximately 80MB, runs efficiently on CPU, and produces
  high-quality semantic similarity scores. It is widely used in production
  NLP applications.

Model size: ~80MB
Embedding dimensions: 384
Max input length: 256 tokens (longer texts are truncated)

Configuration:
  The model is downloaded automatically by sentence-transformers on first use.
  MODEL_DEVICE controls CPU vs GPU execution.

--------------------------------------------------------------------------------
MODEL 4: Whisper AI (OpenAI)
--------------------------------------------------------------------------------

Used for:
  - Video assessment transcription (transcription_service.py)

What it does:
  Whisper is a speech recognition model that converts audio to text.
  It receives the audio extracted from the applicant's video recording
  and produces a text transcription with timestamps.

  The transcription is stored in the database and shown to admins in the
  VideoAssessmentTab so they can read what the applicant said without
  watching the full video.

Model variant used: whisper-small
  - Good balance of accuracy and speed
  - Supports multiple languages
  - Runs on CPU (slower) or GPU (faster)

Requirements:
  - FFmpeg must be installed on the system for audio extraction
  - FFMPEG_PATH environment variable can point to the FFmpeg binary
  - librosa and soundfile Python packages for audio processing

================================================================================
10. SCORING SYSTEM EXPLAINED
================================================================================

This section explains the scoring system in detail, including the math.

--------------------------------------------------------------------------------
OVERVIEW
--------------------------------------------------------------------------------

The system uses a UNIFIED HYBRID SCORING approach. This means:
  - All applicants are scored against the same criteria regardless of job level
  - The scoring combines two methods: semantic matching and count-based matching
  - The weights are configurable by the company via the admin dashboard

--------------------------------------------------------------------------------
THE TWO SCORING METHODS
--------------------------------------------------------------------------------

METHOD 1: REQUIREMENT MATCH SCORE (default 60% of final score)

This measures semantic similarity between the applicant's resume content
and the job's requirements. It uses the all-MiniLM-L6-v2 model.

For each category:
  1. Extract the relevant text from the resume (e.g., all experience entries)
  2. Extract the relevant requirements from the job posting
  3. Encode both as embeddings
  4. Calculate cosine similarity (0.0 to 1.0)
  5. Multiply by 100 to get a 0-100 score

This score reflects HOW WELL the content matches, not just whether it exists.

METHOD 2: COUNT SCORE (default 40% of final score)

This measures whether the applicant meets minimum quantity requirements.

For each category:
  1. Count the relevant items in the resume (e.g., number of years of experience)
  2. Compare to the baseline (minimum expected count)
  3. Score = min(actual_count / baseline_count, 1.0) x 100

This score reflects WHETHER the applicant has enough of each thing.

Examples:
  - Baseline skills = 10, applicant has 15 skills -> count score = 100
  - Baseline skills = 10, applicant has 5 skills -> count score = 50
  - Baseline experience = 2 years, applicant has 3 years -> count score = 100

--------------------------------------------------------------------------------
COMBINING THE TWO METHODS
--------------------------------------------------------------------------------

For each category:
  Category Score = (Requirement Match Score x requirement_weight)
                 + (Count Score x count_weight)

Default: Category Score = (Requirement Match x 0.6) + (Count x 0.4)

--------------------------------------------------------------------------------
APPLYING CATEGORY WEIGHTS
--------------------------------------------------------------------------------

The 6 category scores are combined using their weights:

  Final Score = (Experience Score x 0.28)
              + (Skills Score x 0.30)
              + (Education Score x 0.18)
              + (Projects Score x 0.14)
              + (Training/Cert Score x 0.06)
              + (Achievements Score x 0.04)

The weights must sum to 1.0 (100%). They are configurable in AdminScoringSettings.

--------------------------------------------------------------------------------
DECISION THRESHOLDS
--------------------------------------------------------------------------------

After calculating the final score (0-100):

  score >= qualified_threshold (default 78) -> passed_screening
    The applicant receives a login token and is invited to complete assessments.

  score >= review_threshold (default 65) -> needs_review
    The applicant is placed in the manual review queue for HR to evaluate.

  score < review_threshold -> failed_screening
    The applicant receives a professional regret email.

Both thresholds are configurable in AdminScoringSettings.

--------------------------------------------------------------------------------
SCORE BREAKDOWN IN EMAILS
--------------------------------------------------------------------------------

When an applicant passes, their email includes a full score breakdown:
  - Overall final score
  - Requirement Match Score (the semantic component)
  - Count Score (the quantity component)
  - Individual category scores (Experience, Skills, Education, etc.)

This transparency helps applicants understand their result.

--------------------------------------------------------------------------------
WORK STYLE SCORING (SEPARATE FROM RESUME SCORING)
--------------------------------------------------------------------------------

The work style test produces a separate semantic_score (0-100).

This score is NOT combined with the resume screening score automatically.
It is stored separately in work_style_assessments.semantic_score.

Admins can view both scores in the Applicant Detail Modal and use their
judgment to weigh them in the final decision.

The admin_users table has resume_weight, video_weight, and profile_weight
fields suggesting a future feature to combine all scores into an overall score,
but this combination is not currently implemented in the frontend.

================================================================================
11. DATABASE SCHEMA REFERENCE
================================================================================

All tables are in the public schema of the Supabase PostgreSQL database.
Row Level Security (RLS) is enabled on all tables.

--------------------------------------------------------------------------------
TABLE: applicants
--------------------------------------------------------------------------------

The central table. One row per applicant application.

  id                    UUID, primary key, auto-generated
  email                 text, unique - applicant's email address
  name                  text - full name
  position              text - job title they applied for
  access_token          text, unique - login token sent by email
  access_expires_at     timestamptz - when the token expires (24h after creation)
  rules_accepted        boolean, default false
  rules_accepted_at     timestamptz - when they accepted the rules
  created_at            timestamptz - when the application was received
  updated_at            timestamptz - last update timestamp
  user_id               UUID - optional link to Supabase Auth user
  photo_url             text - URL of profile photo in Supabase Storage
  resume_text           text - raw extracted resume text
  parsed_resume_json    JSONB - structured parsed resume data
  video_path            text - path to video in Supabase Storage
  transcription_text    text - video transcription (denormalized copy)
  applied_job_id        text, FK to job_postings.job_id
  screening_score       numeric - final hybrid score (0-100)
  screening_fit_category text - 'passed_screening', 'needs_review', 'failed_screening'
  overall_score         numeric - reserved for future combined scoring
  status                text - current pipeline stage (see status values below)
  rejection_reason      text - reason if rejected
  duplicate_matches     JSONB - fuzzy match results if duplicate detected
  duplicate_detected_at timestamptz
  duplicate_layer       integer - 1=exact email, 2=high name match, 3=moderate match
  screening_status      text - 'passed', 'needs_review', 'failed'
  screening_stage       text - 'screened' (default)
  screened_at           timestamptz
  hr_notes              text - notes added by HR during review
  decision_date         timestamptz - when final decision was made
  decision_notes        text - notes about the final decision
  offer_email_sent      boolean, default false
  offer_email_sent_at   timestamptz
  offer_attachment_url  text - URL of offer letter PDF if attached
  rejection_email_sent  boolean, default false
  rejection_email_sent_at timestamptz

Status values (applicants.status):
  pending_screening     -> Just created, waiting to be scored
  passed_screening      -> Score >= qualified_threshold
  needs_review          -> Score between review and qualified thresholds
  failed_screening      -> Score < review_threshold
  shortlisted           -> HR approved for interview
  interview_scheduled   -> Interview has been scheduled
  interviewed           -> Interview completed
  hired                 -> Final decision: hired
  rejected              -> Final decision: rejected

--------------------------------------------------------------------------------
TABLE: job_postings
--------------------------------------------------------------------------------

One row per job opening.

  job_id                text, primary key - unique job identifier
  title                 text - job title
  department            text - department name
  description           text - full job description
  skills                JSONB array - required skills list
  keywords              JSONB array - additional keywords for matching
  required_education    JSONB array - education requirements
  expected_projects     JSONB array - project/portfolio requirements
  preferred_certifications JSONB array - preferred certifications
  min_years_experience  numeric - minimum years required
  max_years_experience  numeric - maximum years (optional)
  source                text - 'admin' (created in dashboard) or 'dataset' (imported)
  is_active             boolean, default true
  deleted_at            timestamptz - soft delete timestamp
  created_at            timestamptz
  updated_at            timestamptz

--------------------------------------------------------------------------------
TABLE: scoring_settings
--------------------------------------------------------------------------------

One row (the most recently updated row is used).

  settings_id           UUID, primary key
  experience_weight     numeric, default 40 - weight for experience category
  skills_weight         numeric, default 30 - weight for skills category
  education_weight      numeric, default 20 - weight for education category
  projects_weight       numeric, default 10 - weight for projects category
  traincert_weight      numeric, default 6 - weight for training/cert category
  achievements_weight   numeric, default 4 - weight for achievements category
  qualified_threshold   numeric, default 80 - score to auto-pass
  review_threshold      numeric, default 60 - score for manual review
  baseline_experience   numeric, default 2 - minimum expected years
  baseline_skills       numeric, default 8 - minimum expected skills count
  baseline_education    numeric, default 2 - minimum expected education entries
  baseline_projects     numeric, default 2 - minimum expected projects
  baseline_traincert    numeric, default 2 - minimum expected certifications
  baseline_achievements numeric, default 1 - minimum expected achievements
  scoring_type          text, default 'hybrid' - 'hybrid' or 'semantic'
  requirement_weight    integer, default 60 - % weight for semantic component
  count_weight          integer, default 40 - % weight for count component
  resume_weight         integer, default 50 - reserved for overall scoring
  video_weight          integer, default 40 - reserved for overall scoring
  profile_weight        integer, default 10 - reserved for overall scoring
  created_at            timestamptz
  updated_at            timestamptz

Note: The defaults in the database schema differ slightly from the defaults
in screening_service.py. The database values take precedence at runtime.

--------------------------------------------------------------------------------
TABLE: video_assessments
--------------------------------------------------------------------------------

One row per video submission. One applicant can have one video assessment.

  id                    UUID, primary key
  applicant_id          UUID, FK to applicants.id
  video_url             text - URL of video in Supabase Storage
  status                text, default 'pending' - 'pending', 'submitted', 'scored'
  submitted_at          timestamptz
  created_at            timestamptz
  transcription         text - full transcription text from Whisper
  transcription_status  varchar, default 'pending' - 'pending', 'processing', 'completed', 'failed'
  transcription_error   text - error message if transcription failed
  transcribed_at        timestamptz
  transcription_segments JSONB - word-level segments with timestamps
  video_duration_seconds integer - duration of the video
  transcript_word_count integer - number of words in transcription
  transcript_score      numeric - overall transcript quality score
  relevance_score       numeric - how relevant the answer is
  experience_score      numeric - mentions of relevant experience
  skills_score          numeric - mentions of relevant skills
  completeness_score    numeric - whether the response was complete
  validation_status     varchar, default 'pending'
  validation_message    text
  scored_at             timestamptz

--------------------------------------------------------------------------------
TABLE: work_style_assessments
--------------------------------------------------------------------------------

One row per test submission. One applicant can have one work style assessment.

  id                    UUID, primary key
  applicant_id          UUID, FK to applicants.id
  answers               JSONB array - list of {question_id, answer} objects
  essay                 text - the essay response
  dimension_scores      JSONB - scores for each of the 15 dimensions
  work_style_alignment_score integer - legacy field
  matched_role          text - detected role family
  status                text, default 'pending' - 'pending', 'submitted', 'scored'
  submitted_at          timestamptz
  created_at            timestamptz
  updated_at            timestamptz
  semantic_score        numeric - overall semantic score (0-100)
  role_family           varchar - detected role category
  strong_areas          JSONB array - dimension names with high scores
  moderate_areas        JSONB array - dimension names with moderate scores
  development_areas     JSONB array - dimension names with low scores
  essay_insights        text - GPT evaluation of the essay
  scoring_method        varchar, default 'semantic'
  scored_at             timestamptz

--------------------------------------------------------------------------------
TABLE: admin_users
--------------------------------------------------------------------------------

One row per admin or HR user.

  id                    UUID, primary key
  email                 varchar, unique
  password_hash         varchar - bcrypt hashed password
  name                  varchar - display name
  role                  varchar, default 'admin' - 'admin' or 'hr'
  created_at            timestamptz
  last_login_at         timestamptz
  company_name          varchar, default 'AutoIntel Recruitment'
  timezone              varchar, default 'Asia/Manila'
  date_format           varchar, default 'MM/DD/YYYY'
  language              varchar, default 'en'
  email_new_applicant   boolean, default true
  email_assessment_complete boolean, default true
  email_daily_digest    boolean, default false
  browser_notifications boolean, default true
  webhook               varchar - generic webhook URL
  two_factor_auth       boolean, default false
  password_expiry       varchar, default '90' - days before password expires
  session_timeout       varchar, default '30' - minutes of inactivity before logout
  ip_whitelist          text - comma-separated allowed IPs
  resume_weight         integer, default 40 - reserved for overall scoring
  video_weight          integer, default 35 - reserved for overall scoring
  profile_weight        integer, default 25 - reserved for overall scoring
  auto_reject_threshold integer, default 30 - reserved for auto-rejection
  auto_shortlist_threshold integer, default 85 - reserved for auto-shortlisting
  theme                 varchar, default 'light' - 'light' or 'dark'
  sidebar_collapsed     boolean, default false
  compact_view          boolean, default false
  data_retention        varchar, default '365' - days to keep data
  auto_archive          boolean, default true
  api_access            boolean, default false
  debug_mode            boolean, default false
  slack_webhook         text - Slack webhook URL
  must_change_password  boolean, default false

--------------------------------------------------------------------------------
TABLE: resumes
--------------------------------------------------------------------------------

Detailed resume processing record. Supplements applicants.parsed_resume_json.

  id                    UUID, primary key
  applicant_id          UUID, FK to applicants.id
  resume_url            text - URL of original file in Supabase Storage
  status                text, default 'pending'
  uploaded_at           timestamptz
  extracted_text        text - raw extracted text
  named_entities        JSONB - BERT NER results
  ner_score             numeric
  processing_status     text, default 'pending'
  text_extracted_at     timestamptz
  ner_processed_at      timestamptz
  raw_extracted_content text - unprocessed extraction output
  parsed_data           JSONB - structured parsed resume
  ner_status            text, default 'pending'
  extraction_metadata   JSONB - metadata about extraction process
  pre_ner_sections      JSONB - sections before NER processing
  cleaned_resume_text   text - GPT-cleaned text
  gpt_cleaning_status   text, default 'pending'
  extractor_used        text - which PDF extractor was used

--------------------------------------------------------------------------------
TABLE: scheduled_interviews
--------------------------------------------------------------------------------

Interview scheduling records. Currently not connected to the UI.

  id                    UUID, primary key
  applicant_id          UUID, FK to applicants.id
  interviewer_id        UUID, FK to hr_managers.id
  job_id                text, FK to job_postings.job_id
  interview_date        date
  interview_time        time
  interview_type        text - 'online' or 'in-person'
  meeting_link          text - video call URL
  meeting_passcode      text
  location              text - physical location for in-person
  status                text, default 'scheduled' - 'scheduled', 'completed', 'cancelled'
  notes                 text
  created_at            timestamptz
  updated_at            timestamptz
  meeting_id            text - external meeting ID
  duration_minutes      integer, default 60
  time_zone             text, default 'Asia/Manila'
  primary_interviewer_email text
  additional_attendees  JSONB array - other attendees
  applicant_instructions text - instructions sent to applicant
  internal_notes        text - notes visible only to HR
  calendar_event_id     text - Google Calendar event ID
  ics_uid               text - ICS calendar unique identifier

--------------------------------------------------------------------------------
TABLE: hr_managers
--------------------------------------------------------------------------------

HR manager profiles for interview assignment.

  id                    UUID, primary key
  name                  varchar
  email                 varchar, unique
  role                  varchar, default 'Manager'
  department            varchar
  is_active             boolean, default true
  created_at            timestamptz
  updated_at            timestamptz

--------------------------------------------------------------------------------
TABLE: resume_scores
--------------------------------------------------------------------------------

Detailed score breakdown per applicant per job.

  score_id              UUID, primary key
  applicant_id          UUID, FK to applicants.id
  job_id                text, FK to job_postings.job_id
  experience_score      numeric (0-100)
  skills_score          numeric (0-100)
  education_score       numeric (0-100)
  project_score         numeric (0-100)
  final_score           numeric (0-100)
  status                text - 'pending', 'in_review', 'shortlisted', 'rejected', 'hired'
  match_explain         JSONB - detailed breakdown of how score was calculated
  created_at            timestamptz

--------------------------------------------------------------------------------
TABLE: admin_actions
--------------------------------------------------------------------------------

Audit log of admin actions on applicants.

  id                    UUID, primary key
  applicant_id          UUID, FK to applicants.id
  action_type           text - type of action performed
  notes                 text - optional notes
  created_at            timestamptz
  performed_by          UUID - admin user who performed the action


================================================================================
12. API ENDPOINTS
================================================================================

The Flask API server (scoring_api.py) runs separately from the frontend.
Default address: http://localhost:5000 (configurable via VITE_API_URL)

All endpoints accept and return JSON. CORS is enabled for the frontend origin.

--------------------------------------------------------------------------------
POST /api/trigger-transcription
--------------------------------------------------------------------------------

Purpose: Start video transcription for a submitted video assessment

Request body:
  {
    "video_assessment_id": "uuid-string"
  }

Response (success):
  {
    "status": "processing",
    "message": "Transcription started"
  }

Response (error):
  {
    "status": "error",
    "message": "Error description"
  }

Behavior:
  - Starts transcription asynchronously (does not wait for completion)
  - The frontend polls video_assessments.transcription_status to check progress
  - Status values: 'pending' -> 'processing' -> 'completed' or 'failed'

--------------------------------------------------------------------------------
POST /api/workstyle/score
--------------------------------------------------------------------------------

Purpose: Score a work style assessment submission

Request body:
  {
    "applicant_id": "uuid-string",
    "answers": [
      { "question_id": "q1", "answer": 4 },
      { "question_id": "q2", "answer": 2 },
      ...
    ],
    "essay": "The applicant's essay response text",
    "job_title": "Software Engineer"
  }

Response (success):
  {
    "semantic_score": 72.5,
    "dimension_scores": {
      "conscientiousness": { "score": 80, "label": "Strong", "description": "..." },
      "teamwork": { "score": 65, "label": "Moderate", "description": "..." },
      ...
    },
    "strong_areas": ["conscientiousness", "reliability"],
    "moderate_areas": ["teamwork", "communication"],
    "development_areas": ["leadership"],
    "role_family": "technical",
    "essay_insights": "The applicant demonstrates...",
    "scoring_method": "semantic"
  }

--------------------------------------------------------------------------------
POST /api/calculate-hybrid-fit
--------------------------------------------------------------------------------

Purpose: Calculate hybrid job fit score for an applicant

Request body:
  {
    "applicant_id": "uuid-string",
    "job_id": "job-id-string"
  }

Response (success):
  {
    "final_score": 82.3,
    "requirement_match_score": 85.1,
    "count_score": 77.8,
    "category_scores": {
      "experience": 88.0,
      "skills": 79.5,
      "education": 90.0,
      "projects": 75.0,
      "traincert": 60.0,
      "achievements": 55.0
    },
    "breakdown": { ... }
  }

--------------------------------------------------------------------------------
POST /api/notify-assessment
--------------------------------------------------------------------------------

Purpose: Notify admin that an applicant completed assessments

Request body:
  {
    "applicant_id": "uuid-string",
    "completed": ["Video Assessment", "Work Style Test"]
  }

Response: Always returns success (failure is silent, non-blocking)

================================================================================
13. AUTHENTICATION AND SECURITY
================================================================================

--------------------------------------------------------------------------------
APPLICANT AUTHENTICATION
--------------------------------------------------------------------------------

Applicants authenticate using a unique token (UUID) sent to their email.

Token lifecycle:
  1. Token is generated when applicant passes screening (UUID v4)
  2. Token is stored in applicants.access_token (unique constraint)
  3. Expiry is set to now + TOKEN_EXPIRY_HOURS (default 24 hours)
  4. Token is included in the login link in the pass email
  5. On login, token is validated against the database
  6. If valid and not expired, token is stored in localStorage
  7. Token is sent with every Supabase request for RLS enforcement
  8. On logout, token is removed from localStorage

Security notes:
  - Tokens are single-use per session (not rotated on each request)
  - Expired tokens cannot be used (access_expires_at check)
  - Applicants can only read/write their own records (RLS enforced)
  - The anon key is used for applicant requests (RLS applies)

--------------------------------------------------------------------------------
ADMIN AUTHENTICATION
--------------------------------------------------------------------------------

Admins authenticate with email and password.

Login process:
  1. Email and password submitted to frontend
  2. Frontend calls Supabase RPC verify_admin_password(email, password)
  3. RPC checks password against bcrypt hash in admin_users table
  4. If valid, returns user data
  5. Frontend generates a session token (UUID) with 24-hour expiry
  6. Session stored in localStorage as 'admin_session' JSON object
  7. Session includes: access_token, expires_at, user_id, email, role

Session management:
  - Idle timeout: configurable per user (default 30 minutes)
  - Activity events reset the idle timer: mousemove, click, keypress
  - On timeout: session cleared, user redirected to login
  - Password expiry: configurable per user (default 90 days)
  - must_change_password flag forces password change on next login

Role-based access:
  - role = 'admin': Full access to all features
  - role = 'hr': Same dashboard access (role-based restrictions are UI-level)
  - The userRole is stored in AuthContext and available to all components

--------------------------------------------------------------------------------
ROW LEVEL SECURITY (RLS)
--------------------------------------------------------------------------------

Supabase RLS policies control what each user can read and write.

The RLS policies are defined in supabase/rls_policies.sql.

General approach:
  - Applicants can only access their own records (matched by access_token)
  - Admin users can access all records (matched by admin session)
  - The service role key (backend only) bypasses all RLS

Security separation:
  - Frontend uses VITE_SUPABASE_ANON_KEY (public, RLS enforced)
  - Backend uses SUPABASE_SERVICE_KEY (private, RLS bypassed)
  - The service key is NEVER exposed to the frontend

--------------------------------------------------------------------------------
MAINTENANCE PREVIEW MODE
--------------------------------------------------------------------------------

Admins can preview the applicant portal without logging out.

Activation: A flag 'maintenance_preview' = '1' is set in localStorage.
Effect: The admin sees the applicant portal as if they were an applicant.
This is useful for testing the applicant experience.

================================================================================
14. INTERNATIONALIZATION (MULTI-LANGUAGE)
================================================================================

The frontend supports 6 languages using i18next and react-i18next.

Supported languages:
  en - English (default)
  es - Spanish
  fr - French
  de - German
  ja - Japanese
  zh - Chinese (Simplified)

Configuration (src/i18n/index.ts):
  - All 6 language files are imported and registered
  - Default language is English
  - Fallback language is English (if a key is missing in another language)
  - Interpolation is enabled for dynamic values like {{count}} or {{name}}

Language files (src/i18n/locales/):
  Each file exports a TypeScript object with translation keys.
  Keys cover: navigation labels, status values, table headers, button text,
  form labels, error messages, assessment instructions, and settings labels.

Changing language:
  - Admin can change language in AdminSettings.tsx
  - The selected language is saved to admin_users.language in the database
  - On login, the saved language is loaded and applied via i18n.changeLanguage()
  - The SettingsContext handles language synchronization

Usage in components:
  import { useTranslation } from 'react-i18next';
  const { t } = useTranslation();
  <span>{t('common.save')}</span>

================================================================================
15. CONFIGURATION AND ENVIRONMENT VARIABLES
================================================================================

--------------------------------------------------------------------------------
FRONTEND ENVIRONMENT VARIABLES (.env)
--------------------------------------------------------------------------------

These are prefixed with VITE_ and are embedded in the browser bundle.
They are safe to expose (no secrets).

  VITE_API_URL
    The URL of the Flask API server.
    Development: http://localhost:5000
    Production: https://your-api-gateway-url.com

  VITE_APP_URL
    The URL of the frontend application.
    Development: http://localhost:5173
    Production: https://your-domain.com

  VITE_SUPABASE_URL
    The Supabase project URL.
    Example: https://your-project.supabase.co

  VITE_SUPABASE_ANON_KEY
    The Supabase anonymous key (public, safe for browser).
    This key is used with RLS for all frontend database operations.

SECURITY WARNING: Never add VITE_SUPABASE_SERVICE_ROLE_KEY to the frontend.
The service role key bypasses RLS and must only be used in backend services.

--------------------------------------------------------------------------------
BACKEND ENVIRONMENT VARIABLES (.env in backend context)
--------------------------------------------------------------------------------

These are used only by Python services and must never be exposed to the frontend.

  SUPABASE_URL              Supabase project URL
  SUPABASE_SERVICE_KEY      Service role key (bypasses RLS)
  SUPABASE_SERVICE_ROLE_KEY Alternative name for service role key
  SUPABASE_ANON_KEY         Anon key (optional for backend)

  OPENAI_API_KEY            OpenAI API key for GPT and Whisper
  GPT_MODEL                 GPT model to use (default: gpt-4o-mini)

  GMAIL_EMAIL               Gmail address for IMAP collection
  GMAIL_APP_PASSWORD        Gmail App Password (requires 2FA enabled)
  GMAIL_SEARCH_SUBJECTS     Comma-separated subject keywords (default: Applicant,Resume,Application)
  GMAIL_PRIMARY_MAILBOX     Mailbox to search (default: INBOX)

  SMTP_HOST                 SMTP server (default: smtp.gmail.com)
  SMTP_PORT                 SMTP port (default: 587)
  SMTP_USER                 SMTP username (usually same as GMAIL_EMAIL)
  SMTP_PASSWORD             SMTP password (usually same as GMAIL_APP_PASSWORD)
  FROM_EMAIL                Sender email address
  FROM_NAME                 Sender display name

  TOKEN_EXPIRY_HOURS        Hours before applicant tokens expire (default: 24)
  APP_URL                   Frontend URL for generating login links in emails

  GOOGLE_SERVICE_ACCOUNT_EMAIL   Google service account for Calendar API
  GOOGLE_PRIVATE_KEY             Private key for Google service account
  GOOGLE_CALENDAR_ID             Calendar ID (default: primary)
  GOOGLE_PROJECT_ID              Google Cloud project ID
  (other GOOGLE_* fields)        Additional Google API credentials

  FFMPEG_PATH               Path to FFmpeg binary (if not in system PATH)

  API_HOST                  Flask API host (default: 0.0.0.0)
  API_PORT                  Flask API port (default: 5000)
  DEBUG                     Flask debug mode (default: false)

  TEAMS_WEBHOOK_URL         Microsoft Teams webhook URL (optional)
  MODEL_DEVICE              ML model device: 'cpu' or 'cuda' (default: cpu)

================================================================================
16. INCOMPLETE / PARTIALLY CONNECTED FEATURES
================================================================================

This section documents features that exist in the codebase but are not fully
connected or functional.

--------------------------------------------------------------------------------
INTERVIEW SCHEDULING - UI NOT CONNECTED TO DATABASE
--------------------------------------------------------------------------------

Status: The UI (InterviewScheduling.tsx) is fully built with a complete form,
calendar view, and status management. However, it currently loads data from
a hardcoded mockInterviews array inside the component instead of fetching
from the scheduled_interviews database table.

What works:
  - The UI renders correctly
  - The form for creating interviews is complete
  - The calendar view displays interviews
  - Status changes work in the UI state

What does not work:
  - Interviews are not saved to the database
  - Interviews are not loaded from the database
  - Data is lost on page refresh
  - The scheduled_interviews table is fully defined and ready to use

What needs to be done to fix it:
  - Replace the mockInterviews array with a Supabase query
  - Add insert/update/delete operations to the database
  - Connect the interviewer dropdown to the hr_managers table

--------------------------------------------------------------------------------
GOOGLE CALENDAR INTEGRATION - BUILT BUT NOT WIRED
--------------------------------------------------------------------------------

Status: calendar_service.py is fully implemented with Google Calendar API
integration. However, it is not called from the interview scheduling UI.

What exists:
  - Full Google Calendar API client setup
  - Create/update/delete calendar events
  - Send invites to attendees
  - Return calendar_event_id for tracking

What needs to be done:
  - Call calendar_service.py from the interview scheduling flow
  - Store the returned calendar_event_id in scheduled_interviews table
  - Handle calendar event updates when interview is rescheduled or cancelled

--------------------------------------------------------------------------------
OVERALL SCORE COMBINATION - RESERVED BUT NOT IMPLEMENTED
--------------------------------------------------------------------------------

Status: The database has fields for combining resume, video, and work style
scores into an overall score, but this combination is not implemented.

Fields that exist but are not used:
  - applicants.overall_score
  - admin_users.resume_weight, video_weight, profile_weight
  - scoring_settings.resume_weight, video_weight, profile_weight

What would need to be done:
  - Implement the combination formula in the frontend or backend
  - Display the overall score in the applicant detail modal
  - Use it for sorting and filtering in the pipeline views

--------------------------------------------------------------------------------
AUTO-REJECT AND AUTO-SHORTLIST THRESHOLDS - RESERVED
--------------------------------------------------------------------------------

Status: admin_users has auto_reject_threshold and auto_shortlist_threshold
fields, but automatic rejection/shortlisting based on these thresholds is
not implemented.

--------------------------------------------------------------------------------
REPORTS DASHBOARD - USES REAL DATA
--------------------------------------------------------------------------------

Clarification: ReportsDashboard.tsx does NOT use mock data. It receives
applicant data as props from AdminDashboard.tsx and calculates all metrics
from that real data. The component is functional.

--------------------------------------------------------------------------------
WORK STYLE SCORING API - REQUIRES FLASK SERVER
--------------------------------------------------------------------------------

Status: The work style scoring requires the Flask API server to be running.
If the server is not running, the scoring call will fail silently and the
assessment will be saved without a semantic score.

The Flask server must be started manually:
  cd backend
  python scoring_api.py

Or it can be deployed as a separate service in production.

--------------------------------------------------------------------------------
EMAIL LOGIN LINKS - APP_URL MUST BE CONFIGURED
--------------------------------------------------------------------------------

Status: The login link in pass emails uses the APP_URL environment variable.
If APP_URL is not set or is set to the placeholder value, the link will not
work for applicants.

This must be set to the actual frontend URL before going to production.

================================================================================
17. KNOWN LIMITATIONS AND NOTES
================================================================================

BERT MODEL LOADING TIME
  The BERT NER model and sentence transformer model take time to load on first
  use (typically 10-30 seconds depending on hardware). Subsequent calls are
  fast because the models are cached in memory.

WHISPER TRANSCRIPTION SPEED
  Whisper transcription is slow on CPU. A 3-minute video may take 5-15 minutes
  to transcribe on CPU. GPU acceleration significantly reduces this time.
  The transcription runs asynchronously so it does not block the applicant.

PDF EXTRACTION QUALITY
  PDF text extraction quality varies by PDF type. Text-based PDFs work well.
  Scanned PDFs (image-based) will produce poor or no text. The system does
  not currently support OCR for scanned documents.

TOKEN EXPIRY
  Applicant tokens expire after 24 hours. If an applicant does not complete
  their assessments within 24 hours, they will need to contact HR to get a
  new token. There is no self-service token renewal.

SINGLE SCORING PROFILE
  The system uses a unified scoring profile for all jobs. There is no
  per-job scoring configuration. All applicants are scored against the same
  6-category weights regardless of the specific job they applied for.

LANGUAGE SUPPORT
  The frontend supports 6 languages, but the backend email templates are
  in English only. Applicants will receive emails in English regardless of
  their language preference.

SUPABASE STORAGE
  Videos and resumes are stored in Supabase Storage. Large video files may
  take time to upload depending on the applicant's internet connection.
  The system does not compress videos before storage.

CONCURRENT PROCESSING
  The resume_collector.py script processes emails sequentially. If many
  applications arrive at once, processing may take time. The script can
  be run more frequently to reduce latency.

SECURITY NOTE ON ADMIN PASSWORDS
  Admin passwords are stored as bcrypt hashes in the admin_users table.
  The verify_admin_password RPC function handles comparison securely.
  Passwords should be changed regularly using the password expiry feature.

DATA RETENTION
  The data_retention setting in admin_users is stored but auto-archiving
  behavior depends on whether a scheduled job implements it. Manual data
  management may be needed.

================================================================================
END OF DOCUMENTATION
================================================================================

This document covers the complete AutoIntel Recruitment System as of April 2026.
For questions about specific implementation details, refer to the source files
listed throughout this document.

Source files are organized as:
  backend/          Python backend services
  src/components/   React frontend components
  src/contexts/     React context providers
  src/i18n/         Internationalization files
  src/lib/          Supabase client configuration
  supabase/         Database schema and RLS policies
  data/             Job postings dataset

