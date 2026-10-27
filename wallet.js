/* Manual Paynet Xolis operations. No customer service payment is processed here. */
let walletSection = 'topups';
let topupStatus = 'pending';
let topupRows = [];

function parseMinor(value, allowZero = false) {
  const normalized = value.trim().replaceAll(',', '.');
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) throw Error('Summani 2 kasr xonasigacha kiriting.');
  const [whole, fraction = ''] = normalized.split('.');
  const minor = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  if (minor > 100000000000n || minor < (allowZero ? 0n : 1n)) throw Error('Summa chegaradan tashqarida.');
  return Number(minor);
}
const walletMoney = value => (value / 100).toLocaleString('uz-UZ', {maximumFractionDigits: 2}) + ' so‘m';
function walletField(form, title, name, type = 'text') {
  const label = el('label', title);
  const input = el('input');
  input.name = name; input.type = type; input.required = true;
  label.append(input); form.append(label);
  return input;
}
function walletImage(data, label) {
  const image = el('img', undefined, 'walletImage');
  image.src = source(data); image.alt = label;
  return image;
}

async function openWalletAdmin(section) {
  walletSection = section;
  state.tab = 'profile';
  $('#accountWorkspace').hidden = true;
  $('#accountStats').hidden = true;
  $('#walletPanel').hidden = false;
  $('#heading').textContent = section === 'settings' ? 'Komissiya va Paynet Xolis QR' : 'Balans to‘ldirish so‘rovlari';
  for (const id of ['usersNav', 'sittersNav', 'listingsNav', 'topupsNav', 'settingsNav']) {
    $('#' + id).classList.toggle('active', id === (section === 'settings' ? 'settingsNav' : 'topupsNav'));
  }
  $('#refresh').onclick = () => openWalletAdmin(walletSection);
  const panel = $('#walletPanel');
  panel.replaceChildren(el('p', 'Yuklanmoqda…'));
  try {
    if (section === 'settings') renderWalletSettings(await api('platform-settings'));
    else { const page = await api('topups?status=' + topupStatus); topupRows = page.topups; renderTopups(topupRows, page.nextCursor); }
  } catch (error) {
    panel.replaceChildren(el('p', error.message));
  }
}

function renderWalletSettings(config) {
  const panel = $('#walletPanel'); panel.replaceChildren();
  panel.append(el('h2', 'Komissiya va balans to‘ldirish'), el('p', 'Mijoz xizmat pulini enagaga bevosita to‘laydi. Ishlatilmagan Momiq balansi qaytarilmaydi. Yangi mijozlar uchun minimal balans: ' + walletMoney(config.minimumBalanceMinor)));
  const form = el('form');
  const rate = walletField(form, 'Komissiya (%)', 'rate');
  rate.inputMode = 'decimal'; rate.value = String(config.commissionBps / 100);
  let qr = config.qrImage;
  const preview = el('div');
  if (qr) preview.append(walletImage(qr, 'Paynet Xolis QR'));
  form.append(preview);
  const upload = walletField(form, 'Paynet Xolis QR rasmi (3 MB gacha)', 'qr', 'file');
  upload.required = false; upload.accept = 'image/png,image/jpeg,image/webp';
  upload.onchange = async () => {
    try { qr = await readImage(upload.files[0]); preview.replaceChildren(); if (qr) preview.append(walletImage(qr, 'Yangi QR')); }
    catch (error) { upload.value = ''; notice(error.message); }
  };
  const test = walletField(form, 'Bu sinov QR kodi', 'testOnly', 'checkbox');
  test.required = false; test.checked = config.testOnly;
  const recipient = walletField(form, 'To‘lov oluvchining nomi (provayderdagi nom bilan bir xil)', 'recipientName');
  recipient.required = false; recipient.maxLength = 200; recipient.value = config.recipientName || '';
  const instructions = walletField(form, 'To‘lov yo‘riqnomasi / izoh', 'paymentInstructions');
  instructions.required = false; instructions.maxLength = 1000; instructions.value = config.paymentInstructions || '';
  const active = walletField(form, 'Ilovada yangi to‘lovlar uchun QR’ni ko‘rsatish', 'qrActive', 'checkbox');
  active.required = false; active.checked = config.qrActive === true;
  form.append(el('p', 'Bu sozlama Momiqdagi QR ko‘rinishini boshqaradi; provayderdagi QR’ni o‘chirmaydi. Oldingi faol QR orqali to‘langan cheklar qabul qilinadi va o‘z QR nusxasiga bog‘lanadi.', 'meta'));
  const reason = walletField(form, 'O‘zgartirish sababi', 'reason'); reason.maxLength = 1000;
  const save = el('button', 'Sozlamalarni saqlash'); form.append(save);
  form.onsubmit = async event => {
    event.preventDefault(); save.disabled = true;
    try {
      const commissionBps = parseMinor(rate.value, true);
      if (commissionBps > 10000) throw Error('Foiz 0–100 oralig‘ida bo‘lsin.');
      if (active.checked && (!qr || !recipient.value.trim())) throw Error('Faol QR uchun rasm va oluvchi nomini kiriting.');
      await api('platform-settings', 'PUT', {version: config.version, commissionBps, qrImage: qr, testOnly: test.checked, reason: reason.value.trim(), recipientName:recipient.value.trim(), paymentInstructions:instructions.value.trim(), qrActive:active.checked});
      await openWalletAdmin('settings'); notice('Sozlamalar saqlandi.');
    } catch (error) { notice(error.message); }
    finally { save.disabled = false; }
  };
  panel.append(form);
}

