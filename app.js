const STORAGE_KEY = 'ecodex_pwa_v6';
let state = { xp:0, level:1, discovered:{}, badgeIds:[], lastLocation:null, photos:{}, lastPhoto:null, userRegion:null };
let identifying = false;
let filterCat = 'all';
let filterReg = 'all';
let filterCaught = 'all';

const SPECIES_ORDER = Object.keys(SPECIES);

function countCat(s, cat){ return Object.keys(s.discovered).filter(k=>SPECIES[k]&&SPECIES[k].cat===cat).length; }
function countRarity(s, list){ return Object.keys(s.discovered).filter(k=>SPECIES[k]&&list.includes(SPECIES[k].rarity)).length; }
function countRegion(s, reg){ return Object.keys(s.discovered).filter(k=>SPECIES[k]&&SPECIES[k].regions.includes(reg)).length; }
function countLocal(s){
  const reg = s.userRegion || detectRegionFromLoc(s.lastLocation);
  if(!reg) return 0;
  return Object.keys(s.discovered).filter(k=>{ const sp=SPECIES[k]; return sp && (sp.regions.includes('partout') || sp.regions.includes(reg)); }).length;
}
function detectRegionFromLoc(loc){
  if(!loc) return null;
  for(const [id, r] of Object.entries(REGIONS)){
    if(!r.bounds) continue;
    const b=r.bounds;
    if(loc.lat>=b.latMin && loc.lat<=b.latMax && loc.lng>=b.lngMin && loc.lng<=b.lngMax) return id;
  }
  if(loc.lat>=41.3 && loc.lat<=51.2 && loc.lng>=-5.2 && loc.lng<=9.6) return 'centre';
  return null;
}
function currentRank(xp){ let r=RANKS[0]; for(const x of RANKS){ if(xp>=x.min) r=x; } return r; }
function nextRankNeed(xp){ for(const x of RANKS){ if(xp < x.min) return x.min; } return RANKS[RANKS.length-1].min + 400; }

function load(){
  try{
    const raw=localStorage.getItem(STORAGE_KEY);
    if(raw) state=Object.assign(state, JSON.parse(raw));
    if(!Array.isArray(state.badgeIds)) state.badgeIds=[];
    if(!raw){
      const old=localStorage.getItem('ecodex_pwa_v5');
      if(old){ state=Object.assign(state, JSON.parse(old)); if(!Array.isArray(state.badgeIds)) state.badgeIds=[]; }
    }
  }catch(e){}
}
function save(){ try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }catch(e){} }

function evalBadges(){
  const unlocked=[];
  BADGE_DEFS.forEach(b=>{ if(b.test(state) && !state.badgeIds.includes(b.id)){ state.badgeIds.push(b.id); unlocked.push(b); } });
  return unlocked;
}

function setText(id,v){ const el=document.getElementById(id); if(el) el.textContent=v; }
function setWidth(id,v){ const el=document.getElementById(id); if(el) el.style.width=v; }

function recalc(){
  const rank=currentRank(state.xp);
  const need=nextRankNeed(state.xp);
  const prev=RANKS.slice().reverse().find(r=>r.min<=state.xp)||RANKS[0];
  const base=prev.min; const span=Math.max(1, need-base);
  const pct=Math.min(100, ((state.xp-base)/span)*100);
  const total=Object.keys(SPECIES).length;
  const found=Object.keys(state.discovered).length;

  setText('rankName', rank.name);
  setText('hdrRank', rank.name.split(' ')[0]);
  setText('xpText', state.xp); setText('xpNeed', need); setWidth('xpbar', pct+'%');
  setText('guideCount', found+' / '+total+' du guide');
  setText('hdrCount', found); setText('hdrTotal', total);

  setText('pRank', rank.name); setText('pLevel', RANKS.indexOf(prev)+1);
  setText('pXpText', state.xp); setText('pXpNeed', need); setWidth('pXpbar', pct+'%');
  setText('pCount', found); setText('pBadges', state.badgeIds.length);

  const regId = state.userRegion || detectRegionFromLoc(state.lastLocation);
  state.userRegion = regId;
  const regName = regId && REGIONS[regId] ? REGIONS[regId].name : '—';
  setText('regionHint', '📍 '+regName);
  setText('pRegion', '📍 '+regName);

  const scanBtn=document.getElementById('mainScanBtn');
  if(scanBtn) scanBtn.textContent = found===0 ? 'Scanner ta première espèce' : 'Scanner une espèce';

  renderBadges(); renderGrid(); save();
}

