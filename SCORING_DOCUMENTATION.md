````markdown
# AutoIntel Resume Screening Scoring System

## Overview

The AutoIntel recruitment system uses a **hybrid scoring approach** that combines:

1. **Requirement Match Score (60%)** - Measures how well the resume content aligns with the job requirements through category-based matching across experience, skills, education, projects, trainings/certifications, and achievements.
2. **Count Score (40%)** - Measures whether the applicant meets the expected baseline quantity for the same categories using HR-admin configurable category weights.

```text
FINAL SCORE = (Requirement Match Score × 0.6) + (Count Score × 0.4)
````

The scoring is designed for **Fresh Graduate**, **Entry-Level**, and **Mid-Level** hiring. The HR admin selects the job level in the job posting, and the system loads the default scoring profile for that level. HR may still adjust the weights, baselines, and thresholds as needed.

---

## Flow Diagram

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│                      RESUME SCREENING FLOW                                  │
└──────────────────────────────────────────────────────────────────────────────┘

      Email with Resume
             │
             ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  1. RESUME PARSING (resume_parser.py)                                       │
│     - Extract text from PDF/DOCX                                            │
│     - GPT cleaning                                                           │
│     - BERT NER for entity extraction                                        │
│     - Parse into structured JSON:                                           │
│       { skills, experience, education, projects, trainings,                 │
│         certifications, achievements }                                      │
└──────────────────────────────────────────────────────────────────────────────┘
             │
             ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  2. JOB MATCHING (resume_collector.py / job_alignment.py)                   │
│     - Match resume to job posting                                           │
│     - Strategies: exact title → role_family → fallback                      │
│     - Get job requirements: skills, education, projects, experience,        │
│       trainings/certifications, achievements                                │
│     - Read job level: Fresh Grad / Entry-Level / Mid-Level                  │
└──────────────────────────────────────────────────────────────────────────────┘
             │
             ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  3. JOB LEVEL / APPLICANT LEVEL CHECK                                       │
│     - Primary basis: job level selected by HR in job posting                │
│     - Supporting logic: fresh grad detection from parsed resume             │
│     - Used to load default baselines, weights, and thresholds               │
└──────────────────────────────────────────────────────────────────────────────┘
             │
             ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  4. HYBRID SCORING (screening_service.py)                                   │
│                                                                              │
│     ┌───────────────────────────────┐  ┌───────────────────────────────┐     │
│     │   A) REQUIREMENT MATCH SCORE  │  │       B) COUNT SCORE         │     │
│     │             (60%)             │  │             (40%)            │     │
│     └───────────────────────────────┘  └───────────────────────────────┘     │
│                 │                                  │                          │
│                 ▼                                  ▼                          │
│         Experience Match %                  Experience Count                  │
│         Skills Match %                      Skills Count                      │
│         Education Match %                   Education Count                   │
│         Projects Match %                    Projects Count                    │
│         Train/Cert Match %                  Train/Cert Count                  │
│         Achievement Match %                 Achievement Count                 │
│                 │                                  │                          │
│                 └────────────────┬─────────────────┘                          │
│                                  ▼                                            │
│                        FINAL COMBINED SCORE                                   │
└──────────────────────────────────────────────────────────────────────────────┘
             │
             ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  5. DECISION & NOTIFICATION                                                  │
│     - qualified: score ≥ qualified_threshold                                 │
│     - needs_review: review_threshold ≤ score < qualified_threshold           │
│     - not_recommended: score < review_threshold                              │
│                                                                              │
│     Send screening result to HR dashboard / applicant workflow               │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Job-Level Scoring Profiles

### A. Fresh Graduate Profile

Fresh graduate roles place more value on skills, education, projects, and supporting credentials because work experience is still limited.

#### Default Weights

| Category                   | Default Weight |
| -------------------------- | -------------- |
| Experience                 | 18%            |
| Skills                     | 30%            |
| Education                  | 22%            |
| Projects                   | 18%            |
| Trainings & Certifications | 7%             |
| Achievements               | 5%             |

#### Default Count Baselines

| Category                   | Count Needed for 100% | Formula                            |
| -------------------------- | --------------------- | ---------------------------------- |
| Experience                 | 1                     | min((experience / 1) × 100, 100)   |
| Skills                     | 8                     | min((skills / 8) × 100, 100)       |
| Education                  | 2                     | min((education / 2) × 100, 100)    |
| Projects                   | 2                     | min((projects / 2) × 100, 100)     |
| Trainings & Certifications | 2                     | min((traincert / 2) × 100, 100)    |
| Achievements               | 1                     | min((achievements / 1) × 100, 100) |

#### Default Thresholds

| Threshold           | Default Value |
| ------------------- | ------------- |
| qualified_threshold | 75            |
| review_threshold    | 60            |

---

### B. Entry-Level Profile

Entry-level roles still value skills strongly, but experience becomes more important than in fresh graduate roles.

#### Default Weights

| Category                   | Default Weight |
| -------------------------- | -------------- |
| Experience                 | 28%            |
| Skills                     | 30%            |
| Education                  | 18%            |
| Projects                   | 14%            |
| Trainings & Certifications | 6%             |
| Achievements               | 4%             |

#### Default Count Baselines

| Category                   | Count Needed for 100% | Formula                            |
| -------------------------- | --------------------- | ---------------------------------- |
| Experience                 | 2                     | min((experience / 2) × 100, 100)   |
| Skills                     | 10                    | min((skills / 10) × 100, 100)      |
| Education                  | 2                     | min((education / 2) × 100, 100)    |
| Projects                   | 2                     | min((projects / 2) × 100, 100)     |
| Trainings & Certifications | 2                     | min((traincert / 2) × 100, 100)    |
| Achievements               | 1                     | min((achievements / 1) × 100, 100) |

#### Default Thresholds

| Threshold           | Default Value |
| ------------------- | ------------- |
| qualified_threshold | 78            |
| review_threshold    | 65            |

---

### C. Mid-Level Profile

Mid-level roles prioritize experience more heavily, while projects, trainings/certifications, and achievements provide supporting evidence.

#### Default Weights

| Category                   | Default Weight |
| -------------------------- | -------------- |
| Experience                 | 42%            |
| Skills                     | 28%            |
| Education                  | 14%            |
| Projects                   | 8%             |
| Trainings & Certifications | 5%             |
| Achievements               | 3%             |

#### Default Count Baselines

| Category                   | Count Needed for 100% | Formula                            |
| -------------------------- | --------------------- | ---------------------------------- |
| Experience                 | 4                     | min((experience / 4) × 100, 100)   |
| Skills                     | 12                    | min((skills / 12) × 100, 100)      |
| Education                  | 2                     | min((education / 2) × 100, 100)    |
| Projects                   | 2                     | min((projects / 2) × 100, 100)     |
| Trainings & Certifications | 2                     | min((traincert / 2) × 100, 100)    |
| Achievements               | 1                     | min((achievements / 1) × 100, 100) |

#### Default Thresholds

| Threshold           | Default Value |
| ------------------- | ------------- |
| qualified_threshold | 80            |
| review_threshold    | 68            |

---

## Company-Adaptable Scoring Settings

The scoring values are stored in the `scoring_settings` table in Supabase and may be loaded based on the job level selected by HR.

### Recommended Fields

| Field                 | Description                                      |
| --------------------- | ------------------------------------------------ |
| job_level             | fresh_grad / entry_level / mid_level             |
| experience_weight     | Category weight for experience                   |
| skills_weight         | Category weight for skills                       |
| education_weight      | Category weight for education                    |
| projects_weight       | Category weight for projects                     |
| traincert_weight      | Category weight for trainings and certifications |
| achievements_weight   | Category weight for achievements                 |
| baseline_experience   | Count baseline for experience                    |
| baseline_skills       | Count baseline for skills                        |
| baseline_education    | Count baseline for education                     |
| baseline_projects     | Count baseline for projects                      |
| baseline_traincert    | Count baseline for trainings and certifications  |
| baseline_achievements | Count baseline for achievements                  |
| qualified_threshold   | Minimum score for qualified                      |
| review_threshold      | Minimum score for needs review                   |

**Note:** The weights for each job level should always total **100%**.

---

## Requirement Matching Details

Requirement Match Score is computed by matching applicant resume content against the expected job requirements per category.

### 1. Skills Matching (`calculate_skills_keyword_match`)

1. Extract resume skills from the parsed resume.
2. Normalize values (lowercase, remove special characters where needed).
3. Compare with job-required skills.
4. Count matches using exact and partial matching.

```python
# Example
job_skills = ['c#', '.net', 'asp.net', 'html', 'css', 'mssql']
resume_skills = ['c#', 'asp.net', 'html', 'css']
match = 4 / 6 * 100  # 66.7%
```

### 2. Experience Matching (`calculate_experience_keyword_match`)

1. Check role titles, responsibilities, or domain keywords in resume experience.
2. Compare them with the expected job role indicators.
3. Compute the percentage of matched expected indicators.

### 3. Education Matching (`calculate_education_keyword_match`)

1. Check degree names, courses, strands, and fields of study.
2. Compare them with the expected education requirements.
3. Compute the percentage of matched expected education indicators.

### 4. Projects Matching (`calculate_projects_keyword_match`)

1. Compare project titles and descriptions with expected project types or technologies.
2. Count exact or related keyword matches.
3. Compute the percentage of matched project indicators.

### 5. Trainings & Certifications Matching (`calculate_traincert_keyword_match`)

1. Extract trainings, seminars, workshops, and certifications from the resume.
2. Normalize the titles and compare them with role-relevant training/certification keywords.
3. Compute the percentage of matched expected indicators.

**Examples:**

* AWS certification for a cloud-related role
* TESDA certificate for technical support or operations roles
* Bootcamp, workshop, or seminar related to the target job

### 6. Achievements Matching (`calculate_achievement_keyword_match`)

1. Extract awards, distinctions, honors, contest results, and academic achievements.
2. Compare them with role-relevant or academically relevant achievement indicators.
3. Compute the percentage of matched expected achievement indicators.

**Examples:**

* Dean’s List
* Latin honors
* Hackathon awards
* Capstone awards
* Academic excellence awards

---

## Relevance Rules for Trainings, Certifications, and Achievements

Not all supporting items should have equal impact. The system should only give strong credit to **relevant** trainings, certifications, and achievements.

### Suggested Interpretation

| Relevance Level | Description                         | Suggested Credit     |
| --------------- | ----------------------------------- | -------------------- |
| High            | Directly related to the target role | Full credit          |
| Medium          | Related but not central to the role | Partial credit       |
| Low             | General or unrelated item           | Minimal or no credit |

**Examples**

* High relevance: AWS Cloud Practitioner for cloud support role
* Medium relevance: general coding bootcamp for software role
* Low relevance: unrelated participation webinar

---

## Requirement Match Score Formula

The Requirement Match Score uses the selected job-level weights.

### Fresh Graduate

```text
Requirement Match Score =
(experience_match × 0.18) +
(skills_match × 0.30) +
(education_match × 0.22) +
(projects_match × 0.18) +
(traincert_match × 0.07) +
(achievement_match × 0.05)
```

### Entry-Level

```text
Requirement Match Score =
(experience_match × 0.28) +
(skills_match × 0.30) +
(education_match × 0.18) +
(projects_match × 0.14) +
(traincert_match × 0.06) +
(achievement_match × 0.04)
```

### Mid-Level

```text
Requirement Match Score =
(experience_match × 0.42) +
(skills_match × 0.28) +
(education_match × 0.14) +
(projects_match × 0.08) +
(traincert_match × 0.05) +
(achievement_match × 0.03)
```

---

## Count Score Formula

The Count Score also uses the selected job-level weights, but the per-category score is based on the applicant’s count against the configured baseline.

### General Formula

```text
category_count_score = min((count / baseline) × 100, 100)
```

### Fresh Graduate

```text
Count Score =
(experience_count_score × 0.18) +
(skills_count_score × 0.30) +
(education_count_score × 0.22) +
(projects_count_score × 0.18) +
(traincert_count_score × 0.07) +
(achievement_count_score × 0.05)
```

### Entry-Level

```text
Count Score =
(experience_count_score × 0.28) +
(skills_count_score × 0.30) +
(education_count_score × 0.18) +
(projects_count_score × 0.14) +
(traincert_count_score × 0.06) +
(achievement_count_score × 0.04)
```

### Mid-Level

```text
Count Score =
(experience_count_score × 0.42) +
(skills_count_score × 0.28) +
(education_count_score × 0.14) +
(projects_count_score × 0.08) +
(traincert_count_score × 0.05) +
(achievement_count_score × 0.03)
```

**Penalty Rule:** By default, scores below baseline are proportional. A stricter penalty rule may be enabled for selected categories if required by the company.

---

## Fresh Graduate Detection Logic

Fresh graduate detection can still be used as a supporting logic, especially when HR has not fully configured the job yet. However, the **primary basis** of scoring should be the **job level selected by HR**.

```python
def is_fresh_grad_detected(parsed_resume_json):
    # Check 1: No experience at all
    if not experience_list:
        return True

    # Check 2: Only internship/trainee/student roles
    has_intern_only = True
    for exp in experience_list:
        role = exp.get('role', '').lower()
        if 'intern' not in role and 'trainee' not in role and 'student' not in role:
            has_intern_only = False
            break
    if has_intern_only:
        return True

    # Check 3: Current education (present/current year)
    for edu in education_list:
        year_range = edu.get('year_range', '').lower()
        if 'present' in year_range or 'current' in year_range:
            return True

    return False
