-- Extends the metadata fixture, before its final rollback. Synthetic-only redaction markers.
reset role;
update private.export_jobs set expires_at=clock_timestamp()+interval '1 hour' where tree_id='e1610000-0000-4000-8000-000000000001';
update private.memberships set status='active' where id='e1620000-0000-4000-8000-000000000002';
update private.persons set life_status='deceased',visibility='members' where id='e1630000-0000-4000-8000-000000000001';
insert into private.persons(id,tree_id,code,display_name,name_search,life_status,visibility,protected_minor,recorded_sex) values
('e1630000-0000-4000-8000-000000000002','e1610000-0000-4000-8000-000000000001','HIDDEN-RESTRICTED','HIDDEN_RESTRICTED_NAME','hidden','deceased','restricted',false,'M'),
('e1630000-0000-4000-8000-000000000003','e1610000-0000-4000-8000-000000000001','HIDDEN-MINOR','HIDDEN_MINOR_NAME','hidden','deceased','members',true,'F'),
('e1630000-0000-4000-8000-000000000004','e1610000-0000-4000-8000-000000000001','DEMO-LIVING','Consenting Synthetic Adult','adult','living','members',false,'M'),
('e1630000-0000-4000-8000-000000000005','e1610000-0000-4000-8000-000000000001','DEMO-WOMAN','Synthetic Deceased Woman','woman','deceased','members',false,'F'),
('e1630000-0000-4000-8000-000000000006','e1610000-0000-4000-8000-000000000002','HIDDEN-OTHER-TREE','HIDDEN_CROSS_TREE','hidden','deceased','members',false,'M');
insert into private.person_names(tree_id,person_id,name,name_search,kind) values
('e1610000-0000-4000-8000-000000000001','e1630000-0000-4000-8000-000000000004','HIDDEN_LIVING_ALIAS','hidden alias','alias');
insert into private.person_facts(id,tree_id,person_id,kind,value_date,visibility) values
('e1650000-0000-4000-8000-000000000001','e1610000-0000-4000-8000-000000000001','e1630000-0000-4000-8000-000000000001','birth','{"calendar":"gregorian","precision":"year","year":1900,"originalText":"1900"}','members'),
('e1650000-0000-4000-8000-000000000002','e1610000-0000-4000-8000-000000000001','e1630000-0000-4000-8000-000000000004','birth','{"calendar":"gregorian","precision":"exact","year":1900,"month":1,"day":2,"originalText":"HIDDEN_EXACT_LIVING_BIRTH"}','members'),
('e1650000-0000-4000-8000-000000000003','e1610000-0000-4000-8000-000000000001','e1630000-0000-4000-8000-000000000001','death','{"calendar":"unknown","precision":"text","originalText":"HIDDEN_RESTRICTED_FACT"}','restricted');
insert into private.media_assets(id,tree_id,created_by,filename,declared_mime,mime_type,size_bytes,actual_size_bytes,expected_sha256,actual_sha256,purpose,visibility,state,object_path) values
('e1660000-0000-4000-8000-000000000001','e1610000-0000-4000-8000-000000000001','e1600000-0000-4000-8000-000000000001','synthetic-consent.pdf','application/pdf','application/pdf',128,128,repeat('f',64),repeat('f',64),'source','restricted','ready','synthetic/export/consent.pdf');
insert into private.consent_records(tree_id,person_id,audience,field_groups,purpose,evidence_asset_id,effective_at) values
('e1610000-0000-4000-8000-000000000001','e1630000-0000-4000-8000-000000000004','members','["identity"]','genealogy-export','e1660000-0000-4000-8000-000000000001',clock_timestamp()-interval '1 hour');
insert into private.sources(id,tree_id,title,kind,provenance,visibility) values
('e1670000-0000-4000-8000-000000000001','e1610000-0000-4000-8000-000000000001','Synthetic permitted source','document','Synthetic only','members'),
('e1670000-0000-4000-8000-000000000002','e1610000-0000-4000-8000-000000000001','HIDDEN_RESTRICTED_SOURCE','document','HIDDEN_RAW_PROVENANCE','restricted');
insert into private.parent_links(id,tree_id,parent_id,child_id,kind,status,source_id) values
('e1680000-0000-4000-8000-000000000001','e1610000-0000-4000-8000-000000000001','e1630000-0000-4000-8000-000000000001','e1630000-0000-4000-8000-000000000005','biological','confirmed','e1670000-0000-4000-8000-000000000001'),
('e1680000-0000-4000-8000-000000000002','e1610000-0000-4000-8000-000000000001','e1630000-0000-4000-8000-000000000001','e1630000-0000-4000-8000-000000000002','biological','confirmed','e1670000-0000-4000-8000-000000000001'),
('e1680000-0000-4000-8000-000000000003','e1610000-0000-4000-8000-000000000001','e1630000-0000-4000-8000-000000000001','e1630000-0000-4000-8000-000000000004','biological','confirmed','e1670000-0000-4000-8000-000000000001');
insert into private.unions(id,tree_id,kind,status) values
('e1690000-0000-4000-8000-000000000001','e1610000-0000-4000-8000-000000000001','partnership','unknown'),
('e1690000-0000-4000-8000-000000000002','e1610000-0000-4000-8000-000000000001','marriage','unknown');
insert into private.union_partners(tree_id,union_id,person_id,ordinal) values
('e1610000-0000-4000-8000-000000000001','e1690000-0000-4000-8000-000000000001','e1630000-0000-4000-8000-000000000001',1),
('e1610000-0000-4000-8000-000000000001','e1690000-0000-4000-8000-000000000001','e1630000-0000-4000-8000-000000000005',2),
('e1610000-0000-4000-8000-000000000001','e1690000-0000-4000-8000-000000000002','e1630000-0000-4000-8000-000000000001',1),
('e1610000-0000-4000-8000-000000000001','e1690000-0000-4000-8000-000000000002','e1630000-0000-4000-8000-000000000005',2);
insert into private.union_children(tree_id,union_id,person_id,ordinal) values
('e1610000-0000-4000-8000-000000000001','e1690000-0000-4000-8000-000000000001','e1630000-0000-4000-8000-000000000004',1);
insert into private.citations(tree_id,source_id,person_id,locator,quoted_text) values
('e1610000-0000-4000-8000-000000000001','e1670000-0000-4000-8000-000000000001','e1630000-0000-4000-8000-000000000001','Page10','HIDDEN_QUOTED_PAYLOAD'),
('e1610000-0000-4000-8000-000000000001','e1670000-0000-4000-8000-000000000001','e1630000-0000-4000-8000-000000000002','HIDDEN_TARGET_LOCATOR',null),
('e1610000-0000-4000-8000-000000000001','e1670000-0000-4000-8000-000000000002','e1630000-0000-4000-8000-000000000001','HIDDEN_SOURCE_LOCATOR',null);
select set_config('request.jwt.claim.sub','e1600000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"e1600000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select api.export_projection(:'job_id'::uuid) value \gset projection_
select (jsonb_array_length(:'projection_value'::jsonb->'people')=3
  and jsonb_array_length(:'projection_value'::jsonb->'parentLinks')=1
  and jsonb_array_length(:'projection_value'::jsonb->'unions')=1
  and jsonb_array_length(:'projection_value'::jsonb->'citations')=1
  and jsonb_array_length(:'projection_value'::jsonb->'sources')=1
  and :'projection_value' not like '%HIDDEN%'
  and :'projection_value' not like '%e1630000-0000-4000-8000-000000000002%'
  and :'projection_value' not like '%e1630000-0000-4000-8000-000000000003%') ok \gset redaction_
\if :redaction_ok
\else
  \quit 1
\endif
reset role;
insert into private.consent_records(tree_id,person_id,audience,field_groups,purpose,evidence_asset_id,effective_at) values
('e1610000-0000-4000-8000-000000000001','e1630000-0000-4000-8000-000000000004','members','["facts:birth"]','genealogy-export','e1660000-0000-4000-8000-000000000001',clock_timestamp()-interval '1 hour');
set local role authenticated;
select (api.export_projection(:'job_id'::uuid)::text like '%HIDDEN_EXACT_LIVING_BIRTH%') ok \gset consent_
\if :consent_ok
\else
  \quit 1
\endif
reset role;
update private.consent_records set withdrawn_at=clock_timestamp() where field_groups ? 'facts:birth' and tree_id='e1610000-0000-4000-8000-000000000001';
set local role authenticated;
select (api.export_projection(:'job_id'::uuid)::text not like '%HIDDEN_EXACT_LIVING_BIRTH%') ok \gset withdrawn_
\if :withdrawn_ok
\else
  \quit 1
\endif
reset role;
update private.media_assets set state='quarantined' where id='e1660000-0000-4000-8000-000000000001';
set local role authenticated;
select jsonb_array_length(api.export_projection(:'job_id'::uuid)->'people')=2 ok \gset proof_closed_
\if :proof_closed_ok
\else
  \quit 1
\endif
reset role;
update private.media_assets set state='ready' where id='e1660000-0000-4000-8000-000000000001';
select id public_job_id from private.export_jobs where tree_id='e1610000-0000-4000-8000-000000000001' and audience='public' \gset
set local role authenticated;
select jsonb_array_length(api.export_projection(:'public_job_id'::uuid)->'people')=0 ok \gset public_closed_
\if :public_closed_ok
\else
  \quit 1
\endif
select set_config('request.jwt.claim.sub','e1600000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"e1600000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}',true);
select jsonb_array_length(api.export_projection(:'personal_job_id'::uuid)->'people')=1 ok \gset personal_projection_
\if :personal_projection_ok
\else
  \quit 1
\endif
select format('do $b$ begin begin perform api.export_projection(%L::uuid); raise exception ''other actor exported bulk''; exception when insufficient_privilege then null; end; end $b$;',:'job_id') \gexec
reset role;
update private.persons set protected_minor=true where id='e1630000-0000-4000-8000-000000000001';
set local role authenticated;
select format('do $b$ begin begin perform api.export_projection(%L::uuid); raise exception ''minor personal export without representative''; exception when insufficient_privilege then null; end; end $b$;',:'personal_job_id') \gexec
reset role;
do $$ begin
  if has_table_privilege('authenticated','private.consent_records','SELECT')
    or has_table_privilege('authenticated','private.consent_records','INSERT')
    or has_function_privilege('authenticated','private.export_field_consent(uuid,uuid,text)','EXECUTE') then
    raise exception 'consent raw/helper grant leaked'; end if;
end $$;
