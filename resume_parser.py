#!/usr/bin/env python3
"""
Resume Parser for SentinelAI
Parses raw extracted resume content into structured JSON data using BERT NER.
Extracts: name, email, phone, education, work experience, skills.
"""

import re
import json
from datetime import datetime
from supabase import Client, create_client

# Supabase configuration
SUPABASE_URL = 'https://vjlgbhcfgbtxcisazpwr.supabase.co'
SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZqbGdiaGNmZ2J0eGNpc2F6cHdyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MzM5NDM1OSwiZXhwIjoyMDc4OTcwMzU5fQ.g4OGxXWBGcHiwijYl1rypPpLjBo_VFxigujzwQ-uxgQ'
supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

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
    
    # Define entity categories
    entity_types = {
        'Name': [],
        'Email Address': [],
        'Phone': [],
        'College Name': [],
        'Degree': [],
        'Companies worked at': [],
        'Designation': [],  # Job title
        'Skills': [],
        'Location': [],
        'Graduation Year': [],
        'Years of Experience': []
    }
    
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
                if entity_text and current_entity in entity_types:
                    entity_types[current_entity].append(entity_text)
            current_entity = label_name[2:]
            current_tokens = [token]
        elif label_name.startswith('I-') and current_entity == label_name[2:]:
            current_tokens.append(token)
        else:
            # Save current entity
            if current_entity and current_tokens:
                entity_text = tokenizer.convert_tokens_to_string(current_tokens).strip()
                if entity_text and current_entity in entity_types:
                    entity_types[current_entity].append(entity_text)
            current_entity = None
            current_tokens = []
    
    # Handle last entity
    if current_entity and current_tokens:
        entity_text = tokenizer.convert_tokens_to_string(current_tokens).strip()
        if entity_text and current_entity in entity_types:
            entity_types[current_entity].append(entity_text)
    
    # Deduplicate and clean
    result = {}
    for key, values in entity_types.items():
        unique = list(set(values))
        # Clean up
        cleaned = [v for v in unique if len(v) > 1]
        result[key.lower().replace(' ', '_')] = cleaned
    
    # Map to expected field names
    return {
        'names': result.get('name', []),
        'emails': result.get('email_address', []),
        'phones': result.get('phone', []),
        'colleges': result.get('college_name', []),
        'degrees': result.get('degree', []),
        'companies': result.get('companies_worked_at', []),
        'job_titles': result.get('designation', []),
        'skills': result.get('skills', []),
        'locations': result.get('location', []),
        'graduation_years': result.get('graduation_year', []),
        'years_of_experience': result.get('years_of_experience', [])
    }

# Supabase configuration
SUPABASE_URL = 'https://vjlgbhcfgbtxcisazpwr.supabase.co'
SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZqbGdiaGNmZ2J0eGNpc2F6cHdyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MzM5NDM1OSwiZXhwIjoyMDc4OTcwMzU5fQ.g4OGxXWBGcHiwijYl1rypPpLjBo_VFxigujzwQ-uxgQ'
supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

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
    email_pattern = r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b'
    match = re.search(email_pattern, text)
    return match.group(0).lower() if match else None


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
        has_degree = any(kw in line_lower for kw in ['bs', 'ba', 'ma', 'ms', 'stem', 'abm', 'humss', 'tvl', 'bachelor', 'master', 'degree', 'stem'])
        
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
    
    # Experience date patterns
    experience_patterns = [
        r'(19|20)\d{2}\s*[-–—]+\s*(present|current|now|(?:19|20)\d{2})',
        r'(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s*(-|\s)\s*(19|20)\d{2}',
        r'((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(?:19|20)\d{2})',
    ]
    
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
        has_date = any(re.search(p, line_lower) for p in experience_patterns)
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
            for pattern in experience_patterns:
                dates = re.findall(pattern, line, re.IGNORECASE)
                if dates:
                    entry['years'] = f"{dates[0][0]} - {dates[0][1]}" if len(dates[0]) > 1 else dates[0][0]
                    break
            
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


def parse_resume(raw_text):
    """Parse raw resume text into structured JSON data using BERT NER."""
    if not raw_text or len(raw_text.strip()) < 50:
        return {
            'error': 'Insufficient content to parse',
            'name': None,
            'email': None,
            'phone': None,
            'education': [],
            'experience': [],
            'skills': {'hard_skills': [], 'soft_skills': [], 'all': []},
            'ner_entities': {}
        }
    
    # Extract entities using BERT NER
    print("Extracting entities using BERT NER...")
    bert_entities = extract_entities_bert(raw_text)
    print(f"  BERT found: {len(bert_entities.get('names', []))} names, {len(bert_entities.get('skills', []))} skills, {len(bert_entities.get('colleges', []))} colleges")
    
    # Extract skills using regex (for comparison)
    skills_data = extract_skills(raw_text)
    
    # Combine BERT skills with regex skills (union)
    all_skills = list(set(skills_data['all'] + bert_entities.get('skills', [])))
    
    # Use BERT results where available, fallback to regex
    name = bert_entities.get('names', [None])[0] if bert_entities.get('names') else extract_name(raw_text)
    email = bert_entities.get('emails', [None])[0] if bert_entities.get('emails') else extract_email(raw_text)
    phone = bert_entities.get('phones', [None])[0] if bert_entities.get('phones') else extract_phone(raw_text)
    
    # For education, combine BERT with regex
    education = extract_education(raw_text)
    # Add colleges from BERT if not already captured
    for college in bert_entities.get('colleges', []):
        if college and not any(e.get('school') == college for e in education):
            education.append({
                'year_range': None,
                'school': college,
                'course_or_strand': None,
                'education_type': 'College',
                'raw_text': college
            })
    
    # For experience, combine BERT with regex
    experience = extract_work_experience(raw_text)
    # Add companies from BERT if not already captured
    for company in bert_entities.get('companies', []):
        if company and not any(e.get('company') == company for e in experience):
            experience.append({
                'company': company,
                'role': None,
                'years': None,
                'summary': None,
                'raw_text': company
            })
    
    # Add job titles from BERT
    for title in bert_entities.get('job_titles', []):
        if title and not any(e.get('role') == title for e in experience):
            experience.append({
                'company': None,
                'role': title,
                'years': None,
                'summary': None,
                'raw_text': title
            })
    
    parsed = {
        'name': name,
        'email': email,
        'phone': phone,
        'education': education,
        'experience': experience,
        'skills': {
            'hard_skills': skills_data['hard_skills'],
            'soft_skills': skills_data['soft_skills'],
            'all': all_skills
        },
        'parsed_at': datetime.now().isoformat(),
        'ner_method': 'BERT'
    }
    
    return parsed


def process_pending_resumes():
    """Process all resumes with pending ner_status."""
    print("Fetching resumes with pending ner_status...")
    
    # Get resumes that need processing
    response = supabase.table('resumes').select(
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
            update_result = supabase.table('resumes').update({
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
                supabase.table('resumes').update({
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
