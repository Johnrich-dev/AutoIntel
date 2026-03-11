# AutoIntel Recruitment System - Complete Workflow Documentation

## Overview
This document describes the complete recruitment workflow for the AutoIntel system, from initial application to final assessment, including the hybrid semantic scoring system.

---

## System Status: ✅ FULLY OPERATIONAL

The AutoIntel Recruitment System is now complete with **hybrid semantic scoring** that uses company-adaptable weights!

---

## PART 1: APPLICANT FLOW (Complete Detailed Process)

### Stage 1: Application Submission (Email-Based)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        STAGE 1: APPLICATION RECEIPT                             │
│                     (Automatic Email Collection & Parsing)                     │
└─────────────────────────────────────────────────────────────────────────────────┘

    ┌─────────────────┐
    │  Applicant     │
    │  Sends Email   │
    └────────┬────────┘
             │
             ▼
    ┌────────────────────────────────────────────────────────────────────────────┐
    │  EMAIL CONTENT REQUIREMENTS:                                               │
    │  ├── Subject line: "Applicant - [Job Title]" or "Application - [Role]"   │
    │  ├── Attachment: Resume (PDF, DOC, or DOCX)                               │
    │  └── Body: Optional cover text                                             │
    └────────────────────────────────────────────────────────────────────────────┘
             │
             ▼
    ┌────────────────────────────────────────────────────────────────────────────┐
    │  RESUME COLLECTOR (resume_collector.py) - Runs as scheduled job          │
    │                                                                             │
    │  Step 1.1: Connect to Gmail via IMAP                                       │
    │  ├── Server: imap.gmail.com (port 993)                                    │
    │  ├── Authenticate with App Password                                        │
    │  └── Search for: is:unread subject:applic OR subject:application         │
    │                                                                             │
    │  Step 1.2: Extract Email Data                                              │
    │  ├── Decode sender email and name                                         │
    │  ├── Extract job title from subject line                                  │
    │  └── Verify resume attachment exists                                       │
    │                                                                             │
    │  Step 1.3: Download and Parse Resume                                       │
    │  ├── Download PDF/DOC/DOCX attachment                                     │
    │  ├── Save to /resumes folder                                              │
    │  ├── Parse with resume_parser.py or GPT extractor                         │
    │  └── Extract: name, email, phone, education, experience, skills, projects│
    │                                                                             │
    │  Step 1.4: Store in Database                                               │
    │  └── Create entry in:                                                      │
    │       ├── applicants table (id, name, email, position, status)             │
    │       ├── resumes table (applicant_id, raw_text, parsed_data)              │
    │       └── Set status: "pending_screening"                                  │
    └────────────────────────────────────────────────────────────────────────────┘
             │
             ▼
    ┌────────────────────────────────────────────────────────────────────────────┐
    │  DATABASE ENTRY CREATED:                                                    │
    │  ┌──────────────────────────────────────────────────────────────────────┐  │
    │  │ applicants table:                                                    │  │
    │  │ ├── id: UUID (primary key)                                          │  │
    │  │ ├── name: "John Doe"                                                │  │
    │  │ ├── email: "john@example.com"                                       │  │
    │  │ ├── position: "Application Developer" (from email subject)          │  │
    │  │ ├── status: "pending_screening"                                    │  │
    │  │ ├── screening_score: NULL                                           │  │
    │  │ ├── access_token: NULL                                               │  │
    │  │ └── created_at: timestamp                                           │  │
    │  └──────────────────────────────────────────────────────────────────────┘  │
    │  ┌──────────────────────────────────────────────────────────────────────┐  │
    │  │ resumes table:                                                       │  │
    │  │ ├── applicant_id: UUID (foreign key)                                │  │
    │  │ ├── raw_text: "Full resume text content..."                          │  │
    │  │ ├── parsed_data: { ...structured resume data... }                   │  │
    │  │ └── status: "pending"                                                │  │
    │  └──────────────────────────────────────────────────────────────────────┘  │
    └────────────────────────────────────────────────────────────────────────────┘
