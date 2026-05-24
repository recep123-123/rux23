// RUx backend (version: see rux_version.js) — Self-contained unified API + Türkçe haber filtre motoru. Dış handler require yoktur.
function setJson(res, code, payload) {
  if (res.setHeader) res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (res.status) return res.status(code).json ? res.status(code).json(payload) : res.status(code).send(JSON.stringify(payload));
  res.statusCode = code;
  return res.end(JSON.stringify(payload));
}

function getRoute(req) {
  const q = req.query || {};
  if (q.route) return String(q.route).replace(/^\/+|\/+$/g, '');
  const url = String(req.url || '');
  const m = url.match(/\/api\/([^?\/]+)/);
  return m ? m[1] : '';
}

const HANDLERS = {};

// ---- attention bundled from handler_attention.js ----
HANDLERS['attention'] = (() => {
  const module = { exports: {} };
  const exports = module.exports;

function corsOrigin(req){
  const origin = req && req.headers ? String(req.headers.origin || '') : '';
  const extra = String(process.env.ALLOWED_ORIGINS || '').split(',').map(x=>x.trim()).filter(Boolean);
  const ok = !origin || /^https:\/\/.*\.vercel\.app$/.test(origin) || /^https:\/\/.*omninomics\.(com|app)$/.test(origin) || /^http:\/\/localhost:\d+$/.test(origin) || extra.includes(origin);
  return ok ? (origin || '*') : 'null';
}
function setCorsHeaders(req,res,extra={}){
  const headers={
    'Access-Control-Allow-Origin':corsOrigin(req),
    'Vary':'Origin',
    'Access-Control-Allow-Headers':'Content-Type, x-omni-cmc-key, x-cmc-api-key, x-coinmarketcap-key, x-omni-cg-key, x-dune-api-key, x-omni-dune-key, x-rux-telegram-source',
    'Access-Control-Allow-Methods':'GET, POST, OPTIONS',
    ...extra
  };
  Object.entries(headers).forEach(([k,v])=>res.setHeader(k,v));
  if((req.method||'GET')==='OPTIONS'){res.status(204).send(''); return true;}
  return false;
}


const CG_IDS = {
  BTCUSDT:"bitcoin",ETHUSDT:"ethereum",SOLUSDT:"solana",BNBUSDT:"binancecoin",XRPUSDT:"ripple",ADAUSDT:"cardano",
  AVAXUSDT:"avalanche-2",LINKUSDT:"chainlink",DOGEUSDT:"dogecoin",TONUSDT:"the-open-network",AAVEUSDT:"aave",
  PLUMEUSDT:"plume",TURBOUSDT:"turbo",AIXBTUSDT:"aixbt",ETHFIUSDT:"ether-fi",TIAUSDT:"celestia",ORDIUSDT:"ordi",
  TAOUSDT:"bittensor",MOVRUSDT:"moonriver",NEIROUSDT:"neiro-on-eth"
};
const DUNE_ALIAS = {
  BTC:["WBTC","BTC"], ETH:["ETH","WETH"], SOL:["SOL"], BNB:["BNB"], XRP:["XRP"], ADA:["ADA"], AVAX:["AVAX"],
  LINK:["LINK"], DOGE:["DOGE"], TON:["TON"], AAVE:["AAVE"], TIA:["TIA"], ORDI:["ORDI"], TAO:["TAO"]
};
const cache = new Map();
function num(v,d=null){v=Number(v);return Number.isFinite(v)?v:d}
function clamp(v,a=0,b=100){return Math.max(a,Math.min(b,v))}
async function jfetch(url,opts={},timeout=15000){
  const ctrl=new AbortController(); const t=setTimeout(()=>ctrl.abort(),timeout);
  try{
    const r=await fetch(url,{...opts,signal:ctrl.signal});
    const txt=await r.text(); let j; try{j=JSON.parse(txt)}catch{j=txt}
    if(!r.ok) throw new Error(`HTTP ${r.status}: ${typeof j==="string"?j.slice(0,180):JSON.stringify(j).slice(0,180)}`);
    return j;
  }finally{clearTimeout(t)}
}
function cgHeaders(req){
  const key=req.headers["x-omni-cg-key"] || "";
  const h={"accept":"application/json","user-agent":"Omninomics/1.0"};
  if(key) h["x-cg-demo-api-key"]=key;
  return h;
}
function scoreCoin(m,trendingRank,detail=null){
  const vol=num(m.total_volume,0),mc=num(m.market_cap,0),rank=num(m.market_cap_rank,9999);
  const vmp=mc?vol/mc*100:0;
  const ch24=num(m.price_change_percentage_24h,0), ch7=num(m.price_change_percentage_7d_in_currency,0), ch30=num(m.price_change_percentage_30d_in_currency,0);
  const trendScore=trendingRank?clamp(100-(trendingRank-1)*8):35;
  const rankScore=rank?clamp(100-rank/4):20;
  const volScore=clamp(vmp*13);
  const momScore=clamp(50+ch24*2+ch7*.9+ch30*.25);
  let communityScore=detail?.community_score!=null?num(detail.community_score,0):50;
  let devScore=detail?.developer_score!=null?num(detail.developer_score,0):50;
  const score=clamp(trendScore*.28+rankScore*.18+volScore*.24+momScore*.22+communityScore*.04+devScore*.04);
  let quality="B";
  if(!mc||!vol) quality="C";
  if(trendingRank||rank<100) quality="A";
  return {score,volumeMcapPct:vmp,rankScore,volScore,momScore,communityScore,devScore,quality};
}

async function resolveCgIdsV730(symbols,req,errors){
  const headers=cgHeaders(req);
  const out={};
  symbols.forEach(s=>{if(CG_IDS[s])out[s]=CG_IDS[s]});
  const missing=symbols.filter(s=>!out[s]).slice(0,20);
  await Promise.all(missing.map(async sym=>{
    try{
      const base=sym.replace(/USDT$/,'').toLowerCase();
      const j=await jfetch(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(base)}`,{headers},9000);
      const coins=Array.isArray(j.coins)?j.coins:[];
      const exact=coins.find(c=>String(c.symbol||'').toLowerCase()===base) || coins[0];
      if(exact&&exact.id){out[sym]=exact.id;CG_IDS[sym]=exact.id;}
    }catch(e){errors.push(`CoinGecko search ${sym}: ${e.message||String(e)}`)}
  }));
  return out;
}

async function getCoingecko(symbols,req,errors){
  const cgMap=await resolveCgIdsV730(symbols,req,errors);
  const ids=[...new Set(symbols.map(s=>cgMap[s]).filter(Boolean))];
  if(!ids.length) return symbols.map(s=>({symbol:s,attentionScore:0,quality:"YOK",source:"no CoinGecko mapping"}));
  const key="cg:"+ids.join(",");
  const cached=cache.get(key);
  if(cached && Date.now()-cached.ts<90000) return cached.data;
  const headers=cgHeaders(req);
  const qs=ids.join(",");
  const [markets,trending] = await Promise.all([
    jfetch(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${encodeURIComponent(qs)}&order=market_cap_desc&per_page=250&page=1&sparkline=false&price_change_percentage=1h,24h,7d,30d`,{headers}).catch(e=>{errors.push("CoinGecko markets: "+e.message);return []}),
    jfetch(`https://api.coingecko.com/api/v3/search/trending`,{headers}).catch(e=>{errors.push("CoinGecko trending: "+e.message);return {coins:[]}})
  ]);
  const trendMap={};
  (trending.coins||[]).forEach((x,i)=>{if(x.item?.id)trendMap[x.item.id]=i+1});
  const byId={};
  (markets||[]).forEach(m=>byId[m.id]=m);
  const out=symbols.map(sym=>{
    const id=cgMap[sym]||CG_IDS[sym],m=byId[id];
    if(!id||!m)return {symbol:sym,id:id||null,attentionScore:0,quality:"YOK",source:"CoinGecko: no map/no data"};
    const sc=scoreCoin(m,trendMap[id]||null);
    return {
      symbol:sym,id,name:m.name,source:"CoinGecko",
      price:num(m.current_price), marketCap:num(m.market_cap), marketCapRank:num(m.market_cap_rank),
      volume24h:num(m.total_volume), volumeMcapPct:sc.volumeMcapPct,
      priceChange1h:num(m.price_change_percentage_1h_in_currency),
      priceChange24h:num(m.price_change_percentage_24h),
      priceChange7d:num(m.price_change_percentage_7d_in_currency),
      priceChange30d:num(m.price_change_percentage_30d_in_currency),
      trendingRank:trendMap[id]||null,
      attentionScore:sc.score, rankScore:sc.rankScore, volumeScore:sc.volScore, momentumScore:sc.momScore,
      communityScore:sc.communityScore, developerScore:sc.devScore, quality:sc.quality
    };
  });
  cache.set(key,{ts:Date.now(),data:out});
  return out;
}
function sqlForSymbol(sym){
  const base=sym.replace(/USDT$/,"");
  const aliases=(DUNE_ALIAS[base]||[base]).map(x=>`'${String(x).replace(/'/g,"''")}'`).join(",");
  return `
WITH t AS (
  SELECT
    blockchain,
    amount_usd,
    upper(token_bought_symbol) AS bought,
    upper(token_sold_symbol) AS sold
  FROM dex.trades
  WHERE block_time > now() - interval '1' day
    AND amount_usd IS NOT NULL
    AND amount_usd > 0
    AND (
      upper(token_bought_symbol) IN (${aliases})
      OR upper(token_sold_symbol) IN (${aliases})
    )
)
SELECT
  sum(amount_usd) AS dex_volume_usd,
  sum(CASE WHEN bought IN (${aliases}) THEN amount_usd ELSE 0 END) AS buy_usd,
  sum(CASE WHEN sold IN (${aliases}) THEN amount_usd ELSE 0 END) AS sell_usd,
  sum(CASE WHEN bought IN (${aliases}) THEN amount_usd ELSE 0 END) - sum(CASE WHEN sold IN (${aliases}) THEN amount_usd ELSE 0 END) AS net_buy_usd,
  count(*) AS trade_count,
  count(distinct blockchain) AS chain_count
FROM t
`.trim();
}
async function duneQuery(sym,key,force,errors){
  const ckey="dune:"+sym;
  const cached=cache.get(ckey);
  if(!force && cached && Date.now()-cached.ts<1000*60*60*6) return cached.data;
  if(!key) return null;
  const headers={"Content-Type":"application/json","X-Dune-Api-Key":key,"user-agent":"Omninomics/1.0"};
  const sql=sqlForSymbol(sym);
  try{
    const ex=await jfetch("https://api.dune.com/api/v1/sql/execute",{method:"POST",headers,body:JSON.stringify({sql,performance:"small"})},15000);
    const id=ex.execution_id;
    let status=ex.state || "QUERY_STATE_PENDING";
    for(let i=0;i<7;i++){
      if(status==="QUERY_STATE_COMPLETED")break;
      if(status==="QUERY_STATE_FAILED"||status==="QUERY_STATE_CANCELED")throw new Error(`Dune ${status}`);
      await new Promise(r=>setTimeout(r,1200));
      const st=await jfetch(`https://api.dune.com/api/v1/execution/${id}/status`,{headers},12000);
      status=st.state;
    }
    if(status!=="QUERY_STATE_COMPLETED"){
      const pending={symbol:sym,status:"pending",executionId:id,message:"Dune sorgusu henüz tamamlanmadı; tekrar deneyince sonuç gelebilir."};
      cache.set(ckey,{ts:Date.now(),data:pending});return pending;
    }
    const res=await jfetch(`https://api.dune.com/api/v1/execution/${id}/results?limit=1`,{headers},15000);
    const row=res?.result?.rows?.[0] || {};
    const buy=num(row.buy_usd,0), sell=num(row.sell_usd,0), net=num(row.net_buy_usd,0), vol=num(row.dex_volume_usd,0);
    const ratio=sell>0?buy/sell:(buy>0?9.99:null);
    const onchainScore=clamp(50 + (vol>0?Math.log10(vol+1)*3:0) + (ratio?((ratio-1)*18):0) + Math.min(num(row.chain_count,0)*3,12));
    const out={symbol:sym,status:"completed",dexVolumeUsd:vol,buyUsd:buy,sellUsd:sell,netBuyUsd:net,buySellRatio:ratio,tradeCount:num(row.trade_count,0),chainCount:num(row.chain_count,0),onchainScore,executionId:id,sql};
    cache.set(ckey,{ts:Date.now(),data:out});return out;
  }catch(e){errors.push("Dune: "+(e.message||String(e)));return {symbol:sym,status:"error",message:e.message||String(e),sql};}
}
module.exports = async function handler(req,res){
  if (typeof setCorsHeaders==='function' && setCorsHeaders(req,res,{'Content-Type':'application/json'})) return;
  const errors=[];
  try{
    const symbols=String(req.query.symbols||req.query.symbol||"BTCUSDT").split(",").map(s=>s.trim().toUpperCase()).filter(Boolean).slice(0,40);
    const includeDune=String(req.query.includeDune||"0")==="1";
    const force=String(req.query.force||"0")==="1";
    const duneKey=req.headers["x-omni-dune-key"] || "";
    const coins=await getCoingecko(symbols,req,errors);
    let dune=null;
    if(includeDune && duneKey && symbols.length===1){
      dune=await duneQuery(symbols[0],duneKey,force,errors);
      if(dune){
        const c=coins.find(x=>x.symbol===symbols[0]);
        if(c){ c.dune=dune; c.attentionScore=clamp((c.attentionScore||0)*0.78+(dune.onchainScore||50)*0.22); }
      }
    }
    res.setHeader("Cache-Control","s-maxage=60, stale-while-revalidate=120");
    res.status(200).json({source:"CoinGecko"+(dune?"+Dune":""),coins,dune,errors,updatedAt:Date.now()});
  }catch(e){res.status(502).json({error:e.message||String(e),errors});}
}

  return module.exports;
})();

// ---- cmc bundled from handler_cmc.js ----
HANDLERS['cmc'] = (() => {
  const module = { exports: {} };
  const exports = module.exports;

function corsOrigin(req){
  const origin = req && req.headers ? String(req.headers.origin || '') : '';
  const extra = String(process.env.ALLOWED_ORIGINS || '').split(',').map(x=>x.trim()).filter(Boolean);
  const ok = !origin || /^https:\/\/.*\.vercel\.app$/.test(origin) || /^https:\/\/.*omninomics\.(com|app)$/.test(origin) || /^http:\/\/localhost:\d+$/.test(origin) || extra.includes(origin);
  return ok ? (origin || '*') : 'null';
}
function setCorsHeaders(req,res,extra={}){
  const headers={
    'Access-Control-Allow-Origin':corsOrigin(req),
    'Vary':'Origin',
    'Access-Control-Allow-Headers':'Content-Type, x-omni-cmc-key, x-cmc-api-key, x-coinmarketcap-key, x-omni-cg-key, x-dune-api-key, x-omni-dune-key, x-rux-telegram-source',
    'Access-Control-Allow-Methods':'GET, POST, OPTIONS',
    ...extra
  };
  Object.entries(headers).forEach(([k,v])=>res.setHeader(k,v));
  if((req.method||'GET')==='OPTIONS'){res.status(204).send(''); return true;}
  return false;
}

// OMNINOMICS v5.2.3 — CoinMarketCap Market Context API
// Türkçe UI için hafif istihbarat katmanı. Karar motoruna bağlı değildir.
// Gerekli env: CMC_API_KEY veya COINMARKETCAP_API_KEY

const BASE = 'https://pro-api.coinmarketcap.com';
const UA = 'Omninomics/5.2.3 cmc-top100-marketcap';
const CACHE = globalThis.__OMNI_CMC_CACHE__ || new Map();
globalThis.__OMNI_CMC_CACHE__ = CACHE;

function envApiKey(){ return process.env.CMC_API_KEY || process.env.COINMARKETCAP_API_KEY || ''; }
function headerApiKey(req){
  return String(req?.headers?.['x-omni-cmc-key'] || req?.headers?.['x-cmc-api-key'] || req?.headers?.['x-coinmarketcap-key'] || '').trim();
}
function queryApiKey(req){
  // Son çare fallback. Normalde uygulama POST body/header kullanır; URL loglarında key görünmesin diye bunu UI tarafında varsayılan yapmıyoruz.
  return String(req?.query?.cmc_key || req?.query?.key || '').trim();
}
function bodyApiKey(req){
  try{
    const b = req?.body;
    if(!b) return '';
    if(typeof b === 'string'){
      const j = JSON.parse(b || '{}');
      return String(j.cmc_key || j.key || j.cmcApiKey || '').trim();
    }
    return String(b.cmc_key || b.key || b.cmcApiKey || '').trim();
  }catch{return ''}
}
function apiKey(reqOrKey){
  if(typeof reqOrKey === 'string') return reqOrKey.trim() || envApiKey();
  return headerApiKey(reqOrKey) || bodyApiKey(reqOrKey) || queryApiKey(reqOrKey) || envApiKey();
}
function keySig(k){ k=String(k||''); return k ? (k.slice(0,6)+':'+k.slice(-4)) : 'env'; }
function now(){ return Date.now(); }
function cacheGet(key, ttlMs){ const x=CACHE.get(key); if(!x) return null; if(now()-x.t>ttlMs) return null; return x.v; }
function cacheSet(key, v){ CACHE.set(key,{t:now(),v}); return v; }
function num(v){ const n=Number(v); return Number.isFinite(n)?n:null; }
function cleanLimit(v, d=100){ const n=Math.max(1,Math.min(1000,Number(v)||d)); return Math.round(n); }
function safeStr(v){ return String(v||'').replace(/[\u0000-\u001f<>]/g,'').trim(); }

async function getJson(path, params = {}, timeout = 8200, keyOverride = ''){
  const key = apiKey(keyOverride);
  if(!key) throw new Error('CMC_API_KEY tanımlı değil. Vercel Environment Variables içine CMC_API_KEY ekleyin.');
  const u = new URL(BASE + path);
  Object.entries(params).forEach(([k,v])=>{ if(v!==undefined && v!==null && v!=='') u.searchParams.set(k,String(v)); });
  const ctl = new AbortController();
  const id = setTimeout(()=>ctl.abort(), timeout);
  try{
    const r = await fetch(u, { signal: ctl.signal, headers: { 'Accept':'application/json', 'X-CMC_PRO_API_KEY': key, 'User-Agent': UA } });
    const text = await r.text();
    let json; try{ json = JSON.parse(text); }catch{ json = { raw: text.slice(0,500) }; }
    const cmcErrorCode = json?.status?.error_code;
    const hasCmcError = cmcErrorCode !== undefined && cmcErrorCode !== null && String(cmcErrorCode) !== '0';
    if(!r.ok || hasCmcError){
      const msg = json?.status?.error_message || json?.error || text.slice(0,240) || `HTTP ${r.status}`;
      throw new Error(`${path}: ${msg}`);
    }
    return json;
  } finally { clearTimeout(id); }
}

function unwrapQuote(x){ return x?.quote?.USD || x?.quote?.usd || {}; }
function normalizeListing(x){
  const q = unwrapQuote(x);
  const p1h = num(q.percent_change_1h);
  const p24 = num(q.percent_change_24h);
  const p7d = num(q.percent_change_7d);
  return {
    id: x.id,
    cmc_rank: num(x.cmc_rank),
    name: safeStr(x.name),
    symbol: safeStr(x.symbol).toUpperCase(),
    slug: safeStr(x.slug),
    price: num(q.price),
    market_cap: num(q.market_cap),
    volume_24h: num(q.volume_24h),
    percent_change_1h: p1h,
    percent_change_24h: p24,
    percent_change_7d: p7d,
    mover_abs_24h: Math.abs(p24 || 0),
    last_updated: q.last_updated || x.last_updated || null,
    display_only: true,
    decision_binding: 'DISABLED',
    decision_weight: 0
  };
}
function normalizeInfo(data){
  const out = {};
  Object.values(data || {}).forEach(x=>{
    if(!x) return;
    out[String(x.id)] = {
      id: x.id,
      name: safeStr(x.name),
      symbol: safeStr(x.symbol).toUpperCase(),
      slug: safeStr(x.slug),
      logo: x.logo || '',
      category: safeStr(x.category || ''),
      description: safeStr(x.description || '').slice(0, 420),
      date_added: x.date_added || null,
      platform: x.platform ? { id:x.platform.id, name:x.platform.name, symbol:x.platform.symbol, slug:x.platform.slug } : null,
      tags: Array.isArray(x.tags) ? x.tags.slice(0, 8).map(safeStr) : [],
      urls: x.urls || {}
    };
    if(x.symbol) out[String(x.symbol).toUpperCase()] = out[String(x.id)];
  });
  return out;
}
function normalizeGlobal(data){
  const q = data?.quote?.USD || data?.quote?.usd || {};
  return {
    active_cryptocurrencies: num(data?.active_cryptocurrencies),
    active_market_pairs: num(data?.active_market_pairs),
    active_exchanges: num(data?.active_exchanges),
    total_market_cap: num(q.total_market_cap),
    total_volume_24h: num(q.total_volume_24h),
    total_volume_24h_yesterday_percentage_change: num(q.total_volume_24h_yesterday_percentage_change),
    total_market_cap_yesterday_percentage_change: num(q.total_market_cap_yesterday_percentage_change),
    btc_dominance: num(data?.btc_dominance),
    eth_dominance: num(data?.eth_dominance),
    btc_dominance_24h_percentage_change: num(data?.btc_dominance_24h_percentage_change),
    eth_dominance_24h_percentage_change: num(data?.eth_dominance_24h_percentage_change),
    defi_volume_24h: num(data?.defi_volume_24h),
    stablecoin_volume_24h: num(data?.stablecoin_volume_24h),
    derivatives_volume_24h: num(data?.derivatives_volume_24h),
    last_updated: data?.last_updated || null
  };
}
function normalizeIndex(data){
  return {
    value: num(data?.value),
    value_24h_percentage_change: num(data?.value_24h_percentage_change),
    last_update: data?.last_update || data?.update_time || null,
    next_update: data?.next_update || null,
    constituents: Array.isArray(data?.constituents) ? data.constituents.slice(0,20).map(c=>({
      id:c.id, name:safeStr(c.name), symbol:safeStr(c.symbol).toUpperCase(), weight:num(c.weight), priceUsd:num(c.priceUsd), units:num(c.units), url:c.url||''
    })) : []
  };
}

async function safeCall(name, fn){
  try{ return { name, ok:true, data: await fn() }; }
  catch(e){ return { name, ok:false, error: e?.message || String(e) }; }
}

async function getTopMovers(limit=100, keyOverride='', force=false){
  // Kullanıcının istediği davranış: CMC ilk 100 listesini piyasa değerine göre getir.
  // Eski sürüm 24s hareket/volatiliteye göre çektiği için düşük hacimli ve market cap'i boş tokenlar üste çıkabiliyordu.
  const cacheKey = `top100_marketcap:${limit}:${keySig(keyOverride)}`;
  const c = !force ? cacheGet(cacheKey, 5*60*1000) : null; if(c) return c;
  const json = await getJson('/v1/cryptocurrency/listings/latest', {
    start:1,
    limit,
    convert:'USD',
    sort:'market_cap',
    sort_dir:'desc',
    cryptocurrency_type:'all'
  }, 8200, keyOverride);
  const raw = Array.isArray(json?.data) ? json.data : [];
  const items = raw.map(normalizeListing)
    .sort((a,b)=> (b.market_cap||0) - (a.market_cap||0) || (a.cmc_rank||999999) - (b.cmc_rank||999999))
    .slice(0, limit);
  return cacheSet(cacheKey, { items, count:items.length, sort_basis:'market_cap_desc', updated_at:new Date().toISOString() });
}


async function getMetadata(ids, keyOverride='', force=false){
  const clean = [...new Set((ids||[]).map(x=>String(x).replace(/[^0-9]/g,'')).filter(Boolean))].slice(0,100);
  if(!clean.length) return {};
  const cacheKey = `info:${clean.join(',')}:${keySig(keyOverride)}`;
  const c = !force ? cacheGet(cacheKey, 24*60*60*1000) : null; if(c) return c;
  const json = await getJson('/v2/cryptocurrency/info', { id: clean.join(',') }, 8200, keyOverride);
  return cacheSet(cacheKey, normalizeInfo(json?.data || {}));
}

async function getContext(limit=100, keyOverride='', force=false){
  const cacheKey = `context:${limit}:${keySig(keyOverride)}`;
  const c = !force ? cacheGet(cacheKey, 5*60*1000) : null; if(c) return c;
  const [global, fear, alt, cmc100, cmc20, movers] = await Promise.all([
    safeCall('global_metrics', async()=> normalizeGlobal((await getJson('/v1/global-metrics/quotes/latest', { convert:'USD' }, 8200, keyOverride)).data)),
    safeCall('fear_and_greed', async()=> (await getJson('/v3/fear-and-greed/latest', {}, 8200, keyOverride)).data),
    safeCall('altcoin_season', async()=> (await getJson('/v1/altcoin-season-index/latest', {}, 8200, keyOverride)).data),
    safeCall('cmc100', async()=> normalizeIndex((await getJson('/v3/index/cmc100-latest', {}, 8200, keyOverride)).data)),
    safeCall('cmc20', async()=> normalizeIndex((await getJson('/v3/index/cmc20-latest', {}, 8200, keyOverride)).data)),
    safeCall('top_movers', async()=> getTopMovers(limit, keyOverride, force))
  ]);
  const ids = movers.ok ? movers.data.items.map(x=>x.id).filter(Boolean).slice(0,100) : [];
  const meta = await safeCall('metadata', async()=> getMetadata(ids, keyOverride, force));
  const errors = [global,fear,alt,cmc100,cmc20,movers,meta].filter(x=>!x.ok).map(x=>`${x.name}: ${x.error}`);
  const result = {
    ok: errors.length < 6,
    language: 'tr',
    display_only: true,
    decision_binding: 'DISABLED',
    decision_weight: 0,
    provider: 'CoinMarketCap',
    updated_at: new Date().toISOString(),
    note: errors.join(' | '),
    global_metrics: global.ok ? global.data : null,
    fear_and_greed: fear.ok ? fear.data : null,
    altcoin_season: alt.ok ? alt.data : null,
    cmc100: cmc100.ok ? cmc100.data : null,
    cmc20: cmc20.ok ? cmc20.data : null,
    top_movers: movers.ok ? movers.data.items : [],
    top100_sort_basis: movers.ok ? movers.data.sort_basis : 'market_cap_desc',
    metadata: meta.ok ? meta.data : {},
    errors
  };
  return cacheSet(cacheKey, result);
}


// v6.2.1: CMC key yoksa ücretsiz CoinGecko fallback.
const GECKO_BASE = 'https://api.coingecko.com/api/v3';
async function getGeckoJson(path, params = {}, timeout = 8200){
  const u = new URL(GECKO_BASE + path);
  Object.entries(params).forEach(([k,v])=>{ if(v!==undefined && v!==null && v!=='') u.searchParams.set(k,String(v)); });
  const ctl = new AbortController();
  const id = setTimeout(()=>ctl.abort(), timeout);
  try{
    const r = await fetch(u, { signal: ctl.signal, headers: { 'Accept':'application/json', 'User-Agent':'Omninomics/6.2.1 coingecko-fallback' } });
    const text = await r.text();
    let json; try{ json = JSON.parse(text); }catch{ json = { raw:text.slice(0,500) }; }
    if(!r.ok) throw new Error(json?.error || json?.status?.error_message || text.slice(0,240) || `HTTP ${r.status}`);
    return json;
  } finally { clearTimeout(id); }
}
function geckoListing(x, rank){
  return {
    id: x.id,
    cmc_rank: num(x.market_cap_rank) || rank,
    name: safeStr(x.name),
    symbol: safeStr(x.symbol).toUpperCase(),
    slug: safeStr(x.id),
    price: num(x.current_price),
    market_cap: num(x.market_cap),
    volume_24h: num(x.total_volume),
    percent_change_1h: num(x.price_change_percentage_1h_in_currency),
    percent_change_24h: num(x.price_change_percentage_24h_in_currency ?? x.price_change_percentage_24h),
    percent_change_7d: num(x.price_change_percentage_7d_in_currency),
    mover_abs_24h: Math.abs(num(x.price_change_percentage_24h_in_currency ?? x.price_change_percentage_24h) || 0),
    last_updated: x.last_updated || null,
    logo: x.image || '',
    display_only: true,
    decision_binding: 'DISABLED',
    decision_weight: 0
  };
}
async function getGeckoTop100(limit=100, force=false){
  const cacheKey = `gecko_top100:${limit}`;
  const c = !force ? cacheGet(cacheKey, 60*1000) : null; if(c) return c;
  const arr = await getGeckoJson('/coins/markets', {
    vs_currency:'usd', order:'market_cap_desc', per_page:Math.min(250,limit), page:1, sparkline:false,
    price_change_percentage:'1h,24h,7d'
  }, 9000);
  const items = (Array.isArray(arr)?arr:[]).map((x,i)=>geckoListing(x,i+1)).sort((a,b)=>(b.market_cap||0)-(a.market_cap||0)).slice(0,limit);
  return cacheSet(cacheKey, {items, count:items.length, sort_basis:'market_cap_desc', updated_at:new Date().toISOString()});
}
async function getGeckoContext(limit=100, force=false){
  const cacheKey = `gecko_context:${limit}`;
  const c = !force ? cacheGet(cacheKey, 90*1000) : null; if(c) return c;
  const [global, top] = await Promise.all([
    safeCall('coingecko_global', async()=> await getGeckoJson('/global', {}, 8200)),
    safeCall('coingecko_top100', async()=> await getGeckoTop100(limit, force))
  ]);
  const g = global.ok ? global.data?.data || {} : {};
  const qVol = g.total_volume || {};
  const qMc = g.total_market_cap || {};
  const pct = g.market_cap_percentage || {};
  const stable = (top.ok ? top.data.items : []).filter(x=>['USDT','USDC','DAI','FDUSD','TUSD','USDE'].includes(String(x.symbol).toUpperCase()));
  const global_metrics = {
    active_cryptocurrencies: num(g.active_cryptocurrencies),
    active_market_pairs: num(g.markets),
    active_exchanges: null,
    total_market_cap: num(qMc.usd),
    total_volume_24h: num(qVol.usd),
    total_volume_24h_yesterday_percentage_change: null,
    total_market_cap_yesterday_percentage_change: num(g.market_cap_change_percentage_24h_usd),
    btc_dominance: num(pct.btc),
    eth_dominance: num(pct.eth),
    btc_dominance_24h_percentage_change: null,
    eth_dominance_24h_percentage_change: null,
    stablecoin_volume_24h: stable.reduce((s,x)=>s+(x.volume_24h||0),0),
    stablecoin_market_cap: stable.reduce((s,x)=>s+(x.market_cap||0),0),
    last_updated: g.updated_at ? new Date(g.updated_at*1000).toISOString() : new Date().toISOString()
  };
  const errors = [global,top].filter(x=>!x.ok).map(x=>`${x.name}: ${x.error}`);
  return cacheSet(cacheKey, {
    ok: top.ok || global.ok,
    language:'tr', provider:'CoinGecko Free', fallback_from:'CoinMarketCap', display_only:true, decision_binding:'DISABLED', decision_weight:0,
    updated_at:new Date().toISOString(), note: errors.join(' | '), global_metrics,
    fear_and_greed:null, altcoin_season:null, cmc100:null, cmc20:null,
    top_movers: top.ok ? top.data.items : [], top100_sort_basis:'market_cap_desc', metadata:{}, errors
  });
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control','s-maxage=300, stale-while-revalidate=900');
  res.setHeader('Content-Type','application/json; charset=utf-8');
  try{
    const mode = String(req.query?.mode || 'context').toLowerCase();
    const limit = cleanLimit(req.query?.limit, 100);
    const force = String(req.query?.force || req.query?.nocache || '') === '1';
    const requestKey = apiKey(req);
    if(!requestKey){
      // API anahtarı yoksa ücretli CMC yerine ücretsiz CoinGecko fallback devreye girer.
      if(mode === 'movers'){
        const movers = await getGeckoTop100(Math.min(limit,100), force);
        return res.status(200).json({ ok:true, language:'tr', provider:'CoinGecko Free', fallback_from:'CoinMarketCap', display_only:true, decision_binding:'DISABLED', decision_weight:0, updated_at:new Date().toISOString(), top_movers:movers.items, top100_sort_basis:movers.sort_basis||'market_cap_desc', metadata:{} });
      }
      return res.status(200).json(await getGeckoContext(Math.min(limit,100), force));
    }
    if(mode === 'movers'){
      const movers = await getTopMovers(Math.min(limit,100), requestKey, force);
      const meta = await getMetadata(movers.items.map(x=>x.id), requestKey, force);
      return res.status(200).json({ ok:true, language:'tr', provider:'CoinMarketCap', display_only:true, decision_binding:'DISABLED', decision_weight:0, updated_at:new Date().toISOString(), top_movers:movers.items, top100_sort_basis:movers.sort_basis||'market_cap_desc', metadata:meta });
    }
    const ctx = await getContext(Math.min(limit,100), requestKey, force);
    return res.status(200).json(ctx);
  }catch(e){
    try{
      const mode = String(req.query?.mode || 'context').toLowerCase();
      const limit = cleanLimit(req.query?.limit, 100);
      const force = String(req.query?.force || req.query?.nocache || '') === '1';
      if(mode === 'movers'){
        const movers = await getGeckoTop100(Math.min(limit,100), force);
        return res.status(200).json({ ok:true, language:'tr', provider:'CoinGecko Free', fallback_from:'CoinMarketCap', cmc_error:e?.message||String(e), display_only:true, decision_binding:'DISABLED', decision_weight:0, updated_at:new Date().toISOString(), top_movers:movers.items, top100_sort_basis:movers.sort_basis||'market_cap_desc', metadata:{} });
      }
      const ctx = await getGeckoContext(Math.min(limit,100), force);
      ctx.cmc_error = e?.message || String(e);
      return res.status(200).json(ctx);
    }catch(ge){
      return res.status(200).json({ ok:false, language:'tr', provider:'CoinMarketCap/CoinGecko', display_only:true, decision_binding:'DISABLED', decision_weight:0, error:e?.message||String(e), fallback_error:ge?.message||String(ge), global_metrics:null, fear_and_greed:null, altcoin_season:null, cmc100:null, cmc20:null, top_movers:[], metadata:{} });
    }
  }
};

  return module.exports;
})();

// ---- cvd bundled from handler_cvd.js ----
HANDLERS['cvd'] = (() => {
  const module = { exports: {} };
  const exports = module.exports;

function corsOrigin(req){
  const origin = req && req.headers ? String(req.headers.origin || '') : '';
  const extra = String(process.env.ALLOWED_ORIGINS || '').split(',').map(x=>x.trim()).filter(Boolean);
  const ok = !origin || /^https:\/\/.*\.vercel\.app$/.test(origin) || /^https:\/\/.*omninomics\.(com|app)$/.test(origin) || /^http:\/\/localhost:\d+$/.test(origin) || extra.includes(origin);
  return ok ? (origin || '*') : 'null';
}

// OMNINOMICS v5.2.6 — CVD / Order Flow API
// Binance aggTrades üzerinden agresif alıcı/satıcı hacim farkı üretir.

const BINANCE = [
  'https://api.binance.com',
  'https://api1.binance.com',
  'https://api2.binance.com',
  'https://api3.binance.com'
];
function cleanSymbol(v){return String(v||'BTCUSDT').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,20) || 'BTCUSDT';}
function cleanLimit(v){return Math.max(100, Math.min(1000, Number(v)||1000));}
async function getJson(url, timeout=6500){
  const ctrl=new AbortController(); const t=setTimeout(()=>ctrl.abort(), timeout);
  try{
    const r=await fetch(url,{signal:ctrl.signal,headers:{'accept':'application/json','user-agent':'OmninomicsCVD/5.2.6'}});
    const text=await r.text(); let j; try{j=JSON.parse(text)}catch{j=text}
    if(!r.ok)throw new Error(`HTTP ${r.status}: ${typeof j==='string'?j.slice(0,160):JSON.stringify(j).slice(0,160)}`);
    return j;
  } finally {clearTimeout(t)}
}
async function anyJson(urls){return await Promise.any(urls.map(u=>getJson(u)));}
module.exports = async function handler(req,res){
  const headers={
    'Access-Control-Allow-Origin':corsOrigin(req),'Vary':'Origin',
    'Access-Control-Allow-Headers':'Content-Type',
    'Access-Control-Allow-Methods':'GET, OPTIONS',
    'Cache-Control':'public, max-age=60, s-maxage=60, stale-while-revalidate=120',
    'Content-Type':'application/json'
  };
  Object.entries(headers).forEach(([k,v])=>res.setHeader(k,v));
  if((req.method||'GET')==='OPTIONS'){res.status(204).send('');return;}
  const symbol=cleanSymbol(req.query?.symbol), limit=cleanLimit(req.query?.limit), mode=String(req.query?.mode||'agg').toLowerCase();
  try{
    if(mode==='kline'){
      const urls=BINANCE.map(b=>`${b}/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=1m&limit=${Math.min(1000,limit)}`);
      const rows=await anyJson(urls);
      let cvd=0,buckets=[],lastPrice=0,buyQuote=0,sellQuote=0;
      for(const k of rows){const ts=Number(k[0]), close=Number(k[4]), quote=Number(k[7]||0), takerBuy=Number(k[10]||0), takerSell=Math.max(0,quote-takerBuy); lastPrice=close; buyQuote+=takerBuy; sellQuote+=takerSell; cvd+=takerBuy-takerSell; buckets.push({time:ts,buyQuote:takerBuy,sellQuote:takerSell,cvd,count:Number(k[8]||0)});}
      return res.status(200).send(JSON.stringify({symbol,source:'BINANCE 1m kline taker buy/sell',mode:'kline',count:rows.length,buyQuote,sellQuote,totalQuote:buyQuote+sellQuote,cvd,lastPrice,buckets,updatedAt:Date.now()}));
    }
    const urls=BINANCE.map(b=>`${b}/api/v3/aggTrades?symbol=${encodeURIComponent(symbol)}&limit=${limit}`);
    const rows=await anyJson(urls);
    if(!Array.isArray(rows)||!rows.length)throw new Error('aggTrades boş döndü');
    let buyQuote=0,sellQuote=0,buyBase=0,sellBase=0,cvd=0,lastPrice=0;
    const bucketMs=5*60*1000, map=new Map();
    for(const t of rows){
      const price=Number(t.p), qty=Number(t.q), quote=price*qty, ts=Number(t.T)||Date.now(); lastPrice=price;
      // Binance aggTrade m=true ise buyer maker -> agresif satıcı hacmi kabul edilir.
      const aggressiveSell=!!t.m;
      if(aggressiveSell){sellQuote+=quote;sellBase+=qty;cvd-=quote;} else {buyQuote+=quote;buyBase+=qty;cvd+=quote;}
      const key=Math.floor(ts/bucketMs)*bucketMs; const b=map.get(key)||{time:key,buyQuote:0,sellQuote:0,cvd:0,count:0};
      if(aggressiveSell){b.sellQuote+=quote;b.cvd-=quote;} else {b.buyQuote+=quote;b.cvd+=quote;} b.count++; map.set(key,b);
    }
    const buckets=[...map.values()].sort((a,b)=>a.time-b.time);
    res.status(200).send(JSON.stringify({symbol,source:'BINANCE aggTrades',count:rows.length,buyQuote,sellQuote,buyBase,sellBase,totalQuote:buyQuote+sellQuote,cvd,lastPrice,buckets,updatedAt:Date.now()}));
  }catch(e){res.status(502).send(JSON.stringify({symbol,error:e.message||String(e),source:'CVD ERROR',updatedAt:Date.now()}));}
};

  return module.exports;
})();

