import { useState } from "react";
import { api } from "../services/api";
import { useToast } from "../components/Toast";
import { scanFingerprint, getPoseidon, matricToFieldElement } from "../services/biometric";

const MATRIC_PATTERN = /^\d{4}\/\d\/\d{5}[A-Z]{2}$/i;

export default function EnrollPage() {
  const [step, setStep] = useState(1);
  const [matricNumber, setMatricNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [result, setResult] = useState(null);
  const [fieldError, setFieldError] = useState("");
  const toast = useToast();

  function validate(value) {
    if (!value.trim()) return "Matriculation number is required.";
    if (!MATRIC_PATTERN.test(value.trim())) return "Format must be YYYY/X/NNNNNDD (e.g. 2021/1/81878CT)";
    return "";
  }

  async function handleVerifyStudent(e) {
    e.preventDefault();
    const cleanMatric = matricNumber.trim();
    const err = validate(cleanMatric);
    if (err) { setFieldError(err); return; }
    
    setFieldError("");
    setLoading(true);

    try {
      // Fetch students to ensure they exist and are active
      const { students } = await api.getStudents();
      const student = students.find(s => s.matric_number === cleanMatric);
      
      if (!student || student.enrollment_status !== "ACTIVE") {
        throw new Error("Student not found or not actively enrolled.");
      }
      
      // Move to Step 2
      setStep(2);
    } catch (err) {
      setFieldError(err.message || "Enrollment failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleScanAndEnroll() {
    setIsScanning(true);
    const cleanMatric = matricNumber.trim();

    try {
      const { students } = await api.getStudents();
      const student = students.find(s => s.matric_number === cleanMatric);

      // 2. Scan fingerprint locally via hardware bridge
      const fingerprintHash = await scanFingerprint(cleanMatric);
      
      // 3. Compute Poseidon hash locally
      const p = await getPoseidon();
      const matricField = matricToFieldElement(cleanMatric);
      const deptId = BigInt(student.department_id);
      
      const commitmentRaw = p([matricField, deptId, BigInt(fingerprintHash)]);
      const enrollmentCommitment = p.F.toString(commitmentRaw);

      // 4. Send only commitment to backend
      const data = await api.enrollStudent(cleanMatric, enrollmentCommitment);
      setResult(data);
      setStep(3); // Move to Success
      toast.success(data.message || "Enrollment successful");
    } catch (err) {
      toast.error(err.message || "Hardware scan failed");
    } finally {
      setIsScanning(false);
    }
  }

  function handleReset() {
    setStep(1);
    setMatricNumber("");
    setResult(null);
    setFieldError("");
  }

  return (
    <div className="fade-in" style={{ maxWidth: 600 }}>
      <div className="alert alert-info">
        <span className="alert-icon">ℹ</span>
        <div>
          <strong>Enrollment Process (Kiosk Mode)</strong>
          <div style={{ marginTop: 4, fontSize: 12, lineHeight: 1.5 }}>
            Enter your matriculation number and scan your biometric. 
            The system will generate your secure Enrollment Commitment locally.
            Your biometric data never leaves this device.
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Student Enrollment</span>
          {step === 3 && <button className="btn btn-ghost btn-sm" onClick={handleReset}>Enroll Another</button>}
        </div>
        <div className="card-body">
          
          {/* Step 1: Matriculation */}
          {step === 1 && (
            <form onSubmit={handleVerifyStudent} className="fade-in">
              <div className="form-group">
                <label className="form-label" htmlFor="matric-input">Verify Matriculation Number</label>
                <input
                  id="matric-input"
                  type="text"
                  className={`form-input ${fieldError ? "error" : ""}`}
                  placeholder="FUO/21/CSC/001"
                  value={matricNumber}
                  onChange={(e) => { setMatricNumber(e.target.value.toUpperCase()); setFieldError(""); }}
                  disabled={loading}
                  autoComplete="off"
                  autoFocus
                />
                {fieldError && <div className="form-hint" style={{ color: "var(--danger)" }}>{fieldError}</div>}
                <div className="form-hint">Format: FUO/YY/DEPT/NNN</div>
              </div>
              <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={loading || !matricNumber.trim()}>
                {loading ? <><span className="spinner" style={{ borderTopColor: "#fff" }} /> Checking Eligibility…</> : "Proceed to Biometrics"}
              </button>
            </form>
          )}

          {/* Step 2: Fingerprint Scan */}
          {step === 2 && (
            <div className="fade-in" style={{ textAlign: "center", padding: "20px 0" }}>
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>{matricNumber} Verified</div>
              <div style={{ color: "var(--text-secondary)", fontSize: 13, marginBottom: 30 }}>Please place your finger firmly on the scanner to generate your cryptographic identity.</div>
              
              <div style={{ 
                position: "relative", width: 120, height: 120, margin: "0 auto 30px auto", 
                color: isScanning ? "var(--accent)" : "var(--border)", 
                transition: "all 0.4s ease",
                filter: isScanning ? "drop-shadow(0 0 15px rgba(37, 99, 235, 0.5))" : "none"
              }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ width: "100%", height: "100%" }}>
                  <path d="M2 12C2 12 5 5 12 5c7 0 10 7 10 7"/>
                  <path d="M5 15C5 15 7.5 9 12 9c4.5 0 7 6 7 6"/>
                  <path d="M8 18C8 18 9.5 13 12 13c2.5 0 4 5 4 5"/>
                  <path d="M12 21v-4"/>
                </svg>
                
                {isScanning && (
                  <div style={{
                    position: "absolute", top: 0, left: 0, width: "100%", height: "4px",
                    background: "var(--accent)", boxShadow: "0 0 12px var(--accent)", borderRadius: "4px",
                    animation: "scanLine 1.5s cubic-bezier(0.4, 0, 0.2, 1) infinite"
                  }} />
                )}
                <style>{`
                  @keyframes scanLine {
                    0% { top: -10%; opacity: 0; }
                    10% { opacity: 1; }
                    90% { opacity: 1; }
                    100% { top: 110%; opacity: 0; }
                  }
                `}</style>
              </div>

              <button onClick={handleScanAndEnroll} className="btn btn-primary btn-block btn-lg" disabled={isScanning}>
                {isScanning ? <><span className="spinner" style={{ borderTopColor: "#fff" }} /> Scanning & Generating ZK Identity…</> : "Initialize Hardware Scan"}
              </button>
            </div>
          )}

          {/* Step 3: Success */}
          {step === 3 && result && (
            <div className="fade-in">
              <div className="alert alert-success" style={{ marginBottom: 20 }}>
                <span className="alert-icon">✓</span>
                <strong>{result.message}</strong>
              </div>

              {result.student && (
                <div style={{ marginBottom: 20, padding: 16, background: "var(--bg-secondary)", borderRadius: 8 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{result.student.name}</div>
                  <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                    {result.student.department} • Level {result.student.level}
                  </div>
                </div>
              )}

              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                <div className="form-group">
                  <label className="form-label">Mathematical Commitment (Sent to Blockchain)</label>
                  <input className="form-input" readOnly value={result.enrollmentCommitment} style={{ fontFamily: "monospace", fontSize: 11, background: "var(--bg-secondary)" }} />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
