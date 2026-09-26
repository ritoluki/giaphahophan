/** Synthetic graph generator. No network or credentials. NOT an application load test. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const args = process.argv.slice(2);
const count = Number(args[0] ?? '10000');
const output = path.resolve(args[1] ?? 'benchmark-10000.json');
if (!Number.isInteger(count) || count < 100 || count > 50000) throw new Error('Count must be an integer from 100 to 50000.');
if (fs.existsSync(output)) throw new Error('Output already exists. Choose a new filename; this tool never overwrites.');
function id(key) {
  const b = crypto.createHash('sha256').update(`phan-benchmark:${key}`).digest().subarray(0,16);
  b[6]=(b[6]&15)|80; b[8]=(b[8]&63)|128;
  const h=b.toString('hex'); return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}
const persons = Array.from({length: count}, (_, k) => ({id:id(`person-${k+1}`),externalId:`BENCH-${String(k+1).padStart(6,'0')}`,displayName:`Phan Demo ${k+1}`,isFictional:true,lifeStatus:'unknown',visibility:'restricted'}));
const parentLinks = [];
for (let i=1;i<count;i++) parentLinks.push({id:id(`link-${i}`),parentId:persons[Math.floor((i-1)/3)].id,childId:persons[i].id,kind:'biological',status:'confirmed'});
const data={format:'benchmark_graph_v1',dataMode:'demo',isFictional:true,warning:'Synthetic graph only. Not real family history or proof of app performance.',persons,parentLinks};
fs.mkdirSync(path.dirname(output),{recursive:true});
fs.writeFileSync(output,JSON.stringify(data),'utf8');
console.log(JSON.stringify({output,persons:persons.length,parentLinks:parentLinks.length,status:'GENERATED_NOT_LOAD_TESTED'}));
