# AutoIntel Recruitment System - Flow Analysis & Insights

## Executive Summary

After analyzing the codebase, I've identified a **critical gap** between the customizable scoring system and the actual screening implementation. The admin-configurable weights and thresholds are NOT being used in the automatic screening process.

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
│  RESUME PARSING (resume_parser.py / GPT Extractor)                              │
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
│  AUTOMATIC SCREENING (screening_service.py) ← **CRITICAL GAP**                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │ CURRENT: Pure Semantic Scoring (BERT all-MiniLM-L6-v2)                  │    │
│  │ -_job_fit_score(res calculateume_text, job_description)                 │    │
│  │ - Returns: semantic_score (0-100) based on cosine similarity            │    │
│  │ - Uses weights: NONE (not configurable)                                 │    │
│  │ - Uses thresholds: HARDCODED (80 pass, 60 review)                       │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                 │
│  MISSING: Weighted Component Scoring                                            │
│  ✗ Experience relevance score (vs job.required_experience)                      │
│  ✗ Skills relevance score (vs job.skills)                                       │
│  ✗ Education relevance score (vs job.required_education)                        │
│  ✗ Project relevance score (vs job.expected_projects)                           │
│  ✗ Admin-configurable weights from scoring_settings table                       │
│  ✗ Admin-configurable thresholds from scoring_settings table                    │
└─────────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│  DECISION & NOTIFICATION                                                        │
│  ├── Score >= 80 → passed_screening → Email with access token                   │
│  ├── Score 60-79 → needs_review → Review email                                  │
│  └── Score < 60 → failed_screening → Rejection email                            │
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

## Critical Gap Analysis

### What EXISTS (Database & Frontend):

1. **scoring_settings table** (lines 78-97 in migration):
   - `experience_weight` (default: 40)
   - `skills_weight` (default: 30)
   - `education_weight` (default: 20)
   - `projects_weight` (default: 10)
   - `qualified_threshold` (default: 80)
   - `review_threshold` (default: 60)
   - `baseline_project_score` (default: 2)

2. **AdminScoringSettings.tsx** (fully functional):
   - UI to configure weights (must sum to 100%)
   - UI to configure thresholds
   - Loads/saves to scoring_settings table
   - Validation: weights must sum to 100, qualified > review

3. **ApplicantsList.tsx** (frontend scoring):
   - `calculateResumeScore()` function (lines 72-111)
   - Calculates component scores from parsed resume:
     - Skills: (total skills / 20) * 100
     - Experience: (num experiences / 5) * 100
     - Education: (num education / 3) * 100
     - Projects: relative to baseline
   - Applies weights from settings
   - **BUT: This is ONLY for DISPLAY in admin panel, NOT for screening!**

### What's MISSING (Backend Screening):

1. **screening_service.py** (lines 59-176):
   - Does NOT load scoring_settings from database
   - Uses HARDCODED thresholds (DEFAULT_PASS_THRESHOLD = 80, DEFAULT_REVIEW_THRESHOLD = 60)
   - Calls `job_alignment.calculate_job_fit_score()` which:
     - Uses ONLY semantic similarity (BERT embeddings)
     - Does NOT break down by components
     - Does NOT apply weights

2. **job_alignment.py** (lines 271-345):
   - `calculate_job_fit_score()` returns single semantic_score
   - No component breakdown (experience, skills, education, projects)
   - No way to weight different aspects

---

## Scoring Integration Implementation Plan

### Option A: Hybrid Semantic + Component Scoring (Recommended)

This approach combines BERT semantic similarity with structured component scoring:

```
Final Score = 
  (Semantic_Score × Semantic_Weight) + 
  (Experience_Score × Experience_Weight) +
  (Skills_Score × Skills_Weight) +
  (Education_Score × Education_Weight) +
  (Projects_Score × Projects_Weight)
```

**Implementation Steps:**

1. **Update job_alignment.py** to extract components:
   ```python
   def calculate_component_scores(resume_json, job_posting):
       # Extract resume components
       resume_experience = resume_json.get('experience', [])
       resume_skills = resume_json.get('skills', {}).get('all', [])
       resume_education = resume_json.get('education', [])
       resume_projects = resume_json.get('projects', [])
       
       # Job requirements
       job_skills = job_posting.get('skills', [])
       job_education = job_posting.get('required_education', [])
       job_projects = job_posting.get('expected_projects', [])
       job_experience_range = (job_posting.get('min_years_experience', 0), 
                               job_posting.get('max_years_experience', 10))
       
       # Calculate individual relevance scores (0-100)
       experience_score = calculate_experience_relevance(resume_experience, job_experience_range)
       skills_score = calculate_skills_relevance(resume_skills, job_skills)
       education_score = calculate_education_relevance(resume_education, job_education)
       projects_score = calculate_projects_relevance(resume_projects, job_projects)
       
       return {
           'experience_score': experience_score,
           'skills_score': skills_score,
           'education_score': education_score,
           'projects_score': projects_score
       }
   ```

