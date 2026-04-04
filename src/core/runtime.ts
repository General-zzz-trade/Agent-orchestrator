import { applyBeliefUpdates } from "../cognition/belief-updater";
import { closeBrowserSession } from "../browser";
import { decideNextStep } from "../cognition/executive-controller";
import { isLLMDecisionConfigured, llmDecideNextStep } from "../cognition/llm-decision";
import { runRecoveryExperiments } from "../cognition/experiment-runner";
import { generateFailureHypotheses } from "../cognition/hypothesis-engine";
import { materializeObservation, observeEnvironment } from "../cognition/observation-engine";
import { attachWorldStateRunId, createInitialWorldState, updateWorldState } from "../cognition/state-store";
import { EpisodeEvent, VerificationResult } from "../cognition/types";
import { executeTask } from "./executor";
import { extractKnowledgeFromRun } from "../knowledge/extractor";
import { findFailurePatterns, loadRecentRuns, saveRun } from "../memory";
import { calculateRunMetrics } from "../observability/run-metrics";
import { resolvePolicy } from "./policy";
import { PlannerMode, planTasks } from "../planner";
import { replanTasks } from "../planner/replanner";
import { reflectOnRun, saveReflectionToFile } from "./reflector";
import { stopApp } from "../shell";
import { createUsageLedger, finalizeUsageLedger } from "../observability/usage-ledger";
import { verifyActionResult } from "../verifier/action-verifier";
import { verifyGoalProgress } from "../verifier/goal-verifier";
import { verifyStateResult } from "../verifier/state-verifier";
import { AgentPolicy, AgentTask, PlannerTieBreakerPolicy, RunContext, RunLimits, TerminationReason } from "../types";
import { publishEvent, closeEmitter } from "../streaming/event-bus";
// Research module integrations
import { createOnlineAdapterState, recordInRunFailure, suggestAdaptation, type OnlineAdapterState } from "../learning/online-adapter";
import { detectAnomalies } from "../cognition/anomaly-detector";
import { assessExperience, shouldRequestHelp } from "../cognition/meta-cognition";
import { findSimilarEpisodes, formatEpisodesAsContext } from "../memory/semantic-search";
import { saveEpisode, initEpisodesTable } from "../memory/episode-store";
import { generateEpisodeSummary, extractDomainFromRun } from "../memory/episode-generator";
import { computeEmbedding } from "../memory/embedding";
import { createCausalGraph, findPath, type CausalGraph } from "../world-model/causal-graph";
import { extractCausalTransitions } from "../world-model/extractor";
import { inferGoalState, inferCurrentState } from "../decomposer/causal-decomposer";
import { runReflection } from "../learning/reflection-loop";
import { applyInsights } from "../learning/strategy-updater";
// Level-4 cognitive modules
import { encodeObservation, detectLoop, assignCluster } from "../world-model/state-encoder";
import { suggestAlternativeActions } from "../world-model/counterfactual";
import { synthesizeRecovery, recordRecoveryOutcome, programToTasks } from "../cognition/recovery-synthesizer";
import { recordPlannerOutcome } from "../planner/thompson-sampling";
import { updateWeights, computeAdaptiveMultiplier } from "../learning/weight-optimizer";
import { restoreAllLearning, persistAllLearning } from "../learning/persistence";
import { createTokenBudget, canSpendTokens, recordTokenSpend, resetRecoveryBudget, type TokenBudget } from "../observability/token-budget";

export interface RunOptions {
  maxReplansPerRun?: number;
  maxReplansPerTask?: number;
  plannerMode?: PlannerMode;
  maxLLMPlannerCalls?: number;
  maxLLMReplannerCalls?: number;
  maxLLMReplannerTimeouts?: number;
  tieBreakerPolicy?: Partial<PlannerTieBreakerPolicy>;
  policy?: Partial<AgentPolicy>;
  tenantId?: string;
  /** Inject an existing browser session (for multi-turn conversations) */
  browserSession?: RunContext["browserSession"];
  /** Inject prior world state (for multi-turn conversations) */
  worldState?: RunContext["worldState"];
  /** Keep browser session alive after run (caller manages cleanup) */
  keepBrowserAlive?: boolean;
  /** Use HTN hierarchical decomposition mode */
  executionMode?: "sequential" | "htn";
}

