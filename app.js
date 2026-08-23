const STORAGE_KEY = 'ecodex_pwa_v5';
let state = { xp:0, level:1, discovered:{}, badgeIds:[], lastLocation:null, photos:{}, lastPhoto:null, userRegion:null };
let historyStack = ['menu'];
let identifying = false;
let caughtFilter = 'all';

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

function load(){ try{ const raw=localStorage.getItem(STORAGE_KEY); if(raw) state=Object.assign(state, JSON.parse(raw)); if(!Array.isArray(state.badgeIds)) state.badgeIds=[]; }catch(e){} }
function save(){ try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }catch(e){} }

function evalBadges(){
  const unlocked=[];
  BADGE_DEFS.forEach(b=>{ if(b.test(state) && !state.badgeIds.includes(b.id)){ state.badgeIds.push(b.id); unlocked.push(b); } });
  return unlocked;
}

function recalc(){
  const rank=currentRank(state.xp);
  const need=nextRankNeed(state.xp);
  const prev=RANKS.slice().reverse().find(r=>r.min<=state.xp)||RANKS[0];
  const base=prev.min; const span=Math.max(1, need-base);
  const pct=Math.min(100, ((state.xp-base)/span)*100);
  const set=(id,v)=>{ const el=document.getElementById(id); if(el) el.textContent=v; };
  const setW=(id,v)=>{ const el=document.getElementById(id); if(el) el.style.width=v; };
  set('rankName', rank.name); set('level', RANKS.indexOf(prev)+1);
  set('xpText', state.xp); set('xpNeed', need); setW('xpbar', pct+'%');
  set('pRank', rank.name); set('pLevel', RANKS.indexOf(prev)+1);
  set('pXpText', state.xp); set('pXpNeed', need); setW('pXpbar', pct+'%');
  set('pCount', Object.keys(state.discovered).length);
  set('pBadges', state.badgeIds.length);
  set('collCount', '('+Object.keys(state.discovered).length+'/'+Object.keys(SPECIES).length+')');
  const regId = state.userRegion || detectRegionFromLoc(state.lastLocation);
  state.userRegion = regId;
  set('pRegion', regId && REGIONS[regId] ? REGIONS[regId].name : '—');
  const geo=document.getElementById('geoHint');
  if(geo) geo.textContent = state.lastLocation ? 'GPS: '+state.lastLocation.lat.toFixed(3)+', '+state.lastLocation.lng.toFixed(3) : 'GPS: non activé';
  const rh=document.getElementById('regionHint');
  if(rh) rh.textContent = regId && REGIONS[regId] ? 'Région: '+REGIONS[regId].name : 'Région: active le GPS au scan';
  renderBadges(); renderGrid(); save();
}

function renderBadges(){
  const g=document.getElementById('badgeGrid'); if(!g) return;
  g.innerHTML = BADGE_DEFS.map(b=>{
    const on=state.badgeIds.includes(b.id);
    return '<div class="badge '+(on?'':'off')+'" title="'+b.desc+'"><span class="ico">'+b.ico+'</span><strong>'+b.name+'</strong><br><span class="small">'+b.desc+'</span></div>';
  }).join('');
}

function setCaughtFilter(mode){
  caughtFilter=mode;
  ['chipAll','chipCaught','chipMissing'].forEach(id=>document.getElementById(id)?.classList.remove('active'));
  const map={all:'chipAll',caught:'chipCaught',missing:'chipMissing'};
  document.getElementById(map[mode])?.classList.add('active');
  renderGrid();
}

function setRegionFilter(reg, btn){
  const sel=document.getElementById('filterRegion');
  if(sel) sel.value=reg;
  document.querySelectorAll('#collZones .chip').forEach(c=>c.classList.remove('active'));
  if(btn) btn.classList.add('active');
  else {
    const match=document.querySelector('#collZones .chip[data-reg="'+reg+'"]');
    if(match) match.classList.add('active');
  }
  renderGrid();
}

function openRegion(reg){
  navigate('collection');
  setTimeout(()=>setRegionFilter(reg, null), 50);
}

function speciesMatchesFilters(sp){
  const reg=document.getElementById('filterRegion')?.value||'all';
  const cat=document.getElementById('filterCat')?.value||'all';
  const rar=document.getElementById('filterRarity')?.value||'all';
  if(cat!=='all' && sp.cat!==cat) return false;
  if(rar!=='all' && sp.rarity!==rar) return false;
  if(reg==='local'){
    const ur=state.userRegion||detectRegionFromLoc(state.lastLocation);
    if(!ur) return sp.regions.includes('partout');
    if(!(sp.regions.includes('partout')||sp.regions.includes(ur))) return false;
  } else if(reg==='partout'){
    if(!sp.regions.includes('partout')) return false;
  } else if(reg!=='all'){
    if(!(sp.regions.includes(reg)||sp.regions.includes('partout'))) return false;
  }
  const found=!!state.discovered[sp.key];
  if(caughtFilter==='caught' && !found) return false;
  if(caughtFilter==='missing' && found) return false;
  return true;
}

