/**
 * Evaluation Profiles — define configurations for A/B benchmarking.
 *
 * BASELINE: All Level-4 modules disabled (sequential, rule-based only).
 * FULL:     All Level-4 modules enabled (default production config).
 *
 * Each module can be independently toggled via DISABLE_<MODULE> env vars,
 * enabling ablation studies (disable one module at a time).
 */

import type { RunOptions } from "../core/runtime";

export interface EvalProfile {
  name: string;
  description: string;
  runOptions: Partial<RunOptions>;
  env: Record<string, string | undefined>;
}

export const MODULE_SWITCHES = [
  "DISABLE_THOMPSON_SAMPLING",
  "DISABLE_ADAPTIVE_WEIGHTS",
  "DISABLE_LOOP_DETECTION",
  "DISABLE_COUNTERFACTUAL",
  "DISABLE_RECOVERY_SYNTHESIS",
  "DISABLE_PROMPT_EVOLUTION",
  "DISABLE_LLM_FIRST",
] as const;

export type ModuleSwitch = (typeof MODULE_SWITCHES)[number];

export const BASELINE: EvalProfile = {
  name: "baseline",
  description: "Sequential execution, no Level-4 modules",
  runOptions: { executionMode: "sequential" },
  env: Object.fromEntries(MODULE_SWITCHES.map(s => [s, "1"]))
};

export const FULL: EvalProfile = {
  name: "full",
  description: "All Level-4 modules enabled (sequential execution for stability)",
  runOptions: { executionMode: "sequential" },  // HTN tested separately to avoid OOM
  env: Object.fromEntries(MODULE_SWITCHES.map(s => [s, undefined]))
};

/**
 * Generate ablation profiles: each disables exactly one module.
 */
export function generateAblationProfiles(): EvalProfile[] {
  return MODULE_SWITCHES.map(sw => {
    const moduleName = sw.replace("DISABLE_", "").toLowerCase().replace(/_/g, " ");
    return {
      name: `ablation-no-${moduleName.replace(/\s/g, "-")}`,
      description: `All modules except ${moduleName}`,
      runOptions: {},
      env: { [sw]: "1" }
    };
  });
}

/**
 * Apply an eval profile's env vars (set or delete).
 * Returns a restore function to revert changes.
 */
export function applyProfile(profile: EvalProfile): () => void {
  const previous: Record<string, string | undefined> = {};

  for (const [key, value] of Object.entries(profile.env)) {
    previous[key] = process.env[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  return () => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  };
}