```

---

### Stage 2: Automatic Screening (Hybrid Semantic Scoring)

```
╔══════════════════════════════════════════════════════════════════════════════════╗
║                    STAGE 2: AUTOMATIC SCREENING                                 ║
║                    (Hybrid Semantic Scoring with Company-Adaptive Weights)      ║
╚══════════════════════════════════════════════════════════════════════════════════╝

    ═══════════════════════════════════════════════════════════════════════════
    STEP 2A: LOAD SCORING SETTINGS FROM DATABASE
    ═══════════════════════════════════════════════════════════════════════════

    ┌────────────────────────────────────────────────────────────────────────┐
    │  Query: SELECT * FROM scoring_settings LIMIT 1                       │
    │                                                                        │
    │  Returns:                                                              │
    │  ┌──────────────────────────────────────────────────────────────────┐  │
    │  │ Default Company-Adaptive Weights (Configurable via Admin):       │  │
    │  │                                                                   │  │
    │  │ experience_weight: 40%  (configurable: 0-100)                   │  │
    │  │ skills_weight: 30%      (configurable: 0-100)                    │  │
    │  │ education_weight: 20%  (configurable: 0-100)                    │  │
    │  │ projects_weight: 10%   (configurable: 0-100)                    │  │
    │  │                                                                   │  │
    │  │ qualified_threshold: 80  (min score to auto-pass)                │  │
    │  │ review_threshold: 60    (min score for manual review)            │  │
    │  │ baseline_project_score: 2 (min projects for full score)          │  │
    │  └──────────────────────────────────────────────────────────────────┘  │
    └────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
    ═══════════════════════════════════════════════════════════════════════════
    STEP 2B: LOOK UP JOB POSTING
    ═══════════════════════════════════════════════════════════════════════════

    ┌────────────────────────────────────────────────────────────────────────┐
    │  Query: SELECT * FROM job_postings WHERE title ILIKE '%position%'    │
    │                                                                        │
    │  Returns job posting with structured requirements:                    │
    │  ┌──────────────────────────────────────────────────────────────────┐  │
    │  │ job_postings table:                                               │  │
    │  │ ├── job_id: "python-dev-001"                                      │  │
    │  │ ├── title: "Senior Python Developer"                              │  │
    │  │ ├── description: "Build APIs and microservices..."               │  │
    │  │ ├── skills: ["Python", "Django", "Flask", "AWS", "Docker"]       │  │
    │  │ ├── required_education: ["Bachelor's in Computer Science"]        │  │
    │  │ ├── expected_projects: ["API Development", "Microservices"]      │  │
    │  │ └── min_years_experience: 5                                        │  │
    │  └──────────────────────────────────────────────────────────────────┘  │
    └────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
    ═══════════════════════════════════════════════════════════════════════════
    STEP 2C: CALCULATE HYBRID SCORE (60% Semantic + 40% Count-Based)
    ═══════════════════════════════════════════════════════════════════════════

    ┌────────────────────────────────────────────────────────────────────────┐
    │                                                                        │
    │  PART 1: SEMANTIC RELEVANCE SCORING (60% weight)                     │
    │  ───────────────────────────────────────────────────────               │
    │                                                                        │
    │  Uses BERT embeddings (all-MiniLM-L6-v2) to calculate semantic       │
    │  relevance between resume components and job requirements:            │
    │                                                                        │
    │  ┌─────────────────────────────────────────────────────────────────┐  │
    │  │ Function: calculate_component_scores()                          │  │
    │  │                                                                  │  │
    │  │ 1. Extract resume components from parsed_resume_json:           │  │
    │  │    - experience: [{"role": "...", "company": "...", "years": 5}]│  │
    │  │    - skills: {"hard_skills": [...], "soft_skills": [...]}        │  │
    │  │    - education: [{"school": "...", "course": "..."}]            │  │
    │  │    - projects: [{"name": "...", "details": "..."}]              │  │
    │  │                                                                  │  │
    │  │ 2. Build job requirement texts:                                  │  │
    │  │    - exp_req: "5+ years Python experience"                      │  │
    │  │    - skills_req: "Python Django Flask AWS Docker PostgreSQL"    │  │
    │  │    - edu_req: "Bachelor's Computer Science"                      │  │
    │  │    - proj_req: "API Development Microservices"                   │  │
    │  │                                                                  │  │
    │  │ 3. Calculate semantic similarity (BERT embeddings):             │  │
    │  │                                                                  │  │
    │  │    Experience:                                                   │  │
    │  │    BERT("7 years Python Developer at TechCorp")                  │  │
    │  │           vs                                                     │  │
    │  │    BERT("5+ years Python experience")                            │  │
    │  │           = 95% relevance                                         │  │
    │  │                                                                  │  │
    │  │    Skills:                                                       │  │
    │  │    BERT("Python Django Flask AWS Docker")                        │  │
    │  │           vs                                                     │  │
    │  │    BERT("Python Django AWS PostgreSQL Docker")                   │  │
    │  │           = 88% relevance                                         │  │
    │  │                                                                  │  │
    │  │    Education:                                                    │  │
    │  │    BERT("BS Computer Science MIT")                               │  │
    │  │           vs                                                     │  │
    │  │    BERT("Bachelor's Computer Science")                            │  │
    │  │           = 98% relevance                                         │  │
    │  │                                                                  │  │
    │  │    Projects:                                                     │  │
    │  │    BERT("E-commerce API Django REST")                            │  │
    │  │           vs                                                     │  │
    │  │    BERT("API Development Microservices")                          │  │
    │  │           = 85% relevance                                         │  │
    │  └─────────────────────────────────────────────────────────────────┘  │
    │                                                                        │
    │  ┌─────────────────────────────────────────────────────────────────┐  │
    │  │ STEP 2C.2: Apply Company-Adaptive Weights                        │  │
    │  │                                                                  │  │
    │  │ Function: calculate_weighted_score()                            │  │
    │  │                                                                  │  │
    │  │ Using default weights (40/30/20/10):                            │  │
    │  │                                                                  │  │
    │  │   semantic_score = (95 × 0.40) + (88 × 0.30) + (98 × 0.20)     │  │
    │  │                  + (85 × 0.10)                                  │  │
    │  │                  = 38 + 26.4 + 19.6 + 8.5                       │  │
    │  │                  = 92.5 / 100                                   │  │
    │  └─────────────────────────────────────────────────────────────────┘  │
    │                                                                        │
    │  ────────────────────────────────────────────────────────────────────  │
    │                                                                        │
    │  PART 2: COUNT-BASED SCORING (40% weight)                            │
    │  ─────────────────────────────────────────────────────────────────    │
    │                                                                        │
    │  ┌─────────────────────────────────────────────────────────────────┐  │
    │  │ Function: calculate_count_based_score()                        │  │
    │  │                                                                  │  │
    │  │ Calculates quantity-based scores (0-100 for each):             │  │
    │  │                                                                  │  │
    │  │ • Skills: (total_skills / 20) × 100                             │  │
    │  │   - 20 skills = 100 pts                                          │  │
    │  │   - 10 skills = 50 pts                                           │  │
    │  │                                                                  │  │
    │  │ • Experience: (num_experiences / 5) × 100                       │  │
    │  │   - 5 entries = 100 pts                                         │  │
    │  │   - 3 entries = 60 pts                                           │  │
    │  │                                                                  │  │
    │  │ • Education: (num_education / 3) × 100                          │  │
    │  │   - 3 entries = 100 pts                                          │  │
    │  │                                                                  │  │
    │  │ • Projects: (project_count / baseline) × 100                    │  │
    │  │   - 2+ projects = 100 pts                                        │  │
    │  │                                                                  │  │
    │  │ Then applies same company weights (40/30/20/10):                │  │
    │  │   count_score = weighted sum of all components                  │  │
    │  └─────────────────────────────────────────────────────────────────┘  │
    │                                                                        │
    │  ────────────────────────────────────────────────────────────────────  │
    │                                                                        │
    │  COMBINED SCORE CALCULATION:                                          │
    │  ┌─────────────────────────────────────────────────────────────────┐  │
    │  │                                                                  │  │
    │  │   combined_score = (semantic_score × 0.6) + (count_score × 0.4)│  │
    │  │                                                                  │  │
    │  │   Example:                                                       │  │
    │  │   combined_score = (92.5 × 0.6) + (75 × 0.4)                   │  │
    │  │                  = 55.5 + 30                                     │  │
    │  │                  = 85.5 / 100                                   │  │
    │  │                                                                  │  │
    │  └─────────────────────────────────────────────────────────────────┘  │
    └────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
    ═══════════════════════════════════════════════════════════════════════════
    STEP 2D: DETERMINE DECISION USING THRESHOLDS
    ═══════════════════════════════════════════════════════════════════════════

    ┌────────────────────────────────────────────────────────────────────────┐
    │  Compare combined_score to configurable thresholds:                   │
    │                                                                        │
    │  ┌──────────────────────────────────────────────────────────────────┐  │
    │  │                                                                   │  │
    │  │  if combined_score >= qualified_threshold (80):                 │  │
    │  │      decision = "passed"                                        │  │
    │  │      status = "passed_screening"                                 │  │
    │  │                                                                   │  │
    │  │  elif combined_score >= review_threshold (60):                  │  │
    │  │      decision = "needs_review"                                  │  │
    │  │      status = "needs_review"                                    │  │
    │  │                                                                   │  │
    │  │  else:                                                           │  │
    │  │      decision = "failed"                                        │  │
    │  │      status = "failed_screening"                                │  │
    │  │                                                                   │  │
    │  └──────────────────────────────────────────────────────────────────┘  │
    └────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
    ═══════════════════════════════════════════════════════════════════════════
    STEP 2E: SAVE RESULTS TO DATABASE
    ═══════════════════════════════════════════════════════════════════════════

    ┌────────────────────────────────────────────────────────────────────────┐
    │  Update applicants table:                                            │
    │  ┌──────────────────────────────────────────────────────────────────┐  │
    │  │ UPDATE applicants SET                                           │  │
    │  │   screening_score = 85.5,                                       │  │
    │  │   screening_fit_category = "Very Good Fit",                    │  │
    │  │   status = "passed_screening",                                  │  │
    │  │   access_token = "abc123...",        -- if passed               │  │
    │  │   access_expires_at = "2026-03-11T..." -- if passed           │  │
    │  │ WHERE id = applicant_id                                         │  │
    │  └──────────────────────────────────────────────────────────────────┘  │
    │                                                                        │
    │  Upsert resume_scores table:                                           │
    │  ┌──────────────────────────────────────────────────────────────────┐  │
    │  │ INSERT INTO resume_scores (or UPDATE if exists):                │  │
    │  │   applicant_id, job_id,                                        │  │
    │  │   experience_score = 95,    -- from semantic breakdown         │  │
    │  │   skills_score = 88,        -- from semantic breakdown         │  │
    │  │   education_score = 98,     -- from semantic breakdown         │  │
    │  │   project_score = 85,        -- from semantic breakdown        │  │
    │  │   final_score = 85.5,       -- combined score                  │  │
    │  │   match_explain = {                                               │  │
    │  │     "weights_used": {"experience": 40, "skills": 30, ...},     │  │
    │  │     "component_breakdown": {...},                                │  │
    │  │     "fit_category": "Very Good Fit"                             │  │
    │  │   }                                                              │  │
    │  └──────────────────────────────────────────────────────────────────┘  │
    └────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
    ═══════════════════════════════════════════════════════════════════════════
    STEP 2F: SEND NOTIFICATION EMAIL
    ═══════════════════════════════════════════════════════════════════════════

    ┌────────────────────────────────────────────────────────────────────────┐
    │                                                                        │
    │  DECISION = "passed" (Score >= 80):                                   │
    │  ┌──────────────────────────────────────────────────────────────────┐  │
    │  │ Email: send_pass_notification()                                  │  │
    │  │ Subject: "Your Application to [Job Title] - Next Steps"         │  │
    │  │ Body: Congratulations + Login Token + Assessment Link           │  │
    │  │ Token: 8-character alphanumeric, expires in 24 hours            │  │
    │  └──────────────────────────────────────────────────────────────────┘  │
    │                                                                        │
    │  DECISION = "needs_review" (Score 60-79):                             │
    │  ┌──────────────────────────────────────────────────────────────────┐  │
    │  │ Email: send_review_notification()                                │  │
    │  │ Subject: "Your Application to [Job Title] - Under Review"       │  │
    │  │ Body: Application received, under manual review                 │  │
    │  └──────────────────────────────────────────────────────────────────┘  │
    │                                                                        │
    │  DECISION = "failed" (Score < 60):                                    │
    │  ┌──────────────────────────────────────────────────────────────────┐  │
    │  │ Email: send_fail_notification()                                 │  │
    │  │ Subject: "Your Application to [Job Title] - Update"            │  │
    │  │ Body: Thank you for applying, not proceeding further           │  │
    │  └──────────────────────────────────────────────────────────────────┘  │
    │                                                                        │
    └────────────────────────────────────────────────────────────────────────┘
