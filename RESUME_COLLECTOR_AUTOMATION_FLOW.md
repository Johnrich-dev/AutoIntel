# Resume Collector Automation Flow

## Overview

This document describes the end-to-end automation flow when `resume_collector.py` is executed. The system automatically collects job application resumes from Gmail, processes them, triggers screening, and sends notifications.

---

## Complete Automation Flow

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                     RESUME COLLECTOR AUTOMATION FLOW                              │
└─────────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
                    ┌───────────────────────────────────────┐
                    │  1. INITIALIZATION                    │
                    │  - Load environment variables         │
                    │  - Initialize Supabase client         │
                    │  - Create required folders            │
                    │  - Connect to Gmail IMAP               │
                    └───────────────────────────────────────┘
                                        │
                                        ▼
                    ┌───────────────────────────────────────┐
                    │  2. SEARCH APPLICATION EMAILS         │
                    │  - Query Gmail for unread emails       │
                    │  - Filter by subject keywords          │
                    │  - Find emails with attachments       │
                    │  - Return list of email IDs            │
                    └───────────────────────────────────────┘
                                        │
                                        ▼
                    ┌───────────────────────────────────────┐
                    │  3. PROCESS EACH EMAIL                │
                    │  ┌─────────────────────────────────┐   │
                    │  │ a. Fetch Email Content          │   │
                    │  │    - Retrieve RFC822 message   │   │
                    │  │    - Parse sender info          │   │
                    │  └─────────────────────────────────┘   │
                    │              │                          │
                    │              ▼                          │
                    │  ┌─────────────────────────────────┐   │
                    │  │ b. Check Existing Applicant     │   │
                    │  │    - Query applicants by email  │   │
                    │  │    - Skip if already exists     │   │
                    │  └─────────────────────────────────┘   │
                    │              │                          │
                    │              ▼                          │
                    │  ┌─────────────────────────────────┐   │
                    │  │ c. Create Applicant Record      │   │
                    │  │    - Insert into applicants     │   │
                    │  │    - Generate access token      │   │
                    │  │    - Set expiration (2 days)     │   │
                    │  └─────────────────────────────────┘   │
                    │              │                          │
                    │              ▼                          │
                    │  ┌─────────────────────────────────┐   │
                    │  │ d. Process Attachments          │   │
                    │  │    - Download resume file       │   │
                    │  │    - Extract text (PDF/DOC/DOCX)│   │
                    │  │    - Upload to Supabase Storage │   │
                    │  │    - Create resume record       │   │
                    │  └─────────────────────────────────┘   │
                    │              │                          │
                    │              ▼                          │
                    │  ┌─────────────────────────────────┐   │
                    │  │ e. Parse Resume (Immediately)   │   │
                    │  │    - Call parse_resume()        │   │
                    │  │    - Extract: name, email,      │   │
                    │  │      phone, education,          │   │
                    │  │      experience, skills, etc.   │   │
                    │  │    - Update resume with parsed  │   │
                    │  └─────────────────────────────────┘   │
                    │              │                          │
                    │              ▼                          │
                    │  ┌─────────────────────────────────┐   │
                    │  │ f. Match Job Position           │   │
                    │  │    - Strategy 1: Exact title   │   │
                    │  │      match                      │   │
                    │  │    - Strategy 2: Role family   │   │
                    │  │      match                      │   │
                    │  │    - Strategy 3: Any active job │   │
                    │  │      (fallback)                 │   │
                    │  └─────────────────────────────────┘   │
                    │              │                          │
                    │              ▼                          │
                    │  ┌─────────────────────────────────┐   │
                    │  │ g. Trigger Automatic Screening │   │
                    │  │    - Call process_applicant_   │   │
                    │  │      screening()                │   │
                    │  │    - Perform hybrid scoring     │   │
                    │  │    - Send email notification   │   │
                    │  └─────────────────────────────────┘   │
                    │              │                          │
                    │              ▼                          │
                    │  ┌─────────────────────────────────┐   │
                    │  │ h. Mark Email as Processed      │   │
                    │  │    - Mark as read               │   │
                    │  │    - Add to processed label     │   │
                    │  └─────────────────────────────────┘   │
                    └───────────────────────────────────────┘
                                        │
                                        ▼
                    ┌───────────────────────────────────────┐
                    │  4. COMPLETION                        │
                    │  - Print summary of collected        │
                    │    resumes                             │
                    │  - Disconnect from Gmail              │
                    └───────────────────────────────────────┘
