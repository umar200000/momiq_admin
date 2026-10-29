const $=s=>document.querySelector(s);
let authGeneration=0,accountRenderGeneration=0;
function accountViewScope(){
  const auth=authGeneration,render=accountRenderGeneration,detail=state.detailVersion,selected=state.selected,section=state.section,tab=state.tab;
  return ()=>auth===authGeneration&&render===accountRenderGeneration&&detail===state.detailVersion&&selected===state.selected&&section===state.section&&tab===state.tab&&state.panel==='accounts'&&!$('#app').hidden;
}
const state={operator:null,users:[],listings:[],section:'customer',sitters:{},selected:null,tab:'profile',sitter:'',messages:[],image:null,polling:false,panel:'accounts',indexVersion:0,detailVersion:0,indexNext:null,indexLoading:false,indexError:null,detailRecord:null,chatVersion:0};
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n};
function notice(text){$('#notice').textContent=text;$('#notice').hidden=false;clearTimeout(notice.timer);notice.timer=setTimeout(()=>$('#notice').hidden=true,5000)}
function resetAdminView(){
  ++authGeneration;if(typeof resetWalletAdmin==='function')resetWalletAdmin();state.operator=null;state.users=[];state.listings=[];state.messages=[];state.sitters={};state.image=null;state.detailRecord=null;state.selected=null;state.panel='signed-out';
  ++state.indexVersion;++state.detailVersion;state.indexLoading=false;
  for(const id of ['userList','detail','chatPanel','walletPanel'])$('#'+id).replaceChildren();
  $('#operatorIdentity').textContent='';$('#app').hidden=true;$('#login').hidden=false;
}
async function api(path,method='GET',body){
  const generation=authGeneration;
  const r=await fetch('/api/admin/'+path,{method,headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,credentials:'same-origin'});
  const data=await r.json();
  if(generation!==authGeneration)throw Error('Sessiya o‘zgardi; sahifani qayta oching.');
  if(!r.ok){if(r.status===401)resetAdminView();const error=Error(data.error||'Server xatosi');error.status=r.status;throw error;}
  return data;
}
async function startAdmin(){
  resetAdminView();const generation=authGeneration;
  try{
    const operator=await api('me');if(generation!==authGeneration)return;
    if(!operator||!Array.isArray(operator.panels)||!operator.panels.length)throw Error('Operator huquqlari aniqlanmadi.');
    state.operator=operator;
    const labels={support:'Yordam',moderation:'Moderatsiya',finance:'Moliya',administrator:'Administrator'};
    $('#operatorIdentity').textContent=operator.username+' · '+(labels[operator.role]||operator.role);
    for(const id of ['users','sitters','listings','topups','chatReports','bookings','disputes','support','reviews','settings','metrics','workQueue'])$('#'+id+'Nav').hidden=!operator.panels.includes(id);
    $('#app').hidden=false;$('#login').hidden=true;
    const first=operator.panels[0];
    if(first==='users')await nav('customer');
    else if(first==='listings')await nav('listings');
    else if(first==='topups')await openWalletAdmin('topups');
    else if(first==='support')await openSupport();
    else throw Error('Operator bo‘limi topilmadi.');
  }catch(e){if(generation===authGeneration){resetAdminView();notice(e.message);}}
}
function source(photo){if(!photo)return '';const kind=photo.startsWith('/9j/')?'jpeg':photo.startsWith('UklGR')?'webp':'png';return 'data:image/'+kind+';base64,'+photo}
function avatar(user){const p=user.account.profile;if(p.photo){const img=el('img',undefined,'avatar');img.src=source(p.photo);img.alt=name(user)+' — profil rasmi';img.loading='lazy';img.onerror=()=>img.replaceWith(el('span',(p.first||'?').slice(0,1),'avatar'));return img}return el('span',(p.first||'?').slice(0,1),'avatar')}
function name(user){return [user.account.profile.first,user.account.profile.last].filter(Boolean).join(' ')||'Yangi foydalanuvchi'}
function skeleton(){const box=$('#userList');box.replaceChildren();for(let i=0;i<3;i++)box.append(el('div',undefined,'skeleton'))}
const titles={customer:'Mijozlar',sitter:'Enagalar',listings:'E’lonlar'};
const services={boarding:'Uyda boqish',homeVisit:'Uyga tashrif',personal:'Shaxsiy parvarish'};
function roles(u){return u.roles||[u.account.sitterProfile?'sitter':'customer']}
function records(){return state.section==='listings'?state.listings:state.users.filter(u=>roles(u).includes(state.section))}
async function load(more=false){
  if(more&&(state.indexLoading||!state.indexNext))return;
  const section=state.section,version=++state.indexVersion;
  const ads=section==='listings',key=ads?'listings':'users';
  const query=new URLSearchParams();
  if(!ads)query.set('role',section);
  const search=$('#search').value.trim();if(search)query.set('q',search);
  const status=$('#accountStatus').value||'all';if(status!=='all')query.set('status',status);
  const service=$('#listingService').value||'all';if(ads&&service!=='all')query.set('service',service);
  if(more)query.set('after',state.indexNext);
  state.indexLoading=true;state.indexError=null;
  if(!more){state.indexNext=null;state.detailRecord=null;++state.detailVersion;skeleton();$('#detail').replaceChildren(el('p','Ro‘yxat yangilanmoqda…'));}
  $('#refresh').disabled=true;
  try{
    const data=await api(key+(query.size?'?'+query.toString():''));
    if(version!==state.indexVersion||section!==state.section||state.panel!=='accounts')return;
    const rows=data[key];if(!Array.isArray(rows))throw Error('Ro‘yxat javobi noto‘g‘ri');if(more&&data.nextCursor===state.indexNext)throw Error('Sahifa takrorlandi; ro‘yxatni yangilang');
    const merged=new Map((more?state[key]:[]).map(row=>[row.id,row]));for(const row of rows)merged.set(row.id,row);
    state[key]=[...merged.values()];state.indexNext=data.nextCursor||null;
    if(data.sitters)state.sitters=data.sitters;
    $('#app').hidden=false;$('#login').hidden=true;
    if(!more&&!records().some(x=>x.id===state.selected))state.selected=null;
    renderList();
    if(!more){if(state.selected)await select(state.selected);else renderDetail();}
  }catch(e){
    if(version!==state.indexVersion||section!==state.section||state.panel!=='accounts')return;
    state.indexError=e.message;if(!more){state[key]=[];$('#detail').replaceChildren(el('p','Ro‘yxatni qayta yuklang.'));}notice(e.message);renderList();
  }finally{
    if(version===state.indexVersion&&section===state.section&&state.panel==='accounts'){
      state.indexLoading=false;$('#refresh').disabled=false;renderList();
    }
  }
}
function configureIndexFilters(){
  const ads=state.section==='listings',select=$('#accountStatus');select.replaceChildren();
  const statuses=ads?{all:'Barchasi',draft:'Qoralama',pending:'Tekshiruvda',approved:'Tasdiqlangan',rejected:'Rad etilgan',suspended:'To‘xtatilgan',archived:'Arxivlangan'}:{all:'Barchasi',active:'Faol',blocked:'Bloklangan'};
  for(const [value,label] of Object.entries(statuses)){const option=el('option',label);option.value=value;select.append(option);}
  select.value='all';$('#listingService').value='all';$('#listingServiceLabel').hidden=!ads;
}

