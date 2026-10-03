-- PHAN GIA PHA: SCHEMA BLUEPRINT, NOT A COMPLETE PRODUCTION MIGRATION.

-- Requires Supabase (auth.users, anon/authenticated roles). Run only in disposable local validation.

-- Missing by design: authorization functions, RLS policies, balance/cycle triggers, bootstrap grants.

-- The agent must implement and test these before deploying. No anonymous/table grants are added.

BEGIN;

CREATE SCHEMA IF NOT EXISTS private;

CREATE SCHEMA IF NOT EXISTS api;

CREATE SCHEMA IF NOT EXISTS jobs;

CREATE TABLE private.trees (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  slug text NOT NULL,
  name text NOT NULL,
  data_mode text NOT NULL CHECK (data_mode IN ('demo', 'real')),
  policy_version bigint NOT NULL DEFAULT 1,
  graph_revision bigint NOT NULL DEFAULT 1,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (slug)
);

CREATE TABLE private.branches (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tree_id uuid NOT NULL,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  code text NOT NULL,
  name text NOT NULL,
  parent_branch_id uuid,
  founder_person_id uuid,
  description text,
  visibility text NOT NULL DEFAULT 'restricted' CHECK (visibility IN ('public', 'members', 'restricted')),
  UNIQUE (tree_id, id),
  UNIQUE (tree_id, code),
  CHECK (parent_branch_id IS NULL OR parent_branch_id <> id)
);

CREATE TABLE private.memberships (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tree_id uuid NOT NULL,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  auth_user_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('owner', 'admin', 'reviewer', 'editor', 'member')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'suspended', 'revoked')),
  person_id uuid,
  approved_by uuid,
  UNIQUE (tree_id, id),
  UNIQUE (tree_id, auth_user_id)
);

CREATE TABLE private.capability_grants (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tree_id uuid NOT NULL,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  membership_id uuid NOT NULL,
  capability text NOT NULL,
  branch_id uuid,
  expires_at timestamptz,
  revoked_at timestamptz,
  UNIQUE (tree_id, id)
);

CREATE TABLE private.invitations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tree_id uuid NOT NULL,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  email_hash text NOT NULL,
  email_ciphertext text,
  token_hash text NOT NULL,
  intended_role text NOT NULL,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  revoked_at timestamptz,
  UNIQUE (tree_id, id),
  UNIQUE (token_hash)
);

CREATE TABLE private.person_claims (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tree_id uuid NOT NULL,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  membership_id uuid NOT NULL,
  person_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'withdrawn')),
  reviewed_by uuid,
  reason text,
  UNIQUE (tree_id, id)
);

CREATE TABLE private.persons (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tree_id uuid NOT NULL,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  code text NOT NULL,
  display_name text NOT NULL,
  name_search text NOT NULL,
  recorded_sex text CHECK (recorded_sex IN ('M', 'F', 'X', 'U')),
  life_status text NOT NULL DEFAULT 'unknown' CHECK (life_status IN ('living', 'deceased', 'unknown')),
  visibility text NOT NULL DEFAULT 'restricted' CHECK (visibility IN ('public', 'members', 'restricted')),
  protected_minor boolean NOT NULL DEFAULT false,
  primary_branch_id uuid,
  portrait_asset_id uuid,
  biography text,
  confidence text NOT NULL DEFAULT 'unverified' CHECK (confidence IN ('unverified', 'supported', 'verified', 'disputed')),
  merged_into_id uuid,
  deleted_at timestamptz,
  UNIQUE (tree_id, id),
  UNIQUE (tree_id, code),
  CHECK (merged_into_id IS NULL OR merged_into_id <> id)
);

CREATE TABLE private.person_names (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tree_id uuid NOT NULL,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  person_id uuid NOT NULL,
  name text NOT NULL,
  name_search text NOT NULL,
  kind text NOT NULL,
  is_preferred boolean NOT NULL DEFAULT false,
  UNIQUE (tree_id, id)
);

CREATE TABLE private.person_private (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tree_id uuid NOT NULL,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  person_id uuid NOT NULL,
  contact_ciphertext text,
  key_id text,
  last_verified_at timestamptz,
  UNIQUE (tree_id, id),
  UNIQUE (tree_id, person_id)
);

CREATE TABLE private.person_branches (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tree_id uuid NOT NULL,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  person_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  membership_kind text NOT NULL,
  source_id uuid,
  generation_note text,
  UNIQUE (tree_id, id),
  UNIQUE (tree_id, person_id, branch_id, membership_kind)
);

CREATE TABLE private.unions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tree_id uuid NOT NULL,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  kind text NOT NULL CHECK (kind IN ('marriage', 'partnership', 'unknown')),
  status text NOT NULL DEFAULT 'unknown' CHECK (status IN ('active', 'separated', 'divorced', 'widowed', 'unknown')),
  start_date jsonb,
  end_date jsonb,
  notes text,
  visibility text NOT NULL DEFAULT 'restricted' CHECK (visibility IN ('public', 'members', 'restricted')),
  UNIQUE (tree_id, id)
);

CREATE TABLE private.union_partners (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tree_id uuid NOT NULL,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  union_id uuid NOT NULL,
  person_id uuid NOT NULL,
  role_label text,
  UNIQUE (tree_id, id),
  UNIQUE (tree_id, union_id, person_id)
);

CREATE TABLE private.union_children (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tree_id uuid NOT NULL,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  union_id uuid NOT NULL,
  child_id uuid NOT NULL,
  ordinal integer,
  source_id uuid,
  UNIQUE (tree_id, id),
  UNIQUE (tree_id, union_id, child_id),
  CHECK (ordinal IS NULL OR ordinal > 0)
);

CREATE TABLE private.parent_links (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tree_id uuid NOT NULL,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  parent_id uuid NOT NULL,
  child_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('biological', 'adoptive', 'guardian', 'step')),
  status text NOT NULL CHECK (status IN ('confirmed', 'disputed')),
  ordinal integer,
  source_id uuid NOT NULL,
  deleted_at timestamptz,
  UNIQUE (tree_id, id),
  CHECK (parent_id <> child_id),
  CHECK (ordinal IS NULL OR ordinal > 0)
);

CREATE TABLE private.person_facts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tree_id uuid NOT NULL,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  person_id uuid,
  union_id uuid,
  kind text NOT NULL,
  value_date jsonb,
  value_text text,
  place_id uuid,
  confidence text NOT NULL DEFAULT 'unverified' CHECK (confidence IN ('unverified', 'supported', 'verified', 'disputed')),
  visibility text NOT NULL DEFAULT 'restricted' CHECK (visibility IN ('public', 'members', 'restricted')),
  UNIQUE (tree_id, id),
  CHECK (num_nonnulls(person_id, union_id) = 1)
);

CREATE TABLE private.sources (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tree_id uuid NOT NULL,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  title text NOT NULL,
  kind text NOT NULL,
  provider_name text,
  provenance text,
  recorded_date jsonb,
  original_asset_id uuid,
  visibility text NOT NULL DEFAULT 'restricted' CHECK (visibility IN ('public', 'members', 'restricted')),
  rights_note text,
  UNIQUE (tree_id, id)
);

CREATE TABLE private.citations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tree_id uuid NOT NULL,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  source_id uuid NOT NULL,
  person_id uuid,
  fact_id uuid,
  parent_link_id uuid,
  union_id uuid,
  content_revision_id uuid,
  place_id uuid,
  event_rule_id uuid,
  locator text NOT NULL,
  quoted_text text,
  confidence text,
  UNIQUE (tree_id, id),
  CHECK (num_nonnulls(person_id, fact_id, parent_link_id, union_id, content_revision_id, place_id, event_rule_id) = 1)
);

CREATE TABLE private.media_assets (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tree_id uuid NOT NULL,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  bucket text NOT NULL,
  object_key text NOT NULL,
  sha256 text,
  mime_type text,
  size_bytes bigint NOT NULL DEFAULT 0,
  state text NOT NULL DEFAULT 'requested' CHECK (state IN ('requested', 'uploading', 'uploaded', 'scanning', 'processing', 'ready', 'rejected', 'failed', 'quarantined')),
  visibility text NOT NULL DEFAULT 'restricted' CHECK (visibility IN ('public', 'members', 'restricted')),
  alt_text text,
  derivatives jsonb NOT NULL DEFAULT '[]'::jsonb,
  deleted_at timestamptz,
  UNIQUE (tree_id, id),
  UNIQUE (bucket, object_key),
  CHECK (size_bytes >= 0)
);

