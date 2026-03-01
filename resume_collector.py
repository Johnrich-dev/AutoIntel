#!/usr/bin/env python3
"""
Resume Collector for AutoIntel
Automatically collects job application resumes from Gmail inbox and uploads to database.
"""

import email
import imaplib
import io
import os
import re
import sys
import uuid
from datetime import datetime, timedelta
from email.header import decode_header
from pathlib import Path
from typing import Any, Optional

def _prefer_site_packages():
    repo_root = Path(__file__).resolve().parent
    if (repo_root / 'supabase').is_dir() and str(repo_root) in sys.path:
        # Avoid shadowing the supabase-py package with local /supabase folder
        sys.path.remove(str(repo_root))
        sys.path.append(str(repo_root))

_prefer_site_packages()

try:
    from supabase import create_client
except ImportError as exc:
    raise ImportError(
        "Failed to import supabase-py. Ensure the 'supabase' package is installed "
        "and a local /supabase folder isn't shadowing it."
    ) from exc
from PyPDF2 import PdfReader

# Load environment variables from .env if present
try:
    from dotenv import load_dotenv  # type: ignore

    load_dotenv()
except Exception:
    pass

# Configuration
IMAP_SERVER = 'imap.gmail.com'
IMAP_PORT = 993
<<<<<<< HEAD
EMAIL_USER = 'autointel.ta@gmail.com'
EMAIL_PASSWORD = 'vydgycxlruttfbib'
SEARCH_SUBJECT = 'Applicant'
=======
EMAIL_USER = os.getenv('GMAIL_EMAIL', 'autointel.ta@gmail.com')
EMAIL_PASSWORD = os.getenv('GMAIL_APP_PASSWORD')
SEARCH_SUBJECTS = [
    s.strip() for s in os.getenv('GMAIL_SEARCH_SUBJECTS', 'Applicant,Application').split(',') if s.strip()
]
>>>>>>> b813c7d9ae953dca39c72e064725aa67748dd5f2
DOWNLOAD_FOLDER = 'resumes'
PROCESSED_FOLDER = 'processed'
GMAIL_PRIMARY_MAILBOX = os.getenv('GMAIL_PRIMARY_MAILBOX', 'INBOX')
MAX_EMAILS_PER_RUN = max(1, min(200, int(os.getenv('MAX_EMAILS_PER_RUN', '20'))))
ALLOWED_ATTACHMENT_EXTS = ('.pdf', '.doc', '.docx')

# Supabase configuration
SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_SERVICE_KEY = os.getenv('SUPABASE_SERVICE_KEY')
supabase: Optional[Any] = None

def _require_env():
    missing = []
    if not EMAIL_PASSWORD:
        missing.append('GMAIL_APP_PASSWORD')
    if not SUPABASE_URL:
        missing.append('SUPABASE_URL')
    if not SUPABASE_SERVICE_KEY:
        missing.append('SUPABASE_SERVICE_KEY')
    if missing:
        raise RuntimeError(f"Missing required environment variables: {', '.join(missing)}")

def _decode_mime_header(value: str) -> str:
    if not value:
        return ''
    try:
        parts = decode_header(value)
        out = []
        for p, enc in parts:
            if isinstance(p, bytes):
                out.append(p.decode(enc or 'utf-8', errors='replace'))
            else:
                out.append(p)
        return ''.join(out).strip()
    except Exception:
        return str(value).strip()

def connect_to_email():
    """Establish IMAP connection to Gmail."""
    try:
        mail = imaplib.IMAP4_SSL(IMAP_SERVER, IMAP_PORT)
        mail.login(EMAIL_USER, EMAIL_PASSWORD)
        print("Successfully connected to Gmail IMAP")
        return mail
    except Exception as e:
        print(f"Failed to connect: {e}")
        return None

def create_folders():
    """Create necessary directories."""
    os.makedirs(DOWNLOAD_FOLDER, exist_ok=True)
    os.makedirs(PROCESSED_FOLDER, exist_ok=True)

