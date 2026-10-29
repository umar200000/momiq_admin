/* Assignment metadata is separate from the source reply/moderation decision. */
let workGeneration=0;
const workKinds={support:'Yordam',listing:'E’lonlar',chat_report:'Chat shikoyatlari'};
function workPath(kind,target){return 'work-queue/'+kind+'/'+encodeURIComponent(target);}
function workDate(value){return value?new Date(value).toLocaleString('uz-UZ'):'Belgilanmagan';}
function workLocalDate(value){if(!value)return '';const date=new Date(value);return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16);}
function workSummary(value){return (value.assignee||'Biriktirilmagan')+' · muddat: '+workDate(value.dueAt)+(value.overdue?' · MUDDAT O‘TGAN':'')+(value.assignee&&!value.assigneeActive?' · operator faol emas':'');}
async function openWorkQueue(kind=null,filter='all',target=null){
  const role=state.operator?.role;
  const kinds=role==='administrator'?Object.keys(workKinds):role==='support'?['support']:role==='moderation'?['listing','chat_report']:[];
  if(!kinds.length)return;kind=kinds.includes(kind)?kind:kinds[0];
  const generation=++workGeneration,panel=$('#chatPanel');state.panel='workQueue';state.tab='profile';
  for(const id of ['accountWorkspace','accountStats','walletPanel'])$('#'+id).hidden=true;
  panel.hidden=false;panel.replaceChildren(el('p','Yuklanmoqda…'));$('#heading').textContent='Ish navbati';
  for(const id of ['users','sitters','listings','topups','chatReports','bookings','disputes','support','reviews','settings','metrics','workQueue'])$('#'+id+'Nav').classList.toggle('active',id==='workQueue');
  $('#refresh').onclick=()=>openWorkQueue(kind,filter,target);
  const current=()=>generation===workGeneration&&state.panel==='workQueue'&&!panel.hidden;
  try{
    if(target){
      const data=await api(workPath(kind,target));if(!current())return;
      const operators=role==='administrator'&&data.source.active?await api('work-queue/operators?kind='+kind):role==='support'&&data.canEscalate?await api(workPath(kind,target)+'/escalation-operators'):{items:[]};if(!current())return;
      panel.replaceChildren();const back=el('button','Ishlar ro‘yxati','secondary');back.onclick=()=>openWorkQueue(kind,filter);panel.append(back);
      renderWorkDetail(panel,data,operators.items,current,()=>openWorkQueue(kind,filter,target));return;
    }
    const url='work-queue?kind='+kind+'&filter='+filter,page=await api(url);if(!current())return;
    panel.replaceChildren(el('h2','Faol ishlar'),el('p','Muddatni administrator har bir ish uchun belgilaydi. Biriktirish buyurtma, balans yoki moderatsiya qarorini o‘zgartirmaydi.','meta'));
    const type=el('select');type.setAttribute('aria-label','Ish turi');for(const value of kinds){const option=el('option',workKinds[value]);option.value=value;type.append(option);}type.value=kind;type.onchange=()=>openWorkQueue(type.value);
    const select=el('select');select.setAttribute('aria-label','Navbat filtri');for(const [value,label] of Object.entries({all:'Barcha faol',mine:'Menga biriktirilgan',unassigned:'Biriktirilmagan',overdue:'Muddati o‘tgan'})){const option=el('option',label);option.value=value;select.append(option);}select.value=filter;select.onchange=()=>openWorkQueue(kind,select.value);panel.append(type,select);
    const rows=el('div'),seen=new Set();panel.append(rows);
    const add=items=>{for(const item of items){if(seen.has(item.source.target))continue;seen.add(item.source.target);const button=el('button',item.source.title+' · '+item.source.status+' · '+workSummary(item.assignment),'secondary');button.onclick=()=>openWorkQueue(kind,filter,item.source.target);rows.append(button);}};
    add(page.items);if(!page.items.length)rows.append(el('p','Bu filtrda faol ish yo‘q.'));
    let cursor=page.nextCursor;const more=el('button','Yana','secondary');more.hidden=!cursor;panel.append(more);
    more.onclick=async()=>{if(more.disabled||!current())return;more.disabled=true;try{const next=await api(url+'&after='+encodeURIComponent(cursor));if(!current())return;add(next.items);cursor=next.nextCursor;more.hidden=!cursor;}catch(e){if(current())notice(e.message);}finally{if(current())more.disabled=false;}};
  }catch(e){if(current()){const retry=el('button','Qayta urinish');retry.onclick=()=>openWorkQueue(kind,filter,target);panel.replaceChildren(el('p',e.message),retry);}}
}
function renderWorkDetail(panel,data,operators,current,reload){
  const {kind,source:row,assignment}=data;
  panel.append(el('h2',workKinds[kind]+' · '+row.title),el('p',row.status+' · '+row.target),el('p',workSummary(assignment)));
  const sourceButton=el('button','Murojaat va javob / qarorni ochish','secondary');panel.append(sourceButton);
  sourceButton.onclick=async()=>{if(!current())return;if(kind==='support')return openSupport(row.target);if(kind==='chat_report')return openChatReports(row.target);await nav('listings');if(state.panel==='accounts'&&state.section==='listings')await select(row.target);};
  if(!row.active)panel.append(el('p','Ish yopilgan. Biriktirish tarixi saqlanadi.'));
  const admin=state.operator.role==='administrator';
  if(!admin&&state.operator.role==='support'&&data.canEscalate)renderWorkEscalation(panel,data,operators,current,reload);
  if(row.active&&(admin||!assignment.assignee)){
    const form=el('form'),person=el('select'),due=el('input'),reason=el('textarea');
    const label=(text,input)=>{const node=el('label',text);node.append(input);form.append(node);};
    if(admin){
      const empty=el('option','Biriktirilmagan');empty.value='';person.append(empty);
      for(const operator of operators){const option=el('option',operator.username);option.value=operator.username;person.append(option);}
      if(assignment.assignee&&!operators.some(o=>o.username===assignment.assignee)){const option=el('option',assignment.assignee+' (faol emas)');option.value=assignment.assignee;person.append(option);}
      person.value=assignment.assignee||'';label('Mas’ul operator',person);
      due.type='datetime-local';due.value=workLocalDate(assignment.dueAt);label('Muddat (shu kompyuterning mahalliy vaqti; bo‘sh qoldirilsa olib tashlanadi)',due);
    }
    reason.required=true;reason.maxLength=1000;label('Biriktirish yoki o‘zgartirish sababi',reason);
    const send=el('button',admin?'Saqlash':'Ishni o‘zimga olish');send.type='submit';form.append(send);panel.append(form);
    let pending=null,stale=false;const originalLocal=due.value;
    form.onsubmit=async event=>{
      event.preventDefault();if(send.disabled||!current())return;if(stale)return reload();if(!pending&&!reason.value.trim())return;
      try{
        pending??={revision:assignment.revision,sourceRevision:row.revision,assignee:admin?(person.value||null):state.operator.username,dueAt:admin&&due.value!==originalLocal?(due.value?new Date(due.value).toISOString():null):assignment.dueAt,reason:reason.value.trim(),requestId:crypto.randomUUID()};
        send.disabled=true;person.disabled=due.disabled=reason.disabled=true;
        await api(workPath(kind,row.target),'POST',pending);if(current())await reload();
      }catch(e){if(current()){notice(e.message);stale=[400,403,409].includes(e.status);send.textContent=stale?'Holatni qayta yuklash':'Ayni so‘rovni qayta yuborish';}}
      finally{if(current())send.disabled=false;}
    };
  }
  panel.append(el('h3','Biriktirish tarixi'));const history=el('div');panel.append(history);const seen=new Set();
  const add=items=>{for(const event of items){if(seen.has(event.id))continue;seen.add(event.id);history.append(el('p',event.revision+' · '+event.actor+' · '+workDate(event.created)+(event.after.escalated?' · Administratorga yo‘naltirildi':'')+' · '+event.reason),el('p',(event.before.assignee||'Biriktirilmagan')+' → '+(event.after.assignee||'Biriktirilmagan')+' · '+workDate(event.before.dueAt)+' → '+workDate(event.after.dueAt),'meta'));}};
  add(data.items);if(!data.items.length)history.append(el('p','Hali biriktirish bo‘lmagan.'));
  let cursor=data.nextCursor;const more=el('button','Oldingi o‘zgarishlar','secondary');more.hidden=!cursor;panel.append(more);
  more.onclick=async()=>{if(more.disabled||!current())return;more.disabled=true;try{const next=await api(workPath(kind,row.target)+'?before='+encodeURIComponent(cursor));if(!current())return;add(next.items);cursor=next.nextCursor;more.hidden=!cursor;}catch(e){if(current())notice(e.message);}finally{if(current())more.disabled=false;}};
}
$('#workQueueNav').onclick=()=>openWorkQueue();