function listingName(x){return [x.profile.first,x.profile.last].filter(Boolean).join(' ')||'Enaga'}
function renderList(){const q=$('#search').value.toLowerCase();const all=records();const ads=state.section==='listings';const rows=all;$('#total').textContent=all.length;$('#activeCount').textContent=all.filter(x=>!x.blocked&&(!ads||x.active)).length;$('#blockedCount').textContent=all.filter(x=>ads?(!x.active||x.blocked):x.blocked).length;$('#totalLabel').textContent='Yuklangan '+titles[state.section].toLowerCase();$('#activeLabel').textContent=ads?'Yuklangan faol e’lonlar':'Yuklangan faol hisoblar';$('#blockedLabel').textContent=ads?'Yuklangan nofaol / bloklangan':'Yuklangan bloklangan';$('#listTitle').textContent=titles[state.section];$('#count').textContent=rows.length;const list=$('#userList');list.replaceChildren();if(!rows.length&&!state.indexError&&!state.indexLoading)list.append(el('p',q?'Qidiruv bo‘yicha natija yo‘q.':ads?'Hozircha serverda saqlangan e’lon yo‘q.':'Bu rolda hali foydalanuvchi yo‘q.'));for(const u of rows){const b=el('button',undefined,'user'+(state.selected===u.id?' selected':''));b.append(ads?el('span','♧','avatar'):avatar(u));const label=el('div');label.append(el('b',ads?services[u.type]:name(u)),el('small',ads?listingName(u)+' · '+u.price.toLocaleString('uz-UZ')+' so‘m':'+'+u.phone));if(!ads)label.append(el('small',roles(u).map(r=>r==='sitter'?'Enaga':'Mijoz').join(' · ')));b.append(label);b.onclick=()=>select(u.id);list.append(b)}
  if(state.indexError){list.append(el('p',state.indexError));const retry=el('button','Qayta urinish');retry.onclick=()=>load(!!state.indexNext);list.append(retry);}
  else if(state.indexLoading)list.append(el('p','Yuklanmoqda…'));
  if(state.indexNext){const more=el('button','Yana yuklash','secondary');more.disabled=state.indexLoading;more.onclick=()=>load(true);list.append(more);}
}
function renderListing(){++accountRenderGeneration;const current=accountViewScope();const box=$('#detail');box.replaceChildren();const x=state.detailRecord||state.listings.find(x=>x.id===state.selected);if(!x){box.append(el('h2','E’lonni tanlang'),el('p','Tafsilotlarini ko‘rish uchun chapdagi ro‘yxatdan tanlang.'));return;}if(x._summary){box.append(el('p','Tafsilot yuklanmoqda…'));return;}box.append(el('h2',services[x.type]),el('p',listingName(x)+' · +'+x.phone,'meta'),el('span',x.blocked?'Egasi bloklangan':x.active?'Faol':'Nofaol',x.active&&!x.blocked?'badge':'badge blocked'));const fields=[['Narx',x.price.toLocaleString('uz-UZ')+' so‘m / hayvon / kun'],['Hayvon turi',x.pets.map(p=>p==='dog'?'It':'Mushuk').join(', ')],['Uy turi',x.housing==='house'?'Hovli':'Kvartira'],['Sig‘im',x.capacity==null?'—':x.capacity+' ta'],['Manzil',x.location?.address||'Ko‘rsatilmagan'],['Yangilangan',new Date(x.updated).toLocaleString('uz-UZ')]];const dl=el('dl',undefined,'listingFacts');for(const [label,value] of fields){dl.append(el('dt',label),el('dd',value))}box.append(dl);const owner=el('button','Enaga profilini ochish','secondary');owner.onclick=async()=>{await nav('sitter');await select(x.userId)};if(state.operator?.panels.includes('sitters'))box.append(owner);renderListingReview(box,x)}
function renderListingReview(box,x,current=accountViewScope()){
  const labels={draft:'Qoralama',pending:'Tekshiruvda',approved:'Tasdiqlangan',rejected:'Rad etilgan',suspended:'To‘xtatilgan',archived:'Arxivlangan'};
  const status=x.moderation||{status:'pending'};
  box.append(el('h3','Moderatsiya: '+(labels[status.status]||status.status)));
  if(status.reason)box.append(el('p',status.reason));
  if(status.testOnly)box.append(el('p','TEST e’lon. MyID tekshiruvidan o‘tmagan.','meta'));
  if(x.missing?.length)box.append(el('p','Yetishmayapti: '+x.missing.join(', '),'meta'));
  box.append(el('p','Katalogda ko‘rinish uchun tasdiq, faol holat va kamida 15 000 so‘m balans kerak. Profil yoki narx o‘zgarsa qayta tekshiruv talab qilinadi.','meta'));
  const form=el('form');const reasonLabel=el('label','Qaror sababi');const reason=el('textarea');reason.required=true;reason.maxLength=1000;reason.rows=3;reasonLabel.append(reason);form.append(reasonLabel);
  const testLabel=el('label');const testOnly=el('input');testOnly.type='checkbox';testOnly.checked=false;testLabel.append(testOnly,el('span','Faqat test muhitidagi test e’lonni tasdiqlayapman (MyID o‘rnini bosmaydi).'));form.append(testLabel);
  const actions=el('div',undefined,'actions');const buttons=[];
  for(const [decision,label] of [['approve','Tasdiqlash'],['reject','Rad etish'],['suspend','To‘xtatish']]){
    const button=el('button',label,decision==='approve'?'':'secondary');button.type='submit';button.value=decision;buttons.push(button);actions.append(button);
  }
  form.append(actions);form.onsubmit=async event=>{
    event.preventDefault();if(!current()||buttons.some(b=>b.disabled))return;const decision=event.submitter?.value;
    if(!decision||!reason.value.trim())return notice('Qaror sababini kiriting.');
    if(decision==='approve'&&!testOnly.checked)return notice('Hozir faqat belgilangan test e’lon tasdiqlanadi.');
    buttons.forEach(b=>b.disabled=true);
    try{await api('listings/'+x.userId+'/'+x.type+'/review','POST',{decision,reason:reason.value.trim(),testOnly:testOnly.checked,_revision:x._revision});if(!current())return;notice('Moderatsiya qarori saqlandi');await load()}
    catch(error){if(current())notice(error.message)}finally{if(current())buttons.forEach(b=>b.disabled=false)}
  };box.append(form);
}
async function select(id){
  const version=++state.detailVersion,section=state.section;
  state.selected=id;state.image=null;state.detailRecord=null;renderList();
  const row=records().find(x=>x.id===id);
  if(row&&!row._summary){state.detailRecord=row;renderDetail();return;}
  $('#detail').replaceChildren(el('p','Tafsilot yuklanmoqda…'));
  try{
    const ads=section==='listings';
    const path=ads?'listings/'+id.replace(':','/'):'users/'+id;
    const data=await api(path);
    if(version!==state.detailVersion||section!==state.section||state.panel!=='accounts')return;
    state.detailRecord=ads?data.listing:data.user;
    if(!state.detailRecord)throw Error('Tafsilot javobi noto‘g‘ri');
    if(data.sitters)state.sitters=data.sitters;
    if(!state.sitters[state.sitter])state.sitter=Object.keys(state.sitters)[0]||'';
    renderDetail();
  }catch(e){
    if(version!==state.detailVersion||section!==state.section||state.panel!=='accounts')return;
    const retry=el('button','Tafsilotni qayta yuklash');retry.onclick=()=>select(id);
    $('#detail').replaceChildren(el('p',e.message),retry);
  }
}

