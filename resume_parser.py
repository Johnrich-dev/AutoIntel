#!/usr/bin/env python3
"""
Resume Parser for SentinelAI
Parses raw extracted resume content into structured JSON data using BERT NER.
Extracts: name, email, phone, education, work experience, skills.
"""

import re
import json
import os
from datetime import datetime
from supabase import Client, create_client

# Load environment variables from .env if present
try:
    from dotenv import load_dotenv  # type: ignore

    load_dotenv()
except Exception:
    pass

# Supabase configuration
SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_SERVICE_KEY = os.getenv('SUPABASE_SERVICE_KEY')
supabase = None  # type: Client | None

def _require_env():
    missing = []
    if not SUPABASE_URL:
        missing.append('SUPABASE_URL')
    if not SUPABASE_SERVICE_KEY:
        missing.append('SUPABASE_SERVICE_KEY')
    if missing:
        raise RuntimeError(f"Missing required environment variables: {', '.join(missing)}")

def get_supabase() -> Client:
    global supabase
    if supabase is None:
        _require_env()
        supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    return supabase

# Lazy load BERT model
bert_model = None
bert_tokenizer = None

def get_bert_ner():
    """Load BERT NER model lazily."""
    global bert_model, bert_tokenizer
    if bert_model is None:
        print("Loading BERT NER model...")
        from transformers import AutoModelForTokenClassification, AutoTokenizer
        bert_tokenizer = AutoTokenizer.from_pretrained("yashpwr/resume-ner-bert-v2")
        bert_model = AutoModelForTokenClassification.from_pretrained("yashpwr/resume-ner-bert-v2")
        print("BERT NER model loaded!")
    return bert_model, bert_tokenizer

def extract_entities_bert(text):
    """Extract entities using BERT NER model."""
    model, tokenizer = get_bert_ner()
    
    # Tokenize - handle long text by chunking
    max_length = 512
    if len(text) > max_length * 4:
        # For long texts, process in chunks
        text = text[:max_length * 4]
    
    inputs = tokenizer(text, return_tensors="pt", truncation=True, max_length=512)
    
    # Get predictions
    outputs = model(**inputs)
    predictions = outputs.logits.argmax(dim=-1)
    
    # Get tokens and labels
    tokens = tokenizer.convert_ids_to_tokens(inputs["input_ids"][0])
    labels = predictions[0].tolist()
    
    # Use model's config for label mapping
    label_map = model.config.id2label
    
    def canon(s: str) -> str:
        return re.sub(r'\s+', ' ', s.replace('_', ' ').replace('-', ' ')).strip().lower()

    def dedupe_preserve(items):
        seen = set()
        out = []
        for it in items:
            k = it.strip()
            if not k:
                continue
            if k.lower() in seen:
                continue
            seen.add(k.lower())
            out.append(k)
        return out

    entities_by_type = {}  # canonical_type -> list[str]
    
    # Extract entities using BIO tagging
    current_entity = None
    current_tokens = []
    
    for token, label_id in zip(tokens, labels):
        if token in ['[CLS]', '[SEP]', '[PAD]']:
            continue
        
        label_name = label_map.get(label_id, 'O')
        
        if label_name.startswith('B-'):
            # Save previous entity
            if current_entity and current_tokens:
                entity_text = tokenizer.convert_tokens_to_string(current_tokens).strip()
                if entity_text:
                    entities_by_type.setdefault(canon(current_entity), []).append(entity_text)
            current_entity = label_name[2:]
            current_tokens = [token]
        elif label_name.startswith('I-') and current_entity == label_name[2:]:
            current_tokens.append(token)
        else:
            # Save current entity
            if current_entity and current_tokens:
                entity_text = tokenizer.convert_tokens_to_string(current_tokens).strip()
                if entity_text:
                    entities_by_type.setdefault(canon(current_entity), []).append(entity_text)
            current_entity = None
            current_tokens = []
    
    # Handle last entity
    if current_entity and current_tokens:
        entity_text = tokenizer.convert_tokens_to_string(current_tokens).strip()
        if entity_text:
            entities_by_type.setdefault(canon(current_entity), []).append(entity_text)

    # Deduplicate and clean
    cleaned_by_type = {k: [v for v in dedupe_preserve(vals) if len(v) > 1] for k, vals in entities_by_type.items()}

    def pick(matchers):
        out = []
        for t, vals in cleaned_by_type.items():
            if any(m in t for m in matchers):
                out.extend(vals)
        return dedupe_preserve(out)

    # Map to expected field names (robust to model label naming)
    return {
        'names': pick(['name']),
        'emails': pick(['email', 'mail']),
        'phones': pick(['phone', 'mobile']),
        'colleges': pick(['college', 'university', 'school', 'institute', 'institution']),
        'degrees': pick(['degree']),
        'companies': pick(['company', 'employer', 'organization']),
        'job_titles': pick(['designation', 'job title', 'title', 'position', 'role']),
        'skills': pick(['skill']),
        'locations': pick(['location', 'address', 'city', 'state', 'country']),
        'graduation_years': pick(['graduation', 'grad']),
        'years_of_experience': pick(['years of experience', 'experience'])
    }

