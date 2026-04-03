// Simple in-process counter/gauge store — no external deps.
// Format output as Prometheus text exposition format for scraping.

interface Counter { value: number; help: string }
interface Gauge { value: number; help: string }

const counters = new Map<string, Counter>();
const gauges = new Map<string, Gauge>();

export function registerCounter(name: string, help: string): void {
  if (!counters.has(name)) counters.set(name, { value: 0, help });
}

export function registerGauge(name: string, help: string): void {
  if (!gauges.has(name)) gauges.set(name, { value: 0, help });
}

export function incCounter(name: string, by = 1): void {
  const c = counters.get(name);
  if (c) c.value += by;
}

export function setGauge(name: string, value: number): void {
  const g = gauges.get(name);
  if (g) g.value = value;
}

export function renderPrometheus(): string {
  const lines: string[] = [];
  for (const [name, c] of counters) {
    lines.push(`# HELP ${name} ${c.help}`);
    lines.push(`# TYPE ${name} counter`);
    lines.push(`${name} ${c.value}`);
  }
  for (const [name, g] of gauges) {
    lines.push(`# HELP ${name} ${g.help}`);
    lines.push(`# TYPE ${name} gauge`);
    lines.push(`${name} ${g.value}`);
  }
  return lines.join("\n") + "\n";
}

export function getSnapshot(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of counters) out[k] = v.value;
  for (const [k, v] of gauges) out[k] = v.value;
  return out;
}

// Register standard metrics on module load
registerCounter("agent_runs_total", "Total number of run submissions");
registerCounter("agent_runs_success_total", "Total successful runs");
registerCounter("agent_runs_failed_total", "Total failed runs");
registerCounter("agent_tasks_total", "Total tasks executed");
registerCounter("agent_replans_total", "Total replan events");
registerCounter("agent_llm_calls_total", "Total LLM API calls");
registerGauge("agent_queue_pending", "Jobs waiting in queue");
registerGauge("agent_queue_running", "Jobs currently running");
registerGauge("agent_queue_concurrency", "Queue concurrency limit");
registerCounter("agent_llm_input_tokens_total", "Total LLM input tokens consumed");
registerCounter("agent_llm_output_tokens_total", "Total LLM output tokens consumed");
registerCounter("agent_llm_latency_ms_total", "Total LLM call latency in milliseconds");