CREATE TABLE private.media_links (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tree_id uuid NOT NULL,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  asset_id uuid NOT NULL,
  person_id uuid,
  source_id uuid,
  content_revision_id uuid,
  place_id uuid,
  event_rule_id uuid,
  caption text,
  UNIQUE (tree_id, id),
  CHECK (num_nonnulls(person_id, source_id, content_revision_id, place_id, event_rule_id) = 1)
);

CREATE TABLE private.albums (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tree_id uuid NOT NULL,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  title text NOT NULL,
  description text,
  visibility text NOT NULL DEFAULT 'restricted' CHECK (visibility IN ('public', 'members', 'restricted')),
  UNIQUE (tree_id, id)
);

CREATE TABLE private.album_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tree_id uuid NOT NULL,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  album_id uuid NOT NULL,
  asset_id uuid NOT NULL,
  ordinal integer NOT NULL DEFAULT 1,
  UNIQUE (tree_id, id),
  UNIQUE (tree_id, album_id, asset_id)
);

CREATE TABLE private.content_pages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tree_id uuid NOT NULL,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  slug text NOT NULL,
  kind text NOT NULL,
  published_revision_id uuid,
  visibility text NOT NULL DEFAULT 'restricted' CHECK (visibility IN ('public', 'members', 'restricted')),
  UNIQUE (tree_id, id),
  UNIQUE (tree_id, slug)
);

CREATE TABLE private.content_revisions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tree_id uuid NOT NULL,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  page_id uuid NOT NULL,
  title text NOT NULL,
  body jsonb NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved', 'published', 'archived')),
  approved_by uuid,
  publish_at timestamptz,
  UNIQUE (tree_id, id)
);

CREATE TABLE private.publications (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tree_id uuid NOT NULL,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  revision_id uuid NOT NULL,
  projection jsonb NOT NULL,
  policy_version bigint NOT NULL,
  revoked_at timestamptz,
  UNIQUE (tree_id, id)
);

CREATE TABLE private.places (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tree_id uuid NOT NULL,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  name text NOT NULL,
  kind text NOT NULL,
  address_text text,
  latitude numeric(10,7),
  longitude numeric(10,7),
  visibility text NOT NULL DEFAULT 'restricted' CHECK (visibility IN ('public', 'members', 'restricted')),
  coordinate_visibility text NOT NULL DEFAULT 'restricted' CHECK (coordinate_visibility IN ('public', 'members', 'restricted')),
  UNIQUE (tree_id, id),
  CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180)
);

CREATE TABLE private.burial_records (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tree_id uuid NOT NULL,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  person_id uuid NOT NULL,
  place_id uuid NOT NULL,
  locator text,
  source_id uuid,
  visibility text NOT NULL DEFAULT 'restricted' CHECK (visibility IN ('public', 'members', 'restricted')),
  UNIQUE (tree_id, id)
);

CREATE TABLE private.event_rules (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tree_id uuid NOT NULL,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  title text NOT NULL,
  kind text NOT NULL,
  person_id uuid,
  source_date jsonb NOT NULL,
  recurrence text NOT NULL CHECK (recurrence IN ('once', 'annual_lunar', 'annual_solar')),
  leap_policy text NOT NULL DEFAULT 'regular_only' CHECK (leap_policy IN ('regular_only', 'leap_only_skip', 'prefer_leap_else_regular', 'both_if_exists')),
  short_month_policy text NOT NULL DEFAULT 'last_day' CHECK (short_month_policy IN ('last_day', 'next_month_first', 'skip', 'manual_override')),
  timezone text NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
  review_status text NOT NULL DEFAULT 'needs_review' CHECK (review_status IN ('needs_review', 'approved', 'cancelled')),
  place_id uuid,
  visibility text NOT NULL DEFAULT 'members' CHECK (visibility IN ('public', 'members', 'restricted')),
  UNIQUE (tree_id, id)
);

CREATE TABLE private.event_occurrences (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tree_id uuid NOT NULL,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  rule_id uuid NOT NULL,
  logical_key text NOT NULL,
  rule_version bigint NOT NULL,
  algorithm_version text NOT NULL,
  occurs_on date NOT NULL,
  starts_at timestamptz,
  ends_at timestamptz,
  override_reason text,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'cancelled', 'completed')),
  UNIQUE (tree_id, id),
  UNIQUE (tree_id, rule_id, logical_key)
);

CREATE TABLE private.event_rsvps (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tree_id uuid NOT NULL,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  occurrence_id uuid NOT NULL,
  membership_id uuid NOT NULL,
  response text NOT NULL CHECK (response IN ('yes', 'no', 'maybe')),
  headcount integer NOT NULL DEFAULT 1,
  note text,
  UNIQUE (tree_id, id),
  UNIQUE (tree_id, occurrence_id, membership_id),
  CHECK (headcount BETWEEN 0 AND 20)
);

CREATE TABLE private.proposals (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tree_id uuid NOT NULL,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  kind text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'needs_info', 'approved', 'rejected', 'withdrawn')),
  submitted_by uuid NOT NULL,
  branch_id uuid,
  reason text,
  base_snapshot_hash text,
  submitted_at timestamptz,
  UNIQUE (tree_id, id)
);

CREATE TABLE private.proposal_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tree_id uuid NOT NULL,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  proposal_id uuid NOT NULL,
  target_kind text NOT NULL,
  target_id uuid,
  base_version bigint,
  patch jsonb NOT NULL,
  source_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  UNIQUE (tree_id, id)
);

CREATE TABLE private.review_decisions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tree_id uuid NOT NULL,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  proposal_id uuid NOT NULL,
  reviewer_id uuid NOT NULL,
  decision text NOT NULL CHECK (decision IN ('approve', 'reject', 'needs_info')),
  reason text,
  applied_version bigint,
  UNIQUE (tree_id, id)
);

CREATE TABLE private.audit_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tree_id uuid NOT NULL,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  actor_id uuid,
  action text NOT NULL,
  resource_kind text NOT NULL,
  resource_id uuid,
  before_version bigint,
  after_version bigint,
  redacted_diff jsonb,
  request_id uuid,
  reason text,
  UNIQUE (tree_id, id)
);

CREATE TABLE private.import_jobs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tree_id uuid NOT NULL,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  source_asset_id uuid NOT NULL,
  file_sha256 text NOT NULL,
  mapping_version text NOT NULL,
  parser_version text NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'parsing', 'needs_review', 'ready', 'applying', 'partially_applied', 'completed', 'failed', 'cancelled')),
  approval_hash text,
  approval_id uuid,
  counters jsonb NOT NULL DEFAULT '{}'::jsonb,
  manifest jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (tree_id, id),
  UNIQUE (tree_id, file_sha256, mapping_version)
);

CREATE TABLE private.import_rows (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tree_id uuid NOT NULL,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  job_id uuid NOT NULL,
  row_number integer NOT NULL,
  external_id text,
  raw_payload jsonb,
  normalized jsonb,
  status text NOT NULL,
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  UNIQUE (tree_id, id),
  UNIQUE (tree_id, job_id, row_number)
);

CREATE TABLE private.external_id_map (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tree_id uuid NOT NULL,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  source_namespace text NOT NULL,
  external_id text NOT NULL,
  entity_kind text NOT NULL,
  canonical_id uuid NOT NULL,
  UNIQUE (tree_id, id),
  UNIQUE (tree_id, source_namespace, external_id, entity_kind)
);

CREATE TABLE private.merge_operations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tree_id uuid NOT NULL,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  survivor_id uuid NOT NULL,
  loser_id uuid NOT NULL,
  proposal_id uuid NOT NULL,
  manifest jsonb NOT NULL,
  status text NOT NULL,
  compensated_by_id uuid,
  UNIQUE (tree_id, id),
  CHECK (survivor_id <> loser_id)
);

