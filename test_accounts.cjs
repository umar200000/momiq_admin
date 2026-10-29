const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function setup(respond){
  class E{constructor(tag,text){this.tag=tag;this.textContent=text||'';this.children=[];this.value='';this.hidden=false;this.disabled=false;this.classList={toggle(){}};}append(...v){this.children.push(...v);}replaceChildren(...v){this.children=v;}setAttribute(){}}
  const nodes=new Map(),calls=[];const get=id=>{if(!nodes.has(id))nodes.set(id,new E('div'));return nodes.get(id);};
  const context=vm.createContext({document:{addEventListener:(_,callback)=>queueMicrotask(callback),querySelector:get,createElement:tag=>new E(tag)},URLSearchParams,structuredClone,console,setInterval(){},setTimeout(){},clearTimeout(){},fetch:async(path,options)=>{
    calls.push({path,method:options.method});return {ok:true,json:()=>path.endsWith('/me')?{username:'TEST operator',role:'administrator',panels:['users','sitters','listings']}:respond(path)};
  }});
  vm.runInContext(fs.readFileSync('app.js','utf8'),context);
  return {context,get,calls};
}
const summary=id=>({id,roles:['customer'],phone:'998000000001',blocked:false,created:'2026-01-01',_summary:true,account:{profile:{first:'TEST '+id,last:'User',photo:null}}});
const full=id=>({...summary(id),_summary:false,account:{_revision:4,profile:{first:'TEST '+id,last:'User',photo:null},favorites:[],addresses:[],pets:[]}});
const text=n=>[n.textContent,...n.children.map(text)].join(' ');

test('legacy removal requires an explicit reason and sends only that reason',async()=>{
  const s=setup(()=>({users:[],sitters:{}}));await tick();const writes=[];
  s.context.fetch=async(path,options)=>{writes.push({path,body:JSON.parse(options.body)});return {ok:true,json:async()=>({ok:true})};};
  vm.runInContext("state.sitter='TEST sitter';state.messages=[{id:'abc',sitter:'TEST sitter',mine:false,text:'TEST message',time:'2026-10-29'}];drawMessages()",s.context);
  const button=s.get('#messages').children[0].children.find(n=>n.tag==='button');
  s.context.prompt=()=>null;await button.onclick();s.context.prompt=()=> '  ';await button.onclick();assert.equal(writes.length,0);
  s.context.prompt=()=> ' TEST reason ';await button.onclick();assert.deepEqual(writes,[{path:'/api/admin/messages/abc',body:{reason:'TEST reason'}}]);assert.equal(button.disabled,false);
});

test('delayed legacy reply and image selection stay with the originating customer view',async()=>{
  const s=setup(()=>({users:[],sitters:{}}));await tick();s.context.crypto=require('node:crypto').webcrypto;s.context.u=full('aaa');
  let reply,image;
  s.context.fetch=async(path,options)=>({ok:true,json:()=>options.method==='POST'?new Promise(resolve=>reply=resolve):{messages:[]}});
  vm.runInContext("state.selected='aaa';state.tab='chat';state.sitter='TEST sitter';state.sitters={'TEST sitter':'TEST'};renderChat($('#detail'),u)",s.context);await tick();
  let form=s.get('#detail').children.find(n=>n.tag==='form');form.children[0].value='TEST private reply';const sending=form.onsubmit({preventDefault(){}});await tick();
  vm.runInContext("state.selected='bbb';state.messages=[{text:'NEW customer'}]",s.context);reply({messages:[{text:'OLD private reply'}]});await sending;
  assert.equal(vm.runInContext('state.messages[0].text',s.context),'NEW customer');
  s.get('#detail').replaceChildren();vm.runInContext("state.selected='aaa';renderChat($('#detail'),u)",s.context);await tick();
  s.context.readImage=()=>new Promise(resolve=>image=resolve);form=s.get('#detail').children.find(n=>n.tag==='form');form.children[1].files=[{name:'TEST'}];const picking=form.children[1].onchange();
  assert.equal(form.children[2].disabled,true);vm.runInContext("state.selected='bbb';state.image='NEW attachment'",s.context);image('OLD private attachment');await picking;
  assert.equal(vm.runInContext('state.image',s.context),'NEW attachment');
});

