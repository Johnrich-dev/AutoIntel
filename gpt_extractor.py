#!/usr/bin/env python3
"""
GPT-based Resume Extractor for AutoIntel

Two modes of operation:
1. clean_with_gpt() - Cleans/reorganizes messy PDF text before BERT NER
2. extract_resume_json() - Full structured extraction with GPT (text-only)

The GPT model and API key are read from environment variables:
- OPENAI_API_KEY: Required for GPT calls
- GPT_MODEL: Model name (default: gpt-4o-mini)

IMPORTANT: GPT cleaning is a LOSSLESS operation - it should only reorder and join
wrapped lines, never delete, omit, or merge-away any content including strand keywords.
"""

import json
import os
import re
import time
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables from project root .env
_project_root = Path(__file__).resolve().parent
load_dotenv(dotenv_path=_project_root / ".env")

# Check if running in test mode (disable GPT calls)
TEST_MODE = os.getenv("TEST_MODE", "false").lower() == "true"

# Configuration - read dynamically
def _get_gpt_model():
    """Get GPT model name from environment."""
    return os.getenv("GPT_MODEL", "gpt-4o-mini")

# Retry configuration
MAX_RETRIES = 2
INITIAL_DELAY = 1.0  # seconds

# Strand keywords for validation
STRAND_KEYWORDS = [
    'stem', 'abm', 'humss', 'tvl', 'gas',
    'arts and design', 'sports track',
    'science, technology, engineering and mathematics',
    'accountancy, business and management',
    'humanities and social sciences',
    'general academic strand',
    'technical-vocational-livelihood',
]


def _get_gpt_client():
    """Get OpenAI client with proper environment loading."""
    from openai import OpenAI
    
    # Read API key dynamically
    api_key = os.getenv("OPENAI_API_KEY")
    
    # Debug: print first 7 chars to verify loading
    if api_key:
        print(f"[DEBUG] OPENAI_API_KEY loaded: {api_key[:7]}...")
    else:
        print("[DEBUG] OPENAI_API_KEY is None or empty")
    
    # Check for missing or placeholder key
    if not api_key:
        raise RuntimeError(
            "OPENAI_API_KEY environment variable is not set. "
            "Please add OPENAI_API_KEY=your-key to .env file."
        )
    
    if "sk-your-" in api_key.lower() or api_key == "sk-your-openai-api-key-here":
        raise RuntimeError(
            f"OPENAI_API_KEY appears to be a placeholder value: {api_key[:20]}... "
            "Please replace with your real API key from https://platform.openai.com/account/api-keys"
        )
    
    return OpenAI(api_key=api_key)


CLEANING_PROMPT = """You are a resume text restructuring engine.

Reconstruct the following resume text into proper logical human reading order.

CRITICAL LOSSLESS REQUIREMENTS:
- Do NOT delete, omit, or merge-away any lines or information.
- Do NOT summarize or rewrite any content.
- Do NOT classify into JSON.
- Do NOT interpret or categorize.
- Do NOT rename headings.
- PRESERVE EVERY LINE exactly as is.
- Only reorder lines and merge broken/wrapped lines that span multiple lines.
- Group related lines under their correct existing section headings.
- Keep ALL education strands (STEM, ABM, HUMSS, TVL, GAS, Arts and Design, Sports Track, etc.)
- Keep ALL degree information (BS, BA, Bachelor, etc.)
- Keep ALL school names and course information.

Return ONLY the cleaned resume text with no explanations or JSON.
"""

# Stricter prompt for retry when lossless validation fails
STRICT_LOSSLESS_PROMPT = """You are a LOSSLESS resume text restructuring engine.

CRITICAL: This is a STRICT LOSSLESS operation. You MUST preserve EVERY piece of information.

Rules (MUST FOLLOW):
1. PRESERVE ALL LINES - do not remove any lines under any circumstances.
2. PRESERVE ALL STRAND KEYWORDS: STEM, ABM, HUMSS, TVL, GAS, Arts and Design, Sports Track, etc.
3. PRESERVE ALL DEGREE INFO: Bachelor of Science, BS, BA, etc.
4. PRESERVE ALL SCHOOL NAMES.
5. Only join wrapped/broken lines that clearly belong together (same sentence split across lines).
6. Do NOT change any wording, only reorder if needed for logical flow.
7. Do NOT create any new sections or headings.

Return ONLY the cleaned text, no JSON, no explanations.
"""