CREATE TABLE private.notification_preferences (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tree_id uuid NOT NULL,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  membership_id uuid NOT NULL,
  channel text NOT NULL,
  event_kind text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (tree_id, id),
  UNIQUE (tree_id, membership_id, channel, event_kind)
);

CREATE TABLE private.notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tree_id uuid NOT NULL,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  membership_id uuid NOT NULL,
  kind text NOT NULL,
  resource_kind text NOT NULL,
  resource_id uuid NOT NULL,
  dedupe_key text NOT NULL,
  read_at timestamptz,
  expires_at timestamptz,
  UNIQUE (tree_id, id),
  UNIQUE (tree_id, membership_id, dedupe_key)
);

CREATE TABLE private.delivery_attempts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tree_id uuid NOT NULL,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  notification_id uuid NOT NULL,
  channel text NOT NULL,
  status text NOT NULL,
  provider_message_id text,
  idempotency_key text NOT NULL,
  attempt_count integer NOT NULL DEFAULT 0,
  last_error_code text,
  UNIQUE (tree_id, id)
);

CREATE TABLE private.outbox (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tree_id uuid NOT NULL,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  event_type text NOT NULL,
  resource_kind text NOT NULL,
  resource_id uuid NOT NULL,
  resource_version bigint,
  dedupe_key text NOT NULL,
  requested_by uuid,
  status text NOT NULL DEFAULT 'pending',
  available_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tree_id, id),
  UNIQUE (tree_id, dedupe_key)
);

CREATE TABLE private.funds (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tree_id uuid NOT NULL,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  name text NOT NULL,
  currency text NOT NULL DEFAULT 'VND' CHECK (currency IN ('VND')),
  closed_through date,
  visibility text NOT NULL DEFAULT 'members' CHECK (visibility IN ('public', 'members', 'restricted')),
  UNIQUE (tree_id, id)
);

CREATE TABLE private.fund_accounts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tree_id uuid NOT NULL,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  fund_id uuid NOT NULL,
  code text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('asset', 'income', 'expense', 'equity')),
  name text NOT NULL,
  UNIQUE (tree_id, id),
  UNIQUE (tree_id, fund_id, code),
  UNIQUE (tree_id, fund_id, id)
);

CREATE TABLE private.journal_entries (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tree_id uuid NOT NULL,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  fund_id uuid NOT NULL,
  code text NOT NULL,
  entry_date date NOT NULL,
  description text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'posted', 'rejected')),
  submitted_by uuid NOT NULL,
  approved_by uuid,
  posted_at timestamptz,
  reverses_entry_id uuid,
  proof_asset_id uuid,
  donor_person_id uuid,
  UNIQUE (tree_id, id),
  UNIQUE (tree_id, code),
  UNIQUE (tree_id, fund_id, id),
  CHECK (approved_by IS NULL OR approved_by <> submitted_by),
  CHECK (reverses_entry_id IS NULL OR reverses_entry_id <> id)
);

CREATE TABLE private.journal_lines (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tree_id uuid NOT NULL,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  fund_id uuid NOT NULL,
  entry_id uuid NOT NULL,
  account_id uuid NOT NULL,
  signed_amount_vnd bigint NOT NULL,
  UNIQUE (tree_id, id),
  CHECK (signed_amount_vnd <> 0)
);

CREATE TABLE private.scholarship_programs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tree_id uuid NOT NULL,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  fund_id uuid NOT NULL,
  title text NOT NULL,
  criteria jsonb NOT NULL,
  closes_at timestamptz,
  status text NOT NULL,
  UNIQUE (tree_id, id)
);

CREATE TABLE private.scholarship_applications (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tree_id uuid NOT NULL,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  program_id uuid NOT NULL,
  person_id uuid NOT NULL,
  submitted_by uuid NOT NULL,
  status text NOT NULL,
  statement text,
  evidence_asset_id uuid,
  UNIQUE (tree_id, id),
  UNIQUE (tree_id, program_id, person_id)
);

CREATE TABLE private.scholarship_awards (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tree_id uuid NOT NULL,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  application_id uuid NOT NULL,
  amount_vnd bigint NOT NULL,
  approved_by uuid NOT NULL,
  paid_journal_entry_id uuid,
  status text NOT NULL,
  UNIQUE (tree_id, id),
  UNIQUE (tree_id, application_id),
  CHECK (amount_vnd > 0)
);

CREATE TABLE private.consent_records (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tree_id uuid NOT NULL,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  person_id uuid NOT NULL,
  audience text NOT NULL CHECK (audience IN ('public', 'members', 'restricted')),
  field_groups jsonb NOT NULL,
  purpose text NOT NULL,
  evidence_asset_id uuid,
  representative_person_id uuid,
  effective_at timestamptz NOT NULL,
  expires_at timestamptz,
  withdrawn_at timestamptz,
  UNIQUE (tree_id, id)
);

CREATE TABLE private.privacy_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tree_id uuid NOT NULL,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  person_id uuid,
  kind text NOT NULL,
  status text NOT NULL,
  verification_state text NOT NULL,
  manifest jsonb NOT NULL DEFAULT '{}'::jsonb,
  completed_at timestamptz,
  UNIQUE (tree_id, id)
);

CREATE TABLE private.export_jobs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tree_id uuid NOT NULL,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  requested_by uuid NOT NULL,
  format text NOT NULL,
  scope jsonb NOT NULL,
  policy_version bigint NOT NULL,
  status text NOT NULL,
  result_asset_id uuid,
  expires_at timestamptz NOT NULL,
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  UNIQUE (tree_id, id)
);

CREATE TABLE private.retention_jobs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tree_id uuid NOT NULL,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  policy_id text NOT NULL,
  cutoff_at timestamptz NOT NULL,
  manifest jsonb NOT NULL,
  status text NOT NULL,
  approved_by uuid,
  UNIQUE (tree_id, id)
);

CREATE TABLE private.idempotency_records (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tree_id uuid NOT NULL,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  actor_id uuid NOT NULL,
  operation text NOT NULL,
  key text NOT NULL,
  request_hash text NOT NULL,
  result jsonb,
  expires_at timestamptz NOT NULL,
  UNIQUE (tree_id, id),
  UNIQUE (tree_id, actor_id, operation, key)
);

ALTER TABLE private.trees ADD CONSTRAINT fk_e148fdbca23a8aaf FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE private.trees ENABLE ROW LEVEL SECURITY;

ALTER TABLE private.branches ADD CONSTRAINT fk_6ca5e3c5882121bd FOREIGN KEY (tree_id) REFERENCES private.trees(id);

ALTER TABLE private.branches ADD CONSTRAINT fk_a0ee1ecbe682c7b7 FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE private.branches ADD CONSTRAINT fk_dccc579584c5c9f9 FOREIGN KEY (tree_id, parent_branch_id) REFERENCES private.branches(tree_id, id);

ALTER TABLE private.branches ADD CONSTRAINT fk_42e34b5e07b01b68 FOREIGN KEY (tree_id, founder_person_id) REFERENCES private.persons(tree_id, id);

ALTER TABLE private.branches ENABLE ROW LEVEL SECURITY;

CREATE INDEX ix_branches_tree ON private.branches(tree_id);

ALTER TABLE private.memberships ADD CONSTRAINT fk_d568312160799731 FOREIGN KEY (tree_id) REFERENCES private.trees(id);

ALTER TABLE private.memberships ADD CONSTRAINT fk_ec17123771f27b69 FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE private.memberships ADD CONSTRAINT fk_8646b065e0dd24ba FOREIGN KEY (auth_user_id) REFERENCES auth.users(id);

ALTER TABLE private.memberships ADD CONSTRAINT fk_4c35ee9e7c1dbcb3 FOREIGN KEY (tree_id, person_id) REFERENCES private.persons(tree_id, id);

ALTER TABLE private.memberships ADD CONSTRAINT fk_1453885f717eb7d2 FOREIGN KEY (approved_by) REFERENCES auth.users(id);

ALTER TABLE private.memberships ENABLE ROW LEVEL SECURITY;

CREATE INDEX ix_memberships_tree ON private.memberships(tree_id);

