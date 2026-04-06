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


def send_email_with_ics(
    to_email: str,
    subject: str,
    body_text: str,
    body_html: str,
    ics_content: str
) -> bool:
    """
    Send an email with an ICS calendar attachment.

    CRITICAL: The MIME structure must be multipart/mixed containing:
      1. multipart/alternative (text + html)
      2. text/calendar with METHOD:REQUEST (the ICS invite)

    This structure causes Gmail to show the "Accept / Decline / Maybe" card
    and Outlook to show the meeting invitation banner.

    Args:
        to_email: Recipient email address
        subject: Email subject
        body_text: Plain text body
        body_html: HTML body
        ics_content: ICS file content string (must contain METHOD:REQUEST)

    Returns:
        True if sent successfully
    """
    if not SMTP_HOST or not SMTP_USER:
        print("Email configuration missing. Set SMTP_HOST, SMTP_USER, SMTP_PASSWORD in .env")
        return False

    try:
        # Outer container: multipart/mixed so we can attach the ICS
        msg = MIMEMultipart('mixed')
        msg['From'] = f"{FROM_NAME} <{FROM_EMAIL}>"
        msg['To'] = to_email
        msg['Subject'] = subject

        # Inner alternative part: text + html
        alt_part = MIMEMultipart('alternative')
        alt_part.attach(MIMEText(body_text, 'plain', 'utf-8'))
        alt_part.attach(MIMEText(body_html, 'html', 'utf-8'))
        msg.attach(alt_part)

        # ICS calendar part — METHOD:REQUEST triggers invite UI in Gmail/Outlook
        # Content-Type must be text/calendar with method=REQUEST
        ics_part = MIMEText(ics_content, 'calendar', 'utf-8')
        ics_part.add_header('Content-Disposition', 'attachment', filename='interview_invite.ics')
        ics_part.set_param('method', 'REQUEST')
        msg.attach(ics_part)

        server = smtplib.SMTP(SMTP_HOST, SMTP_PORT)
        server.starttls()
        server.login(SMTP_USER, SMTP_PASSWORD)
        server.send_message(msg)
        server.quit()

        print(f"Email with ICS sent successfully to {to_email}")
        return True

    except Exception as e:
        print(f"Failed to send email with ICS to {to_email}: {str(e)}")
        return False


