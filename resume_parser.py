#!/usr/bin/env python3
"""
Resume Parser for SentinelAI
Parses raw extracted resume content into structured JSON data using BERT NER.
GPT is used as a preprocessing layer to clean/reorganize messy PDF text extraction.
"""

import re
import json
import os
from datetime import datetime
from supabase import Client, create_client

# Import GPT cleaner
try:
    from gpt_extractor import clean_with_gpt
except ImportError:
    # Fallback if gpt_extractor not available
    clean_with_gpt = None

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

# GPT availability flag
GPT_CLEANER_AVAILABLE = clean_with_gpt is not None


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
    'leadership', 'teamwork', 'communication', 'problem-solving', 'problem solving', 'analytical', 'project management',
    'agile', 'scrum', 'kanban', 'time management', 'adaptable', 'flexible', 'creative',
    'organized', 'detail-oriented', 'self-motivated', 'independent', 'collaborative',
    'presentation', 'public speaking', 'negotiation', 'conflict resolution', 'mentoring',
    'critical thinking', 'decision making', 'strategic planning', 'customer service',
    'interpersonal', 'interpersonal skills', 'verbal', 'written', 'team player', 'fast learner', 'quick learner',
    'collaboration', 'problem solving'
]


# Education classification constants
SHS_STRAND_INDICATORS = [
    # Acronyms
    'stem', 'abm', 'humss', 'tvl', 'gas',
    # Full names
    'science, technology, engineering and mathematics',
    'science technology engineering mathematics',
    'accountancy, business and management',
    'accountancy business and management',
    'humanities and social sciences',
    'technical-vocational-livelihood',
    'technical vocational livelihood',
    'general academic strand',
    'arts and design',
    'sports track',
    # Explicit phrases
    'senior high school',
    'senior high',
    'shs',
]

COLLEGE_DEGREE_INDICATORS = [
    # Bachelor's
    'bachelor of', 'bachelors of',
    'bs', 'b.s.', 'b.s', 'bachelor of science',
    'ba', 'b.a.', 'b.a', 'bachelor of arts',
    'bsc', 'b.sc', 'b.sc.',
    'ab', 'a.b.', 'a.b',
    # Master's
    'master', 'master of', 'masters of',
    'ms', 'm.s.', 'm.s', 'master of science',
    'ma', 'm.a.', 'm.a', 'master of arts',
    'mba', 'm.b.a.', 'm.b.a', 'master of business administration',
    'mpa', 'm.p.a.', 'm.p.a', 'master of public administration',
    # Doctorate
    'doctor', 'doctor of', 'doctoral',
    'phd', 'ph.d.', 'ph.d', 'dphil', 'd.phil.',
    'md', 'm.d.', 'm.d',
    'dds', 'd.d.s.', 'd.d.s',
    # Associate
    'associate', 'associate degree', 'associate of',
]


def classify_education_type(course_or_strand: str | None) -> str:
    """
    Classify education entry as Senior High School, College, or Other.
    
    RULES:
    1) Senior High detection relies on strand indicators, NOT school name
       - STEM, ABM, HUMSS, TVL, GAS, etc.
       - "Senior High School", "SHS"
    
    2) College detection relies on degree indicators, NOT school name
       - Bachelor of/BS/BA, Master/MS/MA/MBA, Doctor/PhD, Associate
       - Do NOT use "university" or "college" in school name as signals
    
    3) Fallback: "Other" if neither indicators are present
    
    This avoids misclassifying Senior High records taken at institutions
    with "College" or "University" in their name (common in Philippines).
    """
    if not course_or_strand:
        return 'Other'
    
    text_lower = course_or_strand.lower()
    
    # Check for Senior High indicators first (strands take priority)
    for indicator in SHS_STRAND_INDICATORS:
        if indicator in text_lower:
            return 'Senior High School'
    
    # Check for College degree indicators
    for indicator in COLLEGE_DEGREE_INDICATORS:
        if indicator in text_lower:
            return 'College'
    
    # Fallback: neither indicators found
    return 'Other'


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
    return m.group(0).lower() if m else None


def _pick_best_email(*candidates: str | None) -> str | None:
    for c in candidates:
        normalized = _normalize_email_value(c)
        if normalized:
            return normalized
    return None


def _first_nonempty_str(values):
    if not values:
        return None
    for v in values:
        if isinstance(v, str) and v.strip():
            return v.strip()
    return None


def _looks_spaced_allcaps(line: str) -> bool:
    # e.g. "C O M P U T E R  S C I E N C E"
    s = (line or "").strip()
    if len(s) < 8:
        return False
    # Many single-letter tokens
    tokens = [t for t in s.split(' ') if t]
    if len(tokens) < 5:
        return False
    single_letters = sum(1 for t in tokens if len(t) == 1 and t.isalpha())
    return single_letters / len(tokens) > 0.7


def extract_full_name(raw_text: str) -> str | None:
    """
    Extract name from the top of the resume.
    Supports two-line names like:
      JOHN RICH A.
      ALAYA-AY
    
    Also normalizes ALL CAPS names to Title Case.
    """
    lines = [ln.strip() for ln in (raw_text or "").splitlines() if ln.strip()]
    if not lines:
        return None

    # Consider first few lines only
    head = lines[:6]
    # Remove obvious non-name lines
    filtered = []
    for ln in head:
        if '@' in ln or re.search(r'\+?\d[\d\s().-]{8,}', ln) or 'http' in ln.lower():
            continue
        if _looks_spaced_allcaps(ln):
            continue
        # Avoid headings
        if _detect_section_heading(ln):
            continue
        filtered.append(ln)

    if not filtered:
        return None

    # Combine first two lines if second looks like surname continuation
    first = filtered[0]
    if len(filtered) >= 2:
        second = filtered[1]
        if (
            second.isupper()
            and len(second) <= 20
            and not any(ch.isdigit() for ch in second)
            and ('-' in second or second.isalpha())
        ):
            name = f"{first} {second}".strip()
        else:
            name = first
    else:
        name = first
    
    # Normalize ALL CAPS names to Title Case
    name = _normalize_name_case(name)
    
    return name


def _normalize_name_case(name: str) -> str:
    """
    Normalize name casing: convert ALL CAPS to Title Case while preserving:
    - Initials (single letters followed by periods)
    - Hyphenated names
    - Common name particles (da, de, del, la, le, van, von, etc.)
    
    Examples:
    - "JOHN RICH A. ALAYA-AY" -> "John Rich A. Alaya-ay"
    - "MARIA C. SANTOS" -> "Maria C. Santos"
    - "JUAN DELA CRUZ" -> "Juan dela Cruz"
    """
    if not name:
        return name
    
    # Check if name is ALL CAPS (most letters uppercase, length > 1)
    # Allow for names with spaces, hyphens, and single-letter initials
    upper_count = sum(1 for c in name if c.isupper())
    alpha_count = sum(1 for c in name if c.isalpha())
    
    # If not mostly uppercase, return as-is
    if alpha_count == 0 or (upper_count / alpha_count) < 0.7:
        return name
    
    # Common name particles that should remain lowercase in Title Case
    particles = ['da', 'de', 'del', 'la', 'le', 'van', 'von', 'y', 'e', 'and', 'of', 'the']
    
    # Split by hyphen first to preserve hyphenation
    parts = name.split('-')
    result_parts = []
    
    for part in parts:
        words = part.split()
        processed_words = []
        
        for i, word in enumerate(words):
            # Preserve single-letter initials (A., B., C., etc.)
            if len(word) == 2 and word.endswith('.') and word[0].isalpha():
                processed_words.append(word.upper())
            # Preserve initials at start (like "A." in "JOHN A. SMITH")
            elif len(word) == 1 and word.isalpha():
                processed_words.append(word.upper())
            # Check if it's a particle
            elif word.lower() in particles:
                processed_words.append(word.lower())
            else:
                # Convert to Title Case
                processed_words.append(word.title())
        
        result_parts.append(' '.join(processed_words))
    
    return '-'.join(result_parts)


# Known acronyms that should remain uppercase (including Philippine education terms)
KNOWN_ACRONYMS = {
    # Tech/IT
    'aws', 'azure', 'gcp', 'sql', 'html', 'css', 'php', 'api', 'ui', 'ux', 'etl',
    'devops', 'ci/cd', 'cd/c', 'rest', 'graphql', 'json', 'xml', 'http', 'https',
    'url', 'dns', 'ip', 'vpn', 'lan', 'wan', 'mac', 'pc', 'cpu', 'gpu', 'ram',
    'usb', 'hdmi', 'vga', 'gui', 'cli', 'sdk', 'ide', 'api', 'app', 'apps',
    # Business
    'hr', 'it', 'ict', 'ceo', 'cfo', 'cto', 'coo', 'cmo', 'cto', 'vp', 'gm',
    # Education (Philippine strands and degrees)
    'stem', 'abm', 'humss', 'tvl', 'gas', 'ict', 'shs',
    'bs', 'ba', 'bsc', 'msc', 'ms', 'ma', 'mba', 'mpa', 'phd', 'md', 'dds',
    'ce', 'ee', 'me', 'ce', 'che', 'coe',
    # Languages
    'english', 'filipino', 'tagalog', ' mandarin', 'cantonese',
    # Certifications
    'ccna', 'ccnp', 'ccie', 'aws certified', 'microsoft certified',
    # General
    'gpa', 'year', 'years', 'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
    'mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun',
    'present', 'current', 'expected',
}


def _is_all_caps_line(line: str) -> bool:
    """
    Check if a line is fully uppercase and should be converted to Title Case.
    Returns False for lines that are just acronyms (e.g., "AWS SQL").
    """
    if not line:
        return False
    
    s = line.strip()
    
    # Get only alphabetic characters
    alpha_chars = [c for c in s if c.isalpha()]
    if not alpha_chars:
        return False
    
    # Count uppercase and lowercase
    upper_count = sum(1 for c in alpha_chars if c.isupper())
    lower_count = sum(1 for c in alpha_chars if c.islower())
    
    # If there are lowercase letters (mixed case like "BS Computer Science"), it's not ALL CAPS
    if lower_count > 0:
        # If there's a mix of upper and lower, check if it's mostly uppercase
        return (upper_count / len(alpha_chars)) >= 0.8
    
    # If there are NO lowercase letters:
    # Check if it looks like a short acronym line (all words are short and all caps)
    words = s.split()
    if len(words) > 0:
        # If all words are short (likely acronyms), don't convert
        all_short_words = all(len(w) <= 4 for w in words)
        if all_short_words:
            return False
        # If mostly short words, still likely acronyms
        short_word_count = sum(1 for w in words if len(w) <= 4)
        if short_word_count / len(words) >= 0.6:
            return False
    
    # Otherwise, it's full words in ALL CAPS - should be converted
    return True


