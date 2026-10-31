/* Aggregates only. The server controls both role scope and CSV permission. */
let metricsGeneration=0;
function metricMoney(value){
  if(typeof value!=='string'||!/^\d+$/.test(value))throw Error('Hisobot summasi noto‘g‘ri.');
  const amount=BigInt(value);
  return (amount/100n).toLocaleString('uz-UZ')+'.'+(amount%100n).toString().padStart(2,'0')+' so‘m';
}
function metricCount(value){if(!Number.isSafeInteger(value)||value<0)throw Error('Hisobot soni noto‘g‘ri.');return value.toLocaleString('uz-UZ');}
function metricAge(value){if(value===null)return '—';metricCount(value);return metricCount(Math.floor(value/60))+' daqiqa';}
function renderMetrics(panel,data){
  if(data.period!=='all_time'||data.currency!=='UZS'||data.minorUnitScale!==100||!['finance','administrator'].includes(data.scope)||!Number.isFinite(Date.parse(data.asOf)))throw Error('Hisobot javobi noto‘g‘ri.');
  const groups=[['Balans jurnali',data.wallet,{topupCreditedMinor:'Tasdiqlangan tushum krediti',commissionDebitedMinor:'Yechilgan komissiya',commissionRefundedMinor:'Balansga qaytarilgan komissiya',correctionDebitedMinor:'Xato kreditdan tuzatish bilan yechilgan',totalBalanceMinor:'Enagalar balanslari yig‘indisi'},metricMoney],
    ['Chek so‘rovlarining hozirgi holati',data.topups,{pending:'Tekshiruvda',needs_info:'Aniqlashtirish kutilmoqda',approved:'Tasdiqlangan',rejected:'Rad etilgan'},metricCount]];
  if(data.scope==='administrator')groups.push(
    ['Buyurtmalarning hozirgi holati',data.bookings,{pending:'Javob kutilmoqda',accepted:'Qabul qilingan',active:'Davom etmoqda',disputed:'Nizoli',completed:'Tugallangan',cancelled:'Bekor qilingan',rejected:'Rad etilgan',expired:'Javob muddati tugagan'},metricCount],
    ['Yordam murojaatlari',data.support,{open:'Ochiq',waiting_user:'Mijoz javobi kutilmoqda',resolved:'Yopilgan'},metricCount],
    ['Nizolar',data.disputes,{open:'Ochiq',resolved:'Hal qilingan'},metricCount]);
  const content=el('div');
  content.append(el('h2','Umumiy ko‘rsatkichlar'),el('p','Barcha vaqt bo‘yicha jamlanma · '+new Date(data.asOf).toLocaleString('uz-UZ'),'meta'),
    el('p','Summalar Momiq balans jurnalidan olingan. Mijozning enagaga bevosita to‘lovi bu hisobotga kirmaydi. Rad etilgan chek so‘rovi bankdagi to‘lov muvaffaqiyatsiz bo‘lganini bildirmaydi.'));
  for(const [title,values,labels,format] of groups){
    if(!values||typeof values!=='object')throw Error('Hisobot qismi yetishmayapti.');
    content.append(el('h3',title));const rows=el('dl',undefined,'listingFacts');
    for(const [key,label] of Object.entries(labels))rows.append(el('dt',label),el('dd',format(values[key])));
    content.append(rows);
  }
  content.append(el('p','Eng eski tekshirilmagan chek so‘rovining yoshi: '+metricAge(data.oldestPendingTopupSeconds)));
  if(data.scope==='administrator')content.append(el('p','Eng eski ochiq yordam murojaatining yoshi: '+metricAge(data.oldestOpenSupportSeconds)),el('p','Ko‘rib chiqish muddati o‘tgan ochiq nizolar: '+metricCount(data.overdueDisputes)),
    el('p','Operator javob bergan murojaatlar: '+metricCount(data.respondedSupportTickets)),el('p','Javob berilgan murojaatlarda birinchi javobgacha o‘rtacha vaqt: '+metricAge(data.averageSupportFirstResponseSeconds)));
  const download=el('a','Jamlanmani CSV qilib yuklash','secondary');download.href='/api/admin/metrics.csv';content.append(download);
  content.append(el('p','CSV yuklash vaqtida yangidan hisoblanadi. Eksportda shaxsiy hisob, chek rasmi, manzil yoki yozishma matni yo‘q. Ochiq murojaat yoshi uning yaratilgan vaqtiga nisbatan hisoblanadi.','meta'));
  panel.replaceChildren(content);
}
async function openMetrics(){
  const generation=++metricsGeneration,panel=$('#chatPanel');state.panel='metrics';state.tab='profile';
  for(const id of ['accountWorkspace','accountStats','walletPanel'])$('#'+id).hidden=true;
  panel.hidden=false;panel.replaceChildren(el('p','Hisobot yuklanmoqda…'));$('#heading').textContent='Ko‘rsatkichlar';
  for(const id of ['users','sitters','listings','topups','chatReports','bookings','disputes','support','reviews','settings','metrics','workQueue'])$('#'+id+'Nav').classList.toggle('active',id==='metrics');
  $('#refresh').onclick=openMetrics;
  const current=()=>generation===metricsGeneration&&state.panel==='metrics'&&!panel.hidden;
  try{const data=await api('metrics');if(current())renderMetrics(panel,data);}
  catch(error){if(current()){const retry=el('button','Qayta urinish');retry.onclick=openMetrics;panel.replaceChildren(el('p',error.message),retry);}}
}
$('#metricsNav').onclick=openMetrics;
