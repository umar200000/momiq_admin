const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('correction is lazy, confirmed, exact on lost response and stays tied to the original credit', async()=>{
  const {context,get,calls,notices}=setup();
  context.crypto={randomUUID:()=> 'test-fixed-request'};
  let fail=true, corrected=0;
  context.api=async(path,method,body)=>{
    calls.push({path,method,body:body&&{...body}});
    if(method==='POST') { if(fail){fail=false;throw Error('TEST response lost');} corrected=100;return {correction:{id:'done'}}; }
    return {originalAmountMinor:1000,correctedMinor:corrected,balanceMinor:1000-corrected,transferReference:'TEST-XOLIS',items:corrected?[{amountMinor:100,reason:'<script>TEST</script>',actor:'operator',created:'2026-10-29',originalEntryId:'original',entryId:'debit'}]:[],nextCursor:null};
  };
  context.rows=[{id:'test-topup',userId:'sitter',amountMinor:1000,status:'approved',created:'2026-10-29'}];
  vm.runInContext('renderTopups(rows)',context);
  assert.equal(calls.length,0);
  const card=get('#walletPanel').children.find(n=>n.tag==='article');
  const details=card.children.find(n=>n.tag==='details'&&n.children[0].textContent.includes('Tushumni tuzatish'));
  details.open=true;await details.ontoggle();
  const content=details.children.find(n=>n.tag==='div');
  const form=content.children.find(n=>n.tag==='form');
  const fields=Object.fromEntries(form.children.filter(n=>n.tag==='label').map(n=>[n.children[0].name,n.children[0]]));
  fields.correctionAmount.value='1';fields.correctionReason.value='<script>TEST</script>';
  await form.onsubmit({preventDefault(){}});
  assert.equal(calls.filter(c=>c.method==='POST').length,0);
  fields.correctionConfirmed.checked=true;
  fields.correctionAmount.value='11';await form.onsubmit({preventDefault(){}});
  assert.equal(calls.filter(c=>c.method==='POST').length,0);
  fields.correctionAmount.value='1';await form.onsubmit({preventDefault(){}});
  assert.equal(fields.correctionAmount.disabled,true);
  // Even a programmatic field change cannot alter the uncertain pending request.
  fields.correctionAmount.value='2';await form.onsubmit({preventDefault(){}});
  const posts=calls.filter(c=>c.method==='POST');
  assert.equal(posts.length,2);assert.deepEqual(posts[0],posts[1]);
  assert.equal(posts[0].body.amountMinor,100);assert.equal(posts[0].body.expectedCorrectedMinor,0);
  assert.equal(posts[0].path,'topups/test-topup/corrections');
  assert.ok(notices.includes('Tuzatish saqlandi.'));
  const history=content.children.find(n=>n.tag==='div');
  assert.ok(history.children[0].children.some(n=>n.textContent==='<script>TEST</script>'));
  assert.ok(history.children[0].children.some(n=>n.textContent.includes('original')&&n.textContent.includes('debit')));
});
function setup() {
  class Element {
    constructor(tag, text = '') { this.tag = tag; this.textContent = text; this.children = []; this.value = ''; this.classList = {toggle(){}}; }
    append(...nodes) { this.children.push(...nodes); }
    replaceChildren(...nodes) { this.children = nodes; }
    setAttribute() {}
  }
  const nodes = new Map(), calls = [], notices = [];
  const get = id => { if (!nodes.has(id)) nodes.set(id, new Element('div')); return nodes.get(id); };
  const context = vm.createContext({$:get, el:(tag,text)=>new Element(tag,text), source:s=>s, state:{users:[]}, name:()=>'', notice:s=>notices.push(s), api:async(path,method,body)=>{calls.push({path,method,body});return {topups:[]};}});
  vm.runInContext(fs.readFileSync('wallet.js','utf8'), context);
  return {context,get,calls,notices};
}
test('financial input uses exact hundredths and validates bounds', () => {
  const {context} = setup();
  assert.equal(vm.runInContext("parseMinor('15000.01')",context),1500001);
  assert.equal(vm.runInContext("parseMinor('15000,01')",context),1500001);
  assert.equal(vm.runInContext("parseMinor('0',true)",context),0);
  for(const value of ['0','-1','1e3','1.001','1000000001']) assert.throws(()=>vm.runInContext(`parseMinor('${value}')`,context));
});