function updateFab(viewId){
  const show=viewId==='menu'||viewId==='collection'||viewId==='profil';
  document.getElementById('fabScan')?.classList.toggle('hidden', !show);
  document.getElementById('fabLabel')?.classList.toggle('hidden', !show);
}

function navigate(id){
  document.querySelectorAll('.view').forEach(v=>v.classList.add('hidden'));
  document.getElementById(id)?.classList.remove('hidden');
  const labels={menu:'EcoDex',scan:'Scan',collection:'Collection',detail:'Fiche',profil:'Profil'};
  document.getElementById('title').textContent=labels[id]||'EcoDex';
  const backBtn=document.getElementById('backBtn');
  if(id==='menu'){ backBtn.classList.add('hidden'); stopCamera(); } else backBtn.classList.remove('hidden');
  if(id==='scan'){ startCamera(); getLocation(); } else { stopCamera(); clearPreview(); resetFileInput(); }
  if(id==='collection') renderGrid();
  if(id==='profil'){ renderBadges(); recalc(); }
  if(historyStack[historyStack.length-1]!==id) historyStack.push(id);
  updateFab(id);
  document.getElementById('screen').scrollTop=0;
}

function goBack(){
  if(historyStack.length>1){
    historyStack.pop();
    const prev=historyStack[historyStack.length-1];
    const tmp=historyStack.slice();
    historyStack=tmp.slice(0,-1);
    navigate(prev);
    historyStack=tmp;
  } else navigate('menu');
}

