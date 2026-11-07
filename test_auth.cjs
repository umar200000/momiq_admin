const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function setup(){
  class E{constructor(tag){this.tag=tag;this.children=[];this.value='';this.hidden=false;this.disabled=false;this.classList={toggle(){}};}append(...v){this.children.push(...v);}replaceChildren(...v){this.children=v;}setAttribute(){}}
  const nodes=new Map(),pending=[],get=id=>{if(!nodes.has(id))nodes.set(id,new E('div'));return nodes.get(id);};
  const form=get('#loginForm'),button=new E('button');form.querySelector=()=>button;form.username=new E('input');form.password=new E('input');
  const timers=new Map();let timerId=0;
  const context=vm.createContext({AbortController,document:{querySelector:get,createElement:tag=>new E(tag),addEventListener(){}},URLSearchParams,structuredClone,setInterval(){},setTimeout(callback,delay){const id=++timerId;timers.set(id,{callback,delay});return id;},clearTimeout(id){timers.delete(id);},fetch:async(path,options)=>new Promise(resolve=>pending.push({path,options,reply:(data,status=200)=>resolve({ok:status<400,status,json:async()=>data})}))});
  vm.runInContext(fs.readFileSync('app.js','utf8'),context);
  const login=()=>form.onsubmit({target:form,preventDefault(){}});
  const deadlines=()=>[...timers.values()].filter(t=>t.delay===60000);
  return {context,get,pending,form,button,login,deadlines};
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

test('malformed unauthorized response clears private state with a retryable login error',async()=>{
  for(const invalid of ['html','null']){
    const s=setup();vm.runInContext("state.operator={username:'TEST'};state.panel='accounts';state.messages=[{text:'PRIVATE'}]",s.context);
    s.get('#app').hidden=false;s.get('#chatPanel').append({textContent:'PRIVATE'});
    s.context.fetch=async()=>({ok:false,status:401,json:async()=>{
      if(invalid==='html')throw SyntaxError('PRIVATE upstream response');return null;
    }});
    await assert.rejects(vm.runInContext("api('me')",s.context),error=>error.status===401&&!error.message.includes('PRIVATE'));
    assert.equal(s.get('#app').hidden,true);
    assert.equal(vm.runInContext('state.messages.length',s.context),0);
    assert.equal(s.get('#chatPanel').children.length,0);
    assert.equal(vm.runInContext('state.operator',s.context),null);
  }
});

test('late malformed unauthorized body cannot clear a newer operator session',async()=>{
  const s=setup();let release;
  s.context.fetch=async()=>({ok:false,status:401,json:()=>new Promise((_,reject)=>release=()=>reject(SyntaxError('PRIVATE old response')))});
  const reading=vm.runInContext("api('me')",s.context);await tick();
  vm.runInContext("resetAdminView();state.operator={username:'NEW'};state.panel='accounts';state.messages=[{text:'NEW PRIVATE'}]",s.context);
  s.get('#app').hidden=false;release();
  await assert.rejects(reading,/Sessiya o‘zgardi/);
  assert.equal(vm.runInContext('state.operator.username',s.context),'NEW');
  assert.equal(vm.runInContext('state.messages.length',s.context),1);
  assert.equal(s.get('#app').hidden,false);
});

test('unauthorized headers clear private state before a stalled response body finishes',async()=>{
  const s=setup();let release;
  vm.runInContext("state.operator={username:'TEST'};state.panel='accounts';state.messages=[{text:'PRIVATE'}]",s.context);
  s.get('#app').hidden=false;
  s.context.fetch=async()=>({ok:false,status:401,json:()=>new Promise(resolve=>release=resolve)});
  const reading=vm.runInContext("api('me')",s.context);await tick();
  try{
    assert.equal(s.get('#app').hidden,true);
    assert.equal(vm.runInContext('state.messages.length',s.context),0);
    assert.equal(vm.runInContext('state.operator',s.context),null);
  }finally{
    release({error:'TEST session ended'});
    await assert.rejects(reading,error=>error.status===401);
  }
});

test('invalid success or server-error JSON preserves the view and omits raw parser contents',async()=>{
  for(const status of [200,503]){
    const s=setup();vm.runInContext("state.operator={username:'TEST'};state.panel='accounts'",s.context);
    s.get('#app').hidden=false;
    s.context.fetch=async()=>({ok:status===200,status,json:async()=>{throw SyntaxError('PRIVATE upstream response')}});
    await assert.rejects(vm.runInContext("api('me')",s.context),error=>!error.message.includes('PRIVATE'));
    assert.equal(vm.runInContext('state.operator.username',s.context),'TEST');
    assert.equal(s.get('#app').hidden,false);
  }
});

test('login timeout aborts transport, enables retry and never repeats credentials automatically',async()=>{
  const s=setup();let signal,calls=0;
  s.form.username.value='TEST';s.form.password.value='PRIVATE password';
  s.context.fetch=(_,options)=>{calls++;signal=options.signal;return new Promise((_,reject)=>signal?.addEventListener('abort',()=>reject(Error('PRIVATE transport failure'))));};
  const signing=s.login();await tick();
  assert.equal(s.button.disabled,true);assert.equal(s.deadlines().length,1);
  s.deadlines()[0].callback();await signing;
  assert.equal(signal.aborted,true);assert.equal(s.button.disabled,false);
  assert.equal(s.form.password.value,'');assert.equal(calls,1);assert.equal(s.deadlines().length,0);
  assert.match(s.get('#notice').textContent,/vaqtda/);
  assert.doesNotMatch(s.get('#notice').textContent,/PRIVATE/);
});

test('one deadline covers stalled body and preserves authoritative unauthorized status',async()=>{
  for(const status of [200,401]){
    const s=setup();let signal;
    vm.runInContext("state.operator={username:'TEST'};state.panel='accounts'",s.context);
    s.get('#app').hidden=false;
    s.context.fetch=async(_,options)=>{signal=options.signal;return {status,ok:status===200,json:()=>new Promise((_,reject)=>signal?.addEventListener('abort',()=>reject(Error('PRIVATE body failure'))))};};
    const reading=vm.runInContext("api('me')",s.context);await tick();
    assert.equal(s.deadlines().length,1);s.deadlines()[0].callback();
    await assert.rejects(reading,error=>status===401?error.status===401:error.code==='timeout');
    assert.equal(signal.aborted,true);assert.equal(s.deadlines().length,0);
    assert.equal(s.get('#app').hidden,status===401);
  }
});

test('timed out writes report uncertain outcome without resubmitting or clearing the current view',async()=>{
  const s=setup();let calls=0;
  vm.runInContext("state.operator={username:'TEST'};state.panel='accounts'",s.context);s.get('#app').hidden=false;
  s.context.fetch=(_,options)=>{calls++;return new Promise((_,reject)=>options.signal?.addEventListener('abort',()=>reject(Error('aborted'))));};
  const writing=vm.runInContext("api('users/TEST','PUT',{reason:'TEST draft'})",s.context);await tick();
  assert.equal(s.deadlines().length,1);s.deadlines()[0].callback();
  await assert.rejects(writing,error=>error.code==='timeout'&&/saqlangan bo‘lishi mumkin/.test(error.message));
  assert.equal(calls,1);assert.equal(s.get('#app').hidden,false);assert.equal(s.deadlines().length,0);
});

test('successful and rejected responses release request deadlines',async()=>{
  for(const status of [200,400]){
    const s=setup();const reading=vm.runInContext("api('me')",s.context);await tick();
    assert.equal(s.deadlines().length,1);s.pending[0].reply({error:'TEST rejected'},status);
    if(status===200)await reading;else await assert.rejects(reading,/TEST rejected/);
    assert.equal(s.deadlines().length,0);assert.equal(s.pending[0].options.signal.aborted,false);
  }
});

test('deadline cancels actual loopback fetch while headers or JSON body are stalled',async()=>{
  for(const phase of ['headers','body','unauthorized-body']){
    const s=setup();let received,headers;
    const requestSeen=new Promise(resolve=>received=resolve),headersSeen=new Promise(resolve=>headers=resolve);
    const server=require('node:http').createServer((req,res)=>{
      received();
      if(phase!=='headers'){
        res.writeHead(phase==='unauthorized-body'?401:200,{'Content-Type':'application/json'});
        res.write('{"unfinished":');
      }
    });
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    try{
      s.context.fetch=async(path,options)=>{
        const response=await fetch('http://127.0.0.1:'+server.address().port+path,options);
        headers();return response;
      };
      const reading=vm.runInContext("api('me')",s.context);
      await requestSeen;if(phase!=='headers')await headersSeen;await tick();
      assert.equal(s.deadlines().length,1);s.deadlines()[0].callback();
      await assert.rejects(reading,error=>phase==='unauthorized-body'?error.status===401:error.code==='timeout');
      assert.equal(s.deadlines().length,0);
    }finally{
      server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
    }
  }
});
