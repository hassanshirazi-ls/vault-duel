/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Tally form URL (D-257); unset or not https hides the feedback link */
  readonly VITE_FEEDBACK_URL?: string;
}

/** Short commit SHA, or `dev`; injected by vite.config.ts (D-257). Absent under a plain Vitest run. */
declare const __BUILD_SHA__: string;
