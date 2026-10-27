const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

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
  const context=vm.createContext({document:{querySelector:get,createElement:tag=>new Element(tag)},fetch:async(path,options)=>{
    if(options.method==='PUT') {submitted=JSON.parse(options.body);return {ok:false,status:409,json:async()=>({error:'Profile changed; reload'})}}
    return {ok:true,json:async()=>path.endsWith('/users')?{users:[user],sitters:{}}:{listings:[]}};
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
  const context=vm.createContext({document:{querySelector:get,createElement:tag=>new Element(tag)},fetch:async(path,options)=>{
    if(options.method==='POST'){submitted=JSON.parse(options.body);return {ok:false,status:409,json:async()=>({error:'E’lon o‘zgargan; qayta yuklang'})}}
    return {ok:true,json:async()=>path.endsWith('/users')?{users:[],sitters:{}}:{listings:[listing]}};
  },setInterval(){},setTimeout(){},clearTimeout(){},structuredClone,console});
  vm.runInContext(fs.readFileSync('app.js','utf8'),context);
  await new Promise(resolve=>setImmediate(resolve));get('#listingsNav').onclick();get('#userList').children[0].onclick();
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