def _normalize_line_case(line: str) -> str:
    """
    Global ALL CAPS to Title Case normalization with acronym safety.
    
    Converts fully uppercase lines to Title Case while preserving:
    - Acronyms (STEM, AWS, SQL, ICT, TVL, etc.)
    - Initials (A., B.C.)
    - Words inside parentheses that are acronyms
    - Hyphenated words
    
    Examples:
    - "SCIENCE TECHNOLOGY AND MATHEMATICS (STEM)" -> "Science Technology and Mathematics (STEM)"
    - "BACHELOR OF SCIENCE IN COMPUTER SCIENCE" -> "Bachelor Of Science In Computer Science"
    - "AWS SQL PYTHON" -> "AWS SQL Python"
    """
    if not line:
        return line
    
    s = line.strip()
    
    # Don't convert if not mostly uppercase
    if not _is_all_caps_line(s):
        return line
    
    # Split by parentheses to handle acronyms inside parentheses
    # We need to preserve the original case inside parentheses if it's an acronym
    result_parts = []
    
    # Use a more sophisticated approach: split and process
    def process_segment(segment: str) -> str:
        """Process a segment of text (not inside parentheses)."""
        # Split by hyphen first
        hyphen_parts = segment.split('-')
        processed_hyphens = []
        
        for hp in hyphen_parts:
            words = hp.split()
            processed_words = []
            
            for word in words:
                word_stripped = word.strip()
                if not word_stripped:
                    processed_words.append(word)
                    continue
                
                # Preserve single-letter initials (A., B., C.)
                if len(word_stripped) == 2 and word_stripped.endswith('.') and word_stripped[0].isalpha():
                    processed_words.append(word_stripped.upper())
                elif len(word_stripped) == 1 and word_stripped.isalpha():
                    processed_words.append(word_stripped.upper())
                # Check if the word is a known acronym
                elif word_stripped.lower() in KNOWN_ACRONYMS:
                    processed_words.append(word_stripped.upper())
                # Check if word is all caps and short (likely an acronym)
                elif word_stripped.isupper() and len(word_stripped) <= 5:
                    processed_words.append(word_stripped.upper())
                else:
                    # Convert to Title Case (lowercase first, then title case)
                    processed_words.append(word_stripped.lower().title())
            
            processed_hyphens.append(' '.join(processed_words))
        
        return '-'.join(processed_hyphens)
    
    # Process the entire line
    # We'll handle parentheses specially
    result = []
    current_word = ""
    in_parentheses = False
    
    for i, char in enumerate(s):
        if char == '(':
            # Process any accumulated words before the parenthesis
            if current_word:
                result.append(process_segment(current_word))
                current_word = ""
            in_parentheses = True
            result.append('(')
        elif char == ')':
            in_parentheses = False
            # Keep the content inside parentheses as-is (acronyms)
            result.append(current_word + ')')
            current_word = ""
        elif in_parentheses:
            current_word += char
        else:
            if char == ' ':
                # Process accumulated words
                if current_word:
                    result.append(process_segment(current_word))
                    current_word = ""
                result.append(' ')
            else:
                current_word += char
    
    # Process remaining
    if current_word:
        if in_parentheses:
            result.append('(' + current_word)
        else:
            result.append(process_segment(current_word))
    
    return ''.join(result).strip()


def _normalize_education_text(text: str) -> str:
    """
    Normalize education-related text with proper casing.
    Applies global normalization but with special handling for education terms.
    """
    if not text:
        return text
    
    # Apply line-by-line normalization
    lines = text.split('\n')
    normalized_lines = [_normalize_line_case(line) for line in lines]
    
    return '\n'.join(normalized_lines)


def parse_skills_from_lines(lines: list[str]) -> dict:
    """Parse skills from lines with compound item preservation.

    Rules:
    - Keep "UI/UX" as one item (do not split into "UI" and "UX")
    - Split "HTML/CSS/PHP/SQL" into ["HTML", "CSS", "PHP", "SQL"] (slash-separated technologies)
    - Split "Xampp/MySQL/Firebase" into ["XAMPP", "MySQL", "Firebase"] (slash-separated)
    - Do NOT split by commas if it creates partial phrases
    - Remove filler words like "Basic" but keep the skill (e.g., "Basic JavaScript" -> "JavaScript")
    """

    def split_items(s: str) -> list[str]:
        if not s:
            return []
        s = s.replace('•', ' ')
        s = re.sub(r'\s+', ' ', s).strip()

        # Remove filler words like "Basic", "Proficient", "Advanced", etc.
        filler_words = ['basic', 'proficient', 'advanced', 'intermediate', 'expert', 'familiar', 'knowledgeable']
        for filler in filler_words:
            s = re.sub(rf'^\s*{filler}\s+', '', s, flags=re.IGNORECASE)
            s = re.sub(rf'\s+{filler}\s*$', '', s, flags=re.IGNORECASE)

        # Handle compound skills that should stay together
        # Replace UI/UX temporarily to protect it from splitting
        compound_protect = {
            'ui/ux': '<<UIUX>>',
            'c++': '<<CPP>>',
            'c#': '<<CSHARP>>',
            'node.js': '<<NODEJS>>',
            'next.js': '<<NEXTJS>>',
            'react.js': '<<REACTJS>>',
            'vue.js': '<<VUEJS>>',
        }

        s_lower = s.lower()
        for compound, placeholder in compound_protect.items():
            s = re.sub(rf'\b{re.escape(compound)}\b', placeholder, s, flags=re.IGNORECASE)

        # Split on slash-delimited lists like "HTML/CSS/PHP/SQL" or "Xampp/MySQL/Firebase"
        # But NOT on commas (which may split compound phrases incorrectly)
        parts = re.split(r'[/|]+', s)

        items = []
        for p in parts:
            t = p.strip()
            if not t:
                continue

            # Restore protected compounds
            for compound, placeholder in compound_protect.items():
                t = t.replace(placeholder, compound.title() if compound != 'c++' else 'C++')

            # Also handle any remaining comma-separated items (but be careful)
            # Only split commas if the parts look like individual technologies
            if ',' in t and len(t) > 20:
                # Might be a long phrase - don't split
                items.append(t)
            elif ',' in t:
                # Check if comma-separated items are short (likely separate skills)
                comma_parts = [cp.strip() for cp in t.split(',')]
                if all(len(cp) < 15 for cp in comma_parts):
                    items.extend(comma_parts)
                else:
                    items.append(t)
            else:
                items.append(t)

        return items

    def collect_after_heading(heading: str) -> list[str]:
        out = []
        h = heading.lower()
        for i, ln in enumerate(lines):
            # Case-insensitive heading matching
            if ln.strip().lower() == h or ln.strip().upper() == h.upper():
                j = i + 1
                while j < len(lines):
                    cur = lines[j].strip()
                    if not cur:
                        j += 1
                        continue
                    # stop at next major heading (including Soft Skills, Hard Skills, Education, etc.)
                    # NOTE: We DON'T stop at 'seminars' or 'workshops' because those might be
                    # subheadings within Soft Skills (e.g., "Seminar Attended" followed by skills)
                    section_stop = ('soft skills', 'hard skills', 'projects', 'references', 'education',
                                   'experience', 'trainings')
                    if cur.lower() in section_stop or _detect_section_heading(cur):
                        # Don't stop for "Seminar Attended" - it might be in the middle of soft skills
                        if 'seminar' in cur.lower() and ('attended' in cur.lower() or 'skill' in cur.lower()):
                            pass  # Continue collecting
                        else:
                            break
                    out.append(cur)
                    j += 1
        return out

    hard_lines = collect_after_heading('Hard Skills')
    soft_lines = collect_after_heading('Soft Skills')
    
    # Also collect soft skills that might appear after "Seminar Attended" or similar headings
    # These are often misclassified as seminars
    # Also filter out noise like event titles
    seminar_soft_skills = []
    found_seminar_heading = False
    for i, ln in enumerate(lines):
        lower = ln.strip().lower()
        if 'seminar' in lower or 'training' in lower:
            found_seminar_heading = True
            continue
        if found_seminar_heading:
            cur = ln.strip()
            if not cur:
                continue
            if cur.lower() in ('hard skills', 'soft skills', 'projects', 'references') or _detect_section_heading(cur):
                break
            # Check if this looks like a soft skill
            # Also exclude event-related lines
            event_keywords = ['meetup', 'talks', 'workshop', 'seminar', 'conference', 'attended', 'certificate', 'ai talks', 'coding clique']
            if any(skill in cur.lower() for skill in ['problem-solving', 'problem solving', 'interpersonal', 'time management', 'collaboration', 'communication', 'teamwork']) and not any(kw in cur.lower() for kw in event_keywords):
                seminar_soft_skills.append(cur)

    # If no explicit headings found under these exact titles, try uppercase versions
    if not hard_lines:
        hard_lines = collect_after_heading('HARD SKILLS')
    if not soft_lines:
        soft_lines = collect_after_heading('SOFT SKILLS')
    # Combine with seminar soft skills
    if seminar_soft_skills:
        soft_lines = soft_lines + seminar_soft_skills if soft_lines else seminar_soft_skills

    hard = []
    for ln in hard_lines:
        hard.extend(split_items(ln))
    soft = []
    for ln in soft_lines:
        # Don't treat SHS strand as a skill (it belongs in Education)
        if 'science, technology, engineering and mathematics' in ln.lower():
            continue
        if 'stem' in ln.lower():
            continue
        if 'abm' in ln.lower():
            continue
        if 'humss' in ln.lower():
            continue
        if 'tvl' in ln.lower():
            continue
        # Don't treat as training/seminar items
        if 'seminar' in ln.lower():
            continue
        if 'training' in ln.lower():
            continue
        if 'workshop' in ln.lower():
            continue
        # Don't treat event-related lines as skills
        if 'ai talks' in ln.lower():
            continue
        if 'coding clique' in ln.lower():
            continue
        if 'meetup' in ln.lower():
            continue
        # soft skills often one per line, but handle commas too
        soft.extend(split_items(ln))

    # If no explicit headings found, fall back to keyword scan on full text
    if not hard and not soft:
        blob = '\n'.join(lines)
        return extract_skills(blob)
    
    # If we have explicit headings but they didn't capture content, check if there are "Soft Skills" or "Hard Skills" lines
    # that were not captured - they might be in a different section
    if not soft:
        # Check for soft skills lines that weren't captured
        for i, ln in enumerate(lines):
            lower = ln.strip().lower()
            if lower == 'soft skills':
                # Collect lines after this heading
                j = i + 1
                while j < len(lines):
                    cur = lines[j].strip()
                    if not cur:
                        j += 1
                        continue
                    # Stop at next heading
                    if _detect_section_heading(cur) or cur.lower() in ('hard skills', 'projects', 'references', 'education', 'experience'):
                        break
                    # Skip strand keywords
                    if 'science, technology, engineering' in cur.lower() or 'stem' in cur.lower():
                        j += 1
                        continue
                    if cur.lower() in ('seminar', 'training', 'workshop'):
                        j += 1
                        continue
                    soft.append(cur)
                    j += 1
                break
    
    if not hard:
        # Check for hard skills lines that weren't captured
        for i, ln in enumerate(lines):
            lower = ln.strip().lower()
            if lower == 'hard skills':
                # Collect lines after this heading
                j = i + 1
                while j < len(lines):
                    cur = lines[j].strip()
                    if not cur:
                        j += 1
                        continue
                    # Stop at next heading
                    if _detect_section_heading(cur) or cur.lower() in ('soft skills', 'projects', 'references', 'education', 'experience'):
                        break
                    hard.append(cur)
                    j += 1
                break

    # Normalize casing, preserve common tech case, normalize variations
    def norm(item: str) -> str:
        s = item.strip()
        if not s:
            return s

        # Map of lowercase -> canonical form
        fixes = {
            'html': 'HTML',
            'htm': 'HTML',
            'css': 'CSS',
            'php': 'PHP',
            'sql': 'SQL',
            'c++': 'C++',
            'c#': 'C#',
            'javascript': 'JavaScript',
            'js': 'JavaScript',
            'typescript': 'TypeScript',
            'ts': 'TypeScript',
            'python': 'Python',
            'py': 'Python',
            'java': 'Java',
            'xampp': 'XAMPP',
            'xampp/mysql/firebase': 'XAMPP/MySQL/Firebase',
            'mysql': 'MySQL',
            'firebase': 'Firebase',
            'vscode': 'Visual Studio Code',
            'vs code': 'Visual Studio Code',
            'visual studio code': 'Visual Studio Code',
            'figma': 'Figma',
            'photoshop': 'Photoshop',
            'adobe photoshop': 'Photoshop',
            'illustrator': 'Illustrator',
            'adobe illustrator': 'Illustrator',
            'react': 'React',
            'reactjs': 'React',
            'react.js': 'React',
            'node': 'Node.js',
            'nodejs': 'Node.js',
            'node.js': 'Node.js',
            'next': 'Next.js',
            'nextjs': 'Next.js',
            'next.js': 'Next.js',
            'ui/ux': 'UI/UX',
            'ui ux': 'UI/UX',
            'ux/ui': 'UI/UX',
            'ui': 'UI',
            'ux': 'UX',
            'communication': 'Communication',
            'teamwork': 'Teamwork',
            'problem-solving': 'Problem-solving',
            'problem solving': 'Problem-solving',
            'leadership': 'Leadership',
            'time management': 'Time Management',
            'interpersonal': 'Interpersonal Skills',
            'interpersonal skills': 'Interpersonal Skills',
            'adaptability': 'Adaptability',
            'collaboration': 'Collaboration',
            'c++ programming': 'C++',
            'basic javascript': 'JavaScript',
            'basic c++ programming': 'C++',
        }

        # Check for exact match first (case-insensitive)
        key = s.lower()
        if key in fixes:
            return fixes[key]

        # Check if the item starts with a known technology abbreviation
        # (e.g., "HTML5" should still be recognized as HTML)
        for k, v in fixes.items():
            if key.startswith(k):
                # Replace the beginning with the canonical form
                return v + s[len(k):]

        return s

    def dedupe(seq: list[str]) -> list[str]:
        """Deduplicate case-insensitively while preserving best casing."""
        seen = set()
        out = []
        for it in seq:
            t = norm(it)
            k = t.lower()
            if not t or k in seen:
                continue
            seen.add(k)
            out.append(t)
        return out

    hard = dedupe(hard)
    soft = dedupe(soft)
    # Build skills.all as normalized unique union of hard_skills + soft_skills
    all_sk = dedupe(hard + soft)
    return {'hard_skills': hard, 'soft_skills': soft, 'all': all_sk}


