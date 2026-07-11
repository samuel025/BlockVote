import { useState, useEffect } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import { ToastProvider } from "./components/Toast";
import { api } from "./services/api";
import DashboardPage from "./pages/DashboardPage";
import EnrollPage from "./pages/EnrollPage";
import VotePage from "./pages/VotePage";
import ResultsPage from "./pages/ResultsPage";
import StudentsPage from "./pages/StudentsPage";
import AdminPage from "./pages/AdminPage";
import AdminAuth from "./components/AdminAuth";

const PAGE_TITLES = {
  "/": { title: "Dashboard", subtitle: "Election overview and system status" },
  "/enroll": { title: "Student Enrollment", subtitle: "Register your DID for voting eligibility" },
  "/vote": { title: "Cast Your Vote", subtitle: "Verify identity and submit your ballot" },
  "/results": { title: "Live Results", subtitle: "Real-time on-chain election results" },
  "/students": { title: "Student Registry", subtitle: "View all registered students" },
  "/admin": { title: "Admin Dashboard", subtitle: "Manage elections and blockchain sync" },
};

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [backendOnline, setBackendOnline] = useState(false);
  const location = useLocation();

  const page = PAGE_TITLES[location.pathname] || PAGE_TITLES["/"];

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 15000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  async function checkHealth() {
    try {
      await api.health();
      setBackendOnline(true);
    } catch {
      setBackendOnline(false);
    }
  }

  return (
    <ToastProvider>
      <div className="app-layout">
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} backendOnline={backendOnline} />

        <main className="main-content">
          <header className="page-header">
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <button className="mobile-menu-btn" onClick={() => setSidebarOpen(true)} aria-label="Open menu">☰</button>
              <div>
                <h1 className="page-title">{page.title}</h1>
                <p className="page-subtitle">{page.subtitle}</p>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {!backendOnline && (
                <span className="badge badge-danger" style={{ fontSize: 11 }}>⚠ Backend Offline</span>
              )}
            </div>
          </header>

          <div className="page-body">
            <Routes>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/enroll" element={<EnrollPage />} />
              <Route path="/vote" element={<VotePage />} />
              <Route path="/results" element={<ResultsPage />} />
              <Route path="/students" element={<AdminAuth><StudentsPage /></AdminAuth>} />
              <Route path="/admin" element={<AdminAuth><AdminPage /></AdminAuth>} />
              <Route path="*" element={
                <div className="empty-state">
                  <div className="empty-state-icon">404</div>
                  <div className="empty-state-title">Page Not Found</div>
                  <div style={{ fontSize: 13 }}>The page you're looking for doesn't exist.</div>
                </div>
              } />
            </Routes>
          </div>
        </main>
      </div>
    </ToastProvider>
  );
}
