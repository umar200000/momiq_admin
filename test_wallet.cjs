const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
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
