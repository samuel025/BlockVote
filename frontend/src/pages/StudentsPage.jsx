import { useState, useEffect, useMemo } from "react";
import { api } from "../services/api";
import { useToast } from "../components/Toast";

export default function StudentsPage() {
  const [students, setStudents] = useState([]);
  const [enrolledMatrics, setEnrolledMatrics] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const toast = useToast();
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [currentPage, setCurrentPage] = useState(1);
  
  const ITEMS_PER_PAGE = 10;

  useEffect(() => { loadData(); }, []);

  // Reset page when filters change
  useEffect(() => { setCurrentPage(1); }, [search, filterStatus]);

  async function loadData() {
    setLoading(true);
    try {
      const [studentsData, commitmentsData] = await Promise.all([
        api.getStudents(),
        api.getEnrollmentCommitments()
      ]);
      
      setStudents(studentsData.students || []);
      
      const enrolledSet = new Set(
        (commitmentsData.commitments || []).map(c => c.matric_number)
      );
      setEnrolledMatrics(enrolledSet);
      
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }
  
  const handleRevoke = async (matricNumber) => {
    const secret = prompt(`WARNING: You are about to permanently revoke voting access for ${matricNumber}.\n\nEnter Admin Secret Key to confirm:`);
    if (!secret) return;
    
    try {
      await api.revokeCommitment(matricNumber, secret);
      toast.success("Enrollment Revoked", `Successfully suspended ${matricNumber}`);
      loadData(); // Refresh list
    } catch (err) {
      toast.error("Revocation Failed", err.message);
    }
  };

  const filtered = students.filter((s) => {
    const matchSearch = !search || s.full_name.toLowerCase().includes(search.toLowerCase()) ||
      s.matric_number.toLowerCase().includes(search.toLowerCase()) ||
      s.department_name.toLowerCase().includes(search.toLowerCase());
      
    let matchStatus = true;
    if (filterStatus === "ENROLLED") {
      matchStatus = enrolledMatrics.has(s.matric_number);
    } else if (filterStatus === "UNENROLLED") {
      matchStatus = !enrolledMatrics.has(s.matric_number) && s.enrollment_status === "ACTIVE";
    } else if (filterStatus !== "ALL") {
      matchStatus = s.enrollment_status === filterStatus;
    }
    
    return matchSearch && matchStatus;
  });

  // Pagination logic
  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE) || 1;
  const paginatedStudents = filtered.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const statusCounts = { 
    ALL: students.length, 
    ENROLLED: enrolledMatrics.size,
    UNENROLLED: students.filter(s => !enrolledMatrics.has(s.matric_number) && s.enrollment_status === "ACTIVE").length,
    ACTIVE: 0, 
    GRADUATED: 0, 
    SUSPENDED: 0 
  };
  
  students.forEach((s) => { 
    if (statusCounts[s.enrollment_status] !== undefined) statusCounts[s.enrollment_status]++; 
  });

  if (loading) {
    return <div className="loading-state"><div className="spinner spinner-lg" /><span>Loading student registry…</span></div>;
  }

  return (
    <div className="fade-in">
      {error && <div className="alert alert-error"><span className="alert-icon">✕</span><span>{error}</span></div>}

      <div className="stats-grid" style={{ gridTemplateColumns: "repeat(5, 1fr)", marginBottom: 20 }}>
        {[
          ["ALL", "Total", "blue", "👥"], 
          ["ENROLLED", "Enrolled", "purple", "🔐"],
          ["UNENROLLED", "Pending", "amber", "⏳"],
          ["ACTIVE", "Active", "green", "✓"], 
          ["SUSPENDED", "Suspended", "red", "⚠"]
        ].map(([key, label, color, icon]) => (
          <div key={key} className="stat-card" style={{ cursor: "pointer", border: filterStatus === key ? "2px solid var(--accent)" : undefined }}
            onClick={() => setFilterStatus(key)}>
            <div className={`stat-icon ${color}`}>{icon}</div>
            <div><div className="stat-label">{label}</div><div className="stat-value">{statusCounts[key] || 0}</div></div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Student Registry ({filtered.length})</span>
          <input type="text" className="form-input" placeholder="Search by name, matric, or department…"
            value={search} onChange={(e) => setSearch(e.target.value)}
            style={{ maxWidth: 280, padding: "7px 12px", fontSize: 13 }} />
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          {paginatedStudents.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">🔍</div>
              <div className="empty-state-title">No students found</div>
              <div style={{ fontSize: 13 }}>Try adjusting your search or filter criteria.</div>
            </div>
          ) : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Matric Number</th><th>Full Name</th><th>Department</th><th>Status</th><th>Voting Enrollment</th><th style={{textAlign: "right"}}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedStudents.map((s) => {
                    const isEnrolled = enrolledMatrics.has(s.matric_number);
                    return (
                      <tr key={s.matric_number}>
                        <td style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 600 }}>{s.matric_number}</td>
                        <td style={{ fontWeight: 500 }}>{s.full_name}</td>
                        <td>{s.department_name} <span style={{color: "var(--text-tertiary)", fontSize: 11}}>({s.level}L)</span></td>
                        <td>
                          <span className={`badge ${s.enrollment_status === "ACTIVE" ? "badge-active" : s.enrollment_status === "GRADUATED" ? "badge-warning" : "badge-danger"}`}>
                            {s.enrollment_status}
                          </span>
                        </td>
                        <td>
                          {isEnrolled ? (
                            <span className="badge badge-inactive" style={{ background: "var(--success-light)", color: "var(--success)" }}>✓ Enrolled</span>
                          ) : (
                            <span className="badge badge-inactive">Pending</span>
                          )}
                        </td>
                        <td style={{textAlign: "right"}}>
                          {isEnrolled && (
                            <button 
                              className="btn btn-secondary" 
                              style={{ padding: "4px 8px", fontSize: 11, color: "var(--danger)", border: "1px solid var(--danger)", background: "transparent" }}
                              onClick={() => handleRevoke(s.matric_number)}
                            >
                              Revoke
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          
          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div style={{ padding: "16px 20px", borderTop: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--bg-primary)" }}>
              <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1} to {Math.min(currentPage * ITEMS_PER_PAGE, filtered.length)} of {filtered.length} entries
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button 
                  className="btn btn-secondary btn-sm" 
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(p => p - 1)}
                >
                  Previous
                </button>
                <div style={{ display: "flex", alignItems: "center", padding: "0 12px", fontSize: 13, fontWeight: 600 }}>
                  Page {currentPage} of {totalPages}
                </div>
                <button 
                  className="btn btn-secondary btn-sm" 
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(p => p + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