test('topup identifies its owner without depending on the loaded accounts page', () => {
  const {context,get}=setup();
  context.rows=[{id:'abc',revision:0,userId:'sitter',owner:{name:'TEST Owner',phone:'998000000001'},amountMinor:1500000,status:'rejected',created:'2026-10-27'}];
  vm.runInContext('renderTopups(rows)',context);
  const text=node=>[node.textContent,...node.children.map(text)].join(' ');
  assert.match(text(get('#walletPanel')),/TEST Owner · \+998000000001/);
});
test('approval requires verified matching incoming funds; rejection needs only reason', async () => {
  const {context,get,calls,notices} = setup();
  context.rows=[{id:'abc',revision:0,userId:'sitter',amountMinor:1500001,status:'pending',created:'2026-10-27',receipt:'test'}];
  vm.runInContext('renderTopups(rows)',context);
  const form=get('#walletPanel').children.find(n=>n.tag==='article').children.find(n=>n.tag==='form');
  const fields=Object.fromEntries(form.children.filter(n=>n.tag==='label').map(n=>[n.children[0].name,n.children[0]]));
  fields.reason.value='Verified statement'; fields.received.value='15000'; fields.reference.value='XOLIS-TEST';
  await form.onsubmit({preventDefault(){}});
  assert.equal(calls.length,0); assert.match(notices.at(-1),/tekshiring/);
  fields.verified.checked=true;
  await form.onsubmit({preventDefault(){}});
  assert.equal(calls.length,0); assert.match(notices.at(-1),/mos emas/);
  fields.received.value='15000.01';
  await form.onsubmit({preventDefault(){}});
  assert.equal(calls[0].body.receivedAmountMinor,1500001);
  assert.equal(calls[0].body.fundsVerified,true);
  vm.runInContext('renderTopups(rows)',context);
  const second=get('#walletPanel').children.find(n=>n.tag==='article').children.find(n=>n.tag==='form');
  second.children.find(n=>n.tag==='label'&&n.children[0].name==='reason').children[0].value='No incoming transfer';
  await second.children.find(n=>n.textContent==='Rad etish').onclick();
  assert.equal(calls.find(c=>c.body?.decision==='reject').body.reason,'No incoming transfer');
});

test('activating a QR requires a recipient and sends the loaded version', async () => {
  const {context,get,calls,notices}=setup();
  context.config={version:7,commissionBps:1000,minimumBalanceMinor:1500000,qrImage:'test',testOnly:true,qrActive:false};
  vm.runInContext('renderWalletSettings(config)',context);
  const form=get('#walletPanel').children.find(n=>n.tag==='form');
  const fields=Object.fromEntries(form.children.filter(n=>n.tag==='label').map(n=>[n.children[0].name,n.children[0]]));
  fields.qrActive.checked=true;fields.reason.value='TEST only';
  await form.onsubmit({preventDefault(){}});
  assert.equal(calls.length,0);assert.match(notices.at(-1),/oluvchi/);
  fields.recipientName.value='TEST COMPANY';fields.paymentInstructions.value='TEST ONLY';
  await form.onsubmit({preventDefault(){}});
  assert.equal(calls[0].body.version,7);
  assert.equal(calls[0].body.recipientName,'TEST COMPANY');
  assert.equal(calls[0].body.qrActive,true);
});


test('payer metadata is evidence only and never pre-fills verified transfer reference', () => {
  const {context,get}=setup();
  context.rows=[{id:'abc',revision:0,userId:'sitter',amountMinor:1500000,status:'pending',created:'2026-10-26',payerReference:'UNVERIFIED-123',paidAt:'2026-10-26T05:00:00Z'}];
  vm.runInContext('renderTopups(rows)',context);
  const card=get('#walletPanel').children.find(n=>n.tag==='article');
  assert.ok(card.children.some(n=>n.textContent.includes('UNVERIFIED-123')));
  const form=card.children.find(n=>n.tag==='form');
  const reference=form.children.find(n=>n.tag==='label'&&n.children[0].name==='reference').children[0];
  assert.equal(reference.value,'');
});