def _imap_select(mail, mailbox: str) -> bool:
    try:
        # Quote mailbox names that contain spaces/specials (e.g. [Gmail]/All Mail)
        mb = mailbox.strip()
        if (mb.startswith('"') and mb.endswith('"')) or (mb.startswith("'") and mb.endswith("'")):
            mb = mb[1:-1]
        if any(ch in mb for ch in [' ', '"', '\\']):
            mb_esc = mb.replace('\\', '\\\\').replace('"', '\\"')
            mb = f'"{mb_esc}"'
        status, _ = mail.select(mb)
        return status == 'OK'
    except Exception:
        return False

def _build_gmail_raw_query():
    if not SEARCH_SUBJECTS:
        return 'is:unread'

    # Keep query simple to avoid IMAP parsing edge-cases; we IMAP-quote the whole query later.
    # Using subject:<term> (no embedded quotes) is generally more robust than subject:"...".
    terms = []
    for s in SEARCH_SUBJECTS:
        sl = s.lower()
        # Treat common variations like Applicant/Application/Applicate as one root
        if sl.startswith('applic'):
            terms.append("subject:applic")
        else:
            terms.append(f"subject:{s}")
    subject_terms = ' OR '.join(sorted(set(terms)))
    return f'is:unread ({subject_terms})'

def _imap_quote(s: str) -> str:
    # IMAP quoted-string: wrap in double quotes and escape \ and "
    s2 = (s or "").replace("\\", "\\\\").replace('"', '\\"')
    return f'"{s2}"'

def _subject_matches(subject: str) -> bool:
    s = (subject or '').lower()
    for kw in SEARCH_SUBJECTS:
        kl = kw.lower().strip()
        if not kl:
            continue
        if kl in s:
            return True
        # Root match to handle typos/variants like "Applicate"
        if kl.startswith('applic') and 'applic' in s:
            return True
    return False

def _message_has_resume_attachment(msg) -> bool:
    try:
        for part in msg.walk():
            if part.get_content_maintype() == 'multipart':
                continue
            if part.get('Content-Disposition') is None:
                continue
            filename = part.get_filename()
            if not filename:
                continue
            name = decode_header(filename)[0][0]
            if isinstance(name, bytes):
                name = name.decode('utf-8', errors='ignore')
            if str(name).lower().endswith(ALLOWED_ATTACHMENT_EXTS):
                return True
        return False
    except Exception:
        return False