```

---

## Detailed Step-by-Step Process

### Step 1: Initialization

| Component | Description |
|-----------|-------------|
| **Environment Variables** | `GMAIL_EMAIL`, `GMAIL_APP_PASSWORD`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `GMAIL_SEARCH_SUBJECTS`, `MAX_EMAILS_PER_RUN` |
| **Supabase Client** | Create client for database operations |
| **Directories** | Create `resumes/` and `processed/` folders |
| **Gmail Connection** | Connect to `imap.gmail.com` using IMAP4_SSL |

### Step 2: Search Application Emails

```python
search_application_emails(mail)
```

**Search Strategy:**
1. **Primary**: Use Gmail server-side search (`X-GM-RAW`) with subject filters
2. **Fallback 1**: Search all unread emails, filter by subject client-side
3. **Fallback 2**: Search unread emails with attachments
4. **Final Fallback**: Search UNSEEN in primary mailbox with client-side filtering

**Subject Keywords:**
- Configured via `GMAIL_SEARCH_SUBJECTS` (default: "Applicant, Application")
- Matches variations like: "Application - Position", "Applicant - Position"

### Step 3: Process Each Email

#### 3a. Fetch Email Content

```python
status, msg_data = mail.fetch(email_id, '(RFC822)')
msg = email.message_from_bytes(email_body)
```

#### 3b. Extract Sender Information

```python
sender_name, sender_email, position = extract_sender_info(msg)
```

| Field | Extraction Method |
|-------|-------------------|
| **Name** | Parse from "Name <email>" format |
| **Email** | Extract email address from sender |
| **Position** | Regex from subject line (e.g., "Application - Python Developer") |

#### 3c. Check for Existing Applicant

```python
existing = supabase.table('applicants').select('id').eq('email', sender_email).execute()
if existing.data:
    skip  # Applicant already exists
```

#### 3d. Create Applicant Record

```python
applicant_result = supabase.table('applicants').insert({
    'email': sender_email,
    'name': sender_name,
    'position': position,
    'access_token': access_token,
    'access_expires_at': expires_at,
    'rules_accepted': False
}).execute()
```

#### 3e. Process Attachments

```python
uploaded_files = process_attachments(msg, applicant_id, sender_name, sender_email)
```

**Attachment Processing:**
1. **Filter Attachments**: Only process `.pdf`, `.doc`, `.docx` files
2. **Unique Filename**: Generate UUID-based filename to prevent overwrites
3. **Upload to Storage**: Upload to Supabase Storage bucket `resumes/`
4. **Extract Text**: Extract text from PDF/DOC/DOCX files
5. **Create Resume Record**: Insert into `resumes` table

**Text Extraction Priority:**
1. **pdfplumber** - Best for multi-column layouts
2. **PyMuPDF (fitz)** - Better reading order
3. **PyPDF2** - Last resort

**Database Record:**
```python
{
    'applicant_id': applicant_id,
    'resume_url': resume_url,
    'raw_extracted_content': extracted_text,
    'status': 'pending',
    'ner_status': 'pending',
    'uploaded_at': datetime.now().isoformat(),
    'extractor_used': 'pdfplumber'  # or 'pymupdf', 'pypdf2'
}
```

#### 3f. Parse Resume Immediately

```python
parsed_data = parse_resume(extracted_text)

