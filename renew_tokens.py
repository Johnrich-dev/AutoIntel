#!/usr/bin/env python3
"""
Renew access tokens for test users (John and Jane)
"""

import uuid
import os
from datetime import datetime, timedelta

from supabase import create_client

# Load environment variables from .env if present
try:
    from dotenv import load_dotenv  # type: ignore

    load_dotenv()
except Exception:
    pass

# Supabase configuration
SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_SERVICE_KEY = os.getenv('SUPABASE_SERVICE_KEY')

if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    raise RuntimeError("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY environment variables.")

supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

def renew_token(email, name, position):
    """Generate a new access token for a user."""
    new_token = f"token_{name.split()[0].lower()}_{uuid.uuid4().hex[:8]}"
    expires_at = (datetime.now() + timedelta(days=2)).isoformat()
    
    try:
        result = supabase.table('applicants').update({
            'access_token': new_token,
            'access_expires_at': expires_at
        }).eq('email', email).execute()
        
        if result.data:
            print(f"[OK] Renewed token for {name} ({email})")
            print(f"  New token: {new_token}")
            print(f"  Expires at: {expires_at}")
            return new_token
        else:
            print(f"[FAIL] User not found: {email}")
            return None
    except Exception as e:
        print(f"[FAIL] Failed to renew token for {email}: {e}")
        return None

if __name__ == "__main__":
    print("Renewing access tokens for John and Jane...\n")
    
    john_token = renew_token('john.doe@example.com', 'John Doe', 'Software Engineer')
    jane_token = renew_token('jane.smith@example.com', 'Jane Smith', 'Product Manager')
    
    print("\n=== Token Renewal Summary ===")
    if john_token:
        print(f"John: {john_token}")
    if jane_token:
        print(f"Jane: {jane_token}")
    print("\nTokens renewed successfully!")
