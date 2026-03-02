#!/usr/bin/env python3
"""
GPT-based Resume Extractor for SentinelAI

Two modes of operation:
1. clean_with_gpt() - Cleans/reorganizes messy PDF text before BERT NER
2. extract_resume_json() - Full structured extraction with GPT (text-only)

The GPT model and API key are read from environment variables:
- OPENAI_API_KEY: Required for GPT calls
- GPT_MODEL: Model name (default: gpt-4o-mini)
"""

import json
import os
import re
import time

# Load environment variables
try:
    from dotenv import load_dotenv
    load_dotenv()
except Exception:
    pass

# Configuration
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
GPT_MODEL = os.getenv("GPT_MODEL", "gpt-4o-mini")

# Retry configuration
MAX_RETRIES = 2
INITIAL_DELAY = 1.0  # seconds


def _get_gpt_client():
    """Get OpenAI client (lazy import to avoid issues when not needed)."""
    from openai import OpenAI
    if not OPENAI_API_KEY:
        raise RuntimeError("OPENAI_API_KEY environment variable is not set")
    return OpenAI(api_key=OPENAI_API_KEY)


CLEANING_PROMPT = """You are a resume text restructuring engine.

Reconstruct the following resume text into proper logical human reading order.

Rules:
- Do NOT remove any information.
- Do NOT summarize.
- Do NOT classify into JSON.
- Do NOT interpret or categorize.
- Do NOT rewrite wording.
- Do NOT rename headings.
- Only reorder lines and merge broken lines.
- Group related lines under their correct existing section headings.
- Preserve all original content exactly.

Return ONLY the cleaned resume text.
"""


