"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";

const Editor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

const API_BASE = "http://localhost:8000";
const STORAGE_KEY = "codepractice_progress";

// ─── localStorage helpers ───
function loadProgress() {
  if (typeof window === "undefined") return { solved: [], code: {} };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : { solved: [], code: {} };
  } catch {
    return { solved: [], code: {} };
  }
}

function saveProgress(progress) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
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

// ───────────────────────────
export default function Home() {
  const [problems, setProblems] = useState([]);
  const [activeProblemId, setActiveProblemId] = useState(null);
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
  const [progress, setProgress] = useState({ solved: [], code: {} });
  const [leftTab, setLeftTab] = useState("description"); // description | hints
  const [revealedHints, setRevealedHints] = useState([]);
  const [showConfetti, setShowConfetti] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const mainRef = useRef(null);
  const autoSaveTimer = useRef(null);

  // Load progress from localStorage
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
        // Expand all modules by default
        const mods = {};
        data.forEach((p) => {
          mods[p.module] = true;
        });
        setExpandedModules(mods);
        // Set first problem active
        if (data.length > 0) {
          const savedProgress = loadProgress();
          const firstId = data[0].id;
          setActiveProblemId(firstId);
          setCode(savedProgress.code?.[firstId] || data[0].starterCode || "");
          if (data[0].examples?.length > 0) {
            setStdinInput(data[0].examples[0].input);
          }
        }
      })
      .catch((err) => console.error("Failed to fetch problems:", err));
  }, []);

  // Group problems by module
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
    // Sort modules by order, problems within by order
    return Object.values(map)
      .sort((a, b) => a.order - b.order)
      .map((m) => ({
        ...m,
        problems: m.problems.sort((a, b) => a.order - b.order),
      }));
  }, [problems]);

  // Determine unlocked problems: first problem always unlocked, rest unlock when previous is solved
  const unlockedIds = useMemo(() => {
    const allSorted = modules.flatMap((m) => m.problems);
    const unlocked = new Set();
    for (let i = 0; i < allSorted.length; i++) {
      if (i === 0 || progress.solved.includes(allSorted[i - 1].id)) {
        unlocked.add(allSorted[i].id);
      } else {
        break; // Stop unlocking once we hit one that isn't solved
      }
    }
    // Always include solved ones as unlocked
    progress.solved.forEach((id) => unlocked.add(id));
    return unlocked;
  }, [modules, progress.solved]);

  const activeProblem = problems.find((p) => p.id === activeProblemId);

  // Auto-save code to localStorage
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

  // Switch problem
  const handleProblemChange = (id) => {
    if (!unlockedIds.has(id)) return;
    setActiveProblemId(id);
    const p = problems.find((pr) => pr.id === id);
    if (p) {
      const savedCode = progress.code?.[id];
      setCode(savedCode || p.starterCode || "");
      setStdinInput(p.examples?.[0]?.input || "");
    }
    setOutput(null);
    setTestResults(null);
    setOutputError(false);
    setLeftTab("description");
    setRevealedHints([]);
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

      // If passed, mark as solved
      if (data.status === "passed") {
        setProgress((prev) => {
          const solved = prev.solved.includes(activeProblemId)
            ? prev.solved
            : [...prev.solved, activeProblemId];
          const updated = { ...prev, solved };
          saveProgress(updated);
          return updated;
        });
        // Show confetti
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 3000);
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
        if (e.shiftKey) {
          handleSubmit();
        } else {
          handleRun();
        }
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
    const handleMouseMove = (e) => {
      if (!mainRef.current) return;
      const rect = mainRef.current.getBoundingClientRect();
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      setPanelWidth(Math.max(20, Math.min(60, pct)));
    };
    const handleMouseUp = () => setIsResizing(false);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing]);

  // Toggle module
  const toggleModule = (name) => {
    setExpandedModules((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  // Reveal hint
  const revealHint = (idx) => {
    setRevealedHints((prev) => (prev.includes(idx) ? prev : [...prev, idx]));
  };

  // Filter problems
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

  // Progress stats
  const totalProblems = problems.length;
  const solvedCount = progress.solved.length;
  const progressPct = totalProblems > 0 ? (solvedCount / totalProblems) * 100 : 0;

  return (
    <div className="app-wrapper">
      {/* Confetti */}
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
            title="Toggle sidebar"
          >
            ☰
          </button>
          <a href="/" className="navbar-logo">
            <span className="navbar-logo-icon">⚡</span>
            CodePractice
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
              const solvedInModule = mod.problems.filter((p) =>
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
                      {solvedInModule}/{mod.problems.length}
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
                      const isActive = p.id === activeProblemId;
                      return (
                        <div
                          key={p.id}
                          className={`problem-item ${
                            isActive ? "active" : ""
                          } ${isSolved ? "solved" : ""} ${
                            !isUnlocked ? "locked" : ""
                          }`}
                          onClick={() => handleProblemChange(p.id)}
                          title={
                            !isUnlocked
                              ? "Solve the previous problem to unlock"
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

        {/* Main content */}
        <div className="main-content" ref={mainRef}>
          {/* Left: Problem */}
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
                💡 Hints{" "}
                {activeProblem?.hints?.length
                  ? `(${activeProblem.hints.length})`
                  : ""}
              </button>
            </div>

            {leftTab === "description" && (
              <div className="problem-body">
                {activeProblem ? (
                  <div className="animate-in">
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
                        __html: formatDescription(activeProblem.description),
                      }}
                    />
                    {activeProblem.examples?.map((ex, idx) => (
                      <div className="example-block" key={idx}>
                        <div className="example-label">Example {idx + 1}</div>
                        <div className="example-content">
                          <div>
                            <div className="example-section-label">Input</div>
                            <pre className="example-code">
                              {ex.input || "(none)"}
                            </pre>
                          </div>
                          <div>
                            <div className="example-section-label">Output</div>
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
                style={{
                  fontSize: "0.68rem",
                  color: "var(--text-muted)",
                }}
              >
                ⌘+Enter = Run &nbsp;|&nbsp; ⌘+⇧+Enter = Submit
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
                            className={`badge ${tc.passed ? "pass" : "fail"}`}
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
      </div>
    </div>
  );
}

// ─── Confetti Component ───
function Confetti() {
  const colors = [
    "#6366f1",
    "#8b5cf6",
    "#10b981",
    "#f59e0b",
    "#ef4444",
    "#3b82f6",
    "#ec4899",
    "#14b8a6",
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

// ─── Markdown-lite formatter ───
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
