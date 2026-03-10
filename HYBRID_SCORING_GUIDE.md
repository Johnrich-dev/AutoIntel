# Hybrid Semantic Scoring - Detailed Design

## Understanding Your Goal

You want a **company-adaptable semantic scoring system** where:
1. **Scores are based on RELEVANCE** (semantic similarity), NOT quantity
2. **Weights reflect company preferences** (not fixed rules)
3. **Any company can customize** their scoring priorities

---

## The Core Concept: Semantic Relevance

### What is "Relevance"?

Instead of counting "how many" skills/experiences:
- ❌ OLD: "Has 10 skills = 100 points"
- ✅ NEW: "How relevant are the applicant's skills to the job's required skills?"

### Example Scenarios

**Company A - Experience-Heavy**
```
Job: Senior Python Developer
- 5+ years Python experience required
- Django/Flask required

Applicant: 7 years Python, used Django
→ Experience Relevance: 95% (exceeds requirements)
→ Skills Relevance: 90% (has required + more)
→ Final Score: HIGH (experience weighted 50%)
```

**Company B - Skills-Heavy**
```
Same job & applicant
→ Experience Relevance: 95%
→ Skills Relevance: 90%
→ Final Score: DIFFERENT (skills weighted 50%)
```

---

## How Semantic Relevance Works

### 1. Job Requirements Extraction

Each job posting has structured requirements:
```json
{
  "job_id": "python-dev-001",
  "title": "Senior Python Developer",
  "description": "Build APIs and microservices...",
  "skills": ["Python", "Django", "Flask", "PostgreSQL", "Docker", "AWS"],
  "required_education": ["Bachelor's in Computer Science"],
  "expected_projects": ["API Development", "Microservices"],
  "min_years_experience": 5,
  "max_years_experience": null
}
```

### 2. Resume Components Extraction

From parsed resume:
```json
{
  "experience": [
    {"role": "Python Developer", "company": "Tech Corp", "years": "7"},
    {"role": "Backend Engineer", "company": "Startup", "years": "3"}
  ],
  "skills": {
    "hard_skills": ["Python", "Django", "Flask", "AWS", "Docker"],
    "soft_skills": ["Leadership", "Communication"]
  },
  "education": [
    {"school": "MIT", "course": "Computer Science", "degree": "Bachelor's"}
  ],
  "projects": [
    {"name": "E-commerce API", "details": "Built REST API with Django"}
  ]
}
```

### 3. Semantic Matching per Component

For each component, use BERT embeddings to measure relevance:

| Component | Resume Text | Job Requirement | Semantic Similarity |
|-----------|-------------|-----------------|---------------------|
| **Experience** | "7 years Python Developer at Tech Corp" | "5+ years Python experience" | **0.95** (95%) |
| **Skills** | "Python, Django, Flask, AWS, Docker" | "Python, Django, Flask, PostgreSQL, Docker, AWS" | **0.88** (88%) |
| **Education** | "Bachelor's in Computer Science from MIT" | "Bachelor's in Computer Science" | **0.98** (98%) |
| **Projects** | "Built E-commerce API with Django" | "API Development, Microservices" | **0.85** (85%) |

**Key Point**: This is NOT about quantity - it's about **how relevant** each item is!

---

## Company-Adaptive Weighting

### Configuration by Company Type

| Company Type | Experience Weight | Skills Weight | Education Weight | Projects Weight |
|--------------|------------------|---------------|------------------|-----------------|
| **Startup - Growth** | 20% | 50% | 10% | 20% |
| **Enterprise - Stable** | 40% | 30% | 20% | 10% |
| **Research/Academic** | 20% | 20% | 40% | 20% |
| **Agency - Project-based** | 20% | 30% | 10% | 40% |
| **Default** | 40% | 30% | 20% | 10% |

### Example: Company A vs Company B

**Job**: Senior Python Developer

**Applicant Profile**:
- Experience: 7 years Python (95% relevance)
- Skills: 8/10 required skills (88% relevance)
- Education: Match (98% relevance)
- Projects: 2 relevant projects (85% relevance)

