'use strict';
/* ===== Util ===== */
const $ = id => document.getElementById(id);
const pad = n => String(n).padStart(2, '0');
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};
const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/* ===== Navigasi ===== */
document.querySelectorAll('nav button').forEach(b => b.onclick = () => {
  document.querySelectorAll('nav button').forEach(x => x.classList.toggle('on', x === b));
  document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.id === b.dataset.t));
  if (b.dataset.t === 'quran' && !$('mushaf').dataset.loaded) loadPage(1);
});

/* ===== Lokasi ===== */
let coords = store.get('coords', { lat: -7.03, lng: 112.75, name: 'Bangkalan (default)' });
function getLocation() {
  if (!navigator.geolocation) return initAll();
  navigator.geolocation.getCurrentPosition(pos => {
    coords = { lat: pos.coords.latitude, lng: pos.coords.longitude, name: 'Lokasi Anda' };
    store.set('coords', coords);
    initAll();
  }, () => initAll(), { timeout: 8000 });
}

/* ===== Tanggal ===== */
function renderTanggal() {
  const now = new Date();
  $('tgl').textContent = now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  try {
    $('hijri').textContent = new Intl.DateTimeFormat('id-u-ca-islamic', { day: 'numeric', month: 'long', year: 'numeric' }).format(now);
  } catch { $('hijri').textContent = ''; }
  $('lokasi').textContent = '📍 ' + coords.name + ` (${coords.lat.toFixed(2)}, ${coords.lng.toFixed(2)})`;
}

/* ===== Jadwal sholat (API Aladhan, metode Kemenag RI) ===== */
const SHOLAT = [['Subuh', 'Fajr'], ['Dzuhur', 'Dhuhr'], ['Ashar', 'Asr'], ['Maghrib', 'Maghrib'], ['Isya', 'Isha']];
let jadwal = null; // { Subuh: 'HH:MM', ... }

async function loadJadwal() {
  const key = 'jadwal-' + dayKey() + '-' + coords.lat.toFixed(1) + coords.lng.toFixed(1);
  const cached = store.get(key, null);
  if (cached) { jadwal = cached; return; }
  const d = new Date();
  const url = `https://api.aladhan.com/v1/timings/${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}?latitude=${coords.lat}&longitude=${coords.lng}&method=20`;
  try {
    const r = await fetch(url);
    const j = await r.json();
    const t = j.data.timings;
    jadwal = {};
    SHOLAT.forEach(([n, k]) => jadwal[n] = t[k].slice(0, 5));
    store.set(key, jadwal);
  } catch {
    jadwal = store.get('jadwal-last', null);
    if (!jadwal) $('nextName').textContent = 'Gagal memuat jadwal';
  }
  if (jadwal) store.set('jadwal-last', jadwal);
}

const toDate = hm => { const [h, m] = hm.split(':').map(Number); const d = new Date(); d.setHours(h, m, 0, 0); return d; };

function renderJadwal() {
  if (!jadwal) return;
  $('listJadwal').innerHTML = SHOLAT.map(([n]) =>
    `<li data-n="${n}"><span>${n}</span><b>${jadwal[n]}</b></li>`).join('');
}

function nextPrayer() {
  const now = new Date();
  for (const [n] of SHOLAT) {
    const t = toDate(jadwal[n]);
    if (t > now) return { n, t };
  }
  const t = toDate(jadwal.Subuh); t.setDate(t.getDate() + 1);
  return { n: 'Subuh', t };
}

/* ===== Adzan ===== */
const audioAdzan = new Audio('audio/adzan.mp3');
const audioSubuh = new Audio('audio/adzan-subuh.mp3');
audioAdzan.preload = audioSubuh.preload = 'auto';

function stopAdzan() { [audioAdzan, audioSubuh].forEach(a => { a.pause(); a.currentTime = 0; }); }
function putarAdzan(nama) {
  stopAdzan();
  (nama === 'Subuh' ? audioSubuh : audioAdzan).play().catch(e => console.log('Audio diblokir/tidak ditemukan:', e));
}
$('tesAdzan').onclick = () => putarAdzan('Dzuhur');
$('tesSubuh').onclick = () => putarAdzan('Subuh');
$('stopAdzan').onclick = stopAdzan;

$('swAdzan').checked = store.get('adzanOn', false);
$('swAdzan').addEventListener('change', e => {
  store.set('adzanOn', e.target.checked);
  if (e.target.checked) { // buka kunci autoplay
    [audioAdzan, audioSubuh].forEach(a => {
      a.muted = true;
      a.play().then(() => { a.pause(); a.currentTime = 0; a.muted = false; }).catch(() => { a.muted = false; });
    });
  }
});

