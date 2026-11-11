import sys, os
sys.path.append(os.path.abspath('app'))
from models import SessionLocal, Promoter
from auth import get_password_hash

db = SessionLocal()
try:
    username = 'K-parisa'
    # The password is no longer stored in the source (this file is published): pass it via the environment,
    #   ADMIN_PASSWORD='...' python make_admin.py
    plain_password = os.environ.get('ADMIN_PASSWORD')
    if not plain_password:
        sys.exit('Set ADMIN_PASSWORD in the environment first.')
    
    # Check if user already exists
    user = db.query(Promoter).filter(Promoter.username == username).first()
    if user:
        user.is_admin = True
        user.hashed_password = get_password_hash(plain_password)
        user.plain_password = plain_password
        db.commit()
        print('✅ Admin user updated successfully on server!')
    else:
        new_user = Promoter(
            username=username,
            full_name='پریسا (ادمین)',
            hashed_password=get_password_hash(plain_password),
            plain_password=plain_password,
            is_admin=True,
            role='admin'
        )
        db.add(new_user)
        db.commit()
        print('✅ Admin user created successfully on server!')
except Exception as e:
    print('❌ Error:', e)
finally:
    db.close()
