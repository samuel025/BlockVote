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
    active: false,
    start: 0,
    end: 0,
    totalVotes: 0,
    candidates: [],
    dbCommitmentsCount: 0
  });

  // Form states
  const [newElectionId, setNewElectionId] = useState("");
  const [durationHours, setDurationHours] = useState("24");
  const [candidateId, setCandidateId] = useState("");
  const [candidateName, setCandidateName] = useState("");
  const [candidateParty, setCandidateParty] = useState("");

  useEffect(() => {
    loadAdminData();
    const interval = setInterval(loadAdminData, 15000);
    return () => clearInterval(interval);
  }, []);

  async function loadAdminData() {
    try {
      const voting = new ethers.Contract(DEPLOYMENT.contracts.Voting, VOTING_ABI, getProvider());
      
      const eId = await voting.electionId().catch(() => 0n);
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

      setElectionState({
        id: Number(eId),
        active,
        start: Number(start),
        end: Number(end),
        totalVotes: Number(totalVotes),
        candidates: candidates.sort((a, b) => b.voteCount - a.voteCount),
        dbCommitmentsCount: commitments.length
      });
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

      const id = parseInt(newElectionId);
      
      let tx = await eligibility.createElection(id);
      await tx.wait();

      const now = Math.floor(Date.now() / 1000);
      const end = now + (parseInt(durationHours) * 3600);
      
      tx = await voting.initializeElection(id, now, end);
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
    if (!candidateId || !candidateName || !candidateParty) return;
    setLoading(true);

    try {
      const signer = await getAdminSigner();
      const voting = new ethers.Contract(DEPLOYMENT.contracts.Voting, VOTING_ABI, signer);

      const tx = await voting.addCandidate(parseInt(candidateId), candidateName, candidateParty);
      await tx.wait();

      toast.success(`Candidate ${candidateName} added successfully!`);
      setCandidateId("");
      setCandidateName("");
      setCandidateParty("");
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
        toast.info("No new enrollment commitments to sync.");
        setLoading(false);
        return;
      }

      const commitmentHashes = commitments.map(c => 
        c.enrollment_commitment.startsWith("0x") ? c.enrollment_commitment : ethers.toBeHex(BigInt(c.enrollment_commitment), 32)
      );

      const signer = await getAdminSigner();
      const eligibility = new ethers.Contract(DEPLOYMENT.contracts.VoterEligibility, ELIGIBILITY_ABI, signer);

      const tx = await eligibility.addEnrollmentCommitments(commitmentHashes);
      await tx.wait();

      toast.success(`Successfully synced ${commitments.length} commitments to the blockchain!`);
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
            Manage the complete lifecycle of an election. All actions here execute real transactions on the underlying blockchain. 
            Modifying candidates or ending elections are immutable operations.
          </div>
        </div>
      </div>

      {/* Overview Section */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header">
          <span className="card-title">Current Election Overview</span>
          {electionState.active && (
            <button className="btn btn-danger btn-sm" onClick={handleEndElection} disabled={loading}>
              ⏹ Stop Election
            </button>
          )}
        </div>
        <div className="card-body">
          {electionState.id === 0 ? (
            <div className="empty-state" style={{ padding: "20px" }}>
              <div style={{ fontSize: 13 }}>No election has been initialized on the blockchain yet.</div>
            </div>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 32 }}>
              <div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 4, textTransform: "uppercase", fontWeight: 600 }}>Status</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span className={`status-dot ${electionState.active ? "online" : "offline"}`} />
                  <span style={{ fontSize: 18, fontWeight: 700 }}>
                    {electionState.active ? "Active" : (isTimeEnded ? "Ended (Time Expired)" : "Ended (Manually Stopped)")}
                  </span>
                </div>
              </div>
              
              <div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 4, textTransform: "uppercase", fontWeight: 600 }}>Election ID</div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>#{electionState.id}</div>
              </div>

              <div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 4, textTransform: "uppercase", fontWeight: 600 }}>Total Votes Cast</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "var(--accent)" }}>{electionState.totalVotes}</div>
              </div>

              <div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 4, textTransform: "uppercase", fontWeight: 600 }}>Time Window</div>
                <div style={{ fontSize: 13 }}>
                  <div>Start: {new Date(electionState.start * 1000).toLocaleString()}</div>
                  <div>End: {new Date(electionState.end * 1000).toLocaleString()}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 24, marginBottom: 24 }}>
        {/* Candidates Section */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Candidates (Election #{electionState.id || '-'})</span>
            <span className="badge badge-inactive">{electionState.candidates.length} Registered</span>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>ID</th><th>Candidate Name</th><th>Party / Affiliation</th><th>Votes Received</th>
                  </tr>
                </thead>
                <tbody>
                  {electionState.candidates.length === 0 ? (
                    <tr>
                      <td colSpan="4" style={{ textAlign: "center", padding: "24px", color: "var(--text-secondary)" }}>
                        No candidates added yet.
                      </td>
                    </tr>
                  ) : (
                    electionState.candidates.map(c => (
                      <tr key={c.id}>
                        <td>#{c.id}</td>
                        <td style={{ fontWeight: 600 }}>{c.name}</td>
                        <td>{c.party}</td>
                        <td style={{ fontWeight: 700, color: "var(--accent)" }}>{c.voteCount}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div style={{ padding: "20px", borderTop: "1px solid var(--border)", background: "var(--bg-primary)" }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Add New Candidate</div>
              <form onSubmit={handleAddCandidate} style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
                <div style={{ flex: "0 0 100px" }}>
                  <label className="form-label" style={{ fontSize: 11 }}>ID</label>
                  <input type="number" className="form-input" style={{ padding: "8px 10px" }} value={candidateId} onChange={e => setCandidateId(e.target.value)} required disabled={loading} placeholder="e.g. 1" />
                </div>
                <div style={{ flex: 1, minWidth: "150px" }}>
                  <label className="form-label" style={{ fontSize: 11 }}>Full Name</label>
                  <input type="text" className="form-input" style={{ padding: "8px 10px" }} value={candidateName} onChange={e => setCandidateName(e.target.value)} required disabled={loading} placeholder="Jane Doe" />
                </div>
                <div style={{ flex: 1, minWidth: "150px" }}>
                  <label className="form-label" style={{ fontSize: 11 }}>Party / Affiliation</label>
                  <input type="text" className="form-input" style={{ padding: "8px 10px" }} value={candidateParty} onChange={e => setCandidateParty(e.target.value)} required disabled={loading} placeholder="Progressive Party" />
                </div>
                <button type="submit" className="btn btn-primary" style={{ padding: "9px 16px" }} disabled={loading || !candidateId || !candidateName}>
                  ➕ Add
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        {/* Initialize Election */}
        <div className="card">
          <div className="card-header"><span className="card-title">Initialize New Election</span></div>
          <div className="card-body">
            <form onSubmit={handleCreateElection}>
              <div className="form-group">
                <label className="form-label">Election ID (Numeric)</label>
                <input type="number" className="form-input" value={newElectionId} onChange={e => setNewElectionId(e.target.value)} required disabled={loading} placeholder="e.g. 2" />
              </div>
              <div className="form-group">
                <label className="form-label">Duration (Hours)</label>
                <input type="number" className="form-input" value={durationHours} onChange={e => setDurationHours(e.target.value)} required disabled={loading} min="1" />
              </div>
              <button type="submit" className="btn btn-primary btn-block" disabled={loading || !newElectionId}>
                Initialize on Blockchain
              </button>
            </form>
          </div>
        </div>

        {/* Sync Commitments */}
        <div className="card">
          <div className="card-header"><span className="card-title">Sync Database to Blockchain</span></div>
          <div className="card-body">
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 32, fontWeight: 700, lineHeight: 1 }}>{electionState.dbCommitmentsCount}</div>
              <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4 }}>
                Total DB Enrollment Commitments
              </div>
            </div>
            <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 16, lineHeight: 1.5 }}>
              Push the latest cryptographic locks from the backend database into the `VoterEligibility` smart contract whitelist. 
              (In production, this represents a Merkle Root update.)
            </p>
            <button className="btn btn-secondary btn-block" onClick={handleSyncCommitments} disabled={loading}>
               {loading ? <><span className="spinner spinner-sm" style={{width: 14, height: 14, display: "inline-block", marginRight: 8}}></span> Syncing...</> : "Sync Commitments"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