def parse_trainings_from_lines(lines: list[str], is_section_block: bool = False) -> list[str]:
    """Parse trainings/seminars/certificates from lines.

    CRITICAL FIX: Trainings MUST come ONLY from the TRAININGS section.
    This function does NOT fall back to HEADER, PROFILE, or any other section.
    If TRAININGS section is missing, returns empty list.

    This prevents the bug where trainings were populated with:
    - Name/title lines from HEADER
    - Soft skills like "Problem-solving" from SOFT SKILLS section
    - Random content from other sections
    """
    items: list[str] = []

    # Keywords to exclude - these are clearly NOT training items
    exclude_training_items = [
        'problem-solving', 'problem solving',
        'interpersonal', 'time management',
        'detail-oriented', 'self-motivated',
        'critical thinking', 'decision making',
        'communication', 'teamwork', 'collaboration',
    ]

    # If this is not a section block, return empty list
    # Trainings should ONLY come from the TRAININGS section
    if not is_section_block:
        return []

    # Process all lines in the section
    for ln in lines:
        cur = ln.strip()
        if not cur:
            continue
        
        # Skip if it's exactly a soft skill
        if cur.lower() in exclude_training_items:
            continue
        
        # Skip if it looks like a header line (shouldn't happen if section splitting works)
        if _get_canonical_section(cur):
            continue
        
        # Skip if it contains name/contact patterns (from HEADER leakage)
        if '@' in cur or re.search(r'\+?\d{10,}', cur):
            continue
        
        # Skip if it looks like a project entry (role keywords)
        role_keywords = ['developer', 'designer', 'engineer', 'manager', 'intern']
        if any(kw in cur.lower() for kw in role_keywords) and len(cur) < 40:
            continue
        
        items.append(cur)

    # Deduplicate
    seen = set()
    out = []
    for it in items:
        k = it.lower()
        if k in seen:
            continue
        seen.add(k)
        out.append(it)
    return out


def parse_projects_from_lines(lines: list[str], is_section_block: bool = False) -> list[dict]:
    """Parse projects from lines.

    CRITICAL FIX: Projects and References must NEVER mix.
    - If "References" or "Referees" appears in PROJECTS section, truncate projects at that line
    - References content is routed to REFERENCES section, never parsed as projects
    - If is_section_block=True, treats all content as projects until References is encountered

    Post-processing:
    - Deduplicate projects by normalized project name (case-insensitive)
    - Treat role lines (e.g., "Game Designer") as details of the previous project
    """
    projects: list[dict] = []
    current = None

    # HARD BOUNDARY: Stop parsing projects immediately if these headers appear
    stop_headers = {
        'achievements', 'experience', 'education', 'skills', 'trainings',
        'seminars', 'certificates', 'references', 'referees',
        'work experience', 'professional experience', 'employment history',
        'technical skills', 'hard skills', 'soft skills', 'character reference',
        'professional reference', 'academic achievements'
    }

    # Role keywords that should be treated as project details, not new projects
    role_keywords = ['developer', 'designer', 'role', 'ui/ux', 'front-end', 'back-end', 'engineer',
                     'leader', 'manager', 'coordinator', 'member', 'team lead', 'programmer',
                     'game designer', 'game developer', 'web developer', 'mobile developer',
                     'full-stack', 'backend', 'frontend', 'full stack']

    # Description verbs - lines containing these are likely descriptions, not titles
    description_verbs = [
        'developed', 'designed', 'implemented', 'built', 'created', 'automated',
        'utilized', 'enhanced', 'collaborated', 'contributed', 'worked', 'used',
        'integrated', 'deployed', 'managed', 'led', 'maintained', 'optimized',
        'programmed', 'coded', 'wrote', 'fixed', 'tested', 'refactored', 'improved',
        'assisted', 'helped', 'participated', 'supported', 'learned', 'applied',
        'configured', 'installed', 'set up', 'updated', 'upgraded', 'monitored',
        'analyzed', 'researched', 'documented', 'prepared', 'presented', 'demonstrated',
        'using', 'via', 'through', 'with', 'by', 'for', 'to', 'of', 'in', 'on', 'at'
    ]

    # References indicators - CRITICAL: if we see these, STOP parsing projects immediately
    references_indicators = ['references', 'referees', 'character reference', 'professional reference']
    # Exact match patterns (to avoid matching words containing these)
    references_exact = {'references', 'referees'}

    def _is_title_line(line: str) -> bool:
        """Check if a line looks like a project title (not a description)."""
        # Must be reasonably short
        if len(line) > 80:
            return False
        
        # Must not end with a period
        if line.rstrip().endswith('.'):
            return False
        
        line_lower = line.lower()
        words = line_lower.split()
        if not words:
            return False
        
        first_word = words[0]
        
        # Must not start with description verbs
        if first_word in description_verbs:
            return False
        
        # Must not contain certain prepositions/article patterns that indicate descriptions
        # Project titles are typically noun phrases
        description_indicators = [' using ', ' via ', ' through ', ' with ', ' by ', ' for ',
                                   ' to ', ' of ', ' in ', ' on ', ' at ', ' from ', ' as ',
                                   ' and ', ' or ', ' but ', ' that ', ' which ', ' who ',
                                   ' was ', ' were ', ' is ', ' are ', ' been ', ' have ',
                                   ' this ', ' these ', ' those ', ' there ', ' where ',
                                   ' created', ' built', ' developed', ' designed', ' implemented']
        for indicator in description_indicators:
            if indicator in line_lower:
                return False
        
        # Must not be contact info
        if '@' in line or re.search(r'\+?\d{10,}', line):
            return False
        
        # Project titles typically don't have more than 6 words
        if len(words) > 6:
            return False
        
        # Project titles typically have at least 2 words (unless it's a proper name like "Lambda")
        if len(words) < 2:
            # Single word titles are only valid if they look like proper nouns (capitalized)
            if not line[0].isupper():
                return False
        
        # Project titles typically don't start with generic words like "some", "various", "multiple"
        generic_starters = ['some', 'various', 'multiple', 'several', 'certain', 'many', 'few',
                           'description', 'details', 'information', 'overview', 'summary']
        if first_word in generic_starters:
            return False
        
        return True

    def _is_role_line(line: str) -> bool:
        """Check if a line looks like a role/title."""
        line_lower = line.lower()
        return any(w in line_lower for w in role_keywords)

    for i, ln in enumerate(lines):
        cur = ln.strip()
        if not cur:
            continue

        cur_lower = cur.lower()
        
        # HARD BOUNDARY FIX: Check for section headers that should stop project parsing
        # Use exact match or contains check for multi-word headers
        is_stop_header = cur_lower in stop_headers
        if not is_stop_header:
            # Check for partial matches for multi-word headers
            for header in stop_headers:
                if ' ' in header and header in cur_lower:
                    is_stop_header = True
                    break
        
        if is_stop_header:
            if current:
                projects.append(current)
            # Stop immediately - do not parse further
            break

        # CRITICAL FIX: Check for References section header
        # Stop IMMEDIATELY at References (prevent section leakage)
        # Use exact match to avoid false positives
        if cur_lower in references_exact:
            if current:
                projects.append(current)
            # Return what we have - remaining lines will be routed to REFERENCES
            break
        
        # Also check for partial matches (e.g., "Character References")
        if any(ref in cur_lower for ref in references_indicators):
            if current:
                projects.append(current)
            break

        # Check if this looks like a role line (should be details of previous project)
        is_role = _is_role_line(cur)

        # Check if this looks like a new project title
        # Title heuristic: short, no period at end, doesn't start with description verbs
        if _is_title_line(cur) and not is_role:
            # Save previous project
            if current:
                projects.append(current)
            # Start new project
            current = {'name': cur, 'details': []}
        else:
            # This is a description/detail line OR a role line - add to current project
            if not current:
                # No current project, skip this line (don't create project from description)
                continue
            else:
                current['details'].append(cur)

    # Don't forget the last project
    if current:
        projects.append(current)

    # Filter out any entries that look like references or contact info
    filtered_projects = []
    for p in projects:
        name = p.get('name', '')
        if not name:
            continue
        name_lower = name.lower()
        # Skip if it looks like a reference entry (has email, phone, or typical reference patterns)
        if '@' in name or re.search(r'\+?\d{10,}', name):
            continue
        if any(kw in name_lower for kw in references_indicators):
            continue
        filtered_projects.append(p)

    # Deduplicate projects by normalized name
    seen_names = set()
    deduplicated = []
    for p in filtered_projects:
        if not p.get('name'):
            continue
        # Normalize name for comparison
        normalized_name = p['name'].lower().strip()
        if not normalized_name:
            continue
        if normalized_name in seen_names:
            # Merge details with existing project
            for existing in deduplicated:
                if existing['name'].lower().strip() == normalized_name:
                    # Merge details
                    existing_details = existing.get('details', []) or []
                    new_details = p.get('details', []) or []
                    # Add any new details that aren't already there
                    for d in new_details:
                        if d.lower() not in [x.lower() for x in existing_details]:
                            existing_details.append(d)
                    existing['details'] = existing_details
                    break
            continue
        seen_names.add(normalized_name)
        deduplicated.append(p)

    # finalize
    out = []
    for p in deduplicated:
        out.append(
            {
                'name': p.get('name'),
                'details': ' '.join(p.get('details', [])).strip() or None,
            }
        )
    return out