ALTER TABLE private.capability_grants ADD CONSTRAINT fk_ca4c0b19e4c0329f FOREIGN KEY (tree_id) REFERENCES private.trees(id);

ALTER TABLE private.capability_grants ADD CONSTRAINT fk_c9f60cb6ba361777 FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE private.capability_grants ADD CONSTRAINT fk_9c1492e06dcf6647 FOREIGN KEY (tree_id, membership_id) REFERENCES private.memberships(tree_id, id);

ALTER TABLE private.capability_grants ADD CONSTRAINT fk_2f286175f5dd6270 FOREIGN KEY (tree_id, branch_id) REFERENCES private.branches(tree_id, id);

ALTER TABLE private.capability_grants ENABLE ROW LEVEL SECURITY;

CREATE INDEX ix_capability_grants_tree ON private.capability_grants(tree_id);

ALTER TABLE private.invitations ADD CONSTRAINT fk_abfd25f6307a5c25 FOREIGN KEY (tree_id) REFERENCES private.trees(id);

ALTER TABLE private.invitations ADD CONSTRAINT fk_a59d2c92b0044dba FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE private.invitations ENABLE ROW LEVEL SECURITY;

CREATE INDEX ix_invitations_tree ON private.invitations(tree_id);

ALTER TABLE private.person_claims ADD CONSTRAINT fk_47e2f3227c880f38 FOREIGN KEY (tree_id) REFERENCES private.trees(id);

ALTER TABLE private.person_claims ADD CONSTRAINT fk_8ca837f8b9462287 FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE private.person_claims ADD CONSTRAINT fk_3af804fd0759d7ec FOREIGN KEY (tree_id, membership_id) REFERENCES private.memberships(tree_id, id);

ALTER TABLE private.person_claims ADD CONSTRAINT fk_d7c15cbad99cca41 FOREIGN KEY (tree_id, person_id) REFERENCES private.persons(tree_id, id);

ALTER TABLE private.person_claims ADD CONSTRAINT fk_81f99b28c5ffdf18 FOREIGN KEY (reviewed_by) REFERENCES auth.users(id);

ALTER TABLE private.person_claims ENABLE ROW LEVEL SECURITY;

CREATE INDEX ix_person_claims_tree ON private.person_claims(tree_id);

ALTER TABLE private.persons ADD CONSTRAINT fk_61bb15787c9c1ab8 FOREIGN KEY (tree_id) REFERENCES private.trees(id);

ALTER TABLE private.persons ADD CONSTRAINT fk_3e1fd4921ac5e236 FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE private.persons ADD CONSTRAINT fk_e0e4a168138c3c0e FOREIGN KEY (tree_id, primary_branch_id) REFERENCES private.branches(tree_id, id);

ALTER TABLE private.persons ADD CONSTRAINT fk_edebe323525c71b5 FOREIGN KEY (tree_id, portrait_asset_id) REFERENCES private.media_assets(tree_id, id);

ALTER TABLE private.persons ADD CONSTRAINT fk_0350a8c6b25d4bef FOREIGN KEY (tree_id, merged_into_id) REFERENCES private.persons(tree_id, id);

ALTER TABLE private.persons ENABLE ROW LEVEL SECURITY;

CREATE INDEX ix_persons_tree ON private.persons(tree_id);

ALTER TABLE private.person_names ADD CONSTRAINT fk_8ca58a7bf6486828 FOREIGN KEY (tree_id) REFERENCES private.trees(id);

ALTER TABLE private.person_names ADD CONSTRAINT fk_82168bb06582fee9 FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE private.person_names ADD CONSTRAINT fk_35a63abece8ddc7d FOREIGN KEY (tree_id, person_id) REFERENCES private.persons(tree_id, id);

ALTER TABLE private.person_names ENABLE ROW LEVEL SECURITY;

CREATE INDEX ix_person_names_tree ON private.person_names(tree_id);

ALTER TABLE private.person_private ADD CONSTRAINT fk_2f20aef1c16c7ed0 FOREIGN KEY (tree_id) REFERENCES private.trees(id);

ALTER TABLE private.person_private ADD CONSTRAINT fk_2798f783c4ea7501 FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE private.person_private ADD CONSTRAINT fk_f11017b7d93cdb0d FOREIGN KEY (tree_id, person_id) REFERENCES private.persons(tree_id, id);

ALTER TABLE private.person_private ENABLE ROW LEVEL SECURITY;

CREATE INDEX ix_person_private_tree ON private.person_private(tree_id);

ALTER TABLE private.person_branches ADD CONSTRAINT fk_7543bce1384f778c FOREIGN KEY (tree_id) REFERENCES private.trees(id);

ALTER TABLE private.person_branches ADD CONSTRAINT fk_30b13e2bd7a5daae FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE private.person_branches ADD CONSTRAINT fk_35cd0a85a91be0b6 FOREIGN KEY (tree_id, person_id) REFERENCES private.persons(tree_id, id);

ALTER TABLE private.person_branches ADD CONSTRAINT fk_bcd481ef97053972 FOREIGN KEY (tree_id, branch_id) REFERENCES private.branches(tree_id, id);

ALTER TABLE private.person_branches ADD CONSTRAINT fk_468bf61e1d9432e3 FOREIGN KEY (tree_id, source_id) REFERENCES private.sources(tree_id, id);

ALTER TABLE private.person_branches ENABLE ROW LEVEL SECURITY;

CREATE INDEX ix_person_branches_tree ON private.person_branches(tree_id);

ALTER TABLE private.unions ADD CONSTRAINT fk_7f87589988f9b6ad FOREIGN KEY (tree_id) REFERENCES private.trees(id);

ALTER TABLE private.unions ADD CONSTRAINT fk_db78f5dd6fcdf582 FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE private.unions ENABLE ROW LEVEL SECURITY;

CREATE INDEX ix_unions_tree ON private.unions(tree_id);

ALTER TABLE private.union_partners ADD CONSTRAINT fk_2e5203797789fdb8 FOREIGN KEY (tree_id) REFERENCES private.trees(id);

ALTER TABLE private.union_partners ADD CONSTRAINT fk_d4712528ab7a7f43 FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE private.union_partners ADD CONSTRAINT fk_fb92b031d82c5962 FOREIGN KEY (tree_id, union_id) REFERENCES private.unions(tree_id, id);

ALTER TABLE private.union_partners ADD CONSTRAINT fk_6f3aecabd8bff0c5 FOREIGN KEY (tree_id, person_id) REFERENCES private.persons(tree_id, id);

ALTER TABLE private.union_partners ENABLE ROW LEVEL SECURITY;

CREATE INDEX ix_union_partners_tree ON private.union_partners(tree_id);

ALTER TABLE private.union_children ADD CONSTRAINT fk_7d1f8f0d5de1e250 FOREIGN KEY (tree_id) REFERENCES private.trees(id);

ALTER TABLE private.union_children ADD CONSTRAINT fk_a87c55d7fc15407a FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE private.union_children ADD CONSTRAINT fk_4b2c109475a50e83 FOREIGN KEY (tree_id, union_id) REFERENCES private.unions(tree_id, id);

ALTER TABLE private.union_children ADD CONSTRAINT fk_33114219f584ca4c FOREIGN KEY (tree_id, child_id) REFERENCES private.persons(tree_id, id);

ALTER TABLE private.union_children ADD CONSTRAINT fk_43ceb2c49a8e3abf FOREIGN KEY (tree_id, source_id) REFERENCES private.sources(tree_id, id);

ALTER TABLE private.union_children ENABLE ROW LEVEL SECURITY;

CREATE INDEX ix_union_children_tree ON private.union_children(tree_id);

ALTER TABLE private.parent_links ADD CONSTRAINT fk_a03031a417ad2918 FOREIGN KEY (tree_id) REFERENCES private.trees(id);

ALTER TABLE private.parent_links ADD CONSTRAINT fk_5dd1acd00f647f62 FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE private.parent_links ADD CONSTRAINT fk_cf65143fbf2e316e FOREIGN KEY (tree_id, parent_id) REFERENCES private.persons(tree_id, id);

