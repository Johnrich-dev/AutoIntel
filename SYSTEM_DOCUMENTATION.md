# AutoIntel Recruitment System - Complete Documentation

> **Document Status:** This is the compiled and updated documentation replacing all guide .md files.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Applicant Flow](#2-applicant-flow)
3. [Admin Flow](#3-admin-flow)
4. [Features Summary](#4-features-summary)
5. [Incomplete/Not-Connected Features](#5-incomplete-not-connected-features)
6. [Technical Architecture](#6-technical-architecture)

---

## 1. System Overview

The AutoIntel Recruitment System is an intelligent recruitment automation platform that uses AI-powered resume screening, job matching, and applicant assessment.

### Technology Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Frontend** | React + TypeScript + Tailwind | Admin dashboards, applicant portals |
| **Backend** | Python 3.x | Core services, NLP processing |
| **Database** | Supabase (PostgreSQL) | Data storage, RLS policies |
| **AI/ML** | BERT, Whisper, GPT | Resume parsing, transcription, scoring |
| **Embedding** | Sentence-Transformers | Semantic similarity matching |

### System Status: ✅ OPERATIONAL

The system uses **unified hybrid scoring** with company-adaptable weights loaded from the database.

---

## 2. Applicant Flow

### Complete Process Flow

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        STAGE 1: APPLICATION SUBMISSION                          │
└─────────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
              ┌─────────────────────────────────────────────────────────┐
              │  1. Applicant sends email with resume attached          │
              │     Subject: "Applicant - [Job Title]"                 │
              │  2. Resume Collector (resume_collector.py) extracts:    │
              │     - Name, email, phone                                │
              │     - Job title from subject                            │
              │     - Resume attachment (PDF/DOCX)                     │
              │  3. Create applicant record in database                  │
              └─────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        STAGE 2: RESUME PARSING                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
              ┌─────────────────────────────────────────────────────────┐
              │  1. Resume Parser (resume_parser.py) processes:        │
              │     - PDF/DOCX text extraction                          │
              │     - GPT text cleaning & normalization                 │
              │     - Section detection (Experience, Education, etc.)  │
              │     - BERT NER entity extraction                        │
              │  2. Store structured JSON in parsed_resume_json          │
              └─────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        STAGE 3: AUTOMATIC SCREENING                            │
└─────────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
              ┌─────────────────────────────────────────────────────────┐
              │  Screening Service (screening_service.py):              │
              │                                                         │
              │  1. Load scoring settings from database                │
              │     - experience_weight: 28% (configurable)            │
              │     - skills_weight: 30% (configurable)                 │
              │     - education_weight: 18% (configurable)              │
              │     - projects_weight: 14% (configurable)              │
              │     - traincert_weight: 6% (configurable)              │
              │     - achievements_weight: 4% (configurable)           │
              │     - qualified_threshold: 78 (configurable)           │
              │     - review_threshold: 65 (configurable)               │
              │                                                         │
              │  2. Calculate 6-category hybrid score:                  │
              │     FINAL = (Requirement Match × 0.6) + (Count × 0.4)  │
              │                                                         │
              │  3. Determine decision:                                 │
              │     - score >= 78 → passed_screening                   │
              │     - score >= 65 → needs_review                       │
              │     - score < 65 → failed_screening                    │
              └─────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        STAGE 4: NOTIFICATION                                    │
└─────────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
              ┌─────────────────────────────────────────────────────────┐
              │  Email Service (email_service.py):                      │
              │                                                         │
              │  • PASSED: Access token + login link                   │
              │  • NEEDS REVIEW: Pending review message                │
              │  • FAILED: Professional regret                         │
              │                                                         │
              │  All emails include score breakdown:                   │
              │  - Requirement Match Score (60%)                       │
              │  - Count Score (40%)                                   │
              │  - Category breakdown (Experience, Skills, etc.)        │
              └─────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        STAGE 5: APPLICANT LOGIN & ASSESSMENTS                   │
└─────────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
    ┌─────────────────────┐    ┌─────────────────────┐    ┌─────────────────────┐
    │   LOGIN (Token)     │───▶│  ASSESSMENT DASH   │───▶│ VIDEO ASSESSMENT    │
    │  ApplicantLogin.tsx │    │ AssessmentDashboard │    │ VideoAssessment.tsx│
    └─────────────────────┘    └─────────────────────┘    └─────────────────────┘
             │                         │                          │
             │                         │                          │
             ▼                         ▼                          ▼
    ┌─────────────────────┐    ┌─────────────────────┐    ┌─────────────────────┐
    │ Rules acceptance    │    │ Profile photo      │    │ 2-5 min video       │
    │ RulesAndTerms.tsx   │    │ upload required    │    │ upload to storage   │
    └─────────────────────┘    └─────────────────────┘    └─────────────────────┘
                                                                  │
                                                                  ▼
                                                ┌─────────────────────────────┐
                                                │  Transcription (Whisper AI) │
                                                │  triggered automatically    │
                                                └─────────────────────────────┘

    ┌─────────────────────┐    ┌─────────────────────┐
    │ WORK STYLE ASSESS   │───▶│     RESULTS         │
    │ PersonalityTest.tsx│    │    STORED           │
    └─────────────────────┘    └─────────────────────┘
             │
             ▼
    ┌─────────────────────────────┐
    │  20 Likert questions        │
    │  + 1 essay question         │
    │  Semantic scoring via API   │
    └─────────────────────────────┘
```

### Applicant Features

| Feature | Component | Status | Notes |
|---------|-----------|--------|-------|
| Email application | resume_collector.py | ✅ Working | Via Gmail IMAP |
| Resume parsing | resume_parser.py | ✅ Working | GPT + BERT NER |
| Screening | screening_service.py | ✅ Working | Hybrid scoring |
| Email notifications | email_service.py | ✅ Working | Score breakdown included |
| Token-based login | ApplicantLogin.tsx | ✅ Working | Access token validation |
| Rules acceptance | RulesAndTerms.tsx | ✅ Working | LocalStorage + DB |
| Profile photo upload | AssessmentDashboard.tsx | ✅ Working | Required before assessments |
| Video assessment | VideoAssessment.tsx | ✅ Working | Record or upload |
| Video transcription | transcription_service.py | ✅ Working | Whisper AI |
| Work style test | PersonalityTest.tsx | ✅ Working | 20 questions + essay |
| Scoring API | work_style_scorer.py | ✅ Working | Semantic scoring |

---

## 3. Admin Flow

### Complete Process Flow

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           ADMIN DASHBOARD                                       │
│                        AdminDashboard.tsx                                       │
└─────────────────────────────────────────────────────────────────────────────────┘
                                     │
         ┌───────────────────────────┼───────────────────────────┐
         │                           │                           │
         ▼                           ▼                           ▼
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│   DASHBOARD     │      │    JOB           │      │  RECRUITMENT    │
│  DashboardLanding│      │  MANAGEMENT     │      │    PIPELINE     │
│   - Stats       │      │AdminJobManagement│      │                 │
│   - Quick view  │      │  - Create jobs   │      │  - Applications │
└─────────────────┘      │  - Edit jobs     │      │  - Screening    │
                         │  - Delete jobs   │      │  - Needs Review │
                         └─────────────────┘      │  - Shortlisted   │
                                                   │  - Interview    │
                                                   │  - Final Decision│
                                                   └─────────────────┘
                                                         │
                                                         ▼
                                              ┌─────────────────────┐
                                              │   APPLICANT DETAIL  │
                                              │ApplicantDetailModal│
                                              │   - Resume view     │
                                              │   - Video review   │
                                              │   - Test results   │
                                              │   - Actions        │
                                              └─────────────────────┘
```

### Navigation Menu Structure

```
MAIN
├── Dashboard

JOB MANAGEMENT
├── Job Management

RECRUITMENT PIPELINE
├── Applications
├── Screening Results
├── Needs Review
├── Shortlisted
├── Interview Scheduling
├── Final Decisions

ANALYTICS
├── Analytics & Reports
├── Scoring Configuration

SYSTEM
└── System Settings
```

### Admin Features

| Feature | Component | Status | Notes |
|---------|-----------|--------|-------|
| Dashboard overview | DashboardLanding.tsx | ✅ Working | Stats, recent applicants |
| Job management | AdminJobManagement.tsx | ✅ Working | CRUD for job postings |
| Applications list | ApplicantsList.tsx | ✅ Working | Filterable, sortable |
| Screening results | ScreeningResults.tsx | ✅ Working | Shows scores |
| Needs review | NeedsReview.tsx | ✅ Working | Manual review queue |
| Shortlisted | ShortlistedCandidates.tsx | ✅ Working | Candidates for interview |
| Interview scheduling | InterviewScheduling.tsx | ⚠️ Partial | Uses mock data |
| Reports/Analytics | ReportsDashboard.tsx | ⚠️ Partial | May use mock data |
| Scoring config | AdminScoringSettings.tsx | ✅ Working | Configurable weights |
| System settings | AdminSettings.tsx | ✅ Working | Theme, etc. |
| Video review | VideoAssessmentTab.tsx | ✅ Working | View recordings |
| Work style review | WorkProfilingTab.tsx | ✅ Working | View test results |

---

## 4. Features Summary

### Scoring System

The system uses **unified hybrid scoring** applicable to all applicants:

```
FINAL SCORE = (Requirement Match Score × 0.6) + (Count Score × 0.4)
```

**6 Categories with Default Weights:**

| Category | Weight | Baseline |
|----------|--------|----------|
| Experience | 28% | 2 |
| Skills | 30% | 10 |
| Education | 18% | 2 |
| Projects | 14% | 2 |
| Training/Cert | 6% | 2 |
| Achievements | 4% | 1 |

**Thresholds:**
- Qualified: 78
- Review: 65

### Work Style Assessment

- **20 Likert-scale questions** covering 15 dimensions
- **1 essay question** evaluated with GPT
- **Semantic scoring** using embeddings
- **Role-family detection** from job title

### Video Assessment

- Browser-based recording (2-5 minutes)
- Upload alternative option
- Automatic transcription via Whisper AI
- GPT-based scoring on 4 dimensions

---

## 5. Incomplete/Not-Connected Features

### Features Using Mock Data Instead of Real Database

| Feature | Component | Issue |
|---------|-----------|-------|
| **Interview Scheduling** | [`InterviewScheduling.tsx`](src/components/InterviewScheduling.tsx:88) | Uses `mockInterviews` array instead of database. The actual interview data is not being stored/retrieved from the database. |
| **Reports Dashboard** | [`ReportsDashboard.tsx`](src/components/ReportsDashboard.tsx) | May be using mock/placeholder data for reports and analytics. |
| **Calendar Integration** | [`calendar_service.py`](calendar_service.py) | Google Calendar integration is planned but may not be fully connected to the scheduling UI. |
| **Teams Meeting Service** | [`teams_meeting_service.py`](teams_meeting_service.py) | Exists but may not be integrated with interview scheduling. |
| **ICS Calendar** | [`ics_calendar_service.py`](ics_calendar_service.py) | Exists but may not be connected to the UI. |

### Features That May Need Attention

| Feature | Status | Notes |
|---------|--------|-------|
| **Video Transcription** | ✅ Working | Triggered on upload but may need monitoring |
| **Work Style Scoring API** | ⚠️ Optional | Requires Flask API running at localhost:5000 |
| **Email Links** | ⚠️ Hardcoded | Login URL in emails uses placeholder domain |
| **Duplicate Detection** | ✅ Working | Uses resume_collector duplicate checking |
| **Photo Upload** | ✅ Working | But may fail if column doesn't exist |

### Database Columns That Might Be Missing

If features fail, check these columns exist:
- `applicants.photo_url` - For profile photos
- `applicants.access_token` - For login
- `applicants.access_expires_at` - Token expiry
- `applicants.status` - Workflow status
- `applicants.screening_score` - Resume score
- `video_assessments.transcription` - Video transcripts
- `work_style_assessments.semantic_score` - Test scores

---

## 6. Technical Architecture

### Database Schema (Core Tables)

```
applicants
├── id (UUID, PK)
├── name, email, phone
├── position
├── job_id (FK)
├── resume_text
├── parsed_resume_json (JSONB)
├── screening_score (float)
├── screening_fit_category
├── status
├── access_token
├── access_expires_at
├── photo_url
├── created_at, updated_at

job_postings
├── id (UUID, PK)
├── title, description
├── required_skills (JSONB)
├── required_education (JSONB)
├── required_experience (integer)
├── expected_projects (JSONB)
├── role_family
├── status
├── created_at

scoring_settings
├── id (UUID, PK)
├── experience_weight, skills_weight, etc.
├── qualified_threshold, review_threshold
├── baseline_experience, baseline_skills, etc.

video_assessments
├── id (UUID, PK)
├── applicant_id (FK)
├── video_url
├── status
├── transcription
├── transcription_status
├── submitted_at

work_style_assessments
├── id (UUID, PK)
├── applicant_id (FK)
├── answers (JSONB)
├── essay
├── status
├── semantic_score
├── dimension_scores (JSONB)
├── submitted_at
```

### API Endpoints (Flask Server)

| Endpoint | Purpose |
|----------|---------|
| `/api/trigger-transcription` | Start video transcription |
| `/api/workstyle/score` | Score work style assessment |
| `/api/calculate-hybrid-fit` | Calculate hybrid job fit |

### Key Python Services

| File | Purpose |
|------|---------|
| [`resume_collector.py`](resume_collector.py) | Email collection & initial processing |
| [`resume_parser.py`](resume_parser.py) | Resume parsing with GPT + BERT |
| [`screening_service.py`](screening_service.py) | Hybrid scoring & decision |
| [`email_service.py`](email_service.py) | Applicant notifications |
| [`job_alignment.py`](job_alignment.py) | Semantic similarity & scoring |
| [`work_style_scorer.py`](work_style_scorer.py) | Work style semantic scoring |
| [`transcription_service.py`](transcription_service.py) | Video transcription (Whisper) |
| [`calendar_service.py`](calendar_service.py) | Google Calendar integration |

---

## Quick Reference: Files and Their Status

### Documentation Files (to be replaced)
- ❌ WORKFLOW.md - Superseded by this document
- ❌ SCORING_DOCUMENTATION.md - Superseded by this document
- ❌ HYBRID_SCORING_GUIDE.md - Superseded by this document
- ❌ RESUME_COLLECTOR_AUTOMATION_FLOW.md - Superseded by this document
- ❌ RESUME_PARSER_FLOW.md - Superseded by this document
- ❌ OVERALL_SCORING.md - Superseded by this document
- ❌ WORK_STYLE_SEMANTIC_SCORING.md - Superseded by this document
- ❌ THESIS_SYSTEM_SUMMARY.md - Superseded by this document
- ❌ WORKFLOW_ANALYSIS.md - Superseded by this document

### This Document
- ✅ SYSTEM_DOCUMENTATION.md - This is the compiled, updated documentation

---

*Last Updated: April 2026*