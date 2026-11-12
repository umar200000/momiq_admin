const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function setup(){
  class E{constructor(tag,text){this.tag=tag;this.textContent=text||'';this.children=[];this.value='';this.hidden=false;this.disabled=false;this.checked=false;this.classList={toggle(){}};}append(...v){this.children.push(...v);}replaceChildren(...v){this.children=v;}}
  const nodes=new Map(),calls=[],notices=[],confirmations=[];const get=id=>{if(!nodes.has(id))nodes.set(id,new E('div'));return nodes.get(id);};let fail=false,confirmed=false;
  const page={case:{bookingId:'a'.repeat(32),kind:'no_show',status:'open',priorStatus:'accepted',revision:2,deadline:'TEST deadline'},bookingRevision:3,customerId:'TEST customer',sitterId:'TEST sitter',refundableMinor:1500000,items:[{id:'1',role:'customer',action:'report',text:'<script>private</script>',created:'TEST time'}],nextCursor:null};
  const context=vm.createContext({state:{panel:'disputes'},chatReportGeneration:0,$:get,el:(tag,text)=>new E(tag,text),crypto:require('node:crypto').webcrypto,notice:t=>notices.push(t),walletMoney:n=>n/100+' UZS',parseMinor:(v)=>Math.round(Number(v)*100),walletImage:()=>new E('img'),walletField:(form,title)=>{const label=new E('label',title),input=new E('input');label.append(input);form.append(label);return input;},confirm:message=>{confirmations.push(message);return confirmed;},api:async(path,method='GET',body)=>{calls.push({path,method,body});if(method==='POST'&&fail)throw Error('TEST lost response');return page;},page});
  vm.runInContext(fs.readFileSync('disputes.js','utf8'),context);vm.runInContext("renderDispute($('#chatPanel'),page)",context);
  const form=get('#chatPanel').children.find(e=>e.tag==='form');
  return {context,get,form,calls,notices,confirmations,setFail:v=>fail=v,setConfirmed:v=>confirmed=v};
}
test('no default decision; evidence stays text and prior handover state is explicit',()=>{
  const {get,form}=setup();assert.equal(form.children[0].children[0].value,'');
  const card=get('#chatPanel').children.find(n=>n.tag==='div').children[0];assert.equal(card.children[1].tag,'p');assert.equal(card.children[1].textContent,'<script>private</script>');
  assert.ok(get('#chatPanel').children.some(n=>n.textContent.includes('avval accepted')));
});
test('full commission restoration requires reason and explicit decision confirmation; retry is immutable',async()=>{
  const {form,calls,confirmations,setConfirmed,setFail}=setup();const decision=form.children[0].children[0],fault=form.children[1].children[0],amount=form.children[3].children[0],reason=form.children[4].children[0];
  await form.onsubmit({preventDefault(){}});assert.equal(calls.length,0);
  decision.value='not_started';decision.onchange();assert.equal(amount.value,'15000.00');assert.equal(amount.disabled,true);fault.value='sitter';reason.value='TEST verified reason';
  await form.onsubmit({preventDefault(){}});assert.equal(calls.length,0);assert.equal(confirmations.length,1);
  setConfirmed(true);setFail(true);await form.onsubmit({preventDefault(){}});assert.equal(calls[0].body.refundMinor,1500000);assert.equal(calls[0].body.bookingRevision,3);assert.equal(reason.disabled,true);
  await form.onsubmit({preventDefault(){}});assert.deepEqual(calls[1].body,calls[0].body);assert.equal(confirmations.length,2);
});
test('continue decision clears fault/emergency and refunds zero',()=>{
  const {form}=setup();const decision=form.children[0].children[0],fault=form.children[1].children[0],emergency=form.children[2].children[0],amount=form.children[3].children[0];
  fault.value='sitter';emergency.checked=true;decision.value='continue';decision.onchange();
  assert.equal(fault.value,'none');assert.equal(emergency.checked,false);assert.equal(amount.value,'0');assert.equal(fault.disabled,true);
});
test('emergency exception preserves reason and exact retry without a financial request',async()=>{
  const {context,get,calls,setFail}=setup();context.incident={booking_id:'b'.repeat(32),user_id:'TEST sitter',kind:'late_cancellation',occurred_at:'TEST',revision:0,excused:0,count30Days:3,reviewRequired:true};
  vm.runInContext("renderIncident($('#incidents'),incident)",context);
  const card=get('#incidents').children[0],form=card.children.find(n=>n.tag==='form'),reason=form.children[0].children[0];
  reason.value='TEST emergency evidence';setFail(true);await form.onsubmit({preventDefault(){}});await form.onsubmit({preventDefault(){}});
  assert.deepEqual(calls[0].body,calls[1].body);assert.equal(calls[0].body.excused,true);assert.match(calls[0].path,/\/excuse$/);assert.equal('refundMinor' in calls[0].body,false);
});
