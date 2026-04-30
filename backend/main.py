import os
import subprocess
import sys
from fastapi import FastAPI, Depends, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from supabase import create_client, Client

# Supabase Configuration for Backend
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

async def get_user(authorization: str = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid token")
    
    token = authorization.split(" ")[1]
    try:
        # Verify the token with Supabase
        user = supabase.auth.get_user(token)
        return user
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")

app = FastAPI(title="DynoCode API")

@app.get("/health")
def health_check():
    try:
        problems = load_problems()
        return {"status": "healthy", "problems_count": len(problems)}
    except Exception as e:
        return {"status": "unhealthy", "error": str(e)}, 500

# CORS for Frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://dynocode.in",
        "https://www.dynocode.in",
        "https://orca-app-daxtp.ondigitalocean.app"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Data Loading Logic

def load_problems():
    """Fetch all problems from Supabase."""
    try:
        response = supabase.table("problems").select("*").order("id").execute()
        probs = []
        for p in response.data:
            probs.append({
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
            })
        return probs
    except Exception as e:
        print(f"❌ Error loading problems from Supabase: {e}")
        return []


# ---------- Models ----------

class RunRequest(BaseModel):
    code: str
    input: str = ""


class SubmitRequest(BaseModel):
    code: str
    problemId: int


# ---------- Helpers ----------

def execute_code(code: str, stdin_input: str = "", timeout: int = 2) -> dict:
    """Run Python code in a subprocess with optional stdin and a timeout."""
    
    # 🛡️ SECURITY GUARD: Block dangerous operations
    # We disable common modules and use an audit hook to block system calls
    guard_script = """
import sys

# Disable dangerous modules
for mod in ['os', 'subprocess', 'shutil', 'socket', 'urllib', 'requests']:
    sys.modules[mod] = None

# Audit hook to block dangerous actions (Python 3.8+)
def audit_hook(event, args):
    blocked_events = {
        'os.system', 'os.spawn', 'subprocess.Popen', 'socket.connect',
        'open', 'compile', 'pathlib.Path.unlink', 'pathlib.Path.mkdir'
    }
    if event in blocked_events:
        # We allow reading sys.stdin but block generic 'open'
        if event == 'open' and args[0] in [0, 1, 2]: # Allow stdin/out/err
            return
        raise RuntimeError(f"❌ Security Error: '{event}' is not allowed in this environment.")

sys.addaudithook(audit_hook)

# --- USER CODE BEGINS ---
"""
    full_code = guard_script + code
    
    try:
        result = subprocess.run(
            [sys.executable, "-c", full_code],
            input=stdin_input,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        stdout = result.stdout
        stderr = result.stderr

        if result.returncode != 0:
            error_msg = stderr.strip()
            # Provide a friendlier message for common beginner errors
            if "EOFError" in error_msg:
                error_msg = (
                    "⚠️ EOFError: Your code tried to read input, but no input was provided.\n\n"
                    "💡 Tip: Add your test input in the \"Custom Input (stdin)\" box above the Run button.\n"
                    "Put each value on a separate line."
                )
            return {"output": error_msg, "error": True}

        return {"output": stdout, "error": False}

    except subprocess.TimeoutExpired:
        return {
            "output": "⏰ Error: Code execution timed out (limit: 2 seconds). Check for infinite loops.",
            "error": True,
        }
    except Exception as e:
        return {"output": f"Error: {str(e)}", "error": True}


# ---------- Routes ----------

@app.get("/problems")
def get_problems():
    """Return all problems for the list view (public)."""
    return load_problems()

@app.get("/problems/{problem_id}")
def get_problem(problem_id: int):
    """Return a single problem by ID."""
    problems = load_problems()
    for p in problems:
        if p["id"] == problem_id:
            return p
    return {"error": "Problem not found"}, 404


@app.post("/run")
def run_code(req: RunRequest, user=Depends(get_user)):
    """Execute user code with optional stdin input and return output."""
    result = execute_code(req.code, req.input)
    return {"output": result["output"], "error": result["error"]}


@app.post("/submit")
def submit_code(req: SubmitRequest, user=Depends(get_user)):
    """Run code against all test cases for the given problem."""
    problems = load_problems()
    problem = None
    for p in problems:
        if p["id"] == req.problemId:
            problem = p
            break

    if not problem:
        return {"status": "error", "message": "Problem not found"}

    test_cases = problem["testCases"]
    results = []
    all_passed = True

    for i, tc in enumerate(test_cases):
        result = execute_code(req.code, tc["input"])
        actual = result["output"].strip()
        expected = tc["expectedOutput"].strip()
        passed = actual == expected

        if not passed:
            all_passed = False

        results.append({
            "testCase": i + 1,
            "passed": passed,
            "expected": expected,
            "actual": actual,
            "input": tc["input"],
            "error": result["error"],
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