```

---

### Stage 3: Applicant Login & Dashboard

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        STAGE 3: APPLICANT ACCESS                                │
│                     (Login with Token & Dashboard)                              │
└─────────────────────────────────────────────────────────────────────────────────┘

    ┌─────────────────┐
    │  Applicant     │
    │  Receives      │
    │  Email         │
    └────────┬────────┘
             │
             ▼
    ┌────────────────────────────────────────────────────────────────────────────┐
    │  APPLICANT LOGIN (ApplicantLogin.tsx)                                      │
    │                                                                            │
    │  1. User enters:                                                          │
    │     ├── Email: "john@example.com"                                         │
    │     └── Access Token: "ABC123XY"                                           │
    │                                                                            │
    │  2. System validates:                                                      │
    │     ├── Query: SELECT * FROM applicants                                   │
    │     │         WHERE email = ? AND access_token = ?                        │
    │     ├── Check token not expired                                            │
    │     └── Check status in: passed_screening, video_in_progress,             │
    │                           video_completed, exam_in_progress,               │
    │                           exam_completed, assessments_done                 │
    │                                                                            │
    │  3. On success:                                                            │
    │     ├── Set session in AuthContext                                         │
    │     └── Redirect to: Assessment Dashboard                                 │
    │                                                                            │
    │  4. On failure:                                                           │
    │     ├── Show error: "Invalid token" or "Token expired"                    │
    │     └── Allow retry                                                        │
    └────────────────────────────────────────────────────────────────────────────┘
             │
             ▼
    ┌────────────────────────────────────────────────────────────────────────────┐
    │  ASSESSMENT DASHBOARD (AssessmentDashboard.tsx)                           │
    │                                                                            │
    │  Shows applicant progress:                                                 │
    │  ┌──────────────────────────────────────────────────────────────────────┐   │
    │  │                                                                     │   │
    │  │   □ Video Assessment     (Not Started / In Progress / Completed)  │   │
    │  │                                                                     │   │
    │  │   □ Personality Test     (Not Started / In Progress / Completed)  │   │
    │  │                                                                     │   │
    │  │   Score Summary:                                                  │   │
    │  │   ├── Screening Score: 85.5 (from resume screening)              │   │
    │  │   ├── Video Score: -- (pending)                                   │   │
    │  │   └── Personality Score: -- (pending)                             │   │
    │  │                                                                     │   │
    │  └──────────────────────────────────────────────────────────────────────┘   │
    └────────────────────────────────────────────────────────────────────────────┘
```

