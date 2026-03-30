#!/usr/bin/env python3
"""
Calendar Service for AutoIntel Recruitment System
Handles Google Calendar API integration for scheduling interviews.
"""

import os
import uuid
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Google Calendar configuration
GOOGLE_SERVICE_ACCOUNT_EMAIL = os.getenv("GOOGLE_SERVICE_ACCOUNT_EMAIL", "")
GOOGLE_PRIVATE_KEY = os.getenv("GOOGLE_PRIVATE_KEY", "")
GOOGLE_PROJECT_ID = os.getenv("GOOGLE_PROJECT_ID", "")
GOOGLE_PRIVATE_KEY_ID = os.getenv("GOOGLE_PRIVATE_KEY_ID", "")
GOOGLE_TOKEN_URI = os.getenv("GOOGLE_TOKEN_URI", "https://oauth2.googleapis.com/token")
GOOGLE_AUTH_URI = os.getenv("GOOGLE_AUTH_URI", "https://accounts.google.com/o/oauth2/auth")
GOOGLE_CALENDAR_ID = os.getenv("GOOGLE_CALENDAR_ID", "primary")

# Try to import google libraries, handle gracefully if not installed
try:
    from google.oauth2 import service_account
    from googleapiclient.discovery import build
    GOOGLE_LIBRARIES_AVAILABLE = True
except ImportError:
    GOOGLE_LIBRARIES_AVAILABLE = False
    print("Warning: google-api-python-client not installed. Calendar features will be disabled.")


def get_calendar_service():
    """
    Create and return a Google Calendar service instance using Service Account.
    
    Returns:
        googleapiclient.discovery.Resource: Calendar service object, or None if not configured
    """
    if not GOOGLE_LIBRARIES_AVAILABLE:
        print("Error: google-api-python-client not installed")
        return None
    
    if not GOOGLE_SERVICE_ACCOUNT_EMAIL or not GOOGLE_PRIVATE_KEY:
        print("Error: Google Calendar credentials not configured in .env")
        print("Please set GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY")
        return None
    
    try:
        # Create credentials from service account info
        # Include all required fields for service account authentication
        credentials_info = {
            "type": "service_account",
            "project_id": GOOGLE_PROJECT_ID,
            "private_key_id": GOOGLE_PRIVATE_KEY_ID,
            "private_key": GOOGLE_PRIVATE_KEY.replace("\\n", "\n"),
            "client_email": GOOGLE_SERVICE_ACCOUNT_EMAIL,
            "auth_uri": GOOGLE_AUTH_URI,
            "token_uri": GOOGLE_TOKEN_URI,
        }
        
        credentials = service_account.Credentials.from_service_account_info(
            credentials_info,
            scopes=[
                'https://www.googleapis.com/auth/calendar',
                'https://www.googleapis.com/auth/calendar.events'
            ]
        )
        
        # Build the Calendar API service
        service = build('calendar', 'v3', credentials=credentials)
        return service
        
    except Exception as e:
        print(f"Error creating Google Calendar service: {str(e)}")
        return None


def create_interview_event(
    applicant_name: str,
    applicant_email: str,
    job_title: str,
    interview_date: str,  # Format: YYYY-MM-DD
    interview_time: str,  # Format: HH:MM
    interview_type: str,  # 'online' or 'in-person'
    meeting_link: Optional[str] = None,
    location: Optional[str] = None,
    interviewer_name: Optional[str] = None,
    interviewer_email: Optional[str] = None,
    notes: Optional[str] = None,
    duration_minutes: int = 60,
    time_zone: str = "Asia/Manila"
) -> Dict[str, Any]:
    """
    Create a Google Calendar event for an interview scheduling.
    
    Args:
        applicant_name: Full name of the applicant
        applicant_email: Email address of the applicant
        job_title: Position being interviewed for
        interview_date: Interview date (YYYY-MM-DD)
        interview_time: Interview time (HH:MM in 24-hour format)
        interview_type: 'online' or 'in-person'
        meeting_link: URL for online meeting (optional)
        location: Physical location for in-person interview (optional)
        interviewer_name: Name of the interviewer (optional)
        interviewer_email: Email of the interviewer (optional)
        notes: Additional notes about the interview (optional)
        duration_minutes: Duration of the interview in minutes (default: 60)
        time_zone: Time zone for the event (default: Asia/Manila)
    
    Returns:
        Dict with success status and event details:
        {
            "success": True/False,
            "event_id": "...",
            "event_link": "...",
            "meet_link": "..." (if online),
            "error": "..." (if failed)
        }
    """
    service = get_calendar_service()
    if not service:
        return {
            "success": False,
            "error": "Google Calendar service not available. Check credentials."
        }
    
    try:
        # Parse date and time
        start_datetime = datetime.strptime(f"{interview_date} {interview_time}", "%Y-%m-%d %H:%M")
        end_datetime = start_datetime + timedelta(minutes=duration_minutes)
        
        # Format for Google Calendar API (ISO 8601)
        start_time_str = start_datetime.isoformat()
        end_time_str = end_datetime.isoformat()
        
        # Build description
        description_parts = [
            f"Applicant: {applicant_name}",
            f"Job Position: {job_title}",
            f"Interview Type: {interview_type.capitalize()}",
        ]
        if interviewer_name:
            description_parts.append(f"Interviewer: {interviewer_name}")
        if notes:
            description_parts.append(f"\nNotes: {notes}")
        if meeting_link:
            description_parts.append(f"\nMeeting Link: {meeting_link}")
        
        description = "\n".join(description_parts)
        
        # Build summary
        summary = f"Interview: {applicant_name} - {job_title}"
        
        # Build attendees list for Gmail Event Card
        attendees = [{"email": applicant_email}]
        if interviewer_email:
            attendees.append({"email": interviewer_email})
        
        # Build event body with attendees for Gmail Event Card
        event_body = {
            "summary": summary,
            "description": description,
            "start": {
                "dateTime": start_time_str,
                "timeZone": time_zone
            },
            "end": {
                "dateTime": end_time_str,
                "timeZone": time_zone
            },
            "attendees": attendees,  # This triggers Gmail Event Card
            "reminders": {
                "useDefault": False,
                "overrides": [
                    {"method": "email", "minutes": 24 * 60},  # 1 day before
                    {"method": "popup", "minutes": 30}  # 30 minutes before
                ]
            }
        }
        
        # Add location for in-person interviews
        if interview_type == "in-person" and location:
            event_body["location"] = location
        
        # For online interviews with Microsoft Teams - add link as location
        if interview_type == "online" and meeting_link:
            event_body["location"] = meeting_link
        
        # Create the event with attendees for Gmail Event Card
        event = service.events().insert(
            calendarId=GOOGLE_CALENDAR_ID,
            body=event_body,
            sendUpdates="all"  # Send calendar invitations to attendees
        ).execute()
        
        # Extract response data
        result = {
            "success": True,
            "event_id": event.get("id"),
            "event_link": event.get("htmlLink"),
            "created": event.get("created")
        }
        
        # Include meeting link if provided
        if meeting_link:
            result["meet_link"] = meeting_link
        
        print(f"Calendar event created successfully: {result.get('event_id')}")
        return result
        
    except Exception as e:
        error_msg = str(e)
        print(f"Error creating calendar event: {error_msg}")
        return {
            "success": False,
            "error": error_msg
        }


