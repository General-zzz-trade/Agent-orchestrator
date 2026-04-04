import type { AgentTask, RunContext } from "../types";
import type { AgentObservation, VerificationResult } from "../cognition/types";

export async function verifyStateResult(
  context: RunContext,
  task: AgentTask,
  observation: AgentObservation
): Promise<VerificationResult> {
  const evidence: string[] = [];
  let passed = true;
  let rationale = "State remains internally consistent.";

  if (task.type === "wait_for_server") {
    // wait_for_server does not require a browser page — it only checks HTTP availability.
    // The "no browser page" anomaly is expected before open_page and should not fail this task.
    passed = !task.error;
    rationale = passed
      ? "Server wait completed — HTTP endpoint is reachable."
      : `Server wait failed: ${task.error}`;
  } else if (task.type === "start_app") {
    passed = Boolean(context.appProcess);
    rationale = passed
      ? "Application process handle is attached after start_app."
      : "Application process handle is missing after start_app.";
  } else if (task.type === "stop_app") {
    passed = !context.appProcess;
    rationale = passed
      ? "Application process handle is cleared after stop_app."
      : "Application process handle is still attached after stop_app.";
  } else if (task.type === "open_page") {
    const observedUrl = observation.pageUrl ?? "";
    const worldUrl = context.worldState?.pageUrl ?? "";
    if (observedUrl && worldUrl) {
      passed = normalizeUrl(observedUrl) === normalizeUrl(worldUrl);
      rationale = passed
        ? "Observed page URL is consistent with world state."
        : "Observed page URL diverges from world state — possible navigation inconsistency.";
    }
  } else if (task.type === "type" || task.type === "visual_type") {
    passed = !task.error;
    rationale = passed
      ? "World state reflects typing activity."
      : `Typing failed: ${task.error}`;
    const typedValue = String(task.payload.value ?? "");
    if (typedValue) evidence.push(`typedValue=${typedValue}`);
  } else if (task.type === "http_request") {
    passed = !task.error;
    const httpArtifact = context.artifacts.find(
      (a) => a.type === "http_response" && a.taskId === task.id
    );
    rationale = passed
      ? httpArtifact
        ? "HTTP request completed and response artifact exists."
        : "HTTP request completed without error."
      : `HTTP request failed: ${task.error}`;
    if (httpArtifact) evidence.push(`artifact=${httpArtifact.description}`);
  } else if (task.type === "run_code") {
    passed = !task.error;
    const codeArtifact = context.artifacts.find(
      (a) => a.type === "code_output" && a.taskId === task.id
    );
    rationale = passed
      ? codeArtifact
        ? "Code execution completed and produced output artifact."
        : "Code execution completed (no output captured)."
      : `Code execution failed: ${task.error}`;
    if (codeArtifact) evidence.push(`artifact=${codeArtifact.description}`);
  } else if (task.type === "scroll") {
    passed = !task.error;
    rationale = passed
      ? "Scroll action completed."
      : `Scroll failed: ${task.error}`;
  }

  evidence.push(`appStateGuess=${observation.appStateGuess ?? "unknown"}`);
  evidence.push(`pageUrl=${observation.pageUrl ?? "none"}`);

  return {
    runId: context.runId,
    taskId: task.id,
    verifier: "state",
    passed,
    confidence: passed ? 0.75 : 0.6,
    rationale,
    evidence
  };
}

function normalizeUrl(value: string): string {
  return value.replace(/\/+$/, "");
}
