# AutoIntel Recruitment System - Complete Workflow Documentation

## Overview
This document describes the complete recruitment workflow for the AutoIntel system, from initial application to final assessment.

---

## Recruitment Pipeline

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        STAGE 1: APPLICATION RECEIPT                           │
└─────────────────────────────────────────────────────────────────────────────────┘

    Applicant sends email with:
    ├── Resume attachment (PDF)
    └── Subject line: "Applicant - [Job Title]"
    
    System (resume_collector.py):
    ├── Connects to Gmail via IMAP
    ├── Extracts applicant name from email
    ├── Extracts job title from subject line (e.g., "Application Developer")
    ├── Downloads and parses resume (PDF → text)
    └── Stores in database: recruitment_applicants table

    Database Entry Created:
    ├── applicant_id (UUID)
    ├── applied_job_id (from job title lookup)
    ├── full_name
    ├── email
    ├── resume_text
    └── status: "pending_screening"

┌─────────────────────────────────────────────────────────────────────────────────┐
│                        STAGE 2: AUTOMATED SCREENING                           │
└─────────────────────────────────────────────────────────────────────────────────┘

    System triggers /api/calculate-fit:
    ├── Input: resume_text + job_description
    ├── BERT model calculates semantic match score (0-100)
    └── Output: semantic_score, confidence, fit_category

    Scoring Logic:
    ├── score >= 80 → "Qualified" (PASS)
    ├── score >= 60 → "Review" (NEEDS REVIEW)
    └── score < 60 → "Not Qualified" (FAIL)

    Decision Engine:
    ├── IF score >= 80:
    │   ├── status: "passed_screening"
    │   ├── Generate access_token (UUID)
    │   ├── Store token with expiration (24 hours)
    │   └── Trigger PASS email notification
    │
    ├── ELSE IF score >= 60:
    │   ├── status: "needs_review"
    │   └── Admin manually reviews
    │
    └── ELSE (score < 60):
        ├── status: "failed_screening"
        └── Trigger FAIL email notification

