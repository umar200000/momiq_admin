const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function setup(){
  class E{constructor(tag){this.tag=tag;this.children=[];this.value='';this.hidden=false;this.disabled=false;this.classList={toggle(){}};}append(...v){this.children.push(...v);}replaceChildren(...v){this.children=v;}setAttribute(){}}
  const nodes=new Map(),pending=[],get=id=>{if(!nodes.has(id))nodes.set(id,new E('div'));return nodes.get(id);};
  const form=get('#loginForm'),button=new E('button');form.querySelector=()=>button;form.username=new E('input');form.password=new E('input');
  const context=vm.createContext({document:{querySelector:get,createElement:tag=>new E(tag),addEventListener(){}},URLSearchParams,structuredClone,setInterval(){},setTimeout(){},clearTimeout(){},fetch:async(path,options)=>new Promise(resolve=>pending.push({path,options,reply:(data,status=200)=>resolve({ok:status<400,status,json:async()=>data})}))});
  vm.runInContext(fs.readFileSync('app.js','utf8'),context);
  const login=()=>form.onsubmit({target:form,preventDefault(){}});
  return {context,get,pending,form,button,login};
}
test('login invalidates startup identity and serializes duplicate login/logout requests',async()=>{
  const s=setup();const starting=vm.runInContext('startAdmin()',s.context);await tick();
  s.form.username.value='NEW';s.form.password.value='TEST ONLY';const logging=s.login();await tick();
  await s.login();await s.get('#logout').onclick();assert.equal(s.pending.length,2);
  assert.equal(s.form.password.value,'');assert.equal(s.button.disabled,true);
  s.pending[0].reply({username:'OLD',role:'administrator',panels:['users']});await starting;
  assert.equal(vm.runInContext('state.operator',s.context),null);assert.equal(s.get('#app').hidden,true);
  s.pending[1].reply({ok:true});await tick();assert.equal(s.pending[2].path,'/api/admin/me');
  s.pending[2].reply({username:'NEW',role:'administrator',panels:['users']});await tick();
  s.pending[3].reply({users:[],sitters:{},nextCursor:null});await logging;
  assert.equal(vm.runInContext('state.operator.username',s.context),'NEW');assert.equal(s.get('#app').hidden,false);assert.equal(s.button.disabled,false);
});
test('rejected credentials remain visible after API revokes the view and allow retry',async()=>{
  const s=setup();s.form.username.value='TEST';s.form.password.value='TEST wrong';const logging=s.login();await tick();
  s.pending[0].reply({error:'TEST invalid credentials'},401);await logging;
  assert.equal(s.get('#notice').textContent,'TEST invalid credentials');assert.equal(s.get('#app').hidden,true);
  assert.equal(s.button.disabled,false);assert.equal(s.get('#logout').disabled,false);
  const retry=s.login();await tick();assert.equal(s.pending.length,2);
  s.pending[1].reply({error:'TEST invalid credentials'},401);await retry;
});
test('logout serializes requests and clears private state only after confirmation',async()=>{
  const s=setup();vm.runInContext("state.operator={username:'TEST'};state.panel='accounts';state.messages=[{text:'PRIVATE'}]",s.context);
  const leaving=s.get('#logout').onclick();await tick();await s.get('#logout').onclick();await s.login();
  assert.equal(s.pending.length,1);assert.equal(s.pending[0].path,'/api/admin/logout');
  assert.equal(vm.runInContext('state.messages.length',s.context),1);
  s.pending[0].reply({ok:true});await leaving;
  assert.equal(vm.runInContext('state.messages.length',s.context),0);assert.equal(s.get('#app').hidden,true);assert.equal(s.get('#logout').disabled,false);
});
