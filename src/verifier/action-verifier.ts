import type { AgentTask, RunContext } from "../types";
import type { AgentObservation, VerificationResult } from "../cognition/types";

export async function verifyActionResult(
  context: RunContext,
  task: AgentTask,
  observation: AgentObservation
): Promise<VerificationResult> {
  const evidence: string[] = [];
  let passed = true;
  let confidence = 0.8;
  let rationale = "Action result looks plausible.";

  switch (task.type) {
    case "open_page": {
      const expectedUrl = String(task.payload.url ?? "");
      passed = Boolean(
        observation.pageUrl &&
        normalizeUrl(observation.pageUrl).startsWith(normalizeUrl(expectedUrl))
      );
      rationale = passed
        ? "Observed page URL matches the requested open_page target."
        : "Observed page URL does not match the requested open_page target.";
      evidence.push(`expectedUrl=${expectedUrl}`);
      evidence.push(`observedUrl=${observation.pageUrl ?? "none"}`);
      break;
    }

    case "assert_text":
    case "visual_assert": {
      const expectedText = String(task.payload.text ?? "");
      const visible = observation.visibleText?.join(" ") ?? "";
      passed = visible.toLowerCase().includes(expectedText.toLowerCase());
      rationale = passed
        ? "Observed text contains the asserted value."
        : "Observed text does not contain the asserted value.";
      evidence.push(`expectedText=${expectedText}`);
      break;
    }

    case "click":
    case "visual_click":
    case "hover": {
      passed = observation.anomalies.length === 0;
      rationale = passed
        ? `${task.type} completed and no observation anomaly was detected.`
        : `${task.type} completed but the observation engine reported anomalies.`;
      evidence.push(`anomalyCount=${observation.anomalies.length}`);

      const selector = String(task.payload.selector ?? "");
      if (selector && observation.actionableElements?.length) {
        const found = observation.actionableElements.some(
          (el: { selector?: string }) => el.selector === selector
        );
        evidence.push(`targetInObservation=${found}`);
        if (passed && found) confidence = 0.85;
      }
      break;
    }

    case "type":
    case "visual_type": {
      const typedValue = String(task.payload.value ?? "");
      const visible = observation.visibleText?.join(" ") ?? "";
      passed = visible.toLowerCase().includes(typedValue.toLowerCase());
      rationale = passed
        ? "Typed value appears in the observed visible text."
        : "Typed value was not found in the observed visible text.";
      evidence.push(`expectedValue=${typedValue}`);
      break;
    }

    case "select": {
      const selectedValue = String(task.payload.value ?? "");
      const visible = observation.visibleText?.join(" ") ?? "";
      passed = visible.toLowerCase().includes(selectedValue.toLowerCase());
      rationale = passed
        ? "Selected value appears in the observed visible text."
        : "Selected value was not found in the observed visible text.";
      evidence.push(`expectedValue=${selectedValue}`);
      break;
    }

    case "screenshot": {
      passed = context.artifacts.some(
        (a) => a.type === "screenshot" && a.taskId === task.id
      );
      rationale = passed
        ? "Screenshot artifact was captured for this task."
        : "No screenshot artifact was found for this task.";
      evidence.push(`artifactCount=${context.artifacts.filter((a) => a.taskId === task.id).length}`);
      break;
    }

    case "http_request": {
      if (task.error) {
        passed = false;
        rationale = `http_request failed: ${task.error}`;
        evidence.push(`taskError=${task.error}`);
        break;
      }
      const httpArtifact = context.artifacts.find(
        (a) => a.type === "http_response" && a.taskId === task.id
      );
      if (httpArtifact) {
        evidence.push(`artifact=${httpArtifact.description}`);
        const statusMatch = httpArtifact.description.match(/->?\s*(\d+)/);
        if (statusMatch) {
          const status = Number(statusMatch[1]);
          passed = status >= 200 && status < 400;
          rationale = passed
            ? `http_request completed with status ${status}.`
            : `http_request returned non-success status ${status}.`;
          confidence = 0.85;
          evidence.push(`httpStatus=${status}`);
        } else {
          passed = true;
          confidence = 0.85;
          rationale = "http_request completed and response artifact was created.";
        }
      } else {
        passed = true;
        rationale = "http_request completed without error.";
        evidence.push("taskError=none");
      }
      break;
    }

    case "run_code": {
      if (task.error) {
        passed = false;
        rationale = `run_code failed: ${task.error}`;
        evidence.push(`taskError=${task.error}`);
        break;
      }
      const codeArtifact = context.artifacts.find(
        (a) => a.type === "code_output" && a.taskId === task.id
      );
      passed = true;
      rationale = codeArtifact
        ? "run_code completed with exit 0 and produced output."
        : "run_code completed with exit 0 (no output).";
      if (codeArtifact) confidence = 0.85;
      evidence.push("taskError=none");
      evidence.push(`hasOutput=${Boolean(codeArtifact)}`);
      break;
    }

    case "read_file":
    case "write_file":
    case "visual_extract": {
      passed = !task.error;
      rationale = passed
        ? `${task.type} completed without error.`
        : `${task.type} failed with error: ${task.error}`;
      evidence.push(`taskError=${task.error ?? "none"}`);
      break;
    }

    case "scroll": {
      passed = observation.anomalies.length === 0;
      confidence = 0.75;
      rationale = passed
        ? "scroll completed without anomalies."
        : "scroll completed but anomalies were detected.";
      evidence.push(`anomalyCount=${observation.anomalies.length}`);
      break;
    }

    case "wait":
    case "wait_for_server":
    case "start_app":
    case "stop_app": {
      passed = true;
      rationale = `${task.type} is verified by the state verifier.`;
      break;
    }

    default: {
      passed = observation.anomalies.length === 0;
      rationale = passed
        ? "Unknown task type completed without anomalies."
        : "Unknown task type completed with anomalies.";
      evidence.push(`anomalyCount=${observation.anomalies.length}`);
      break;
    }
  }

  return {
    runId: context.runId,
    taskId: task.id,
    verifier: "action",
    passed,
    confidence: passed ? confidence : Math.min(confidence, 0.55),
    rationale,
    evidence
  };
}

function normalizeUrl(value: string): string {
  return value.replace(/\/+$/, "");
}