def send_pass_notification(
    applicant_name: str,
    applicant_email: str,
    job_title: str,
    score: float,
    access_token: str,
    requirement_match_score: Optional[float] = None,
    count_score: Optional[float] = None,
    requirement_breakdown: Optional[Dict[str, float]] = None,
    count_breakdown: Optional[Dict[str, Any]] = None,
    weights_used: Optional[Dict[str, float]] = None
) -> bool:
    """
    Send notification to applicants who passed initial screening.
    
    Args:
        applicant_name: Full name of the applicant
        applicant_email: Email address
        job_title: Position applied for
        score: Screening score
        access_token: Unique access token
        requirement_match_score: Requirement match component score (optional)
        count_score: Count-based component score (optional)
        requirement_breakdown: Dict with breakdown scores by category (optional)
        count_breakdown: Dict with count details by category (optional)
        weights_used: Dict with weights used for scoring (optional)
    
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
    
    # Build score breakdown HTML if provided
    score_breakdown_html = ""
    if requirement_breakdown or count_breakdown:
        score_breakdown_html = """
                <div class="score-breakdown">
                    <h3>📊 Your Score Breakdown</h3>
                    <table style="width:100%; border-collapse: collapse; margin: 15px 0;">
                        <tr style="background: #f3f4f6;">
                            <th style="padding: 10px; text-align: left; border: 1px solid #ddd;">Category</th>
                            <th style="padding: 10px; text-align: center; border: 1px solid #ddd;">Relevance Score</th>
                            <th style="padding: 10px; text-align: center; border: 1px solid #ddd;">Count</th>
                            <th style="padding: 10px; text-align: center; border: 1px solid #ddd;">Count Score</th>
                        </tr>
        """
        
        categories = [
            ("Experience", "experience"),
            ("Skills", "skills"),
            ("Education", "education"),
            ("Projects", "projects"),
            ("Training & Certifications", "traincert"),
            ("Achievements", "achievements")
        ]
        
        for cat_name, cat_key in categories:
            req_score = requirement_breakdown.get(cat_key, "-") if requirement_breakdown else "-"
            if isinstance(req_score, float):
                req_score = f"{req_score:.1f}%"
            
            count_info = count_breakdown.get(cat_key, {}) if count_breakdown else {}
            count = count_info.get("count", "-")
            count_score_val = count_info.get("score", "-")
            if isinstance(count_score_val, float):
                count_score_val = f"{count_score_val:.1f}%"
            
            score_breakdown_html += f"""
                        <tr>
                            <td style="padding: 10px; border: 1px solid #ddd;">{cat_name}</td>
                            <td style="padding: 10px; text-align: center; border: 1px solid #ddd;">{req_score}</td>
                            <td style="padding: 10px; text-align: center; border: 1px solid #ddd;">{count}</td>
                            <td style="padding: 10px; text-align: center; border: 1px solid #ddd;">{count_score_val}</td>
                        </tr>
            """
        
        score_breakdown_html += """
                    </table>
        """
        
        # Add component scores if available
        if requirement_match_score is not None and count_score is not None:
            req_w = weights_used.get("requirement_weight", 0.6) if weights_used else 0.6
            cnt_w = weights_used.get("count_weight", 0.4) if weights_used else 0.4
            score_breakdown_html += f"""
                    <div class="component-scores" style="background: #e0e7ff; padding: 15px; border-radius: 8px; margin: 15px 0;">
                        <p style="margin: 5px 0;"><strong>Requirement Match Score:</strong> {requirement_match_score:.2f}% (weight: {req_w*100:.0f}%)</p>
                        <p style="margin: 5px 0;"><strong>Count Score:</strong> {count_score:.2f}% (weight: {cnt_w*100:.0f}%)</p>
                    </div>
            """
        
        score_breakdown_html += """
                </div>
        """
    
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
                
                {score_breakdown_html}
                
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
    score: float,
    requirement_match_score: Optional[float] = None,
    count_score: Optional[float] = None,
    requirement_breakdown: Optional[Dict[str, float]] = None,
    count_breakdown: Optional[Dict[str, Any]] = None,
    weights_used: Optional[Dict[str, float]] = None
) -> bool:
    """
    Send notification to applicants who did not pass initial screening.
    
    Args:
        applicant_name: Full name of the applicant
        applicant_email: Email address
        job_title: Position applied for
        score: Screening score
        requirement_match_score: Requirement match component score (optional)
        count_score: Count-based component score (optional)
        requirement_breakdown: Dict with breakdown scores by category (optional)
        count_breakdown: Dict with count details by category (optional)
        weights_used: Dict with weights used for scoring (optional)
    
    Returns:
        True if sent successfully
    """
    subject = f"Update on Your Application - {job_title}"
    
    # Build score breakdown HTML if provided
    score_breakdown_html = ""
    if requirement_breakdown or count_breakdown:
        score_breakdown_html = """
                <div class="score-breakdown">
                    <h3>📊 Your Score Breakdown</h3>
                    <table style="width:100%; border-collapse: collapse; margin: 15px 0;">
                        <tr style="background: #f3f4f6;">
                            <th style="padding: 10px; text-align: left; border: 1px solid #ddd;">Category</th>
                            <th style="padding: 10px; text-align: center; border: 1px solid #ddd;">Relevance Score</th>
                            <th style="padding: 10px; text-align: center; border: 1px solid #ddd;">Count</th>
                            <th style="padding: 10px; text-align: center; border: 1px solid #ddd;">Count Score</th>
                        </tr>
        """
        
        categories = [
            ("Experience", "experience"),
            ("Skills", "skills"),
            ("Education", "education"),
            ("Projects", "projects"),
            ("Training & Certifications", "traincert"),
            ("Achievements", "achievements")
        ]
        
        for cat_name, cat_key in categories:
            req_score = requirement_breakdown.get(cat_key, "-") if requirement_breakdown else "-"
            if isinstance(req_score, float):
                req_score = f"{req_score:.1f}%"
            
            count_info = count_breakdown.get(cat_key, {}) if count_breakdown else {}
            count = count_info.get("count", "-")
            count_score_val = count_info.get("score", "-")
            if isinstance(count_score_val, float):
                count_score_val = f"{count_score_val:.1f}%"
            
            score_breakdown_html += f"""
                        <tr>
                            <td style="padding: 10px; border: 1px solid #ddd;">{cat_name}</td>
                            <td style="padding: 10px; text-align: center; border: 1px solid #ddd;">{req_score}</td>
                            <td style="padding: 10px; text-align: center; border: 1px solid #ddd;">{count}</td>
                            <td style="padding: 10px; text-align: center; border: 1px solid #ddd;">{count_score_val}</td>
                        </tr>
            """
        
        score_breakdown_html += """
                    </table>
        """
        
        # Add component scores if available
        if requirement_match_score is not None and count_score is not None:
            req_w = weights_used.get("requirement_weight", 0.6) if weights_used else 0.6
            cnt_w = weights_used.get("count_weight", 0.4) if weights_used else 0.4
            score_breakdown_html += f"""
                    <div class="component-scores" style="background: #f3f4f6; padding: 15px; border-radius: 8px; margin: 15px 0;">
                        <p style="margin: 5px 0;"><strong>Requirement Match Score:</strong> {requirement_match_score:.2f}% (weight: {req_w*100:.0f}%)</p>
                        <p style="margin: 5px 0;"><strong>Count Score:</strong> {count_score:.2f}% (weight: {cnt_w*100:.0f}%)</p>
                    </div>
            """
        
        score_breakdown_html += """
                </div>
        """
    
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
                
                {score_breakdown_html}
                
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
    score: float,
    requirement_match_score: Optional[float] = None,
    count_score: Optional[float] = None,
    requirement_breakdown: Optional[Dict[str, float]] = None,
    count_breakdown: Optional[Dict[str, Any]] = None,
    weights_used: Optional[Dict[str, float]] = None
) -> bool:
    """
    Send notification to applicants whose score is in review range (60-79).
    
    Args:
        applicant_name: Full name of the applicant
        applicant_email: Email address
        job_title: Position applied for
        score: Screening score
        requirement_match_score: Requirement match component score (optional)
        count_score: Count-based component score (optional)
        requirement_breakdown: Dict with breakdown scores by category (optional)
        count_breakdown: Dict with count details by category (optional)
        weights_used: Dict with weights used for scoring (optional)
    
    Returns:
        True if sent successfully
    """
    subject = f"Application Status Update - {job_title}"
    
    # Build score breakdown HTML if provided
    score_breakdown_html = ""
    if requirement_breakdown or count_breakdown:
        score_breakdown_html = """
                <div class="score-breakdown">
                    <h3>📊 Your Score Breakdown</h3>
                    <table style="width:100%; border-collapse: collapse; margin: 15px 0;">
                        <tr style="background: #f3f4f6;">
                            <th style="padding: 10px; text-align: left; border: 1px solid #ddd;">Category</th>
                            <th style="padding: 10px; text-align: center; border: 1px solid #ddd;">Relevance Score</th>
                            <th style="padding: 10px; text-align: center; border: 1px solid #ddd;">Count</th>
                            <th style="padding: 10px; text-align: center; border: 1px solid #ddd;">Count Score</th>
                        </tr>
        """
        
        categories = [
            ("Experience", "experience"),
            ("Skills", "skills"),
            ("Education", "education"),
            ("Projects", "projects"),
            ("Training & Certifications", "traincert"),
            ("Achievements", "achievements")
        ]
        
        for cat_name, cat_key in categories:
            req_score = requirement_breakdown.get(cat_key, "-") if requirement_breakdown else "-"
            if isinstance(req_score, float):
                req_score = f"{req_score:.1f}%"
            
            count_info = count_breakdown.get(cat_key, {}) if count_breakdown else {}
            count = count_info.get("count", "-")
            count_score_val = count_info.get("score", "-")
            if isinstance(count_score_val, float):
                count_score_val = f"{count_score_val:.1f}%"
            
            score_breakdown_html += f"""
                        <tr>
                            <td style="padding: 10px; border: 1px solid #ddd;">{cat_name}</td>
                            <td style="padding: 10px; text-align: center; border: 1px solid #ddd;">{req_score}</td>
                            <td style="padding: 10px; text-align: center; border: 1px solid #ddd;">{count}</td>
                            <td style="padding: 10px; text-align: center; border: 1px solid #ddd;">{count_score_val}</td>
                        </tr>
            """
        
        score_breakdown_html += """
                    </table>
        """
        
        # Add component scores if available
        if requirement_match_score is not None and count_score is not None:
            req_w = weights_used.get("requirement_weight", 0.6) if weights_used else 0.6
            cnt_w = weights_used.get("count_weight", 0.4) if weights_used else 0.4
            score_breakdown_html += f"""
                    <div class="component-scores" style="background: #fef3c7; padding: 15px; border-radius: 8px; margin: 15px 0;">
                        <p style="margin: 5px 0;"><strong>Requirement Match Score:</strong> {requirement_match_score:.2f}% (weight: {req_w*100:.0f}%)</p>
                        <p style="margin: 5px 0;"><strong>Count Score:</strong> {count_score:.2f}% (weight: {cnt_w*100:.0f}%)</p>
                    </div>
            """
        
        score_breakdown_html += """
                </div>
        """
    
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
                
                {score_breakdown_html}
                
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
    threshold_review: float = 60.0,
    requirement_match_score: Optional[float] = None,
    count_score: Optional[float] = None,
    requirement_breakdown: Optional[Dict[str, float]] = None,
    count_breakdown: Optional[Dict[str, Any]] = None,
    weights_used: Optional[Dict[str, float]] = None
) -> str:
    """
    Process the screening decision based on score and send appropriate notification.
    
    Args:
        applicant_data: Dictionary with applicant info (name, email, job_title)
        score: The screening score (0-100)
        threshold_pass: Score above which applicant passes (default: 80)
        threshold_review: Score above which needs review (default: 60)
        requirement_match_score: Requirement match component score (optional)
        count_score: Count-based component score (optional)
        requirement_breakdown: Dict with breakdown scores by category (optional)
        count_breakdown: Dict with count details by category (optional)
        weights_used: Dict with weights used for scoring (optional)
    
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
            access_token=access_token,
            requirement_match_score=requirement_match_score,
            count_score=count_score,
            requirement_breakdown=requirement_breakdown,
            count_breakdown=count_breakdown,
            weights_used=weights_used
        )
        
        return "passed"
    
    elif score >= threshold_review:
        # Send review notification
        send_review_notification(
            applicant_name=applicant_name,
            applicant_email=applicant_email,
            job_title=job_title,
            score=score,
            requirement_match_score=requirement_match_score,
            count_score=count_score,
            requirement_breakdown=requirement_breakdown,
            count_breakdown=count_breakdown,
            weights_used=weights_used
        )
        
        return "needs_review"
    
    else:
        # Send fail notification
        send_fail_notification(
            applicant_name=applicant_name,
            applicant_email=applicant_email,
            job_title=job_title,
            score=score,
            requirement_match_score=requirement_match_score,
            count_score=count_score,
            requirement_breakdown=requirement_breakdown,
            count_breakdown=count_breakdown,
            weights_used=weights_used
        )
        
        return "failed"


