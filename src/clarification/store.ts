/**
 * In-memory store for pending clarification requests (keyed by runId).
 */

export interface ClarificationRecord {
  runId: string;
  originalGoal: string;
  question: string;
  answer?: string;
  askedAt: string;
  answeredAt?: string;
}

const store = new Map<string, ClarificationRecord>();

export function storeClarification(record: ClarificationRecord): void {
  store.set(record.runId, record);
}

export function getClarification(runId: string): ClarificationRecord | undefined {
  return store.get(runId);
}

export function answerClarification(runId: string, answer: string): ClarificationRecord | undefined {
  const record = store.get(runId);
  if (!record) return undefined;
  record.answer = answer;
  record.answeredAt = new Date().toISOString();
  return record;
}

export function deleteClarification(runId: string): void {
  store.delete(runId);
}

export function hasPendingClarification(runId: string): boolean {
  const r = store.get(runId);
  return !!r && !r.answer;
}
