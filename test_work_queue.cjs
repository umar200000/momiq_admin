const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function setup(role='support',respond=async()=>({items:[],nextCursor:null})){
  class E{constructor(tag,text){this.tag=tag;this.textContent=text||'';this.children=[];this.value='';this.hidden=false;this.disabled=false;this.classList={toggle(){}};}append(...v){this.children.push(...v);}replaceChildren(...v){this.children=v;}setAttribute(){}}
  const nodes=new Map(),calls=[],notices=[],opened=[];const get=id=>{if(!nodes.has(id))nodes.set(id,new E('div'));return nodes.get(id);};
  const context=vm.createContext({state:{operator:{role,username:'helper-one'}},$:get,el:(tag,text)=>new E(tag,text),notice:value=>notices.push(value),crypto:{randomUUID:()=> 'TEST stable request'},
    api:async(...args)=>{calls.push(args);return respond(...args);},openSupport:async id=>opened.push(['support',id]),openChatReports:async id=>opened.push(['chat',id])});
  vm.runInContext(fs.readFileSync('work_queue.js','utf8'),context);
  const all=(node)=>[node,...node.children.flatMap(all)];return {context,get,calls,notices,opened,all};
}
const detail=()=>({kind:'support',source:{target:'a'.repeat(32),title:'<TEST private subject>',status:'open',revision:1,active:1},assignment:{assignee:null,dueAt:'2026-10-29T10:00:11+00:00',revision:0,assigneeActive:false,overdue:true},items:[],nextCursor:null});
const open=s=>vm.runInContext("openWorkQueue('support','all','"+'a'.repeat(32)+"')",s.context);
test('staff claims only unassigned work and retries the identical frozen payload after an uncertain response',async()=>{
  const s=setup('support',async(path,method)=>{if(method==='POST')throw Error('TEST connection lost');return detail();});await open(s);
  const nodes=s.all(s.get('#chatPanel')),form=nodes.find(n=>n.tag==='form'),reason=nodes.find(n=>n.tag==='textarea');
  assert.equal(nodes.filter(n=>n.tag==='select'||n.type==='datetime-local').length,0);
  reason.value='TEST taking responsibility';await form.onsubmit({preventDefault(){}});reason.value='changed after uncertainty';await form.onsubmit({preventDefault(){}});
  const posts=s.calls.filter(c=>c[1]==='POST');assert.equal(posts.length,2);assert.deepEqual(posts[0][2],posts[1][2]);assert.equal(posts[0][2].assignee,'helper-one');assert.equal(posts[0][2].dueAt,detail().assignment.dueAt);assert.equal(posts[0][2].reason,'TEST taking responsibility');assert.equal(reason.disabled,true);
  assert.equal(s.calls.some(c=>c[0].includes('/operators')),false);
  await nodes.find(n=>n.textContent==='Murojaat va javob / qarorni ochish').onclick();assert.deepEqual(s.opened,[['support','a'.repeat(32)]]);
});
test('administrator preserves exact deadline seconds, conflict requires refresh and closed history remains readable',async()=>{
  let data=detail();const s=setup('administrator',async(path,method)=>{if(method==='POST'){const e=Error('Changed');e.status=409;throw e;}if(path.includes('/operators'))return {items:[{username:'helper-one'}]};return data;});await open(s);
  let nodes=s.all(s.get('#chatPanel')),form=nodes.find(n=>n.tag==='form');nodes.find(n=>n.tag==='select').value='helper-one';nodes.find(n=>n.tag==='textarea').value='TEST assigned';
  await form.onsubmit({preventDefault(){}});assert.equal(s.calls.at(-1)[2].dueAt,data.assignment.dueAt);assert.equal(nodes.find(n=>n.type==='submit').textContent,'Holatni qayta yuklash');
  data={...data,source:{...data.source,active:0,status:'resolved'},items:[{id:'1',revision:1,actor:'TEST actor',reason:'<script>TEST reason</script>',created:'2026-10-29T11:00:00Z',before:{assignee:null,dueAt:null},after:{assignee:'helper-one',dueAt:null}}]};
  await form.onsubmit({preventDefault(){}});assert.equal(s.calls.filter(c=>c[1]==='POST').length,1);nodes=s.all(s.get('#chatPanel'));assert.equal(nodes.some(n=>n.tag==='form'),false);assert.equal(nodes.find(n=>n.textContent.includes('<script>')).tag,'p');
});
test('role scope, filter pagination and late replies cannot leak across panels',async()=>{
  const finance=setup('finance');await vm.runInContext('openWorkQueue()',finance.context);assert.equal(finance.calls.length,0);
  const data=detail();const s=setup('support',async path=>({items:[data],nextCursor:path.includes('after=')?null:data.source.target}));await vm.runInContext("openWorkQueue('support','mine')",s.context);
  const more=s.all(s.get('#chatPanel')).find(n=>n.textContent==='Yana');await more.onclick();assert.match(s.calls.at(-1)[0],/kind=support&filter=mine&after=/);assert.equal(more.hidden,true);
  let finish;s.context.api=()=>new Promise(resolve=>finish=resolve);const pending=vm.runInContext('openWorkQueue()',s.context);s.context.state.panel='metrics';s.get('#chatPanel').replaceChildren();finish({items:[data],nextCursor:null});await pending;assert.equal(s.get('#chatPanel').children.length,0);
});