// ---- defillama bundled from handler_defillama.js ----
HANDLERS['defillama'] = (() => {
  const module = { exports: {} };
  const exports = module.exports;

function corsOrigin(req){
  const origin = req && req.headers ? String(req.headers.origin || '') : '';
  const extra = String(process.env.ALLOWED_ORIGINS || '').split(',').map(x=>x.trim()).filter(Boolean);
  const ok = !origin || /^https:\/\/.*\.vercel\.app$/.test(origin) || /^https:\/\/.*omninomics\.(com|app)$/.test(origin) || /^http:\/\/localhost:\d+$/.test(origin) || extra.includes(origin);
  return ok ? (origin || '*') : 'null';
}

// OMNINOMICS v6.3 — DefiLlama ücretsiz makro likidite API
async function getJson(url, timeout=9000){
  const c=new AbortController(); const t=setTimeout(()=>c.abort(), timeout);
  try{const r=await fetch(url,{signal:c.signal,headers:{accept:'application/json','user-agent':'Omninomics/6.3 defillama'}}); const txt=await r.text(); let j; try{j=JSON.parse(txt)}catch{j=txt}; if(!r.ok)throw new Error(`HTTP ${r.status}: ${typeof j==='string'?j.slice(0,160):JSON.stringify(j).slice(0,160)}`); return j;} finally{clearTimeout(t)}
}
function n(v){v=Number(v);return Number.isFinite(v)?v:null}
module.exports=async function handler(req,res){
  const headers={'Access-Control-Allow-Origin':corsOrigin(req),'Vary':'Origin','Access-Control-Allow-Headers':'Content-Type','Access-Control-Allow-Methods':'GET, OPTIONS','Cache-Control':'public, max-age=600, s-maxage=600, stale-while-revalidate=1800','Content-Type':'application/json'};
  Object.entries(headers).forEach(([k,v])=>res.setHeader(k,v)); if((req.method||'GET')==='OPTIONS'){res.status(204).send('');return;}
  try{
    const [stables, dex, chains] = await Promise.allSettled([
      getJson('https://stablecoins.llama.fi/stablecoins?includePrices=true'),
      getJson('https://api.llama.fi/overview/dexs?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true'),
      getJson('https://api.llama.fi/v2/chains')
    ]);
    const coins = stables.status==='fulfilled' ? (stables.value?.peggedAssets||[]) : [];
    const pick = ['USDT','USDC','DAI','FDUSD','USDE'];
    const stablecoin = coins.filter(x=>pick.includes(String(x.symbol||'').toUpperCase())).map(x=>({symbol:x.symbol,name:x.name,circulating:n(x.circulating?.peggedUSD ?? x.circulating),price:n(x.price)}));
    const stablecoinSupplyUsd = stablecoin.reduce((s,x)=>s+(n(x.circulating)||0),0);
    const dexVolume24h = dex.status==='fulfilled' ? n(dex.value?.total24h) : null;
    const tvl = chains.status==='fulfilled' ? (chains.value||[]).reduce((s,x)=>s+(n(x.tvl)||0),0) : null;
    res.status(200).send(JSON.stringify({ok:true,source:'DefiLlama Free',stablecoin,stablecoinSupplyUsd,dexVolume24h,totalTvlUsd:tvl,updatedAt:Date.now()}));
  }catch(e){res.status(502).send(JSON.stringify({ok:false,error:e.message||String(e),source:'DefiLlama ERROR',updatedAt:Date.now()}));}
}

  return module.exports;
})();

// ---- feargreed bundled from handler_feargreed.js ----
HANDLERS['feargreed'] = (() => {
  const module = { exports: {} };
  const exports = module.exports;

function corsOrigin(req){const origin=req&&req.headers?String(req.headers.origin||''):'';const extra=String(process.env.ALLOWED_ORIGINS||'').split(',').map(x=>x.trim()).filter(Boolean);const ok=!origin||/^https:\/\/.*\.vercel\.app$/.test(origin)||/^https:\/\/.*omninomics\.(com|app)$/.test(origin)||/^http:\/\/localhost:\d+$/.test(origin)||extra.includes(origin);return ok?(origin||'*'):'null'}
module.exports=async function handler(req,res){res.setHeader('Access-Control-Allow-Origin',corsOrigin(req));res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Methods','GET, OPTIONS');res.setHeader('Cache-Control','public, max-age=900, s-maxage=900, stale-while-revalidate=1800');res.setHeader('Content-Type','application/json');if((req.method||'GET')==='OPTIONS'){res.status(204).send('');return}try{const c=new AbortController(),t=setTimeout(()=>c.abort(),6000);const r=await fetch('https://api.alternative.me/fng/?limit=1&format=json',{signal:c.signal,headers:{accept:'application/json','user-agent':'Omninomics/6.6 fng'}});clearTimeout(t);const j=await r.json();const d=j?.data?.[0]||{};res.status(200).send(JSON.stringify({ok:true,source:'Alternative.me Fear&Greed',value:Number(d.value),classification:d.value_classification,timestamp:Number(d.timestamp)*1000,updatedAt:Date.now()}))}catch(e){res.status(502).send(JSON.stringify({ok:false,error:e.message||String(e),source:'FearGreed ERROR'}))}}

  return module.exports;
})();

// ---- funding-history bundled from handler_funding-history.js ----
HANDLERS['funding-history'] = (() => {
  const module = { exports: {} };
  const exports = module.exports;
function cleanSymbol(v){
  return String(v||'BTCUSDT').toUpperCase().replace(/[^A-Z0-9]/g,'').replace(/USD$/,'USDT').slice(0,20)||'BTCUSDT';
}
function baseFromSymbol(sym){
  return String(sym||'BTCUSDT').toUpperCase().replace(/USDT$/,'').replace(/USD$/,'') || 'BTC';
}
function okxInstId(sym){
  return `${baseFromSymbol(sym)}-USDT-SWAP`;
}
function asNumber(v, fallback = null){
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function stats(vals){
  vals=(vals||[]).map(Number).filter(Number.isFinite);
  const mean=vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:0;
  const std=vals.length?Math.sqrt(vals.reduce((a,b)=>a+(b-mean)**2,0)/vals.length):0;
  const last=vals.at(-1)??0;
  return {last,mean,std,z:std?(last-mean)/std:0,history:vals};
}
async function getJson(url, label){
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), 5200) : null;
  try{
    const r=await fetch(url,{headers:{'user-agent':'rux-terminal-v091'},signal:controller?.signal});
    const text=await r.text();
    let j=null;
    try{j=JSON.parse(text)}catch{j=null}
    if(!r.ok){
      const msg=j?.msg||j?.retMsg||j?.message||text.slice(0,220)||('HTTP '+r.status);
      throw new Error(`${label}: ${msg}`);
    }
    return j;
  }finally{
    if(timer) clearTimeout(timer);
  }
}
function normalizeResult({symbol, source, rows, raw, fallbackChain}){
  const cleanRows=(rows||[])
    .map(x=>({
      time: asNumber(x.time ?? x.fundingTime ?? x.fundingRateTimestamp ?? x.ts, null),
      fundingRate: asNumber(x.fundingRate ?? x.rate ?? x.value, null)
    }))
    .filter(x=>Number.isFinite(x.fundingRate))
    .sort((a,b)=>(a.time||0)-(b.time||0));
  const vals=cleanRows.map(x=>x.fundingRate*100);
  const s=stats(vals);
  return {
    ok:true,
    symbol,
    source,
    mode:'fallback-safe-v0.10',
    ...s,
    raw: raw || cleanRows.slice(-100),
    rows: cleanRows.slice(-100),
    fallbackChain,
    updatedAt:Date.now()
  };
}
async function fetchBinance(sym,limit){
  const url=`https://fapi.binance.com/fapi/v1/fundingRate?symbol=${sym}&limit=${limit}`;
  const j=await getJson(url,'Binance Futures Funding');
  if(!Array.isArray(j)) throw new Error('Binance Futures Funding: beklenen liste formatı gelmedi');
  return normalizeResult({
    symbol:sym,
    source:'Binance Futures Funding',
    rows:j.map(x=>({time:x.fundingTime,fundingRate:x.fundingRate})),
    raw:j.slice(-limit),
    fallbackChain:['binance']
  });
}
async function fetchBybit(sym,limit){
  const url=`https://api.bybit.com/v5/market/funding/history?category=linear&symbol=${sym}&limit=${Math.min(limit,200)}`;
  const j=await getJson(url,'Bybit Funding History');
  const list=j?.result?.list;
  if(String(j?.retCode ?? '0') !== '0') throw new Error(`Bybit Funding History: ${j?.retMsg||'retCode '+j?.retCode}`);
  if(!Array.isArray(list)) throw new Error('Bybit Funding History: beklenen liste formatı gelmedi');
  return normalizeResult({
    symbol:sym,
    source:'Bybit Funding History',
    rows:list.map(x=>({time:x.fundingRateTimestamp,fundingRate:x.fundingRate})),
    raw:list.slice(-limit),
    fallbackChain:['binance','bybit']
  });
}
async function fetchOkx(sym,limit){
  const instId=okxInstId(sym);
  const url=`https://www.okx.com/api/v5/public/funding-rate-history?instId=${encodeURIComponent(instId)}&limit=${Math.min(limit,100)}`;
  const j=await getJson(url,'OKX Funding History');
  if(String(j?.code ?? '0') !== '0') throw new Error(`OKX Funding History: ${j?.msg||'code '+j?.code}`);
  const list=j?.data;
  if(!Array.isArray(list)) throw new Error('OKX Funding History: beklenen liste formatı gelmedi');
  return normalizeResult({
    symbol:sym,
    source:'OKX Funding History',
    rows:list.map(x=>({time:x.fundingTime,fundingRate:x.fundingRate})),
    raw:list.slice(-limit),
    fallbackChain:['binance','bybit','okx']
  });
}
async function fetchHyperliquidCurrent(sym){
  const coin=baseFromSymbol(sym);
  const j=await getJson('https://api.hyperliquid.xyz/info','Hyperliquid Meta');
  // Some runtimes disallow POST-less Hyperliquid info calls. This fallback is intentionally optional.
  if(!j) throw new Error('Hyperliquid Meta: veri yok');
  throw new Error('Hyperliquid Funding: tarihsel endpoint bu sürümde devre dışı');
}
async function fetchFunding(sym,limit){
  const errors=[];
  for(const fn of [fetchBinance, fetchBybit, fetchOkx]){
    try{
      const out=await fn(sym,limit);
      out.errors = errors;
      return out;
    }catch(e){
      errors.push(e?.message || String(e));
    }
  }
  try{
    const out=await fetchHyperliquidCurrent(sym);
    out.errors = errors;
    return out;
  }catch(e){
    errors.push(e?.message || String(e));
  }
  return {ok:false,symbol:sym,error:'Funding verisi alınamadı. Fallback kaynakları da başarısız oldu.',errors,source:'Funding Fallback ERROR',updatedAt:Date.now(),last:null,mean:null,std:null,z:null,history:[]};
}
async function mapLimit(list,limit,fn){
  const out=new Array(list.length);let i=0;
  async function worker(){while(i<list.length){const idx=i++;try{out[idx]=await fn(list[idx])}catch(e){out[idx]={ok:false,symbol:list[idx],error:e.message||String(e)}}}}
  await Promise.all(Array.from({length:Math.min(limit,list.length)},worker));
  return out;
}
module.exports=async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type,x-rux-data-mode,x-rux-preferred-exchange');
  if((req.method||'GET')==='OPTIONS'){res.status(204).send('');return}
  try{
    const raw=String(req.query?.symbols||req.query?.symbol||'BTCUSDT');
    const symbols=[...new Set(raw.split(',').map(cleanSymbol).filter(Boolean))].slice(0,60);
    const limit=Math.max(20,Math.min(100,Number(req.query?.limit||100)));
    const rows=await mapLimit(symbols,6,s=>fetchFunding(s,limit));
    const okRows=rows.filter(x=>x && x.ok && !x.error);
    const failedRows=rows.filter(x=>!x?.ok || x?.error);
    const extremes=[...okRows].sort((a,b)=>Math.abs(b.z||0)-Math.abs(a.z||0)).slice(0,15);
    const breadth={positive:okRows.filter(x=>x.last>0).length,negative:okRows.filter(x=>x.last<0).length,extremePositive:okRows.filter(x=>x.z>1.5).length,extremeNegative:okRows.filter(x=>x.z<-1.5).length,count:okRows.length,failed:failedRows.length};
    res.setHeader('Cache-Control','public, max-age=300, s-maxage=300, stale-while-revalidate=600');
    if(symbols.length===1){
      const one=rows[0];
      if(one?.ok) res.status(200).json(one);
      else res.status(502).json(one || {ok:false,error:'Funding verisi alınamadı'});
      return;
    }
    res.status(okRows.length?200:502).json({ok:!!okRows.length,source:'Funding Multi-Source',mode:'fallback-safe-v0.10',limit,rows,extremes,breadth,failedRows,updatedAt:Date.now()});
  }catch(e){res.status(502).json({ok:false,error:e.message||String(e),source:'Funding Fallback ERROR',updatedAt:Date.now()})}
}

  return module.exports;
})();

// ---- futures bundled from handler_futures.js ----
HANDLERS['futures'] = (() => {
  const module = { exports: {} };
  const exports = module.exports;

function corsOrigin(req){const origin=req&&req.headers?String(req.headers.origin||''):'';const extra=String(process.env.ALLOWED_ORIGINS||'').split(',').map(x=>x.trim()).filter(Boolean);const ok=!origin||/^https:\/\/.*\.vercel\.app$/.test(origin)||/^https:\/\/.*omninomics\.(com|app)$/.test(origin)||/^http:\/\/localhost:\d+$/.test(origin)||extra.includes(origin);return ok?(origin||'*'):'null'}
function headers(req){return {'Access-Control-Allow-Origin':corsOrigin(req),'Vary':'Origin','Access-Control-Allow-Headers':'Content-Type','Access-Control-Allow-Methods':'GET, OPTIONS','Cache-Control':'public, max-age=20, s-maxage=20, stale-while-revalidate=40','Content-Type':'application/json'}}
const BASES=['https://fapi.binance.com','https://fapi1.binance.com','https://fapi2.binance.com','https://fapi3.binance.com'];
function clean(s){return String(s||'BTCUSDT').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,20)||'BTCUSDT'}
async function j(url,ms=5000){const c=new AbortController(),t=setTimeout(()=>c.abort(),ms);try{const r=await fetch(url,{signal:c.signal,headers:{accept:'application/json','user-agent':'Omninomics/6.6 futures'}});const tx=await r.text();let o;try{o=JSON.parse(tx)}catch{o=tx}if(!r.ok)throw new Error(`HTTP ${r.status}: ${typeof o==='string'?o.slice(0,120):JSON.stringify(o).slice(0,120)}`);return o}finally{clearTimeout(t)}}
async function any(path){return Promise.any(BASES.map(b=>j(b+path)))}
module.exports=async function handler(req,res){const h=headers(req);Object.entries(h).forEach(([k,v])=>res.setHeader(k,v));if((req.method||'GET')==='OPTIONS'){res.status(204).send('');return}try{const symbol=clean(req.query.symbol);const [premium,oi,ls,topAcc,topPos]=await Promise.allSettled([any(`/fapi/v1/premiumIndex?symbol=${symbol}`),any(`/fapi/v1/openInterest?symbol=${symbol}`),any(`/futures/data/globalLongShortAccountRatio?symbol=${symbol}&period=5m&limit=30`),any(`/futures/data/topLongShortAccountRatio?symbol=${symbol}&period=5m&limit=30`),any(`/futures/data/topLongShortPositionRatio?symbol=${symbol}&period=5m&limit=30`)]);const last=a=>a.status==='fulfilled'&&Array.isArray(a.value)?a.value.at(-1):null;res.status(200).send(JSON.stringify({ok:true,source:'Binance Futures Free',symbol,updatedAt:Date.now(),fundingRate:premium.status==='fulfilled'?Number(premium.value.lastFundingRate):null,markPrice:premium.status==='fulfilled'?Number(premium.value.markPrice):null,openInterest:oi.status==='fulfilled'?Number(oi.value.openInterest):null,globalLongShortRatio:last(ls)?Number(last(ls).longShortRatio):null,topTraderAccountRatio:last(topAcc)?Number(last(topAcc).longShortRatio):null,topTraderPositionRatio:last(topPos)?Number(last(topPos).longShortRatio):null,raw:{premium:premium.status==='fulfilled',oi:oi.status==='fulfilled',ls:ls.status==='fulfilled',topAcc:topAcc.status==='fulfilled',topPos:topPos.status==='fulfilled'}}))}catch(e){res.status(502).send(JSON.stringify({ok:false,error:e.message||String(e),source:'Binance Futures ERROR'}))}}

  return module.exports;
})();