ALTER TABLE private.parent_links ADD CONSTRAINT fk_90fc0d85ffb14716 FOREIGN KEY (tree_id, child_id) REFERENCES private.persons(tree_id, id);

ALTER TABLE private.parent_links ADD CONSTRAINT fk_b5a90400dcb0161b FOREIGN KEY (tree_id, source_id) REFERENCES private.sources(tree_id, id);

ALTER TABLE private.parent_links ENABLE ROW LEVEL SECURITY;

CREATE INDEX ix_parent_links_tree ON private.parent_links(tree_id);

ALTER TABLE private.person_facts ADD CONSTRAINT fk_b62d7cafb55cc80d FOREIGN KEY (tree_id) REFERENCES private.trees(id);

ALTER TABLE private.person_facts ADD CONSTRAINT fk_742a3fe83b6c48c9 FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE private.person_facts ADD CONSTRAINT fk_a80955a8066c92bf FOREIGN KEY (tree_id, person_id) REFERENCES private.persons(tree_id, id);

ALTER TABLE private.person_facts ADD CONSTRAINT fk_c4436a782ca861ab FOREIGN KEY (tree_id, union_id) REFERENCES private.unions(tree_id, id);

ALTER TABLE private.person_facts ADD CONSTRAINT fk_3bc3add7d566bceb FOREIGN KEY (tree_id, place_id) REFERENCES private.places(tree_id, id);

ALTER TABLE private.person_facts ENABLE ROW LEVEL SECURITY;

CREATE INDEX ix_person_facts_tree ON private.person_facts(tree_id);

ALTER TABLE private.sources ADD CONSTRAINT fk_5e9d1a7c2edf7f90 FOREIGN KEY (tree_id) REFERENCES private.trees(id);

ALTER TABLE private.sources ADD CONSTRAINT fk_3edcdb86e7690eff FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE private.sources ADD CONSTRAINT fk_f91a0796eecdd5a0 FOREIGN KEY (tree_id, original_asset_id) REFERENCES private.media_assets(tree_id, id);

ALTER TABLE private.sources ENABLE ROW LEVEL SECURITY;

CREATE INDEX ix_sources_tree ON private.sources(tree_id);

ALTER TABLE private.citations ADD CONSTRAINT fk_6786ecef5da3a37b FOREIGN KEY (tree_id) REFERENCES private.trees(id);

ALTER TABLE private.citations ADD CONSTRAINT fk_c13511754be972b0 FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE private.citations ADD CONSTRAINT fk_be9120afee2d471e FOREIGN KEY (tree_id, source_id) REFERENCES private.sources(tree_id, id);

ALTER TABLE private.citations ADD CONSTRAINT fk_418c594b1df80bf0 FOREIGN KEY (tree_id, person_id) REFERENCES private.persons(tree_id, id);

ALTER TABLE private.citations ADD CONSTRAINT fk_93727133e1efbdad FOREIGN KEY (tree_id, fact_id) REFERENCES private.person_facts(tree_id, id);

ALTER TABLE private.citations ADD CONSTRAINT fk_9dc9ce65ca84c7e3 FOREIGN KEY (tree_id, parent_link_id) REFERENCES private.parent_links(tree_id, id);

ALTER TABLE private.citations ADD CONSTRAINT fk_73e88e3a0c8c806b FOREIGN KEY (tree_id, union_id) REFERENCES private.unions(tree_id, id);

ALTER TABLE private.citations ADD CONSTRAINT fk_98ba9660f9643ecb FOREIGN KEY (tree_id, content_revision_id) REFERENCES private.content_revisions(tree_id, id);

ALTER TABLE private.citations ADD CONSTRAINT fk_0c007a3bbb603ee3 FOREIGN KEY (tree_id, place_id) REFERENCES private.places(tree_id, id);

ALTER TABLE private.citations ADD CONSTRAINT fk_9e4408b9ec757033 FOREIGN KEY (tree_id, event_rule_id) REFERENCES private.event_rules(tree_id, id);

ALTER TABLE private.citations ENABLE ROW LEVEL SECURITY;

CREATE INDEX ix_citations_tree ON private.citations(tree_id);

ALTER TABLE private.media_assets ADD CONSTRAINT fk_b0eab045d039c888 FOREIGN KEY (tree_id) REFERENCES private.trees(id);

ALTER TABLE private.media_assets ADD CONSTRAINT fk_8c43acc499598983 FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE private.media_assets ENABLE ROW LEVEL SECURITY;

CREATE INDEX ix_media_assets_tree ON private.media_assets(tree_id);

ALTER TABLE private.media_links ADD CONSTRAINT fk_a330012ecd3fbe26 FOREIGN KEY (tree_id) REFERENCES private.trees(id);

ALTER TABLE private.media_links ADD CONSTRAINT fk_664779301cc67fac FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE private.media_links ADD CONSTRAINT fk_ac9e4c46896d3381 FOREIGN KEY (tree_id, asset_id) REFERENCES private.media_assets(tree_id, id);

ALTER TABLE private.media_links ADD CONSTRAINT fk_63fe3f71004fa930 FOREIGN KEY (tree_id, person_id) REFERENCES private.persons(tree_id, id);

ALTER TABLE private.media_links ADD CONSTRAINT fk_32be3d2433c6042a FOREIGN KEY (tree_id, source_id) REFERENCES private.sources(tree_id, id);

ALTER TABLE private.media_links ADD CONSTRAINT fk_51043f7f8f0d11b3 FOREIGN KEY (tree_id, content_revision_id) REFERENCES private.content_revisions(tree_id, id);

ALTER TABLE private.media_links ADD CONSTRAINT fk_b95ae9916b16e6ec FOREIGN KEY (tree_id, place_id) REFERENCES private.places(tree_id, id);

ALTER TABLE private.media_links ADD CONSTRAINT fk_7a59548e53fbac78 FOREIGN KEY (tree_id, event_rule_id) REFERENCES private.event_rules(tree_id, id);

ALTER TABLE private.media_links ENABLE ROW LEVEL SECURITY;

CREATE INDEX ix_media_links_tree ON private.media_links(tree_id);

ALTER TABLE private.albums ADD CONSTRAINT fk_3da9979b788eae24 FOREIGN KEY (tree_id) REFERENCES private.trees(id);

ALTER TABLE private.albums ADD CONSTRAINT fk_cf5afdb02a94e339 FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE private.albums ENABLE ROW LEVEL SECURITY;

CREATE INDEX ix_albums_tree ON private.albums(tree_id);

ALTER TABLE private.album_items ADD CONSTRAINT fk_b5a02fa8fa6a0b58 FOREIGN KEY (tree_id) REFERENCES private.trees(id);

ALTER TABLE private.album_items ADD CONSTRAINT fk_d6987d48839191b1 FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE private.album_items ADD CONSTRAINT fk_bbe6d07e82440881 FOREIGN KEY (tree_id, album_id) REFERENCES private.albums(tree_id, id);

ALTER TABLE private.album_items ADD CONSTRAINT fk_a887d5e93b6bc7fa FOREIGN KEY (tree_id, asset_id) REFERENCES private.media_assets(tree_id, id);

ALTER TABLE private.album_items ENABLE ROW LEVEL SECURITY;

CREATE INDEX ix_album_items_tree ON private.album_items(tree_id);

ALTER TABLE private.content_pages ADD CONSTRAINT fk_9d9b8a6d76a98ce8 FOREIGN KEY (tree_id) REFERENCES private.trees(id);

ALTER TABLE private.content_pages ADD CONSTRAINT fk_ec487bb7a10f497e FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE private.content_pages ADD CONSTRAINT fk_c8aeb7b5f644d0bd FOREIGN KEY (tree_id, published_revision_id) REFERENCES private.content_revisions(tree_id, id);

ALTER TABLE private.content_pages ENABLE ROW LEVEL SECURITY;

CREATE INDEX ix_content_pages_tree ON private.content_pages(tree_id);

ALTER TABLE private.content_revisions ADD CONSTRAINT fk_65b806cd21d0d73d FOREIGN KEY (tree_id) REFERENCES private.trees(id);

