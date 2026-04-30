"use client";

export default function Dashboard({ modules, progress, onProblemSelect }) {
  return (
    <div className="dashboard-view">
      <header className="dashboard-header">
        <h1>Welcome back, Coder! ⚡</h1>
        <p>Pick up where you left off or start a new challenge.</p>
      </header>

      <div className="dashboard-grid">
        {Object.entries(modules).map(([moduleName, problems]) => {
          const solvedInModule = problems.filter(p => progress.solved.includes(p.id)).length;
          const percent = Math.round((solvedInModule / problems.length) * 100);

          return (
            <div key={moduleName} className="module-card">
              <div className="module-card-header">
                <h3>{moduleName}</h3>
                <span className="module-badge">{percent}%</span>
              </div>
              <div className="module-card-progress">
                <div className="progress-bar-track">
                  <div className="progress-bar-fill" style={{ width: `${percent}%` }}></div>
                </div>
              </div>
              <div className="module-card-problems">
                {problems.slice(0, 3).map(prob => (
                  <div 
                    key={prob.id} 
                    className="module-card-item"
                    onClick={() => onProblemSelect(prob.id)}
                  >
                    <span>{progress.solved.includes(prob.id) ? "✅" : "○"} {prob.title}</span>
                    <span className={`difficulty-text ${prob.difficulty?.toLowerCase()}`}>{prob.difficulty}</span>
                  </div>
                ))}
                {problems.length > 3 && <div className="module-card-more">+{problems.length - 3} more...</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
