# ⚡ DynoCode — Learn Python by Doing

A beginner-friendly coding practice platform with an interactive code editor, instant execution, and automated test cases.

## 🚀 Fast Deployment (Docker)

To deploy the entire stack on your VM in one command:

```bash
chmod +x deploy.sh
./deploy.sh
```

This will:
- Build optimized images for Backend and Frontend.
- Map the frontend to port `3000`.
- Map the backend to port `8000`.
- Mount `problems.json` as a volume for easy content updates.

---

## Tech Stack

| Layer    | Technology        |
|----------|-------------------|
| Frontend | Next.js (React)   |
| Editor   | Monaco Editor     |
| Backend  | FastAPI (Python)   |
| Storage  | JSON (Local File) |
| Execution| Python subprocess |

## Project Structure

```
pythonLearning/
├── backend/
│   ├── main.py              # FastAPI server
│   ├── requirements.txt     # Python dependencies
│   └── Dockerfile           # Optimized backend image
├── frontend/
│   ├── app/                 # Next.js code
│   └── Dockerfile           # Multi-stage production image
├── problems.json            # Problem definitions + test cases
├── docker-compose.yml       # Orchestration
├── deploy.sh                # One-click deployment
└── README.md
```

## Manual Getting Started

### 1. Start the Backend

```bash
cd backend
pip3 install -r requirements.txt
python3 -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### 2. Start the Frontend

```bash
cd frontend
npm install
npm run dev
```

## Features

- 🏠 **Dashboard** — Track progress, streaks, and module completion.
- 📖 **Concept Cards** — Mini-lessons integrated into problems.
- 🔓 **Reference Solutions** — Unlock solutions after 3 attempts or a successful solve.
- ✏️ **Monaco Code Editor** — VS Code-like experience.
- 🚀 **Test Cases** — Real-time validation against hidden cases.
- 📊 **Responsive Layout** — Works across different screen sizes.
- ⏰ **Timeout Protection** — Secure execution with limits.

## 📂 Content Management

Edit `problems.json` to add or modify problems. The backend automatically picks up changes. See `problems.md` for the full schema guide.