function renderBadges(){
  const g=document.getElementById('badgeGrid'); if(!g) return;
  g.innerHTML = BADGE_DEFS.map(b=>{
    const on=state.badgeIds.includes(b.id);
    return '<div class="badge '+(on?'':'off')+'"><span class="ico">'+b.ico+'</span><strong>'+b.name+'</strong>'+b.desc+'</div>';
  }).join('');
}

function setCat(cat, btn){
  filterCat=cat;
  document.querySelectorAll('#catChips .chip').forEach(c=>c.classList.remove('active'));
  if(btn) btn.classList.add('active');
  renderGrid();
}
function setReg(reg, btn){
  filterReg=reg;
  document.querySelectorAll('#regChips .chip').forEach(c=>c.classList.remove('active'));
  if(btn) btn.classList.add('active');
  renderGrid();
}
function setCaught(mode){
  filterCaught=mode;
  ['cfAll','cfCaught','cfMissing'].forEach(id=>document.getElementById(id)?.classList.remove('active'));
  const map={all:'cfAll',caught:'cfCaught',missing:'cfMissing'};
  document.getElementById(map[mode])?.classList.add('active');
  renderGrid();
}

function speciesMatches(sp, idx){
  const q=(document.getElementById('searchInput')?.value||'').trim().toLowerCase();
  if(q){
    const hay=(sp.name+' '+sp.sci+' '+sp.cat+' '+(RARITY_LABEL[sp.rarity]||'')).toLowerCase();
    if(!hay.includes(q) && !String(idx+1).includes(q)) return false;
  }
  if(filterCat!=='all' && sp.cat!==filterCat) return false;
  if(filterReg==='local'){
    const ur=state.userRegion||detectRegionFromLoc(state.lastLocation);
    if(!ur){ if(!sp.regions.includes('partout')) return false; }
    else if(!(sp.regions.includes('partout')||sp.regions.includes(ur))) return false;
  } else if(filterReg!=='all'){
    if(!(sp.regions.includes(filterReg)||sp.regions.includes('partout'))) return false;
  }
  const found=!!state.discovered[sp.key];
  if(filterCaught==='caught' && !found) return false;
  if(filterCaught==='missing' && found) return false;
  return true;
}

function renderGrid(){
  const g=document.getElementById('grid'); if(!g) return;
  g.innerHTML='';
  const list=SPECIES_ORDER.map((k,i)=>({sp:SPECIES[k], idx:i})).filter(({sp,idx})=>speciesMatches(sp,idx));
  if(!list.length){ g.innerHTML='<div class="empty">Aucune espèce pour ces filtres.</div>'; return; }
  list.forEach(({sp, idx})=>{
    const found=!!state.discovered[sp.key];
    const num='N°'+String(idx+1).padStart(3,'0');
    const last=(state.photos[sp.key]||[]).slice(-1)[0];
    const div=document.createElement('div');
    div.className='card'+(found?'':' locked');
    if(found) div.onclick=()=>openDetail(sp.key);
    const tagClass=sp.rarity==='rare'?'rare':(sp.rarity==='epique'?'epique':'');
    const tagLabel=found?(RARITY_LABEL[sp.rarity]||''):(RARITY_LABEL[sp.rarity]||'?');
    div.innerHTML=
      '<div class="num">'+num+'</div>'+
      (found?'<div class="tag '+tagClass+'">'+tagLabel+'</div>':'')+
      '<div class="sprite">'+sp.sprite+'</div>'+
      '<div class="name">'+(found?sp.name:'???')+'</div>'+
      (found&&last?'<img class="thumb" src="'+last+'" alt="">':'');
    g.appendChild(div);
  });
}

