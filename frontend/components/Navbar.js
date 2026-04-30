"use client";

export default function Navbar({ solvedCount, totalProblems, streak, onLogout, isSaving }) {
  const progressPercent = totalProblems > 0 ? Math.round((solvedCount / totalProblems) * 100) : 0;

  return (
    <nav className="navbar">
      <div className="navbar-left">
        <a href="/" className="navbar-logo">
          <div className="navbar-logo-icon">⚡</div>
          <span>DynoCode</span>
        </a>
      </div>

      <div className="navbar-center">
        <div className="navbar-progress">
          <span>{solvedCount}/{totalProblems} Solved</span>
          <div className="progress-bar-track">
            <div className="progress-bar-fill" style={{ width: `${progressPercent}%` }}></div>
          </div>
        </div>
      </div>

      <div className="navbar-right">
        <div className={`autosave-indicator ${isSaving ? 'saving' : ''}`}>
          <span className="autosave-dot"></span>
          {isSaving ? "Saving..." : "Auto-saved"}
        </div>
        <div className="streak-badge" title="Daily Streak">
          🔥 {streak}
        </div>
        <button className="signout-btn" onClick={onLogout}>Logout</button>
      </div>
    </nav>
  );
}
