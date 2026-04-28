# ⚡ CodePractice — Learn Python by Doing

A beginner-friendly coding practice platform with an interactive code editor, instant execution, and automated test cases.

## Tech Stack

| Layer    | Technology        |
|----------|-------------------|
| Frontend | Next.js (React)   |
| Editor   | Monaco Editor     |
| Backend  | FastAPI (Python)   |
| Storage  | JSON (in-memory)  |
| Execution| Python subprocess |

## Project Structure

```
pythonLearning/
├── backend/
│   ├── main.py              # FastAPI server
│   └── requirements.txt     # Python dependencies
├── frontend/
│   ├── app/
│   │   ├── globals.css      # Design system
│   │   ├── layout.js        # Root layout
│   │   └── page.js          # Main page component
│   └── package.json
├── problems.json            # Problem definitions + test cases
└── README.md
```

## Getting Started

### 1. Start the Backend

```bash
cd backend
pip3 install -r requirements.txt
python3 -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

Backend will run at **http://localhost:8000**

### 2. Start the Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend will run at **http://localhost:3000**

### 3. Open in Browser

Navigate to **http://localhost:3000** to start coding!

## Features

- 📋 **Problem Descriptions** — Read the problem, see examples
- ✏️ **Monaco Code Editor** — VS Code-like editing experience
- ▶️ **Run Code** — Execute your Python code with custom input
- 🚀 **Submit** — Run against hidden test cases and see pass/fail
- 📊 **Test Results** — See expected vs actual output for each test case
- ⏰ **Timeout Protection** — 2-second limit prevents infinite loops
- 🎨 **Dark Theme** — Easy on the eyes

## API Reference

| Endpoint        | Method | Description                    |
|-----------------|--------|--------------------------------|
| `/problems`     | GET    | List all problems              |
| `/problems/:id` | GET    | Get a single problem           |
| `/run`          | POST   | Execute code with custom input |
| `/submit`       | POST   | Submit code against test cases |

## Adding New Problems

Edit `problems.json` to add new problems. Each problem needs:

```json
{
  "id": 4,
  "title": "Your Problem Title",
  "description": "Problem description with **markdown** support",
  "examples": [{ "input": "...", "output": "..." }],
  "testCases": [{ "input": "...", "expectedOutput": "..." }],
  "starterCode": "# Write your code here\n"
}
```