test('content escalation lists only administrator choices and retries the exact handoff',async()=>{
  const data={...detail(),canEscalate:true};const s=setup('support',async(path,method)=>{
    if(method==='POST')throw Error('TEST response lost');
    if(path.endsWith('/escalation-operators'))return {items:[{username:'manager',role:'administrator'},{username:'hidden-helper',role:'support'}]};return data;
  });await open(s);
  const nodes=s.all(s.get('#chatPanel')),form=nodes.find(n=>n.tag==='form'),inputs=s.all(form),person=inputs.find(n=>n.tag==='select'),reason=inputs.find(n=>n.tag==='textarea');
  assert.equal(person.children.some(n=>n.value==='hidden-helper'),false);person.value='manager';reason.value='TEST appeal requires administrator';
  await form.onsubmit({preventDefault(){}});person.value='changed';reason.value='changed';await form.onsubmit({preventDefault(){}});
  const posts=s.calls.filter(c=>c[1]==='POST');assert.equal(posts.length,2);assert.equal(posts[0][0],'work-queue/support/'+'a'.repeat(32)+'/escalate');assert.deepEqual(posts[0][2],posts[1][2]);
  assert.equal(posts[0][2].assignee,'manager');assert.equal(posts[0][2].dueAt,data.assignment.dueAt);assert.equal(reason.disabled,true);
});

test('escalation conflict requires fresh source and late failures never mutate another panel',async()=>{
  const data={...detail(),canEscalate:true};let fail,finish;
  const s=setup('support',async(path,method)=>{if(method==='POST'){if(fail)throw Object.assign(Error('TEST stale'),{status:409});return new Promise(resolve=>finish=resolve);}return path.endsWith('/escalation-operators')?{items:[{username:'manager',role:'administrator'}]}:data;});
  await open(s);let nodes=s.all(s.get('#chatPanel')),form=nodes.find(n=>n.tag==='form');s.all(form).find(n=>n.tag==='select').value='manager';s.all(form).find(n=>n.tag==='textarea').value='TEST reason';fail=true;
  await form.onsubmit({preventDefault(){}});assert.equal(s.all(form).find(n=>n.type==='submit').textContent,'Holatni qayta yuklash');
  await form.onsubmit({preventDefault(){}});assert.equal(s.calls.filter(c=>c[1]==='POST').length,1);
  nodes=s.all(s.get('#chatPanel'));form=nodes.find(n=>n.tag==='form');s.all(form).find(n=>n.tag==='select').value='manager';s.all(form).find(n=>n.tag==='textarea').value='TEST refreshed reason';fail=false;
  const pending=form.onsubmit({preventDefault(){}});s.context.state.panel='metrics';s.get('#chatPanel').replaceChildren();finish({});await pending;
  assert.equal(s.get('#chatPanel').children.length,0);assert.equal(s.calls.filter(c=>c[1]==='POST').length,2);
});

test('no eligible administrator or capability cannot claim a successful handoff',async()=>{
  const s=setup('support',async path=>path.endsWith('/escalation-operators')?{items:[]}:{...detail(),canEscalate:true});await open(s);
  const form=s.all(s.get('#chatPanel')).find(n=>n.tag==='form');assert.equal(s.all(form).find(n=>n.type==='submit').disabled,true);
  await form.onsubmit({preventDefault(){}});assert.equal(s.calls.filter(c=>c[1]==='POST').length,0);
  const second=setup('support',async()=>detail());await open(second);assert.equal(second.calls.some(c=>c[0].endsWith('/escalation-operators')),false);
});
