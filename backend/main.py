import json
import logging
import os
import subprocess
import sys
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, ValidationError
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

logger = logging.getLogger("dynocode")
logging.basicConfig(level=logging.INFO)


# ---------- Problem schema ----------

class Example(BaseModel):
    input: str = ""
    output: str = ""


class TestCase(BaseModel):
    input: str = ""
    expectedOutput: str = ""


class ConceptLesson(BaseModel):
    title: str
    content: str
    code: str = ""


class Problem(BaseModel):
    id: int
    module: str = "General"
    moduleOrder: int = 0
    order: int = 0
    difficulty: str = "easy"
    title: str
    description: str
    concepts: list[str] = []
    conceptLesson: Optional[ConceptLesson] = None
    hints: list[str] = []
    solution: Optional[str] = None
    examples: list[Example] = []
    testCases: list[TestCase] = []
    starterCode: str = ""


# ---------- Problem loading + caching ----------

PROBLEMS_DIR_ENV = os.getenv("PROBLEMS_DIR")
PROBLEMS_PATH_ENV = os.getenv("PROBLEMS_PATH")

_problems_list: list[Problem] = []
_problems_by_id: dict[int, Problem] = {}


def _resolve_problems_source() -> Path:
    """Locate problems data: a directory of per-module JSON files, or a legacy single problems.json."""
    if PROBLEMS_DIR_ENV and Path(PROBLEMS_DIR_ENV).is_dir():
        return Path(PROBLEMS_DIR_ENV)
    if PROBLEMS_PATH_ENV and Path(PROBLEMS_PATH_ENV).exists():
        return Path(PROBLEMS_PATH_ENV)

    here = Path(__file__).parent
    candidates = [
        here.parent / "problems",
        here.parent / "problems.json",
        Path("/app/problems"),
        Path("/app/problems.json"),
    ]
    for c in candidates:
        if c.exists():
            return c
    raise FileNotFoundError(
        "Could not locate problems data. Tried: "
        + ", ".join(str(c) for c in candidates)
    )


def _read_raw(source: Path) -> list[dict]:
    """Load the raw problem array from either a directory or a single JSON file."""
    if source.is_dir():
        files = sorted(source.glob("*.json"))
        if not files:
            raise FileNotFoundError(f"{source} contains no .json files")
        raw: list[dict] = []
        for f in files:
            with open(f, "r") as fh:
                data = json.load(fh)
            if not isinstance(data, list):
                raise ValueError(f"{f} must be a top-level array, got {type(data).__name__}")
            raw.extend(data)
        return raw

    with open(source, "r") as fh:
        data = json.load(fh)
    if not isinstance(data, list):
        raise ValueError(f"{source} must be a top-level array, got {type(data).__name__}")
    return data


def load_problems() -> tuple[list[Problem], dict[int, Problem]]:
    """Read, validate, and index problems data. Raises on schema or file errors."""
    source = _resolve_problems_source()
    raw = _read_raw(source)

    problems: list[Problem] = []
    seen_ids: set[int] = set()
    for i, item in enumerate(raw):
        try:
            p = Problem.model_validate(item)
        except ValidationError as e:
            raise ValueError(f"problem at index {i} failed validation: {e}") from e
        if p.id in seen_ids:
            raise ValueError(f"duplicate problem id {p.id}")
        seen_ids.add(p.id)
        problems.append(p)

    problems.sort(key=lambda p: (p.moduleOrder, p.order, p.id))
    by_id = {p.id: p for p in problems}
    logger.info("Loaded %d problems from %s", len(problems), source)
    return problems, by_id


@asynccontextmanager
async def lifespan(_app: FastAPI):
    global _problems_list, _problems_by_id
    _problems_list, _problems_by_id = load_problems()
    yield


limiter = Limiter(key_func=get_remote_address)

app = FastAPI(title="DynoCode API", lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS for Frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://dynocode.in",
        "https://www.dynocode.in",
        "https://orca-app-daxtp.ondigitalocean.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------- Request models ----------

class RunRequest(BaseModel):
    code: str = Field(max_length=10_000)
    input: str = Field(default="", max_length=10_000)


class SubmitRequest(BaseModel):
    code: str = Field(max_length=10_000)
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


def _problem_public(p: Problem) -> dict:
    """Public problem view (no testCases)."""
    return {
        "id": p.id,
        "title": p.title,
        "description": p.description,
        "examples": [e.model_dump() for e in p.examples],
        "starterCode": p.starterCode,
        "module": p.module,
        "moduleOrder": p.moduleOrder,
        "order": p.order,
        "difficulty": p.difficulty,
        "concepts": p.concepts,
        "hints": p.hints,
        "conceptLesson": p.conceptLesson.model_dump() if p.conceptLesson else None,
        "solution": p.solution,
    }


# ---------- Routes ----------

@app.get("/health")
def health_check():
    if not _problems_list:
        return JSONResponse(
            {"status": "unhealthy", "error": "problems not loaded"},
            status_code=503,
        )
    return {"status": "healthy", "problems_count": len(_problems_list)}


@app.get("/problems")
def get_problems():
    """Return all problems (without test cases for the list view)."""
    return [_problem_public(p) for p in _problems_list]


@app.get("/problems/{problem_id}")
def get_problem(problem_id: int):
    """Return a single problem by ID (without test cases)."""
    p = _problems_by_id.get(problem_id)
    if p is None:
        raise HTTPException(status_code=404, detail="Problem not found")
    return _problem_public(p)


@app.post("/run")
@limiter.limit("10/minute")
def run_code(request: Request, req: RunRequest):
    """Execute user code with optional stdin input and return output."""
    result = execute_code(req.code, req.input)
    return {"output": result["output"], "error": result["error"]}


@app.post("/submit")
@limiter.limit("10/minute")
def submit_code(request: Request, req: SubmitRequest):
    """Run code against all test cases for the given problem."""
    problem = _problems_by_id.get(req.problemId)
    if problem is None:
        return {"status": "error", "message": "Problem not found"}

    results = []
    all_passed = True

    for i, tc in enumerate(problem.testCases):
        result = execute_code(req.code, tc.input)
        actual = result["output"].strip()
        expected = tc.expectedOutput.strip()
        passed = actual == expected
        if not passed:
            all_passed = False

        results.append({
            "testCase": i + 1,
            "passed": passed,
            "expected": expected,
            "actual": actual,
            "input": tc.input,
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
