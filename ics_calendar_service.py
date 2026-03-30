#!/usr/bin/env python3
"""
ICS Calendar Service for AutoIntel Recruitment System
Generates ICS calendar files for email attachments.
ICS files trigger Gmail's "Event Card" with Accept/Decline buttons.
"""

import os
import uuid
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText


def generate_ics_content(
    summary: str,
    start_time: datetime,
    end_time: datetime,
    description: str,
    location: Optional[str] = None,
    organizer_name: str = "AutoIntel Recruitment",
    organizer_email: str = "",
    attendees: Optional[List[str]] = None,
    uid: Optional[str] = None,
    method: str = "REQUEST",
    status: str = "CONFIRMED",
    categories: Optional[str] = None,
    url: Optional[str] = None
) -> str:
    """
    Generate ICS calendar file content.
    
    Args:
        summary: Event title/summary
        start_time: Start datetime
        end_time: End datetime
        description: Event description
        location: Location or meeting URL
        organizer_name: Organizer's name
        organizer_email: Organizer's email
        attendees: List of attendee emails
        uid: Unique identifier for the event
        method: iCalendar method (REQUEST, PUBLISH, etc.)
        status: Event status (CONFIRMED, TENTATIVE, CANCELLED)
        categories: Event categories/tags
        url: URL link for the event
    
    Returns:
        ICS file content as string
    """
    # Generate UID if not provided
    if not uid:
        uid = f"{uuid.uuid4()}@autointel.recruitment"
    
    # Format datetime for ICS (UTC format: YYYYMMDDTHHMMSSZ)
    dt_start = start_time.strftime("%Y%m%dT%H%M%S")
    dt_end = end_time.strftime("%Y%m%dT%H%M%S")
    dtstamp = datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")
    
    # Build attendees section
    attendees_lines = ""
    if attendees:
        for attendee in attendees:
            attendees_lines += f"ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE;CN={attendee}:mailto:{attendee}\n"
    
    # Build location section
    location_line = ""
    if location:
        location_line = f"LOCATION:{location}\n"
    
    # Build URL section
    url_line = ""
    if url:
        url_line = f"URL:{url}\n"
    
    # Build categories section
    categories_line = ""
    if categories:
        categories_line = f"CATEGORIES:{categories}\n"
    
    # Build description (escape special characters)
    escaped_description = description.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n")
    
    ics_content = f"""BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//AutoIntel//Recruitment System//EN
CALSCALE:GREGORIAN
METHOD:{method}
X-WR-CALNAME:AutoIntel Interviews
X-WR-TIMEZONE:Asia/Manila

BEGIN:VEVENT
UID:{uid}
DTSTAMP:{dtstamp}
DTSTART:{dt_start}
DTEND:{dt_end}
SUMMARY:{summary}
DESCRIPTION:{escaped_description}
{location_line}{url_line}{categories_line}ORGANIZER;CN={organizer_name}:mailto:{organizer_email}
STATUS:{status}
SEQUENCE:0
PRIORITY:5
TRANSP:OPAQUE
{attendees_lines}BEGIN:VALARM
ACTION:DISPLAY
DESCRIPTION:Reminder
TRIGGER:-PT30M
END:VALARM
BEGIN:VALARM
ACTION:DISPLAY
DESCRIPTION:Reminder
TRIGGER:-PT5M
END:VALARM
END:VEVENT

END:VCALENDAR
"""
    
    return ics_content


