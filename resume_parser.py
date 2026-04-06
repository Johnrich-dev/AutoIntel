#!/usr/bin/env python3
"""
Refactored Resume Parser for AutoIntel

Design goals:
- Trust GPT-cleaned text for section order and entry grouping
- Use deterministic section/block parsing for structure
- Use BERT NER only as enrichment/fallback for simple entities
- Output the confirmed target parsed_data shape
"""

import json
import os
import re
from datetime import datetime
from typing import Any

from supabase import Client, create_client

try:
    from gpt_extractor import clean_with_gpt
except ImportError:
    clean_with_gpt = None

try:
    from dotenv import load_dotenv  # type: ignore
    load_dotenv()
except Exception:
    pass

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
supabase = None  # type: Client | None

bert_model = None
bert_tokenizer = None
GPT_CLEANER_AVAILABLE = clean_with_gpt is not None

SECTION_ALIASES = {
    "SUMMARY": ["summary", "profile", "objective", "about me"],
    "EXPERIENCE": [
        "work experience",
        "experience",
        "employment history",
        "professional experience",
        "working experience",
        "career history",
        "job history",
    ],
    "EDUCATION": ["education", "educational background", "academic background", "academic history"],
    "SKILLS": ["skills", "technical skills", "core skills", "competencies", "key skills"],
    "PROJECTS": ["projects", "personal projects", "academic projects", "project experience"],
    "TRAININGS": [
        "certifications and trainings",
        "certifications & trainings",
        "certifications and training",
        "seminars and trainings",
        "seminars and training",
        "seminars/training",
        "trainings",
        "training",
        "seminars",
        "seminar",
        "certifications",
        "certification",
        "certificates",
        "certificate",
        "workshops",
        "workshop",
        "bootcamps",
        "bootcamp",
    ],
}

TECH_CANONICAL = {
    "html": "HTML",
    "css": "CSS",
    "sql": "SQL",
    "php": "PHP",
    "c++": "C++",
    "c#": "C#",
    "asp.net": "ASP.NET",
    "asp.net core": "ASP.NET Core",
    "mvc": "MVC",
    "ms sql server": "MS SQL Server",
    "mssql": "MSSQL",
    "mysql": "MySQL",
    "api": "API",
    "api gateway": "API Gateway",
    "aws": "AWS",
    "s3": "S3",
    "ec2": "EC2",
    "ses": "SES",
    "sql server": "SQL Server",
    "git": "Git",
    "github": "GitHub",
    "gitlab": "GitLab",
    "node.js": "Node.js",
    "react.js": "React.js",
    "next.js": "Next.js",
    "vue.js": "Vue.js",
    "xampp": "XAMPP",
    "ui/ux": "UI/UX",
    "figma": "Figma",
    "supabase": "Supabase",
    "firebase": "Firebase",
    "python": "Python",
    "javascript": "JavaScript",
    "typescript": "TypeScript",
    "java": "Java",
    "route 53": "Route 53",
    "codecommit": "CodeCommit",
    "cloudfront": "CloudFront",
    "cognito": "Cognito",
    "dynamodb": "DynamoDB",
    "lambda": "Lambda",
    "etl": "ETL",
    "hadoop": "Hadoop",
    "spark": "Spark",
    "airflow": "Airflow",
    "n8n": "n8n",
    "visual studio code": "Visual Studio Code",
    "vs code": "Visual Studio Code",
}

TECH_KEYWORDS = {
    "php", "python", "javascript", "typescript", "java", "c++", "c#", "html", "css", "sql",
    "react", "react.js", "node", "node.js", "next.js", "vue.js", "asp.net", "asp.net core", "mvc",
    "mysql", "mssql", "ms sql server", "firebase", "supabase", "aws", "s3", "ec2", "ses", "cloudfront",
    "api gateway", "route 53", "codecommit", "cognito", "dynamodb", "lambda", "git", "github", "gitlab",
    "figma", "xampp", "etl", "hadoop", "spark", "airflow", "n8n", "api", "graphql", "rest api",
    "visual studio code", "vs code", "unity", "photoshop", "illustrator", "postman"
}

SHS_STRANDS = {
    "stem": "STEM",
    "abm": "ABM",
    "humss": "HUMSS",
    "tvl": "TVL",
    "gas": "GAS",
}


def _require_env():
    missing = []
    if not SUPABASE_URL:
        missing.append("SUPABASE_URL")
    if not SUPABASE_SERVICE_KEY:
        missing.append("SUPABASE_SERVICE_KEY")
    if missing:
        raise RuntimeError(f"Missing required environment variables: {', '.join(missing)}")


