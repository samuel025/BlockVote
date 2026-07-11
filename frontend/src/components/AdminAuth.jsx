import { useState } from "react";

export default function AdminAuth({ children }) {
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return localStorage.getItem("admin_pin") !== null;
  });
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    if (pin.trim().length >= 4) {
      localStorage.setItem("admin_pin", pin);
      setIsAuthenticated(true);
      setError("");
    } else {
      setError("PIN must be at least 4 characters.");
      setPin("");
    }
  };

  if (isAuthenticated) {
    return children;
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', minHeight: '400px' }}>
      <div className="card" style={{ maxWidth: 400, width: '100%', padding: '32px' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
          <h2 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Admin Authentication</h2>
          <p style={{ color: 'var(--text-secondary)', marginTop: 8, fontSize: 14 }}>
            Please enter the administrator PIN to access this area.
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          {error && (
            <div className="alert alert-danger" style={{ marginBottom: 16, fontSize: 13, padding: '8px 12px' }}>
              {error}
            </div>
          )}
          
          <div className="form-group">
            <input
              type="password"
              className="input-field"
              placeholder="Enter PIN (e.g. 1234)"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              autoFocus
              style={{ textAlign: 'center', fontSize: 24, letterSpacing: 8 }}
            />
          </div>
          
          <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: 8 }}>
            Authenticate
          </button>
        </form>
      </div>
    </div>
  );
}
