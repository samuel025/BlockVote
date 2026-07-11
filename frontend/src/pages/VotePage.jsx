import { useState } from "react";
import { api } from "../services/api";
import { castVoteOnChain, isElectionActive, getCurrentElectionId, fetchOnChainResults } from "../services/blockchain";
import { DEPLOYMENT } from "../config/deployment";
import { useToast } from "../components/Toast";
import { QRCodeSVG } from "qrcode.react";
import * as snarkjs from "snarkjs";
import { scanFingerprint, matricToFieldElement } from "../services/biometric";

const MATRIC_PATTERN = /^\d{4}\/\d\/\d{5}[A-Z]{2}$/i;
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
  const [selectedCandidates, setSelectedCandidates] = useState({}); // { post: candidateId }
  const [voteLoading, setVoteLoading] = useState(false);
  const [voteSuccess, setVoteSuccess] = useState(false);
  const [txHash, setTxHash] = useState("");
  const toast = useToast();

  async function handleVerify(e) {
    e.preventDefault();
    const cleanMatric = matricNumber.trim();
    if (!cleanMatric) { setFieldError("Matriculation number is required."); return; }
    if (!MATRIC_PATTERN.test(cleanMatric)) { setFieldError("Format must be YYYY/X/NNNNNDD (e.g. 2021/1/81878CT)"); return; }
    setFieldError("");
    
    // Simulate Hardware Biometric Scan (Fingerprint)
    setIsScanning(true);
    const fingerprintHash = await scanFingerprint(cleanMatric);
    setIsScanning(false);

    setVerifyLoading(true);

    try {
      const eId = await getCurrentElectionId().catch(() => null);
      const active = await isElectionActive().catch(() => false);
      if (!active || !eId) { toast.error("The election is not currently active."); setVerifyLoading(false); return; }

      const data = await api.verifyStudent(cleanMatric, eId);
      if (!data.eligible) { setFieldError("You are not eligible to vote in this election."); setVerifyLoading(false); return; }
      
      // Local ZKP Generation on the Pi
      toast.info("Generating Zero-Knowledge Proof locally...");
      
      // Generate Ephemeral DID for absolute privacy (Secret Ballot)
      // 31 bytes ensures the value is strictly less than the BN128 scalar field prime
      const ephemeralDidHex = "0x" + Array.from(crypto.getRandomValues(new Uint8Array(31))).map(b => b.toString(16).padStart(2, '0')).join('');
      const ephemeralDidField = BigInt(ephemeralDidHex).toString();

      const circuitInput = {
        matricNumber: matricToFieldElement(cleanMatric).toString(),
        departmentId: data.student.departmentId.toString(),
        enrollmentSecret: fingerprintHash.toString(),
        enrollmentCommitment: data.enrollmentCommitment,
        nullifierHash: data.nullifierHash,
        electionId: eId.toString(),
        ephemeralDid: ephemeralDidField
      };

      const { proof, publicSignals } = await snarkjs.groth16.fullProve(
        circuitInput,
        "/zkp/eligibility.wasm",
        "/zkp/eligibility_final.zkey"
      );

      const calldata = await snarkjs.groth16.exportSolidityCallData(proof, publicSignals);

      const liveCandidates = await fetchOnChainResults(eId).catch(() => []);
      
      setActiveElectionId(eId);
      setCandidates(liveCandidates);
      setVerifyResult({ ...data, calldata, ephemeralDid: ephemeralDidHex });
      setStep(1);
      toast.success(`Identity verified — Welcome, ${data.student?.name || "Student"}`);
    } catch (err) {
      if (err.status === 403) setFieldError("Student not found or not actively enrolled.");
      else if (err.status === 400) setFieldError(err.message);
      else toast.error(err.message || "Failed to generate proof. Ensure you are enrolled.");
    } finally {
      setVerifyLoading(false);
    }
  }

  function handleSelectCandidate(post, candidateId) {
    setSelectedCandidates(prev => ({ ...prev, [post]: candidateId }));
  }

  function handleProceedToConfirm() {
    const uniquePosts = [...new Set(candidates.map(c => c.post || "President"))];
    if (Object.keys(selectedCandidates).length < uniquePosts.length) {
      toast.error("Please select a candidate for each post before proceeding.");
      return;
    }
    setStep(2);
  }

  async function handleCastVote() {
    if (Object.keys(selectedCandidates).length === 0 || !verifyResult) return;
    setVoteLoading(true);

    try {
      const candidateIds = Object.values(selectedCandidates);
      const { tx } = await castVoteOnChain(verifyResult.ephemeralDid, candidateIds, verifyResult.calldata);
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
    setSelectedCandidates({}); setVoteSuccess(false); setTxHash("");
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
              {(() => {
                const uniquePosts = [...new Set(candidates.map(c => c.post || "President"))];
                return uniquePosts.map(post => (
                  <div key={post} style={{ marginBottom: 24 }}>
                    <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, borderBottom: "1px solid var(--border)", paddingBottom: 8 }}>{post}</h3>
                    <div className="candidate-grid">
                      {candidates.filter(c => (c.post || "President") === post).map((c) => (
                        <div key={c.id} className={`candidate-card ${selectedCandidates[post] === c.id ? "selected" : ""}`}
                          onClick={() => handleSelectCandidate(post, c.id)} role="button" tabIndex={0}
                          onKeyDown={(e) => e.key === "Enter" && handleSelectCandidate(post, c.id)}>
                          <div className="candidate-avatar">{c.name.split(" ").map(w => w[0]).join("")}</div>
                          <div className="candidate-name">{c.name}</div>
                          <div className="candidate-party">{c.party}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ));
              })()}
              <div style={{ marginTop: 20, display: "flex", gap: 10 }}>
                <button className="btn btn-secondary" onClick={() => { setStep(0); setVerifyResult(null); setSelectedCandidates({}); }}>← Back</button>
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleProceedToConfirm} disabled={Object.keys(selectedCandidates).length < [...new Set(candidates.map(c => c.post || "President"))].length}>
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

            <div style={{ padding: "16px 0 24px" }}>
              <div className="confirm-icon" style={{ textAlign: "center" }}>🗳️</div>
              <div className="confirm-text" style={{ textAlign: "center", marginBottom: 16 }}>
                You are about to cast your vote for the following:
              </div>
              <div style={{ background: "var(--bg-secondary)", padding: 16, borderRadius: 8 }}>
                {Object.entries(selectedCandidates).map(([post, cId]) => {
                  const c = candidates.find(cand => cand.id === cId);
                  return (
                    <div key={post} style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, paddingBottom: 8, borderBottom: "1px solid var(--border)" }}>
                      <strong style={{ fontSize: 14 }}>{post}</strong>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontWeight: 600 }}>{c?.name}</div>
                        <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{c?.party}</div>
                      </div>
                    </div>
                  );
                })}
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
                <div style={{ marginBottom: 12, fontWeight: 600, borderBottom: "1px solid var(--border)", paddingBottom: 8 }}>Your Selections:</div>
                {Object.entries(selectedCandidates).map(([post, cId]) => {
                  const c = candidates.find(cand => cand.id === cId);
                  return (
                    <div key={post} style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                      <span style={{ color: "var(--text-secondary)" }}>{post}</span>
                      <strong style={{ textAlign: "right" }}>{c?.name} <span style={{ fontSize: 11, color: "var(--text-tertiary)", fontWeight: "normal" }}>({c?.party})</span></strong>
                    </div>
                  );
                })}
                {txHash && (
                  <div style={{ marginTop: 16, textAlign: "center", borderTop: "1px solid var(--border)", paddingTop: 16 }}>
                    <div style={{ color: "var(--text-secondary)", fontSize: 12, marginBottom: 12, fontWeight: 600 }}>Verify on Blockchain</div>
                    <div style={{ display: "inline-block", padding: 12, background: "white", borderRadius: 8, border: "1px solid var(--border)" }}>
                      <QRCodeSVG 
                        value={`https://sepolia.arbiscan.io/tx/${txHash}`} 
                        size={150}
                        bgColor={"#ffffff"}
                        fgColor={"#000000"}
                        level={"Q"}
                      />
                    </div>
                    <div style={{ marginTop: 12 }}>
                      <a href={`https://sepolia.arbiscan.io/tx/${txHash}`} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)", fontSize: 13, textDecoration: "none", fontWeight: 600 }}>
                        View on Arbiscan ↗
                      </a>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <button className="btn btn-secondary" onClick={handleReset}>Finish & Next Voter</button>
          </div>
        </div>
      )}
    </div>
  );
}