function navigate(id){
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.getElementById(id)?.classList.add('active');
  const fab=document.getElementById('fab');
  if(id==='home'){ fab?.classList.remove('hidden'); stopCamera(); clearPreview(); }
  else if(id==='scan'){ fab?.classList.add('hidden'); startCamera(); getLocation(); }
  else { fab?.classList.add('hidden'); stopCamera(); }
  if(id==='profil'){ renderBadges(); recalc(); }
  document.getElementById('screen').scrollTop=0;
}
function goHome(){ navigate('home'); }

let stream=null;
function clearPreview(){
  const img=document.getElementById('previewImg'); if(img){ img.src=''; img.style.display='none'; }
  const video=document.getElementById('video'); if(video) video.style.display='block';
}
function resetFileInput(){ const i=document.getElementById('fileInput'); if(i) i.value=''; }
async function startCamera(){
  try{
    if(!navigator.mediaDevices?.getUserMedia){ showWarn('Caméra non supportée. Utilise la galerie ou un exemple.'); return; }
    stream=await navigator.mediaDevices.getUserMedia({ video:{ facingMode:{ ideal:'environment' } }, audio:false });
    const video=document.getElementById('video'); video.srcObject=stream; await video.play();
  }catch(e){ showWarn('Caméra refusée. Importe une photo ou choisis un exemple.'); }
}
function stopCamera(){
  const video=document.getElementById('video');
  if(video?.srcObject){ try{ video.pause(); }catch(_){} video.srcObject.getTracks().forEach(t=>t.stop()); video.srcObject=null; }
  stream=null;
}
function dataUrlFromVideo(){
  const video=document.getElementById('video'); if(!video?.videoWidth) return null;
  const c=document.createElement('canvas'); c.width=video.videoWidth; c.height=video.videoHeight;
  c.getContext('2d').drawImage(video,0,0); return c.toDataURL('image/jpeg',0.85);
}
function showPreview(dataUrl){
  const img=document.getElementById('previewImg'); const video=document.getElementById('video');
  img.src=dataUrl; img.style.display='block'; if(video) video.style.display='none';
}
function dataUrlFromFile(file){ return new Promise((res,rej)=>{ const r=new FileReader(); r.onload=e=>res(e.target.result); r.onerror=rej; r.readAsDataURL(file); }); }
function getLocation(){
  if(!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(pos=>{
    state.lastLocation={ lat:pos.coords.latitude, lng:pos.coords.longitude, ts:Date.now() };
    state.userRegion=detectRegionFromLoc(state.lastLocation); recalc();
  }, ()=>{}, { enableHighAccuracy:true, timeout:6000, maximumAge:60000 });
}

async function identifyWithApi(dataUrl){
  try{
    const r=await fetch('/.netlify/functions/identify',{ method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ image:dataUrl, location:state.lastLocation }) });
    if(!r.ok) throw new Error('API '+r.status);
    const out=await r.json();
    if(out?.notAnimal) return { notAnimal:true };
    if(out?.species){
      const s=out.species;
      const key=s.slug||(s.common_name_fr||'animal').toLowerCase().replace(/[^a-z0-9]+/g,'_');
      if(!SPECIES[key]) SPECIES[key]={ key, name:s.common_name_fr||out.label||'Animal', sci:s.scientific_name||'—', sprite:s.emoji||'🐾', cat:'mammifere', rarity:'commune', regions:['partout'], status:'—', tip:s.tip||'', zone:s.habitat||'—' };
      if(out.photo) state.lastPhoto=out.photo;
      return { key, score:out.score||null };
    }
    if(out?.label){
      const found=Object.values(SPECIES).find(sp=>sp.name.toLowerCase().includes(out.label.toLowerCase())||out.label.toLowerCase().includes(sp.name.toLowerCase().split(' ')[0]));
      if(found) return { key:found.key, score:out.score||null };
      const slug=out.label.toLowerCase().replace(/[^a-z0-9]+/g,'_');
      if(!SPECIES[slug]) SPECIES[slug]={ key:slug, name:out.label, sci:out.label, sprite:'🐾', cat:'mammifere', rarity:'commune', regions:['partout'], status:'À confirmer', tip:'', zone:'—' };
      return { key:slug, score:out.score||null };
    }
  }catch(e){ console.error(e); }
  return null;
}

