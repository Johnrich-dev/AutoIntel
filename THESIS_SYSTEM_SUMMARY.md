# AutoIntel Recruitment System - Technical Summary

## Executive Overview

AutoIntel is an intelligent recruitment automation system designed to streamline the hiring process through AI-powered resume screening, job matching, and applicant assessment. The system automates the initial stages of recruitment while providing HR administrators with configurable scoring parameters and comprehensive dashboard tools.

---

## System Architecture

### Technology Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Frontend** | React + TypeScript | Admin dashboards, applicant portals |
| **Backend** | Python 3.x | Core services, NLP processing |
| **Database** | Supabase (PostgreSQL) | Data storage, RLS policies |
| **AI/ML** | BERT, Whisper, GPT | Resume parsing, transcription |
| **Embedding** | Sentence-Transformers | Semantic similarity matching |

### High-Level Data Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Email     │────▶│   Resume    │────▶│  Screening  │────▶│   Decision  │
│  Collector  │     │   Parser    │     │   Service   │     │  & Notify   │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
                           │                   │                    │
                           ▼                   ▼                    ▼
                    ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
                    │  GPT/GPT-4  │     │    Job      │     │   Email     │
                    │  Extractor  │     │  Alignment  │     │   Service   │
                    └─────────────┘     └─────────────┘     └─────────────┘
```

---

## Core Modules

### 1. Resume Collector ([`resume_collector.py`](resume_collector.py:1))

**Purpose**: Automated email-based resume collection

**Process Flow**:
1. Monitors email inbox for new applications
2. Extracts resume attachments (PDF, DOCX)
3. Parses subject line for job title
4. Links applicant to specific job posting
5. Triggers resume parsing pipeline

**Key Functions**:
- Email subject parsing for job identification
- Attachment extraction and storage
- Applicant record creation

---

### 2. Resume Parser ([`resume_parser.py`](resume_parser.py:1))

**Purpose**: Convert unstructured resumes into structured data

**Technology Stack**:
- **GPT-4 API**: Text cleaning and normalization
- **BERT NER** (BERT-base-NER): Named entity extraction
- **Regex**: Section boundary detection

**Parsed Data Structure**:
```json
{
  "name": "string",
  "email": "string", 
  "phone": "string",
  "education": [
    {
      "school": "string",
      "course": "string",
      "year": "number"
    }
  ],
  "experience": [
    {
      "company": "string",
      "role": "string", 
      "years": "number",
      "summary": "string"
    }
  ],
  "skills": {
    "hard_skills": ["string"],
    "soft_skills": ["string"]
  },
  "projects": [{"name": "string", "details": "string"}],
  "trainings": ["string"],
  "certifications": ["string"],
  "achievements": ["string"]
}
```

**Section Detection** ([`resume_parser.py:39`](resume_parser.py:39)):
```python
SECTION_ALIASES = {
    "EXPERIENCE": ["work experience", "employment history", "professional experience"],
    "EDUCATION": ["education", "educational background", "academic background"],
    "SKILLS": ["skills", "technical skills", "core skills", "competencies"],
    "PROJECTS": ["projects", "personal projects", "academic projects"],
    "TRAININGS": ["certifications", "trainings", "seminars", "workshops"]
}
```

---

### 3. Job Alignment Module ([`job_alignment.py`](job_alignment.py:1))

**Purpose**: Semantic matching between resumes and job requirements

**Embedding Model**:
- **Model**: `all-MiniLM-L6-v2` (Sentence-Transformers)
- **Dimensions**: 384
- **Size**: ~80MB
- **Device**: CUDA (GPU) or CPU (automatic fallback)

**Semantic Similarity Calculation** ([`job_alignment.py:300`](job_alignment.py:300)):

```python
def calculate_semantic_similarity(text1: str, text2: str) -> Dict[str, Any]:
    """
    Calculate cosine similarity between two text embeddings.
    
    Steps:
    1. Preprocess texts (lowercase, normalize whitespace)
    2. Generate embeddings using BERT
    3. Calculate cosine similarity
    4. Compute confidence metrics
    """
    # Preprocess
    text1_processed = preprocess_text(text1)
    text2_processed = preprocess_text(text2)
    
    # Get embeddings
    emb1 = encode_text(text1_processed)
    emb2 = encode_text(text2_processed)
    
    # Cosine similarity
    similarity = cosine_similarity(emb1, emb2)[0][0]
    
    return {
        "similarity": round(similarity, 4),  # 0-1 scale
        "confidence": calculate_embedding_confidence(emb1, emb2),
        "status": "success"
    }