def update_interview_event(
    event_id: str,
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
    time_zone: str = "Asia/Manila"
) -> Dict[str, Any]:
    """
    Update an existing Google Calendar event.
    
    Args:
        event_id: The ID of the event to update
        (same as create_interview_event parameters...)
    
    Returns:
        Dict with success status and updated event details
    """
    service = get_calendar_service()
    if not service:
        return {
            "success": False,
            "error": "Google Calendar service not available"
        }
    
    try:
        start_datetime = datetime.strptime(f"{interview_date} {interview_time}", "%Y-%m-%d %H:%M")
        end_datetime = start_datetime + timedelta(minutes=duration_minutes)
        
        # Build description
        description_parts = [
            f"Applicant: {applicant_name}",
            f"Job Position: {job_title}",
            f"Interview Type: {interview_type.capitalize()}",
        ]
        if interviewer_name:
            description_parts.append(f"Interviewer: {interviewer_name}")
        if notes:
            description_parts.append(f"\nNotes: {notes}")
        if meeting_link:
            description_parts.append(f"\nMeeting Link: {meeting_link}")
        
        description = "\n".join(description_parts)
        
        # Build updated event body
        event_body = {
            "summary": f"Interview: {applicant_name} - {job_title}",
            "description": description,
            "start": {
                "dateTime": start_datetime.isoformat(),
                "timeZone": time_zone
            },
            "end": {
                "dateTime": end_datetime.isoformat(),
                "timeZone": time_zone
            }
        }
        
        if interview_type == "in-person" and location:
            event_body["location"] = location
        
        if interview_type == "online" and meeting_link:
            event_body["conferenceData"] = {
                "createRequest": {
                    "requestId": str(uuid.uuid4())[:8],
                    "conferenceSolutionKey": {"type": "hangoutsMeet"}
                }
            }
        
        # Update the event (without attendees - service account limitation)
        event = service.events().update(
            calendarId=GOOGLE_CALENDAR_ID,
            eventId=event_id,
            body=event_body,
            sendUpdates="none"
        ).execute()
        
        return {
            "success": True,
            "event_id": event.get("id"),
            "event_link": event.get("htmlLink")
        }
        
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }


def delete_interview_event(event_id: str) -> Dict[str, Any]:
    """
    Delete a Google Calendar event.
    
    Args:
        event_id: The ID of the event to delete
    
    Returns:
        Dict with success status
    """
    service = get_calendar_service()
    if not service:
        return {
            "success": False,
            "error": "Google Calendar service not available"
        }
    
    try:
        # Delete the event (without sending updates)
        service.events().delete(
            calendarId=GOOGLE_CALENDAR_ID,
            eventId=event_id,
            sendUpdates="none"
        ).execute()
        
        return {
            "success": True,
            "message": f"Event {event_id} deleted successfully"
        }
        
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }


# Test function
def test_calendar_service():
    """Test the calendar service with a sample event."""
    result = create_interview_event(
        applicant_name="John Doe",
        applicant_email="john.doe@example.com",
        job_title="Software Engineer",
        interview_date="2026-04-01",
        interview_time="10:00",
        interview_type="online",
        interviewer_name="Jane Smith",
        interviewer_email="jane.smith@company.com",
        notes="Technical interview for React position",
        duration_minutes=60
    )
    print(f"Test result: {result}")
    return result


if __name__ == "__main__":
    test_calendar_service()
