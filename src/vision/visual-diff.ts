/**
 * Visual Diff — compares two observations to detect state changes.
 * Works with both text-based observations and screenshot-based scenes.
 */

import type { AgentObservation } from "../cognition/types";
import type { SceneDescription } from "./scene-analyzer";

export interface VisualDiff {
  changed: boolean;
  urlChanged: boolean;
  textChanges: TextChange[];
  stateChanges: string[];
  changeScore: number;  // 0 = no change, 1 = completely different
  summary: string;
}

export interface TextChange {
  type: "added" | "removed";
  text: string;
}

/**
 * Compare two observations and produce a diff.
 */
export function diffObservations(
  before: AgentObservation,
  after: AgentObservation
): VisualDiff {
  const urlChanged = (before.pageUrl ?? "") !== (after.pageUrl ?? "");

  const beforeText = new Set(before.visibleText ?? []);
  const afterText = new Set(after.visibleText ?? []);

  const textChanges: TextChange[] = [];
  for (const line of afterText) {
    if (!beforeText.has(line)) {
      textChanges.push({ type: "added", text: line });
    }
  }
  for (const line of beforeText) {
    if (!afterText.has(line)) {
      textChanges.push({ type: "removed", text: line });
    }
  }

  const stateChanges: string[] = [];
  if (before.appStateGuess !== after.appStateGuess) {
    stateChanges.push(`appState: ${before.appStateGuess ?? "unknown"} → ${after.appStateGuess ?? "unknown"}`);
  }
  if (urlChanged) {
    stateChanges.push(`url: ${before.pageUrl ?? "none"} → ${after.pageUrl ?? "none"}`);
  }

  const totalLines = Math.max(beforeText.size, afterText.size, 1);
  const changeScore = Math.min(1, textChanges.length / totalLines);
  const changed = urlChanged || textChanges.length > 0 || stateChanges.length > 0;

  const summaryParts: string[] = [];
  if (urlChanged) summaryParts.push("URL changed");
  if (textChanges.length > 0) summaryParts.push(`${textChanges.length} text changes`);
  if (stateChanges.length > 0) summaryParts.push(stateChanges.join(", "));
  const summary = changed ? summaryParts.join("; ") : "No observable changes";

  return {
    changed,
    urlChanged,
    textChanges,
    stateChanges,
    changeScore,
    summary
  };
}

/**
 * Compare two scene descriptions (from VLM analysis).
 */
export function diffScenes(
  before: SceneDescription,
  after: SceneDescription
): VisualDiff {
  const pageTypeChanged = before.pageType !== after.pageType;

  const stateChanges: string[] = [];
  if (pageTypeChanged) {
    stateChanges.push(`pageType: ${before.pageType} → ${after.pageType}`);
  }

  // Compare state indicators
  const beforeIndicators = new Set(before.stateIndicators);
  const afterIndicators = new Set(after.stateIndicators);
  const textChanges: TextChange[] = [];

  for (const ind of afterIndicators) {
    if (!beforeIndicators.has(ind)) {
      textChanges.push({ type: "added", text: ind });
      stateChanges.push(`new indicator: ${ind}`);
    }
  }
  for (const ind of beforeIndicators) {
    if (!afterIndicators.has(ind)) {
      textChanges.push({ type: "removed", text: ind });
      stateChanges.push(`removed indicator: ${ind}`);
    }
  }

  // Compare key elements
  const beforeLabels = new Set(before.keyElements.map(e => e.label));
  const afterLabels = new Set(after.keyElements.map(e => e.label));

  for (const label of afterLabels) {
    if (!beforeLabels.has(label)) {
      textChanges.push({ type: "added", text: `element: ${label}` });
    }
  }
  for (const label of beforeLabels) {
    if (!afterLabels.has(label)) {
      textChanges.push({ type: "removed", text: `element: ${label}` });
    }
  }

  const changed = pageTypeChanged || textChanges.length > 0;
  const changeScore = pageTypeChanged ? 0.8 : Math.min(1, textChanges.length * 0.2);

  return {
    changed,
    urlChanged: false,
    textChanges,
    stateChanges,
    changeScore,
    summary: changed ? stateChanges.join("; ") : "No visual changes detected"
  };
}