def search_application_emails(mail):
    """Search for unread emails with application subjects."""
    try:
        # Prefer Gmail server-side search so we don't miss unread emails that aren't in INBOX.
        gmail_query = _build_gmail_raw_query()

        # Prefer All Mail so we don't miss unread-but-archived messages.
        mailboxes_to_try = ['[Gmail]/All Mail', '[Google Mail]/All Mail', 'All Mail', GMAIL_PRIMARY_MAILBOX]
        for mailbox in mailboxes_to_try:
            if not _imap_select(mail, mailbox):
                continue
            # X-GM-RAW argument must be a single IMAP string; quote it to survive spaces/parens.
            status, messages = mail.search(None, 'X-GM-RAW', _imap_quote(gmail_query))
            if status == 'OK':
                ids = messages[0].split() if messages and messages[0] else []
                if ids:
                    print(f"Found {len(ids)} unread application emails in {mailbox}")
                    return ids

            # If Gmail rejects our complex query, fall back to a simpler server-side query,
            # then apply the subject filter client-side below.
            if status == 'BAD':
                status2, messages2 = mail.search(None, 'X-GM-RAW', _imap_quote('is:unread'))
                if status2 == 'OK':
                    ids2 = messages2[0].split() if messages2 and messages2[0] else []
                    if ids2:
                        print(f"Found {len(ids2)} unread emails in {mailbox} (broad). Filtering by subject...")
                        # Fetch headers and filter
                        filtered = []
                        for email_id in ids2[:200]:  # safety cap
                            st, md = mail.fetch(email_id, '(BODY.PEEK[HEADER])')
                            if st != 'OK' or not md or not md[0]:
                                continue
                            try:
                                header_bytes = md[0][1]
                                header_msg = email.message_from_bytes(header_bytes)
                                subject = _decode_mime_header(header_msg.get('Subject', ''))
                            except Exception:
                                subject = ''
                            if any(s.lower() in subject.lower() for s in SEARCH_SUBJECTS):
                                filtered.append(email_id)
                        if filtered:
                            print(f"Found {len(filtered)} unread application emails in {mailbox} (filtered)")
                            return filtered

            # Extra fallback: unread emails with attachments (subject OR attachment-based match)
            status3, messages3 = mail.search(None, 'X-GM-RAW', _imap_quote('is:unread has:attachment'))
            if status3 == 'OK':
                ids3 = messages3[0].split() if messages3 and messages3[0] else []
                if ids3:
                    print(f"Found {len(ids3)} unread emails with attachments in {mailbox}. Filtering...")
                    filtered3 = []
                    for email_id in ids3[:200]:
                        st, md = mail.fetch(email_id, '(RFC822)')
                        if st != 'OK' or not md or not md[0]:
                            continue
                        try:
                            msg = email.message_from_bytes(md[0][1])
                            subject = _decode_mime_header(msg.get('Subject', ''))
                        except Exception:
                            subject = ''
                            msg = None
                        if _subject_matches(subject):
                            filtered3.append(email_id)
                            continue
                        if msg is not None and _message_has_resume_attachment(msg):
                            filtered3.append(email_id)
                    if filtered3:
                        print(f"Found {len(filtered3)} unread application-like emails in {mailbox} (attachments/subject)")
                        return filtered3

        # Fallback: UNSEEN in primary mailbox + client-side subject match.
        if not _imap_select(mail, GMAIL_PRIMARY_MAILBOX):
            print(f"Failed to select mailbox {GMAIL_PRIMARY_MAILBOX}")
            return []

        status, messages = mail.search(None, 'UNSEEN')
        if status != 'OK':
            return []

        all_unread = messages[0].split() if messages and messages[0] else []
        print(f"Found {len(all_unread)} total unread emails in {GMAIL_PRIMARY_MAILBOX}")

        email_ids = []
        for email_id in all_unread:
            status, msg_data = mail.fetch(email_id, '(BODY.PEEK[HEADER])')
            if status != 'OK' or not msg_data or not msg_data[0]:
                continue
            try:
                header_bytes = msg_data[0][1]
                header_msg = email.message_from_bytes(header_bytes)
                subject = _decode_mime_header(header_msg.get('Subject', ''))
            except Exception:
                subject = ''

            if subject:
                print(f"Email {email_id}: {subject}")

            if _subject_matches(subject):
                email_ids.append(email_id)

        print(f"Found {len(email_ids)} application emails")
        return email_ids
    except Exception as e:
        print(f"Search failed: {e}")
        return []

def extract_sender_info(msg):
    """Extract sender name, email, and position from email message."""
    sender = msg.get('From', '')
    subject = msg.get('Subject', '')

    # Parse email address
    match = re.search(r'([^<]+)<([^>]+)>', sender)
    if match:
        name = match.group(1).strip()
        email_addr = match.group(2).strip()
    else:
        name = sender.split('@')[0] if '@' in sender else 'Unknown'
        email_addr = sender

    # Extract position from subject
    position = "Unknown Position"
    
    # Try "Application - Position" (Application with 'cation')
    position_match = re.search(r"Application\s*[-–—]\s*(.+)", subject)
    
    # Try "Applicant - Position" (Applicant with 'cant')
    if not position_match:
        position_match = re.search(r"Applicant\s*[-–—]\s*(.+)", subject)
    
    # Try "Position - Application"
    if not position_match:
        position_match = re.search(r"^(.+?)\s*[-–—]\s*Application$", subject)
    
    # Try "Position - Applicant"
    if not position_match:
        position_match = re.search(r"^(.+?)\s*[-–—]\s*Applicant$", subject)
    
    # Try "Position Applicant"
    if not position_match:
        position_match = re.search(r"^(.+?)\s+Applicant$", subject)
    
    # Try "Position Application"
    if not position_match:
        position_match = re.search(r"^(.+?)\s+Application$", subject)
    
    if position_match:
        position = position_match.group(1).strip()

    return name, email_addr, position

