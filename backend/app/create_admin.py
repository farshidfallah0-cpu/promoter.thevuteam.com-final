#!/usr/bin/env python3
"""
Script to create an admin user or promote existing user to admin.
Run this script from the backend/app directory.

Usage:
    python create_admin.py <username> <password> [--full-name "Full Name"]
    python create_admin.py --promote <username>
"""

import sys
import argparse
from models import SessionLocal, Promoter, init_db
from auth import get_password_hash

def create_admin(username: str, password: str, full_name: str = None):
    """Create a new admin user"""
    init_db()
    db = SessionLocal()
    
    # Check if user exists
    existing = db.query(Promoter).filter(Promoter.username == username).first()
    if existing:
        print(f"❌ User '{username}' already exists!")
        print(f"   Use --promote to make them an admin.")
        db.close()
        return False
    
    # Create new admin user
    hashed = get_password_hash(password)
    admin = Promoter(
        username=username,
        hashed_password=hashed,
        full_name=full_name or username,
        is_admin=True
    )
    db.add(admin)
    db.commit()
    db.close()
    
    print(f"✅ Admin user '{username}' created successfully!")
    return True

def promote_to_admin(username: str):
    """Promote existing user to admin"""
    init_db()
    db = SessionLocal()
    
    user = db.query(Promoter).filter(Promoter.username == username).first()
    if not user:
        print(f"❌ User '{username}' not found!")
        db.close()
        return False
    
    if user.is_admin:
        print(f"ℹ️  User '{username}' is already an admin.")
        db.close()
        return True
    
    user.is_admin = True
    db.commit()
    db.close()
    
    print(f"✅ User '{username}' has been promoted to admin!")
    return True

def list_admins():
    """List all admin users"""
    init_db()
    db = SessionLocal()
    
    admins = db.query(Promoter).filter(Promoter.is_admin == True).all()
    db.close()
    
    if not admins:
        print("ℹ️  No admin users found.")
        return
    
    print(f"\n👑 Admin Users ({len(admins)}):")
    print("-" * 40)
    for admin in admins:
        print(f"  • {admin.username} ({admin.full_name or 'No name'})")
    print()

def main():
    parser = argparse.ArgumentParser(description='Create or manage admin users')
    parser.add_argument('username', nargs='?', help='Username for new admin')
    parser.add_argument('password', nargs='?', help='Password for new admin')
    parser.add_argument('--full-name', '-n', help='Full name for admin')
    parser.add_argument('--promote', '-p', metavar='USERNAME', help='Promote existing user to admin')
    parser.add_argument('--list', '-l', action='store_true', help='List all admins')
    
    args = parser.parse_args()
    
    if args.list:
        list_admins()
        return
    
    if args.promote:
        promote_to_admin(args.promote)
        return
    
    if not args.username or not args.password:
        parser.print_help()
        print("\n📌 Examples:")
        print("  python create_admin.py admin mypassword123")
        print("  python create_admin.py admin mypassword123 --full-name 'مدیر سیستم'")
        print("  python create_admin.py --promote existing_user")
        print("  python create_admin.py --list")
        return
    
    create_admin(args.username, args.password, args.full_name)

if __name__ == "__main__":
    main()
