// netlify/functions/identify.js v3.2
const MIN_CONFIDENCE = parseFloat(process.env.MIN_CONFIDENCE || '0.6');
const PROVIDER = (process.env.PROVIDER || 'google').toLowerCase();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET || 'observations';

const sHeaders = SUPABASE_SERVICE_ROLE ? {
  'apikey': SUPABASE_SERVICE_ROLE,
  'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE}`,
  'Content-Type': 'application/json'
} : null;

function normLabel(s=''){
  return (s || '').toLowerCase().trim().replace(/\s+/g,' ').replace(/[–—]+/g,'-');
}

async function findSpeciesId(labelRaw){
  if(!SUPABASE_URL || !SUPABASE_SERVICE_ROLE || !labelRaw) return null;
  const q = normLabel(labelRaw);

  // 1) exact (case-insensitive)
  let url = `${SUPABASE_URL}/rest/v1/species_alias?select=species_id&label=ilike.${encodeURIComponent(q)}`;
  let r = await fetch(url, { headers: sHeaders });
  if(r.ok){
    const rows = await r.json();
    if(rows.length) return rows[0].species_id;
  }

  // 2) common variants
  const candidates = [];
  candidates.push(q.replace(/\b(cat|dog)\b/g,'' ).trim());
  candidates.push(q.replace(/-?haired/g,' hair').trim());
  candidates.push(q.replace(/ +/g,' '));
  for(const c of candidates){
    if(!c || c===q) continue;
    const u = `${SUPABASE_URL}/rest/v1/species_alias?select=species_id&label=ilike.${encodeURIComponent(c)}`;
    const rr = await fetch(u, { headers: sHeaders });
    if(rr.ok){
      const rows = await rr.json();
      if(rows.length) return rows[0].species_id;
    }
  }

  // 3) prefix fallback
  const first = q.split(' ')[0];
  if(first){
    const u2 = `${SUPABASE_URL}/rest/v1/species_alias?select=species_id&label=ilike.${encodeURIComponent(first + '%')}`;
    const r2 = await fetch(u2, { headers: sHeaders });
    if(r2.ok){
      const rows = await r2.json();
      if(rows.length) return rows[0].species_id;
    }
  }
  return null;
}

async function uploadToSupabase(buffer, mime='image/jpeg'){
  if(!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) return { url: null, path: null };
  const name = `obs_${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;
  const path = `${SUPABASE_BUCKET}/${name}`;
  const u = `${SUPABASE_URL}/storage/v1/object/${encodeURIComponent(path)}`;
  const r = await fetch(u, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE}`,
      'apikey': SUPABASE_SERVICE_ROLE,
      'Content-Type': mime,
      'x-upsert': 'true'
    },
    body: buffer
  });
  if(!r.ok){
    console.error('[supabase upload] failed', r.status, await r.text());
    return { url: null, path: null };
  }
  const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${encodeURIComponent(path)}`;
  return { url: publicUrl, path };
}

async function insertObservation(row){
  if(!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) return null;
  const r = await fetch(`${SUPABASE_URL}/rest/v1/observations`, {
    method: 'POST',
    headers: { ...sHeaders, Prefer: 'return=representation' },
    body: JSON.stringify(row)
  });
  if(!r.ok){
    console.error('[supabase insert] failed', r.status, await r.text());
    return null;
  }
  const data = await r.json();
  return data && data[0] ? data[0] : null;
}

function isAnimalCandidate(labels=[], objects=[], webEntities=[]){
  const bad = /(person|face|beard|hair|selfie|floor|wall|paper|table|furniture|ceiling|room|clothing)/i;
  if(labels.some(l => bad.test(l.description||''))) return false;
  const goodObjects = /(cat|dog|bird|animal|mammal|insect|reptile|amphibian|fish|wildlife|squirrel|fox|deer|hedgehog|rabbit|boar|duck|swan|heron|lizard|frog)/i;
  if(objects.some(o => goodObjects.test(o.name||''))) return true;
  const goodLabels = /(animal|faune|wildlife|cat|dog|bird|hedgehog|squirrel|fox|deer|rabbit|boar|duck|swan|heron|lizard|frog|toad|butterfly|dragonfly|bee|ladybug)/i;
  if(labels.some(l => goodLabels.test(l.description||''))) return true;
  if(webEntities.some(w => goodLabels.test(w.description||''))) return true;
  return false;
}

exports.handler = async (event) => {
  try{
    if(event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    const { image, location } = JSON.parse(event.body || '{}');
    if(!image || typeof image !== 'string' || !image.startsWith('data:image')){
      return { statusCode: 200, body: JSON.stringify({}) };
    }
    const base64 = image.split(',')[1];
    const buffer = Buffer.from(base64, 'base64');

    let best = null;
    if(PROVIDER === 'google'){
      const apiKey = process.env.GOOGLE_API_KEY;
      if(!apiKey) console.warn('[identify] GOOGLE_API_KEY missing');
      else{
        const url = `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`;
        const payload = {
          requests: [{
            image: { content: base64 },
            features: [
              { type: 'OBJECT_LOCALIZATION', maxResults: 10 },
              { type: 'LABEL_DETECTION', maxResults: 10 },
              { type: 'WEB_DETECTION', maxResults: 10 }
            ],
            imageContext: { languageHints: ['fr','en'] }
          }]
        };
        const r = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
        if(r.ok){
          const data = await r.json();
          const resp = data?.responses?.[0] || {};
          const objects = resp.localizedObjectAnnotations || [];
          const labels = resp.labelAnnotations || [];
          const web = resp.webDetection?.webEntities || [];
          if(!isAnimalCandidate(labels, objects, web)){
            return { statusCode: 200, body: JSON.stringify({ notAnimal: true }) };
          }
          const animalObj = objects.find(o => /(cat|dog|bird|squirrel|fox|deer|rabbit|boar|duck|swan|heron|lizard|frog|toad)/i.test(o.name||''));
          if(animalObj){
            best = { label: animalObj.name, score: animalObj.score || 0.9 };
          }else if(labels.length){
            labels.sort((a,b)=>(b.score||0)-(a.score||0));
            best = { label: labels[0].description, score: labels[0].score || 0 };
          }
        }else{
          console.error('[identify] Vision API error:', r.status, await r.text());
        }
      }
    }

    if(!best) return { statusCode: 200, body: JSON.stringify({}) };

    const species_id = await findSpeciesId(best.label);
    const up = await uploadToSupabase(buffer, 'image/jpeg');

    await insertObservation({
      species_id: species_id || null,
      label_raw: best.label,
      score: best.score || null,
      lat: (location && location.lat) || null,
      lng: (location && location.lng) || null,
      photo_url: up.url || null
    });

    const out = { label: best.label, score: best.score || null, photo: up.url || null };
    if(species_id) out.species_id = species_id;
    return { statusCode: 200, body: JSON.stringify(out) };
  }catch(e){
    console.error(e);
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
