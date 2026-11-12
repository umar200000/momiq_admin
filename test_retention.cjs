const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const row=id=>({id:String(id),state:'expired_review',anchorAt:'2020-01-01T05:00:00+05:00',reviewAt:'2022-01-01T05:00:00+05:00',holds:[],deletionAllowed:false,record:{id,actor:'TEST admin',action:'TEST view',target:'<script>untrusted</script>',time:'2020-01-01T00:00:00Z'}});
const page=(items=[row(60)],nextCursor=null,category='audit')=>({category,mode:'review_only',deletionEnabled:false,calendarYears:2,timezone:'Asia/Tashkent',items,nextCursor});
function setup(role='administrator'){
  class E{constructor(tag,text=''){this.tag=tag;this.textContent=text;this.children=[];this.hidden=false;this.disabled=false;this.classList={toggle(){}};}append(...v){this.children.push(...v);}replaceChildren(...v){this.children=v;}setAttribute(){}}
  const nodes=new Map(),calls=[];const get=id=>{if(!nodes.has(id))nodes.set(id,new E('div'));return nodes.get(id);};
  const context=vm.createContext({state:{operator:{role}},$:get,el:(tag,text)=>new E(tag,text),notice(){},source:x=>x});
  context.respond=()=>page();context.api=async(...args)=>{calls.push(args);return context.respond(...args);};vm.runInContext(fs.readFileSync('wallet.js','utf8'),context);
  const all=n=>[n,...n.children.flatMap(all)];return {context,get,calls,all,nodes:()=>all(get('#walletPanel'))};
}
test('archive is admin-only, text-only and never offers a mutation',async()=>{
  const denied=setup('finance');await vm.runInContext('openRetentionReview()',denied.context);assert.equal(denied.calls.length,0);
  const s=setup();await vm.runInContext('openRetentionReview()',s.context);
  assert.equal(s.nodes().find(n=>n.tag==='pre').textContent,'<script>untrusted</script>');
  assert.equal(s.nodes().some(n=>['script','form','input','textarea'].includes(n.tag)),false);
  assert.deepEqual(s.calls,[['audit-archive']]);
});
test('bad or contradictory responses stay retryable without showing expired rows',async()=>{
  for(const bad of [{},page([row(60)],'60'),{...page(),deletionEnabled:true},page([row(60),row(61)]),page([{...row(60),deletionAllowed:true}]),page([{...row(60),record:{id:999}}])]){
    const s=setup();s.context.respond=()=>bad;await vm.runInContext('openRetentionReview()',s.context);
    assert.equal(s.nodes().some(n=>n.tag==='section'),false);
    const retry=s.nodes().find(n=>n.tag==='button'&&n.textContent==='Qayta yuklash');assert.ok(retry);assert.equal(retry.disabled,false);
    s.context.respond=()=>page();await retry.onclick();assert.equal(s.nodes().filter(n=>n.tag==='section').length,1);
  }
});
test('pagination suppresses duplicate clicks and retries the same failed page',async()=>{
  const s=setup();s.context.respond=()=>page(Array.from({length:50},(_,i)=>row(100-i)),'51');
  await vm.runInContext('openRetentionReview()',s.context);const more=s.nodes().find(n=>n.tag==='button'&&n.textContent==='Oldingi yozuvlar');
  let finish;s.context.respond=()=>new Promise(resolve=>finish=resolve);
  const loading=more.onclick();await more.onclick();assert.equal(s.calls.length,2);
  finish(page([row(51)]));await loading;assert.equal(s.nodes().filter(n=>n.tag==='section').length,50);
  s.context.respond=()=>page([row(50)]);await more.onclick();
  assert.equal(s.calls.at(-1)[0],'audit-archive?before=51');assert.equal(s.nodes().filter(n=>n.tag==='section').length,51);assert.equal(more.hidden,true);
});
test('late data cannot replace a new section or a revoked role',async()=>{
  for(const leave of [s=>s.context.state.panel='accounts',s=>s.context.state.operator.role='support']){
    const s=setup();let finish;s.context.respond=()=>new Promise(resolve=>finish=resolve);const loading=vm.runInContext('openRetentionReview()',s.context);leave(s);finish(page());await loading;
    assert.equal(s.nodes().some(n=>n.tag==='section'),false);
  }
});
test('changing category discards old response and requests metadata only',async()=>{
  const s=setup();let finish;s.context.respond=()=>new Promise(resolve=>finish=resolve);const old=vm.runInContext('openRetentionReview()',s.context);
  s.context.respond=()=>page([],null,'topups');await vm.runInContext("openRetentionReview('topups')",s.context);finish(page());await old;
  assert.equal(s.calls.at(-1)[0],'retention-review?category=topups');assert.equal(s.nodes().some(n=>n.tag==='pre'),false);
});