def parse_education_from_lines(lines: list[str]) -> list[dict]:
    """
    Robust education parsing for interleaved two-column layouts.
    Find year ranges, then attach nearest school + course/strand within a window.
    
    Classification logic:
    - If strand/track keywords exist (STEM, ABM, HUMSS, TVL, GAS, ICT, Technical-Vocational-Livelihood, 
      Arts and Design, Sports Track, etc.) -> classify as Senior High School
    - If degree keywords exist (Bachelor, BS, BA, Undergraduate, Master, Doctor, etc.) -> classify as College
    """
    
    # Strand/Track keywords for Senior High School classification
    shs_strand_keywords = [
        'stem', 'abm', 'humss', 'tvl', 'gas',
        'ict', 'information and communications technology',
        'technical-vocational-livelihood', 'technical vocational livelihood',
        'arts and design', 'sports track',
        'general academic strand',
        'accountancy business and management',
        'humanities and social sciences',
        'science technology engineering mathematics',
    ]
    
    # Degree keywords for College classification
    college_degree_keywords = [
        'bachelor', 'bs', 'ba', 'bsc', 'undergraduate',
        'master', 'msc', 'ms', 'ma', 'mba', 'mpa',
        'doctor', 'phd', 'md', 'dds',
        'associate', 'diploma',
    ]
    
    year_idx = []
    for i, ln in enumerate(lines):
        if re.search(r'\b(19|20)\d{2}\s*[-–—to]+\s*((?:19|20)\d{2}|present|current)\b', ln, re.IGNORECASE):
            year_idx.append(i)

    def is_school(s: str) -> bool:
        if not s:
            return False
        sl = s.lower()
        # Exclude achievement/activity related keywords
        exclude_kw = ['designed and produced', 'pubmats', 'publicity materials', 'led', 'committee', 'served as', 'representing', 'managed', 'coordinated', 'organized', 'event', 'multimedia', 'leader', 'manager', 'first year', 'representative']
        if any(kw in sl for kw in exclude_kw):
            return False
        return any(k in sl for k in ['university', 'college', 'campus', 'school', 'institute']) or 'cvsu' in sl

    def is_degree_or_strand(s: str) -> bool:
        if not s:
            return False
        sl = s.lower()
        # Check for SHS strand keywords
        if any(k in sl for k in shs_strand_keywords):
            return True
        # Check for College degree keywords
        if 'bachelor' in sl or re.search(r'\b(bs|ba|bsc|msc|ms|ma|mba|mpa|phd)\b', sl):
            return True
        if 'master' in sl or 'doctor' in sl:
            return True
        return False

    # Use centralized classify_education_type function (defined at module level)

    def find_nearest(predicate, center: int):
        # Prefer matches AFTER the year line, then BEFORE
        for d in range(1, 7):
            j = center + d
            if j < len(lines) and predicate(lines[j]):
                return lines[j]
        for d in range(1, 7):
            j = center - d
            if j >= 0 and predicate(lines[j]):
                return lines[j]
        return None

    entries = []
    used_years = set()
    for yi in year_idx:
        year_line = lines[yi]
        m = re.search(r'((?:19|20)\d{2})\s*[-–—to]+\s*((?:19|20)\d{2}|present|current)', year_line, re.IGNORECASE)
        if not m:
            continue
        yr = f"{m.group(1)} - {m.group(2).title()}"
        if yr in used_years:
            continue
        used_years.add(yr)

        school = find_nearest(lambda w: is_school(w) and not re.search(r'(19|20)\d{2}', w), yi)
        # Prefer strand/degree lines near the year line (often above/below school)
        course = find_nearest(lambda w: is_degree_or_strand(w) and not is_school(w), yi)

        # Classify education type based on course/strand
        education_type = classify_education_type(course or '')

        if course and 'bachelor of science in computer science' in course.lower():
            course = 'BS Computer Science'

        if school and 'cavite state university' in school.lower():
            school = re.sub(r'\s*-\s*imus\s*campus', ' - Imus', school, flags=re.IGNORECASE)

        # Only add entry if it has BOTH a valid school AND valid course/strand
        # This prevents achievement entries from being added as education
        if school and course and (is_school(school) or is_degree_or_strand(course)):
            entries.append(
                {
                    'school': school,
                    'raw_text': f"{school or ''} {course or ''} {yr}".strip(),
                    'year_range': yr,
                    'education_type': education_type,
                    'course_or_strand': course,
                }
            )

    return entries[:5]


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
        
        # Determine education type using centralized classification
        # This relies on strand/degree indicators, NOT school name
        education_type = classify_education_type(line)
        
        # Skip if can't determine type (returns 'Other')
        if education_type == 'Other':
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
            year_pattern = r'(19|20)\d{2}\s*[-–—to]+\s*(19|20)\d{2}|present|current'
            summary = re.sub(year_pattern, '', summary, flags=re.IGNORECASE)
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


# =============================================================================
# CANONICAL SECTION CONFIGURATION
# =============================================================================
# These are the ONLY valid section keys. All parsing MUST use these keys.
# NER should NEVER be used to decide which section content belongs to.

CANONICAL_SECTION_KEYS = [
    'HEADER',
    'CONTACT',
    'EDUCATION',
    'EXPERIENCE',
    'PROJECTS',
    'SKILLS',  # Combined skills section
    'HARD_SKILLS',
    'SOFT_SKILLS',
    'TRAININGS',
    'REFERENCES',
]

# Section aliases map various header texts to canonical keys
# Headers are matched case-insensitively and must match EXACTLY (no partial matches)
SECTION_ALIASES = {
    'HEADER': ['header', 'profile', 'summary', 'objective', 'about me', 'personal info'],
    'CONTACT': ['contact', 'contacts', 'contact information', 'contact info'],
    'EDUCATION': ['education', 'educational background', 'academic background', 'academic history'],
    'EXPERIENCE': ['experience', 'work experience', 'employment history', 'professional experience', 
                   'career history', 'working experience', 'job history'],
    'PROJECTS': ['projects', 'personal projects', 'academic projects', 'project experience'],
    # Combined SKILLS section (will be split into HARD_SKILLS and SOFT_SKILLS internally)
    'SKILLS': ['skills', 'core skills', 'competencies', 'key skills'],
    'HARD_SKILLS': ['hard skills', 'technical skills', 'tech skills', 'hard_skills'],
    'SOFT_SKILLS': ['soft skills', 'soft_skills', 'interpersonal skills'],
    'TRAININGS': [
        # Multi-word patterns first (longer matches take priority)
        'seminar attended', 'seminars attended',
        'trainings attended', 'training attended',
        'seminars/training', 'seminar/training',
        'seminars and training', 'seminars and trainings',
        'seminars and workshop', 'seminars and workshops',
        # Single word patterns
        'seminars', 'seminar',
        'trainings', 'training',
        'workshops', 'workshop',
        'certificates', 'certificate',
        'certifications', 'certification',
    ],
    'REFERENCES': ['references', 'referees', 'character references', 'professional references'],
}

# Build reverse lookup: normalized header -> canonical key
HEADER_TO_CANONICAL = {}
for canonical, aliases in SECTION_ALIASES.items():
    for alias in aliases:
        HEADER_TO_CANONICAL[alias.lower().strip()] = canonical
        # Also add without spaces/hyphens for fuzzy matching
        HEADER_TO_CANONICAL[alias.lower().strip().replace(' ', '').replace('-', '')] = canonical

