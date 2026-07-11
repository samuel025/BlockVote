import { useState, useEffect } from "react";
import { api } from "../services/api";
import { useToast } from "../components/Toast";
import { scanFingerprint, getPoseidon, matricToFieldElement } from "../services/biometric";

const MATRIC_PATTERN = /^\d{4}\/\d\/\d{5}[A-Z]{2}$/i;

export default function EnrollPage() {
  const [matricNumber, setMatricNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [fieldError, setFieldError] = useState("");
  const toast = useToast();

  function validate(value) {
    if (!value.trim()) return "Matriculation number is required.";
    if (!MATRIC_PATTERN.test(value.trim())) return "Format must be YYYY/X/NNNNNDD (e.g. 2021/1/81878CT)";
    return "";
  }

  async function handleEnroll(e) {
    e.preventDefault();
    const cleanMatric = matricNumber.trim();
    const err = validate(cleanMatric);
    if (err) { setFieldError(err); return; }
    setFieldError("");
    setLoading(true);
    setResult(null);

    try {
      // 1. Fetch students to get department_id
      const { students } = await api.getStudents();
      const student = students.find(s => s.matric_number === cleanMatric);
      
      if (!student || student.enrollment_status !== "ACTIVE") {
        throw new Error("Student not found or not actively enrolled.");
      }

      toast.info("Scanning fingerprint...");
      
      // 2. Scan fingerprint locally (mocked)
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
      toast.success(data.message || "Enrollment successful");
    } catch (err) {
      toast.error(err.message || "Enrollment failed");
    } finally {
      setLoading(false);
    }
  }

  function handleReset() {
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
            The system will generate your Decentralized Identifier (DID) and enrollment commitment locally. 
            Your biometric data never leaves this device.
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Student Enrollment</span>
          {result && <button className="btn btn-ghost btn-sm" onClick={handleReset}>Enroll Another</button>}
        </div>
        <div className="card-body">
          {!result ? (
            <form onSubmit={handleEnroll}>
              <div className="form-group">
                <label className="form-label" htmlFor="matric-input">Matriculation Number</label>
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
                {loading ? <><span className="spinner" style={{ borderTopColor: "#fff" }} /> Enrolling…</> : "Enroll Student"}
              </button>
            </form>
          ) : (
            <div className="fade-in">
              <div className="alert alert-success" style={{ marginBottom: 20 }}>
                <span className="alert-icon">✓</span>
                <strong>{result.message}</strong>
              </div>

              {result.student && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>{result.student.name}</div>
                  <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                    {result.student.department} • Level {result.student.level}
                  </div>
                </div>
              )}

              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                <div className="form-group">
                  <label className="form-label">DID Hash</label>
                  <input className="form-input" readOnly value={result.didHash} style={{ fontFamily: "monospace", fontSize: 11 }} />
                </div>
                <div className="form-group">
                  <label className="form-label">Enrollment Commitment</label>
                  <input className="form-input" readOnly value={result.enrollmentCommitment} style={{ fontFamily: "monospace", fontSize: 11 }} />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
