import { AgentAction, AgentTask } from "../types";

export interface TaskBlueprint {
  type: AgentAction;
  payload: Record<string, string | number | boolean | undefined>;
}

export function createTaskId(runId: string, sequence: number, type: AgentAction): string {
  return `${runId}-${String(sequence).padStart(3, "0")}-${type}`;
}

export function createTaskFromBlueprint(
  runId: string,
  sequence: number,
  blueprint: TaskBlueprint,
  replanDepth = 0
): AgentTask {
  return {
    id: createTaskId(runId, sequence, blueprint.type),
    type: blueprint.type,
    status: "pending",
    retries: 0,
    attempts: 0,
    replanDepth,
    payload: blueprint.payload
  };
}
