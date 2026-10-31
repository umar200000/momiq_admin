const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function setup(){
  class Element{constructor(tag,text){this.tag=tag;this.textContent=text||'';this.children=[];this.value='';this.hidden=false;this.disabled=false;this.classList={toggle(){}};}append(...v){this.children.push(...v);}replaceChildren(...v){this.children=v;}}
  const nodes=new Map(),calls=[],notices=[];const get=id=>{if(!nodes.has(id))nodes.set(id,new Element('div'));return nodes.get(id);};
  let fail=false;
  const context=vm.createContext({state:{},chatReportGeneration:0,$:get,el:(tag,text)=>new Element(tag,text),crypto:require('node:crypto').webcrypto,notice:t=>notices.push(t),api:async(path,method='GET',body)=>{calls.push({path,method,body});if(method==='POST'&&fail)throw Error('TEST response lost');return {items:[],nextCursor:null};}});
  vm.runInContext(fs.readFileSync('reviews.js','utf8'),context);
  context.row={id:'1',name:'TEST author',stars:4,text:'<script>untrusted</script>',bookingId:'test',revision:3,testOnly:true,hidden:false,withdrawn:false};
  vm.runInContext("renderReview($('#chatPanel'),row)",context);
  return {get,calls,notices,context,setFail:v=>fail=v};
}
test('review is rendered as text and only visibility can be moderated',()=>{
  const {get}=setup();const article=get('#chatPanel').children[0];
  assert.equal(article.children.find(n=>n.textContent.includes('<script>')).tag,'p');
  const form=article.children.find(n=>n.tag==='form');assert.equal(form.children.filter(n=>n.tag==='textarea').length,0);
  assert.equal(form.children[0].textContent,'Qaror sababi');
});
test('moderation requires reason and retries the same locked decision',async()=>{
  const {get,calls,setFail}=setup();const article=get('#chatPanel').children[0],form=article.children.find(n=>n.tag==='form');
  const reason=form.children[0].children[0];
  await form.onsubmit({preventDefault(){}});assert.equal(calls.length,0);
  reason.value='TEST reason';setFail(true);await form.onsubmit({preventDefault(){}});
  assert.equal(reason.disabled,true);assert.equal(calls[0].body.hidden,true);assert.equal(calls[0].body.revision,3);
  await form.onsubmit({preventDefault(){}});assert.deepEqual(calls[1].body,calls[0].body);
});
test('history is loaded explicitly and empty history ends paging',async()=>{
  const {get,calls}=setup();const article=get('#chatPanel').children[0];assert.equal(calls.length,0);
  const history=article.children.find(n=>n.tag==='button');await history.onclick();
  assert.equal(calls[0].path,'reviews/1/history');assert.equal(history.hidden,true);
});

test('a late moderation result cannot reopen reviews after navigation and double submit is ignored',async()=>{
  const s=setup();let finish;const calls=[];
  s.context.api=async(path,method='GET')=>{calls.push({path,method});if(method==='POST')return new Promise(resolve=>finish=resolve);return {items:[s.context.row],nextCursor:null};};
  await vm.runInContext('openReviews()',s.context);
  const article=s.get('#chatPanel').children.find(n=>n.tag==='div').children[0],form=article.children.find(n=>n.tag==='form');form.children[0].children[0].value='TEST delayed decision';
  const pending=form.onsubmit({preventDefault(){}});await form.onsubmit({preventDefault(){}});assert.equal(calls.filter(c=>c.method==='POST').length,1);
  s.context.state.panel='workQueue';s.get('#chatPanel').replaceChildren('TEST new panel');finish({ok:true});await pending;
  assert.equal(s.context.state.panel,'workQueue');assert.deepEqual(s.get('#chatPanel').children,['TEST new panel']);assert.equal(calls.filter(c=>c.method==='GET').length,1);
});

test('a late private review-history response is discarded when its originating view is gone',async()=>{
  const s=setup();let finish;s.context.api=async()=>({items:[s.context.row],nextCursor:null});await vm.runInContext('openReviews()',s.context);
  const article=s.get('#chatPanel').children.find(n=>n.tag==='div').children[0],load=article.children.find(n=>n.tag==='button'),history=article.children.at(-1);
  s.context.api=()=>new Promise(resolve=>finish=resolve);const pending=load.onclick();s.context.state.panel='support';finish({items:[{created:'TEST',actor:'private operator',revision:1,payload:{reason:'PRIVATE TEST'}}],nextCursor:null});await pending;assert.equal(history.children.length,0);
});
