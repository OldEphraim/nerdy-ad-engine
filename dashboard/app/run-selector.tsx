"use client";

import { useRun } from "./run-context";

export function RunSelector() {
  const { selectedRun, setSelectedRun, availableRuns } = useRun();

  if (availableRuns.length === 0) return null;

  return (
    <select
      value={selectedRun}
      onChange={(e) => setSelectedRun(e.target.value)}
      className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
    >
      <option value="">Latest run</option>
      {availableRuns.map((run) => (
        <option key={run} value={run}>
          {run}
        </option>
      ))}
    </select>
  );
}
