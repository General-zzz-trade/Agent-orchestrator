import { Logger } from "./logger";
import { runGoal } from "./core/runtime";

function printUsage(): void {
  console.log("Agent-Orchestrator");
  console.log("");
  console.log("Usage:");
  console.log('  npm run dev -- "<goal>"');
  console.log('  npm start -- "<goal>"');
  console.log("");
  console.log("Example:");
  console.log(
    '  npm run dev -- "start app \\"npm run dev\\" and wait for server \\"http://localhost:3000\\" and open page \\"http://localhost:3000\\" and click \\"text=Login\\" and assert text \\"Dashboard\\" and screenshot and stop app"'
  );
}

async function main(): Promise<void> {
  const [, , ...args] = process.argv;
  const logger = new Logger();
  const goal = args.join(" ").trim();

  if (!goal) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  logger.info(`Goal received: ${goal}`);
  const run = await runGoal(goal);
  const reflection = run.reflection;

  if (run.result?.success) {
    logger.info("Task completed successfully.");
    console.log(run.result.message);
    console.log("");
    console.log("Reflection summary:");
    console.log(reflection?.summary ?? "No reflection available.");
    console.log("Improvement suggestions:");
    for (const suggestion of reflection?.improvementSuggestions ?? []) {
      console.log(`- ${suggestion}`);
    }
    return;
  }

  logger.error("Task failed.");
  console.error(run.result?.message ?? "Task failed.");
  console.error("");
  console.error("Reflection summary:");
  console.error(reflection?.summary ?? "No reflection available.");
  console.error("Improvement suggestions:");
  for (const suggestion of reflection?.improvementSuggestions ?? []) {
    console.error(`- ${suggestion}`);
  }
  process.exitCode = 1;
}

void main();
