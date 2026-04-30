"use client";

export default function Navbar({ solvedCount, totalProblems, streak, onLogout, isSaving }) {
  const progressPercent = totalProblems > 0 ? Math.round((solvedCount / totalProblems) * 100) : 0;

  return (
    <nav className="navbar">
      <div className="navbar-left">
        <div className="navbar-logo" onClick={() => window.location.href = '/'}>
          <div className="navbar-logo-icon">⚡</div>
          <span className="logo-text">DynoCode</span>
        </div>
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
        {onLogout ? (
          <>
            <div className={`autosave-indicator ${isSaving ? 'saving' : ''}`}>
              <div className="autosave-dot"></div>
              <span>{isSaving ? 'Saving...' : 'Synced'}</span>
            </div>
            <div className="streak-badge" title="Daily Streak">
              🔥 {streak}
            </div>
            <button className="signout-btn" onClick={onLogout}>Logout</button>
          </>
        ) : (
          <button className="signin-btn" onClick={() => window.dispatchEvent(new CustomEvent('open-auth'))}>Sign In</button>
        )}
      </div>
    </nav>
  );
}