---

### Stage 4: Video Assessment

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        STAGE 4: VIDEO ASSESSMENT                                 │
│                     (Record Introduction Video)                                 │
└─────────────────────────────────────────────────────────────────────────────────┘

    ┌────────────────────────────────────────────────────────────────────────────┐
    │  VIDEO ASSESSMENT (VideoAssessment.tsx)                                   │
    │                                                                            │
    │  1. User clicks "Start Video Assessment"                                  │
    │                                                                            │
    │  2. Status updated: "video_in_progress"                                   │
    │                                                                            │
    │  3. User records video (browser-based recording):                         │
    │     ├── Introduction questions                                             │
    │     ├── Why do you want to join?                                           │
    │     ├── Relevant experience                                                │
    │     └── Key strengths                                                      │
    │                                                                            │
    │  4. Video uploaded to Supabase Storage:                                   │
    │     ├── Bucket: "applicant-videos"                                        │
    │     ├── Path: {applicant_id}/assessment_{timestamp}.webm                  │
    │     └── Status: "completed"                                                │
    │                                                                            │
    │  5. Database update:                                                      │
    │     UPDATE video_assessments SET                                          │
    │       status = 'completed',                                              │
    │       video_url = 'https://...',                                          │
    │       completed_at = NOW()                                                │
    │     WHERE applicant_id = ?                                                │
    │                                                                            │
    │  6. Trigger transcription (async):                                        │
    │     ├── Call transcription_service.py                                     │
    │     ├── Uses Whisper AI model                                             │
    │     └── Stores transcription in video_assessments.transcription          │
    │                                                                            │
    │  7. Update applicant status:                                              │
    │     UPDATE applicants SET status = 'video_completed'                     │
    │     WHERE id = ?                                                           │
    │                                                                            │
    └────────────────────────────────────────────────────────────────────────────┘
```

---

### Stage 5: Personality Test

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        STAGE 5: PERSONALITY TEST                                 │
│                     (Multiple Choice Assessment)                                │
└─────────────────────────────────────────────────────────────────────────────────┘

    ┌────────────────────────────────────────────────────────────────────────────┐
    │  PERSONALITY TEST (PersonalityTest.tsx)                                   │
    │                                                                            │
    │  1. User clicks "Start Personality Test"                                   │
    │                                                                            │
    │  2. Status updated: "exam_in_progress"                                    │
    │                                                                            │
    │  3. User completes questions:                                             │
    │     ├── Work style preferences                                             │
    │     ├── Problem-solving approaches                                         │
    │     ├── Communication styles                                               │
    │     └── Team collaboration preferences                                     │
    │                                                                            │
    │  4. Calculate profile fit score:                                           │
    │     └── Based on answer patterns vs ideal profile                          │
    │                                                                            │
    │  5. Database insert:                                                       │
    │     INSERT INTO personality_tests (                                        │
    │       applicant_id,                                                        │
    │       answers: [{question_id: 1, answer: 4}, ...],                        │
    │       score: 82,                                                           │
    │       status: 'completed',                                                │
    │       completed_at: NOW()                                                 │
    │     )                                                                      │
    │                                                                            │
    │  6. Update applicant status:                                              │
    │     UPDATE applicants SET status = 'exam_completed'                       │
    │     WHERE id = ?                                                           │
    │                                                                            │
    │  7. If BOTH video and exam completed:                                      │
    │     UPDATE applicants SET status = 'assessments_done'                     │
    │     WHERE id = ?                                                           │
    │                                                                            │
    └────────────────────────────────────────────────────────────────────────────┘
```

