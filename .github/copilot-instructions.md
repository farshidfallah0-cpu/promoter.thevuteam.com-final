# Copilot Instructions for Promoter Project

## Overview
This project is a full-stack application for managing promoters and their reports. It consists of a FastAPI backend and a React frontend. The backend uses SQLite and integrates with Google Sheets for data export. The frontend is built with Vite and React.

## Architecture
- **Backend** (`backend/app/`):
  - FastAPI app with endpoints for authentication, file uploads, promoter management, and reporting.
  - Uses SQLAlchemy ORM with SQLite (`promoters.db`).
  - Auth is JWT-based, with password hashing via `passlib`.
  - Integrates with Google Sheets via `sheets_client.py` using service account credentials.
  - Static files (uploads) are served from `/uploads`.
- **Frontend** (`frontend/`):
  - React app (Vite) with main entry in `App.jsx` and admin panel in `src/AdminPanel.jsx`.
  - Communicates with backend via REST API (see `API_URL` in frontend files).

## Developer Workflows
- **Backend**
  - Install dependencies: `pip install -r requirements.txt` (see `backend/app/requirements.txt`)
  - Run server: `uvicorn main:app --reload` (from `backend/app/`)
  - Database models: see `models.py`, auto-migrated on startup via `init_db()`
  - Google Sheets integration: requires valid `credentials.json` and environment variables for spreadsheet config
- **Frontend**
  - Install dependencies: `npm install` (from `frontend/`)
  - Run dev server: `npm run dev`
  - Build: `npm run build`

## Project-Specific Conventions
- **API URLs**: Use `https://api.promoter.thevuteam.com` for production, or local IP for development (see comments in frontend files).
- **Auth**: JWT tokens are stored in localStorage on the frontend and sent as `Authorization: Bearer ...` headers.
- **Uploads**: Images/files are uploaded to `/upload/image` and served from `/uploads/`.
- **Admin Panel**: All admin features are in `src/AdminPanel.jsx`.
- **Sensitive Data**: Service account credentials and secrets are not committed; use environment variables and `credentials.json`.

## Integration Points
- **Google Sheets**: Backend writes to Google Sheets using service account (see `sheets_client.py`).
- **Database**: SQLite file (`promoters.db`) in backend/app/.
- **Frontend/Backend Communication**: All data flows via REST API endpoints.

## Key Files
- Backend: `backend/app/main.py`, `backend/app/models.py`, `backend/app/auth.py`, `backend/app/sheets_client.py`
- Frontend: `frontend/App.jsx`, `frontend/src/AdminPanel.jsx`, `frontend/package.json`

## Example Patterns
- To add a new API endpoint, define it in `main.py` and update frontend API calls accordingly.
- To add a new field to reports, update `models.py`, database, and relevant frontend forms.

---
For more details, see the respective `README.md` files and code comments.