// ---- hyperliquid bundled from handler_hyperliquid.js ----
HANDLERS['hyperliquid'] = (() => {
  const module = { exports: {} };
  const exports = module.exports;

function corsOrigin(req){
  const origin = req && req.headers ? String(req.headers.origin || '') : '';
  const extra = String(process.env.ALLOWED_ORIGINS || '').split(',').map(x=>x.trim()).filter(Boolean);
  const ok = !origin || /^https:\/\/.*\.vercel\.app$/.test(origin) || /^https:\/\/.*omninomics\.(com|app)$/.test(origin) || /^http:\/\/localhost:\d+$/.test(origin) || extra.includes(origin);
  return ok ? (origin || '*') : 'null';
}

// RUx — Hyperliquid türev veri doğrulama katmanı
// Public info endpoint: metaAndAssetCtxs, fundingHistory, predictedFundings, l2Book, clearinghouseState.
const HL_INFO = 'https://api.hyperliquid.xyz/info';
const DEFAULT_TIMEOUT = 9500;

function n(v, d = null){ const x = Number(v); return Number.isFinite(x) ? x : d; }
function round(v, d = 6){ const x = n(v, 0); const p = Math.pow(10, d); return Math.round(x * p) / p; }
function clamp(v, a=0, b=100){ return Math.max(a, Math.min(b, Number(v)||0)); }
function cleanCoin(v){
  return String(v || 'BTC').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/USDT$/,'').replace(/USD$/,'') || 'BTC';
}
function symbolFromCoin(coin){ return `${cleanCoin(coin)}USDT`; }
function pct(v){ return round(n(v,0) * 100, 5); }

async function postInfo(body, timeout = DEFAULT_TIMEOUT){
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try{
    const r = await fetch(HL_INFO, {
      method: 'POST', signal: ctrl.signal,
      headers: { 'content-type':'application/json', 'accept':'application/json', 'user-agent':'RUx/0.10 Hyperliquid Derivatives Layer' },
      body: JSON.stringify(body || {})
    });
    const text = await r.text();
    let j; try{ j = JSON.parse(text); }catch{ j = text; }
    if(!r.ok){
      const msg = typeof j === 'string' ? j.slice(0, 180) : JSON.stringify(j).slice(0, 180);
      throw new Error(`Hyperliquid HTTP ${r.status}: ${msg}`);
    }
    return j;
  } finally { clearTimeout(t); }
}

function liquidityScore({ vol, oi, impactSpreadPct }){
  let s = 45;
  if(vol > 5e9) s += 30; else if(vol > 1e9) s += 24; else if(vol > 2e8) s += 16; else if(vol > 5e7) s += 9; else s -= 6;
  if(oi > 1e9) s += 16; else if(oi > 2e8) s += 10; else if(oi > 5e7) s += 4;
  if(impactSpreadPct !== null && impactSpreadPct !== undefined){
    if(impactSpreadPct < 0.03) s += 12;
    else if(impactSpreadPct < 0.10) s += 6;
    else if(impactSpreadPct > 0.35) s -= 18;
    else if(impactSpreadPct > 0.20) s -= 10;
  }
  return Math.round(clamp(s));
}

function crowdingScore({ funding, premiumPct, oi, vol }){
  let score = 0;
  const f = n(funding, 0), p = n(premiumPct, 0);
  if(f > 0.001) score += 35; else if(f > 0.0005) score += 24; else if(f > 0.00025) score += 12;
  if(f < -0.001) score -= 35; else if(f < -0.0005) score -= 24; else if(f < -0.00025) score -= 12;
  if(p > 0.20) score += 18; else if(p > 0.08) score += 8;
  if(p < -0.20) score -= 18; else if(p < -0.08) score -= 8;
  const activity = vol && oi ? Math.min(20, Math.log10(Math.max(1, vol + oi)) * 2 - 8) : 0;
  score += Math.sign(score) * Math.max(0, activity);
  const abs = Math.abs(score);
  const bias = score > 20 ? 'LONG_CROWDING' : score < -20 ? 'SHORT_CROWDING' : 'NEUTRAL';
  const hint = bias === 'LONG_CROWDING' ? 'Long kalabalık: long sinyallerde ceza, short/reversal teyidi.' : bias === 'SHORT_CROWDING' ? 'Short kalabalık: short sinyallerde ceza, long squeeze teyidi.' : 'Nötr funding/premium.';
  return { score: Math.round(clamp(abs)), bias, hint };
}

function normalizeMetaAndCtxs(payload){
  const meta = Array.isArray(payload) ? payload[0] : payload?.meta;
  const ctxs = Array.isArray(payload) ? payload[1] : payload?.assetCtxs;
  const universe = Array.isArray(meta?.universe) ? meta.universe : [];
  const rows = universe.map((u, i) => {
    const c = (ctxs || [])[i] || {};
    const coin = cleanCoin(u.name || c.coin || c.name);
    const mark = n(c.markPx ?? c.markPrice ?? c.midPx ?? c.oraclePx, null);
    const mid = n(c.midPx ?? c.markPx ?? c.oraclePx, mark);
    const oracle = n(c.oraclePx ?? c.oraclePrice, mark);
    const funding = n(c.funding ?? c.fundingRate, 0);
    const oi = n(c.openInterest ?? c.oi, 0);
    const vol = n(c.dayNtlVlm ?? c.dayBaseVlm ?? c.volume24h ?? c.dayVolume, 0);
    const impact = Array.isArray(c.impactPxs) ? c.impactPxs.map(x => n(x, null)) : [];
    const impactBid = impact[0], impactAsk = impact[1];
    const impactSpreadPct = mark && impactBid && impactAsk ? Math.abs(impactAsk - impactBid) / mark * 100 : null;
    const premiumPct = mark && oracle ? (mark - oracle) / oracle * 100 : n(c.premium, 0) * 100;
    const liqScore = liquidityScore({ vol, oi, impactSpreadPct });
    const crowding = crowdingScore({ funding, premiumPct, oi, vol });
    return {
      coin, symbol: symbolFromCoin(coin), name: u.name || coin,
      szDecimals: n(u.szDecimals, null), maxLeverage: n(u.maxLeverage, null),
      markPrice: mark, midPrice: mid, oraclePrice: oracle,
      fundingRate: funding, fundingRatePct: pct(funding), openInterest: oi, dayVolumeUsd: vol,
      premiumPct: round(premiumPct || 0, 4), impactBid, impactAsk,
      impactSpreadPct: impactSpreadPct === null ? null : round(impactSpreadPct, 5),
      liquidityScore: liqScore, crowdingScore: crowding.score, crowdingBias: crowding.bias, decisionHint: crowding.hint
    };
  }).filter(x => x.coin && (x.markPrice || x.openInterest || x.dayVolumeUsd));
  return rows;
}

function normalizeL2Book(book, mark){
  const raw = book?.levels || book?.data?.levels || [];
  const bids = (raw[0] || []).map(x => ({ px: n(x.px ?? x[0], null), sz: n(x.sz ?? x[1], null), n: n(x.n ?? x[2], null) })).filter(x => x.px && x.sz);
  const asks = (raw[1] || []).map(x => ({ px: n(x.px ?? x[0], null), sz: n(x.sz ?? x[1], null), n: n(x.n ?? x[2], null) })).filter(x => x.px && x.sz);
  const bestBid = bids[0]?.px || null, bestAsk = asks[0]?.px || null;
  const mid = mark || (bestBid && bestAsk ? (bestBid + bestAsk) / 2 : null);
  const spreadBps = mid && bestBid && bestAsk ? (bestAsk - bestBid) / mid * 10000 : null;
  const bidUsd = bids.slice(0, 20).reduce((s, x) => s + x.px * x.sz, 0);
  const askUsd = asks.slice(0, 20).reduce((s, x) => s + x.px * x.sz, 0);
  const total = bidUsd + askUsd || 1;
  return { bids, asks, bestBid, bestAsk, spreadBps: spreadBps === null ? null : round(spreadBps, 3), bidUsd: round(bidUsd, 0), askUsd: round(askUsd, 0), imbalance: round((bidUsd - askUsd) / total, 4) };
}

function avg(arr){ const xs=(arr||[]).filter(Number.isFinite); return xs.length ? xs.reduce((a,b)=>a+b,0)/xs.length : null; }
function stdev(arr){ const xs=(arr||[]).filter(Number.isFinite); const m=avg(xs); if(m===null || xs.length<2) return null; return Math.sqrt(xs.reduce((s,x)=>s+(x-m)*(x-m),0)/(xs.length-1)); }
function fundingStats(history){
  const rows = Array.isArray(history) ? history : [];
  const vals = rows.map(x => n(x.fundingRate ?? x.funding ?? x.rate, null)).filter(Number.isFinite);
  const last = vals.at(-1) ?? null, mean = avg(vals), sd = stdev(vals);
  return {
    samples: vals.length,
    lastFundingRate: last,
    lastFundingPct: last === null ? null : round(last * 100, 5),
    avgFundingPct: mean === null ? null : round(mean * 100, 5),
    fundingZ: sd && last !== null && mean !== null ? round((last - mean) / sd, 2) : 0,
    fundingTrendPct: vals.length >= 4 ? round((vals.at(-1) - vals.at(-4)) * 100, 5) : 0,
    recent: rows.slice(-12).map(x => ({ time: n(x.time ?? x.timestamp ?? x.t, null), fundingRate: n(x.fundingRate ?? x.funding ?? x.rate, null), premium: n(x.premium, null) })).filter(x => x.time)
  };
}

function normalizePredictedFundings(raw, coin){
  // Hyperliquid response is venue-oriented and can change shape. Keep parser defensive.
  const target = cleanCoin(coin);
  const out = [];
  const walk = (node, venueHint='') => {
    if(!node) return;
    if(Array.isArray(node)){
      // common pattern: [coin, [[venue, {fundingRate}], ...]]
      if(typeof node[0] === 'string' && cleanCoin(node[0]) === target){
        const rest = node.slice(1).flat(2);
        for(const item of rest){
          if(Array.isArray(item) && typeof item[0] === 'string') out.push({ venue: item[0], fundingRate: n(item[1]?.fundingRate ?? item[1]?.funding ?? item[1], null) });
          else if(item && typeof item === 'object') out.push({ venue: item.venue || item.exchange || venueHint || 'unknown', fundingRate: n(item.fundingRate ?? item.funding, null) });
        }
      } else node.forEach(x => walk(x, venueHint));
    } else if(typeof node === 'object'){
      const c = cleanCoin(node.coin || node.name || node.symbol || '');
      if(!c || c === target){
        const rate = n(node.fundingRate ?? node.funding ?? node.predictedFundingRate ?? node.rate, null);
        if(rate !== null) out.push({ venue: node.venue || node.exchange || venueHint || 'Hyperliquid', fundingRate: rate });
      }
      Object.values(node).forEach(v => { if(v && typeof v === 'object') walk(v, node.venue || node.exchange || venueHint); });
    }
  };
  walk(raw);
  const dedup = [];
  const seen = new Set();
  out.forEach(x => { const key=(x.venue||'')+':' + x.fundingRate; if(x.fundingRate !== null && !seen.has(key)){ seen.add(key); dedup.push({ venue: x.venue || 'unknown', fundingRate: x.fundingRate, fundingPct: round(x.fundingRate * 100, 5) }); } });
  return dedup.slice(0, 12);
}

function derivativesDecision(row, funding, l2, predicted){
  let score = 70;
  const notes = [];
  const f = n(row?.fundingRate, 0);
  const fz = n(funding?.fundingZ, 0);
  const spread = n(l2?.spreadBps, null);
  const crowd = n(row?.crowdingScore, 0);
  if(row?.liquidityScore >= 75) { score += 8; notes.push('Hyperliquid likidite güçlü.'); }
  if(row?.liquidityScore < 55) { score -= 12; notes.push('Likidite skoru düşük; sinyal güveni azaltılmalı.'); }
  if(Math.abs(f) > 0.0005) { score -= 8; notes.push('Funding belirgin; kalabalık taraf filtresi aktif.'); }
  if(Math.abs(fz) >= 2) { score -= 10; notes.push('Funding z-score uç bölgede.'); }
  if(spread !== null && spread > 8) { score -= 10; notes.push('L2 spread geniş; execution riski var.'); }
  if(crowd >= 60) { score -= 6; notes.push(row?.crowdingBias === 'LONG_CROWDING' ? 'Long kalabalık riski.' : 'Short kalabalık / squeeze riski.'); }
  if(Array.isArray(predicted) && predicted.length >= 2){
    const vals = predicted.map(x=>x.fundingRate).filter(Number.isFinite);
    const dispersion = stdev(vals);
    if(dispersion && dispersion > 0.00035){ score -= 5; notes.push('Venue funding ayrışması yüksek.'); }
  }
  const action = score >= 75 ? 'CONFIRMATION_OK' : score >= 58 ? 'CAUTION' : 'SIZE_DOWN';
  return { score: Math.round(clamp(score)), action, notes: notes.slice(0, 8) };
}

async function getOverview(limit = 120){
  const raw = await postInfo({ type: 'metaAndAssetCtxs' });
  const rows = normalizeMetaAndCtxs(raw).sort((a,b)=>(b.openInterest||0)-(a.openInterest||0)).slice(0, Math.max(1, Math.min(250, Number(limit)||120)));
  const totals = rows.reduce((s,x)=>{ s.openInterest += n(x.openInterest,0); s.dayVolumeUsd += n(x.dayVolumeUsd,0); if(x.crowdingBias==='LONG_CROWDING') s.longCrowded++; if(x.crowdingBias==='SHORT_CROWDING') s.shortCrowded++; return s; }, { openInterest:0, dayVolumeUsd:0, longCrowded:0, shortCrowded:0 });
  Object.keys(totals).forEach(k => totals[k] = round(totals[k], 2));
  return { ok:true, mode:'overview', source:'Hyperliquid Public API', rows, totals, updatedAt:Date.now() };
}

async function getSymbol(symbol){
  const coin = cleanCoin(symbol);
  const overview = await getOverview(250);
  const row = overview.rows.find(x => x.coin === coin) || null;
  let l2 = null, l2Error = null;
  try{ l2 = normalizeL2Book(await postInfo({ type:'l2Book', coin }, 7000), row?.markPrice); }
  catch(e){ l2Error = e.message || String(e); }
  return { ok:true, mode:'symbol', source:'Hyperliquid Public API', symbol:symbolFromCoin(coin), coin, row, l2, l2Error, updatedAt:Date.now() };
}

async function getDerivatives(symbol){
  const coin = cleanCoin(symbol);
  const base = await getSymbol(coin);
  const now = Date.now();
  const startTime = now - 8 * 24 * 60 * 60 * 1000;
  let history = [], fundingError = null, predicted = [], predictedError = null;
  try{ history = await postInfo({ type:'fundingHistory', coin, startTime, endTime: now }, 8000); }
  catch(e){ fundingError = e.message || String(e); }
  try{ predicted = normalizePredictedFundings(await postInfo({ type:'predictedFundings' }, 8500), coin); }
  catch(e){ predictedError = e.message || String(e); }
  const funding = fundingStats(history);
  const decision = derivativesDecision(base.row, funding, base.l2, predicted);
  return { ok:true, mode:'derivatives', source:'Hyperliquid Derivatives Context', symbol:symbolFromCoin(coin), coin, row:base.row, l2:base.l2, funding, predictedFundings:predicted, decision, errors:{ l2:base.l2Error, funding:fundingError, predicted:predictedError }, updatedAt:Date.now() };
}

function normalizeUserState(user, j){
  const positions = (j?.assetPositions || []).map(p => {
    const pos = p.position || p;
    const coin = cleanCoin(pos.coin || p.coin);
    const szi = n(pos.szi ?? pos.size, 0);
    const mark = n(pos.markPx ?? pos.entryPx ?? pos.positionValue, 0);
    const value = Math.abs(n(pos.positionValue, 0) || (mark ? szi * mark : 0));
    return { coin, symbol:symbolFromCoin(coin), side:szi>0?'LONG':szi<0?'SHORT':'FLAT', size:szi, entryPx:n(pos.entryPx,null), leverage:n(pos.leverage?.value ?? pos.leverage,null), liquidationPx:n(pos.liquidationPx,null), unrealizedPnl:n(pos.unrealizedPnl,null), positionValue:round(value,2) };
  }).filter(x => x.side !== 'FLAT');
  const longUsd = positions.filter(x=>x.side==='LONG').reduce((s,x)=>s+x.positionValue,0);
  const shortUsd = positions.filter(x=>x.side==='SHORT').reduce((s,x)=>s+x.positionValue,0);
  return { user, accountValue:n(j?.marginSummary?.accountValue ?? j?.crossMarginSummary?.accountValue,null), totalNtlPos:n(j?.marginSummary?.totalNtlPos ?? j?.crossMarginSummary?.totalNtlPos,null), longUsd:round(longUsd,2), shortUsd:round(shortUsd,2), netUsd:round(longUsd-shortUsd,2), positions };
}

async function getWhales(users){
  const list = String(users || '').split(/[,\n\s]+/).map(x=>x.trim()).filter(x=>/^0x[a-fA-F0-9]{40}$/.test(x)).slice(0, 12);
  if(!list.length) return { ok:true, mode:'whale', source:'Hyperliquid Public API', wallets:[], totals:{longUsd:0, shortUsd:0, netUsd:0}, updatedAt:Date.now(), warning:'Cüzdan adresi girilmedi.' };
  const results = await Promise.allSettled(list.map(async user => normalizeUserState(user, await postInfo({ type:'clearinghouseState', user }, 9000))));
  const wallets = results.map((r,i)=>r.status==='fulfilled' ? r.value : { user:list[i], error:r.reason?.message || String(r.reason), positions:[] });
  const totals = wallets.reduce((s,w)=>{ s.longUsd += n(w.longUsd,0); s.shortUsd += n(w.shortUsd,0); s.netUsd += n(w.netUsd,0); return s; }, { longUsd:0, shortUsd:0, netUsd:0 });
  Object.keys(totals).forEach(k => totals[k] = round(totals[k], 2));
  return { ok:true, mode:'whale', source:'Hyperliquid Public API', wallets, totals, updatedAt:Date.now() };
}


// RUx backend (version: see rux_version.js) — Dune opsiyonel on-chain intelligence, Hyperliquid endpoint içine konsolide edildi.
// Amaç: Vercel Hobby planındaki 12 Serverless Function limitini aşmadan Dune slotlarını korumak.
const DUNE_BASE = 'https://api.dune.com/api/v1';
function pickHeader(req, name){
  const h = req.headers || {};
  const low = name.toLowerCase();
  return h[name] || h[low] || h[low.replace(/-/g,'_')] || '';
}
function cleanDuneId(v){ return String(v || '').trim().replace(/[^0-9]/g, '').slice(0, 24); }
function cleanDuneSlot(v){ return String(v || 'default').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40) || 'default'; }
function queryIdForDuneSlot(req, slot){
  const q = req.query || {};
  const env = process.env || {};
  const direct = cleanDuneId(q.queryId || q.query_id || pickHeader(req, 'x-rux-dune-query-id'));
  if(direct) return direct;
  const keyMap = {
    stablecoin: ['x-rux-dune-stablecoin-query-id', 'DUNE_STABLECOIN_QUERY_ID'],
    exchange_flow: ['x-rux-dune-exchange-flow-query-id', 'DUNE_EXCHANGE_FLOW_QUERY_ID'],
    exchangeflow: ['x-rux-dune-exchange-flow-query-id', 'DUNE_EXCHANGE_FLOW_QUERY_ID'],
    whale: ['x-rux-dune-whale-query-id', 'DUNE_WHALE_QUERY_ID'],
    default: ['x-rux-dune-query-id', 'DUNE_DEFAULT_QUERY_ID']
  };
  const pair = keyMap[slot] || keyMap.default;
  return cleanDuneId(pickHeader(req, pair[0]) || env[pair[1]] || env.DUNE_DEFAULT_QUERY_ID);
}
function duneAuthKey(req){
  return String(pickHeader(req, 'x-dune-api-key') || pickHeader(req, 'x-omni-dune-key') || process.env.DUNE_API_KEY || '').trim();
}
async function getDuneJson(url, apiKey, timeout=9500){
  const ctrl = new AbortController(); const t = setTimeout(()=>ctrl.abort(), timeout);
  try{
    const r = await fetch(url, { signal: ctrl.signal, headers: { accept:'application/json', 'X-Dune-API-Key': apiKey, 'user-agent':'RUx/0.10.3 Dune Intelligence' } });
    const text = await r.text(); let j; try{ j=JSON.parse(text); }catch{ j=text; }
    if(!r.ok){
      const msg = typeof j === 'string' ? j.slice(0,180) : JSON.stringify(j).slice(0,180);
      throw new Error(`Dune HTTP ${r.status}: ${msg}`);
    }
    return j;
  } finally { clearTimeout(t); }
}
function rowsFromDune(j){
  const rows = j?.result?.rows || j?.rows || j?.data?.result?.rows || [];
  return Array.isArray(rows) ? rows : [];
}
function summarizeDuneRows(rows){
  const cols = rows.length ? Object.keys(rows[0]).slice(0, 12) : [];
  const numericCols = cols.filter(k => rows.some(r => Number.isFinite(Number(r[k]))));
  const sums = {};
  numericCols.slice(0, 8).forEach(k => { sums[k] = round(rows.reduce((sum,r)=>sum+(n(r[k],0)||0),0), 4); });
  const timeKeys = cols.filter(k => /time|date|day|hour|block/i.test(k));
  return { rowCount: rows.length, columns: cols, numericColumns: numericCols.slice(0, 12), sums, timeKeys };
}
function classifyDuneSlot(slot){
  if(slot.includes('stable')) return { category:'Stablecoin / Likidite', weight:'orta-yüksek', purpose:'Stablecoin arzı, mint/burn, likidite rejimi.' };
  if(slot.includes('exchange')) return { category:'Borsa Akışı', weight:'orta', purpose:'Exchange netflow, deposit/withdrawal ve risk akışı.' };
  if(slot.includes('whale')) return { category:'Whale / Cüzdan', weight:'orta', purpose:'Büyük cüzdan ve smart money hareketleri.' };
  return { category:'On-chain', weight:'opsiyonel', purpose:'Kullanıcı tanımlı Dune query sonucu.' };
}
async function getDuneIntelligence(req){
  const started = Date.now();
  try{
    const slot = cleanDuneSlot(req.query?.slot || 'default');
    const queryId = queryIdForDuneSlot(req, slot);
    const key = duneAuthKey(req);
    const limit = Math.max(1, Math.min(1000, Number(req.query?.limit) || 100));
    const meta = classifyDuneSlot(slot);
    if(!key || !queryId){
      return { ok:false, enabled:false, source:'Dune API', mode:'not-configured', slot, queryId: queryId || null, category:meta.category, message:'Dune API key veya Query ID tanımlı değil. Ayarlar ekranından Dune API Key ve query slotu girilmeli.', latencyMs:Date.now()-started, updatedAt:Date.now() };
    }
    const url = `${DUNE_BASE}/query/${encodeURIComponent(queryId)}/results?limit=${limit}&allow_partial_results=true`;
    const j = await getDuneJson(url, key);
    const rows = rowsFromDune(j);
    const summary = summarizeDuneRows(rows);
    return { ok:true, enabled:true, source:'Dune API', mode:'latest-query-result', slot, queryId, category:meta.category, weight:meta.weight, purpose:meta.purpose, executionId:j?.execution_id || j?.executionId || j?.result?.execution_id || null, state:j?.state || j?.result?.state || null, summary, rows: rows.slice(0, limit), latencyMs:Date.now()-started, updatedAt:Date.now() };
  } catch(e){
    return { ok:false, enabled:true, degraded:true, source:'Dune DEGRADED', mode:'safe-warning', error:e.message || String(e), message:'Dune query sonucu alınamadı. On-chain istihbarat geçici olarak pasif; ana terminal çalışmaya devam eder.', latencyMs:Date.now()-started, updatedAt:Date.now() };
  }
}

module.exports = async function handler(req, res){
  const headers = {
    'Access-Control-Allow-Origin': corsOrigin(req), 'Vary':'Origin',
    'Access-Control-Allow-Headers':'Content-Type, X-Dune-API-Key, X-RUX-Dune-Query-Id, X-RUX-Dune-Stablecoin-Query-Id, X-RUX-Dune-Exchange-Flow-Query-Id, X-RUX-Dune-Whale-Query-Id',
    'Access-Control-Allow-Methods':'GET, POST, OPTIONS',
    'Cache-Control':'public, max-age=20, s-maxage=20, stale-while-revalidate=60',
    'Content-Type':'application/json'
  };
  Object.entries(headers).forEach(([k,v])=>res.setHeader(k,v));
  if((req.method || 'GET') === 'OPTIONS') return res.status(204).send('');
  try{
    const q = req.query || {};
    let body = {};
    if(req.method === 'POST'){
      if(typeof req.body === 'string'){ try{ body = JSON.parse(req.body || '{}'); } catch{ body = {}; } }
      else body = req.body || {};
    }
    const mode = String(q.mode || body.mode || (q.symbol ? 'symbol' : 'overview')).toLowerCase();
    let out;
    if(mode === 'dune' || mode === 'onchain' || mode === 'on-chain') out = await getDuneIntelligence(req);
    else if(mode === 'symbol') out = await getSymbol(q.symbol || body.symbol || 'BTCUSDT');
    else if(mode === 'derivatives' || mode === 'context') out = await getDerivatives(q.symbol || body.symbol || 'BTCUSDT');
    else if(mode === 'whale') out = await getWhales(q.wallets || body.wallets || body.users || '');
    else out = await getOverview(q.limit || body.limit || 120);
    res.status(200).send(JSON.stringify(out));
  } catch(e){
    // Dış kaynak erişimi kısıtlanırsa terminali kırma; sağlık paneline kontrollü uyarı döndür.
    res.status(200).send(JSON.stringify({
      ok:false,
      degraded:true,
      source:'Hyperliquid DEGRADED',
      mode:'safe-warning',
      error:e.message || String(e),
      message:'Hyperliquid kaynağına erişilemedi. Terminal çalışmaya devam eder; türev teyit skoru düşük güvene alınır.',
      updatedAt:Date.now()
    }));
  }
};

  return module.exports;
})();

// ---- intel bundled from handler_intel.js ----
HANDLERS['intel'] = (() => {
  const module = { exports: {} };
  const exports = module.exports;

function corsOrigin(req){
  const origin = req && req.headers ? String(req.headers.origin || '') : '';
  const extra = String(process.env.ALLOWED_ORIGINS || '').split(',').map(x=>x.trim()).filter(Boolean);
  const ok = !origin || /^https:\/\/.*\.vercel\.app$/.test(origin) || /^https:\/\/.*omninomics\.(com|app)$/.test(origin) || /^http:\/\/localhost:\d+$/.test(origin) || extra.includes(origin);
  return ok ? (origin || '*') : 'null';
}
function setCorsHeaders(req,res,extra={}){
  const headers={
    'Access-Control-Allow-Origin':corsOrigin(req),
    'Vary':'Origin',
    'Access-Control-Allow-Headers':'Content-Type, x-omni-cmc-key, x-cmc-api-key, x-coinmarketcap-key, x-omni-cg-key, x-dune-api-key, x-omni-dune-key, x-rux-telegram-source',
    'Access-Control-Allow-Methods':'GET, POST, OPTIONS',
    ...extra
  };
  Object.entries(headers).forEach(([k,v])=>res.setHeader(k,v));
  if((req.method||'GET')==='OPTIONS'){res.status(204).send(''); return true;}
  return false;
}

// RUx backend (version: see rux_version.js) — Market Intelligence API / Data Health Stabilized

const BINANCE_F = ["https://fapi.binance.com","https://fapi1.binance.com","https://fapi2.binance.com","https://fapi3.binance.com"];

function cleanSymbol(s){ return String(s||"BTCUSDT").toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,20) || "BTCUSDT"; }
function baseAsset(symbol){ return symbol.replace(/USDT$|USD$|BUSD$|USDC$/,""); }
function num(x,d=6){ x=Number(x); return Number.isFinite(x)?+x.toFixed(d):null; }
function avg(a){ a=(a||[]).map(Number).filter(Number.isFinite); return a.length?a.reduce((s,x)=>s+x,0)/a.length:0; }
function stdev(a){ a=(a||[]).map(Number).filter(Number.isFinite); const m=avg(a); return a.length?Math.sqrt(avg(a.map(x=>(x-m)**2))):0; }
function pct(a,b){ a=Number(a); b=Number(b); return Number.isFinite(a)&&Number.isFinite(b)&&b!==0?(a-b)/b*100:null; }
function clamp(v,a=0,b=100){ v=Number(v); return Math.max(a,Math.min(b,Number.isFinite(v)?v:0)); }

async function fetchTimeout(url, ms=4200, opts={}){
  const ctl = new AbortController();
  const id = setTimeout(()=>ctl.abort(), ms);
  try{
    const r = await fetch(url, {
      ...opts,
      signal: ctl.signal,
      headers: {"user-agent":"RUx/0.45.0 (+vercel)","accept":"application/json,text/plain,*/*",...(opts.headers||{})}
    });
    const txt = await r.text();
    if(!r.ok) throw new Error(`${r.status} ${txt.slice(0,100)}`);
    try{ return JSON.parse(txt); }catch{ throw new Error(`Non-JSON response: ${txt.slice(0,80)}`); }
  }finally{ clearTimeout(id); }
}
async function firstOk(urls, errors){
  const results = await Promise.allSettled(urls.map(u=>fetchTimeout(u,3800)));
  for(const r of results) if(r.status==="fulfilled") return r.value;
  for(const r of results) errors.push(r.reason?.message || String(r.reason));
  return null;
}
async function safe(label, fn, fallback, errors){
  try{ return await fn(); }catch(e){ errors.push(`${label}: ${e.message||String(e)}`); return fallback; }
}
function deriveFundingStats(hist){
  hist = Array.isArray(hist)?hist:[];
  const vals = hist.map(x=>Number(x.fundingRate)*100).filter(Number.isFinite);
  const last = vals.at(-1), m = avg(vals), sd = stdev(vals);
  return {lastFundingRatePct:num(last,5), avgFundingPct:num(m,5), fundingZ:num(sd?(last-m)/sd:0,2), fundingTrendPct:num(vals.length>=4?last-vals.at(-4):0,5), samples:vals.length};
}
function deriveOiStats(hist,current){
  hist = Array.isArray(hist)?hist:[];
  const vals = hist.map(x=>Number(x.sumOpenInterest)).filter(Number.isFinite);
  const now = Number(current?.openInterest) || vals.at(-1) || null;
  return {openInterest:num(now,2), oi1hPct:num(vals.length>=2?pct(vals.at(-1),vals.at(-2)):null,2), oi4hPct:num(vals.length>=5?pct(vals.at(-1),vals.at(-5)):null,2), oi24hPct:num(vals.length>=24?pct(vals.at(-1),vals.at(-24)):null,2), samples:vals.length};
}
function derivativesRisk(f,oi){
  let score=50, flags=[], action="NEUTRAL", sizeScale=1;
  const fr=f.lastFundingRatePct, z=f.fundingZ, oi4=oi.oi4hPct, oi24=oi.oi24hPct;
  if(fr!=null && fr>0.05){score-=12; flags.push("Funding pozitif yüksek: long crowding riski"); sizeScale=Math.min(sizeScale,.7);}
  if(fr!=null && fr<-0.05){score-=6; flags.push("Funding negatif yüksek: short crowding / squeeze riski");}
  if(z!=null && z>2){score-=10; flags.push("Funding z-score aşırı pozitif"); sizeScale=Math.min(sizeScale,.65);}
  if(z!=null && z<-2){score-=4; flags.push("Funding z-score aşırı negatif; short kalabalığı olabilir");}
  if(oi4!=null && oi4>7){score-=8; flags.push("OI 4s hızlı artıyor: kaldıraç birikimi"); sizeScale=Math.min(sizeScale,.75);}
  if(oi24!=null && oi24>15){score-=8; flags.push("OI 24s hızlı artıyor: tasfiye riski yükseldi");}
  if(oi4!=null && oi4<-8){score-=3; flags.push("OI düşüyor: deleveraging / trend devam gücü zayıflayabilir");}
  score=clamp(score);
  if(score<38){action="SIZE_DOWN"; sizeScale=Math.min(sizeScale,.5);}
  else if(score<48){action="CAUTION"; sizeScale=Math.min(sizeScale,.75);}
  return {score, flags, action, sizeScale};
}
function classifyNews(text){
  text=String(text||"").toLowerCase();
  const hard=["hack","exploit","drain","stolen","delist","delisting","depeg","halt","suspended","rug pull","insolvent","bankrupt"];
  const risk=["lawsuit","sec","cftc","investigation","regulation","probe","sanction","outage","bridge","vulnerability"];
  const positive=["etf inflow","approved","approval","partnership","upgrade","mainnet","listing","institutional","adoption"];
  const hardHits=hard.filter(k=>text.includes(k)), riskHits=risk.filter(k=>text.includes(k)), posHits=positive.filter(k=>text.includes(k));
  return {hardHits,riskHits,posHits,score:-hardHits.length*35-riskHits.length*12+posHits.length*8};
}
async function gdeltNews(base){
  const q=encodeURIComponent(`(${base} OR ${base.toLowerCase()} OR ${base}USDT) (crypto OR cryptocurrency OR bitcoin OR blockchain)`);
  const url=`https://api.gdeltproject.org/api/v2/doc/doc?query=${q}&mode=ArtList&format=json&maxrecords=10&sort=DateDesc`;
  const j=await fetchTimeout(url,4200);
  return (j.articles||[]).slice(0,10).map(a=>({title:a.title||"",url:a.url||"",source:a.domain||a.sourceCountry||"GDELT",published:a.seendate||"",provider:"GDELT"}));
}
async function cryptoCompareNews(base){
  const url=`https://min-api.cryptocompare.com/data/v2/news/?lang=EN&categories=${encodeURIComponent(base)}`;
  const j=await fetchTimeout(url,4200);
  return (j.Data||[]).slice(0,10).map(a=>({title:a.title||"",url:a.url||"",source:a.source_info?.name||"CryptoCompare",published:a.published_on?new Date(a.published_on*1000).toISOString():"",provider:"CryptoCompare"}));
}
async function cryptoPanic(base,token){
  if(!token) return [];
  const url=`https://cryptopanic.com/api/v1/posts/?auth_token=${encodeURIComponent(token)}&currencies=${encodeURIComponent(base)}&kind=news&public=true`;
  const j=await fetchTimeout(url,4200);
  return (j.results||[]).slice(0,10).map(a=>({title:a.title||"",url:a.url||"",source:a.source?.title||"CryptoPanic",published:a.published_at||"",provider:"CryptoPanic",votes:a.votes||{}}));
}
async function redditSearch(base){
  const q=encodeURIComponent(`${base} crypto OR ${base}USDT`);
  const url=`https://www.reddit.com/search.json?q=${q}&sort=new&t=day&limit=10`;
  const j=await fetchTimeout(url,4200);
  return (j.data?.children||[]).map(x=>x.data||{}).slice(0,10).map(p=>({title:p.title||"",subreddit:p.subreddit||"",score:p.score||0,comments:p.num_comments||0,url:p.permalink?`https://reddit.com${p.permalink}`:""}));
}
function socialStats(items){
  const text=items.map(x=>x.title||"").join(" ").toLowerCase();
  const eup=["moon","100x","pump","lambo","send it","ath","breakout","ape"];
  const panic=["scam","crash","dump","rekt","rug","hack","exploit","dead"];
  const eupHits=eup.filter(k=>text.includes(k)).length, panicHits=panic.filter(k=>text.includes(k)).length;
  const attention=clamp((items.length*7)+items.reduce((s,x)=>s+Math.min(25,(x.score||0)/15+(x.comments||0)/5),0));
  return {attentionScore:num(attention,1), euphoriaScore:num(clamp(eupHits*18+attention*.25),1), panicScore:num(clamp(panicHits*22+attention*.18),1), mentions:items.length, eupHits, panicHits};
}
function buildOverlay(symbol, derivatives, news, social){
  let reasons=[], hardFlags=[], action="NEUTRAL", sizeScale=1, score=50;
  if(derivatives?.risk){
    score+=(derivatives.risk.score-50)*.45;
    reasons.push(...(derivatives.risk.flags||[]));
    sizeScale=Math.min(sizeScale,derivatives.risk.sizeScale||1);
    if(derivatives.risk.action==="SIZE_DOWN") action="SIZE_DOWN";
    else if(derivatives.risk.action==="CAUTION" && action==="NEUTRAL") action="CAUTION";
  }
  const nc=(news.items||[]).map(n=>classifyNews(`${n.title} ${n.source}`));
  const hard=nc.flatMap(x=>x.hardHits), risk=nc.flatMap(x=>x.riskHits), pos=nc.flatMap(x=>x.posHits);
  score += nc.reduce((s,x)=>s+x.score,0)*.35;
  if(hard.length){hardFlags.push(...hard); reasons.push("Kırmızı haber: "+[...new Set(hard)].join(", ")); action="HARD_BLOCK"; sizeScale=0;}
  if(risk.length){reasons.push("Haber risk kelimeleri: "+[...new Set(risk)].slice(0,5).join(", ")); sizeScale=Math.min(sizeScale,.75); if(action==="NEUTRAL")action="CAUTION";}
  if(pos.length) reasons.push("Pozitif haber/narrative: "+[...new Set(pos)].slice(0,4).join(", "));
  if(social?.stats){
    if(social.stats.euphoriaScore>65){reasons.push("Sosyal euphoria yüksek: chase etme / retest bekle"); sizeScale=Math.min(sizeScale,.65); if(action==="NEUTRAL")action="SIZE_DOWN";}
    if(social.stats.panicScore>65){reasons.push("Sosyal panik yüksek: volatilite riski"); sizeScale=Math.min(sizeScale,.7); if(action==="NEUTRAL")action="CAUTION";}
  }
  score=clamp(score);
  if(action==="NEUTRAL" && score<40){action="SIZE_DOWN"; sizeScale=Math.min(sizeScale,.7);}
  return {symbol, score:num(score,1), action, sizeScale:num(sizeScale,2), hardBlock:action==="HARD_BLOCK", hardFlags:[...new Set(hardFlags)], reasons:reasons.slice(0,12)};
}
module.exports = async (req,res) => {
  const started=Date.now(), errors=[];
  const symbol=cleanSymbol(req.query.symbol), base=baseAsset(symbol);
  res.setHeader("Content-Type","application/json");
  res.setHeader("Cache-Control","s-maxage=75, stale-while-revalidate=180");
  try{
    const fundingPath=`/fapi/v1/fundingRate?symbol=${symbol}&limit=30`;
    const oiPath=`/fapi/v1/openInterest?symbol=${symbol}`;
    const oiHistPath=`/futures/data/openInterestHist?symbol=${symbol}&period=1h&limit=30`;
    const [fundingHist, oiNow, oiHist, gdelt, cc, cp, reddit] = await Promise.all([
      safe("funding",()=>firstOk(BINANCE_F.map(b=>b+fundingPath),errors),[],errors),
      safe("openInterest",()=>firstOk(BINANCE_F.map(b=>b+oiPath),errors),null,errors),
      safe("openInterestHist",()=>firstOk(BINANCE_F.map(b=>b+oiHistPath),errors),[],errors),
      safe("gdelt",()=>gdeltNews(base),[],errors),
      safe("cryptocompare",()=>cryptoCompareNews(base),[],errors),
      safe("cryptopanic",()=>cryptoPanic(base, req.headers["x-omni-cryptopanic-key"]||req.query.cryptopanic||""),[],errors),
      safe("reddit",()=>redditSearch(base),[],errors)
    ]);
    const funding=deriveFundingStats(fundingHist);
    const openInterest=deriveOiStats(oiHist,oiNow);
    const risk=derivativesRisk(funding,openInterest);
    const newsItems=[...(cp||[]),...(gdelt||[]),...(cc||[])].slice(0,18);
    const social={reddit:reddit||[],stats:socialStats(reddit||[])};
    const derivatives={funding,openInterest,risk};
    const news={items:newsItems,source:{gdelt:(gdelt||[]).length,cryptoCompare:(cc||[]).length,cryptoPanic:(cp||[]).length}};
    const overlay=buildOverlay(symbol,derivatives,news,social);
    res.status(200).json({ok:true,version:"RUx v0.72.2",symbol,base,derivatives,news,social,overlay,errors:errors.slice(0,20),latencyMs:Date.now()-started,updatedAt:Date.now()});
  }catch(e){
    res.status(200).json({ok:false,version:"RUx v0.72.2",symbol,base,error:String(e.message||e),errors:errors.slice(0,20),derivatives:{funding:{},openInterest:{},risk:{score:50,flags:["Endpoint hata verdi"],action:"ERROR",sizeScale:1}},news:{items:[],source:{}},social:{reddit:[],stats:{}},overlay:{symbol,score:50,action:"ERROR",sizeScale:1,hardBlock:false,reasons:[String(e.message||e)]},latencyMs:Date.now()-started,updatedAt:Date.now()});
  }
};

  return module.exports;
})();

