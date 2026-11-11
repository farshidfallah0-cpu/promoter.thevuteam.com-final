from models import SessionLocal, Promoter, init_db
from auth import get_password_hash
import sys

def reset_password(username, new_password):
    init_db()
    db = SessionLocal()
    user = db.query(Promoter).filter(Promoter.username == username).first()
    if not user:
        print(f"User {username} not found")
        return
    
    user.hashed_password = get_password_hash(new_password)
    db.commit()
    print(f"Password for {username} reset successfully")
    db.close()

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python reset_password.py <username> <new_password>")
        sys.exit(1)
    reset_password(sys.argv[1], sys.argv[2])
