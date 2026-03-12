# Resume Parser Flow Documentation

## Overview

The `resume_parser.py` is a refactored resume parser for AutoIntel that combines deterministic section/block parsing with GPT cleaning and BERT NER for entity extraction.

## Design Goals

- Trust GPT-cleaned text for section order and entry grouping
- Use deterministic section/block parsing for structure
- Use BERT NER only as enrichment/fallback for simple entities
- Output a confirmed target `parsed_data` shape

---

## Overall Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        RESUME PARSER FLOW                                │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                    ┌───────────────────────────────┐
                    │   1. Initialize & Setup        │
                    │   - Load environment variables │
                    │   - Initialize Supabase client │
                    │   - Load BERT NER model        │
                    └───────────────────────────────┘
                                    │
                                    ▼
                    ┌───────────────────────────────┐
                    │   2. process_pending_resumes() │
                    │   - Fetch resumes from DB     │
                    │   - Filter pending resumes     │
                    └───────────────────────────────┘
                                    │
                                    ▼
                    ┌───────────────────────────────┐
                    │   3. For Each Resume           │
                    │   ┌─────────────────────────┐  │
                    │   │ a. Validate Content     │  │
                    │   │    (min 50 chars)       │  │
                    │   └─────────────────────────┘  │
                    │              │                  │
                    │              ▼                  │
                    │   ┌─────────────────────────┐  │
                    │   │ b. GPT Text Cleaning    │  │
                    │   │    clean_with_gpt()     │  │
                    │   └─────────────────────────┘  │
                    │              │                  │
                    │              ▼                  │
                    │   ┌─────────────────────────┐  │
                    │   │ c. Split Into Sections  │  │
                    │   │    split_into_sections()│  │
                    │   └─────────────────────────┘  │
                    │              │                  │
                    │              ▼                  │
                    │   ┌─────────────────────────┐  │
                    │   │ d. BERT NER Extraction  │  │
                    │   │    extract_entities_bert│  │
                    │   └─────────────────────────┘  │
                    │              │                  │
                    │              ▼                  │
                    │   ┌─────────────────────────┐  │
                    │   │ e. Extract Contact Info │  │
                    │   │    - Name               │  │
                    │   │    - Email              │  │
                    │   │    - Phone              │  │
                    │   └─────────────────────────┘  │
                    │              │                  │
                    │              ▼                  │
                    │   ┌─────────────────────────┐  │
                    │   │ f. Parse Each Section   │  │
                    │   │    - Education          │  │
                    │   │    - Experience         │  │
                    │   │    - Skills             │  │
                    │   │    - Projects           │  │
                    │   │    - Trainings          │  │
                    │   └─────────────────────────┘  │
                    │              │                  │
                    │              ▼                  │
                    │   ┌─────────────────────────┐  │
                    │   │ g. Return Parsed Data   │  │
                    │   └─────────────────────────┘  │
                    └───────────────────────────────┘
                                    │
                                    ▼
                    ┌───────────────────────────────┐
                    │   4. Update Database           │
                    │   - Store parsed_data          │
                    │   - Update status flags        │
                    └───────────────────────────────┘
```

---

## Detailed Step-by-Step Flow

### Step 1: Initialization & Setup

| Component | Description |
|-----------|-------------|
| **Environment Variables** | Load `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` |
| **Supabase Client** | Create client for database operations |
| **BERT NER Model** | Load `yashpwr/resume-ner-bert-v2` model on demand |
| **Constants** | `SECTION_ALIASES`, `TECH_CANONICAL`, `TECH_KEYWORDS`, `SHS_STRANDS` |

### Step 2: Fetch Pending Resumes

```python
process_pending_resumes()
```

1. Query `resumes` table for records with `raw_extracted_content`
2. Filter for resumes where `gpt_status != "success"`
3. Process each resume sequentially

### Step 3: Parse Individual Resume

#### 3a. Content Validation

```python
if not raw_text or len(raw_text.strip()) < 50:
    return error_response