// ---- liquidity bundled from handler_liquidity.js ----
HANDLERS['liquidity'] = (() => {
  const module = { exports: {} };
  const exports = module.exports;

function corsOrigin(req){
  const origin = req && req.headers ? String(req.headers.origin || '') : '';
  const extra = String(process.env.ALLOWED_ORIGINS || '').split(',').map(x=>x.trim()).filter(Boolean);
  const ok = !origin || /^https:\/\/.*\.vercel\.app$/.test(origin) || /^https:\/\/.*omninomics\.(com|app)$/.test(origin) || /^http:\/\/localhost:\d+$/.test(origin) || extra.includes(origin);
  return ok ? (origin || '*') : 'null';
}
// Omninomics v5.0.0 — derivative & liquidity API
// Vercel Hobby uyumlu: max 10s function execution
// Strateji:
//   - Per-request 5s timeout
//   - Mirror'lar Promise.any ile paralel
//   - Total budget: ~8s (Hobby 10s'de güvenli marj)
//   - Önemli: bu endpoint daha sonra UI tarafında SADECE seçili coin için çağrılıyor

const BINANCE_F_MIRRORS = [
  "https://fapi.binance.com",
  "https://fapi1.binance.com",
  "https://fapi2.binance.com",
  "https://fapi3.binance.com"
];
const BINANCE_S_MIRRORS = [
  "https://api.binance.com",
  "https://api1.binance.com",
  "https://api2.binance.com",
  "https://api3.binance.com"
];
const OKX = "https://www.okx.com";
const COINBASE_EX_MIRRORS = [
  "https://api.exchange.coinbase.com",
  "https://api.pro.coinbase.com"
];
// Kraken — coğrafi engel uygulamayan güvenilir ek yedek (Binance/OKX bloklanırsa devreye girer).
const KRAKEN = "https://api.kraken.com";
const KRAKEN_INTERVAL = { "5m": 5, "15m": 15, "1h": 60, "4h": 240, "1d": 1440 };
// Kraken çift kodları: BTC→XBT, bazı çiftler X/Z önekli döner; pair adını esnek çözeriz.
function krakenPair(base) {
  const b = String(base || "BTC").toUpperCase();
  const mapped = b === "BTC" ? "XBT" : b;
  return `${mapped}USD`;
}
function normalizeKrakenOhlc(json) {
  // Kraken: { error:[], result:{ <pairName>:[[time,open,high,low,close,vwap,volume,count],...], last:... } }
  try {
    const result = json?.result;
    if (!result) return [];
    const key = Object.keys(result).find(k => k !== "last");
    const rows = key ? result[key] : null;
    if (!Array.isArray(rows)) return [];
    return rows.map(r => ({
      time: nz(r[0]) * 1000, open: nz(r[1]), high: nz(r[2]),
      low: nz(r[3]), close: nz(r[4]), volume: nz(r[6])
    })).filter(x => x.close);
  } catch { return []; }
}
function krakenTickerPrice(json) {
  try {
    const result = json?.result;
    if (!result) return null;
    const key = Object.keys(result)[0];
    const row = key ? result[key] : null;
    // c = [last trade price, lot volume]
    return row && Array.isArray(row.c) ? nz(row.c[0], null) : null;
  } catch { return null; }
}

const TF_PERIOD   = { "5m":"5m", "15m":"15m", "1h":"1h", "4h":"4h", "1d":"1d" };
const TF_INTERVAL = { "5m":"5m", "15m":"15m", "1h":"1h", "4h":"4h", "1d":"1d" };
const OKX_BAR     = { "5m":"5m", "15m":"15m", "1h":"1H", "4h":"4H", "1d":"1D" };
const CB_GRAN     = { "5m":300,  "15m":900,   "1h":3600, "4h":14400, "1d":86400 };

const PER_REQUEST_TIMEOUT_MS = 5000;

function num(v) { v = Number(v); return Number.isFinite(v) ? v : null; }
function nz(v, d = 0) { v = num(v); return v === null ? d : v; }
function round(n, d = 4) { n = nz(n, 0); const p = Math.pow(10, d); return Math.round(n * p) / p; }

function baseFromSymbol(symbol) {
  symbol = String(symbol || "BTCUSDT").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (symbol.endsWith("USDT")) return symbol.slice(0, -4);
  if (symbol.endsWith("USD")) return symbol.slice(0, -3);
  return symbol;
}

function toSymbol(base) { return `${base}USDT`; }

async function getJson(url, timeout = PER_REQUEST_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: { "accept": "application/json", "user-agent": "OmninomicsTradeEngine/5.0" }
    });
    const text = await r.text();
    let json;
    try { json = JSON.parse(text); } catch { json = text; }
    if (!r.ok) {
      const snippet = typeof json === "string" ? json.slice(0, 150) : JSON.stringify(json).slice(0, 150);
      throw new Error(`HTTP ${r.status}: ${snippet}`);
    }
    return json;
  } finally {
    clearTimeout(t);
  }
}

// Paralel mirror — ilk başarılı yanıtı al
async function getJsonAnyMirror(urls, label, debugErrors, fallback = null, timeout = PER_REQUEST_TIMEOUT_MS) {
  try {
    const tasks = urls.map(u => getJson(u, timeout));
    return await Promise.any(tasks);
  } catch (e) {
    // Promise.any AggregateError döner
    const reasons = e?.errors ? e.errors.map(x => x.message || String(x)).join(" | ") : (e.message || String(e));
    debugErrors.push(`${label}: ${reasons.slice(0, 220)}`);
    return fallback;
  }
}

async function getJsonOnce(url, label, debugErrors, fallback = null, timeout = PER_REQUEST_TIMEOUT_MS) {
  try {
    return await getJson(url, timeout);
  } catch (e) {
    debugErrors.push(`${label}: ${(e.message || String(e)).slice(0, 220)}`);
    return fallback;
  }
}

function normalizeBinanceKlines(rows) {
  return (rows || []).map(r => ({
    time: nz(r[0]), open: nz(r[1]), high: nz(r[2]),
    low:  nz(r[3]), close: nz(r[4]), volume: nz(r[5])
  })).filter(x => x.close);
}

function normalizeOkxCandles(rows) {
  return (rows || []).map(r => ({
    time: nz(r[0]), open: nz(r[1]), high: nz(r[2]),
    low:  nz(r[3]), close: nz(r[4]), volume: nz(r[5])
  })).filter(x => x.close).reverse();
}

function normalizeCoinbaseCandles(rows) {
  return (rows || []).map(r => ({
    time: nz(r[0]) * 1000,
    low:  nz(r[1]), high: nz(r[2]),
    open: nz(r[3]), close: nz(r[4]), volume: nz(r[5])
  })).filter(x => x.close).sort((a, b) => a.time - b.time);
}

function nearestByTime(rows, t) {
  if (!rows || !rows.length) return null;
  let best = rows[0], bd = Math.abs(rows[0].time - t);
  for (const r of rows) {
    const d = Math.abs(r.time - t);
    if (d < bd) { best = r; bd = d; }
  }
  return best;
}

function normalizeDepthBinance(depth) {
  return {
    bids: (depth?.bids || []).map(x => [nz(x[0]), nz(x[1])]).filter(x => x[0] && x[1]),
    asks: (depth?.asks || []).map(x => [nz(x[0]), nz(x[1])]).filter(x => x[0] && x[1])
  };
}

function normalizeDepthOkx(j) {
  const d = j?.data?.[0] || {};
  return {
    bids: (d.bids || []).map(x => [nz(x[0]), nz(x[1])]).filter(x => x[0] && x[1]),
    asks: (d.asks || []).map(x => [nz(x[0]), nz(x[1])]).filter(x => x[0] && x[1])
  };
}

function first(j) { return j?.data?.[0] || null; }

function seriesFromBinanceRatio(rows, key = "longShortRatio") {
  return (rows || []).map(x => ({ time: nz(x.timestamp), value: nz(x[key]) }))
    .filter(x => x.time && x.value !== null);
}

// Gerçek likidite metrikleri — orderbook depth analiz
function computeDepthMetrics(depth, midPrice) {
  if (!midPrice || !depth || (!depth.bids?.length && !depth.asks?.length)) {
    return { bidUsd: 0, askUsd: 0, depthRatio: 1, spreadBps: null, imbalance: 0 };
  }
  const bestBid = depth.bids[0]?.[0] || midPrice;
  const bestAsk = depth.asks[0]?.[0] || midPrice;
  const spreadBps = (bestAsk - bestBid) / midPrice * 10000;
  const bidUsd = depth.bids.reduce((s, [p, q]) => s + p * q, 0);
  const askUsd = depth.asks.reduce((s, [p, q]) => s + p * q, 0);
  const total = bidUsd + askUsd || 1;
  const imbalance = (bidUsd - askUsd) / total; // -1..+1
  const depthRatio = bidUsd / (askUsd || 1);
  return {
    bidUsd: round(bidUsd, 0),
    askUsd: round(askUsd, 0),
    depthRatio: round(depthRatio, 3),
    spreadBps: round(spreadBps, 2),
    imbalance: round(imbalance, 4)
  };
}

module.exports = async function handler(req, res) {
  const headers = {
    "Access-Control-Allow-Origin": corsOrigin(req),
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Cache-Control": "public, max-age=8, s-maxage=8, stale-while-revalidate=20",
    "Content-Type": "application/json"
  };

  if ((req.method || "GET") === "OPTIONS") {
    for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
    res.status(204).send("");
    return;
  }

  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);

  const rawSymbol = String((req.query && req.query.symbol) || "BTCUSDT").toUpperCase();
  const base = baseFromSymbol(rawSymbol);
  const symbol = toSymbol(base);
  const okxSwap = `${base}-USDT-SWAP`;
  const okxSpot = `${base}-USDT`;
  const cbProduct = `${base}-USD`;
  const tf = String((req.query && req.query.tf) || "1h");
  const period = TF_PERIOD[tf] || "1h";
  const interval = TF_INTERVAL[tf] || "1h";
  const okxBar = OKX_BAR[tf] || "1H";
  const gran = CB_GRAN[tf] || 3600;
  const debugErrors = [];
  const sources = [];

  try {
    // Promise.all ile tüm istekler paralel başlatılır
    // Her istek 5s timeout — toplam wallclock ~5-6s (Vercel 10s limit içinde)
    const [
      binPremium, binOpenInterest, binFundingHistory, binOiHist,
      binGlobalRatio, binTopRatio, binTakerRatio,
      binDepth, binKlines, binSpotTicker, binSpotKlines,
      okxFunding, okxOpenInterest, okxMark, okxBooks, okxCandles,
      okxSpotTicker, okxSwapTicker,
      coinbaseTickerRaw, coinbaseCandlesRaw,
      krakenOhlcRaw, krakenTickerRaw
    ] = await Promise.all([
      getJsonAnyMirror(BINANCE_F_MIRRORS.map(b => `${b}/fapi/v1/premiumIndex?symbol=${symbol}`), "Binance premiumIndex", debugErrors),
      getJsonAnyMirror(BINANCE_F_MIRRORS.map(b => `${b}/fapi/v1/openInterest?symbol=${symbol}`), "Binance openInterest", debugErrors),
      getJsonAnyMirror(BINANCE_F_MIRRORS.map(b => `${b}/fapi/v1/fundingRate?symbol=${symbol}&limit=50`), "Binance fundingRate", debugErrors, []),
      getJsonAnyMirror(BINANCE_F_MIRRORS.map(b => `${b}/futures/data/openInterestHist?symbol=${symbol}&period=${period}&limit=50`), "Binance OI hist", debugErrors, []),
      getJsonAnyMirror(BINANCE_F_MIRRORS.map(b => `${b}/futures/data/globalLongShortAccountRatio?symbol=${symbol}&period=${period}&limit=40`), "Binance global L/S", debugErrors, []),
      getJsonAnyMirror(BINANCE_F_MIRRORS.map(b => `${b}/futures/data/topLongShortPositionRatio?symbol=${symbol}&period=${period}&limit=40`), "Binance top trader L/S", debugErrors, []),
      getJsonAnyMirror(BINANCE_F_MIRRORS.map(b => `${b}/futures/data/takerlongshortRatio?symbol=${symbol}&period=${period}&limit=40`), "Binance taker ratio", debugErrors, []),
      getJsonAnyMirror(BINANCE_F_MIRRORS.map(b => `${b}/fapi/v1/depth?symbol=${symbol}&limit=500`), "Binance futures depth", debugErrors),
      getJsonAnyMirror(BINANCE_F_MIRRORS.map(b => `${b}/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=90`), "Binance futures klines", debugErrors),
      getJsonAnyMirror(BINANCE_S_MIRRORS.map(b => `${b}/api/v3/ticker/price?symbol=${symbol}`), "Binance spot ticker", debugErrors),
      getJsonAnyMirror(BINANCE_S_MIRRORS.map(b => `${b}/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=90`), "Binance spot klines", debugErrors, []),
      getJsonOnce(`${OKX}/api/v5/public/funding-rate?instId=${okxSwap}`, "OKX funding", debugErrors),
      getJsonOnce(`${OKX}/api/v5/public/open-interest?instType=SWAP&instId=${okxSwap}`, "OKX OI", debugErrors),
      getJsonOnce(`${OKX}/api/v5/public/mark-price?instType=SWAP&instId=${okxSwap}`, "OKX mark", debugErrors),
      getJsonOnce(`${OKX}/api/v5/market/books?instId=${okxSwap}&sz=400`, "OKX books", debugErrors),
      getJsonOnce(`${OKX}/api/v5/market/candles?instId=${okxSwap}&bar=${okxBar}&limit=90`, "OKX candles", debugErrors),
      getJsonOnce(`${OKX}/api/v5/market/ticker?instId=${okxSpot}`, "OKX spot ticker", debugErrors),
      getJsonOnce(`${OKX}/api/v5/market/ticker?instId=${okxSwap}`, "OKX swap ticker", debugErrors),
      getJsonAnyMirror(COINBASE_EX_MIRRORS.map(b => `${b}/products/${cbProduct}/ticker`), "Coinbase ticker", debugErrors),
      getJsonAnyMirror(COINBASE_EX_MIRRORS.map(b => `${b}/products/${cbProduct}/candles?granularity=${gran}`), "Coinbase candles", debugErrors, []),
      getJsonOnce(`${KRAKEN}/0/public/OHLC?pair=${krakenPair(base)}&interval=${KRAKEN_INTERVAL[tf] || 60}`, "Kraken OHLC", debugErrors),
      getJsonOnce(`${KRAKEN}/0/public/Ticker?pair=${krakenPair(base)}`, "Kraken ticker", debugErrors)
    ]);

    const krakenK = normalizeKrakenOhlc(krakenOhlcRaw);
    const krakenPrice = krakenTickerPrice(krakenTickerRaw);

    if (binPremium || binKlines || binDepth) sources.push("BINANCE");
    if (okxFunding || okxOpenInterest || okxBooks || okxCandles) sources.push("OKX YEDEK");
    if (coinbaseTickerRaw) sources.push("COINBASE");
    if (krakenK.length || krakenPrice) sources.push("KRAKEN YEDEK");

    const okxMarkRow = first(okxMark);
    const okxOiRow = first(okxOpenInterest);
    const okxFundingRow = first(okxFunding);
    const okxSpotRow = first(okxSpotTicker);
    const okxSwapRow = first(okxSwapTicker);

    // Mum (kline) fallback zinciri: Binance F → OKX → Kraken → Coinbase spot mumları
    const futureK = binKlines ? normalizeBinanceKlines(binKlines)
      : (okxCandles?.data?.length ? normalizeOkxCandles(okxCandles.data)
        : (krakenK.length ? krakenK
          : normalizeCoinbaseCandles(coinbaseCandlesRaw || [])));
    const spotKBinance = normalizeBinanceKlines(binSpotKlines || []);
    const spotKCoinbase = normalizeCoinbaseCandles(coinbaseCandlesRaw || []);

    const fallbackFuturePrice =
      nz(binPremium?.markPrice, null) ??
      nz(binPremium?.lastPrice, null) ??
      nz(okxMarkRow?.markPx, null) ??
      nz(okxSwapRow?.last, null) ??
      nz(futureK[futureK.length - 1]?.close, null) ??
      krakenPrice;

    const cbTicker = coinbaseTickerRaw && coinbaseTickerRaw.data
      ? { price: coinbaseTickerRaw.data.amount }
      : coinbaseTickerRaw;
    const coinbasePrice = nz(cbTicker?.price, null) ?? nz(cbTicker?.ask, null) ?? nz(cbTicker?.bid, null);
    const binanceSpotPrice = nz(binSpotTicker?.price, null);
    const okxSpotPrice = nz(okxSpotRow?.last, null);

    let spotPrice = null, spotSource = "YOK", spotK = [];
    if (coinbasePrice) { spotPrice = coinbasePrice; spotSource = "COINBASE SPOT"; spotK = spotKCoinbase; }
    else if (binanceSpotPrice) { spotPrice = binanceSpotPrice; spotSource = "BINANCE SPOT"; spotK = spotKBinance; }
    else if (okxSpotPrice) { spotPrice = okxSpotPrice; spotSource = "OKX SPOT"; spotK = []; }
    else if (krakenPrice) { spotPrice = krakenPrice; spotSource = "KRAKEN SPOT"; spotK = krakenK; }

    const markPrice = nz(binPremium?.markPrice, null) ?? nz(okxMarkRow?.markPx, null) ?? fallbackFuturePrice;
    const futuresPrice = nz(binPremium?.lastPrice, null) ?? nz(okxSwapRow?.last, null) ?? markPrice;
    const indexPrice = nz(binPremium?.indexPrice, null) ?? nz(okxMarkRow?.idxPx, null) ?? spotPrice ?? futuresPrice;

    const premiumUsdNow = spotPrice && futuresPrice ? round(spotPrice - futuresPrice, 6) : null;
    const premiumPctNow = spotPrice && futuresPrice ? round((spotPrice - futuresPrice) / (futuresPrice || 1) * 100, 5) : null;

    const premiumUsd = [], premiumPct = [];
    if (spotK.length && futureK.length) {
      for (const s of spotK) {
        const f = nearestByTime(futureK, s.time);
        if (!f?.close || !s.close) continue;
        const usd = s.close - f.close;
        premiumUsd.push({ time: s.time, value: round(usd, 6) });
        premiumPct.push({ time: s.time, value: round(usd / (f.close || 1) * 100, 5) });
      }
    }

    const oiCoin = nz(binOpenInterest?.openInterest, null) ?? nz(okxOiRow?.oiCcy, null) ?? nz(okxOiRow?.oi, null);
    const oiUsd = nz((binOiHist || [])[(binOiHist || []).length - 1]?.sumOpenInterestValue, null) ??
      nz(okxOiRow?.oiUsd, null) ??
      (oiCoin && futuresPrice ? round(oiCoin * futuresPrice, 2) : null);

    const oiSeries = (binOiHist || []).map(x => ({
      time: nz(x.timestamp), value: nz(x.sumOpenInterestValue)
    })).filter(x => x.time && x.value !== null);

    const fundingSeries = (binFundingHistory || []).map(x => ({
      time: nz(x.fundingTime), value: round(nz(x.fundingRate, 0) * 100, 5)
    })).filter(x => x.time);

    const lastFundingRatePct = nz(binPremium?.lastFundingRate, null) !== null
      ? round(nz(binPremium.lastFundingRate) * 100, 5)
      : (nz(okxFundingRow?.fundingRate, null) !== null
        ? round(nz(okxFundingRow.fundingRate) * 100, 5)
        : null);

    if (!fundingSeries.length && lastFundingRatePct !== null) {
      fundingSeries.push({ time: Date.now(), value: lastFundingRatePct });
    }

    const basisSeries = futureK.map(k => ({
      time: k.time,
      value: indexPrice ? round((k.close - indexPrice) / (indexPrice || 1) * 100, 5) : null
    })).filter(x => x.value !== null);

    const globalSeries = seriesFromBinanceRatio(binGlobalRatio);
    const topSeries = seriesFromBinanceRatio(binTopRatio);
    const takerSeries = (binTakerRatio || []).map(x => ({
      time: nz(x.timestamp),
      value: round((nz(x.buySellRatio, 1) - 1) * 100, 3),
      raw: nz(x.buySellRatio)
    })).filter(x => x.time);

    const globalLast = globalSeries.length ? globalSeries[globalSeries.length - 1].value : null;
    const topLast = topSeries.length ? topSeries[topSeries.length - 1].value : null;
    const takerLast = takerSeries.length ? takerSeries[takerSeries.length - 1].value : null;

    const basisPct = markPrice && indexPrice ? round((markPrice - indexPrice) / (indexPrice || 1) * 100, 5) : null;
    const markIndexPct = basisPct;

    const depth = binDepth ? normalizeDepthBinance(binDepth) : normalizeDepthOkx(okxBooks);
    const midForDepth = futuresPrice || markPrice || spotPrice;
    const depthMetrics = computeDepthMetrics(depth, midForDepth);

    const quality = {
      futures: !!(markPrice || futuresPrice),
      spot: !!spotPrice,
      premiumHistory: premiumPct.length > 1,
      funding: fundingSeries.length > 0,
      oiCurrent: oiUsd !== null,
      oiHistory: oiSeries.length > 1,
      ratios: !!(globalSeries.length || topSeries.length || takerSeries.length),
      depth: !!(depth.bids.length || depth.asks.length),
      realLiquidity: depthMetrics.spreadBps !== null
    };

    const hasSomething = quality.futures || quality.spot || quality.funding ||
      quality.oiCurrent || quality.ratios || quality.depth;

    if (!hasSomething) {
      res.status(502).send(JSON.stringify({
        symbol,
        error: `${symbol} için Binance/OKX türev verisi alınamadı.`,
        debugErrors: debugErrors.slice(0, 20)
      }));
      return;
    }

    const out = {
      source: sources.length ? sources.join(" + ") : "PARTIAL",
      symbol,
      base,
      tf,
      debugErrors: debugErrors.slice(0, 14),
      depth,
      depthMetrics,
      quality,
      summary: {
        spotPrice, spotSource, futuresPrice, markPrice, indexPrice,
        premiumSource: `${spotSource} - FUTURES/MARK`,
        spotPremiumUsd: premiumUsdNow,
        spotPremiumPct: premiumPctNow,
        coinbasePrice, binanceSpotPrice,
        lastFundingRatePct,
        nextFundingTime: nz(binPremium?.nextFundingTime, null) ?? nz(okxFundingRow?.nextFundingTime, null),
        openInterest: oiCoin,
        openInterestUsd: oiUsd,
        globalLongShort: globalLast,
        topTraderLongShort: topLast,
        takerBias: takerLast,
        basisPct,
        markIndexPct,
        depthBidUsd: depthMetrics.bidUsd,
        depthAskUsd: depthMetrics.askUsd,
        depthRatio: depthMetrics.depthRatio,
        spreadBps: depthMetrics.spreadBps,
        depthImbalance: depthMetrics.imbalance,
        retrievedAt: Date.now()
      },
      series: {
        premiumPct, premiumUsd,
        oi: oiSeries, funding: fundingSeries, basis: basisSeries,
        globalRatio: globalSeries, topRatio: topSeries, taker: takerSeries
      }
    };

    res.status(200).send(JSON.stringify(out));
  } catch (e) {
    res.status(502).send(JSON.stringify({
      symbol,
      error: e.message || String(e),
      debugErrors: debugErrors.slice(0, 20)
    }));
  }
};

  return module.exports;
})();

// ---- market bundled from handler_market.js ----
HANDLERS['market'] = (() => {
  const module = { exports: {} };
  const exports = module.exports;

function corsOrigin(req){
  const origin = req && req.headers ? String(req.headers.origin || '') : '';
  const extra = String(process.env.ALLOWED_ORIGINS || '').split(',').map(x=>x.trim()).filter(Boolean);
  const ok = !origin || /^https:\/\/.*\.vercel\.app$/.test(origin) || /^https:\/\/.*omninomics\.(com|app)$/.test(origin) || /^http:\/\/localhost:\d+$/.test(origin) || extra.includes(origin);
  return ok ? (origin || '*') : 'null';
}
// Omninomics v5.0.0 — market data API
// Vercel Hobby uyumlu: max 10s function execution
// Strateji: paralel mirror fetch (Promise.any), per-request 5s timeout
// Sıralama: önce Binance spot/futures fallback, sonra MEXC, sonra OKX, sonra CryptoCompare

const TF_MEXC = { "5m":"5m", "15m":"15m", "1h":"60m", "4h":"4h", "1d":"1d", "1w":"1W", "1M":"1M" };
const TF_OKX  = { "5m":"5m", "15m":"15m", "1h":"1H",  "4h":"4H", "1d":"1D", "1w":"1W", "1M":"1M" };
const TF_BINANCE = { "5m":"5m", "15m":"15m", "1h":"1h", "4h":"4h", "1d":"1d", "1w":"1w", "1M":"1M" };
const TF_CC = {
  "5m":  { path:"histominute", aggregate:5  },
  "15m": { path:"histominute", aggregate:15 },
  "1h":  { path:"histohour",   aggregate:1  },
  "4h":  { path:"histohour",   aggregate:4  },
  "1d":  { path:"histoday",    aggregate:1  },
  "1w":  { path:"histoday",    aggregate:7  },
  "1M":  { path:"histoday",    aggregate:30 }
};

const TF_BYBIT = { "5m":"5", "15m":"15", "1h":"60", "4h":"240", "1d":"D", "1w":"W", "1M":"M" };
const TF_GATE = { "5m":"5m", "15m":"15m", "1h":"1h", "4h":"4h", "1d":"1d", "1w":"7d" };
const TF_KRAKEN = { "5m":5, "15m":15, "1h":60, "4h":240, "1d":1440, "1w":10080 };



function limitForTf(tf) {
  if (tf === "1M") return 120;
  if (tf === "1w") return 260;
  if (tf === "1d") return 1000;
  if (tf === "4h") return 1000;
  if (tf === "1h") return 720;
  return 500;
}
function okxLimitForTf(tf) {
  return Math.min(300, limitForTf(tf));
}

const BINANCE_MIRRORS = [
  "https://api.binance.com",
  "https://api1.binance.com",
  "https://api2.binance.com",
  "https://api3.binance.com"
];

const PER_REQUEST_TIMEOUT_MS = 5000;

function baseFromSymbol(symbol) {
  return String(symbol || "").toUpperCase().replace(/USDT$/, "");
}

function okxInst(symbol) {
  return baseFromSymbol(symbol) + "-USDT";
}

async function getJson(url, timeout = PER_REQUEST_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: { "accept": "application/json", "user-agent": "OmninomicsTradeEngine/5.0" }
    });
    const text = await r.text();
    let json;
    try { json = JSON.parse(text); } catch { json = text; }
    if (!r.ok) {
      const snippet = typeof json === "string" ? json.slice(0, 150) : JSON.stringify(json).slice(0, 150);
      throw new Error(`HTTP ${r.status}: ${snippet}`);
    }
    return json;
  } finally {
    clearTimeout(t);
  }
}

// Paralel mirror fetch: ilk başarılı yanıtı al
async function getJsonAnyMirror(urls, timeout = PER_REQUEST_TIMEOUT_MS) {
  const tasks = urls.map(u => getJson(u, timeout));
  return await Promise.any(tasks);
}

function normalizeBinanceKlines(rows) {
  return (rows || []).map(k => ({
    time: Number(k[0]),
    open: Number(k[1]),
    high: Number(k[2]),
    low:  Number(k[3]),
    close: Number(k[4]),
    volume: Number(k[5] || 0)
  })).filter(x => Number.isFinite(x.close));
}