```

**Note:** In implementation, the current year check should be dynamic rather than hardcoded.

---

## Example Calculation

### Applicant: John Rich Alaya-ay

### Job Level: Fresh Graduate

### Target Role: Application Developer

**Resume Content**

* Experience: 1 (Application Developer Intern)
* Skills: 12 (C#, PHP, C++, Python, HTML, CSS, ASP.NET, SQL, etc.)
* Education: 2 (BS Computer Science, STEM)
* Projects: 4 (AutoIntel, Payroll System, Game, Ecommerce)
* Trainings & Certifications: 1 (Relevant seminar/workshop)
* Achievements: 1 (Academic/technical achievement)

**Job Requirements**

* Experience: `['application developer', 'software developer']`
* Skills: `['c#', '.net', 'asp.net', 'html', 'css', 'mssql']`
* Education: `['computer science', 'IT', 'software engineering']`
* Projects: `['web application', 'database system', 'ai/ml project']`
* Trainings/Certifications: `['software development training', 'programming certification']`
* Achievements: `['academic excellence', 'project award']`

### Requirement Match Score Calculation

| Component                  | Match Basis   | Score |
| -------------------------- | ------------- | ----- |
| Experience                 | 1 / 2 matched | 50.0% |
| Skills                     | 4 / 6 matched | 66.7% |
| Education                  | 2 / 3 matched | 66.7% |
| Projects                   | 1 / 3 matched | 33.3% |
| Trainings & Certifications | 1 / 2 matched | 50.0% |
| Achievements               | 1 / 2 matched | 50.0% |

Using the **Fresh Graduate** default weights:

```text
Requirement Match Score =
(50.0 × 0.18) +
(66.7 × 0.30) +
(66.7 × 0.22) +
(33.3 × 0.18) +
(50.0 × 0.07) +
(50.0 × 0.05)
```

```text
= 9.00 + 20.01 + 14.67 + 5.99 + 3.50 + 2.50
= 55.67%
```

### Count Score Calculation

| Component                  | Count | Baseline | Score  |
| -------------------------- | ----- | -------- | ------ |
| Experience                 | 1     | 1        | 100.0% |
| Skills                     | 12    | 8        | 100.0% |
| Education                  | 2     | 2        | 100.0% |
| Projects                   | 4     | 2        | 100.0% |
| Trainings & Certifications | 1     | 2        | 50.0%  |
| Achievements               | 1     | 1        | 100.0% |

Using the **Fresh Graduate** default weights:

```text
Count Score =
(100.0 × 0.18) +
(100.0 × 0.30) +
(100.0 × 0.22) +
(100.0 × 0.18) +
(50.0 × 0.07) +
(100.0 × 0.05)
```

```text
= 18.00 + 30.00 + 22.00 + 18.00 + 3.50 + 5.00
= 96.50%
```

### Final Combined Score

```text
FINAL SCORE = (Requirement Match Score × 0.6) + (Count Score × 0.4)

