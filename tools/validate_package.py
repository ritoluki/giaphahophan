"""Validate the documentation kit only. Does not test an application or deploy anything.
Dependencies for this optional QA helper: Python 3.10+, PyYAML, jsonschema.
Run from any folder: python path/to/tools/validate_package.py
"""
from pathlib import Path
import json,re,sys,subprocess,shutil,datetime
try:
 import yaml
 from jsonschema import Draft202012Validator,FormatChecker
except ImportError as exc:
 raise SystemExit('Optional package QA dependencies missing: install PyYAML and jsonschema in an isolated environment. '+str(exc))
R=Path(__file__).resolve().parents[1]
checks=[]
def check(name,fn):
 try:
  detail=fn();checks.append({'name':name,'status':'PASS','detail':detail})
 except Exception as exc:checks.append({'name':name,'status':'FAIL','detail':str(exc)})
def j(name):return json.loads((R/name).read_text(encoding='utf-8'))
def truth(v,msg):
 if not v:raise AssertionError(msg)

def parse_all():
 paths=list(R.rglob('*.json'))
 for path in paths:json.loads(path.read_text(encoding='utf-8'))
 return {'jsonFiles':len(paths)}
check('JSON syntax',parse_all)
req=j('contracts/requirements.json')['requirements'];tests=j('contracts/test-cases.json')['cases'];tasks=j('state/TASKS.json')['tasks'];screens=j('contracts/route-registry.json')['screens'];data=j('contracts/data-dictionary.json')['tables'];demo=j('fixtures/demo-family.json');api=yaml.safe_load((R/'contracts/openapi.yaml').read_text(encoding='utf-8'))

def trace():
 reqids={x['id'] for x in req};testids={x['id'] for x in tests};taskids={x['id'] for x in tasks}
 truth(len(reqids)==len(req),'duplicate requirement');truth(len(testids)==len(tests),'duplicate test');truth(len(taskids)==len(tasks),'duplicate task')
 for x in req:truth(set(x['testIds'])<=testids,'unknown test '+x['id'])
 for x in tests:truth(set(x['requirementIds'])<=reqids,'unknown requirement '+x['id'])
 covered=set()
 for x in tasks:
  truth(set(x['dependencies'])<=taskids,'missing dependency '+x['id']);truth(set(x['requirementIds'])<=reqids,'unknown requirement '+x['id']);truth(set(x['testIds'])<=testids,'unknown test '+x['id']);covered.update(x['requirementIds'])
 truth(covered==reqids,'requirements not in backlog')
 g={x['id']:x['dependencies'] for x in tasks};done=set();visiting=set()
 def visit(k):
  truth(k not in visiting,'cycle in task DAG: '+k)
  if k in done:return
  visiting.add(k)
  for v in g[k]:visit(v)
  visiting.remove(k);done.add(k)
 for k in g:visit(k)
 return {'requirements':len(req),'plannedTests':len(tests),'tasks':len(tasks),'screens':len(screens),'modules':len(set(x['module'] for x in req))}
check('Requirement-test-task references and dependency DAG',trace)

def api_check():
 count=0;ids=set();params=api['components']['parameters'];schemas=api['components']['schemas']
 def walk(x):
  if isinstance(x,dict):
   if '$ref' in x:
    ref=x['$ref'];truth(ref.startswith('#/'),'external ref unsupported by package check: '+ref)
    node=api
    for key in ref[2:].split('/'):node=node[key.replace('~1','/').replace('~0','~')]
   for v in x.values():walk(v)
  elif isinstance(x,list):
   for v in x:walk(v)
 walk(api)
 for path,methods in api['paths'].items():
  for method,op in methods.items():
   count+=1;truth(op['operationId'] not in ids,'duplicate operationId');ids.add(op['operationId'])
   pathparams={p['name'] for p in op.get('parameters',[]) if p.get('in')=='path'}
   truth(set(re.findall(r'\{(.*?)\}',path))==pathparams,'path param mismatch '+path)
   if method in ['post','put','patch','delete']:
    refs={x.get('$ref') for x in op.get('parameters',[])}
    truth('#/components/parameters/IdempotencyKey' in refs,'mutation missing idempotency')
    truth('#/components/parameters/CSRF' in refs,'mutation missing CSRF')
   if method in ['patch','delete']:truth('#/components/parameters/IfMatch' in refs,'missing If-Match')
 for schema in schemas.values():Draft202012Validator.check_schema(schema)
 return {'operations':count,'paths':len(api['paths']),'schemas':len(schemas),'scope':'Internal refs, JSON Schema vocabulary and declared preconditions; not full OpenAPI conformance or live endpoint tests.'}
check('API references and schema structure',api_check)