def get_supabase() -> Client:
    global supabase
    if supabase is None:
        _require_env()
        supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    return supabase


def get_bert_ner():
    global bert_model, bert_tokenizer
    if bert_model is None:
        print("Loading BERT NER model...")
        from transformers import AutoModelForTokenClassification, AutoTokenizer
        bert_tokenizer = AutoTokenizer.from_pretrained("yashpwr/resume-ner-bert-v2")
        bert_model = AutoModelForTokenClassification.from_pretrained("yashpwr/resume-ner-bert-v2")
        print("BERT NER model loaded!")
    return bert_model, bert_tokenizer


def extract_entities_bert(text: str) -> dict[str, list[str]]:
    model, tokenizer = get_bert_ner()
    inputs = tokenizer(text[:2048], return_tensors="pt", truncation=True, max_length=512)
    outputs = model(**inputs)
    predictions = outputs.logits.argmax(dim=-1)
    tokens = tokenizer.convert_ids_to_tokens(inputs["input_ids"][0])
    labels = predictions[0].tolist()
    label_map = model.config.id2label

    entities_by_type: dict[str, list[str]] = {}
    current_entity = None
    current_tokens: list[str] = []

    def canon(s: str) -> str:
        return re.sub(r"\s+", " ", s.replace("_", " ").replace("-", " ")).strip().lower()

    def dedupe(seq: list[str]) -> list[str]:
        seen = set()
        out = []
        for x in seq:
            k = x.strip().lower()
            if not k or k in seen:
                continue
            seen.add(k)
            out.append(x.strip())
        return out

    for token, label_id in zip(tokens, labels):
        if token in ["[CLS]", "[SEP]", "[PAD]"]:
            continue
        label = label_map.get(label_id, "O")
        if label.startswith("B-"):
            if current_entity and current_tokens:
                txt = tokenizer.convert_tokens_to_string(current_tokens).strip()
                if txt:
                    entities_by_type.setdefault(canon(current_entity), []).append(txt)
            current_entity = label[2:]
            current_tokens = [token]
        elif label.startswith("I-") and current_entity == label[2:]:
            current_tokens.append(token)
        else:
            if current_entity and current_tokens:
                txt = tokenizer.convert_tokens_to_string(current_tokens).strip()
                if txt:
                    entities_by_type.setdefault(canon(current_entity), []).append(txt)
            current_entity = None
            current_tokens = []

    if current_entity and current_tokens:
        txt = tokenizer.convert_tokens_to_string(current_tokens).strip()
        if txt:
            entities_by_type.setdefault(canon(current_entity), []).append(txt)

    cleaned = {k: dedupe(v) for k, v in entities_by_type.items()}

    def pick(matchers: list[str]) -> list[str]:
        out: list[str] = []
        for key, vals in cleaned.items():
            if any(m in key for m in matchers):
                out.extend(vals)
        return dedupe(out)

    return {
        "names": pick(["name"]),
        "emails": pick(["email", "mail"]),
        "phones": pick(["phone", "mobile"]),
        "colleges": pick(["college", "university", "school", "institute"]),
        "degrees": pick(["degree"]),
        "companies": pick(["company", "organization", "employer"]),
        "job_titles": pick(["title", "position", "role", "designation"]),
        "skills": pick(["skill"]),
    }


