# Work Style Assessment - Semantic Scoring System

## Overview

This document describes the new semantic scoring system for the Work Style Assessment, which replaces the legacy rule-based approach with a flexible, adaptable hybrid scoring system.

## Architecture

### Components

1. **Frontend (TypeScript)**
   - [`src/config/workStyleConfig.ts`](src/config/workStyleConfig.ts) - Question definitions, dimension mappings, role profiles
   - [`src/components/PersonalityTest.tsx`](src/components/PersonalityTest.tsx) - Assessment UI with 20 Likert + 1 essay questions

2. **Backend (Python)**
   - [`work_style_scorer.py`](work_style_scorer.py) - Core semantic scoring engine
   - [`scoring_api.py`](scoring_api.py) - REST API endpoints

3. **Database (PostgreSQL/Supabase)**
   - [`supabase/migrations/add_workstyle_semantic_columns.sql`](supabase/migrations/add_workstyle_semantic_columns.sql) - Schema updates

## Scoring Methodology

### 1. Likert Scale Questions (20 Questions)

The assessment includes 20 Likert-scale questions covering 15 work-style dimensions:

| # | Question | Dimension | Reverse Coded |
|---|----------|-----------|---------------|
| 1 | I work effectively with others to achieve shared goals. | collaboration | No |
| 2 | I find it difficult to collaborate with people who have different working styles. | collaboration | **Yes** |
| 3 | I can manage my work responsibilities without constant supervision. | independence | No |
| 4 | I struggle to stay productive when working independently. | independence | **Yes** |
| 5 | I am willing to take responsibility when leading tasks or projects. | leadership_readiness | No |
| 6 | I adapt quickly when priorities or requirements change. | adaptability | No |
| 7 | I feel uncomfortable when my work environment changes suddenly. | adaptability | **Yes** |
| 8 | I carefully review my work to ensure accuracy. | attention_to_detail | No |
| 9 | I often overlook small details in my work. | attention_to_detail | **Yes** |
| 10 | I enjoy solving complex problems that require critical thinking. | problem_solving | No |
| 11 | I clearly express my ideas when communicating with others. | communication | No |
| 12 | I find it hard to explain my thoughts in a clear and structured way. | communication | **Yes** |
| 13 | I remain calm and productive under pressure. | stress_tolerance | No |
| 14 | I feel overwhelmed when working under tight deadlines. | stress_tolerance | **Yes** |
| 15 | I actively seek feedback to improve my performance. | feedback_receptiveness | No |
| 16 | I can make decisions even when information is incomplete. | ambiguity_tolerance | No |
| 17 | I take initiative without waiting to be told what to do. | initiative | No |
| 18 | I build and maintain positive working relationships with others. | relationship_building | No |
| 19 | I continuously look for opportunities to learn new skills. | learning_orientation | No |
| 20 | I avoid addressing conflicts even when they affect work outcomes. | conflict_management | **Yes** |

### 2. Essay Question

The final question is an open-ended essay prompt:

> "Describe a situation where you faced a challenging work problem or conflict. How did you handle it, and what was the outcome? What did you learn from the experience?"

This essay is evaluated using GPT-4o Mini to extract insights across multiple dimensions.

## Semantic Scoring Process

### Step 1: Reverse Coding

For questions marked as reverse-coded (questions 2, 4, 7, 9, 12, 14, 20), the answer is inverted:
- 1 → 5
- 2 → 4
- 3 → 3
- 4 → 2
- 5 → 1

### Step 2: Embedding-Based Semantic Scoring

The system uses the **all-MiniLM-L6-v2** sentence transformer model to compute semantic similarity between applicant responses and reference dimension profiles.

```python
# For each dimension:
1. Generate reference embedding from dimension descriptions
2. Encode applicant's aggregated response for that dimension
3. Calculate cosine similarity
4. Convert to 0-100 scale
```

### Step 3: GPT Essay Evaluation (Optional)

When an essay is provided, GPT-4o Mini evaluates it across all 15 dimensions:

```python
# Prompt structure:
- Provide essay text
- Request scores (0-100) for each dimension
- Ask for reasoning and narrative insights
- Return JSON with dimension_scores and insights
```

### Step 4: Hybrid Combination

Final dimension scores combine Likert and essay evaluations:

```python
hybrid_score = (embedding_score * 0.6) + (gpt_essay_score * 0.4)
```

If no essay is provided, the embedding score is used directly.

## Role Alignment

### Role Family Detection