function normalizeMexcKlines(rows) {
  return normalizeBinanceKlines(rows);
}

function normalizeOkxKlines(rows) {
  return (rows || []).map(k => ({
    time: Number(k[0]),
    open: Number(k[1]),
    high: Number(k[2]),
    low:  Number(k[3]),
    close: Number(k[4]),
    volume: Number(k[5] || 0)
  })).filter(x => Number.isFinite(x.close)).reverse();
}

function normalizeCcRows(rows) {
  return (rows || []).map(k => ({
    time: Number(k.time) * 1000,
    open: Number(k.open),
    high: Number(k.high),
    low:  Number(k.low),
    close: Number(k.close),
    volume: Number(k.volumefrom || k.volumeto || 0)
  })).filter(x => Number.isFinite(x.close));
}

async function fetchBinanceSpot(symbol, tf) {
  const interval = TF_BINANCE[tf] || "1h";
  const klUrls = BINANCE_MIRRORS.map(b => `${b}/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limitForTf(tf)}`);
  const tkUrls = BINANCE_MIRRORS.map(b => `${b}/api/v3/ticker/24hr?symbol=${symbol}`);
  const kl = await getJsonAnyMirror(klUrls);
  const ticker = await getJsonAnyMirror(tkUrls).catch(() => null);
  return {
    symbol,
    source: "LIVE BINANCE",
    market: "binance",
    ticker: ticker ? { price: Number(ticker.lastPrice), change: Number(ticker.priceChangePercent || 0) } : null,
    candles: normalizeBinanceKlines(kl)
  };
}

async function fetchMexc(symbol, tf) {
  const interval = TF_MEXC[tf] || "60m";
  const kl = await getJson(`https://api.mexc.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limitForTf(tf)}`);
  const ticker = await getJson(`https://api.mexc.com/api/v3/ticker/24hr?symbol=${symbol}`).catch(() => null);
  return {
    symbol,
    source: "LIVE MEXC",
    market: "mexc",
    ticker: ticker ? { price: Number(ticker.lastPrice), change: Number(ticker.priceChangePercent || 0) } : null,
    candles: normalizeMexcKlines(kl)
  };
}

async function fetchOkx(symbol, tf) {
  const inst = okxInst(symbol);
  const bar = TF_OKX[tf] || "1H";
  const kl = await getJson(`https://www.okx.com/api/v5/market/candles?instId=${encodeURIComponent(inst)}&bar=${bar}&limit=${okxLimitForTf(tf)}`);
  if (kl.code !== "0") throw new Error(kl.msg || "OKX candles error");
  const tk = await getJson(`https://www.okx.com/api/v5/market/ticker?instId=${encodeURIComponent(inst)}`).catch(() => null);
  let ticker = null;
  if (tk && tk.code === "0" && tk.data && tk.data[0]) {
    const d = tk.data[0];
    const last = Number(d.last);
    const open24h = Number(d.open24h);
    ticker = { price: last, change: open24h ? (last - open24h) / open24h * 100 : 0 };
  }
  return { symbol, source: "LIVE OKX", market: "okx", ticker, candles: normalizeOkxKlines(kl.data || []) };
}

async function fetchCryptoCompare(symbol, tf) {
  const base = baseFromSymbol(symbol);
  const t = TF_CC[tf] || TF_CC["1h"];
  const url = `https://min-api.cryptocompare.com/data/v2/${t.path}?fsym=${encodeURIComponent(base)}&tsym=USD&limit=${limitForTf(tf)}&aggregate=${t.aggregate}`;
  const j = await getJson(url);
  if (!j.Data || !j.Data.Data || !j.Data.Data.length) throw new Error(j.Message || "CryptoCompare empty");
  const price = await getJson(`https://min-api.cryptocompare.com/data/price?fsym=${encodeURIComponent(base)}&tsyms=USD`).catch(() => null);
  return {
    symbol,
    source: "LIVE CRYPTOCOMPARE",
    market: "cryptocompare",
    ticker: price && price.USD ? { price: Number(price.USD), change: 0 } : null,
    candles: normalizeCcRows(j.Data.Data)
  };
}


function normalizeBybitKlines(rows){
  return (rows||[]).map(k=>({time:Number(k[0]),open:Number(k[1]),high:Number(k[2]),low:Number(k[3]),close:Number(k[4]),volume:Number(k[5]||0)})).filter(x=>Number.isFinite(x.close)).reverse();
}
function normalizeGateKlines(rows){
  return (rows||[]).map(k=>({time:Number(k[0])*1000,volume:Number(k[1]||0),close:Number(k[2]),high:Number(k[3]),low:Number(k[4]),open:Number(k[5])})).filter(x=>Number.isFinite(x.close));
}
function normalizeKrakenRows(rows){
  return (rows||[]).map(k=>({time:Number(k[0])*1000,open:Number(k[1]),high:Number(k[2]),low:Number(k[3]),close:Number(k[4]),volume:Number(k[6]||0)})).filter(x=>Number.isFinite(x.close));
}
async function fetchBybit(symbol, tf){
  const interval=TF_BYBIT[tf]||'60';
  const kl=await getJson(`https://api.bybit.com/v5/market/kline?category=linear&symbol=${symbol}&interval=${interval}&limit=${Math.min(1000,limitForTf(tf))}`);
  if(kl.retCode!==0)throw new Error(kl.retMsg||'Bybit kline error');
  const ticker=await getJson(`https://api.bybit.com/v5/market/tickers?category=linear&symbol=${symbol}`).catch(()=>null);
  let t=ticker?.result?.list?.[0];
  return {symbol,source:'LIVE BYBIT',market:'bybit',ticker:t?{price:Number(t.lastPrice),change:Number(t.price24hPcnt||0)*100}:null,candles:normalizeBybitKlines(kl.result?.list||[])};
}
async function fetchGate(symbol, tf){
  const pair=baseFromSymbol(symbol)+'_USDT', interval=TF_GATE[tf]||'1h';
  const kl=await getJson(`https://api.gateio.ws/api/v4/spot/candlesticks?currency_pair=${encodeURIComponent(pair)}&interval=${interval}&limit=${Math.min(1000,limitForTf(tf))}`);
  const tk=await getJson(`https://api.gateio.ws/api/v4/spot/tickers?currency_pair=${encodeURIComponent(pair)}`).catch(()=>null);
  const t=Array.isArray(tk)?tk[0]:null;
  return {symbol,source:'LIVE GATEIO',market:'gateio',ticker:t?{price:Number(t.last),change:Number(t.change_percentage||0)}:null,candles:normalizeGateKlines(kl)};
}
async function fetchKraken(symbol, tf){
  const base=baseFromSymbol(symbol); if(['USDT','BUSD','USDC'].includes(base))throw new Error('Kraken unsupported base');
  const pair=(base==='BTC'?'XBT':base)+'USD', interval=TF_KRAKEN[tf]||60;
  const j=await getJson(`https://api.kraken.com/0/public/OHLC?pair=${encodeURIComponent(pair)}&interval=${interval}`);
  if(j.error&&j.error.length)throw new Error(j.error.join(','));
  const key=Object.keys(j.result||{}).find(k=>k!=='last'); const rows=j.result?.[key]||[];
  const px=rows.length?Number(rows.at(-1)[4]):null;
  return {symbol,source:'LIVE KRAKEN',market:'kraken',ticker:px?{price:px,change:0}:null,candles:normalizeKrakenRows(rows).slice(-limitForTf(tf))};
}

// Kontrollü fallback yarışı: Binance hemen başlar; yavaş kalırsa diğer kaynaklar kademeli devreye girer.
// Böylece Promise.any hızını korurken gereksiz rate-limit baskısı azaltılır.
function delay(ms){ return new Promise(r => setTimeout(r, ms)); }
async function fetchWithFallback(symbol, tf, errors) {
  const sources = [
    { name: "Binance",  wait: 0,    fn: () => fetchBinanceSpot(symbol, tf) },
    { name: "MEXC",     wait: 0,    fn: () => fetchMexc(symbol, tf) },
    { name: "OKX",      wait: 0,    fn: () => fetchOkx(symbol, tf) },
    { name: "Bybit",    wait: 1500, fn: () => fetchBybit(symbol, tf) },
    { name: "Gate.io",  wait: 1500, fn: () => fetchGate(symbol, tf) },
    { name: "Kraken",   wait: 3000, fn: () => fetchKraken(symbol, tf) },
    { name: "CryptoCompare", wait: 3000, fn: () => fetchCryptoCompare(symbol, tf) }
  ];
  const wrapped = sources.map(async (src) => {
    if (src.wait) await delay(src.wait);
    try {
      const result = await src.fn();
      if (result && result.candles && result.candles.length) return result;
      throw new Error(`${src.name}: empty candles`);
    } catch (e) {
      const msg = `${src.name}: ${(e.message || String(e)).slice(0, 160)}`;
      errors.push(msg);
      throw new Error(msg);
    }
  });
  try {
    return await Promise.any(wrapped);
  } catch (e) {
    if (e && e.errors) e.errors.forEach(x => { if (x && x.message && !errors.includes(x.message)) errors.push(x.message); });
    return null;
  }
}

module.exports = async function handler(req, res) {
  const headers = {
    "Access-Control-Allow-Origin": corsOrigin(req),
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Cache-Control": "public, max-age=15, s-maxage=15, stale-while-revalidate=30",
    "Content-Type": "application/json"
  };

  if ((req.method || "GET") === "OPTIONS") {
    for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
    res.status(204).send("");
    return;
  }

  const symbol = String((req.query && req.query.symbol) || "BTCUSDT").toUpperCase();
  const tf = String((req.query && req.query.tf) || "1h");
  const errors = [];

  try {
    const result = await fetchWithFallback(symbol, tf, errors);
    for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
    if (result) {
      res.status(200).send(JSON.stringify(result));
    } else {
      res.status(502).send(JSON.stringify({
        symbol,
        source: "DATA ERROR",
        market: "none",
        candles: [],
        ticker: null,
        error: errors.slice(0, 4).join(" | ")
      }));
    }
  } catch (e) {
    for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
    res.status(502).send(JSON.stringify({
      symbol,
      source: "DATA ERROR",
      market: "none",
      candles: [],
      ticker: null,
      error: e.message || String(e)
    }));
  }
};

  return module.exports;
})();

