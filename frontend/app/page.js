"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";

const Editor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

const API_BASE = typeof window !== "undefined" 
  ? `${window.location.protocol}//${window.location.hostname}:8000` 
  : "http://localhost:8000";
const STORAGE_KEY = "codepractice_progress";

// ─── localStorage helpers ───
function loadProgress() {
  if (typeof window === "undefined")
    return { solved: [], code: {}, attempts: {}, streak: 0, lastDate: null };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw
      ? JSON.parse(raw)
      : { solved: [], code: {}, attempts: {}, streak: 0, lastDate: null };
  } catch {
    return { solved: [], code: {}, attempts: {}, streak: 0, lastDate: null };
  }
}

function saveProgress(progress) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
}

function updateStreak(progress) {
  const today = new Date().toISOString().slice(0, 10);
  if (progress.lastDate === today) return progress;

  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const newStreak =
    progress.lastDate === yesterday ? (progress.streak || 0) + 1 : 1;
  return { ...progress, streak: newStreak, lastDate: today };
}

// ─── Module config ───
const MODULE_ICONS = {
  Basics: "📗",
  "Control Flow": "🔀",
  Loops: "🔁",
  Strings: "🔤",
  Lists: "📋",
  Functions: "⚙️",
};

const FAIL_THRESHOLD = 3; // show solution after this many failed attempts

