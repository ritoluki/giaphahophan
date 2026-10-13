# M16-06 proposed media export policy

Status: PROPOSED; owner H3 decision pending. This is a scoped proposal for image/media export, not approval of H3 as a whole, cloud access, real-data use, or release. Text-only exports remain available while this decision is pending.

## Decision requested

1. A designated **reviewer**, scoped to the relevant tree/branch and granted `publication.manage`, records every depicted person and confirms the permitted audience. Privileged review requires MFA and a reviewer different from the uploader/submitter. Reviewer approval does not replace consent or override a refusal.
2. An asset with unidentified subjects, incomplete review, missing/expired/revoked consent, uncertain rights, or an unauthorized audience is **omitted with a generic warning**. The permitted text and other permitted assets can still be exported. The warning reveals no hidden identities, asset IDs, or excluded counts.
3. Review is tied to an immutable asset version and audience. A new image version requires fresh review. The server checks current subjects, rights, consent and scope when creating the job, when rendering, and at download. Revocation invalidates the artifact; it must be recomputed or denied before bytes are released.

## Implementation following this decision

- Add a private, versioned subject-review manifest: asset version/hash, all identified subjects, completeness/ambiguity, reviewer, reviewed audience, review timestamp, and separately referenced consent/rights evidence. Record minimal audit data. An existing asset-person link is not a complete subject manifest.
- The authorization projection includes only eligible media and necessary private derivative references. Serialize a manifest with checksums and bounded file sizes; export permitted sanitized derivatives rather than making original uploads public.
- Apply current session/MFA/capability/membership checks and per-operation worker authority. Reuse the existing private Storage and download checks; never use service-role as a general reading bypass.
- Cover independent review, incomplete/ambiguous subjects, a hidden or protected subject, cross-tree reference, consent expiry/revocation, changed asset version, cancellation, retry/cleanup, and download after permission changes in real local DB/Storage tests with fictional fixtures.
- Mobile UI explains which evidence is missing in plain Vietnamese to authorized reviewers, supports recovery and reload, and uses the existing design tokens/components. No automated face identification or external AI service is introduced.

Basis: `docs/10_AUTH_PERMISSIONS_PRIVACY.md` (current consent/audience and deny-first field policy), `docs/13_MEDIA_CONTENT_PLACES.md` (review every depicted person, private originals and sanitized derivatives), and `docs/11_IMPORT_EXPORT_REAL_DATA.md` (permission-filtered private exports with rechecks and manifests).

Owner response can be: **approve this scoped media policy** or identify the desired change, especially whether an ineligible asset should instead fail the entire export. Until approval, `includeMedia` continues to fail closed.
