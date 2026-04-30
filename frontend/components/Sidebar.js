"use client";

export default function Sidebar({ 
  modules, 
  activeProblemId, 
  onProblemSelect, 
  progress, 
  searchQuery, 
  setSearchQuery,
  expandedModules,
  toggleModule
}) {
  const formatModuleName = (name) => {
    if (!name) return "";
    const dayMatch = name.match(/day\s*(\d+)/i);
    if (dayMatch) return `Day ${dayMatch[1]}`;
    return name.charAt(0).toUpperCase() + name.slice(1);
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <h2>Modules</h2>
        <input 
          type="text" 
          placeholder="Search problems..." 
          className="sidebar-search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>
      <div className="sidebar-modules">
        {modules.map(module => {
          const moduleName = module.name;
          const problems = module.problems;
          const filtered = problems.filter(p => 
            p.title.toLowerCase().includes(searchQuery.toLowerCase())
          );
          if (filtered.length === 0 && searchQuery) return null;

          const isExpanded = expandedModules[moduleName];
          const solvedInModule = filtered.filter(p => progress.solved.includes(p.id)).length;

          return (
            <div key={moduleName} className="module-group">
              <div className="module-header" onClick={() => toggleModule(moduleName)}>
                <span className={`module-chevron ${isExpanded ? 'open' : ''}`}>▶</span>
                <span className="module-name">{formatModuleName(moduleName)}</span>
                <span className="module-count">{solvedInModule}/{filtered.length}</span>
              </div>
              {isExpanded && (
                <div className="module-problems">
                  {filtered.map(prob => (
                    <div 
                      key={prob.id} 
                      className={`problem-item ${activeProblemId === prob.id ? 'active' : ''} ${progress.solved.includes(prob.id) ? 'solved' : ''}`}
                      onClick={() => onProblemSelect(prob.id)}
                    >
                      <div className="problem-info">
                        <div className="problem-item-title">{prob.title}</div>
                      </div>
                      <div className={`difficulty-dot ${prob.difficulty?.toLowerCase()}`}></div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
