/* Private support threads. Replies identify Momiq, never impersonate a sitter. */
let supportGeneration=0;
async function openSupport(identity=null) {
  const generation=++supportGeneration; ++chatReportGeneration;
  state.panel='support';state.tab='profile';
  for(const id of ['accountWorkspace','accountStats','walletPanel'])$('#'+id).hidden=true;
  const panel=$('#chatPanel');panel.hidden=false;
  $('#heading').textContent='Yordam murojaatlari';
  for(const id of ['usersNav','sittersNav','listingsNav','topupsNav','settingsNav','chatReportsNav','reviewsNav','supportNav','disputesNav','bookingsNav'])$('#'+id).classList.toggle('active',id==='supportNav');
  $('#refresh').onclick=()=>openSupport(identity);
  panel.replaceChildren(el('p','Yuklanmoqda…'));
  const current=()=>generation===supportGeneration&&state.panel==='support'&&!panel.hidden;
  try {
    if(identity){
      const page=await api('support/'+identity);if(!current())return;
      panel.replaceChildren();const back=el('button','Murojaatlar ro‘yxati','secondary');back.onclick=()=>openSupport();panel.append(back);
      renderSupportThread(panel,page,current);return;
    }
    const page=await api('support');if(!current())return;
    panel.replaceChildren(el('h2','Yordam murojaatlari'),el('p','Javob Momiq yordam xizmati nomidan yuboriladi. Murojaatni yopish balans yoki buyurtma holatini o‘zgartirmaydi.','meta'));
    const rows=el('div');panel.append(rows);const seen=new Set();
    const add=items=>{for(const row of items){if(seen.has(row.id))continue;seen.add(row.id);const b=el('button',row.subject+' · '+row.status+' · '+row.updated,'secondary');b.onclick=()=>openSupport(row.id);rows.append(b);}};
    add(page.items);if(!page.items.length)rows.append(el('p','Hali murojaat yo‘q.'));
    let cursor=page.nextCursor;const more=el('button','Yana','secondary');more.hidden=!cursor;panel.append(more);
    more.onclick=async()=>{more.disabled=true;try{const next=await api('support?before='+encodeURIComponent(cursor));if(!current())return;add(next.items);cursor=next.nextCursor;more.hidden=!cursor;}catch(e){notice(e.message);}finally{more.disabled=false;}};
  }catch(e){if(current())panel.replaceChildren(el('p',e.message));}
}
function renderSupportThread(panel,page,current=()=>true){
  const row=page.ticket;
  panel.append(el('h2',row.subject),el('p',row.topic+' · '+row.status+' · v'+row.revision),el('p','Murojaat #'+row.id,'meta'));
  if(row.bookingId)panel.append(el('p','Buyurtma #'+row.bookingId));
  const history=el('div');panel.append(history);let messages=page.items, cursor=page.nextCursor;
  const draw=()=>{history.replaceChildren();for(const m of messages){const card=el('article',undefined,'walletRequest');card.append(el('b',m.authorRole==='support'?'Momiq yordam xizmati':'Murojaat egasi'),el('p',m.text),el('p',m.created+' · '+m.action,'meta'));history.append(card);
    if(m.hasImage){const image=el('button','Maxfiy rasmni ochish','secondary');card.append(image);image.onclick=async()=>{image.disabled=true;try{const result=await api('support/'+row.id+'/messages/'+m.id+'/image');if(!current())return;const img=el('img');img.src=source(result.image);img.alt='Murojaatga biriktirilgan rasm';img.style.maxWidth='100%';card.append(img);image.hidden=true;}catch(e){notice(e.message);}finally{image.disabled=false;}};}
  }};draw();
  const older=el('button','Oldingi xabarlar','secondary');older.hidden=!cursor;panel.append(older);
  older.onclick=async()=>{older.disabled=true;try{const next=await api('support/'+row.id+'?before='+encodeURIComponent(cursor));if(!current())return;const ids=new Set(messages.map(m=>m.id));messages=[...next.items.filter(m=>!ids.has(m.id)),...messages];cursor=next.nextCursor;older.hidden=!cursor;draw();}catch(e){notice(e.message);}finally{older.disabled=false;}};
  const form=el('form'),label=el('label','Javob yoki yopish sababi'),body=el('textarea');body.maxLength=4000;body.required=true;label.append(body);
  const attachment=el('input');attachment.type='file';attachment.accept='image/png,image/jpeg,image/webp';attachment.setAttribute('aria-label','Rasm biriktirish');
  const action=el('select');for(const [v,t] of [['reply','Javob yuborish'],['resolve','Sabab bilan yopish']]){const option=el('option',t);option.value=v;action.append(option);}action.value='reply';
  let image=null,pending=null,picking=false;
  const send=el('button','Yuborish');
  attachment.onchange=async()=>{picking=true;send.disabled=true;try{image=attachment.files[0]?await readImage(attachment.files[0]):null;}catch(e){image=null;attachment.value='';notice(e.message);}finally{picking=false;send.disabled=false;}};
  form.append(label,attachment,action,send);panel.append(form);
  form.onsubmit=async event=>{
    event.preventDefault();if(picking||!current()||(!pending&&!body.value.trim()))return;
    pending??={text:body.value.trim(),image,action:action.value,revision:row.revision,requestId:crypto.randomUUID()};
    send.disabled=true;body.disabled=true;action.disabled=true;attachment.disabled=true;
    try{await api('support/'+row.id,'POST',pending);if(current())await openSupport(row.id);}
    catch(e){notice(e.message);send.textContent='Ayni javobni qayta yuborish';}
    finally{send.disabled=false;}
  };
}
$('#supportNav').onclick=()=>openSupport();