test('legacy reply uncertainty freezes content and request ID; stale polling cannot restore an old transcript',async()=>{
  const s=setup(()=>({users:[],sitters:{}}));await tick();s.context.crypto=require('node:crypto').webcrypto;s.context.u=full('aaa');const posts=[];
  s.context.fetch=async(path,options)=>{if(options.method==='POST'){posts.push(JSON.parse(options.body));throw Error('TEST response lost');}return {ok:true,json:async()=>({messages:[]})};};
  vm.runInContext("state.selected='aaa';state.tab='chat';state.sitter='TEST sitter';state.sitters={'TEST sitter':'TEST'};renderChat($('#detail'),u)",s.context);await tick();
  const form=s.get('#detail').children.find(n=>n.tag==='form');form.children[0].value='TEST original';await form.onsubmit({preventDefault(){}});form.children[0].value='TEST altered';await form.onsubmit({preventDefault(){}});
  assert.equal(posts.length,2);assert.deepEqual(posts[0],posts[1]);assert.equal(posts[0].text,'TEST original');assert.equal(form.children[0].disabled,true);
  let finish;s.context.fetch=async()=>({ok:true,json:()=>new Promise(resolve=>finish=resolve)});const poll=vm.runInContext('refreshChat()',s.context);await tick();vm.runInContext("state.panel='workQueue';state.messages=[]",s.context);finish({messages:[{text:'PRIVATE old transcript'}]});await poll;assert.equal(vm.runInContext('state.messages.length',s.context),0);
});

test('summary is not editable until private detail loads and late detail cannot replace selected user',async()=>{
  let resolveFirst;
  const s=setup(path=>path.includes('/users?')?{users:[summary('aaa'),summary('bbb')],nextCursor:null,sitters:{}}:path.endsWith('/aaa')?new Promise(resolve=>resolveFirst=resolve):{user:full('bbb'),sitters:{}});
  await tick();
  assert.equal(s.get('#userList').children.length,2);
  const first=vm.runInContext("select('aaa')",s.context);await tick();
  assert.equal(s.get('#detail').children.some(n=>n.tag==='form'),false);
  await vm.runInContext("select('bbb')",s.context);
  resolveFirst({user:full('aaa'),sitters:{}});await first;
  assert.match(text(s.get('#detail')),/TEST bbb/);assert.doesNotMatch(text(s.get('#detail')),/TEST aaa/);
  assert.equal(s.get('#detail').children.some(n=>n.tag==='form'),true);
  assert.equal(s.calls.filter(c=>c.method!=='GET').length,0);
});

test('page failure retains rows and retry uses same cursor with deduplication',async()=>{
  let failed=true;
  const s=setup(path=>{
    if(!path.includes('after='))return {users:[summary('aaa')],nextCursor:'cursor',sitters:{}};
    if(failed)throw Error('TEST page unavailable');
    return {users:[summary('aaa'),summary('bbb')],nextCursor:null,sitters:{}};
  });
  await tick();await vm.runInContext('load(true)',s.context);
  assert.match(text(s.get('#userList')),/TEST aaa/);assert.match(text(s.get('#userList')),/TEST page unavailable/);
  failed=false;await vm.runInContext('load(true)',s.context);
  assert.equal(vm.runInContext('state.users.length',s.context),2);
  const pages=s.calls.filter(c=>c.path.includes('after='));assert.equal(pages.length,2);assert.equal(pages[0].path,pages[1].path);
  assert.equal(vm.runInContext('state.indexNext',s.context),null);
});

test('late old index cannot replace a new role filter and detail errors can retry',async()=>{
  let finishOld,failDetail=true;
  const s=setup(path=>{
    if(path.includes('role=customer'))return new Promise(resolve=>finishOld=resolve);
    if(path.includes('role=sitter'))return {users:[{...summary('bbb'),roles:['sitter']}],nextCursor:null,sitters:{}};
    if(failDetail)throw Error('TEST detail unavailable');
    return {user:full('bbb'),sitters:{}};
  });
  await tick();await vm.runInContext("nav('sitter')",s.context);
  finishOld({users:[summary('aaa')],nextCursor:'old',sitters:{}});await tick();
  assert.equal(vm.runInContext('state.users[0].id',s.context),'bbb');
  await vm.runInContext("select('bbb')",s.context);
  assert.match(text(s.get('#detail')),/Tafsilotni qayta yuklash/);
  failDetail=false;await s.get('#detail').children[1].onclick();
  assert.match(text(s.get('#detail')),/TEST bbb/);
});