def clean_with_gpt(raw_text: str, max_retries: int = MAX_RETRIES) -> tuple[str, str]:
    """
    Clean and reorganize messy resume text using GPT.
    
    Args:
        raw_text: Raw text extracted from PDF (may have multi-column issues)
        
    Returns:
        tuple: (cleaned_text, status) where status is 'success', 'failed', or 'skipped'
    """
    if not raw_text or len(raw_text.strip()) < 50:
        print("GPT cleaning SKIPPED: Input text too short (< 50 chars)")
        return raw_text, 'skipped'
    
    if not OPENAI_API_KEY:
        print("GPT cleaning SKIPPED: OPENAI_API_KEY environment variable is not set")
        print("Please set OPENAI_API_KEY in your .env file or environment")
        return raw_text, 'skipped'
    
    client = _get_gpt_client()
    
    prompt = f"""{CLEANING_PROMPT}

---
{raw_text}
---

Cleaned resume text:"""
    
    last_error = None
    delay = INITIAL_DELAY
    
    for attempt in range(max_retries + 1):
        try:
            response = client.chat.completions.create(
                model=GPT_MODEL,
                messages=[
                    {"role": "system", "content": "You are a resume text restructuring engine. Return ONLY cleaned text, no JSON, no explanations."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.1,
                max_tokens=4000
            )
            
            content = response.choices[0].message.content
            
            if not content or len(content.strip()) < 50:
                raise ValueError("Empty or too short response from GPT")
            
            # Basic validation - check it's not JSON
            if content.strip().startswith('{') or content.strip().startswith('['):
                if attempt < max_retries:
                    print(f"GPT returned JSON instead of text, retrying...")
                    time.sleep(delay)
                    delay *= 2
                    continue
                else:
                    # Fall back to original text
                    return raw_text, 'failed'
            
            # Success - return cleaned text
            return content.strip(), 'success'
            
        except Exception as e:
            last_error = str(e)
            print(f"GPT cleaning attempt {attempt + 1} failed: {last_error}")
            
            if attempt < max_retries:
                time.sleep(delay)
                delay *= 2
    
    # All retries failed
    return raw_text, 'failed'


# ============================================================================
# Full Structured Extraction with GPT
# ============================================================================

EXTRACTION_SCHEMA = """{
    "name": "string or null",
    "email": "string or null",
    "phone": "string or null",
    "education": [
        {
            "school": "string",
            "degree": "string or null",
            "level": "College|Senior High School|High School",
            "year_start": "string or null",
            "year_end": "string or null"
        }
    ],
    "experience": [
        {
            "company": "string",
            "role": "string",
            "date_range": "string or null",
            "bullets": ["string"]
        }
    ],
    "skills": {
        "hard_skills": ["string"],
        "soft_skills": ["string"],
        "all": ["string - union of hard+soft, deduped"]
    },
    "projects": [
        {
            "name": "string",
            "description": "string or null",
            "date": "string or null"
        }
    ],
    "trainings": ["string - seminars, certificates, trainings"]
}"""

EXTRACTION_PROMPT_TEMPLATE = """You are a resume structured extraction engine. Extract information from the resume text below and return ONLY valid JSON (no markdown, no explanation).

CRITICAL REQUIREMENTS:
1. Output MUST be valid JSON matching this exact schema:
{schema}

2. Skills Separation (CRITICAL):
   - HARD SKILLS: technical/technical-like skills (programming languages, frameworks, tools, software, certifications, hardware)
     Examples: HTML, CSS, PHP, SQL, JavaScript, C++, Figma, XAMPP, MySQL, Firebase, Visual Studio Code, Adobe Photoshop, Network Configuration, Database Management
   - SOFT SKILLS: interpersonal/people/transferable skills
     Examples: Communication, Teamwork, Problem-solving, Leadership, Time management, Collaboration, Interpersonal skills
   - skills.all = union of hard_skills + soft_skills, deduplicated

3. Education Level Classification (priority order):
   - If strand keywords exist (STEM, ABM, HUMSS, TVL, GAS, Arts and Design, Sports Track, etc.) -> classify as "Senior High School" even if school name contains "College"
   - If degree keywords exist (Bachelor, BS, BA, Undergraduate, Master, Doctor, etc.) -> classify as "College"
   - Otherwise -> "High School"

4. Projects: Extract ONLY actual projects. STOP at "References" section - do NOT treat contact info or referees as projects.

5. Trainings: Combine seminars, trainings, and certificates into one "trainings" list.

6. Experience: Keep each job as ONE entry with company, role, date_range, and bullets together.

7. Deduplication: Remove duplicate entries in education. Normalize phone numbers and email addresses.

8. Keys must ALWAYS be present (use empty array [] or null if missing).

Resume text:
---
{raw_text}
---

Return ONLY valid JSON:"""


def extract_resume_json(raw_text: str, max_retries: int = MAX_RETRIES) -> tuple[dict, str]:
    """
    Extract structured resume data using GPT (text-only, no PDF rendering).
    
    Args:
        raw_text: Raw text extracted from PDF (may have multi-column issues)
        max_retries: Maximum retry attempts for API calls
        
    Returns:
        tuple: (extracted_json, status) where status is 'success', 'failed', or 'skipped'
    """
    if not raw_text or len(raw_text.strip()) < 50:
        return {}, 'skipped'
    
    if not OPENAI_API_KEY:
        return {}, 'skipped'
    
    client = _get_gpt_client()
    
    prompt = EXTRACTION_PROMPT_TEMPLATE.format(schema=EXTRACTION_SCHEMA, raw_text=raw_text)
    
    last_error = None
    delay = INITIAL_DELAY
    
    for attempt in range(max_retries + 1):
        try:
            response = client.chat.completions.create(
                model=GPT_MODEL,
                messages=[
                    {
                        "role": "system",
                        "content": "You are a resume structured extraction engine. Return ONLY valid JSON, no markdown, no explanations."
                    },
                    {"role": "user", "content": prompt}
                ],
                temperature=0.1,
                max_tokens=4000
            )
            
            content = response.choices[0].message.content
            
            if not content or len(content.strip()) < 10:
                raise ValueError("Empty or too short response from GPT")
            
            # Remove markdown code blocks if present
            content = content.strip()
            if content.startswith('```'):
                # Remove opening code block
                content = content.split('\n', 1)[1] if '\n' in content else content
            if content.endswith('```'):
                # Remove closing code block
                content = content.rsplit('```', 1)[0]
            content = content.strip()
            
            # Try to parse as JSON
            try:
                result = json.loads(content)
            except json.JSONDecodeError as e:
                # If JSON is invalid and we have retries, try to fix it
                if attempt < max_retries:
                    # Add a correction prompt
                    prompt = f"The previous output was not valid JSON. Fix and return ONLY valid JSON:\n\n{content[:500]}..."
                    print(f"GPT returned invalid JSON, retrying with fix prompt...")
                    time.sleep(delay)
                    delay *= 2
                    continue
                else:
                    raise ValueError(f"Invalid JSON response: {e}")
            
            # Validate the result has expected structure
            if not isinstance(result, dict):
                raise ValueError("Response is not a JSON object")
            
            # Ensure all required keys exist with proper defaults
            result = _validate_and_normalize_extraction(result)
            
            return result, 'success'
            
        except Exception as e:
            last_error = str(e)
            print(f"GPT extraction attempt {attempt + 1} failed: {last_error}")
            
            if attempt < max_retries:
                time.sleep(delay)
                delay *= 2
    
    # All retries failed
    return {}, 'failed'


def _validate_and_normalize_extraction(data: dict) -> dict:
    """
    Validate and normalize GPT extraction result to match expected schema.
    """
    # Required keys with default values
    defaults = {
        'name': None,
        'email': None,
        'phone': None,
        'education': [],
        'experience': [],
        'skills': {
            'hard_skills': [],
            'soft_skills': [],
            'all': []
        },
        'projects': [],
        'trainings': []
    }
    
    for key, default_val in defaults.items():
        if key not in data:
            data[key] = default_val
    
    # Ensure skills structure
    if not isinstance(data.get('skills'), dict):
        data['skills'] = defaults['skills']
    else:
        for subkey in ['hard_skills', 'soft_skills', 'all']:
            if subkey not in data['skills'] or not isinstance(data['skills'][subkey], list):
                data['skills'][subkey] = []
    
    # Ensure all arrays are lists
    for arr_key in ['education', 'experience', 'projects', 'trainings']:
        if not isinstance(data.get(arr_key), list):
            data[arr_key] = []
    
    # Build skills.all as union of hard + soft (deduped)
    hard_skills = data['skills'].get('hard_skills', [])
    soft_skills = data['skills'].get('soft_skills', [])
    all_skills = list(set(hard_skills + soft_skills))
    data['skills']['all'] = sorted(all_skills)
    
    return data


def run_gpt_extraction(raw_text: str, max_retries: int = MAX_RETRIES) -> dict:
    """
    DEPRECATED: Use clean_with_gpt() or extract_resume_json() instead.
    """
    import warnings
    warnings.warn(
        "run_gpt_extraction is deprecated. Use clean_with_gpt() for text cleaning "
        "or extract_resume_json() for full structured extraction.",
        DeprecationWarning,
        stacklevel=2
    )
    
    # For backwards compatibility, return a minimal structure
    cleaned_text, status = clean_with_gpt(raw_text, max_retries)
    
    return {
        "cleaned_text": cleaned_text,
        "status": status,
        "gpt_model": GPT_MODEL,
    }


def run_gpt_extraction_with_fallback(raw_text: str) -> tuple[dict, str]:
    """
    DEPRECATED: Use extract_resume_json() instead.
    """
    import warnings
    warnings.warn(
        "run_gpt_extraction_with_fallback is deprecated. Use extract_resume_json() instead.",
        DeprecationWarning,
        stacklevel=2
    )
    
    return extract_resume_json(raw_text)


if __name__ == "__main__":
    # Test the extraction function
    test_messy_text = """
    JOHN RICH A.
    ALAYA-AY
    C O M P U T E R  S C I E N C E  I N T E R N
    A self-motivated undergraduate college student seeking a internship position
    where i can utilize my skills and improve my knowledge in programming, Web
    development and UI design.
    Education
    Contact
    2022 - Present
    +63 967 281 1064
    Cavite State University -Imus Campus
    alayaayjohnrich@gmail.com
    Bachelor of Science in Computer Science
    2020 - 2022
    Emilio Aguinaldo College - Cavite
    Science, Technology, Engineering and Mathematics
    Skills
    HTML/CSS/PHP/ SQL
    Basic JavaScript
    C++ Programming
    Figma
    XAMPP
    MySQL
    Firebase
    Visual Studio Code
    Soft Skills
    Communication
    Teamwork
    Problem-solving
    Interpersonal skills
    Time management
    Collaboration
    """
    
    print("Testing clean_with_gpt...")
    cleaned, status = clean_with_gpt(test_messy_text)
    print(f"Status: {status}")
    print(f"Cleaned text (first 200 chars): {cleaned[:200]}...")
    print()
    
    print("Testing extract_resume_json...")
    extracted, status = extract_resume_json(test_messy_text)
    print(f"Status: {status}")
    print(f"Extracted: {json.dumps(extracted, indent=2)}")