ALTER TABLE private.content_revisions ADD CONSTRAINT fk_bab5a270aa44d9f1 FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE private.content_revisions ADD CONSTRAINT fk_f46a14af13abb28d FOREIGN KEY (tree_id, page_id) REFERENCES private.content_pages(tree_id, id);

ALTER TABLE private.content_revisions ADD CONSTRAINT fk_6fc823196c44b148 FOREIGN KEY (approved_by) REFERENCES auth.users(id);

ALTER TABLE private.content_revisions ENABLE ROW LEVEL SECURITY;

CREATE INDEX ix_content_revisions_tree ON private.content_revisions(tree_id);

ALTER TABLE private.publications ADD CONSTRAINT fk_75507fe6eeccc733 FOREIGN KEY (tree_id) REFERENCES private.trees(id);

ALTER TABLE private.publications ADD CONSTRAINT fk_ead42813c7bce8c2 FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE private.publications ADD CONSTRAINT fk_a58015f67b36428f FOREIGN KEY (tree_id, revision_id) REFERENCES private.content_revisions(tree_id, id);

ALTER TABLE private.publications ENABLE ROW LEVEL SECURITY;

CREATE INDEX ix_publications_tree ON private.publications(tree_id);

ALTER TABLE private.places ADD CONSTRAINT fk_e3fd86d95e2f2e62 FOREIGN KEY (tree_id) REFERENCES private.trees(id);

ALTER TABLE private.places ADD CONSTRAINT fk_369fe442851bb2ef FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE private.places ENABLE ROW LEVEL SECURITY;

CREATE INDEX ix_places_tree ON private.places(tree_id);

ALTER TABLE private.burial_records ADD CONSTRAINT fk_661d701c9be0608e FOREIGN KEY (tree_id) REFERENCES private.trees(id);

ALTER TABLE private.burial_records ADD CONSTRAINT fk_5e2dd4a19d279f22 FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE private.burial_records ADD CONSTRAINT fk_088d5488e8327dbc FOREIGN KEY (tree_id, person_id) REFERENCES private.persons(tree_id, id);

ALTER TABLE private.burial_records ADD CONSTRAINT fk_db8788ce525be7a8 FOREIGN KEY (tree_id, place_id) REFERENCES private.places(tree_id, id);

ALTER TABLE private.burial_records ADD CONSTRAINT fk_86ce9e254382de06 FOREIGN KEY (tree_id, source_id) REFERENCES private.sources(tree_id, id);

ALTER TABLE private.burial_records ENABLE ROW LEVEL SECURITY;

CREATE INDEX ix_burial_records_tree ON private.burial_records(tree_id);

ALTER TABLE private.event_rules ADD CONSTRAINT fk_38bc180e8087a227 FOREIGN KEY (tree_id) REFERENCES private.trees(id);

ALTER TABLE private.event_rules ADD CONSTRAINT fk_b22372d24163b413 FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE private.event_rules ADD CONSTRAINT fk_21ca07ba99387b31 FOREIGN KEY (tree_id, person_id) REFERENCES private.persons(tree_id, id);

ALTER TABLE private.event_rules ADD CONSTRAINT fk_dc0d197081a6f17c FOREIGN KEY (tree_id, place_id) REFERENCES private.places(tree_id, id);

ALTER TABLE private.event_rules ENABLE ROW LEVEL SECURITY;

CREATE INDEX ix_event_rules_tree ON private.event_rules(tree_id);

ALTER TABLE private.event_occurrences ADD CONSTRAINT fk_28af255339a5a4ec FOREIGN KEY (tree_id) REFERENCES private.trees(id);

ALTER TABLE private.event_occurrences ADD CONSTRAINT fk_9650fb3475d5450b FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE private.event_occurrences ADD CONSTRAINT fk_7bd9c8a11094de05 FOREIGN KEY (tree_id, rule_id) REFERENCES private.event_rules(tree_id, id);

ALTER TABLE private.event_occurrences ENABLE ROW LEVEL SECURITY;

CREATE INDEX ix_event_occurrences_tree ON private.event_occurrences(tree_id);

ALTER TABLE private.event_rsvps ADD CONSTRAINT fk_5c5d440d0f45cc8b FOREIGN KEY (tree_id) REFERENCES private.trees(id);

ALTER TABLE private.event_rsvps ADD CONSTRAINT fk_9e0374acef5dceec FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE private.event_rsvps ADD CONSTRAINT fk_270193b7c964f4ea FOREIGN KEY (tree_id, occurrence_id) REFERENCES private.event_occurrences(tree_id, id);

ALTER TABLE private.event_rsvps ADD CONSTRAINT fk_11a761ef51581838 FOREIGN KEY (tree_id, membership_id) REFERENCES private.memberships(tree_id, id);

ALTER TABLE private.event_rsvps ENABLE ROW LEVEL SECURITY;

CREATE INDEX ix_event_rsvps_tree ON private.event_rsvps(tree_id);

ALTER TABLE private.proposals ADD CONSTRAINT fk_f3b332d7ab49c8b2 FOREIGN KEY (tree_id) REFERENCES private.trees(id);

ALTER TABLE private.proposals ADD CONSTRAINT fk_c160cc0963f26153 FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE private.proposals ADD CONSTRAINT fk_81b71067efb4c5e0 FOREIGN KEY (submitted_by) REFERENCES auth.users(id);

ALTER TABLE private.proposals ADD CONSTRAINT fk_fd80941f37335cab FOREIGN KEY (tree_id, branch_id) REFERENCES private.branches(tree_id, id);

ALTER TABLE private.proposals ENABLE ROW LEVEL SECURITY;

CREATE INDEX ix_proposals_tree ON private.proposals(tree_id);

ALTER TABLE private.proposal_items ADD CONSTRAINT fk_2c2dcd04f2b34516 FOREIGN KEY (tree_id) REFERENCES private.trees(id);

ALTER TABLE private.proposal_items ADD CONSTRAINT fk_b6a47a775d06e900 FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE private.proposal_items ADD CONSTRAINT fk_2e261db2cdee8976 FOREIGN KEY (tree_id, proposal_id) REFERENCES private.proposals(tree_id, id);

ALTER TABLE private.proposal_items ENABLE ROW LEVEL SECURITY;

CREATE INDEX ix_proposal_items_tree ON private.proposal_items(tree_id);

ALTER TABLE private.review_decisions ADD CONSTRAINT fk_638ce844ed76f724 FOREIGN KEY (tree_id) REFERENCES private.trees(id);

ALTER TABLE private.review_decisions ADD CONSTRAINT fk_3f2c0ef5b11e4c2f FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE private.review_decisions ADD CONSTRAINT fk_9efcc8010362bade FOREIGN KEY (tree_id, proposal_id) REFERENCES private.proposals(tree_id, id);

ALTER TABLE private.review_decisions ADD CONSTRAINT fk_312efc5d28c85fad FOREIGN KEY (reviewer_id) REFERENCES auth.users(id);

ALTER TABLE private.review_decisions ENABLE ROW LEVEL SECURITY;

CREATE INDEX ix_review_decisions_tree ON private.review_decisions(tree_id);

ALTER TABLE private.audit_events ADD CONSTRAINT fk_6998f10524d66266 FOREIGN KEY (tree_id) REFERENCES private.trees(id);

ALTER TABLE private.audit_events ADD CONSTRAINT fk_4c99cedb0967965d FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE private.audit_events ADD CONSTRAINT fk_d4b884a175f6ce39 FOREIGN KEY (actor_id) REFERENCES auth.users(id);

ALTER TABLE private.audit_events ENABLE ROW LEVEL SECURITY;

CREATE INDEX ix_audit_events_tree ON private.audit_events(tree_id);

ALTER TABLE private.import_jobs ADD CONSTRAINT fk_cd8c0be3348b43ef FOREIGN KEY (tree_id) REFERENCES private.trees(id);

ALTER TABLE private.import_jobs ADD CONSTRAINT fk_c1c5ee51b488a3ef FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE private.import_jobs ADD CONSTRAINT fk_b856fe6bd5bd5c78 FOREIGN KEY (tree_id, source_asset_id) REFERENCES private.media_assets(tree_id, id);

ALTER TABLE private.import_jobs ENABLE ROW LEVEL SECURITY;

