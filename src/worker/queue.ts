export interface JobRequest {
  runId: string;
  goal: string;
  options: Record<string, unknown>;
  submittedAt: string;
}

type JobHandler = (job: JobRequest) => Promise<void>;

export class JobQueue {
  private pending: JobRequest[] = [];
  private handler: JobHandler | null = null;
  private running = 0;
  private readonly concurrency: number;

  constructor(concurrency = 4) {
    this.concurrency = concurrency;
  }

  setHandler(handler: JobHandler): void {
    this.handler = handler;
  }

  enqueue(job: JobRequest): void {
    this.pending.push(job);
    this.drain();
  }

  private drain(): void {
    while (this.running < this.concurrency && this.pending.length > 0 && this.handler) {
      const job = this.pending.shift()!;
      this.running++;
      this.handler(job).finally(() => {
        this.running--;
        this.drain();
      });
    }
  }

  get stats() {
    return { pending: this.pending.length, running: this.running, concurrency: this.concurrency };
  }
}