---

## PART 2: ADMIN FLOW (Complete Detailed Process)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           ADMIN DASHBOARD FLOW                                  │
└─────────────────────────────────────────────────────────────────────────────────┘

    ┌────────────────────────────────────────────────────────────────────────────┐
    │  ADMIN LOGIN (AdminDashboard.tsx)                                          │
    │                                                                            │
    │  1. Navigate to /admin                                                    │
    │                                                                            │
    │  2. Authenticate with admin credentials                                    │
    │                                                                            │
    │  3. View Dashboard Landing:                                               │
    │     ├── Total Applicants: XX                                               │
    │     ├── Passed Screening: XX                                               │
    │     ├── Completed Assessments: XX                                         │
    │     └── Shortlisted: XX                                                    │
    │                                                                            │
    └────────────────────────────────────────────────────────────────────────────┘
             │
             ▼
    ┌────────────────────────────────────────────────────────────────────────────┐
    │  MENU NAVIGATION:                                                          │
    │                                                                            │
    │  ┌──────────────────────────────────────────────────────────────────────┐  │
    │  │                                                                   │  │
    │  │  [Dashboard]    → DashboardLanding.tsx                           │  │
    │  │  [Applicants]   → ApplicantsList.tsx                              │  │
    │  │  [Shortlisted]  → ShortlistedCandidates.tsx                       │  │
    │  │  [Job Mgmt]     → AdminJobManagement.tsx                          │  │
    │  │  [Scoring]      → AdminScoringSettings.tsx                       │  │
    │  │  [Assessments]  → AssessmentDashboard.tsx                         │  │
    │  │  [Reports]      → ReportsDashboard.tsx                            │  │
    │  │  [Settings]     → AdminSettings.tsx                               │  │
    │  │                                                                   │  │
    │  └──────────────────────────────────────────────────────────────────────┘  │
    └────────────────────────────────────────────────────────────────────────────┘
```

### Admin: Scoring Settings Configuration

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                     STAGE A: SCORING SETTINGS CONFIGURATION                      │
│                     (AdminScoringSettings.tsx)                                   │
└─────────────────────────────────────────────────────────────────────────────────┘

    ┌────────────────────────────────────────────────────────────────────────────┐
    │  ADMIN CONFIGURE WEIGHTS (AdminScoringSettings.tsx)                       │
    │                                                                            │
    │  1. Navigate to "Scoring Settings" in sidebar                            │
    │                                                                            │
    │  2. Configure Company-Adaptive Weights:                                   │
    │     ┌──────────────────────────────────────────────────────────────────┐  │
    │   │                                                                   │  │
    │  │  Weight Configuration (must sum to 100%):                         │  │
    │  │  ─────────────────────────────────────────                        │  │
    │  │                                                                   │  │
    │  │  □ Experience Weight:    [40] %                                  │  │
    │  │  □ Skills Weight:        [30] %                                  │  │
    │  │  □ Education Weight:     [20] %                                  │  │
    │  │  □ Projects Weight:      [10] %                                  │  │
    │  │                                                                   │  │
    │  │  Total: 100% ✓ (Valid)                                           │  │
    │  │                                                                   │  │
    │  │  ─────────────────────────────────────────                        │  │
    │  │                                                                   │  │
    │  │  Threshold Configuration:                                        │  │
    │  │  ─────────────────────────                                        │  │
    │  │                                                                   │  │
    │  │  □ Qualified Threshold:  [80]  (min score to auto-pass)          │  │
    │  │  □ Review Threshold:     [60]  (min score for manual review)    │  │
    │  │                                                                   │  │
    │  │  □ Baseline Project Score:  [2]  (for count-based scoring)       │  │
    │  │                                                                   │  │
    │  │  [Save Settings]                                                  │  │
    │  │                                                                   │  │
    │  └──────────────────────────────────────────────────────────────────┘  │
    │                                                                            │
    │  3. Validation:                                                            │
    │     ├── Weights must sum to 100%                                          │
    │     ├── Qualified threshold must be > Review threshold                    │
    │     └── All values must be positive                                       │
    │                                                                            │
    │  4. Save to Database:                                                    │
    │     UPDATE scoring_settings SET                                          │
    │       experience_weight = 40,                                            │
    │       skills_weight = 30,                                                │
    │       education_weight = 20,                                             │
    │       projects_weight = 10,                                              │
    │       qualified_threshold = 80,                                          │
    │       review_threshold = 60,                                             │
    │       baseline_project_score = 2,                                        │
    │       updated_at = NOW()                                                  │
    │     WHERE settings_id = 'default'                                         │
    │                                                                            │
    │  5. Effect:                                                               │
    │     └── Applied immediately to NEW applicants during screening           │
    │                                                                            │
    └────────────────────────────────────────────────────────────────────────────┘
```