def _check_strand_keywords_present(raw_text: str, cleaned_text: str) -> bool:
    """
    Check if strand keywords present in raw_text are also in cleaned_text.
    Returns True if all strand keywords are preserved (validation passed).
    Returns False if any strand keywords are missing (validation failed).
    """
    raw_lower = raw_text.lower()
    cleaned_lower = cleaned_text.lower()
    
    for keyword in STRAND_KEYWORDS:
        if keyword in raw_lower and keyword not in cleaned_lower:
            print(f"[LOSSLESS CHECK] Missing strand keyword in cleaned text: '{keyword}'")
            return False
    return True


def clean_with_gpt(raw_text: str, max_retries: int = MAX_RETRIES) -> tuple[str, str]:
    """
    Clean and reorganize messy resume text using GPT.
    
    This function ensures LOSSLESS cleaning - it validates that strand keywords
    from the original text are preserved in the cleaned output. If validation
    fails, it retries with a stricter prompt.
    
    Args:
        raw_text: Raw text extracted from PDF (may have multi-column issues)
        
    Returns:
        tuple: (cleaned_text, status) where status is 'success', 'failed', or 'skipped'
    """
    # Skip GPT in test mode
    if TEST_MODE:
        return raw_text, 'skipped'
    
    if not raw_text or len(raw_text.strip()) < 50:
        print("GPT cleaning SKIPPED: Input text too short (< 50 chars)")
        return raw_text, 'skipped'
    
    if not os.getenv("OPENAI_API_KEY"):
        print("GPT cleaning SKIPPED: OPENAI_API_KEY environment variable is not set")
        print("Please set OPENAI_API_KEY in your .env file or environment")
        return raw_text, 'skipped'
    
    client = _get_gpt_client()
    
    # First attempt with standard lossless prompt
    prompt = f"""{CLEANING_PROMPT}

---
{raw_text}
---

Cleaned resume text:"""
    
    last_error = None
    delay = INITIAL_DELAY
    used_strict_prompt = False
    
    for attempt in range(max_retries + 1):
        try:
            # Use stricter prompt on retry if validation failed
            if attempt > 0 and not used_strict_prompt:
                print("Retrying with STRICT LOSSLESS prompt...")
                prompt = f"""{STRICT_LOSSLESS_PROMPT}

---
{raw_text}
---

Cleaned resume text:"""
                used_strict_prompt = True
            
            response = client.chat.completions.create(
                model=_get_gpt_model(),
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
            
            # LOSSLESS VALIDATION: Check if strand keywords are preserved
            if not _check_strand_keywords_present(raw_text, content):
                if attempt < max_retries:
                    print(f"LOSSLESS VALIDATION FAILED: Strand keywords missing. Retrying...")
                    time.sleep(delay)
                    delay *= 2
                    continue
                else:
                    # Validation still failed after retries - fall back to raw_text
                    print("LOSSLESS VALIDATION FAILED after retries. Falling back to raw_text for NER.")
                    return raw_text, 'lossless_failed'
            
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
    
    if not os.getenv("OPENAI_API_KEY"):
        return {}, 'skipped'
    
    client = _get_gpt_client()
    
    prompt = EXTRACTION_PROMPT_TEMPLATE.format(schema=EXTRACTION_SCHEMA, raw_text=raw_text)
    
    last_error = None
    delay = INITIAL_DELAY
    
    for attempt in range(max_retries + 1):
        try:
            response = client.chat.completions.create(
                model=_get_gpt_model(),
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
    # Also strip any category label strings that GPT sometimes includes
    # e.g. "Languages", "Design & UI/UX", "Web Frameworks"
    _SKILL_CATEGORY_LABELS = {
        'languages', 'web frameworks', 'frameworks', 'databases', 'database',
        'tools', 'tools & automation', 'tools and automation', 'automation',
        'cloud platforms', 'cloud', 'design', 'design & ui/ux', 'ui/ux',
        'soft skills', 'hard skills', 'data engineering', 'data', 'mobile',
        'devops', 'backend', 'frontend', 'other', 'others', 'skills',
        'technical skills', 'programming languages', 'platforms',
        'operating systems', 'version control', 'methodologies',
        'tools and technologies', 'technologies', 'certifications',
    }

    def _is_skill_label(s: str) -> bool:
        if not isinstance(s, str):
            return True
        lower = s.strip().lower()
        if lower in _SKILL_CATEGORY_LABELS:
            return True
        # Reject empty or whitespace-only
        if not lower:
            return True
        return False

    hard_skills = [s for s in data['skills'].get('hard_skills', []) if not _is_skill_label(s)]
    soft_skills = [s for s in data['skills'].get('soft_skills', []) if not _is_skill_label(s)]
    data['skills']['hard_skills'] = hard_skills
    data['skills']['soft_skills'] = soft_skills
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
        "gpt_model": _get_gpt_model(),
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
