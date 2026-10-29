const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

function setup(){
  const nodes=new Map(),calls=[],notices=[];
  class Element{
    constructor(tag,text){this.tag=tag;this.textContent=text||'';this.children=[];this.value='';this.hidden=false;this.disabled=false;this.classList={toggle(){}};}
    append(...items){this.children.push(...items);}
    replaceChildren(...items){this.children=items;}
    setAttribute(){}
  }
  const get=key=>{if(!nodes.has(key))nodes.set(key,new Element('div'));return nodes.get(key);};
  let fail=false;
  const row={id:'7',revision:2,status:'open',reason:'TEST report',created:'2026-10-28'};
  const context=vm.createContext({state:{},$:get,el:(tag,text)=>new Element(tag,text),source:data=>'data:image/png;base64,'+data,notice:text=>notices.push(text),
    api:async(path,method='GET',body)=>{calls.push({path,method,body});if(method==='POST'&&fail)throw Error('Changed by another moderator');if(path.endsWith('/evidence'))return {report:row,message:{text:'<script>untrusted</script>',senderRole:'sitter',hasImage:true},history:[]};if(path.endsWith('/image'))return {image:'TEST'};return {items:[],nextCursor:null};}});
  vm.runInContext(fs.readFileSync('chat.js','utf8'),context);
  context.row=row;vm.runInContext("renderChatReport($('#chatPanel'),row)",context);
  return {context,get,calls,notices,setFail:value=>fail=value};
}

test('evidence and images are explicitly loaded without interpreting message markup',async()=>{
  const {get,calls}=setup();
  const article=get('#chatPanel').children[0];
  assert.equal(calls.length,0);
  await article.children.find(n=>n.tag==='button').onclick();
  assert.deepEqual(calls.map(c=>c.path),['chat-reports/7/evidence']);
  const evidence=article.children.find(n=>n.tag==='div');
  assert.equal(evidence.children.find(n=>n.textContent.includes('<script>')).tag,'p');
  const imageButton=evidence.children.find(n=>n.tag==='button');
  await imageButton.onclick();
  assert.equal(calls.at(-1).path,'chat-reports/7/image');
  assert.equal(evidence.children.find(n=>n.tag==='img').alt,'Shikoyatga biriktirilgan asl dalil');
});

test('moderator decision requires reason and preserves stale form for explicit retry',async()=>{
  const {get,calls,notices,setFail}=setup();
  const article=get('#chatPanel').children[0];
  await article.children.find(n=>n.tag==='button').onclick();
  const evidence=article.children.find(n=>n.tag==='div');
  const form=evidence.children.find(n=>n.tag==='form');
  const reason=form.children[0].children[0];
  const remove=form.children.find(n=>n.value==='remove');
  const event={preventDefault(){},submitter:remove};
  await form.onsubmit(event);assert.equal(calls.filter(c=>c.method==='POST').length,0);
  reason.value='TEST confirmed';setFail(true);
  await form.onsubmit(event);
  const posted=calls.find(c=>c.method==='POST');
  assert.equal(posted.body.revision,2);assert.equal(posted.body.decision,'remove');
  assert.equal(reason.value,'TEST confirmed');assert.equal(remove.disabled,false);
  assert.match(notices.at(-1),/another moderator/);
  await form.onsubmit(event);
  assert.deepEqual(calls.filter(c=>c.method==='POST').map(c=>c.body),[posted.body,posted.body]);
});

test('assignment source opens the exact report and stale list responses cannot replace another panel',async()=>{
  const s=setup();await vm.runInContext("openChatReports('7')",s.context);assert.equal(s.calls.at(-1).path,'chat-reports/7/evidence');
  assert.match(s.get('#chatPanel').children[1].children[0].textContent,/#7/);
  let finish;s.context.api=()=>new Promise(resolve=>finish=resolve);const pending=vm.runInContext('openChatReports()',s.context);
  s.context.state.panel='workQueue';s.get('#chatPanel').replaceChildren();finish({items:[],nextCursor:null});await pending;assert.equal(s.get('#chatPanel').children.length,0);
});
