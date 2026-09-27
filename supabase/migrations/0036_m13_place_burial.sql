-- M13-01 place/burial model. Raw records stay private and fail closed.
begin;

create table if not exists private.places (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references private.trees(id),
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  name text not null,
  kind text not null check (kind in ('temple', 'cemetery', 'grave', 'hometown', 'other')),
  address_text text,
  latitude numeric(10,7),
  longitude numeric(10,7),
  visibility text not null default 'restricted' check (visibility in ('public', 'members', 'restricted')),
  coordinate_visibility text not null default 'restricted' check (coordinate_visibility in ('public', 'members', 'restricted')),
  unique (tree_id, id),
  check (length(btrim(name)) between 1 and 500),
  check (address_text is null or length(address_text) <= 1000),
  check (latitude is null or latitude between -90 and 90),
  check (longitude is null or longitude between -180 and 180),
  check ((latitude is null) = (longitude is null))
);

create table if not exists private.burial_records (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references private.trees(id),
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  person_id uuid not null,
  place_id uuid not null,
  locator text,
  source_id uuid,
  visibility text not null default 'restricted' check (visibility in ('public', 'members', 'restricted')),
  unique (tree_id, id),
  foreign key (tree_id, person_id) references private.persons(tree_id, id),
  foreign key (tree_id, place_id) references private.places(tree_id, id),
  foreign key (tree_id, source_id) references private.sources(tree_id, id),
  check (locator is null or length(locator) <= 500)
);

create index if not exists places_tree_kind_idx on private.places (tree_id, kind, id);
create index if not exists burial_records_person_idx on private.burial_records (tree_id, person_id, id);
create index if not exists burial_records_place_idx on private.burial_records (tree_id, place_id, id);

comment on table private.places is 'Scoped temples, burial areas and places; never a living person home-address table.';
comment on column private.places.address_text is 'Scoped place address/description, independent from living-person contact or home address.';
comment on column private.places.coordinate_visibility is 'Coordinates have an independent visibility boundary and are never auto-forwarded to a map provider.';
comment on column private.burial_records.locator is 'Scoped cemetery/area/lot locator, not a residential address.';

 drop trigger if exists touch_places on private.places;
create trigger touch_places before update on private.places
for each row execute function private.touch_updated_at();
drop trigger if exists touch_burial_records on private.burial_records;
create trigger touch_burial_records before update on private.burial_records
for each row execute function private.touch_updated_at();

alter table private.places enable row level security;
alter table private.places force row level security;
alter table private.burial_records enable row level security;
alter table private.burial_records force row level security;
revoke all on table private.places from public, anon, authenticated;
revoke all on table private.burial_records from public, anon, authenticated;
grant usage on schema private to service_role;
grant all on table private.places, private.burial_records to service_role;

commit;