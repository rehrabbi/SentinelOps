import { IncidentDashboard } from "../incidents";

// Today's incident view under the page heading; a later task redesigns it.
export function Incidents() {
  return (
    <>
      <h1>Incidents</h1>
      <IncidentDashboard />
    </>
  );
}
