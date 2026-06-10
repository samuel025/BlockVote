import { useState } from "react";
import { api } from "../services/api";
import { castVoteOnChain, isElectionActive, getCurrentElectionId, fetchOnChainResults } from "../services/blockchain";
import { DEPLOYMENT } from "../config/deployment";
import { useToast } from "../components/Toast";

const MATRIC_PATTERN = /^FUO\/\d{2}\/[A-Z]{2,4}\/\d{3}$/;
const STEPS = ["Verify Identity", "Select Candidate", "Confirm & Submit"];

export default function VotePage() {
  const [step, setStep] = useState(0);
  const [matricNumber, setMatricNumber] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [verifyResult, setVerifyResult] = useState(null);
  const [activeElectionId, setActiveElectionId] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [voteLoading, setVoteLoading] = useState(false);
  const [voteSuccess, setVoteSuccess] = useState(false);
  const [txHash, setTxHash] = useState("");
  const toast = useToast();

  async function handleVerify(e) {
    e.preventDefault();
    if (!matricNumber.trim()) { setFieldError("Matriculation number is required."); return; }
    if (!MATRIC_PATTERN.test(matricNumber.trim())) { setFieldError("Format must be FUO/YY/DEPT/NNN"); return; }
    setFieldError("");
    
    // Simulate Hardware Biometric Scan (Fingerprint)
    setIsScanning(true);
    await new Promise(r => setTimeout(r, 2000));
    setIsScanning(false);

    setVerifyLoading(true);

    try {
      const eId = await getCurrentElectionId().catch(() => null);
      const active = await isElectionActive().catch(() => false);
      if (!active || !eId) { toast.error("The election is not currently active."); setVerifyLoading(false); return; }

      const data = await api.verifyStudent(matricNumber.trim(), eId);
      if (!data.eligible) { setFieldError("You are not eligible to vote in this election."); setVerifyLoading(false); return; }
      
      const liveCandidates = await fetchOnChainResults(eId).catch(() => []);
      
      setActiveElectionId(eId);
      setCandidates(liveCandidates);
      setVerifyResult(data);
      setStep(1);
      toast.success(`Identity verified — Welcome, ${data.student?.name || "Student"}`);
    } catch (err) {
      if (err.status === 403) setFieldError("Student not found or not actively enrolled.");
      else if (err.status === 400) setFieldError(err.message);
      else toast.error(err.message);
    } finally {
      setVerifyLoading(false);
    }
  }

  function handleSelectCandidate(candidate) {
    setSelectedCandidate(candidate);
  }

  function handleProceedToConfirm() {
    if (!selectedCandidate) { toast.error("Please select a candidate before proceeding."); return; }
    setStep(2);
  }

  async function handleCastVote() {
    if (!selectedCandidate || !verifyResult) return;
    setVoteLoading(true);

    try {
      const { tx } = await castVoteOnChain(verifyResult.didHash, selectedCandidate.id, verifyResult.calldata);
      setTxHash(tx.hash);
      setVoteSuccess(true);
      setStep(3);
      toast.success("Your vote has been recorded on-chain successfully!");
    } catch (err) {
      const msg = err.message || "";
      if (msg.includes("already voted")) toast.error("You have already voted in this election.");
      else if (msg.includes("not eligible")) toast.error("Your DID is not registered as eligible. Please complete enrollment first.");
      else if (msg.includes("election")) toast.error("The election is not currently active.");
      else toast.error("Transaction failed: " + (msg.length > 120 ? msg.slice(0, 120) + "…" : msg));
    } finally {
      setVoteLoading(false);
    }
  }

  function handleReset() {
    setStep(0); setMatricNumber(""); setFieldError(""); setVerifyResult(null);
    setSelectedCandidate(null); setVoteSuccess(false); setTxHash("");
  }

  return (
    <div className="fade-in" style={{ maxWidth: 720 }}>
      {/* Progress Steps */}
      <div className="steps">
        {STEPS.map((label, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center" }}>
            {i > 0 && <div className={`step-divider ${i <= step ? "completed" : ""}`} />}
            <div className={`step ${i === step ? "active" : i < step ? "completed" : ""}`}>
              <div className="step-number">{i < step ? "✓" : i + 1}</div>
              <span>{label}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Step 0: Verify Identity */}
      {step === 0 && (
        <div className="card fade-in">
          <div className="card-header"><span className="card-title">Verify Your Identity</span></div>
          <div className="card-body">
            <div className="alert alert-info" style={{ marginBottom: 18 }}>
              <span className="alert-icon">🔐</span>
              <div style={{ fontSize: 12 }}>Your identity will be verified using zero-knowledge proofs. Your personal details will <strong>not</strong> be linked to your vote.</div>
            </div>
            <div style={{ textAlign: "center", marginBottom: 24 }}>
              <div style={{ position: "relative", width: 64, height: 64, margin: "0 auto 16px auto", color: isScanning ? "var(--accent)" : "var(--text-tertiary)", transition: "color 0.3s" }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: "100%", height: "100%" }}>
                  <path d="M2 12C2 12 5 5 12 5C19 5 22 12 22 12" />
                  <path d="M5 15C5 15 7.5 9 12 9C16.5 9 19 15 19 15" />
                  <path d="M8 18C8 18 9.5 13 12 13C14.5 13 16 18 16 18" />
                  <path d="M12 21V17" />
                </svg>
                {isScanning && (
                  <div style={{
                    position: "absolute", top: 0, left: 0, width: "100%", height: "3px",
                    background: "var(--accent)", boxShadow: "0 0 10px var(--accent)", borderRadius: "4px",
                    animation: "scanLine 1.5s linear infinite"
                  }} />
                )}
                <style>{`
                  @keyframes scanLine {
                    0% { top: 0%; opacity: 0; }
                    10% { opacity: 1; }
                    90% { opacity: 1; }
                    100% { top: 100%; opacity: 0; }
                  }
                `}</style>
              </div>
              <div style={{ fontSize: 13, color: isScanning ? "var(--accent)" : "var(--text-secondary)", fontWeight: isScanning ? 600 : 400 }}>
                {isScanning ? "Scanning Biometrics..." : "Awaiting Hardware Authentication"}
              </div>
            </div>

            <form onSubmit={handleVerify}>
              <div className="form-group">
                <label className="form-label" htmlFor="vote-matric">Link Matriculation Number</label>
                <input id="vote-matric" type="text" className={`form-input ${fieldError ? "error" : ""}`}
                  placeholder="FUO/21/CSC/001" value={matricNumber}
                  onChange={(e) => { setMatricNumber(e.target.value.toUpperCase()); setFieldError(""); }}
                  disabled={verifyLoading || isScanning} autoComplete="off" autoFocus />
                {fieldError && <div className="form-hint" style={{ color: "var(--danger)" }}>{fieldError}</div>}
              </div>
              <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={verifyLoading || isScanning || !matricNumber.trim()}>
                {verifyLoading ? <><span className="spinner" style={{ borderTopColor: "#fff" }} /> Verifying Proof…</> : isScanning ? "Scanning..." : "Initialize Hardware Scan"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Step 1: Select Candidate */}
      {step === 1 && (
        <div className="fade-in">
          <div className="alert alert-success" style={{ marginBottom: 18 }}>
            <span className="alert-icon">✓</span>
            <div><strong>Identity Verified</strong> — {verifyResult?.student?.name} ({verifyResult?.student?.department})</div>
          </div>
          <div className="card">
            <div className="card-header">
              <span className="card-title">Select Your Candidate</span>
              <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>Election #{activeElectionId}</span>
            </div>
            <div className="card-body">
              <div className="candidate-grid">
                {candidates.map((c) => (
                  <div key={c.id} className={`candidate-card ${selectedCandidate?.id === c.id ? "selected" : ""}`}
                    onClick={() => handleSelectCandidate(c)} role="button" tabIndex={0}
                    onKeyDown={(e) => e.key === "Enter" && handleSelectCandidate(c)}>
                    <div className="candidate-avatar">{c.name.split(" ").map(w => w[0]).join("")}</div>
                    <div className="candidate-name">{c.name}</div>
                    <div className="candidate-party">{c.party}</div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 20, display: "flex", gap: 10 }}>
                <button className="btn btn-secondary" onClick={() => { setStep(0); setVerifyResult(null); setSelectedCandidate(null); }}>← Back</button>
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleProceedToConfirm} disabled={!selectedCandidate}>
                  Continue →
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Step 2: Confirm */}
      {step === 2 && !voteSuccess && (
        <div className="card fade-in">
          <div className="card-header"><span className="card-title">Confirm Your Vote</span></div>
          <div className="card-body">
            <div className="alert alert-warning" style={{ marginBottom: 20 }}>
              <span className="alert-icon">⚠</span>
              <div style={{ fontSize: 12 }}>This action is <strong>final and irreversible</strong>. Once submitted, your vote cannot be changed or withdrawn. Please review your selection carefully.</div>
            </div>

            <div style={{ textAlign: "center", padding: "16px 0 24px" }}>
              <div className="confirm-icon">🗳️</div>
              <div className="confirm-text">
                You are about to cast your vote for<br />
                <strong style={{ fontSize: 18 }}>{selectedCandidate?.name}</strong><br />
                <span style={{ fontSize: 12 }}>{selectedCandidate?.party}</span>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn btn-secondary" onClick={() => setStep(1)} disabled={voteLoading}>← Change Selection</button>
              <button className="btn btn-success btn-lg" style={{ flex: 1 }} onClick={handleCastVote} disabled={voteLoading}>
                {voteLoading ? <><span className="spinner" style={{ borderTopColor: "#fff" }} /> Submitting…</> : "Cast My Vote"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 3: Success */}
      {voteSuccess && (
        <div className="card fade-in">
          <div className="card-body" style={{ textAlign: "center", padding: "40px 24px" }}>
            <div style={{ fontSize: 56, marginBottom: 16 }}>✅</div>
            <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Vote Recorded Successfully</div>
            <div style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 24 }}>
              Your vote has been permanently recorded on the blockchain.
            </div>

            <div className="card" style={{ textAlign: "left", marginBottom: 24 }}>
              <div className="card-body" style={{ fontSize: 13 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <span style={{ color: "var(--text-secondary)" }}>Candidate</span>
                  <strong>{selectedCandidate?.name}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <span style={{ color: "var(--text-secondary)" }}>Party</span>
                  <span>{selectedCandidate?.party}</span>
                </div>
                {txHash && (
                  <div style={{ marginTop: 8 }}>
                    <span style={{ color: "var(--text-secondary)", fontSize: 11 }}>Transaction Hash</span>
                    <input className="form-input" readOnly value={txHash} style={{ fontFamily: "monospace", fontSize: 11, marginTop: 4 }} />
                  </div>
                )}
              </div>
            </div>

            <button className="btn btn-secondary" onClick={handleReset}>Return to Start</button>
          </div>
        </div>
      )}
    </div>
  );
}
