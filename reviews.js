/* Review text/rating is immutable. Moderation changes visibility only. */
let reviewGeneration = 0;
async function openReviews() {
  const generation = ++reviewGeneration;
  ++chatReportGeneration;
  state.panel = 'reviews'; state.tab = 'profile';
  $('#accountWorkspace').hidden = true; $('#accountStats').hidden = true; $('#walletPanel').hidden = true;
  const panel = $('#chatPanel'); panel.hidden = false;
  $('#heading').textContent = 'Buyurtma sharhlari';
  for (const id of ['usersNav','sittersNav','listingsNav','topupsNav','settingsNav','chatReportsNav','reviewsNav','supportNav','disputesNav','bookingsNav','metricsNav','workQueueNav']) {
    $('#'+id).classList.toggle('active', id === 'reviewsNav');
  }
  $('#refresh').onclick = openReviews;
  panel.replaceChildren(el('p','Yuklanmoqda…'));
  const current = () => generation === reviewGeneration && state.panel === 'reviews' && !panel.hidden;
  try {
    const page = await api('reviews'); if (!current()) return;
    panel.replaceChildren(el('h2','Buyurtma sharhlari'),el('p','Matn va yulduz tahrirlanmaydi. TEST sharhlar umumiy reytingga kirmaydi. Qaror sababi va tarixi saqlanadi.','meta'));
    const list=el('div');panel.append(list);const ids=new Set();
    const add=items=>{for(const row of items){if(ids.has(row.id))continue;ids.add(row.id);renderReview(list,row,current);}};
    add(page.items);if(!page.items.length)list.append(el('p','Hali sharh yo‘q.'));
    let cursor=page.nextCursor;const more=el('button','Yana','secondary');more.hidden=!cursor;panel.append(more);
    more.onclick=async()=>{more.disabled=true;try{const next=await api('reviews?before='+encodeURIComponent(cursor));if(!current())return;add(next.items);cursor=next.nextCursor;more.hidden=!cursor;}catch(e){notice(e.message);}finally{more.disabled=false;}};
  } catch(e) {if(current())panel.replaceChildren(el('p',e.message));}
}

function renderReview(list,row,current=()=>true) {
  const article=el('article',undefined,'walletRequest');list.append(article);
  article.append(el('h3',row.name+' · '+row.stars+' / 5'),el('p',row.text),
    el('p','Buyurtma #'+row.bookingId+' · v'+row.revision,'meta'));
  if(row.testOnly)article.append(el('p','TEST — reytingga kirmaydi.'));
  article.append(el('p',row.hidden?'Moderatsiya yashirgan.':row.withdrawn?'Muallif yashirgan.':'Ko‘rinmoqda.'));
  const form=el('form'),label=el('label','Qaror sababi'),reason=el('input');reason.required=true;reason.maxLength=500;label.append(reason);form.append(label);
  const submit=el('button',row.hidden?'Moderatsiya cheklovini olish':'Sharhni yashirish');form.append(submit);article.append(form);
  let pending=null;
  form.onsubmit=async event=>{
    event.preventDefault();if(submit.disabled||!current()||(!pending&&!reason.value.trim()))return;
    pending??={revision:row.revision,hidden:!row.hidden,reason:reason.value.trim(),requestId:crypto.randomUUID()};
    submit.disabled=true;reason.disabled=true;
    try{await api('reviews/'+row.id+'/moderate','POST',pending);if(current())await openReviews();}
    catch(e){if(current()){notice(e.message);submit.textContent='Ayni qarorni qayta yuborish';}}
    finally{submit.disabled=false;}
  };
  const history=el('div'),load=el('button','Qarorlar tarixini ko‘rish','secondary');article.append(load,history);
  let cursor=null,started=false;
  load.onclick=async()=>{
    if(load.disabled||!current())return;load.disabled=true;
    try{
      const page=await api('reviews/'+row.id+'/history'+(cursor?'?before='+encodeURIComponent(cursor):''));
      if(!current())return;
      for(const item of page.items){history.append(el('p',item.created+' · '+item.actor+' · v'+item.revision),el('p',item.payload.reason||item.action));}
      if(!started&&!page.items.length)history.append(el('p','Tarix bo‘sh.'));
      started=true;cursor=page.nextCursor;load.hidden=!cursor;load.textContent='Oldingi qarorlar';
    }catch(e){if(current())notice(e.message);}finally{load.disabled=false;}
  };
}
$('#reviewsNav').onclick=openReviews;
