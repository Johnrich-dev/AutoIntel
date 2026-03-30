#!/usr/bin/env python3
"""
Microsoft Graph API Service for AutoIntel Recruitment System
Handles Microsoft Teams meeting link generation via Microsoft Graph API.
"""

import os
import requests
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Microsoft Graph API configuration
AZURE_CLIENT_ID = os.getenv("AZURE_CLIENT_ID", "")
AZURE_CLIENT_SECRET = os.getenv("AZURE_CLIENT_SECRET", "")
AZURE_TENANT_ID = os.getenv("AZURE_TENANT_ID", "")
AZURE_USER_EMAIL = os.getenv("AZURE_USER_EMAIL", "")

# Microsoft Graph endpoints
GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0"


def get_access_token() -> Optional[str]:
    """
    Get access token from Azure AD using client credentials flow.
    
    Returns:
        Access token string or None if failed
    """
    if not AZURE_CLIENT_ID or not AZURE_CLIENT_SECRET or not AZURE_TENANT_ID:
        print("Microsoft Graph credentials not configured in .env")
        print("Please set AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, and AZURE_TENANT_ID")
        return None
    
    try:
        token_url = f"https://login.microsoftonline.com/{AZURE_TENANT_ID}/oauth2/v2.0/token"
        
        data = {
            "grant_type": "client_credentials",
            "client_id": AZURE_CLIENT_ID,
            "client_secret": AZURE_CLIENT_SECRET,
            "scope": "https://graph.microsoft.com/.default"
        }
        
        response = requests.post(token_url, data=data, timeout=30)
        response.raise_for_status()
        
        token_data = response.json()
        access_token = token_data.get("access_token")
        
        print("Successfully obtained Microsoft Graph access token")
        return access_token
        
    except Exception as e:
        print(f"Failed to get Microsoft Graph access token: {str(e)}")
        return None


def create_teams_meeting(
    subject: str,
    start_time: datetime,
    end_time: datetime,
    attendees: Optional[List[str]] = None,
    content: Optional[str] = None,
    time_zone: str = "Asia/Manila"
) -> Optional[Dict[str, Any]]:
    """
    Create a Microsoft Teams meeting and return the join URL.
    
    Args:
        subject: Meeting subject/title
        start_time: Meeting start time (datetime object)
        end_time: Meeting end time (datetime object)
        attendees: List of email addresses to invite
        content: Meeting body/description
        time_zone: Time zone for the meeting
    
    Returns:
        Dict with meeting details including joinUrl, or None if failed
    """
    access_token = get_access_token()
    if not access_token:
        return None
    
    try:
        # Use user token if available, otherwise use application permissions
        if AZURE_USER_EMAIL:
            endpoint = f"{GRAPH_BASE_URL}/users/{AZURE_USER_EMAIL}/onlineMeetings"
        else:
            endpoint = f"{GRAPH_BASE_URL}/me/onlineMeetings"
        
        # Format datetime for Graph API (ISO 8601 with timezone)
        start_iso = start_time.strftime("%Y-%m-%dT%H:%M:%S")
        end_iso = end_time.strftime("%Y-%m-%dT%H:%M:%S")
        
        meeting_payload = {
            "subject": subject,
            "startDateTime": start_iso,
            "endDateTime": end_iso,
            "timeZone": time_zone,
        }
        
        # Add attendees if provided
        if attendees:
            meeting_payload["attendees"] = [
                {"emailAddress": {"address": email}, "type": "required"}
                for email in attendees
            ]
        
        # Add meeting body if provided
        if content:
            meeting_payload["chatInfo"] = {
                "threadId": "new"
            }
        
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json"
        }
        
        response = requests.post(endpoint, json=meeting_payload, headers=headers, timeout=30)
        response.raise_for_status()
        
        meeting_data = response.json()
        
        print(f"Teams meeting created successfully: {meeting_data.get('joinWebUrl', '')}")
        
        return {
            "success": True,
            "join_url": meeting_data.get("joinWebUrl"),
            "meeting_id": meeting_data.get("id"),
            "join_web_url": meeting_data.get("joinWebUrl"),
            "subject": subject,
            "start_time": start_iso,
            "end_time": end_iso
        }
        
    except requests.exceptions.RequestException as e:
        print(f"Failed to create Teams meeting: {str(e)}")
        if hasattr(e, 'response') and e.response is not None:
            print(f"Response content: {e.response.text}")
        return None
    except Exception as e:
        print(f"Unexpected error creating Teams meeting: {str(e)}")
        return None


def create_interview_teams_meeting(
    applicant_name: str,
    applicant_email: str,
    job_title: str,
    interview_date: str,
    interview_time: str,
    interviewer_email: Optional[str] = None,
    interviewer_name: Optional[str] = None,
    duration_minutes: int = 60,
    notes: Optional[str] = None,
    time_zone: str = "Asia/Manila"
) -> Optional[Dict[str, Any]]:
    """
    Create a Teams meeting specifically for an interview.
    
    Args:
        applicant_name: Full name of the applicant
        applicant_email: Email of the applicant
        job_title: Position title
        interview_date: Date in YYYY-MM-DD format
        interview_time: Time in HH:MM format
        interviewer_email: Email of the interviewer
        interviewer_name: Name of the interviewer
        duration_minutes: Meeting duration (default 60)
        notes: Additional notes for the meeting
        time_zone: Time zone
    
    Returns:
        Dict with meeting details including joinUrl, or None if failed
    """
    # Parse date and time
    try:
        start_datetime = datetime.strptime(f"{interview_date} {interview_time}", "%Y-%m-%d %H:%M")
        end_datetime = start_datetime + timedelta(minutes=duration_minutes)
    except ValueError as e:
        print(f"Invalid date/time format: {e}")
        return None
    
    # Build meeting subject
    subject = f"Interview: {applicant_name} - {job_title}"
    
    # Build meeting description
    content_parts = [
        f"Applicant: {applicant_name}",
        f"Position: {job_title}",
    ]
    if interviewer_name:
        content_parts.append(f"Interviewer: {interviewer_name}")
    if notes:
        content_parts.append(f"\nNotes: {notes}")
    
    content = "\n".join(content_parts)
    
    # Build attendees list
    attendees = [applicant_email]
    if interviewer_email:
        attendees.append(interviewer_email)
    
    # Create the Teams meeting
    return create_teams_meeting(
        subject=subject,
        start_time=start_datetime,
        end_time=end_datetime,
        attendees=attendees,
        content=content,
        time_zone=time_zone
    )


# Quick test function
if __name__ == "__main__":
    print("Microsoft Graph API Service for Teams Meeting Creation")
    print("=" * 60)
    
    if not AZURE_CLIENT_ID or not AZURE_CLIENT_SECRET or not AZURE_TENANT_ID:
        print("\n⚠️  Configuration missing. Please set in .env:")
        print("   - AZURE_CLIENT_ID")
        print("   - AZURE_CLIENT_SECRET")
        print("   - AZURE_TENANT_ID")
        print("   - AZURE_USER_EMAIL (optional)")
    else:
        print("\n✅ Configuration found. Testing connection...")
        
        # Test token acquisition
        token = get_access_token()
        if token:
            print("✅ Successfully connected to Microsoft Graph API")
        else:
            print("❌ Failed to connect. Check your Azure AD app registration.")