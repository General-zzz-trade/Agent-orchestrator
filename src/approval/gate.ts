import { randomUUID } from "node:crypto";
import { publishEvent } from "../streaming/event-bus";

export interface ApprovalRequest {
  id: string;
  runId: string;
  taskId: string;
  taskType: string;
  taskPayload: Record<string, unknown>;
  reason: string;
  status: "pending" | "approved" | "rejected";
  requestedAt: string;
  respondedAt?: string;
  respondedBy?: string;
}

export interface ApprovalPolicy {
  enabled: boolean;
  requireApproval: string[];
  autoApproveTimeout?: number;
}

export const DEFAULT_APPROVAL_POLICY: ApprovalPolicy = {
  enabled: false,
  requireApproval: ["run_code", "write_file"],
  autoApproveTimeout: 0
};

interface PendingEntry {
  request: ApprovalRequest;
  resolve: (approved: boolean) => void;
  timer?: ReturnType<typeof setTimeout>;
}

const pending = new Map<string, PendingEntry>();

export function requiresApproval(
  taskType: string,
  _payload: Record<string, unknown>,
  policy: ApprovalPolicy
): boolean {
  return policy.enabled && policy.requireApproval.includes(taskType);
}

export async function requestApproval(
  input: Omit<ApprovalRequest, "id" | "status" | "requestedAt">
): Promise<ApprovalRequest> {
  const id = randomUUID();
  const request: ApprovalRequest = {
    ...input,
    id,
    status: "pending",
    requestedAt: new Date().toISOString()
  };

  const approved = await new Promise<boolean>((resolve) => {
    const entry: PendingEntry = { request, resolve };

    // Auto-approve timeout (0 = wait forever)
    const timeout = (input as Record<string, unknown>)._autoApproveTimeout as number | undefined;
    if (timeout && timeout > 0) {
      entry.timer = setTimeout(() => {
        resolve(true);
      }, timeout);
    }

    pending.set(id, entry);

    // Publish SSE event so the UI picks it up
    publishEvent({
      type: "approval_required",
      runId: input.runId,
      taskId: input.taskId,
      taskType: input.taskType,
      timestamp: request.requestedAt,
      payload: {
        approvalId: id,
        taskPayload: input.taskPayload,
        reason: input.reason
      }
    });
  });

  request.status = approved ? "approved" : "rejected";
  request.respondedAt = new Date().toISOString();
  pending.delete(id);

  return request;
}

export function respondToApproval(
  id: string,
  approved: boolean,
  respondedBy?: string
): ApprovalRequest | undefined {
  const entry = pending.get(id);
  if (!entry) return undefined;

  if (entry.timer) clearTimeout(entry.timer);

  entry.request.respondedBy = respondedBy;
  entry.resolve(approved);

  // Return a snapshot (the caller of requestApproval will update status after resolve)
  return {
    ...entry.request,
    status: approved ? "approved" : "rejected",
    respondedAt: new Date().toISOString(),
    respondedBy
  };
}

export function getPendingApprovals(runId: string): ApprovalRequest[] {
  const results: ApprovalRequest[] = [];
  for (const entry of pending.values()) {
    if (entry.request.runId === runId && entry.request.status === "pending") {
      results.push({ ...entry.request });
    }
  }
  return results;
}

export function clearApprovals(runId: string): void {
  for (const [id, entry] of pending.entries()) {
    if (entry.request.runId === runId) {
      if (entry.timer) clearTimeout(entry.timer);
      // Reject any still-pending approvals so they don't hang forever
      entry.resolve(false);
      pending.delete(id);
    }
  }
}
