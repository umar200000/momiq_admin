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
  assert.equal(vm.runInContext("parseMinor('0',true)",context),0);
  for(const value of ['0','-1','1e3','1.001','1000000001']) assert.throws(()=>vm.runInContext(`parseMinor('${value}')`,context));
});
test('approval requires verified matching incoming funds; rejection needs only reason', async () => {
  const {context,get,calls,notices} = setup();
  context.rows=[{id:'abc',userId:'sitter',amountMinor:1500001,status:'pending',created:'2026-10-27',receipt:'test'}];
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
  await second.children.find(n=>n.type==='button').onclick();
  assert.equal(calls.find(c=>c.body?.decision==='reject').body.reason,'No incoming transfer');
});
