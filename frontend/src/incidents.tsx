import { useEffect, useState, type FormEvent } from "react";
import {
  getIncidents,
  createIncident,
  updateIncident,
  ApiError,
  type Incident,
  type IncidentSeverity,
  type IncidentStatus,
} from "./api";

// The load state for the incident list — exactly one of these three.
type ListState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; incidents: Incident[] };

const SEVERITIES: IncidentSeverity[] = ["low", "medium", "high", "critical"];
const STATUSES: IncidentStatus[] = [
  "open",
  "investigating",
  "resolved",
  "closed",
];

// IncidentDashboard fetches and shows the incidents the current user may see.
export function IncidentDashboard() {
  const [list, setList] = useState<ListState>({ kind: "loading" });

  useEffect(() => {
    getIncidents()
      .then((incidents) => setList({ kind: "ready", incidents }))
      .catch((err) => {
        const message =
          err instanceof ApiError ? err.message : "Failed to load incidents";
        setList({ kind: "error", message });
      });
  }, []);

  // Prepend a newly-created incident (newest-first).
  function handleCreated(incident: Incident) {
    setList((prev) =>
      prev.kind === "ready"
        ? { kind: "ready", incidents: [incident, ...prev.incidents] }
        : { kind: "ready", incidents: [incident] }
    );
  }

  // Replace an incident in place after an update.
  function handleUpdated(updated: Incident) {
    setList((prev) =>
      prev.kind === "ready"
        ? {
            kind: "ready",
            incidents: prev.incidents.map((i) =>
              i.id === updated.id ? updated : i
            ),
          }
        : prev
    );
  }

  return (
    <section className="incidents">
      <h2>Incidents</h2>
      <CreateIncidentForm onCreated={handleCreated} />

      {list.kind === "loading" && (
        <p className="status loading">Loading incidents…</p>
      )}
      {list.kind === "error" && <p className="status error">{list.message}</p>}
      {list.kind === "ready" && list.incidents.length === 0 && (
        <p className="status">No incidents yet.</p>
      )}
      {list.kind === "ready" && list.incidents.length > 0 && (
        <ul className="incident-list">
          {list.incidents.map((inc) => (
            <IncidentRow
              key={inc.id}
              incident={inc}
              onUpdated={handleUpdated}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

// A single incident row. Severity is a badge; status is an inline dropdown that
// PATCHes on change and reports the updated incident back up.
function IncidentRow({
  incident,
  onUpdated,
}: {
  incident: Incident;
  onUpdated: (incident: Incident) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function changeStatus(status: IncidentStatus) {
    setSaving(true);
    setError(null);
    try {
      const updated = await updateIncident(incident.id, { status });
      onUpdated(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Update failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <li className="incident-row">
      <div className="incident-main">
        <span className="incident-title">{incident.title}</span>
        {incident.description && (
          <span className="incident-desc">{incident.description}</span>
        )}
        {error && <span className="status error">{error}</span>}
      </div>
      <div className="incident-badges">
        <span className={`badge severity-${incident.severity}`}>
          {incident.severity}
        </span>
        <select
          className={`status-select status-${incident.status}`}
          value={incident.status}
          disabled={saving}
          onChange={(e) => changeStatus(e.target.value as IncidentStatus)}
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
    </li>
  );
}

// The create form. On success it clears itself and hands the new incident up.
function CreateIncidentForm({
  onCreated,
}: {
  onCreated: (incident: Incident) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<IncidentSeverity>("medium");
  const [status, setStatus] = useState<
    | { kind: "idle" }
    | { kind: "submitting" }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus({ kind: "submitting" });
    try {
      const incident = await createIncident({ title, description, severity });
      onCreated(incident);
      setTitle("");
      setDescription("");
      setSeverity("medium");
      setStatus({ kind: "idle" });
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : "Something went wrong";
      setStatus({ kind: "error", message });
    }
  }

  return (
    <form className="incident-form" onSubmit={handleSubmit}>
      <label>
        Title
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          maxLength={200}
        />
      </label>
      <label>
        Description
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          maxLength={5000}
        />
      </label>
      <label>
        Severity
        <select
          value={severity}
          onChange={(e) => setSeverity(e.target.value as IncidentSeverity)}
        >
          {SEVERITIES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      {status.kind === "error" && (
        <p className="status error">{status.message}</p>
      )}
      <button type="submit" disabled={status.kind === "submitting"}>
        {status.kind === "submitting" ? "Creating…" : "Create incident"}
      </button>
    </form>
  );
}
