const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('role navigation separates users and renders server listings', async () => {
  class Element {
    constructor(){this.children=[];this.value='';this.hidden=false;this.textContent='';this.classList={toggle(){}};}
    append(...nodes){this.children.push(...nodes)}
    replaceChildren(...nodes){this.children=nodes}
    setAttribute(){}
  }
  const nodes=new Map();
  const get=s=>{if(!nodes.has(s))nodes.set(s,new Element());return nodes.get(s)};
  const user=(id,roles)=>({id,roles,phone:'998900000000',blocked:false,created:'2026-01-01',account:{profile:{first:id,last:'Test'},favorites:[],addresses:[]}});
  const users=[user('customer',['customer']),user('sitter',['sitter']),user('both',['customer','sitter'])];
  const listing={id:'sitter:homeVisit',userId:'sitter',profile:users[1].account.profile,phone:users[1].phone,type:'homeVisit',price:55000,pets:['cat'],active:true,housing:'house',updated:'2026-01-01'};
  const context=vm.createContext({document:{querySelector:get,createElement:()=>new Element()},fetch:async path=>({ok:true,json:async()=>path.endsWith('/users')?{users,sitters:{}}:{listings:[listing]}}),setInterval(){},setTimeout(){},clearTimeout(){},structuredClone,console});
  vm.runInContext(fs.readFileSync('app.js','utf8'),context);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(get('#count').textContent,2);
  get('#sittersNav').onclick();
  assert.equal(get('#count').textContent,2);
  const text=node=>node.textContent+' '+node.children.map(text).join(' ');
  assert.match(text(get('#userList')),/sitter/);
  assert.doesNotMatch(text(get('#userList')),/customer Test/);
  get('#listingsNav').onclick();
  assert.equal(get('#count').textContent,1);
  get('#userList').children[0].onclick();
  assert.match(text(get('#detail')),/Uyga tashrif/);
  assert.match(text(get('#detail')),/Mushuk/);
  assert.match(text(get('#detail')),/Enaga profilini ochish/);
  get('#search').value='missing';get('#search').oninput();
  assert.equal(get('#count').textContent,0);
  assert.match(text(get('#userList')),/natija yo‘q/);
});