test('clarification sends loaded revision and reason without claiming funds', async () => {
  const {context,get,calls}=setup();
  context.rows=[{id:'abc',revision:7,userId:'sitter',amountMinor:1500000,status:'pending',created:'2026-10-26'}];
  vm.runInContext('renderTopups(rows)',context);
  const form=get('#walletPanel').children.find(n=>n.tag==='article').children.find(n=>n.tag==='form');
  const reason=form.children.find(n=>n.tag==='label'&&n.children[0].name==='reason').children[0];
  reason.value='TEST receipt is unreadable';
  await form.children.find(n=>n.textContent==='Aniqlashtirish so‘rash').onclick();
  assert.equal(calls[0].body.decision,'request_info');
  assert.equal(calls[0].body.revision,7);
  assert.equal(calls[0].body.fundsVerified,undefined);
});


test('history shows actor and fetches each historical image only on demand', async () => {
  const {context,get,calls}=setup();
  context.api=async(path)=>{calls.push({path});return path.endsWith('/receipt')?{receipt:'TEST-image'}:{items:[{revision:0,event:'created',actor:'TEST-owner',created:'2026-10-27T10:00:00Z',amountMinor:1500000,payerReference:'TEST',reason:''}],nextCursor:null};};
  context.rows=[{id:'abc',revision:1,userId:'sitter',amountMinor:1500000,status:'needs_info',created:'2026-10-27T10:00:00Z'}];
  vm.runInContext('renderTopups(rows)',context);
  const card=get('#walletPanel').children.find(n=>n.tag==='article');
  const history=card.children.find(n=>n.tag==='details'&&n.children[0].textContent.includes('tarixi'));
  history.open=true;await history.ontoggle();
  assert.equal(calls.length,1);assert.equal(calls[0].path,'topups/abc/history');
  const entry=history.children.find(n=>n.tag==='section');
  assert.ok(entry.children.some(n=>n.textContent.includes('TEST-owner')));
  await entry.children.find(n=>n.tag==='button').onclick();
  assert.equal(calls[1].path,'topups/abc/history/0/receipt');
  assert.equal(entry.children.filter(n=>n.tag==='img').length,1);
});


test('settings history is read-only, paginated, retryable and renders reason as text', async()=>{
  const {context,get,calls}=setup();
  context.config={version:7,commissionBps:1000,minimumBalanceMinor:1500000,qrImage:null,testOnly:true,qrActive:false};
  let page=0, fail=true;
  context.api=async(path,method)=>{
    calls.push({path,method});
    if(fail){fail=false;throw Error('TEST unavailable');}
    page++;
    return {items:[{version:page===1?22:2,commissionBps:1234,actor:'admin',reason:'<script>TEST</script>',effectiveAt:'2026-10-28T00:00:00+00:00',testOnly:true,qrActive:false}],nextCursor:page===1?'3':null};
  };
  vm.runInContext('renderWalletSettings(config)',context);
  const history=get('#walletPanel').children.find(n=>n.tag==='section');
  const more=history.children.find(n=>n.tag==='button');
  await more.onclick(); assert.equal(more.disabled,false); assert.ok(history.children.some(n=>n.textContent==='TEST unavailable'));
  await more.onclick(); assert.equal(more.hidden,false);
  await more.onclick(); assert.equal(more.hidden,true);
  assert.equal(calls.at(-1).path,'platform-settings/history?before=3');
  assert.ok(calls.every(c=>c.method===undefined));
  const entries=history.children.find(n=>n.tag==='div');
  assert.equal(entries.children.length,2);
  assert.ok(entries.children[0].children.some(n=>n.textContent==='Sabab: <script>TEST</script>'));
  assert.ok(entries.children[0].children.some(n=>n.textContent.includes('12.34%')));
});