# Hard skills keywords
HARD_SKILLS = [
    # Programming Languages
    'python', 'java', 'javascript', 'typescript', 'c++', 'c#', 'ruby', 'go', 'rust', 'swift',
    'kotlin', 'php', 'perl', 'scala', 'r', 'matlab', 'sql', 'html', 'css', 'bash', 'shell',
    
    # Web Frameworks
    'react', 'angular', 'vue', 'node.js', 'django', 'flask', 'spring', 'express', 'next.js',
    'nuxt', 'svelte', 'fastapi', 'laravel', 'rails', 'asp.net',
    
    # Cloud & DevOps
    'aws', 'azure', 'gcp', 'docker', 'kubernetes', 'terraform', 'jenkins', 'ci/cd', 'devops',
    'linux', 'unix', 'nginx', 'apache', 'git', 'github', 'gitlab',
    
    # Data & ML
    'machine learning', 'deep learning', 'data science', 'data analysis', 'data engineering',
    'pandas', 'numpy', 'tensorflow', 'pytorch', 'scikit-learn', 'spark', 'hadoop', 'tableau',
    'power bi', 'etl', 'data warehouse', 'sql', 'nosql', 'mongodb', 'postgresql', 'mysql',
    'big data', 'analytics', 'visualization',
    
    # Other Technical
    'rest api', 'graphql', 'microservices', 'architecture', 'security', 'testing', 'selenium',
    'jira', 'confluence', 'figma', 'photoshop', 'illustrator', 'adobe', 'autocad', 'sap',
    'programming', 'coding', 'software', 'hardware', 'networking', 'database'
]

# Soft skills keywords
SOFT_SKILLS = [
    'leadership', 'teamwork', 'communication', 'problem-solving', 'analytical', 'project management',
    'agile', 'scrum', 'kanban', 'time management', 'adaptable', 'flexible', 'creative',
    'organized', 'detail-oriented', 'self-motivated', 'independent', 'collaborative',
    'presentation', 'public speaking', 'negotiation', 'conflict resolution', 'mentoring',
    'critical thinking', 'decision making', 'strategic planning', 'customer service',
    'interpersonal', 'verbal', 'written', 'team player', 'fast learner', 'quick learner'
]


def extract_email(text):
    """Extract email address from text."""
    # Fix common PDF spacing artifacts: "name @ gmail. com" -> "name@gmail.com"
    compact = re.sub(r'\s+', ' ', (text or ''))
    compact = re.sub(r'\s*@\s*', '@', compact)
    compact = re.sub(r'\s*\.\s*', '.', compact)

    email_pattern = r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b'
    match = re.search(email_pattern, compact)
    return match.group(0).lower() if match else None


