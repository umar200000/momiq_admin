/* An allegation is not an incident. Only explicit decisions can refund commission. */
let disputeGeneration=0;
function disputeShell(title){
  ++chatReportGeneration;state.panel='disputes';state.tab='profile';
  for(const id of ['accountWorkspace','accountStats','walletPanel'])$('#'+id).hidden=true;
  const panel=$('#chatPanel');panel.hidden=false;panel.replaceChildren(el('p','Yuklanmoqda…'));
  $('#heading').textContent=title;
  for(const id of ['usersNav','sittersNav','listingsNav','topupsNav','settingsNav','chatReportsNav','reviewsNav','supportNav','disputesNav','bookingsNav','metricsNav','workQueueNav'])$('#'+id).classList.toggle('active',id==='disputesNav');
  return panel;
}
async function openDisputes(identity=null,filter='open'){
  const generation=++disputeGeneration,panel=disputeShell('Nizolar va takroriy holatlar');
  const current=()=>generation===disputeGeneration&&state.panel==='disputes'&&!panel.hidden;
  $('#refresh').onclick=()=>openDisputes(identity,filter);
  try{
    if(identity){const page=await api('disputes/'+identity);if(!current())return;panel.replaceChildren();const back=el('button','Nizolar navbati','secondary');back.onclick=()=>openDisputes();panel.append(back);renderDispute(panel,page,current);return;}
    const page=await api('disputes?status='+filter);if(!current())return;
    panel.replaceChildren(el('h2',filter==='open'?'Ochiq nizolar':'Yopilgan nizolar'),el('p','48 soat — ko‘rib chiqish muddati. Muddat o‘tishi avtomatik qaror yoki pul qaytimini yaratmaydi.','meta'));
    const switcher=el('button',filter==='open'?'Yopilgan nizolar':'Ochiq nizolar','secondary');switcher.onclick=()=>openDisputes(null,filter==='open'?'resolved':'open');
    const incidents=el('button','30 kunlik takroriy holatlar','secondary');incidents.onclick=openIncidents;panel.append(switcher,incidents);
    const list=el('div');panel.append(list);const seen=new Set();
    const add=items=>{for(const row of items){if(seen.has(row.bookingId))continue;seen.add(row.bookingId);const b=el('button',(row.overdue?'MUDDAT O‘TGAN · ':'')+row.kind+' · #'+row.bookingId+' · '+row.deadline,'secondary');b.onclick=()=>openDisputes(row.bookingId);list.append(b);}};
    add(page.items);if(!page.items.length)list.append(el('p','Bu holatda nizo yo‘q.'));
    let cursor=page.nextCursor;const more=el('button','Yana','secondary');more.hidden=!cursor;panel.append(more);
    more.onclick=async()=>{more.disabled=true;try{const next=await api('disputes?status='+filter+'&before='+cursor);if(!current())return;add(next.items);cursor=next.nextCursor;more.hidden=!cursor;}catch(e){notice(e.message);}finally{more.disabled=false;}};
  }catch(e){if(current())panel.replaceChildren(el('p',e.message));}
}
function renderDispute(panel,page,current=()=>true){
  const row=page.case;if(!row){panel.append(el('p','Bu buyurtmada nizo yo‘q.'));return;}
  panel.append(el('h2',row.kind==='no_show'?'Kelmaslik nizosi':'Xizmat nizosi'),el('p','Buyurtma #'+row.bookingId+' · '+row.status+' · avval '+row.priorStatus),
    el('p','Mijoz: '+(page.customerName||page.customerId)+' · Enaga: '+(page.sitterName||page.sitterId),'meta'),el('p','Ko‘rib chiqish: '+row.deadline+(row.overdue?' — MUDDAT O‘TGAN':'')),
    el('p','Qaytarilishi mumkin komissiya: '+walletMoney(page.refundableMinor)),el('p','Mijozning xizmat puli Momiq orqali qaytarilmaydi. Dalilning o‘zi aybni tasdiqlamaydi.','meta'));
  for(const event of page.handoverConfirmations||[])panel.append(el('p','Topshirish/qabul tasdig‘i: '+event.role+' · '+event.action+' · '+event.created));
  let messages=page.items,cursor=page.nextCursor;const evidence=el('div');panel.append(evidence);
  const draw=()=>{evidence.replaceChildren();for(const item of messages){const card=el('article',undefined,'walletRequest');card.append(el('b',item.role+' · '+item.action),el('p',item.text),el('p',item.created,'meta'));evidence.append(card);
    if(item.hasImage){const open=el('button','Maxfiy dalil rasmini ochish','secondary');card.append(open);open.onclick=async()=>{open.disabled=true;try{const data=await api('disputes/'+row.bookingId+'/evidence/'+item.id+'/image');if(!current())return;card.append(walletImage(data.image,'Nizo dalili'));open.hidden=true;}catch(e){notice(e.message);}finally{open.disabled=false;}};}
  }};draw();
  const more=el('button','Oldingi dalillar','secondary');more.hidden=!cursor;panel.append(more);
  more.onclick=async()=>{more.disabled=true;try{const next=await api('disputes/'+row.bookingId+'?before='+cursor);if(!current())return;const ids=new Set(messages.map(m=>m.id));messages=[...next.items.filter(m=>!ids.has(m.id)),...messages];cursor=next.nextCursor;more.hidden=!cursor;draw();}catch(e){notice(e.message);}finally{more.disabled=false;}};
  if(row.status==='resolved'){panel.append(el('p',row.outcome+' · '+row.reason),el('p','Komissiya qaytimi: '+walletMoney(row.refundMinor)));return;}
  const form=el('form'),decisionLabel=el('label','Dalil asosidagi qaror'),decision=el('select');decision.required=true;
  for(const [value,label] of [['','Qarorni tanlang'],['not_started','Xizmat boshlanmagan — to‘liq komissiya qaytimi'],['continue','Nizo yopilsin — avvalgi holatga qaytish'],...(row.kind==='service'?[['cancel_service','Boshlangan xizmatni bekor qilish — belgilangan qaytim']]:[])]){const o=el('option',label);o.value=value;decision.append(o);}decision.value='';decisionLabel.append(decision);form.append(decisionLabel);
  const faultLabel=el('label','Kelmaslik tasdiqlangan tomon'),fault=el('select');for(const [value,label] of [['none','Hech kim / ayb tasdiqlanmagan'],['customer','Mijoz'],['sitter','Enaga']]){const o=el('option',label);o.value=value;fault.append(o);}fault.value='none';faultLabel.append(fault);form.append(faultLabel);
  const emergencyLabel=el('label','Tasdiqlangan favqulodda holat — 30 kunlik hisobdan chiqarish'),emergency=el('input');emergency.type='checkbox';emergencyLabel.append(emergency);form.append(emergencyLabel);
  const amount=walletField(form,'Ichki balansga komissiya qaytimi (so‘m)','refund');amount.value='0';amount.inputMode='decimal';
  const reasonLabel=el('label','Qaror va asos — IKKALA TOMONGA KO‘RINADI'),reason=el('textarea');reason.required=true;reason.maxLength=1000;reasonLabel.append(reason);form.append(reasonLabel);
  const update=()=>{const noShow=decision.value==='not_started'&&row.kind==='no_show';fault.disabled=!noShow;emergency.disabled=!noShow;if(!noShow){fault.value='none';emergency.checked=false;}amount.disabled=decision.value!=='cancel_service';amount.value=decision.value==='not_started'?(page.refundableMinor/100).toFixed(2):'0';};decision.onchange=update;update();
  const send=el('button','Qarorni tasdiqlash');form.append(send);panel.append(form);let pending=null;
  form.onsubmit=async event=>{
    event.preventDefault();if(!current())return;
    try{
      if(!pending){if(!decision.value||!reason.value.trim())return;const minor=parseMinor(amount.value,true);if(minor>page.refundableMinor)throw Error('Qaytim yechilgan komissiyadan oshmaydi.');
        if(!confirm('Qaror: '+decision.value+'. Ichki komissiya qaytimi: '+walletMoney(minor)+'. Mijozning xizmat puliga tegilmaydi. Tasdiqlaysizmi?'))return;
        pending={revision:row.revision,bookingRevision:page.bookingRevision,requestId:crypto.randomUUID(),outcome:decision.value,reason:reason.value.trim(),fault:fault.value,emergency:emergency.checked===true,refundMinor:minor};}
      for(const field of [decision,fault,emergency,amount,reason,send])field.disabled=true;
      await api('disputes/'+row.bookingId+'/resolve','POST',pending);if(current())await openDisputes(row.bookingId);
    }catch(e){notice(e.message);if(pending)send.textContent='Ayni qarorni qayta yuborish';}finally{send.disabled=false;}
  };
}
async function openIncidents(){
  const generation=++disputeGeneration,panel=disputeShell('Takroriy holatlar');const current=()=>generation===disputeGeneration&&state.panel==='disputes'&&!panel.hidden;
  $('#refresh').onclick=openIncidents;
  try{const page=await api('incidents');if(!current())return;panel.replaceChildren(el('h2','30 kunlik takroriy holatlar'),el('p','3 ta alohida buyurtmadagi tasdiqlangan kech bekor/kelmaslik admin ko‘rigiga chiqadi. Favqulodda holatlar hisoblanmaydi. Avtomatik jarima yoki blok yo‘q.','meta'));
    const back=el('button','Nizolar','secondary');back.onclick=()=>openDisputes();panel.append(back);
    const list=el('div');panel.append(list);const seen=new Set();const add=items=>{for(const row of items){const key=row.booking_id+':'+row.user_id;if(seen.has(key))continue;seen.add(key);renderIncident(list,row,current);}};
    add(page.items);if(!page.items.length)list.append(el('p','Tasdiqlangan hodisalar yo‘q.'));
    let cursor=page.nextCursor;const more=el('button','Yana','secondary');more.hidden=!cursor;panel.append(more);more.onclick=async()=>{more.disabled=true;try{const next=await api('incidents?before='+cursor);if(!current())return;add(next.items);cursor=next.nextCursor;more.hidden=!cursor;}catch(e){notice(e.message);}finally{more.disabled=false;}};
  }catch(e){if(current())panel.replaceChildren(el('p',e.message));}
}
function renderIncident(list,row,current=()=>true){
  const card=el('article',undefined,'walletRequest');list.append(card);card.append(el('h3',(row.reviewRequired?'ADMIN KO‘RIGI · ':'')+(row.name||row.user_id)+' · '+row.count30Days+' / 30 kun'),el('p',row.kind+' · #'+row.booking_id+' · '+row.occurred_at),el('p',row.excused?'Favqulodda holat sabab hisobdan chiqarilgan.':'Hisobga olinadigan tasdiqlangan hodisa.'));
  const form=el('form'),label=el('label','Favqulodda holat bo‘yicha qaror sababi'),reason=el('textarea');reason.required=true;reason.maxLength=1000;label.append(reason);const submit=el('button',row.excused?'Istisnoni bekor qilish':'Favqulodda holat deb istisno qilish');form.append(label,submit);card.append(form);let pending=null;
  form.onsubmit=async event=>{event.preventDefault();if(!current()||(!pending&&!reason.value.trim()))return;pending??={revision:row.revision,requestId:crypto.randomUUID(),excused:!row.excused,reason:reason.value.trim()};reason.disabled=true;submit.disabled=true;try{await api('incidents/'+row.booking_id+'/'+encodeURIComponent(row.user_id)+'/excuse','POST',pending);if(current())await openIncidents();}catch(e){notice(e.message);submit.textContent='Ayni qarorni qayta yuborish';}finally{submit.disabled=false;}};
  const history=el('div'),load=el('button','Qarorlar tarixi','secondary');card.append(load,history);let cursor=null;
  load.onclick=async()=>{load.disabled=true;try{const page=await api('incidents/'+row.booking_id+'/'+encodeURIComponent(row.user_id)+'/history'+(cursor?'?before='+cursor:''));if(!current())return;for(const item of page.items)history.append(el('p',item.created+' · '+item.actor+' · '+item.reason));cursor=page.nextCursor;load.hidden=!cursor;}catch(e){notice(e.message);}finally{load.disabled=false;}};
}
$('#disputesNav').onclick=()=>openDisputes();
