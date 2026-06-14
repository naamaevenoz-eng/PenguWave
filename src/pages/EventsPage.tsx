import { useEffect, useMemo, useState } from "react";
import type { SecurityEvent, Severity } from "../types";
import { getEvents, ApiError } from "../api";

const SEVERITY_COLORS: Record<Severity, string> = {
  critical: "#b00020",
  high: "red",
  medium: "orange",
  low: "green",
  info: "#666",
};

function severityColor(s: string): string {
  return SEVERITY_COLORS[s as Severity] ?? "#666";
}

function formatTimestamp(ts: string | null): string {
  if (!ts) return "—";
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

export default function EventsPage() {
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [severityFilter, setSeverityFilter] = useState("ALL");
  const [selectedEvent, setSelectedEvent] = useState<SecurityEvent | null>(null);

  useEffect(() => {
    let active = true;
    getEvents()
      .then((data) => active && setEvents(data))
      .catch((err) => {
        if (active) setError(err instanceof ApiError ? err.message : "Failed to load events");
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return events.filter((e) => {
      // Fields may be absent for viewers — guard every optional field.
      const haystack = [e.title, e.description, e.assetHostname, e.type]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const matchesSearch = haystack.includes(q);
      const matchesSeverity = severityFilter === "ALL" || e.severity === severityFilter;
      return matchesSearch && matchesSeverity;
    });
  }, [events, search, severityFilter]);

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(filtered, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "penguwave_events_export.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return <div className="page-container"><p style={{ color: "#999" }}>Loading events…</p></div>;
  if (error) return <div className="page-container"><p style={{ color: "#b00020" }}>{error}</p></div>;

  return (
    <div className="page-container">
      <h1>Security Events</h1>

      <div style={{ marginBottom: 16, display: "flex", gap: 12, alignItems: "center" }}>
        <input
          type="text"
          placeholder="Search events..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: "100%", maxWidth: 400 }}
        />
        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
          style={{ width: 140 }}
        >
          <option value="ALL">All Severities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
          <option value="info">Info</option>
        </select>
      </div>

      {/* Plain text — React escapes the value, so search input can never inject markup. */}
      {search && (
        <p>
          Showing results for: <strong>{search}</strong> ({filtered.length} events)
        </p>
      )}

      <table>
        <thead>
          <tr>
            <th>Severity</th>
            <th>Title</th>
            <th>Asset</th>
            <th>Source IP</th>
            <th>Timestamp</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((event) => (
            <tr key={event.id} onClick={() => setSelectedEvent(event)} style={{ cursor: "pointer" }}>
              <td style={{ color: severityColor(event.severity), fontWeight: 600 }}>
                {event.severity}
              </td>
              <td>{event.title ?? "—"}</td>
              <td style={{ fontFamily: "monospace", fontSize: 13 }}>{event.assetHostname ?? "—"}</td>
              <td style={{ fontFamily: "monospace", fontSize: 13 }}>{event.sourceIp ?? "—"}</td>
              <td style={{ fontSize: 13 }}>{formatTimestamp(event.timestamp)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {filtered.length === 0 && (
        <p style={{ color: "#999" }}>{events.length === 0 ? "No events." : "No events match your filters."}</p>
      )}

      <div style={{ marginTop: 12 }}>
        <button onClick={exportJson} style={{ fontSize: 13 }} disabled={filtered.length === 0}>
          Export Events (JSON)
        </button>
      </div>

      {selectedEvent && (
        <div className="event-detail">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2>{selectedEvent.title ?? "(untitled event)"}</h2>
            <button onClick={() => setSelectedEvent(null)} style={{ cursor: "pointer" }}>
              Close
            </button>
          </div>
          <p>
            <strong>Severity:</strong>{" "}
            <span style={{ color: severityColor(selectedEvent.severity) }}>
              {selectedEvent.severity}
            </span>
          </p>
          {/* Rendered as plain text — never as HTML. */}
          {selectedEvent.description !== undefined && (
            <>
              <p><strong>Description:</strong></p>
              <p style={{ whiteSpace: "pre-wrap" }}>{selectedEvent.description ?? "—"}</p>
            </>
          )}
          {selectedEvent.assetHostname !== undefined && (
            <p>
              <strong>Asset:</strong> {selectedEvent.assetHostname ?? "—"} ({selectedEvent.assetIp ?? "—"})
            </p>
          )}
          {selectedEvent.sourceIp !== undefined && (
            <p><strong>Source IP:</strong> {selectedEvent.sourceIp ?? "—"}</p>
          )}
          {selectedEvent.tags !== undefined && (
            <p><strong>Tags:</strong> {selectedEvent.tags.length ? selectedEvent.tags.join(", ") : "—"}</p>
          )}
          <p><strong>Type:</strong> {selectedEvent.type}</p>
          <p><strong>Timestamp:</strong> {formatTimestamp(selectedEvent.timestamp)}</p>
          <h3>Raw Event Data</h3>
          <pre>{JSON.stringify(selectedEvent, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}