// ---- news-pulse bundled from handler_news-pulse.js ----
HANDLERS['news-pulse'] = (() => {
  const module = { exports: {} };
  const exports = module.exports;
function corsOrigin(req){
  const origin = req && req.headers ? String(req.headers.origin || '') : '';
  const extra = String(process.env.ALLOWED_ORIGINS || '').split(',').map(x=>x.trim()).filter(Boolean);
  const ok = !origin || /^https:\/\/.*\.vercel\.app$/.test(origin) || /^https:\/\/.*omninomics\.(com|app)$/.test(origin) || /^http:\/\/localhost:\d+$/.test(origin) || extra.includes(origin);
  return ok ? (origin || '*') : 'null';
}
function setCorsHeaders(req,res,extra={}){
  const headers={
    'Access-Control-Allow-Origin':corsOrigin(req),
    'Vary':'Origin',
    'Access-Control-Allow-Headers':'Content-Type, x-omni-cmc-key, x-cmc-api-key, x-coinmarketcap-key, x-omni-cg-key, x-dune-api-key, x-omni-dune-key, x-rux-telegram-source',
    'Access-Control-Allow-Methods':'GET, POST, OPTIONS',
    ...extra
  };
  Object.entries(headers).forEach(([k,v])=>res.setHeader(k,v));
  if((req.method||'GET')==='OPTIONS'){res.status(204).send(''); return true;}
  return false;
}

// OMNINOMICS v7.3.4 — News Pulse Engine / News Page Fix
// Sources: CryptoPanic (optional key), CryptoCompare, GDELT, RSS, NewsAPI (optional key), FreeNewsApi/Finnhub fallback.
// Policy: display-only. News never changes LONG/SHORT/WAIT. It produces sentiment/impact/relevance labels for UI only.

const DEFAULT_TIMEOUT = 6200;
const UA = 'Omninomics/7.3.3 news-pulse-display-only';
const TRANSLATION_CACHE = globalThis.__OMNI_NEWS_TRANSLATION_CACHE__ || new Map();
const RESPONSE_CACHE = globalThis.__OMNI_NEWS_RESPONSE_CACHE__ || new Map();
globalThis.__OMNI_NEWS_TRANSLATION_CACHE__ = TRANSLATION_CACHE;
globalThis.__OMNI_NEWS_RESPONSE_CACHE__ = RESPONSE_CACHE;

function timeoutFetch(url, opts = {}, ms = DEFAULT_TIMEOUT) {
  const ctl = new AbortController();
  const id = setTimeout(() => ctl.abort(), ms);
  return fetch(url, { ...opts, signal: ctl.signal }).finally(() => clearTimeout(id));
}
function cleanSymbol(s) { return String(s || 'BTCUSDT').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 24) || 'BTCUSDT'; }
function baseAsset(symbol) { return cleanSymbol(symbol).replace(/USDT$|USD$|BUSD$|USDC$|TRY$|EUR$/g, '') || 'BTC'; }
function decodeHtmlEntities(str) {
  return String(str || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/').replace(/&nbsp;/g, ' ');
}
function safeText(v) { return decodeHtmlEntities(String(v || '')).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(); }
function safeUrl(v) { try { const u = new URL(String(v || '')); return ['https:', 'http:'].includes(u.protocol) ? u.href : ''; } catch { return ''; } }
function clamp(n,min=0,max=100){ n=Number(n); return Number.isFinite(n)?Math.max(min,Math.min(max,n)):min; }
async function mapLimit(items, limit, fn) {
  const arr = Array.from(items || []), out = new Array(arr.length); let next = 0;
  async function worker(){ while(next < arr.length){ const i = next++; out[i] = await fn(arr[i], i); } }
  await Promise.all(Array.from({ length: Math.min(Math.max(1, limit || 3), arr.length || 1) }, worker));
  return out;
}

const ASSET_NAMES = {
  BTC:['btc','bitcoin','bitcoin etf','satoshi'], ETH:['eth','ethereum','ether','spot ether','ethereum etf'],
  SOL:['sol','solana'], BNB:['bnb','binance coin','binance'], XRP:['xrp','ripple'], ADA:['ada','cardano'],
  DOGE:['doge','dogecoin'], AVAX:['avax','avalanche'], LINK:['link','chainlink'], DOT:['dot','polkadot'],
  MATIC:['matic','polygon'], POL:['pol','polygon'], TON:['ton','toncoin'], TRX:['trx','tron'], LTC:['ltc','litecoin'],
  BCH:['bch','bitcoin cash'], UNI:['uni','uniswap'], APT:['apt','aptos'], ARB:['arb','arbitrum'], OP:['op','optimism'],
  NEAR:['near','near protocol'], INJ:['inj','injective'], ATOM:['atom','cosmos'], FIL:['fil','filecoin'],
  SUI:['sui'], SEI:['sei'], TIA:['tia','celestia'], PEPE:['pepe'], WIF:['wif','dogwifhat']
};
function coinTerms(symbol){ const b=baseAsset(symbol); return [...new Set([b.toLowerCase(), ...(ASSET_NAMES[b]||[]), 'crypto', 'bitcoin', 'ethereum'])]; }
function detectCoins(text){
  const t = ` ${String(text||'').toLowerCase()} `;
  const out = [];
  for(const [sym, terms] of Object.entries(ASSET_NAMES)){
    if(terms.some(term => new RegExp(`(^|[^a-z0-9])${term.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}([^a-z0-9]|$)`, 'i').test(t))) out.push(sym);
  }
  return [...new Set(out)].slice(0,8);
}
function relevanceScore(text, symbol){
  const base = baseAsset(symbol), t = String(text||'').toLowerCase(); let s = 0;
  const terms = ASSET_NAMES[base] || [base.toLowerCase()];
  if(new RegExp(`(^|[^a-z0-9])${base.toLowerCase()}([^a-z0-9]|$)`, 'i').test(t)) s += 45;
  for(const term of terms){ if(t.includes(term.toLowerCase())) s += term.length <= 4 ? 18 : 28; }
  if(/bitcoin|btc|ethereum|eth|crypto|cryptocurrency|blockchain|stablecoin|defi|exchange|binance|coinbase/.test(t)) s += 18;
  if(/fed|fomc|cpi|pce|inflation|rate|treasury|dollar|dxy|nasdaq|oil|war|sanction|tariff|sec|etf/.test(t)) s += 12;
  return clamp(s,0,100);
}
function sourceWeight(provider, source){
  const p = String(provider||'').toLowerCase(), s = String(source||'').toLowerCase();
  if(p.includes('cryptopanic')) return 24;
  if(p.includes('cryptocompare')) return 19;
  if(p.includes('gdelt')) return 14;
  if(p.includes('rss')) return 12;
  if(p.includes('newsapi')) return 12;
  if(/coindesk|cointelegraph|decrypt|the block|cnbc|yahoo|investing/.test(s)) return 15;
  return 8;
}
function sentimentRaw(text){
  const t = String(text||'').toLowerCase(); let s = 0;
  const neg = [
    [/hack|exploit|breach|stolen|outage|halt|depeg|fraud|bankrupt|insolvency/g, -34],
    [/lawsuit|probe|investigation|sec charges|sanction|ban|delist|regulatory crackdown/g, -28],
    [/war|attack|missile|tariff|oil shock|default|crash|sell[- ]off|liquidation/g, -25],
    [/bearish|plunge|slump|drop|falls|warning|risk/g, -16]
  ];
  const pos = [
    [/approve|approved|approval|etf inflow|record inflow|adoption|partnership|listing/g, 28],
    [/upgrade|mainnet|surge|rally|breakout|bullish|all[- ]time high|ath/g, 22],
    [/rate cut|dovish|easing|liquidity|buyback/g, 16]
  ];
  for(const [rx,w] of neg){ const m=t.match(rx); if(m) s += w * Math.min(3,m.length); }
  for(const [rx,w] of pos){ const m=t.match(rx); if(m) s += w * Math.min(3,m.length); }
  return Math.max(-100, Math.min(100, s));
}
function sentimentLabel(score, text){
  const t=String(text||'').toLowerCase();
  if(/fed|fomc|cpi|pce|inflation|rate|treasury|dollar|dxy|oil|war|tariff|sanction/.test(t) && Math.abs(score)<45) return 'macro-risk';
  if(score >= 18) return 'bullish';
  if(score <= -18) return 'bearish';
  return 'neutral';
}
function severityFromSentiment(score, text){
  const label=sentimentLabel(score,text); if(label==='bullish') return 'bull'; if(label==='bearish') return 'bear'; if(label==='macro-risk') return 'warn'; return 'info';
}
function classify(text) { return severityFromSentiment(sentimentRaw(text), text); }
function impactScore(text) {
  const t = String(text || '').toLowerCase(); let s = 12;
  if (/breaking|urgent|exclusive|just in|live/.test(t)) s += 18;
  if (/fed|fomc|cpi|pce|nfp|payroll|treasury|yields|rate|inflation|dollar|dxy/.test(t)) s += 30;
  if (/sec|etf|blackrock|microstrategy|coinbase|binance|lawsuit|regulation|approval/.test(t)) s += 28;
  if (/hack|exploit|war|attack|oil|iran|israel|china|tariff|sanction|bankrupt|depeg|delist|liquidation/.test(t)) s += 36;
  if (/bitcoin|btc|ethereum|eth|crypto|cryptocurrency|blockchain|stablecoin/.test(t)) s += 18;
  return clamp(s, 0, 100);
}
function importanceLabel(score){ if(score>=82) return 'HIGH IMPACT'; if(score>=64) return 'WATCH'; if(score>=45) return 'MEDIUM'; return 'LOW'; }
function severityLabel(sev) { return ({ bear: 'RİSK', bull: 'POZİTİF', warn: 'DİKKAT', info: 'BİLGİ' })[sev] || 'BİLGİ'; }

const EXCLUDED_ALERT_PATTERNS = [
  ['liquidation', /\b(liquidation alert|liquidated|longs? liquidated|shorts? liquidated|liq\.? alert|tasfiye alarmı|likidasyon alarmı|tasfiye edildi)\b/i],
  ['whale_alert', /\b(whale alert|large transfer alert|transfer alert|large txn|large transaction|büyük transfer alarmı|balina alarmı)\b/i],
  ['exchange_flow_alert', /\b(deposit alert|withdrawal alert|inflow alert|outflow alert|exchange inflow|exchange outflow)\b/i],
  ['orderbook_alert', /\b(buy wall|sell wall|market buy alert|market sell alert|orderbook alert|pump alert|dump alert)\b/i]
];
function alertFilterReason(text){
  const t = safeText(text || '');
  for(const [name, rx] of EXCLUDED_ALERT_PATTERNS){ if(rx.test(t)) return name; }
  return '';
}
function isExcludedAlertText(text){ return !!alertFilterReason(text); }
function newsKindFromText(text){
  const t = String(text || '').toLowerCase();
  if(isExcludedAlertText(t)) return 'excluded_alert';
  if(/fed|fomc|cpi|pce|inflation|rate|treasury|dxy|nasdaq|sec|etf|regulation|lawsuit/.test(t)) return 'news';
  if(/hack|exploit|security|breach|depeg|bankrupt|insolven|halt/.test(t)) return 'news';
  if(/partnership|approval|approved|launch|upgrade|mainnet|listing|delisting|funding round|acquisition|buy|sold|purchase|reserve/.test(t)) return 'news';
  if(/bitcoin|ethereum|crypto|blockchain|stablecoin|defi|exchange|coinbase|binance|blackrock|microstrategy/.test(t)) return 'news';
  return 'news';
}
function gdeltDateToISO(v) {
  const s = String(v || '');
  if (/^\d{14}$/.test(s)) return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}T${s.slice(8,10)}:${s.slice(10,12)}:${s.slice(12,14)}Z`;
  if (/^\d{8}T\d{6}Z?$/.test(s)) return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}T${s.slice(9,11)}:${s.slice(11,13)}:${s.slice(13,15)}Z`;
  const d = new Date(s); return Number.isFinite(d.getTime()) ? d.toISOString() : new Date().toISOString();
}
function defaultDescription(item) {
  const sev = severityLabel(item.severity), src = item.source || item.provider || 'haber kaynağı';
  const impact = Number.isFinite(item.impact_score) ? item.impact_score : (Number.isFinite(item.impact) ? item.impact : impactScore(item.title || ''));
  return `${sev} · Kaynak: ${src} · Etki skoru: ${impact}/100 · Haber yalnızca ekranda gösterilir, karar motoruna etkisi 0%.`;
}
function isProbablySystemMessage(x) {
  const src = String(x.source || x.provider || '').toLowerCase(); const t = String(x.title || '').toLowerCase();
  return /fallback|system|omni|note/.test(src) || /haber akışı karar motoruna|ücretsiz haber omurgası|karar ağırlığı|çeviri anahtarı/.test(t);
}
function isMarketRelevant(x, symbol='BTCUSDT') {
  const t = `${x.title || ''} ${x.description || ''}`.toLowerCase();
  if (isProbablySystemMessage(x)) return false;
  if (isExcludedAlertText(t)) return false;
  return relevanceScore(t, symbol) >= 12 || /stocks|market|liquidity|risk assets|central bank/.test(t);
}
function titleKey(title){ return safeText(title).toLowerCase().replace(/[^a-z0-9ığüşöç ]/gi, ' ').replace(/\b(the|a|an|to|of|and|for|in|on|as|with|from|is|are)\b/g,' ').replace(/\s+/g,' ').trim().slice(0,145); }
function normalizeItem(x, symbol='BTCUSDT') {
  const title = safeText(x.title || x.text || '');
  const description = safeText(x.description || x.summary || x.subtitle || x.excerpt || '');
  const text = `${title} ${description}`;
  const filterReason = alertFilterReason(text);
  const kind = x.kind || newsKindFromText(text);
  const sent = Number.isFinite(x.sentiment_score) ? clamp(x.sentiment_score,-100,100) : sentimentRaw(text);
  const impact = Number.isFinite(x.impact_score) ? clamp(x.impact_score) : (Number.isFinite(x.impact) ? clamp(x.impact) : impactScore(text));
  const relevance = Number.isFinite(x.relevance_score) ? clamp(x.relevance_score) : relevanceScore(text, symbol);
  const sw = sourceWeight(x.provider, x.source);
  const freshnessMs = Date.now() - (new Date(x.created_at || x.published_at || Date.now()).getTime() || Date.now());
  const freshness = clamp(26 - freshnessMs / 3600000 * 3, 0, 26);
  const confidence = clamp(35 + sw + Math.min(20, Math.abs(sent)/3) + Math.min(20, impact/5));
  const pulse = clamp(impact * 0.42 + relevance * 0.28 + confidence * 0.18 + freshness * 0.12 + sw * 0.2);
  const raw = { ...x, title, description };
  raw.url = safeUrl(raw.url || raw.link || raw.guid || '');
  raw.created_at = new Date(raw.created_at || raw.published_at || raw.publishedAt || Date.now()).toISOString();
  raw.sentiment_score = sent;
  raw.sentiment_label = raw.sentiment_label || sentimentLabel(sent, text);
  raw.severity = raw.severity || severityFromSentiment(sent, text);
  raw.impact_score = impact;
  raw.impact = impact;
  raw.relevance_score = relevance;
  raw.confidence = confidence;
  raw.pulse_score = pulse;
  raw.importance = raw.importance || importanceLabel(impact);
  raw.coin_tags = Array.isArray(raw.coin_tags) ? raw.coin_tags.slice(0,8) : detectCoins(text);
  raw.symbol_focus = cleanSymbol(symbol);
  raw.display_only = true;
  raw.decision_weight = 0;
  raw.decision_binding = 'DISABLED';
  raw.title_original = title;
  raw.description_original = description;
  raw.title_tr = raw.title_tr || '';
  raw.description_tr = raw.description_tr || '';
  raw.title_display = raw.title_display || title;
  raw.description_display = raw.description_display || description || defaultDescription(raw);
  raw.source_count = Number(raw.source_count || 1);
  raw.sources = Array.isArray(raw.sources) ? raw.sources : [raw.source || raw.provider || 'Kaynak'];
  raw.kind = kind;
  raw.filtered = !!filterReason;
  raw.filter_reason = filterReason;
  raw.dedupe_key = titleKey(title);
  return raw;
}
function mergeDuplicate(a,b){
  const newer = (new Date(b.created_at).getTime()||0) > (new Date(a.created_at).getTime()||0) ? b : a;
  const older = newer === b ? a : b;
  const merged = { ...older, ...newer };
  merged.sources = [...new Set([...(a.sources||[]), ...(b.sources||[]), a.source, b.source].filter(Boolean))].slice(0,6);
  merged.source_count = Math.max(Number(a.source_count||1), Number(b.source_count||1), merged.sources.length);
  merged.impact_score = clamp(Math.max(a.impact_score||0,b.impact_score||0) + Math.min(10, (merged.source_count-1)*4));
  merged.impact = merged.impact_score;
  merged.confidence = clamp(Math.max(a.confidence||0,b.confidence||0) + Math.min(12, (merged.source_count-1)*5));
  merged.pulse_score = clamp(Math.max(a.pulse_score||0,b.pulse_score||0) + Math.min(12, (merged.source_count-1)*4));
  merged.importance = importanceLabel(merged.impact_score);
  merged.coin_tags = [...new Set([...(a.coin_tags||[]), ...(b.coin_tags||[])])].slice(0,8);
  return merged;
}
function uniqueItems(items, symbol, mode='global') {
  const byKey = new Map();
  for(const raw of (items || [])){
    if(!raw || !(raw.title || raw.text)) continue;
    const item = normalizeItem(raw, symbol);
    if(!item.force_include && !isMarketRelevant(item, symbol)) continue;
    const key = item.dedupe_key; if(!key || key.length < 8) continue;
    const prev = byKey.get(key); byKey.set(key, prev ? mergeDuplicate(prev, item) : item);
  }
  let arr = [...byKey.values()];
  if(mode === 'critical') arr = arr.filter(x => (x.impact_score||0) >= 62 || (x.importance||'').includes('HIGH'));
  if(mode === 'coin') arr = arr.filter(x => (x.relevance_score||0) >= 25 || (x.coin_tags||[]).includes(baseAsset(symbol)));
  return arr.sort((a,b) => {
    if(mode === 'global'){
      const dt = (new Date(b.created_at).getTime()||0) - (new Date(a.created_at).getTime()||0);
      if(Math.abs(dt) > 1000) return dt;
    }
    const ps = (b.pulse_score||0) - (a.pulse_score||0); if(Math.abs(ps)>0.1) return ps;
    return (new Date(b.created_at).getTime()||0) - (new Date(a.created_at).getTime()||0);
  });
}

function translationProvider() {
  const forced = String(process.env.NEWS_TRANSLATION_PROVIDER || '').toLowerCase().trim(); if (forced && forced !== 'auto') return forced;
  if (process.env.GOOGLE_TRANSLATE_API_KEY) return 'google'; if (process.env.LIBRETRANSLATE_URL) return 'libre';
  return 'mymemory';
}

function looksTurkish(text='') {
  const t = String(text || '').toLowerCase();
  return /[ğüşöçıİĞÜŞÖÇ]/.test(text) || /\b(ve|ile|için|sonra|önce|piyasa|kripto|bitcoin|ethereum|onay|açıkladı|düştü|yükseldi|bekleniyor)\b/.test(t);
}
function localTurkishNewsFallback(text='') {
  let t = safeText(text);
  if(!t || looksTurkish(t)) return t;
  const pairs = [
    [/\bbreaking\b/gi,'Son dakika'], [/\burgent\b/gi,'Acil'], [/\bbitcoin\b/gi,'Bitcoin'], [/\bethereum\b/gi,'Ethereum'], [/\bcrypto market\b/gi,'kripto piyasası'], [/\bcrypto\b/gi,'kripto'],
    [/\bmarket\b/gi,'piyasa'], [/\bmarkets\b/gi,'piyasalar'], [/\binvestors\b/gi,'yatırımcılar'], [/\btraders\b/gi,'traderlar'], [/\bexchange\b/gi,'borsa'], [/\bexchanges\b/gi,'borsalar'],
    [/\bETF\b/g,'ETF'], [/\bspot ETF\b/gi,'spot ETF'], [/\bapproval\b/gi,'onay'], [/\bapproved\b/gi,'onaylandı'], [/\bfiles\b/gi,'başvuru yaptı'], [/\bfiling\b/gi,'başvuru'],
    [/\brises\b/gi,'yükseliyor'], [/\brise\b/gi,'yükseliş'], [/\bjumps\b/gi,'sıçradı'], [/\bgains\b/gi,'değer kazandı'], [/\brallies\b/gi,'ralli yapıyor'], [/\bfalls\b/gi,'düşüyor'], [/\bdrops\b/gi,'geriledi'], [/\bslips\b/gi,'zayıfladı'],
    [/\bfed\b/gi,'Fed'], [/\bFOMC\b/g,'FOMC'], [/\bCPI\b/g,'CPI'], [/\binflation\b/gi,'enflasyon'], [/\brates\b/gi,'faizler'], [/\brate cut\b/gi,'faiz indirimi'], [/\byields\b/gi,'tahvil faizleri'],
    [/\bSEC\b/g,'SEC'], [/\blawsuit\b/gi,'dava'], [/\bregulation\b/gi,'regülasyon'], [/\bregulator\b/gi,'düzenleyici kurum'], [/\bhack\b/gi,'hack olayı'], [/\bexploit\b/gi,'açık istismarı'],
    [/\bBlackRock\b/g,'BlackRock'], [/\bMicroStrategy\b/g,'MicroStrategy'], [/\bCoinbase\b/g,'Coinbase'], [/\bBinance\b/g,'Binance'],
    [/\bafter\b/gi,'sonrası'], [/\bbefore\b/gi,'öncesi'], [/\bas\b/gi,'ile'], [/\bamid\b/gi,'ortasında'], [/\bover\b/gi,'üzerinde'], [/\bagainst\b/gi,'karşı'], [/\breport\b/gi,'rapor'], [/\breports\b/gi,'raporlar'], [/\bannounces\b/gi,'duyurdu'], [/\bannounced\b/gi,'duyurdu'], [/\bsays\b/gi,'dedi'], [/\baccording to\b/gi,'kaynağa göre']
  ];
  for(const [rx, tr] of pairs) t = t.replace(rx, tr);
  return t;
}
async function translateWithGoogle(text, target) {
  const key = process.env.GOOGLE_TRANSLATE_API_KEY || ''; if (!key) throw new Error('GOOGLE_TRANSLATE_API_KEY yok');
  const r = await timeoutFetch(`https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(key)}`, { method:'POST', headers:{'content-type':'application/json; charset=utf-8', accept:'application/json', 'user-agent':UA}, body:JSON.stringify({q:text,target,format:'text'}) }, 5000);
  const j = await r.json().catch(()=>({})); if(!r.ok) throw new Error(`Google Translate HTTP ${r.status}`); return safeText(j?.data?.translations?.[0]?.translatedText || '');
}
async function translateWithLibre(text, target) {
  const base = String(process.env.LIBRETRANSLATE_URL || '').replace(/\/$/, ''); if(!base) throw new Error('LIBRETRANSLATE_URL yok');
  const body = { q:text, source:'auto', target, format:'text' }; if(process.env.LIBRETRANSLATE_API_KEY) body.api_key = process.env.LIBRETRANSLATE_API_KEY;
  const r = await timeoutFetch(`${base}/translate`, { method:'POST', headers:{'content-type':'application/json; charset=utf-8', accept:'application/json', 'user-agent':UA}, body:JSON.stringify(body) }, 5200);
  const j = await r.json().catch(()=>({})); if(!r.ok) throw new Error(`LibreTranslate HTTP ${r.status}`); return safeText(j.translatedText || '');
}
async function translateWithMyMemory(text, target) {
  text = safeText(text).slice(0, 430); if(!text) return '';
  const email = process.env.MYMEMORY_EMAIL || process.env.NEWS_TRANSLATION_EMAIL || ''; const key = process.env.MYMEMORY_API_KEY || '';
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|${encodeURIComponent(target)}&mt=1${email ? `&de=${encodeURIComponent(email)}` : ''}${key ? `&key=${encodeURIComponent(key)}` : ''}`;
  const r = await timeoutFetch(url, { headers:{accept:'application/json','user-agent':UA} }, 4200);
  const j = await r.json().catch(()=>({})); if(!r.ok) throw new Error(`MyMemory HTTP ${r.status}`); return safeText(j?.responseData?.translatedText || '');
}
async function translateText(text, target='tr') {
  text = safeText(text); if(!text || target === 'en') return { text, provider:'none', translated:false };
  const provider = translationProvider(); if(['none','off','disabled'].includes(provider)) return { text, provider:'none', translated:false };
  const cacheKey = `${provider}:${target}:${text}`; if(TRANSLATION_CACHE.has(cacheKey)) return { text:TRANSLATION_CACHE.get(cacheKey), provider, translated:true, cached:true };
  let translated = '';
  if(provider==='google') translated = await translateWithGoogle(text, target);
  else if(provider==='libre') translated = await translateWithLibre(text, target);
  else if(provider==='mymemory') translated = await translateWithMyMemory(text, target);
  else throw new Error(`Bilinmeyen çeviri sağlayıcı: ${provider}`);
  translated = safeText(translated) || text;
  if(target === 'tr' && translated === text) translated = localTurkishNewsFallback(text);
  TRANSLATION_CACHE.set(cacheKey, translated);
  if(TRANSLATION_CACHE.size > 700) TRANSLATION_CACHE.delete(TRANSLATION_CACHE.keys().next().value);
  return { text: translated, provider, translated: translated !== text };
}
async function translateItems(items, lang) {
  const target = String(lang || process.env.NEWS_LANGUAGE || 'tr').toLowerCase().slice(0, 5);
  const provider = translationProvider(); const errors = []; const slice = (items || []).slice(0, 24);
  const out = await mapLimit(slice, Number(process.env.NEWS_TRANSLATION_CONCURRENCY || 4), async raw => {
    const item = normalizeItem(raw, raw.symbol_focus || 'BTCUSDT'); const descOriginal = item.description_original || defaultDescription(item);
    item.language = target; item.translation_provider = provider; item.translated = false;
    if(target === 'tr' && !['none','off','disabled'].includes(provider)){
      try{
        const combined = `${item.title_original}\n---OMNI_DESC---\n${descOriginal}`;
        const res = await translateText(combined, 'tr');
        const parts = String(res.text || '').split(/\n---OMNI_DESC---\n|---OMNI_DESC---/);
        item.title_tr = safeText(parts[0] || item.title_original); item.description_tr = safeText(parts.slice(1).join(' ') || descOriginal);
        item.title_display = item.title_tr; item.description_display = item.description_tr; item.translated = Boolean(res.translated); item.translation_provider = res.provider || provider;
      }catch(e){ errors.push(e.message || String(e)); item.title_display=localTurkishNewsFallback(item.title_original); item.description_display=localTurkishNewsFallback(descOriginal); item.translation_provider='local_tr_fallback'; }
    } else { item.title_display = target === 'tr' ? item.title_tr || item.title_original : item.title_original; item.description_display = target === 'tr' ? item.description_tr || descOriginal : descOriginal; }
    return item;
  });
  return { items: out, errors:[...new Set(errors)].slice(0,3), provider };
}

async function gdeltQuery(query, label) {
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(query)}&mode=ArtList&format=json&maxrecords=30&sort=DateDesc&timespan=24h`;
  const r = await timeoutFetch(url, { headers:{accept:'application/json','user-agent':UA} }, 5400);
  const j = await r.json().catch(()=>({})); if(!r.ok) throw new Error(`GDELT ${label} HTTP ${r.status}`);
  return (j.articles || []).slice(0, 30).map(a => ({ source:a.domain || a.sourceCountry || 'GDELT', provider:'GDELT', title:a.title || '', description:a.description || a.summary || '', url:a.url || '', created_at:gdeltDateToISO(a.seendate || a.date) }));
}
async function gdelt(symbol) {
  const base = baseAsset(symbol); const terms = coinTerms(symbol).slice(0,5).join(' OR ');
  const queries = [`(${terms})`, '(Federal Reserve OR Fed OR FOMC OR CPI OR PCE OR inflation OR Treasury OR Nasdaq OR dollar OR oil OR SEC OR ETF)'];
  if(!['BTC','ETH'].includes(base)) queries.unshift(`(${base} OR ${base.toLowerCase()} OR crypto)`);
  const settled = await Promise.allSettled(queries.map((q,i)=>gdeltQuery(q, `q${i+1}`))); const out=[], errors=[];
  for(const s of settled){ if(s.status==='fulfilled') out.push(...s.value); else errors.push(s.reason?.message || String(s.reason)); }
  if(!out.length && errors.length) throw new Error(errors.join('; ')); return out;
}
async function cryptoCompareNews() {
  const url = 'https://min-api.cryptocompare.com/data/v2/news/?lang=EN&categories=BTC,ETH,Market,Regulation,Blockchain&excludeCategories=Sponsored';
  const headers = { accept:'application/json', 'user-agent':UA }; if(process.env.CRYPTOCOMPARE_API_KEY) headers.authorization = `Apikey ${process.env.CRYPTOCOMPARE_API_KEY}`;
  const r = await timeoutFetch(url, { headers }, 4800); const j = await r.json().catch(()=>({}));
  if(!r.ok || j.Response === 'Error') throw new Error(`CryptoCompare ${r.status} ${j.Message || ''}`.trim());
  return (Array.isArray(j.Data) ? j.Data : []).slice(0, 30).map(a => ({ source:a.source_info?.name || a.source || 'CryptoCompare', provider:'CryptoCompare', title:a.title || '', description:a.body || '', url:a.url || '', created_at:a.published_on ? new Date(a.published_on*1000).toISOString() : new Date().toISOString(), coin_tags:Array.isArray(a.categories)?a.categories:undefined }));
}
async function cryptoPanic(symbol) {
  const token = process.env.CRYPTOPANIC_API_KEY || process.env.CRYPTOPANIC_AUTH_TOKEN || process.env.CRYPTOPANIC_TOKEN || '';
  if(!token) return [];
  const base = baseAsset(symbol);
  const currencies = ['BTC','ETH'].includes(base) ? base : `${base},BTC,ETH`;
  const url = `https://cryptopanic.com/api/v1/posts/?auth_token=${encodeURIComponent(token)}&public=true&kind=news&currencies=${encodeURIComponent(currencies)}&filter=hot`;
  const r = await timeoutFetch(url, { headers:{accept:'application/json','user-agent':UA} }, 5200);
  const j = await r.json().catch(()=>({})); if(!r.ok) throw new Error(`CryptoPanic HTTP ${r.status}`);
  const rows = Array.isArray(j.results) ? j.results : [];
  return rows.slice(0, 30).map(a => {
    const votes = a.votes || {}; const pos = Number(votes.positive||0), neg = Number(votes.negative||0), imp = Number(votes.important||0), liked = Number(votes.liked||0), disliked = Number(votes.disliked||0);
    const sent = clamp((pos + liked) * 12 - (neg + disliked) * 12, -100, 100);
    const impact = clamp(35 + imp * 16 + (a.kind === 'news' ? 8 : 0) + (a.currencies?.length ? 8 : 0));
    return { source:a.source?.title || a.source?.domain || 'CryptoPanic', provider:'CryptoPanic', title:a.title || '', description:a.metadata?.description || a.domain || '', url:a.url || a.slug && `https://cryptopanic.com/news/${a.slug}` || '', created_at:a.published_at || new Date().toISOString(), sentiment_score:sent, impact_score:impact, coin_tags:(a.currencies||[]).map(c=>String(c.code||c.title||'').toUpperCase()).filter(Boolean) };
  });
}
function tag(xml, name) { const m = String(xml || '').match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i')); return safeText(m ? m[1] : ''); }
async function rssFeed(url, provider) {
  const r = await timeoutFetch(url, { headers:{accept:'application/rss+xml, application/xml, text/xml, */*','user-agent':UA} }, 5200);
  const xml = await r.text(); if(!r.ok) throw new Error(`${provider} RSS HTTP ${r.status}`);
  let chunks = xml.split(/<item\b/i).slice(1).map(x => '<item' + x.split(/<\/item>/i)[0] + '</item>');
  if(!chunks.length) chunks = xml.split(/<entry\b/i).slice(1).map(x => '<entry' + x.split(/<\/entry>/i)[0] + '</entry>');
  return chunks.slice(0, 18).map(it => ({ source:provider, provider:'RSS', title:tag(it,'title'), description:tag(it,'description') || tag(it,'summary') || tag(it,'content:encoded'), url:tag(it,'link') || tag(it,'guid'), created_at:new Date(tag(it,'pubDate') || tag(it,'updated') || tag(it,'published') || Date.now()).toISOString() }));
}
async function rssNews(symbol) {
  const base = baseAsset(symbol);
  const q = encodeURIComponent([base, 'crypto OR bitcoin OR ethereum OR fed OR cpi OR sec etf'].join(' '));
  const feeds = [
    ['CoinDesk', 'https://www.coindesk.com/arc/outboundfeeds/rss/'], ['Cointelegraph', 'https://cointelegraph.com/rss'],
    ['Decrypt', 'https://decrypt.co/feed'], ['CNBC Markets', 'https://www.cnbc.com/id/100003114/device/rss/rss.html'],
    ['Yahoo Finance BTC', 'https://feeds.finance.yahoo.com/rss/2.0/headline?s=BTC-USD&region=US&lang=en-US'],
    ['Yahoo Finance ETH', 'https://feeds.finance.yahoo.com/rss/2.0/headline?s=ETH-USD&region=US&lang=en-US'],
    ['Google News Query', `https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=US:en`]
  ];
  if(!['BTC','ETH'].includes(base)) feeds.push([`Yahoo Finance ${base}`, `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(base)}-USD&region=US&lang=en-US`]);
  const settled = await Promise.allSettled(feeds.map(([name,url])=>rssFeed(url,name))); const out=[], errors=[];
  for(const s of settled){ if(s.status==='fulfilled') out.push(...s.value); else errors.push(s.reason?.message || String(s.reason)); }
  if(!out.length && errors.length) throw new Error(errors.join('; ')); return out;
}
async function newsApi(symbol) {
  const token = process.env.NEWSAPI_KEY || process.env.NEWS_API_KEY || ''; if(!token) return [];
  const query = `${baseAsset(symbol)} OR bitcoin OR ethereum OR crypto OR Fed OR CPI OR SEC OR ETF`;
  const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&language=en&sortBy=publishedAt&pageSize=25`;
  const r = await timeoutFetch(url, { headers:{accept:'application/json','user-agent':UA,'x-api-key':token} }, 5000);
  const j = await r.json().catch(()=>({})); if(!r.ok || j.status === 'error') throw new Error(`NewsAPI HTTP ${r.status} ${j.message || ''}`.trim());
  return (Array.isArray(j.articles) ? j.articles : []).map(a => ({ source:a.source?.name || 'NewsAPI', provider:'NewsAPI', title:a.title || '', description:a.description || a.content || '', url:a.url || '', created_at:a.publishedAt || new Date().toISOString() }));
}
async function freeNewsApi(symbol) {
  const token = process.env.FREENEWS_API_KEY || process.env.FREE_NEWS_API_KEY || ''; if(!token) return [];
  const base = baseAsset(symbol).toLowerCase(); const terms = encodeURIComponent(`${base} bitcoin ethereum crypto fed cpi sec etf oil nasdaq dollar`);
  const params = `language=en&order_by=archive&page_size=20&search=${terms}`;
  const hosts = [`https://api.freenewsapi.io/v1/news?${params}`, `https://freenewsapi.io/v1/news?${params}`];
  const headers = { accept:'application/json','user-agent':UA, authorization:`Bearer ${token}`, 'x-api-key':token }; let lastErr='';
  for(const url of hosts){ try{ const r=await timeoutFetch(url,{headers},4600); const j=await r.json().catch(()=>({})); if(!r.ok){ lastErr=`FreeNewsApi HTTP ${r.status}`; continue; } return (Array.isArray(j.data)?j.data:[]).map(a=>({ source:a.publisher||a.source||'FreeNewsApi', provider:'FreeNewsApi', title:a.title||a.subtitle||'', description:a.description||a.summary||a.subtitle||'', url:a.url||a.link||a.original_url||'', created_at:a.published_at||a.publishedAt||new Date().toISOString() })); }catch(e){ lastErr=e.message||String(e); } }
  throw new Error(lastErr || 'FreeNewsApi unavailable');
}
async function finnhub() {
  const token = process.env.FINNHUB_API_KEY || ''; if(!token) return [];
  const r = await timeoutFetch(`https://finnhub.io/api/v1/news?category=general&token=${encodeURIComponent(token)}`, { headers:{accept:'application/json','user-agent':UA} }, 4200);
  const j = await r.json().catch(()=>([])); if(!r.ok) throw new Error(`Finnhub HTTP ${r.status}`);
  return (Array.isArray(j)?j:[]).slice(0,15).map(a=>({ source:a.source||'Finnhub', provider:'Finnhub', title:a.headline||'', description:a.summary||'', url:a.url||'', created_at:a.datetime ? new Date(a.datetime*1000).toISOString() : new Date().toISOString(), kind:'news' }));
}
function telegramChannelFromSource(source){
  const raw = String(source || '').trim();
  if(!raw) return '';
  let s = raw.replace(/^https?:\/\//i,'').replace(/^t\.me\//i,'').replace(/^telegram\.me\//i,'').replace(/^@/,'');
  s = s.split(/[/?#]/)[0].trim();
  return /^[A-Za-z0-9_]{4,64}$/.test(s) ? s : '';
}
function telegramChannelsFromSource(source){
  const seen = new Set();
  return String(source || '')
    .split(/[\n,;]+/)
    .map(x => telegramChannelFromSource(x))
    .filter(Boolean)
    .filter(ch => {
      const key = ch.toLowerCase();
      if(seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 8);
}
function telegramDateToIso(chunk){
  const m = String(chunk || '').match(/datetime=["']([^"']+)["']/i);
  const d = new Date(m ? m[1] : Date.now());
  return Number.isFinite(d.getTime()) ? d.toISOString() : new Date().toISOString();
}
function stripTelegramNoise(text){
  return safeText(String(text || '').replace(/#[A-Za-z0-9_ğüşöçıİĞÜŞÖÇ-]+/g,' ').replace(/\s+/g,' '));
}
function telegramPostUrl(channel, chunk){
  const raw = String(chunk || '');
  const m = raw.match(/href=["'](https:\/\/t\.me\/[A-Za-z0-9_]+\/\d+)["']/i) || raw.match(/data-post=["']([A-Za-z0-9_]+\/\d+)["']/i);
  if(!m) return `https://t.me/${channel}`;
  return m[1].startsWith('http') ? m[1] : `https://t.me/${m[1]}`;
}
function telegramMessageTextFromChunk(ch){
  const raw = String(ch || '');
  const m = raw.match(/<div[^>]*class=["'][^"']*tgme_widget_message_text[^"']*js-message_text[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)
    || raw.match(/<div[^>]*class=["'][^"']*tgme_widget_message_text[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)
    || raw.match(/<div[^>]*class=["'][^"']*tgme_widget_message_caption[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
  if(!m) return '';
  return stripTelegramNoise(decodeHtmlEntities(m[1]
    .replace(/<br\s*\/?>/gi,'\n')
    .replace(/<a [^>]*>([\s\S]*?)<\/a>/gi,'$1')
    .replace(/<[^>]+>/g,' ')));
}
async function telegramNews(source, symbol){
  const channel = telegramChannelFromSource(source);
  if(!channel) return [];
  const url = `https://t.me/s/${encodeURIComponent(channel)}`;
  const r = await timeoutFetch(url, { headers:{accept:'text/html,application/xhtml+xml','user-agent':UA,'cache-control':'no-cache'} }, 7200);
  const html = await r.text();
  if(!r.ok) throw new Error(`Telegram HTTP ${r.status}`);
  const chunks = html.split(/tgme_widget_message_wrap/i).slice(1).slice(-36);
  const out = [];
  for(const ch of chunks){
    const text = telegramMessageTextFromChunk(ch);
    if(!text || text.length < 10) continue;
    const reason = alertFilterReason(text);
    const first = text.split(/(?<=[.!?])\s+|\n/)[0] || text;
    const title = first.length > 170 ? first.slice(0,167) + '...' : first;
    const description = text === title ? '' : text.slice(title.length).trim().slice(0, 520);
    out.push({
      source:`Telegram: ${channel}`,
      provider:'Telegram',
      title,
      description,
      url:telegramPostUrl(channel, ch),
      created_at:telegramDateToIso(ch),
      sentiment_score:sentimentRaw(text),
      impact_score:Math.max(impactScore(text), 55),
      relevance_score:Math.max(relevanceScore(text, symbol), 35),
      coin_tags:detectCoins(text),
      kind: reason ? 'excluded_alert' : 'news',
      filter_reason: reason,
      force_include: !reason,
      telegram_channel: channel
    });
  }
  return out.sort((a,b)=>(new Date(b.created_at).getTime()||0)-(new Date(a.created_at).getTime()||0));
}

async function collectNews(symbol, mode, telegramSource=''){
  const telegramChannels = telegramChannelsFromSource(telegramSource);
  const sources = [
    ['CryptoPanic', cryptoPanic(symbol)], ['CryptoCompare', cryptoCompareNews()], ['RSS', rssNews(symbol)], ['GDELT', gdelt(symbol)],
    ['NewsAPI', newsApi(symbol)], ['FreeNewsApi', freeNewsApi(symbol)], ['Finnhub', finnhub()]
  ];
  telegramChannels.slice().reverse().forEach(ch => sources.unshift([`Telegram:${ch}`, telegramNews(ch, symbol)]));
  const settled = await Promise.allSettled(sources.map(x=>x[1])); const items=[], errors=[], providerBits=[];
  settled.forEach((x,i)=>{ const name=sources[i][0]; if(x.status==='fulfilled'){ const value=x.value||[]; if(value.length) providerBits.push(name.startsWith('Telegram:') ? name : name); items.push(...value); } else errors.push(`${name}: ${x.reason?.message || String(x.reason)}`); });
  const filteredOutAlerts = items.filter(x => isExcludedAlertText(`${x.title||''} ${x.description||''} ${x.text||''}`)).length;
  return { items: uniqueItems(items, symbol, mode).slice(0, 32), errors, providerBits, filteredOutAlerts, telegramConfigured: telegramChannels.length > 0, telegramChannels };
}

module.exports = async function handler(req, res) {
  if (typeof setCorsHeaders==='function' && setCorsHeaders(req,res,{'Content-Type':'application/json'})) return;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store, max-age=0');
  const symbol = cleanSymbol(req.query.symbol || 'BTCUSDT');
  const lang = String(req.query.lang || process.env.NEWS_LANGUAGE || 'tr').toLowerCase().slice(0,5);
  const mode = ['global','coin','critical'].includes(String(req.query.mode||'').toLowerCase()) ? String(req.query.mode).toLowerCase() : 'global';
  const telegramSource = safeText(req.query.telegram || req.headers['x-rux-telegram-source'] || process.env.TELEGRAM_NEWS_SOURCES || process.env.TELEGRAM_NEWS_SOURCE || process.env.TELEGRAM_CHANNEL || '');
  const noCache = !!(req.query.refresh || req.query.nocache || req.headers['x-rux-refresh-news']);
  const cacheKey = `${symbol}:${lang}:${mode}:${telegramSource}`; const hit = RESPONSE_CACHE.get(cacheKey);
  if(!noCache && hit && Date.now() - hit.t < Number(process.env.NEWS_PULSE_CACHE_MS || 5000)){ res.status(200).json({ ...hit.v, cached:true }); return; }
  const errors = [];
  try{
    const raw = await collectNews(symbol, mode, telegramSource); errors.push(...raw.errors);
    const translated = await translateItems(raw.items, lang); errors.push(...translated.errors.map(e => `translation: ${e}`));
    const items = translated.items.map(x => normalizeItem(x, symbol));
    const stats = {
      total: items.length,
      high_impact: items.filter(x => (x.impact_score||0) >= 82).length,
      bullish: items.filter(x => x.sentiment_label === 'bullish').length,
      bearish: items.filter(x => x.sentiment_label === 'bearish').length,
      macro_risk: items.filter(x => x.sentiment_label === 'macro-risk').length,
      coin_focused: items.filter(x => (x.relevance_score||0) >= 40).length,
      filtered_alerts: Number(raw.filteredOutAlerts || 0),
      telegram_configured: !!raw.telegramConfigured
    };
    const payload = { ok:true, version:'RUx v0.72.1 / live-news-5s-turkish', symbol, base_asset:baseAsset(symbol), mode, language:lang, translation_provider:translated.provider, translation_enabled:!['none','off','disabled'].includes(translated.provider), provider:raw.providerBits.join(' + ') || 'none', sources:raw.providerBits, note:errors.filter(Boolean).slice(0,8).join(' | '), news_available:items.length>0, display_only:true, decision_binding:'DISABLED', decision_weight:0, filter_policy:{ only_news:true, excluded:['LIQUIDATION ALERT','WHALE ALERT','TRANSFER ALERT','ORDERBOOK ALERT'], filtered_alerts:Number(raw.filteredOutAlerts||0), telegram_source:(raw.telegramChannels||[]).join(', '), telegram_sources:raw.telegramChannels||[] }, stats, items };
    RESPONSE_CACHE.set(cacheKey, { t:Date.now(), v:payload }); if(RESPONSE_CACHE.size>80) RESPONSE_CACHE.delete(RESPONSE_CACHE.keys().next().value);
    res.status(200).json(payload);
  }catch(e){
    res.status(200).json({ ok:true, version:'RUx v0.72.1 / live-news-5s-turkish', symbol, mode, language:lang, provider:'none', news_available:false, display_only:true, decision_binding:'DISABLED', decision_weight:0, note:e.message||String(e), stats:{total:0,high_impact:0,bullish:0,bearish:0,macro_risk:0,coin_focused:0}, items:[] });
  }
};

  return module.exports;
})();


// ---- market-router bundled from handler_market-router.js ----
HANDLERS['binance-live'] = HANDLERS['market-router'] = (() => {
  const module = { exports: {} };

function corsOrigin(req){
  const origin=req&&req.headers?String(req.headers.origin||''):'';
  const extra=String(process.env.ALLOWED_ORIGINS||'').split(',').map(x=>x.trim()).filter(Boolean);
  const ok=!origin||/^https:\/\/.*\.vercel\.app$/.test(origin)||/^https:\/\/.*omninomics\.(com|app)$/.test(origin)||/^http:\/\/localhost:\d+$/.test(origin)||extra.includes(origin);
  return ok?(origin||'*'):'null';
}
function setHeaders(req,res){
  const headers={
    'Access-Control-Allow-Origin':corsOrigin(req),
    'Vary':'Origin',
    'Access-Control-Allow-Headers':'Content-Type',
    'Access-Control-Allow-Methods':'GET, OPTIONS',
    'Cache-Control':'no-store, no-cache, max-age=0, s-maxage=0',
    'Pragma':'no-cache',
    'Content-Type':'application/json; charset=utf-8'
  };
  Object.entries(headers).forEach(([k,v])=>res.setHeader(k,v));
}
const TF={ '1m':'1m','3m':'3m','5m':'5m','15m':'15m','30m':'30m','1h':'1h','2h':'2h','4h':'4h','6h':'6h','8h':'8h','12h':'12h','1d':'1d','3d':'3d','1w':'1w','1M':'1M' };
const BYBIT_TF={ '1m':'1','3m':'3','5m':'5','15m':'15','30m':'30','1h':'60','2h':'120','4h':'240','6h':'360','12h':'720','1d':'D','1w':'W','1M':'M' };
const OKX_TF={ '1m':'1m','3m':'3m','5m':'5m','15m':'15m','30m':'30m','1h':'1H','2h':'2H','4h':'4H','6h':'6H','12h':'12H','1d':'1D','1w':'1W','1M':'1M' };
function cleanSymbol(v){return String(v||'BTCUSDT').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,20)||'BTCUSDT';}
function cleanTf(v){const x=String(v||'4h');return TF[x]?x:'4h';}
function cleanLimit(v){return Math.max(20,Math.min(2000,Number(v)||240));}
function baseQuote(symbol){
  const quotes=['USDT','USDC','USD','BTC','ETH'];
  for(const q of quotes){ if(symbol.endsWith(q)) return {base:symbol.slice(0,-q.length), quote:q}; }
  return {base:symbol.replace(/USDT$/,''), quote:'USDT'};
}
function n(v,d=null){const x=Number(v);return Number.isFinite(x)?x:d;}
function round(v,d=4){const x=n(v,0);const p=Math.pow(10,d);return Math.round(x*p)/p;}
function arr(v){return Array.isArray(v)?v:[];}
async function getJson(url, timeout=7200){
  const ctrl=new AbortController(); const t=setTimeout(()=>ctrl.abort(),timeout);
  try{
    const r=await fetch(url,{signal:ctrl.signal,headers:{accept:'application/json','user-agent':'RUx/0.48 Market Data Router'}});
    const text=await r.text(); let j; try{j=JSON.parse(text)}catch{j=text}
    if(!r.ok){const msg=typeof j==='string'?j.slice(0,240):JSON.stringify(j).slice(0,240);throw new Error(`HTTP ${r.status}: ${msg}`)}
    return j;
  } finally { clearTimeout(t); }
}
async function firstOk(label, urls, errors, timeout=7200){
  const attempts=await Promise.allSettled(urls.map(async url=>({url, data:await getJson(url,timeout)})));
  for(const a of attempts){ if(a.status==='fulfilled') return {data:a.value.data, host:new URL(a.value.url).origin}; }
  const detail=attempts.map((a,i)=>`${new URL(urls[i]).host}: ${a.status==='rejected'?(a.reason?.message||String(a.reason)):'unknown'}`).slice(0,4).join(' || ');
  errors.push(`${label}: all hosts rejected${detail?` -> ${detail}`:''}`);
  return {data:null, host:null};
}

async function fetchBinanceKlinesPaged(label, bases, pathPrefix, symbol, interval, limit, errors, timeout=7600){
  const target=Math.max(20,Math.min(2000,Number(limit)||240));
  const page1Limit=Math.min(1000,target);
  const q1=bases.map(b=>`${b}${pathPrefix}/klines?symbol=${symbol}&interval=${interval}&limit=${page1Limit}`);
  const first=await firstOk(label, q1, errors, timeout);
  if(!first.data || !Array.isArray(first.data) || target<=1000 || first.data.length<1000) return first;
  const firstOpen=Number(first.data[0]?.[0]);
  if(!Number.isFinite(firstOpen)) return first;
  const remaining=target-first.data.length;
  if(remaining<=0) return first;
  const q2=bases.map(b=>`${b}${pathPrefix}/klines?symbol=${symbol}&interval=${interval}&limit=${Math.min(1000,remaining)}&endTime=${firstOpen-1}`);
  const older=await firstOk(label + ' older page', q2, [], timeout);
  if(!older.data || !Array.isArray(older.data)) return first;
  const joined=[...older.data, ...first.data];
  const map=new Map();
  joined.forEach(k=>{ const ts=Number(k?.[0]); if(Number.isFinite(ts)) map.set(ts,k); });
  return {data:Array.from(map.entries()).sort((a,b)=>a[0]-b[0]).map(x=>x[1]).slice(-target), host:first.host + '+paged'};
}
function normalizeDepth(d, refPrice){
  const bids=d?.bids||d?.b||[]; const asks=d?.asks||d?.a||[];
  const bid=bids?.[0], ask=asks?.[0];
  const bidPx=n(bid?.[0]), bidQty=n(bid?.[1],0), askPx=n(ask?.[0]), askQty=n(ask?.[1],0);
  const mid=bidPx&&askPx?(bidPx+askPx)/2:n(refPrice,null);
  const spreadBps=bidPx&&askPx&&mid?((askPx-bidPx)/mid)*10000:null;
  const bidUsd=arr(bids).slice(0,20).reduce((s,x)=>s+n(x[0],0)*n(x[1],0),0);
  const askUsd=arr(asks).slice(0,20).reduce((s,x)=>s+n(x[0],0)*n(x[1],0),0);
  return {bidPx,askPx,mid,spreadBps:spreadBps===null?null:round(spreadBps,3),bidUsd:round(bidUsd,2),askUsd:round(askUsd,2),depthUsd:round(bidUsd+askUsd,2),levels:{bids:arr(bids).length,asks:arr(asks).length}};
}
function normalizeBinanceKlines(rows){
  return arr(rows).map(k=>({time:n(k[0]),open:n(k[1]),high:n(k[2]),low:n(k[3]),close:n(k[4]),volume:n(k[5],0),quoteVolume:n(k[7],0),trades:n(k[8],0),takerBuyBase:n(k[9],0),takerBuyQuote:n(k[10],0)})).filter(x=>Number.isFinite(x.time)&&Number.isFinite(x.close)).sort((a,b)=>a.time-b.time);
}
function normalizeBybitKlines(j){
  return arr(j?.result?.list).map(k=>({time:n(k[0]),open:n(k[1]),high:n(k[2]),low:n(k[3]),close:n(k[4]),volume:n(k[5],0),quoteVolume:n(k[6],0)})).filter(x=>Number.isFinite(x.time)&&Number.isFinite(x.close)).sort((a,b)=>a.time-b.time);
}
function normalizeOkxKlines(j){
  return arr(j?.data).map(k=>({time:n(k[0]),open:n(k[1]),high:n(k[2]),low:n(k[3]),close:n(k[4]),volume:n(k[5],0),quoteVolume:n(k[7],0),confirmed:String(k[8]||'')})).filter(x=>Number.isFinite(x.time)&&Number.isFinite(x.close)).sort((a,b)=>a.time-b.time);
}
function calcQuality({spotCandles,futuresCandles,spotTicker,futuresTicker,markPrice, fundingRate, openInterest, spotDepth, futuresDepth, errors, liveTickerTs}){
  let completeness=0, consistency=62, reliability=94;
  if(spotCandles.length>=120) completeness+=22; else if(spotCandles.length>=20) completeness+=14; else if(spotCandles.length) completeness+=8;
  if(futuresCandles.length>=120) completeness+=22; else if(futuresCandles.length>=20) completeness+=14; else if(futuresCandles.length) completeness+=8;
  if(spotTicker?.price) completeness+=14; if(futuresTicker?.price||markPrice) completeness+=14;
  if(fundingRate!==null&&fundingRate!==undefined) completeness+=8; if(openInterest) completeness+=8; if(spotDepth) completeness+=4; if(futuresDepth) completeness+=4;
  reliability -= Math.min(32, arr(errors).length*5);
  const sp=n(spotTicker?.price)||n(spotCandles.at(-1)?.close);
  const fp=n(markPrice)||n(futuresTicker?.price)||n(futuresCandles.at(-1)?.close);
  if(sp&&fp){
    const basis=Math.abs((fp-sp)/sp*100);
    consistency = basis<0.10 ? 94 : basis<0.35 ? 84 : basis<0.75 ? 70 : 55;
  } else if(sp||fp) consistency=58;
  const ageMs=liveTickerTs ? Math.max(0,Date.now()-liveTickerTs) : 0;
  const freshness=liveTickerTs ? (ageMs<15_000?96:ageMs<60_000?88:ageMs<180_000?72:45) : 86;
  const confidence=Math.max(0,Math.min(100,round(freshness*.28+completeness*.30+consistency*.24+Math.max(0,reliability)*.18,1)));
  return {freshness,completeness:Math.max(0,Math.min(100,completeness)),consistency,sourceReliability:Math.max(0,Math.min(100,reliability)),confidence,ageMs:liveTickerTs?ageMs:null};
}
function makePayload({exchange, source, mode, symbol, timeframe, latencyMs, errors, hosts, spotCandles, futuresCandles, spotTicker, futuresTicker, derivatives, spotDepth, futuresDepth}){
  const spotPrice=n(spotTicker?.price)||n(spotCandles.at(-1)?.close);
  const markPrice=n(derivatives?.markPrice)||n(futuresTicker?.price)||n(futuresCandles.at(-1)?.close);
  const futuresLast=n(futuresTicker?.price)||n(futuresCandles.at(-1)?.close);
  const basisPct=spotPrice&&markPrice?((markPrice-spotPrice)/spotPrice)*100:null;
  const quality=calcQuality({spotCandles,futuresCandles,spotTicker,futuresTicker,markPrice,fundingRate:derivatives?.fundingRate,openInterest:derivatives?.openInterest,spotDepth,futuresDepth,errors,liveTickerTs:spotTicker?.timestamp||futuresTicker?.timestamp||null});
  const ok=Boolean(spotPrice&&(markPrice||futuresLast)&&spotCandles.length&&futuresCandles.length);
  const finalMode=ok?(exchange==='binance'?'LIVE':'LIVE_MULTI_EXCHANGE'):(spotPrice||spotCandles.length?'DEGRADED':'OFFLINE');
  return {
    ok, version:'RUx v0.72.1', source, mode: mode||finalMode, activeExchange:exchange, symbol, timeframe, interval:timeframe, latencyMs, updatedAt:Date.now(), errors:arr(errors).slice(0,12), hosts,
    spot:{source:`${exchange.toUpperCase()} Spot`, candles:spotCandles, ticker:spotTicker?.price?spotTicker:(spotPrice?{price:spotPrice,change:0,quoteVolume:null,count:null,timestamp:null}:null), depth:spotDepth},
    futures:{source:`${exchange.toUpperCase()} Perp/Futures`, candles:futuresCandles, ticker:futuresTicker?.price?futuresTicker:(futuresLast?{price:futuresLast,change:0,quoteVolume:null,count:null,timestamp:null}:null), depth:futuresDepth},
    derivatives:{fundingRate:derivatives?.fundingRate??null,nextFundingTime:derivatives?.nextFundingTime??null,markPrice,indexPrice:derivatives?.indexPrice??null,openInterest:derivatives?.openInterest??null,openInterestTime:derivatives?.openInterestTime??null,fundingRows:arr(derivatives?.fundingRows),oiHistory:arr(derivatives?.oiHistory)},
    basis:{basisPct:basisPct===null?null:round(basisPct,5), spotPrice, markPrice, futuresLast},
    quality, normalized:true, router:true, noStore:true
  };
}
async function fetchBinance(symbol,tf,limit){
  const started=Date.now(); const errors=[];
  const interval=tf;
  const spotBases=['https://data-api.binance.vision','https://api.binance.com','https://api1.binance.com','https://api2.binance.com','https://api3.binance.com'];
  const futBases=['https://fapi.binance.com','https://fapi1.binance.com','https://fapi2.binance.com','https://fapi3.binance.com'];
  const [spotK,spotT,futK,prem,oi,futT,spotD,futD]=await Promise.all([
    fetchBinanceKlinesPaged('binance spot klines', spotBases, '/api/v3', symbol, interval, limit, errors, 7600),
    firstOk('binance spot ticker', spotBases.map(b=>`${b}/api/v3/ticker/24hr?symbol=${symbol}`), errors, 6200),
    fetchBinanceKlinesPaged('binance futures klines', futBases, '/fapi/v1', symbol, interval, limit, errors, 7200),
    firstOk('binance premium index', futBases.map(b=>`${b}/fapi/v1/premiumIndex?symbol=${symbol}`), errors, 6200),
    firstOk('binance open interest', futBases.map(b=>`${b}/fapi/v1/openInterest?symbol=${symbol}`), errors, 6200),
    firstOk('binance futures ticker', futBases.map(b=>`${b}/fapi/v1/ticker/24hr?symbol=${symbol}`), errors, 6200),
    firstOk('binance spot depth', spotBases.filter(b=>!b.includes('data-api')).map(b=>`${b}/api/v3/depth?symbol=${symbol}&limit=50`), [], 5000),
    firstOk('binance futures depth', futBases.map(b=>`${b}/fapi/v1/depth?symbol=${symbol}&limit=50`), [], 5000)
  ]);
  const spotCandles=normalizeBinanceKlines(spotK.data);
  const futuresCandles=normalizeBinanceKlines(futK.data);
  const spotTicker=spotT.data?{price:n(spotT.data.lastPrice),change:n(spotT.data.priceChangePercent,0),quoteVolume:n(spotT.data.quoteVolume,0),count:n(spotT.data.count,0),timestamp:n(spotT.data.closeTime,null)}:null;
  const futuresTicker=futT.data?{price:n(futT.data.lastPrice),change:n(futT.data.priceChangePercent,0),quoteVolume:n(futT.data.quoteVolume,0),count:n(futT.data.count,0),timestamp:n(futT.data.closeTime,null)}:null;
  const derivatives={fundingRate:n(prem.data?.lastFundingRate,null),nextFundingTime:n(prem.data?.nextFundingTime,null),markPrice:n(prem.data?.markPrice,null),indexPrice:n(prem.data?.indexPrice,null),openInterest:n(oi.data?.openInterest,null),openInterestTime:n(oi.data?.time,null)};
  return makePayload({exchange:'binance',source:'BINANCE ROUTER',symbol,timeframe:tf,latencyMs:Date.now()-started,errors,hosts:{spotKlines:spotK.host,spotTicker:spotT.host,futuresKlines:futK.host,premiumIndex:prem.host,openInterest:oi.host},spotCandles,futuresCandles,spotTicker,futuresTicker,derivatives,spotDepth:spotD.data?normalizeDepth(spotD.data,spotTicker?.price):null,futuresDepth:futD.data?normalizeDepth(futD.data,derivatives.markPrice):null});
}
async function fetchBybit(symbol,tf,limit){
  const started=Date.now(); const errors=[]; const interval=BYBIT_TF[tf]||'240'; const base='https://api.bybit.com';
  const qSym=encodeURIComponent(symbol);
  const [spotK,linK,spotT,linT,spotD,linD,fundingRows,oiHist]=await Promise.all([
    firstOk('bybit spot klines',[`${base}/v5/market/kline?category=spot&symbol=${qSym}&interval=${interval}&limit=${limit}`],errors,7200),
    firstOk('bybit linear klines',[`${base}/v5/market/kline?category=linear&symbol=${qSym}&interval=${interval}&limit=${limit}`],errors,7200),
    firstOk('bybit spot ticker',[`${base}/v5/market/tickers?category=spot&symbol=${qSym}`],errors,6200),
    firstOk('bybit linear ticker',[`${base}/v5/market/tickers?category=linear&symbol=${qSym}`],errors,6200),
    firstOk('bybit spot depth',[`${base}/v5/market/orderbook?category=spot&symbol=${qSym}&limit=50`],[],5000),
    firstOk('bybit linear depth',[`${base}/v5/market/orderbook?category=linear&symbol=${qSym}&limit=50`],[],5000),
    firstOk('bybit funding history',[`${base}/v5/market/funding/history?category=linear&symbol=${qSym}&limit=20`],[],5000),
    firstOk('bybit oi history',[`${base}/v5/market/open-interest?category=linear&symbol=${qSym}&intervalTime=5min&limit=30`],[],5000)
  ]);
  const sp=spotT.data?.result?.list?.[0]||{}; const lp=linT.data?.result?.list?.[0]||{};
  const spotTicker=sp.lastPrice?{price:n(sp.lastPrice),change:n(sp.price24hPcnt,0)*100,quoteVolume:n(sp.turnover24h,0),count:null,timestamp:Date.now()}:null;
  const futuresTicker=lp.lastPrice?{price:n(lp.lastPrice),change:n(lp.price24hPcnt,0)*100,quoteVolume:n(lp.turnover24h,0),count:null,timestamp:Date.now()}:null;
  const derivatives={fundingRate:n(lp.fundingRate,null),nextFundingTime:n(lp.nextFundingTime,null),markPrice:n(lp.markPrice,null),indexPrice:n(lp.indexPrice,null),openInterest:n(lp.openInterest,null),openInterestTime:Date.now(),fundingRows:arr(fundingRows.data?.result?.list).map(x=>({time:n(x.fundingRateTimestamp),rate:n(x.fundingRate)})),oiHistory:arr(oiHist.data?.result?.list).map(x=>({time:n(x.timestamp),sumOpenInterest:n(x.openInterest),sumOpenInterestValue:n(x.openInterestValue)}))};
  return makePayload({exchange:'bybit',source:'BYBIT PUBLIC ROUTER FALLBACK',symbol,timeframe:tf,latencyMs:Date.now()-started,errors,hosts:{spotKlines:spotK.host,linearKlines:linK.host,spotTicker:spotT.host,linearTicker:linT.host},spotCandles:normalizeBybitKlines(spotK.data),futuresCandles:normalizeBybitKlines(linK.data),spotTicker,futuresTicker,derivatives,spotDepth:spotD.data?.result?normalizeDepth({b:spotD.data.result.b,a:spotD.data.result.a},spotTicker?.price):null,futuresDepth:linD.data?.result?normalizeDepth({b:linD.data.result.b,a:linD.data.result.a},derivatives.markPrice):null});
}
async function fetchOkx(symbol,tf,limit){
  const started=Date.now(); const errors=[]; const bq=baseQuote(symbol); const spotId=`${bq.base}-${bq.quote}`; const swapId=`${bq.base}-${bq.quote}-SWAP`; const bar=OKX_TF[tf]||'4H'; const base='https://www.okx.com';
  const [spotK,swapK,spotT,swapT,spotD,swapD,funding,oi]=await Promise.all([
    firstOk('okx spot candles',[`${base}/api/v5/market/candles?instId=${spotId}&bar=${bar}&limit=${limit}`],errors,7200),
    firstOk('okx swap candles',[`${base}/api/v5/market/candles?instId=${swapId}&bar=${bar}&limit=${limit}`],errors,7200),
    firstOk('okx spot ticker',[`${base}/api/v5/market/ticker?instId=${spotId}`],errors,6200),
    firstOk('okx swap ticker',[`${base}/api/v5/market/ticker?instId=${swapId}`],errors,6200),
    firstOk('okx spot book',[`${base}/api/v5/market/books?instId=${spotId}&sz=50`],[],5000),
    firstOk('okx swap book',[`${base}/api/v5/market/books?instId=${swapId}&sz=50`],[],5000),
    firstOk('okx funding',[`${base}/api/v5/public/funding-rate?instId=${swapId}`],[],5000),
    firstOk('okx open interest',[`${base}/api/v5/public/open-interest?instType=SWAP&instId=${swapId}`],[],5000)
  ]);
  const st=spotT.data?.data?.[0]||{}; const wt=swapT.data?.data?.[0]||{}; const fd=funding.data?.data?.[0]||{}; const oid=oi.data?.data?.[0]||{};
  const spotTicker=st.last?{price:n(st.last),change:0,quoteVolume:n(st.volCcy24h,0),count:null,timestamp:n(st.ts,Date.now())}:null;
  const futuresTicker=wt.last?{price:n(wt.last),change:0,quoteVolume:n(wt.volCcy24h,0),count:null,timestamp:n(wt.ts,Date.now())}:null;
  const derivatives={fundingRate:n(fd.fundingRate,null),nextFundingTime:n(fd.nextFundingTime,null),markPrice:n(wt.last,null),indexPrice:n(fd.indexPrice,null),openInterest:n(oid.oi,null),openInterestTime:n(oid.ts,Date.now())};
  const sd=spotD.data?.data?.[0], wd=swapD.data?.data?.[0];
  return makePayload({exchange:'okx',source:'OKX PUBLIC ROUTER FALLBACK',symbol,timeframe:tf,latencyMs:Date.now()-started,errors,hosts:{spotKlines:spotK.host,swapKlines:swapK.host,spotTicker:spotT.host,swapTicker:swapT.host},spotCandles:normalizeOkxKlines(spotK.data),futuresCandles:normalizeOkxKlines(swapK.data),spotTicker,futuresTicker,derivatives,spotDepth:sd?normalizeDepth({bids:sd.bids,asks:sd.asks},spotTicker?.price):null,futuresDepth:wd?normalizeDepth({bids:wd.bids,asks:wd.asks},derivatives.markPrice):null});
}
function rankPayload(p){
  const q=n(p?.quality?.confidence,0); const complete=(p?.spot?.ticker?.price?10:0)+(p?.futures?.ticker?.price||p?.derivatives?.markPrice?10:0)+(arr(p?.spot?.candles).length?8:0)+(arr(p?.futures?.candles).length?8:0)+(p?.derivatives?.fundingRate!==null&&p?.derivatives?.fundingRate!==undefined?5:0)+(p?.derivatives?.openInterest?5:0);
  return q + complete;
}
module.exports=async function handler(req,res){
  setHeaders(req,res);
  if((req.method||'GET')==='OPTIONS'){res.status(204).send('');return;}
  const symbol=cleanSymbol(req.query?.symbol), tf=cleanTf(req.query?.tf), limit=cleanLimit(req.query?.limit);
  const started=Date.now();
  try{
    const results=await Promise.allSettled([fetchBinance(symbol,tf,limit),fetchBybit(symbol,tf,limit),fetchOkx(symbol,tf,limit)]);
    const payloads=results.filter(x=>x.status==='fulfilled').map(x=>x.value).filter(Boolean);
    const hardErrors=results.filter(x=>x.status==='rejected').map(x=>x.reason?.message||String(x.reason));
    payloads.sort((a,b)=>rankPayload(b)-rankPayload(a));
    const best=payloads[0];
    if(!best){res.status(200).json({ok:false,version:'RUx v0.72.1',source:'Market Data Router OFFLINE',mode:'OFFLINE',symbol,timeframe:tf,activeExchange:null,errors:hardErrors,updatedAt:Date.now(),spot:{candles:[]},futures:{candles:[]},derivatives:{},basis:null,quality:{confidence:0,freshness:0,completeness:0,consistency:0,sourceReliability:0}});return;}
    best.routerLatencyMs=Date.now()-started;
    best.fallbackChain=payloads.map(p=>({exchange:p.activeExchange,mode:p.mode,confidence:p.quality?.confidence,spot:Boolean(p.spot?.ticker?.price),futures:Boolean(p.futures?.ticker?.price||p.derivatives?.markPrice),errors:arr(p.errors).slice(0,2)}));
    best.allExchangeErrors=[...arr(best.errors),...hardErrors].slice(0,16);
    best.source = best.activeExchange==='binance' && best.ok ? 'BINANCE LIVE ROUTER' : `${String(best.activeExchange||'multi').toUpperCase()} LIVE ROUTER FALLBACK`;
    res.status(200).json(best);
  }catch(e){
    res.status(200).json({ok:false,version:'RUx v0.72.1',source:'Market Data Router ERROR',mode:'OFFLINE',symbol,timeframe:tf,errors:[e?.message||String(e)],updatedAt:Date.now(),spot:{candles:[]},futures:{candles:[]},derivatives:{},basis:null,quality:{confidence:0,freshness:0,completeness:0,consistency:0,sourceReliability:0}});
  }
};

  return module.exports;
})();

HANDLERS['news'] = HANDLERS['news-pulse'];

// ── TÜREV VERİ (Derivatives) — Open Interest, Funding, CVD, Likidasyon, Heatmap ──
// Tümü ücretsiz, auth gerektirmeyen borsa API'lerinden. Binance ana kaynak;
// Bybit/OKX ek/çapraz doğrulama. Backend'den çağrılır (Türkiye IP kısıtı by-pass).
// ?type=oi|funding|cvd|liquidations|heatmap  ?symbol=BTCUSDT  ?period=5m
HANDLERS['derivs'] = (() => {
  async function fetchJson(url, timeout = 8000) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeout);
    try {
      const r = await fetch(url, { signal: ctrl.signal, headers: { 'Accept': 'application/json' } });
      clearTimeout(t);
      if (!r.ok) return { _err: 'HTTP ' + r.status };
      return await r.json();
    } catch (e) { clearTimeout(t); return { _err: e?.message || String(e) }; }
  }

  const BINANCE = 'https://fapi.binance.com';
  const BYBIT = 'https://api.bybit.com';
  const OKX = 'https://www.okx.com';

  // Sembol normalize: BTCUSDT (Binance/Bybit), BTC-USDT-SWAP (OKX)
  function okxInst(sym) {
    const base = sym.replace(/USDT$/, '');
    return `${base}-USDT-SWAP`;
  }

  // 1) OPEN INTEREST — geçmiş seri (çoklu borsa) + anlık
  // İstatistik yardımcıları (handler kapsamında)
  function _mean(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0; }
  function _std(a) { if (a.length < 2) return 0; const m = _mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / a.length); }
  function _zscore(arr, val) { const m = _mean(arr); const s = _std(arr); return s ? (val - m) / s : 0; }
  function _ema(arr, p) { if (!arr.length) return []; const k = 2 / (p + 1); const out = [arr[0]]; for (let i = 1; i < arr.length; i++) out.push(arr[i] * k + out[i - 1] * (1 - k)); return out; }

  async function getOpenInterest(symbol, period) {
    const out = { type: 'oi', symbol, period, exchanges: {}, series: [], priceSeries: [], errors: [], dataStatus: [], decisionImpact: {} };
    // Binance OI geçmişi (USD + kontrat)
    const normalizedPeriod = period === '1w' ? '1d' : period;
    const priceInterval = { '5m': '5m', '15m': '15m', '1h': '1h', '4h': '4h', '1d': '1d', '1w': '1d' }[period] || '15m';
    const bybitInterval = { '5m': '5min', '15m': '15min', '1h': '1h', '4h': '4h', '1d': '1d', '1w': '1d' }[period] || '15min';
    const lookbackBars24h = { '5m': 288, '15m': 96, '1h': 24, '4h': 6, '1d': 1, '1w': 7 }[period] || 96;
    const oiHistLimit = period === '5m' ? 320 : 220;
    const priceHistLimit = period === '5m' ? 320 : 220;
    const bHist = await fetchJson(`${BINANCE}/futures/data/openInterestHist?symbol=${symbol}&period=${normalizedPeriod}&limit=${oiHistLimit}`);
    if (Array.isArray(bHist)) {
      out.series = bHist.map(d => ({ time: Number(d.timestamp), oi: Number(d.sumOpenInterest), oiUsd: Number(d.sumOpenInterestValue) }));
      const last = out.series.at(-1);
      if (last) out.exchanges.binance = { oi: last.oi, oiUsd: last.oiUsd };
      out.dataStatus.push({ key: 'binance_oi_history', label: 'Binance OI Geçmişi', provider: 'Binance Futures', status: out.series.length ? 'live' : 'offline', rows: out.series.length, impact: out.series.length ? 'decision-included' : 'excluded', note: out.series.length ? 'Ana OI serisi canlı' : 'OI serisi boş' });
    } else {
      out.errors.push('binance: ' + (bHist._err || 'veri yok'));
      out.dataStatus.push({ key: 'binance_oi_history', label: 'Binance OI Geçmişi', provider: 'Binance Futures', status: 'offline', rows: 0, impact: 'excluded', note: bHist._err || 'Veri alınamadı' });
    }
    // Fiyat serisi (OI/price divergence + ısı bantları için)
    const kl = await fetchJson(`${BINANCE}/fapi/v1/klines?symbol=${symbol}&interval=${priceInterval}&limit=${priceHistLimit}`);
    if (Array.isArray(kl)) {
      out.priceSeries = kl.map(c => ({ time: Number(c[0]), open: Number(c[1]), high: Number(c[2]), low: Number(c[3]), close: Number(c[4]), vol: Number(c[5]) }));
      out.dataStatus.push({ key: 'binance_price_candles', label: 'Fiyat Mumları', provider: 'Binance Futures', status: out.priceSeries.length ? 'live' : 'offline', rows: out.priceSeries.length, impact: out.priceSeries.length ? 'decision-included' : 'excluded', note: out.priceSeries.length ? 'Fiyat/OI overlay için canlı' : 'Mum serisi boş' });
    } else {
      out.errors.push('binance price: ' + (kl?._err || 'veri yok'));
      out.dataStatus.push({ key: 'binance_price_candles', label: 'Fiyat Mumları', provider: 'Binance Futures', status: 'offline', rows: 0, impact: 'excluded', note: kl?._err || 'Fiyat serisi alınamadı' });
    }
    // Bybit + OKX anlık OI (USD dağılımı için fiyatla çarpılır)
    const price = out.priceSeries.at(-1)?.close || 0;
    const byOi = await fetchJson(`${BYBIT}/v5/market/open-interest?category=linear&symbol=${symbol}&intervalTime=${bybitInterval}&limit=1`);
    if (byOi?.result?.list?.length) { const c = Number(byOi.result.list[0].openInterest); out.exchanges.bybit = { oi: c, oiUsd: c * price }; out.dataStatus.push({ key: 'bybit_oi', label: 'Bybit OI', provider: 'Bybit', status: 'live', rows: byOi.result.list.length, impact: 'exchange-split', note: 'Borsa dağılımına dahil' }); }
    else { if (byOi._err) out.errors.push('bybit: ' + byOi._err); out.dataStatus.push({ key: 'bybit_oi', label: 'Bybit OI', provider: 'Bybit', status: 'offline', rows: 0, impact: 'exchange-split-excluded', note: byOi?._err || 'Veri yok' }); }
    const okOi = await fetchJson(`${OKX}/api/v5/public/open-interest?instId=${okxInst(symbol)}`);
    if (okOi?.data?.length) { out.exchanges.okx = { oi: Number(okOi.data[0].oi), oiUsd: Number(okOi.data[0].oiCcy) * price || Number(okOi.data[0].oi) * price }; out.dataStatus.push({ key: 'okx_oi', label: 'OKX OI', provider: 'OKX', status: 'live', rows: okOi.data.length, impact: 'exchange-split', note: 'Borsa dağılımına dahil' }); }
    else { if (okOi._err) out.errors.push('okx: ' + okOi._err); out.dataStatus.push({ key: 'okx_oi', label: 'OKX OI', provider: 'OKX', status: 'offline', rows: 0, impact: 'exchange-split-excluded', note: okOi?._err || 'Veri yok' }); }

    // ── Türetilmiş metrikler (mockup için) ──
    const oiUsdArr = out.series.map(s => s.oiUsd).filter(Boolean);
    const last = out.series.at(-1);
    const prev24Idx = Math.max(0, out.series.length - 1 - lookbackBars24h);
    const prev24 = out.series[prev24Idx] || out.series[0];
    out.totalOiUsd = Object.values(out.exchanges).reduce((s, e) => s + (e.oiUsd || 0), 0);
    // 24s OI delta (USD ve %)
    out.oiDelta24hUsd = last && prev24 ? last.oiUsd - prev24.oiUsd : 0;
    out.oiDelta24hPct = last && prev24 && prev24.oiUsd ? ((last.oiUsd - prev24.oiUsd) / prev24.oiUsd) * 100 : 0;
    // OI Z-score (son 200 örneğe göre)
    out.oiZScore = last ? Math.round(_zscore(oiUsdArr, last.oiUsd) * 100) / 100 : 0;
    // OI Momentum: EMA21 eğimi (%)
    if (oiUsdArr.length > 21) { const e = _ema(oiUsdArr, 21); const slope = ((e.at(-1) - e.at(-21)) / e.at(-21)) * 100; out.oiMomentum = Math.round(slope * 100) / 100; } else out.oiMomentum = 0;
    // OI/Price divergence: OI yönü ile fiyat yönü uyumsuzluğu
    const pArr = out.priceSeries.map(p => p.close);
    const pricePrevIdx = Math.max(0, pArr.length - 1 - lookbackBars24h);
    const pricePrev = pArr[pricePrevIdx] || pArr[0] || 0;
    const priceChg = pArr.length > 1 && pricePrev ? ((pArr.at(-1) - pricePrev) / pricePrev) * 100 : 0;
    out.priceChg24hPct = Math.round(priceChg * 100) / 100;
    out.oiPriceDivergence = Math.round((out.oiDelta24hPct - priceChg) * 100) / 100;
    // Rejim sınıflaması (mockup OI Rejim Rehberi)
    const oiUp = out.oiDelta24hPct >= 0, priceUp = priceChg >= 0;
    out.regime = oiUp && priceUp ? 'TREND_TEYIDI' : (!oiUp && priceUp) ? 'ZAYIF_YUKSELIS' : (oiUp && !priceUp) ? 'DAGITIM' : 'KAPITULASYON';
    out.regimeLabel = { TREND_TEYIDI: 'Trend Teyidi', ZAYIF_YUKSELIS: 'Zayıf Yükseliş', DAGITIM: 'Dağıtım', KAPITULASYON: 'Kapitülasyon' }[out.regime];
    out.bias = priceUp ? 'BULLISH' : 'BEARISH';
    // Squeeze riski (0-100): yüksek OI Z + yön → ezme riski
    const sq = Math.min(100, Math.max(0, Math.round(50 + out.oiZScore * 18 + (oiUp ? 8 : -8))));
    out.squeezeRisk = sq;
    out.squeezeSide = priceUp ? 'long' : 'short';
    // Borsa USD dağılımı (yüzde)
    const totalEx = Object.values(out.exchanges).reduce((s, e) => s + (e.oiUsd || 0), 0) || 1;
    out.distribution = Object.entries(out.exchanges).map(([ex, v]) => ({ exchange: ex, oiUsd: v.oiUsd || 0, pct: Math.round((v.oiUsd || 0) / totalEx * 1000) / 10 })).sort((a, b) => b.oiUsd - a.oiUsd);
    // OI ısı bantları (fiyat bazlı kümeler): fiyat seviyelerine OI değişimi ata
    out.heatBands = buildOiHeatBands(out.priceSeries, out.series);
    // Tek bakışta yorum (otomatik)
    out.commentary = buildOiCommentary(out);
    out.source = Object.keys(out.exchanges).join('+') || 'none';
    const primaryOk = out.series.length > 0 && out.priceSeries.length > 0;
    const liveCount = out.dataStatus.filter(x => x.status === 'live').length;
    out.dataQuality = !primaryOk ? 'offline' : liveCount < out.dataStatus.length ? 'degraded' : 'live';
    out.decisionImpact = {
      oiSeries: out.series.length ? 'included' : 'excluded',
      priceSeries: out.priceSeries.length ? 'included' : 'excluded',
      exchangeSplit: out.distribution.length >= 2 ? 'included' : 'degraded',
      derivedMetrics: primaryOk ? 'included' : 'excluded'
    };
    return out;
  }

  // OI ısı bantları: son N mumun fiyat aralığını fiyat kümelerine böler, her banda OI-ağırlıklı yoğunluk atar
  function buildOiHeatBands(priceSeries, oiSeries) {
    if (!priceSeries || priceSeries.length < 10) return [];
    const recent = priceSeries.slice(-96).filter(p => Number.isFinite(p?.high) && Number.isFinite(p?.low) && Number.isFinite(p?.close));
    if (recent.length < 10) return [];
    const hi = Math.max(...recent.map(p => Number(p.high)));
    const lo = Math.min(...recent.map(p => Number(p.low)));
    const priceRange = Math.max(Math.abs(hi - lo), Math.abs(hi || 1) * 0.02, 1e-8);
    const bins = Math.max(6, Math.min(10, priceRange < 1 ? 8 : 7));
    const step = priceRange / bins || 1;
    const totalVol = recent.reduce((s, p) => s + (Number(p.vol) || 0), 0) || 1;
    const lastOiUsd = Number(oiSeries?.at?.(-1)?.oiUsd || 0);
    const bands = [];
    for (let i = 0; i < bins; i++) {
      const low = lo + step * i;
      const high = (i === bins - 1) ? hi : low + step;
      let volWeight = 0;
      recent.forEach(p => {
        const candleLow = Number(p.low ?? p.close);
        const candleHigh = Number(p.high ?? p.close);
        const candleRange = Math.max(candleHigh - candleLow, 1e-8);
        const overlap = Math.max(0, Math.min(candleHigh, high) - Math.max(candleLow, low));
        if (overlap > 0) volWeight += (Number(p.vol) || 0) * (overlap / candleRange);
      });
      bands.push({
        price: (low + high) / 2,
        low,
        high,
        oiUsd: Math.max(0, volWeight * (lastOiUsd / totalVol)),
      });
    }
    return bands.sort((a, b) => (b.price || 0) - (a.price || 0));
  }

  // Otomatik "tek bakışta yorum" satırları
  function buildOiCommentary(o) {
    const c = [];
    if (o.oiDelta24hPct >= 0 && o.priceChg24hPct >= 0) c.push({ tone: 'pos', text: 'OI artışı fiyat yükselişi ile birlikte. Trend teyidi güçleniyor.' });
    else if (o.oiDelta24hPct >= 0 && o.priceChg24hPct < 0) c.push({ tone: 'neg', text: 'OI artarken fiyat düşüyor. Dağıtım/short baskısı olabilir.' });
    else if (o.oiDelta24hPct < 0 && o.priceChg24hPct >= 0) c.push({ tone: 'warn', text: 'Fiyat yükselirken OI düşüyor. Yükseliş zayıf, sürdürülemeyebilir.' });
    else c.push({ tone: 'warn', text: 'OI ve fiyat birlikte düşüyor. Kapitülasyon/dip arayışı.' });
    if (o.oiDelta24hUsd >= 0) c.push({ tone: 'pos', text: 'OI Delta pozitifte ve ivmeleniyor. Pozisyonlar artıyor.' });
    if (o.oiPriceDivergence < -0.3) c.push({ tone: 'neg', text: 'Divergence negatif bölgede. Kısa vadede düzeltme riski var.' });
    if (o.squeezeRisk >= 65) c.push({ tone: 'neg', text: `Squeeze riski yüksek (${o.squeezeRisk}/100). ${o.squeezeSide === 'long' ? 'Uzun' : 'Kısa'} pozisyonlar risk altında.` });
    return c;
  }

  // 2) FUNDING — anlık + geçmiş (çoklu borsa)
  async function fetchPostJson(url, body, timeout = 8000) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeout);
    try {
      const r = await fetch(url, {
        method: 'POST',
        signal: ctrl.signal,
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {})
      });
      clearTimeout(t);
      if (!r.ok) return { _err: 'HTTP ' + r.status };
      return await r.json();
    } catch (e) { clearTimeout(t); return { _err: e?.message || String(e) }; }
  }
  function fundingStats(rows, lookbackMs = 30 * 24 * 60 * 60 * 1000) {
    const now = Date.now();
    const sample = (rows || [])
      .filter(x => Number.isFinite(Number(x.rate)))
      .filter(x => !Number.isFinite(Number(x.time)) || Number(x.time) >= now - lookbackMs)
      .map(x => Number(x.rate));
    const vals = sample.length >= 5 ? sample : (rows || []).map(x => Number(x.rate)).filter(Number.isFinite);
    const mean = vals.length ? vals.reduce((a,b)=>a+b,0) / vals.length : 0;
    const std = vals.length > 1 ? Math.sqrt(vals.reduce((s,x)=>s+(x-mean)**2,0) / vals.length) : 0;
    const last = vals.at(-1) ?? 0;
    return { mean, std, z: std ? (last - mean) / std : 0, count: vals.length };
  }
  function averageFunding(rows, hours) {
    const cutoff = Date.now() - hours * 60 * 60 * 1000;
    const vals = (rows || [])
      .filter(x => Number.isFinite(Number(x.rate)))
      .filter(x => !Number.isFinite(Number(x.time)) || Number(x.time) >= cutoff)
      .map(x => Number(x.rate));
    return vals.length ? vals.reduce((a,b)=>a+b,0) / vals.length : null;
  }
  async function getYahooQuote(symbol) {
    const j = await fetchJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=2d&interval=1h`);
    const result = j?.chart?.result?.[0];
    const q = result?.indicators?.quote?.[0] || {};
    const closes = (q.close || []).map(Number).filter(Number.isFinite);
    return closes.length ? closes.at(-1) : null;
  }
  async function getFunding(symbol, period = '4h') {
    const out = {
      type: 'funding', symbol,
      period,
      exchanges: {}, history: [], historyFull: [], priceSeries: [], premiumSeries: [], basis: {}, termStructure: {},
      errors: [], dataStatus: [], source: 'none', dataQuality: 'offline', decisionImpact: {}
    };
    const normPeriod = String(period || '4h').toLowerCase();
    const fundingWindowByPeriod = { '5m': 18, '15m': 24, '1h': 36, '4h': 72, '1d': 180, '1w': 420 };
    const priceLimitByPeriod = { '5m': 240, '15m': 240, '1h': 240, '4h': 210, '1d': 180, '1w': 156 };
    const priceIntervalByPeriod = { '5m': '5m', '15m': '15m', '1h': '1h', '4h': '4h', '1d': '1d', '1w': '1w' };
    const fundingLimit = Math.min(1000, Math.max(100, fundingWindowByPeriod[normPeriod] || 120));
    const priceInterval = priceIntervalByPeriod[normPeriod] || '4h';
    const priceLimit = Math.min(1000, Math.max(80, priceLimitByPeriod[normPeriod] || 180));

    const bPrem = await fetchJson(`${BINANCE}/fapi/v1/premiumIndex?symbol=${symbol}`);
    if (bPrem && !bPrem._err) {
      out.exchanges.binance = {
        funding: Number(bPrem.lastFundingRate),
        markPrice: Number(bPrem.markPrice),
        indexPrice: Number(bPrem.indexPrice),
        nextFundingTime: Number(bPrem.nextFundingTime),
      };
      out.basis.markPrice = Number(bPrem.markPrice);
      out.basis.indexPrice = Number(bPrem.indexPrice);
      out.basis.indexPremiumPct = Number(bPrem.indexPrice) ? ((Number(bPrem.markPrice) - Number(bPrem.indexPrice)) / Number(bPrem.indexPrice)) * 100 : null;
      out.dataStatus.push({ key: 'binance_premium', label: 'Binance Premium Index', provider: 'Binance Futures', status: 'live', rows: 1, impact: 'decision-included', note: 'Anlık funding / mark / index canlı' });
    } else {
      out.errors.push('binance premium: ' + (bPrem?._err || 'veri yok'));
      out.dataStatus.push({ key: 'binance_premium', label: 'Binance Premium Index', provider: 'Binance Futures', status: 'offline', rows: 0, impact: 'excluded', note: bPrem?._err || 'Veri alınamadı' });
    }

    const bHist = await fetchJson(`${BINANCE}/fapi/v1/fundingRate?symbol=${symbol}&limit=${fundingLimit}`);
    if (Array.isArray(bHist)) {
      out.historyFull = bHist.map(d => ({ time: Number(d.fundingTime), rate: Number(d.fundingRate) })).filter(x => Number.isFinite(x.rate)).sort((a,b)=>a.time-b.time);
      out.history = out.historyFull.slice(-(fundingWindowByPeriod[normPeriod] || 120));
      out.dataStatus.push({ key: 'binance_funding_history', label: 'Funding Geçmişi', provider: 'Binance Futures', status: out.history.length ? 'live' : 'offline', rows: out.history.length, impact: out.history.length ? 'decision-included' : 'excluded', note: `Z-score / ortalama / volatilite hesaplarında kullanılır · pencere=${normPeriod}` });
    } else {
      out.errors.push('binance funding history: ' + (bHist?._err || 'veri yok'));
      out.dataStatus.push({ key: 'binance_funding_history', label: 'Funding Geçmişi', provider: 'Binance Futures', status: 'offline', rows: 0, impact: 'excluded', note: bHist?._err || 'Veri alınamadı' });
    }

    const kl = await fetchJson(`${BINANCE}/fapi/v1/klines?symbol=${symbol}&interval=${priceInterval}&limit=${priceLimit}`);
    if (Array.isArray(kl)) {
      out.priceSeries = kl.map(c => ({ time: Number(c[0]), open: Number(c[1]), high: Number(c[2]), low: Number(c[3]), close: Number(c[4]), volume: Number(c[5]) })).filter(x => Number.isFinite(x.close));
      out.dataStatus.push({ key: 'binance_8h_price', label: `${priceInterval} Fiyat Serisi`, provider: 'Binance Futures', status: out.priceSeries.length ? 'live' : 'offline', rows: out.priceSeries.length, impact: 'chart-context', note: `Funding grafiğinde seçili zaman dilimi (${normPeriod}) overlay için kullanılır` });
    } else if (kl?._err) {
      out.errors.push('binance price klines: ' + kl._err);
    }

    const premK = await fetchJson(`${BINANCE}/fapi/v1/premiumIndexKlines?symbol=${symbol}&interval=${priceInterval}&limit=${Math.min(500, priceLimit)}`);
    if (Array.isArray(premK)) {
      out.premiumSeries = premK.map(c => ({ time: Number(c[0]), premiumPct: Number(c[4]) * 100 })).filter(x => Number.isFinite(x.premiumPct));
      const prev24 = out.premiumSeries.at(-25)?.premiumPct;
      const last = out.premiumSeries.at(-1)?.premiumPct;
      out.basis.premium24hChangePct = Number.isFinite(last) && Number.isFinite(prev24) ? last - prev24 : null;
    }

    const byTick = await fetchJson(`${BYBIT}/v5/market/tickers?category=linear&symbol=${symbol}`);
    if (byTick?.result?.list?.length) {
      const x = byTick.result.list[0];
      out.exchanges.bybit = { funding: Number(x.fundingRate), markPrice: Number(x.markPrice), indexPrice: Number(x.indexPrice) };
      out.dataStatus.push({ key: 'bybit_funding', label: 'Bybit Funding', provider: 'Bybit', status: 'live', rows: 1, impact: 'exchange-split', note: 'Borsa karşılaştırmasına dahil' });
    } else { if (byTick?._err) out.errors.push('bybit: ' + byTick._err); out.dataStatus.push({ key: 'bybit_funding', label: 'Bybit Funding', provider: 'Bybit', status: 'offline', rows: 0, impact: 'exchange-split-excluded', note: byTick?._err || 'Veri yok' }); }

    const okF = await fetchJson(`${OKX}/api/v5/public/funding-rate?instId=${okxInst(symbol)}`);
    if (okF?.data?.length) {
      const x = okF.data[0];
      out.exchanges.okx = { funding: Number(x.fundingRate), markPrice: Number(x.markPx), indexPrice: Number(x.indexPx), nextFundingTime: Number(x.nextFundingTime) };
      out.dataStatus.push({ key: 'okx_funding', label: 'OKX Funding', provider: 'OKX', status: 'live', rows: 1, impact: 'exchange-split', note: 'Borsa karşılaştırmasına dahil' });
    } else { if (okF?._err) out.errors.push('okx: ' + okF._err); out.dataStatus.push({ key: 'okx_funding', label: 'OKX Funding', provider: 'OKX', status: 'offline', rows: 0, impact: 'exchange-split-excluded', note: okF?._err || 'Veri yok' }); }

    const hl = await fetchPostJson('https://api.hyperliquid.xyz/info', { type: 'metaAndAssetCtxs' }, 8000);
    if (Array.isArray(hl) && Array.isArray(hl[0]?.universe) && Array.isArray(hl[1])) {
      const coin = symbol.replace(/USDT$/, '').replace(/USD$/, '');
      const idx = hl[0].universe.findIndex(x => String(x?.name || '').toUpperCase() === coin);
      const ctx = idx >= 0 ? hl[1][idx] : null;
      if (ctx) {
        out.exchanges.hyperliquid = { funding: Number(ctx.funding), markPrice: Number(ctx.markPx), openInterest: Number(ctx.openInterest) };
        out.dataStatus.push({ key: 'hyperliquid_funding', label: 'Hyperliquid Funding', provider: 'Hyperliquid', status: 'live', rows: 1, impact: 'exchange-split', note: 'Public info endpoint canlı' });
      }
    } else if (hl?._err) {
      out.errors.push('hyperliquid: ' + hl._err);
      out.dataStatus.push({ key: 'hyperliquid_funding', label: 'Hyperliquid Funding', provider: 'Hyperliquid', status: 'offline', rows: 0, impact: 'exchange-split-excluded', note: hl._err });
    }

    // CME gerçek funding verisi değildir; varsa Yahoo front-month futures/spot farkından canlı basis proxy üretilir.
    try {
      if (symbol === 'BTCUSDT') {
        const [cme, spot] = await Promise.all([getYahooQuote('BTC=F'), getYahooQuote('BTC-USD')]);
        if (Number.isFinite(cme) && Number.isFinite(spot) && spot > 0) {
          const annualBasisPct = ((cme - spot) / spot) * (365 / 30) * 100;
          out.exchanges.cme = { funding: (annualBasisPct / 100) / (365 * 3), markPrice: cme, indexPrice: spot, proxy: true, label: 'CME basis proxy' };
          out.dataStatus.push({ key: 'cme_basis_proxy', label: 'CME Basis Proxy', provider: 'Yahoo Finance', status: 'live', rows: 1, impact: 'context-only', note: 'CME’de funding yok; front-month basis funding-equivalent olarak çevrilir' });
        }
      }
    } catch (e) { out.errors.push('cme proxy: ' + (e?.message || e)); }

    const stats30 = fundingStats(out.historyFull.length ? out.historyFull : out.history, 30 * 24 * 60 * 60 * 1000);
    const histVals = (out.historyFull.length ? out.historyFull : out.history).map(x => x.rate).filter(Number.isFinite);
    const current = Number.isFinite(out.exchanges.binance?.funding) ? out.exchanges.binance.funding : (histVals.at(-1) ?? null);
    out.currentFunding = current;
    out.avg7d = averageFunding(out.historyFull.length ? out.historyFull : out.history, 7 * 24);
    out.avg24h = averageFunding(out.historyFull.length ? out.historyFull : out.history, 24);
    out.avg3d = averageFunding(out.historyFull.length ? out.historyFull : out.history, 3 * 24);
    out.avg30d = stats30.mean;
    out.std30d = stats30.std;
    out.zScore30d = Number.isFinite(current) && stats30.std ? (current - stats30.mean) / stats30.std : 0;
    out.annualizedPct = Number.isFinite(current) ? current * 365 * 3 * 100 : null;
    out.vol7d = (() => {
      const vals = (out.historyFull.length ? out.historyFull : out.history).filter(x => x.time >= Date.now() - 7*24*60*60*1000).map(x=>x.rate);
      const m = vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : 0;
      return vals.length > 1 ? Math.sqrt(vals.reduce((s,x)=>s+(x-m)**2,0)/vals.length) : 0;
    })();
    out.termStructure = {
      h8: current,
      h24: out.avg24h,
      d3: out.avg3d,
      d7: out.avg7d
    };
    out.source = Object.keys(out.exchanges).join('+') || 'none';
    const liveCount = out.dataStatus.filter(x => x.status === 'live').length;
    const primaryOk = out.history.length > 0 && Number.isFinite(current);
    out.dataQuality = !primaryOk ? 'offline' : liveCount < Math.max(2, out.dataStatus.length) ? 'degraded' : 'live';
    out.decisionImpact = {
      currentFunding: Number.isFinite(current) ? 'included' : 'excluded',
      history: out.history.length ? 'included' : 'excluded',
      exchangeSplit: Object.keys(out.exchanges).length >= 2 ? 'included' : 'degraded',
      basis: Number.isFinite(out.basis.indexPremiumPct) ? 'included' : 'excluded',
      cme: out.exchanges.cme?.proxy ? 'context-only-proxy' : 'not-available'
    };
    return out;
  }

  // 3) CVD — Cumulative Volume Delta (taker buy/sell oranından)
  async function getCvd(symbol, period) {
    const out = { type: 'cvd', symbol, period, series: [], errors: [] };
    // Binance taker buy/sell volume (futures aggregate)
    const bTaker = await fetchJson(`${BINANCE}/futures/data/takerlongshortRatio?symbol=${symbol}&period=${period}&limit=200`);
    if (Array.isArray(bTaker)) {
      let cum = 0;
      out.series = bTaker.map(d => {
        const buy = Number(d.buyVol), sell = Number(d.sellVol);
        const delta = buy - sell;
        cum += delta;
        return { time: Number(d.timestamp), delta, cvd: cum, buyVol: buy, sellVol: sell };
      });
      out.source = 'binance';
    } else { out.errors.push('binance: ' + (bTaker._err || 'veri yok')); out.source = 'none'; }
    const last = out.series.at(-1);
    out.currentCvd = last ? last.cvd : null;
    return out;
  }

  // 4) LIKIDASYON — son zorunlu likidasyonlar + 24s toplam (Binance + Bybit)
  async function getLiquidations(symbol) {
    const out = { type: 'liquidations', symbol, recent: [], totals: {}, errors: [] };
    // Bybit son likidasyonlar (Binance allForceOrders artık kısıtlı)
    const by = await fetchJson(`${BYBIT}/v5/market/liquidation?category=linear&symbol=${symbol}&limit=200`);
    if (by?.result?.list?.length) {
      let longLiq = 0, shortLiq = 0;
      out.recent = by.result.list.slice(0, 50).map(d => {
        const usd = Number(d.size) * Number(d.price);
        // Bybit: side=Buy → short pozisyon likide oldu; side=Sell → long likide
        if (d.side === 'Sell') longLiq += usd; else shortLiq += usd;
        return { time: Number(d.updatedTime || d.time), side: d.side, price: Number(d.price), size: Number(d.size), usd };
      });
      out.totals.bybit = { longLiqUsd: longLiq, shortLiqUsd: shortLiq, total: longLiq + shortLiq };
      out.source = 'bybit';
    } else { out.errors.push('bybit: ' + (by._err || 'veri yok')); out.source = 'none'; }
    return out;
  }

  // 5) LIKIDASYON HEATMAP — MODELLENMIŞ (gerçek veri değil, tahmin).
  // Fiyat + OI + tipik kaldıraç seviyelerinden likidasyon kümelerini modeller.
  async function getHeatmap(symbol, period) {
    const out = { type: 'heatmap', symbol, modeled: true, levels: [], errors: [],
      disclaimer: 'MODELLENMİŞ TAHMİN — gerçek likidasyon emirleri değil. Fiyat, OI ve tipik kaldıraç (5x-100x) seviyelerinden hesaplanmıştır.' };
    // Mum verisi (fiyat aralığı için)
    const kl = await fetchJson(`${BINANCE}/fapi/v1/klines?symbol=${symbol}&interval=${period === '5m' ? '5m' : '1h'}&limit=200`);
    const oi = await fetchJson(`${BINANCE}/fapi/v1/openInterest?symbol=${symbol}`);
    if (!Array.isArray(kl)) { out.errors.push('binance klines: ' + (kl._err || 'veri yok')); out.source = 'none'; return out; }
    const closes = kl.map(c => Number(c[4]));
    const highs = kl.map(c => Number(c[2]));
    const lows = kl.map(c => Number(c[3]));
    const vols = kl.map(c => Number(c[5]));
    const price = closes.at(-1);
    const oiContracts = oi && !oi._err ? Number(oi.openInterest) : 0;
    // Tipik kaldıraç seviyeleri ve likidasyon mesafeleri (~%maintenance margin)
    const levs = [5, 10, 25, 50, 100];
    const recentHigh = Math.max(...highs.slice(-96));
    const recentLow = Math.min(...lows.slice(-96));
    const avgVol = vols.slice(-96).reduce((a, b) => a + b, 0) / Math.min(96, vols.length);
    // Her kaldıraç için long ve short likidasyon fiyatı + tahmini hacim ağırlığı
    for (const lev of levs) {
      const dist = 1 / lev; // likidasyon mesafesi ≈ 1/kaldıraç
      const longLiqPrice = price * (1 - dist);   // long pozisyonlar aşağıda likide
      const shortLiqPrice = price * (1 + dist);  // short pozisyonlar yukarıda likide
      // Ağırlık: düşük kaldıraç daha yaygın → daha çok hacim; OI ile ölçekle
      const weight = (oiContracts * avgVol) / (lev * lev);
      if (longLiqPrice >= recentLow * 0.9) out.levels.push({ price: Math.round(longLiqPrice * 100) / 100, side: 'long', leverage: lev, intensity: Math.round(weight) });
      if (shortLiqPrice <= recentHigh * 1.1) out.levels.push({ price: Math.round(shortLiqPrice * 100) / 100, side: 'short', leverage: lev, intensity: Math.round(weight) });
    }
    out.levels.sort((a, b) => b.price - a.price);
    out.currentPrice = price;
    out.priceRange = { high: recentHigh, low: recentLow };
    out.source = 'binance (modellenmiş)';
    return out;
  }

  async function handler(req, res) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=120');
    const url = new URL(req.url, 'http://localhost');
    const type = (url.searchParams.get('type') || 'oi').toLowerCase();
    const symbol = (url.searchParams.get('symbol') || 'BTCUSDT').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const period = url.searchParams.get('period') || '5m';
    let data;
    try {
      if (type === 'oi') data = await getOpenInterest(symbol, period);
      else if (type === 'funding') data = await getFunding(symbol, period);
      else if (type === 'cvd') data = await getCvd(symbol, period);
      else if (type === 'liquidations') data = await getLiquidations(symbol);
      else if (type === 'heatmap') data = await getHeatmap(symbol, period);
      else return setJson(res, 400, { ok: false, error: 'Bilinmeyen tür: ' + type, validTypes: ['oi', 'funding', 'cvd', 'liquidations', 'heatmap'] });
    } catch (e) {
      return setJson(res, 200, { ok: false, error: e?.message || String(e), type, symbol });
    }
    const ok = !data.errors || data.errors.length < (data.source === 'none' ? 1 : 99);
    return setJson(res, 200, { ok: data.source !== 'none', ...data });
  }
  return handler;
})();

// ── Ekonomik Takvim (opsiyonel Finnhub) ──
// FINNHUB_API_KEY env varsa Finnhub'dan canlı çeker; yoksa frontend statik 2026
// takvimine düşer (rux_macro.js). Yasal & kararlı; scraping yok.
HANDLERS['econ-calendar'] = (() => {
  async function handler(req, res) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600');
    const key = process.env.FINNHUB_API_KEY || '';
    if (!key) {
      return setJson(res, 200, { ok: false, source: 'none', useStaticFallback: true, note: 'FINNHUB_API_KEY tanımlı değil; istemci statik 2026 takvimini kullanır.' });
    }
    try {
      const url = new URL(req.url, 'http://localhost');
      const from = url.searchParams.get('from') || new Date().toISOString().slice(0, 10);
      const to = url.searchParams.get('to') || new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10);
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 7000);
      const r = await fetch(`https://finnhub.io/api/v1/calendar/economic?from=${from}&to=${to}&token=${key}`, { signal: ctrl.signal });
      clearTimeout(t);
      if (!r.ok) return setJson(res, 200, { ok: false, source: 'finnhub', useStaticFallback: true, error: 'HTTP ' + r.status });
      const j = await r.json();
      const rows = (j?.economicCalendar || []).map(e => ({
        date: e.time ? String(e.time).slice(0, 10) : null,
        time: e.time ? String(e.time).slice(11, 16) : null,
        name: e.event, type: e.event, impact: e.impact >= 3 ? 'çok yüksek' : e.impact === 2 ? 'yüksek' : e.impact === 1 ? 'orta' : 'düşük',
        region: e.country, actual: e.actual, estimate: e.estimate, prev: e.prev
      })).filter(x => x.date);
      return setJson(res, 200, { ok: true, source: 'finnhub', count: rows.length, events: rows });
    } catch (e) {
      return setJson(res, 200, { ok: false, source: 'finnhub', useStaticFallback: true, error: e?.message || String(e) });
    }
  }
  return handler;
})();

// ── Çoklu coin ticker (Piyasa Liderleri / Isı Haritası için) ──
// Binance toplu 24h ticker → istenen sembolleri süz. Coğrafi engelde OKX fallback.
HANDLERS['tickers'] = (() => {
  const SPOT_MIRRORS = [
    "https://api.binance.com", "https://api1.binance.com",
    "https://api2.binance.com", "https://data-api.binance.vision"
  ];
  const DEFAULT_SYMBOLS = ['BTC','ETH','BNB','SOL','XRP','ADA','DOGE','AVAX','LINK','DOT','MATIC','TRX','LTC','UNI','ATOM','OP','ARB','APT','NEAR','INJ'];

  async function fetchJson(url, label, errors, timeoutMs = 6000) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const r = await fetch(url, { signal: ctrl.signal, headers: { 'accept': 'application/json' } });
      clearTimeout(t);
      if (!r.ok) { errors && errors.push(`${label}: HTTP ${r.status}`); return null; }
      return await r.json();
    } catch (e) { clearTimeout(t); errors && errors.push(`${label}: ${e?.message || e}`); return null; }
  }

  async function handler(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const symParam = url.searchParams.get('symbols');
    const symbols = (symParam ? symParam.split(',') : DEFAULT_SYMBOLS).map(s => String(s).toUpperCase().replace(/USDT$/, '')).slice(0, 30);
    const wanted = symbols.map(s => `${s}USDT`);
    const debugErrors = [];

    // 1) Binance toplu 24h ticker (tek istek, tüm semboller)
    let rows = null, source = null;
    for (const base of SPOT_MIRRORS) {
      const all = await fetchJson(`${base}/api/v3/ticker/24hr`, `Binance tickers (${base})`, debugErrors, 6500);
      if (Array.isArray(all) && all.length) {
        const map = new Map(all.map(x => [x.symbol, x]));
        rows = wanted.map(sym => {
          const x = map.get(sym);
          if (!x) return null;
          return {
            symbol: sym, base: sym.replace(/USDT$/, ''),
            price: Number(x.lastPrice), change24h: Number(x.priceChangePercent),
            high24h: Number(x.highPrice), low24h: Number(x.lowPrice),
            volumeUsd: Number(x.quoteVolume), source: 'BINANCE'
          };
        }).filter(Boolean);
        source = 'BINANCE'; break;
      }
    }

    // 2) Fallback: OKX (coğrafi engel durumunda)
    if (!rows || !rows.length) {
      const okx = await fetchJson('https://www.okx.com/api/v5/market/tickers?instType=SPOT', 'OKX tickers', debugErrors, 6500);
      if (okx && Array.isArray(okx.data)) {
        const map = new Map(okx.data.map(x => [x.instId, x]));
        rows = symbols.map(s => {
          const x = map.get(`${s}-USDT`);
          if (!x) return null;
          const last = Number(x.last), open = Number(x.open24h) || last;
          return {
            symbol: `${s}USDT`, base: s, price: last,
            change24h: open ? ((last - open) / open) * 100 : 0,
            high24h: Number(x.high24h), low24h: Number(x.low24h),
            volumeUsd: Number(x.volCcy24h), source: 'OKX'
          };
        }).filter(Boolean);
        source = 'OKX YEDEK';
      }
    }

    if (!rows || !rows.length) {
      return setJson(res, 200, { ok: false, degraded: true, source: 'tickers', error: 'Hiçbir borsadan ticker alınamadı', debugErrors });
    }
    return setJson(res, 200, { ok: true, source, count: rows.length, tickers: rows, ts: Date.now() });
  }
  return handler;
})();

// ── API RESPONSE ŞEMA STANDARDI (v0.72.3) ──
// Tüm endpoint'ler tek tip zarf döndürür:
//   { ok, degraded, source, dataQuality (0-100), data, errors[], route, ts, ...orijinal alanlar }
// Mevcut handler'lar setJson ile kendi payload'larını döndürür; bu fonksiyon o payload'u
// standart meta alanlarıyla zenginleştirir (geriye dönük uyumlu: orijinal alanlar korunur).
function standardizeEnvelope(payload, route) {
  if (payload == null || typeof payload !== 'object') {
    return { ok: true, degraded: false, source: route, dataQuality: 50, data: payload, errors: [], route, ts: Date.now() };
  }
  // ok: açıkça verilmişse onu kullan, yoksa error/degraded varlığından çıkar.
  const hasError = payload.error != null || (Array.isArray(payload.errors) && payload.errors.length > 0);
  const ok = typeof payload.ok === 'boolean' ? payload.ok : !hasError;
  const degraded = typeof payload.degraded === 'boolean' ? payload.degraded
    : !!(payload.fallback || payload.useStaticFallback || payload.partial || (ok && hasError));
  const source = payload.source || payload.market || payload.normalizedBy || route;
  // dataQuality: açık alan > türetilmiş (canlı=90, fallback=55, hata=20).
  let dataQuality = Number(payload.dataQuality);
  if (!Number.isFinite(dataQuality)) {
    dataQuality = !ok ? 20 : degraded ? 55 : 90;
  }
  const errors = Array.isArray(payload.errors) ? payload.errors
    : (payload.error ? [String(payload.error)] : []);
  // data: payload zaten 'data' taşıyorsa onu kullan; yoksa meta-olmayan alanları topla.
  let data;
  if ('data' in payload) {
    data = payload.data;
  } else {
    const META = new Set(['ok', 'degraded', 'source', 'dataQuality', 'errors', 'error', 'route', 'ts', 'fallback', 'useStaticFallback', 'partial', 'message', 'version', 'latencyMs', 'updatedAt']);
    data = {};
    for (const k of Object.keys(payload)) if (!META.has(k)) data[k] = payload[k];
  }
  // Standart zarf + orijinal üst-düzey alanları KORU (geriye dönük uyum).
  return Object.assign({}, payload, {
    ok, degraded, source, dataQuality,
    data, errors, route, ts: payload.ts || Date.now(),
    schema: 'rux.v1',
  });
}

module.exports = async function ruxUnifiedApi(req, res) {
  const route = getRoute(req);
  const handler = HANDLERS[route];
  if (!handler) {
    return setJson(res, 404, standardizeEnvelope({
      ok: false,
      error: 'Bilinmeyen RUx API rotası',
      route,
      available: Object.keys(HANDLERS).filter((x, i, a) => a.indexOf(x) === i)
    }, route));
  }
  // res.json/res.end'i sarmala: handler ne döndürürse standart zarfa sok.
  const origJson = res.json && res.json.bind(res);
  const origEnd = res.end && res.end.bind(res);
  let wrapped = false;
  if (origJson) {
    res.json = (payload) => { if (wrapped) return origJson(payload); wrapped = true; return origJson(standardizeEnvelope(payload, route)); };
  }
  if (origEnd) {
    res.end = (chunk, ...rest) => {
      if (wrapped || typeof chunk !== 'string') return origEnd(chunk, ...rest);
      try {
        const parsed = JSON.parse(chunk);
        wrapped = true;
        return origEnd(JSON.stringify(standardizeEnvelope(parsed, route)), ...rest);
      } catch { return origEnd(chunk, ...rest); }
    };
  }
  try {
    return await handler(req, res);
  } catch (err) {
    return setJson(res, 200, standardizeEnvelope({
      ok: false,
      degraded: true,
      route,
      source: 'RUx Unified API',
      error: err && err.message ? err.message : String(err),
      message: 'Kaynak geçici olarak yanıt vermedi; terminal kontrollü uyarı modunda kalır.'
    }, route));
  }
};