```

---

### 4. Screening Service ([`screening_service.py`](screening_service.py:1))

**Purpose**: Automated applicant evaluation and decision making

#### Hybrid Scoring Algorithm

The system uses a **6-category hybrid scoring** approach:

```
FINAL SCORE = (Requirement Match Score × 60%) + (Count Score × 40%)
```

**6 Categories**:
| Category | Default Weight (Entry-Level) |
|----------|------------------------------|
| Experience | 28% |
| Skills | 30% |
| Education | 18% |
| Projects | 14% |
| Trainings/Certifications | 6% |
| Achievements | 4% |

**Scoring Components**:

1. **Requirement Match Score (60%)**: Measures how well resume content aligns with job requirements using semantic similarity across each category

2. **Count Score (40%)**: Measures whether applicant meets expected baseline quantities for each category

**Example Scoring Calculation**:
```python
weights = {
    "experience_weight": 28,
    "skills_weight": 30,
    "education_weight": 18,
    "projects_weight": 14,
    "traincert_weight": 6,
    "achievements_weight": 4
}

baselines = {
    "baseline_experience": 2,    # 2 years minimum
    "baseline_skills": 10,       # 10 skills minimum
    "baseline_education": 2,     # 2 education entries
    "baseline_projects": 2,      # 2 projects minimum
    "baseline_traincert": 2,    # 2 trainings minimum
    "baseline_achievements": 1   # 1 achievement minimum
}
```

#### Applicant Level Detection

The system automatically detects applicant experience level:

| Level | Detection Criteria |
|-------|---------------------|
| **Fresh Graduate** | Recent education (< 1 year), minimal work experience |
| **Entry-Level** | 1-3 years experience, relevant skills |
| **Mid-Level** | 4+ years experience, leadership indicators |

**Auto-Detection** ([`screening_service.py:270`](screening_service.py:270)):
```python
# Auto-detect from parsed resume
detected_level = job_alignment.detect_job_level_from_resume(parsed_resume_json)

# Or from raw text (when NER not complete)
detected_level = job_alignment.detect_job_level_from_raw_text(resume_text)
```

#### Configurable Thresholds

HR admins can configure pass/review thresholds per job level:

| Job Level | Qualified Threshold | Review Threshold |
|-----------|---------------------|------------------|
| Fresh Graduate | 75 | 60 |
| Entry-Level | 78 | 65 |
| Mid-Level | 80 | 68 |

#### Decision Logic ([`screening_service.py:150`](screening_service.py:150)):

```python
def determine_decision(score: float, pass_threshold: float, review_threshold: float) -> str:
    if score >= pass_threshold:
        return "passed"           # Qualified - proceed to next stage
    elif score >= review_threshold:
        return "needs_review"    # Manual HR review required
    else:
        return "failed"          # Not recommended
