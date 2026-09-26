export type OutboxEvent = {
  readonly id: string;
  readonly treeId: string;
  readonly eventType: string;
  readonly resourceId: string | null;
  readonly resourceVersion: number | null;
  readonly dedupeKey: string;
  readonly requestedBy: string | null;
  readonly attempts: number;
  readonly maxAttempts: number;
};

export interface OutboxStore {
  claim(workerId: string, limit: number): Promise<readonly OutboxEvent[]>;
  markPublished(eventId: string, workerId: string): Promise<boolean>;
  markFailed(
    eventId: string,
    workerId: string,
    errorCode: string,
    retryDelaySeconds: number,
  ): Promise<boolean>;
}

export type OutboxHandler = (event: OutboxEvent) => Promise<void>;

export type OutboxDispatcherOptions = {
  readonly claimLimit?: number;
  readonly retryBaseSeconds?: number;
  readonly retryMaxSeconds?: number;
};

export type OutboxProcessResult = {
  readonly claimed: number;
  readonly published: number;
  readonly failed: number;
};

export class OutboxDispatchError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "OutboxDispatchError";
    this.code = code;
  }
}

export function retryDelaySeconds(
  attempt: number,
  baseSeconds = 30,
  maxSeconds = 3_600,
): number {
  const safeAttempt = Math.max(1, Math.floor(attempt));
  const safeBase = Math.max(1, Math.floor(baseSeconds));
  const safeMax = Math.max(safeBase, Math.floor(maxSeconds));
  const exponent = Math.min(safeAttempt - 1, 31);
  return Math.min(safeMax, safeBase * 2 ** exponent);
}

function errorCode(error: unknown): string {
  if (error instanceof OutboxDispatchError) {
    return error.code;
  }

  return "WORKER_HANDLER_FAILED";
}

export class OutboxDispatcher {
  private readonly claimLimit: number;
  private readonly retryBaseSeconds: number;
  private readonly retryMaxSeconds: number;

  constructor(
    private readonly store: OutboxStore,
    private readonly handlers: Readonly<Record<string, OutboxHandler>>,
    private readonly workerId: string,
    options: OutboxDispatcherOptions = {},
  ) {
    this.claimLimit = options.claimLimit ?? 25;
    this.retryBaseSeconds = options.retryBaseSeconds ?? 30;
    this.retryMaxSeconds = options.retryMaxSeconds ?? 3_600;
  }

  async processOnce(): Promise<OutboxProcessResult> {
    const events = await this.store.claim(this.workerId, this.claimLimit);
    let published = 0;
    let failed = 0;

    for (const event of events) {
      try {
        const handler = this.handlers[event.eventType];
        if (handler === undefined) {
          throw new OutboxDispatchError("UNSUPPORTED_EVENT");
        }

        await handler(event);
        if (await this.store.markPublished(event.id, this.workerId)) {
          published += 1;
        }
      } catch (error: unknown) {
        const code = errorCode(error);
        const delay = retryDelaySeconds(
          event.attempts,
          this.retryBaseSeconds,
          this.retryMaxSeconds,
        );
        if (
          await this.store.markFailed(
            event.id,
            this.workerId,
            code,
            delay,
          )
        ) {
          failed += 1;
        }
      }
    }

    return { claimed: events.length, published, failed };
  }
}