The system auto-detects the role family from the job title using keyword matching:

| Role Family | Keywords |
|-------------|----------|
| development | developer, engineer, programmer, software, python, java, javascript, etc. |
| data | data analyst, data scientist, ml, machine learning, ai, analytics, etc. |
| design | ui, ux, designer, graphic, interaction, visual, etc. |
| security | security, cybersecurity, ethical hacker, infosec, etc. |
| network | network, noc, cisco, ccna, network engineer, etc. |
| cloud | cloud, aws, azure, gcp, devops, sre, etc. |
| marketing | marketing, seo, content, copywriter, digital, social media, etc. |
| business | business analyst, product, market research, consultant, etc. |
| qa | qa, tester, testing, sdet, quality, test automation, etc. |

### Dimension Weight Profiles

Each role family has specific weight profiles for the 15 dimensions:

```python
ROLE_FAMILY_WEIGHTS = {
    "development": {
        "collaboration": 0.7,      # medium
        "independence": 0.85,     # medium_high
        "problem_solving": 1.0,   # high
        "learning_orientation": 1.0,  # high
        # ... etc
    },
    # ... other roles
}
```

### Alignment Score Calculation

```python
# For each dimension:
weighted_score = dimension_hybrid_score * dimension_weight

# Overall alignment:
overall_alignment = sum(weighted_scores) / sum(weights)
```

## Output Format

### API Response Structure

```json
{
  "overall_alignment_score": 82.5,
  "dimension_scores": [
    {
      "dimension": "collaboration",
      "likert_score": 85.0,
      "embedding_score": 88.2,
      "essay_score": 80.0,
      "hybrid_score": 86.4,
      "reasoning": "Demonstrates strong collaborative skills..."
    },
    // ... 15 dimensions
  ],
  "matched_role_family": "development",
  "matched_role_display_name": "Software Development",
  "strong_areas": ["collaboration", "problem_solving", "learning_orientation"],
  "moderate_areas": ["communication", "adaptability"],
  "development_areas": ["attention_to_detail", "stress_tolerance"],
  "essay_insights": "Candidate demonstrates strong problem-solving...",
  "scoring_method": "hybrid",
  "timestamp": "2026-03-18T12:00:00.000000"
}
```

### Dimension Classification

- **Strong Areas**: Score ≥ 70
- **Moderate Areas**: Score 50-69
- **Development Areas**: Score < 50

## API Endpoints

### POST /api/workstyle/score

Score a complete work style assessment.

**Request:**
```json
{
  "answers": [
    {"question": 1, "answer": 5},
    {"question": 2, "answer": 2},
    // ... 20 questions
  ],
  "essay": "Optional essay text...",
  "job_title": "Software Developer",
  "use_gpt": true
}
```

### GET /api/workstyle/role-families

Get all available role families and their weight profiles.

### POST /api/workstyle/detect-role

Detect role family from a job title.

## Extensibility

### Adding New Questions

1. Add question to [`WORK_STYLE_QUESTIONS`](src/config/workStyleConfig.ts) array
2. Update [`QUESTION_DIMENSION_MAP`](work_style_scorer.py) in Python
3. Add reverse coding flag if needed

### Adding New Role Families

1. Add keywords to [`ROLE_FAMILY_KEYWORDS`](src/config/workStyleConfig.ts)
2. Add weight profile to [`ROLE_FAMILY_PROFILES`](src/config/workStyleConfig.ts)
3. Add to [`ROLE_FAMILY_WEIGHTS`](work_style_scorer.py) in Python

### Adding New Dimensions

1. Add dimension to [`DIMENSION_REFERENCE_DESCRIPTIONS`](work_style_scorer.py)
2. Update all related mappings and profiles

## Dependencies

```
# Python
sentence-transformers>=2.2.0  # For embeddings
openai>=1.0.0                # For GPT evaluation
flask>=2.3.0                 # For API
numpy>=1.24.0                # For vector operations

# Frontend
React 18+
TypeScript 5+
```

## Performance Considerations

- Embedding model is cached after first use
- Essay evaluation is the slowest step (~2-3 seconds)
- Scoring can be run asynchronously for better UX

## Error Handling

- If embedding model unavailable: Falls back to raw Likert scores
- If GPT unavailable: Uses semantic-only scoring
- All scores are normalized to 0-100 range

## Migration from Legacy System

The new system maintains backward compatibility:
- Legacy answers format still works
- Old scoring methods available as fallback
- Database columns added without removing old ones
