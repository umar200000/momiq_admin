const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function setup(){
  class E{constructor(tag,text=''){this.tag=tag;this.textContent=text;this.children=[];this.value='';this.hidden=false;this.disabled=false;this.classList={toggle(){}};}append(...items){this.children.push(...items);}replaceChildren(...items){this.children=items;}setAttribute(){}}
  const nodes=new Map(),calls=[];const get=id=>{if(!nodes.has(id))nodes.set(id,new E('div'));return nodes.get(id);};
  const context=vm.createContext({AbortController,URLSearchParams,structuredClone,document:{querySelector:get,createElement:tag=>new E(tag),addEventListener(){}},setInterval(){},setTimeout(){},clearTimeout(){},crypto:{randomUUID:()=> 'TEST-stable-request'}});
  context.fetch=async(path,options)=>{calls.push({path,method:options.method,body:options.body&&JSON.parse(options.body)});return {ok:true,status:200,json:async()=>context.response};};
  vm.runInContext(fs.readFileSync('app.js','utf8'),context);
  return {context,get,calls,all:node=>[node,...node.children.flatMap(function walk(n){return [n,...n.children.flatMap(walk)];})]};
}
const reason='TEST operator reason',revision=3;
const cases=[
  {id:'K01',path:'users/test-user',method:'PUT',body:{blocked:true,_revision:3,reason},good:{ok:true},bad:[{ok:false},{ok:'true'},{ok:1}]},
  {id:'K02',path:'messages/21',method:'DELETE',body:{reason},good:{ok:true},bad:[{ok:false},{ok:'true'}]},
  {id:'K03',path:'listings/test-user/boarding/review',body:{decision:'approve',reason,testOnly:true,_revision:3},good:{_revision:4,listings:[{type:'boarding'}],moderation:{boarding:{status:'approved',reason,testOnly:true}}},mutations:[r=>r._revision=3,r=>r.moderation.boarding.status='pending',r=>r.moderation.boarding.reason='Other',r=>r.listings=[],r=>r.moderation={homeVisit:{status:'approved',reason,testOnly:true}}]},
  {id:'K04',path:'platform-settings',method:'PUT',body:{version:3,commissionBps:1000,qrImage:null,testOnly:true,qrActive:false,recipientName:'TEST recipient',paymentInstructions:'TEST instructions',reason},good:{version:4,commissionBps:1000,qrImage:null,testOnly:true,qrActive:false,recipientName:'TEST recipient',paymentInstructions:'TEST instructions',currency:'UZS',provider:'paynet_xolis'},mutations:[r=>r.version=3,r=>r.commissionBps=2000,r=>r.qrActive=true,r=>r.recipientName='Other',r=>r.testOnly='true']},
  {id:'K05',path:'topups/test-topup/review',body:{revision,decision:'approve',reason,receivedAmountMinor:1500000,transferReference:'test-reference',fundsVerified:true},good:{topup:{id:'test-topup',revision:4,status:'approved',reviewReason:reason,amountMinor:1500000,transferReference:'TEST-REFERENCE'}},mutations:[r=>r.topup.id='other',r=>r.topup.revision=3,r=>r.topup.amountMinor=150,r=>r.topup.status='rejected',r=>r.topup.transferReference='Other']},
  {id:'K06',path:'topups/test-topup/corrections',body:{amountMinor:100,expectedCorrectedMinor:0,reason,requestId:'TEST-correction'},good:{correction:{id:'correction',topupId:'test-topup',entryId:'entry',originalEntryId:'original',amountMinor:100,reason}},mutations:[r=>r.correction.topupId='other',r=>r.correction.amountMinor=101,r=>r.correction.reason='Other',r=>delete r.correction.entryId]},
  {id:'K07',path:'reviews/21/moderate',body:{revision,hidden:true,reason,requestId:'TEST-review'},good:{ok:true},bad:[{ok:false},{ok:'true'}]},
  {id:'K08',path:'chat-reports/21/review',body:{revision,decision:'remove',reason},good:{id:'21',revision:4,status:'removed',reviewReason:reason},mutations:[r=>r.id='22',r=>r.revision=3,r=>r.status='dismissed',r=>r.reviewReason='Other']},
  {id:'K09',path:'disputes/test-booking/resolve',body:{revision,bookingRevision:6,requestId:'TEST-dispute',outcome:'not_started',fault:'sitter',emergency:false,refundMinor:100,reason},good:{bookingId:'test-booking',case:{bookingId:'test-booking',revision:4,status:'resolved',outcome:'not_started',refundMinor:100,reason}},mutations:[r=>r.bookingId='other',r=>r.case.bookingId='other',r=>r.case.revision=3,r=>r.case.status='open',r=>r.case.outcome='continue',r=>r.case.refundMinor=0]},
  {id:'K10',path:'incidents/test-booking/test%20user/excuse',body:{revision,requestId:'TEST-incident',excused:true,reason},good:{incident:{booking_id:'test-booking',user_id:'test user',revision:4,excused:1},count30Days:2,reviewRequired:false},mutations:[r=>r.incident.user_id='other',r=>r.incident.booking_id='other',r=>r.incident.revision=3,r=>r.incident.excused=0,r=>r.count30Days=-1,r=>r.reviewRequired=true]},
  ...[false,true].map(escalate=>({id:escalate?'K12':'K11',path:'work-queue/support/test-ticket'+(escalate?'/escalate':''),body:{revision,sourceRevision:1,assignee:'TEST operator',dueAt:'2026-11-12T10:00:00.000Z',reason,requestId:'TEST-assignment'},good:{event:{id:'31',revision:4,reason,after:{assignee:'TEST operator',dueAt:'2026-11-12T10:00:00+00:00',...(escalate?{escalated:true}:{})}},assignment:{revision:4}},mutations:[r=>r.event.revision=3,r=>r.event.after.assignee='other',r=>r.event.after.dueAt=null,r=>r.event.after.dueAt='invalid',r=>r.event.reason='Other',r=>r.event.after.escalated=!escalate,r=>r.assignment.revision=3]})),
];
const request=item=>structuredClone({path:item.path,method:item.method,body:item.body});
async function call(s,item,response){s.context.response=response;s.context.input=request(item);return vm.runInContext("api(input.path,input.method||'POST',input.body)",s.context);}
for(const item of cases)test(item.id+' accepts its server receipt and rejects malformed, stale or contradictory 2xx responses',async()=>{
  const s=setup();assert.deepEqual(await call(s,item,item.good),item.good);
  const invalid=[undefined,null,[],true,'ok',{},...(item.bad||[])];
  for(const mutate of item.mutations||[]){const copy=structuredClone(item.good);mutate(copy);invalid.push(copy);}
  for(const response of invalid)await assert.rejects(call(s,item,response),error=>error.code==='unconfirmed'&&error.status===undefined);
  assert.deepEqual(await call(s,item,item.good),item.good,'a correct explicit retry still succeeds');
});

