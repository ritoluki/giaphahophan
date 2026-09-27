import {

  contentRevisionStatusSchema,
  previewGrantSchema,
  type ContentRevisionStatus,
  type PreviewGrant,
  type RichTextDocument,
} from "@phan/contracts";

export type ContentRevisionRecord = {
  readonly id: string;
  readonly pageId: string;
  readonly version: number;
  readonly status: ContentRevisionStatus;
  readonly createdBy: string;
  readonly approvedBy: string | null;
  readonly title: string;
  readonly body: RichTextDocument;
  readonly publishAt: string | null;
};

export type ContentPageRecord = {
  readonly id: string;
  readonly version: number;
  readonly publishedRevisionId: string | null;
};

export type ContentTransitionCommand = {
  readonly action: "submit" | "approve" | "publish" | "archive";
  readonly actorId: string;
  readonly expectedRevisionVersion: number;
  readonly expectedPageVersion: number | null;
  readonly publishAt: string | null;
};

export type ContentTransitionResult = {
  readonly revision: ContentRevisionRecord;
  readonly page: ContentPageRecord;
  readonly lifecycleStatus: "draft" | "submitted" | "approved" | "scheduled" | "published" | "archived";
};

export type PreviewGrantInput = {
  readonly pageId: string;
  readonly revisionId: string;
  readonly now: string;
  readonly ttlSeconds?: number;
  readonly tokenFactory?: () => string;
};

function instant(value: string): number {
  const result = Date.parse(value);
  if (!Number.isFinite(result)) throw new RangeError("content_datetime_invalid");
  return result;
}

function nextVersion(version: number): number {
  if (!Number.isInteger(version) || version < 1) throw new RangeError("content_version_invalid");
  return version + 1;
}

function lifecycleStatus(revision: ContentRevisionRecord, now: string): ContentTransitionResult["lifecycleStatus"] {
  contentRevisionStatusSchema.parse(revision.status);
  if (revision.status === "approved" && revision.publishAt !== null && instant(revision.publishAt) > instant(now)) return "scheduled";
  return revision.status;
}

export function deriveContentLifecycleStatus(
  revision: ContentRevisionRecord,
  now: string,
): ContentTransitionResult["lifecycleStatus"] {
  return lifecycleStatus(revision, now);
}

export function applyContentRevisionTransition(
  revision: ContentRevisionRecord,
  page: ContentPageRecord,
  command: ContentTransitionCommand,
  now: string,
): ContentTransitionResult {

  if (revision.version !== command.expectedRevisionVersion) throw new Error("content_revision_version_conflict");
  if (command.actorId.trim().length === 0) throw new RangeError("content_actor_required");
  if (command.action === "publish") {
    if (command.expectedPageVersion === null || page.version !== command.expectedPageVersion) throw new Error("content_page_version_conflict");
  }

  const currentNow = instant(now);
  let nextRevision: ContentRevisionRecord;

  if (command.action === "submit") {
    if (revision.status !== "draft") throw new Error("content_transition_invalid");
    nextRevision = { ...revision, status: "submitted", version: nextVersion(revision.version), publishAt: null };
  } else if (command.action === "approve") {
    if (revision.status !== "submitted" || revision.createdBy === command.actorId) throw new Error("content_approval_invalid");
    nextRevision = { ...revision, status: "approved", version: nextVersion(revision.version), approvedBy: command.actorId };
  } else if (command.action === "publish") {
    if (revision.status !== "approved" || revision.approvedBy === null || revision.createdBy === command.actorId) throw new Error("content_publish_invalid");
    const publishAt = command.publishAt;
    if (publishAt !== null) {
      const publishTime = instant(publishAt);
      if (publishTime > currentNow) {
        nextRevision = { ...revision, version: nextVersion(revision.version), publishAt };
        return { revision: nextRevision, page, lifecycleStatus: "scheduled" };
      }
    }
    nextRevision = { ...revision, status: "published", version: nextVersion(revision.version), publishAt: null };
  } else {
    if (revision.status !== "published") throw new Error("content_archive_invalid");
    nextRevision = { ...revision, status: "archived", version: nextVersion(revision.version), publishAt: null };
  }

  const nextPage = command.action === "publish" && nextRevision.status === "published"
    ? { ...page, version: nextVersion(page.version), publishedRevisionId: nextRevision.id }
    : page;

  return {
    revision: nextRevision,
    page: nextPage,
    lifecycleStatus: lifecycleStatus(nextRevision, now),
  };
}

function defaultToken(): string {
  const token = globalThis.crypto?.randomUUID?.();
  if (!token) throw new Error("preview_token_factory_required");
  return token + token;
}

export function issuePreviewGrant(input: PreviewGrantInput): PreviewGrant {
  const ttlSeconds = input.ttlSeconds ?? 900;
  if (!Number.isInteger(ttlSeconds) || ttlSeconds < 60 || ttlSeconds > 3_600) throw new RangeError("preview_ttl_invalid");
  const issuedAt = instant(input.now);
  const token = input.tokenFactory?.() ?? defaultToken();
  if (token.length < 32 || token.length > 256) throw new RangeError("preview_token_invalid");
  const grant = {
    token,
    pageId: input.pageId,
    revisionId: input.revisionId,
    issuedAt: new Date(issuedAt).toISOString(),
    expiresAt: new Date(issuedAt + ttlSeconds * 1_000).toISOString(),
    noIndex: true as const,
  };
  return previewGrantSchema.parse(grant);
}

export function isPreviewGrantUsable(
  grant: PreviewGrant,
  request: { readonly token: string; readonly pageId: string; readonly revisionId: string },
  now: string,
): boolean {
  const current = instant(now);
  return grant.noIndex
    && grant.token === request.token
    && grant.pageId === request.pageId
    && grant.revisionId === request.revisionId
    && current >= instant(grant.issuedAt)
    && current < instant(grant.expiresAt);
}