def extract_text_from_pdf(file_content):
    """Extract text content from PDF file."""
    if not file_content:
        return None

    # Prefer PyMuPDF for better reading order when available.
    try:
        import fitz  # PyMuPDF

        doc = fitz.open(stream=file_content, filetype="pdf")
        lines = []
        for page in doc:
            blocks = page.get_text("blocks")
            blocks_sorted = sorted(blocks, key=lambda b: (round(b[1], 1), round(b[0], 1)))
            for b in blocks_sorted:
                t = (b[4] or "").strip()
                if t:
                    lines.append(t)
        text = "\n".join(lines).strip()
        return text or None
    except Exception:
        pass

    # Fallback to PyPDF2
    try:
        pdf_file = io.BytesIO(file_content)
        reader = PdfReader(pdf_file)
        chunks = []
        for page in reader.pages:
            page_text = page.extract_text() or ""
            if page_text.strip():
                chunks.append(page_text.strip())
        text = "\n\n".join(chunks).strip()
        return text or None
    except Exception as e:
        print(f"PDF extraction failed: {e}")
        return None

def process_attachments(msg, applicant_id, sender_name, sender_email):
    """Upload resume attachments to Supabase storage."""
    uploaded_files = []

    for part in msg.walk():
        if part.get_content_maintype() == 'multipart':
            continue
        if part.get('Content-Disposition') is None:
            continue

        filename = part.get_filename()
        if filename:
            filename = decode_header(filename)[0][0]
            if isinstance(filename, bytes):
                filename = filename.decode('utf-8')

            if filename.lower().endswith(('.pdf', '.doc', '.docx')):
                # Keep original filename extension
                original_ext = '.pdf'
                if filename.lower().endswith('.doc'):
                    original_ext = '.doc'
                elif filename.lower().endswith('.docx'):
                    original_ext = '.docx'
                
                # Create unique filename using UUID to prevent reuse/overwrite
                unique_id = uuid.uuid4().hex[:12]
                new_filename = f"{sender_name.replace(' ', '_')}_{sender_email.split('@')[0]}_{unique_id}{original_ext}"
                file_content = part.get_payload(decode=True)

                try:
                    bucket_name = 'resumes'
                    # Use unique path in storage
                    file_path = f"resumes/{new_filename}"

                    content_type = "application/pdf"
                    if filename.lower().endswith('.doc'):
                        content_type = "application/msword"
                    elif filename.lower().endswith('.docx'):
                        content_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

                    upload_result = supabase.storage.from_(bucket_name).upload(
                        file_path, file_content, file_options={"content-type": content_type}
                    )
                    print(f"Upload result: {upload_result}")

                    resume_url = supabase.storage.from_(bucket_name).get_public_url(file_path)
                    print(f"Resume URL: {resume_url}")

                    # Extract text from PDF
                    extracted_text = None
                    if filename.lower().endswith('.pdf'):
                        extracted_text = extract_text_from_pdf(file_content)
                        if extracted_text:
                            print(f"Extracted {len(extracted_text)} characters from PDF")
                        else:
                            print("Warning: Could not extract text from PDF")

                    insert_result = supabase.table('resumes').insert({
                        'applicant_id': applicant_id,
                        'resume_url': resume_url,
                        'raw_extracted_content': extracted_text,
                        'status': 'pending',
                        'ner_status': 'pending',
                        'uploaded_at': datetime.now().isoformat()
                    }).execute()
                    print(f"Insert result: {insert_result}")

                    uploaded_files.append(new_filename)
                    print(f"Successfully processed: {new_filename}")

                except Exception as e:
                    print(f"Failed to process {new_filename}: {e}")
                    import traceback
                    traceback.print_exc()

    return uploaded_files

