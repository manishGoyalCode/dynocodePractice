"use client";

import { useState, useEffect } from "react";
import Navbar from "@/components/Navbar";
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function MetricsPage() {
    const [metrics, setMetrics] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchMetrics = async () => {
            try {
                const r = await fetch(`${API_BASE}/metrics`);
                const data = await r.json();
                setMetrics(data);
            } catch (err) {
                console.error("Failed to fetch metrics", err);
            } finally {
                setLoading(false);
            }
        };
        fetchMetrics();
    }, []);

    if (loading) return <div className="loading-screen">Analyzing System Metrics...</div>;

    return (
        <div className="app-wrapper">
            <Navbar 
                solvedCount={metrics?.total_solved || 0} 
                totalProblems={metrics?.total_problems || 0} 
                streak={0} 
            />
            <main className="metrics-container">
                <header className="metrics-header">
                    <h1>
                        System Insights 
                        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="header-icon-svg">
                            <line x1="18" y1="20" x2="18" y2="10"></line>
                            <line x1="12" y1="20" x2="12" y2="4"></line>
                            <line x1="6" y1="20" x2="6" y2="14"></line>
                        </svg>
                    </h1>
                    <p>Real-time metrics and historical activity breakdown over the last 7 days.</p>
                </header>

                <div className="stats-grid">
                    <div className="stat-card">
                        <div className="stat-icon">👥</div>
                        <div className="stat-info">
                            <span className="stat-label">Total Users</span>
                            <span className="stat-value">{metrics?.total_users || 0}</span>
                        </div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-icon">✅</div>
                        <div className="stat-info">
                            <span className="stat-label">Problems Solved</span>
                            <span className="stat-value">{metrics?.total_solved || 0}</span>
                        </div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-icon">📚</div>
                        <div className="stat-info">
                            <span className="stat-label">System Problems</span>
                            <span className="stat-value">{metrics?.total_problems || 0}</span>
                        </div>
                    </div>
                </div>

                <div className="chart-section">
                    <h3>Activity Timeline (Last 7 Days)</h3>
                    <div className="chart-wrapper">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={metrics?.history} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="colorSolved" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                                    </linearGradient>
                                    <linearGradient id="colorActive" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                                    </linearGradient>
                                    <linearGradient id="colorRegistered" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3}/>
                                        <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                                <XAxis 
                                    dataKey="date" 
                                    stroke="#94a3b8" 
                                    fontSize={12} 
                                    tickLine={false} 
                                    axisLine={false} 
                                    tickFormatter={(str) => {
                                        const d = new Date(str);
                                        return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                                    }}
                                />
                                <YAxis 
                                    stroke="#94a3b8" 
                                    fontSize={12} 
                                    tickLine={false} 
                                    axisLine={false} 
                                />
                                <Tooltip 
                                    contentStyle={{ 
                                        backgroundColor: '#1a2236', 
                                        border: '1px solid #1e293b',
                                        borderRadius: '12px',
                                        color: '#f1f5f9',
                                        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'
                                    }}
                                    itemStyle={{ padding: '2px 0' }}
                                />
                                <Legend verticalAlign="top" height={36} iconType="circle" />
                                <Area 
                                    type="monotone" 
                                    dataKey="solved" 
                                    stroke="#6366f1" 
                                    strokeWidth={4}
                                    fillOpacity={1} 
                                    fill="url(#colorSolved)" 
                                    name="Problems Solved"
                                    animationDuration={1500}
                                />
                                <Area 
                                    type="monotone" 
                                    dataKey="active" 
                                    stroke="#10b981" 
                                    strokeWidth={4}
                                    fillOpacity={1} 
                                    fill="url(#colorActive)" 
                                    name="Active Users"
                                    animationDuration={1500}
                                />
                                <Area 
                                    type="monotone" 
                                    dataKey="registered" 
                                    stroke="#f59e0b" 
                                    strokeWidth={4}
                                    fillOpacity={1} 
                                    fill="url(#colorRegistered)" 
                                    name="New Registrations"
                                    animationDuration={1500}
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <footer className="metrics-footer" style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: 'auto', padding: '20px 0' }}>
                    &copy; {new Date().getFullYear()} DynoCode Statistics Engine
                </footer>
            </main>
        </div>
    );
}