function renderWorkEscalation(panel,data,operators,current,reload){
  const {source:row,assignment}=data,form=el('form'),person=el('select'),reason=el('textarea');
  form.append(el('h3','Administratorga yo‘naltirish'),el('p','Faqat bo‘sh yoki o‘zingizga biriktirilgan kontent murojaati. Muddat saqlanadi; yuborish qaror yoki mijozga javob emas.','meta'));
  const label=(text,input)=>{const node=el('label',text);node.append(input);form.append(node);};
  const empty=el('option','Administratorni tanlang');empty.value='';person.append(empty);
  for(const operator of operators){if(operator.role!=='administrator')continue;const option=el('option',operator.username);option.value=operator.username;person.append(option);}
  person.value='';person.required=true;label('Faol administrator',person);
  reason.required=true;reason.maxLength=1000;label('Yo‘naltirish sababi (ichki audit)',reason);
  const send=el('button','Administratorga yuborish');send.type='submit';form.append(send);panel.append(form);
  if(!operators.some(o=>o.role==='administrator')){send.disabled=true;form.append(el('p','Faol administrator topilmadi. Biriktirish bajarilmadi.'));}
  let pending=null,stale=false;
  form.onsubmit=async event=>{
    event.preventDefault();if(send.disabled||!current())return;if(stale)return reload();
    if(!pending&&(!person.value||!reason.value.trim()))return;
    pending??={revision:assignment.revision,sourceRevision:row.revision,assignee:person.value,dueAt:assignment.dueAt,reason:reason.value.trim(),requestId:crypto.randomUUID()};
    send.disabled=true;person.disabled=reason.disabled=true;
    try{await api(workPath('support',row.target)+'/escalate','POST',pending);if(current())await reload();}
    catch(e){if(current()){notice(e.message);stale=[400,403,409].includes(e.status);send.textContent=stale?'Holatni qayta yuklash':'Ayni so‘rovni qayta yuborish';}}
    finally{if(current())send.disabled=false;}
  };
}
