// netlify/functions/identify.js v2 (object localization first)
const MIN_CONFIDENCE = parseFloat(process.env.MIN_CONFIDENCE || '0.6');
const PROVIDER = (process.env.PROVIDER || 'google').toLowerCase();

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: 'Method Not Allowed' };
    }
    const { image } = JSON.parse(event.body || '{}');
    if (!image || typeof image !== 'string' || !image.startsWith('data:image')) {
      return { statusCode: 200, body: JSON.stringify({}) };
    }
    const base64 = image.split(',')[1];
    let best = null;

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
              { type: 'LABEL_DETECTION', maxResults: 10 }
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
          const objs = resp.localizedObjectAnnotations || [];
          if (objs.length) {
            objs.sort((a,b)=>(b.score||0)-(a.score||0));
            const animal = objs.find(o => /cat|dog|bird|mammal|animal/i.test(o.name)) || objs[0];
            if ((animal.score || 0) >= MIN_CONFIDENCE) {
              best = { label: animal.name, score: animal.score };
            }
          }
          if (!best) {
            const labels = resp.labelAnnotations || [];
            if (labels.length) {
              labels.sort((a,b)=>(b.score||0)-(a.score||0));
              const top = labels[0];
              if ((top.score || 0) >= MIN_CONFIDENCE) {
                best = { label: top.description, score: top.score };
              }
            }
          }
        } else {
          console.error('[identify] Vision API error:', await r.text());
        }
      }
    }
    if (!best) return { statusCode: 200, body: JSON.stringify({}) };
    return { statusCode: 200, body: JSON.stringify(best) };
  } catch (e) {
    console.error(e);
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
