const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const draft=()=>({version:0,status:'draft',organization:{legalName:'',registration:'',address:'',supportEmail:'',supportPhone:'',website:''},documents:{terms:'TEST {{legalName}} <script>text only</script>',privacy:'TEST privacy',cancellation:'TEST cancellation',community:'TEST community',deletion:'TEST deletion'}});
function setup(role='administrator'){
  class E{constructor(tag,text=''){this.tag=tag;this.textContent=text;this.children=[];this.value='';this.hidden=false;this.disabled=false;this.classList={toggle(){}};}append(...v){this.children.push(...v);}replaceChildren(...v){this.children=v;}setAttribute(){}}
  const nodes=new Map(),calls=[],notices=[];const get=id=>{if(!nodes.has(id))nodes.set(id,new E('div'));return nodes.get(id);};
  const context=vm.createContext({state:{operator:{role}},$:get,el:(tag,text)=>new E(tag,text),notice:m=>notices.push(m),source:x=>x});
  context.respond=()=>draft();context.api=async(...args)=>{calls.push(args);return context.respond(...args);};vm.runInContext(fs.readFileSync('wallet.js','utf8'),context);
  const all=n=>[n,...n.children.flatMap(all)];return {context,get,calls,notices,all};
}
test('only administrator opens legal drafts and previews untrusted text without HTML',async()=>{
  const denied=setup('finance');await vm.runInContext('openLegalDocuments()',denied.context);assert.equal(denied.calls.length,0);
  const s=setup();await vm.runInContext('openLegalDocuments()',s.context);const nodes=s.all(s.get('#walletPanel'));
  nodes.find(n=>n.name==='legalName').value='<img onerror=evil>';
  nodes.find(n=>n.tag==='button'&&n.textContent==='Ko‘rib chiqish: Foydalanish shartlari').onclick();
  assert.equal(nodes.find(n=>n.tag==='pre').textContent,'TEST <img onerror=evil> <script>text only</script>');assert.equal(nodes.some(n=>n.tag==='script'||n.tag==='img'),false);
});
test('lost, stale and contradictory save confirmations preserve all draft text and reason',async()=>{
  const s=setup();await vm.runInContext('openLegalDocuments()',s.context);const nodes=s.all(s.get('#walletPanel')),form=nodes.find(n=>n.tag==='form'),terms=nodes.find(n=>n.name==='terms'),reason=nodes.find(n=>n.name==='reason');
  terms.value='TEST edited';reason.value='TEST reason';
  for(const response of [{}, {...draft(),version:1}, {...draft(),version:0,documents:{...draft().documents,terms:'TEST edited'}}]){
    s.context.respond=()=>response;await form.onsubmit({preventDefault(){}});assert.equal(terms.value,'TEST edited');assert.equal(reason.value,'TEST reason');assert.equal(reason.disabled,false);assert.equal(s.calls.at(-1)[2].version,0);
  }
  s.context.respond=(path,method,body)=>({...body,status:'draft',version:1});await form.onsubmit({preventDefault(){}});assert.equal(reason.value,'');assert.equal(terms.value,'TEST edited');
  reason.value='TEST next';await form.onsubmit({preventDefault(){}});assert.equal(s.calls.at(-1)[2].version,1);
});
test('stale navigation and duplicate submits cannot replace a draft or apply late success',async()=>{
  const s=setup();let finish;s.context.respond=()=>new Promise(resolve=>finish=resolve);const opening=vm.runInContext('openLegalDocuments()',s.context);s.context.state.panel='accounts';finish(draft());await opening;
  assert.equal(s.all(s.get('#walletPanel')).some(n=>n.tag==='form'),false);
  s.context.respond=()=>draft();await vm.runInContext('openLegalDocuments()',s.context);const nodes=s.all(s.get('#walletPanel')),form=nodes.find(n=>n.tag==='form'),reason=nodes.find(n=>n.name==='reason');reason.value='TEST reason';
  s.context.respond=()=>new Promise(resolve=>finish=resolve);const saving=form.onsubmit({preventDefault(){}});await form.onsubmit({preventDefault(){}});assert.equal(s.calls.filter(c=>c[1]==='PUT').length,1);
  s.context.state.panel='accounts';finish({...draft(),version:1});await saving;assert.equal(s.notices.length,0);assert.equal(reason.value,'TEST reason');
});
test('malformed draft read does not expose an editable empty document',async()=>{
  const s=setup();s.context.respond=()=>({...draft(),documents:[]});await vm.runInContext('openLegalDocuments()',s.context);assert.equal(s.all(s.get('#walletPanel')).some(n=>n.tag==='form'),false);
});
