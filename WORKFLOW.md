# AutoIntel Recruitment System - Complete Workflow Documentation

## Overview
This document describes the complete recruitment workflow for the AutoIntel system, from initial application to final assessment.

---

## System Status: ✅ FULLY OPERATIONAL

The AutoIntel Recruitment System is now complete with **hybrid semantic scoring** that uses company-adaptable weights!

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
    AUTOMATIC SCREENING TRIGGERED (Hybrid Semantic Scoring)
    ═══════════════════════════════════════════════════════════════════════════

    Step 1a: Look up job from job_postings table
    │   ├── Match position to job title (case-insensitive)
    │   └── Get job_description and structured requirements
    │
    Step 1b: Load scoring settings from database
    │   ├── experience_weight (default: 40%)
    │   ├── skills_weight (default: 30%)
    │   ├── education_weight (default: 20%)
    │   ├── projects_weight (default: 10%)
    │   ├── qualified_threshold (default: 80)
    │   └── review_threshold (default: 60)
    │
    Step 1c: Calculate component relevance scores (BERT)
    │   ├── Experience relevance: resume experience vs job requirements
    │   ├── Skills relevance: resume skills vs job required skills
    │   ├── Education relevance: resume education vs job required education
    │   └── Projects relevance: resume projects vs job expected projects
    │
    Step 1d: Apply company weights and calculate final score
    │   └── Final = (exp_score × exp_w) + (skills_w × skills) + ...
    │
    Step 1e: Compare to thresholds and make decision
    │   ├── score >= qualified → PASS
    │   ├── score >= review → NEEDS_REVIEW
    │   └── score < review → FAIL
    │
    Step 1f: Save results to database
    │   ├── screening_score saved to applicants table
    │   ├── screening_fit_category saved
    │   ├── Component scores saved to resume_scores table
    │   └── status updated: passed_screening / needs_review / failed_screening
    │
    Step 1g: Send notification email (automatic)
        ├── Score >= 80: Send PASS email with access token
        ├── Score 60-79: Send REVIEW email
        └── Score < 60: Send FAIL email
```

---

## Scoring Logic

### Configurable Thresholds (via AdminScoringSettings)

| Score Range | Category | Action |
|-------------|----------|--------|
| 80-100 | Excellent Fit | Auto-pass, send access email |
| 60-79 | Good Fit | Needs manual review |
| 0-59 | Not Qualified | Send rejection email |

**Note:** Thresholds are stored in `scoring_settings` table and can be adjusted by admins.

---

## Hybrid Semantic Scoring

### Company-Adaptive Weights

The system supports company-specific weight configurations:

| Company Type | Experience | Skills | Education | Projects |
|-------------|------------|--------|-----------|----------|
| Default | 40% | 30% | 20% | 10% |
| Startup (Skills-heavy) | 20% | 50% | 10% | 20% |
| Enterprise (Experience-heavy) | 50% | 30% | 10% | 10% |
| Research (Education-heavy) | 20% | 20% | 40% | 20% |

### How Scoring Works

1. **Extract resume components** from parsed JSON:
   - Experience: job titles, companies, years, descriptions
   - Skills: hard skills + soft skills
   - Education: schools, degrees, courses
   - Projects: project names, descriptions

2. **Build job requirements** from job posting:
   - Required skills (from `skills` array)
   - Required education (from `required_education` array)
   - Expected projects (from `expected_projects` array)
   - Experience requirements (from `min_years_experience`)

3. **Calculate semantic relevance** using BERT embeddings:
   - Compare each resume component to job requirement
   - Returns 0-100% relevance score (NOT quantity!)

4. **Apply company weights** and calculate final score:
   ```
   Final = (exp_rel × exp_w) + (skills_rel × skills_w) + (edu_rel × edu_w) + (proj_rel × proj_w)
   ```

5. **Compare to thresholds** and determine decision:
   - Pass / Needs Review / Fail

---

## Applicant Flow

### Stage 2: Notification Email

**If PASSED (Score >= 80):**
- Access token sent via email
- Token expires in 24 hours
- Applicant logs in with email + token
- Completes Video Assessment + Personality Test

**If NEEDS REVIEW (Score 60-79):**
- Notification email sent
- Admin manually reviews

**If FAILED (Score < 60):**
- Rejection email sent

### Stage 3: Applicant Access

- Login with email + access token
- Dashboard shows assessment progress
- Complete Video Assessment
- Complete Personality Test

### Stage 4: Assessments

**Video Assessment:**
- Record introduction video
- Stored in Supabase Storage
- Transcribed with Whisper

**Personality Test:**
- Multiple choice questions
- Results saved to database

### Stage 5: Final Review

- Admin reviews completed applications
- Video + transcription
- Personality test results
- Screening scores
- Shortlist / Reject / Move to next stage

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

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/calculate-fit` | POST | Legacy job fit score (BERT) |
| `/api/calculate-hybrid-fit` | POST | Hybrid scoring with customizable weights |
| `/api/get-component-scores` | POST | Get component relevance scores |
| `/api/calculate-similarity` | POST | Semantic similarity between texts |
| `/api/trigger-transcription` | POST | Trigger video transcription |
| `/api/health` | GET | Health check |

---

## Files Reference

| File | Purpose | Status |
|------|---------|--------|
| `resume_collector.py` | Email collection + screening trigger | ✅ Working |
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

## Configuration

### Admin Scoring Settings

1. Navigate to **Scoring Settings** in admin dashboard
2. Adjust weights (must sum to 100%):
   - Experience Weight
   - Skills Weight
   - Education Weight
   - Projects Weight
3. Adjust thresholds:
   - Qualified Threshold (min score to pass)
   - Review Threshold (min score for manual review)
4. Click Save

**Settings are applied immediately to new applicants.**

---

## Database Schema

### scoring_settings Table

| Column | Type | Default | Description |
|--------|------|---------|-------------|
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
| experience_score | NUMERIC | 0-100 |
| skills_score | NUMERIC | 0-100 |
| education_score | NUMERIC | 0-100 |
| project_score | NUMERIC | 0-100 |
| final_score | NUMERIC | Weighted total 0-100 |
| match_explain | JSONB | Breakdown with weights used |

---

*Last Updated: 2026-03-10*
*See HYBRID_SCORING_GUIDE.md for detailed technical implementation.*
