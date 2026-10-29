const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('support replies identify the operator and reuse a stable ID after a lost response', async () => {
  const nodes=new Map();
  class Element {
    constructor(tag){this.tag=tag;this.children=[];this.value='';this.hidden=false;this.textContent='';this.classList={toggle(){}};}
    set id(value){nodes.set('#'+value,this)}
    append(...children){this.children.push(...children)}
    replaceChildren(...children){this.children=children}
    setAttribute(){}
  }
  const get=selector=>{if(!nodes.has(selector))nodes.set(selector,new Element());return nodes.get(selector)};
  const user={id:'abc',roles:['customer'],phone:'998000000001',blocked:false,created:'2026-01-01',account:{_revision:1,profile:{first:'TEST',last:'User'},favorites:[],addresses:[]}};
  const messages=[{id:'msg',sitter:'hoji',mine:false,senderRole:'support',text:'TEST support reply',time:'2026-01-01'}];
  const posts=[];let sequence=0;
  const context=vm.createContext({URLSearchParams,document:{addEventListener:(_,callback)=>queueMicrotask(callback),querySelector:get,createElement:tag=>new Element(tag)},fetch:async(path,options)=>{
    if(options.method==='POST'){
      posts.push(JSON.parse(options.body));
      if(posts.length<3)throw Error('Response lost');
      return {ok:true,json:async()=>({messages})};
    }
    return {ok:true,json:async()=>path.endsWith('/me')?{username:'TEST operator',role:'administrator',panels:['users','sitters','listings']} :path.split('?')[0].endsWith('/users')?{users:[user],sitters:{hoji:'TEST sitter'}}:path.endsWith('/messages')?{messages}:{listings:[]}};
  },crypto:{randomUUID:()=>`request-${++sequence}`},setInterval(){},setTimeout(){},clearTimeout(){},structuredClone,console});
  vm.runInContext(fs.readFileSync('app.js','utf8'),context);
  await new Promise(resolve=>setImmediate(resolve));
  vm.runInContext("state.selected='abc';state.tab='chat';state.sitter='hoji';renderDetail()",context);
  await new Promise(resolve=>setImmediate(resolve));
  const text=node=>[node.textContent,...node.children.map(text)].join(' ');
  assert.match(text(get('#detail')),/Momiq yordam xizmati/);
  assert.doesNotMatch(text(get('#detail')),/enaga nomidan/i);
  assert.match(text(get('#messages')),/Momiq yordam xizmati/);
  const form=get('#detail').children.find(node=>node.tag==='form');
  const input=form.children.find(node=>node.tag==='textarea');
  input.value='TEST same reply';
  await form.onsubmit({preventDefault(){}});
  assert.equal(input.value,'TEST same reply');
  assert.equal(input.disabled,true);
  await form.onsubmit({preventDefault(){}});
  assert.equal(posts[0].requestId,posts[1].requestId);
  input.value='TEST changed reply';
  await form.onsubmit({preventDefault(){}});
  assert.deepEqual(posts[1],posts[2]);
  assert.equal(input.value,'');assert.equal(input.disabled,false);
  input.value='TEST next reply';await form.onsubmit({preventDefault(){}});
  assert.notEqual(posts[2].requestId,posts[3].requestId);
});

test('profile save sends the loaded revision and preserves conflicts for review', async () => {
  class Element {
    constructor(tag){this.tag=tag;this.children=[];this.value='';this.hidden=false;this.textContent='';this.classList={toggle(){}};}
    append(...nodes){this.children.push(...nodes)}
    replaceChildren(...nodes){this.children=nodes}
    setAttribute(){}
  }
  const nodes=new Map();
  const get=s=>{if(!nodes.has(s))nodes.set(s,new Element());return nodes.get(s)};
  const user={id:'abc',roles:['customer'],phone:'998000000001',blocked:false,created:'2026-01-01',account:{_revision:7,profile:{first:'Test',last:'User'},favorites:[],addresses:[]}};
  let submitted;
  const context=vm.createContext({URLSearchParams,document:{addEventListener:(_,callback)=>queueMicrotask(callback),querySelector:get,createElement:tag=>new Element(tag)},fetch:async(path,options)=>{
    if(options.method==='PUT') {submitted=JSON.parse(options.body);return {ok:false,status:409,json:async()=>({error:'Profile changed; reload'})}}
    return {ok:true,json:async()=>path.endsWith('/me')?{username:'TEST operator',role:'administrator',panels:['users','sitters','listings']} :path.split('?')[0].endsWith('/users')?{users:[user],sitters:{}}:{listings:[]}};
  },setInterval(){},setTimeout(){},clearTimeout(){},structuredClone,console});
  vm.runInContext(fs.readFileSync('app.js','utf8'),context);
  await new Promise(resolve=>setImmediate(resolve));
  get('#userList').children[0].onclick();
  const form=get('#detail').children.find(node=>node.tag==='form');
  form.elements={first:{value:'Changed'},last:{value:'User'}};
  await form.onsubmit({preventDefault(){}});
  assert.equal(submitted._revision,7);
  assert.equal(submitted.account.profile.first,'Changed');
  assert.equal(get('#notice').textContent,'Profile changed; reload');
  assert.equal(user.account.profile.first,'Test');
});

test('listing moderation requires explicit test approval and keeps stale decisions visible', async () => {
  class Element {
    constructor(tag){this.tag=tag;this.children=[];this.value='';this.hidden=false;this.textContent='';this.classList={toggle(){}};}
    append(...nodes){this.children.push(...nodes)}
    replaceChildren(...nodes){this.children=nodes}
    setAttribute(){}
  }
  const nodes=new Map();const get=s=>{if(!nodes.has(s))nodes.set(s,new Element());return nodes.get(s)};
  const listing={id:'abc:homeVisit',userId:'abc',type:'homeVisit',_revision:8,phone:'998000000001',profile:{first:'Test',last:'Sitter'},price:50000,pets:['cat'],housing:'house',active:true,updated:'2026-10-27',moderation:{status:'pending'}};
  let submitted;
  const context=vm.createContext({URLSearchParams,document:{addEventListener:(_,callback)=>queueMicrotask(callback),querySelector:get,createElement:tag=>new Element(tag)},fetch:async(path,options)=>{
    if(options.method==='POST'){submitted=JSON.parse(options.body);return {ok:false,status:409,json:async()=>({error:'E’lon o‘zgargan; qayta yuklang'})}}
    return {ok:true,json:async()=>path.endsWith('/me')?{username:'TEST operator',role:'administrator',panels:['users','sitters','listings']} :path.split('?')[0].endsWith('/users')?{users:[],sitters:{}}:{listings:[listing]}};
  },setInterval(){},setTimeout(){},clearTimeout(){},structuredClone,console});
  vm.runInContext(fs.readFileSync('app.js','utf8'),context);
  await new Promise(resolve=>setImmediate(resolve));await get('#listingsNav').onclick();get('#userList').children[0].onclick();
  const form=get('#detail').children.find(n=>n.tag==='form');
  form.children[0].children[0].value='TEST checked';
  const event={preventDefault(){},submitter:{value:'approve'}};
  await form.onsubmit(event);assert.equal(submitted,undefined);
  form.children[1].children[0].checked=true;
  await form.onsubmit(event);
  assert.equal(submitted._revision,8);assert.equal(submitted.testOnly,true);
  assert.equal(get('#notice').textContent,'E’lon o‘zgargan; qayta yuklang');
  assert.equal(listing.moderation.status,'pending');
});
