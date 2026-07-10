import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { DEPLOYMENT, VOTING_ABI, ELIGIBILITY_ABI } from "../config/deployment";
import { getProvider, fetchOnChainResults } from "../services/blockchain";
import { api } from "../services/api";
import { useToast } from "../components/Toast";

export default function AdminPage() {
  const [loading, setLoading] = useState(false);
  const [dataLoading, setDataLoading] = useState(true);
  const toast = useToast();

  // On-chain state
  const [electionState, setElectionState] = useState({
    id: 0,
    name: "",
    active: false,
    start: 0,
    end: 0,
    totalVotes: 0,
    candidates: [],
    dbCommitmentsCount: 0,
    unsyncedCount: 0
  });

  // Form states
  const [newElectionId, setNewElectionId] = useState("");
  const [newElectionName, setNewElectionName] = useState("");
  const [durationHours, setDurationHours] = useState("24");
  const [candidateId, setCandidateId] = useState("");
  const [candidateName, setCandidateName] = useState("");
  const [candidateParty, setCandidateParty] = useState("");
  const [candidatePost, setCandidatePost] = useState("President"); // Default post

  useEffect(() => {
    loadAdminData();
    const interval = setInterval(loadAdminData, 15000);
    return () => clearInterval(interval);
  }, []);

  async function loadAdminData() {
    try {
      const voting = new ethers.Contract(DEPLOYMENT.contracts.Voting, VOTING_ABI, getProvider());
      
      const eId = await voting.electionId().catch(() => 0n);
      const name = await voting.electionName().catch(() => "");
      const active = await voting.electionActive().catch(() => false);
      const start = await voting.electionStart().catch(() => 0n);
      const end = await voting.electionEnd().catch(() => 0n);
      
      let totalVotes = 0;
      let candidates = [];
      
      if (eId > 0n) {
        totalVotes = await voting.totalVotesCast(eId).catch(() => 0n);
        candidates = await fetchOnChainResults(Number(eId)).catch(() => []);
      }

      const { commitments } = await api.getEnrollmentCommitments().catch(() => ({ commitments: [] }));
      const eligibility = new ethers.Contract(DEPLOYMENT.contracts.VoterEligibility, ELIGIBILITY_ABI, getProvider());

      // Check which commitments are already synced
      const syncStatuses = await Promise.all(commitments.map(async (c) => {
        const hash = c.enrollment_commitment.startsWith("0x") ? c.enrollment_commitment : ethers.toBeHex(BigInt(c.enrollment_commitment), 32);
        return await eligibility.enrollmentCommitments(hash).catch(() => false);
      }));
      const unsyncedCount = syncStatuses.filter(status => !status).length;

      setElectionState({
        id: Number(eId),
        name,
        active,
        start: Number(start),
        end: Number(end),
        totalVotes: Number(totalVotes),
        candidates: candidates.sort((a, b) => b.voteCount - a.voteCount),
        dbCommitmentsCount: commitments.length,
        unsyncedCount
      });

      // Auto-fill inputs if they haven't been manually typed yet
      setNewElectionId(String(Number(eId) + 1));
      const nextCandidateId = candidates.length > 0 ? Math.max(...candidates.map(c => c.id)) + 1 : 1;
      setCandidateId(String(nextCandidateId));
    } catch (err) {
      console.error("Failed to load admin data:", err);
    } finally {
      setDataLoading(false);
    }
  }

  async function getAdminSigner() {
    return getProvider().getSigner(0);
  }

  // 1. End Election
  async function handleEndElection() {
    if (!window.confirm("Are you sure you want to STOP this election? This cannot be undone.")) return;
    setLoading(true);
    try {
      const signer = await getAdminSigner();
      const voting = new ethers.Contract(DEPLOYMENT.contracts.Voting, VOTING_ABI, signer);
      const tx = await voting.endElection();
      await tx.wait();
      toast.success("Election stopped successfully!");
      loadAdminData();
    } catch (err) {
      toast.error(err.reason || err.message || "Failed to end election");
    } finally {
      setLoading(false);
    }
  }

  // 2. Create Election
  async function handleCreateElection(e) {
    e.preventDefault();
    if (!newElectionId) return;
    
    if (electionState.active && !window.confirm("There is currently an active election. Creating a new one will override the current pointers. Proceed?")) {
      return;
    }

    setLoading(true);
    try {
      const signer = await getAdminSigner();
      const eligibility = new ethers.Contract(DEPLOYMENT.contracts.VoterEligibility, ELIGIBILITY_ABI, signer);
      const voting = new ethers.Contract(DEPLOYMENT.contracts.Voting, VOTING_ABI, signer);

      if (electionState.active) {
        let endTx = await voting.endElection();
        await endTx.wait();
      }

      const id = parseInt(newElectionId);
      
      let tx = await eligibility.createElection(id);
      await tx.wait();

      const now = Math.floor(Date.now() / 1000);
      const end = now + (parseInt(durationHours) * 3600);
      
      tx = await voting.initializeElection(id, newElectionName, now, end);
      await tx.wait();

      toast.success(`Election #${id} successfully created and initialized on-chain!`);
      setNewElectionId("");
      loadAdminData();
    } catch (err) {
      toast.error(err.reason || err.message || "Failed to create election");
    } finally {
      setLoading(false);
    }
  }

  // 3. Add Candidate
  async function handleAddCandidate(e) {
    e.preventDefault();
    if (!candidateId || !candidateName || !candidateParty || !candidatePost) return;
    setLoading(true);

    try {
      const signer = await getAdminSigner();
      const voting = new ethers.Contract(DEPLOYMENT.contracts.Voting, VOTING_ABI, signer);

      const tx = await voting.addCandidate(parseInt(candidateId), candidateName, candidateParty, candidatePost);
      await tx.wait();

      toast.success(`Candidate ${candidateName} added successfully to ${candidatePost}!`);
      setCandidateId("");
      setCandidateName("");
      setCandidateParty("");
      // Keep candidatePost as is, to easily add multiple for same post
      loadAdminData();
    } catch (err) {
      toast.error(err.reason || err.message || "Failed to add candidate");
    } finally {
      setLoading(false);
    }
  }

  // 4. Sync Commitments
  async function handleSyncCommitments() {
    setLoading(true);
    try {
      const { commitments } = await api.getEnrollmentCommitments();
      if (!commitments || commitments.length === 0) {
        toast.info("No enrollment commitments found in database.");
        setLoading(false);
        return;
      }

      const signer = await getAdminSigner();
      const eligibility = new ethers.Contract(DEPLOYMENT.contracts.VoterEligibility, ELIGIBILITY_ABI, signer);

      // Filter only unsynced commitments
      const unsyncedHashes = [];
      for (const c of commitments) {
        const hash = c.enrollment_commitment.startsWith("0x") ? c.enrollment_commitment : ethers.toBeHex(BigInt(c.enrollment_commitment), 32);
        const isSynced = await eligibility.enrollmentCommitments(hash);
        if (!isSynced) {
          unsyncedHashes.push(hash);
        }
      }

      if (unsyncedHashes.length === 0) {
        toast.info("All commitments are already synced!");
        setLoading(false);
        return;
      }

      const tx = await eligibility.addEnrollmentCommitments(unsyncedHashes);
      await tx.wait();

      toast.success(`Successfully synced ${unsyncedHashes.length} new commitments to the blockchain!`);
      loadAdminData();
    } catch (err) {
      toast.error(err.reason || err.message || "Failed to sync commitments");
    } finally {
      setLoading(false);
    }
  }

  if (dataLoading) {
    return <div className="loading-state"><div className="spinner spinner-lg" /><span>Loading Blockchain Data…</span></div>;
  }

  const now = Math.floor(Date.now() / 1000);
  const isTimeEnded = electionState.end > 0 && now >= electionState.end;

  return (
    <div className="fade-in">
      <div className="alert alert-info" style={{ marginBottom: 24 }}>
        <span className="alert-icon">🛡️</span>
        <div>
          <strong>Admin Control Panel</strong>
          <div style={{ marginTop: 4, fontSize: 12, lineHeight: 1.5 }}>
            Manage the complete lifecycle of an election. Follow the steps below to securely synchronize biometric data, initialize the smart contracts, and register candidates.
          </div>
        </div>
      </div>

      {electionState.id === 0 ? (
        // ----------------------------------------------------
        // STATE 1: SETUP MODE (No Active Election)
        // ----------------------------------------------------
        <div className="setup-mode">
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>Pre-Election Setup</h2>
          
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
            {/* Step 1: Sync Commitments */}
            <div className="card" style={{ borderTop: "4px solid var(--accent)" }}>
              <div className="card-header"><span className="card-title">Step 1: Sync Voter Whitelist</span></div>
              <div className="card-body">
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 36, fontWeight: 800, lineHeight: 1, color: electionState.unsyncedCount > 0 ? "var(--warning)" : "var(--success)" }}>
                    {electionState.unsyncedCount}
                  </div>
                  <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4, fontWeight: 600 }}>
                    Unsynced Students (out of {electionState.dbCommitmentsCount} total)
                  </div>
                </div>
                <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 20, lineHeight: 1.5 }}>
                  Push the latest cryptographic biometric locks from the backend database into the `VoterEligibility` smart contract. This allows enrolled students to vote anonymously.
                </p>
                <button className="btn btn-secondary btn-block" onClick={handleSyncCommitments} disabled={loading || electionState.unsyncedCount === 0}>
                   {loading ? "Syncing to Blockchain..." : electionState.unsyncedCount === 0 ? "✅ All Synced" : `Sync ${electionState.unsyncedCount} Commitments`}
                </button>
              </div>
            </div>

            {/* Step 2: Initialize Election */}
            <div className="card" style={{ borderTop: "4px solid #10B981" }}>
              <div className="card-header"><span className="card-title">Step 2: Initialize Election</span></div>
              <div className="card-body">
                <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 20, lineHeight: 1.5 }}>
                  Create a new election instance on the blockchain and open the time window for voting.
                </p>
                <form onSubmit={handleCreateElection}>
                  <div className="form-group">
                    <label className="form-label">Election Title / Name</label>
                    <input type="text" className="form-input" value={newElectionName} onChange={e => setNewElectionName(e.target.value)} required disabled={loading} placeholder="e.g. 2026 SUG Presidential Election" />
                  </div>
                  <div style={{ display: "flex", gap: 16 }}>
                    <div className="form-group" style={{ flex: 1 }}>
                      <label className="form-label">Election ID (Auto)</label>
                      <input type="number" className="form-input" value={newElectionId} onChange={e => setNewElectionId(e.target.value)} required disabled={loading} />
                    </div>
                    <div className="form-group" style={{ flex: 1 }}>
                      <label className="form-label">Duration (Hours)</label>
                      <input type="number" className="form-input" value={durationHours} onChange={e => setDurationHours(e.target.value)} required disabled={loading} min="1" />
                    </div>
                  </div>
                  <button type="submit" className="btn btn-primary btn-block" disabled={loading || !newElectionId || !newElectionName}>
                    {loading ? "Initializing..." : "Initialize Election on Blockchain"}
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      ) : (
        // ----------------------------------------------------
        // STATE 2: ACTIVE ELECTION DASHBOARD
        // ----------------------------------------------------
        <div className="active-mode">
          
          {/* Live Dashboard Header */}
          <div className="card" style={{ marginBottom: 24, borderLeft: electionState.active ? "4px solid #10B981" : "4px solid #EF4444" }}>
            <div className="card-header" style={{ borderBottom: "none", paddingBottom: 0 }}>
              <div>
                <span className="card-title" style={{ fontSize: 22 }}>Live Election Dashboard</span>
                <div style={{ fontSize: 14, color: "var(--text-secondary)", marginTop: 4 }}>
                  {electionState.name ? `📌 ${electionState.name}` : "Untitled Election"}
                </div>
              </div>
              {electionState.active && (
                <button className="btn btn-danger btn-sm" onClick={handleEndElection} disabled={loading}>
                  ⏹ Emergency Stop Election
                </button>
              )}
            </div>
            <div className="card-body">
              <div style={{ display: "flex", flexWrap: "wrap", gap: 40, marginTop: 16 }}>
                <div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 6, textTransform: "uppercase", fontWeight: 600 }}>Status</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span className={`status-dot ${electionState.active ? "online" : "offline"}`} style={{ width: 12, height: 12 }} />
                    <span style={{ fontSize: 20, fontWeight: 700, color: electionState.active ? "#10B981" : "#EF4444" }}>
                      {electionState.active ? "Receiving Votes" : (isTimeEnded ? "Ended (Time Expired)" : "Ended (Manually Stopped)")}
                    </span>
                  </div>
                </div>
                
                <div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 6, textTransform: "uppercase", fontWeight: 600 }}>Election ID</div>
                  <div style={{ fontSize: 20, fontWeight: 700 }}>#{electionState.id}</div>
                </div>

                <div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 6, textTransform: "uppercase", fontWeight: 600 }}>Total Votes Cast</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: "var(--accent)" }}>{electionState.totalVotes}</div>
                </div>

                <div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 6, textTransform: "uppercase", fontWeight: 600 }}>Time Window</div>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>
                    <div style={{ marginBottom: 4 }}>🟢 Start: {new Date(electionState.start * 1000).toLocaleString()}</div>
                    <div>🔴 End: {new Date(electionState.end * 1000).toLocaleString()}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 24 }}>
            {/* Left Column: Candidates Table */}
            <div className="card">
              <div className="card-header">
                <span className="card-title">Registered Candidates</span>
                <span className="badge badge-inactive">{electionState.candidates.length} Total</span>
              </div>
              <div className="card-body" style={{ padding: 0 }}>
                <div className="table-wrapper">
                  <table style={{ width: "100%", textAlign: "left", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-secondary)" }}>
                        <th style={{ padding: "12px 16px" }}>ID</th>
                        <th style={{ padding: "12px 16px" }}>Candidate Name</th>
                        <th style={{ padding: "12px 16px" }}>Post</th>
                        <th style={{ padding: "12px 16px" }}>Party / Affiliation</th>
                        <th style={{ padding: "12px 16px", textAlign: "right" }}>Votes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {electionState.candidates.length === 0 ? (
                        <tr>
                          <td colSpan="4" style={{ textAlign: "center", padding: "40px 20px", color: "var(--text-secondary)" }}>
                            <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
                            <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)" }}>No candidates registered yet.</div>
                            <div style={{ fontSize: 13, marginTop: 4 }}>Use the form on the right to add candidates so voters have options.</div>
                          </td>
                        </tr>
                      ) : (
                        electionState.candidates.map(c => (
                          <tr key={c.id} style={{ borderBottom: "1px solid var(--border)" }}>
                            <td style={{ padding: "12px 16px", color: "var(--text-secondary)" }}>#{c.id}</td>
                            <td style={{ padding: "12px 16px", fontWeight: 700 }}>{c.name}</td>
                            <td style={{ padding: "12px 16px", color: "var(--text-secondary)", fontStyle: "italic" }}>{c.post || "President"}</td>
                            <td style={{ padding: "12px 16px" }}>{c.party}</td>
                            <td style={{ padding: "12px 16px", fontWeight: 800, color: "var(--accent)", textAlign: "right", fontSize: 16 }}>{c.voteCount}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Right Column: Actions (Add Candidate & Danger Zone) */}
            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              
              {/* Dynamic Action Card based on Election State */}
              {!electionState.active ? (
                <div className="card" style={{ borderTop: "4px solid #10B981" }}>
                  <div className="card-header"><span className="card-title">Start Next Election</span></div>
                  <div className="card-body">
                    <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 16, lineHeight: 1.5 }}>
                      The previous election has ended. You can now initialize a new election instance on the blockchain.
                    </p>
                    <form onSubmit={handleCreateElection} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                      <div>
                        <label className="form-label" style={{ fontSize: 12 }}>Election Title / Name</label>
                        <input type="text" className="form-input" value={newElectionName} onChange={e => setNewElectionName(e.target.value)} required disabled={loading} placeholder="e.g. 2026 SUG Election" />
                      </div>
                      <div style={{ display: "flex", gap: 12 }}>
                        <div style={{ flex: 1 }}>
                          <label className="form-label" style={{ fontSize: 12 }}>ID (Auto)</label>
                          <input type="number" className="form-input" value={newElectionId} onChange={e => setNewElectionId(e.target.value)} required disabled={loading} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <label className="form-label" style={{ fontSize: 12 }}>Duration (Hrs)</label>
                          <input type="number" className="form-input" value={durationHours} onChange={e => setDurationHours(e.target.value)} required disabled={loading} min="1" />
                        </div>
                      </div>
                      <button type="submit" className="btn btn-primary btn-block" style={{ marginTop: 8 }} disabled={loading || !newElectionId || !newElectionName}>
                        {loading ? "Initializing..." : "🚀 Start New Election"}
                      </button>
                    </form>
                  </div>
                </div>
              ) : (
                <div className="card" style={{ borderTop: "4px solid #F59E0B" }}>
                  <div className="card-header"><span className="card-title">Step 3: Add Candidate</span></div>
                  <div className="card-body">
                    <form onSubmit={handleAddCandidate} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                      <div>
                        <label className="form-label" style={{ fontSize: 12 }}>Candidate ID (Auto)</label>
                        <input type="number" className="form-input" value={candidateId} onChange={e => setCandidateId(e.target.value)} required disabled={loading} />
                      </div>
                      <div>
                        <label className="form-label" style={{ fontSize: 12 }}>Full Name</label>
                        <input type="text" className="form-input" value={candidateName} onChange={e => setCandidateName(e.target.value)} required disabled={loading} placeholder="Jane Doe" />
                      </div>
                      <div>
                        <label className="form-label" style={{ fontSize: 12 }}>Party / Affiliation</label>
                        <input type="text" className="form-input" value={candidateParty} onChange={e => setCandidateParty(e.target.value)} required disabled={loading} placeholder="Progressive Party" />
                      </div>
                      <div>
                        <label className="form-label" style={{ fontSize: 12 }}>Post / Office</label>
                        <select className="form-input" value={candidatePost} onChange={e => setCandidatePost(e.target.value)} required disabled={loading}>
                          <option value="President">President</option>
                          <option value="Vice President">Vice President</option>
                          <option value="Secretary">Secretary</option>
                          <option value="Treasurer">Treasurer</option>
                        </select>
                      </div>
                      <button type="submit" className="btn btn-primary btn-block" style={{ marginTop: 8 }} disabled={loading || !candidateId || !candidateName}>
                        {loading ? "Adding..." : "➕ Add to Blockchain"}
                      </button>
                    </form>
                  </div>
                </div>
              )}

              {/* Auxiliary Actions */}
              <div className="card">
                <div className="card-header"><span className="card-title">Auxiliary Actions</span></div>
                <div className="card-body">
                  <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 12, lineHeight: 1.5 }}>
                    If you enroll new students while the election is active, you can sync the updated whitelist here.
                  </p>
                  <button className="btn btn-secondary btn-block" onClick={handleSyncCommitments} disabled={loading || electionState.unsyncedCount === 0}>
                    {electionState.unsyncedCount === 0 ? "✅ Whitelist Up to Date" : `Sync ${electionState.unsyncedCount} New Entries`}
                  </button>
                  
                </div>
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  );
}
