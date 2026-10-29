const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function setup(identity){
  class E{constructor(){this.children=[];this.value='';this.hidden=false;this.textContent='';this.classList={toggle(){}};}append(...v){this.children.push(...v);}replaceChildren(...v){this.children=v;}setAttribute(){}}
  const nodes=new Map(),calls=[],opened=[];
  const get=id=>{if(!nodes.has(id))nodes.set(id,new E());return nodes.get(id);};
  const context=vm.createContext({URLSearchParams,document:{addEventListener:(_,callback)=>queueMicrotask(callback),querySelector:get,createElement:()=>new E()},structuredClone,setInterval(){},setTimeout(){},clearTimeout(){},console,
    fetch:async(path,options)=>{calls.push(path);return {ok:true,json:async()=>path.endsWith('/me')?identity:{listings:[],users:[],sitters:{}}};},
    openSupport:async()=>{opened.push('support');},openWalletAdmin:async section=>{opened.push(section);}});
  vm.runInContext(fs.readFileSync('app.js','utf8'),context);
  return {context,get,calls,opened};
}

test('operator role is loaded before any private index and only granted panels are visible',async()=>{
  for(const [role,panels] of [['support',['support']],['finance',['topups']],['moderation',['listings','chatReports','reviews']]]){
    const s=setup({username:'<TEST operator>',role,panels});await tick();
    assert.equal(s.calls[0],'/api/admin/me');
    assert.equal(s.calls.some(path=>path.includes('/users')),false);
    for(const id of ['users','sitters','listings','topups','chatReports','bookings','disputes','support','reviews','settings'])assert.equal(s.get('#'+id+'Nav').hidden,!panels.includes(id));
    assert.match(s.get('#operatorIdentity').textContent,/<TEST operator>/);
    assert.equal(s.get('#app').hidden,false);
    if(role!=='moderation')assert.deepEqual(s.opened,panels);
  }
});

test('missing access never falls back to full admin, 401 clears private views and late data is discarded',async()=>{
  const invalid=setup({username:'TEST',role:'unknown',panels:[]});await tick();
  assert.equal(invalid.get('#app').hidden,true);assert.deepEqual(invalid.calls,['/api/admin/me']);
  const s=setup({username:'TEST support',role:'support',panels:['support']});await tick();
  let finish;s.context.fetch=()=>new Promise(resolve=>finish=resolve);
  const old=vm.runInContext("api('support')",s.context);
  const rejected=assert.rejects(old,/Sessiya/);
  vm.runInContext('resetAdminView()',s.context);
  finish({ok:true,json:async()=>({items:['PRIVATE TEST']})});await rejected;
  for(const id of ['userList','detail','chatPanel','walletPanel'])assert.equal(s.get('#'+id).children.length,0);
  s.context.fetch=async()=>({ok:false,status:401,json:async()=>({error:'Expired TEST session'})});
  await assert.rejects(vm.runInContext("api('me')",s.context),/Expired TEST session/);
  assert.equal(s.get('#app').hidden,true);assert.equal(s.get('#login').hidden,false);
});
