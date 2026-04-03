/**
 * Pattern Abstractor — generalizes concrete causal edges into
 * abstract semantic patterns that transfer across domains.
 *
 * Concrete: click(#login-btn) on localhost:3000 → page:/dashboard
 * Abstract: click(auth-trigger) → state:authenticated
 */

export interface AbstractPattern {
  id: string;
  actionCategory: string;      // "auth-trigger", "form-submit", "navigation", "data-entry"
  fromStateCategory: string;   // "unauthenticated", "form-ready", "landing", etc.
  toStateCategory: string;     // "authenticated", "form-submitted", "content-loaded", etc.
  confidence: number;
  sourceCount: number;         // how many concrete edges support this pattern
  examples: string[];          // concrete edge IDs that contributed
}

/**
 * Classify an action detail (selector/URL/description) into a semantic category.
 */
export function classifyAction(action: string, actionDetail: string): string {
  const detail = actionDetail.toLowerCase();
  const act = action.toLowerCase();

  // Auth-related actions
  if (/login|sign.?in|log.?in|auth|submit.*password/i.test(detail)) return "auth-trigger";
  if (/register|sign.?up|create.*account/i.test(detail)) return "registration";
  if (/logout|sign.?out|log.?out/i.test(detail)) return "deauth";

  // Navigation
  if (act === "open_page") return "navigation";
  if (/nav|menu|tab|link|href/i.test(detail)) return "navigation";

  // Form interaction
  if (act === "type" || act === "visual_type") return "data-entry";
  if (act === "select") return "selection";
  if (/submit|save|confirm|ok|apply/i.test(detail)) return "form-submit";

  // Content interaction
  if (/search|filter|sort/i.test(detail)) return "content-filter";
  if (/delete|remove|cancel/i.test(detail)) return "destructive-action";
  if (/download|export/i.test(detail)) return "data-export";
  if (/upload|import/i.test(detail)) return "data-import";

  // Default
  if (act === "click" || act === "visual_click") return "interaction";
  return "unknown";
}

/**
 * Classify a state node ID into a semantic category.
 */
export function classifyState(stateId: string): string {
  const lower = stateId.toLowerCase();

  if (/authenticated|logged.?in|dashboard|welcome|home/i.test(lower)) return "authenticated";
  if (/login|sign.?in|unauthenticated/i.test(lower)) return "unauthenticated";
  if (/error|fail|exception|500|404/i.test(lower)) return "error";
  if (/loading|wait|pending|spinner/i.test(lower)) return "loading";
  if (/form|input|edit|create/i.test(lower)) return "form-ready";
  if (/success|saved|submitted|confirmed/i.test(lower)) return "action-completed";
  if (/list|table|results|search/i.test(lower)) return "content-listing";
  if (/detail|view|profile|settings/i.test(lower)) return "content-detail";

  return "unknown";
}

/**
 * Abstract concrete causal edges into semantic patterns.
 */
export function abstractPatterns(
  edges: Array<{ id: string; fromState: string; toState: string; action: string; actionDetail: string; confidence: number }>
): AbstractPattern[] {
  const patternMap = new Map<string, AbstractPattern>();

  for (const edge of edges) {
    const actionCat = classifyAction(edge.action, edge.actionDetail);
    const fromCat = classifyState(edge.fromState);
    const toCat = classifyState(edge.toState);
    const patternId = `${actionCat}:${fromCat}→${toCat}`;

    const existing = patternMap.get(patternId);
    if (existing) {
      existing.sourceCount += 1;
      existing.confidence = (existing.confidence * (existing.sourceCount - 1) + edge.confidence) / existing.sourceCount;
      if (existing.examples.length < 5) existing.examples.push(edge.id);
    } else {
      patternMap.set(patternId, {
        id: patternId,
        actionCategory: actionCat,
        fromStateCategory: fromCat,
        toStateCategory: toCat,
        confidence: edge.confidence,
        sourceCount: 1,
        examples: [edge.id]
      });
    }
  }

  return Array.from(patternMap.values())
    .sort((a, b) => b.sourceCount - a.sourceCount);
}

/**
 * Find abstract patterns that match a given transition query.
 * Used when concrete graph has no path — fall back to abstract patterns.
 */
export function findAbstractPath(
  patterns: AbstractPattern[],
  fromStateCategory: string,
  toStateCategory: string
): AbstractPattern[] {
  // Direct match
  const direct = patterns.filter(
    p => p.fromStateCategory === fromStateCategory && p.toStateCategory === toStateCategory && p.confidence >= 0.4
  );
  if (direct.length > 0) return direct.sort((a, b) => b.confidence - a.confidence);

  // Two-hop: from → intermediate → to
  const firstHops = patterns.filter(p => p.fromStateCategory === fromStateCategory && p.confidence >= 0.4);
  const results: AbstractPattern[] = [];

  for (const first of firstHops) {
    const secondHops = patterns.filter(
      p => p.fromStateCategory === first.toStateCategory && p.toStateCategory === toStateCategory && p.confidence >= 0.4
    );
    results.push(...secondHops.map(second => ({
      ...second,
      id: `${first.id}+${second.id}`,
      confidence: first.confidence * second.confidence,
      sourceCount: Math.min(first.sourceCount, second.sourceCount)
    })));
  }

  return results.sort((a, b) => b.confidence - a.confidence);
}