test('assignment retry acknowledges the original event even when current assignment has moved on',async()=>{
  const s=setup();for(const item of cases.filter(c=>['K11','K12'].includes(c.id))){const response=structuredClone(item.good);response.assignment={revision:9,assignee:'LATER operator',dueAt:null};assert.deepEqual(await call(s,item,response),response);}
});

test('alternate decisions and cleared assignments accept their matching receipts',async()=>{
  const s=setup();
  for(const [decision,status] of [['reject','rejected'],['suspend','suspended']]){
    const item=cases.find(c=>c.id==='K03'),body={...item.body,decision,testOnly:false};
    await call(s,{...item,body},{...item.good,moderation:{boarding:{status,reason,testOnly:false}}});
  }
  for(const [decision,status] of [['reject','rejected'],['request_info','needs_info']]){
    const item=cases.find(c=>c.id==='K05');await call(s,{...item,body:{revision,decision,reason}},{topup:{id:'test-topup',revision:4,status,reviewReason:reason}});
  }
  const report=cases.find(c=>c.id==='K08');await call(s,{...report,body:{...report.body,decision:'dismiss'}},{...report.good,status:'dismissed'});
  for(const outcome of ['continue','cancel_service']){
    const item=cases.find(c=>c.id==='K09');await call(s,{...item,body:{...item.body,outcome,refundMinor:0,fault:'none'}},{...item.good,case:{...item.good.case,outcome,refundMinor:0}});
  }
  const incident=cases.find(c=>c.id==='K10');await call(s,{...incident,body:{...incident.body,excused:false}},{...incident.good,incident:{...incident.good.incident,excused:0},count30Days:3,reviewRequired:true});
  const assignment=cases.find(c=>c.id==='K11');await call(s,{...assignment,body:{...assignment.body,assignee:null,dueAt:null}},{...assignment.good,event:{...assignment.good.event,after:{assignee:null,dueAt:null}}});
});

