-- GEDCOM is line-oriented UTF-8 text, reserved for the private import purpose.
begin;

update storage.buckets set allowed_mime_types=array[
  'image/jpeg','image/png','image/webp','application/pdf','audio/mpeg','audio/mp4','video/mp4',
  'application/json','text/csv','text/plain'
]::text[],updated_at=clock_timestamp() where id='family-assets';

create or replace function private.media_validate_upload(
  p_mime text,p_size bigint,p_filename text,p_sha256 text,p_purpose text,p_visibility text
)
returns void language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_limit bigint;
begin
  if p_mime not in ('image/jpeg','image/png','image/webp','application/pdf','audio/mpeg','audio/mp4','video/mp4')
     and not (p_purpose='import' and p_mime in ('application/json','text/csv','text/plain')) then
    raise exception using errcode='22023',message='media MIME type is not allowed';
  end if;
  v_limit:=case when p_mime in ('image/jpeg','image/png','image/webp') then 15728640
    when p_mime='application/pdf' then 26214400 when p_mime in ('audio/mpeg','audio/mp4') then 52428800
    when p_mime='video/mp4' then 104857600 when p_mime in ('application/json','text/csv','text/plain') then 10485760 end;
  if p_size is null or p_size<1 or p_size>v_limit then raise exception using errcode='22023',message='media size is outside the allowed limit'; end if;
  if p_filename is null or length(p_filename)<1 or length(p_filename)>255 or p_filename ~ '[[:cntrl:]]'
     or position('/' in p_filename)>0 or position(chr(92) in p_filename)>0 then raise exception using errcode='22023',message='media filename is invalid'; end if;
  if p_sha256 is null or p_sha256 !~ '^[a-f0-9]{64}$' then raise exception using errcode='22023',message='media SHA-256 is invalid'; end if;
  if p_purpose not in ('portrait','source','album','import','receipt','scholarship') then raise exception using errcode='22023',message='media purpose is invalid'; end if;
  if p_visibility not in ('restricted','members','public') then raise exception using errcode='22023',message='media visibility is invalid'; end if;
end;
$$;

comment on function private.media_validate_upload(text,bigint,text,text,text,text) is
  'M16-03: permit small text/plain only for private GEDCOM imports; all uploads remain tree-scoped and policy checked.';

commit;
