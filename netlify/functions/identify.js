// netlify/functions/identify.js v3.1
const MIN_CONFIDENCE = parseFloat(process.env.MIN_CONFIDENCE || '0.6');
const PROVIDER = (process.env.PROVIDER || 'google').toLowerCase();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET || 'observations';

function isAnimalFromSignals(objects=[], labels=[], web=[]) {
  const humanWords = ['person','people','human','man','woman','boy','girl','face','beard','hair','skin','ear','nose','mouth'];
  const nonAnimalNoise = ['floor','flooring','wall','paper','paper product','furniture','ceiling','window','door','electronics','phone','screen','keyboard','laptop','bottle','cup','plate','fork','spoon','tableware'];
  const animalGroups = ['animal','mammal','bird','insect','reptile','amphibian','fish','arachnid'];
  const animalObjects = ['Cat','Dog','Bird','Horse','Cow','Sheep','Goat','Pig','Chicken','Duck','Goose','Turkey','Elephant','Giraffe','Zebra','Bear','Rabbit','Deer','Squirrel','Monkey','Mouse','Rat','Hedgehog','Fox','Wolf','Lion','Tiger','Leopard','Cheetah','Kangaroo','Koala','Camel','Dolphin','Whale','Shark','Turtle','Frog','Lizard','Snake','Butterfly','Bee','Dragonfly','Ant','Spider','Crab','Fish'];
  // Reject obvious humans
  if (objects.some(o => String(o.name).toLowerCase()==='person')) return false;
  const labelTexts = [
    ...objects.map(o=>String(o.name||'')),
    ...labels.map(l=>String(l.description||'')),
    ...web.map(w=>String(w.description||''))
  ].map(s=>s.toLowerCase());
  if (labelTexts.some(t => humanWords.includes(t))) return false;
  if (labelTexts.some(t => nonAnimalNoise.includes(t))) return false;
  // Accept if object includes animal objects
  if (objects.some(o => animalObjects.includes(String(o.name)))) return true;
  // Accept if any text includes group words or common animals
  const keywords = new Set(['cat','dog','bird','horse','cow','sheep','goat','pig','chicken','duck','goose','turkey','elephant','giraffe','zebra','bear','rabbit','deer','squirrel','monkey','mouse','rat','hedgehog','fox','wolf','lion','tiger','leopard','cheetah','kangaroo','koala','camel','dolphin','whale','shark','turtle','frog','lizard','snake','butterfly','bee','dragonfly','ant','spider','crab','fish','poisson','oiseau','chat','chien','cheval','vache','mouton','chèvre','cochon','poule','canard','oie']);
  if (labelTexts.some(t => [...keywords].some(k => t.includes(k)))) return true;
  // Accept if group entity present
  if (labelTexts.some(t => animalGroups.includes(t))) return true;
  return false;
}

function pickBestLabel(labels=[], web=[]) {
  const prefer = (s)=>{
    if(!s) return 0;
    s = s.toLowerCase();
    let score = 0;
    if (s.split(' ').length>=2) score += 1; // more specific
    if (/(cat|dog|bird|fish|fox|wolf|bear|rabbit|deer|squirrel|horse|cow|sheep|goat|pig|hedgehog|turtle|lizard|snake|frog)/i.test(s)) score += 0.6;
    if (/(siamese|persian|german shepherd|labrador|golden retriever|husky|maine coon)/i.test(s)) score += 0.8;
    return score;
  };
  let cands = [];
  labels.forEach(l=>cands.push({text:l.description, score:(l.score||0)+prefer(l.description)}));
  web.forEach(w=>cands.push({text:w.description, score:(w.score||0.2)+prefer(w.description)}));
  cands = cands.filter(c=>c.text);
  if (!cands.length) return null;
  cands.sort((a,b)=>b.score-a.score);
  return cands[0].text;
}

async function uploadToSupabase(base64DataUrl, meta){
  if(!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) return { url:null };
  try{
    const [header, b64] = base64DataUrl.split(',');
    const ext = header.includes('png') ? 'png' : 'jpg';
    const path = `obs_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
    const bin = Buffer.from(b64, 'base64');
    const uploadUrl = `${SUPABASE_URL.replace(/\/+$/,'')}/storage/v1/object/${encodeURIComponent(SUPABASE_BUCKET)}/${path}`;
    const up = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE}`,
        'apikey': SUPABASE_SERVICE_ROLE,
        'Content-Type': header.split(':')[1].split(';')[0]
      },
      body: bin
    });
    if(!up.ok) {
      console.error('[supabase upload] failed', await up.text());
      return { url:null };
    }
    const publicUrl = `${SUPABASE_URL.replace(/\/+$/,'')}/storage/v1/object/public/${encodeURIComponent(SUPABASE_BUCKET)}/${path}`;
    // insert observation row
    const row = {
      species_id: meta.species_id || null,
      label_raw: meta.label || null,
      score: meta.score || null,
      lat: meta?.location?.lat || null,
      lng: meta?.location?.lng || null,
      photo_url: publicUrl
    };
    const insertUrl = `${SUPABASE_URL.replace(/\/+$/,'')}/rest/v1/observations`;
    const ins = await fetch(insertUrl, {
      method:'POST',
      headers:{
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE}`,
        'apikey': SUPABASE_SERVICE_ROLE,
        'Content-Type':'application/json',
        'Prefer':'return=minimal'
      },
      body: JSON.stringify(row)
    });
    if(!ins.ok){
      console.error('[supabase insert] failed', await ins.text());
    }
    return { url: publicUrl };
  }catch(e){
    console.error('[supabase] error', e);
    return { url:null };
  }
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: 'Method Not Allowed' };
    }
    const { image, location } = JSON.parse(event.body || '{}');
    if (!image || typeof image !== 'string' || !image.startsWith('data:image')) {
      return { statusCode: 200, body: JSON.stringify({}) };
    }

    const base64 = image.split(',')[1];
    let result = null;

    if (PROVIDER === 'google') {
      const apiKey = process.env.GOOGLE_API_KEY;
      if (!apiKey) {
        console.warn('[identify] GOOGLE_API_KEY missing');
      } else {
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
        const r = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (r.ok) {
          const data = await r.json();
          const resp = data?.responses?.[0] || {};
          const objects = resp.localizedObjectAnnotations || [];
          const labels = resp.labelAnnotations || [];
          const web = (resp.webDetection?.webEntities || []).filter(w=>w.description);
          const isAnimal = isAnimalFromSignals(objects, labels, web);
          if (!isAnimal) {
            return { statusCode: 200, body: JSON.stringify({ notAnimal: true }) };
          }
          const label = pickBestLabel(labels, web) || (objects[0]?.name || labels[0]?.description || 'Animal');
          const score = (labels[0]?.score || objects[0]?.score || 0.75);
          result = { label, score };
        } else {
          console.error('[identify] Vision API error:', await r.text());
        }
      }
    }

    if (!result) return { statusCode: 200, body: JSON.stringify({}) };

    // Upload photo & store observation (best-effort)
    const uploaded = await uploadToSupabase(image, { label: result.label, score: result.score, location });
    if (uploaded.url) result.photo = uploaded.url;

    return { statusCode: 200, body: JSON.stringify(result) };

  } catch (e) {
    console.error(e);
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