let stream=null;
function clearPreview(){
  const img=document.getElementById('previewImg'); if(img){ img.src=''; img.style.display='none'; }
  const video=document.getElementById('video'); if(video) video.style.display='block';
  const cap=document.getElementById('capBtn'); if(cap){ cap.textContent='Prendre la photo'; cap.onclick=capture; }
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
  const cap=document.getElementById('capBtn'); if(cap){ cap.textContent='Nouvelle photo'; cap.onclick=()=>{ clearPreview(); startCamera(); }; }
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

function showWarn(msg){ const box=document.getElementById('scanResult'); if(!box) return; box.classList.remove('hidden','ok'); box.classList.add('warn'); box.innerHTML='<strong>Info</strong><br>'+msg; }
function setBusy(on){ identifying=on; const btn=document.getElementById('identifyBtn'); if(btn){ btn.disabled=on; btn.innerHTML=on?'<span class="spinner"></span>Identification…':"Identifier l'image choisie"; } }

async function processImage(dataUrl, file){
  if(identifying) return; setBusy(true); showPreview(dataUrl); state.lastPhoto=dataUrl;
  let res=await identifyWithApi(dataUrl); if(!res&&file) res=offlineGuessFromFile(file);
  if(!res){ showWarn("Identification auto indisponible. Utilise un <strong>exemple</strong> pour tester."); setBusy(false); return; }
  if(res.notAnimal){ showWarn('Pas un animal reconnu. Réessaie ou utilise un exemple.'); setBusy(false); return; }
  useResult(res.key, res.score, res.offline); setBusy(false);
}
async function capture(){ const dataUrl=dataUrlFromVideo(); if(!dataUrl){ showWarn('Aucune image. Caméra, galerie ou exemple.'); return; } await processImage(dataUrl,null); }
async function pickFile(){ const input=document.getElementById('fileInput'); if(!input?.files?.[0]){ showWarn('Choisis une image dans le champ fichier.'); input?.click(); return; } try{ await processImage(await dataUrlFromFile(input.files[0]), input.files[0]); }catch(e){ showWarn('Image illisible (JPG/PNG).'); } }
function registerDemo(key){ if(!SPECIES[key]) return; state.lastPhoto=null; useResult(key,1,true); }

function useResult(key, score=null, offline=false){
  const sp=SPECIES[key]; if(!sp){ showWarn('Espèce inconnue.'); return; }
  const first=!state.discovered[sp.key]; state.discovered[sp.key]=true;
  if(state.lastPhoto){ if(!state.photos[sp.key]) state.photos[sp.key]=[]; state.photos[sp.key].push(state.lastPhoto); state.photos[sp.key]=state.photos[sp.key].slice(-3); }
  let xpGain=first?(RARITY_XP[sp.rarity]||10):1;
  const ur=state.userRegion||detectRegionFromLoc(state.lastLocation);
  if(first && ur && (sp.regions.includes(ur)||sp.regions.includes('partout'))) xpGain+=3;
  state.xp+=xpGain; const newBadges=evalBadges(); recalc();
  const box=document.getElementById('scanResult'); box.classList.remove('warn','hidden'); box.classList.add('ok');
  const photoHtml=state.lastPhoto?'<img src="'+state.lastPhoto+'" alt="" style="max-width:100%;border-radius:6px;margin-bottom:6px">':'';
  const badgeHtml=newBadges.length?'<div class="small" style="margin-top:6px">🏅 Badge(s) : '+newBadges.map(b=>b.ico+' '+b.name).join(', ')+'</div>':'';
  box.innerHTML=photoHtml+'<div><strong>'+(first?'Nouvelle découverte ! +'+xpGain+' XP':'Déjà vue (+1 XP)')+'</strong></div><div style="font-size:36px;margin:4px 0">'+sp.sprite+'</div><div>'+sp.name+'</div><div class="small">'+sp.sci+' · '+(RARITY_LABEL[sp.rarity]||sp.rarity)+'</div>'+(score!=null?'<div class="small">Confiance : '+(Number(score)*100).toFixed(0)+'%</div>':'')+(offline?'<div class="small">Mode démo / hors-ligne</div>':'')+(sp.tip?'<div class="small" style="margin-top:4px">💡 '+sp.tip+'</div>':'')+badgeHtml+'<div class="row" style="margin-top:8px"><button class="btn col" type="button" onclick="openDetail(\''+sp.key+'\')">Fiche</button><button class="btn secondary col" type="button" onclick="navigate(\'collection\')">Collection</button></div>';
}

function renderGrid(){
  const g=document.getElementById('grid'); if(!g) return; g.innerHTML='';
  const list=Object.values(SPECIES).filter(speciesMatchesFilters).sort((a,b)=>{
    const da=!!state.discovered[a.key], db=!!state.discovered[b.key]; if(da!==db) return db-da;
    const order={commune:0,peu_commune:1,rare:2,epique:3}; return (order[a.rarity]-order[b.rarity])||a.name.localeCompare(b.name,'fr');
  });
  if(!list.length){ g.innerHTML='<div class="small" style="grid-column:1/-1;text-align:center;padding:12px">Aucune espèce pour ces filtres.</div>'; return; }
  list.forEach(sp=>{
    const found=!!state.discovered[sp.key]; const last=(state.photos[sp.key]||[]).slice(-1)[0];
    const div=document.createElement('div'); div.className='card'+(found?'':' locked'); div.onclick=found?()=>openDetail(sp.key):null;
    const tagClass=sp.rarity==='rare'?'rare':(sp.rarity==='epique'?'epique':'');
    div.innerHTML=found?'<div class="tag '+tagClass+'">'+(RARITY_LABEL[sp.rarity]||'')+'</div><div class="sprite">'+sp.sprite+'</div><div class="name-sm">'+sp.name+'</div>'+(last?'<img src="'+last+'" alt="" style="width:100%;margin-top:4px;border-radius:4px">':''):'<div class="tag '+tagClass+'">?</div><div class="sprite">❓</div><div class="name-sm">???</div><div class="small">'+(RARITY_LABEL[sp.rarity]||'')+'</div>';
    g.appendChild(div);
  });
}

function openDetail(key){
  const sp=SPECIES[key]; if(!sp) return;
  const photos=state.photos[key]||[];
  const thumbs=photos.map(u=>'<img src="'+u+'" alt="" style="width:30%;border-radius:6px;margin:2% 1%">').join('');
  const regs=sp.regions.map(r=>REGIONS[r]?.name||r).join(', ');
  document.getElementById('detailBox').innerHTML='<div class="row"><div class="col" style="font-size:56px;text-align:center">'+sp.sprite+'</div><div class="col"><div><strong>'+sp.name+'</strong></div><div class="small"><em>'+sp.sci+'</em></div><div class="lcd-line"></div><div class="small">Rareté : <strong>'+RARITY_LABEL[sp.rarity]+'</strong> (+'+RARITY_XP[sp.rarity]+' XP)</div><div class="small">Catégorie : '+sp.cat+'</div><div class="small">Statut : '+(sp.status||'—')+'</div><div class="small">Habitat : '+(sp.zone||'—')+'</div><div class="small">Régions : '+regs+'</div></div></div>'+(sp.tip?'<div class="lcd-box" style="margin-top:8px">💡 Astuce éco : '+sp.tip+'</div>':'')+(photos.length?'<div class="lcd-box" style="margin-top:8px"><strong>Mes observations</strong><br>'+thumbs+'</div>':'');
  navigate('detail');
}

function wireFileInput(){
  const input=document.getElementById('fileInput'); if(!input) return;
  input.addEventListener('change', async ()=>{ const f=input.files?.[0]; if(!f) return; try{ await processImage(await dataUrlFromFile(f), f); }catch(e){ showWarn('Impossible de lire cette image.'); } });
}

load(); recalc(); updateFab('menu'); wireFileInput(); getLocation();
if('serviceWorker' in navigator){ window.addEventListener('load', ()=>navigator.serviceWorker.register('./sw.js?v=9').catch(console.error)); }
