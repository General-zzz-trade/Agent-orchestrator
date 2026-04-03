import test from "node:test";
import assert from "node:assert/strict";
import {
  requiresApproval,
  requestApproval,
  respondToApproval,
  getPendingApprovals,
  clearApprovals,
  type ApprovalPolicy
} from "./gate";

test("requiresApproval returns false when policy is disabled", () => {
  const policy: ApprovalPolicy = {
    enabled: false,
    requireApproval: ["run_code", "write_file"]
  };
  assert.equal(requiresApproval("run_code", {}, policy), false);
});

test("requiresApproval returns true when policy is enabled and task type matches", () => {
  const policy: ApprovalPolicy = {
    enabled: true,
    requireApproval: ["run_code", "write_file"]
  };
  assert.equal(requiresApproval("run_code", {}, policy), true);
});

test("requiresApproval returns false when policy is enabled but task type does not match", () => {
  const policy: ApprovalPolicy = {
    enabled: true,
    requireApproval: ["run_code", "write_file"]
  };
  assert.equal(requiresApproval("click", {}, policy), false);
});

test("respondToApproval resolves pending request with approved", async () => {
  const approvalPromise = requestApproval({
    runId: "run-approve-test",
    taskId: "task-1",
    taskType: "run_code",
    taskPayload: { code: "console.log(1)" },
    reason: "Code execution requires approval"
  });

  const pending = getPendingApprovals("run-approve-test");
  assert.equal(pending.length, 1);
  assert.equal(pending[0].status, "pending");

  const response = respondToApproval(pending[0].id, true, "test-user");
  assert.ok(response);
  assert.equal(response!.status, "approved");
  assert.equal(response!.respondedBy, "test-user");

  const result = await approvalPromise;
  assert.equal(result.status, "approved");
});

test("respondToApproval resolves pending request with rejected", async () => {
  const approvalPromise = requestApproval({
    runId: "run-reject-test",
    taskId: "task-2",
    taskType: "write_file",
    taskPayload: { path: "/etc/passwd" },
    reason: "Dangerous file write"
  });

  const pending = getPendingApprovals("run-reject-test");
  assert.equal(pending.length, 1);

  respondToApproval(pending[0].id, false);

  const result = await approvalPromise;
  assert.equal(result.status, "rejected");
});

test("respondToApproval returns undefined for unknown id", () => {
  const result = respondToApproval("nonexistent-id", true);
  assert.equal(result, undefined);
});

test("getPendingApprovals returns empty for unknown runId", () => {
  const result = getPendingApprovals("nonexistent-run");
  assert.deepEqual(result, []);
});

test("clearApprovals rejects all pending and cleans up", async () => {
  const promise1 = requestApproval({
    runId: "run-clear-test",
    taskId: "task-a",
    taskType: "run_code",
    taskPayload: {},
    reason: "test"
  });

  const promise2 = requestApproval({
    runId: "run-clear-test",
    taskId: "task-b",
    taskType: "write_file",
    taskPayload: {},
    reason: "test"
  });

  const pendingBefore = getPendingApprovals("run-clear-test");
  assert.equal(pendingBefore.length, 2);

  clearApprovals("run-clear-test");

  const [result1, result2] = await Promise.all([promise1, promise2]);
  assert.equal(result1.status, "rejected");
  assert.equal(result2.status, "rejected");

  const pendingAfter = getPendingApprovals("run-clear-test");
  assert.equal(pendingAfter.length, 0);
});
