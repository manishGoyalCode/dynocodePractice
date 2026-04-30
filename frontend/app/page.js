"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import Confetti from "react-confetti";
import { supabase } from "@/lib/supabase";
import { Auth } from "@supabase/auth-ui-react";
import { ThemeSupa } from "@supabase/auth-ui-shared";

// Custom Components
import Navbar from "@/components/Navbar";
import Sidebar from "@/components/Sidebar";
import Dashboard from "@/components/Dashboard";

const Editor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const STORAGE_KEY = "codepractice_progress";

export default function Home() {
  // --- State ---
  const [problems, setProblems] = useState([]);
  const [activeProblemId, setActiveProblemId] = useState(null);
  const [view, setView] = useState("dashboard");
  const [code, setCode] = useState("");
  const [stdinInput, setStdinInput] = useState("");
  const [output, setOutput] = useState(null);
  const [outputError, setOutputError] = useState(false);
  const [testResults, setTestResults] = useState(null);
  const [running, setRunning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [expandedModules, setExpandedModules] = useState({});
  const [searchQuery, setSearchQuery] = useState("");
  const [showConfetti, setShowConfetti] = useState(false);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [leftTab, setLeftTab] = useState("description");
  const [revealedHints, setRevealedHints] = useState([]);
  const [showSolution, setShowSolution] = useState(false);
  const [progress, setProgress] = useState({
    solved: [],
    code: {},
    attempts: {},
    streak: 0,
    lastDate: null,
  });

  const autoSaveTimer = useRef(null);

  // --- Auto-Save Logic ---
  useEffect(() => {
    if (!session?.user?.id || !activeProblemId) return;

    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);

    autoSaveTimer.current = setTimeout(async () => {
      setIsSaving(true);
      try {
        await supabase.from('user_progress').upsert({
          user_id: session.user.id,
          problem_id: activeProblemId,
          saved_code: code,
          status: progress.solved.includes(activeProblemId) ? 'solved' : 'started'
        }, { onConflict: 'user_id,problem_id' });
        
        setProgress(prev => ({
          ...prev,
          code: { ...prev.code, [activeProblemId]: code }
        }));
      } finally {
        setTimeout(() => setIsSaving(false), 500);
      }
    }, 1000);

    return () => clearTimeout(autoSaveTimer.current);
  }, [code, activeProblemId, session, progress.solved]);

  // --- Auth ---
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => setSession(session));
    return () => subscription.unsubscribe();
  }, []);

  // --- Data Loading & Sync ---
  useEffect(() => {
    async function syncProgress() {
      if (!session?.user?.id) return;

      // Migrate local storage if exists
      const localRaw = localStorage.getItem(STORAGE_KEY);
      if (localRaw) {
        const local = JSON.parse(localRaw);
        if (local.solved.length > 0) {
          for (const pid of local.solved) {
            await supabase.from('user_progress').upsert({ user_id: session.user.id, problem_id: pid, status: 'solved' });
          }
          localStorage.removeItem(STORAGE_KEY);
        }
      }

      // Fetch from Supabase
      const { data: progressData } = await supabase.from('user_progress').select('*').eq('user_id', session.user.id);
      const { data: profileData } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();

      if (progressData) {
        setProgress({
          solved: progressData.filter(d => d.status === 'solved').map(d => d.problem_id),
          code: progressData.reduce((acc, d) => ({ ...acc, [d.problem_id]: d.saved_code }), {}),
          attempts: progressData.reduce((acc, d) => ({ ...acc, [d.problem_id]: d.attempts_count }), {}),
          streak: profileData?.streak || 0,
          lastDate: profileData?.last_active_date || null
        });
      }
    }
    syncProgress();
  }, [session]);

  useEffect(() => {
    fetch(`${API_BASE}/problems`)
      .then(r => r.json())
      .then(data => {
        setProblems(data);
        // Expand all modules by default
        const modules = {};
        data.forEach(p => { if (p.module) modules[p.module] = true; });
        setExpandedModules(modules);
      });
  }, []);

  // --- Actions ---
  const handleRun = async () => {
    setRunning(true);
    setTestResults(null); // Clear test results so we can see the output
    try {
      const { data: { session: s } } = await supabase.auth.getSession();
      const res = await fetch(`${API_BASE}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${s?.access_token}` },
        body: JSON.stringify({ code, input: stdinInput }),
      });
      const data = await res.json();
      setOutput(data.output);
      setOutputError(data.error);
    } catch {
      setOutput("Error: Server unreachable");
      setOutputError(true);
    }
    setRunning(false);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const { data: { session: s } } = await supabase.auth.getSession();
      const res = await fetch(`${API_BASE}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${s?.access_token}` },
        body: JSON.stringify({ code, problemId: activeProblemId }),
      });
      const data = await res.json();
      setTestResults(data.results);
      if (data.status === "passed") {
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 3000);
        // Sync to Supabase
        await supabase.from('user_progress').upsert({ user_id: session.user.id, problem_id: activeProblemId, status: 'solved', saved_code: code });
        setProgress(prev => ({ ...prev, solved: [...new Set([...prev.solved, activeProblemId])] }));
      }
    } catch (e) {
      console.error(e);
    }
    setSubmitting(false);
  };

  const openProblem = (id) => {
    const p = problems.find(prob => prob.id === id);
    setActiveProblemId(id);
    setCode(progress.code[id] || p?.starterCode || "");
    setView("problem");
    setStdinInput(p?.testCases?.[0]?.input || "");
    setLeftTab("description");
    setRevealedHints([]);
    setShowSolution(false);
    setOutput(null);
    setTestResults(null);
  };

  // --- Grouping ---
  const modules = problems.reduce((acc, p) => {
    if (!acc[p.module]) acc[p.module] = [];
    acc[p.module].push(p);
    return acc;
  }, {});

  // --- Render Helpers ---
  if (loading) return <div className="loading-screen">Loading DynoCode...</div>;

  if (!session) {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <h1>⚡ DynoCode</h1>
          <p>Master Python through practice.</p>
          <Auth supabaseClient={supabase} appearance={{ theme: ThemeSupa }} providers={[]} />
        </div>
      </div>
    );
  }

  const activeProblem = problems.find(p => p.id === activeProblemId);

  return (
    <div className="app-wrapper">
      {showConfetti && <Confetti />}
      <Navbar 
        solvedCount={progress.solved.length} 
        totalProblems={problems.length} 
        streak={progress.streak} 
        isSaving={isSaving}
        onLogout={() => supabase.auth.signOut()} 
      />

      <main className="app-body">
        <Sidebar 
          modules={modules} 
          activeProblemId={activeProblemId} 
          onProblemSelect={openProblem}
          progress={progress}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          expandedModules={expandedModules}
          toggleModule={(name) => setExpandedModules(prev => ({ ...prev, [name]: !prev[name] }))}
        />

        <section className="main-content">
          {view === "dashboard" ? (
            <Dashboard modules={modules} progress={progress} onProblemSelect={openProblem} />
          ) : (
            <div className="problem-view">
              <div className="problem-panel-left">
                <div className="problem-header-actions">
                  <button className="back-btn" onClick={() => setView("dashboard")}>← Dashboard</button>
                  <div className="problem-tabs">
                    <button 
                      className={`tab-btn ${leftTab === 'description' ? 'active' : ''}`}
                      onClick={() => setLeftTab('description')}
                    >
                      Description
                    </button>
                    <button 
                      className={`tab-btn ${leftTab === 'hints' ? 'active' : ''}`}
                      onClick={() => setLeftTab('hints')}
                    >
                      Hints {activeProblem?.hints?.length > 0 && `(${activeProblem.hints.length})`}
                    </button>
                    {activeProblem?.conceptLesson && (
                      <button 
                        className={`tab-btn ${leftTab === 'lesson' ? 'active' : ''}`}
                        onClick={() => setLeftTab('lesson')}
                      >
                        Lesson
                      </button>
                    )}
                    {progress.solved.includes(activeProblemId) && (
                      <button 
                        className={`tab-btn ${leftTab === 'solution' ? 'active' : ''}`}
                        onClick={() => setLeftTab('solution')}
                      >
                        Solution
                      </button>
                    )}
                  </div>
                </div>

                <div className="problem-details">
                  {leftTab === 'description' && (
                    <>
                      <h1>{activeProblem?.title}</h1>
                      <div className="problem-meta">
                        <div className={`difficulty-badge ${activeProblem?.difficulty?.toLowerCase()}`}>
                          {activeProblem?.difficulty}
                        </div>
                        {activeProblem?.concepts?.map((c, i) => (
                          <span key={i} className="concept-tag">{c}</span>
                        ))}
                      </div>
                      <div className="problem-description" dangerouslySetInnerHTML={{ __html: activeProblem?.description }} />
                      {activeProblem?.examples?.map((ex, i) => (
                        <div key={i} className="example-block">
                          <strong>Example {i+1}:</strong>
                          <pre>{ex.input && `Input: ${ex.input}\n`}Output: {ex.output}</pre>
                        </div>
                      ))}
                    </>
                  )}

                  {leftTab === 'hints' && (
                    <div className="hints-container">
                      <h2>Hints</h2>
                      {activeProblem?.hints?.length > 0 ? (
                        activeProblem.hints.map((hint, i) => (
                          <div key={i} className="hint-item">
                            {revealedHints.includes(i) ? (
                              <div className="hint-content animate-in">{hint}</div>
                            ) : (
                              <button className="reveal-btn" onClick={() => setRevealedHints([...revealedHints, i])}>
                                Reveal Hint {i + 1}
                              </button>
                            )}
                          </div>
                        ))
                      ) : (
                        <p className="no-data">No hints available for this problem.</p>
                      )}
                    </div>
                  )}

                  {leftTab === 'lesson' && (
                    <div className="lesson-container">
                      {(() => {
                        try {
                          const lesson = typeof activeProblem?.conceptLesson === 'string' 
                            ? JSON.parse(activeProblem.conceptLesson) 
                            : activeProblem.conceptLesson;
                          
                          if (lesson && typeof lesson === 'object') {
                            return (
                              <div className="lesson-content">
                                <h3>{lesson.title}</h3>
                                <p dangerouslySetInnerHTML={{ __html: lesson.content }} />
                                {lesson.code && (
                                  <pre><code>{lesson.code}</code></pre>
                                )}
                              </div>
                            );
                          }
                        } catch (e) {
                          // Fallback to raw HTML if not JSON
                          return (
                            <div className="lesson-content" dangerouslySetInnerHTML={{ __html: activeProblem?.conceptLesson }} />
                          );
                        }
                        return <div className="no-data">No lesson content available.</div>;
                      })()}
                    </div>
                  )}

                  {leftTab === 'solution' && (
                    <div className="solution-container">
                      <h2>Reference Solution</h2>
                      <pre className="solution-code">{activeProblem?.solution}</pre>
                    </div>
                  )}
                </div>
              </div>

              <div className="problem-panel-right">
                <div className="editor-container">
                  <Editor
                    height="100%"
                    language="python"
                    theme="vs-dark"
                    value={code}
                    onChange={setCode}
                    options={{ fontSize: 14, minimap: { enabled: false } }}
                  />
                </div>
                <div className="action-bar">
                  <div className="custom-input-wrapper">
                    <label>Custom Input (stdin)</label>
                    <textarea 
                      placeholder="Enter values for input() here..."
                      value={stdinInput}
                      onChange={(e) => setStdinInput(e.target.value)}
                    />
                  </div>
                  <div className="action-buttons">
                    <button className="btn btn-run" onClick={handleRun} disabled={running}>
                      {running ? "Running..." : "Run Code"}
                    </button>
                    <button className="btn btn-submit" onClick={handleSubmit} disabled={submitting}>
                      {submitting ? "Submitting..." : "Submit Solution"}
                    </button>
                  </div>
                </div>
                <div className="output-panel">
                  {testResults ? (
                    <div className="test-results">
                      {testResults.map((res, i) => (
                        <div key={i} className={`test-case ${res.passed ? 'passed' : 'failed'}`}>
                          {res.passed ? "✅" : "❌"} Case {res.testCase}: {res.passed ? "Passed" : "Failed"}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <pre className={`output-text ${outputError ? 'error' : ''}`}>{output || "Run code to see output..."}</pre>
                  )}
                </div>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