# Legacy aliases for backward compatibility (used in _detect_section_heading)
LEGACY_SECTION_ALIASES = {
    'PROFILE': ['profile', 'summary', 'objective', 'about me'],
    'EDUCATION': ['education', 'educational background', 'academic background'],
    'SKILLS': ['skills', 'technical skills', 'core skills', 'competencies'],
    'SOFT SKILLS': ['soft skills'],
    'HARD SKILLS': ['hard skills', 'technical skills'],
    'EXPERIENCE': ['experience', 'work experience', 'employment history', 'professional experience', 'career history'],
    'PROJECTS': ['projects', 'personal projects', 'academic projects'],
    'ACHIEVEMENTS': ['achievements', 'awards', 'honors', 'recognitions'],
    'SEMINARS/TRAINING': [
        'seminars', 'seminars and training', 'seminars and trainings',
        'trainings', 'training', 'seminar', 'seminars/training',
        'certificate', 'certificates', 'certification', 'certifications',
        'workshops', 'workshop', 'seminars and workshop', 'seminars and workshops'
    ],
    'CONTACT': ['contact', 'contact information', 'contact info'],
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


def _get_canonical_section(header_line: str) -> str | None:
    """
    Convert a header line to its canonical section key.
    
    Returns None if the line is not a recognized section header.
    Headers must match exactly (after trim/lowercase) to avoid false positives.
    """
    if not header_line:
        return None
    
    # Normalize: lowercase, strip whitespace, remove extra spaces
    normalized = header_line.strip().lower()
    normalized = re.sub(r'\s+', ' ', normalized)
    normalized = normalized.rstrip(':').rstrip()
    
    if not normalized:
        return None
    
    # Check for exact match first
    if normalized in HEADER_TO_CANONICAL:
        return HEADER_TO_CANONICAL[normalized]
    
    # Check for match without spaces/hyphens
    compact = normalized.replace(' ', '').replace('-', '')
    if compact in HEADER_TO_CANONICAL:
        return HEADER_TO_CANONICAL[compact]
    
    # Check each alias for exact match (case-insensitive)
    for canonical, aliases in SECTION_ALIASES.items():
        for alias in aliases:
            if normalized == alias.lower().strip():
                return canonical
    
    return None


def split_into_sections(text: str) -> dict[str, list[str]]:
    """
    Deterministic section splitter that scans text line-by-line.
    
    CRITICAL: This is the SINGLE SOURCE OF TRUTH for section boundaries.
    NER must NEVER be used to decide which section content belongs to.
    
    Rules:
    1. First 1-3 non-empty lines before any header go to HEADER
    2. Each recognized header starts a new section
    3. Lines are assigned to the CURRENT section until next header
    4. Once a header is encountered, ALL subsequent lines belong to that section
       (until the next header)
    
    Returns a dict with canonical keys: HEADER, CONTACT, EDUCATION, EXPERIENCE,
    PROJECTS, HARD_SKILLS, SOFT_SKILLS, TRAININGS, REFERENCES
    """
    lines = _normalize_lines(text)
    sections: dict[str, list[str]] = {key: [] for key in CANONICAL_SECTION_KEYS}
    
    current_section = 'HEADER'
    header_line_count = 0
    max_header_lines = 5  # First N lines before a header go to HEADER
    
    for i, line in enumerate(lines):
        stripped = line.strip()
        
        # Skip empty lines but track position
        if not stripped:
            continue
        
        # Check if this is a section header
        canonical = _get_canonical_section(stripped)
        
        if canonical:
            # This is a recognized header - switch to that section
            current_section = canonical
            continue
        
        # If we're still in HEADER section and haven't seen a header yet,
        # limit how many lines go to HEADER
        if current_section == 'HEADER' and header_line_count >= max_header_lines:
            # Check if next non-empty line looks like content (not a header)
            # If so, we might have missed a header - stay in HEADER but don't grow forever
            pass
        
        # Add line to current section
        sections[current_section].append(line)
        
        if current_section == 'HEADER':
            header_line_count += 1
    
    return sections


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
        # Only do this for short ALL-CAPS prefixes to avoid merging list items/headers.
        prev_str = prev.strip()
        ln_str = ln.strip()
        if (
            ln_str
            and re.fullmatch(r'[A-Za-z][A-Za-z0-9/+.-]*', ln_str)
            and prev_end not in '.?!:'
            and prev_str.isupper()
            and (len(prev_str) <= 4 or prev_str in {'AWS', 'API', 'UI', 'UX', 'ETL', 'SQL'})
            and not looks_like_name_line(prev)
            and not looks_like_email(prev)
            and not looks_like_phone(prev)
            and not looks_like_url(prev)
        ):
            merged[-1] = prev + ' ' + ln_str
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
    """Parse EDUCATION section with YEAR-RANGE ANCHORS and PROXIMITY RULES.

    CRITICAL FIX: This implementation uses year-range anchors as the primary
    grouping mechanism to prevent degree/school mis-pairing.

    Algorithm:
    1. Find all year-range anchors (YYYY - YYYY, YYYY - Present, etc.)
       - Year can appear anywhere in the line, not just at the start
    2. For each year-range anchor:
       - If line contains BOTH year AND degree/strand → treat as degree+year,
         attach next non-empty line as school
       - If line contains ONLY year → treat next lines as school then degree
    3. Classify education_type based on keywords:
       - College: "Bachelor", "BS", "B.S.", "University", "College"
       - Senior High: "STEM", "ABM", "HUMSS", "Senior High"
       - High School: "High School", "Secondary"
    4. De-duplicate by (school, year_range, course_or_strand)

    This prevents the BERT NER flat-parsing issue where BS Computer Science
    gets incorrectly paired with the wrong year range.
    """

    # Strand/Track keywords for Senior High School classification
    shs_strand_keywords = [
        'stem', 'abm', 'humss', 'tvl', 'gas',
        'ict', 'information and communications technology',
        'technical-vocational-livelihood', 'technical vocational livelihood',
        'arts and design', 'sports track',
        'general academic strand',
        'accountancy business and management',
        'humanities and social sciences',
        'science technology engineering mathematics',
    ]

    # Degree keywords for College classification
    college_degree_keywords = [
        'bachelor', 'bs', 'ba', 'bsc', 'msc', 'ms', 'ma', 'mba', 'mpa',
        'master', 'doctor', 'phd', 'md', 'dds',
        'associate', 'diploma', 'degree',
    ]

    # High school keywords
    high_school_keywords = ['high school', 'secondary', 'junior high', 'jhs']

    if not text or len(text.strip()) < 10:
        return []

    lines = [ln.strip() for ln in _normalize_lines(text) if ln.strip()]

    # Helper functions
    def is_school_line(s: str) -> bool:
        """Check if line looks like a school name."""
        if not s:
            return False
        sl = s.lower()
        exclude = ['designed', 'pubmats', 'led', 'committee', 'served', 'representing',
                   'managed', 'coordinated', 'organized', 'event', 'multimedia', 'leader']
        if any(kw in sl for kw in exclude):
            return False
        return any(k in sl for k in ['university', 'college', 'campus', 'school', 'institute', 'academy'])

    def is_course_line(s: str) -> bool:
        """Check if line looks like a degree/course/strand."""
        if not s:
            return False
        sl = s.lower()
        # Check SHS strands
        if any(kw in sl for kw in shs_strand_keywords):
            return True
        # Check college degrees
        if any(kw in sl for kw in college_degree_keywords):
            return True
        # Check for BS/BA/MS/MA patterns
        if re.search(r'\b(b\.?s\.?|b\.?a\.?|m\.?s\.?|m\.?a\.?|bsc|msc|mba)\b', sl):
            return True
        return False

    def extract_year_range(s: str) -> str | None:
        """Extract year range from a string, returns normalized range or None."""
        # Match patterns like "2022 - Present", "2019-2023", "2020 to 2021"
        yr_match = re.search(r'(\d{4})\s*[-–—to]+\s*(\d{4}|present|current)', s, re.IGNORECASE)
        if yr_match:
            start_yr = yr_match.group(1)
            end_yr = yr_match.group(2).title()
            return f"{start_yr} - {end_yr}"
        # Match single year
        single_match = re.search(r'\b(19|20)\d{2}\b', s)
        if single_match:
            return single_match.group(0)
        return None

    def strip_year_from_line(s: str) -> str:
        """Remove year range patterns from a line."""
        # Remove year ranges like "2022 - Present", "2019-2023"
        result = re.sub(r'\d{4}\s*[-–—to]+\s*(?:\d{4}|present|current)', '', s, flags=re.IGNORECASE)
        # Remove single years at start or end
        result = re.sub(r'^(19|20)\d{2}\b', '', result)
        result = re.sub(r'\b(19|20)\d{2}$', '', result)
        return result.strip()

    def classify_education_type_local(course: str, school: str) -> str:
        """Classify education type based ONLY on course/strand content."""
        return classify_education_type(course)

    def normalize_key(entry: dict) -> tuple:
        """Generate deduplication key: (school, year_range, course_or_strand)."""
        school_norm = re.sub(r'[^\w]', '', (entry.get('school') or '').lower())
        course_norm = re.sub(r'[^\w]', '', (entry.get('course_or_strand') or '').lower())
        year_norm = (entry.get('year_range') or '').lower().replace(' ', '')
        return (school_norm, year_norm, course_norm)

    # Step 1: Process lines to build education entries
    entries = []
    used_lines = set()  # Track which lines have been consumed

    i = 0
    while i < len(lines):
        if i in used_lines:
            i += 1
            continue

        line = lines[i]
        year_range = extract_year_range(line)

        if not year_range:
            i += 1
            continue

        # We found a year in this line
        used_lines.add(i)
        school = None
        course = None

        # Check if this line also contains degree/strand info
        line_without_year = strip_year_from_line(line)
        has_degree_in_line = is_course_line(line_without_year)
        has_school_in_line = is_school_line(line_without_year)

        if has_degree_in_line or has_school_in_line:
            # CASE 1: Line has BOTH year AND degree/strand/school
            # First, try to extract school and course from this same line (single-line format)
            if has_school_in_line:
                # Try to extract school from the line
                school_match = None
                for school_keyword in ['university', 'college', 'campus', 'school', 'institute', 'academy']:
                    pattern = rf'\b([^,]*{school_keyword}[^,]*)\b'
                    match = re.search(pattern, line_without_year, re.IGNORECASE)
                    if match:
                        school_match = match.group(1).strip()
                        break
                if school_match:
                    school = school_match
                    # Remaining part might be course
                    remaining = line_without_year.replace(school, '').strip()
                    if remaining and is_course_line(remaining):
                        course = remaining

            if not school and has_degree_in_line:
                # Try to extract course from the line
                course = line_without_year.strip()

            # If we only have course or school from the line, look for the other in next lines
            if (course and not school) or (school and not course):
                j = i + 1
                while j < len(lines) and j not in used_lines:
                    next_line = lines[j]
                    if not next_line:
                        j += 1
                        continue

                    if not school and is_school_line(next_line):
                        school = next_line
                        used_lines.add(j)
                        break
                    elif not course and is_course_line(next_line):
                        course = next_line
                        used_lines.add(j)
                        break
                    j += 1

        else:
            # CASE 2: Line has ONLY year
            # Check if this is a single-line entry with tab/space-separated fields
            # Example: "2016 - 2020  University of Example  Bachelor of Science"
            parts = [p.strip() for p in re.split(r'\s{2,}', line) if p.strip()]
            if len(parts) >= 2:
                # Try to find school and course in the parts
                for part in parts:
                    if not school and is_school_line(part):
                        school = part
                    elif not course and is_course_line(part):
                        course = part

            # Check previous lines for school and/or degree (school before degree before year pattern)
            prev_idx = i - 1
            if prev_idx >= 0 and prev_idx not in used_lines:
                prev_line = lines[prev_idx]
                if is_course_line(prev_line):
                    course = prev_line
                    used_lines.add(prev_idx)
                    # Check one more line back for school
                    prev2_idx = i - 2
                    if prev2_idx >= 0 and prev2_idx not in used_lines:
                        prev2_line = lines[prev2_idx]
                        if is_school_line(prev2_line):
                            school = prev2_line
                            used_lines.add(prev2_idx)

            # Now look for school and course in next lines
            if not school or not course:
                j = i + 1
                found_school = False

                while j < len(lines) and j not in used_lines:
                    next_line = lines[j]
                    if not next_line:
                        j += 1
                        continue

                    if not found_school and not school and is_school_line(next_line):
                        school = next_line
                        used_lines.add(j)
                        found_school = True
                        j += 1
                        continue

                    if found_school and not course and is_course_line(next_line):
                        course = next_line
                        used_lines.add(j)
                        break

                    # If we haven't found school yet and no course from prev line,
                    # check if this could be the course
                    if not found_school and not course and is_course_line(next_line):
                        course = next_line
                        used_lines.add(j)
                        j += 1
                        continue

                    j += 1

        # Normalize course name
        if course:
            course = re.sub(r'\s+', ' ', course).strip()
            # Standardize degree abbreviations
            course = re.sub(r'\bBachelor\s+of\s+Science\s+in\b', 'BS', course, flags=re.IGNORECASE)
            course = re.sub(r'\bBachelor\s+of\s+Arts\s+in\b', 'BA', course, flags=re.IGNORECASE)
            course = re.sub(r'\bB\.?S\.?\s+in\b', 'BS', course, flags=re.IGNORECASE)

        # Normalize school name
        if school:
            school = re.sub(r'\s*-\s*imus\s*campus', ' - Imus', school, flags=re.IGNORECASE)

        # Create entry if we have minimum required info
        if school or course:
            education_type = classify_education_type_local(course or '', school or '')

            entry = {
                'school': school,
                'raw_text': f"{school or ''} | {course or ''} | {year_range}".strip(' |'),
                'year_range': year_range,
                'education_type': education_type,
                'course_or_strand': course,
            }
            entries.append(entry)

        i += 1

    # If no entries found with year anchors, fall back to old parsing logic
    if not entries:
        return _parse_education_fallback(lines)

    # Step 2: De-duplicate entries by (school, year_range, course_or_strand)
    seen = set()
    deduplicated = []
    for entry in entries:
        key = normalize_key(entry)
        if key not in seen:
            seen.add(key)
            deduplicated.append(entry)

    return deduplicated[:5]


def _parse_education_fallback(lines: list[str]) -> list[dict]:
    """Fallback education parsing when no year anchors are found."""
    entries = []

    shs_strand_keywords = ['stem', 'abm', 'humss', 'tvl', 'gas', 'ict']

    i = 0
    while i < len(lines):
        ln = lines[i]
        lower = ln.lower()

        if lower in ('education',):
            i += 1
            continue

        is_degree = (
            'bachelor' in lower
            or 'master' in lower
            or 'doctor' in lower
            or re.search(r'\b(bs|ba|ma|ms|bsc|msc|mba|phd)\b', lower) is not None
            or 'computer science' in lower
            or any(kw in lower for kw in shs_strand_keywords)
        )
        if not is_degree:
            i += 1
            continue

        degree_line = ln
        year_line = None
        school_line = None

        # Look for year + school nearby
        look = lines[i + 1 : i + 6]
        for cand in look:
            if year_line is None and re.search(r'(19|20)\d{2}', cand):
                year_line = cand
            if school_line is None and any(k in cand.lower() for k in ['university', 'college', 'school', 'institute']):
                school_line = cand

        # Extract year range
        year_range = None
        if year_line:
            m = re.search(r'((?:19|20)\d{2})\s*[-–—to]+\s*((?:19|20)\d{2}|present|current)?', year_line, re.IGNORECASE)
            if m:
                year_range = f"{m.group(1)} - {m.group(2).title()}" if m.group(2) else m.group(1)

        # Use centralized classification based ONLY on degree/strand content
        education_type = classify_education_type(degree_line)

        entries.append({
            'school': school_line,
            'raw_text': f"{degree_line} | {year_line or ''} | {school_line or ''}".strip(),
            'year_range': year_range,
            'education_type': education_type,
            'course_or_strand': degree_line,
        })
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

        # Pattern: Company + Years on same line (e.g., "CONCEPCION BUSINESS SERVICES, INC. AUGUST 2025-SEPTEMBER 2025")
        # followed by Role on next line (e.g., "DATA ENGINEER INTERN")
        year_range_pattern = re.compile(
            r'(\b(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*\.?\s+\d{4}\s*[-–—]\s*(?:\b(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*\.?\s+)?\d{4}\b)',
            re.IGNORECASE
        )
        year_range_alt = re.compile(
            r'(\b\d{4}\s*[-–—]\s*(?:\d{4}|present|current)\b)',
            re.IGNORECASE
        )
        
        year_match = year_range_pattern.search(ln) or year_range_alt.search(ln)
        if year_match:
            years = year_match.group(1).strip()
            # Company is the part before the year range
            company = ln[:year_match.start()].strip()
            # Remove trailing punctuation from company
            company = re.sub(r'[\s,;:\-]+$', '', company).strip()
            
            role = None
            bullets: list[str] = []
            
            # Next line is the role (unless it's a section header)
            j = i + 1
            if j < len(lines):
                next_line = lines[j]
                if not _detect_section_heading(next_line) and not re.search(r'(19|20)\d{2}', next_line):
                    role = next_line.title()
                    j += 1
            
            # Collect remaining lines as bullets/summary
            while j < len(lines):
                nxt = lines[j]
                if _detect_section_heading(nxt):
                    break
                # Next company+years pattern starts
                if (year_range_pattern.search(nxt) or year_range_alt.search(nxt)):
                    break
                # Next uppercase company line starts
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
                    'raw_text': f"{company} | {role} | {years}" if role else f"{company} | {years}",
                }
            )
            i = j
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
    """Return canonical section name if line looks like a heading (legacy version).
    
    NOTE: For new code, use _get_canonical_section() instead.
    This function is kept for backward compatibility.
    """
    stripped = line.strip()
    if not stripped:
        return None

    # Short, mostly non-numeric, often all-caps or Title Case
    if len(stripped) > 60:
        return None
    if any(ch.isdigit() for ch in stripped):
        return None
    candidate = stripped.rstrip(':').lower()

    # Check new canonical section aliases first
    canonical = _get_canonical_section(line)
    if canonical:
        return canonical

    # Fall back to legacy aliases
    for canonical, aliases in LEGACY_SECTION_ALIASES.items():
        for alias in aliases:
            if candidate == alias:
                return canonical
            if alias == 'skills' or alias.endswith(' skills'):
                if candidate == alias:
                    return canonical
                continue
            if len(alias) <= 8:
                if re.search(r'\b' + re.escape(alias) + r'\b', candidate):
                    return canonical
            elif alias in candidate:
                return canonical

    # Additional stop markers for CONTACT section
    contact_stop_markers = ['soft skills', 'hard skills', 'skills']
    if candidate in contact_stop_markers:
        return 'SKILLS'

    return None


