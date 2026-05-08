import os
import subprocess
import sys
import base64
import time
from datetime import datetime, timedelta
from typing import List, Optional
from fastapi import FastAPI, Depends, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from supabase import create_client, Client
from dotenv import load_dotenv

# Try importing resource for Unix-based systems (Mac/Linux)
try:
    import resource
except ImportError:
    resource = None

# Load environment variables
load_dotenv()

# ==========================================
# 1. Configuration & Database
# ==========================================

# Simple In-Memory Cache
_problems_cache = None
_last_fetch_time = 0
CACHE_TTL = 300 # 5 minutes

# Supabase Setup
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("⚠️ WARNING: SUPABASE_URL or SUPABASE_KEY is not set.")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

def load_problems_from_db():
    """Fetches and maps problems from Supabase to frontend-ready schema with 5m caching."""
    global _problems_cache, _last_fetch_time
    import time
    
    current_time = time.time()
    
    # Return cached data if within TTL
    if _problems_cache is not None and (current_time - _last_fetch_time) < CACHE_TTL:
        return _problems_cache

    try:
        print("🔄 Cache expired or empty. Fetching problems from Supabase...")
        response = supabase.table("problems").select("*").order("id").execute()
        mapped_problems = [
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
        
        # Update Cache
        _problems_cache = mapped_problems
        _last_fetch_time = current_time
        
        return mapped_problems
    except Exception as e:
        print(f"❌ Database Error: {e}")
        # If DB fails, return stale cache if available, else empty list
        return _problems_cache if _problems_cache else []

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
# 4. Code Execution Engine (Pro Version)
# ==========================================

def execute_python_code(code: str, stdin_input: str = "", timeout: int = 2) -> dict:
    """Executes code in a secured subprocess with resource limits and audit hooks."""
    
    # 1. Base64 encode user code to prevent string injection attacks
    encoded_code = base64.b64encode(code.encode()).decode()
    
    # 2. Build the guard script
    guard_script = f"""
import sys
import base64

# Attempt to set resource limits (Memory: 64MB)
try:
    import resource
    # RLIMIT_AS: Address space (virtual memory)
    # 64MB = 64 * 1024 * 1024
    limit = 64 * 1024 * 1024
    resource.setrlimit(resource.RLIMIT_AS, (limit, limit))
except Exception:
    pass

# Security Guard: Block dangerous modules and low-level system calls
def audit_hook(event, args):
    blocked_events = ['os.system', 'os.spawn', 'subprocess.Popen', 'socket.', 'open']
    if any(event.startswith(e) for e in blocked_events):
        raise RuntimeError(f"Forbidden operation: {{event}}")

if hasattr(sys, 'addaudithook'):
    sys.addaudithook(audit_hook)

# Disable dangerous modules already in sys.modules
for mod in ['os', 'subprocess', 'requests', 'socket', 'urllib']:
    if mod in sys.modules:
        del sys.modules[mod]

# Execute the actual user code
try:
    user_code = base64.b64decode("{encoded_code}").decode()
    # Define a clean environment for execution
    safe_globals = {{
        '__name__': '__main__',
        'print': print,
        'input': input,
        'range': range,
        'len': len,
        'int': int,
        'float': float,
        'str': str,
        'list': list,
        'dict': dict,
        'set': set,
        'tuple': tuple,
        'sum': sum,
        'min': min,
        'max': max,
        'abs': abs,
        'enumerate': enumerate,
        'zip': zip,
        'sorted': sorted,
        'reversed': reversed,
        'bool': bool,
        'Exception': Exception,
        'RuntimeError': RuntimeError,
        'ValueError': ValueError,
        'TypeError': TypeError,
        'IndexError': IndexError,
        'KeyError': KeyError,
        'StopIteration': StopIteration,
    }}
    exec(user_code, safe_globals)
except Exception as e:
    print(f"Runtime Error: {{e}}", file=sys.stderr)
    sys.exit(1)
"""
    
    try:
        proc = subprocess.run(
            [sys.executable, "-c", guard_script],
            input=stdin_input,
            text=True,
            capture_output=True,
            timeout=timeout
        )
        
        # Combine output and error, but truncate to 10,000 characters to prevent memory DOS
        stdout_clean = proc.stdout[:10000]
        stderr_clean = proc.stderr[:10000]
        
        output = stdout_clean if not stderr_clean else stderr_clean
        return {"output": output or stdout_clean, "error": proc.returncode != 0}
        
    except subprocess.TimeoutExpired:
        return {"output": "Error: Time Limit Exceeded (2s).", "error": True}
    except Exception as e:
        return {"output": f"Internal System Error: {str(e)}", "error": True}

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
    start = time.time()
    result = execute_python_code(req.code, req.input)
    elapsed_ms = int((time.time() - start) * 1000)
    try:
        user_id = user.user.id if hasattr(user, 'user') else None
        if user_id:
            supabase.table("activity_log").insert({
                "user_id": user_id,
                "event_type": "run",
                "status": "error" if result.get("error") else "success",
                "response_time_ms": elapsed_ms,
            }).execute()
    except Exception as log_err:
        print(f"⚠️ Activity log (run) failed: {log_err}")
    return result

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

    submit_status = "passed" if all_passed else "failed"
    try:
        user_id = user.user.id if hasattr(user, 'user') else None
        if user_id:
            supabase.table("activity_log").insert({
                "user_id": user_id,
                "event_type": "submit",
                "problem_id": req.problemId,
                "status": submit_status,
            }).execute()
    except Exception as log_err:
        print(f"⚠️ Activity log (submit) failed: {log_err}")
    return {
        "status": submit_status,
        "results": results,
        "totalPassed": sum(1 for r in results if r["passed"]),
        "totalTests": len(results),
    }

@app.get("/metrics")
def get_metrics():
    """Provides comprehensive P0 platform metrics."""
    try:
        now = datetime.now()
        today = now.date()

        # ── Aggregate Counts ──
        problems_res = supabase.table("problems").select("*", count="exact").execute()
        total_problems = problems_res.count if problems_res.count is not None else len(problems_res.data)

        try:
            auth_users = supabase.auth.admin.list_users()
            total_users = len(auth_users)
        except Exception:
            profiles_res = supabase.table("profiles").select("*", count="exact").execute()
            total_users = profiles_res.count if profiles_res.count is not None else 0
            auth_users = None

        progress_res = supabase.table("user_progress").select("user_id, problem_id, status, updated_at").execute()
        progress_data = progress_res.data or []
        total_solved = sum(1 for p in progress_data if p["status"] == "solved")

        # ── Submission counts from activity_log ──
        total_runs = 0
        total_submits = 0
        timeout_count = 0
        response_times = []
        activity_data = []
        try:
            activity_res = supabase.table("activity_log").select("*").execute()
            activity_data = activity_res.data or []
            total_runs = sum(1 for a in activity_data if a["event_type"] == "run")
            total_submits = sum(1 for a in activity_data if a["event_type"] == "submit")
            timeout_count = sum(1 for a in activity_data if a.get("status") == "timeout")
            response_times = [a["response_time_ms"] for a in activity_data if a.get("response_time_ms")]
        except Exception:
            pass

        # ── DAU / WAU / Stickiness ──
        today_str = today.strftime("%Y-%m-%d")
        week_ago = (now - timedelta(days=7)).date()
        dau_users = set()
        wau_users = set()
        for p in progress_data:
            u_date = p["updated_at"][:10]
            if u_date == today_str:
                dau_users.add(p["user_id"])
            if u_date >= week_ago.strftime("%Y-%m-%d"):
                wau_users.add(p["user_id"])
        for a in activity_data:
            a_date = a["created_at"][:10]
            if a_date == today_str:
                dau_users.add(a["user_id"])
            if a_date >= week_ago.strftime("%Y-%m-%d"):
                wau_users.add(a["user_id"])

        dau = len(dau_users)
        wau = len(wau_users)
        stickiness = round((dau / wau) * 100, 1) if wau > 0 else 0

        # ── Avg problems solved per active user ──
        users_with_solves = {}
        for p in progress_data:
            if p["status"] == "solved":
                users_with_solves.setdefault(p["user_id"], 0)
                users_with_solves[p["user_id"]] += 1
        avg_solved_per_user = round(sum(users_with_solves.values()) / len(users_with_solves), 1) if users_with_solves else 0

        # ── Signup → First Problem Rate ──
        users_who_started = len(set(p["user_id"] for p in progress_data))
        signup_to_problem_rate = round((users_who_started / total_users) * 100, 1) if total_users > 0 else 0

        # ── Day-1 / Day-7 Retention (cohort from last 14 days) ──
        day1_retained = 0
        day7_retained = 0
        cohort_size = 0
        if auth_users and isinstance(auth_users, list):
            user_activity_dates = {}
            for p in progress_data:
                user_activity_dates.setdefault(p["user_id"], set()).add(p["updated_at"][:10])
            for a in activity_data:
                if a.get("user_id"):
                    user_activity_dates.setdefault(a["user_id"], set()).add(a["created_at"][:10])

            for u in auth_users:
                created_at = getattr(u, 'created_at', u.get('created_at') if isinstance(u, dict) else None)
                uid = getattr(u, 'id', u.get('id') if isinstance(u, dict) else None)
                if not created_at or not uid:
                    continue
                reg_date = str(created_at)[:10]
                try:
                    reg_dt = datetime.strptime(reg_date, "%Y-%m-%d").date()
                except Exception:
                    continue
                if reg_dt < (today - timedelta(days=14)):
                    continue
                cohort_size += 1
                dates = user_activity_dates.get(uid, set())
                d1 = (reg_dt + timedelta(days=1)).strftime("%Y-%m-%d")
                d7 = (reg_dt + timedelta(days=7)).strftime("%Y-%m-%d")
                if d1 in dates:
                    day1_retained += 1
                if d7 in dates:
                    day7_retained += 1

        day1_retention = round((day1_retained / cohort_size) * 100, 1) if cohort_size > 0 else 0
        day7_retention = round((day7_retained / cohort_size) * 100, 1) if cohort_size > 0 else 0

        # ── API Performance (P50 / P95) ──
        p50_ms = 0
        p95_ms = 0
        if response_times:
            sorted_rt = sorted(response_times)
            p50_ms = sorted_rt[len(sorted_rt) // 2]
            p95_ms = sorted_rt[int(len(sorted_rt) * 0.95)]
        timeout_rate = round((timeout_count / (total_runs + total_submits)) * 100, 1) if (total_runs + total_submits) > 0 else 0

        # ── 7-Day History (unchanged logic) ──
        history = {}
        days_list = []
        for i in range(6, -1, -1):
            day_dt = (now - timedelta(days=i)).date()
            day_str = day_dt.strftime("%Y-%m-%d")
            days_list.append(day_str)
            history[day_str] = {"solved": 0, "active": set(), "registered": 0, "submissions": 0}

        if auth_users and isinstance(auth_users, list):
            for u in auth_users:
                created_at = getattr(u, 'created_at', u.get('created_at') if isinstance(u, dict) else None)
                if created_at:
                    reg_day = str(created_at)[:10]
                    if reg_day in history:
                        history[reg_day]["registered"] += 1

        for p in progress_data:
            u_str = p["updated_at"][:10]
            if u_str in history:
                if p["status"] == "solved":
                    history[u_str]["solved"] += 1
                history[u_str]["active"].add(p["user_id"])

        for a in activity_data:
            a_str = a["created_at"][:10]
            if a_str in history and a["event_type"] in ("run", "submit"):
                history[a_str]["submissions"] += 1
                history[a_str]["active"].add(a["user_id"])

        graph_data = [{
            "date": day,
            "solved": history[day]["solved"],
            "active": len(history[day]["active"]),
            "registered": history[day]["registered"],
            "submissions": history[day]["submissions"],
        } for day in days_list]

        return {
            # Aggregate
            "total_users": total_users,
            "total_solved": total_solved,
            "total_problems": total_problems,
            "total_submissions": total_runs + total_submits,
            # Engagement
            "dau": dau,
            "wau": wau,
            "stickiness": stickiness,
            # Learning
            "avg_solved_per_user": avg_solved_per_user,
            "signup_to_problem_rate": signup_to_problem_rate,
            # Retention
            "day1_retention": day1_retention,
            "day7_retention": day7_retention,
            "retention_cohort_size": cohort_size,
            # Platform Health
            "p50_response_ms": p50_ms,
            "p95_response_ms": p95_ms,
            "timeout_rate": timeout_rate,
            # History
            "history": graph_data,
        }
    except Exception as e:
        print(f"❌ Metrics Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
