/* Booking oversight is read-only. Decisions use the separately audited dispute flow. */
let adminBookingGeneration=0;
const bookingStates=['all','pending','accepted','active','disputed','completed','cancelled','rejected','expired'];
async function openAdminBookings(identity=null,filter={status:'all',q:''}){
  const generation=++adminBookingGeneration,panel=$('#chatPanel');
  state.panel='bookings';state.tab='profile';++chatReportGeneration;
  for(const id of ['accountWorkspace','accountStats','walletPanel'])$('#'+id).hidden=true;
  panel.hidden=false;panel.replaceChildren(el('p','Yuklanmoqda…'));$('#heading').textContent='Buyurtmalar';
  for(const id of ['usersNav','sittersNav','listingsNav','topupsNav','settingsNav','chatReportsNav','reviewsNav','supportNav','disputesNav','bookingsNav','metricsNav','workQueueNav'])$('#'+id).classList.toggle('active',id==='bookingsNav');
  const current=()=>generation===adminBookingGeneration&&state.panel==='bookings'&&!panel.hidden;
  $('#refresh').onclick=()=>openAdminBookings(identity,filter);
  try{
    if(identity){
      const page=await api('bookings/'+identity);if(!current())return;
      panel.replaceChildren();const back=el('button','Buyurtmalar ro‘yxati','secondary');back.onclick=()=>openAdminBookings(null,filter);panel.append(back);
      renderAdminBooking(panel,page,current);return;
    }
    const query=new URLSearchParams(filter).toString(),page=await api('bookings?'+query);if(!current())return;
    panel.replaceChildren(el('p','Buyurtmalar faqat ko‘riladi. Bekor qilish yoki komissiya qaytimi nizo bo‘yicha dalilli qaror orqali bajariladi.','meta'));
    const form=el('form'),label=el('label','Buyurtma raqami yoki tomonning ismi'),search=el('input');search.value=filter.q;search.maxLength=80;label.append(search);
    const statusLabel=el('label','Holat'),select=el('select');for(const value of bookingStates){const o=el('option',value==='all'?'Barchasi':value);o.value=value;select.append(o);}select.value=filter.status;statusLabel.append(select);
    const submit=el('button','Qidirish');form.append(label,statusLabel,submit);form.onsubmit=e=>{e.preventDefault();openAdminBookings(null,{status:select.value,q:search.value.trim()});};panel.append(form);
    const list=el('div');panel.append(list);const seen=new Set();
    const add=items=>{for(const row of items){if(seen.has(row.id))continue;seen.add(row.id);const card=el('article',undefined,'walletRequest');card.append(el('b',(row.testOnly?'TEST · ':'')+(services[row.service]||row.service)+' · '+row.status),el('p',row.customerName+' → '+row.sitterName),el('p',row.startsAt+' — '+row.endsAt),el('p','Kelishilgan xizmat summasi: '+walletMoney(row.serviceTotalMinor)));const open=el('button','#'+row.id,'secondary');open.onclick=()=>openAdminBookings(row.id,filter);card.append(open);list.append(card);}};
    add(page.items);if(!page.items.length)list.append(el('p','Bu filtrga mos buyurtma yo‘q.'));
    let cursor=page.nextCursor;const more=el('button','Yana','secondary');more.hidden=!cursor;panel.append(more);
    more.onclick=async()=>{more.disabled=true;try{const next=await api('bookings?'+query+'&before='+encodeURIComponent(cursor));if(!current())return;add(next.items);cursor=next.nextCursor;more.hidden=!cursor;}catch(e){if(current())notice(e.message);}finally{more.disabled=false;}};
  }catch(e){if(current()){panel.replaceChildren(el('p',e.message));const retry=el('button','Qayta urinish','secondary');retry.onclick=()=>openAdminBookings(identity,filter);panel.append(retry);}}
}
function renderAdminBooking(panel,page,current){
  const s=page.snapshot;
  panel.append(el('h2','#'+page.id+' · '+page.status),el('p','Mijoz: '+s.customerName+' · Enaga: '+s.sitterName),el('p',(services[page.service]||page.service)+' · '+s.startsAt+' — '+s.endsAt),
    el('p','Javob muddati: '+page.replyDeadline),el('p','Xizmat summasi: '+walletMoney(s.price.service_total_minor)),el('p','Kelishilgan komissiya: '+walletMoney(s.price.commission_minor)),
    el('p','Mijoz xizmat pulini enaga bilan alohida hisob-kitob qiladi. Quyidagi jurnal faqat Momiq komissiyasidir.','meta'),el('p','Manzil: '+(s.address?.address||'Ko‘rsatilmagan')));
  for(const pet of s.pets||[])panel.append(el('p','Hayvon: '+(pet.name||pet.type)+' · '+pet.type));
  panel.append(el('h3','Komissiya jurnali'));
  if(!page.commissionEntries.length)panel.append(el('p','Komissiya yozuvi yo‘q.'));
  for(const item of page.commissionEntries)panel.append(el('p',item.kind+' · '+walletMoney(item.amount_minor)+' · '+item.actor+' · '+item.created+' · '+item.reason));
  if(page.dispute){const dispute=el('button','Nizoni ko‘rish: '+page.dispute.status,'secondary');dispute.onclick=()=>openDisputes(page.id);panel.append(dispute);}
  panel.append(el('h3','Holat tarixi'));
  const history=el('div');panel.append(history);
  adminBookingTimeline(history,'bookings/'+page.id+'/history',page.history,current,false);
  const care=el('button','Parvarish tarixini ochish','secondary'),careBox=el('div');panel.append(care,careBox);
  care.onclick=async()=>{care.disabled=true;try{const result=await api('bookings/'+page.id+'/care');if(!current())return;careBox.replaceChildren(el('p','Parvarish yozuvlari egasi/enaga bildirgan ma’lumotlar; mustaqil xizmat tasdig‘i emas.','meta'));adminBookingTimeline(careBox,'bookings/'+page.id+'/care',result,current,true);care.hidden=true;}catch(e){if(current())notice(e.message);}finally{care.disabled=false;}};
  const videos=el('button','Video hisobotlarni ko‘rish','secondary'),videoBox=el('div');panel.append(videos,videoBox);
  videos.onclick=()=>adminBookingVideos(videoBox,page.id,current);
}
async function adminBookingVideos(box,identity,current,day=null){
  const turn=(box.videoGeneration||0)+1;box.videoGeneration=turn;
  const live=()=>current()&&box.videoGeneration===turn;
  box.replaceChildren(el('p','Videolar yuklanmoqda…'));
  try{
    const result=await api('bookings/'+encodeURIComponent(identity)+'/videos'+(day?'?day='+encodeURIComponent(day):''));
    if(!live())return;
    const label=el('label','Video sanasi · Toshkent'),date=el('input');date.type='date';date.value=result.day;date.max=result.policy.today;date.ariaLabel='Video sanasi';label.append(date);
    date.onchange=()=>adminBookingVideos(box,identity,current,date.value||null);
    box.replaceChildren(label,el('p','Ko‘rish auditda qayd etiladi. Video enaga taqdim etgan hisobot; mustaqil xizmat tasdig‘i emas. Buyurtma tugagach 30 kun, ochiq nizo bo‘lsa yopilganidan keyin yana 30 kun saqlanadi.','meta'));
    for(const pet of result.pets){
      const card=el('article',undefined,'walletRequest');card.append(el('h3',pet.name));
      for(const slot of ['morning','evening']){
        const item=result.items.find(v=>v.petId===pet.id&&v.slot===slot),title=slot==='morning'?'Ertalab':'Kechqurun';
        card.append(el('p',title+(item?' · '+item.durationMs/1000+' soniya':' · Video yuborilmagan')));
        const followup=(result.followups||[]).find(r=>r.slot===slot),note=followup?.explanations.find(n=>n.petId===pet.id);
        if(note)card.append(el('p',(note.emergency?'Enaga favqulodda holat bildirdi: ':'Enaga bildirgan sabab: ')+note.reason+' · '+note.created));
        if(!item)continue;
        if(item.available===false){card.append(el('p','Saqlash muddati tugagan','meta'));continue;}
        const player=el('video',undefined,'reportVideo'),base='/api/admin/bookings/'+encodeURIComponent(identity)+'/videos/'+encodeURIComponent(item.id);
        player.controls=true;player.preload='none';player.playsInline=true;player.src=base+'/playback';player.poster=base+'/poster';
        player.onerror=()=>{if(live())notice('Video ochilmadi. Sahifani yangilang yoki qayta kiring.');};card.append(player);
      }
      box.append(card);
    }
  }catch(e){if(live()){const retry=el('button','Qayta urinish','secondary');retry.onclick=()=>adminBookingVideos(box,identity,current,day);box.replaceChildren(el('p',e.message),retry);}}
}
function adminBookingTimeline(box,path,page,current,care){
  const list=el('div');box.append(list);const seen=new Set();
  const add=items=>{for(const item of items){const key=care?item.id:item.revision;if(seen.has(key))continue;seen.add(key);list.append(el('p',care?item.created+' · '+item.actorRole+' · '+item.petId+' · '+item.day+' · '+item.category+' · '+JSON.stringify(item.payload):item.created+' · '+item.actor+' · '+item.action+' → '+item.status+' · '+item.reason));}};
  add(page.items);if(!page.items.length)list.append(el('p','Hozircha yozuv yo‘q.'));
  let cursor=page.nextCursor;const more=el('button','Oldingi yozuvlar','secondary');more.hidden=!cursor;box.append(more);
  more.onclick=async()=>{more.disabled=true;try{const next=await api(path+'?before='+encodeURIComponent(cursor));if(!current())return;add(next.items);cursor=next.nextCursor;more.hidden=!cursor;}catch(e){if(current())notice(e.message);}finally{more.disabled=false;}};
}
$('#bookingsNav').onclick=()=>openAdminBookings();
