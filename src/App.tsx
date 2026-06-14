import { Routes, Route, Navigate } from "react-router-dom";
import Navbar from "./components/Navbar";
import LoginModal from "./components/LoginModal";
import EventsPage from "./pages/EventsPage";
import UsersPage from "./pages/UsersPage";
import NotFound from "./pages/NotFound";
import { useAuth } from "./auth/AuthContext";

function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="container">
        <p style={{ color: "#999", padding: 40 }}>Loading…</p>
      </div>
    );
  }

  // Authentication is required — no bypass flags, no dismissible modal.
  if (!user) {
    return <LoginModal />;
  }

  return (
    <>
      <Navbar />
      <div className="container">
        <Routes>
          <Route path="/" element={<Navigate to="/events" replace />} />
          <Route path="/events" element={<EventsPage />} />
          {/* Users is admin-only; non-admins are redirected away. */}
          <Route
            path="/users"
            element={user.role === "admin" ? <UsersPage /> : <Navigate to="/events" replace />}
          />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </div>
    </>
  );
}

export default App;
