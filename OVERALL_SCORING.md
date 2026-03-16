# AutoIntel Overall Scoring System Documentation

This document provides comprehensive documentation for the scoring systems used in the AutoIntel recruitment platform, covering three main assessment areas: Resume Screening, Video Assessment, and Work Style Profiling.

---

## Table of Contents

1. [Resume Screening Scoring](#1-resume-screening-scoring)
2. [Video Assessment Scoring](#2-video-assessment-scoring)
3. [Work Style Profiling Scoring](#3-work-style-profiling-scoring)
4. [Overall Score Calculation](#4-overall-score-calculation)
5. [Scoring Configuration](#5-scoring-configuration)

---

## 1. Resume Screening Scoring

### Overview

The AutoIntel resume screening system uses a **hybrid scoring approach** that combines semantic relevance with quantity-based scoring. The system automatically detects the applicant level (Fresh Graduate, Entry-Level, or Mid-Level) and applies the appropriate scoring profile.

```
FINAL SCORE = (Requirement Match Score × 0.6) + (Count Score × 0.4)
```

### Scoring Flow

```
Email with Resume
       │
       ▼
┌─────────────────────────────────────────────────────┐
│  1. RESUME PARSING                                  │
│     - Extract text from PDF/DOCX                   │
│     - GPT cleaning                                  │
│     - BERT NER for entity extraction                │
│     - Parse into structured JSON:                   │
│       { skills, experience, education, projects,   │
│         trainings, certifications, achievements }  │
└─────────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────┐
│  2. JOB MATCHING                                    │
│     - Match resume to job posting                   │
│     - Strategies: exact title → role_family         │
│     - Get job requirements                           │
└─────────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────┐
│  3. APPLICANT LEVEL DETECTION                       │
│     - Detect: Fresh Graduate / Entry-Level / Mid-Level│
│     - Evaluate: education, experience, role titles │
│     - Load corresponding scoring profile            │
└─────────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────┐
│  4. HYBRID SCORING                                  │
│     ┌──────────────────┐  ┌──────────────────┐    │
│     │ Requirement Match │  │ Count Score      │    │
│     │      (60%)        │  │     (40%)        │    │
│     └──────────────────┘  └──────────────────┘    │
└─────────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────┐
│  5. DECISION & NOTIFICATION                         │
│     - qualified: score ≥ qualified_threshold         │
│     - needs_review: review_threshold ≤ score <      │
│       qualified_threshold                            │
│     - not_recommended: score < review_threshold     │
└─────────────────────────────────────────────────────┘
```

### Job-Level Scoring Profiles

#### A. Fresh Graduate Profile

For roles targeting fresh graduates, the system places more value on skills, education, projects, and supporting credentials.

**Default Weights**

| Category                   | Default Weight |
| -------------------------- | -------------- |
| Experience                 | 18%            |
| Skills                     | 30%            |
| Education                  | 22%            |
| Projects                   | 18%            |
| Trainings & Certifications | 7%             |
| Achievements               | 5%             |

**Default Count Baselines**

| Category                   | Count Needed for 100% | Formula                            |
| -------------------------- | --------------------- | ---------------------------------- |
| Experience                 | 1                     | min((experience / 1) × 100, 100)   |
| Skills                     | 8                     | min((skills / 8) × 100, 100)       |
| Education                  | 2                     | min((education / 2) × 100, 100)    |
| Projects                   | 2                     | min((projects / 2) × 100, 100)     |
| Trainings & Certifications | 2                     | min((traincert / 2) × 100, 100)    |
| Achievements               | 1                     | min((achievements / 1) × 100, 100) |

**Default Thresholds**

| Threshold           | Default Value |
| ------------------- | ------------- |
| qualified_threshold | 75            |
| review_threshold    | 60            |

#### B. Entry-Level Profile

Entry-level roles still value skills strongly, but experience becomes more important than in fresh graduate roles.

**Default Weights**

| Category                   | Default Weight |
| -------------------------- | -------------- |
| Experience                 | 28%            |
| Skills                     | 30%            |
| Education                  | 18%            |
| Projects                   | 14%            |
| Trainings & Certifications | 6%             |
| Achievements               | 4%             |

**Default Count Baselines**

| Category                   | Count Needed for 100% | Formula                            |
| -------------------------- | --------------------- | ---------------------------------- |
| Experience                 | 2                     | min((experience / 2) × 100, 100)   |
| Skills                     | 10                    | min((skills / 10) × 100, 100)      |
| Education                  | 2                     | min((education / 2) × 100, 100)    |
| Projects                   | 2                     | min((projects / 2) × 100, 100)     |
| Trainings & Certifications | 2                     | min((traincert / 2) × 100, 100)    |
| Achievements               | 1                     | min((achievements / 1) × 100, 100) |

**Default Thresholds**

| Threshold           | Default Value |
| ------------------- | ------------- |
| qualified_threshold | 78            |
| review_threshold    | 65            |

#### C. Mid-Level Profile

Mid-level roles prioritize experience more heavily, while projects, trainings/certifications, and achievements provide supporting evidence.

**Default Weights**

| Category                   | Default Weight |
| -------------------------- | -------------- |
| Experience                 | 42%            |
| Skills                     | 28%            |
| Education                  | 14%            |
| Projects                   | 8%             |
| Trainings & Certifications | 5%             |
| Achievements               | 3%             |

**Default Count Baselines**

| Category                   | Count Needed for 100% | Formula                            |
| -------------------------- | --------------------- | ---------------------------------- |
| Experience                 | 4                     | min((experience / 4) × 100, 100)   |
| Skills                     | 12                    | min((skills / 12) × 100, 100)      |
| Education                  | 2                     | min((education / 2) × 100, 100)    |
| Projects                   | 2                     | min((projects / 2) × 100, 100)     |
| Trainings & Certifications | 2                     | min((traincert / 2) × 100, 100)    |
| Achievements               | 1                     | min((achievements / 1) × 100, 100) |

**Default Thresholds**

| Threshold           | Default Value |
| ------------------- | ------------- |
| qualified_threshold | 80            |
| review_threshold    | 68            |

### Requirement Matching Details

The Requirement Match Score is computed by matching applicant resume content against the expected job requirements per category.

#### 1. Skills Matching

1. Extract resume skills from the parsed resume
2. Normalize values (lowercase, remove special characters)
3. Compare with job-required skills
4. Count matches using exact and partial matching

```python
# Example
job_skills = ['c#', '.net', 'asp.net', 'html', 'css', 'mssql']
resume_skills = ['c#', 'asp.net', 'html', 'css']
match = 4 / 6 * 100  # 66.7%
```

#### 2. Experience Matching

1. Check role titles, responsibilities, or domain keywords in resume experience
2. Compare them with the expected job role indicators
3. Compute the percentage of matched expected indicators

#### 3. Education Matching

1. Check degree names, courses, strands, and fields of study
2. Compare them with the expected education requirements
3. Compute the percentage of matched expected education indicators

#### 4. Projects Matching

1. Compare project titles and descriptions with expected project types or technologies
2. Count exact or related keyword matches
3. Compute the percentage of matched project indicators

#### 5. Trainings & Certifications Matching

1. Extract trainings, seminars, workshops, and certifications from the resume
2. Normalize the titles and compare them with role-relevant training/certification keywords
3. Compute the percentage of matched expected indicators

#### 6. Achievements Matching

1. Extract awards, distinctions, honors, contest results, and academic achievements
2. Compare them with role-relevant or academically relevant achievement indicators
3. Compute the percentage of matched expected achievement indicators

### Applicant Level Detection Logic

The system automatically detects whether an applicant is **Fresh Graduate**, **Entry-Level**, or **Mid-Level** using a multi-factor rule-based classification:

1. **Education Recency** - current study, graduation date
2. **Relevant Work Experience** - years of experience in target role
3. **Type of Work Experience** - internship vs professional roles
4. **Role Title Indicators** - intern, junior, senior, etc.
5. **Resume Evidence Dominance** - academic-heavy vs work-heavy

**Classification Scoring Rules**

```
Education Recency
- current/ongoing study                    → Fresh +4
- graduated within last 1 year             → Fresh +3
- graduated within last 2 years            → Fresh +2

Relevant Experience Years
- 0 years                                  → Fresh +4
- 0 to <1 year                             → Fresh +2, Entry +2
- 1 to <2 years                            → Entry +5
- 2+ years                                 → Mid +6

Experience Type
- only internship/OJT/trainee roles        → Fresh +4
- at least 1 real relevant job             → Entry +3
- 2 or more real relevant jobs             → Mid +3

Role Titles
- intern / ojt / trainee / student         → Fresh +3
- junior / associate / assistant / staff   → Entry +3
- developer / engineer / analyst /
  specialist with enough experience        → Mid +2
- senior / lead / supervisor               → Mid +3

Resume Dominance
- mostly academic projects/education       → Fresh +2
- mixed academic and work evidence         → Entry +2
- mostly professional work evidence        → Mid +3
```

The applicant is assigned to the level with the highest score.

---

## 2. Video Assessment Scoring

### Overview

The video assessment scoring evaluates applicants based on their spoken responses during a video interview. The system transcribes the video and uses GPT to analyze the transcript on multiple dimensions.

### Scoring Flow

```
Applicant Records Video Response
            │
            ▼
┌─────────────────────────────────────────────────────┐
│  TRANSCRIPTION (Whisper API)                        │
│  - Convert speech to text                           │
│  - Support for English and multilingual              │
└─────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────┐
│  TRANSCRIPT VALIDATION                              │
│  - Minimum word count: 50 words                    │
│  - Minimum duration: 120 seconds (2 min)            │
│  - Maximum duration: 300 seconds (5 min)            │
└─────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────┐
│  GPT SCORING                                        │
│  - Evaluate on 4 dimensions                        │
│  - Generate justifications                          │
└─────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────┐
│  FINAL SCORE CALCULATION                            │
│  - Average of 4 dimensions                         │
│  - Scale: 0-10                                     │
└─────────────────────────────────────────────────────┘
```

### Scoring Dimensions

The video assessment scores applicants on four dimensions, each rated on a scale of 0-10:

| Dimension              | Description                                                                 |
| ---------------------- | --------------------------------------------------------------------------- |
| **Relevance to Job**   | How well does the response relate to the position? Do they address why they're interested in this specific role? |
| **Experience Alignment** | Does the applicant mention relevant work experience, past roles, or professional background that aligns with the job? |
| **Skill Evidence**     | Does the applicant demonstrate or mention skills relevant to the job? Both technical and soft skills are considered. |
| **Completeness**       | How complete is the response? Does it cover key aspects (introduction, interest in role, qualifications) or is it overly brief? |

### Scoring Formula

```python
final_score = (
    relevance_score +
    experience_score +
    skills_score +
    completeness_score
) / 4.0
```

### Validation Rules

| Rule                   | Requirement           | Status if Failed         |
| ---------------------- | --------------------- | ----------------------- |
| Minimum Word Count     | 50 words              | insufficient_response   |
| Minimum Duration       | 120 seconds (2 min)   | insufficient_response   |
| Maximum Duration       | 300 seconds (5 min)  | insufficient_response   |

### Example Output

```json
{
  "success": true,
  "final_score": 7.5,
  "relevance_score": 8,
  "experience_score": 7,
  "skills_score": 8,
  "completeness_score": 7,
  "relevance_justification": "The applicant clearly explains their interest in the Python Developer role...",
  "experience_justification": "They mention 5 years of relevant software development experience...",
  "skills_justification": "They demonstrate proficiency in Python, Django, and cloud technologies...",
  "completeness_justification": "The response covers introduction, qualifications, and interest in the role..."
}
```

---

## 3. Work Style Profiling Scoring

### Overview

The Work Style Profiling assessment evaluates applicants based on their personality traits and work preferences. It uses a 15-dimension model aligned with role family profiles to calculate an alignment score.

### Assessment Structure

- **Question Count**: 15 questions
- **Response Scale**: 5-point Likert scale (Strongly Disagree to Strongly Agree)
- **Dimensions Measured**: 15 work-style dimensions

### The 15 Work Style Dimensions

| Dimension                | Description                                                      |
| ------------------------ | ---------------------------------------------------------------- |
| Collaboration            | Enjoys working in team environments                              |
| Independence            | Prefers working independently with minimal supervision           |
| Leadership Readiness     | Comfortable taking on leadership roles                           |
| Adaptability             | Adapts quickly to changing priorities and new challenges        |
| Attention to Detail     | Pays close attention to accuracy in work                         |
| Problem Solving          | Motivated by complex problems requiring creative solutions       |
| Communication            | Communicates clearly with team members and stakeholders         |
| Stress Tolerance        | Remains calm under pressure and tight deadlines                  |
| Feedback Receptiveness  | Actively seeks feedback to improve performance                   |
| Ambiguity Tolerance     | Comfortable making decisions with incomplete information         |
| Initiative              | Takes initiative without waiting for explicit direction         |
| Relationship Building   | Prioritizes building professional relationships                 |
| Learning Orientation    | Passionate about continuous learning                             |
| Conflict Management     | Approaches conflicts constructively                              |
| Work Preference Balance | Values work-life balance                                        |

### Scoring Flow

```
Applicant Completes Assessment
            │
            ▼
┌─────────────────────────────────────────────────────┐
│  RAW ANSWER COLLECTION                             │
│  - 15 questions × 5-point scale                   │
│  - Answers: 1 (Strongly Disagree) to 5 (Strongly Agree)│
└─────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────┐
│  DIMENSION SCORING                                 │
│  - Group answers by dimension                      │
│  - Calculate average score per dimension            │
│  - Normalize to 0-100 scale                        │
└─────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────┐
│  ROLE FAMILY DETECTION                             │
│  - Auto-detect from job title                     │
│  - Load role-specific weight profile               │
└─────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────┐
│  ALIGNMENT SCORE CALCULATION                        │
│  - Apply role-specific weights                     │
│  - Calculate weighted average                      │
└─────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────┐
│  AREA CATEGORIZATION                               │
│  - Strong: score ≥ 70%                             │
│  - Moderate: 50% ≤ score < 70%                    │
│  - Development: score < 50%                       │
└─────────────────────────────────────────────────────┘
```

### Role Family Profiles

The system auto-detects the role family from the job title and applies specific weight profiles to each dimension.

#### Role Families

| Role Family   | Description                     | Example Job Titles                     |
| ------------- | -------------------------------- | -------------------------------------- |
| development   | Software Development             | Developer, Engineer, Programmer         |
| data          | Data & AI                        | Data Analyst, Data Scientist, ML       |
| design        | UI/UX Design                     | Designer, Graphic Designer              |
| security      | Cybersecurity                    | Security Analyst, Ethical Hacker        |
| network       | Network & Infrastructure         | Network Engineer, NOC Analyst           |
| cloud         | Cloud & DevOps                   | Cloud Engineer, DevOps, SRE            |
| marketing     | Marketing & Content              | Marketing Specialist, SEO              |
| business      | Business & Product               | Business Analyst, Product Manager      |
| qa            | Quality Assurance                | QA Tester, Test Automation Engineer     |
| default       | General/Default                  | Unmatched roles                        |

#### Weight Levels

| Weight Level | Value | Description                    |
| ------------ | ----- | ------------------------------ |
| high         | 1.0   | Critical for the role          |
| medium_high  | 0.85  | Very important                 |
| medium       | 0.7   | Important                      |
| low_medium   | 0.55  | Somewhat important             |
| low          | 0.4   | Less critical                 |

#### Example: Development Profile Weights

| Dimension                | Weight Level |
| ------------------------ | ------------ |
| Collaboration            | medium       |
| Independence             | medium_high  |
| Leadership Readiness     | medium       |
| Adaptability             | high         |
| Attention to Detail      | high         |
| Problem Solving          | high         |
| Communication            | medium       |
| Stress Tolerance         | medium       |
| Feedback Receptiveness   | medium       |
| Ambiguity Tolerance      | medium       |
| Initiative               | medium_high  |
| Relationship Building    | low_medium   |
| Learning Orientation     | high         |
| Conflict Management      | low_medium   |
| Work Preference Balance | medium       |

### Scoring Formulas

#### Dimension Score Calculation

```typescript
// Calculate average score per dimension
score = rawAnswers.reduce((sum, val) => sum + val, 0) / rawAnswers.length

// Normalize to 0-100
normalizedScore = (score / 5) * 100
```

#### Alignment Score Calculation

```typescript
// Calculate weighted alignment score
weightedSum = Σ (normalizedScore × weight)
totalWeight = Σ weight

finalScore = weightedSum / totalWeight
```

#### Area Categorization

| Category      | Score Range  | Description                    |
| ------------- | ------------ | ------------------------------ |
| Strong        | ≥ 70%        | Strong alignment with role     |
| Moderate      | 50% - 69%    | Adequate alignment             |
| Development   | < 50%        | Areas for development          |

### Example Output

```json
{
  "dimensionScores": [
    { "dimension": "collaboration", "score": 4.0, "rawAnswers": [4, 5] },
    { "dimension": "problem_solving", "score": 4.5, "rawAnswers": [4, 5] },
    // ... more dimensions
  ],
  "overallAlignmentScore": 78,
  "matchedRoleFamily": "development",
  "matchedRoleDisplayName": "Software Development",
  "strongAreas": ["problem_solving", "adaptability", "learning_orientation"],
  "moderateAreas": ["communication", "collaboration"],
  "developmentAreas": ["conflict_management"]
}
```

---

## 4. Overall Score Calculation

### Combined Assessment Scoring

The AutoIntel system calculates an overall score that combines all three assessment components. The default weight distribution can be configured by administrators.

### Default Weight Distribution

| Component              | Default Weight |
| ---------------------- | -------------- |
| Resume Screening       | 50%            |
| Video Assessment       | 30%            |
| Work Style Profiling   | 20%            |

### Formula

```
OVERALL_SCORE = (Resume_Score × 0.50) + (Video_Score × 0.30) + (Work_Style_Score × 0.20)
```

### Score Normalization

All three components are normalized to a 0-100 scale for consistent comparison:

- **Resume Screening**: Already on 0-100 scale
- **Video Assessment**: Convert from 0-10 to 0-100 (multiply by 10)
- **Work Style Profiling**: Already on 0-100 scale

### Final Decision Thresholds

| Status           | Overall Score Range    | Description                           |
| ---------------- | --------------------- | ------------------------------------- |
| Highly Recommended | ≥ 80                 | Strong candidate across all assessments |
| Recommended      | 70 - 79              | Good candidate                        |
| Needs Review     | 60 - 69              | Requires human review                 |
| Not Recommended | < 60                 | Does not meet requirements            |

---

## 5. Scoring Configuration

### Database Configuration

All scoring settings are stored in the `scoring_settings` table in Supabase. The system supports company-specific configurations.

### Configurable Settings

| Field                      | Description                                        |
| -------------------------- | -------------------------------------------------- |
| profile_level              | fresh_grad / entry_level / mid_level              |
| experience_weight          | Category weight for experience                    |
| skills_weight              | Category weight for skills                        |
| education_weight           | Category weight for education                     |
| projects_weight            | Category weight for projects                      |
| traincert_weight           | Category weight for trainings/certifications     |
| achievements_weight        | Category weight for achievements                  |
| baseline_experience        | Count baseline for experience                     |
| baseline_skills           | Count baseline for skills                        |
| baseline_education        | Count baseline for education                     |
| baseline_projects         | Count baseline for projects                      |
| baseline_traincert        | Count baseline for trainings/certifications     |
| baseline_achievements     | Count baseline for achievements                  |
| qualified_threshold       | Minimum score for qualified status                |
| review_threshold          | Minimum score for needs review status             |

### Admin Interface

Administrators can configure scoring weights and thresholds through the Admin Dashboard. Changes take effect immediately for new screening evaluations.

---

## Summary

The AutoIntel scoring system provides a comprehensive, multi-faceted approach to candidate evaluation:

1. **Resume Screening (50%)**: Hybrid semantic + quantity scoring with job-level specific profiles
2. **Video Assessment (30%)**: GPT-powered transcript analysis on 4 dimensions
3. **Work Style Profiling (20%)**: 15-dimension personality assessment with role-based weighting

All components are configurable, allowing companies to adjust weight distributions and thresholds to match their specific hiring priorities.