def mark_as_read(mail, email_id):
    """Mark email as read."""
    try:
        mail.store(email_id, '+FLAGS', '\\Seen')
        print(f"Marked email {email_id} as read")
    except Exception as e:
        print(f"Failed to mark as read: {e}")

def move_to_processed(mail, email_id):
    """Label email as processed (Gmail)."""
    try:
        mail.create(PROCESSED_FOLDER)
    except:
        pass

    try:
        # Safer for Gmail: apply a label instead of copy+delete (avoids accidental deletion).
        mail.store(email_id, '+X-GM-LABELS', PROCESSED_FOLDER)
        print(f"Labeled email {email_id} as {PROCESSED_FOLDER}")
    except Exception as e:
        print(f"Failed to move email: {e}")

def process_emails():
    """Main function to process application emails."""
    create_folders()

    global supabase
    try:
        _require_env()
        supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    except Exception as e:
        print(f"Configuration error: {e}")
        return

    mail = connect_to_email()
    if not mail:
        return

    try:
        email_ids = search_application_emails(mail)
        if len(email_ids) > MAX_EMAILS_PER_RUN:
            print(f"Found {len(email_ids)} unread application emails; processing first {MAX_EMAILS_PER_RUN} this run.")
            email_ids = email_ids[:MAX_EMAILS_PER_RUN]
        summary = []
        print(f"Processing {len(email_ids)} emails")
    
        for email_id in email_ids:
            status, msg_data = mail.fetch(email_id, '(RFC822)')
            if status != 'OK':
                continue

            email_body = msg_data[0][1]
            msg = email.message_from_bytes(email_body)

            sender_name, sender_email, position = extract_sender_info(msg)
            date_received = msg.get('Date', 'Unknown')

            access_token = f"email_{uuid.uuid4().hex[:16]}"
            expires_at = (datetime.now() + timedelta(days=2)).isoformat()

            try:
                print(f"Processing applicant: {sender_name} <{sender_email}> for {position}")

                existing = supabase.table('applicants').select('id').eq('email', sender_email).execute()
                if existing.data:
                    print(f"Applicant {sender_email} already exists, skipping")
                    mark_as_read(mail, email_id)
                    move_to_processed(mail, email_id)
                    continue

                applicant_result = supabase.table('applicants').insert({
                    'email': sender_email,
                    'name': sender_name,
                    'position': position,
                    'access_token': access_token,
                    'access_expires_at': expires_at,
                    'rules_accepted': False
                }).execute()

                applicant_id = applicant_result.data[0]['id']
                print(f"Created applicant with ID: {applicant_id}")

                uploaded_files = process_attachments(msg, applicant_id, sender_name, sender_email)

                if uploaded_files:
                    for filename in uploaded_files:
                        summary.append({
                            'filename': filename,
                            'sender_email': sender_email,
                            'date_received': date_received
                        })

                mark_as_read(mail, email_id)
                move_to_processed(mail, email_id)

            except Exception as e:
                print(f"Failed to create applicant for {sender_email}: {e}")

        print("\n=== Resume Download Summary ===")
        print(f"Total resumes downloaded: {len(summary)}")
        for item in summary:
            print(f"File: {item['filename']}")
            print(f"  Sender: {item['sender_email']}")
            print(f"  Date: {item['date_received']}")
            print()

    except Exception as e:
        print(f"Processing failed: {e}")
    finally:
        try:
            mail.logout()
        except:
            pass

if __name__ == "__main__":
    print("Starting Resume Collector for AutoIntel...")
    process_emails()
    print("Resume collection completed.")
