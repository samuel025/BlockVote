import { useState, useEffect } from "react";
import { DEPLOYMENT } from "../config/deployment";
import { fetchOnChainResults, fetchTotalVotes, isElectionActive, getElectionTimes, getEligibleVoterCount, getCurrentElectionId } from "../services/blockchain";
import { api } from "../services/api";

export default function DashboardPage() {
  const [stats, setStats] = useState({ totalStudents: 0, eligibleVoters: 0, totalVotes: 0, active: false });
  const [results, setResults] = useState([]);
  const [electionTimes, setElectionTimes] = useState({ start: 0, end: 0 });
  const [currentElectionId, setCurrentElectionId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadDashboard();
    const interval = setInterval(loadDashboard, 10000);
    return () => clearInterval(interval);
  }, []);

  async function loadDashboard() {
    try {
      const eId = await getCurrentElectionId().catch(() => null);
      if (!eId) { setLoading(false); return; }

      const [studentsRes, active, times, totalVotes, onChainResults, commitmentsRes] = await Promise.all([
        api.getStudents().catch(() => ({ students: [] })),
        isElectionActive().catch(() => false),
        getElectionTimes().catch(() => ({ start: 0, end: 0 })),
        fetchTotalVotes(eId).catch(() => 0),
        fetchOnChainResults(eId).catch(() => []),
        api.getEnrollmentCommitments().catch(() => ({ commitments: [] }))
      ]);

      const eligibleVoters = commitmentsRes.commitments ? commitmentsRes.commitments.length : 0;

      setCurrentElectionId(eId);
      setStats({
        totalStudents: studentsRes.students?.length || 0,
        eligibleVoters,
        totalVotes,
        active,
      });
      setResults(onChainResults);
      setElectionTimes(times);
      setError(null);
    } catch (err) {
      setError("Failed to load dashboard data. Please check backend and blockchain connections.");
    } finally {
      setLoading(false);
    }
  }

  const totalVoteCount = results.reduce((sum, r) => sum + r.voteCount, 0);
  const now = Math.floor(Date.now() / 1000);
  const timeLeft = electionTimes.end > now ? electionTimes.end - now : 0;
  const hours = Math.floor(timeLeft / 3600);
  const minutes = Math.floor((timeLeft % 3600) / 60);

  if (loading) {
    return <div className="loading-state"><div className="spinner spinner-lg" /><span>Loading dashboard…</span></div>;
  }

  return (
    <div className="fade-in">
      {error && <div className="alert alert-warning"><span className="alert-icon">⚠</span><span>{error}</span></div>}

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon blue">👥</div>
          <div><div className="stat-label">Registered Students</div><div className="stat-value">{stats.totalStudents}</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon green">✓</div>
          <div><div className="stat-label">Eligible Voters</div><div className="stat-value">{stats.eligibleVoters}</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon amber">🗳</div>
          <div><div className="stat-label">Votes Cast</div><div className="stat-value">{stats.totalVotes}</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: stats.active ? "var(--success-light)" : "var(--danger-light)", color: stats.active ? "var(--success)" : "var(--danger)" }}>
            {stats.active ? "●" : "○"}
          </div>
          <div>
            <div className="stat-label">Election Status</div>
            <div className="stat-value" style={{ fontSize: 18 }}>{stats.active ? "Active" : "Inactive"}</div>
            {stats.active && timeLeft > 0 && (
              <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>{hours}h {minutes}m remaining</div>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div className="card">
          <div className="card-header">
            <span className="card-title">Election Overview</span>
            <span className={`badge ${stats.active ? "badge-active" : "badge-inactive"}`}>
              {stats.active ? "Live" : "Ended"}
            </span>
          </div>
          <div className="card-body">
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>University Election</div>
              <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                Election ID: {currentElectionId || "—"} • {results.length} candidates
              </div>
            </div>
            <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
              <div>Start: {electionTimes.start ? new Date(electionTimes.start * 1000).toLocaleString() : "—"}</div>
              <div>End: {electionTimes.end ? new Date(electionTimes.end * 1000).toLocaleString() : "—"}</div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">Current Standings</span>
            <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{totalVoteCount} total votes</span>
          </div>
          <div className="card-body">
            {results.length === 0 ? (
              <div className="empty-state" style={{ padding: 24 }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>📊</div>
                <div style={{ fontSize: 13 }}>No votes recorded yet</div>
              </div>
            ) : (
              results.map((r, i) => {
                const pct = totalVoteCount > 0 ? ((r.voteCount / totalVoteCount) * 100).toFixed(1) : 0;
                return (
                  <div key={r.id} className="result-item">
                    <div className="result-header">
                      <span className="result-name">{r.name}</span>
                      <span className="result-votes">{r.voteCount} votes</span>
                    </div>
                    <div className="result-bar-bg">
                      <div className={`result-bar-fill c${(i % 3) + 1}`} style={{ width: `${pct}%` }} />
                    </div>
                    <div className="result-percent">{pct}%</div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