### Admin: Applicants Management

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                     STAGE B: APPLICANTS MANAGEMENT                               │
│                     (ApplicantsList.tsx)                                         │
└─────────────────────────────────────────────────────────────────────────────────┘

    ┌────────────────────────────────────────────────────────────────────────────┐
    │  VIEW & FILTER APPLICANTS                                                 │
    │                                                                            │
    │  1. Load all applicants from database:                                    │
    │     SELECT * FROM applicants ORDER BY created_at DESC                     │
    │                                                                            │
    │  2. Fetch related data (for each applicant):                              │
    │     ├── Resume: SELECT * FROM resumes WHERE applicant_id = ?              │
    │     ├── Video: SELECT * FROM video_assessments WHERE applicant_id = ?    │
    │     └── Test: SELECT * FROM personality_tests WHERE applicant_id = ?      │
    │                                                                            │
    │  3. Filtering Options:                                                     │
    │     ├── All Applicants                                                    │
    │     ├── Passed Screening (passed_screening)                               │
    │     ├── Needs Review (needs_review)                                       │
    │     ├── Assessments Done (assessments_done)                              │
    │     └── By Job Position                                                   │
    │                                                                            │
    │  4. Sorting Options:                                                       │
    │     ├── Date Applied (default: newest first)                             │
    │     ├── Overall Score (resume + video + personality)                     │
    │     ├── Resume Score                                                      │
    │     ├── Video Score                                                       │
    │     └── Profile Fit Score                                                 │
    │                                                                            │
    └────────────────────────────────────────────────────────────────────────────┘
             │
             ▼
    ┌────────────────────────────────────────────────────────────────────────────┐
    │  SCORE CALCULATION IN ADMIN VIEW                                           │
    │                                                                            │
    │  ┌──────────────────────────────────────────────────────────────────────┐ │
    │  │ Function: calculateResumeScore() - ApplicantsList.tsx               │ │
    │  │                                                                     │ │
    │  │ 1. Prefer backend screening_score (combined semantic + count):      │ │
    │  │    → Uses 60% semantic + 40% count-based                            │ │
    │  │                                                                     │ │
    │  │ 2. Fallback to frontend count-based calculation:                    │ │
    │  │    → skills: (total_skills / 20) × 100                            │ │
    │  │    → experience: (num_exp / 5) × 100                               │ │
    │  │    → education: (num_edu / 3) × 100                                │ │
    │  │    → projects: (num_proj / baseline) × 100                        │ │
    │  │    → Apply weights from settings                                    │ │
    │  │                                                                     │ │
    │  │ 3. Video score (mock):                                              │ │
    │  │    → completed = 80-95, submitted = 60-80                          │ │
    │  │                                                                     │ │
    │  │ 4. Profile fit (from personality test):                           │ │
    │  │    → (avg_answer / 5) × 100                                       │ │
    │  │                                                                     │ │
    │  │ 5. Overall score:                                                  │ │
    │  │    → resume × 0.4 + video × 0.35 + profile × 0.25                  │ │
    │  └──────────────────────────────────────────────────────────────────────┘ │
    └────────────────────────────────────────────────────────────────────────────┘
             │
             ▼
    ┌────────────────────────────────────────────────────────────────────────────┐
    │  REVIEW APPLICANT DETAILS                                                  │
    │                                                                            │
    │  Click on applicant → Opens ApplicantDetailModal.tsx                      │
    │                                                                            │
    │  Shows:                                                                    │
    │  ├── Basic Info: Name, Email, Position, Applied Date                      │
    │  ├── Screening Score: Final score + breakdown                             │
    │  │   ├── Experience: 95% relevance                                     │
    │  │   ├── Skills: 88% relevance                                         │
    │  │   ├── Education: 98% relevance                                      │
    │  │   └── Projects: 85% relevance                                       │
    │  ├── Resume Content: Parsed data display                                  │
    │  ├── Video Assessment: Recording + transcription                          │
    │  ├── Personality Test: Answers + score                                   │
    │  └── Actions:                                                             │
    │       ├── [Shortlist Candidate]                                          │
    │       ├── [Reject Candidate]                                              │
    │       ├── [Request Video Re-record]                                       │
    │       └── [Send Message]                                                  │
    │                                                                            │
    └────────────────────────────────────────────────────────────────────────────┘
```

### Admin: Shortlisting

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                     STAGE C: SHORTLISTING & FINAL DECISION                      │
│                     (ShortlistedCandidates.tsx)                                 │
└─────────────────────────────────────────────────────────────────────────────────┘

    ┌────────────────────────────────────────────────────────────────────────────┐
    │  SHORTLIST CANDIDATE                                                       │
    │                                                                            │
    │  1. Admin clicks "Shortlist" on applicant detail                           │
    │                                                                            │
    │  2. Update status:                                                         │
    │     UPDATE applicants SET status = 'shortlisted'                          │
    │     WHERE id = ?                                                           │
    │                                                                            │
    │  3. Option: Send notification email to candidate                          │
    │                                                                            │
    └────────────────────────────────────────────────────────────────────────────┘
             │
             ▼
    ┌────────────────────────────────────────────────────────────────────────────┐
    │  REJECT CANDIDATE                                                          │
    │                                                                            │
    │  1. Admin clicks "Reject" on applicant detail                             │
    │                                                                            │
    │  2. Update status:                                                         │
    │     UPDATE applicants SET status = 'rejected'                            │
    │     WHERE id = ?                                                           │
    │                                                                            │
    │  3. Option: Send rejection email to candidate                             │
    │                                                                            │
    └────────────────────────────────────────────────────────────────────────────┘
```

---

## PART 3: HYBRID SCORING DEEP DIVE

### Company-Adaptive Weight Presets

| Company Type | Experience | Skills | Education | Projects | Best For |
|--------------|------------|--------|-----------|----------|----------|
| **Default** | 40% | 30% | 20% | 10% | General hiring |
| **Startup (Skills-Heavy)** | 20% | 50% | 10% | 20% | Fast-paced, skill-focused |
| **Enterprise (Experience-Heavy)** | 50% | 30% | 10% | 10% | Mature companies |
| **Research (Education-Heavy)** | 20% | 20% | 40% | 20% | Academic/research roles |
| **Agency (Project-Heavy)** | 20% | 30% | 10% | 40% | Project-based work |

