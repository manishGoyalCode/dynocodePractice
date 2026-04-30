import os
import subprocess
import sys
from typing import List, Optional
from fastapi import FastAPI, Depends, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from supabase import create_client, Client
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# ==========================================
# 1. Configuration & Database
# ==========================================

# Supabase Setup
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("⚠️ WARNING: SUPABASE_URL or SUPABASE_KEY is not set.")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

def load_problems_from_db():
    """Fetches and maps problems from Supabase to frontend-ready schema."""
    try:
        response = supabase.table("problems").select("*").order("id").execute()
        return [
            {
                "id": p["id"],
                "title": p["title"],
                "description": p["description"],
                "module": p["module"],
                "moduleOrder": p.get("module_order", 0),
                "order": p.get("problem_order", 0),
                "difficulty": p["difficulty"],
                "concepts": p.get("concepts", []),
                "hints": p.get("hints", []),
                "starterCode": p.get("initial_code", ""),
                "solution": p.get("solution_code", ""),
                "testCases": p.get("test_cases", []),
                "examples": p.get("examples", []),
                "conceptLesson": p.get("concept_lesson", "")
            }
            for p in response.data
        ]
    except Exception as e:
        print(f"❌ Database Error: {e}")
        return []

# ==========================================
# 2. Authentication Dependency
# ==========================================

async def get_current_user(authorization: str = Header(None)):
    """Verifies the Supabase JWT token in the Authorization header."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized: Missing token")
    
    token = authorization.split(" ")[1]
    try:
        user = supabase.auth.get_user(token)
        return user
    except Exception:
        raise HTTPException(status_code=401, detail="Unauthorized: Invalid token")

# ==========================================
# 3. Models
# ==========================================

class RunRequest(BaseModel):
    code: str = Field(..., example="print('Hello World')")
    input: str = Field("", example="user_input")

class SubmitRequest(BaseModel):
    code: str
    problemId: int

# ==========================================
# 4. Code Execution Engine
# ==========================================

def execute_python_code(code: str, stdin_input: str = "", timeout: int = 2) -> dict:
    """Executes code in a secured subprocess with strict audit hooks."""
    
    # 🛡️ SECURITY GUARD: Prevents system calls, file access, and network requests
    guard_script = """
import sys
import os

# Disable dangerous modules
for mod in ['os', 'subprocess', 'requests', 'socket', 'urllib']:
    if mod in sys.modules:
        del sys.modules[mod]

# Audit hook to block low-level system calls
def audit_hook(event, args):
    blocked_events = ['os.system', 'os.spawn', 'subprocess.Popen', 'socket.', 'open']
    if any(event.startswith(e) for e in blocked_events):
        raise RuntimeError(f"Forbidden operation: {event}")

if hasattr(sys, 'addaudithook'):
    sys.addaudithook(audit_hook)

# Execute the actual code
{CODE}
"""
    full_code = guard_script.replace("{CODE}", code)
    
    try:
        proc = subprocess.run(
            [sys.executable, "-c", full_code],
            input=stdin_input,
            text=True,
            capture_output=True,
            timeout=timeout
        )
        return {"output": proc.stdout or proc.stderr, "error": proc.returncode != 0}
    except subprocess.TimeoutExpired:
        return {"output": "Error: Execution timed out (2s limit).", "error": True}
    except Exception as e:
        return {"output": f"Internal Error: {str(e)}", "error": True}

# ==========================================
# 5. API Routes
# ==========================================

app = FastAPI(title="DynoCode API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, restrict this to your domains
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health():
    return {"status": "online", "database": "connected" if supabase else "error"}

@app.get("/problems")
def list_problems():
    """Publicly available problem list."""
    return load_problems_from_db()

@app.post("/run")
def run(req: RunRequest, user=Depends(get_current_user)):
    """Runs code for authenticated users."""
    return execute_python_code(req.code, req.input)

@app.post("/submit")
def submit(req: SubmitRequest, user=Depends(get_current_user)):
    """Validates code against test cases."""
    problems = load_problems_from_db()
    problem = next((p for p in problems if p["id"] == req.problemId), None)

    if not problem:
        raise HTTPException(status_code=404, detail="Problem not found")

    test_cases = problem.get("testCases", [])
    results = []
    all_passed = True

    for i, tc in enumerate(test_cases):
        res = execute_python_code(req.code, tc.get("input", ""))
        actual = res["output"].strip()
        expected = tc.get("expectedOutput", "").strip()
        passed = (actual == expected) and not res["error"]

        if not passed:
            all_passed = False

        results.append({
            "testCase": i + 1,
            "passed": passed,
            "expected": expected,
            "actual": actual,
            "input": tc.get("input", ""),
            "error": res["error"]
        })

    return {
        "status": "passed" if all_passed else "failed",
        "results": results,
        "totalPassed": sum(1 for r in results if r["passed"]),
        "totalTests": len(results),
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