def segment_sections(raw_text: str) -> dict[str, str]:
    """Split resume into high-level sections using deterministic section-first parsing.
    
    CRITICAL: This function uses split_into_sections() as the single source of truth.
    NER is NEVER used to decide section boundaries.
    
    Returns sections with both canonical keys (HEADER, CONTACT, etc.) and legacy keys
    (PROFILE, SKILLS, SEMINARS/TRAINING) for backward compatibility.
    """
    # Use the new deterministic section splitter
    canonical_sections = split_into_sections(raw_text)
    
    # Convert to text blocks
    sections: dict[str, str] = {}
    for name, lines in canonical_sections.items():
        if lines:
            sections[name] = '\n'.join(lines).strip()
    
    # Map canonical keys to legacy keys for backward compatibility
    # SKILLS -> combines HARD_SKILLS and SOFT_SKILLS
    hard_skills = canonical_sections.get('HARD_SKILLS', [])
    soft_skills = canonical_sections.get('SOFT_SKILLS', [])
    if hard_skills or soft_skills:
        skills_lines = []
        if hard_skills:
            skills_lines.append('Hard Skills')
            skills_lines.extend(hard_skills)
        if soft_skills:
            skills_lines.append('Soft Skills')
            skills_lines.extend(soft_skills)
        sections['SKILLS'] = '\n'.join(skills_lines).strip()
    
    # TRAININGS -> SEMINARS/TRAINING
    if 'TRAININGS' in sections:
        sections['SEMINARS/TRAINING'] = sections['TRAININGS']
    
    # HEADER -> PROFILE (if HEADER contains non-contact content)
    if 'HEADER' in sections:
        sections['PROFILE'] = sections['HEADER']
    
    return sections


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
    
    # MANDATORY: Use GPT to clean/reorganize messy text before NER
    # This helps with multi-column PDF layouts that produce interleaved text
    # NER should NEVER process raw PDF extracted text - it must go through GPT cleaning
    cleaned_text = raw_text
    gpt_cleaning_status = 'not_attempted'
    
    if GPT_CLEANER_AVAILABLE:
        try:
            cleaned_text, gpt_cleaning_status = clean_with_gpt(raw_text)
            if gpt_cleaning_status == 'success':
                print("GPT text cleaning successful!")
            elif gpt_cleaning_status == 'lossless_failed':
                # Lossless validation failed - GPT cleaned but lost important content
                # Fall back to raw_text for NER (this was already done in clean_with_gpt)
                print("WARNING: GPT cleaning FAILED LOSSLESS validation - strand keywords missing")
                print("WARNING: Using raw_text for NER to preserve all content")
                cleaned_text = raw_text  # Ensure we use raw text
                text_for_parsing = cleaned_text
            else:
                # GPT cleaning failed/skipped - this should NOT happen in normal operation
                # Log error but try to continue with raw_text (for backwards compatibility)
                print(f"WARNING: GPT cleaning skipped/failed: {gpt_cleaning_status}")
                print("WARNING: NER will process raw text (not ideal for multi-column layouts)")
        except Exception as e:
            print(f"GPT cleaning error: {e}")
            gpt_cleaning_status = 'failed'
            # Don't fall back to raw_text - raise error to force fixing the issue
            raise RuntimeError(f"GPT cleaning is mandatory but failed: {e}")
    else:
        # GPT extractor not available - this is an error
        raise RuntimeError(
            "GPT cleaner (gpt_extractor.py) is not available. "
            "NER cannot process raw PDF text - GPT cleaning is mandatory."
        )
    
    # Use cleaned text for NER (or raw_text if lossless validation failed)
    text_for_parsing = cleaned_text
    
    # Apply global ALL CAPS -> Title Case normalization
    # This converts uppercase education lines, degree titles, etc. to proper casing
    # while preserving acronyms (STEM, AWS, SQL, ICT, TVL, etc.)
    lines = text_for_parsing.split('\n')
    normalized_lines = []
    for line in lines:
        normalized_lines.append(_normalize_line_case(line))
    text_for_parsing = '\n'.join(normalized_lines)
    
    # =============================================================================
    # SECTION-FIRST PARSING ARCHITECTURE
    # =============================================================================
    # CRITICAL: split_into_sections() is the SINGLE SOURCE OF TRUTH for section boundaries.
    # NER is NEVER used to decide which section content belongs to.
    # BERT NER only enriches entities WITHIN sections, never reassigns across sections.
    
    # 1) Split into canonical sections using deterministic header detection
    canonical_sections = split_into_sections(text_for_parsing)
    all_lines = _normalize_lines(text_for_parsing)
    
    # Get section content using canonical keys
    header_block = '\n'.join(canonical_sections.get('HEADER', []))
    contact_block = '\n'.join(canonical_sections.get('CONTACT', []))
    education_block = '\n'.join(canonical_sections.get('EDUCATION', []))
    experience_block = '\n'.join(canonical_sections.get('EXPERIENCE', []))
    projects_block_lines = canonical_sections.get('PROJECTS', [])
    projects_block = '\n'.join(projects_block_lines)
    hard_skills_lines = canonical_sections.get('HARD_SKILLS', [])
    soft_skills_lines = canonical_sections.get('SOFT_SKILLS', [])
    trainings_lines = canonical_sections.get('TRAININGS', [])
    trainings_block = '\n'.join(trainings_lines)
    references_lines = canonical_sections.get('REFERENCES', [])
    references_block = '\n'.join(references_lines)
    
    # Build legacy sections dict for backward compatibility
    sections = segment_sections(text_for_parsing)

    # =============================================================================
    # 2) BERT NER - SECTION BOUNDARY ENFORCED
    # =============================================================================
    # CRITICAL: BERT NER is called PER-SECTION to prevent cross-section contamination.
    # NER output is ONLY used for enrichment/validation, NEVER for schema assignment.
    
    print("Extracting entities using BERT NER (section-boundary enforced)...")
    
    # NER only within HEADER + CONTACT for name/email/phone
    header_text_for_ner = (header_block + "\n" + contact_block).strip()
    bert_header = extract_entities_bert(header_text_for_ner) if header_text_for_ner else {
        'names': [], 'emails': [], 'phones': []
    }

    # NER only within EDUCATION section
    bert_education = extract_entities_bert(education_block) if education_block else {
        'colleges': [], 'degrees': [],
    }
    
    # NER only within EXPERIENCE section
    bert_experience = extract_entities_bert(experience_block) if experience_block else {
        'companies': [], 'job_titles': [],
    }
    
    # NER only within SKILLS sections (combined)
    skills_text_for_ner = '\n'.join(hard_skills_lines + soft_skills_lines)
    bert_skills = extract_entities_bert(skills_text_for_ner) if skills_text_for_ner else {
        'skills': [],
    }
    
    # NER only within TRAININGS section
    bert_trainings = extract_entities_bert(trainings_block) if trainings_block else {
        'skills': [], 'dates': [],
    }
    
    # NER only within PROJECTS section
    bert_projects = extract_entities_bert(projects_block) if projects_block else {
        'companies': [], 'dates': [],
    }

    # =============================================================================
    # 3) SECTION-FIRST CONTACT INFO EXTRACTION
    # =============================================================================
    # CRITICAL: name ONLY from HEADER (first 1-3 lines)
    # phone/email from CONTACT section (with optional scan in HEADER if missing)
    # NER only enriches, never drives the schema assignment
    
    # Name: ONLY from HEADER section (first 1-3 lines)
    name = extract_full_name(header_block)
    if not name:
        # Optional: NER enrichment within HEADER only
        name = _first_nonempty_str(bert_header.get('names'))
    if not name:
        # Last resort: scan header lines
        name = extract_name(header_block)
    if name:
        name = _normalize_name_case(name)
    
    # Email: from CONTACT section first, then HEADER if missing
    email = extract_email(contact_block)
    if not email:
        email = extract_email(header_block)
    if not email and bert_header.get('emails'):
        # NER enrichment only
        email = _pick_best_email(_first_nonempty_str(bert_header.get('emails')))
    
    # Phone: from CONTACT section first, then HEADER if missing  
    phone = extract_phone(contact_block)
    if not phone:
        phone = extract_phone(header_block)
    if not phone:
        phone = _first_nonempty_str(bert_header.get('phones'))

    # 4) Education: use section-first parsing - ONLY parse from education block
    # CRITICAL FIX: Do NOT run education parser on all_lines - that causes cross-section contamination
    # GPT sections are the source of truth; BERT NER only enriches within section boundaries
    education_candidates: list[dict] = []

    # Parse only from education block (GPT section boundaries are authoritative)
    if education_block:
        education_candidates.extend(parse_education_section(education_block))

    # Only fall back to full text parsing if education block is empty
    if not education_candidates and text_for_parsing:
        education_candidates.extend(parse_education_from_lines(all_lines))

    def _normalize_edu_field(s: str) -> str:
        """Normalize education field for deduplication: lowercase, trim, collapse spaces, remove punctuation."""
        if not s:
            return ''
        # Lowercase and strip
        s = s.strip().lower()
        # Collapse multiple spaces into one
        s = re.sub(r'\s+', ' ', s)
        # Remove common punctuation that causes duplicates
        s = re.sub(r'[.,;:\-–—()/]', '', s)
        return s.strip()

    def _is_valid_education_entry(e: dict) -> bool:
        """Validate that education entry makes sense (school matches education_type)."""
        school = (e.get('school') or '').lower()
        edu_type = (e.get('education_type') or '').lower()
        course = (e.get('course_or_strand') or '').lower()
        
        # If Senior High School type
        if edu_type == 'senior high school':
            # Reject clear universities (CVSU, state university, etc.)
            if 'state university' in school or 'university' in school:
                return False
            # Allow specific colleges that are known to have senior high programs
            # Emilio Aguinaldo College is a special case
            if 'emilio aguinaldo' in school:
                return True
            # Reject other colleges
            if 'college' in school:
                return False
            # Accept high schools
            return 'high school' in school or 'senior high' in school
        
        # If College type
        if edu_type == 'college':
            if 'high school' in school and 'senior high' not in school:
                return False
            return 'university' in school or 'college' in school or 'institute' in school
        
        return True

    def _has_degree_in_block(entry_text: str, block_text: str) -> bool:
        """
        Check if degree or strand appears within the same education block (not carried over from previous entry).
        This prevents degree carryover: only attach degree/strand to an education entry if the text
        appears within the same nearby education block.
        """
        if not entry_text or not block_text:
            return False
        
        entry_lower = entry_text.lower()
        block_lower = block_text.lower()
        
        # Degree keywords to check
        degree_keywords = ['bachelor', 'bs', 'ba', 'bsc', 'msc', 'ms', 'ma', 'mba', 'master', 'doctor', 'phd']
        
        # SHS strand keywords
        strand_keywords = ['stem', 'abm', 'humss', 'tvl', 'gas', 'ict', 'arts and design', 'sports track']
        
        for kw in degree_keywords + strand_keywords:
            if kw in entry_lower and kw in block_lower:
                return True
        return False

    def edu_key(e: dict) -> tuple:
        """Generate a stable deduplication key for education entries."""
        return (
            _normalize_edu_field(e.get('school') or ''),
            _normalize_edu_field(e.get('year_range') or ''),
            _normalize_edu_field(e.get('course_or_strand') or ''),
            _normalize_edu_field(e.get('education_type') or ''),
        )

    seen = set()
    education: list[dict] = []
    last_degree = None  # Track last seen degree to detect carryover
    
    for e in education_candidates:
        # Skip invalid entries (e.g., university paired with STEM which belongs to high school)
        if not _is_valid_education_entry(e):
            continue
        
        k = edu_key(e)
        if k in seen:
            continue
        
        # Prevent degree carryover: if this entry has no degree/strand but previous entry did,
        # check if the degree appears in the same block
        course = e.get('course_or_strand') or ''
        if not course or not _has_degree_in_block(course, e.get('raw_text', '')):
            # If no clear degree in this entry's text, check if it's carrying over from previous
            if last_degree and not course:
                # This entry likely inherited degree from previous - skip it
                continue
        
        # Update last seen degree
        if course:
            last_degree = course
        
        seen.add(k)
        education.append(e)

    if not education:
        edu_source = education_block or raw_text
        education = extract_education(edu_source)

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

    # =============================================================================
    # 6) SECTION-FIRST SKILLS EXTRACTION
    # =============================================================================
    # CRITICAL: skills.hard_skills ONLY from HARD_SKILLS section
    # skills.soft_skills ONLY from SOFT_SKILLS section
    # Combined SKILLS section is parsed with internal subheading detection
    # NER only enriches within sections, never reassigns across sections
    
    skills_data = {'hard_skills': [], 'soft_skills': [], 'all': []}
    
    # Get combined SKILLS section lines (for backward compatibility)
    skills_lines = canonical_sections.get('SKILLS', [])

    # Parse from canonical section lines
    if hard_skills_lines or soft_skills_lines:
        section_lines = []
        if hard_skills_lines:
            section_lines.append('Hard Skills')
            section_lines.extend(hard_skills_lines)
        if soft_skills_lines:
            section_lines.append('Soft Skills')
            section_lines.extend(soft_skills_lines)
        skills_data = parse_skills_from_lines(section_lines)
    elif skills_lines:
        # Combined SKILLS section - parse with internal subheading detection
        skills_data = parse_skills_from_lines(skills_lines)
    else:
        # No explicit skills sections found - return empty
        # DO NOT fall back to scanning all lines (prevents cross-section contamination)
        pass

    # NER enrichment: only add BERT skills if we have skills sections
    # NER must NEVER create new sections or move content between sections
    skills_block_exists = bool(hard_skills_lines or soft_skills_lines or skills_lines)
    if skills_block_exists and bert_skills.get('skills'):
        # Only add BERT skills that appear in the skills sections
        existing_lower = [s.lower() for s in skills_data['all']]
        for bert_skill in bert_skills.get('skills', []):
            if bert_skill.lower() not in existing_lower:
                skills_data['all'].append(bert_skill)
    
    # Build skills.all as case-insensitive unique union
    seen = set()
    all_skills = []
    for skill in skills_data['hard_skills'] + skills_data['soft_skills']:
        key = skill.lower()
        if key not in seen:
            seen.add(key)
            all_skills.append(skill)
    skills_data['all'] = all_skills

    # =============================================================================
    # 7) SECTION-FIRST TRAININGS AND PROJECTS EXTRACTION
    # =============================================================================
    # CRITICAL: trainings ONLY from TRAININGS section
    # projects ONLY from PROJECTS section (stops at REFERENCES)
    # If section is missing, return empty list (NO fallback to other sections)
    
    # Trainings: ONLY from TRAININGS section
    if trainings_lines:
        trainings = parse_trainings_from_lines(trainings_lines, is_section_block=True)
    else:
        # CRITICAL FIX: If TRAININGS section is missing, return empty list
        # DO NOT fall back to HEADER, SOFT SKILLS, or any other section
        trainings = []
    
    # Projects: ONLY from PROJECTS section
    # parse_projects_from_lines handles References truncation internally
    if projects_block_lines:
        projects = parse_projects_from_lines(projects_block_lines, is_section_block=True)
    else:
        projects = []

    # =============================================================================
    # 8) POST-PARSE CONSISTENCY CHECK (GUARDRAILS)
    # =============================================================================
    # These checks ensure NER never corrupted section groupings
    
    # 8a) Trainings must not contain name/title/summary lines from HEADER
    header_lines = [ln.strip().lower() for ln in header_block.split('\n') if ln.strip()]
    filtered_trainings = []
    for training in trainings:
        training_lower = training.lower()
        # Skip if training matches a header line
        if training_lower in header_lines:
            print(f"WARNING: Dropping training that matches header: {training}")
            continue
        # Skip if training looks like a name (2 capitalized words)
        words = training.split()
        if len(words) == 2 and all(w[0].isupper() for w in words if w):
            print(f"WARNING: Dropping training that looks like name: {training}")
            continue
        filtered_trainings.append(training)
    trainings = filtered_trainings
    
    # 8b) Education entries must have year_range that appears in EDUCATION text
    if education_block:
        education_year_pattern = re.compile(r'\b(19|20)\d{2}\s*[-–—to]+\s*((?:19|20)\d{2}|present|current)\b', re.IGNORECASE)
        education_years = set()
        for match in education_year_pattern.finditer(education_block):
            education_years.add(match.group(0).lower().replace(' ', ''))
        
        validated_education = []
        for edu in education:
            year_range = edu.get('year_range', '')
            if year_range:
                # Normalize year range for comparison
                year_normalized = year_range.lower().replace(' ', '')
                # Check if any education year matches
                match_found = any(year_normalized in edu_yr or edu_yr in year_normalized 
                                  for edu_yr in education_years)
                if not match_found:
                    print(f"WARNING: Education entry year_range '{year_range}' not found in EDUCATION section")
                    # Keep the entry but mark it for review
            validated_education.append(edu)
        education = validated_education
    
    # 8c) Sections must not contain embedded headers from other sections
    # This detects if section splitting failed
    for section_name, section_content in [
        ('SOFT_SKILLS', soft_skills_lines),
        ('HARD_SKILLS', hard_skills_lines),
        ('PROJECTS', projects_block_lines),
        ('TRAININGS', trainings_lines),
    ]:
        for line in section_content:
            canonical = _get_canonical_section(line)
            if canonical and canonical != section_name:
                print(f"WARNING: Found embedded header '{line}' in {section_name} section")
    
    # Run existing education consistency validator
    education = _validate_education_consistency(education, education_block)

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
        'projects': projects,
        'trainings': trainings,
        'sections': sections,
        'parsed_at': datetime.now().isoformat(),
        'ner_method': 'BERT',
        'gpt_cleaning_status': gpt_cleaning_status,
        'cleaned_resume_text': cleaned_text if gpt_cleaning_status == 'success' else None,
    }

    return parsed