function renderTopups(rows, nextCursor) {
  const panel = $('#walletPanel'); panel.replaceChildren();
  const filter = el('select'); filter.setAttribute('aria-label','Chek holati');
  for (const [value, title] of [['pending','Kutilayotgan'],['approved','Tasdiqlangan'],['rejected','Rad etilgan'],['all','Barchasi']]) {
    const option = el('option',title); option.value=value; filter.append(option);
  }
  filter.value=topupStatus; filter.onchange=()=>{topupStatus=filter.value;openWalletAdmin('topups');}; panel.append(filter);
  panel.append(el('p', 'Chekning o‘zi balansga pul qo‘shmaydi. Paynet Xolis tushumini tekshirib, aynan shu to‘lovning yagona identifikatorini kiriting.'));
  if (!rows.length) panel.append(el('h2', 'Tanlangan holatda so‘rov yo‘q'));
  for (const row of rows) {
    const card = el('article', undefined, 'topupCard');
    const owner = state.users.find(user => user.id === row.userId);
    const statusLabel = {pending:'Tekshirilmoqda',approved:'Tasdiqlangan',rejected:'Rad etilgan'}[row.status] || row.status;
    card.append(el('h2', walletMoney(row.amountMinor)), el('p', owner ? name(owner) + ' · +' + owner.phone : row.userId), el('p', statusLabel + ' · ' + new Date(row.created).toLocaleString('uz-UZ')));
    const details = el('details'); details.append(el('summary', 'Chekni ko‘rish')); card.append(details);
    let loaded=false, loading=false;
    details.ontoggle=async()=>{
      if (!details.open || loaded || loading) return;
      loading=true;
      try {
        const data=await api('topups/'+row.id+'/receipt');
        details.append(walletImage(data.receipt,'Enaga yuborgan to‘lov cheki'));
        if(data.paymentSnapshot){
          const snapshot=data.paymentSnapshot;
          details.append(el('h3','To‘lov paytidagi QR · v'+snapshot.version),el('p','Oluvchi: '+(snapshot.recipientName||'Eski versiyada saqlanmagan')));
          if(snapshot.paymentInstructions)details.append(el('p',snapshot.paymentInstructions));
          if(snapshot.testOnly)details.append(el('p','TEST QR — haqiqiy tushum emas'));
          if(snapshot.qrImage)details.append(walletImage(snapshot.qrImage,'So‘rovga bog‘langan QR nusxasi'));
        }
        loaded=true;
      }
      catch(error) { notice(error.message); details.open=false; }
      finally { loading=false; }
    };
    if (row.reviewReason) card.append(el('p', row.reviewReason));
    if (row.status === 'pending') {
      const form = el('form');
      const received = walletField(form, 'Hisobga tushgan summa (so‘m)', 'received'); received.inputMode = 'decimal';
      const reference = walletField(form, 'Paynet Xolis tushumining yagona ID raqami', 'reference'); reference.maxLength = 200;
      const reason = walletField(form, 'Tekshiruv izohi yoki rad etish sababi', 'reason'); reason.maxLength = 1000;
      const verified = walletField(form, 'Chek va haqiqiy tushum tekshirildi', 'verified', 'checkbox');
      const approve = el('button', 'Tasdiqlash va balansga qo‘shish');
      const reject = el('button', 'Rad etish', 'danger'); reject.type = 'button';
      const review = async decision => {
        if (!reason.value.trim()) { notice('Tekshiruv sababini yozing.'); return; }
        approve.disabled = reject.disabled = true;
        try {
          const body = {decision, reason: reason.value.trim()};
          if (decision === 'approve') {
            if (!verified.checked) throw Error('Haqiqiy tushumni tekshiring.');
            body.receivedAmountMinor = parseMinor(received.value);
            body.transferReference = reference.value.trim(); body.fundsVerified = true;
            if (body.receivedAmountMinor !== row.amountMinor) throw Error('Tushum so‘rov summasiga mos emas. Avval aniqlashtiring.');
            if (!body.transferReference) throw Error('Tushum ID raqamini kiriting.');
          }
          await api('topups/' + row.id + '/review', 'POST', body);
          await openWalletAdmin('topups'); notice(decision === 'approve' ? 'Balansga bir marta qo‘shildi.' : 'So‘rov rad etildi.');
        } catch (error) { notice(error.message); }
        finally { approve.disabled = reject.disabled = false; }
      };
      form.onsubmit = event => { event.preventDefault(); return review('approve'); };
      reject.onclick = () => review('reject');
      form.append(approve, reject); card.append(form);
    }
    panel.append(card);
  }
  if (nextCursor) {
    const more=el('button','Yana yuklash'); panel.append(more);
    more.onclick=async()=>{
      more.disabled=true;
      try { const page=await api('topups?status='+topupStatus+'&cursor='+encodeURIComponent(nextCursor)); topupRows=[...rows,...page.topups];renderTopups(topupRows,page.nextCursor); }
      catch(error){notice(error.message);more.disabled=false;}
    };
  }
}
$('#topupsNav').onclick = () => openWalletAdmin('topups');
$('#settingsNav').onclick = () => openWalletAdmin('settings');