```

---

### 5. Email Service ([`email_service.py`](email_service.py:1))

**Purpose**: Automated applicant notifications

**Notification Types**:

| Event | Template | Action |
|-------|----------|--------|
| **Screening Passed** | Pass notification | Send access token + login link |
| **Screening Failed** | Rejection email | Professional regret message |
| **Needs Review** | Review notification | Inform applicant of pending review |

**Key Functions**:
- [`send_pass_notification()`](email_service.py:80) - Congratulations + next steps
- [`send_fail_notification()`](email_service.py:263) - Rejection with encouragement
- [`send_review_notification()`](email_service.py:408) - Status update
- [`process_screening_decision()`](email_service.py:553) - Orchestrates notifications

---

### 6. Video Transcription Service ([`transcription_service.py`](transcription_service.py:1))

**Purpose**: Convert applicant video responses to text for analysis

**Technology**:
- **Model**: `openai/whisper-small` (~244MB)
- **Runtime**: Local execution (no API costs)
- **GPU Support**: CUDA acceleration (10-30x faster)

**Performance** ([`README_TRANSCRIPTION.md:174`](README_TRANSCRIPTION.md:174)):

| Video Length | CPU Time | GPU Time |
|-------------|----------|----------|
| 1 minute | 30-60s | 5-10s |
| 5 minutes | 2-4 min | 20-40s |
| 10 minutes | 5-8 min | 1-2 min |

**Process Flow**:
1. Extract audio from video (FFmpeg)
2. Load Whisper model
3. Transcribe with timestamps
4. Store in database for admin review

---

## Database Schema

### Core Tables

**applicants**: Candidate information and screening status
```sql
- id (UUID, PK)
- name, email, phone
- job_id (FK to job_postings)
- resume_text
- parsed_resume_json (JSONB)
- screening_score (float)
- screening_status (passed/failed/needs_review)
- access_token
- created_at, updated_at
```

**job_postings**: Job listings with requirements
```sql
- id (UUID, PK)
- title, description
- required_skills (JSONB)
- required_education (JSONB)
- required_experience (integer)
- created_at
```

**scoring_settings**: Admin-configurable weights
```sql
- id (UUID, PK)
- job_level (fresh_grad/entry_level/mid_level)
- experience_weight, skills_weight, education_weight, etc.
- qualified_threshold, review_threshold
- fresh_grad_weights (JSONB)
- entry_level_weights (JSONB)
- mid_level_weights (JSONB)
```

---

## Frontend Components

### Admin Dashboard ([`src/components/AdminDashboard.tsx`](src/components/AdminDashboard.tsx:1))

- Overview statistics
- Recent applicants list
- Quick actions

### Applicant Management ([`src/components/ApplicantsList.tsx`](src/components/ApplicantsList.tsx:1))

- Filterable applicant list
- Screening status indicators
- Bulk actions

### Scoring Settings ([`src/components/AdminScoringSettings.tsx`](src/components/AdminScoringSettings.tsx:1))

- Interactive weight configuration
- Threshold adjustment
- Preview calculated scores

### Applicant Portal ([`src/components/DashboardLanding.tsx`](src/components/DashboardLanding.tsx:1))

- Login with access token
- Video assessment submission
- Personality test completion
- Status tracking

---

## System Workflows

### Complete Applicant Journey

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        STAGE 1: APPLICATION                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. Applicant sends email with resume attached                              │
│     Subject: "Applicant - [Job Title]"                                      │
│                                                                             │
│  2. Resume Collector extracts:                                             │
│     - Name, email, phone                                                    │
│     - Job title from subject                                               │
│     - Resume attachment                                                     │
│                                                                             │
│  3. Create applicant record in database                                     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        STAGE 2: RESUME PARSING                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. Resume Parser processes PDF/DOCX                                       │
│                                                                             │
│  2. GPT Cleaner normalizes text                                             │
│                                                                             │
│  3. Section detection (Experience, Education, Skills, etc.)               │
│                                                                             │
│  4. BERT NER extracts entities                                              │
│                                                                             │
│  5. Store structured JSON in parsed_resume_json                            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        STAGE 3: SCREENING                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. Load scoring settings from database                                     │
│                                                                             │
│  2. Detect applicant level (Fresh Grad/Entry/Mid)                          │
│                                                                             │
│  3. Load appropriate weights & thresholds                                  │
│                                                                             │
│  4. Calculate hybrid score:                                                 │
│     - Requirement Match Score (60%)                                         │
│     - Count Score (40%)                                                     │
│                                                                             │
│  5. Determine decision:                                                     │
│     - passed (score >= qualified_threshold)                                 │
│     - needs_review (score >= review_threshold)                              │
│     - failed (score < review_threshold)                                     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        STAGE 4: NOTIFICATION                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. Send appropriate email:                                                 │
│     - Pass: Access token + login link                                       │
│     - Review: Pending review message                                       │
│     - Fail: Professional regret                                            │
│                                                                             │
│  2. Update applicant status in database                                     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        STAGE 5: ASSESSMENT (If Passed)                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Applicant Portal:                                                          │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐                   │
│  │    Login    │───▶│    Video     │───▶│ Personality │                   │
│  │  (Token)    │    │ Assessment   │    │    Test     │                   │
│  └──────────────┘    └──────────────┘    └──────────────┘                   │
│                             │                        │                      │
│                             ▼                        ▼                      │
│                      ┌──────────────┐    ┌──────────────┐                   │
│                      │ Transcription│    │   Results   │                   │
│                      │   (Whisper)  │    │   Stored    │                   │
│                      └──────────────┘    └──────────────┘                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        STAGE 6: HR REVIEW                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Admin Dashboard:                                                            │
│  - View all applicants                                                      │
│  - Review video transcriptions                                             │
│  - Check personality test results                                          │
│  - Shortlist or reject candidates                                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Key Innovations for Thesis

### 1. Hybrid Semantic + Component Scoring
- Combines BERT embeddings with category-based counting
- Balances semantic relevance with quantity metrics

### 2. Automatic Applicant Level Detection
- No manual HR intervention needed
- Adapts scoring profile based on resume content

### 3. Admin-Configurable Weights
- Real-time adjustment without code changes
- Database-driven configuration

### 4. Multi-Level Support
- Fresh Graduate, Entry-Level, Mid-Level profiles
- Different weight distributions per level

### 5. Cost-Effective AI
- Local Whisper transcription (no API costs)
- Sentence-transformers for embeddings
- GPT integration for resume parsing

---

## File Reference Guide

| Purpose | Primary File | Key Functions |
|---------|--------------|---------------|
| Resume Collection | `resume_collector.py` | Email parsing, attachment extraction |
| Resume Parsing | `resume_parser.py` | Section detection, entity extraction |
| Job Matching | `job_alignment.py` | Semantic similarity, fit scoring |
| Screening | `screening_service.py` | Hybrid scoring, decision logic |
| Email Notifications | `email_service.py` | Pass/fail/review notifications |
| Video Transcription | `transcription_service.py` | Whisper integration |
| Admin Settings | `src/components/AdminScoringSettings.tsx` | Weight configuration UI |
| Database Schema | `supabase/migrations/` | Table definitions |

---

## Conclusion

AutoIntel demonstrates a complete AI-powered recruitment pipeline that automates resume screening while maintaining flexibility through configurable scoring parameters. The hybrid scoring approach balances semantic understanding with quantitative metrics, and the automatic applicant level detection eliminates manual categorization overhead.

This system is suitable for thesis research in areas such as:
- NLP for HR/recruitment
- Semantic text matching
- Configurable business rules
- Automated workflow orchestration
- Multi-stage applicant evaluation