2. **Update screening_service.py** to use settings:
   ```python
   def process_applicant_screening(...):
       # Load scoring settings from database
       settings = load_scoring_settings(supabase_client)
       
       # Get semantic score (existing)
       semantic_result = job_alignment.calculate_job_fit_score(...)
       semantic_score = semantic_result['semantic_score']
       
       # Get component scores (NEW)
       components = job_alignment.calculate_component_scores(
           parsed_resume_json, 
           job_posting
       )
       
       # Calculate weighted final score
       final_score = (
           semantic_score * 0.3 +  # Semantic relevance as base
           components['experience_score'] * (settings['experience_weight'] / 100) +
           components['skills_score'] * (settings['skills_weight'] / 100) +
           components['education_score'] * (settings['education_weight'] / 100) +
           components['projects_score'] * (settings['projects_weight'] / )
       
       # 100)
       Use configurable thresholds
       decision = determine_decision(
           final_score, 
           settings['qualified_threshold'], 
           settings['review_threshold']
       )
   ```

3. **Update resume_scores table** to store breakdown:
   - Already has columns: experience_score, skills_score, education_score, project_score
   - Store both component scores AND final_score

---

## Insights by Flow

### Applicant Flow Insights

| Stage | Current State | Issue | Recommendation |
|-------|---------------|-------|----------------|
| Email Application | ✓ Working | Score based on pure semantic | Add component breakdown |
| Automatic Screening | ⚠️ Gap | Ignores admin weights | Implement hybrid scoring |
| Receive Token | ✓ Working | - | - |
| Login | ✓ Working | - | - |
| Video Assessment | ✓ Working | - | - |
| Personality Test | ✓ Working | - | - |

**Key Insight:** Applicants are being screened with a pure semantic model that doesn't reflect the job-specific requirements. The weights admin configures in AdminScoringSettings have NO EFFECT on actual screening.

### Admin Flow Insights

| Stage | Current State | Issue | Recommendation |
|-------|---------------|-------|----------------|
| Configure Weights | ✓ Working | - | - |
| View Dashboard | ✓ Working | Stats show raw data | Show weighted scores |
| View Applicants | ✓ Working | Shows calculated scores from frontend | Should match backend |
| Review Details | ⚠️ Partial | Component scores from frontend only | Sync with backend |
| Shortlist/Reject | ✓ Working | - | - |

**Key Insight:** Admin configures weights thinking they'll affect screening, but they only affect frontend display. This creates a false sense of control.

---

## Recommendations Summary

### Immediate Actions:

1. **Update screening_service.py** to load and use scoring_settings
2. **Update job_alignment.py** to calculate component scores
3. **Store component scores** in resume_scores table
4. **Update scoring_api.py** to return component breakdown

### Configuration Flow:
```
Admin Configures Weights → 
  scoring_settings table updated → 
    screening_service loads settings → 
      calculates weighted score → 
        applies configurable thresholds → 
          final decision
```

### Benefits:
- Admin has real control over screening criteria
- Job-specific requirements properly evaluated
- Transparent scoring (can show breakdown)
- Flexible (can adjust per hiring needs)
- Maintains semantic relevance as baseline

---

## Files to Modify

| File | Changes Required |
|------|------------------|
| `screening_service.py` | Load scoring_settings, calculate weighted score |
| `job_alignment.py` | Add component scoring functions |
| `scoring_api.py` | Return component breakdown in API response |
| `resume_collector.py` | Pass parsed_resume_json to screening |
| `WORKFLOW.md` | Document new hybrid scoring flow |

---

## Conclusion

The system has a well-designed configurable scoring framework (database + frontend) but it's **not connected to the actual screening logic**. The backend screening still uses a simple, non-configurable semantic similarity model.

**The fix requires:**
1. Loading scoring_settings in screening_service.py
2. Calculating component scores (experience, skills, education, projects) from resume vs job
3. Applying configurable weights to calculate final score
4. Using configurable thresholds for pass/review/fail decisions

This will make the admin-configurable weights actually work as intended for job matching/relevance scoring.