**Company A (Experience-Heavy: 50/30/10/10)**
```
Score = (95 × 0.50) + (88 × 0.30) + (98 × 0.10) + (85 × 0.10)
      = 47.5 + 26.4 + 9.8 + 8.5
      = 92.2 / 100
```

**Company B (Skills-Heavy: 20/50/10/20)**
```
Score = (95 × 0.20) + (88 × 0.50) + (98 × 0.10) + (85 × 0.20)
      = 19.0 + 44.0 + 9.8 + 17.0
      = 89.8 / 100
```

**Same applicant, different company priorities → different scores!**

---

## Implementation Architecture

### Step 1: Semantic Component Scoring

```python
def calculate_semantic_relevance(resume_text: str, requirement_text: str) -> float:
    """
    Use BERT embeddings to calculate semantic similarity
    between resume content and job requirements.
    
    Returns: 0.0 to 1.0 (0% to 100% relevance)
    """
    # Get embeddings
    resume_embedding = model.encode(resume_text)
    requirement_embedding = model.encode(requirement_text)
    
    # Cosine similarity = semantic relevance
    similarity = cosine_similarity(resume_embedding, requirement_embedding)
    return max(0.0, min(1.0, similarity))
```

### Step 2: Extract Relevant Text per Component

```python
def extract_experience_text(experience_list: list) -> str:
    """Combine experience entries into searchable text."""
    texts = []
    for exp in experience_list:
        text = f"{exp.get('role', '')} at {exp.get('company', '')} for {exp.get('years', '')} years"
        if exp.get('summary'):
            text += f". {exp['summary']}"
        texts.append(text)
    return " ".join(texts)

def extract_skills_text(skills_dict: dict) -> str:
    """Combine all skills into searchable text."""
    all_skills = skills_dict.get('hard_skills', []) + skills_dict.get('soft_skills', [])
    return " ".join(all_skills)

def extract_education_text(education_list: list) -> str:
    """Combine education entries."""
    texts = []
    for edu in education_list:
        text = f"{edu.get('degree', '')} in {edu.get('course_or_strand', '')} at {edu.get('school', '')}"
        texts.append(text)
    return " ".join(texts)

def extract_projects_text(projects_list: list) -> str:
    """Combine project entries."""
    texts = []
    for proj in projects_list:
        text = f"{proj.get('name', '')}: {proj.get('details', '')}"
        texts.append(text)
    return " ".join(texts)
```

### Step 3: Calculate Component Scores

```python
def calculate_component_scores(parsed_resume: dict, job_posting: dict) -> dict:
    """Calculate semantic relevance for each component."""
    
    # Extract texts from resume
    exp_text = extract_experience_text(parsed_resume.get('experience', []))
    skills_text = extract_skills_text(parsed_resume.get('skills', {}))
    edu_text = extract_education_text(parsed_resume.get('education', []))
    proj_text = extract_projects_text(parsed_resume.get('projects', []))
    
    # Build requirement texts from job
    exp_req = f"{job_posting.get('min_years_experience', 0)}+ years in relevant work"
    skills_req = " ".join(job_posting.get('skills', []))
    edu_req = " ".join(job_posting.get('required_education', []))
    proj_req = " ".join(job_posting.get('expected_projects', []))
    
    # Calculate semantic relevance for each
    return {
        "experience_relevance": calculate_semantic_relevance(exp_text, exp_req),
        "skills_relevance": calculate_semantic_relevance(skills_text, skills_req),
        "education_relevance": calculate_semantic_relevance(edu_text, edu_req),
        "projects_relevance": calculate_semantic_relevance(proj_text, proj_req)
    }
```

### Step 4: Apply Company Weights

```python
def calculate_weighted_score(component_scores: dict, weights: dict) -> float:
    """Apply company-preference weights to component scores."""
    
    # Convert weights from percentage to decimal
    exp_w = weights.get('experience_weight', 40) / 100
    skills_w = weights.get('skills_weight', 30) / 100
    edu_w = weights.get('education_weight', 20) / 100
    proj_w = weights.get('projects_weight', 10) / 100
    
    # Calculate weighted score (0-100 scale)
    weighted_score = (
        component_scores['experience_relevance'] * exp_w * 100 +
        component_scores['skills_relevance'] * skills_w * 100 +
        component_scores['education_relevance'] * edu_w * 100 +
        component_scores['projects_relevance'] * proj_w * 100
    )
    
    return round(weighted_score, 2)
```

