# Google Calendar Integration Plan

## Overview
Integrate Google Calendar API into the InterviewScheduling component to automatically create calendar events when scheduling interviews, and send email notifications to applicants.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           System Architecture                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐     │
│  │  React Frontend  │───▶│  Flask Backend   │───▶│ Google Calendar │     │
│  │  InterviewModal  │    │  /api/calendar   │    │     API         │     │
│  └──────────────────┘    └──────────────────┘    └──────────────────┘     │
│           │                      │                                        │
│           │                      ▼                                        │
│           │              ┌──────────────────┐                              │
│           └─────────────▶│  email_service   │                              │
│                          │     .py          │                              │
│                          └──────────────────┘                              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Data Flow

1. User fills interview scheduling modal in React
2. User clicks "Schedule Interview"
3. React calls Flask API endpoint `/api/calendar/create-event`
4. Flask API:
   - Authenticates using Google Service Account
   - Creates event in Google Calendar
   - Sends email notification to applicant
5. Returns success/error to React

## Implementation Steps

### Step 1: Environment Variables (.env)
Add Service Account credentials to `.env`:
```
GOOGLE_SERVICE_ACCOUNT_EMAIL=your-service-account@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="your-private-key"
GOOGLE_CALENDAR_ID=primary
```

### Step 2: Python Dependencies
Add to `requirements.txt`:
```
google-api-python-client
google-auth
```

### Step 3: Create calendar_service.py
- Google Calendar API authentication using Service Account
- Function to create calendar events
- Function to add video conference (Google Meet)
- Function to add attendees

### Step 4: Create Flask API Endpoint
- POST `/api/calendar/create-event`
- Request body: applicant info, date/time, job title, meeting link
- Calls calendar_service to create event
- Calls email_service to send notification

### Step 5: Update email_service.py
Add new function: `send_interview_notification()`
- Sends HTML email to applicant
- Includes interview details, date/time, meeting link/location

### Step 6: Update InterviewScheduling.tsx
- Add loading state during API call
- Call Flask API on form submission
- Show success/error feedback to user

## Google Calendar Event JSON Structure

```json
{
  "summary": "Interview: Applicant Name - Job Title",
  "description": "Interview details with notes",
  "start": {
    "dateTime": "2026-03-25T10:00:00",
    "timeZone": "Asia/Manila"
  },
  "end": {
    "dateTime": "2026-03-25T11:00:00",
    "timeZone": "Asia/Manila"
  },
  "attendees": [
    { "email": "applicant@email.com" },
    { "email": "interviewer@company.com" }
  ],
  "conferenceData": {
    "createRequest": {
      "requestId": "unique-request-id",
      "conferenceSolutionKey": { "type": "hangoutsMeet" }
    }
  },
  "reminders": {
    "useDefault": false,
    "overrides": [
      { "method": "email", "minutes": 1440 },
      { "method": "popup", "minutes": 30 }
    ]
  }
}
```

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `.env` | Modify | Add Google Service Account credentials |
| `requirements.txt` | Modify | Add google-api-python-client |
| `calendar_service.py` | Create | Google Calendar API integration |
| `scoring_api.py` | Modify | Add `/api/calendar/create-event` endpoint |
| `email_service.py` | Modify | Add `send_interview_notification()` function |
| `src/components/InterviewScheduling.tsx` | Modify | Connect to Flask API |

## Error Handling

- Invalid date/time format
- Calendar API authentication failure
- Email sending failure
- Network/API timeout

## Success Metrics

- Calendar event created successfully
- Email notification delivered
- User sees confirmation in React UI