test('write confirmation compares the serialized request, not a form object changed while fetch waits',async()=>{
  const s=setup(),item=cases.find(c=>c.id==='K08');s.context.input=request(item);
  let finish;s.context.fetch=async()=>new Promise(resolve=>finish=resolve);
  const saving=vm.runInContext("api(input.path,'POST',input.body)",s.context);
  s.context.input.body.decision='dismiss';s.context.input.body.revision=100;
  finish({ok:true,status:200,json:async()=>item.good});assert.deepEqual(await saving,item.good);
});

test('unconfirmed assignment and escalation keep the form and identical retry, with no reload',async()=>{
  for(const escalate of [false,true]){
    const s=setup();vm.runInContext("state.operator={username:'TEST operator',role:'support'}",s.context);vm.runInContext(fs.readFileSync('work_queue.js','utf8'),s.context);
    s.context.detail={kind:'support',source:{target:'test-ticket',title:'TEST ticket',active:true,revision:1,status:'open'},assignment:{revision:3,assignee:null,dueAt:'2026-11-12T10:00:00.000Z'},items:[],nextCursor:null};
    s.context.reloads=0;
    const code=escalate?"renderWorkEscalation($('#chatPanel'),detail,[{username:'TEST operator',role:'administrator'}],()=>true,async()=>++reloads)":"renderWorkDetail($('#chatPanel'),detail,[],()=>true,async()=>++reloads)";
    vm.runInContext(code,s.context);const nodes=s.all(s.get('#chatPanel')),form=nodes.find(n=>n.tag==='form'),reasonInput=nodes.find(n=>n.tag==='textarea'),person=nodes.find(n=>n.tag==='select');
    reasonInput.value=reason;if(person)person.value='TEST operator';s.context.response={};
    await form.onsubmit({preventDefault(){}});assert.equal(s.context.reloads,0);assert.equal(reasonInput.value,reason);assert.equal(reasonInput.disabled,true);assert.match(s.get('#notice').textContent,/tasdiqlanmadi/);
    reasonInput.value='EDIT AFTER UNCERTAINTY';s.context.response=cases.find(c=>c.id===(escalate?'K12':'K11')).good;
    await form.onsubmit({preventDefault(){}});assert.equal(s.context.reloads,1);assert.deepEqual(s.calls[0].body,s.calls[1].body);assert.equal(s.calls.length,2);
  }
});

test('GET responses and independently contracted writes are not mistaken for these receipts',async()=>{
  const s=setup();await call(s,{path:'topups/test-topup/review',method:'GET'},{});await call(s,{path:'support/test-ticket',body:{}},{ticket:{id:'test-ticket'}});
});

test('QR confirmation must match the submitted image, including clearing an inactive QR',async()=>{
  const s=setup(),item=cases.find(c=>c.id==='K04');await assert.rejects(call(s,item,{...item.good,qrImage:'OTHER QR'}),{code:'unconfirmed'});
  const uploaded={...item,body:{...item.body,qrImage:'TEST QR'}};await call(s,uploaded,{...item.good,qrImage:'TEST QR'});
  await assert.rejects(call(s,uploaded,item.good),{code:'unconfirmed'});
});

test('unconfirmed legacy delete preserves the message and retries with its original reason',async()=>{
  const s=setup();let prompts=0;s.context.prompt=()=>{prompts++;return reason;};s.context.reloads=0;
  vm.runInContext("state.selected='test-user';state.tab='chat';state.sitter='test-sitter';state.messages=[{id:'21',sitter:'test-sitter',text:'TEST message',time:'2026-11-12'}];refreshChat=async()=>++reloads;drawMessages()",s.context);
  const button=s.all(s.get('#messages')).find(n=>n.tag==='button');s.context.response={};await button.onclick();
  assert.equal(s.context.reloads,0);assert.equal(vm.runInContext('state.messages.length',s.context),1);assert.equal(button.disabled,false);assert.match(button.textContent,/qayta/);
  s.context.response={ok:true};await button.onclick();assert.equal(s.context.reloads,1);assert.equal(prompts,1);assert.deepEqual(s.calls[0].body,s.calls[1].body);
});

// Optional local compatibility probe: captures come from synthetic Python HTTP
// tests, never from live users. The ordinary CI tests above remain self-contained.
if(process.env.MOMIQ_WRITE_RECEIPTS)test('captured backend responses satisfy the admin write contracts',async()=>{
  const rows=JSON.parse(fs.readFileSync(process.env.MOMIQ_WRITE_RECEIPTS,'utf8')),s=setup();
  assert.ok(rows.length>=12);for(const row of rows)await call(s,row,row.data);
});
