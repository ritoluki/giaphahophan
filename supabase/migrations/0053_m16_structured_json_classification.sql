begin;

-- canonical_json is the transport envelope for both fixed canonical records and
-- explicitly mapped structured JSON. Keep the durable classification truthful.
create or replace function private.import_classify_structured_json()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if new.format = 'canonical_json' and new.mapping_version like 'structured-json/%' then
    new.classification := 'structured';
  end if;
  return new;
end;
$$;

drop trigger if exists import_jobs_classify_structured_json on private.import_jobs;
create trigger import_jobs_classify_structured_json
before insert or update of format, mapping_version on private.import_jobs
for each row execute function private.import_classify_structured_json();

update private.import_jobs
set classification = 'structured'
where format = 'canonical_json' and mapping_version like 'structured-json/%' and classification <> 'structured';

commit;
