const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function setup(respond){
  class E{constructor(tag,text){this.tag=tag;this.textContent=text||'';this.children=[];this.hidden=false;this.classList={toggle(){}};}append(...v){this.children.push(...v);}replaceChildren(...v){this.children=v;}}
  const nodes=new Map(),get=id=>{if(!nodes.has(id))nodes.set(id,new E('div'));return nodes.get(id);};
  const context=vm.createContext({state:{},$:get,el:(tag,text)=>new E(tag,text),api:respond});
  vm.runInContext(fs.readFileSync('metrics.js','utf8'),context);
  return {context,get,text:n=>[n.textContent,...n.children.map(child=>[child.textContent,...child.children.flatMap(v=>[v.textContent,...v.children.map(w=>w.textContent)])].join(' '))].join(' ')};
}
const report=()=>({period:'all_time',currency:'UZS',minorUnitScale:100,scope:'finance',asOf:'2026-10-29T10:00:00+00:00',wallet:{topupCreditedMinor:'1000',commissionDebitedMinor:'100',commissionRefundedMinor:'20',correctionDebitedMinor:'5',totalBalanceMinor:'9007199254740993'},topups:{pending:1,needs_info:0,approved:2,rejected:1},oldestPendingTopupSeconds:null});

test('finance report preserves large exact money, labels evidence decisions and uses a fixed private export',async()=>{
  const s=setup(async()=>report());await vm.runInContext('openMetrics()',s.context);
  const text=s.text(s.get('#chatPanel'));
  assert.match(text,/Momiq balans jurnalidan/);assert.match(text,/bankdagi to‘lov muvaffaqiyatsiz/);
  assert.equal(vm.runInContext("metricMoney('9007199254740993')",s.context).replace(/\D/g,''),'9007199254740993');
  assert.throws(()=>vm.runInContext("metricMoney('1e9')",s.context));
  const links=s.get('#chatPanel').children[0].children.filter(n=>n.tag==='a');
  assert.equal(links.length,1);assert.equal(links[0].href,'/api/admin/metrics.csv');
  assert.doesNotMatch(text,/Yordam murojaatlari|Buyurtmalarning hozirgi holati/);
});

test('failed or malformed reports allow retry instead of displaying zero success and late replies do not replace another panel',async()=>{
  const s=setup(async()=>{throw Error('TEST report unavailable');});await vm.runInContext('openMetrics()',s.context);
  assert.match(s.text(s.get('#chatPanel')),/TEST report unavailable/);
  assert.equal(s.get('#chatPanel').children[1].tag,'button');
  s.context.api=async()=>({});await vm.runInContext('openMetrics()',s.context);
  assert.match(s.text(s.get('#chatPanel')),/javobi noto‘g‘ri/);
  let finish;s.context.api=()=>new Promise(resolve=>finish=resolve);
  const pending=vm.runInContext('openMetrics()',s.context);
  vm.runInContext("state.panel='support'",s.context);s.get('#chatPanel').replaceChildren();
  finish(report());await pending;assert.equal(s.get('#chatPanel').children.length,0);
});

test('administrator sees operation counts and response times with explicit empty-queue ages',async()=>{
  const data={...report(),scope:'administrator',bookings:{pending:1,accepted:2,active:0,disputed:0,completed:0,cancelled:0,rejected:0,expired:0},support:{open:1,waiting_user:2,resolved:3},disputes:{open:0,resolved:0},oldestOpenSupportSeconds:null,overdueDisputes:0,respondedSupportTickets:2,averageSupportFirstResponseSeconds:120};
  const s=setup(async()=>data);await vm.runInContext('openMetrics()',s.context);
  const text=s.text(s.get('#chatPanel'));assert.match(text,/Buyurtmalarning hozirgi holati/);assert.match(text,/Yordam murojaatlari/);assert.match(text,/o‘rtacha vaqt: 2 daqiqa/);
  assert.match(text,/murojaatining yoshi: —/);
});
