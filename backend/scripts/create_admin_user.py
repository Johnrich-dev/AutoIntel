#!/usr/bin/env python3
"""
Create Admin User Script
Run this script to create an admin user in Supabase Auth.

Usage:
    python scripts/create_admin_user.py

Requirements:
    - SUPABASE_SERVICE_ROLE_KEY environment variable
    - SUPABASE_URL environment variable (or pass as argument)
"""

import os
import sys
import requests
from dotenv import load_dotenv

load_dotenv()

def create_admin_user(email: str, password: str, supabase_url: str = None, service_role_key: str = None):
    """
    Create an admin user in Supabase using the Admin API.
    """
    # Get environment variables
    supabase_url = supabase_url or os.getenv('SUPABASE_URL')
    service_role_key = service_role_key or os.getenv('SUPABASE_SERVICE_ROLE_KEY')
    
    if not supabase_url:
        print("Error: SUPABASE_URL not found. Set it in .env file or pass as argument.")
        return False
    
    if not service_role_key:
        print("Error: SUPABASE_SERVICE_ROLE_KEY not found. Set it in .env file or pass as argument.")
        return False
    
    # Clean up URL (remove trailing slash)
    supabase_url = supabase_url.rstrip('/')
    
    # Admin API endpoint to create user
    url = f"{supabase_url}/auth/v1/admin/users"
    
    headers = {
        "Authorization": f"Bearer {service_role_key}",
        "apikey": service_role_key,
        "Content-Type": "application/json"
    }
    
    data = {
        "email": email,
        "password": password,
        "email_confirm": True,  # Auto-confirm email
        "user_metadata": {
            "role": "admin"
        }
    }
    
    try:
        response = requests.post(url, headers=headers, json=data)
        
        if response.status_code == 200:
            user_data = response.json()
            print(f"✅ Admin user created successfully!")
            print(f"   User ID: {user_data.get('id')}")
            print(f"   Email: {email}")
            print(f"   Role: admin")
            return True
        elif response.status_code == 422:
            error_data = response.json()
            if "User already registered" in str(error_data):
                print(f"⚠️  User '{email}' already exists!")
                return True
            print(f"❌ Error: {error_data}")
            return False
        else:
            print(f"❌ Error: HTTP {response.status_code}")
            print(f"   Response: {response.text}")
            return False
            
    except requests.exceptions.RequestException as e:
        print(f"❌ Network error: {e}")
        return False

def main():
    # Default admin credentials
    admin_email = "admin@autointel.com"
    admin_password = "Admin@123456"
    
    print("=" * 50)
    print("Creating Admin User for AutoIntel")
    print("=" * 50)
    print(f"Email: {admin_email}")
    print(f"Password: {admin_password}")
    print("-" * 50)
    
    # Check for custom credentials from command line
    if len(sys.argv) >= 3:
        admin_email = sys.argv[1]
        admin_password = sys.argv[2]
        print(f"Using custom credentials from command line")
    
    success = create_admin_user(admin_email, admin_password)
    
    if success:
        print("-" * 50)
        print("You can now log in to the admin dashboard with:")
        print(f"  Email: {admin_email}")
        print(f"  Password: {admin_password}")
    
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())