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
    url: Optional[str] = None,
    time_zone: str = "Asia/Manila"
) -> str:
    """
    Generate ICS calendar file content.
    """
    if not uid:
        uid = f"{uuid.uuid4()}@autointel.recruitment"

    # Format datetime with TZID — avoids "floating" time that shifts per viewer's local tz
    dt_start = start_time.strftime("%Y%m%dT%H%M%S")
    dt_end = end_time.strftime("%Y%m%dT%H%M%S")
    dtstamp = datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")

    # Build attendees section
    attendees_lines = ""
    if attendees:
        for attendee in attendees:
            attendees_lines += f"ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE;CN={attendee}:mailto:{attendee}\n"

    location_line = f"LOCATION:{location}\n" if location else ""
    url_line = f"URL:{url}\n" if url else ""
    categories_line = f"CATEGORIES:{categories}\n" if categories else ""

    escaped_description = description.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n")

    # VTIMEZONE block — required by RFC 5545 for non-UTC times; Outlook ignores X-WR-TIMEZONE without it
    # Covers Asia/Manila (UTC+8, no DST)
    vtimezone_block = f"""BEGIN:VTIMEZONE
TZID:{time_zone}
X-LIC-LOCATION:{time_zone}
BEGIN:STANDARD
TZOFFSETFROM:+0800
TZOFFSETTO:+0800
TZNAME:PHT
DTSTART:19700101T000000
END:STANDARD
END:VTIMEZONE
"""

    ics_content = f"""BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//AutoIntel//Recruitment System//EN
CALSCALE:GREGORIAN
METHOD:{method}
X-WR-CALNAME:AutoIntel Interviews
X-WR-TIMEZONE:{time_zone}
{vtimezone_block}
BEGIN:VEVENT
UID:{uid}
DTSTAMP:{dtstamp}
DTSTART;TZID={time_zone}:{dt_start}
DTEND;TZID={time_zone}:{dt_end}
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
    meeting_id: Optional[str] = None,
    meeting_passcode: Optional[str] = None,
    location: Optional[str] = None,
    interviewer_name: Optional[str] = None,
    interviewer_email: Optional[str] = None,
    additional_attendees: Optional[List[str]] = None,
    applicant_instructions: Optional[str] = None,
    notes: Optional[str] = None,
    duration_minutes: int = 60,
    organizer_name: str = "AutoIntel Recruitment",
    organizer_email: str = "autointel.ta@gmail.com",
    time_zone: str = "Asia/Manila"
) -> Optional[str]:
    """
    Create ICS calendar file content for an interview.
    Supports additional attendees, meeting credentials, and applicant instructions.

    IMPORTANT: The ICS METHOD:REQUEST causes Gmail/Outlook to render an
    Accept/Decline card. All attendees (applicant + interviewers) receive
    the same ICS so the event appears in everyone's calendar.

    Args:
        applicant_name: Full name of the applicant
        applicant_email: Email of the applicant
        job_title: Position title
        interview_date: Date in YYYY-MM-DD format
        interview_time: Time in HH:MM format
        interview_type: 'online', 'in-person', or 'hybrid'
        meeting_link: Microsoft Teams or other meeting link
        meeting_id: Meeting ID (optional)
        meeting_passcode: Meeting passcode (optional)
        location: Physical location for in-person/hybrid
        interviewer_name: Name of the primary interviewer
        interviewer_email: Email of the primary interviewer
        additional_attendees: Extra attendee emails (panel members, HR, etc.)
        applicant_instructions: Instructions shown in description (applicant-safe)
        notes: Internal notes — NOT included in ICS description
        duration_minutes: Meeting duration
        organizer_name: Name of the organizer
        organizer_email: Email of the organizer
        time_zone: Time zone string (e.g. Asia/Manila)

    Returns:
        ICS content as string, or None if failed
    """
    try:
        start_datetime = datetime.strptime(f"{interview_date} {interview_time}", "%Y-%m-%d %H:%M")
        end_datetime = start_datetime + timedelta(minutes=duration_minutes)
    except ValueError as e:
        print(f"Invalid date/time format: {e}")
        return None

    summary = f"Interview: {applicant_name} - {job_title}"

    # Build description — applicant-safe content only (no internal notes)
    desc_parts = [
        f"Interview Invitation",
        f"",
        f"Applicant: {applicant_name}",
        f"Position: {job_title}",
        f"Type: {interview_type.replace('-', ' ').title()}",
        f"Duration: {duration_minutes} minutes",
    ]
    if interviewer_name:
        desc_parts.append(f"Interviewer: {interviewer_name}")
    if meeting_link and interview_type in ("online", "hybrid"):
        desc_parts.append(f"")
        desc_parts.append(f"Join Meeting: {meeting_link}")
    if meeting_id:
        desc_parts.append(f"Meeting ID: {meeting_id}")
    if meeting_passcode:
        desc_parts.append(f"Passcode: {meeting_passcode}")
    if location and interview_type in ("in-person", "hybrid"):
        desc_parts.append(f"")
        desc_parts.append(f"Location: {location}")
    if applicant_instructions:
        desc_parts.append(f"")
        desc_parts.append(f"Instructions: {applicant_instructions}")
    desc_parts.append(f"")
    desc_parts.append(f"Please accept or decline this calendar invite to confirm your attendance.")

    description = "\\n".join(desc_parts)

    # Determine ICS location field
    # For online: use meeting link so calendar apps show a clickable URL
    # For in-person: use physical address
    # For hybrid: combine both
    if interview_type == "online" and meeting_link:
        event_location = meeting_link
    elif interview_type == "in-person" and location:
        event_location = location
    elif interview_type == "hybrid":
        parts = []
        if meeting_link:
            parts.append(meeting_link)
        if location:
            parts.append(location)
        event_location = " | ".join(parts) if parts else None
    else:
        event_location = None

    # Build attendees: applicant + primary interviewer + additional attendees
    attendees = [applicant_email]
    if interviewer_email:
        attendees.append(interviewer_email)
    if additional_attendees:
        for email in additional_attendees:
            if email and email not in attendees:
                attendees.append(email)

    return generate_ics_content(
        summary=summary,
        start_time=start_datetime,
        end_time=end_datetime,
        description=description,
        location=event_location,
        organizer_name=organizer_name,
        organizer_email=organizer_email,
        attendees=attendees,
        categories="Interview,Recruitment",
        url=meeting_link if interview_type in ("online", "hybrid") else None,
        time_zone=time_zone
    )


def create_interview_email_with_ics(
    applicant_name: str,
    applicant_email: str,
    job_title: str,
    interview_date: str,
    interview_time: str,
    interview_type: str,
    meeting_link: Optional[str] = None,
    meeting_id: Optional[str] = None,
    meeting_passcode: Optional[str] = None,
    location: Optional[str] = None,
    interviewer_name: Optional[str] = None,
    interviewer_email: Optional[str] = None,
    additional_attendees: Optional[List[str]] = None,
    applicant_instructions: Optional[str] = None,
    notes: Optional[str] = None,
    duration_minutes: int = 60,
    time_zone: str = "Asia/Manila"
) -> Optional[Dict[str, Any]]:
    """
    Create ICS calendar content for attaching to interview emails.
    Called by email_service.send_interview_notification and
    email_service.send_interviewer_notification.

    Returns a dict with 'ics_content' plus all event metadata,
    or None if ICS generation failed.
    """
    ics_content = create_interview_ics(
        applicant_name=applicant_name,
        applicant_email=applicant_email,
        job_title=job_title,
        interview_date=interview_date,
        interview_time=interview_time,
        interview_type=interview_type,
        meeting_link=meeting_link,
        meeting_id=meeting_id,
        meeting_passcode=meeting_passcode,
        location=location,
        interviewer_name=interviewer_name,
        interviewer_email=interviewer_email,
        additional_attendees=additional_attendees,
        applicant_instructions=applicant_instructions,
        notes=notes,
        duration_minutes=duration_minutes,
        time_zone=time_zone
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
        "meeting_id": meeting_id,
        "meeting_passcode": meeting_passcode,
        "location": location,
        "interviewer_name": interviewer_name,
        "interviewer_email": interviewer_email,
        "additional_attendees": additional_attendees or [],
        "applicant_instructions": applicant_instructions,
        "notes": notes,
        "duration_minutes": duration_minutes,
        "time_zone": time_zone
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