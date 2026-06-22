# AutoIntel Recruitment System — User Manual

**Version:** 1.0 (Thesis Build)
**Last Updated:** June 2026

---

## Table of Contents

1. [Introduction](#1-introduction)
   - 1.1 [Overview of the Software](#11-overview-of-the-software)
   - 1.2 [Purpose of This Manual](#12-purpose-of-this-manual)

2. [Installation Guide](#2-installation-guide)
   - 2.1 [System Requirements](#21-system-requirements)
   - 2.2 [Step-by-Step Installation Instructions](#22-step-by-step-installation-instructions)
     - 2.2.1 [Supabase Setup](#221-supabase-setup)
     - 2.2.2 [AWS Amplify Setup (Frontend)](#222-aws-amplify-setup-frontend)
     - 2.2.3 [AWS EC2 Setup (Backend Models)](#223-aws-ec2-setup-backend-models)

3. [Getting Started](#3-getting-started)
   - 3.1 [Initial Setup and Configuration](#31-initial-setup-and-configuration)
   - 3.2 [Basic Navigation](#32-basic-navigation)

4. [Features and Functionality](#4-features-and-functionality)
   - 4.1 [Applicant Portal](#41-applicant-portal)
   - 4.2 [Admin and HR Dashboard](#42-admin-and-hr-dashboard)
   - 4.3 [Scoring System](#43-scoring-system)
   - 4.4 [AI and ML Models](#44-ai-and-ml-models)
   - 4.5 [System Settings](#45-system-settings)

5. [Troubleshooting](#5-troubleshooting)
   - 5.1 [Common Issues and Solutions](#51-common-issues-and-solutions)
   - 5.2 [FAQs](#52-faqs)

---

---

## 1. Introduction

### 1.1 Overview of the Software

**AutoIntel** is an AI-powered recruitment automation platform built to reduce the manual effort involved in the hiring process. It automates the most time-consuming stages of recruitment — from reading resumes, scoring candidates, and sending notifications, all the way to managing a full pipeline and making final hiring decisions.

The system handles everything from the moment a candidate sends their resume by email, through automated AI scoring, applicant assessments, and HR review, up to the final hire or reject decision.

**Key capabilities at a glance:**

- Automatically collects resumes from a company Gmail inbox via IMAP
- Parses resumes using GPT (text cleaning) and BERT (named entity recognition)
- Scores resumes with a hybrid AI model combining semantic matching and count-based analysis
- Sends applicants email notifications with detailed score breakdowns
- Provides a secure token-based applicant portal for video and personality assessments
- Transcribes video responses automatically using Whisper AI
- Gives HR and Admin users a full pipeline dashboard to manage every stage of recruitment
- Supports configurable scoring weights, decision thresholds, and system preferences
- Supports 6 languages: English, Spanish, French, German, Japanese, and Chinese (Simplified)
- Light and Dark theme support

**Technology Stack:**

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript, Tailwind CSS, Vite |
| Backend | Python 3, Flask API |
| Database | Supabase (PostgreSQL + Auth + Storage) |
| AI Models | GPT-4o-mini, BERT NER, all-MiniLM-L6-v2, Whisper |
| Hosting | AWS Amplify (frontend), AWS EC2 (backend) |
| Email | Gmail IMAP (collection), SMTP (sending) |

> 📸 **[SCREENSHOT: The AutoIntel landing page / RoleSelection screen showing the three role options — Applicant, HR Manager, Admin]**

---

### 1.2 Purpose of This Manual

This manual is intended for all users of the AutoIntel Recruitment System:

- **Applicants** — who need to understand how to submit their resume, log in, and complete their assessments
- **HR Managers** — who need to review candidates, manage the pipeline, and schedule interviews
- **Admins** — who need to configure the system, manage job postings, adjust scoring settings, and manage users
- **System Administrators / Developers** — who need to install, configure, and deploy the system

This manual covers installation from scratch, initial configuration (including Supabase, AWS Amplify, and AWS EC2), all user-facing features with step-by-step instructions, and a troubleshooting section for common issues.

---

## 2. Installation Guide

### 2.1 System Requirements

#### Frontend (End User Browser)

| Requirement | Minimum |
|---|---|
| Browser | Chrome 90+, Firefox 88+, Edge 90+, Safari 14+ |
| JavaScript | Must be enabled |
| Screen Resolution | 1024 × 768 (responsive — works on mobile too) |
| Internet | Required (connects to Supabase and the backend API) |

#### Backend Server (EC2 or Local Machine)

| Requirement | Minimum / Recommended |
|---|---|
| Operating System | Ubuntu 22.04 LTS (recommended) or Windows 10+ |
| Python | 3.9 or later |
| RAM | 8 GB minimum (for ML model loading) |
| Storage | 30 GB+ SSD (OS + Python packages + ~2 GB ML model cache) |
| FFmpeg | Must be installed (required for video transcription) |
| Internet | Required (OpenAI API, Supabase, Gmail) |

#### External Services Required

| Service | Purpose |
|---|---|
| **Supabase** | PostgreSQL database, authentication, Row Level Security, and file storage |
| **OpenAI** | GPT-4o-mini for resume cleaning and essay scoring; Whisper for transcription |
| **Gmail** | IMAP for collecting applicant emails; SMTP for sending notification emails |
| **AWS Amplify** | Hosting and CI/CD deployment of the React frontend |
| **AWS EC2** | Running the Flask API server and backend ML models |
| **Google Calendar API** | Interview scheduling integration *(optional)* |
| **Microsoft Teams** | Webhook notifications for new applicants *(optional)* |

---

### 2.2 Step-by-Step Installation Instructions

---

#### 2.2.1 Supabase Setup

Supabase is the database, authentication, and file storage provider for AutoIntel. All applicant data, scores, settings, and uploaded files are stored here.

**Step 1 — Create a Supabase Project**

1. Go to [https://supabase.com](https://supabase.com) and sign in or create a free account.
2. Click **New Project**.
3. Fill in:
   - **Project Name:** e.g., `autointel-recruitment`
   - **Database Password:** choose a strong password and save it securely
   - **Region:** choose the region closest to your users
4. Click **Create New Project** and wait approximately 1 minute for provisioning.

> 📸 **[SCREENSHOT: Supabase dashboard showing the "New Project" creation form with the project name, password, and region fields filled in]**

---

**Step 2 — Retrieve Your API Keys**

1. In your Supabase project dashboard, go to **Project Settings → API**.
2. Copy and save the following values — you will need them later:
   - **Project URL** → used as `VITE_SUPABASE_URL` (frontend) and `SUPABASE_URL` (backend)
   - **anon / public key** → used as `VITE_SUPABASE_ANON_KEY` (frontend only — safe to expose)
   - **service_role / secret key** → used as `SUPABASE_SERVICE_KEY` (backend only — **never expose to the frontend**)

> 📸 **[SCREENSHOT: Supabase Project Settings → API page showing the "Project URL" field, the "anon public" key section, and the "service_role" key section]**

> ⚠️ **Security Warning:** The `service_role` key bypasses all Row Level Security policies and grants unrestricted database access. It must only ever be placed in the backend `.env` file on the server. Never add it to any `VITE_` frontend variable.

---

**Step 3 — Apply the Database Schema**

1. In the Supabase dashboard, click **SQL Editor** in the left sidebar.
2. Open the file `supabase/updated_final_sql_schema.sql` from the project folder.
3. Copy the entire contents and paste them into the SQL Editor.
4. Click **Run** (or press `Ctrl+Enter`).
5. This creates all required tables:

| Table | Description |
|---|---|
| `applicants` | Central table — all applicant data, scores, and pipeline status |
| `job_postings` | Job openings with requirements used for AI scoring |
| `scoring_settings` | Configurable weights, baselines, and decision thresholds |
| `video_assessments` | Video submissions, Whisper transcriptions, and video scores |
| `work_style_assessments` | Personality test answers, dimension scores, and essay insights |
| `admin_users` | Admin and HR user accounts, roles, and personal settings |
| `resumes` | Detailed resume processing records (NER results, GPT-cleaned text) |
| `scheduled_interviews` | Interview scheduling records |
| `hr_managers` | HR manager profiles for interview assignment |
| `resume_scores` | Detailed score breakdown per applicant per job |
| `admin_actions` | Audit log of admin actions |

> 📸 **[SCREENSHOT: Supabase SQL Editor with the schema SQL pasted in and the "Run" button visible, before execution]**

> 📸 **[SCREENSHOT: Supabase Table Editor showing the list of created tables (applicants, job_postings, scoring_settings, etc.) in the left panel after the schema is applied]**

---

**Step 4 — Configure Supabase Storage Buckets**

AutoIntel stores uploaded files (resumes, videos, profile photos) in Supabase Storage.

1. In the Supabase dashboard, go to **Storage** in the left sidebar.
2. Click **New bucket** and create the following three buckets:

| Bucket Name | Visibility | Purpose |
|---|---|---|
| `resumes` | Public | Uploaded resume PDF and DOCX files |
| `videos` | Public | Video assessment recordings |
| `photos` | Public | Applicant profile photos |

3. For each bucket, set the visibility to **Public** so the frontend can display files.

> 📸 **[SCREENSHOT: Supabase Storage page showing the three buckets — resumes, videos, and photos — listed with their public status]**

---

**Step 5 — Create the First Admin User**

Admin accounts cannot be self-registered. The first admin user must be created via the provided script.

1. Open a terminal in the project root.
2. Run:
   ```bash
   cd backend
   python scripts/create_admin_user.py
   ```
3. Follow the prompts to enter the admin's email, name, and password.

> 📸 **[SCREENSHOT: Terminal window showing the create_admin_user.py script running with prompts for email, name, and password]**

---

#### 2.2.2 AWS Amplify Setup (Frontend)

AWS Amplify hosts and deploys the React frontend. It connects to your Git repository, builds automatically on every push, and serves the app globally.

**Step 1 — Push the Project to a Git Repository**

Ensure your project code is pushed to a GitHub, GitLab, or Bitbucket repository before proceeding.

> 📸 **[SCREENSHOT: A GitHub repository page for the AutoIntel project showing the file tree and the latest commit message]**

---

**Step 2 — Create a New App in AWS Amplify**

1. Sign in to the [AWS Management Console](https://aws.amazon.com/console/).
2. Search for and open **AWS Amplify**.
3. Click **Create new app** → **Host web app**.
4. Select your Git provider (e.g., GitHub) and click **Continue**.
5. Authorize AWS Amplify to access your repositories.
6. Select the repository and the branch to deploy (e.g., `main`).
7. Click **Next**.

> 📸 **[SCREENSHOT: AWS Amplify "Host web app" screen showing the Git provider selection (GitHub highlighted) with the Connect button]**

> 📸 **[SCREENSHOT: AWS Amplify repository and branch selection screen showing the project repo selected with the "main" branch]**

---

**Step 3 — Configure the Build Settings**

Amplify auto-detects the Vite/React project. Verify or manually set the build configuration as follows:

```yaml
version: 1
frontend:
  phases:
    preBuild:
      commands:
        - npm install
    build:
      commands:
        - npm run build
  artifacts:
    baseDirectory: dist
    files:
      - '**/*'
  cache:
    paths:
      - node_modules/**/*
```

> 📸 **[SCREENSHOT: AWS Amplify Build Settings screen showing the build configuration YAML above entered in the editor]**

---

**Step 4 — Add Frontend Environment Variables**

1. In Amplify, before saving, go to the **Advanced settings** section on the build configuration page, or go to **App settings → Environment variables** after creation.
2. Add the following four variables:

| Variable | Value |
|---|---|
| `VITE_API_URL` | Your EC2 public URL (e.g., `http://your-ec2-ip:5000`) |
| `VITE_APP_URL` | Your Amplify app URL (e.g., `https://main.xxxxx.amplifyapp.com`) |
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Your Supabase anon/public key |

> 📸 **[SCREENSHOT: AWS Amplify Environment Variables settings page showing the four VITE_ variables added with their values filled in]**

---

**Step 5 — Deploy**

1. Click **Save and deploy**.
2. Amplify will install dependencies, build the React app, and deploy. This takes approximately 2–5 minutes.
3. Once complete, Amplify provides a live URL: `https://main.xxxxx.amplifyapp.com`.
4. Optionally, go to **App settings → Domain management** to connect a custom domain.

> 📸 **[SCREENSHOT: AWS Amplify deployment pipeline showing all steps (Provision → Build → Deploy) with green checkmarks and the live URL displayed at the top]**

---

#### 2.2.3 AWS EC2 Setup (Backend Models)

The Flask backend API — which runs the AI/ML models — must be hosted on a server. AWS EC2 is used for this because the ML models require server-side Python execution and significant memory. This is separate from the frontend hosting on Amplify.

**Recommended EC2 Configuration**

| Setting | Recommended |
|---|---|
| Instance Type | `t3.large` (2 vCPU, 8 GB RAM) minimum; `t3.xlarge` for faster model loading |
| AMI (OS Image) | Ubuntu 22.04 LTS |
| Storage | 30 GB SSD (gp3) |
| Security Group — Inbound | Port `5000` from Amplify app IP or `0.0.0.0/0`; Port `22` for SSH |

> 📸 **[SCREENSHOT: AWS EC2 "Launch Instance" page showing the instance name, Ubuntu 22.04 AMI selected, t3.large instance type, and the 30 GB storage configuration]**

> 📸 **[SCREENSHOT: AWS EC2 Security Group inbound rules showing port 5000 and port 22 open]**

---

**Step 1 — Connect to the EC2 Instance via SSH**

```bash
ssh -i your-key.pem ubuntu@your-ec2-public-ip
```

> 📸 **[SCREENSHOT: Terminal window showing a successful SSH connection to the EC2 instance with the Ubuntu welcome message]**

---

**Step 2 — Install System Dependencies**

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y python3 python3-pip ffmpeg git
```

Verify FFmpeg is installed (required for Whisper video transcription):

```bash
ffmpeg -version
```

> 📸 **[SCREENSHOT: Terminal showing the output of `ffmpeg -version` confirming a successful installation with the version number]**

---

**Step 3 — Clone the Project and Install Python Packages**

```bash
git clone https://github.com/your-repo/autointel.git
cd autointel/backend
pip install -r requirements.txt
```

> Note: On first install, the `sentence-transformers` package will download the `all-MiniLM-L6-v2` model (~80 MB) automatically. This may take a few minutes.

> 📸 **[SCREENSHOT: Terminal showing `pip install -r requirements.txt` running with packages being installed, including sentence-transformers]**

---

**Step 4 — Create the Backend `.env` File**

Navigate to the `backend/` directory and create a `.env` file with all required secrets:

```bash
nano .env
```

Fill in all required variables. The table below lists every variable:

| Variable | Description | Required |
|---|---|---|
| `SUPABASE_URL` | Supabase project URL | ✅ Yes |
| `SUPABASE_SERVICE_KEY` | Supabase service role key (bypasses RLS) | ✅ Yes |
| `OPENAI_API_KEY` | OpenAI API key (GPT + Whisper) | ✅ Yes |
| `GPT_MODEL` | GPT model name (default: `gpt-4o-mini`) | No |
| `GMAIL_EMAIL` | Gmail address for IMAP resume collection | ✅ Yes |
| `GMAIL_APP_PASSWORD` | Gmail App Password (requires 2FA on the Gmail account) | ✅ Yes |
| `GMAIL_SEARCH_SUBJECTS` | Comma-separated subject keywords (default: `Applicant,Resume,Application`) | No |
| `SMTP_HOST` | SMTP server (default: `smtp.gmail.com`) | ✅ Yes |
| `SMTP_PORT` | SMTP port (default: `587`) | ✅ Yes |
| `SMTP_USER` | SMTP username (same as `GMAIL_EMAIL`) | ✅ Yes |
| `SMTP_PASSWORD` | SMTP password (same as `GMAIL_APP_PASSWORD`) | ✅ Yes |
| `FROM_EMAIL` | Sender email address shown to applicants | ✅ Yes |
| `FROM_NAME` | Sender display name (e.g., `HR Team`) | ✅ Yes |
| `APP_URL` | Frontend URL — used in email login links | ✅ Yes |
| `TOKEN_EXPIRY_HOURS` | Hours before applicant tokens expire (default: `24`) | No |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Google service account email for Calendar API | Optional |
| `GOOGLE_PRIVATE_KEY` | Google service account private key | Optional |
| `GOOGLE_CALENDAR_ID` | Calendar ID (default: `primary`) | Optional |
| `FFMPEG_PATH` | Full path to FFmpeg if not in system PATH | No |
| `API_HOST` | Flask bind host (default: `0.0.0.0`) | No |
| `API_PORT` | Flask port (default: `5000`) | No |
| `MODEL_DEVICE` | `cpu` or `cuda` (default: `cpu`) | No |
| `TEAMS_WEBHOOK_URL` | Microsoft Teams webhook URL | Optional |

> 📸 **[SCREENSHOT: Terminal showing the `.env` file open in the nano editor with variable names visible and values partially masked]**

---

**Step 5 — Start the Flask API Server**

```bash
# Option A: Simple start for testing
python scoring_api.py

# Option B: Production start with Gunicorn (recommended)
pip install gunicorn
gunicorn -w 2 -b 0.0.0.0:5000 scoring_api:app
```

To keep the server running after disconnecting from SSH, use `screen`:

```bash
screen -S autointel
python scoring_api.py
# Press Ctrl+A then D to detach from screen
```

> 📸 **[SCREENSHOT: Terminal showing the Flask server successfully started with the message "Running on http://0.0.0.0:5000" and "Press CTRL+C to quit"]**

---

**Step 6 — Update VITE_API_URL in AWS Amplify**

Once the EC2 server is running, return to **AWS Amplify → App settings → Environment variables** and update `VITE_API_URL` to point to your EC2 server:

```
http://your-ec2-public-ip:5000
```

Trigger a new deployment in Amplify so the frontend picks up the updated URL.

> 📸 **[SCREENSHOT: AWS Amplify Environment Variables page showing the VITE_API_URL updated to the EC2 server address, and a new deployment triggered]**

---

## 3. Getting Started

### 3.1 Initial Setup and Configuration

Before the system is ready to process applicants, complete these one-time setup steps after installation.

**1. Import Job Postings**

At least one active job posting must exist for resume scoring to work correctly. You can:

- Create job postings manually in the Admin Dashboard (see Section 4.2.2)
- Or bulk-import from the dataset file using the import script:
  ```bash
  cd backend
  python scripts/import_enriched_jobs.py
  ```
  This imports jobs from `data/job_postings_dataset.json`.

> 📸 **[SCREENSHOT: Terminal showing import_enriched_jobs.py running with output lines showing jobs being imported]**

---

**2. Configure Scoring Settings**

The default scoring weights and thresholds are already set in the database after schema import. However, you should review and adjust them to match your organization's priorities.

1. Log in as Admin at `/admin/login`.
2. Go to **Settings → Scoring Settings** in the sidebar.
3. Review the category weights (Skills, Experience, Education, etc.) and decision thresholds.
4. Click **Save Settings** to apply.

> 📸 **[SCREENSHOT: The AdminScoringSettings screen showing the category weight inputs and threshold fields on first load]**

---

**3. Configure Email Settings**

Ensure your `.env` file has all SMTP and Gmail variables filled in (see Section 2.2.3, Step 4). Test that email is working by manually running the resume collector with a test email in your inbox:

```bash
cd backend
python resume_collector.py
```

---

**4. Configure the App URL**

The `APP_URL` backend environment variable must match the live frontend URL. This is used to generate login links in applicant emails. For example:

```
APP_URL=https://main.xxxxx.amplifyapp.com
```

If this is set incorrectly, applicants will receive broken login links in their emails.

> 📸 **[SCREENSHOT: The `.env` file showing the APP_URL variable set to the correct Amplify domain]**

---

**Pre-Deployment Checklist**

Before going live, verify all of the following:

- [ ] `VITE_API_URL` points to the EC2 server URL, not `localhost`
- [ ] `VITE_APP_URL` matches the Amplify domain
- [ ] `APP_URL` in the backend `.env` matches the Amplify domain (used in email links)
- [ ] `SUPABASE_SERVICE_KEY` is in the backend `.env` only — never in a `VITE_` variable
- [ ] FFmpeg is installed on EC2 (`ffmpeg -version` confirms)
- [ ] Gmail 2FA is enabled and an App Password has been created
- [ ] Supabase schema SQL has been applied
- [ ] Storage buckets (`resumes`, `videos`, `photos`) are created in Supabase
- [ ] At least one admin user has been created
- [ ] At least one active job posting exists

---

### 3.2 Basic Navigation

#### User Roles and Login Paths

AutoIntel has three types of users, each with a different access path:

| Role | Login URL | Access |
|---|---|---|
| **Applicant** | `/applicant/login` | Own assessment portal only |
| **HR Manager** | `/hr/login` | Full pipeline dashboard |
| **Admin** | `/admin/login` | Full dashboard + system configuration |

When you first open the app, the **Role Selection** screen lets you choose which portal to enter.

> 📸 **[SCREENSHOT: The RoleSelection screen showing the three role cards — Applicant, HR Manager, and Admin — with their icons and brief descriptions]**

---

#### Admin and HR Sidebar Navigation

After logging in as Admin or HR, the sidebar contains all navigation items:

| Sidebar Item | Purpose |
|---|---|
| **Dashboard** | Pipeline overview and summary stats |
| **Jobs** | Create and manage job postings |
| **All Applicants** | View every application with filters and search |
| **Screening Results** | Applicants who passed automated scoring |
| **Needs Review** | Borderline applicants requiring manual HR review |
| **Shortlisted** | Candidates approved for the interview stage |
| **Interviews** | Schedule and manage interviews |
| **Final Decisions** | Make hire or reject decisions |
| **Reports** | Pipeline analytics and metrics |
| **Scoring Settings** | Configure AI scoring weights and thresholds |
| **Settings** | Personal preferences (theme, language, notifications, security) |

> 📸 **[SCREENSHOT: The AdminDashboard with the left sidebar fully visible, showing all navigation items listed above with their icons]**

---

#### Applicant Portal Navigation

Applicants follow a linear flow — each step unlocks after the previous one is completed:

```
Login with Token
      ↓
Accept Rules & Terms
      ↓
Assessment Dashboard (upload profile photo)
      ↓
Video Assessment
      ↓
Work Style Personality Test
      ↓
Completion Screen
```

> 📸 **[SCREENSHOT: The AssessmentDashboard showing the two assessment cards (Video Assessment and Work Style Test) with step numbers and status badges]**

---

## 4. Features and Functionality

---

### 4.1 Applicant Portal

The Applicant Portal is the interface that job applicants use after passing the automated resume screening. Access is granted via a unique token sent to their email.

---

#### 4.1.1 Submitting an Application

Applicants apply by sending an email to the company's recruitment inbox — no web form is required.

**How to submit:**
1. Compose an email to the company's recruitment email address.
2. Set the subject line to include one of these keywords: `Applicant`, `Application`, or `Resume`.
   - Recommended format: `Applicant - [Job Title]`
   - Example: `Applicant - Software Engineer`
3. Attach your resume as a **PDF** or **DOCX** file.
4. Send the email.

The system automatically polls the inbox, downloads the resume, and begins processing. No further action is needed from the applicant at this stage.

> 📸 **[SCREENSHOT: An email compose window (e.g., Gmail) showing the subject "Applicant - Software Engineer", a PDF resume attached, and the recipient email filled in]**

> **Tip:** Use a text-based PDF (not a scanned image). Scanned PDFs cannot be parsed reliably by the system.

---

**What happens automatically after you send:**

1. The system downloads your resume and checks for duplicate applications.
2. Your resume is parsed — text is extracted, cleaned with GPT, and organized into sections (Experience, Education, Skills, Projects, Certifications, Achievements).
3. An AI scoring engine evaluates your resume against the job requirements.
4. An email is sent to you with the result (see below).

---

#### 4.1.2 Receiving Your Screening Email

Depending on your screening score, you will receive one of three emails:

**Passed Screening**
- Congratulations message
- Your unique **access token** (login key)
- A direct **login link**: `[App URL]/applicant/login?token=XXXX`
- Full **score breakdown** showing your performance across 6 categories
- Instructions for completing the next assessments
- ⚠️ Token expires in **24 hours** — complete your assessments promptly

> 📸 **[SCREENSHOT: Sample "passed screening" email showing the score breakdown table with 6 category scores, the login link button, and the token expiry warning]**

**Under Review**
- Your application is being manually reviewed by HR
- No score details are shared
- You will be contacted when a decision is made

**Not Qualified**
- A professional regret message
- Encouragement to apply for future positions
- No score details are shared

---

#### 4.1.3 Logging In

1. Open the login link from your email, or navigate to `/applicant/login`.
2. If you clicked the link, your token is automatically filled in.
3. If entering manually, paste your token into the **Access Token** field.
4. Click **Login**.

> 📸 **[SCREENSHOT: The ApplicantLogin screen showing the access token input field with a token pasted in, and the Login button below it]**

If your token is expired or invalid, an error message will appear. Contact HR to request a new token.

---

#### 4.1.4 Accepting Rules and Terms

The first time you log in, the Terms and Conditions screen is displayed.

1. Read through the terms carefully (scroll to see all content).
2. Click **I Accept** at the bottom to proceed.

You cannot access the assessments until you accept. This screen will not appear again for the same token session.

> 📸 **[SCREENSHOT: The RulesAndTerms screen showing scrollable terms text with the "I Accept" button visible at the bottom after scrolling]**

---

#### 4.1.5 Assessment Dashboard

After accepting the terms, the Assessment Dashboard is your main hub.

**What is shown:**
- Your name and the position you applied for
- Profile photo upload section
- Status cards for: **Video Assessment** and **Work Style Test**
- Progress indicators (Not Started / In Progress / Completed)

**Uploading your profile photo (required):**
1. Click the photo upload area or the camera icon.
2. Select an image file from your device (JPG, PNG).
3. Your photo uploads automatically.
4. Once uploaded, the assessment cards become active.

> ⚠️ You must upload a profile photo before you can start any assessment.

> 📸 **[SCREENSHOT: The AssessmentDashboard showing the profile photo upload circle, the "Upload Photo" prompt, and the two locked assessment cards below it]**

> 📸 **[SCREENSHOT: The AssessmentDashboard after photo upload — photo is shown, and both assessment cards are now active/clickable]**

---

#### 4.1.6 Video Assessment

The Video Assessment captures your spoken response to an on-screen prompt.

**Before recording:**
- Ensure your camera and microphone are connected and your browser has permission to access them.
- Find a quiet, well-lit location.
- Prepare a response of **2 to 5 minutes** in length.

**Steps:**
1. Click **Video Assessment** from the dashboard.
2. Read the prompt question shown on screen.
3. Choose your recording method:
   - **Record in browser** — click **Start Recording** to use your device camera directly
   - **Upload a file** — click **Upload Video** if you have a pre-recorded video
4. After recording, review your video in the playback preview.
5. If satisfied, click **Submit**.
6. The system validates the duration (must be between 2 and 5 minutes).

> 📸 **[SCREENSHOT: The VideoAssessment screen showing the camera live preview, the prompt question at the top, and the "Start Recording" button]**

> 📸 **[SCREENSHOT: The VideoAssessment screen after recording stops — showing the recorded video preview player and the "Submit" and "Re-record" buttons]**

**After submission:**
- Your video is securely uploaded to storage.
- Whisper AI automatically transcribes your response in the background.
- You do not need to wait — you can proceed to the next assessment.
- HR will be able to view both your video and the transcript.

> **Note:** Once submitted, you cannot re-record or re-submit the video assessment.

---

#### 4.1.7 Work Style Personality Test

The Work Style Test evaluates your personality and work habits through 20 rating questions and one essay.

**The 20 Likert Questions:**
- Rate each statement from **1 (Strongly Disagree)** to **5 (Strongly Agree)**
- Questions cover 15 work style dimensions:

| Dimension | Dimension |
|---|---|
| Conscientiousness | Problem Solving |
| Teamwork | Initiative |
| Adaptability | Attention to Detail |
| Communication | Stress Management |
| Leadership | Creativity |
| Reliability | Empathy |
| Time Management | Learning Agility |
| Integrity | — |

**The Essay Question:**
- One open-ended question asking you to describe your work style or professional approach.
- Write a thoughtful, honest response — it is evaluated by GPT for communication quality and self-awareness.

**Steps:**
1. Click **Work Style Test** from the dashboard.
2. Answer all 20 questions by selecting a rating (1–5) for each.
3. Write your essay response in the text area.
4. Click **Submit**.

> 📸 **[SCREENSHOT: The PersonalityTest screen showing a Likert question with the 1–5 rating buttons, the question number indicator (e.g., "Question 7 of 20"), and the progress bar]**

> 📸 **[SCREENSHOT: The PersonalityTest essay section with the question prompt and the text area for typing a response, and the Submit button below]**

> **Note:** Once submitted, the work style test cannot be retaken.

---

#### 4.1.8 Completion

Once both assessments are submitted, a completion screen confirms everything is done.

- No further action is required.
- HR will review your results and contact you about next steps.

> 📸 **[SCREENSHOT: The assessment completion screen showing both assessments (Video Assessment and Work Style Test) with green checkmarks and a "Your assessments are complete" message]**

---

### 4.2 Admin and HR Dashboard

The Admin/HR Dashboard is the central management interface for the recruitment pipeline.

---

#### 4.2.1 Logging In

1. Navigate to `/admin/login` (Admins) or `/hr/login` (HR Managers) — both login pages work identically.
2. Enter your **email address** and **password**.
3. Click **Login**.

> 📸 **[SCREENSHOT: The AdminLogin screen showing the email field, password field, and Login button, with the AutoIntel logo centered at the top]**

**First login — forced password change:**
If your account was flagged with `must_change_password`, you will be redirected to the Change Password screen before accessing the dashboard. Enter and confirm your new password, then click **Save**.

> 📸 **[SCREENSHOT: The ChangePassword screen showing the "New Password" and "Confirm Password" fields and the Save button]**

**Session behavior:**
- Sessions last 24 hours.
- If idle for longer than the configured timeout (default: 30 minutes), you will be logged out automatically.
- Mouse movement, clicks, and key presses reset the idle timer.

---

#### 4.2.2 Dashboard Landing

The Dashboard Landing is the first screen after login. It gives a live overview of the entire recruitment pipeline.

**What is shown:**
- Total applicant count
- Count of applicants at each pipeline stage (pending, passed, needs review, failed, shortlisted, hired, rejected)
- Recent applicants list with name, position, score, and status
- Quick navigation buttons to key pipeline views

> 📸 **[SCREENSHOT: The DashboardLanding screen showing the status count cards at the top, the recent applicants table below, and the sidebar navigation on the left]**

---

#### 4.2.3 Job Management

Navigate to **Jobs** in the sidebar to manage job postings.

**Creating a new job posting:**
1. Click **Add New Job**.
2. Fill in all required fields:
   - **Job Title** (e.g., Software Engineer)
   - **Department**
   - **Job Description** — full description used for semantic matching during scoring
   - **Required Skills** — type a skill and press Enter to add it as a tag; add multiple skills
   - **Required Education** — add one or more education requirements
   - **Minimum / Maximum Years of Experience**
   - **Expected Projects** — portfolio or project requirements
   - **Preferred Certifications**
   - **Role Family** — used to contextualize Work Style scoring (e.g., Technical, Managerial)
3. Click **Save**.

> 📸 **[SCREENSHOT: The Add New Job form with all fields filled in — title, department, description, and the tag input showing multiple skills added]**

**Managing existing job postings:**

| Action | How |
|---|---|
| Edit | Click the pencil/edit icon on the job row |
| Toggle Active/Inactive | Use the toggle switch to open or close a position |
| Delete | Click the delete icon — soft-deletes (data is preserved) |

> 📸 **[SCREENSHOT: The AdminJobManagement screen showing the job list table with columns for title, department, status (active/inactive toggle), and edit/delete action icons]**

---

#### 4.2.4 All Applicants List

Navigate to **All Applicants** to see every application in the system in a searchable, filterable table.

**Columns shown:** Name, Email, Position, Application Date, Screening Score, Status

**Filtering:**
- **Status filter** — show only applicants at a specific pipeline stage
- **Position filter** — show only applicants for a specific job
- **Date range filter** — narrow by application date
- **Search bar** — search by applicant name or email address

**Viewing an applicant's full profile:** Click any row to open the **Applicant Detail Modal**.

> 📸 **[SCREENSHOT: The ApplicantsList screen showing the full applicant table with the filter dropdowns and search bar at the top, and applicant rows with scores and status badges]**

---

#### 4.2.5 Screening Results

Navigate to **Screening Results** to view applicants who passed the automated scoring threshold (default: score ≥ 78).

**Available actions per applicant:**
- **Shortlist** — approve for the interview stage
- **Move to Needs Review** — send to manual HR review queue
- **Reject** — mark as failed

> 📸 **[SCREENSHOT: The ScreeningResults screen showing passed applicants with their overall scores and the Shortlist / Move to Review / Reject action buttons for each row]**

---

#### 4.2.6 Needs Review Queue

Navigate to **Needs Review** to see borderline applicants (default: score between 65 and 78). These scored too low to auto-pass but high enough that a human should evaluate them.

**Steps to review an applicant:**
1. Click an applicant's name to open the **Needs Review Detail Panel**.
2. The panel shows:
   - Full parsed resume broken into sections (Experience, Education, Skills, Projects, Certifications, Achievements)
   - Score breakdown per category with visual bars
   - HR Notes field for adding internal comments
3. Make a decision:
   - **Approve** — moves the applicant to the passed / shortlisted stage
   - **Reject** — moves the applicant to failed screening

> 📸 **[SCREENSHOT: The NeedsReview list showing applicants with borderline scores and their Review button]**

> 📸 **[SCREENSHOT: The NeedsReviewDetailPanel showing the parsed resume sections on the left, the score breakdown bars on the right, the HR Notes text area, and the Approve/Reject buttons at the bottom]**

---

#### 4.2.7 Shortlisted Candidates

Navigate to **Shortlisted** to manage candidates approved for the interview stage (status: `shortlisted`).

**Information shown per candidate:**
- Resume screening score
- Video assessment status and sub-scores (Relevance, Experience, Skills, Completeness)
- Work style test overall score and dimension areas (Strong / Moderate / Development)

**Actions:**
- **Schedule Interview** — opens the interview scheduling form
- **View Full Details** — opens the Applicant Detail Modal
- **Move Back to Review** — if reassessment is needed

> 📸 **[SCREENSHOT: The ShortlistedCandidates screen showing candidate cards or rows with resume score, video status, work style score, and the Schedule Interview button]**

---

#### 4.2.8 Interview Scheduling

Navigate to **Interviews** to schedule and manage candidate interviews.

> ⚠️ **Current Status:** The scheduling UI is fully functional in the interface. The `scheduled_interviews` database table is fully defined and ready; the live database save/load connection is pending final implementation.

**Scheduling a new interview:**
1. Click **Schedule Interview** (from the Shortlisted view or the Interviews page).
2. Fill in:
   - **Date and Time**
   - **Interview Type:** Online or In-Person
   - Online: meeting link and passcode
   - In-Person: physical location
   - **Interviewer** — select an HR manager from the dropdown
   - **Duration** and **Timezone**
   - **Additional Attendees** (optional)
   - **Applicant Instructions** (optional — sent to the applicant)
   - **Internal Notes** (visible to HR only)
3. Click **Save**.

**Calendar view:** Toggle between Day, Week, and Month views to see all scheduled interviews.

> 📸 **[SCREENSHOT: The InterviewScheduling screen showing the calendar view (week view) with interview blocks visible on different days]**

> 📸 **[SCREENSHOT: The new interview scheduling form showing the date/time picker, online/in-person type toggle, meeting link field, and interviewer dropdown]**

---

#### 4.2.9 Final Decisions

Navigate to **Final Decisions** to make hire or reject decisions for candidates who have completed the interview process.

**Making a decision:**
1. Select a candidate from the list.
2. Click **Hire** or **Reject**.
3. Optionally add **Decision Notes**.
4. Click **Confirm Decision**.

**Sending emails:**
- **Send Offer Email** — sends a congratulations email to the candidate. You can optionally attach an offer letter PDF.
- **Send Rejection Email** — sends a professional rejection email.

The system records whether emails were sent and the timestamp of each.

> 📸 **[SCREENSHOT: The FinalDecisions screen showing a candidate with the Hire and Reject decision buttons, the Notes text area, and the Send Offer Email / Send Rejection Email buttons]**

---

#### 4.2.10 Applicant Detail Modal

The Applicant Detail Modal is the central view for reviewing a single applicant. It can be opened from any pipeline stage by clicking the applicant's name or the view details icon.

The modal has five tabs:

**Overview Tab**
- Basic info: name, email, position applied for, application date
- Current pipeline status with a status-change dropdown
- Overall screening score
- Application timeline

> 📸 **[SCREENSHOT: ApplicantDetailModal — Overview tab showing the applicant info card, status badge, screening score, and the status change dropdown]**

**Resume Tab**
- Full parsed resume organized by section (Experience, Education, Skills, Projects, Certifications, Achievements)
- Raw extracted text view (toggle)
- Score breakdown per category with visual progress bars

> 📸 **[SCREENSHOT: ApplicantDetailModal — Resume tab showing the parsed resume sections in a readable format and the score breakdown bars below]**

**Video Assessment Tab**
- Embedded video player to watch the applicant's recording
- Full Whisper AI transcription text
- Video score metrics: Relevance Score, Experience Mentions, Skills Mentions, Completeness Score

> 📸 **[SCREENSHOT: ApplicantDetailModal — Video tab with the video player on the top, the transcription text area below it, and the four video score metric cards]**

**Work Style Tab**
- Score bars for all 15 personality dimensions
- Dimensions grouped into: **Strong Areas** (≥70), **Moderate Areas** (50–69), **Development Areas** (<50)
- The applicant's essay response
- GPT-generated insights from the essay
- Detected role family

> 📸 **[SCREENSHOT: ApplicantDetailModal — Work Style tab showing color-coded dimension score bars grouped by Strong/Moderate/Development, and the essay insights section below]**

**Actions Tab**
- Change applicant status
- Add or update HR notes
- Send email (pass notification, interview invite, rejection)
- Schedule interview shortcut

> 📸 **[SCREENSHOT: ApplicantDetailModal — Actions tab showing the status dropdown, HR notes text area, and the email/action buttons]**

---

#### 4.2.11 Reports and Analytics

Navigate to **Reports** to view pipeline-wide metrics calculated from live data.

**Metrics shown:**
- Average screening score (all applicants)
- Pass rate, Needs Review rate, and Fail rate (percentage breakdown)
- Average time to screen
- Score distribution histogram
- Assessment completion rate
- Average video scores and work style scores

> 📸 **[SCREENSHOT: The ReportsDashboard showing metric summary cards at the top (average score, pass rate, etc.) and a score distribution bar chart below]**

---

### 4.3 Scoring System

#### 4.3.1 How the Scoring Works

AutoIntel uses a **Hybrid Scoring** approach that evaluates each resume across two dimensions and six categories.

**The Two Scoring Methods**

| Method | Default Weight | What it Measures |
|---|---|---|
| Requirement Match Score | 60% | Semantic similarity between resume content and job requirements (using `all-MiniLM-L6-v2` sentence embeddings) |
| Count Score | 40% | Whether the applicant meets minimum quantity requirements (e.g., number of skills, years of experience) |

**The Six Categories and Their Default Weights**

| Category | Default Weight | Baseline Count |
|---|---|---|
| Skills | 30% | 10 skills |
| Experience | 28% | 2 years |
| Education | 18% | 2 degrees/credentials |
| Projects | 14% | 2 projects |
| Training / Certifications | 6% | 2 certifications |
| Achievements | 4% | 1 achievement |

**Score Calculation**

```
Category Score = (Requirement Match Score × 0.60) + (Count Score × 0.40)

Final Score = (Skills Score × 0.30)
            + (Experience Score × 0.28)
            + (Education Score × 0.18)
            + (Projects Score × 0.14)
            + (Training Score × 0.06)
            + (Achievements Score × 0.04)
```

**Decision Thresholds**

| Score | Decision | What Happens |
|---|---|---|
| ≥ 78 | **Passed Screening** | Token emailed; applicant invited to complete assessments |
| 65 – 77 | **Needs Review** | Placed in the manual HR review queue |
| < 65 | **Failed Screening** | Professional regret email sent; no token issued |

---

#### 4.3.2 Configuring Scoring Settings

Navigate to **Scoring Settings** in the sidebar to adjust the scoring configuration.

**What you can change:**
- **Category weights** — how much each category contributes to the final score. All weights must sum to 100%.
- **Baseline counts** — minimum expected quantity per category (used in the Count Score calculation).
- **Qualified threshold** — minimum score to automatically pass an applicant (default: 78).
- **Review threshold** — minimum score to place an applicant in the Needs Review queue (default: 65).
- **Requirement match weight vs. count weight** — adjust the default 60/40 split.

**Steps:**
1. Go to **Scoring Settings** in the sidebar.
2. Adjust the values as needed.
3. Click **Save Settings**.

Changes take effect immediately for all **future** screenings. Past scores are **not recalculated**.

> 📸 **[SCREENSHOT: The AdminScoringSettings page showing the category weight input fields for all 6 categories, the baseline count inputs, the qualified/review threshold sliders or number inputs, and the Save Settings button]**

---

### 4.4 AI and ML Models

AutoIntel uses four AI/ML models, each serving a distinct purpose.

| Model | Used In | Purpose |
|---|---|---|
| **GPT-4o-mini** (OpenAI) | `gpt_extractor.py`, `work_style_scorer.py` | Resume text cleaning; essay evaluation |
| **BERT NER** (Hugging Face) | `resume_parser.py` | Named entity recognition — names, companies, job titles, skills |
| **all-MiniLM-L6-v2** (Sentence Transformers) | `job_alignment.py`, `work_style_scorer.py` | Semantic text embeddings for similarity scoring |
| **Whisper** (OpenAI) | `transcription_service.py` | Speech-to-text transcription of video assessments |

**GPT-4o-mini**
- Cleans raw PDF-extracted resume text (fixes spacing artifacts, removes page numbers)
- Evaluates applicant essays for communication quality and self-awareness
- Configurable via `GPT_MODEL` environment variable

**BERT NER**
- Identifies person names, companies, job titles, and skills from resume text
- Used as enrichment — fills in gaps left by the deterministic section parser
- Requires ~10–30 seconds to warm up on first use; cached after that

**all-MiniLM-L6-v2**
- ~80 MB model, runs efficiently on CPU
- Converts text to 384-dimension embeddings; cosine similarity measures semantic closeness
- Used both for resume-to-job matching and work style answer scoring
- Downloaded automatically on first use and cached

**Whisper (whisper-small)**
- Converts speech from video recordings to text with word-level timestamps
- Requires FFmpeg to be installed for audio extraction
- Can take 5–15 minutes per video on CPU; GPU reduces this significantly

> 📸 **[SCREENSHOT: The VideoAssessmentTab in the Applicant Detail Modal showing a completed Whisper transcription displayed alongside the video player]**

---

### 4.5 System Settings

Navigate to **Settings** (your user icon or the settings option in the sidebar) to manage your personal admin preferences.

**Profile**
- Update your display name and company name.

> 📸 **[SCREENSHOT: The AdminSettings Profile section showing the Name and Company Name input fields with an Update button]**

**Appearance**
- Toggle **Light** or **Dark** theme
- Enable/disable sidebar collapsed mode
- Enable/disable compact view

> 📸 **[SCREENSHOT: The AdminSettings Appearance section showing the Light/Dark theme toggle and the sidebar/compact view checkboxes]**

**Localization**
- **Timezone** — change your local timezone (default: Asia/Manila)
- **Date Format** — choose your preferred date display (e.g., MM/DD/YYYY)
- **Language** — switch the interface language:
  - English, Spanish, French, German, Japanese, Chinese (Simplified)

> 📸 **[SCREENSHOT: The AdminSettings Localization section showing the timezone dropdown, date format dropdown, and language selector with all 6 language options visible]**

**Notifications**
- Toggle email alerts for: new applicant received, assessment completed, daily digest
- Toggle browser notifications

**Security**
- **Session Timeout** — minutes of inactivity before automatic logout (default: 30)
- **Password Expiry** — days before you must change your password (default: 90)
- **Two-Factor Authentication** toggle
- **IP Whitelist** — comma-separated list of allowed IP addresses

> 📸 **[SCREENSHOT: The AdminSettings Security section showing the session timeout input, password expiry input, 2FA toggle, and IP whitelist text field]**

**Integrations**
- **Webhook URL** — generic webhook for external tools
- **Slack Webhook** — send notifications to a Slack channel

---

## 5. Troubleshooting

### 5.1 Common Issues and Solutions

---

**Issue: Applicant did not receive a result email after applying**

| Possible Cause | Solution |
|---|---|
| The resume collection script has not been run | Run `python resume_collector.py` manually in the backend directory |
| Email subject does not contain the required keywords | Verify the subject includes "Applicant", "Application", or "Resume" (check `GMAIL_SEARCH_SUBJECTS` in `.env`) |
| SMTP credentials are incorrect | Verify `SMTP_USER`, `SMTP_PASSWORD`, `FROM_EMAIL` in `.env`; ensure Gmail 2FA is on and App Password is used |
| Gmail IMAP is not enabled | Log into Gmail, go to Settings → See all settings → Forwarding and POP/IMAP → Enable IMAP |
| Attachment was not a PDF or DOCX | The system only processes PDF and DOCX resume files |

---

**Issue: Applicant token link in the email does not work**

| Possible Cause | Solution |
|---|---|
| `APP_URL` is set to `localhost` in the backend `.env` | Update `APP_URL` to the live Amplify domain (e.g., `https://main.xxx.amplifyapp.com`) and re-run the pipeline |
| Token has expired (24 hours) | An admin must manually reset the token expiry or generate a new one via the Supabase dashboard |
| Link was cut off in the email client | Ask the applicant to manually copy the full token and paste it at `/applicant/login` |

> 📸 **[SCREENSHOT: The Supabase Table Editor showing the applicants table with the access_token and access_expires_at columns visible, to show where to manually update a token]**

---

**Issue: Applicant login shows "Invalid or expired token"**

| Possible Cause | Solution |
|---|---|
| Token is expired | Token expires 24 hours after issue — contact HR for a new one |
| Token was copied incorrectly | Ask the applicant to copy the token exactly as shown in the email (no extra spaces) |
| Applicant typed the token instead of copying | Tokens are UUIDs — they must be copied, not typed |

---

**Issue: Flask API server is not reachable from the frontend**

| Possible Cause | Solution |
|---|---|
| EC2 Security Group blocks port 5000 | Go to AWS EC2 → Security Groups → add inbound rule: Custom TCP, port 5000, source 0.0.0.0/0 |
| Flask server is not running | SSH into EC2 and run `python scoring_api.py` (or restart the screen session) |
| `VITE_API_URL` points to the wrong address | Update the environment variable in Amplify to the correct EC2 public IP, then redeploy |
| CORS error in browser console | Ensure `VITE_APP_URL` in Amplify matches the exact origin (no trailing slash) |

> 📸 **[SCREENSHOT: AWS EC2 Security Group inbound rules screen showing a rule for TCP port 5000 being added]**

---

**Issue: Work style scoring fails silently (no score saved)**

| Possible Cause | Solution |
|---|---|
| Flask API server is not running | The work style scoring requires the Flask server. Start it on EC2. |
| `VITE_API_URL` is incorrect | Verify the URL points to the running Flask server |
| `OPENAI_API_KEY` is missing or invalid | Check the key in the backend `.env`; verify it has credits at platform.openai.com |

---

**Issue: Video transcription stays "pending" and never completes**

| Possible Cause | Solution |
|---|---|
| FFmpeg is not installed on the EC2 server | Run `sudo apt install -y ffmpeg` on the EC2 instance |
| `FFMPEG_PATH` is wrong | If FFmpeg is not in system PATH, set `FFMPEG_PATH=/full/path/to/ffmpeg` in `.env` |
| `OPENAI_API_KEY` is missing | Whisper requires a valid OpenAI API key in the backend `.env` |
| Transcription is still processing | On CPU, a 3-minute video can take 5–15 minutes. Check `transcription_status` in Supabase directly. |
| Video file is too large or corrupted | Ask the applicant to re-upload; check video file in Supabase Storage |

> 📸 **[SCREENSHOT: Supabase Table Editor showing the video_assessments table with the transcription_status column, illustrating how to check the current status]**

---

**Issue: Resume was not parsed or scored (applicant shows "pending_screening" indefinitely)**

| Possible Cause | Solution |
|---|---|
| Scanned (image-based) PDF | The system cannot extract text from scanned PDFs. Ask the applicant to send a text-based PDF. |
| `OPENAI_API_KEY` is missing | GPT is used for text cleaning. Without the key, parsing may fail. |
| `SUPABASE_SERVICE_KEY` is missing or invalid | The backend needs the service role key to write to the database. Check the backend `.env`. |
| PDF is password-protected | Remove the password protection from the PDF before resubmitting |

---

**Issue: Supabase storage upload fails (resume, video, or photo)**

| Possible Cause | Solution |
|---|---|
| Storage bucket does not exist | Create the `resumes`, `videos`, and `photos` buckets in Supabase Storage |
| Bucket is set to Private | Change the bucket policy to Public in Supabase Storage settings |
| File size exceeds limits | Supabase free tier has a 50 MB file upload limit. Compress large videos before uploading. |

---

**Issue: Admin login shows an error after entering correct credentials**

| Possible Cause | Solution |
|---|---|
| Admin user does not exist | Run `python scripts/create_admin_user.py` to create the first admin |
| Password has expired | The `must_change_password` flag should redirect to the change password screen. Check the `admin_users` table in Supabase. |
| Browser localStorage is corrupted | Clear localStorage for the site: open browser DevTools → Application → Local Storage → Clear |

---

**Issue: Amplify deployment fails during build**

| Possible Cause | Solution |
|---|---|
| Environment variables not set | Verify all four `VITE_*` variables are set in Amplify's Environment Variables |
| Node.js version mismatch | In Amplify Build Settings, add `nvm use 18` in the preBuild phase |
| `npm install` fails | Check the build logs for specific package errors; ensure `package-lock.json` is committed |

> 📸 **[SCREENSHOT: AWS Amplify build logs screen showing the build steps and a highlighted error message to illustrate where to look for build failures]**

---

### 5.2 FAQs

**Q: Can an applicant re-take the video assessment or work style test?**
No. Once submitted, neither assessment can be retaken. This is by design to ensure consistent evaluation conditions. If an exceptional case requires it, an admin can delete the assessment record directly in Supabase and the applicant can resubmit.

---

**Q: How do I reset an applicant's access token?**
In the Supabase Table Editor, find the applicant in the `applicants` table and update the `access_expires_at` field to a future timestamp (e.g., 24 hours from now). The same token will then work again within the new window.

---

**Q: What happens to duplicate applications?**
The system automatically detects duplicates using fuzzy name matching and exact email matching. Duplicates are flagged in the `duplicate_matches` and `duplicate_layer` fields of the `applicants` table. The application is still processed but clearly marked for HR review.

| Duplicate Layer | Meaning |
|---|---|
| Layer 1 | Exact email match — definite duplicate |
| Layer 2 | High name similarity + same position — likely duplicate |
| Layer 3 | Moderate name similarity — possible duplicate |

---

**Q: Can I change scoring weights without affecting past applicant scores?**
Yes. Scoring settings only apply to future screenings. Applicants who have already been scored will retain their original scores. To re-score an existing applicant, you would need to re-run the screening service manually for that applicant.

---

**Q: The system supports 6 languages — are emails also translated?**
No. The 6-language support applies to the admin and applicant web interface only. All automated emails (pass notification, regret, interview invite) are sent in English regardless of language settings.

---

**Q: How do I bulk-import job postings?**
Place job data in the correct format in `data/job_postings_dataset.json` and run:
```bash
cd backend
python scripts/import_enriched_jobs.py
```

---

**Q: Can the system run without GPU?**
Yes. All ML models (BERT NER, all-MiniLM-L6-v2, Whisper) run on CPU by default. GPU acceleration is optional but significantly speeds up Whisper transcription. Set `MODEL_DEVICE=cuda` in the backend `.env` if a GPU is available.

---

**Q: Why is the interview scheduling not saving to the database?**
This feature is partially complete. The UI is fully built but the live database save/load for `scheduled_interviews` is pending final implementation. The `scheduled_interviews` table is fully defined in Supabase and ready to connect. This is a known limitation of the current thesis build.

---

**Q: How do I add more HR or Admin users?**
Use the admin user management section within the Admin Dashboard, or run the create script:
```bash
cd backend
python scripts/create_admin_user.py
```
When prompted, you can set the role to either `admin` or `hr`.

---

**Q: What should I do if the EC2 server runs out of memory?**
ML model loading (especially all three models simultaneously) requires ~4–6 GB of RAM. If the server crashes with a memory error, upgrade to a larger EC2 instance type (e.g., `t3.xlarge` with 16 GB RAM) or use `MODEL_DEVICE=cuda` on a GPU instance to offload model execution.

---

*AutoIntel Recruitment System — User Manual v1.0 | Thesis Build | June 2026*
