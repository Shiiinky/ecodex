// netlify/functions/identify.js v3.4
const MIN_CONFIDENCE = parseFloat(process.env.MIN_CONFIDENCE || '0.6');
const PROVIDER = (process.env.PROVIDER || 'google').toLowerCase();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET || 'observations';

const sHeaders = {
  'apikey': SUPABASE_SERVICE_ROLE || '',
  'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE || ''}`,
  'Content-Type': 'application/json'
};

function isAnimalLabel(label){
  const l = (label || '').toLowerCase();
  const allow = [
    'cat','dog','bird','animal','mammal','reptile','amphibian','fish',
    'insect','spider','butterfly','bee','hedgehog','fox','deer','rabbit','squirrel',
    'hedgehog','boar','badger','hare','swan','duck','heron','gull','pigeon','sparrow','magpie','crow','lizard','frog','toad'
  ];
  return allow.some(k => l.includes(k));
}
function isHumanOrNoise(label){
  const l = (label || '').toLowerCase();
  const block = [
    'face','person','people','human','man','woman','boy','girl','selfie','portrait',
    'skin','hair','beard','mustache','moustache','mouth','nose','eye','eyes','ear','forehead','cheek','chin',
    'floor','wall','ceiling','paper','furniture','room','table','carpet','tile','electronics','phone','screen'
  ];
  return block.some(k => l.includes(k));
}
function escLike(s=''){ return s.replace(/[%_]/g, m => '\\' + m); }
function norm(s=''){ return (s||'').toLowerCase().trim().replace(/\s+/g,' '); }

async function findSpeciesId(labelRaw){
  try{
    if(!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) return null;
    const q = norm(labelRaw);
    const like = `*${escLike(q)}*`;
    const head = q.split(' ')[0];
    const likeHead = `${escLike(head)}*`;

    // 1) contains full string
    let url = `${SUPABASE_URL}/rest/v1/species_alias?select=species_id&label=ilike.${encodeURIComponent(like)}&limit=1`;
    let r = await fetch(url, { headers: sHeaders });
    if(r.ok){
      const rows = await r.json();
      if(rows.length) return rows[0].species_id;
    }
    // 2) common variants
    const variants = [
      q.replace(/-?haired/g, ' hair').trim(),
      q.replace(/\b(cat|dog)\b/g, '').trim(),
      q.replace(/ +/g,' ')
    ].filter(Boolean);
    for(const v of variants){
      const u = `${SUPABASE_URL}/rest/v1/species_alias?select=species_id&label=ilike.${encodeURIComponent(`*${escLike(v)}*`)}&limit=1`;
      const rr = await fetch(u, { headers: sHeaders });
      if(rr.ok){
        const rows = await rr.json();
        if(rows.length) return rows[0].species_id;
      }
    }
    // 3) starts with first word
    const u2 = `${SUPABASE_URL}/rest/v1/species_alias?select=species_id&label=ilike.${encodeURIComponent(likeHead)}&limit=1`;
    const r2 = await fetch(u2, { headers: sHeaders });
    if(r2.ok){
      const rows = await r2.json();
      if(rows.length) return rows[0].species_id;
    }
  }catch(e){
    console.error('[alias] lookup error', e);
  }
  return null;
}

async function getSpeciesInfo(species_id){
  try{
    if(!species_id || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE) return null;
    const u = `${SUPABASE_URL}/rest/v1/species?select=slug,common_name_fr,common_name_en,scientific_name,emoji,tip,habitat&id=eq.${species_id}&limit=1`;
    const r = await fetch(u, { headers: sHeaders });
    if(r.ok){
      const rows = await r.json();
      return rows[0] || null;
    }
  }catch(e){ console.error('[species] fetch error', e); }
  return null;
}

