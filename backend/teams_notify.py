"""
Microsoft Teams Webhook Notifications for AutoIntel Recruitment System.

Sends Adaptive Card messages to a Teams channel via an Incoming Webhook URL.
The URL is stored in admin_users.slack_webhook (repurposed field).

Usage:
    from teams_notify import notify_new_applicant, notify_screening_result, notify_assessment_complete
"""

import os
import requests
from typing import Optional
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
APP_URL = os.getenv("APP_URL", "http://localhost:5173")


def _get_admin_settings() -> dict:
    """Fetch the admin notification settings from the admin_users table."""
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        return {}
    try:
        from supabase import create_client
        client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
        result = client.table("admin_users").select(
            "slack_webhook, email_new_applicant, email_assessment_complete"
        ).limit(1).execute()
        if result.data:
            return result.data[0]
    except Exception as e:
        print(f"[Teams] Could not fetch admin settings: {e}")
    return {}


def _get_teams_webhook_url() -> Optional[str]:
    """Fetch the Teams webhook URL from the admin_users table."""
    settings = _get_admin_settings()
    return settings.get("slack_webhook") or None


def _post_to_teams(webhook_url: str, payload: dict) -> bool:
    """POST an Adaptive Card payload to the Teams webhook URL."""
    try:
        resp = requests.post(webhook_url, json=payload, timeout=10)
        if resp.status_code == 200:
            print(f"[Teams] Notification sent successfully.")
            return True
        else:
            print(f"[Teams] Webhook returned {resp.status_code}: {resp.text}")
            return False
    except Exception as e:
        print(f"[Teams] Failed to send notification: {e}")
        return False


def _status_color(status: str) -> str:
    colors = {
        "passed": "Good",       # green
        "in_review": "Warning", # yellow
        "failed": "Attention",  # red
        "new": "Accent",        # blue
        "completed": "Good",
    }
    return colors.get(status.lower(), "Default")


def notify_new_applicant(
    applicant_name: str,
    applicant_email: str,
    position: str,
    webhook_url: Optional[str] = None,
) -> bool:
    """Send a Teams notification when a new applicant submits their resume.
    Respects the email_new_applicant toggle in admin settings.
    """
    settings = _get_admin_settings()

    # Respect the toggle — default True if column missing
    if settings.get("email_new_applicant") is False:
        print("[Teams] New applicant notifications disabled, skipping.")
        return False

    url = webhook_url or settings.get("slack_webhook")
    if not url:
        print("[Teams] No webhook URL configured, skipping notification.")
        return False

    payload = {
        "type": "message",
        "attachments": [{
            "contentType": "application/vnd.microsoft.card.adaptive",
            "content": {
                "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
                "type": "AdaptiveCard",
                "version": "1.4",
                "body": [
                    {
                        "type": "TextBlock",
                        "text": "📋 New Applicant Received",
                        "weight": "Bolder",
                        "size": "Medium",
                        "color": "Accent"
                    },
                    {
                        "type": "FactSet",
                        "facts": [
                            {"title": "Name", "value": applicant_name},
                            {"title": "Email", "value": applicant_email},
                            {"title": "Position", "value": position},
                            {"title": "Status", "value": "Resume submitted — pending screening"},
                        ]
                    }
                ],
                "actions": [{
                    "type": "Action.OpenUrl",
                    "title": "View in AutoIntel",
                    "url": f"{APP_URL}/admin"
                }]
            }
        }]
    }
    return _post_to_teams(url, payload)


def notify_screening_result(
    applicant_name: str,
    applicant_email: str,
    position: str,
    score: float,
    decision: str,
    webhook_url: Optional[str] = None,
) -> bool:
    """Send a Teams notification when an applicant is screened (passed/failed/in_review)."""
    url = webhook_url or _get_teams_webhook_url()
    if not url:
        print("[Teams] No webhook URL configured, skipping notification.")
        return False
    status_labels = {
        "passed": "✅ Passed Screening",
        "in_review": "🔍 Needs Review",
        "failed": "❌ Did Not Pass",
        "qualified": "✅ Passed Screening",
        "needs_review": "🔍 Needs Review",
        "not_recommended": "❌ Did Not Pass",
    }
    label = status_labels.get(decision.lower(), decision)
    color = _status_color(decision)

    payload = {
        "type": "message",
        "attachments": [{
            "contentType": "application/vnd.microsoft.card.adaptive",
            "content": {
                "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
                "type": "AdaptiveCard",
                "version": "1.4",
                "body": [
                    {
                        "type": "TextBlock",
                        "text": "🎯 Screening Result",
                        "weight": "Bolder",
                        "size": "Medium",
                        "color": color
                    },
                    {
                        "type": "FactSet",
                        "facts": [
                            {"title": "Applicant", "value": applicant_name},
                            {"title": "Email", "value": applicant_email},
                            {"title": "Position", "value": position},
                            {"title": "Score", "value": f"{score:.0f} / 100"},
                            {"title": "Result", "value": label},
                        ]
                    }
                ],
                "actions": [{
                    "type": "Action.OpenUrl",
                    "title": "Review in AutoIntel",
                    "url": f"{APP_URL}/admin"
                }]
            }
        }]
    }
    return _post_to_teams(url, payload)


def notify_assessment_complete(
    applicant_name: str,
    applicant_email: str,
    position: str,
    completed: list,
    webhook_url: Optional[str] = None,
) -> bool:
    """Send a Teams notification when an applicant completes their assessments.
    Respects the email_assessment_complete toggle in admin settings.
    `completed` is a list of strings e.g. ['Video Assessment', 'Personality Test']
    """
    settings = _get_admin_settings()

    # Respect the toggle — default True if column missing
    if settings.get("email_assessment_complete") is False:
        print("[Teams] Assessment completion notifications disabled, skipping.")
        return False

    url = webhook_url or settings.get("slack_webhook")
    if not url:
        print("[Teams] No webhook URL configured, skipping notification.")
        return False

    completed_str = ", ".join(completed) if completed else "All assessments"

    payload = {
        "type": "message",
        "attachments": [{
            "contentType": "application/vnd.microsoft.card.adaptive",
            "content": {
                "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
                "type": "AdaptiveCard",
                "version": "1.4",
                "body": [
                    {
                        "type": "TextBlock",
                        "text": "📝 Assessment Completed",
                        "weight": "Bolder",
                        "size": "Medium",
                        "color": "Good"
                    },
                    {
                        "type": "FactSet",
                        "facts": [
                            {"title": "Applicant", "value": applicant_name},
                            {"title": "Email", "value": applicant_email},
                            {"title": "Position", "value": position},
                            {"title": "Completed", "value": completed_str},
                            {"title": "Status", "value": "Ready for HR review"},
                        ]
                    }
                ],
                "actions": [{
                    "type": "Action.OpenUrl",
                    "title": "Review in AutoIntel",
                    "url": f"{APP_URL}/admin"
                }]
            }
        }]
    }
    return _post_to_teams(url, payload)
