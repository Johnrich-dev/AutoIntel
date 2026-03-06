#!/usr/bin/env python3
"""
Email Service for AutoIntel Recruitment System
Handles sending pass/fail notifications to applicants after screening.
"""

import os
import smtplib
import uuid
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Email configuration
SMTP_HOST = os.getenv("SMTP_HOST", "")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
FROM_EMAIL = os.getenv("FROM_EMAIL", "autointel.ta@gmail.com")
FROM_NAME = os.getenv("FROM_NAME", "AutoIntel Recruitment")

# Token configuration
TOKEN_EXPIRY_HOURS = int(os.getenv("TOKEN_EXPIRY_HOURS", "24"))


def generate_access_token() -> str:
    """Generate a unique access token for applicant."""
    return str(uuid.uuid4())


def send_email(to_email: str, subject: str, body: str) -> bool:
    """
    Send an email to the applicant.
    
    Args:
        to_email: Recipient email address
        subject: Email subject line
        body: Email body content (HTML or plain text)
    
    Returns:
        True if sent successfully, False otherwise
    """
    if not SMTP_HOST or not SMTP_USER:
        print("Email configuration missing. Set SMTP_HOST, SMTP_USER, SMTP_PASSWORD in .env")
        return False
    
    try:
        msg = MIMEMultipart('alternative')
        msg['From'] = f"{FROM_NAME} <{FROM_EMAIL}>"
        msg['To'] = to_email
        msg['Subject'] = subject
        
        # Attach plain text and HTML versions
        text_part = MIMEText(body, 'plain')
        html_part = MIMEText(body, 'html')
        
        msg.attach(text_part)
        msg.attach(html_part)
        
        # Connect to SMTP server and send
        server = smtplib.SMTP(SMTP_HOST, SMTP_PORT)
        server.starttls()
        server.login(SMTP_USER, SMTP_PASSWORD)
        server.send_message(msg)
        server.quit()
        
        print(f"Email sent successfully to {to_email}")
        return True
        
    except Exception as e:
        print(f"Failed to send email to {to_email}: {str(e)}")
        return False


