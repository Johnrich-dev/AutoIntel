# AutoIntel Recruitment System - Complete Workflow Documentation

## Overview
This document describes the complete recruitment workflow for the AutoIntel system, from initial application to final assessment.

---

## Recruitment Pipeline

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        STAGE 1: APPLICATION RECEIPT                           │
│                     (Includes Automatic Screening)                           │
└─────────────────────────────────────────────────────────────────────────────────┘

    Applicant sends email with:
    ├── Resume attachment (PDF)
    └── Subject line: "Applicant - [Job Title]"
    
    System (resume_collector.py):
    ├── Connects to Gmail via IMAP
    ├── Extracts applicant name from email
    ├── Extracts job title from subject line (e.g., "Application Developer")
    ├── Downloads and parses resume (PDF → text)
    └── Stores in database: applicants + resumes tables

    Database Entry Created:
    ├── applicant_id (UUID)
    ├── full_name
    ├── email
    ├── position (job title from subject)
    ├── resume_text (raw extracted)
    └── status: "pending_screening"

    ═══════════════════════════════════════════════════════════════════════════
    AUTOMATIC SCREENING TRIGGERED (Within resume_collector.py)
    ═══════════════════════════════════════════════════════════════════════════

    Step 1a: Look up job from job_postings table
    │   ├── Match position to job title (case-insensitive)
    │   └── Get job_description for matching
    │
    Step 1b: Call screening_service.process_applicant_screening()
    │   ├── Uses BERT semantic scoring (all-MiniLM-L6-v2)
    │   ├── Input: resume_text + job_description
    │   └── Output: semantic_score (0-100), fit_category
    │
    Step 1c: Save results to database
    │   ├── screening_score saved to applicants table
    │   ├── screening_fit_category saved
    │   └── status updated: passed_screening / needs_review / failed_screening
    │
    Step 1d: Send notification email (automatic)
        ├── Score >= 80: Send PASS email with access token
        ├── Score 60-79: Send REVIEW email
        └── Score < 60: Send FAIL email

    ═══════════════════════════════════════════════════════════════════════════

    Scoring Logic:
    ├── score >= 80 → "Qualified" (PASS) → Email with access token
    ├── score >= 60 → "Review" (NEEDS REVIEW) → Email notification
    └── score < 60 → "Not Qualified" (FAIL) → Regret email

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
│                        STAGE 2: NOTIFICATION (EMAIL)                         │
└─────────────────────────────────────────────────────────────────────────────────┘

    NOTE: Email is now sent AUTOMATICALLY within resume_collector.py after scoring.
    This happens in Stage 1 (combined flow).

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
│                        STAGE 3: APPLICANT ACCESS                               │
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
│                        STAGE 4: ASSESSMENTS                                   │
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
│                        STAGE 5: FINAL REVIEW                                  │
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
| `/api/calculate-fit` | POST | 1 | Score resume against job (BERT semantic) |
| `/api/trigger-transcription` | POST | 4 | Trigger video transcription (Whisper) |
| `/api/health` | GET | All | Health check |

**Note**: Email sending and token generation are now done AUTOMATICALLY within resume_collector.py (Stage 1). No separate API calls needed.

---

## Files Involved

| File | Purpose |
|------|---------|
| `resume_collector.py` | Stage 1: Email fetching + AUTOMATIC screening + email notification |
| `job_alignment.py` | Stage 1: BERT semantic scoring (all-MiniLM-L6-v2) |
| `screening_service.py` | Stage 1: Orchestrates scoring → decision → notification |
| `email_service.py` | Stage 1: Sends pass/review/fail emails with tokens |
| `scoring_api.py` | Optional: Standalone scoring API (not required for auto-flow) |
| `transcription_service.py` | Stage 4: Video transcription (Whisper) |
| `VideoAssessment.tsx` | Stage 4: Video recording |
| `PersonalityTest.tsx` | Stage 4: Work profiling |
| `ApplicantLogin.tsx` | Stage 3: Login with token |
| `AdminDashboard.tsx` | Stage 5: Admin review panel |

---

## Scoring Thresholds (Configurable)

| Score Range | Category | Action |
|-------------|----------|--------|
| 80-100 | Excellent Fit | Auto-pass, send access email |
| 60-79 | Good Fit | Needs manual review |
| 0-59 | Not Qualified | Send rejection email |

These thresholds are stored in `scoring_settings` table and can be adjusted by admins.
