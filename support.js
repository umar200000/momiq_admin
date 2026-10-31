/* Private support threads. Replies identify Momiq, never impersonate a sitter. */
let supportGeneration=0;
async function openSupport(identity=null,draft=null) {
  const generation=++supportGeneration; ++chatReportGeneration;
  state.panel='support';state.tab='profile';
  for(const id of ['accountWorkspace','accountStats','walletPanel'])$('#'+id).hidden=true;
  const panel=$('#chatPanel');panel.hidden=false;
  $('#heading').textContent='Yordam murojaatlari';
  for(const id of ['usersNav','sittersNav','listingsNav','topupsNav','settingsNav','chatReportsNav','reviewsNav','supportNav','disputesNav','bookingsNav','metricsNav','workQueueNav'])$('#'+id).classList.toggle('active',id==='supportNav');
  $('#refresh').onclick=()=>openSupport(identity);
  panel.replaceChildren(el('p','Yuklanmoqda…'));
  const current=()=>generation===supportGeneration&&state.panel==='support'&&!panel.hidden;
  try {
    if(identity){
      const page=await api('support/'+identity);if(!current())return;
      panel.replaceChildren();const back=el('button','Murojaatlar ro‘yxati','secondary');back.onclick=()=>openSupport();panel.append(back);
      renderSupportThread(panel,page,current,draft);return;
    }
    const page=await api('support');if(!current())return;
    panel.replaceChildren(el('h2','Yordam murojaatlari'),el('p','Javob Momiq yordam xizmati nomidan yuboriladi. Murojaatni yopish balans yoki buyurtma holatini o‘zgartirmaydi.','meta'));
    const rows=el('div');panel.append(rows);const seen=new Set();
    const add=items=>{for(const row of items){if(seen.has(row.id))continue;seen.add(row.id);const b=el('button',row.subject+' · '+row.status+' · '+row.updated,'secondary');b.onclick=()=>openSupport(row.id);rows.append(b);}};
    add(page.items);if(!page.items.length)rows.append(el('p','Hali murojaat yo‘q.'));
    let cursor=page.nextCursor;const more=el('button','Yana','secondary');more.hidden=!cursor;panel.append(more);
    more.onclick=async()=>{more.disabled=true;try{const next=await api('support?before='+encodeURIComponent(cursor));if(!current())return;add(next.items);cursor=next.nextCursor;more.hidden=!cursor;}catch(e){if(current())notice(e.message);}finally{if(current())more.disabled=false;}};
  }catch(e){if(current())panel.replaceChildren(el('p',e.message));}
}
function renderSupportThread(panel,page,current=()=>true,draft=null){
  const row=page.ticket,appeal=page.target?.purpose==='appeal',decisionVersion=page.decisionContext?.version;
  const canResolve=page.canResolve!==false&&(!appeal||typeof decisionVersion==='string'&&/^[a-f0-9]{64}$/.test(decisionVersion));
  panel.append(el('h2',row.subject),el('p',row.topic+' · '+row.status+' · v'+row.revision),el('p','Murojaat #'+row.id,'meta'));
  if(page.videoReport)panel.append(el('p','Video hisobot #'+page.videoReport.id+' · '+page.videoReport.day+' · '+page.videoReport.slot));
  if(row.topic==='account_deletion')panel.append(el('p','Hisob egasi hisobini o‘chirish bo‘yicha so‘rov yuborgan. Murojaatni yopish hisobni o‘chirish amali hisoblanmaydi.','meta'));
  if(row.bookingId)panel.append(el('p','Buyurtma #'+row.bookingId));
  if(page.target){
    const target=page.target,box=el('section');
    box.append(el('h3',target.purpose==='appeal'?'Qarorni qayta ko‘rib chiqish':target.kind==='review'?'Sharhga shikoyat':'E’lon/profilga shikoyat'),el('p','Manba #'+target.id+' · '+target.capturedAt));
    box.append(el('p',target.purpose==='appeal'?'Yuborilgan paytdagi qaror nusxasi. Yakuniy javobni administrator yozadi. Yopish kontentni avtomatik tiklamaydi; ko‘rinish qarori tegishli moderatsiya bo‘limida alohida audit bilan bajariladi.':'Yuborilgan paytdagi ommaviy matn nusxasi. Bu rasm/video arxivi emas. Murojaatga javob berish yoki uni yopish kontentni yashirmaydi.','meta'));
    const photo=target.snapshot?.media;
    if(target.kind==='listing' && photo && typeof photo.slot==='string'){
      const home=/^home:(0|[1-9][0-9]?)$/.exec(photo.slot);
      if(photo.slot==='portrait'||home)box.append(el('p',photo.slot==='portrait'?'Shikoyat qilingan rasm — profil rasmi':'Shikoyat qilingan rasm — uy rasmi '+(Number(home[1])+1)));
    }
    box.append(el('pre',JSON.stringify(target.snapshot,null,2)));
    if(appeal&&page.canResolve!==false){
      box.append(el('h3','Yopishda bog‘lanadigan amaldagi qaror'));
      if(canResolve)box.append(el('pre',JSON.stringify(page.decisionContext.snapshot,null,2)),el('p','Yakuniy javob shu holat bilan birga saqlanadi. Qaror o‘zgarsa avval yangilang.','meta'));
      else box.append(el('p','Amaldagi qaror yuklanmagan. Yopishdan oldin panelni yangilang.','meta'));
    }
    if(['support','administrator'].includes(state.operator?.role)){
      const queue=el('button','Ish navbati / administratorga yo‘naltirish','secondary');
      queue.onclick=()=>{if(current())return openWorkQueue('support','all',row.id);};box.append(queue);
    }
    panel.append(box);
  }
  const history=el('div');panel.append(history);let messages=page.items, cursor=page.nextCursor;
  const draw=()=>{history.replaceChildren();for(const m of messages){const card=el('article',undefined,'walletRequest');card.append(el('b',m.authorRole==='support'?'Momiq yordam xizmati':'Murojaat egasi'),el('p',m.text),el('p',m.created+' · '+m.action,'meta'));history.append(card);
    if(m.resolution){card.append(el('h4','Yopish paytidagi qaror nusxasi'),el('pre',JSON.stringify(m.resolution.snapshot,null,2)));if(m.resolution.sourceEvent)card.append(el('p','Qaror manbasi: '+m.resolution.sourceEvent,'meta'));}
    if(m.hasImage){const image=el('button','Maxfiy rasmni ochish','secondary');card.append(image);image.onclick=async()=>{image.disabled=true;try{const result=await api('support/'+row.id+'/messages/'+m.id+'/image');if(!current())return;const img=el('img');img.src=source(result.image);img.alt='Murojaatga biriktirilgan rasm';img.style.maxWidth='100%';card.append(img);image.hidden=true;}catch(e){if(current())notice(e.message);}finally{if(current())image.disabled=false;}};}
  }};draw();
  const older=el('button','Oldingi xabarlar','secondary');older.hidden=!cursor;panel.append(older);
  older.onclick=async()=>{older.disabled=true;try{const next=await api('support/'+row.id+'?before='+encodeURIComponent(cursor));if(!current())return;const ids=new Set(messages.map(m=>m.id));messages=[...next.items.filter(m=>!ids.has(m.id)),...messages];cursor=next.nextCursor;older.hidden=!cursor;draw();}catch(e){if(current())notice(e.message);}finally{if(current())older.disabled=false;}};
  const form=el('form'),label=el('label','Javob yoki yopish sababi'),body=el('textarea');body.maxLength=4000;body.required=true;label.append(body);
  const attachment=el('input');attachment.type='file';attachment.accept='image/png,image/jpeg,image/webp';attachment.setAttribute('aria-label','Rasm biriktirish');
  const action=el('select');for(const [v,t] of [['reply','Javob yuborish'],...(canResolve?[['resolve','Sabab bilan yopish']]:[])]){const option=el('option',t);option.value=v;action.append(option);}action.value='reply';
  body.value=draft?.text||'';
  let image=draft?.image||null,pending=null,picking=false,sending=false,pickGeneration=0;
  const send=el('button','Yuborish'),reloadDecision=el('button','Qarorni qayta ko‘rish','secondary');
  reloadDecision.type='button';reloadDecision.hidden=true;reloadDecision.onclick=()=>{if(current()&&!sending)return openSupport(row.id,{text:body.value,image});};
  attachment.onchange=async()=>{
    if(!current()||pending||sending)return;
    const generation=++pickGeneration,file=attachment.files[0];
    const active=()=>current()&&generation===pickGeneration;
    picking=true;send.disabled=true;
    try{const selected=file?await readImage(file):null;if(active())image=selected;}
    catch(e){if(active()){image=null;attachment.value='';notice(e.message);}}
    finally{if(active()){picking=false;send.disabled=false;}}
  };
  form.append(label,attachment,action,send);panel.append(form,reloadDecision);
  form.onsubmit=async event=>{
    event.preventDefault();if(picking||sending||!current()||(!pending&&!body.value.trim()))return;
    if(!pending&&action.value==='resolve'&&!canResolve)return;
    pending??={text:body.value.trim(),image,action:action.value,revision:row.revision,requestId:crypto.randomUUID(),...(appeal&&action.value==='resolve'?{decisionVersion}:{})};
    sending=true;send.disabled=true;body.disabled=true;action.disabled=true;attachment.disabled=true;
    try{
      const result=await api('support/'+row.id,'POST',pending);
      if(!current())return;
      const receipt=result?.acknowledgement;
      if(result?.ticket?.id!==row.id || !Number.isSafeInteger(result.ticket.revision) ||
         result.ticket.revision<pending.revision+1 || receipt?.ticketId!==row.id ||
         receipt.requestId!==pending.requestId || receipt.action!==pending.action ||
         receipt.revision!==pending.revision+1 || typeof receipt.messageId!=='string' ||
         !/^[1-9][0-9]{0,17}$/.test(receipt.messageId)){
        throw Error('Murojaat tasdig‘i mos kelmadi.');
      }
      await openSupport(row.id);
    }
    catch(e){if(current()){notice(e.message);send.textContent='Ayni javobni qayta yuborish';if(appeal&&pending.action==='resolve'&&[409,428].includes(e.status))reloadDecision.hidden=false;}}
    finally{if(current()){sending=false;send.disabled=false;}}
  };
}
$('#supportNav').onclick=()=>openSupport();
