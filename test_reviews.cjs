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