async function uploadToSupabase(base64){
  try{
    if(!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) return null;
    const content = base64.split(',')[1] || base64;
    const buffer = Buffer.from(content, 'base64');
    const ts = Date.now();
    const random = Math.random().toString(36).slice(2,10);
    const path = `obs_${ts}_${random}.jpg`;
    const url = `${SUPABASE_URL}/storage/v1/object/${encodeURIComponent(SUPABASE_BUCKET)}/${encodeURIComponent(path)}`;
    const r = await fetch(url, {
      method:'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE}`,
        'apikey': SUPABASE_SERVICE_ROLE,
        'Content-Type':'image/jpeg',
        'x-upsert':'true'
      },
      body: buffer
    });
    if(!r.ok){
      console.error('[supabase upload] failed', r.status, await r.text());
      return null;
    }
    // public URL (assuming bucket is public)
    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${encodeURIComponent(SUPABASE_BUCKET)}/${encodeURIComponent(path)}`;
    return publicUrl;
  }catch(e){
    console.error('[supabase upload] error', e);
    return null;
  }
}

exports.handler = async (event) => {
  try{
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: 'Method Not Allowed' };
    }
    const { image, location } = JSON.parse(event.body || '{}');
    if(!image || typeof image !== 'string' || !image.startsWith('data:image')){
      return { statusCode: 200, body: JSON.stringify({}) };
    }
    if(PROVIDER !== 'google'){
      return { statusCode: 200, body: JSON.stringify({}) };
    }

    const apiKey = process.env.GOOGLE_API_KEY;
    if(!apiKey){
      console.warn('[identify] GOOGLE_API_KEY missing');
      return { statusCode: 200, body: JSON.stringify({}) };
    }

    const base64 = image.split(',')[1];

    // Call Vision API
    const url = `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`;
    const payload = {
      requests: [{
        image: { content: base64 },
        features: [
          { type:'OBJECT_LOCALIZATION', maxResults: 10 },
          { type:'LABEL_DETECTION', maxResults: 10 },
          { type:'WEB_DETECTION', maxResults: 10 }
        ],
        imageContext:{ languageHints:['fr','en'] }
      }]
    };
    const vr = await fetch(url, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify(payload)
    });
    if(!vr.ok){
      console.error('[Vision] error', vr.status, await vr.text());
      return { statusCode: 200, body: JSON.stringify({}) };
    }
    const data = await vr.json();
    const resp = data?.responses?.[0] || {};
    const labels = resp.labelAnnotations || [];
    const objects = resp.localizedObjectAnnotations || [];
    const web = (resp.webDetection?.webEntities || []).map(e => ({description:e.description||'', score:e.score||0}));

    // Animal filter
    const allowAnimal = labels.some(l => isAnimalLabel(l.description)) ||
                        objects.some(o => isAnimalLabel(o.name)) ||
                        web.some(w => isAnimalLabel(w.description));
    const hasHumanNoise = labels.some(l => isHumanOrNoise(l.description)) ||
                          objects.some(o => isHumanOrNoise(o.name)) ||
                          web.some(w => isHumanOrNoise(w.description));

    if(!allowAnimal || hasHumanNoise){
      return { statusCode: 200, body: JSON.stringify({ notAnimal: true }) };
    }

    // pick best label (prefer object then label then web)
    let best = null;
    const ordered = [
      ...objects.map(o => ({label:o.name, score:o.score||0})),
      ...labels.map(l => ({label:l.description, score:l.score||0})),
      ...web.map(w => ({label:w.description, score:w.score||0}))
    ].filter(x => x.label).sort((a,b) => (b.score||0)-(a.score||0));
    if(ordered.length){
      best = ordered[0];
    }
    if(!best || (best.score||0) < MIN_CONFIDENCE){
      // still return animal, but unknown
      best = best || {label:'Animal', score:null};
    }

    // Try mapping to species
    let species_id = await findSpeciesId(best.label);
    let species = null;
    if(species_id){
      species = await getSpeciesInfo(species_id);
    }

    // Upload to Supabase
    let photoUrl = null;
    try{
      photoUrl = await uploadToSupabase(image);
    }catch(e){ /* ignore */}

    // Insert observation
    if(SUPABASE_URL && SUPABASE_SERVICE_ROLE){
      const obs = {
        species_id: species_id || null,
        label_raw: best.label,
        score: best.score || null,
        lat: location?.lat || null,
        lng: location?.lng || null,
        photo_url: photoUrl || null
      };
      const ir = await fetch(`${SUPABASE_URL}/rest/v1/observations`, {
        method:'POST',
        headers:{ ...sHeaders, Prefer:'return=representation' },
        body: JSON.stringify(obs)
      });
      if(!ir.ok){
        console.error('[obs insert] failed', ir.status, await ir.text());
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        label: best.label,
        score: best.score || null,
        species_id: species_id || null,
        species: species || null,
        photo: photoUrl || null
      })
    };

  }catch(e){
    console.error(e);
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};