def _normalize_spaces(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


def _normalize_email(value: str | None) -> str | None:
    if not value:
        return None
    s = re.sub(r"\s*@\s*", "@", value)
    s = re.sub(r"\s*\.\s*", ".", s)
    m = re.search(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b", s)
    return m.group(0).lower() if m else None


def extract_email(text: str) -> str | None:
    return _normalize_email(text)


def extract_phone(text: str) -> str | None:
    if not text:
        return None
    patterns = [
        r"\+?\d{1,3}[-.\s]?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,9}",
        r"\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}",
        r"\d{10,12}",
    ]
    for pattern in patterns:
        m = re.search(pattern, text)
        if m:
            phone = re.sub(r"[^\d+]", "", m.group())
            if len(phone) >= 10:
                return phone
    return None


def _looks_like_name(line: str) -> bool:
    if not line or any(ch.isdigit() for ch in line) or "@" in line:
        return False
    words = [w for w in line.split() if w]
    if not (2 <= len(words) <= 6):
        return False
    alpha = sum(1 for c in line if c.isalpha() or c in " .-'")
    return alpha / max(1, len(line)) > 0.8


def _normalize_name_case(name: str) -> str:
    if not name:
        return name
    parts = []
    for token in name.split():
        if len(token) == 2 and token.endswith("."):
            parts.append(token.upper())
        elif token.isupper():
            parts.append(token.title())
        else:
            parts.append(token)
    return " ".join(parts)


def extract_full_name(text: str) -> str | None:
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    for line in lines[:4]:
        if _looks_like_name(line):
            return _normalize_name_case(line)
    return None


def _normalize_line_case(line: str) -> str:
    if not line:
        return line
    s = line.strip()
    if not s:
        return s
    # Only normalize very obvious full-ALL-CAPS natural text lines.
    if s.isupper() and len(s) > 4 and not re.search(r"\b(?:HTML|CSS|SQL|PHP|AWS|API|MSSQL|C\+\+|C#|UI|UX)\b", s):
        return s.title()
    return s


def _get_section_key(line: str) -> str | None:
    s = re.sub(r"\s+", " ", line.strip().rstrip(":"))
    if not s:
        return None
    sl = s.lower()
    for key, aliases in SECTION_ALIASES.items():
        if sl in aliases:
            return key
    return None


def _normalize_lines(text: str) -> list[str]:
    lines = [_normalize_line_case(ln.rstrip()) for ln in text.splitlines()]
    out: list[str] = []
    for ln in lines:
        s = ln.strip()
        if not s:
            out.append("")
            continue
        if re.search(r"\bpage\s+\d+\b", s, re.I):
            continue
        out.append(s)
    return out


def split_into_sections(text: str) -> dict[str, list[str]]:
    sections = {"HEADER": [], "SUMMARY": [], "EXPERIENCE": [], "EDUCATION": [], "SKILLS": [], "PROJECTS": [], "TRAININGS": []}
    current = "HEADER"
    for line in _normalize_lines(text):
        if not line:
            if current != "HEADER":
                sections[current].append("")
            continue
        key = _get_section_key(line)
        if key:
            current = key
            continue
        sections[current].append(line)
    return sections


def _group_blocks(lines: list[str]) -> list[list[str]]:
    blocks: list[list[str]] = []
    current: list[str] = []
    for line in lines:
        if not line.strip():
            if current:
                blocks.append(current)
                current = []
            continue
        current.append(line.strip())
    if current:
        blocks.append(current)
    return blocks


def classify_education_type(course_or_strand: str | None) -> str:
    text = (course_or_strand or "").lower()
    if not text:
        return "Other"
    if any(k in text for k in ["stem", "abm", "humss", "tvl", "gas", "senior high", "science, technology, engineering and mathematics"]):
        return "Senior High School"
    if any(k in text for k in ["bachelor", "master", "doctor", "phd"]) or re.search(r"\b(bs|ba|bsc|ms|ma|msc|mba)\b", text):
        return "College"
    return "Other"


def _extract_year_range(text: str) -> str | None:
    m = re.search(r"\b((?:19|20)\d{2})\s*[-–—to]+\s*((?:19|20)\d{2}|present|current)\b", text, re.I)
    if m:
        return f"{m.group(1)} - {m.group(2).title()}"
    m2 = re.search(r"\b((?:19|20)\d{2})\b", text)
    if m2:
        return m2.group(1)
    return None


def _remove_year_range(text: str) -> str:
    text = re.sub(r"\b(?:19|20)\d{2}\s*[-–—to]+\s*(?:19|20)\d{2}\b", "", text, flags=re.I)
    text = re.sub(r"\b(?:19|20)\d{2}\s*[-–—to]+\s*(?:present|current)\b", "", text, flags=re.I)
    text = re.sub(r"\b(?:19|20)\d{2}\b", "", text)
    return _normalize_spaces(text)


def parse_education_section(text: str) -> list[dict[str, Any]]:
    blocks = _group_blocks([ln for ln in _normalize_lines(text) if ln is not None])
    entries: list[dict[str, Any]] = []
    seen = set()

    for block in blocks:
        if not block:
            continue
        degree = None
        school = None
        year_range = None
        details = []

        for line in block:
            if line.lower().startswith("relevant courses"):
                details.append(line)
                continue
            if not year_range:
                yr = _extract_year_range(line)
                if yr:
                    year_range = yr
            clean = _remove_year_range(line)
            low = clean.lower()
            if not clean:
                continue
            if not degree and classify_education_type(clean) != "Other":
                degree = clean
                continue
            if not school and any(k in low for k in ["university", "college", "school", "institute", "campus", "academy"]):
                school = clean
                continue
            if not degree:
                degree = clean
            elif not school:
                school = clean
            else:
                details.append(clean)

        if degree and degree.lower() == "science, technology, engineering and mathematics":
            degree = "Science, Technology, Engineering and Mathematics (STEM)"

        entry = {
            "school": school or "",
            "course_or_strand": degree or "",
            "education_type": classify_education_type(degree or ""),
            "year_range": year_range or "",
        }
        key = (entry["school"].lower(), entry["course_or_strand"].lower(), entry["year_range"].lower())
        if key not in seen and (entry["school"] or entry["course_or_strand"]):
            seen.add(key)
            entries.append(entry)
    return entries


def _looks_like_company(line: str) -> bool:
    low = line.lower()
    return any(k in low for k in ["inc", "corp", "llc", "company", "co.", "services", "solutions", "technologies", "enterprise"])


def _looks_like_role(line: str) -> bool:
    low = line.lower()
    return any(k in low for k in ["intern", "developer", "engineer", "designer", "analyst", "manager", "specialist", "assistant", "officer"])


def parse_experience_section(text: str) -> list[dict[str, str]]:
    blocks = _group_blocks([ln for ln in _normalize_lines(text) if ln is not None])
    out: list[dict[str, str]] = []

    for block in blocks:
        if len(block) < 2:
            continue
        role = ""
        company = ""
        years = ""
        summary_lines: list[str] = []

        # Common cleaned order: role, company, date, bullets/summary
        if len(block) >= 1:
            role = _remove_year_range(block[0])
            y0 = _extract_year_range(block[0])
            if y0:
                years = y0
        if len(block) >= 2:
            company = block[1]
        if len(block) >= 3 and not years:
            y1 = _extract_year_range(block[2])
            if y1:
                years = y1
                summary_lines = block[3:]
            else:
                summary_lines = block[2:]
        elif len(block) >= 3:
            summary_lines = block[2:]

        # Repair obvious swap
        if _looks_like_company(role) and _looks_like_role(company):
            role, company = company, role

        out.append({
            "role": role.strip(),
            "company": company.strip(),
            "years": years.strip(),
            "summary": _normalize_spaces(" ".join(summary_lines)),
        })

    return [e for e in out if e["role"] or e["company"] or e["summary"]]


def _normalize_skill_token(token: str) -> str:
    s = _normalize_spaces(token.strip(" ,;|"))
    if not s:
        return ""
    low = s.lower()
    if low in TECH_CANONICAL:
        return TECH_CANONICAL[low]
    if low.startswith("asp.net core"):
        return "ASP.NET Core"
    if low.startswith("ms sql server"):
        return "MS SQL Server"
    if low.startswith("api gateway"):
        return "API Gateway"
    if low.startswith("route 53"):
        return "Route 53"
    if low.startswith("visual studio code"):
        return "Visual Studio Code"
    if low.startswith("node.js"):
        return "Node.js"
    if low.startswith("react.js"):
        return "React.js"
    if low.startswith("n8n"):
        return "n8n"
    return s


def parse_skills_section(text: str, bert_skills: list[str] | None = None) -> list[str]:
    if not text.strip():
        return []

    lines = [ln.strip() for ln in _normalize_lines(text) if ln.strip()]
    raw_items: list[str] = []

    for line in lines:
        # Drop category labels but keep values.
        value = line
        if ":" in line:
            left, right = line.split(":", 1)
            if len(left) <= 30:
                value = right.strip()

        # Expand grouped AWS-style items.
        value = re.sub(r"([A-Za-z0-9.+# ]+)\s*\(([^)]+)\)", lambda m: f"{m.group(1).strip()}, {m.group(2).strip()}", value)
        parts = [p.strip() for p in value.split(",") if p.strip()]
        raw_items.extend(parts)

    # BERT enrichment within SKILLS only.
    if bert_skills:
        raw_items.extend(bert_skills)

    filtered: list[str] = []
    seen = set()
    for item in raw_items:
        normalized = _normalize_skill_token(item)
        if not normalized:
            continue
        low = normalized.lower()
        # Keep technical-looking items only.
        if low not in TECH_CANONICAL and low not in TECH_KEYWORDS:
            if not any(k in low for k in TECH_KEYWORDS):
                continue
        if low not in seen:
            seen.add(low)
            filtered.append(normalized)
    return filtered


def _split_title_and_date(line: str) -> tuple[str, str]:
    m = re.search(r"\b((?:19|20)\d{2})\b$", line)
    if m:
        title = line[:m.start()].strip(" -–—")
        return title.strip(), m.group(1)
    return line.strip(), ""


def parse_projects_section(text: str) -> list[dict[str, str]]:
    blocks = _group_blocks([ln for ln in _normalize_lines(text) if ln is not None])
    projects: list[dict[str, str]] = []
    seen = set()

    for block in blocks:
        if not block:
            continue
        first = block[0]
        name, date = _split_title_and_date(first)
        details = _normalize_spaces(" ".join(block[1:]))
        if not name:
            continue
        key = (name.lower(), date.lower())
        if key in seen:
            continue
        seen.add(key)
        projects.append({"name": name, "date": date, "details": details})
    return projects


def _extract_date_from_title(title: str) -> tuple[str, str]:
    m = re.search(r"\b((?:19|20)\d{2})\b$", title)
    if m:
        return title[:m.start()].strip(" -–—|"), m.group(1)
    return title.strip(), ""


def parse_trainings_section(text: str) -> list[dict[str, str | None]]:
    blocks = _group_blocks([ln for ln in _normalize_lines(text) if ln is not None])
    trainings: list[dict[str, str | None]] = []
    seen = set()

    for block in blocks:
        if not block:
            continue
        title = block[0].strip()
        issuer_or_tail = block[1].strip() if len(block) >= 2 else ""
        extra = block[2].strip() if len(block) >= 3 else ""

        clean_title, title_date = _extract_date_from_title(title)
        date = title_date or _extract_year_range(extra) or _extract_year_range(issuer_or_tail)

        # If second line is actually another descriptor with a year attached, keep title clean and date separate.
        key = (clean_title.lower(), (date or "").lower())
        if key in seen:
            continue
        seen.add(key)
        trainings.append({"title": clean_title, "date": date or None})

    return trainings


def _fix_pdf_spacing(text: str) -> str:
    """
    Fix character-spacing artifacts produced by some PDF extractors.
    Kept in sync with clean_extracted_text() in resume_collector.py.
    """
    import unicodedata
    text = unicodedata.normalize('NFKC', text)

    def collapse_line(line: str) -> str:
        tokens = line.split(' ')
        result = []
        i = 0
        while i < len(tokens):
            tok = tokens[i]
            tok_alpha = tok.rstrip('.,;:!?)')
            tok_punct = tok[len(tok_alpha):]
            if len(tok_alpha) == 1 and tok_alpha.isalpha():
                run = [tok_alpha]
                run_punct = [tok_punct]
                j = i + 1
                seen_lower = tok_alpha.islower()
                while j < len(tokens):
                    nt = tokens[j]
                    nt_alpha = nt.rstrip('.,;:!?)')
                    nt_punct = nt[len(nt_alpha):]
                    if len(nt_alpha) == 1 and nt_alpha.isalpha():
                        if nt_alpha.isupper() and seen_lower:
                            break
                        run.append(nt_alpha)
                        run_punct.append(nt_punct)
                        if nt_alpha.islower():
                            seen_lower = True
                        j += 1
                    else:
                        break
                suffix_punct = ''
                if j < len(tokens) and len(tokens[j]) >= 2 and len(run) <= 2:
                    nt = tokens[j]
                    nt_alpha = nt.rstrip('.,;:!?)')
                    nt_punct = nt[len(nt_alpha):]
                    if nt_alpha.isalpha():
                        run.append(nt_alpha)
                        suffix_punct = nt_punct
                        j += 1
                if len(run) >= 3:
                    last_punct = suffix_punct or run_punct[-1]
                    result.append(''.join(run) + last_punct)
                    i = j
                else:
                    result.append(tok)
                    i += 1
            else:
                result.append(tok)
                i += 1
        return ' '.join(result)

    text = '\n'.join(collapse_line(line) for line in text.splitlines())
    text = re.sub(r'\b([A-Z]) ([A-Z])\b', lambda m: m.group(1) + m.group(2), text)
    return text


def parse_resume(raw_text: str) -> dict[str, Any]:
    if not raw_text or len(raw_text.strip()) < 50:
        return {
            "name": None,
            "email": None,
            "phone": None,
            "education": [],
            "experience": [],
            "skills": [],
            "projects": [],
            "trainings": [],
            "parsed_at": datetime.now().isoformat(),
            "ner_method": None,
            "gpt_cleaning_status": "skipped",
            "cleaned_resume_text": None,
            "error": "Insufficient content to parse",
        }

    # Fix PDF spacing artifacts before any further processing
    raw_text = _fix_pdf_spacing(raw_text)

    if not GPT_CLEANER_AVAILABLE:
        raise RuntimeError("GPT cleaner (gpt_extractor.py) is required.")

    cleaned_text, gpt_status = clean_with_gpt(raw_text)
    if gpt_status == "failed":
        raise RuntimeError("GPT cleaning failed.")
    text_for_parsing = cleaned_text if cleaned_text else raw_text

    sections = split_into_sections(text_for_parsing)

    header_block = "\n".join(sections.get("HEADER", []))
    summary_block = "\n".join(sections.get("SUMMARY", []))
    education_block = "\n".join(sections.get("EDUCATION", []))
    experience_block = "\n".join(sections.get("EXPERIENCE", []))
    skills_block = "\n".join(sections.get("SKILLS", []))
    projects_block = "\n".join(sections.get("PROJECTS", []))
    trainings_block = "\n".join(sections.get("TRAININGS", []))

    print("Extracting entities using BERT NER...")
    bert_header = extract_entities_bert(header_block) if header_block else {"names": [], "emails": [], "phones": []}
    bert_skills = extract_entities_bert(skills_block).get("skills", []) if skills_block else []

    name = extract_full_name(header_block) or (bert_header.get("names") or [None])[0]
    if isinstance(name, str):
        name = _normalize_name_case(name)
    email = extract_email(header_block) or _normalize_email((bert_header.get("emails") or [None])[0])
    phone = extract_phone(header_block) or ((bert_header.get("phones") or [None])[0])

    education = parse_education_section(education_block) if education_block else []
    experience = parse_experience_section(experience_block) if experience_block else []
    skills = parse_skills_section(skills_block, bert_skills=bert_skills) if skills_block else []
    projects = parse_projects_section(projects_block) if projects_block else []
    trainings = parse_trainings_section(trainings_block) if trainings_block else []

    return {
        "name": name,
        "email": email,
        "phone": phone,
        "education": education,
        "experience": experience,
        "skills": skills,
        "projects": projects,
        "trainings": trainings,
        "parsed_at": datetime.now().isoformat(),
        "ner_method": "BERT",
        "gpt_cleaning_status": gpt_status,
        "cleaned_resume_text": text_for_parsing,
    }


def process_pending_resumes():
    print("Fetching resumes with pending status...")
    sb = get_supabase()

    response = sb.table("resumes").select(
        "id, applicant_id, raw_extracted_content, ner_status, gpt_status"
    ).neq("raw_extracted_content", None).execute()

    if not response.data:
        print("No resumes with raw_extracted_content found.")
        return

    pending = [r for r in response.data if r.get("raw_extracted_content") and r.get("gpt_status") != "success"]
    print(f"Found {len(pending)} resumes needing processing")

    success_count = 0
    failed_count = 0

    for resume in pending:
        resume_id = resume["id"]
        raw_content = resume.get("raw_extracted_content")
        print(f"\nProcessing resume {resume_id}...")
        try:
            parsed_data = parse_resume(raw_content)
            update_data = {
                "parsed_data": json.dumps(parsed_data),
                "gpt_cleaning_status": parsed_data.get("gpt_cleaning_status"),
                "cleaned_resume_text": parsed_data.get("cleaned_resume_text"),
                "ner_status": "completed",
            }
            sb.table("resumes").update(update_data).eq("id", resume_id).execute()
            print(f"  Name: {parsed_data.get('name')}")
            print(f"  Email: {parsed_data.get('email')}")
            print(f"  Skills found: {len(parsed_data.get('skills', []))}")
            print(f"  Education entries: {len(parsed_data.get('education', []))}")
            print(f"  Experience entries: {len(parsed_data.get('experience', []))}")
            print("  Status: COMPLETED")
            success_count += 1
        except Exception as e:
            print(f"  Error: {e}")
            try:
                sb.table("resumes").update({
                    "gpt_status": "failed",
                    "ner_status": "failed",
                    "parsed_data": json.dumps({"error": str(e)}),
                }).eq("id", resume_id).execute()
            except Exception:
                pass
            failed_count += 1

    print("\n=== Resume Parsing Summary ===")
    print(f"Successful: {success_count}")
    print(f"Failed: {failed_count}")


if __name__ == "__main__":
    print("Starting Resume Parser for AutoIntel...")
    process_pending_resumes()
    print("Resume parsing completed.")