def send_duplicate_rejection_notification(
    applicant_name: str,
    applicant_email: str,
    job_title: str,
    score: float = 0.0
) -> bool:
    """
    Send notification to applicants whose application was rejected due to duplication.
    
    Args:
        applicant_name: Full name of the applicant
        applicant_email: Email address
        job_title: Position applied for
        score: Screening score (default 0.0 for duplicates)
    
    Returns:
        True if sent successfully
    """
    subject = "Application Status Update - Duplicate Application Detected"
    
    body_html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
            .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
            .header {{ background: #DC2626; color: white; padding: 20px; text-align: center; }}
            .content {{ padding: 20px; background: #f9f9f9; }}
            .status-box {{ background: #FEE2E2; border: 2px solid #DC2626; padding: 15px; 
                         text-align: center; margin: 20px 0; border-radius: 8px; }}
            .status-label {{ font-size: 14px; color: #991B1B; font-weight: bold; }}
            .status-value {{ font-size: 20px; color: #DC2626; font-weight: bold; }}
            .reason {{ background: #FEF3C7; border-left: 4px solid #F59E0B; padding: 15px; margin: 15px 0; }}
            .footer {{ text-align: center; padding: 20px; color: #666; font-size: 12px; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>⚠️ Application Status Update</h1>
            </div>
            <div class="content">
                <p>Dear <strong>{applicant_name}</strong>,</p>
                
                <p>Thank you for your interest in applying.</p>
                
                <p>Our system has detected that an application with very similar identity information has already been submitted. 
                To maintain fair evaluation and prevent duplicate entries, only one application per applicant is allowed.</p>
                
                <p>If you believe this detection was made in error, please contact our recruitment team.</p>
                
                <div class="status-box">
                    <div class="status-label">Application Status</div>
                    <div class="status-value">Rejected</div>
                </div>
                
                <div class="reason">
                    <strong>Reason:</strong> Duplicate Application Detected
                </div>
                
                <p>Applied Position: <strong>{job_title}</strong></p>
                
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
    
    return send_email(
        to_email=applicant_email,
        subject=subject,
        body=body_html
    )


def send_interview_notification(
    applicant_name: str,
    applicant_email: str,
    job_title: str,
    interview_date: str,
    interview_time: str,
    interview_type: str,
    duration_minutes: int = 60,
    time_zone: str = "Asia/Manila",
    meeting_link: Optional[str] = None,
    meeting_id: Optional[str] = None,
    meeting_passcode: Optional[str] = None,
    location: Optional[str] = None,
    interviewer_name: Optional[str] = None,
    applicant_instructions: Optional[str] = None,
    ics_content: Optional[str] = None
) -> bool:
    """
    Send interview invitation to the applicant with an ICS calendar attachment.

    APPLICANT-SAFE: This function must NEVER include internal_notes.
    Only applicant_instructions are shown to the applicant.

    The ICS attachment (METHOD:REQUEST) causes Gmail/Outlook to render
    an Accept/Decline card so the applicant can confirm attendance.

    Args:
        applicant_name: Full name of the applicant
        applicant_email: Applicant's email address
        job_title: Position being interviewed for
        interview_date: YYYY-MM-DD
        interview_time: HH:MM (24h)
        interview_type: 'online', 'in-person', or 'hybrid'
        duration_minutes: Duration in minutes (default 60)
        time_zone: Time zone label for display (default Asia/Manila)
        meeting_link: Teams/Zoom/Meet URL (required for online/hybrid)
        meeting_id: Meeting ID (optional)
        meeting_passcode: Meeting passcode (optional)
        location: Physical address (required for in-person/hybrid)
        interviewer_name: Primary interviewer name (optional)
        applicant_instructions: Shown to applicant in email and ICS (optional)
        ics_content: Pre-generated ICS string; if None, no ICS is attached

    Returns:
        True if email sent successfully
    """
    subject = f"Interview Invitation – {job_title}"

    try:
        formatted_date = datetime.strptime(interview_date, "%Y-%m-%d").strftime("%A, %B %d, %Y")
    except Exception:
        formatted_date = interview_date

    try:
        formatted_time = datetime.strptime(interview_time, "%H:%M").strftime("%I:%M %p")
    except Exception:
        formatted_time = interview_time

    type_label = {"online": "Online / Video Conference", "in-person": "In-Person", "hybrid": "Hybrid"}.get(interview_type, interview_type.title())

    # --- Plain text body ---
    plain_lines = [
        f"Dear {applicant_name},",
        "",
        f"Your interview for the {job_title} position has been scheduled.",
        "",
        "INTERVIEW DETAILS",
        f"  Position   : {job_title}",
        f"  Date       : {formatted_date}",
        f"  Time       : {formatted_time} ({time_zone})",
        f"  Duration   : {duration_minutes} minutes",
        f"  Format     : {type_label}",
    ]
    if interviewer_name:
        plain_lines.append(f"  Interviewer: {interviewer_name}")
    if meeting_link and interview_type in ("online", "hybrid"):
        plain_lines += ["", "MEETING DETAILS", f"  Join Link  : {meeting_link}"]
        if meeting_id:
            plain_lines.append(f"  Meeting ID : {meeting_id}")
        if meeting_passcode:
            plain_lines.append(f"  Passcode   : {meeting_passcode}")
    if location and interview_type in ("in-person", "hybrid"):
        plain_lines += ["", f"  Location   : {location}"]
    if applicant_instructions:
        plain_lines += ["", "INSTRUCTIONS", applicant_instructions]
    plain_lines += [
        "",
        "A calendar invite is attached to this email. Please accept or decline to confirm your attendance.",
        "",
        "Best regards,",
        "AutoIntel Recruitment Team"
    ]
    body_text = "\n".join(plain_lines)

    # --- Meeting section for HTML ---
    meeting_html = ""
    if interview_type in ("online", "hybrid") and meeting_link:
        creds_html = ""
        if meeting_id or meeting_passcode:
            rows = ""
            if meeting_id:
                rows += f'<tr><td style="padding:4px 0;color:#6b7280;width:110px;">Meeting ID</td><td style="padding:4px 0;color:#111827;">{meeting_id}</td></tr>'
            if meeting_passcode:
                rows += f'<tr><td style="padding:4px 0;color:#6b7280;">Passcode</td><td style="padding:4px 0;color:#111827;">{meeting_passcode}</td></tr>'
            creds_html = f'<table style="width:100%;margin-top:12px;border-top:1px solid #e5e7eb;padding-top:12px;">{rows}</table>'
        meeting_html = f"""
        <div style="border:1px solid #e5e7eb;border-radius:6px;padding:20px;margin:20px 0;">
          <p style="margin:0 0 12px 0;font-size:13px;font-weight:600;color:#374151;text-transform:uppercase;letter-spacing:.5px;">Meeting Details</p>
          <a href="{meeting_link}" style="display:inline-block;background:#1d4ed8;color:#fff;padding:10px 24px;text-decoration:none;font-weight:600;border-radius:5px;font-size:14px;">Join Meeting</a>
          <p style="margin:10px 0 0 0;font-size:12px;color:#6b7280;word-break:break-all;">{meeting_link}</p>
          {creds_html}
        </div>"""
    if interview_type in ("in-person", "hybrid") and location:
        meeting_html += f"""
        <div style="border:1px solid #e5e7eb;border-radius:6px;padding:16px;margin:12px 0;">
          <p style="margin:0 0 6px 0;font-size:13px;font-weight:600;color:#374151;text-transform:uppercase;letter-spacing:.5px;">Location</p>
          <p style="margin:0;color:#374151;">{location}</p>
        </div>"""

    # --- Instructions section ---
    instructions_html = ""
    if applicant_instructions:
        instructions_html = f"""
        <div style="border-left:3px solid #2563eb;padding:12px 16px;margin:20px 0;background:#f0f7ff;">
          <p style="margin:0 0 6px 0;font-size:12px;font-weight:600;color:#1d4ed8;text-transform:uppercase;letter-spacing:.5px;">Instructions</p>
          <p style="margin:0;color:#374151;font-size:14px;line-height:1.6;">{applicant_instructions}</p>
        </div>"""

    # --- HTML body ---
    body_html = f"""<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellspacing="0" cellpadding="0" border="0">
  <tr><td align="center" style="padding:32px 16px;">
    <table width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;background:#fff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">

      <!-- Header -->
      <tr><td style="background:#1e3a8a;padding:28px 36px;">
        <p style="margin:0;color:#fff;font-size:20px;font-weight:600;">Interview Invitation</p>
        <p style="margin:6px 0 0 0;color:#93c5fd;font-size:13px;">{job_title}</p>
      </td></tr>

      <!-- Body -->
      <tr><td style="padding:32px 36px;">
        <p style="margin:0 0 20px 0;color:#374151;font-size:15px;">Dear <strong>{applicant_name}</strong>,</p>
        <p style="margin:0 0 24px 0;color:#4b5563;font-size:14px;line-height:1.7;">
          We are pleased to confirm your interview for the <strong>{job_title}</strong> position. Please review the details below.
        </p>

        <!-- Details table -->
        <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:20px;margin-bottom:20px;">
          <p style="margin:0 0 14px 0;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;">Interview Details</p>
          <table width="100%" cellspacing="0" cellpadding="0" border="0">
            <tr><td style="padding:5px 0;color:#6b7280;width:110px;font-size:14px;">Position</td><td style="padding:5px 0;font-weight:600;color:#111827;font-size:14px;">{job_title}</td></tr>
            <tr><td style="padding:5px 0;color:#6b7280;font-size:14px;">Date</td><td style="padding:5px 0;font-weight:600;color:#111827;font-size:14px;">{formatted_date}</td></tr>
            <tr><td style="padding:5px 0;color:#6b7280;font-size:14px;">Time</td><td style="padding:5px 0;font-weight:600;color:#111827;font-size:14px;">{formatted_time} ({time_zone})</td></tr>
            <tr><td style="padding:5px 0;color:#6b7280;font-size:14px;">Duration</td><td style="padding:5px 0;color:#111827;font-size:14px;">{duration_minutes} minutes</td></tr>
            <tr><td style="padding:5px 0;color:#6b7280;font-size:14px;">Format</td><td style="padding:5px 0;color:#111827;font-size:14px;">{type_label}</td></tr>
            {"<tr><td style='padding:5px 0;color:#6b7280;font-size:14px;'>Interviewer</td><td style='padding:5px 0;color:#111827;font-size:14px;'>" + interviewer_name + "</td></tr>" if interviewer_name else ""}
          </table>
        </div>

        {meeting_html}
        {instructions_html}

        <!-- Calendar invite note -->
        <div style="border:1px solid #e5e7eb;border-radius:6px;padding:14px 16px;margin:20px 0;background:#f9fafb;">
          <p style="margin:0;font-size:13px;color:#374151;">
            📅 A calendar invite is attached to this email. Please <strong>accept or decline</strong> the invite to confirm your attendance.
          </p>
        </div>

        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
        <p style="margin:0 0 8px 0;font-size:13px;font-weight:600;color:#374151;">What to prepare:</p>
        <ul style="margin:0 0 20px 0;padding-left:18px;color:#4b5563;font-size:14px;line-height:1.8;">
          <li>Updated copy of your resume</li>
          <li>Be ready to discuss your relevant experience and projects</li>
          <li>Prepare questions for the interviewer</li>
          <li>Join the meeting a few minutes early to test your connection</li>
        </ul>
        <p style="margin:0;color:#4b5563;font-size:14px;line-height:1.6;">
          If you need to reschedule or have any questions, please reply to this email at your earliest convenience.
        </p>
      </td></tr>

      <!-- Footer -->
      <tr><td style="background:#f9fafb;padding:20px 36px;border-top:1px solid #e5e7eb;text-align:center;">
        <p style="margin:0 0 4px 0;font-size:13px;font-weight:600;color:#111827;">AutoIntel Recruitment</p>
        <p style="margin:0;font-size:12px;color:#9ca3af;">This is an automated message. Please do not reply directly to this email.</p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>"""

    # Send with ICS if available, otherwise plain HTML email
    if ics_content:
        return send_email_with_ics(
            to_email=applicant_email,
            subject=subject,
            body_text=body_text,
            body_html=body_html,
            ics_content=ics_content
        )
    return send_email(to_email=applicant_email, subject=subject, body=body_html)


def send_interviewer_notification(
    interviewer_name: str,
    interviewer_email: str,
    applicant_name: str,
    applicant_email: str,
    job_title: str,
    interview_date: str,
    interview_time: str,
    interview_type: str,
    duration_minutes: int = 60,
    time_zone: str = "Asia/Manila",
    meeting_link: Optional[str] = None,
    meeting_id: Optional[str] = None,
    meeting_passcode: Optional[str] = None,
    location: Optional[str] = None,
    internal_notes: Optional[str] = None,
    ics_content: Optional[str] = None
) -> bool:
    """
    Send panel/interviewer assignment notification with ICS calendar invite.

    INTERNAL: This email may include internal_notes. It must NEVER be sent
    to the applicant. internal_notes are shown here but not in the applicant email.

    Args:
        interviewer_name: Interviewer's display name
        interviewer_email: Interviewer's email address
        applicant_name: Applicant's full name
        applicant_email: Applicant's email (shown for reference, not emailed)
        job_title: Position title
        interview_date: YYYY-MM-DD
        interview_time: HH:MM (24h)
        interview_type: 'online', 'in-person', or 'hybrid'
        duration_minutes: Duration in minutes
        time_zone: Time zone label for display
        meeting_link: Meeting URL
        meeting_id: Meeting ID (optional)
        meeting_passcode: Meeting passcode (optional)
        location: Physical location (optional)
        internal_notes: Internal HR notes — shown only to interviewers
        ics_content: Pre-generated ICS string; if None, no ICS is attached

    Returns:
        True if email sent successfully
    """
    subject = f"Interview Assignment – {applicant_name} for {job_title}"

    try:
        formatted_date = datetime.strptime(interview_date, "%Y-%m-%d").strftime("%A, %B %d, %Y")
    except Exception:
        formatted_date = interview_date

    try:
        formatted_time = datetime.strptime(interview_time, "%H:%M").strftime("%I:%M %p")
    except Exception:
        formatted_time = interview_time

    type_label = {"online": "Online / Video Conference", "in-person": "In-Person", "hybrid": "Hybrid"}.get(interview_type, interview_type.title())

    # --- Plain text body ---
    plain_lines = [
        f"Dear {interviewer_name},",
        "",
        f"You have been assigned to interview {applicant_name} for the {job_title} position.",
        "",
        "INTERVIEW DETAILS",
        f"  Applicant  : {applicant_name} ({applicant_email})",
        f"  Position   : {job_title}",
        f"  Date       : {formatted_date}",
        f"  Time       : {formatted_time} ({time_zone})",
        f"  Duration   : {duration_minutes} minutes",
        f"  Format     : {type_label}",
    ]
    if meeting_link and interview_type in ("online", "hybrid"):
        plain_lines += ["", "MEETING DETAILS", f"  Join Link  : {meeting_link}"]
        if meeting_id:
            plain_lines.append(f"  Meeting ID : {meeting_id}")
        if meeting_passcode:
            plain_lines.append(f"  Passcode   : {meeting_passcode}")
    if location and interview_type in ("in-person", "hybrid"):
        plain_lines += ["", f"  Location   : {location}"]
    if internal_notes:
        plain_lines += ["", "INTERNAL NOTES (not shared with applicant)", internal_notes]
    plain_lines += [
        "",
        "A calendar invite is attached. Please accept to confirm your availability.",
        "",
        "Best regards,",
        "AutoIntel Recruitment Team"
    ]
    body_text = "\n".join(plain_lines)

    # --- Meeting section ---
    meeting_html = ""
    if interview_type in ("online", "hybrid") and meeting_link:
        creds_html = ""
        if meeting_id or meeting_passcode:
            rows = ""
            if meeting_id:
                rows += f'<tr><td style="padding:4px 0;color:#6b7280;width:110px;">Meeting ID</td><td style="padding:4px 0;color:#111827;">{meeting_id}</td></tr>'
            if meeting_passcode:
                rows += f'<tr><td style="padding:4px 0;color:#6b7280;">Passcode</td><td style="padding:4px 0;color:#111827;">{meeting_passcode}</td></tr>'
            creds_html = f'<table style="width:100%;margin-top:12px;border-top:1px solid #e5e7eb;padding-top:12px;">{rows}</table>'
        meeting_html = f"""
        <div style="border:1px solid #e5e7eb;border-radius:6px;padding:20px;margin:20px 0;">
          <p style="margin:0 0 12px 0;font-size:13px;font-weight:600;color:#374151;text-transform:uppercase;letter-spacing:.5px;">Meeting Details</p>
          <a href="{meeting_link}" style="display:inline-block;background:#1d4ed8;color:#fff;padding:10px 24px;text-decoration:none;font-weight:600;border-radius:5px;font-size:14px;">Join Meeting</a>
          <p style="margin:10px 0 0 0;font-size:12px;color:#6b7280;word-break:break-all;">{meeting_link}</p>
          {creds_html}
        </div>"""
    if interview_type in ("in-person", "hybrid") and location:
        meeting_html += f"""
        <div style="border:1px solid #e5e7eb;border-radius:6px;padding:16px;margin:12px 0;">
          <p style="margin:0 0 6px 0;font-size:13px;font-weight:600;color:#374151;text-transform:uppercase;letter-spacing:.5px;">Location</p>
          <p style="margin:0;color:#374151;">{location}</p>
        </div>"""

    # --- Internal notes section (interviewer-only) ---
    notes_html = ""
    if internal_notes:
        notes_html = f"""
        <div style="border-left:3px solid #f59e0b;padding:12px 16px;margin:20px 0;background:#fffbeb;">
          <p style="margin:0 0 6px 0;font-size:12px;font-weight:600;color:#92400e;text-transform:uppercase;letter-spacing:.5px;">Internal Notes</p>
          <p style="margin:0;color:#374151;font-size:14px;line-height:1.6;">{internal_notes}</p>
        </div>"""

    body_html = f"""<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellspacing="0" cellpadding="0" border="0">
  <tr><td align="center" style="padding:32px 16px;">
    <table width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;background:#fff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">

      <!-- Header -->
      <tr><td style="background:#1e3a8a;padding:28px 36px;">
        <p style="margin:0;color:#fff;font-size:20px;font-weight:600;">Interview Assignment</p>
        <p style="margin:6px 0 0 0;color:#93c5fd;font-size:13px;">{job_title}</p>
      </td></tr>

      <!-- Body -->
      <tr><td style="padding:32px 36px;">
        <p style="margin:0 0 20px 0;color:#374151;font-size:15px;">Dear <strong>{interviewer_name}</strong>,</p>
        <p style="margin:0 0 24px 0;color:#4b5563;font-size:14px;line-height:1.7;">
          You have been assigned to conduct an interview. Please review the details below and accept the calendar invite to confirm your availability.
        </p>

        <!-- Applicant + interview details -->
        <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:20px;margin-bottom:20px;">
          <p style="margin:0 0 14px 0;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;">Interview Details</p>
          <table width="100%" cellspacing="0" cellpadding="0" border="0">
            <tr><td style="padding:5px 0;color:#6b7280;width:110px;font-size:14px;">Applicant</td><td style="padding:5px 0;font-weight:600;color:#111827;font-size:14px;">{applicant_name}</td></tr>
            <tr><td style="padding:5px 0;color:#6b7280;font-size:14px;">Email</td><td style="padding:5px 0;color:#374151;font-size:14px;">{applicant_email}</td></tr>
            <tr><td style="padding:5px 0;color:#6b7280;font-size:14px;">Position</td><td style="padding:5px 0;font-weight:600;color:#111827;font-size:14px;">{job_title}</td></tr>
            <tr><td style="padding:5px 0;color:#6b7280;font-size:14px;">Date</td><td style="padding:5px 0;font-weight:600;color:#111827;font-size:14px;">{formatted_date}</td></tr>
            <tr><td style="padding:5px 0;color:#6b7280;font-size:14px;">Time</td><td style="padding:5px 0;font-weight:600;color:#111827;font-size:14px;">{formatted_time} ({time_zone})</td></tr>
            <tr><td style="padding:5px 0;color:#6b7280;font-size:14px;">Duration</td><td style="padding:5px 0;color:#111827;font-size:14px;">{duration_minutes} minutes</td></tr>
            <tr><td style="padding:5px 0;color:#6b7280;font-size:14px;">Format</td><td style="padding:5px 0;color:#111827;font-size:14px;">{type_label}</td></tr>
          </table>
        </div>

        {meeting_html}
        {notes_html}

        <!-- Calendar invite note -->
        <div style="border:1px solid #e5e7eb;border-radius:6px;padding:14px 16px;margin:20px 0;background:#f9fafb;">
          <p style="margin:0;font-size:13px;color:#374151;">
            📅 A calendar invite is attached. Please <strong>accept or decline</strong> to confirm your availability.
          </p>
        </div>

        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
        <p style="margin:0;color:#4b5563;font-size:14px;line-height:1.6;">
          Please ensure you are available at the scheduled time. If you have any conflicts, contact HR as soon as possible.
        </p>
      </td></tr>

      <!-- Footer -->
      <tr><td style="background:#f9fafb;padding:20px 36px;border-top:1px solid #e5e7eb;text-align:center;">
        <p style="margin:0 0 4px 0;font-size:13px;font-weight:600;color:#111827;">AutoIntel Recruitment</p>
        <p style="margin:0;font-size:12px;color:#9ca3af;">This is an automated message. Please do not reply directly to this email.</p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>"""

    if ics_content:
        return send_email_with_ics(
            to_email=interviewer_email,
            subject=subject,
            body_text=body_text,
            body_html=body_html,
            ics_content=ics_content
        )
    return send_email(to_email=interviewer_email, subject=subject, body=body_html)


def send_offer_email(
    applicant_name: str,
    applicant_email: str,
    job_title: str,
    department: str,
    email_subject: str,
    email_body: str,
    attachment_path: Optional[str] = None,
    attachment_filename: Optional[str] = None,
    cc: Optional[str] = None,
    reply_to: Optional[str] = None,
) -> bool:
    """
    Send a job offer email to a hired candidate.

    IMAP SAFETY: Subject must NOT start with "Applicant -" to avoid
    being parsed by the resume intake system.
    Recommended prefix: "Job Offer –"

    Args:
        applicant_name: Candidate's full name
        applicant_email: Candidate's email address
        job_title: Position offered
        department: Department name
        email_subject: Editable subject (e.g. "Job Offer – Data Engineer")
        email_body: HTML or plain-text body (HR-authored)
        attachment_path: Local path to offer letter file (optional)
        attachment_filename: Display filename for attachment (optional)
        cc: CC email address (optional)
        reply_to: Reply-To address (defaults to FROM_EMAIL)

    Returns:
        True if sent successfully
    """
    import base64
    from email.mime.base import MIMEBase
    from email import encoders

    if not SMTP_HOST or not SMTP_USER:
        print("Email configuration missing.")
        return False

    # IMAP safety guard
    if email_subject.strip().lower().startswith("applicant -"):
        print("ERROR: Offer email subject must not start with 'Applicant -' (IMAP parser conflict).")
        return False

    try:
        msg = MIMEMultipart('mixed')
        msg['From'] = f"{FROM_NAME} <{FROM_EMAIL}>"
        msg['To'] = applicant_email
        msg['Subject'] = email_subject
        msg['Reply-To'] = reply_to or FROM_EMAIL
        if cc:
            msg['Cc'] = cc

        # Body
        alt = MIMEMultipart('alternative')
        alt.attach(MIMEText(email_body, 'plain', 'utf-8'))
        alt.attach(MIMEText(email_body, 'html', 'utf-8'))
        msg.attach(alt)

        # Attachment
        if attachment_path:
            with open(attachment_path, 'rb') as f:
                part = MIMEBase('application', 'octet-stream')
                part.set_payload(f.read())
            encoders.encode_base64(part)
            fname = attachment_filename or attachment_path.split('/')[-1]
            part.add_header('Content-Disposition', 'attachment', filename=fname)
            msg.attach(part)

        recipients = [applicant_email] + ([cc] if cc else [])
        server = smtplib.SMTP(SMTP_HOST, SMTP_PORT)
        server.starttls()
        server.login(SMTP_USER, SMTP_PASSWORD)
        server.sendmail(FROM_EMAIL, recipients, msg.as_string())
        server.quit()

        print(f"Offer email sent to {applicant_email}")
        return True

    except Exception as e:
        print(f"Failed to send offer email: {str(e)}")
        return False


def send_rejection_email(
    applicant_name: str,
    applicant_email: str,
    email_subject: str,
    email_body: str,
    cc: Optional[str] = None,
    reply_to: Optional[str] = None,
) -> bool:
    """
    Send a post-interview rejection email to a candidate.

    IMAP SAFETY: Subject must NOT start with "Applicant -" to avoid
    being parsed by the resume intake system.
    Recommended prefix: "Application Update –"

    Args:
        applicant_name: Candidate's full name
        applicant_email: Candidate's email address
        email_subject: Editable subject (e.g. "Application Update – Marketing Assistant")
        email_body: HTML or plain-text body (HR-authored)
        cc: CC email address (optional)
        reply_to: Reply-To address (defaults to FROM_EMAIL)

    Returns:
        True if sent successfully
    """
    if not SMTP_HOST or not SMTP_USER:
        print("Email configuration missing.")
        return False

    # IMAP safety guard
    if email_subject.strip().lower().startswith("applicant -"):
        print("ERROR: Rejection email subject must not start with 'Applicant -' (IMAP parser conflict).")
        return False

    try:
        msg = MIMEMultipart('alternative')
        msg['From'] = f"{FROM_NAME} <{FROM_EMAIL}>"
        msg['To'] = applicant_email
        msg['Subject'] = email_subject
        msg['Reply-To'] = reply_to or FROM_EMAIL
        if cc:
            msg['Cc'] = cc

        msg.attach(MIMEText(email_body, 'plain', 'utf-8'))
        msg.attach(MIMEText(email_body, 'html', 'utf-8'))

        recipients = [applicant_email] + ([cc] if cc else [])
        server = smtplib.SMTP(SMTP_HOST, SMTP_PORT)
        server.starttls()
        server.login(SMTP_USER, SMTP_PASSWORD)
        server.sendmail(FROM_EMAIL, recipients, msg.as_string())
        server.quit()

        print(f"Rejection email sent to {applicant_email}")
        return True

    except Exception as e:
        print(f"Failed to send rejection email: {str(e)}")
        return False


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
    print("  - send_interview_notification()")
    print("  - process_screening_decision()")
    print("  - generate_access_token()")