CREATE INDEX ix_import_jobs_tree ON private.import_jobs(tree_id);

ALTER TABLE private.import_rows ADD CONSTRAINT fk_1e2e234dfa48b0f4 FOREIGN KEY (tree_id) REFERENCES private.trees(id);

ALTER TABLE private.import_rows ADD CONSTRAINT fk_c90b768eccef38d4 FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE private.import_rows ADD CONSTRAINT fk_ae189b3c2bacc440 FOREIGN KEY (tree_id, job_id) REFERENCES private.import_jobs(tree_id, id);

ALTER TABLE private.import_rows ENABLE ROW LEVEL SECURITY;

CREATE INDEX ix_import_rows_tree ON private.import_rows(tree_id);

ALTER TABLE private.external_id_map ADD CONSTRAINT fk_dbd41c3cfbd1018c FOREIGN KEY (tree_id) REFERENCES private.trees(id);

ALTER TABLE private.external_id_map ADD CONSTRAINT fk_e5ecbf111ac3ac08 FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE private.external_id_map ENABLE ROW LEVEL SECURITY;

CREATE INDEX ix_external_id_map_tree ON private.external_id_map(tree_id);

ALTER TABLE private.merge_operations ADD CONSTRAINT fk_a216c3150909721e FOREIGN KEY (tree_id) REFERENCES private.trees(id);

ALTER TABLE private.merge_operations ADD CONSTRAINT fk_56da7ad39e3b2159 FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE private.merge_operations ADD CONSTRAINT fk_ef47e79420d92a67 FOREIGN KEY (tree_id, survivor_id) REFERENCES private.persons(tree_id, id);

ALTER TABLE private.merge_operations ADD CONSTRAINT fk_0ae6c8338a0b448a FOREIGN KEY (tree_id, loser_id) REFERENCES private.persons(tree_id, id);

ALTER TABLE private.merge_operations ADD CONSTRAINT fk_ce451e044d43edca FOREIGN KEY (tree_id, proposal_id) REFERENCES private.proposals(tree_id, id);

ALTER TABLE private.merge_operations ADD CONSTRAINT fk_4ace206d21d3e263 FOREIGN KEY (tree_id, compensated_by_id) REFERENCES private.merge_operations(tree_id, id);

ALTER TABLE private.merge_operations ENABLE ROW LEVEL SECURITY;

CREATE INDEX ix_merge_operations_tree ON private.merge_operations(tree_id);

ALTER TABLE private.notification_preferences ADD CONSTRAINT fk_5434b597dd717e2b FOREIGN KEY (tree_id) REFERENCES private.trees(id);

ALTER TABLE private.notification_preferences ADD CONSTRAINT fk_e2e5d2081936b148 FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE private.notification_preferences ADD CONSTRAINT fk_9c505b3fa6efb310 FOREIGN KEY (tree_id, membership_id) REFERENCES private.memberships(tree_id, id);

ALTER TABLE private.notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE INDEX ix_notification_preferences_tree ON private.notification_preferences(tree_id);

ALTER TABLE private.notifications ADD CONSTRAINT fk_810949683eb95cfc FOREIGN KEY (tree_id) REFERENCES private.trees(id);

ALTER TABLE private.notifications ADD CONSTRAINT fk_411380dbd003e050 FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE private.notifications ADD CONSTRAINT fk_a6004db24e78b77b FOREIGN KEY (tree_id, membership_id) REFERENCES private.memberships(tree_id, id);

ALTER TABLE private.notifications ENABLE ROW LEVEL SECURITY;

CREATE INDEX ix_notifications_tree ON private.notifications(tree_id);

ALTER TABLE private.delivery_attempts ADD CONSTRAINT fk_cd25bad34a08878a FOREIGN KEY (tree_id) REFERENCES private.trees(id);

ALTER TABLE private.delivery_attempts ADD CONSTRAINT fk_21f6d7a0e971669a FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE private.delivery_attempts ADD CONSTRAINT fk_99a28a5261cb3a6b FOREIGN KEY (tree_id, notification_id) REFERENCES private.notifications(tree_id, id);

ALTER TABLE private.delivery_attempts ENABLE ROW LEVEL SECURITY;

CREATE INDEX ix_delivery_attempts_tree ON private.delivery_attempts(tree_id);

ALTER TABLE private.outbox ADD CONSTRAINT fk_f76cd29a77dff776 FOREIGN KEY (tree_id) REFERENCES private.trees(id);

ALTER TABLE private.outbox ADD CONSTRAINT fk_db201fbe37517967 FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE private.outbox ADD CONSTRAINT fk_4a0102316a00a218 FOREIGN KEY (requested_by) REFERENCES auth.users(id);

ALTER TABLE private.outbox ENABLE ROW LEVEL SECURITY;

CREATE INDEX ix_outbox_tree ON private.outbox(tree_id);

ALTER TABLE private.funds ADD CONSTRAINT fk_d82f5a8c0f1712da FOREIGN KEY (tree_id) REFERENCES private.trees(id);

ALTER TABLE private.funds ADD CONSTRAINT fk_ed417adf4d938c6f FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE private.funds ENABLE ROW LEVEL SECURITY;

CREATE INDEX ix_funds_tree ON private.funds(tree_id);

ALTER TABLE private.fund_accounts ADD CONSTRAINT fk_430d5b78b6b8c03c FOREIGN KEY (tree_id) REFERENCES private.trees(id);

ALTER TABLE private.fund_accounts ADD CONSTRAINT fk_371d33bc83dfca03 FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE private.fund_accounts ADD CONSTRAINT fk_35dc60f62a881ed5 FOREIGN KEY (tree_id, fund_id) REFERENCES private.funds(tree_id, id);

ALTER TABLE private.fund_accounts ENABLE ROW LEVEL SECURITY;

CREATE INDEX ix_fund_accounts_tree ON private.fund_accounts(tree_id);

ALTER TABLE private.journal_entries ADD CONSTRAINT fk_552d65001323452d FOREIGN KEY (tree_id) REFERENCES private.trees(id);

ALTER TABLE private.journal_entries ADD CONSTRAINT fk_361508ca2e56fcb3 FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE private.journal_entries ADD CONSTRAINT fk_55e13092b65ea903 FOREIGN KEY (tree_id, fund_id) REFERENCES private.funds(tree_id, id);

ALTER TABLE private.journal_entries ADD CONSTRAINT fk_3656e585485af706 FOREIGN KEY (submitted_by) REFERENCES auth.users(id);

ALTER TABLE private.journal_entries ADD CONSTRAINT fk_33e777b095a69911 FOREIGN KEY (approved_by) REFERENCES auth.users(id);

ALTER TABLE private.journal_entries ADD CONSTRAINT fk_fd59918546619d00 FOREIGN KEY (tree_id, reverses_entry_id) REFERENCES private.journal_entries(tree_id, id);

ALTER TABLE private.journal_entries ADD CONSTRAINT fk_9464afb7eae9a6f1 FOREIGN KEY (tree_id, proof_asset_id) REFERENCES private.media_assets(tree_id, id);

ALTER TABLE private.journal_entries ADD CONSTRAINT fk_199a67975dfb6d27 FOREIGN KEY (tree_id, donor_person_id) REFERENCES private.persons(tree_id, id);

ALTER TABLE private.journal_entries ENABLE ROW LEVEL SECURITY;

CREATE INDEX ix_journal_entries_tree ON private.journal_entries(tree_id);

ALTER TABLE private.journal_lines ADD CONSTRAINT fk_87d74a3abe742444 FOREIGN KEY (tree_id) REFERENCES private.trees(id);

ALTER TABLE private.journal_lines ADD CONSTRAINT fk_a37e0c88426b5899 FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE private.journal_lines ADD CONSTRAINT fk_a6c8b8ae977234d5 FOREIGN KEY (tree_id, fund_id) REFERENCES private.funds(tree_id, id);

ALTER TABLE private.journal_lines ADD CONSTRAINT fk_24bf52750f353c1d FOREIGN KEY (tree_id, entry_id) REFERENCES private.journal_entries(tree_id, id);

