import json
import os
from supabase import create_client, Client
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

def migrate():
    problems_path = Path("problems.json")
    if not problems_path.exists():
        problems_path = Path("../problems.json")
        
    with open(problems_path, "r") as f:
        problems = json.load(f)
        
    print(f"🚀 Uploading {len(problems)} problems to Supabase with ALL fields...")
    
    for prob in problems:
        data = {
            "id": prob["id"],
            "title": prob["title"],
            "description": prob["description"],
            "module": prob.get("module", "General"),
            "difficulty": prob.get("difficulty", "easy"),
            "concepts": prob.get("concepts", []),
            "hints": prob.get("hints", []),
            "initial_code": prob.get("initialCode") or prob.get("starterCode", ""),
            "solution_code": prob.get("solutionCode") or prob.get("solution", ""),
            "test_cases": prob.get("testCases", []),
            "examples": prob.get("examples", []),
            "concept_lesson": prob.get("conceptLesson", ""),
            "module_order": prob.get("moduleOrder", 0),
            "problem_order": prob.get("order", 0)
        }
        
        supabase.table("problems").upsert(data).execute()
        print(f"✅ Uploaded: {prob['title']}")

if __name__ == "__main__":
    migrate()
