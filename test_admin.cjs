const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('retry of an unacknowledged operator reply reuses only its own ID',async()=>{
  const nodes=new Map(), posted=[];
  function element(tag){
    return {tag,children:[],value:'',isConnected:true,hidden:false,
      append(...children){this.children.push(...children)},replaceChildren(...children){this.children=children},
      setAttribute(){},classList:{toggle(){}}};
  }
  const document={createElement:element,querySelector(selector){
    if(!nodes.has(selector))nodes.set(selector,element('div'));
    return nodes.get(selector);
  }};
  let counter=0, respond;
  const context=vm.createContext({document,crypto:{randomUUID:()=>String(++counter)},
    fetch:async(path,options)=>{
      if(options.method!=='POST')return {ok:true,json:async()=>path.endsWith('users')?{users:[],sitters:{}}:{listings:[]}};
      posted.push(JSON.parse(options.body));
      return new Promise(resolve=>{respond=body=>resolve({ok:true,json:async()=>body})});
    },setInterval(){},setTimeout(){},clearTimeout(){},console});
  vm.runInContext(fs.readFileSync('app.js','utf8'),context);
  await new Promise(resolve=>setImmediate(resolve));
  context.box=element('div');
  vm.runInContext("state.sitters={s1:'TEST'};state.sitter='s1';renderChat(box,{id:'abc',blocked:false})",context);
  const form=context.box.children.find(node=>node.tag==='form'), input=form.children[0];
  const submit=()=>form.onsubmit({preventDefault(){}});
  input.value='A';
  const first=submit();
  await submit();assert.equal(posted.length,1);
  respond({});await first;assert.equal(input.value,'A');
  const retry=submit();assert.deepEqual(posted[1],posted[0]);
  respond({messages:[]});await retry;assert.equal(input.value,'');
  input.value='A';
  const intentional=submit();assert.notEqual(posted[2].requestId,posted[0].requestId);
  respond({});await intentional;
  input.value='B';
  const edited=submit();assert.notEqual(posted[3].requestId,posted[2].requestId);
  respond({messages:[]});await edited;
});

test('role navigation separates users and renders server listings', async () => {
  class Element {
    constructor(){this.children=[];this.value='';this.hidden=false;this.textContent='';this.classList={toggle(){}};}
    append(...nodes){this.children.push(...nodes)}
    replaceChildren(...nodes){this.children=nodes}
    setAttribute(){}
  }
  const nodes=new Map();
  const get=s=>{if(!nodes.has(s))nodes.set(s,new Element());return nodes.get(s)};
  const user=(id,roles)=>({id,roles,phone:'998900000000',blocked:false,created:'2026-01-01',account:{profile:{first:id,last:'Test',photo:'/9j/test'},favorites:[],addresses:[]}});
  const users=[user('customer',['customer']),user('sitter',['sitter']),user('both',['customer','sitter'])];
  const listing={id:'sitter:homeVisit',userId:'sitter',profile:users[1].account.profile,phone:users[1].phone,type:'homeVisit',price:55000,pets:['cat'],active:true,housing:'house',updated:'2026-01-01'};
  const edits=[];
  let editResult={ok:true};
  const context=vm.createContext({document:{querySelector:get,createElement:()=>new Element()},fetch:async(path,options)=>{
    if(options.method==='PUT'){
      edits.push([path,JSON.parse(options.body)]);
      return {ok:true,json:async()=>editResult};
    }
    return {ok:true,json:async()=>path.endsWith('/users')?{users,sitters:{}}:{listings:[listing]}};
  },setInterval(){},setTimeout(){},clearTimeout(){},structuredClone,console});
  vm.runInContext(fs.readFileSync('app.js','utf8'),context);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(get('#count').textContent,2);
  assert.equal(get('#userList').children[0].children[0].src,'data:image/jpeg;base64,/9j/test');
  get('#userList').children[0].onclick();
  const form=get('#detail').children.find(node=>node.onsubmit);
  form.elements={first:{value:'customer'},last:{value:'Test'}};
  const submit=()=>form.onsubmit({preventDefault(){}});
  await submit();
  assert.equal(edits.length,0);
  form.elements.first.value=' Edited ';
  editResult={};
  await submit();
  assert.equal(get('#notice').textContent,'Profil saqlangani tasdiqlanmadi.');
  editResult={ok:true};
  await submit();
  const expected=['/api/admin/users/customer/profile',{before:{first:'customer'},after:{first:'Edited'}}];
  assert.deepEqual(edits,[expected,expected]);
  assert.equal(get('#notice').textContent,'Profil saqlandi');
  const fresh=get('#detail').children.find(node=>node.onsubmit);
  fresh.elements={first:{value:'customer'},last:{value:'Test'}};
  const picker=fresh.children.flatMap(node=>node.children).find(node=>node.type==='file');
  const reads=[];
  context.readImage=()=>new Promise(resolve=>reads.push(resolve));
  picker.files=[{}];
  const slow=picker.onchange(), recent=picker.onchange();
  await fresh.onsubmit({preventDefault(){}});
  assert.equal(edits.length,2);
  reads[1]('second-photo');await recent;
  reads[0]('first-photo');await slow;
  await fresh.onsubmit({preventDefault(){}});
  assert.deepEqual(edits[2],['/api/admin/users/customer/profile',
                             {before:{photo:'/9j/test'},after:{photo:'second-photo'}}]);
  get('#sittersNav').onclick();
  assert.equal(get('#count').textContent,2);
  assert.equal(get('#userList').children[0].children[0].src,'data:image/jpeg;base64,/9j/test');
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