def send_pass_notification(
    applicant_name: str,
    applicant_email: str,
    job_title: str,
    score: float,
    access_token: str
) -> bool:
    """
    Send notification to applicants who passed initial screening.
    
    Args:
        applicant_name: Full name of the applicant
        applicant_email: Email address
        job_title: Position applied for
        score: Screening score
        access_token: Unique access token
    
    Returns:
        True if sent successfully
    """
    subject = f"Congratulations! You've Passed Initial Screening - {job_title}"
    
    # Determine fit category based on score
    if score >= 90:
        fit_category = "Excellent Fit"
    elif score >= 80:
        fit_category = "Very Good Fit"
    else:
        fit_category = "Good Fit"
    
    expiry_time = datetime.now() + timedelta(hours=TOKEN_EXPIRY_HOURS)
    expiry_str = expiry_time.strftime("%B %d, %Y at %I:%M %p")
    
    body_html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
            .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
            .header {{ background: #4F46E5; color: white; padding: 20px; text-align: center; }}
            .content {{ padding: 20px; background: #f9f9f9; }}
            .token-box {{ background: #e0e7ff; border: 2px dashed #4F46E5; padding: 15px; 
                         text-align: center; margin: 20px 0; font-family: monospace; font-size: 16px; }}
            .score {{ font-size: 24px; font-weight: bold; color: #4F46E5; }}
            .instructions {{ background: white; padding: 15px; border-left: 4px solid #4F46E5; margin: 15px 0; }}
            .footer {{ text-align: center; padding: 20px; color: #666; font-size: 12px; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>🎉 Congratulations, {applicant_name}!</h1>
            </div>
            <div class="content">
                <p>Your application for the position of <strong>{job_title}</strong> has been 
                successful in our initial screening process.</p>
                
                <div class="score">
                    Your Match Score: {score:.0f}/100 - {fit_category}
                </div>
                
                <div class="instructions">
                    <h3>📋 NEXT STEPS:</h3>
                    <ol>
                        <li><strong>Access the System:</strong><br>
                        Visit: <a href="https://autointel.example.com">https://autointel.example.com</a></li>
                        <li><strong>Login Credentials:</strong><br>
                        • Email: {applicant_email}<br>
                        • Access Token: <div class="token-box">{access_token}</div></li>
                        <li><strong>Complete Assessments:</strong><br>
                        • Video Introduction (record your response)<br>
                        • Work Profiling Exam (personality & skills assessment)</li>
                    </ol>
                </div>
                
                <div class="instructions">
                    <h3>🔐 System Instructions:</h3>
                    <ol>
                        <li>Go to the login page</li>
                        <li>Enter your email: <strong>{applicant_email}</strong></li>
                        <li>Enter your access token: <strong>{access_token}</strong></li>
                        <li>Complete the required assessments</li>
                        <li>Submit your responses</li>
                    </ol>
                </div>
                
                <p><strong>⏰ Important:</strong> Your access token expires on {expiry_str}. 
                You must complete all assessments before the token expires.</p>
                
                <p>After completing assessments, our team will review your results and 
                contact you for the next steps.</p>
                
                <p>Best regards,<br>
                <strong>AutoIntel Recruitment Team</strong></p>
            </div>
            <div class="footer">
                <p>This is an automated message. Please do not reply to this email.</p>
                <p>© {datetime.now().year} AutoIntel. All rights reserved.</p>
            </div>
        </div>
    </body>
    </html>
    """
    
    return send_email(applicant_email, subject, body_html)


def send_fail_notification(
    applicant_name: str,
    applicant_email: str,
    job_title: str,
    score: float
) -> bool:
    """
    Send notification to applicants who did not pass initial screening.
    
    Args:
        applicant_name: Full name of the applicant
        applicant_email: Email address
        job_title: Position applied for
        score: Screening score
    
    Returns:
        True if sent successfully
    """
    subject = f"Update on Your Application - {job_title}"
    
    body_html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
            .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
            .header {{ background: #6B7280; color: white; padding: 20px; text-align: center; }}
            .content {{ padding: 20px; background: #f9f9f9; }}
            .score {{ font-size: 20px; color: #6B7280; }}
            .footer {{ text-align: center; padding: 20px; color: #666; font-size: 12px; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>Thank You for Your Interest</h1>
            </div>
            <div class="content">
                <p>Dear {applicant_name},</p>
                
                <p>Thank you for your interest in the <strong>{job_title}</strong> position 
                at our company.</p>
                
                <p>After careful review of your application, we have decided to move forward 
                with other candidates whose qualifications more closely match our current requirements.</p>
                
                <div class="score">
                    Your Match Score: {score:.0f}/100
                </div>
                
                <p>We encourage you to apply for future positions that better match your 
                skills and experience. We appreciate the time you took to apply and 
                wish you the best in your career pursuits.</p>
                
                <p>Best regards,<br>
                <strong>AutoIntel Recruitment Team</strong></p>
            </div>
            <div class="footer">
                <p>This is an automated message. Please do not reply to this email.</p>
                <p>© {datetime.now().year} AutoIntel. All rights reserved.</p>
            </div>
        </div>
    </body>
    </html>
    """
    
    return send_email(applicant_email, subject, body_html)


def send_review_notification(
    applicant_name: str,
    applicant_email: str,
    job_title: str,
    score: float
) -> bool:
    """
    Send notification to applicants whose score is in review range (60-79).
    
    Args:
        applicant_name: Full name of the applicant
        applicant_email: Email address
        job_title: Position applied for
        score: Screening score
    
    Returns:
        True if sent successfully
    """
    subject = f"Application Status Update - {job_title}"
    
    body_html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
            .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
            .header {{ background: #F59E0B; color: white; padding: 20px; text-align: center; }}
            .content {{ padding: 20px; background: #f9f9f9; }}
            .score {{ font-size: 20px; color: #F59E0B; }}
            .footer {{ text-align: center; padding: 20px; color: #666; font-size: 12px; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>Application Under Review</h1>
            </div>
            <div class="content">
                <p>Dear {applicant_name},</p>
                
                <p>Thank you for your interest in the <strong>{job_title}</strong> position 
                at our company.</p>
                
                <p>Your application is currently under review by our recruitment team.</p>
                
                <div class="score">
                    Your Match Score: {score:.0f}/100
                </div>
                
                <p>We will notify you of the outcome once the review process is complete. 
                This may take a few days.</p>
                
                <p>Thank you for your patience.</p>
                
                <p>Best regards,<br>
                <strong>AutoIntel Recruitment Team</strong></p>
            </div>
            <div class="footer">
                <p>This is an automated message. Please do not reply to this email.</p>
                <p>© {datetime.now().year} AutoIntel. All rights reserved.</p>
            </div>
        </div>
    </body>
    </html>
    """
    
    return send_email(applicant_email, subject, body_html)


def process_screening_decision(
    applicant_data: Dict[str, Any],
    score: float,
    threshold_pass: float = 80.0,
    threshold_review: float = 60.0
) -> str:
    """
    Process the screening decision based on score and send appropriate notification.
    
    Args:
        applicant_data: Dictionary with applicant info (name, email, job_title)
        score: The screening score (0-100)
        threshold_pass: Score above which applicant passes (default: 80)
        threshold_review: Score above which needs review (default: 60)
    
    Returns:
        Decision status: "passed", "needs_review", or "failed"
    """
    applicant_name = applicant_data.get("full_name", "Applicant")
    applicant_email = applicant_data.get("email", "")
    job_title = applicant_data.get("job_title", "the position")
    
    if score >= threshold_pass:
        # Generate access token
        access_token = generate_access_token()
        
        # Send pass notification with token
        send_pass_notification(
            applicant_name=applicant_name,
            applicant_email=applicant_email,
            job_title=job_title,
            score=score,
            access_token=access_token
        )
        
        return "passed"
    
    elif score >= threshold_review:
        # Send review notification
        send_review_notification(
            applicant_name=applicant_name,
            applicant_email=applicant_email,
            job_title=job_title,
            score=score
        )
        
        return "needs_review"
    
    else:
        # Send fail notification
        send_fail_notification(
            applicant_name=applicant_name,
            applicant_email=applicant_email,
            job_title=job_title,
            score=score
        )
        
        return "failed"


if __name__ == "__main__":
    # Test email sending (requires SMTP configuration in .env)
    print("Email Service for AutoIntel")
    print("=" * 50)
    print("Configure SMTP settings in .env to send emails:")
    print("  SMTP_HOST=smtp.gmail.com")
    print("  SMTP_PORT=587")
    print("  SMTP_USER=your-email@gmail.com")
    print("  SMTP_PASSWORD=your-app-password")
    print("  FROM_EMAIL=recruitment@autointel.com")
    print("")
    print("Functions available:")
    print("  - send_pass_notification()")
    print("  - send_fail_notification()")
    print("  - send_review_notification()")
    print("  - process_screening_decision()")
    print("  - generate_access_token()")
