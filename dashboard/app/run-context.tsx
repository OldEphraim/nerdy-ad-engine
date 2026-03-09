"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

interface RunContextValue {
  selectedRun: string;
  setSelectedRun: (run: string) => void;
  availableRuns: string[];
}

const RunContext = createContext<RunContextValue>({
  selectedRun: "",
  setSelectedRun: () => {},
  availableRuns: [],
});

export function useRun() {
  return useContext(RunContext);
}

export function RunProvider({ children }: { children: ReactNode }) {
  const [selectedRun, setSelectedRun] = useState("");
  const [availableRuns, setAvailableRuns] = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/ads")
      .then((r) => r.json())
      .then((data: { availableRuns?: string[] }) => {
        setAvailableRuns(data.availableRuns ?? []);
      });
  }, []);

  return (
    <RunContext.Provider value={{ selectedRun, setSelectedRun, availableRuns }}>
      {children}
    </RunContext.Provider>
  );
}