┌─────────────────────────────────────────────────────────────────────────────────┐
│                        STAGE 3: NOTIFICATION (EMAIL)                          │
└─────────────────────────────────────────────────────────────────────────────────┘

    ╔═══════════════════════════════════════════════════════════════════════════╗
    ║                    IF PASSED SCREENING (Score >= 80)                      ║
    ╠═══════════════════════════════════════════════════════════════════════════╣
    ║                                                                           ║
    ║  TO: applicant@email.com                                                  ║
    ║  SUBJECT: Congratulations! You've Passed Initial Screening               ║
    ║                                                                           ║
    ║  ------------------------------------------------------------------------  ║
    ║  Dear [Applicant Name],                                                   ║
    ║                                                                           ║
    ║  Congratulations! Your application for the position of [Job Title]       ║
    ║  has been successful in our initial screening.                           ║
    ║                                                                           ║
    ║  Your Match Score: [85/100] - Excellent Fit                              ║
    ║                                                                           ║
    ║  ─────────────────────────────────────────────────────────────────────    ║
    ║  NEXT STEPS:                                                              ║
    ║                                                                           ║
    ║  1. ACCESS THE SYSTEM:                                                    ║
    ║     Visit: https://autointel.example.com/login                            ║
    ║     Access Token: [unique-token-string]                                   ║
    ║     (This token expires in 24 hours)                                      ║
    ║                                                                           ║
    ║  2. COMPLETE ASSESSMENTS:                                                 ║
    ║     • Video Introduction (record your response)                          ║
    ║     • Work Profiling Exam (personality & skills assessment)              ║
    ║                                                                           ║
    ║  ─────────────────────────────────────────────────────────────────────    ║
    ║                                                                           ║
    ║  SYSTEM INSTRUCTIONS:                                                     ║
    ║                                                                           ║
    ║  1. Go to the login page                                                  ║
    ║  2. Enter your email address                                             ║
    ║  3. Enter your access token as the password                              ║
    ║  4. Complete the required assessments                                    ║
    ║  5. Submit your responses                                                ║
    ║                                                                           ║
    ║  Note: You must complete all assessments within 7 days of receiving      ║
    ║  this email. After completing assessments, our team will review your      ║
    ║  results and contact you for the next steps.                            ║
    ║                                                                           ║
    ║  Best regards,                                                           ║
    ║  AutoIntel Recruitment Team                                              ║
    ║  ------------------------------------------------------------------------  ║
    ║                                                                           ║
    ╚═══════════════════════════════════════════════════════════════════════════╝

    ╔═══════════════════════════════════════════════════════════════════════════╗
    ║                    IF FAILED SCREENING (Score < 60)                       ║
    ╠═══════════════════════════════════════════════════════════════════════════╣
    ║                                                                           ║
    ║  TO: applicant@email.com                                                  ║
    ║  SUBJECT: Update on Your Application - [Job Title]                       ║
    ║                                                                           ║
    ║  ------------------------------------------------------------------------  ║
    ║  Dear [Applicant Name],                                                   ║
    ║                                                                           ║
    ║  Thank you for your interest in the [Job Title] position at our          ║
    ║  company.                                                                 ║
    ║                                                                           ║
    ║  After careful review of your application, we regret to inform you        ║
    ║  that we have decided to move forward with other candidates whose         ║
    ║  qualifications more closely match our current requirements.            ║
    ║                                                                           ║
    ║  Your Match Score: [45/100]                                               ║
    ║                                                                           ║
    ║  We encourage you to apply for future positions that match your          ║
    ║  skills and experience.                                                   ║
    ║                                                                           ║
    ║  Best regards,                                                           ║
    ║  AutoIntel Recruitment Team                                              ║
    ║  ------------------------------------------------------------------------  ║
    ║                                                                           ║
    ╚═══════════════════════════════════════════════════════════════════════════╝

┌─────────────────────────────────────────────────────────────────────────────────┐
│                        STAGE 4: APPLICANT ACCESS                               │
└─────────────────────────────────────────────────────────────────────────────────┘

    Applicant logs in with:
    ├── Email: [applicant email]
    └── Access Token: [from email]

    System validates:
    ├── Token exists in database
    ├── Token not expired
    ├── Applicant status = "passed_screening"
    └── Creates session

    After login, applicant sees:
    ├── Dashboard with assessment status
    ├── "Start Video Assessment" button
    ├── "Start Work Profiling Exam" button
    └── Progress indicator

┌─────────────────────────────────────────────────────────────────────────────────┐
│                        STAGE 5: ASSESSMENTS                                   │
└─────────────────────────────────────────────────────────────────────────────────┘

    ╔═══════════════════════════════════════════════════════════════════════╗
    ║                    VIDEO ASSESSMENT                                     ║
    ╠═══════════════════════════════════════════════════════════════════════╣
    ║                                                                           ║
    ║  Applicant clicks "Start Video Assessment"                              ║
    ║                                                                           ║
    ║  System provides:                                                         ║
    ║  ├── Question prompt (e.g., "Tell us about yourself...")              ║
    ║  ├── Recording interface (camera + microphone)                         ║
    ║  ├── Time limit (e.g., 2-3 minutes)                                     ║
    ║  └── Preview & re-record option                                          ║
    ║                                                                           ║
    ║  After submission:                                                       ║
    ║  ├── Video stored in Supabase Storage (applicant-videos bucket)        ║
    ║  ├── Video saved to: video_assessments table                            ║
    ║  ├── Transcription triggered (Whisper)                                 ║
    ║  └── Status: "video_completed"                                          ║
    ║                                                                           ║
    ╚═══════════════════════════════════════════════════════════════════════╝

    ╔═══════════════════════════════════════════════════════════════════════╗
    ║                    WORK PROFILING EXAM (Personality Test)               ║
    ╠═══════════════════════════════════════════════════════════════════════╣
    ║                                                                           ║
    ║  Applicant clicks "Start Work Profiling Exam"                           ║
    ║                                                                           ║
    ║  System provides:                                                         ║
    ║  ├── Multiple choice questions                                          ║
    ║  ├── Personality assessments                                            ║
    ║  ├── Skills evaluation                                                   ║
    ║  └── Time-based or untimed                                              ║
    ║                                                                           ║
    ║  After completion:                                                       ║
    ║  ├── Results saved to: personality_tests table                          ║
    ║  ├── Score calculated                                                    ║
    ║  └── Status: "exam_completed"                                           ║
    ║                                                                           ║
    ╚═══════════════════════════════════════════════════════════════════════╝

