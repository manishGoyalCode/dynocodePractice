"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import Navbar from "@/components/Navbar";
import { useRouter } from "next/navigation";

export default function AddProblem() {
  const [jsonInput, setJsonInput] = useState("");
  const [status, setStatus] = useState({ type: "", message: "" });
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const router = useRouter();

  const ADMIN_EMAIL = "manishgoyaldata@gmail.com";

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.email === ADMIN_EMAIL) {
        setAuthorized(true);
      } else {
        setAuthorized(false);
      }
      setLoading(false);
    };
    checkAuth();
  }, []);

  const handleSubmit = async () => {
    setLoading(true);
    setStatus({ type: "", message: "" });

    try {
      const data = JSON.parse(jsonInput);
      const problems = Array.isArray(data) ? data : [data];

      for (const prob of problems) {
        const mappedData = {
          id: prob.id,
          title: prob.title,
          description: prob.description,
          module: prob.module || "General",
          difficulty: prob.difficulty || "easy",
          concepts: prob.concepts || [],
          hints: prob.hints || [],
          initial_code: prob.initialCode || prob.starterCode || "",
          solution_code: prob.solutionCode || prob.solution || "",
          test_cases: prob.testCases || [],
          examples: prob.examples || [],
          concept_lesson: typeof prob.conceptLesson === 'string' ? prob.conceptLesson : JSON.stringify(prob.conceptLesson),
          module_order: prob.moduleOrder || 0,
          problem_order: prob.order || 0
        };

        const { error } = await supabase.from("problems").upsert(mappedData);
        if (error) throw error;
      }

      setStatus({ type: "success", message: `Successfully added ${problems.length} problem(s)!` });
      setJsonInput("");
    } catch (err) {
      setStatus({ type: "error", message: "Failed to add problem: " + err.message });
    }
    setLoading(false);
  };

  const handleClearAll = async () => {
    if (!confirm("⚠️ ARE YOU SURE? This will delete ALL problems permanently!")) return;
    
    setLoading(true);
    try {
      const { error } = await supabase.from("problems").delete().neq("id", -1);
      if (error) throw error;
      setStatus({ type: "success", message: "All problems cleared successfully!" });
    } catch (err) {
      setStatus({ type: "error", message: "Failed to clear problems: " + err.message });
    }
    setLoading(false);
  };

  if (loading) return <div className="app-wrapper" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--text-secondary)' }}>Verifying Access...</div>;

  if (!authorized) {
    return (
      <div className="app-wrapper">
        <Navbar streak={0} solvedCount={0} totalProblems={0} onLogout={() => {}} />
        <main className="app-body">
          <section className="main-content admin-page-content" style={{ textAlign: 'center', justifyContent: 'center' }}>
            <div className="admin-card">
              <h1 style={{ color: 'var(--accent-danger)', marginBottom: '16px' }}>🚫 Access Denied</h1>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>This page is restricted to administrators only.</p>
              <button className="submit-problem-btn" onClick={() => router.push("/")}>Return to Dashboard</button>
            </div>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="app-wrapper">
      <Navbar streak={0} solvedCount={0} totalProblems={0} onLogout={() => {}} isSaving={false} />
      
      <main className="app-body">
        <section className="main-content admin-page-content">
          <header className="admin-header">
            <h1>🚀 Fast Problem Creator</h1>
            <p>Paste your AI-generated JSON below to add problems instantly.</p>
          </header>

          <div className="admin-card">
            <div className="json-input-header">
              <span>JSON Payload</span>
              <div className="header-actions">
                <button className="clear-btn" onClick={() => setJsonInput("")}>Clear Input</button>
                <button className="clear-all-btn" onClick={handleClearAll}>Clear All Problems</button>
              </div>
            </div>
            <textarea
              className="json-textarea"
              placeholder='{ "id": 101, "title": "New Problem", ... }'
              value={jsonInput}
              onChange={(e) => setJsonInput(e.target.value)}
            />
            
            {status.message && (
              <div className={`status-banner ${status.type}`}>
                {status.type === "success" ? "✅" : "❌"} {status.message}
              </div>
            )}

            <button 
              className="submit-problem-btn" 
              onClick={handleSubmit} 
              disabled={loading || !jsonInput}
            >
              {loading ? "Syncing to DB..." : "Add Problem to Supabase"}
            </button>
          </div>

          <section className="template-info">
            <div className="template-header">
              <h3>🤖 Master AI Prompt</h3>
              <button className="copy-btn" onClick={() => {
                navigator.clipboard.writeText(`Act as an expert Python Educator. Create a high-quality coding problem. Output MUST be valid JSON: { "id": 101, "title": "...", "description": "...", "module": "...", "difficulty": "...", "starterCode": "...", "solution": "...", "concepts": [], "hints": [], "examples": [], "testCases": [], "conceptLesson": { "title": "...", "content": "...", "code": "..." } }`);
                alert("Prompt copied to clipboard!");
              }}>Copy Prompt</button>
            </div>
            <p>Paste this into ChatGPT/Gemini to get perfect results every time:</p>
            <div className="prompt-preview">
              <p><em>"Act as an expert Python Educator. Create a high-quality coding problem... [JSON Structure Specified]"</em></p>
            </div>
          </section>
        </section>
      </main>
    </div>
  );
}
