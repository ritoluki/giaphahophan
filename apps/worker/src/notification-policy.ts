export type NotificationChannel = "email" | "in_app";

export type NotificationPreference = {
  readonly channel: NotificationChannel;
  readonly eventKind: string;
  readonly enabled: boolean;
  readonly quietStartHour?: number;
  readonly quietEndHour?: number;
  readonly unsubscribed: boolean;
  readonly suppressed: boolean;
};

export type NotificationSendContext = {
  readonly currentLocalHour: number;
  readonly consentAllowed: boolean;
};

export type NotificationPolicyDecision =
  | { status: "send"; channel: NotificationChannel; eventKind: string }
  | { status: "suppress"; reason: "opt_in_required" | "quiet_hours" | "unsubscribed" | "suppressed" | "consent_revoked" };

function isValidHour(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 23;
}

function isQuietHour(current: number, start: number, end: number): boolean {
  if (start === end) return false;
  return start < end ? current >= start && current < end : current >= start || current < end;
}

export function evaluateNotificationPolicy(
  preference: NotificationPreference,
  context: NotificationSendContext,
): NotificationPolicyDecision {
  if (!isValidHour(context.currentLocalHour)) throw new RangeError("current local hour must be between 0 and 23");
  const quietStartHour = preference.quietStartHour ?? 22;
  const quietEndHour = preference.quietEndHour ?? 7;
  if (!isValidHour(quietStartHour) || !isValidHour(quietEndHour)) throw new RangeError("quiet hours must be between 0 and 23");
  if (!context.consentAllowed) return { status: "suppress", reason: "consent_revoked" };
  if (!preference.enabled) return { status: "suppress", reason: "opt_in_required" };
  if (preference.unsubscribed) return { status: "suppress", reason: "unsubscribed" };
  if (preference.suppressed) return { status: "suppress", reason: "suppressed" };
  if (isQuietHour(context.currentLocalHour, quietStartHour, quietEndHour)) return { status: "suppress", reason: "quiet_hours" };
  return { status: "send", channel: preference.channel, eventKind: preference.eventKind };
}
