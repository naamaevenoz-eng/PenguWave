import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export default function Navbar() {
  const location = useLocation();
  const { user, isAdmin, logout } = useAuth();

  return (
    <nav className="navbar">
      <div className="navbar-brand">
        <Link to="/events" style={{ textDecoration: "none", color: "inherit" }}>
          PenguWave 🐧
        </Link>
      </div>
      <div className="navbar-links">
        <Link to="/events" className={location.pathname.startsWith("/events") ? "active" : ""}>
          Events
        </Link>
        {/* Users link is shown only to admins (route is also guarded). */}
        {isAdmin && (
          <Link to="/users" className={location.pathname === "/users" ? "active" : ""}>
            Users
          </Link>
        )}
        {user && (
          <span style={{ color: "#666", fontSize: 13 }}>
            {user.email} ({user.role})
          </span>
        )}
        <button onClick={logout} className="navbar-login-btn">
          Logout
        </button>
      </div>
    </nav>
  );
}
