#!/usr/bin/env python3
"""
Resume Collector for SentinelAI
Automatically collects job application resumes from Gmail inbox and uploads to database.
"""

import email
import imaplib
import io
import os
import re
import uuid
from datetime import datetime, timedelta
from email.header import decode_header

from supabase import Client, create_client
from PyPDF2 import PdfReader

# Configuration
IMAP_SERVER = 'imap.gmail.com'
IMAP_PORT = 993
EMAIL_USER = 'sentinelaiph@gmail.com'
EMAIL_PASSWORD = 'vydgycxlruttfbib'
SEARCH_SUBJECT = 'Applicant'
DOWNLOAD_FOLDER = 'resumes'
PROCESSED_FOLDER = 'processed'

# Supabase configuration
SUPABASE_URL = 'https://vjlgbhcfgbtxcisazpwr.supabase.co'
SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZqbGdiaGNmZ2J0eGNpc2F6cHdyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MzM5NDM1OSwiZXhwIjoyMDc4OTcwMzU5fQ.g4OGxXWBGcHiwijYl1rypPpLjBo_VFxigujzwQ-uxgQ'
supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

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

def search_application_emails(mail):
    """Search for unread emails with application subjects."""
    try:
        mail.select('inbox')
        status, messages = mail.search(None, 'UNSEEN')
        if status != 'OK':
            return []

        all_unread = messages[0].split()
        print(f"Found {len(all_unread)} total unread emails")

        email_ids = []
        for email_id in all_unread:
            status, msg_data = mail.fetch(email_id, '(BODY[HEADER.FIELDS (SUBJECT)])')
            if status == 'OK':
                header = msg_data[0][1].decode('utf-8', errors='ignore')
                subject = header.split('Subject: ', 1)[1].strip() if 'Subject: ' in header else 'No subject'
                print(f"Email {email_id}: {subject}")
                if SEARCH_SUBJECT.lower() in subject.lower():
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
    
    # Try "Application - Position"
    position_match = re.search(r"Application\s*[-–—]\s*(.+)", subject)
    
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
    try:
        pdf_file = io.BytesIO(file_content)
        reader = PdfReader(pdf_file)
        text = ""
        for page in reader.pages:
            text += page.extract_text() + "\n"
        return text.strip() if text else None
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
                clean_name = re.sub(r'[^\w\-_\.]', '_', sender_name)
                clean_email = re.sub(r'[^\w\-_\.]', '_', sender_email.split('@')[0])
                timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
                new_filename = f"{clean_name}_{clean_email}_{timestamp}_{filename}"
                file_content = part.get_payload(decode=True)

                try:
                    bucket_name = 'resumes'
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
    """Move email to processed folder."""
    try:
        mail.create(PROCESSED_FOLDER)
    except:
        pass

    try:
        mail.copy(email_id, PROCESSED_FOLDER)
        mail.store(email_id, '+FLAGS', '\\Deleted')
        mail.expunge()
        print(f"Moved email {email_id} to {PROCESSED_FOLDER}")
    except Exception as e:
        print(f"Failed to move email: {e}")

def process_emails():
    """Main function to process application emails."""
    create_folders()

    mail = connect_to_email()
    if not mail:
        return

    try:
        email_ids = search_application_emails(mail)
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
    print("Starting Resume Collector for SentinelAI...")
    process_emails()
    print("Resume collection completed.")
