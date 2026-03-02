"""
Script to create auth.users for existing applicants and link them via user_id
Run this locally after setting up your .env with SUPABASE_SERVICE_KEY
"""

import os
import sys

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

def link_applicants_to_auth():
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        print("Error: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env")
        return
    
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    
    # Get all applicants without user_id
    response = supabase.table("applicants").select("*").is_("user_id", "null").execute()
    
    if not response.data:
        print("No applicants without user_id found!")
        return
    
    print(f"Found {len(response.data)} applicants to link...")
    
    for applicant in response.data:
        email = applicant["email"]
        applicant_id = applicant["id"]
        
        try:
            # Create auth user with temporary password
            # The password doesn't matter since they'll use access_token to login
            temp_password = f"temp_{applicant_id[:8]}!"
            
            auth_response = supabase.auth.admin.create_user({
                "email": email,
                "password": temp_password,
                "email_confirm": True,  # Auto-confirm email
                "user_metadata": {
                    "applicant_id": applicant_id
                }
            })
            
            if auth_response.user:
                user_id = auth_response.user.id
                
                # Update applicant with user_id
                supabase.table("applicants").update({
                    "user_id": user_id
                }).eq("id", applicant_id).execute()
                
                print(f"OK Linked {email} -> {user_id}")
            else:
                print(f"X Failed to create auth user for {email}")
                
        except Exception as e:
            print(f"X Error for {email}: {str(e)}")
    
    print("\nDone! Applicants are now linked to auth.users")

if __name__ == "__main__":
    link_applicants_to_auth()