function renderDetail(){++accountRenderGeneration;const current=accountViewScope();if(state.section==='listings')return renderListing();const u=state.detailRecord||state.users.find(x=>x.id===state.selected);if(!u){$('#detail').replaceChildren(el('h2','Foydalanuvchini tanlang'),el('p','Profilni ko‘rish uchun chapdagi ro‘yxatdan tanlang.'));return;}const box=$('#detail');box.replaceChildren();if(u._summary){box.append(el('p','Tafsilot yuklanmoqda…'));return;}const head=el('div',undefined,'profileHead');head.append(avatar(u));const info=el('div');info.append(el('h2',name(u)),el('p','+'+u.phone),el('span',u.blocked?'Bloklangan':'Faol',u.blocked?'badge blocked':'badge'));info.append(el('p',roles(u).map(r=>r==='sitter'?'Enaga':'Mijoz').join(' · ')));head.append(info);box.append(head);if(u.account.sitterProfile){const p=u.account.sitterProfile;box.append(el('p','Tajriba: '+(p.years??'—')+' yil · '+(p.housing==='house'?'Hovli':'Kvartira'),'meta'));if(p.about)box.append(el('p',p.about,'meta'));}const tabs=el('div',undefined,'tabs');for(const [key,label]of [['profile','Profil'],['chat','Suhbat']]){const b=el('button',label,state.tab===key?'active':'');b.onclick=()=>{state.tab=key;renderDetail()};tabs.append(b)}box.append(tabs);if(state.tab==='chat')return renderChat(box,u);const form=el('form');const fields=el('div',undefined,'fields');for(const [key,label]of [['first','Ism'],['last','Familiya']]){const l=el('label',label);const input=el('input');input.name=key;input.value=u.account.profile[key];input.required=true;input.maxLength=100;l.append(input);fields.append(l)}form.append(fields);const upload=el('label','Profil rasmi (PNG/JPEG/WebP, 3 MB gacha)');const file=el('input');file.type='file';file.accept='image/png,image/jpeg,image/webp';upload.append(file);form.append(upload);const reasonLabel=el('label','Profil o‘zgarishi yoki bloklash sababi (ichki audit)'),reason=el('textarea');reason.required=true;reason.maxLength=1000;reasonLabel.append(reason);form.append(reasonLabel);let newPhoto=u.account.profile.photo,picking=false,pickGeneration=0;
file.onchange=async()=>{if(!current()||save.disabled&&!picking)return;const generation=++pickGeneration,selected=file.files[0];const active=()=>current()&&generation===pickGeneration;picking=true;save.disabled=block.disabled=true;try{const photo=await readImage(selected);if(active()){newPhoto=photo;notice('Rasm tanlandi. Saqlashni bosing.')}}catch(e){if(active())notice(e.message)}finally{if(active()){picking=false;save.disabled=block.disabled=false;}}};const actions=el('div',undefined,'actions');const save=el('button','Saqlash');const block=el('button',u.blocked?'Blokdan chiqarish':'Hisobni bloklash','danger');block.type='button';block.onclick=async()=>{if(!current()||picking)return;if(block.disabled||!reason.value.trim()){notice('Sababni kiriting.');return;}if(!confirm(u.blocked?'Hisobni faollashtirasizmi?':'Foydalanuvchi hisobini bloklaysizmi?'))return;block.disabled=true;try{await api('users/'+u.id,'PUT',{blocked:!u.blocked,_revision:u.account._revision,reason:reason.value.trim()});if(!current())return;notice('Holat yangilandi');await load()}catch(e){if(current())notice(e.message)}finally{if(current())block.disabled=false}};const remove=el('button','Rasmni olib tashlash','secondary');remove.type='button';remove.onclick=()=>{if(!current()||save.disabled&&!picking)return;++pickGeneration;picking=false;save.disabled=block.disabled=false;newPhoto=null;file.value='';notice('Rasmni olib tashlash uchun Saqlashni bosing.')};actions.append(save,remove,block);form.append(actions);form.onsubmit=async e=>{e.preventDefault();if(!current()||picking)return;if(save.disabled||!reason.value.trim()){notice('Sababni kiriting.');return;}save.disabled=true;try{const account=structuredClone(u.account);account.profile={first:form.elements.first.value.trim(),last:form.elements.last.value.trim(),photo:newPhoto};await api('users/'+u.id,'PUT',{account,blocked:u.blocked,_revision:u.account._revision,reason:reason.value.trim()});if(!current())return;notice('Profil saqlandi');await load()}catch(e){if(current())notice(e.message)}finally{if(current())save.disabled=false}};box.append(form);box.append(el('p','Ro‘yxatdan o‘tgan: '+new Date(u.created).toLocaleString('uz-UZ'), 'meta'));box.append(el('p','Saqlangan enagalar: '+u.account.favorites.length+' · Manzillar: '+u.account.addresses.length,'meta'));for(const a of u.account.addresses)box.append(el('p',(a.label||'Manzil')+': '+a.address,'meta'));for(const p of (u.account.pets||[]))box.append(el('p','Hayvon: '+(p.name||p.type)+' · '+p.type,'meta'));if((u.account.support||[]).length)box.append(el('h2','Murojaatlar'));for(const m of (u.account.support||[]))box.append(el('p',m.text,'meta'))}
async function readImage(file){if(!file)return null;if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>3*1024*1024)throw Error('PNG/JPEG/WebP, 3 MB gacha rasm tanlang');return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result.split(',')[1]);r.onerror=()=>reject(Error('Rasm o‘qilmadi'));r.readAsDataURL(file)})}
function renderChat(box,u){
  if(!Object.keys(state.sitters).length){box.append(el('p','Hozircha enagalar bilan suhbat yo‘q.'));return;}
  const version=++state.chatVersion,detailVersion=state.detailVersion;
  const current=()=>version===state.chatVersion&&detailVersion===state.detailVersion&&state.panel==='accounts'&&state.selected===u.id&&state.tab==='chat'&&!$('#app').hidden;
  const top=el('div',undefined,'chatTop'),label=el('label','Suhbatdagi enaga'),select=el('select');
  for(const [id,n] of Object.entries(state.sitters)){const option=el('option',n);option.value=id;select.append(option);}
  select.value=state.sitter;select.onchange=()=>{if(current()){state.sitter=select.value;drawMessages();}};label.append(select);top.append(label);box.append(top);
  const messages=el('div',undefined,'messages');messages.id='messages';box.append(messages);
  const form=el('form',undefined,'composer'),input=el('textarea'),attachment=el('input'),send=el('button','Javob yuborish →');
  input.placeholder='Momiq yordam xizmati sifatida javob yozing…';input.rows=2;input.maxLength=4000;input.name='text';
  attachment.type='file';attachment.accept='image/png,image/jpeg,image/webp';attachment.setAttribute('aria-label','Rasm biriktirish');send.disabled=u.blocked;
  let image=null,pending=null,picking=false,pickGeneration=0,sending=false;
  attachment.onchange=async()=>{
    if(!current()||pending||sending)return;
    const generation=++pickGeneration,file=attachment.files[0];const active=()=>current()&&generation===pickGeneration;
    picking=true;send.disabled=true;
    try{const result=file?await readImage(file):null;if(active())image=result;}
    catch(e){if(active()){attachment.value='';image=null;notice(e.message);}}
    finally{if(active()){picking=false;send.disabled=u.blocked;}}
  };
  form.append(input,attachment,send);
  form.onsubmit=async event=>{
    event.preventDefault();if(!current()||send.disabled||picking||(!pending&&!input.value.trim()&&!image))return;
    pending??={sitter:select.value,text:input.value.trim(),image,requestId:crypto.randomUUID()};
    sending=true;send.disabled=true;input.disabled=attachment.disabled=select.disabled=true;
    try{
      const data=await api('users/'+u.id+'/messages','POST',pending);if(!current())return;
      pending=null;state.messages=data.messages;input.value='';attachment.value='';image=null;drawMessages(true);
      input.disabled=attachment.disabled=select.disabled=false;send.textContent='Javob yuborish →';
    }catch(e){if(current()){notice(e.message);send.textContent='Ayni javobni qayta yuborish';}}
    finally{if(current()){sending=false;send.disabled=u.blocked;}}
  };
  box.append(form,el('p','Javob Momiq yordam xizmati nomidan yuboriladi. Mijoz muallifni ko‘radi; admin amali audit jurnalida saqlanadi.','meta'));refreshChat(true);
}
async function refreshChat(scroll=false){
  if(state.panel!=='accounts'||state.section==='listings'||!state.selected||state.tab!=='chat'||state.polling||$('#app').hidden)return;
  state.polling=true;const uid=state.selected,version=state.chatVersion,detailVersion=state.detailVersion;
  const current=()=>uid===state.selected&&version===state.chatVersion&&detailVersion===state.detailVersion&&state.panel==='accounts'&&state.tab==='chat'&&!$('#app').hidden;
  try{const data=await api('users/'+uid+'/messages');if(current()){state.messages=data.messages;drawMessages(scroll);}}
  catch(e){if(current())notice(e.message);}finally{state.polling=false;}
}
function drawMessages(scroll=false){const box=$('#messages');if(!box)return;const wasBottom=box.scrollHeight-box.scrollTop-box.clientHeight<50;const previous=box.scrollTop;box.replaceChildren();const messages=state.messages.filter(x=>x.sitter===state.sitter);if(!messages.length)box.append(el('p','Hali xabar yo‘q. Suhbatni boshlang.'));for(const m of messages){const bubble=el('div',undefined,m.mine?'bubble':'bubble reply');if(m.image){const img=el('img');img.src=source(m.image);img.alt='Yuborilgan rasm';bubble.append(img)}if(m.text)bubble.append(el('div',m.text));bubble.append(el('small',(m.mine?'Mijoz':'Momiq yordam xizmati')+' · '+new Date(m.time).toLocaleString('uz-UZ')));const del=el('button','O‘chirish');del.onclick=async()=>{if(del.disabled)return;const reason=prompt('Xabarni o‘chirish sababi (matn va rasm qayta tiklanmaydi):');if(reason===null)return;if(!reason.trim()){notice('Sababni kiriting.');return;}del.disabled=true;try{await api('messages/'+m.id,'DELETE',{reason:reason.trim()});await refreshChat()}catch(e){notice(e.message)}finally{del.disabled=false}};bubble.append(del);box.append(bubble)}box.scrollTop=scroll||wasBottom?box.scrollHeight:previous}
$('#loginForm').onsubmit=async e=>{e.preventDefault();const b=e.target.querySelector('button');b.disabled=true;try{await api('login','POST',{username:e.target.username.value,password:e.target.password.value});e.target.password.value='';await startAdmin()}catch(e){notice(e.message)}finally{b.disabled=false}};
$('#logout').onclick=async()=>{try{await api('logout','POST',{});resetAdminView()}catch(e){notice(e.message)}};
let indexSearchTimer;$('#refresh').onclick=()=>load();$('#search').oninput=()=>{renderList();clearTimeout(indexSearchTimer);indexSearchTimer=setTimeout(()=>load(),300);};$('#accountStatus').onchange=()=>load();$('#listingService').onchange=()=>load();
function nav(section){$('#workQueueNav').classList.toggle('active',false);$('#bookingsNav').classList.toggle('active',false);$('#disputesNav').classList.toggle('active',false);state.panel='accounts';state.detailRecord=null;++state.detailVersion;$('#supportNav').classList.toggle('active',false);$('#reviewsNav').classList.toggle('active',false);$('#chatPanel').hidden=true;$('#chatReportsNav').classList.toggle('active',false);$('#walletPanel').hidden=true;$('#accountWorkspace').hidden=false;$('#accountStats').hidden=false;$('#metricsNav').classList.toggle('active',false);$('#topupsNav').classList.toggle('active',false);$('#settingsNav').classList.toggle('active',false);$('#refresh').onclick=()=>load();state.section=section;state.tab='profile';state.selected=null;state.messages=[];$('#search').value='';$('#heading').textContent=titles[section];for(const [id,key]of [['usersNav','customer'],['sittersNav','sitter'],['listingsNav','listings']])$('#'+id).classList.toggle('active',section===key);configureIndexFilters();renderList();renderDetail();return load()}
$('#usersNav').onclick=()=>nav('customer');$('#sittersNav').onclick=()=>nav('sitter');$('#listingsNav').onclick=()=>nav('listings');
setInterval(()=>{if(!document.hidden)refreshChat()},3000);configureIndexFilters();document.addEventListener('DOMContentLoaded',startAdmin,{once:true});
