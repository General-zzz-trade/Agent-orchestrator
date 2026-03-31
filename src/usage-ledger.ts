import { RunContext, UsageLedger } from "./types";

export function createUsageLedger(): UsageLedger {
  return {
    plannerCalls: 0,
    replannerCalls: 0,
    diagnoserCalls: 0,
    plannerTimeouts: 0,
    replannerTimeouts: 0,
    fallbackCounts: 0,
    totalLLMInteractions: 0
  };
}

export function finalizeUsageLedger(context: RunContext): UsageLedger {
  const ledger = context.usageLedger ?? createUsageLedger();
  ledger.totalLLMInteractions = ledger.plannerCalls + ledger.replannerCalls + ledger.diagnoserCalls;
  context.usageLedger = ledger;
  return ledger;
}

export function recordPlannerCall(context: RunContext): void {
  const ledger = ensureLedger(context);
  ledger.plannerCalls += 1;
}

export function recordReplannerCall(context: RunContext): void {
  const ledger = ensureLedger(context);
  ledger.replannerCalls += 1;
}

export function recordDiagnoserCall(context: RunContext): void {
  const ledger = ensureLedger(context);
  ledger.diagnoserCalls += 1;
}

export function recordPlannerTimeout(context: RunContext): void {
  const ledger = ensureLedger(context);
  ledger.plannerTimeouts += 1;
}

export function recordReplannerTimeout(context: RunContext): void {
  const ledger = ensureLedger(context);
  ledger.replannerTimeouts += 1;
}

export function recordFallback(context: RunContext): void {
  const ledger = ensureLedger(context);
  ledger.fallbackCounts += 1;
}

function ensureLedger(context: RunContext): UsageLedger {
  if (!context.usageLedger) {
    context.usageLedger = createUsageLedger();
  }

  return context.usageLedger;
}