FINAL SCORE = (55.67 × 0.6) + (96.50 × 0.4)
FINAL SCORE = 33.40 + 38.60
FINAL SCORE = 72.00%
```

**Result:** `needs_review` or `qualified` depending on the configured Fresh Graduate threshold.
With the recommended threshold of **75**, this example becomes **needs_review**.
If the company lowers the threshold, it may become **qualified**.

---

## Decision Logic

| Status          | Rule                                           |
| --------------- | ---------------------------------------------- |
| qualified       | score ≥ qualified_threshold                    |
| needs_review    | review_threshold ≤ score < qualified_threshold |
| not_recommended | score < review_threshold                       |

This keeps the system as a **decision-support tool** rather than a fully automated final hiring system.

---

## Key Files

| File                   | Purpose                                          |
| ---------------------- | ------------------------------------------------ |
| `job_alignment.py`     | Core matching and scoring logic                  |
| `screening_service.py` | Orchestrates the screening process               |
| `resume_collector.py`  | Processes incoming applications and matches jobs |
| `resume_parser.py`     | Parses resume files into structured JSON         |

---

## Troubleshooting

### Scores are too low?

1. Check whether the job posting has complete requirements in all categories.
2. Verify the selected job level and loaded scoring profile.
3. Check the category weights in the `scoring_settings` table.
4. Check the configured baselines and thresholds.

### Scores are too high?

1. Review whether the baselines are too low for the selected job level.
2. Check whether unrelated trainings, certifications, or achievements are being counted.
3. Verify that duplicate skills, projects, or entries are not inflating the count.

### Scoring crashes?

1. Check for `None` values in parsed resume data.
2. Verify that all required fields exist in `job_posting`.
3. Confirm that weight, baseline, and threshold settings are present in the database.

### Fresh grad not detected?

1. Check if education `year_range` contains `"present"` or other current-study indicators.
2. Verify that experience entries use role names such as `"intern"` or `"trainee"` where applicable.
3. Ensure the current year logic in implementation is dynamic and not hardcoded.

### Matching looks weak?

1. Review the job requirement keywords.
2. Check normalization and matching rules for skills and role titles.
3. Confirm that trainings/certifications and achievements are filtered by relevance.

```

A small recommendation: for the actual system, let **HR choose the job level first** and use fresh-grad detection only as a backup hint, not as the main controller of scoring.
```