function offlineGuessFromFile(file){
  const name=(file?.name||'').toLowerCase();
  const map=[[/herisson|hedgehog/,'hedgehog'],[/mesange|tit/,'blue_tit'],[/libellule|dragonfly/,'dragonfly'],[/coccinelle|ladybird|ladybug/,'ladybird'],[/rouge.?gorge|robin/,'robin'],[/renard|fox/,'fox'],[/ecureuil|squirrel/,'squirrel'],[/grenouille|frog/,'frog'],[/chamois/,'chamois'],[/loutre|otter/,'otter'],[/flamant|flamingo/,'flamingo'],[/abeille|bee/,'honeybee']];
  for(const [re,key] of map){ if(re.test(name)&&SPECIES[key]) return { key, score:0.6, offline:true }; }
  return null;
}

function showWarn(msg){
  const box=document.getElementById('scanResult'); if(!box) return;
  box.style.display='block'; box.className='panel result warn';
  box.innerHTML='<strong>Info</strong><br>'+msg;
}
function setBusy(on){
  identifying=on;
  const btn=document.getElementById('identifyBtn');
  if(btn){ btn.disabled=on; btn.innerHTML=on?'<span class="spinner"></span>Identification…':"Identifier l'image"; }
}

async function processImage(dataUrl, file){
  if(identifying) return;
  setBusy(true); showPreview(dataUrl); state.lastPhoto=dataUrl;
  let res=await identifyWithApi(dataUrl);
  if(!res&&file) res=offlineGuessFromFile(file);
  if(!res){ showWarn("Identification auto indisponible. Utilise un <strong>exemple</strong> pour tester."); setBusy(false); return; }
  if(res.notAnimal){ showWarn('Pas un animal reconnu. Réessaie ou utilise un exemple.'); setBusy(false); return; }
  useResult(res.key, res.score, res.offline); setBusy(false);
}
async function capture(){
  const dataUrl=dataUrlFromVideo();
  if(!dataUrl){ showWarn('Aucune image. Caméra, galerie ou exemple.'); return; }
  await processImage(dataUrl,null);
}
async function pickFile(){
  const input=document.getElementById('fileInput');
  if(!input?.files?.[0]){ showWarn('Choisis une image dans le champ fichier.'); input?.click(); return; }
  try{ await processImage(await dataUrlFromFile(input.files[0]), input.files[0]); }
  catch(e){ showWarn('Image illisible (JPG/PNG).'); }
}
function registerDemo(key){ if(!SPECIES[key]) return; state.lastPhoto=null; useResult(key,1,true); }