def _validate_education_consistency(education: list[dict], education_block: str | None) -> list[dict]:
    """
    Post-NER consistency validator for education entries.

    Catches obvious mismatches:
    - Education entry has year_range but degree/school pairing contradicts EDU block structure
    - School repeated across entries (likely duplicate)
    - Degree duplicated (likely mis-grouping)
    - year_range mismatched (BS paired with wrong years)

    Reattaches degree/school based on:
    - closest year-range anchor in the original text
    - closest ORG-like school line
    - completeness score (school+degree+year_range)
    """
    if not education or len(education) < 2:
        return education

    # Extract year ranges from education block for anchor validation
    year_anchors = []
    if education_block:
        year_pattern = r'\b(19|20)\d{2}\s*[-–—to]+\s*((?:19|20)\d{2}|present|current)\b'
        for match in re.finditer(year_pattern, education_block, re.IGNORECASE):
            start_yr = match.group(0).split('-')[0].strip()
            end_part = match.group(0).split('-')[-1].strip()
            year_anchors.append(f"{start_yr} - {end_part.title()}")

    def normalize(s: str) -> str:
        return re.sub(r'[^\w]', '', (s or '').lower())

    def completeness_score(e: dict) -> int:
        """Higher score = more complete entry."""
        score = 0
        if e.get('school'): score += 1
        if e.get('course_or_strand'): score += 1
        if e.get('year_range'): score += 1
        return score

    # Check for duplicates and mismatches
    validated = []
    seen_schools = set()
    seen_degrees = set()
    seen_year_ranges = set()

    for e in education:
        school = e.get('school') or ''
        degree = e.get('course_or_strand') or ''
        year = e.get('year_range') or ''

        school_norm = normalize(school)
        degree_norm = normalize(degree)
        year_norm = normalize(year)

        # Skip duplicate entries (same school + degree + year)
        key = (school_norm, degree_norm, year_norm)
        if key in [(normalize(v.get('school')), normalize(v.get('course_or_strand')), normalize(v.get('year_range'))) for v in validated]:
            continue

        # Check for suspicious mismatches
        # Case 1: Same school appears multiple times with different degrees (might be valid)
        # Case 2: Same degree appears multiple times with different years (might be duplicate)
        # Case 3: Same year range with different degrees (likely mis-grouped)

        is_suspicious = False

        # Check if this year_range was already seen with a different degree
        if year_norm and year_norm in seen_year_ranges:
            # Check if same year has different degree
            for v in validated:
                if normalize(v.get('year_range')) == year_norm:
                    if normalize(v.get('course_or_strand')) != degree_norm:
                        # Same year, different degree - pick the more complete one
                        if completeness_score(e) < completeness_score(v):
                            is_suspicious = True
                            break

        # Check if degree is duplicated with different years
        if degree_norm and degree_norm in seen_degrees and not is_suspicious:
            # Check if same degree has different year
            for v in validated:
                if normalize(v.get('course_or_strand')) == degree_norm:
                    if normalize(v.get('year_range')) != year_norm:
                        # Same degree, different year - might be valid (different programs)
                        # But check if one is more complete
                        if completeness_score(e) <= completeness_score(v) and not year:
                            is_suspicious = True
                            break

        if not is_suspicious:
            seen_schools.add(school_norm)
            seen_degrees.add(degree_norm)
            seen_year_ranges.add(year_norm)
            validated.append(e)

    # Final validation: ensure year ranges match what we found in the text
    if year_anchors and validated:
        for e in validated:
            year = e.get('year_range', '')
            if year:
                # Check if this year range is in the anchors
                year_norm = normalize(year)
                anchor_norms = [normalize(a) for a in year_anchors]
                if year_norm not in anchor_norms:
                    # This entry's year_range might be malformed - try to find closest match
                    for anchor in year_anchors:
                        if year[:4] in anchor:  # Start year matches
                            e['year_range'] = anchor
                            break

    return validated