update_data = {
    'parsed_data': json.dumps(parsed_data),
    'cleaned_resume_text': parsed_data.get('cleaned_resume_text'),
    'gpt_cleaning_status': parsed_data.get('gpt_cleaning_status'),
    'ner_status': 'completed',
}
supabase.table('resumes').update(update_data).eq('id', resume_id).execute()
```

**Parser Operations:**
- GPT text cleaning via `clean_with_gpt()`
- Split into sections (HEADER, SUMMARY, EXPERIENCE, EDUCATION, SKILLS, PROJECTS, TRAININGS)
- BERT NER entity extraction
- Extract: name, email, phone, education, experience, skills, projects, trainings

#### 3g. Match Job Position

Three matching strategies are attempted in order:

| Strategy | Method | Description |
|----------|--------|-------------|
| **1** | Exact/Partial Title Match | `ilike('title', f'%{position}%')` |
| **2** | Role Family Match | Extract role hint (developer, engineer, manager, etc.) and match `role_family` |
| **3** | Active Job Fallback | Use any active job if no match found |

#### 3h. Trigger Automatic Screening

```python
screening_result = process_applicant_screening(
    applicant_id=applicant_id,
    resume_text=resume_text,
    job_id=job_id,
    job_title=job_title,
    job_description=job_description,
    applicant_email=sender_email,
    applicant_name=sender_name,
    supabase_client=supabase,
    parsed_resume_json=parsed_resume_json,
    job_posting=job_posting
)
```

**Screening Service Operations:**
1. **Hybrid Scoring** - Combine semantic and keyword matching
2. **Calculate Score** - Match resume against job requirements
3. **Make Decision** - Shortlist, Interview, or Reject
4. **Send Email** - Notify applicant of result

#### 3i. Mark Email as Processed

```python
mark_as_read(mail, email_id)      # Mark as seen
move_to_processed(mail, email_id) # Add "processed" label
```

---

## Database Records Created

### 1. Applicant Record (`applicants` table)

```json
{
    "id": "uuid",
    "email": "applicant@example.com",
    "name": "John Doe",
    "position": "Python Developer",
    "access_token": "email_abc123...",
    "access_expires_at": "2024-01-15T...",
    "rules_accepted": false,
    "created_at": "..."
}
```

### 2. Resume Record (`resumes` table)

```json
{
    "id": "uuid",
    "applicant_id": "uuid",
    "resume_url": "https://.../resumes/filename.pdf",
    "raw_extracted_content": "Full text extracted from resume...",
    "parsed_data": {
        "name": "John Doe",
        "email": "john@example.com",
        "phone": "09123456789",
        "education": [...],
        "experience": [...],
        "skills": ["Python", "JavaScript", ...],
        "projects": [...],
        "trainings": [...]
    },
    "cleaned_resume_text": "GPT-cleaned version...",
    "status": "pending",
    "ner_status": "completed",
    "gpt_cleaning_status": "success",
    "extractor_used": "pdfplumber",
    "uploaded_at": "..."
}
```

### 3. Screening Record (via `process_applicant_screening`)

```json
{
    "applicant_id": "uuid",
    "job_id": "uuid",
    "score": 85,
    "decision": "shortlist",
    "screening_completed_at": "...",
    "email_sent": true
}
```

---

## Key Functions Reference

| Function | Lines | Purpose |
|----------|-------|---------|
| `connect_to_email()` | 103-112 | Establish IMAP connection to Gmail |
| `search_application_emails()` | 187-292 | Find unread application emails |
| `extract_sender_info()` | 294-337 | Parse sender name, email, position |
| `extract_text_from_pdf()` | 339-406 | Extract text from PDF (multiple methods) |
| `process_attachments()` | 408-514 | Download, upload, extract resume |
| `mark_as_read()` | 516-522 | Mark email as seen |
| `move_to_processed()` | 524-536 | Label email as processed |
| `process_emails()` | 538-738 | Main orchestration function |

---

## Dependencies

- **imaplib**: Gmail IMAP connection
- **email**: Email parsing
- **PyPDF2**: PDF text extraction (fallback)
- **pdfplumber**: Primary PDF extraction
- **fitz (PyMuPDF)**: Secondary PDF extraction
- **supabase**: Database and storage client
- **resume_parser**: Resume parsing module
- **screening_service**: Automatic screening module

---

## Error Handling

| Scenario | Handling |
|----------|----------|
| **Duplicate applicant** | Skip, mark email as processed |
| **Text extraction failure** | Log warning, continue with empty content |
| **No job match** | Use position as title, skip screening |
| **Screening failure** | Log error, continue processing |
| **Database errors** | Log error, continue to next email |

---

## Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `GMAIL_EMAIL` | `autointel.ta@gmail.com` | Gmail account |
| `GMAIL_APP_PASSWORD` | (required) | App password for Gmail |
| `GMAIL_SEARCH_SUBJECTS` | `Applicant,Application` | Subject keywords to search |
| `MAX_EMAILS_PER_RUN` | `20` | Max emails to process per run |
| `SUPABASE_URL` | (required) | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | (required) | Supabase service role key |
