import { NavLink, useLocation } from "react-router-dom";

const NAV_ITEMS = [
  { to: "/", icon: "🏠", label: "Dashboard" },
  { to: "/enroll", icon: "🪪", label: "Student Enrollment" },
  { to: "/vote", icon: "🗳️", label: "Cast Vote" },
  { to: "/results", icon: "📊", label: "Live Results" },
];

const ADMIN_ITEMS = [
  { to: "/students", icon: "👥", label: "Student Registry" },
  { to: "/admin", icon: "⚙️", label: "Admin Panel" },
];

export default function Sidebar({ isOpen, onClose, backendOnline }) {
  const location = useLocation();

  return (
    <>
      {isOpen && <div className="sidebar-overlay" onClick={onClose} />}
      <aside className={`sidebar ${isOpen ? "open" : ""}`}>
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <div className="sidebar-logo-icon">🗳</div>
            <div>
              <div className="sidebar-logo-text">UniVote</div>
              <div className="sidebar-subtitle">DID-Based Voting</div>
            </div>
          </div>
        </div>

        <nav className="sidebar-nav">
          <div className="sidebar-section-label">Navigation</div>
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}
              onClick={onClose}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}

          <div className="sidebar-section-label">Administration</div>
          {ADMIN_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}
              onClick={onClose}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-status">
            <span className={`status-dot ${backendOnline ? "online" : "offline"}`} />
            <span>Backend {backendOnline ? "Connected" : "Offline"}</span>
          </div>
          <div className="sidebar-status" style={{ marginTop: 6 }}>
            <span className={`status-dot ${backendOnline ? "online" : "offline"}`} />
            <span>Blockchain Node</span>
          </div>
        </div>
      </aside>
    </>
  );
}
