# AutoIntel Recruitment System - Flow Analysis & Insights

## Executive Summary

The critical gap identified in the original analysis has been **addressed**. The system now implements hybrid semantic + component scoring with configurable weights loaded from the database. The admin-configurable weights now affect actual screening decisions.

---

## Current System Flow

### Stage 1: Application Receipt & Automatic Screening

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  EMAIL INCOMING (resume_collector.py)                                           │
│  ├── Applicant sends email with resume (PDF)                                    │
│  ├── Subject: "Applicant - [Job Title]"                                         │
│  └── System extracts: name, email, job title                                    │
└─────────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│  RESUME PARSING (resume_parser.py / GPT Extractor)                             │
│  ├── Extract: name, email, phone                                                │
│  ├── Extract: education (school, course, year)                                  │
│  ├── Extract: experience (company, role, years, summary)                        │
│  ├── Extract: skills (hard_skills, soft_skills)                                 │
│  ├── Extract: projects (name, details)                                          │
│  └── Store in: parsed_resume_json                                               │
└─────────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│  AUTOMATIC SCREENING (screening_service.py) ✓ FIXED                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │ CURRENT: Hybrid Semantic + Component Scoring                           │    │
│  │ - load_scoring_settings() loads from database                          │    │
│  │ - calculate_component_scores() compares resume vs job requirements     │    │
│  │ - calculate_weighted_score() applies admin-configurable weights        │    │
│  │ - Uses weights: loaded from scoring_settings table                     │    │
│  │ - Uses thresholds: configurable per job level                          │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                 │
│  Component Scoring Implemented:                                                │
│  ✓ Experience relevance score (vs job.required_experience)                     │
│  ✓ Skills relevance score (vs job.skills)                                       │
│  ✓ Education relevance score (vs job.required_education)                       │
│  ✓ Project relevance score (vs job.expected_projects)                          │
│  ✓ Training/Certification relevance score                                      │
│  ✓ Achievements relevance score                                                │
│  ✓ Admin-configurable weights from scoring_settings table                      │
│  ✓ Job-level specific weights (fresh_grad, entry_level, mid_level)            │
│  ✓ Admin-configurable thresholds per job level                                │
└─────────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│  DECISION & NOTIFICATION                                                        │
│  ├── Score >= qualified_threshold → passed_screening → Email with access token │
│  ├── Score >= review_threshold → needs_review → Review email                   │
│  └── Score < review_threshold → failed_screening → Rejection email             │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Stage 2-5: Applicant & Admin Flows (Working as Expected)

```
Applicant Flow:
┌─────────────┐     ┌─────────────┐    ┌─────────────┐     ┌─────────────┐
│   Email     │───▶│   Login     │───▶│  Video      │───▶│ Personality │
│  Received   │     │  (Token)    │    │ Assessment  │     │    Test     │
└─────────────┘     └─────────────┘    └─────────────┘     └─────────────┘
      │                  │                  │                  │
      ▼                  ▼                  ▼                  ▼
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  Check      │    │ Dashboard   │    │ Transcription│   │   Results   │
│  Score/     │    │  Shows      │    │  (Whisper)  │    │   Stored    │
│  Status     │    │ Progress    │    │             │    │             │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘

Admin Flow:
┌─────────────┐     ┌─────────────┐    ┌─────────────┐     ┌─────────────┐
│  Dashboard  │───▶│ Applicants  │───▶│  Review     │───▶│ Shortlist/  │
│   Stats     │     │    List     │    │  Details    │     │   Reject    │
└─────────────┘     └─────────────┘    └─────────────┘     └─────────────┘
```

---

## Implementation Status

### ✅ What Was Implemented

1. **screening_service.py** - Complete overhaul:
   - `load_scoring_settings()` function loads settings from database
   - Support for job-level specific weights and thresholds
   - Uses `calculate_hybrid_job_fit_score()` from job_alignment
   - Configurable thresholds per job level