/* ===== Tick tiap detik ===== */
let lastFired = '';
function tick() {
  if (!jadwal) return;
  const now = new Date();
  const { n, t } = nextPrayer();
  let diff = Math.max(0, Math.floor((t - now) / 1000));
  $('nextName').textContent = n;
  $('nextTime').textContent = 'Pukul ' + pad(t.getHours()) + ':' + pad(t.getMinutes());
  $('countdown').textContent = `${pad(Math.floor(diff / 3600))}:${pad(Math.floor(diff % 3600 / 60))}:${pad(diff % 60)}`;
  document.querySelectorAll('#listJadwal li').forEach(li => li.classList.toggle('next', li.dataset.n === n));

  // cek masuk waktu
  const hm = pad(now.getHours()) + ':' + pad(now.getMinutes());
  for (const [nama] of SHOLAT) {
    const id = dayKey() + nama;
    if (jadwal[nama] === hm && lastFired !== id) {
      lastFired = id;
      if ($('swAdzan').checked) putarAdzan(nama);
    }
  }
  if (hm === '00:00') { loadJadwal().then(renderJadwal); renderTanggal(); }
}

/* ===== Al-Qur'an (API alquran.cloud) ===== */
const HAL_SURAT = [1,2,50,77,106,128,151,177,187,208,221,235,249,255,262,267,282,293,305,312,322,332,342,350,359,367,377,385,396,404,411,415,418,428,434,440,446,453,458,467,477,483,489,496,499,502,507,511,515,518,520,523,526,528,531,534,537,542,545,549,551,553,554,556,558,560,562,564,566,568,570,572,574,575,577,578,580,582,583,585,586,587,587,589,590,591,591,592,593,594,595,595,596,596,597,597,598,598,599,599,600,600,601,601,601,602,602,602,603,603,603,604,604,604];
let hal = 1, terjemahOn = false;

async function initSurat() {
  let names = [];
  try {
    const r = await fetch('https://api.alquran.cloud/v1/surah');
    names = (await r.json()).data.map(s => s.englishName);
  } catch {}
  $('pilihSurat').innerHTML = HAL_SURAT.map((_, i) =>
    `<option value="${i}">${i + 1}. ${esc(names[i] || 'Surat ' + (i + 1))}</option>`).join('');
}
$('pilihSurat').onchange = e => loadPage(HAL_SURAT[e.target.value]);
$('noHal').onchange = e => loadPage(+e.target.value);
$('prev').onclick = () => loadPage(hal - 1);
$('next').onclick = () => loadPage(hal + 1);
$('btnTerj').onclick = () => {
  terjemahOn = !terjemahOn;
  $('btnTerj').textContent = terjemahOn ? 'Sembunyikan terjemahan' : 'Tampilkan terjemahan';
  $('terjemah').classList.toggle('hidden', !terjemahOn);
  if (terjemahOn) loadTerjemah();
};

async function loadPage(n) {
  n = Math.min(604, Math.max(1, parseInt(n) || 1));
  hal = n; $('noHal').value = n;
  $('infoHal').textContent = `Halaman ${n} / 604`;
  $('mushaf').innerHTML = '<p class="center small">Memuat…</p>';
  try {
    const r = await fetch(`https://api.alquran.cloud/v1/page/${n}/quran-uthmani`);
    const ay = (await r.json()).data.ayahs;
    let html = '', cur = 0;
    ay.forEach(a => {
      if (a.surah.number !== cur) {
        cur = a.surah.number;
        if (a.numberInSurah === 1) html += `<div class="center"><b>${esc(a.surah.name)}</b></div>`;
      }
      html += `<span class="ayat">${esc(a.text)}</span> <span class="no">﴿${a.numberInSurah.toLocaleString('ar-EG')}﴾</span> `;
    });
    $('mushaf').innerHTML = `<p dir="rtl" style="font-family:'Amiri',serif;font-size:1.6rem;line-height:2.4">${html}</p>`;
    $('mushaf').dataset.loaded = '1';
    const s = HAL_SURAT.filter(h => h <= n).length - 1;
    $('pilihSurat').value = s;
    if (terjemahOn) loadTerjemah();
  } catch {
    $('mushaf').innerHTML = '<p class="center small">Gagal memuat. Periksa koneksi internet.</p>';
  }
}

