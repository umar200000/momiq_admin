/* Report evidence is loaded explicitly; every evidence read is audited. */
let chatReportStatus = 'open';
let chatReportGeneration = 0;
const chatStatus = value => ({open:'Ko‘rib chiqilmoqda', dismissed:'Qoidabuzarlik tasdiqlanmadi', removed:'Xabar yashirildi'}[value] || value);

async function openChatReports() {
  state.panel = 'chatReports';
  const generation = ++chatReportGeneration;
  state.tab = 'profile';
  $('#accountWorkspace').hidden = true;
  $('#accountStats').hidden = true;
  $('#walletPanel').hidden = true;
  const panel = $('#chatPanel'); panel.hidden = false;
  $('#heading').textContent = 'Chat shikoyatlari';
  for (const id of ['usersNav','sittersNav','listingsNav','topupsNav','settingsNav','chatReportsNav','reviewsNav','supportNav']) {
    $('#'+id).classList.toggle('active', id === 'chatReportsNav');
  }
  $('#refresh').onclick = openChatReports;
  panel.replaceChildren(el('p','Yuklanmoqda…'));
  try {
    const page = await api('chat-reports?status='+chatReportStatus);
    if (generation !== chatReportGeneration || panel.hidden) return;
    panel.replaceChildren(el('h2','Chat shikoyatlari'), el('p','Dalilni ochish auditga yoziladi. Xabarni yashirish asl dalilni o‘chirmaydi.','meta'));
    const filter = el('select'); filter.setAttribute('aria-label','Shikoyat holati');
    for (const value of ['open','removed','dismissed','all']) {const option=el('option',value==='all'?'Barchasi':chatStatus(value));option.value=value;filter.append(option);}
    filter.value=chatReportStatus;filter.onchange=()=>{chatReportStatus=filter.value;openChatReports();};panel.append(filter);
    const list=el('div');panel.append(list);
    const ids=new Set();
    const add=items=>{for(const row of items){if(ids.has(row.id))continue;ids.add(row.id);renderChatReport(list,row);}};
    add(page.items);
    if (!page.items.length) list.append(el('p','Hozircha shikoyat yo‘q.'));
    let cursor=page.nextCursor;
    const more=el('button','Yana','secondary');more.hidden=!cursor;panel.append(more);
    more.onclick=async()=>{more.disabled=true;try{const next=await api('chat-reports?status='+chatReportStatus+'&before='+encodeURIComponent(cursor));if(generation!==chatReportGeneration||panel.hidden)return;add(next.items);cursor=next.nextCursor;more.hidden=!cursor;}catch(e){notice(e.message);}finally{more.disabled=false;}};
  } catch(error) {if(generation===chatReportGeneration&&!panel.hidden)panel.replaceChildren(el('p',error.message));}
}

function renderChatReport(list, row) {
  const article=el('article',undefined,'walletRequest');
  article.append(el('h3','Murojaat #'+row.id+' · '+chatStatus(row.status)),el('p',row.reason),el('p',new Date(row.created).toLocaleString('uz-UZ'),'meta'));
  if(row.reviewReason)article.append(el('p','Qaror: '+row.reviewReason));
  const evidence=el('div');const open=el('button','Dalil va qaror tarixini ochish','secondary');article.append(open,evidence);list.append(article);
  open.onclick=async()=>{
    open.disabled=true;
    try {
      const data=await api('chat-reports/'+row.id+'/evidence');
      evidence.replaceChildren(el('h4','Xabar dalili'),el('p',data.message.senderRole==='sitter'?'Muallif: enaga':'Muallif: mijoz'),el('p',data.message.text));
      if(data.message.hidden)evidence.append(el('p','Xabar ishtirokchilardan yashirilgan.'));
      if(data.message.hasImage){
        const button=el('button','Dalil rasmini ochish','secondary');evidence.append(button);
        button.onclick=async()=>{button.disabled=true;try{const image=await api('chat-reports/'+row.id+'/image');const img=el('img',undefined,'walletImage');img.src=source(image.image);img.alt='Shikoyatga biriktirilgan asl dalil';evidence.append(img);button.hidden=true;}catch(e){notice(e.message);}finally{button.disabled=false;}};
      }
      for(const h of data.history)evidence.append(el('p',`${h.revision} · ${chatStatus(h.status)} · ${h.actor} · ${h.reason}`,'meta'));
      if(data.report.status==='open'){
        const form=el('form');const label=el('label','Qaror sababi');const reason=el('textarea');reason.required=true;reason.maxLength=1000;label.append(reason);form.append(label);
        const remove=el('button','Xabarni yashirish');remove.type='submit';remove.value='remove';
        const dismiss=el('button','Qoidabuzarlik tasdiqlanmadi','secondary');dismiss.type='submit';dismiss.value='dismiss';form.append(remove,dismiss);evidence.append(form);
        form.onsubmit=async event=>{
          event.preventDefault();
          const decision=event.submitter?.value;
          if(!['remove','dismiss'].includes(decision)||!reason.value.trim()){notice('Qaror va sababni kiriting.');return;}
          if(remove.disabled)return;
          remove.disabled=dismiss.disabled=reason.disabled=true;
          try {
            await api('chat-reports/'+row.id+'/review','POST',{revision:data.report.revision,decision,reason:reason.value.trim()});
            notice('Qaror saqlandi.');
            if(!$('#chatPanel').hidden)await openChatReports();
          } catch(e){notice(e.message);} finally{remove.disabled=dismiss.disabled=reason.disabled=false;}
        };
      }
      open.textContent='Dalilni yangilash';
    } catch(error){notice(error.message);}finally{open.disabled=false;}
  };
}
$('#chatReportsNav').onclick=openChatReports;
