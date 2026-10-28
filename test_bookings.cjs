const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function setup(respond){
  class E{constructor(tag,text){this.tag=tag;this.textContent=text||'';this.children=[];this.value='';this.hidden=false;this.disabled=false;this.classList={toggle(){}};}append(...v){this.children.push(...v);}replaceChildren(...v){this.children=v;}}
  const nodes=new Map(),calls=[];const get=id=>{if(!nodes.has(id))nodes.set(id,new E('div'));return nodes.get(id);};
  const context=vm.createContext({state:{},chatReportGeneration:0,$:get,el:(tag,text)=>new E(tag,text),URLSearchParams,encodeURIComponent,services:{boarding:'Uyda qarash'},walletMoney:n=>n/100+' UZS',notice(){},openDisputes:id=>calls.push({dispute:id}),api:async(path,method='GET',body)=>{calls.push({path,method,body});return respond(path);}});
  vm.runInContext(fs.readFileSync('bookings.js','utf8'),context);
  return {context,get,calls,text:n=>n.textContent+' '+n.children.map(child=>child.textContent+' '+child.children.map(x=>x.textContent).join(' ')).join(' ')};
}
test('failed booking list exposes retry, never a fake empty result',async()=>{
  const {context,get,text}=setup(()=>{throw Error('TEST unavailable')});
  await vm.runInContext('openAdminBookings()',context);
  assert.match(text(get('#chatPanel')),/TEST unavailable/);
  assert.match(text(get('#chatPanel')),/Qayta urinish/);
  assert.doesNotMatch(text(get('#chatPanel')),/mos buyurtma yo‘q/);
});

test('video oversight uses same-origin cookie media and no player for expired reports',async()=>{
  const payload={day:'2026-10-28',policy:{today:'2026-10-28'},pets:[{id:'cat',name:'<script>TEST</script>'}],items:[
    {id:'b'.repeat(32),petId:'cat',slot:'morning',durationMs:10000,available:true},
    {id:'c'.repeat(32),petId:'cat',slot:'evening',durationMs:12000,available:false}]};
  const {context,get,calls}=setup(()=>payload);context.box=get('videoBox');context.current=()=>true;
  await vm.runInContext("adminBookingVideos(box,'"+'a'.repeat(32)+"',current)",context);
  const card=context.box.children.find(n=>n.tag==='article'),players=card.children.filter(n=>n.tag==='video');
  assert.equal(players.length,1);assert.match(players[0].src,/^\/api\/admin\/bookings\/[a-f0-9]+\/videos\/[a-f0-9]+\/playback$/);
  assert.equal(players[0].preload,'none');assert.equal(players[0].controls,true);assert.ok(!players[0].src.includes('token'));
  assert.ok(card.children.some(n=>n.textContent==='Saqlash muddati tugagan'));assert.equal(calls[0].method,'GET');
  assert.equal(card.children[0].textContent,'<script>TEST</script>');
});
test('late list result cannot replace another admin panel',async()=>{
  let resolve;const {context,get}=setup(()=>new Promise(r=>resolve=r));
  const request=vm.runInContext('openAdminBookings()',context);
  vm.runInContext("state.panel='support'",context);get('#chatPanel').textContent='Other panel';
  resolve({items:[],nextCursor:null});await request;
  assert.equal(get('#chatPanel').textContent,'Other panel');
});
test('booking details are text-only and offer no generic status or money editor',async()=>{
  const page={id:'a'.repeat(32),service:'boarding',status:'cancelled',replyDeadline:'TEST',snapshot:{customerName:'<script>client</script>',sitterName:'TEST sitter',service:'boarding',startsAt:'TEST',endsAt:'TEST',price:{service_total_minor:10000,commission_minor:1000},address:{address:'Toshkent'},pets:[]},history:{items:[{revision:0,created:'TEST',actor:'TEST user',action:'cancel',status:'cancelled',reason:'<img onerror=x>'}],nextCursor:null},commissionEntries:[],dispute:{status:'resolved'}};
  const {context,get,calls}=setup(path=>path.endsWith('/care')?{items:[],nextCursor:null}:page);
  await vm.runInContext("openAdminBookings('"+page.id+"')",context);
  const panel=get('#chatPanel');assert.equal(panel.children.some(n=>n.tag==='form'),false);
  assert.ok(panel.children.some(n=>n.tag==='p'&&n.textContent.includes('<script>client</script>')));assert.ok(panel.children.some(n=>n.textContent.startsWith('Uyda qarash')));
  const care=panel.children.find(n=>n.textContent==='Parvarish tarixini ochish');await care.onclick();
  assert.ok(calls.every(c=>c.method==='GET'));
  const dispute=panel.children.find(n=>n.textContent.startsWith('Nizoni ko‘rish:'));dispute.onclick();
  assert.equal(calls.at(-1).dispute,page.id);
});
