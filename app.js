// app.js
const eco = (()=>{

  const SPECIES = {
    hedgehog:   {key:'hedgehog',   name:'Hérisson',        sci:'Erinaceus europaeus', sprite:'🦔', status:'Protégé',  tip:'Tas de feuilles = abri.', zone:'Jardins/Lisières'},
    blue_tit:   {key:'blue_tit',   name:'Mésange bleue',   sci:'Cyanistes caeruleus', sprite:'🐦', status:'Commune',  tip:'Pose un nichoir.',        zone:'Parcs/Forêts'},
    dragonfly:  {key:'dragonfly',  name:'Libellule',       sci:'Odonata',             sprite:'🪰', status:'Indicateur',tip:'Protège zones humides.',  zone:'Berges/Étangs'}
  };

  let state = { xp:0, level:1, discovered:{}, badges:0, lastLocation:null };

  function save(){ localStorage.setItem('ecodex_pwa_v2', JSON.stringify(state)); }
  function load(){ try{ const r=localStorage.getItem('ecodex_pwa_v2'); if(r) state=JSON.parse(r); }catch(e){} }
  function recalc(){
    document.getElementById('level')  && (document.getElementById('level').textContent = state.level);
    document.getElementById('xpText') && (document.getElementById('xpText').textContent = (state.xp%150));
    document.getElementById('posText')&& (document.getElementById('posText').textContent = state.lastLocation ? `${state.lastLocation.lat.toFixed(4)}, ${state.lastLocation.lng.toFixed(4)}` : '—');
  }
  function addXP(n){ state.xp += n; const c=Object.keys(state.discovered).length; if(c>=5) state.badges=Math.max(state.badges,1); save(); recalc(); }

  function getLocation(){
    if(!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(p=>{
      state.lastLocation = {lat:p.coords.latitude, lng:p.coords.longitude, accuracy:p.coords.accuracy||null, ts:Date.now()};
      save(); recalc();
    },()=>{}, {enableHighAccuracy:true,timeout:5000,maximumAge:60000});
  }

  async function identify(dataUrl){
    try{
      const r = await fetch('/api/identify', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ image:dataUrl, location: state.lastLocation }) });
      if(!r.ok) throw new Error('API');
      const out = await r.json();
      if(out && out.key && SPECIES[out.key]) return out.key;
    }catch(e){}
    return null;
  }

  function warn(box, msg){
    box.classList.remove('hidden'); box.classList.add('warn');
    box.innerHTML = `<strong>Espèce non reconnue</strong><br>${msg}<br><span class="small">Assurez-vous que l’animal soit visible et net.</span>`;
  }

  function useResult(key, box){
    const sp = SPECIES[key];
    const first = !state.discovered[sp.key];
    state.discovered[sp.key] = true;
    addXP(first ? 10 : 1);
    box.classList.remove('warn'); box.classList.remove('hidden');
    box.innerHTML = `
      <div><strong>${first?'Nouvelle découverte ! +10 XP':'Déjà découverte (+1 XP)'}</strong></div>
      <div style="font-size:44px;margin:6px 0">${sp.sprite}</div>
      <div>${sp.name} <span class="small">(${sp.sci})</span></div>
      ${state.lastLocation? `<div class="small">Localisation: ${state.lastLocation.lat.toFixed(4)}, ${state.lastLocation.lng.toFixed(4)}</div>`:''}
    `;
    save();
  }

  function fileToDataUrl(file){ return new Promise((res,rej)=>{ const r=new FileReader(); r.onload=e=>res(e.target.result); r.onerror=rej; r.readAsDataURL(file); }); }

  function renderGrid(gridEl, countEl){
    const ordered = Object.values(SPECIES).sort((a,b)=>(state.discovered[b.key]===true)-(state.discovered[a.key]===true));
    gridEl.innerHTML = '';
    ordered.forEach(sp=>{
      const found = !!state.discovered[sp.key];
      const div = document.createElement('div'); div.className='card';
      div.innerHTML = found
        ? `<div class="tag">${sp.status}</div><div class="sprite">${sp.sprite}</div><div>${sp.name}</div>`
        : `<div class="tag">???</div><div class="sprite" style="opacity:.5">❔</div><div class="small">${sp.name}</div>`;
      gridEl.appendChild(div);
    });
    if(countEl) countEl.textContent = `(${Object.keys(state.discovered).length}/150)`;
  }

  return { state, load, save, recalc, getLocation, identify, warn, useResult, fileToDataUrl, renderGrid };
})();