const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function setup(target=null){
  class Element{constructor(tag,text){this.tag=tag;this.textContent=text||'';this.children=[];this.value='';this.hidden=false;this.disabled=false;this.style={};this.classList={toggle(){}};}append(...v){this.children.push(...v);}replaceChildren(...v){this.children=v;}setAttribute(){}}
  const nodes=new Map(),calls=[],notices=[];const get=id=>{if(!nodes.has(id))nodes.set(id,new Element('div'));return nodes.get(id);};let fail=false;
  const page={target,ticket:{id:'a'.repeat(32),subject:'TEST request',topic:'general',status:'open',revision:1},items:[{id:'1',authorRole:'owner',text:'<script>untrusted</script>',created:'TEST',action:'reply',hasImage:true}],nextCursor:null};
  const context=vm.createContext({state:{panel:'support'},chatReportGeneration:0,$:get,el:(tag,text)=>new Element(tag,text),crypto:require('node:crypto').webcrypto,source:v=>'data:image/png;base64,'+v,notice:t=>notices.push(t),readImage:async()=>null,api:async(path,method='GET',body)=>{calls.push({path,method,body});if(method==='POST'&&fail)throw Error('TEST response lost');return path.endsWith('/image')?{image:'TEST'}:page;},page});
  vm.runInContext(fs.readFileSync('support.js','utf8'),context);vm.runInContext("renderSupportThread($('#chatPanel'),page)",context);
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