```

- Minimum 50 characters required
- Returns error structure if insufficient content

#### 3b. GPT Text Cleaning

```python
cleaned_text, gpt_status = clean_with_gpt(raw_text)
```

- Uses GPT to clean and structure raw resume text
- Handles formatting issues, OCR errors
- Status values: `"success"`, `"failed"`, `"skipped"`

#### 3c. Section Splitting

```python
sections = split_into_sections(text_for_parsing)
```

**Defined Sections:**
| Section | Aliases |
|---------|---------|
| `HEADER` | Contact info at top |
| `SUMMARY` | summary, profile, objective, about me |
| `EXPERIENCE` | work experience, employment history, professional experience |
| `EDUCATION` | education, educational background, academic background |
| `SKILLS` | skills, technical skills, core skills, competencies |
| `PROJECTS` | projects, personal projects, academic projects |
| `TRAININGS` | certifications, trainings, seminars, workshops, bootcamps |

#### 3d. BERT NER Extraction

```python
bert_header = extract_entities_bert(header_block)
bert_skills = extract_entities_bert(skills_block)
```

- Extracts entities: names, emails, phones, colleges, degrees, companies, job_titles, skills
- Uses `yashpwr/resume-ner-bert-v2` model
- Limited to first 2048 characters due to token limits

#### 3e. Contact Information Extraction

| Field | Primary Method | Fallback Method |
|-------|---------------|-----------------|
| **Name** | `extract_full_name()` from header | BERT NER names |
| **Email** | Regex in header | BERT NER emails |
| **Phone** | Regex patterns in header | BERT NER phones |

#### 3f. Section Parsing Functions

| Function | Output | Key Operations |
|----------|--------|----------------|
| `parse_education_section()` | List of education entries | Extract school, course/strand, education type, year range |
| `parse_experience_section()` | List of work experiences | Extract role, company, years, summary |
| `parse_skills_section()` | List of skills | Normalize tech names, filter by keywords |
| `parse_projects_section()` | List of projects | Extract name, date, details |
| `parse_trainings_section()` | List of certifications | Extract title, date |

### Step 4: Database Update

```python
update_data = {
    "parsed_data": json.dumps(parsed_data),
    "gpt_cleaning_status": parsed_data.get("gpt_cleaning_status"),
    "cleaned_resume_text": parsed_data.get("cleaned_resume_text"),
    "ner_status": "completed",
}
sb.table("resumes").update(update_data).eq("id", resume_id).execute()
```

---

## Output Data Structure

```python
{
    "name": str | None,           # Full name
    "email": str | None,          # Email address
    "phone": str | None,          # Phone number
    "education": [                 # List of education entries
        {
            "school": str,
            "course_or_strand": str,
            "education_type": str,   # "Senior High School", "College", "Other"
            "year_range": str
        }
    ],
    "experience": [               # List of work experiences
        {
            "role": str,
            "company": str,
            "years": str,
            "summary": str
        }
    ],
    "skills": [str],               # List of normalized skill names
    "projects": [                 # List of projects
        {
            "name": str,
            "date": str,
            "details": str
        }
    ],
    "trainings": [                 # List of certifications/trainings
        {
            "title": str,
            "date": str | None
        }
    ],
    "parsed_at": str,              # ISO timestamp
    "ner_method": str,             # "BERT"
    "gpt_cleaning_status": str,   # "success", "failed", "skipped"
    "cleaned_resume_text": str     # GPT-cleaned text
}
```

---

## Key Functions Reference

| Function | Lines | Purpose |
|----------|-------|---------|
| `get_supabase()` | 154-159 | Initialize/get Supabase client |
| `get_bert_ner()` | 162-170 | Load BERT NER model |
| `extract_entities_bert()` | 173-244 | Extract named entities using BERT |
| `extract_full_name()` | 305-310 | Extract name from header |
| `extract_email()` | 260-261 | Extract email using regex |
| `extract_phone()` | 264-278 | Extract phone using regex |
| `split_into_sections()` | 350-363 | Split text into resume sections |
| `parse_education_section()` | 409-460 | Parse education entries |
| `parse_experience_section()` | 473-514 | Parse work experience |
| `parse_skills_section()` | 543-581 | Parse skills list |
| `parse_projects_section()` | 592-610 | Parse projects |
| `parse_trainings_section()` | 620-642 | Parse certifications/trainings |
| `parse_resume()` | 645-710 | Main parsing function |
| `process_pending_resumes()` | 713-766 | Batch process resumes from DB |

---

## Dependencies

- **supabase**: Database client
- **transformers**: BERT NER model (`yashpwr/resume-ner-bert-v2`)
- **gpt_extractor**: GPT text cleaning (imported from `gpt_extractor.py`)
- **dotenv**: Environment variable loading
- **re**: Regular expressions
- **json**: Data serialization
- **datetime**: Timestamp generation

---

## Error Handling

1. **Insufficient content**: Returns error with `"Insufficient content to parse"`
2. **GPT cleaner unavailable**: Raises `RuntimeError`
3. **GPT cleaning failure**: Raises `RuntimeError`
4. **Database update failure**: Logs error, continues to next resume
5. **BERT extraction failure**: Continues with fallback methods
