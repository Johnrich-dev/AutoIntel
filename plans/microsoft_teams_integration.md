# Microsoft Teams Integration Setup Guide

This guide explains how to set up Microsoft Azure credentials for the AutoIntel recruitment system to create Microsoft Teams meeting links for interviews.

## Overview

The system now:
1. Creates Microsoft Teams meeting links via Microsoft Graph API
2. Creates Google Calendar events with attendees (for Gmail Event Card)
3. Sends professional HTML emails with meeting details

## Required Environment Variables

Add these to your `.env` file:

```env
# Azure AD Configuration
AZURE_CLIENT_ID=your-application-client-id
AZURE_CLIENT_SECRET=your-client-secret-value
AZURE_TENANT_ID=your-directory-tenant-id

# Optional: Specific user mailbox to schedule from
AZURE_USER_EMAIL=admin@yourcompany.com

# Google Calendar (already configured)
GOOGLE_SERVICE_ACCOUNT_EMAIL=your-service-account@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GOOGLE_PROJECT_ID=your-project-id
GOOGLE_PRIVATE_KEY_ID=your-private-key-id
GOOGLE_TOKEN_URI=https://oauth2.googleapis.com/token
GOOGLE_AUTH_URI=https://accounts.google.com/o/oauth2/auth
GOOGLE_CALENDAR_ID=primary
```

## Azure App Registration Steps

### 1. Create Azure App Registration

1. Go to [Azure Portal](https://portal.azure.com)
2. Navigate to **Azure Active Directory** → **App registrations**
3. Click **New registration**
4. Fill in:
   - **Name:** `AutoIntel Teams Integration`
   - **Supported account types:** Choose based on your needs (usually "Accounts in this organizational directory only")
   - **Redirect URI:** Leave blank or set to `http://localhost`

### 2. Configure API Permissions

1. In your app registration, go to **API permissions**
2. Click **Add a permission**
3. Select **Microsoft Graph**
4. Choose **Application permissions** (not Delegated)
5. Add these permissions:
   - `OnlineMeetings.ReadWrite.All` - Create Teams meetings
   - `Calendars.ReadWrite` - Read/write calendars (if needed)

### 3. Grant Admin Consent

1. After adding permissions, click **Grant admin consent** for your organization
2. This step requires Azure AD admin privileges

### 4. Generate Client Secret

1. Go to **Certificates & secrets**
2. Click **New client secret**
3. Add a description (e.g., "AutoIntel Production")
4. Copy the **Value** (not the Secret ID) - this is your `AZURE_CLIENT_SECRET`

### 5. Collect Required Values

From the app registration **Overview** page, copy:
- **Application (client) ID** → `AZURE_CLIENT_ID`
- **Directory (tenant) ID** → `AZURE_TENANT_ID`

## Files Created

| File | Purpose |
|------|---------|
| `teams_meeting_service.py` | Microsoft Graph API integration for Teams meeting creation |
| `ics_calendar_service.py` | ICS calendar file generation for email attachments |
| `calendar_service.py` | Updated to include attendees for Gmail Event Card |
| `email_service.py` | Enhanced professional HTML email template |
| `scoring_api.py` | Updated to integrate Teams meeting creation |

## How It Works

### Flow for Online Interviews:

```
1. Frontend calls /api/schedule-interview
   ↓
2. scoring_api.py receives request
   ↓
3. If online interview and no meeting link provided:
   → Call teams_meeting_service.create_interview_teams_meeting()
   → Gets Microsoft Teams join URL
   ↓
4. Call calendar_service.create_interview_event() with:
   → Teams meeting link as meeting_link
   → Applicants and interviewers as attendees
   → sendUpdates="all" (Gmail will show Event Card)
   ↓
5. Send email via email_service with:
   → Professional HTML template
   → Teams meeting button/link
   → Calendar invite (ICS attachment)
```

### Flow for In-Person Interviews:

```
1. Frontend calls /api/schedule-interview
   ↓
2. scoring_api.py receives request
   ↓
3. Skip Teams meeting creation (location-based)
   ↓
4. Call calendar_service.create_interview_event() with:
   → Physical location
   → Applicants and interviewers as attendees
   ↓
5. Send email with location details
```

## Testing

### Test Teams Meeting Service

```bash
python teams_meeting_service.py
```

This will check if your Azure credentials are configured properly.

### Test ICS Calendar Generation

```bash
python ics_calendar_service.py
```

This will generate a sample ICS file.

### Test Full Integration

1. Start the Flask server:
   ```bash
   python scoring_api.py
   ```

2. Schedule an interview from the frontend

3. Check logs for:
   - `Teams meeting created: https://teams.microsoft.com/...`
   - `Calendar event created: ...`
   - `Email sent successfully to ...`

## Troubleshooting

### "Teams meeting creation failed"

**Cause:** Azure credentials not configured or missing permissions

**Solution:**
1. Check `.env` has all three Azure variables
2. Ensure `OnlineMeetings.ReadWrite.All` permission is granted
3. Verify admin consent was granted

### Gmail not showing Event Card

**Cause:** Calendar event missing attendees or wrong format

**Solution:**
1. Verify Google Calendar API is working
2. Check that attendees array is properly formatted
3. Ensure `sendUpdates="all"` is set

### Email not professional looking

**Cause:** HTML rendering issues

**Solution:**
1. Check email client supports HTML
2. Test with different email providers (Gmail, Outlook, etc.)

## Security Notes

- Never commit `.env` file to version control
- Rotate client secrets periodically
- Use least privilege for Azure permissions
- Monitor Azure AD sign-in logs for unusual activity

## Optional: Enable Domain-Wide Delegation

If you want the service account to impersonate users:

1. Go to Google Cloud Console → IAM & Admin → Service Accounts
2. Find your service account
3. Click "Manage Domain-Wide Delegation"
4. Add the following scopes:
   - `https://www.googleapis.com/auth/calendar`
   - `https://www.googleapis.com/auth/calendar.events`

This is optional and only needed if you want the service account to act on behalf of other users.