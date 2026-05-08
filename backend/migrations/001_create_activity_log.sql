-- ============================================
-- Migration: Create activity_log table
-- Purpose: Tracks every code run/submit event for analytics
-- Run this in your Supabase SQL Editor
-- ============================================

CREATE TABLE IF NOT EXISTS activity_log (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,              -- 'run', 'submit', 'page_view', 'signup'
    problem_id INT,                        -- NULL for non-problem events
    status TEXT,                            -- 'passed', 'failed', 'timeout', 'error'
    attempt_number INT DEFAULT 1,
    response_time_ms INT,                  -- API response time in milliseconds
    metadata JSONB DEFAULT '{}',           -- flexible extra data
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for fast analytics queries
CREATE INDEX IF NOT EXISTS idx_activity_log_user ON activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_event ON activity_log(event_type);
CREATE INDEX IF NOT EXISTS idx_activity_log_created ON activity_log(created_at);
CREATE INDEX IF NOT EXISTS idx_activity_log_problem ON activity_log(problem_id);

-- Composite index for common query patterns
CREATE INDEX IF NOT EXISTS idx_activity_log_event_created ON activity_log(event_type, created_at);

-- Enable Row Level Security (optional, metrics endpoint uses service role)
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only insert their own events  
CREATE POLICY "Users can insert own activity" ON activity_log
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Policy: Service role can read all (for metrics)
CREATE POLICY "Service role can read all activity" ON activity_log
    FOR SELECT USING (true);