def fixture_check():
 Draft202012Validator(j('contracts/demo-fixture.schema.json'),format_checker=FormatChecker()).validate(demo)
 date_validator=Draft202012Validator(j('contracts/genealogy-date.schema.json'))
 people=demo['persons'];ids={p['id'] for p in people};sources={s['id'] for s in demo['sources']};branches={s['id'] for s in demo['branches']}
 truth(len(ids)==len(people),'duplicate person ID');truth(len({p['externalId'] for p in people})==len(people),'duplicate external ID')
 for p in people:
  truth(p['isFictional'] is True,'real data in demo');truth(p['branchId'] in branches,'missing branch');truth(set(p['sourceIds'])<=sources,'missing source');date_validator.validate(p['birth'])
 for event in demo['eventRules']:date_validator.validate(event['sourceDate'])
 g={i:[] for i in ids};pairs=set()
 for e in demo['parentLinks']:
  truth(e['parentId'] in ids and e['childId'] in ids,'unknown edge endpoint');truth(e['parentId']!=e['childId'],'self parent')
  k=(e['parentId'],e['childId'],e['kind']);truth(k not in pairs,'duplicate parent link');pairs.add(k)
  if e['kind'] in ['biological','adoptive'] and e['status']=='confirmed':g[e['parentId']].append(e['childId'])
 visiting=set();done=set()
 def dfs(i):
  truth(i not in visiting,'ancestry cycle')
  if i in done:return
  visiting.add(i)
  for c in g[i]:dfs(c)
  visiting.remove(i);done.add(i)
 for i in ids:dfs(i)
 for u in demo['unions']:
  truth(set(u['partnerIds'])<=ids and set(u['childIds'])<=ids,'invalid union endpoint')
 accounts={a['id'] for a in demo['fund']['accounts']}
 for e in demo['fund']['entries']:
  truth(sum(int(x['signedAmountVnd']) for x in e['lines'])==0,'unbalanced journal');truth(all(x['accountId'] in accounts for x in e['lines']),'missing fund account')
 return {'persons':len(people),'parentLinks':len(demo['parentLinks']),'unions':len(demo['unions']),'scope':'Fixture structure, references, graph DAG, source dates structure, balanced sample ledger. No astronomical correctness or app security proof.'}
check('Demo fixture invariants',fixture_check)

def sql_check():
 sql=(R/'database/schema.blueprint.sql').read_text(encoding='utf-8')
 missing=[]
 for t in data:
  name=t['name']
  if not re.search(r'CREATE TABLE.*?private\.'+re.escape(name)+r'\s*\(',sql,re.I):missing.append(name)
 truth(not missing,'table missing '+str(missing))
 truth(len(re.findall('ENABLE ROW LEVEL SECURITY',sql,re.I))==len(data),'RLS enable count mismatch')
 return {'tables':len(data),'scope':'Static table coverage and RLS declarations only. SQL execution, policies, triggers and authorization NOT_RUN.'}
check('SQL blueprint static coverage',sql_check)

def contrast():
 colors=j('design/tokens.json')['color']
 def lum(h):
  v=[int(h[i:i+2],16)/255 for i in [1,3,5]];v=[x/12.92 if x<=.04045 else ((x+.055)/1.055)**2.4 for x in v]
  return .2126*v[0]+.7152*v[1]+.0722*v[2]
 ratios={}
 for a,b in [('ink','background'),('inkMuted','background'),('brand','surface'),('accent','background'),('surface','brand')]:
  x,y=sorted([lum(colors[a]),lum(colors[b])]);ratio=(y+.05)/(x+.05);truth(ratio>=4.5,'contrast fails '+a+'/'+b);ratios[a+'/'+b]=round(ratio,2)
 return {'textPairs':ratios,'scope':'Token pair ratios, not comprehensive accessibility audit.'}
check('Core text-token contrast',contrast)

def truth_states():
 truth(all(x['status']=='TODO' for x in tasks),'initial tasks should be TODO')
 truth(all(x['status']=='NOT_RUN' for x in tests),'application tests not NOT_RUN')
 truth(all(x['status']=='PENDING' for x in j('state/APPROVALS.json')['approvals']),'unapproved human gate changed')
 return 'Application is not implemented; no false PASS/approval in initial state.'
check('Initial status honesty',truth_states)

def present():
 names=['README.md','START_HERE.md','AGENTS.md','OWNER_HANDBOOK.docx','design/preview.html','prompts/START-CODEX.txt','prompts/CONTINUE.txt','state/PROGRESS.md','state/ENVIRONMENT.md','state/BLOCKERS.md','state/HUMAN_ACTIONS.md','state/TEST_REPORT.md','state/HANDOFF.md']
 for name in names:truth((R/name).is_file(), 'missing '+name)
 truth(len(list((R/'docs').glob('[0-9][0-9]_*.md')))==32,'docs count mismatch')
 truth(not any(p.suffix.lower() in ['.ttf','.otf','.woff','.woff2'] for p in R.rglob('*')),'font files should not be shipped')
 return {'mainDocuments':32,'requiredEntryFiles':len(names),'fontFiles':0}
check('Deliverable presence',present)
if shutil.which('tsc'):
 def typecheck():
  c=subprocess.run(['tsc','--noEmit','--strict','--skipLibCheck','--target','ES2022',str(R/'contracts/domain.types.ts')],capture_output=True,text=True,timeout=35)
  truth(c.returncode==0,c.stdout+c.stderr)
  return 'DTO-only TypeScript compile. Not Next app build, lint or runtime validation.'
 check('DTO TypeScript compile',typecheck)
else:checks.append({'name':'DTO TypeScript compile','status':'NOT_RUN','detail':'tsc not present'})
report={'packageVersion':'1.0','checkedAtUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'DOCUMENTATION_FIXTURE_PROTOTYPE_ONLY','applicationStatus':'NOT_IMPLEMENTED_NOT_TESTED','productionStatus':'NOT_DEPLOYED','status':'FAIL' if any(c['status']=='FAIL' for c in checks) else 'PASS','checks':checks}
(R/'PACKAGE_VALIDATION.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
for c in checks:print(c['status'],c['name'],str(c['detail'])[:220])
print('PACKAGE:',report['status'])
raise SystemExit(1 if report['status']=='FAIL' else 0)