function useResult(key, score=null, offline=false){
  const sp=SPECIES[key]; if(!sp){ showWarn('Espèce inconnue.'); return; }
  const first=!state.discovered[sp.key]; state.discovered[sp.key]=true;
  if(state.lastPhoto){
    if(!state.photos[sp.key]) state.photos[sp.key]=[];
    state.photos[sp.key].push(state.lastPhoto);
    state.photos[sp.key]=state.photos[sp.key].slice(-3);
  }
  let xpGain=first?(RARITY_XP[sp.rarity]||10):1;
  const ur=state.userRegion||detectRegionFromLoc(state.lastLocation);
  if(first && ur && (sp.regions.includes(ur)||sp.regions.includes('partout'))) xpGain+=3;
  state.xp+=xpGain;
  const newBadges=evalBadges();
  recalc();
  const box=document.getElementById('scanResult');
  box.style.display='block'; box.className='panel result ok';
  const photoHtml=state.lastPhoto?'<img src="'+state.lastPhoto+'" alt="">':'';
  const badgeHtml=newBadges.length?'<div style="margin-top:8px;font-size:13px">🏅 '+newBadges.map(b=>b.ico+' '+b.name).join(', ')+'</div>':'';
  box.innerHTML=photoHtml+
    '<div style="font-weight:700;margin-bottom:4px">'+(first?'Nouvelle découverte ! +'+xpGain+' XP':'Déjà vue (+1 XP)')+'</div>'+
    '<div class="big-sprite">'+sp.sprite+'</div>'+
    '<div style="text-align:center;font-weight:600">'+sp.name+'</div>'+
    '<div class="note">'+sp.sci+' · '+(RARITY_LABEL[sp.rarity]||sp.rarity)+'</div>'+
    (score!=null?'<div class="note">Confiance : '+(Number(score)*100).toFixed(0)+'%</div>':'')+
    (offline?'<div class="note">Mode démo / hors-ligne</div>':'')+
    (sp.tip?'<div style="margin-top:8px;font-size:13px">💡 '+sp.tip+'</div>':'')+
    badgeHtml+
    '<div style="display:flex;gap:8px;margin-top:12px">'+
      '<button class="btn primary" type="button" style="flex:1" onclick="openDetail(\''+sp.key+'\')">Fiche</button>'+
      '<button class="btn" type="button" style="flex:1" onclick="goHome()">Collection</button>'+
    '</div>';
}

function openDetail(key){
  const sp=SPECIES[key]; if(!sp) return;
  const photos=state.photos[key]||[];
  const thumbs=photos.map(u=>'<img src="'+u+'" alt="" style="width:30%;border-radius:8px;margin:2% 1%">').join('');
  const regs=sp.regions.map(r=>REGIONS[r]?.name||r).join(', ');
  const idx=SPECIES_ORDER.indexOf(key);
  document.getElementById('detailBox').innerHTML=
    '<div class="detail-hero">'+
      '<div class="big">'+sp.sprite+'</div>'+
      '<div class="info">'+
        '<div class="note">N°'+String(idx+1).padStart(3,'0')+'</div>'+
        '<h2>'+sp.name+'</h2>'+
        '<div class="sci">'+sp.sci+'</div>'+
      '</div>'+
    '</div>'+
    '<div style="margin-top:12px">'+
      '<div class="stat-row"><span>Rareté</span><strong>'+(RARITY_LABEL[sp.rarity]||sp.rarity)+' (+'+(RARITY_XP[sp.rarity]||10)+' XP)</strong></div>'+
      '<div class="stat-row"><span>Catégorie</span><strong>'+sp.cat+'</strong></div>'+
      '<div class="stat-row"><span>Statut</span><strong>'+(sp.status||'—')+'</strong></div>'+
      '<div class="stat-row"><span>Habitat</span><strong>'+(sp.zone||'—')+'</strong></div>'+
      '<div class="stat-row"><span>Régions</span><strong>'+regs+'</strong></div>'+
    '</div>'+
    (sp.tip?'<div style="margin-top:12px;padding:10px;background:var(--card2);border-radius:10px;font-size:13px">💡 '+sp.tip+'</div>':'')+
    (photos.length?'<div style="margin-top:12px"><div class="section-title">Mes observations</div>'+thumbs+'</div>':'');
  navigate('detail');
}

function wireFileInput(){
  const input=document.getElementById('fileInput'); if(!input) return;
  input.addEventListener('change', async ()=>{
    const f=input.files?.[0]; if(!f) return;
    try{ await processImage(await dataUrlFromFile(f), f); }
    catch(e){ showWarn('Impossible de lire cette image.'); }
  });
}

load(); recalc(); wireFileInput(); getLocation();
if('serviceWorker' in navigator){
  window.addEventListener('load', ()=>navigator.serviceWorker.register('./sw.js?v=10').catch(console.error));
}