export async function runGoal(goal: string, options: RunOptions = {}): Promise<RunContext> {
  // Dispatch to HTN mode: only when explicitly requested (avoid overhead for DSL goals)
  const useHTN = options.executionMode === "htn";
  if (useHTN) {
    try {
      const { runGoalHTN } = await import("./htn-runtime");
      const htnResult = await runGoalHTN(goal, { ...options, maxDepth: 3 });
      if (htnResult.lastContext) return htnResult.lastContext;
    } catch {
      // HTN failed — fall through to sequential execution
    }
  }

  const limits: RunLimits = {
    maxReplansPerRun: options.maxReplansPerRun ?? 3,
    maxReplansPerTask: options.maxReplansPerTask ?? 1
  };
  const runId = createRunId();
  const policy = resolvePolicy(options.policy);
  const tieBreakerPolicy: PlannerTieBreakerPolicy = {
    preferStablePlannerOnTie: options.tieBreakerPolicy?.preferStablePlannerOnTie ?? true,
    preferRulePlannerOnTie: options.tieBreakerPolicy?.preferRulePlannerOnTie ?? true,
    preferLowerTaskCountOnTie: options.tieBreakerPolicy?.preferLowerTaskCountOnTie ?? true
  };
  const usageLedger = createUsageLedger();
  const onlineAdapter = createOnlineAdapterState();
  const causalGraph = createCausalGraph();
  try { restoreAllLearning(); } catch { /* learning restore is best-effort */ }
  const stateEmbeddingHistory: number[][] = [];  // Leap 3: for loop detection
  let consecutiveLoopDetections = 0;  // Only act on consecutive loop signals
  const tokenBudget = createTokenBudget();

  // Integration: Rich context injection — episodes + lessons + selectors + failure warnings
  let episodeContext = "";
  try {
    initEpisodesTable();
    const { buildInjectedContext, formatContextForPrompt } = await import("../memory/context-injector");
    const domain = goal.match(/https?:\/\/([^\/\s"]+)/)?.[1]?.replace(/^www\./, "");
    const injected = await buildInjectedContext(goal, domain);
    episodeContext = formatContextForPrompt(injected);
  } catch {
    // Rich context injection failed — try basic episode retrieval
    try {
      const similarEpisodes = await findSimilarEpisodes(goal, 3);
      episodeContext = formatEpisodesAsContext(similarEpisodes);
    } catch { /* continue without context */ }
  }

  const planResult = await planTasks(goal, {
    runId,
    mode: options.plannerMode ?? "auto",
    maxLLMPlannerCalls: options.maxLLMPlannerCalls ?? 1,
    tieBreakerPolicy,
    policy,
    usageLedger,
    episodeContext
  });

  // Use injected world state or create fresh
  const initialWorldState = options.worldState
    ? attachWorldStateRunId(options.worldState, runId)
    : attachWorldStateRunId(createInitialWorldState(goal), runId);

  const context: RunContext = {
    runId,
    tenantId: options.tenantId ?? "default",
    plannerUsed: planResult.plannerUsed,
    plannerDecisionTrace: planResult.decisionTrace,
    plannerTieBreakerPolicy: tieBreakerPolicy,
    policy,
    usageLedger,
    escalationDecisions: [planResult.decisionTrace.escalationDecision],
    goal,
    tasks: planResult.tasks,
    artifacts: [],
    replanCount: 0,
    nextTaskSequence: planResult.tasks.length,
    insertedTaskCount: 0,
    llmReplannerInvocations: 0,
    llmReplannerTimeoutCount: 0,
    llmReplannerFallbackCount: 0,
    browserSession: options.browserSession,
    worldState: initialWorldState,
    worldStateHistory: [],
    observations: [],
    hypotheses: [],
    experimentResults: [],
    beliefUpdates: [],
    episodeEvents: [],
    verificationResults: [],
    cognitiveDecisions: [],
    limits,
    startedAt: new Date().toISOString()
  };
  if (context.worldState) {
    recordWorldState(context, context.worldState, "state_update", "run_initialized");
  }

  const summaries: string[] = [];
  let index = 0;

  try {
    validateGoal(goal, context.tasks);

    while (index < context.tasks.length) {
      const task = context.tasks[index];
      const beforeObservation = await observeAndRecord(context, task, "Pre-task observation");
      recordWorldState(context, updateWorldState(context.worldState!, {
        observation: beforeObservation
      }), "task_observe", "pre_task_observation");

      try {
        const output = await executeTask(context, task);
        summaries.push(output.summary);
        appendEpisodeEvent(context, {
          taskId: task.id,
          kind: "execute",
          summary: output.summary,
          metadata: {
            attempts: task.attempts,
            retries: task.retries
          }
        });

        if (output.artifacts) {
          context.artifacts.push(...output.artifacts);
        }

        const afterObservation = await observeAndRecord(context, task, "Post-task observation");
        const actionVerification = await verifyActionResult(context, task, afterObservation);
        const stateVerification = await verifyStateResult(context, task, afterObservation);
        const goalVerification = shouldRunGoalVerification(task, index, context.tasks.length)
          ? await verifyGoalProgress(context, afterObservation)
          : undefined;

        recordVerification(context, actionVerification);
        recordVerification(context, stateVerification);
        if (goalVerification) {
          recordVerification(context, goalVerification);
        }

        recordWorldState(context, updateWorldState(context.worldState!, {
          observation: afterObservation,
          verification: stateVerification.passed ? stateVerification : actionVerification,
          taskType: task.type,
          stateHints: output.stateHints
        }), "task_observe", "post_task_verification");

        // Integration: State embedding + loop detection (Leap 3)
        if (!process.env.DISABLE_LOOP_DETECTION) try {
          const stateEmb = encodeObservation(afterObservation);
          const loopCheck = detectLoop(stateEmb, stateEmbeddingHistory);
          stateEmbeddingHistory.push(stateEmb);
          if (stateEmbeddingHistory.length > 50) stateEmbeddingHistory.shift();
          const label = afterObservation.pageUrl ?? "unknown";
          const domain = inferCurrentState({ pageUrl: afterObservation.pageUrl }).split("|")[0] ?? "";
          assignCluster(stateEmb, label, domain);
          if (loopCheck.isLoop && loopCheck.similarity >= 0.99) {
            consecutiveLoopDetections++;
          } else {
            consecutiveLoopDetections = 0;
          }
          // Only trigger escape after 2 consecutive high-confidence loop detections
          // AND at least 3 tasks have been executed (avoid false positives on startup)
          if (consecutiveLoopDetections >= 2 && index >= 3) {
            consecutiveLoopDetections = 0;
            appendEpisodeEvent(context, {
              taskId: task.id,
              kind: "observe",
              summary: `Confirmed loop: ${consecutiveLoopDetections} consecutive detections (similarity ${loopCheck.similarity.toFixed(2)}). Triggering replan.`,
              metadata: { similarity: loopCheck.similarity, matchIndex: loopCheck.matchIndex }
            });
            const loopRecovery = await analyzeRecoveryOptions(
              context, task,
              `Confirmed loop: agent stuck revisiting state from step ${loopCheck.matchIndex}`,
              causalGraph, tokenBudget
            );
            const handled = await handleReplan(context, task, loopRecovery, options, summaries, index);
            if (handled.nextIndex !== null) {
              index = handled.nextIndex;
              continue;
            }
          }
        } catch { /* state encoding is optional */ }

        // Integration: Anomaly detection — check for unexpected state after each task
        const anomalyReport = detectAnomalies(task, beforeObservation, afterObservation, context);
        if (anomalyReport.anomalies.length > 0) {
          appendEpisodeEvent(context, {
            taskId: task.id,
            kind: "observe",
            summary: `Anomaly detected: ${anomalyReport.summary}`,
            metadata: { anomalyCount: anomalyReport.anomalies.length, risk: anomalyReport.overallRisk }
          });
        }

        // Integration: Causal graph — record successful state transition
        try {
          extractCausalTransitions(
            { ...context, tasks: [task], observations: [beforeObservation, afterObservation] } as RunContext,
            causalGraph
          );
        } catch {
          // Causal graph update is optional
        }

        // Integration: Meta-cognition — adjust confidence based on experience
        const experienceAssessment = assessExperience(context, task);
        // Leap 7: Use adaptive weights instead of hardcoded multiplier
        if (!process.env.DISABLE_ADAPTIVE_WEIGHTS) try {
          experienceAssessment.confidenceMultiplier = computeAdaptiveMultiplier(
            experienceAssessment.domainFamiliarity,
            experienceAssessment.selectorRiskLevel,
            experienceAssessment.stuckLevel
          );
        } catch { /* adaptive weights optional */ }

        const rawDecision = isLLMDecisionConfigured()
          ? await llmDecideNextStep({
              task,
              goal,
              actionVerification,
              stateVerification,
              goalVerification,
              replanCount: context.replanCount,
              maxReplans: context.limits.maxReplansPerRun,
              visibleText: afterObservation.visibleText,
              pageUrl: afterObservation.pageUrl,
              completedTasks: context.tasks.filter(t => t.status === "done").map(t => `${t.type}(${t.id})`),
              remainingTasks: context.tasks.filter(t => t.status === "pending").map(t => `${t.type}(${t.id})`),
              failureHistory: context.tasks.filter(t => t.error).map(t => `${t.type}: ${t.error}`)
            })
          : decideNextStep({
              task,
              actionVerification,
              stateVerification,
              goalVerification,
              replanCount: context.replanCount,
              maxReplans: context.limits.maxReplansPerRun
            });
        // Apply meta-cognition: scale confidence by experience level
        const cognitiveDecision = {
          ...rawDecision,
          confidence: rawDecision.confidence * experienceAssessment.confidenceMultiplier
        };

        // Integration: Meta-cognition — pause for help when stuck
        if (shouldRequestHelp(experienceAssessment)) {
          appendEpisodeEvent(context, {
            taskId: task.id,
            kind: "observe",
            summary: `Meta-cognition: requesting help — ${experienceAssessment.rationale} (confidence: ${cognitiveDecision.confidence.toFixed(2)})`,
            metadata: {
              stuckLevel: experienceAssessment.stuckLevel,
              confidenceMultiplier: experienceAssessment.confidenceMultiplier
            }
          });
          publishEvent({
            type: "help_requested",
            runId: context.runId,
            taskId: task.id,
            timestamp: new Date().toISOString(),
            message: `Agent is stuck: ${experienceAssessment.rationale}. Confidence: ${cognitiveDecision.confidence.toFixed(2)}`
          });

          // If approval system is enabled, pause and wait for human guidance
          if (context.policy?.approval?.enabled) {
            const { requestApproval } = await import("../approval/gate");
            const helpResponse = await requestApproval({
              runId: context.runId,
              taskId: task.id,
              taskType: task.type,
              taskPayload: task.payload as Record<string, unknown>,
              reason: `Agent is stuck (${experienceAssessment.rationale}). Should it continue with task "${task.type}"?`
            });
            if (helpResponse.status === "rejected") {
              throw new Error(`Human rejected continuation: agent was stuck (${experienceAssessment.rationale})`);
            }
          }
        }

        recordDecision(context, task.id, cognitiveDecision.rationale, cognitiveDecision);

        if (cognitiveDecision.nextAction === "abort") {
          throw new Error(cognitiveDecision.rationale);
        }

        if (cognitiveDecision.nextAction === "reobserve") {
          const refreshObservation = await observeAndRecord(context, task, "Refresh observation after goal verification");
          recordWorldState(context, updateWorldState(context.worldState!, {
            observation: refreshObservation,
            taskType: task.type
          }), "task_observe", "goal_reobserve");
        }

        if (cognitiveDecision.nextAction === "replan" || cognitiveDecision.nextAction === "retry_task") {
          // Only run expensive hypothesis/counterfactual analysis if verification actually failed
          const verificationFailed = !actionVerification.passed || !stateVerification.passed;
          const recoveryReason = verificationFailed
            ? await analyzeRecoveryOptions(
                context, task,
                `${task.type} verification requested recovery: ${cognitiveDecision.rationale}`,
                causalGraph, tokenBudget
              )
            : `${task.type}: ${cognitiveDecision.rationale}`;
          const handled = await handleReplan(
            context,
            task,
            recoveryReason,
            options,
            summaries,
            index
          );
          if (handled.nextIndex !== null) {
            index = handled.nextIndex;
            continue;
          }
        }

        // Integration: Checkpoint — save progress every 5 tasks for long-horizon recovery
        if (index > 0 && index % 5 === 0) {
          const { saveCheckpoint } = await import("./checkpoint");
          saveCheckpoint(context, index - 1, summaries);

          // Integration: Proactive exploration — build causal graph knowledge at checkpoints
          try {
            const { selectNextExplorationAction } = await import("../exploration/proactive-explorer");
            const currentState = inferCurrentState({
              pageUrl: context.worldState?.pageUrl,
              appState: context.worldState?.appState,
              visibleText: context.latestObservation?.visibleText
            });
            const elements = (context.latestObservation?.actionableElements ?? []).map(el => ({
              selector: el.selector ?? "",
              text: el.text ?? "",
              type: el.role ?? "button"
            }));
            const explorationHint = selectNextExplorationAction(currentState, causalGraph, new Map(), elements);
            if (explorationHint.action !== "stop") {
              appendEpisodeEvent(context, {
                taskId: task.id,
                kind: "observe",
                summary: `Proactive exploration hint: ${explorationHint.action} "${explorationHint.target ?? ""}" — ${explorationHint.reason}`,
                metadata: { explorationAction: explorationHint.action, target: explorationHint.target ?? "" }
              });
            }
          } catch { /* proactive exploration is optional */ }
        }

        index += 1;
      } catch (error) {
        const message = getErrorMessage(error);

        // Integration: Online adapter — record failure for in-run learning
        const inRunLesson = recordInRunFailure(onlineAdapter, task, message, index);
        appendEpisodeEvent(context, {
          taskId: task.id,
          kind: "observe",
          summary: `In-run learning: ${inRunLesson.suggestedStrategy}`,
          metadata: { adapter: "online", selector: inRunLesson.selector || "none" }
        });

        // Integration: Online adapter — check if next task should be adapted
        const adaptation = suggestAdaptation(onlineAdapter, task);
        if (adaptation) {
          appendEpisodeEvent(context, {
            taskId: task.id,
            kind: "recover",
            summary: `Online adaptation suggested: ${adaptation.strategy} — ${adaptation.reason}`,
            metadata: { strategy: adaptation.strategy }
          });
        }

        // Integration: Apply online adaptation to upcoming tasks
        if (adaptation) {
          applyOnlineAdaptation(context, task, adaptation, index);
        }

        const failureObservation = await observeAndRecord(context, task, `Failure observation: ${message}`);
        const failureVerification = createFailureVerification(context, task.id, message);
        recordVerification(context, failureVerification);
        recordWorldState(context, updateWorldState(context.worldState!, {
          observation: failureObservation,
          verification: failureVerification,
          taskType: task.type,
          taskError: message
        }), "task_observe", "failure_observation");
        const cognitiveDecision = decideNextStep({
          task,
          stateVerification: failureVerification,
          replanCount: context.replanCount,
          maxReplans: context.limits.maxReplansPerRun
        });
        recordDecision(context, task.id, cognitiveDecision.rationale, cognitiveDecision);

        if (cognitiveDecision.nextAction === "abort") {
          throw error;
        }

        const recoveryReason = await analyzeRecoveryOptions(context, task, message, causalGraph, tokenBudget);
        const handled = await handleReplan(context, task, recoveryReason, options, summaries, index);
        if (handled.nextIndex !== null) {
          index = handled.nextIndex;
          continue;
        }

        throw error;
      }
    }

    context.result = {
      success: true,
      message: `Goal: ${goal}\n${summaries.join("\n")}`
    };
    context.terminationReason = "success";
    try {
      const { clearCheckpoint } = await import("./checkpoint");
      clearCheckpoint(context.runId);
    } catch { /* optional */ }
  } catch (error) {
    const message = getErrorMessage(error);
    context.result = {
      success: false,
      message: `Task failed: ${message}`,
      error: message
    };
    context.terminationReason = determineTerminationReason(message);
  } finally {
    try { persistAllLearning(); } catch { /* learning persist is best-effort */ }
    context.endedAt = new Date().toISOString();
    const { clearApprovals } = await import("../approval/gate");
    clearApprovals(context.runId);
    await context.screencastSession?.stop();
    context.screencastSession = undefined;
    if (options.keepBrowserAlive) {
      // Conversation mode: keep browser and app alive for next turn
    } else {
      await closeBrowserSession(context.browserSession);
      await stopApp(context.appProcess);
      context.browserSession = undefined;
      context.appProcess = undefined;
    }

    context.metrics = calculateRunMetrics(context);
    context.reflection = await reflectOnRun(context);
    finalizeUsageLedger(context);
    extractKnowledgeFromRun(context);

    // Integration: Thompson Sampling — record planner outcome (Leap 2)
    try {
      const goalCategory = "general";  // simplified; could use classifyGoalCategory
      const success = context.result?.success ?? false;
      recordPlannerOutcome(context.plannerUsed ?? "template", goalCategory, success, context.usageLedger?.totalInputTokens ?? 0);
    } catch { /* planner stats optional */ }

    // Integration: Weight optimizer — update adaptive meta-cognition weights (Leap 7)
    try {
      const avgFamiliarity = 0.5;  // heuristic: mid-range for batch update
      const failedTasks = context.tasks.filter(t => t.status === "failed").length;
      const selectorRisk = context.tasks.length > 0 ? failedTasks / context.tasks.length : 0;
      const stuckLevel = context.limits.maxReplansPerRun > 0 ? context.replanCount / context.limits.maxReplansPerRun : 0;
      const actualOutcome = context.result?.success ? 1.0 : 0.0;
      const predictedConfidence = computeAdaptiveMultiplier(avgFamiliarity, selectorRisk, stuckLevel);
      updateWeights(predictedConfidence, actualOutcome, {
        domainFamiliarity: avgFamiliarity,
        selectorRisk,
        stuckLevel
      });
    } catch { /* weight update optional */ }

    // Integration: Reflection loop — analyze failure patterns and evolve strategies
    try {
      const reflectionInsight = runReflection();
      if (reflectionInsight.recommendations.length > 0) {
        const applied = applyInsights(reflectionInsight);
        appendEpisodeEvent(context, {
          kind: "observe",
          summary: `Reflection: ${reflectionInsight.recommendations.length} recommendations, ${applied} strategies updated`,
          metadata: {
            recommendations: reflectionInsight.recommendations.length,
            strategiesApplied: applied,
            dominantStrategies: reflectionInsight.dominantRecoveryStrategies.length
          }
        });
      }
    } catch {
      // Reflection is optional — never block run completion
    }

    // Integration: Prompt evolution — mutate worst-performing prompts after each run
    try {
      const { mutatePrompt } = await import("../learning/prompt-evolver");
      await mutatePrompt("planner");
      await mutatePrompt("replanner");
    } catch { /* prompt evolution is optional */ }

    // Integration: Causal graph — extract state transitions and persist for future runs
    try {
      extractCausalTransitions(context, causalGraph);
      const { saveCausalGraph } = await import("../world-model/persistence");
      saveCausalGraph(causalGraph);
    } catch {
      // Causal extraction/persistence is optional
    }

    await saveReflectionToFile(context.reflection);
    await saveRun(context);

    // Integration: Episode store — save semantic memory for future retrieval
    try {
      const summary = generateEpisodeSummary(context);
      const domain = extractDomainFromRun(context);
      const embedding = await computeEmbedding(summary);
      saveEpisode({
        runId: context.runId,
        goal: context.goal,
        domain,
        summary,
        outcome: context.result?.success ? "success" : "failure",
        taskCount: context.tasks.length,
        replanCount: context.replanCount,
        embedding
      });
    } catch {
      // Episode saving is optional — never block run completion
    }

    // Integration: Memory maintenance — prune old episodes and low-confidence knowledge
    try {
      const { pruneEpisodes } = await import("../memory/episode-store");
      const { pruneKnowledge, enforceKnowledgeCapacity } = await import("../knowledge/store");
      const episodePruned = pruneEpisodes(90, 500);
      const knowledgePruned = pruneKnowledge(0.2, 60);
      const capacityPruned = enforceKnowledgeCapacity(200);
      if (episodePruned + knowledgePruned + capacityPruned > 0) {
        appendEpisodeEvent(context, {
          kind: "observe",
          summary: `Memory maintenance: pruned ${episodePruned} episodes, ${knowledgePruned + capacityPruned} knowledge entries`,
          metadata: { episodePruned, knowledgePruned, capacityPruned }
        });
      }
    } catch {
      // Memory maintenance is optional
    }

    publishEvent({
      type: "run_complete",
      runId: context.runId,
      timestamp: new Date().toISOString(),
      success: context.result?.success ?? false,
      message: context.result?.message ?? ""
    });
    closeEmitter(context.runId);
  }

  return context;
}

function validateGoal(goal: string, tasks: RunContext["tasks"]): void {
  if (!goal.trim()) {
    throw new Error("Goal is required.");
  }

  if (tasks.length === 0) {
    throw new Error("No executable tasks were planned from the goal.");
  }
}

function createRunId(): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const randomPart = Math.random().toString(36).slice(2, 8);
  return `run-${timestamp}-${randomPart}`;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

function determineTerminationReason(message: string): TerminationReason {
  if (message.includes("Replan budget exceeded for run")) {
    return "replan_budget_exceeded";
  }

  if (message.includes("Replan budget exceeded for task")) {
    return "task_replan_budget_exceeded";
  }

  if (/timeout|timed out|did not become available/i.test(message)) {
    return "timeout";
  }

  if (message === "Unknown error") {
    return "unknown";
  }

  return "task_failure";
}

async function handleReplan(
  context: RunContext,
  task: RunContext["tasks"][number],
  errorMessage: string,
  options: RunOptions,
  summaries: string[],
  index: number
): Promise<{ nextIndex: number | null }> {
  const recentRuns = await loadRecentRuns(5);
  const failurePatterns = await findFailurePatterns();
  const decision = await replanTasks({
    context,
    task,
    error: errorMessage,
    recentRuns,
    failurePatterns,
    maxLLMReplannerCalls: options.maxLLMReplannerCalls ?? 1,
    maxLLMReplannerTimeouts: options.maxLLMReplannerTimeouts ?? 1
  });

  summaries.push(`Observed failure in ${task.id}: ${errorMessage}`);
  summaries.push(`Replan decision: ${decision.reason}`);
  appendEpisodeEvent(context, {
    taskId: task.id,
    kind: decision.abort ? "abort" : "recover",
    summary: decision.reason,
    metadata: {
      insertTasks: decision.insertTasks.length,
      replaceTasks: decision.replaceWith.length,
      abort: decision.abort
    }
  });

  publishEvent({
    type: "replan",
    runId: context.runId,
    taskId: task.id,
    timestamp: new Date().toISOString(),
    message: decision.reason
  });

  if (decision.abort && decision.reason.includes("budget exceeded")) {
    throw new Error(decision.reason);
  }

  if (decision.replaceWith.length > 0) {
    context.replanCount += 1;
    context.tasks.splice(index, 1, ...decision.replaceWith);
    await observeAndRecord(context, task, "Recovery follow-up observation", "recovery_followup");
    return { nextIndex: index };
  }

  if (decision.insertTasks.length > 0) {
    context.replanCount += 1;
    context.insertedTaskCount += decision.insertTasks.length;
    context.tasks.splice(index + 1, 0, ...decision.insertTasks);
    await observeAndRecord(context, task, "Recovery follow-up observation", "recovery_followup");
  }

  // Execute synthesized recovery program if replanner produced nothing
  if (decision.insertTasks.length === 0 && decision.replaceWith.length === 0 && !decision.abort) {
    const pendingProgram = (context as unknown as Record<string, unknown>).__pendingRecoveryProgram as
      import("../cognition/types").RecoveryProgram | undefined;
    if (pendingProgram && pendingProgram.steps.length > 0) {
      const recoveryTasks = programToTasks(pendingProgram, task.id);
      context.insertedTaskCount += recoveryTasks.length;
      context.tasks.splice(index + 1, 0, ...recoveryTasks);
      appendEpisodeEvent(context, {
        taskId: task.id,
        kind: "recover",
        summary: `Executing synthesized recovery program (${recoveryTasks.length} steps)`,
        metadata: { programId: pendingProgram.id, steps: recoveryTasks.length }
      });
      (context as unknown as Record<string, unknown>).__pendingRecoveryProgram = undefined;
      await observeAndRecord(context, task, "Recovery program follow-up observation", "recovery_followup");
      return { nextIndex: index + 1 };
    }
  }

  if (decision.abort) {
    return { nextIndex: null };
  }

  return { nextIndex: index + 1 };
}

async function observeAndRecord(
  context: RunContext,
  task: RunContext["tasks"][number],
  summary: string,
  source: "task_observe" | "recovery_followup" = "task_observe"
) {
  const observation = await observeEnvironment(context, task);
  observation.source = source;
  context.observations ??= [];
  context.observations.push(observation);
  context.latestObservation = observation;
  appendEpisodeEvent(context, {
    taskId: task.id,
    kind: "observe",
    summary,
    observationId: observation.id,
    metadata: {
      confidence: observation.confidence,
      anomalyCount: observation.anomalies.length
    }
  });
  return observation;
}

function recordVerification(context: RunContext, verification: VerificationResult): void {
  context.verificationResults ??= [];
  context.verificationResults.push(verification);
  appendEpisodeEvent(context, {
    taskId: verification.taskId,
    kind: "verify",
    summary: `${verification.verifier} verification ${verification.passed ? "passed" : "failed"}: ${verification.rationale}`,
    verificationPassed: verification.passed,
    metadata: {
      confidence: verification.confidence
    }
  });
}

function recordDecision(
  context: RunContext,
  taskId: string | undefined,
  summary: string,
  decision: { nextAction: string; rationale: string; confidence: number }
): void {
  context.cognitiveDecisions ??= [];
  context.cognitiveDecisions.push(decision as import("../cognition/types").CognitiveDecision);
  appendEpisodeEvent(context, {
    taskId,
    kind: decision.nextAction === "abort" ? "abort" : decision.nextAction === "replan" ? "recover" : "verify",
    summary,
    metadata: {
      nextAction: decision.nextAction,
      confidence: decision.confidence
    }
  });
}

function appendEpisodeEvent(
  context: RunContext,
  input: Omit<EpisodeEvent, "id" | "runId" | "timestamp">
): void {
  context.episodeEvents ??= [];
  context.episodeEvents.push({
    id: `evt-${context.runId}-${context.episodeEvents.length + 1}`,
    runId: context.runId,
    timestamp: new Date().toISOString(),
    ...input
  });
}

function createFailureVerification(
  context: RunContext,
  taskId: string,
  message: string
): VerificationResult {
  return {
    runId: context.runId,
    taskId,
    verifier: "state",
    passed: false,
    confidence: 0.95,
    rationale: message,
    evidence: [`taskFailure=${message}`]
  };
}

function shouldRunGoalVerification(
  task: RunContext["tasks"][number],
  index: number,
  totalTasks: number
): boolean {
  return task.type === "assert_text" || task.type === "screenshot" || task.type === "stop_app" || index === totalTasks - 1;
}

async function analyzeRecoveryOptions(
  context: RunContext,
  task: RunContext["tasks"][number],
  failureReason: string,
  causalGraph?: CausalGraph,
  tokenBudget?: TokenBudget
): Promise<string> {
  // Causal graph: check if there's a known alternative path to the goal
  if (causalGraph && causalGraph.edges.size > 0) {
    const currentState = inferCurrentState({
      pageUrl: context.worldState?.pageUrl,
      appState: context.worldState?.appState,
      visibleText: context.latestObservation?.visibleText
    });
    const goalState = inferGoalState(context.goal);
    const altPath = findPath(causalGraph, currentState, goalState);
    if (altPath.length > 0) {
      const pathHint = altPath.map(e => `${e.action}("${e.actionDetail}")`).join(" → ");
      failureReason = `${failureReason} [Causal graph suggests alternative path: ${pathHint}]`;
    }
  }

  // Token budget gate: skip LLM hypothesis generation if budget exhausted
  if (tokenBudget && !canSpendTokens(tokenBudget, "hypothesis", 500)) {
    return `${failureReason} [Token budget exhausted for hypothesis generation]`;
  }
  const hypotheses = await generateFailureHypotheses({
    context,
    task,
    failureReason
  });
  if (tokenBudget) recordTokenSpend(tokenBudget, "hypothesis", 500);
  appendEpisodeEvent(context, {
    taskId: task.id,
    kind: "hypothesize",
    summary: `Generated ${hypotheses.length} recovery hypothesis(es). Top=${hypotheses[0]?.kind ?? "none"}`,
    metadata: {
      topHypothesis: hypotheses[0]?.kind ?? "none",
      topConfidence: hypotheses[0]?.confidence ?? 0
    }
  });

  const experimentResults = await runRecoveryExperiments({
    context,
    task,
    hypotheses
  });
  context.experimentResults ??= [];
  context.experimentResults.push(...experimentResults);
  applyExperimentOutcomes(context, task, experimentResults);
  for (const result of experimentResults) {
    appendEpisodeEvent(context, {
      taskId: task.id,
      kind: "experiment",
      summary: `${result.outcome.toUpperCase()} ${result.experiment}`,
      metadata: {
        hypothesisId: result.hypothesisId,
        confidenceDelta: result.confidenceDelta,
        action: result.performedAction ?? "none"
      }
    });
  }

  const belief = applyBeliefUpdates({
    runId: context.runId,
    taskId: task.id,
    hypotheses,
    experimentResults
  });
  context.beliefUpdates ??= [];
  context.beliefUpdates.push(...belief.beliefUpdates);
  context.hypotheses ??= [];
  context.hypotheses.push(...belief.updatedHypotheses);

  const topHypothesis = belief.updatedHypotheses[0] ?? hypotheses[0];
  if (!topHypothesis) {
    return failureReason;
  }

  appendEpisodeEvent(context, {
    taskId: task.id,
    kind: "recover",
    summary: `Top recovery hypothesis is ${topHypothesis.kind} (${topHypothesis.confidence.toFixed(2)}).`,
    metadata: {
      topHypothesis: topHypothesis.kind,
      topConfidence: topHypothesis.confidence
    }
  });

  // Integration: Counterfactual reasoning (Leap 6) — suggest alternative actions
  if (causalGraph && causalGraph.edges.size > 0 && !process.env.DISABLE_COUNTERFACTUAL) {
    try {
      const currentState = inferCurrentState({
        pageUrl: context.worldState?.pageUrl,
        appState: context.worldState?.appState,
        visibleText: context.latestObservation?.visibleText
      });
      const alternatives = suggestAlternativeActions(causalGraph, currentState, task.type);
      if (alternatives.length > 0) {
        const topAlt = alternatives[0];
        const altHint = alternatives.slice(0, 3).map(a => `${a.action}("${a.detail}") ${(a.successProbability * 100).toFixed(0)}%`).join(", ");
        failureReason = `${failureReason} [Counterfactual alternatives: ${altHint}]`;
        appendEpisodeEvent(context, {
          taskId: task.id,
          kind: "recover",
          summary: `Counterfactual: ${alternatives.length} alternative(s). Top: ${topAlt.action}("${topAlt.detail}") p=${topAlt.successProbability.toFixed(2)}`,
          metadata: { topAlternative: topAlt.action, probability: topAlt.successProbability }
        });
        // FUNCTIONAL: If top alternative has high causal success probability,
        // override the recovery hint to use it instead of the default hypothesis recovery
        if (topAlt.successProbability >= 0.6 && topAlt.detail) {
          topHypothesis.recoveryHint =
            `Counterfactual-driven: use ${topAlt.action}("${topAlt.detail}") instead (causal p=${topAlt.successProbability.toFixed(2)})`;
        }
      }
    } catch { /* counterfactual is optional */ }
  }

  // Integration: Program synthesis recovery (Leap 5) — try LLM-synthesized recovery
  // Token budget gate: skip if recovery budget exhausted or module disabled
  if (process.env.DISABLE_RECOVERY_SYNTHESIS) {
    return `${failureReason} Top hypothesis=${topHypothesis.kind} confidence=${topHypothesis.confidence.toFixed(2)}. ${topHypothesis.recoveryHint}`;
  }
  if (tokenBudget && !canSpendTokens(tokenBudget, "recovery", 1000)) {
    return `${failureReason} Top hypothesis=${topHypothesis.kind} confidence=${topHypothesis.confidence.toFixed(2)}. ${topHypothesis.recoveryHint} [Recovery token budget exhausted]`;
  }
  try {
    const previousAttempts = context.hypotheses
      ?.filter(h => h.taskId === task.id)
      .map(h => h.recoveryHint) ?? [];
    const recoveryProgram = await synthesizeRecovery({
      context, task, error: failureReason, previousAttempts
    });
    if (recoveryProgram) {
      const recoveryTasks = programToTasks(recoveryProgram, task.id);
      if (recoveryTasks.length > 0) {
        appendEpisodeEvent(context, {
          taskId: task.id,
          kind: "recover",
          summary: `Synthesized recovery program: ${recoveryTasks.length} step(s)`,
          metadata: { programId: recoveryProgram.id, steps: recoveryTasks.length }
        });
        // Record for future skill library matching
        (context as unknown as Record<string, unknown>).__pendingRecoveryProgram = recoveryProgram;
      }
    }
  } catch { /* recovery synthesis is optional */ }

  return `${failureReason} Top hypothesis=${topHypothesis.kind} confidence=${topHypothesis.confidence.toFixed(2)}. ${topHypothesis.recoveryHint}`;
}

function applyExperimentOutcomes(
  context: RunContext,
  task: RunContext["tasks"][number],
  experimentResults: NonNullable<RunContext["experimentResults"]>
): void {
  for (const result of experimentResults) {
    if (result.observationPatch) {
      const mergedObservation = materializeObservation({
        runId: context.runId,
        taskId: task.id,
        source: "experiment_refresh",
        pageUrl: result.observationPatch.pageUrl ?? context.latestObservation?.pageUrl ?? context.worldState?.pageUrl,
        title: result.observationPatch.title ?? context.latestObservation?.title,
        visibleText: result.observationPatch.visibleText ?? context.latestObservation?.visibleText,
        actionableElements: context.latestObservation?.actionableElements,
        appStateGuess: result.observationPatch.appStateGuess ?? context.latestObservation?.appStateGuess,
        anomalies: result.observationPatch.anomalies ?? context.latestObservation?.anomalies ?? [],
        confidence: result.observationPatch.confidence ?? context.latestObservation?.confidence ?? 0.55
      });
      context.latestObservation = mergedObservation;
      context.observations ??= [];
      context.observations.push(mergedObservation);
      recordWorldState(context, updateWorldState(context.worldState!, {
        observation: mergedObservation,
        taskType: task.type,
        stateHints: result.stateHints
      }), "experiment_refresh", result.experiment);
    } else if (result.stateHints && result.stateHints.length > 0) {
      recordWorldState(context, updateWorldState(context.worldState!, {
        taskType: task.type,
        stateHints: result.stateHints
      }), "state_update", result.experiment);
    }
  }
}

function recordWorldState(
  context: RunContext,
  state: NonNullable<RunContext["worldState"]>,
  source: NonNullable<NonNullable<RunContext["worldState"]>["source"]>,
  reason: string
): void {
  const snapshot = {
    ...state,
    source,
    reason
  };
  context.worldState = snapshot;
  context.worldStateHistory ??= [];
  context.worldStateHistory.push(snapshot);
}

function applyOnlineAdaptation(
  context: RunContext,
  failedTask: RunContext["tasks"][number],
  adaptation: { strategy: string; reason: string },
  currentIndex: number
): void {
  const strategy = adaptation.strategy;

  // Strategy: switch to visual variant (visual_click, visual_type)
  if (strategy.startsWith("visual_")) {
    const visualType = strategy as AgentTask["type"];
    // Find the next task with the same selector and convert it
    for (let i = currentIndex + 1; i < context.tasks.length; i++) {
      const upcoming = context.tasks[i];
      if (
        upcoming.status === "pending" &&
        upcoming.payload.selector === failedTask.payload.selector &&
        (upcoming.type === "click" || upcoming.type === "type" || upcoming.type === "select")
      ) {
        const originalType = upcoming.type;
        upcoming.type = visualType;
        upcoming.payload.description = upcoming.payload.description ?? upcoming.payload.selector;
        appendEpisodeEvent(context, {
          taskId: upcoming.id,
          kind: "recover",
          summary: `Adapted task from ${originalType} to ${visualType}: ${adaptation.reason}`,
          metadata: { originalType, newType: visualType }
        });
        break;
      }
    }
    return;
  }

  // Strategy: add wait before next task
  if (strategy === "add_wait") {
    const waitTask: AgentTask = {
      id: `${context.runId}-${context.nextTaskSequence}-adaptive_wait`,
      type: "wait",
      status: "pending",
      retries: 0,
      attempts: 0,
      replanDepth: 0,
      payload: { ms: 1000 }
    };
    context.nextTaskSequence += 1;
    context.tasks.splice(currentIndex + 1, 0, waitTask);
    context.insertedTaskCount += 1;
    appendEpisodeEvent(context, {
      taskId: waitTask.id,
      kind: "recover",
      summary: `Inserted adaptive wait: ${adaptation.reason}`,
      metadata: { strategy: "add_wait", waitMs: 1000 }
    });
    return;
  }
}