ALTER TABLE private.journal_lines ADD CONSTRAINT fk_f3b8bfb7bdadb996 FOREIGN KEY (tree_id, account_id) REFERENCES private.fund_accounts(tree_id, id);

ALTER TABLE private.journal_lines ENABLE ROW LEVEL SECURITY;

CREATE INDEX ix_journal_lines_tree ON private.journal_lines(tree_id);

ALTER TABLE private.scholarship_programs ADD CONSTRAINT fk_3671aab04e649d0b FOREIGN KEY (tree_id) REFERENCES private.trees(id);

ALTER TABLE private.scholarship_programs ADD CONSTRAINT fk_11b11482c19438c0 FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE private.scholarship_programs ADD CONSTRAINT fk_77a2b07e536afa50 FOREIGN KEY (tree_id, fund_id) REFERENCES private.funds(tree_id, id);

ALTER TABLE private.scholarship_programs ENABLE ROW LEVEL SECURITY;

CREATE INDEX ix_scholarship_programs_tree ON private.scholarship_programs(tree_id);

ALTER TABLE private.scholarship_applications ADD CONSTRAINT fk_f6eb4737df779d73 FOREIGN KEY (tree_id) REFERENCES private.trees(id);

ALTER TABLE private.scholarship_applications ADD CONSTRAINT fk_83584c00fc73b0b5 FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE private.scholarship_applications ADD CONSTRAINT fk_99b1c0cda5673b0e FOREIGN KEY (tree_id, program_id) REFERENCES private.scholarship_programs(tree_id, id);

ALTER TABLE private.scholarship_applications ADD CONSTRAINT fk_6c755ff5d30f00ff FOREIGN KEY (tree_id, person_id) REFERENCES private.persons(tree_id, id);

ALTER TABLE private.scholarship_applications ADD CONSTRAINT fk_27550b93d69b2550 FOREIGN KEY (submitted_by) REFERENCES auth.users(id);

ALTER TABLE private.scholarship_applications ADD CONSTRAINT fk_85d1bf0e3fc07545 FOREIGN KEY (tree_id, evidence_asset_id) REFERENCES private.media_assets(tree_id, id);

ALTER TABLE private.scholarship_applications ENABLE ROW LEVEL SECURITY;

CREATE INDEX ix_scholarship_applications_tree ON private.scholarship_applications(tree_id);

ALTER TABLE private.scholarship_awards ADD CONSTRAINT fk_10394753f1730fe1 FOREIGN KEY (tree_id) REFERENCES private.trees(id);

ALTER TABLE private.scholarship_awards ADD CONSTRAINT fk_61279d5e1c659c97 FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE private.scholarship_awards ADD CONSTRAINT fk_9886fb02555e1470 FOREIGN KEY (tree_id, application_id) REFERENCES private.scholarship_applications(tree_id, id);

ALTER TABLE private.scholarship_awards ADD CONSTRAINT fk_b35c55cd20969667 FOREIGN KEY (approved_by) REFERENCES auth.users(id);

ALTER TABLE private.scholarship_awards ADD CONSTRAINT fk_99554fb81427357f FOREIGN KEY (tree_id, paid_journal_entry_id) REFERENCES private.journal_entries(tree_id, id);

ALTER TABLE private.scholarship_awards ENABLE ROW LEVEL SECURITY;

CREATE INDEX ix_scholarship_awards_tree ON private.scholarship_awards(tree_id);

ALTER TABLE private.consent_records ADD CONSTRAINT fk_03332cfc5ebd1378 FOREIGN KEY (tree_id) REFERENCES private.trees(id);

ALTER TABLE private.consent_records ADD CONSTRAINT fk_19b8a9f9ef3523c2 FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE private.consent_records ADD CONSTRAINT fk_f0901db44760709d FOREIGN KEY (tree_id, person_id) REFERENCES private.persons(tree_id, id);

ALTER TABLE private.consent_records ADD CONSTRAINT fk_400a5a0a61a3bf79 FOREIGN KEY (tree_id, evidence_asset_id) REFERENCES private.media_assets(tree_id, id);

ALTER TABLE private.consent_records ADD CONSTRAINT fk_0baccfe528d94cd5 FOREIGN KEY (tree_id, representative_person_id) REFERENCES private.persons(tree_id, id);

ALTER TABLE private.consent_records ENABLE ROW LEVEL SECURITY;

CREATE INDEX ix_consent_records_tree ON private.consent_records(tree_id);

ALTER TABLE private.privacy_requests ADD CONSTRAINT fk_6810212135bbdb77 FOREIGN KEY (tree_id) REFERENCES private.trees(id);

ALTER TABLE private.privacy_requests ADD CONSTRAINT fk_a8546f787cf878b9 FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE private.privacy_requests ADD CONSTRAINT fk_243762112332004d FOREIGN KEY (tree_id, person_id) REFERENCES private.persons(tree_id, id);

ALTER TABLE private.privacy_requests ENABLE ROW LEVEL SECURITY;

CREATE INDEX ix_privacy_requests_tree ON private.privacy_requests(tree_id);

ALTER TABLE private.export_jobs ADD CONSTRAINT fk_37752ac0a674da34 FOREIGN KEY (tree_id) REFERENCES private.trees(id);

ALTER TABLE private.export_jobs ADD CONSTRAINT fk_b7a2d1d6df21df26 FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE private.export_jobs ADD CONSTRAINT fk_a05dfb4debd5c44a FOREIGN KEY (requested_by) REFERENCES auth.users(id);

ALTER TABLE private.export_jobs ADD CONSTRAINT fk_4da0db3e4ce294ca FOREIGN KEY (tree_id, result_asset_id) REFERENCES private.media_assets(tree_id, id);

ALTER TABLE private.export_jobs ENABLE ROW LEVEL SECURITY;

CREATE INDEX ix_export_jobs_tree ON private.export_jobs(tree_id);

ALTER TABLE private.retention_jobs ADD CONSTRAINT fk_b463ddbe7b16d322 FOREIGN KEY (tree_id) REFERENCES private.trees(id);

ALTER TABLE private.retention_jobs ADD CONSTRAINT fk_85bc809541711bd6 FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE private.retention_jobs ADD CONSTRAINT fk_85c5cbf764f0e932 FOREIGN KEY (approved_by) REFERENCES auth.users(id);

ALTER TABLE private.retention_jobs ENABLE ROW LEVEL SECURITY;

CREATE INDEX ix_retention_jobs_tree ON private.retention_jobs(tree_id);

ALTER TABLE private.idempotency_records ADD CONSTRAINT fk_8d6b4e6cd29d105e FOREIGN KEY (tree_id) REFERENCES private.trees(id);

ALTER TABLE private.idempotency_records ADD CONSTRAINT fk_bc8b96593d0f7987 FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE private.idempotency_records ADD CONSTRAINT fk_540819790dec868e FOREIGN KEY (actor_id) REFERENCES auth.users(id);

ALTER TABLE private.idempotency_records ENABLE ROW LEVEL SECURITY;

CREATE INDEX ix_idempotency_records_tree ON private.idempotency_records(tree_id);

ALTER TABLE private.journal_lines ADD CONSTRAINT fk_lines_entry_fund FOREIGN KEY (tree_id, fund_id, entry_id) REFERENCES private.journal_entries(tree_id, fund_id, id);

ALTER TABLE private.journal_lines ADD CONSTRAINT fk_lines_account_fund FOREIGN KEY (tree_id, fund_id, account_id) REFERENCES private.fund_accounts(tree_id, fund_id, id);

CREATE UNIQUE INDEX uq_active_parent_link ON private.parent_links(tree_id,parent_id,child_id,kind) WHERE deleted_at IS NULL;

CREATE INDEX ix_parent_links_parent ON private.parent_links(tree_id,parent_id);

CREATE INDEX ix_parent_links_child ON private.parent_links(tree_id,child_id);

CREATE INDEX ix_occurrences_due ON private.event_occurrences(tree_id,occurs_on,status);

CREATE UNIQUE INDEX uq_person_preferred_name ON private.person_names(tree_id,person_id) WHERE is_preferred;

REVOKE ALL ON ALL TABLES IN SCHEMA private FROM PUBLIC, anon, authenticated;

REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA private REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

COMMIT;