// ───────────────────────────
export default function Home() {
  const [problems, setProblems] = useState([]);
  const [activeProblemId, setActiveProblemId] = useState(null);
  const [view, setView] = useState("dashboard"); // "dashboard" | "problem"
  const [code, setCode] = useState("");
  const [stdinInput, setStdinInput] = useState("");
  const [output, setOutput] = useState(null);
  const [outputError, setOutputError] = useState(false);
  const [testResults, setTestResults] = useState(null);
  const [running, setRunning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [panelWidth, setPanelWidth] = useState(38);
  const [isResizing, setIsResizing] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [expandedModules, setExpandedModules] = useState({});
  const [progress, setProgress] = useState({
    solved: [],
    code: {},
    attempts: {},
    streak: 0,
    lastDate: null,
  });
  const [leftTab, setLeftTab] = useState("description");
  const [revealedHints, setRevealedHints] = useState([]);
  const [showConfetti, setShowConfetti] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [conceptExpanded, setConceptExpanded] = useState(false);
  const mainRef = useRef(null);
  const autoSaveTimer = useRef(null);

  // Load progress
  useEffect(() => {
    const p = loadProgress();
    setProgress(p);
  }, []);

  // Fetch problems
  useEffect(() => {
    fetch(`${API_BASE}/problems`)
      .then((r) => r.json())
      .then((data) => {
        setProblems(data);
        const mods = {};
        data.forEach((p) => (mods[p.module] = true));
        setExpandedModules(mods);
      })
      .catch((err) => console.error("Failed to fetch problems:", err));
  }, []);

  // Group by module
  const modules = useMemo(() => {
    const map = {};
    problems.forEach((p) => {
      if (!map[p.module]) {
        map[p.module] = {
          name: p.module,
          order: p.moduleOrder,
          icon: MODULE_ICONS[p.module] || "📄",
          problems: [],
        };
      }
      map[p.module].problems.push(p);
    });
    return Object.values(map)
      .sort((a, b) => a.order - b.order)
      .map((m) => ({
        ...m,
        problems: m.problems.sort((a, b) => a.order - b.order),
      }));
  }, [problems]);

  // All problems are unlocked (no sequential gating)
  const unlockedIds = useMemo(() => {
    return new Set(problems.map((p) => p.id));
  }, [problems]);

  const activeProblem = problems.find((p) => p.id === activeProblemId);

  // Next unsolved problem
  const nextUnsolved = useMemo(() => {
    const allSorted = modules.flatMap((m) => m.problems);
    return allSorted.find(
      (p) => !progress.solved.includes(p.id) && unlockedIds.has(p.id)
    );
  }, [modules, progress.solved, unlockedIds]);

  // Is solution unlocked for active problem?
  const solutionUnlocked = useMemo(() => {
    if (!activeProblemId) return false;
    if (progress.solved.includes(activeProblemId)) return true;
    const attempts = progress.attempts?.[activeProblemId] || 0;
    return attempts >= FAIL_THRESHOLD;
  }, [activeProblemId, progress.solved, progress.attempts]);

  // Auto-save
  useEffect(() => {
    if (activeProblemId == null) return;
    clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      setProgress((prev) => {
        const updated = {
          ...prev,
          code: { ...prev.code, [activeProblemId]: code },
        };
        saveProgress(updated);
        return updated;
      });
    }, 800);
    return () => clearTimeout(autoSaveTimer.current);
  }, [code, activeProblemId]);

  // Switch to problem
  const openProblem = (id) => {
    if (!unlockedIds.has(id)) return;
    setActiveProblemId(id);
    const p = problems.find((pr) => pr.id === id);
    if (p) {
      setCode(progress.code?.[id] || p.starterCode || "");
      setStdinInput(p.examples?.[0]?.input || "");
    }
    setOutput(null);
    setTestResults(null);
    setOutputError(false);
    setLeftTab("description");
    setRevealedHints([]);
    setConceptExpanded(false);
    setView("problem");
  };

  // Run code
  const handleRun = async () => {
    setRunning(true);
    setOutput(null);
    setTestResults(null);
    setOutputError(false);
    try {
      const res = await fetch(`${API_BASE}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, input: stdinInput }),
      });
      const data = await res.json();
      setOutput(data.output);
      setOutputError(data.error || false);
    } catch {
      setOutput("Error: Could not connect to the server.");
      setOutputError(true);
    }
    setRunning(false);
  };

  // Submit code
  const handleSubmit = async () => {
    setSubmitting(true);
    setOutput(null);
    setTestResults(null);
    setOutputError(false);
    try {
      const res = await fetch(`${API_BASE}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, problemId: activeProblemId }),
      });
      const data = await res.json();
      setTestResults(data);

      if (data.status === "passed") {
        setProgress((prev) => {
          const solved = prev.solved.includes(activeProblemId)
            ? prev.solved
            : [...prev.solved, activeProblemId];
          let updated = { ...prev, solved };
          updated = updateStreak(updated);
          saveProgress(updated);
          return updated;
        });
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 3000);
      } else {
        // Track failed attempts
        setProgress((prev) => {
          const attempts = {
            ...prev.attempts,
            [activeProblemId]: (prev.attempts?.[activeProblemId] || 0) + 1,
          };
          const updated = { ...prev, attempts };
          saveProgress(updated);
          return updated;
        });
      }
    } catch {
      setOutput("Error: Could not connect to the server.");
      setOutputError(true);
    }
    setSubmitting(false);
  };

  // Reset code
  const handleReset = () => {
    const p = problems.find((pr) => pr.id === activeProblemId);
    if (p) setCode(p.starterCode || "");
    setOutput(null);
    setTestResults(null);
    setOutputError(false);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        e.shiftKey ? handleSubmit() : handleRun();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });

  // Resize
  const handleMouseDown = useCallback((e) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    if (!isResizing) return;
    const onMove = (e) => {
      if (!mainRef.current) return;
      const rect = mainRef.current.getBoundingClientRect();
      setPanelWidth(
        Math.max(20, Math.min(60, ((e.clientX - rect.left) / rect.width) * 100))
      );
    };
    const onUp = () => setIsResizing(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [isResizing]);

  const toggleModule = (name) =>
    setExpandedModules((prev) => ({ ...prev, [name]: !prev[name] }));

  const revealHint = (idx) =>
    setRevealedHints((prev) => (prev.includes(idx) ? prev : [...prev, idx]));

  const filteredModules = useMemo(() => {
    if (!searchQuery.trim()) return modules;
    const q = searchQuery.toLowerCase();
    return modules
      .map((m) => ({
        ...m,
        problems: m.problems.filter(
          (p) =>
            p.title.toLowerCase().includes(q) ||
            p.concepts?.some((c) => c.toLowerCase().includes(q))
        ),
      }))
      .filter((m) => m.problems.length > 0);
  }, [modules, searchQuery]);

  // Stats
  const totalProblems = problems.length;
  const solvedCount = progress.solved.length;
  const progressPct =
    totalProblems > 0 ? Math.round((solvedCount / totalProblems) * 100) : 0;

  // ─── Render ───
  return (
    <div className="app-wrapper">
      {showConfetti && <Confetti />}
      {showConfetti && (
        <div className="success-overlay">
          <div className="success-text">🎉 Passed!</div>
        </div>
      )}

      {/* Navbar */}
      <nav className="navbar">
        <div className="navbar-left">
          <button
            className="sidebar-toggle"
            onClick={() => setSidebarOpen((v) => !v)}
          >
            ☰
          </button>
          <a
            href="#"
            className="navbar-logo"
            onClick={(e) => {
              e.preventDefault();
              setView("dashboard");
            }}
          >
            <span className="navbar-logo-icon">⚡</span>
            DynoCode
          </a>
        </div>
        <div className="navbar-progress">
          <span>
            {solvedCount}/{totalProblems} solved
          </span>
          <div className="progress-bar-track">
            <div
              className="progress-bar-fill"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <div className="autosave-indicator">
            <span className="autosave-dot" />
            Auto-saved
          </div>
        </div>
      </nav>

      <div className="app-body">
        {/* Sidebar */}
        <aside className={`sidebar ${sidebarOpen ? "" : "collapsed"}`}>
          <div className="sidebar-header">
            <h2>📘 Python Course</h2>
            <input
              className="sidebar-search"
              type="text"
              placeholder="Search problems..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="sidebar-modules">
            {filteredModules.map((mod) => {
              const solvedInMod = mod.problems.filter((p) =>
                progress.solved.includes(p.id)
              ).length;
              return (
                <div className="module-group" key={mod.name}>
                  <div
                    className="module-header"
                    onClick={() => toggleModule(mod.name)}
                  >
                    <span
                      className={`module-chevron ${
                        expandedModules[mod.name] ? "open" : ""
                      }`}
                    >
                      ▶
                    </span>
                    <span className="module-icon">{mod.icon}</span>
                    <span className="module-name">{mod.name}</span>
                    <span className="module-count">
                      {solvedInMod}/{mod.problems.length}
                    </span>
                  </div>
                  <div
                    className={`module-problems ${
                      expandedModules[mod.name] ? "" : "collapsed"
                    }`}
                    style={{
                      maxHeight: expandedModules[mod.name]
                        ? `${mod.problems.length * 40}px`
                        : "0",
                    }}
                  >
                    {mod.problems.map((p) => {
                      const isSolved = progress.solved.includes(p.id);
                      const isUnlocked = unlockedIds.has(p.id);
                      const isActive =
                        p.id === activeProblemId && view === "problem";
                      return (
                        <div
                          key={p.id}
                          className={`problem-item ${
                            isActive ? "active" : ""
                          } ${isSolved ? "solved" : ""} ${
                            !isUnlocked ? "locked" : ""
                          }`}
                          onClick={() => openProblem(p.id)}
                          title={
                            !isUnlocked
                              ? "Solve previous problem to unlock"
                              : p.title
                          }
                        >
                          <span className="problem-status">
                            {isSolved ? "✅" : isUnlocked ? "🔓" : "🔒"}
                          </span>
                          <div className="problem-info">
                            <div className="problem-item-title">
                              {p.id}. {p.title}
                            </div>
                          </div>
                          <span
                            className={`difficulty-dot ${p.difficulty}`}
                            title={p.difficulty}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </aside>

        {/* ─── Dashboard View ─── */}
        {view === "dashboard" && (
          <div className="dashboard animate-in">
            {/* Hero */}
            <div className="dash-hero">
              <div className="dash-hero-top">
                <div className="dash-welcome">
                  Welcome back! 👋
                  <span>Continue your Python learning journey</span>
                </div>
                {progress.streak > 0 && (
                  <div className="dash-streak">
                    🔥 <span className="dash-streak-num">{progress.streak}</span>{" "}
                    day streak
                  </div>
                )}
              </div>
              {nextUnsolved ? (
                <button
                  className="dash-continue"
                  onClick={() => openProblem(nextUnsolved.id)}
                >
                  ▶ Continue — {nextUnsolved.title}
                </button>
              ) : solvedCount === totalProblems && totalProblems > 0 ? (
                <button className="dash-continue" style={{ background: "linear-gradient(135deg, #10b981, #059669)" }}>
                  🏆 All Problems Completed!
                </button>
              ) : null}
            </div>

            {/* Stats */}
            <div className="dash-stats">
              <div className="dash-stat-card">
                <div className="dash-progress-ring">
                  <svg viewBox="0 0 80 80">
                    <defs>
                      <linearGradient
                        id="progressGradient"
                        x1="0%"
                        y1="0%"
                        x2="100%"
                        y2="0%"
                      >
                        <stop offset="0%" stopColor="#6366f1" />
                        <stop offset="100%" stopColor="#10b981" />
                      </linearGradient>
                    </defs>
                    <circle className="ring-bg" cx="40" cy="40" r="34" />
                    <circle
                      className="ring-fill"
                      cx="40"
                      cy="40"
                      r="34"
                      strokeDasharray={`${2 * Math.PI * 34}`}
                      strokeDashoffset={`${
                        2 * Math.PI * 34 * (1 - progressPct / 100)
                      }`}
                    />
                  </svg>
                  <span className="dash-progress-pct">{progressPct}%</span>
                </div>
                <div className="dash-stat-label">Complete</div>
              </div>
              <div className="dash-stat-card">
                <div className="dash-stat-value">{solvedCount}</div>
                <div className="dash-stat-label">Problems Solved</div>
              </div>
              <div className="dash-stat-card">
                <div className="dash-stat-value">
                  {modules.filter(
                    (m) =>
                      m.problems.length > 0 &&
                      m.problems.every((p) =>
                        progress.solved.includes(p.id)
                      )
                  ).length}
                  /{modules.length}
                </div>
                <div className="dash-stat-label">Modules Done</div>
              </div>
            </div>

            {/* Module cards */}
            <div className="dash-section-title">📚 Course Modules</div>
            <div className="dash-modules">
              {modules.map((mod) => {
                const solvedInMod = mod.problems.filter((p) =>
                  progress.solved.includes(p.id)
                ).length;
                const isComplete = solvedInMod === mod.problems.length;
                const hasProgress = solvedInMod > 0;
                const firstUnlocked = mod.problems.find((p) =>
                  unlockedIds.has(p.id)
                );
                return (
                  <div
                    key={mod.name}
                    className={`dash-module-card ${
                      isComplete ? "completed" : ""
                    }`}
                    onClick={() => {
                      if (firstUnlocked) openProblem(firstUnlocked.id);
                    }}
                  >
                    <div className="dash-module-top">
                      <span className="dash-module-icon">{mod.icon}</span>
                      <span className="dash-module-name">{mod.name}</span>
                      <span
                        className={`dash-module-badge ${
                          isComplete
                            ? "complete"
                            : hasProgress
                            ? "in-progress"
                            : "locked-badge"
                        }`}
                      >
                        {isComplete
                          ? "✅ Done"
                          : hasProgress
                          ? `${solvedInMod}/${mod.problems.length}`
                          : firstUnlocked
                          ? "Start"
                          : "🔒"}
                      </span>
                    </div>
                    <div className="dash-module-progress-bar">
                      <div
                        className="dash-module-progress-fill"
                        style={{
                          width: `${
                            (solvedInMod / mod.problems.length) * 100
                          }%`,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ─── Problem View ─── */}
        {view === "problem" && (
          <div className="main-content" ref={mainRef}>
            {/* Left panel */}
            <div
              className="panel panel-left"
              style={{ width: `${panelWidth}%` }}
            >
              <div className="panel-tabs">
                <button
                  className={`panel-tab ${
                    leftTab === "description" ? "active" : ""
                  }`}
                  onClick={() => setLeftTab("description")}
                >
                  📋 Description
                </button>
                <button
                  className={`panel-tab ${leftTab === "hints" ? "active" : ""}`}
                  onClick={() => setLeftTab("hints")}
                >
                  💡 Hints
                  {activeProblem?.hints?.length
                    ? ` (${activeProblem.hints.length})`
                    : ""}
                </button>
                <button
                  className={`panel-tab ${
                    leftTab === "solution" ? "active" : ""
                  }`}
                  onClick={() => setLeftTab("solution")}
                >
                  {solutionUnlocked ? "✅" : "🔒"} Solution
                </button>
              </div>

              {/* ── Description Tab ── */}
              {leftTab === "description" && (
                <div className="problem-body">
                  {activeProblem ? (
                    <div className="animate-in">
                      {/* Concept Learn Card */}
                      {activeProblem.conceptLesson && (
                        <div className="concept-card">
                          <div className="concept-card-header">
                            <span className="concept-card-icon">📖</span>
                            <span className="concept-card-title">
                              {activeProblem.conceptLesson.title}
                            </span>
                            <button
                              className="concept-card-toggle"
                              onClick={() => setConceptExpanded((v) => !v)}
                            >
                              {conceptExpanded ? "▲ Hide" : "▼ Show"}
                            </button>
                          </div>
                          {conceptExpanded && (
                            <>
                              <div
                                className="concept-card-content"
                                dangerouslySetInnerHTML={{
                                  __html: formatDescription(
                                    activeProblem.conceptLesson.content
                                  ),
                                }}
                              />
                              {activeProblem.conceptLesson.code && (
                                <pre className="concept-card-code">
                                  {activeProblem.conceptLesson.code}
                                </pre>
                              )}
                            </>
                          )}
                        </div>
                      )}

                      <div className="problem-meta">
                        <span className="problem-id-badge">
                          #{activeProblem.id}
                        </span>
                        <span
                          className={`difficulty-badge ${activeProblem.difficulty}`}
                        >
                          {activeProblem.difficulty.toUpperCase()}
                        </span>
                        <div className="concept-tags">
                          {activeProblem.concepts?.map((c) => (
                            <span className="concept-tag" key={c}>
                              {c}
                            </span>
                          ))}
                        </div>
                      </div>
                      <h1 className="problem-title">{activeProblem.title}</h1>
                      <div
                        className="problem-description"
                        dangerouslySetInnerHTML={{
                          __html: formatDescription(
                            activeProblem.description
                          ),
                        }}
                      />
                      {activeProblem.examples?.map((ex, idx) => (
                        <div className="example-block" key={idx}>
                          <div className="example-label">
                            Example {idx + 1}
                          </div>
                          <div className="example-content">
                            <div>
                              <div className="example-section-label">
                                Input
                              </div>
                              <pre className="example-code">
                                {ex.input || "(none)"}
                              </pre>
                            </div>
                            <div>
                              <div className="example-section-label">
                                Output
                              </div>
                              <pre className="example-code">{ex.output}</pre>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="output-placeholder loading-pulse">
                      Loading...
                    </div>
                  )}
                </div>
              )}

              {/* ── Hints Tab ── */}
              {leftTab === "hints" && (
                <div className="hints-panel">
                  {activeProblem?.hints?.length > 0 ? (
                    activeProblem.hints.map((hint, idx) => {
                      const isRevealed = revealedHints.includes(idx);
                      const canReveal =
                        idx === 0 || revealedHints.includes(idx - 1);
                      return (
                        <div className="hint-card" key={idx}>
                          <div className="hint-header">
                            <div className="hint-header-left">
                              <span>💡</span>
                              <span>Hint {idx + 1}</span>
                            </div>
                            {!isRevealed && canReveal && (
                              <button
                                className="hint-reveal-btn"
                                onClick={() => revealHint(idx)}
                              >
                                Reveal
                              </button>
                            )}
                            {!isRevealed && !canReveal && (
                              <span
                                style={{
                                  fontSize: "0.7rem",
                                  color: "var(--text-muted)",
                                }}
                              >
                                🔒
                              </span>
                            )}
                          </div>
                          {isRevealed && (
                            <div className="hint-content">{hint}</div>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <div className="hint-locked">
                      No hints available for this problem.
                    </div>
                  )}
                </div>
              )}

              {/* ── Solution Tab ── */}
              {leftTab === "solution" && (
                <div className="solution-panel">
                  {solutionUnlocked ? (
                    <div className="animate-in">
                      <div className="solution-code-block">
                        <div className="solution-code-header">
                          ✅ Reference Solution
                        </div>
                        <pre className="solution-code-body">
                          {activeProblem?.solution || "No solution available."}
                        </pre>
                      </div>
                      <div className="solution-note">
                        💡 This is one possible solution. There are often
                        multiple ways to solve a problem — yours might be even
                        better!
                      </div>
                    </div>
                  ) : (
                    <div className="solution-locked animate-in">
                      <div className="solution-locked-icon">🔒</div>
                      <div className="solution-locked-title">
                        Solution Locked
                      </div>
                      <div className="solution-locked-desc">
                        Solve this problem to unlock the reference solution.
                        <br />
                        Or submit {FAIL_THRESHOLD -
                          (progress.attempts?.[activeProblemId] || 0)}{" "}
                        more {(FAIL_THRESHOLD - (progress.attempts?.[activeProblemId] || 0)) === 1 ? "attempt" : "attempts"} to unlock it.
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Resize */}
            <div
              className={`resize-handle ${isResizing ? "active" : ""}`}
              onMouseDown={handleMouseDown}
            />

            {/* Right: Editor + Output */}
            <div className="panel panel-right">
              <div className="panel-header">
                <span className="panel-header-title">✏️ Python Editor</span>
                <span
                  style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}
                >
                  ⌘+Enter = Run | ⌘+⇧+Enter = Submit
                </span>
              </div>

              <div className="editor-wrapper">
                <Editor
                  height="100%"
                  language="python"
                  theme="vs-dark"
                  value={code}
                  onChange={(val) => setCode(val || "")}
                  options={{
                    fontSize: 14,
                    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    padding: { top: 12 },
                    lineNumbers: "on",
                    renderLineHighlight: "line",
                    automaticLayout: true,
                    tabSize: 4,
                    wordWrap: "on",
                    suggestOnTriggerCharacters: true,
                  }}
                />
              </div>

              <div className="stdin-section">
                <div className="stdin-label">Custom Input (stdin)</div>
                <textarea
                  className="stdin-input"
                  placeholder="Enter input for your program (one value per line)..."
                  value={stdinInput}
                  onChange={(e) => setStdinInput(e.target.value)}
                  rows={2}
                />
              </div>

              <div className="action-bar">
                <button
                  className="btn btn-run"
                  onClick={handleRun}
                  disabled={running || submitting}
                >
                  {running ? <span className="spinner" /> : "▶"}
                  {running ? "Running..." : "Run"}
                </button>
                <button
                  className="btn btn-submit"
                  onClick={handleSubmit}
                  disabled={running || submitting}
                >
                  {submitting ? <span className="spinner" /> : "🚀"}
                  {submitting ? "Checking..." : "Submit"}
                </button>
                <button className="btn btn-reset" onClick={handleReset}>
                  ↺ Reset
                </button>
              </div>

              <div className="output-panel">
                <div className="panel-header">
                  <span className="panel-header-title">
                    📤 {testResults ? "Test Results" : "Output"}
                  </span>
                </div>
                <div className="output-content">
                  {!output && !testResults && (
                    <div className="output-placeholder">
                      Run or submit to see results...
                    </div>
                  )}
                  {output && !testResults && (
                    <pre
                      className={`output-text ${
                        outputError ? "output-error" : ""
                      } animate-in`}
                    >
                      {output}
                    </pre>
                  )}
                  {testResults && (
                    <div className="animate-in">
                      <div
                        className={`test-results-summary ${testResults.status}`}
                      >
                        <span>
                          {testResults.status === "passed" ? "✅" : "❌"}
                        </span>
                        <span>
                          {testResults.status === "passed"
                            ? "All test cases passed!"
                            : `${testResults.totalPassed} / ${testResults.totalTests} passed`}
                        </span>
                      </div>
                      {testResults.results?.map((tc) => (
                        <div
                          key={tc.testCase}
                          className={`test-case-card ${
                            tc.passed ? "passed" : "failed"
                          }`}
                        >
                          <div className="test-case-header">
                            <span>Test {tc.testCase}</span>
                            <span
                              className={`badge ${
                                tc.passed ? "pass" : "fail"
                              }`}
                            >
                              {tc.passed ? "PASS" : "FAIL"}
                            </span>
                          </div>
                          <div className="test-case-body">
                            <div className="test-case-section">
                              <label>Input</label>
                              <pre>{tc.input}</pre>
                            </div>
                            <div className="test-case-section">
                              <label>Expected</label>
                              <pre>{tc.expected}</pre>
                            </div>
                            <div className="test-case-section">
                              <label>Actual</label>
                              <pre>{tc.actual}</pre>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Confetti Component ───
function Confetti() {
  const colors = [
    "#6366f1", "#8b5cf6", "#10b981", "#f59e0b",
    "#ef4444", "#3b82f6", "#ec4899", "#14b8a6",
  ];
  const pieces = Array.from({ length: 40 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: Math.random() * 0.8,
    color: colors[i % colors.length],
    size: 6 + Math.random() * 8,
    shape: Math.random() > 0.5 ? "50%" : "2px",
  }));
  return (
    <div className="confetti-container">
      {pieces.map((p) => (
        <div
          key={p.id}
          className="confetti-piece"
          style={{
            left: `${p.left}%`,
            animationDelay: `${p.delay}s`,
            width: `${p.size}px`,
            height: `${p.size}px`,
            borderRadius: p.shape,
            backgroundColor: p.color,
          }}
        />
      ))}
    </div>
  );
}

// ─── Text formatter ───
function formatDescription(text) {
  if (!text) return "";
  return text
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(
      /`(.*?)`/g,
      '<code style="background:rgba(99,102,241,0.15);padding:2px 6px;border-radius:4px;font-family:var(--font-mono);font-size:0.88em;color:#a5b4fc">$1</code>'
    )
    .replace(/\n/g, "<br/>");
}