┌─────────────────────────────────────────────────────────────────────────────────┐
│                        STAGE 6: FINAL REVIEW                                  │
└─────────────────────────────────────────────────────────────────────────────────┘

    Admin reviews in Dashboard:
    ├── All applicants who completed assessments
    ├── Video + transcription
    ├── Personality test results
    ├── Initial screening score
    └── Overall recommendation

    Admin actions:
    ├── Shortlist for interview
    ├── Reject
    ├── Request additional info
    └── Move to next stage

---

## Database Status Flow

```
┌──────────────────┐
│ pending_screening│ ← Initial state after email collection
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  passed_screening│ ← Score >= 80, email sent with token
└────────┬─────────┘
         │
         ├──────────────────────┐
         │                      │
         ▼                      ▼
┌──────────────────┐   ┌──────────────────┐
│ video_in_progress │   │  exam_in_progress │
└────────┬─────────┘   └────────┬─────────┘
         │                      │
         ▼                      ▼
┌──────────────────┐   ┌──────────────────┐
│ video_completed  │   │  exam_completed  │
└────────┬─────────┘   └────────┬─────────┘
         │                      │
         └──────────┬───────────┘
                    │
                    ▼
         ┌──────────────────┐
         │ assessments_done │ ← Both completed
         └────────┬─────────┘
                    │
                    ▼
         ┌──────────────────┐
         │  admin_review    │ ← Ready for admin review
         └──────────────────┘


┌──────────────────┐
│  needs_review    │ ← Score 60-79, manual review needed
└────────┬─────────┘
         │
         ▼
    (Manual admin decision)


┌──────────────────┐
│ failed_screening  │ ← Score < 60, rejection email sent
└──────────────────┘
```

---

## API Endpoints Summary

| Endpoint | Method | Stage | Description |
|----------|--------|-------|-------------|
| `/api/calculate-fit` | POST | 2 | Score resume against job |
| `/api/trigger-email` | POST | 3 | Send pass/fail email |
| `/api/generate-token` | POST | 3 | Generate access token |
| `/api/validate-token` | POST | 4 | Validate applicant token |
| `/api/health` | GET | All | Health check |

---

## Files Involved

| File | Purpose |
|------|---------|
| `resume_collector.py` | Stage 1: Email fetching & resume parsing |
| `job_alignment.py` | Stage 2: BERT scoring |
| `scoring_api.py` | Stage 2-3: API endpoints |
| `email_service.py` | Stage 3: Email sending (NEW) |
| `token_service.py` | Stage 3-4: Token management (NEW) |
| `VideoAssessment.tsx` | Stage 5: Video recording |
| `PersonalityTest.tsx` | Stage 5: Work profiling |
| `ApplicantLogin.tsx` | Stage 4: Login with token |

---

## Scoring Thresholds (Configurable)

| Score Range | Category | Action |
|-------------|----------|--------|
| 80-100 | Excellent Fit | Auto-pass, send access email |
| 60-79 | Good Fit | Needs manual review |
| 0-59 | Not Qualified | Send rejection email |

These thresholds are stored in `scoring_settings` table and can be adjusted by admins.