async function loadTerjemah() {
  $('terjemah').innerHTML = '<p class="small">Memuat terjemahan…</p>';
  try {
    const r = await fetch(`https://api.alquran.cloud/v1/page/${hal}/id.indonesian`);
    const ay = (await r.json()).data.ayahs;
    $('terjemah').innerHTML = ay.map(a =>
      `<div class="card"><span class="small">${a.surah.number}:${a.numberInSurah}</span><p>${esc(a.text)}</p></div>`).join('');
  } catch { $('terjemah').innerHTML = '<p class="small">Gagal memuat terjemahan.</p>'; }
}

/* ===== Kiblat ===== */
const KAABAH = { lat: 21.4225, lng: 39.8262 };
let qibla = null, heading = null;
function hitungKiblat() {
  const r = Math.PI / 180;
  const p1 = coords.lat * r, p2 = KAABAH.lat * r, dl = (KAABAH.lng - coords.lng) * r;
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  qibla = (Math.atan2(y, x) / r + 360) % 360;
  $('derajat').textContent = qibla.toFixed(1) + '° dari Utara';
  $('infoKiblat').textContent = 'Aktifkan kompas lalu putar HP hingga panah menunjuk ke atas.';
  updateArrow();
}
function updateArrow() {
  if (qibla == null) return;
  const rot = heading == null ? qibla : qibla - heading;
  $('arrow').style.transform = `rotate(${rot}deg)`;
}
function onOrient(e) {
  if (typeof e.webkitCompassHeading === 'number') heading = e.webkitCompassHeading;
  else if (e.alpha != null) heading = (360 - e.alpha) % 360;
  else return;
  updateArrow();
}
$('btnKompas').onclick = async () => {
  try {
    if (typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission) {
      const p = await DeviceOrientationEvent.requestPermission();
      if (p !== 'granted') throw 0;
    }
    window.addEventListener('deviceorientationabsolute', onOrient, true);
    window.addEventListener('deviceorientation', onOrient, true);
    $('btnKompas').textContent = 'Kompas aktif';
  } catch { $('infoKiblat').textContent = 'Sensor kompas tidak tersedia / izin ditolak.'; }
};

/* ===== Jurnal Sholat ===== */
function jurnalData() { return store.get('jurnal', {}); }
function renderJurnal() {
  const all = jurnalData(), today = all[dayKey()] || {};
  $('listJurnal').innerHTML = SHOLAT.map(([n]) =>
    `<li><label><input type="checkbox" data-n="${n}" ${today[n] ? 'checked' : ''}> ${n}</label></li>`).join('');
  $('listJurnal').querySelectorAll('input').forEach(c => c.onchange = () => {
    const d = jurnalData(); const k = dayKey();
    d[k] = d[k] || {}; d[k][c.dataset.n] = c.checked;
    store.set('jurnal', d); renderJurnal();
  });
  const done = SHOLAT.filter(([n]) => today[n]).length;
  $('prog').style.width = (done / 5 * 100) + '%';
  $('progTxt').textContent = `${done} dari 5 sholat hari ini`;

  // 7 hari terakhir
  let html = '';
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const c = SHOLAT.filter(([n]) => (all[dayKey(d)] || {})[n]).length;
    html += `<div class="day"><div class="bar2" style="height:${c * 18 + 4}px"></div><small>${d.toLocaleDateString('id-ID', { weekday: 'short' })}</small><small>${c}/5</small></div>`;
  }
  $('riwayat').innerHTML = html;

  // streak (hari berturut-turut lengkap 5/5)
  let streak = 0;
  for (let i = 0; i < 365; i++) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const c = SHOLAT.filter(([n]) => (all[dayKey(d)] || {})[n]).length;
    if (c === 5) streak++; else if (i > 0) break;
  }
  $('streak').textContent = streak ? `🔥 ${streak} hari berturut-turut lengkap` : '';
}

