// netlify/functions/identify/identify.js
const SPECIES_KEYS=['hedgehog','blue_tit','dragonfly'];
exports.handler=async (event)=>{
  try{
    if(event.httpMethod!=='POST'){ return { statusCode: 405, body: 'Method Not Allowed' }; }
    const { image, location, mode } = JSON.parse(event.body||'{}');
    if(!image || typeof image!=='string' || !image.startsWith('data:image')){
      return { statusCode: 200, body: JSON.stringify({}) };
    }
    if(mode==='unknown'){ return { statusCode: 200, body: JSON.stringify({}) }; }
    if(mode==='random'){ const key=SPECIES_KEYS[Math.floor(Math.random()*SPECIES_KEYS.length)]; return { statusCode:200, body: JSON.stringify({key}) }; }
    return { statusCode:200, body: JSON.stringify({ key:'hedgehog' }) };
  }catch(e){ return { statusCode:500, body: JSON.stringify({ error:e.message }) }; }
};