### Step 5: Make It Multi-Tenant

```python
def get_company_scoring_settings(supabase_client, company_id: str) -> dict:
    """Load company-specific weights."""
    
    # Each company has their own settings
    result = supabase_client.table('scoring_settings').select('*').eq(
        'company_id', company_id
    ).maybeSingle()
    
    return result.data or DEFAULT_SETTINGS
```

---

## Why This Approach Works

### 1. **Semantic, Not Quantitative**
- ❌ NOT: "Has 10 skills = 100 points"
- ✅ YES: "How relevant are these skills to what's needed?"

### 2. **Company-Adaptable**
- Each company sets their own weights
- Same resume scores differently based on company preferences
- Perfect for multi-tenant SaaS

### 3. **Transparent**
- Can show breakdown: "Experience: 95%, Skills: 88%, etc."
- Applicants can understand their score
- Admin can debug scoring issues

### 4. **Flexible**
- Easy to add new components (certifications, languages, etc.)
- Can adjust weights anytime
- Can have different weights per job type

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        COMPANY PREFERENCES                          │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  scoring_settings (per company)                             │    │
│  │  - experience_weight: 50% (Company A wants experience)      │    │
│  │  - skills_weight: 30%                                       │    │
│  │  - education_weight: 10%                                    │    │
│  │  - projects_weight: 10%                                     │    │
│  └─────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        JOB REQUIREMENTS                             │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  job_postings                                               │    │
│  │  - skills: ["Python", "Django", "AWS"]                      │    │
│  │  - required_education: ["Bachelor's CS"]                    │    │
│  │  - min_years_experience: 5                                  │    │
│  │  - expected_projects: ["API", "Microservices"]              │    │
│  └─────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        APPLICANT RESUME                             │
│  ┌─────────────────────────────────────────────────────────────┐    │ 
│  │  parsed_resume_json                                         │    │
│  │  - experience: [...]                                        │    │
│  │  - skills: {hard_skills: [...], soft_skills: [...]}         │    │
│  │  - education: [...]                                         │    │
│  │  - projects: [...]                                          │    │
│  └─────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    SEMANTIC RELEVANCE CALCULATION                   │
│                                                                     │
│  Experience:  BERT("7 yrs Python dev at TechCorp")                  │
│                vs                                                   │
│                BERT("5+ years Python experience")                   │
│                = 95% relevance                                      │
│                                                                     │
│  Skills:       BERT("Python Django Flask AWS Docker")               │
│                vs                                                   │
│                BERT("Python Django AWS PostgreSQL Docker")          │
│                = 88% relevance                                      │
│                                                                     │
│  Education:   BERT("BS Computer Science MIT")                       │
│                vs                                                   │
│                BERT("Bachelor's Computer Science")                  │
│                = 98% relevance                                      │
│                                                                     │
│  Projects:     BERT("E-commerce API Django REST")                   │
│                vs                                                   │
│                BERT("API Development Microservices")                │
│                = 85% relevance                                      │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    WEIGHTED SCORE CALCULATION                       │
│                                                                     │
│  Final = (95 × 0.50) + (88 × 0.30) + (98 × 0.10) + (85 × 0.10)      │
│       = 47.5 + 26.4 + 9.8 + 8.5                                     │
│       = 92.2 / 100                                                  │
│                                                                     │
│  Then compare to thresholds:                                        │
│  - qualified_threshold: 80 → PASS                                   │
│  - review_threshold: 60 → REVIEW                                    │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Summary

| Aspect | Your Requirement | Solution |
|--------|------------------|----------|
| **Scoring Basis** | Relevance, not quantity | BERT semantic similarity per component |
| **Company Preferences** | Adjustable weights | `scoring_settings` per company |
| **Multi-tenant** | Any company can use | Company ID in settings query |
| **Job Matching** | Compare resume to job | Extract requirements, match semantically |

This approach makes your system truly **company-adaptable** - the same applicant can pass or fail based solely on the hiring company's priorities!