2. **job_alignment.py** - Added component scoring:
   - `calculate_component_scores()` - Semantic relevance per component
   - `calculate_weighted_score()` - Apply weights to component scores
   - `calculate_count_based_score()` - Quantity-based scoring
   - `calculate_combined_score()` - Combined semantic + count
   - `calculate_hybrid_job_fit_score()` - Main hybrid scoring function
   - `calculate_final_hybrid_score()` - 6-category hybrid scoring

3. **scoring_api.py** - Added endpoints:
   - `/api/calculate-hybrid-fit` - Hybrid scoring with weights
   - `/api/get-component-scores` - Component relevance scores
   - `/api/calculate-final-hybrid` - 6-category final hybrid scoring

4. **scoring_settings table** - Enhanced with:
   - Job-level specific weights (fresh_grad_weights, entry_level_weights, mid_level_weights)
   - Job-level specific thresholds (fresh_grad_qualified_threshold, etc.)
   - Baseline values for each category

---

## Hybrid Scoring Formula

```
Final Score = 
  (Experience_Relevance × Experience_Weight) +
  (Skills_Relevance × Skills_Weight) +
  (Education_Relevance × Education_Weight) +
  (Projects_Relevance × Projects_Weight) +
  (Training_Relevance × Training_Weight) +
  (Achievements_Relevance × Achievements_Weight)
```

**Default Weights (entry_level):**
- experience_weight: 28%
- skills_weight: 25%
- education_weight: 20%
- projects_weight: 12%
- traincert_weight: 6%
- achievements_weight: 4%

---

## Insights by Flow

### Applicant Flow Insights

| Stage | Current State | Notes |
|-------|---------------|-------|
| Email Application | ✓ Working | Score based on hybrid semantic + component |
| Automatic Screening | ✓ Fixed | Uses admin weights from database |
| Receive Token | ✓ Working | - |
| Login | ✓ Working | - |
| Video Assessment | ✓ Working | - |
| Personality Test | ✓ Working | - |

**Key Insight:** Applicants are now screened using the hybrid model that reflects job-specific requirements and uses admin-configured weights.

### Admin Flow Insights

| Stage | Current State | Notes |
|-------|---------------|-------|
| Configure Weights | ✓ Working | Per job level (fresh_grad, entry_level, mid_level) |
| Configure Thresholds | ✓ Working | Per job level |
| View Dashboard | ✓ Working | Stats show weighted scores |
| View Applicants | ✓ Working | Shows calculated scores from backend |
| Review Details | ✓ Working | Component scores from backend |
| Shortlist/Reject | ✓ Working | - |

**Key Insight:** Admin weights now actually affect screening decisions. Configuration is job-level aware.

---

## Configuration Flow

```
Admin Configures Weights/Thresholds → 
  scoring_settings table updated → 
    screening_service loads settings → 
      job_alignment calculates components → 
        applies weighted score → 
          uses configurable thresholds → 
            final decision
```

---

## Scoring Types Supported

1. **Semantic Only** - BERT embeddings similarity (legacy)
2. **Count Based** - Quantity of resume items
3. **Hybrid** - Semantic relevance + weighted components
4. **Final Hybrid** - 6-category hybrid with job-level support

---

## Files Modified (Implementation)

| File | Changes |
|------|---------|
| `screening_service.py` | Load scoring_settings, calculate hybrid score |
| `job_alignment.py` | Add component scoring functions |
| `scoring_api.py` | Add hybrid scoring endpoints |
| `resume_collector.py` | Pass parsed_resume_json to screening |

---

## Conclusion

The critical gap identified in the original analysis has been **resolved**. The system now:

1. ✅ Loads scoring_settings from database
2. ✅ Calculates component scores (experience, skills, education, projects, traincert, achievements)
3. ✅ Applies configurable weights per job level
4. ✅ Uses configurable thresholds per job level
5. ✅ Provides component breakdown in API responses

**Admin-configurable weights now work as intended** for job matching and relevance scoring.

---

## Additional Features Implemented

- **Job-level specific configuration**: fresh_grad, entry_level, mid_level
- **6-category scoring**: Experience, Skills, Education, Projects, Training/Certifications, Achievements
- **Baseline values**: Configurable minimums for each category
- **Semantic + Count hybrid**: Combines relevance with quantity scoring
- **API endpoints**: Multiple scoring endpoints for different use cases