/* ===== Doa & Wirid ===== */
const DOA = [
  ['Bangun tidur', 'اَلْحَمْدُ لِلّٰهِ الَّذِيْ اَحْيَانَا بَعْدَ مَا اَمَاتَنَا وَاِلَيْهِ النُّشُوْرُ', 'Segala puji bagi Allah yang menghidupkan kami setelah mematikan kami, dan kepada-Nya kami dibangkitkan.'],
  ['Sebelum tidur', 'بِاسْمِكَ اللّٰهُمَّ اَحْيَا وَبِاسْمِكَ اَمُوْتُ', 'Dengan nama-Mu ya Allah aku hidup dan aku mati.'],
  ['Sebelum makan', 'اَللّٰهُمَّ بَارِكْ لَنَا فِيْمَا رَزَقْتَنَا وَقِنَا عَذَابَ النَّارِ', 'Ya Allah, berkahilah rezeki yang Engkau berikan kepada kami dan jagalah kami dari siksa neraka.'],
  ['Sesudah makan', 'اَلْحَمْدُ لِلّٰهِ الَّذِيْ اَطْعَمَنَا وَسَقَانَا وَجَعَلَنَا مُسْلِمِيْنَ', 'Segala puji bagi Allah yang telah memberi kami makan dan minum serta menjadikan kami muslim.'],
  ['Masuk masjid', 'اَللّٰهُمَّ افْتَحْ لِيْ اَبْوَابَ رَحْمَتِكَ', 'Ya Allah, bukakanlah untukku pintu-pintu rahmat-Mu.'],
  ['Keluar masjid', 'اَللّٰهُمَّ اِنِّيْ اَسْاَلُكَ مِنْ فَضْلِكَ', 'Ya Allah, aku memohon kepada-Mu sebagian dari karunia-Mu.'],
  ['Untuk orang tua', 'رَبِّ اغْفِرْ لِيْ وَلِوَالِدَيَّ وَارْحَمْهُمَا كَمَا رَبَّيَانِيْ صَغِيْرًا', 'Ya Tuhanku, ampunilah aku dan kedua orang tuaku, sayangilah mereka sebagaimana mereka mendidikku waktu kecil.'],
  ['Doa sapu jagad', 'رَبَّنَآ اٰتِنَا فِى الدُّنْيَا حَسَنَةً وَّفِى الْاٰخِرَةِ حَسَنَةً وَّقِنَا عَذَابَ النَّارِ', 'Ya Tuhan kami, berilah kami kebaikan di dunia dan kebaikan di akhirat, dan lindungilah kami dari siksa neraka.']
];
const WIRID = [
  ['Istighfar', 'أَسْتَغْفِرُ اللّٰهَ', 'Aku memohon ampun kepada Allah', 3],
  ['Tasbih', 'سُبْحَانَ اللّٰهِ', 'Maha Suci Allah', 33],
  ['Tahmid', 'اَلْحَمْدُ لِلّٰهِ', 'Segala puji bagi Allah', 33],
  ['Takbir', 'اَللّٰهُ اَكْبَرُ', 'Allah Maha Besar', 33],
  ['Tahlil', 'لَا اِلٰهَ اِلَّا اللّٰهُ', 'Tiada Tuhan selain Allah', 33]
];
let modeDoa = 'doa';
const wiridCount = {};
function renderDoa() {
  const box = $('isiDoa');
  if (modeDoa === 'doa') {
    box.innerHTML = DOA.map(d => `<div class="card"><b>${esc(d[0])}</b><p dir="rtl" style="font-family:'Amiri',serif;font-size:1.5rem;line-height:2.2">${esc(d[1])}</p><p class="small">${esc(d[2])}</p></div>`).join('');
  } else {
    box.innerHTML = WIRID.map((w, i) => `<div class="card"><b>${esc(w[0])}</b><p dir="rtl" style="font-family:'Amiri',serif;font-size:1.5rem">${esc(w[1])}</p><p class="small">${esc(w[2])}</p>
      <button class="btn block" data-i="${i}">Tap: <span id="c${i}">${wiridCount[i] || 0}</span> / ${w[3]}</button></div>`).join('');
    box.querySelectorAll('button[data-i]').forEach(b => b.onclick = () => {
      const i = +b.dataset.i;
      wiridCount[i] = ((wiridCount[i] || 0) + 1);
      if (wiridCount[i] > WIRID[i][3]) wiridCount[i] = 0;
      $('c' + i).textContent = wiridCount[i];
      if (navigator.vibrate) navigator.vibrate(15);
    });
  }
}
document.querySelectorAll('.seg button').forEach(b => b.onclick = () => {
  document.querySelectorAll('.seg button').forEach(x => x.classList.toggle('on', x === b));
  modeDoa = b.dataset.m; renderDoa();
});

/* ===== Start ===== */
async function initAll() {
  renderTanggal();
  hitungKiblat();
  await loadJadwal();
  renderJadwal();
  tick();
}
renderJurnal();
renderDoa();
initSurat();
setInterval(tick, 1000);
getLocation();