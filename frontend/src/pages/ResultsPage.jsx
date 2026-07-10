import { useState, useEffect } from "react";
import { DEPLOYMENT } from "../config/deployment";
import { fetchOnChainResults, fetchTotalVotes, isElectionActive, getElectionTimes, getCurrentElectionId } from "../services/blockchain";

const COLORS = ["var(--accent)", "var(--success)", "var(--warning)"];

export default function ResultsPage() {
  const [results, setResults] = useState([]);
  const [totalVotes, setTotalVotes] = useState(0);
  const [active, setActive] = useState(false);
  const [times, setTimes] = useState({ start: 0, end: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [selectedElectionId, setSelectedElectionId] = useState(null);
  const [maxElectionId, setMaxElectionId] = useState(0);

  useEffect(() => {
    loadResults();
    if (!autoRefresh) return;
    const interval = setInterval(loadResults, 8000);
    return () => clearInterval(interval);
  }, [autoRefresh, selectedElectionId]);

  async function loadResults() {
    try {
      const currentEId = await getCurrentElectionId().catch(() => null);
      if (!currentEId) { setLoading(false); return; }
      
      setMaxElectionId(currentEId);
      
      const eIdToFetch = selectedElectionId || currentEId;

      const [onChainResults, total, isActive, elTimes] = await Promise.all([
        fetchOnChainResults(eIdToFetch),
        fetchTotalVotes(eIdToFetch),
        isElectionActive(), // Note: This only checks if the *current* election is active
        getElectionTimes(),
      ]);
      setResults(onChainResults.sort((a, b) => b.voteCount - a.voteCount));
      setTotalVotes(total);
      // Determine if the *viewed* election is active
      const isViewedElectionActive = eIdToFetch === currentEId && isActive;
      setActive(isViewedElectionActive);
      setTimes(elTimes);
      setError(null);
    } catch (err) {
      setError("Failed to fetch results from the blockchain.");
    } finally {
      setLoading(false);
    }
  }

  const uniquePostsCount = [...new Set(results.map(r => r.post || "President"))].length;

  if (loading) {
    return <div className="loading-state"><div className="spinner spinner-lg" /><span>Fetching on-chain results…</span></div>;
  }

  return (
    <div className="fade-in">
      {error && <div className="alert alert-error"><span className="alert-icon">✕</span><span>{error}</span></div>}

      <div className="stats-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
        <div className="stat-card">
          <div className="stat-icon amber">🗳</div>
          <div><div className="stat-label">Total Voters</div><div className="stat-value">{totalVotes}</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon blue">📋</div>
          <div>
            <div className="stat-label">Open Posts</div>
            <div className="stat-value" style={{ fontSize: 16 }}>
              {uniquePostsCount} {uniquePostsCount === 1 ? "Position" : "Positions"}
            </div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: active ? "var(--success-light)" : "var(--bg-badge)", color: active ? "var(--success)" : "var(--text-secondary)" }}>
            {active ? "●" : "○"}
          </div>
          <div><div className="stat-label">Status</div><div className="stat-value" style={{ fontSize: 16 }}>{active ? "Voting Open" : "Ended"}</div></div>
        </div>
      </div>

      <div className="card">
        <div className="card-header" style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
          <span className="card-title">Election Results</span>
          
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginLeft: "auto" }}>
            <select 
              className="form-input" 
              style={{ width: "auto", padding: "4px 8px", fontSize: 13, height: "auto" }}
              value={selectedElectionId || maxElectionId}
              onChange={(e) => {
                setSelectedElectionId(Number(e.target.value));
                setLoading(true);
                // The useEffect dependency will trigger a reload soon, but we can speed it up
              }}
            >
              {Array.from({ length: maxElectionId }, (_, i) => maxElectionId - i).map(id => (
                <option key={id} value={id}>Election #{id} {id === maxElectionId && active ? "(Active)" : ""}</option>
              ))}
            </select>
            
            <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
              <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
              Auto-refresh
            </label>
            <button className="btn btn-ghost btn-sm" onClick={loadResults}>↻ Refresh</button>
          </div>
        </div>
        <div className="card-body">
          {results.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">📊</div>
              <div className="empty-state-title">No Results Yet</div>
              <div style={{ fontSize: 13 }}>Votes will appear here once they are cast on-chain.</div>
            </div>
          ) : (
            (() => {
              const uniquePosts = [...new Set(results.map(r => r.post || "President"))];
              return (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 24 }}>
                  {uniquePosts.map(post => {
                    const postResults = results.filter(r => (r.post || "President") === post).sort((a, b) => b.voteCount - a.voteCount);
                    const isTiedPost = postResults.length > 1 && postResults[0].voteCount === postResults[1].voteCount && postResults[0].voteCount > 0;
                    
                    return (
                      <div key={post} className="card" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", boxShadow: "none", marginBottom: 0 }}>
                        <div className="card-header" style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", background: "rgba(0,0,0,0.02)" }}>
                          <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            {post}
                            <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary)", background: "var(--bg-badge)", padding: "2px 8px", borderRadius: 12 }}>
                              {postResults.length} Candidates
                            </span>
                          </h3>
                        </div>
                        <div className="card-body" style={{ padding: "0 20px 20px" }}>
                          {postResults.map((r, i) => {
                            const pct = totalVotes > 0 ? ((r.voteCount / totalVotes) * 100).toFixed(1) : 0;
                            const isLeader = i === 0 && r.voteCount > 0 && !isTiedPost;
                            const badgeText = active ? "Leading" : "Winner 🏆";
                            const badgeStyle = active ? {} : { background: "var(--warning)", color: "#000", fontWeight: 800 };

                            return (
                              <div key={r.id} className="result-item" style={{ padding: "16px 0", borderBottom: i < postResults.length - 1 ? "1px solid var(--border)" : "none" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 12 }}>
                                  <div style={{
                                    width: 36, height: 36, borderRadius: "50%", display: "flex", alignItems: "center",
                                    justifyContent: "center", fontSize: 13, fontWeight: 700, flexShrink: 0,
                                    background: isLeader ? (active ? "var(--accent)" : "var(--warning)") : "var(--bg-input)", 
                                    color: isLeader ? (active ? "#fff" : "#000") : "var(--text-secondary)",
                                    boxShadow: isLeader && !active ? "0 0 10px rgba(245, 158, 11, 0.3)" : "none"
                                  }}>
                                    #{i + 1}
                                  </div>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div className="result-header" style={{ marginBottom: 2, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                      <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "flex", alignItems: "center" }}>
                                        <span className="result-name" style={{ fontSize: 15 }}>{r.name}</span>
                                        {isLeader && <span className="badge badge-active" style={{ marginLeft: 8, fontSize: 10, ...badgeStyle }}>{badgeText}</span>}
                                      </div>
                                      <span className="result-votes" style={{ fontWeight: 700, flexShrink: 0, marginLeft: 8 }}>{r.voteCount} vote{r.voteCount !== 1 ? "s" : ""}</span>
                                    </div>
                                    <div className="result-party" style={{ fontSize: 12 }}>{r.party}</div>
                                  </div>
                                </div>
                                <div className="result-bar-bg" style={{ height: 8, background: "var(--bg-input)", borderRadius: 4 }}>
                                  <div className="result-bar-fill" style={{ width: `${pct}%`, background: COLORS[i % COLORS.length], borderRadius: 4, height: "100%" }} />
                                </div>
                                <div className="result-percent" style={{ fontSize: 11, marginTop: 6, color: "var(--text-tertiary)" }}>{pct}% of total voters</div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()
          )}
        </div>
      </div>

      <div style={{ marginTop: 16, fontSize: 11, color: "var(--text-tertiary)", textAlign: "center" }}>
        Results fetched directly from smart contract at {DEPLOYMENT.contracts.Voting}
        <br />Data is publicly verifiable on-chain • {autoRefresh ? "Auto-refreshing every 8s" : "Auto-refresh paused"}
      </div>
    </div>
  );
}