def process_pending_resumes():
    """Process all resumes with pending ner_status or gpt_status."""
    print("Fetching resumes with pending status...")
    
    # Get resumes that need processing
    sb = get_supabase()
    
    # First, try to process resumes that have raw_extracted_content but no GPT extraction
    # Check for resumes with raw_extracted_content that haven't been successfully processed
    # Handle NULL gpt_status - treat NULL as "not success" so we process old resumes
    response = sb.table('resumes').select(
        'id, applicant_id, raw_extracted_content, ner_status, gpt_status'
    ).neq('raw_extracted_content', None).execute()
    
    if not response.data:
        print("No resumes with raw_extracted_content found.")
        return
    
    # Filter to resumes that need GPT extraction:
    # - Have raw content
    # - gpt_status is NOT 'success' (includes NULL, 'pending', 'failed', etc.)
    pending_gpt = [
        r for r in response.data 
        if r.get('raw_extracted_content') and r.get('gpt_status') != 'success'
    ]
    
    print(f"Found {len(pending_gpt)} resumes needing GPT extraction")
    
    success_count = 0
    failed_count = 0
    skipped_count = 0
    
    for resume in pending_gpt:
        resume_id = resume['id']
        raw_content = resume.get('raw_extracted_content')
        
        print(f"\nProcessing resume {resume_id}...")
        
        try:
            # Parse resume (GPT cleaning happens inside parse_resume)
            parsed_data = parse_resume(raw_content)
            
            gpt_status = parsed_data.get('gpt_cleaning_status', 'not_attempted')
            ner_method = parsed_data.get('ner_method', 'unknown')
            
            # Update the resume with parsed data
            update_data = {
                'parsed_data': json.dumps(parsed_data),
                'gpt_cleaning_status': gpt_status,
                'gpt_model': parsed_data.get('gpt_model'),
            }
            
            # If GPT succeeded, also save cleaned text
            if gpt_status == 'success' and parsed_data.get('cleaned_resume_text'):
                update_data['cleaned_resume_text'] = parsed_data.get('cleaned_resume_text')
            
            # If GPT succeeded, mark NER as optional/skipped to save runtime
            if gpt_status == 'success':
                update_data['ner_status'] = 'optional'
            elif ner_method == 'BERT':
                # GPT failed, NER was used as fallback
                update_data['ner_status'] = 'completed'
            else:
                update_data['ner_status'] = 'failed'
            
            update_result = sb.table('resumes').update(update_data).eq('id', resume_id).execute()
            
            print(f"  Name: {parsed_data.get('name')}")
            print(f"  Email: {parsed_data.get('email')}")
            print(f"  Phone: {parsed_data.get('phone')}")
            print(f"  Skills found: {len(parsed_data.get('skills', {}).get('hard_skills', []))}")
            print(f"  Education entries: {len(parsed_data.get('education', []))}")
            print(f"  Experience entries: {len(parsed_data.get('experience', []))}")
            print(f"  Extraction method: {ner_method}")
            print(f"  GPT status: {gpt_status}")
            print(f"  Status: COMPLETED")
            
            success_count += 1
            
        except Exception as e:
            print(f"  Error: {e}")
            
            # Mark as failed
            try:
                sb.table('resumes').update({
                    'gpt_status': 'failed',
                    'ner_status': 'failed',
                    'parsed_data': json.dumps({'error': str(e)})
                }).eq('id', resume_id).execute()
            except:
                pass
            
            failed_count += 1
    
    # Also process any remaining resumes with pending ner_status but no raw content
    # Skip resumes that already have successful GPT extraction
    response_ner = sb.table('resumes').select(
        'id, applicant_id, raw_extracted_content, ner_status, gpt_status'
    ).eq('ner_status', 'pending').neq('gpt_status', 'success').execute()
    
    if response_ner.data:
        print(f"\nFound {len(response_ner.data)} resumes with pending ner_status")
        for resume in response_ner.data:
            # Skip resumes that already have successful GPT extraction
            if resume.get('gpt_status') == 'success':
                print(f"Skipping resume {resume['id']} - already has successful GPT extraction")
                skipped_count += 1
                continue
            
            if not resume.get('raw_extracted_content'):
                # Skip resumes without raw content
                skipped_count += 1
                continue
            
            resume_id = resume['id']
            raw_content = resume.get('raw_extracted_content')
            
            print(f"\nProcessing resume {resume_id} (NER fallback)...")
            
            try:
                # Use BERT NER for old pending resumes
                parsed_data = parse_resume(raw_content)
                
                sb.table('resumes').update({
                    'parsed_data': json.dumps(parsed_data),
                    'ner_status': 'completed',
                    'gpt_status': 'not_available'
                }).eq('id', resume_id).execute()
                
                success_count += 1
                
            except Exception as e:
                print(f"  Error: {e}")
                failed_count += 1
    
    print(f"\n=== Resume Parsing Summary ===")
    print(f"Total processed: {success_count + failed_count}")
    print(f"Successful: {success_count}")
    print(f"Failed: {failed_count}")
    print(f"Skipped: {skipped_count}")


if __name__ == "__main__":
    print("Starting Resume Parser for SentinelAI...")
    process_pending_resumes()
    print("Resume parsing completed.")