def _normalize_email_value(value: str | None) -> str | None:
    if not value:
        return None
    s = str(value)
    s = re.sub(r'\s+', ' ', s).strip()
    s = re.sub(r'\s*@\s*', '@', s)
    s = re.sub(r'\s*\.\s*', '.', s)
    m = re.search(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b', s)
    return m.group(0).lower() if m else s.lower()


def _first_nonempty_str(values):
    if not values:
        return None
    for v in values:
        if isinstance(v, str) and v.strip():
            return v.strip()
    return None


def extract_phone(text):
    """Extract phone number from text."""
    # Multiple patterns for international phone numbers
    phone_patterns = [
        r'\+?\d{1,3}[-.\s]?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,9}',
        r'\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}',
        r'\d{10,12}'
    ]
    
    for pattern in phone_patterns:
        match = re.search(pattern, text)
        if match:
            phone = re.sub(r'[^\d+]', '', match.group())
            if len(phone) >= 10:
                return phone
    
    return None


def extract_name(text):
    """Extract name from text - typically at the top of resume."""
    lines = text.strip().split('\n')
    
    # First non-empty line is often the name
    for line in lines[:5]:
        line = line.strip()
        if not line:
            continue
        
        # Skip lines that look like emails, phones, or addresses
        if '@' in line or re.search(r'\d{10,}', line) or len(line) < 2:
            continue
        
        # Skip common resume headers
        header_words = ['resume', 'curriculum', 'cv', 'address', 'email', 'phone', 'mobile']
        if any(word in line.lower() for word in header_words):
            continue
        
        # Name typically doesn't contain numbers and is 2-4 words
        words = line.split()
        if 1 <= len(words) <= 4:
            # Check if it looks like a name (mostly letters)
            letter_count = sum(1 for c in line if c.isalpha() or c.isspace())
            if letter_count / len(line) > 0.8:
                return line
    
    return None


def extract_education(text):
    """Extract education - properly grouped with year, school, and course."""
    education = []
    
    # Keywords for College classification (must have degree keywords)
    degree_keywords = [
        'bachelor', 'bsc', 'bs', 'ba', 'msc', 'ms', 'ma', 'mba', 'mpa', 
        'phd', 'doctor', 'degree',
        'computer science', 'information technology', 'engineering', 
        'business', 'accountancy', 'accounting', 'nursing', 'education', 'arts', 
        'science', 'commerce', 'law', 'medicine'
    ]
    
    # Keywords for Senior High School classification (must have strand keywords)
    strand_keywords = [
        'stem', 'humss', 'abm', 'gas', 'tvl', 'ict',
        'health', 'sports', 'art and design',
        'senior high', 'shs'
    ]
    
    # Patterns to exclude
    exclude_patterns = [
        r'@\w+\.\w+', r'profile', r'summary', r'objective', r'contact', 
        r'address', r'phone', r'experience', r'work', r'employment',
        r'internship', r'skills', r'references', r'certification'
    ]
    
    lines = text.split('\n')
    
    # Find all lines with education-like content
    candidate_lines = []
    for i, line in enumerate(lines):
        line_lower = line.lower().strip()
        
        if len(line.strip()) < 10:
            continue
        
        # Skip exclude patterns
        if any(re.search(p, line_lower) for p in exclude_patterns):
            continue
        
        # Check for year and (school or degree)
        has_year = re.search(r'(20\d{2}|19\d{2})', line)
        has_school = any(kw in line_lower for kw in ['university', 'college', 'school', 'institute'])
        # IMPORTANT: match short degree abbreviations as whole words (avoid "ma" matching "manager")
        has_degree = (
            re.search(r'\b(bs|ba|ma|ms|bsc|msc|mba|mpa|phd)\b', line_lower) is not None
            or any(kw in line_lower for kw in ['stem', 'abm', 'humss', 'tvl', 'bachelor', 'master', 'degree'])
        )
        
        if has_year and (has_school or has_degree):
            candidate_lines.append({'line': line.strip(), 'line_lower': line_lower, 'index': i})
    
    # Process and group candidates
    processed_years = set()
    
    for cand in candidate_lines:
        line = cand['line']
        line_lower = cand['line_lower']
        
        # Determine education type - must have specific keywords
        education_type = None
        
        # Check for SHS first (strand keywords take priority)
        if any(kw in line_lower for kw in strand_keywords):
            education_type = 'Senior High School'
        # Then check for College (degree keywords) - not just school name
        elif any(kw in line_lower for kw in degree_keywords):
            education_type = 'College'
        # Skip if can't determine type
        else:
            continue
        
        # Skip elementary/junior high
        if 'elementary' in line_lower or 'primary school' in line_lower:
            continue
        
        # Extract year range
        year_range = None
        year_match = re.search(r'(20\d{2}|19\d{2})\s*[-–—to]+\s*(20\d{2}|19\d{2}|present|current)?', line, re.IGNORECASE)
        if year_match:
            year_range = year_match.group(1)
            if year_match.group(2):
                year_range = f"{year_match.group(1)} - {year_match.group(2)}"
        else:
            single_year = re.search(r'(20\d{2}|19\d{2})', line)
            if single_year:
                year_range = single_year.group(1)
        
        # Skip if we've already processed this year
        if year_range and year_range in processed_years:
            continue
        if year_range:
            processed_years.add(year_range)
        
        # Extract school name
        school_name = None
        school_patterns = [
            r'([A-Z][\w\s,-]+(?:University|College|Institute|School))',
            r'((?:De La Salle|Universidad|Polytechnic|State University)[\w\s,-]*)',
        ]
        for sp in school_patterns:
            sm = re.search(sp, line, re.IGNORECASE)
            if sm:
                school_name = sm.group(1).strip()
                break
        
        # Extract course/strand based on education type
        course = None
        if education_type == 'College':
            course_patterns = [
                r'(Bachelor of\s+[\w\s]+)',
                r'(B\.?S\.?\s+in\s+[\w\s]+)',
                r'(B\.?A\.?\s+in\s*[\w\s]+)',
                r'(M\.?S\.?\s+in\s*[\w\s]+)',
                r'(M\.?A\.?\s+in\s*[\w\s]+)',
                r'(Bachelor[\w\s]+)',
                r'(Master[\w\s]+)',
                r'(Information\s*Technology)',
                r'(Computer\s*Science)',
                r'(Engineering)',
                r'(Business\s*Administration)',
                r'(Accountancy)',
            ]
        else:  # Senior High School
            course_patterns = [
                r'(Science,\s*Technology,\s*Engineering(?:\s*&\s*Mathematics)?)',
                r'(STEM)',
                r'(Accountancy,\s*Business,\s*and\s*Management)',
                r'(ABM)',
                r'(Humanities,\s*and\s*Social\s*Sciences)',
                r'(HUMSS)',
                r'(General\s*Academic\s*Strand)',
                r'(GAS)',
                r'(Technical-Vocational-Livelihood)',
                r'(TVL)',
            ]
        for cp in course_patterns:
            cm = re.search(cp, line, re.IGNORECASE)
            if cm:
                course = cm.group(1).strip()
                break
        
        # Create entry
        entry = {
            'year_range': year_range,
            'school': school_name,
            'course_or_strand': course,
            'education_type': education_type,
            'raw_text': line
        }
        
        education.append(entry)
    
    return education[:5]


def extract_work_experience(text):
    """Extract work experience - ONLY if Work Experience section exists."""
    experience = []
    
    lines = text.split('\n')
    text_lower = text.lower()
    
    # First, check if there's a Work Experience section
    has_work_section = False
    work_section_start = -1
    
    section_headers = ['work experience', 'employment history', 'professional experience', 
                     'job history', 'career history', 'working experience']
    
    for i, line in enumerate(lines):
        line_lower = line.lower().strip()
        
        # Check if this line is a section header
        if any(header in line_lower for header in section_headers):
            # Make sure it's likely a header (short line or followed by colon)
            if len(line.strip()) < 50 or ':' in line:
                has_work_section = True
                work_section_start = i
                break
    
    # If no Work Experience section, return empty
    if not has_work_section:
        return []
    
    # Now extract from the work experience section
    job_titles = [
        'software engineer', 'senior engineer', 'junior engineer', 'lead engineer', 'principal engineer',
        'staff engineer', 'developer', 'senior developer', 'junior developer', 'full stack developer',
        'frontend developer', 'backend developer', 'web developer', 'mobile developer',
        'manager', 'senior manager', 'project manager', 'product manager', 'program manager',
        'analyst', 'senior analyst', 'business analyst', 'data analyst', 'financial analyst',
        'designer', 'ui designer', 'ux designer', 'graphic designer', 'web designer',
        'consultant', 'senior consultant', 'business consultant', 'technical consultant',
        'intern', 'internship', 'trainee', 'associate', 'coordinator',
        'director', 'vice president', 'vp', 'chief', 'head', 'lead', 'specialist',
        'accountant', 'auditor', 'marketing', 'sales', 'hr', 'human resources',
        'teacher', 'instructor', 'professor', 'lecturer', 'executive', 'officer', 'clerk'
    ]
    
    company_keywords = ['inc', 'corp', 'llc', 'ltd', 'company', 'co.', 'group', 'technologies', 
                       'solutions', 'services', 'consulting', 'enterprise', 'systems', 'labs',
                       'international', 'global', 'worldwide', 'ph', 'usa', 'uk', 'corp.']
    
    def has_date_marker(s: str) -> bool:
        if re.search(r'(?:19|20)\d{2}', s):
            return True
        if re.search(r'\bpresent\b|\bcurrent\b|\bnow\b', s):
            return True
        if re.search(r'\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b', s):
            return True
        return False

    def extract_years(s: str):
        years = re.findall(r'(?:19|20)\d{2}', s)
        is_present = re.search(r'\bpresent\b|\bcurrent\b|\bnow\b', s) is not None
        if not years and not is_present:
            return None
        if years and is_present:
            return f"{years[0]} - Present"
        if len(years) >= 2:
            return f"{years[0]} - {years[1]}"
        if years:
            return years[0]
        return "Present"
    
    # End of work section markers
    end_markers = ['skills', 'references', 'certifications', 'awards', 'education', 
                  'objective', 'summary', 'profile', 'languages', 'projects']
    
    # Extract from work section
    for i, line in enumerate(lines):
        # Skip if before work section
        if work_section_start >= 0 and i < work_section_start:
            continue
            
        # Stop if we hit another section
        if i > work_section_start:
            line_check = line.lower().strip()
            if any(marker in line_check for marker in end_markers) and len(line.strip()) < 30:
                break
        
        line_lower = line.lower().strip()
        
        # Skip empty or very short lines
        if len(line.strip()) < 10:
            continue
        
        # Skip section headers
        if any(header in line_lower for header in section_headers):
            continue
        
        # Check for job-related content
        has_job_title = any(title in line_lower for title in job_titles)
        has_date = has_date_marker(line_lower)
        has_company = any(kw in line_lower for kw in company_keywords)
        
        # Must have job title OR (date AND company/length indicator)
        if has_job_title or (has_date and (has_company or len(line) > 50)):
            entry = {
                'company': None,
                'role': None,
                'years': None,
                'summary': None,
                'raw_text': line.strip()
            }
            
            # Extract dates
            entry['years'] = extract_years(line_lower)
            
            # Extract role/title
            for title in job_titles:
                if title in line_lower:
                    entry['role'] = title.title()
                    break
            
            # Extract company
            for kw in company_keywords:
                if kw in line_lower:
                    # Try to get company name
                    idx = line_lower.find(kw)
                    start = max(0, idx - 30)
                    end = min(len(line), idx + 40)
                    entry['company'] = line[start:end].strip()
                    break
            
            # Create summary (clean up the line)
            summary = line
            # Remove dates
            for pattern in experience_patterns:
                summary = re.sub(pattern, '', summary, flags=re.IGNORECASE)
            summary = summary.strip()
            if len(summary) > 15:
                entry['summary'] = summary[:150]
            
            # Only add if meaningful
            if entry['role'] or entry['company'] or entry['years']:
                experience.append(entry)
    
    return experience[:8]


def extract_skills(text):
    """Extract skills from text and separate into hard and soft skills."""
    text_lower = text.lower()
    
    hard_skills_found = []
    soft_skills_found = []
    
    # Check for each hard skill
    for skill in HARD_SKILLS:
        pattern = r'\b' + re.escape(skill) + r'\b'
        if re.search(pattern, text_lower):
            # Format the skill nicely
            formatted = skill.title() if len(skill) > 3 else skill.upper()
            if formatted not in hard_skills_found:
                hard_skills_found.append(formatted)
    
    # Check for each soft skill
    for skill in SOFT_SKILLS:
        pattern = r'\b' + re.escape(skill) + r'\b'
        if re.search(pattern, text_lower):
            formatted = skill.title()
            if formatted not in soft_skills_found:
                soft_skills_found.append(formatted)
    
    return {
        'hard_skills': hard_skills_found,
        'soft_skills': soft_skills_found,
        'all': hard_skills_found + soft_skills_found
    }


SECTION_ORDER = [
    'PROFILE',
    'EDUCATION',
    'SKILLS',
    'EXPERIENCE',
    'PROJECTS',
    'ACHIEVEMENTS',
    'SEMINARS/TRAINING',
]

SECTION_ALIASES = {
    'PROFILE': ['profile', 'summary', 'objective', 'about me'],
    'EDUCATION': ['education', 'educational background', 'academic background'],
    'SKILLS': ['skills', 'technical skills', 'core skills', 'competencies'],
    'EXPERIENCE': ['experience', 'work experience', 'employment history', 'professional experience', 'career history'],
    'PROJECTS': ['projects', 'personal projects', 'academic projects'],
    'ACHIEVEMENTS': ['achievements', 'awards', 'honors', 'recognitions'],
    'SEMINARS/TRAINING': ['seminars', 'trainings', 'training', 'seminars and trainings', 'workshops'],
}


def _normalize_lines(raw_text: str) -> list[str]:
    """Basic reconstruction: trim, drop obvious noise, merge simple wraps."""
    lines = [ln.rstrip() for ln in raw_text.splitlines()]
    # Drop empty blocks at top/bottom
    while lines and not lines[0].strip():
        lines.pop(0)
    while lines and not lines[-1].strip():
        lines.pop()

    cleaned: list[str] = []
    for ln in lines:
        s = ln.strip()
        if not s:
            cleaned.append('')
            continue
        # Remove obvious page headers/footers
        lower = s.lower()
        if re.search(r'\bpage\s+\d+\b', lower):
            continue
        cleaned.append(s)

    # Merge simple line wraps
    merged: list[str] = []
    for ln in cleaned:
        if not merged:
            merged.append(ln)
            continue
        prev = merged[-1]
        if not prev.strip():
            merged.append(ln)
            continue

        prev_end = prev.strip()[-1]

        def looks_like_email(s: str) -> bool:
            return bool(re.search(r'\b[A-Za-z0-9._%+-]+\s*@\s*[A-Za-z0-9.-]+\s*\.\s*[A-Za-z]{2,}\b', s))

        def looks_like_phone(s: str) -> bool:
            return bool(re.search(r'\+?\d[\d\s().-]{8,}', s))

        def looks_like_url(s: str) -> bool:
            return 'http://' in s.lower() or 'https://' in s.lower() or 'www.' in s.lower()

        def looks_like_name_line(s: str) -> bool:
            ss = s.strip()
            if not ss or len(ss) > 40:
                return False
            if any(ch.isdigit() for ch in ss) or '@' in ss:
                return False
            words = ss.split()
            if not (2 <= len(words) <= 5):
                return False
            # Often all-caps
            alpha = sum(1 for c in ss if c.isalpha() or c.isspace())
            return alpha / max(1, len(ss)) > 0.8

        # Hyphenated break: "Lambda-" + "school"
        if prev_end == '-' and ln and ln[0].islower():
            merged[-1] = prev.rstrip('-') + ln.lstrip()
            continue

        # Single-word continuation line: "AWS" + "\nLambda" -> "AWS Lambda"
        if (
            ln
            and re.fullmatch(r'[A-Za-z][A-Za-z0-9/+.-]*', ln.strip())
            and prev_end not in '.?!:'
            and not looks_like_name_line(prev)
            and not looks_like_email(prev)
            and not looks_like_phone(prev)
            and not looks_like_url(prev)
        ):
            merged[-1] = prev + ' ' + ln.strip()
            continue

        # Soft wrap: previous line without sentence-ending punctuation, next starts lowercase
        if (
            prev_end not in '.?!:'
            and ln
            and ln[0].islower()
            and not looks_like_name_line(prev)
            and not looks_like_email(ln)
            and not looks_like_phone(ln)
            and not looks_like_url(ln)
        ):
            merged[-1] = prev + ' ' + ln.lstrip()
            continue

        merged.append(ln)

    return merged


def parse_education_section(text: str) -> list[dict]:
    """Parse EDUCATION section with multi-line grouping."""
    if not text or len(text.strip()) < 10:
        return []

    lines = [ln.strip() for ln in _normalize_lines(text) if ln.strip()]
    entries: list[dict] = []
    i = 0
    while i < len(lines):
        ln = lines[i]
        lower = ln.lower()

        # Skip repeated heading words inside section
        if lower in ('education',):
            i += 1
            continue

        # Detect degree/strand line
        is_degree = (
            'bachelor' in lower
            or 'master' in lower
            or re.search(r'\b(bs|ba|ma|ms|bsc|msc|mba|phd)\b', lower) is not None
            or 'computer science' in lower
            or 'stem' in lower
        )
        if not is_degree:
            i += 1
            continue

        degree_line = ln
        year_line = None
        school_line = None

        # Single-line education entries: year + school + degree all together
        if re.search(r'(19|20)\d{2}', degree_line) and any(k in lower for k in ['university', 'college', 'school', 'institute']):
            year_range = None
            m = re.search(r'((?:19|20)\d{2})\s*[-–—to]+\s*((?:19|20)\d{2}|present|current)?', degree_line, re.IGNORECASE)
            if m:
                y1 = m.group(1)
                y2 = m.group(2)
                year_range = f"{y1} - {y2.title()}" if y2 else y1

            sm = re.search(r'([\w\s.-]+(?:University|College|Institute|School)[\w\s.-]*)', degree_line, re.IGNORECASE)
            if sm:
                school_line = sm.group(1).strip()

            course = None
            cm = re.search(r'(Bachelor of\s+[\w\s]+)', degree_line, re.IGNORECASE)
            if not cm:
                cm = re.search(r'(B\.?S\.?\s+in\s+[\w\s]+)', degree_line, re.IGNORECASE)
            if cm:
                course = cm.group(1).strip()

            entries.append(
                {
                    'school': school_line,
                    'raw_text': degree_line,
                    'year_range': year_range,
                    'education_type': 'College',
                    'course_or_strand': course or degree_line,
                }
            )
            i += 1
            continue

        # Sometimes the school is the line immediately above the degree line
        if i > 0:
            prev = lines[i - 1].strip()
            prev_lower = prev.lower()
            if any(k in prev_lower for k in ['university', 'college', 'school', 'institute', 'campus']) and not re.search(r'(19|20)\d{2}', prev):
                school_line = prev

        # Look ahead a few lines for year + school
        look = lines[i + 1 : i + 6]
        for cand in look:
            if year_line is None and re.search(r'(19|20)\d{2}', cand) and ('present' in cand.lower() or re.search(r'(19|20)\d{2}\s*[-–—]', cand)):
                year_line = cand
                continue
            if school_line is None and (
                any(k in cand.lower() for k in ['university', 'college', 'school', 'institute', 'campus'])
                or 'state university' in cand.lower()
                or re.search(r'\b(cvsu|cavite state)\b', cand.lower())
            ):
                # If it's clearly a school name line, take it.
                if len(cand) >= 6 and not re.search(r'(19|20)\d{2}', cand):
                    school_line = cand

        # Normalize course name
        course = degree_line
        course = re.sub(r'\s+', ' ', course).strip()
        course = course.replace('BACHELOR OF SCIENCE IN', 'BS').replace('Bachelor of Science in', 'BS')
        course = course.replace('COMPUTER SCIENCE', 'Computer Science')

        # Extract year range
        year_range = None
        if year_line:
            m = re.search(r'((?:19|20)\d{2})\s*[-–—to]+\s*((?:19|20)\d{2}|present|current)?', year_line, re.IGNORECASE)
            if m:
                y1 = m.group(1)
                y2 = m.group(2)
                year_range = f"{y1} - {y2.title()}" if y2 else y1

        # Education type
        education_type = 'Senior High School' if 'stem' in lower else 'College'

        entry = {
            'school': school_line,
            'raw_text': f"{degree_line} | {year_line or ''} | {school_line or ''}".strip(),
            'year_range': year_range,
            'education_type': education_type,
            'course_or_strand': course,
        }
        entries.append(entry)
        i += 1

    return entries[:5]


def parse_experience_section(text: str) -> list[dict]:
    """Parse EXPERIENCE section into structured roles without leaking other sections."""
    if not text or len(text.strip()) < 10:
        return []

    lines = [ln.strip() for ln in _normalize_lines(text)]
    lines = [ln for ln in lines if ln]

    entries: list[dict] = []
    i = 0
    while i < len(lines):
        ln = lines[i]

        # Single-line entry: "Role  Company  2020 - Present"
        if re.search(r'(19|20)\d{2}', ln):
            parts = [p.strip() for p in re.split(r'\s{2,}', ln) if p.strip()]
            if len(parts) >= 3:
                role = parts[0].title()
                company = parts[1]
                years = parts[2]
                entries.append(
                    {
                        'role': role,
                        'years': years,
                        'company': company,
                        'summary': None,
                        'raw_text': ln,
                    }
                )
                i += 1
                continue

        # Company lines are often uppercase and have INC./CORP/etc
        if ln.isupper() and any(k in ln for k in ['INC', 'CORP', 'LLC', 'CO.', 'COMPANY', 'SERVICES']):
            company = ln
            years = None
            role = None
            bullets: list[str] = []

            # Next lines: dates then role then bullets
            j = i + 1
            if j < len(lines) and re.search(r'(19|20)\d{2}', lines[j]):
                years = lines[j]
                j += 1
            if j < len(lines) and len(lines[j]) <= 80:
                # Role/title may be uppercase in resumes
                if not (lines[j].isupper() and any(k in lines[j] for k in ['INC', 'CORP', 'LLC', 'CO.', 'COMPANY', 'SERVICES'])):
                    role = lines[j].title()
                    j += 1

            while j < len(lines):
                nxt = lines[j]
                if _detect_section_heading(nxt):
                    break
                # Next company starts
                if nxt.isupper() and any(k in nxt for k in ['INC', 'CORP', 'LLC', 'CO.', 'COMPANY', 'SERVICES']):
                    break
                bullets.append(nxt)
                j += 1

            summary = ' '.join(bullets).strip() if bullets else None
            entries.append(
                {
                    'role': role,
                    'years': years,
                    'company': company,
                    'summary': summary,
                    'raw_text': summary or company,
                }
            )
            i = j
            continue

        # Pattern: Role line -> Company line -> Date line
        if i + 2 < len(lines):
            role_cand = lines[i]
            company_cand = lines[i + 1]
            date_cand = lines[i + 2]

            role_lower = role_cand.lower()
            company_lower = company_cand.lower()
            looks_like_role = any(w in role_lower for w in ['engineer', 'developer', 'intern', 'analyst', 'manager', 'designer'])
            looks_like_company = any(w in company_lower for w in ['inc', 'corp', 'llc', 'company', 'co.', 'services'])
            looks_like_date = re.search(r'(19|20)\d{2}', date_cand) is not None

            if looks_like_role and looks_like_company and looks_like_date:
                role = role_cand.title()
                company = company_cand
                years = date_cand
                bullets: list[str] = []
                j = i + 3
                while j < len(lines):
                    nxt = lines[j]
                    if _detect_section_heading(nxt):
                        break
                    bullets.append(nxt)
                    j += 1
                summary = ' '.join(bullets).strip() if bullets else None
                entries.append(
                    {
                        'role': role,
                        'years': years,
                        'company': company,
                        'summary': summary,
                        'raw_text': summary or f"{role} @ {company}",
                    }
                )
                i = j
                continue

        i += 1

    return entries[:8]


def _detect_section_heading(line: str) -> str | None:
    """Return canonical section name if line looks like a heading."""
    stripped = line.strip()
    if not stripped:
        return None

    # Short, mostly non-numeric, often all-caps or Title Case
    if len(stripped) > 60:
        return None
    if any(ch.isdigit() for ch in stripped):
        return None
    candidate = stripped.rstrip(':').lower()

    for canonical, aliases in SECTION_ALIASES.items():
        for alias in aliases:
            if candidate == alias or alias in candidate:
                return canonical
    return None


def segment_sections(raw_text: str) -> dict[str, str]:
    """Split resume into high-level sections (HEADER, PROFILE, EDUCATION, etc)."""
    lines = _normalize_lines(raw_text)
    sections: dict[str, list[str]] = {}

    current = 'HEADER'
    sections[current] = []

    for ln in lines:
        sec = _detect_section_heading(ln)
        if sec:
            current = sec
            if current not in sections:
                sections[current] = []
            continue
        sections.setdefault(current, []).append(ln)

    # Join lines back into text blocks
    return {name: '\n'.join(block).strip() for name, block in sections.items() if block and ''.join(block).strip()}


def parse_resume(raw_text):
    """Parse raw resume text into structured JSON data with section-aware logic."""
    if not raw_text or len(raw_text.strip()) < 50:
        return {
            'error': 'Insufficient content to parse',
            'name': None,
            'email': None,
            'phone': None,
            'education': [],
            'experience': [],
            'skills': {'hard_skills': [], 'soft_skills': [], 'all': []},
            'sections': {},
            'ner_method': None,
        }

    # 1) Reconstruct & segment into sections
    sections = segment_sections(raw_text)

    header_block = sections.get('HEADER', '')
    profile_block = sections.get('PROFILE', '')
    education_block = sections.get('EDUCATION', '')
    experience_block = sections.get('EXPERIENCE', '')
    skills_block = sections.get('SKILLS', '')

    # 2) Run BERT NER only where needed
    print("Extracting entities using BERT NER (section-aware)...")
    header_text_for_ner = (header_block + "\n\n" + profile_block).strip() or raw_text
    bert_header = extract_entities_bert(header_text_for_ner)

    bert_education = extract_entities_bert(education_block) if education_block else {
        'colleges': [],
        'degrees': [],
    }
    bert_experience = extract_entities_bert(experience_block) if experience_block else {
        'companies': [],
        'job_titles': [],
    }
    bert_skills = extract_entities_bert(skills_block) if skills_block else {
        'skills': [],
    }

    # 3) Contact info only from header/profile
    contact_source = header_block + "\n\n" + profile_block
    name = _first_nonempty_str(bert_header.get('names')) or extract_name(contact_source)
    email = _normalize_email_value(_first_nonempty_str(bert_header.get('emails')) or extract_email(contact_source))
    phone = _first_nonempty_str(bert_header.get('phones')) or extract_phone(contact_source)

    # 4) Education: use only EDUCATION section (multi-line parser first)
    education = parse_education_section(education_block) if education_block else []
    if not education:
        edu_source = education_block or raw_text
        education = extract_education(edu_source)
        for college in bert_education.get('colleges', []):
            if college and not any(e.get('school') == college for e in education):
                education.append({
                    'year_range': None,
                    'school': college,
                    'course_or_strand': None,
                    'education_type': 'College',
                    'raw_text': college,
                })

    # 5) Experience: use only EXPERIENCE section (multi-line parser first)
    experience = parse_experience_section(experience_block) if experience_block else []
    exp_source = experience_block or raw_text
    if not experience:
        experience = extract_work_experience(exp_source)
    for company in bert_experience.get('companies', []):
        if company and not any(e.get('company') == company for e in experience):
            if company.lower() in exp_source.lower():
                experience.append({
                    'company': company,
                    'role': None,
                    'years': None,
                    'summary': None,
                    'raw_text': company,
                })
    for title in bert_experience.get('job_titles', []):
        if title and not any(e.get('role') == title for e in experience):
            if title.lower() in exp_source.lower():
                experience.append({
                    'company': None,
                    'role': title,
                    'years': None,
                    'summary': None,
                    'raw_text': title,
                })

    # 6) Skills: use SKILLS section when present
    skills_source = skills_block or raw_text
    skills_data = extract_skills(skills_source)
    all_skills = list(set(skills_data['all'] + bert_skills.get('skills', [])))

    parsed = {
        'name': name,
        'email': email,
        'phone': phone,
        'education': education,
        'experience': experience,
        'skills': {
            'hard_skills': skills_data['hard_skills'],
            'soft_skills': skills_data['soft_skills'],
            'all': all_skills,
        },
        'sections': sections,
        'parsed_at': datetime.now().isoformat(),
        'ner_method': 'BERT',
    }

    return parsed


def process_pending_resumes():
    """Process all resumes with pending ner_status."""
    print("Fetching resumes with pending ner_status...")
    
    # Get resumes that need processing
    sb = get_supabase()
    response = sb.table('resumes').select(
        'id, applicant_id, raw_extracted_content, ner_status'
    ).eq('ner_status', 'pending').execute()
    
    if not response.data:
        print("No resumes pending parsing.")
        return
    
    print(f"Found {len(response.data)} resumes to parse")
    
    success_count = 0
    failed_count = 0
    
    for resume in response.data:
        resume_id = resume['id']
        raw_content = resume.get('raw_extracted_content')
        
        print(f"\nProcessing resume {resume_id}...")
        
        try:
            # Parse the resume
            parsed_data = parse_resume(raw_content)
            
            # Update the resume with parsed data
            update_result = sb.table('resumes').update({
                'parsed_data': json.dumps(parsed_data),
                'ner_status': 'completed'
            }).eq('id', resume_id).execute()
            
            print(f"  Name: {parsed_data.get('name')}")
            print(f"  Email: {parsed_data.get('email')}")
            print(f"  Phone: {parsed_data.get('phone')}")
            print(f"  Skills found: {len(parsed_data.get('skills', {}).get('hard_skills', []))}")
            print(f"  Education entries: {len(parsed_data.get('education', []))}")
            print(f"  Experience entries: {len(parsed_data.get('experience', []))}")
            print(f"  Status: COMPLETED")
            
            success_count += 1
            
        except Exception as e:
            print(f"  Error: {e}")
            
            # Mark as failed
            try:
                sb.table('resumes').update({
                    'ner_status': 'failed',
                    'parsed_data': json.dumps({'error': str(e)})
                }).eq('id', resume_id).execute()
            except:
                pass
            
            failed_count += 1
    
    print(f"\n=== Resume Parsing Summary ===")
    print(f"Total processed: {len(response.data)}")
    print(f"Successful: {success_count}")
    print(f"Failed: {failed_count}")


if __name__ == "__main__":
    print("Starting Resume Parser for SentinelAI...")
    process_pending_resumes()
    print("Resume parsing completed.")
