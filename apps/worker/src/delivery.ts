export type DeliveryChannel = "email" | "in_app";
export type DeliveryAttemptStatus = "queued" | "accepted" | "sent" | "failed" | "suppressed";

export type DeliveryAttempt = {
  readonly id: string;
  readonly notificationId: string;
  readonly channel: DeliveryChannel;
  readonly idempotencyKey: string;
  readonly status: DeliveryAttemptStatus;
  readonly providerMessageId: string | null;
  readonly attemptCount: number;
};

export type ProviderMessage = {
  readonly providerMessageId: string;
  readonly acceptedAt: string;
};

export type DeliveryMessage = {
  readonly notificationId: string;
  readonly channel: DeliveryChannel;
  readonly idempotencyKey: string;
  readonly templateCode: string;
};

export interface DeliveryProvider {
  reconcile(idempotencyKey: string): Promise<ProviderMessage | null>;
  send(message: DeliveryMessage): Promise<ProviderMessage>;
}

export interface DeliveryAttemptStore {
  findByIdempotencyKey(idempotencyKey: string): Promise<DeliveryAttempt | null>;
  markAccepted(attemptId: string, receipt: ProviderMessage): Promise<void>;
  markFailed(attemptId: string, errorCode: string): Promise<void>;
}

export type DeliveryResult =
  | { status: "already_recorded"; providerMessageId: string }
  | { status: "reconciled"; providerMessageId: string }
  | { status: "sent"; providerMessageId: string }
  | { status: "failed"; errorCode: string };

export class DeliveryPersistenceError extends Error {
  constructor(message = "DELIVERY_STATE_PERSISTENCE_FAILED") {
    super(message);
    this.name = "DeliveryPersistenceError";
  }
}

export class DeliveryProviderError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "DeliveryProviderError";
    this.code = code;
  }
}

function providerErrorCode(error: unknown): string {
  return error instanceof DeliveryProviderError ? error.code : "DELIVERY_PROVIDER_FAILED";
}

export async function deliverIdempotently(
  attempt: DeliveryAttempt,
  message: DeliveryMessage,
  provider: DeliveryProvider,
  store: DeliveryAttemptStore,
): Promise<DeliveryResult> {
  if (attempt.idempotencyKey !== message.idempotencyKey) {
    throw new DeliveryPersistenceError("DELIVERY_IDEMPOTENCY_KEY_MISMATCH");
  }
  if (attempt.notificationId !== message.notificationId || attempt.channel !== message.channel) {
    throw new DeliveryPersistenceError("DELIVERY_ATTEMPT_BOUNDARY_MISMATCH");
  }
  if (attempt.providerMessageId !== null && (attempt.status === "accepted" || attempt.status === "sent")) {
    return { status: "already_recorded", providerMessageId: attempt.providerMessageId };
  }

  const known = await store.findByIdempotencyKey(message.idempotencyKey);
  if (known !== null && known.providerMessageId !== null && (known.status === "accepted" || known.status === "sent")) {
    return { status: "already_recorded", providerMessageId: known.providerMessageId };
  }

  const reconciled = await provider.reconcile(message.idempotencyKey);
  if (reconciled !== null) {
    try {
      await store.markAccepted(attempt.id, reconciled);
    } catch {
      throw new DeliveryPersistenceError();
    }
    return { status: "reconciled", providerMessageId: reconciled.providerMessageId };
  }

  try {
    const receipt = await provider.send(message);
    try {
      await store.markAccepted(attempt.id, receipt);
    } catch {
      throw new DeliveryPersistenceError();
    }
    return { status: "sent", providerMessageId: receipt.providerMessageId };
  } catch (error: unknown) {
    if (error instanceof DeliveryPersistenceError) throw error;
    const code = providerErrorCode(error);
    await store.markFailed(attempt.id, code);
    return { status: "failed", errorCode: code };
  }
}