### How the Hybrid Scoring Works

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                    HYBRID SCORING ALGORITHM                                    │
│                 (60% Semantic + 40% Count-Based)                               │
└─────────────────────────────────────────────────────────────────────────────────┘

    STEP 1: Get parsed resume data
    ┌────────────────────────────────────────────────────────────────────────┐
    │  {                                                                       │
    │    "experience": [{"role": "Python Dev", "company": "Tech",           │
    │                     "years": "7", "summary": "Built APIs..."}],         │
    │    "skills": {"hard_skills": ["Python", "Django", "AWS"],              │
    │               "soft_skills": ["Leadership"]},                          │
    │    "education": [{"school": "MIT", "course": "CS", "degree": "BS"}],   │
    │    "projects": [{"name": "E-commerce API", "details": "..."}]         │
    │  }                                                                       │
    └────────────────────────────────────────────────────────────────────────┘
              │
              ▼
    STEP 2: Calculate Semantic Scores (BERT embeddings)
    ┌────────────────────────────────────────────────────────────────────────┐
    │                                                                        │
    │  For each component, use sentence-transformers to calculate         │
    │  semantic similarity between resume and job requirements:             │
    │                                                                        │
    │  ┌──────────────────────────────────────────────────────────────────┐  │
    │  │                                                                  │  │
    │  │  resume_text_embedding = model.encode(resume_component)         │  │
    │  │  job_text_embedding = model.encode(job_requirement)             │  │
    │  │  similarity = cosine_similarity(resume, job)                  │  │
    │  │                                                                  │  │
    │  │  Returns: 0.0 to 1.0 (converted to 0-100 percentage)           │  │
    │  │                                                                  │  │
    │  └──────────────────────────────────────────────────────────────────┘  │
    │                                                                        │
    │  Result: {                                                             │
    │    experience_relevance: 95.0,                                        │
    │    skills_relevance: 88.0,                                            │
    │    education_relevance: 98.0,                                         │
    │    projects_relevance: 85.0                                           │
    │  }                                                                     │
    └────────────────────────────────────────────────────────────────────────┘
              │
              ▼
    STEP 3: Apply Company Weights to Semantic Scores
    ┌────────────────────────────────────────────────────────────────────────┐
    │                                                                        │
    │  Using default weights (40/30/20/10):                                 │
    │                                                                        │
    │  semantic_score = (95 × 0.40) + (88 × 0.30) + (98 × 0.20) +          │
    │                    (85 × 0.10)                                          │
    │                  = 38 + 26.4 + 19.6 + 8.5                               │
    │                  = 92.5                                                 │
    │                                                                        │
    └────────────────────────────────────────────────────────────────────────┘
              │
              ▼
    STEP 4: Calculate Count-Based Scores
    ┌────────────────────────────────────────────────────────────────────────┐
    │                                                                        │
    │  ┌──────────────────────────────────────────────────────────────────┐  │
    │  │                                                                  │  │
    │  │  Skills: 3 hard + 1 soft = 4 skills                             │  │
    │  │  → (4 / 20) × 100 = 20                                           │  │
    │  │                                                                  │  │
    │  │  Experience: 2 entries                                          │  │
    │  │  → (2 / 5) × 100 = 40                                            │  │
    │  │                                                                  │  │
    │  │  Education: 1 entry                                               │  │
    │  │  → (1 / 3) × 100 = 33.3                                         │  │
    │  │                                                                  │  │
    │  │  Projects: 1 entry                                               │  │
    │  │  → (1 / 2) × 50 = 25  (below baseline = half credit)          │  │
    │  │                                                                  │  │
    │  └──────────────────────────────────────────────────────────────────┘  │
    │                                                                        │
    │  Apply weights:                                                         │
    │  count_score = (20 × 0.40) + (40 × 0.30) + (33.3 × 0.20) +            │
    │                (25 × 0.10)                                              │
    │              = 8 + 12 + 6.66 + 2.5                                     │
    │              = 29.16                                                    │
    │                                                                        │
    └────────────────────────────────────────────────────────────────────────┘
              │
              ▼
    STEP 5: Combine Both Scores
    ┌────────────────────────────────────────────────────────────────────────┐
    │                                                                        │
    │  combined_score = (semantic_score × 0.6) + (count_score × 0.4)       │
    │                  = (92.5 × 0.6) + (29.16 × 0.4)                       │
    │                  = 55.5 + 11.66                                        │
    │                  = 67.16 / 100                                         │
    │                                                                        │
    └────────────────────────────────────────────────────────────────────────┘
              │
              ▼
    STEP 6: Apply Thresholds
    ┌────────────────────────────────────────────────────────────────────────┐
    │                                                                        │
    │  Default thresholds:                                                   │
    │  • qualified_threshold: 80                                            │
    │  • review_threshold: 60                                                │
    │                                                                        │
    │  Score: 67.16                                                          │
    │                                                                        │
    │  67.16 >= 80? NO                                                       │
    │  67.16 >= 60? YES                                                      │
    │                                                                        │
    │  → DECISION: "needs_review"                                           │
    │  → STATUS: "needs_review"                                              │
    │  → Email: Review notification sent                                    │
    │                                                                        │
    └────────────────────────────────────────────────────────────────────────┘
