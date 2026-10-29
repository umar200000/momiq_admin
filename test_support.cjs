const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function setup(target=null,canResolve=true,decisionContext=undefined){
  class Element{constructor(tag,text){this.tag=tag;this.textContent=text||'';this.children=[];this.value='';this.hidden=false;this.disabled=false;this.style={};this.classList={toggle(){}};}append(...v){this.children.push(...v);}replaceChildren(...v){this.children=v;}setAttribute(){}}
  const nodes=new Map(),calls=[],notices=[];const get=id=>{if(!nodes.has(id))nodes.set(id,new Element('div'));return nodes.get(id);};let fail=false;
  const page={target,canResolve,decisionContext:decisionContext===undefined&&target?.purpose==='appeal'&&canResolve?{version:'a'.repeat(64),snapshot:{kind:target.kind,id:target.id,status:'rejected'}}:decisionContext,ticket:{id:'a'.repeat(32),subject:'TEST request',topic:'general',status:'open',revision:1},items:[{id:'1',authorRole:'owner',text:'<script>untrusted</script>',created:'TEST',action:'reply',hasImage:true}],nextCursor:null};
  const context=vm.createContext({state:{panel:'support'},chatReportGeneration:0,$:get,el:(tag,text)=>new Element(tag,text),crypto:require('node:crypto').webcrypto,source:v=>'data:image/png;base64,'+v,notice:t=>notices.push(t),readImage:async()=>null,api:async(path,method='GET',body)=>{calls.push({path,method,body});if(method==='POST'&&fail)throw Error('TEST response lost');return path.endsWith('/image')?{image:'TEST'}:page;},page,live:true});
  vm.runInContext(fs.readFileSync('support.js','utf8'),context);vm.runInContext("renderSupportThread($('#chatPanel'),page,()=>live)",context);
  return {get,calls,notices,context,setFail:v=>fail=v};
}
test('private support history renders untrusted content as text and images load explicitly',async()=>{
  const {get,calls}=setup();const history=get('#chatPanel').children.find(n=>n.tag==='div'),card=history.children[0];
  assert.equal(card.children[1].textContent,'<script>untrusted</script>');assert.equal(card.children[1].tag,'p');assert.equal(calls.length,0);
  const button=card.children.find(n=>n.tag==='button');await button.onclick();assert.match(calls[0].path,/\/messages\/1\/image$/);assert.equal(button.hidden,true);
});
test('reply failure locks content and retries same revision and idempotency key',async()=>{
  const {get,calls,setFail}=setup();const form=get('#chatPanel').children.find(n=>n.tag==='form'),body=form.children[0].children[0],action=form.children[2];
  await form.onsubmit({preventDefault(){}});assert.equal(calls.length,0);
  body.value='TEST reason';action.value='resolve';setFail(true);
  await form.onsubmit({preventDefault(){}});assert.equal(body.disabled,true);assert.equal(action.disabled,true);
  await form.onsubmit({preventDefault(){}});assert.deepEqual(calls[0].body,calls[1].body);assert.equal(calls[0].body.action,'resolve');assert.equal(calls[0].body.revision,1);
});
test('moving to a different view ignores late support response',async()=>{
  const {context,get}=setup();let release;context.api=()=>new Promise(r=>release=r);
  const loading=vm.runInContext('openSupport()',context);context.state.panel='accounts';get('#chatPanel').replaceChildren('new view');
  release({items:[],nextCursor:null});await loading;assert.deepEqual(get('#chatPanel').children,['new view']);
});
test('reported source identity and historical text are inert and do not trigger moderation',()=>{
  const target={kind:'review',id:'19',capturedAt:'2026-10-29',snapshot:{text:'<img src=x onerror=alert(1)>',revision:1}};
  const {get,calls}=setup(target);const box=get('#chatPanel').children.find(n=>n.tag==='section');
  assert.equal(box.children[0].textContent,'Sharhga shikoyat');
  assert.match(box.children[1].textContent,/#19/);
  const snapshot=box.children.find(n=>n.tag==='pre');assert.deepEqual(JSON.parse(snapshot.textContent),target.snapshot);
  assert.equal(snapshot.children.length,0);assert.equal(calls.length,0);
});
test('appeal decision is inert and support cannot select resolve',()=>{
  const target={kind:'listing',id:'TEST:boarding',purpose:'appeal',snapshot:{reason:'<script>TEST</script>',sourceRevision:3}};
  for(const allowed of [false,true]){
    const {get,calls}=setup(target,allowed),panel=get('#chatPanel');
    const box=panel.children.find(n=>n.tag==='section');
    assert.equal(box.children[0].textContent,'Qarorni qayta ko‘rib chiqish');
    assert.deepEqual(JSON.parse(box.children.find(n=>n.tag==='pre').textContent),target.snapshot);
    const form=panel.children.find(n=>n.tag==='form');
    assert.deepEqual(form.children[2].children.map(n=>n.value),allowed?['reply','resolve']:['reply']);
    assert.equal(calls.length,0);
  }
});

test('obsolete private image failure does not notify or unlock another view',async()=>{
  const {context,get,notices}=setup();let reject;
  context.api=()=>new Promise((_,fail)=>reject=fail);
  const card=get('#chatPanel').children.find(n=>n.tag==='div').children[0];
  const button=card.children.find(n=>n.tag==='button'),opening=button.onclick();
  context.live=false;get('#chatPanel').replaceChildren('New account');
  reject(Error('Private old account failure'));await opening;
  assert.deepEqual(notices,[]);assert.deepEqual(get('#chatPanel').children,['New account']);
  assert.equal(button.disabled,true);
});

test('latest attachment wins and an older picker error cannot enable or replace it',async()=>{
  const {context,get,calls,notices}=setup();const pending=[];
  context.readImage=()=>new Promise((resolve,reject)=>pending.push({resolve,reject}));
  const form=get('#chatPanel').children.find(n=>n.tag==='form');
  const body=form.children[0].children[0],attachment=form.children[1],send=form.children[3];
  body.value='TEST reply';attachment.files=['old'];const old=attachment.onchange();
  attachment.files=['new'];const next=attachment.onchange();
  pending[0].reject(Error('Old file'));await old;
  assert.equal(send.disabled,true);assert.deepEqual(notices,[]);
  pending[1].resolve('NEW IMAGE');await next;
  assert.equal(send.disabled,false);
  await form.onsubmit({preventDefault(){}});
  assert.equal(calls.find(c=>c.method==='POST').body.image,'NEW IMAGE');
});

test('leaving while selecting a file prevents its use and later submission',async()=>{
  const {context,get,calls,notices}=setup();let finish;
  context.readImage=()=>new Promise(resolve=>finish=resolve);
  const form=get('#chatPanel').children.find(n=>n.tag==='form'),attachment=form.children[1];
  form.children[0].children[0].value='TEST old reply';attachment.files=['old'];
  const picking=attachment.onchange();context.live=false;finish('PRIVATE OLD IMAGE');await picking;
  await form.onsubmit({preventDefault(){}});
  assert.equal(calls.length,0);assert.deepEqual(notices,[]);
});

test('pending reply deduplicates submits and obsolete failure never unlocks new view',async()=>{
  const {context,get,notices}=setup();let reject;const sent=[];
  context.api=(path,method,body)=>{sent.push({path,method,body});return new Promise((_,fail)=>reject=fail);};
  const form=get('#chatPanel').children.find(n=>n.tag==='form'),send=form.children[3];
  form.children[0].children[0].value='TEST reply';
  const first=form.onsubmit({preventDefault(){}});
  await form.onsubmit({preventDefault(){}});assert.equal(sent.length,1);
  context.live=false;reject(Error('Old account failure'));await first;
  assert.deepEqual(notices,[]);assert.equal(send.disabled,true);
});

test('appeal closure binds captured decision and retries unchanged after uncertain failure',async()=>{
  const target={kind:'listing',id:'TEST:boarding',purpose:'appeal',snapshot:{reason:'Original'}};
  const s=setup(target),panel=s.get('#chatPanel'),form=panel.children.find(n=>n.tag==='form');
  const box=panel.children.find(n=>n.tag==='section');assert.equal(box.children.filter(n=>n.tag==='pre').length,2);
  form.children[0].children[0].value='TEST reviewed reason';form.children[2].value='resolve';s.setFail(true);
  await form.onsubmit({preventDefault(){}});s.context.page.decisionContext.version='b'.repeat(64);
  await form.onsubmit({preventDefault(){}});
  assert.equal(s.calls[0].body.decisionVersion,'a'.repeat(64));assert.deepEqual(s.calls[0].body,s.calls[1].body);
  assert.equal(panel.children.find(n=>n.textContent==='Qarorni qayta ko‘rish').hidden,true);
});

test('appeal with missing decision cannot resolve but can reply without fake metadata',async()=>{
  const s=setup({kind:'review',id:'2',purpose:'appeal',snapshot:{}},true,null);
  const form=s.get('#chatPanel').children.find(n=>n.tag==='form');form.children[0].children[0].value='TEST reply';
  assert.deepEqual(form.children[2].children.map(n=>n.value),['reply']);
  form.children[2].value='resolve';await form.onsubmit({preventDefault(){}});assert.equal(s.calls.length,0);
  form.children[2].value='reply';await form.onsubmit({preventDefault(){}});
  assert.equal('decisionVersion' in s.calls.find(c=>c.method==='POST').body,false);
});

test('definite stale appeal can reload decision while retaining reason and using a fresh request',async()=>{
  const s=setup({kind:'listing',id:'TEST:boarding',purpose:'appeal',snapshot:{}}),sent=[];
  s.context.api=async(path,method='GET',body)=>{if(method==='POST'){sent.push(body);const e=Error('TEST changed decision');e.status=409;throw e;}return s.context.page;};
  let form=s.get('#chatPanel').children.find(n=>n.tag==='form');form.children[0].children[0].value='RETAIN MY REASON';form.children[2].value='resolve';
  await form.onsubmit({preventDefault(){}});
  const reload=s.get('#chatPanel').children.find(n=>n.textContent==='Qarorni qayta ko‘rish');assert.equal(reload.hidden,false);
  s.context.page.decisionContext={version:'b'.repeat(64),snapshot:{status:'approved'}};
  await reload.onclick();form=s.get('#chatPanel').children.find(n=>n.tag==='form');
  assert.equal(form.children[0].children[0].value,'RETAIN MY REASON');assert.equal(form.children[2].value,'reply');
  form.children[2].value='resolve';await form.onsubmit({preventDefault(){}});
  assert.equal(sent[1].decisionVersion,'b'.repeat(64));assert.notEqual(sent[1].requestId,sent[0].requestId);
});

test('recorded appeal resolution remains inert historical text',()=>{
  const s=setup();s.context.page.items[0].resolution={snapshot:{decision:{reason:'<script>not HTML</script>'}},sourceEvent:'audit:7'};
  s.get('#chatPanel').replaceChildren();vm.runInContext("renderSupportThread($('#chatPanel'),page,()=>live)",s.context);
  const card=s.get('#chatPanel').children.find(n=>n.tag==='div').children[0],pre=card.children.find(n=>n.tag==='pre');
  assert.equal(pre.children.length,0);assert.match(pre.textContent,/<script>not HTML<\/script>/);assert.equal(s.calls.length,0);
});

test('content support handoff opens its own queue only from a current role-scoped view',async()=>{
  const s=setup({kind:'listing',id:'abc:boarding',purpose:'appeal',capturedAt:'TEST',snapshot:{status:'rejected'}},false);
  const opened=[];s.context.state.operator={role:'support'};s.context.openWorkQueue=(...args)=>opened.push(args);
  const render=()=>{s.get('#chatPanel').replaceChildren();vm.runInContext("renderSupportThread($('#chatPanel'),page,()=>live)",s.context);};render();
  const all=n=>[n,...n.children.flatMap(all)];let button=all(s.get('#chatPanel')).find(n=>n.textContent==='Ish navbati / administratorga yo‘naltirish');
  await button.onclick();assert.deepEqual(opened,[['support','all','a'.repeat(32)]]);
  s.context.live=false;await button.onclick();assert.equal(opened.length,1);
  s.context.live=true;s.context.state.operator.role='finance';render();assert.equal(all(s.get('#chatPanel')).some(n=>n.textContent==='Ish navbati / administratorga yo‘naltirish'),false);
});