def create_interview_ics(
    applicant_name: str,
    applicant_email: str,
    job_title: str,
    interview_date: str,
    interview_time: str,
    interview_type: str,
    meeting_link: Optional[str] = None,
    location: Optional[str] = None,
    interviewer_name: Optional[str] = None,
    interviewer_email: Optional[str] = None,
    notes: Optional[str] = None,
    duration_minutes: int = 60,
    organizer_name: str = "AutoIntel Recruitment",
    organizer_email: str = "autointel.ta@gmail.com",
    time_zone: str = "Asia/Manila"
) -> Optional[str]:
    """
    Create ICS calendar file content for an interview.
    
    Args:
        applicant_name: Full name of the applicant
        applicant_email: Email of the applicant
        job_title: Position title
        interview_date: Date in YYYY-MM-DD format
        interview_time: Time in HH:MM format
        interview_type: 'online' or 'in-person'
        meeting_link: Microsoft Teams or other meeting link
        location: Physical location for in-person
        interviewer_name: Name of the interviewer
        interviewer_email: Email of the interviewer
        notes: Additional notes
        duration_minutes: Meeting duration
        organizer_name: Name of the organizer
        organizer_email: Email of the organizer
        time_zone: Time zone
    
    Returns:
        ICS content as string, or None if failed
    """
    try:
        # Parse date and time
        start_datetime = datetime.strptime(f"{interview_date} {interview_time}", "%Y-%m-%d %H:%M")
        end_datetime = start_datetime + timedelta(minutes=duration_minutes)
    except ValueError as e:
        print(f"Invalid date/time format: {e}")
        return None
    
    # Build event summary
    summary = f"Interview: {applicant_name} - {job_title}"
    
    # Build event description
    desc_parts = [
        f"Applicant: {applicant_name}",
        f"Position: {job_title}",
        f"Type: {interview_type.capitalize()}",
    ]
    if interviewer_name:
        desc_parts.append(f"Interviewer: {interviewer_name}")
    if notes:
        desc_parts.append(f"")
        desc_parts.append(f"Notes: {notes}")
    
    description = "\\n".join(desc_parts)
    
    # Determine location/meeting link
    event_location = ""
    if interview_type == "online" and meeting_link:
        event_location = meeting_link
    elif interview_type == "in-person" and location:
        event_location = location
    
    # Build attendees list
    attendees = [applicant_email]
    if interviewer_email:
        attendees.append(interviewer_email)
    
    # Generate ICS content
    return generate_ics_content(
        summary=summary,
        start_time=start_datetime,
        end_time=end_datetime,
        description=description,
        location=event_location if event_location else None,
        organizer_name=organizer_name,
        organizer_email=organizer_email,
        attendees=attendees,
        categories="Interview,Recruitment",
        url=meeting_link if interview_type == "online" else None
    )


def create_interview_email_with_ics(
    applicant_name: str,
    applicant_email: str,
    job_title: str,
    interview_date: str,
    interview_time: str,
    interview_type: str,
    meeting_link: Optional[str] = None,
    location: Optional[str] = None,
    interviewer_name: Optional[str] = None,
    interviewer_email: Optional[str] = None,
    notes: Optional[str] = None,
    duration_minutes: int = 60
) -> Optional[Dict[str, Any]]:
    """
    Create email content with ICS calendar attachment.
    This is used by email_service to attach the calendar invite.
    
    Args:
        Same as create_interview_ics
    
    Returns:
        Dict with 'ics_content' and other event details
    """
    ics_content = create_interview_ics(
        applicant_name=applicant_name,
        applicant_email=applicant_email,
        job_title=job_title,
        interview_date=interview_date,
        interview_time=interview_time,
        interview_type=interview_type,
        meeting_link=meeting_link,
        location=location,
        interviewer_name=interviewer_name,
        interviewer_email=interviewer_email,
        notes=notes,
        duration_minutes=duration_minutes
    )
    
    if not ics_content:
        return None
    
    return {
        "ics_content": ics_content,
        "applicant_name": applicant_name,
        "applicant_email": applicant_email,
        "job_title": job_title,
        "interview_date": interview_date,
        "interview_time": interview_time,
        "interview_type": interview_type,
        "meeting_link": meeting_link,
        "location": location,
        "interviewer_name": interviewer_name,
        "interviewer_email": interviewer_email,
        "notes": notes
    }


# Quick test
if __name__ == "__main__":
    print("ICS Calendar Service - Testing")
    print("=" * 50)
    
    test_ics = create_interview_ics(
        applicant_name="John Doe",
        applicant_email="john@example.com",
        job_title="Software Engineer",
        interview_date="2026-04-01",
        interview_time="10:00",
        interview_type="online",
        meeting_link="https://teams.microsoft.com/meet/abc123",
        interviewer_name="Jane Smith",
        interviewer_email="jane@company.com",
        notes="Technical interview - bring portfolio"
    )
    
    if test_ics:
        print("\n✅ ICS content generated successfully:")
        print("-" * 40)
        print(test_ics[:500] + "..." if len(test_ics) > 500 else test_ics)
    else:
        print("\n❌ Failed to generate ICS content")