```

---

## Database Status Flow

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         APPLICANT STATUS FLOW                                    │
└─────────────────────────────────────────────────────────────────────────────────┘

    ┌──────────────────────┐
    │  pending_screening   │ ← Initial state after email collection
    └──────────┬───────────┘
               │
               ▼ Automatic Screening
    ┌────────────────────────────────────────────────────────────────────────┐
    │                                                                        │
    │   Score >= 80 ──→  ┌──────────────────┐                                │
    │                    │ passed_screening │ ──→ Email + Token sent       │
    │                    └────────┬─────────┘                                │
    │                             │                                           │
    │   Score 60-79 ──→ ┌─────────┴────────┐                               │
    │                    │   needs_review    │ ──→ Review notification     │
    │                    └────────┬───────────┘                               │
    │                             │                                           │
    │   Score < 60 ──→  ┌─────────┴────────┐                               │
    │                    │ failed_screening  │ ──→ Rejection email          │
    │                    └───────────────────┘                               │
    │                                                                        │
    └────────────────────────────────────────────────────────────────────────┘
               │
               │ (if passed_screening)
               ▼
    ┌──────────────────────┐
    │   passed_screening    │ ← Token valid, awaiting login
    └──────────┬───────────┘
               │ Applicant logs in
               ▼
    ┌──────────────────────┐
    │  video_in_progress   │ ← Started video assessment
    └──────────┬───────────┘
               │ Video completed
               ▼
    ┌──────────────────────┐
    │  video_completed     │ ← Video recorded, transcription triggered
    └──────────┬───────────┘
               │
               ├──────────────────┐
               │                  │
               ▼                  ▼
    ┌──────────────────┐  ┌──────────────────┐
    │ exam_in_progress  │  │ video_completed  │
    │ (Personality Test)│  │                  │
    └────────┬─────────┘  └──────────────────┘
             │                    │
             │ Test completed      │ Transcription done
             ▼                    ▼
    ┌──────────────────┐  ┌──────────────────┐
    │ exam_completed   │  │ video_completed  │
    └────────┬─────────┘  │ (transcribed)    │
             │             └────────┬─────────┘
             │                      │
             └──────────┬───────────┘
                        │
                        ▼
             ┌──────────────────────┐
             │   assessments_done   │ ← Both assessments completed
             └──────────┬───────────┘
                        │
                        ▼ Admin reviews
             ┌──────────────────────┐
             │    admin_review      │ ← Ready for admin decision
             └──────────┬───────────┘
                        │
          ┌─────────────┼─────────────┐
          │             │             │
          ▼             ▼             ▼
    ┌───────────┐ ┌───────────┐ ┌───────────┐
    │shortlisted│ │ rejected  │ │ waitlist  │
    └───────────┘ └───────────┘ └───────────┘
```

---

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/calculate-fit` | POST | Legacy job fit score (BERT) |
| `/api/calculate-hybrid-fit` | POST | Hybrid scoring with customizable weights |
| `/api/get-component-scores` | POST | Get component relevance scores |
| `/api/calculate-similarity` | POST | Semantic similarity between texts |
| `/api/calculate-combined-score` | POST | Combined 60% semantic + 40% count |
| `/api/trigger-transcription` | POST | Trigger video transcription |
| `/api/health` | GET | Health check |

---

## Database Schema

### scoring_settings Table

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| settings_id | VARCHAR | 'default' | Settings identifier |
| experience_weight | NUMERIC | 40 | Weight for experience (%) |
| skills_weight | NUMERIC | 30 | Weight for skills (%) |
| education_weight | NUMERIC | 20 | Weight for education (%) |
| projects_weight | NUMERIC | 10 | Weight for projects (%) |
| qualified_threshold | NUMERIC | 80 | Min score to pass (%) |
| review_threshold | NUMERIC | 60 | Min score for review (%) |
| baseline_project_score | NUMERIC | 2 | Baseline for projects |

### resume_scores Table

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| applicant_id | UUID | Foreign key to applicants |
| job_id | UUID | Foreign key to job_postings |
| experience_score | NUMERIC | Semantic relevance (0-100) |
| skills_score | NUMERIC | Semantic relevance (0-100) |
| education_score | NUMERIC | Semantic relevance (0-100) |
| project_score | NUMERIC | Semantic relevance (0-100) |
| final_score | NUMERIC | Combined score (0-100) |
| match_explain | JSONB | Breakdown with weights used |

### applicants Table

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| name | VARCHAR | Applicant full name |
| email | VARCHAR | Applicant email |
| position | VARCHAR | Applied position |
| status | VARCHAR | Workflow status |
| screening_score | NUMERIC | Final screening score |
| screening_fit_category | VARCHAR | Fit category |
| access_token | VARCHAR | Login token |
| access_expires_at | TIMESTAMP | Token expiration |

---

## Files Reference

| File | Purpose | Status |
|------|---------|--------|
| `resume_collector.py` | Email collection + screening trigger | ✅ Working |
| `resume_parser.py` | Resume PDF parsing | ✅ Working |
| `job_alignment.py` | Hybrid semantic scoring | ✅ Implemented |
| `screening_service.py` | Orchestration + weight loading | ✅ Implemented |
| `email_service.py` | Email notifications | ✅ Working |
| `scoring_api.py` | REST API endpoints | ✅ Implemented |
| `transcription_service.py` | Video transcription | ✅ Working |
| `AdminScoringSettings.tsx` | Weight/threshold configuration | ✅ Working |
| `ApplicantsList.tsx` | View applicants | ✅ Working |
| `AdminDashboard.tsx` | Admin panel | ✅ Working |
| `VideoAssessment.tsx` | Video recording | ✅ Working |
| `PersonalityTest.tsx` | Personality assessment | ✅ Working |

---

*Last Updated: 2026-03-10*
*See HYBRID_SCORING_GUIDE.md for detailed technical implementation.*
