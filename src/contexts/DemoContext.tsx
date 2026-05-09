import React, { createContext, useContext, ReactNode } from 'react';

/**
 * DemoContext — DEPRECATED (2026-05-10)
 *
 * Demo mode has been removed. This file is retained as a thin compat shim so
 * that the ~14 callers of `useDemo()` in the app continue to compile without
 * being touched. `isDemoMode` is permanently `false`, the entry/exit no-ops
 * are silent, and `getDemoData` returns `undefined` for every key.
 *
 * Next janitorial pass: remove these callers' `isDemoMode` branches and
 * delete this file + the demo data services entirely.
 */

interface DemoContextType {
  isDemoMode: boolean;
  enterDemoMode: () => void;
  exitDemoMode: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- legacy API surface, returns nothing now
  getDemoData: (key: string) => any;
}

const NO_OP_VALUE: DemoContextType = {
  isDemoMode: false,
  enterDemoMode: () => {},
  exitDemoMode: () => {},
  getDemoData: () => undefined,
};

const DemoContext = createContext<DemoContextType>(NO_OP_VALUE);

export const useDemo = () => useContext(DemoContext);

interface DemoProviderProps {
  children: ReactNode;
}

/**
 * Compat shim. The real provider has been deleted; this just renders its
 * children with the no-op default value. App.tsx no longer mounts
 * `<DemoProvider>` directly, but if any consumer reaches `useContext`
 * outside a Provider it will get the no-op default anyway.
 */
export const DemoProvider: React.FC<DemoProviderProps> = ({ children }) => (
  <DemoContext.Provider value={NO_OP_VALUE}>{children}</DemoContext.Provider>
);
