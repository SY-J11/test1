const API='https://m.stock.naver.com';
const DESKTOP='https://stock.naver.com';
const PROXY_BASE='https://tdart.mcraft-tiger-574.workers.dev';
const seed=[{name:'삼성전자',code:'005930'},{name:'삼성전자우',code:'005935'},{name:'SK하이닉스',code:'000660'},{name:'한미반도체',code:'042700'},{name:'두산에너빌리티',code:'034020'},{name:'두산',code:'000150'},{name:'현대차',code:'005380'},{name:'기아',code:'000270'},{name:'LG에너지솔루션',code:'373220'},{name:'삼성SDI',code:'006400'},{name:'NAVER',code:'035420'},{name:'카카오',code:'035720'},{name:'제주반도체',code:'080220'},{name:'대원전선',code:'006340'},{name:'대덕전자',code:'353200'}];
const $=id=>document.getElementById(id), blank='—';
const FLOW_DATE_KEYS=['tradeDate','date','localDate','localTradedAt','bizdate','tradingDate','bizDate','trdDt','dt','basDt','yyyymmdd','tradeDateYmd','dateString','tradedAt','dealDate','stckBsopDate','ymd','businessDate','tradingDay','stck_bsop_date','bsopDate'];
let current={name:'',code:''},timer=null,seq=0;
let dailyChartPeriod='day',dailyChartCache=new Map(),dailyChartRequest=0;
const dailyChartForeignDone=new Set(),dailyChartForeignInFlight=new Set();
const chartRanges={day:[5,10,20,40,60,100,120,200,240],week:[4,8,16,24,32,64,128,256,512],month:[6,12,18,24,30,36,42,48,60],year:[10,15,20,25]};
const chartRangeDefault={day:120,week:64,month:24,year:20},chartUnit={day:'일',week:'주',month:'월',year:'년'};
let chartRangeSel={...chartRangeDefault};
const dailyRowsStore=new Map(),foreignStore=new Map();
let exhaustionStore={code:'',value:null};
const jsonMemoryCache=new Map(),jsonInFlight=new Map(),textMemoryCache=new Map(),textInFlight=new Map();
const FAVORITES_KEY='stockInsightProFavorites';
function getFavorites(){try{const v=JSON.parse(localStorage.getItem(FAVORITES_KEY)||'[]');return Array.isArray(v)?v.filter(x=>x&&/^\d{6}$/.test(String(x.code||''))).map(x=>({code:String(x.code),name:String(x.name||x.code)})):[]}catch{return []}}
function saveFavorites(items){try{localStorage.setItem(FAVORITES_KEY,JSON.stringify(items))}catch{}}
function updateFavoriteButton(){const b=$('fav');if(!b)return;const active=!!current.code&&getFavorites().some(x=>x.code===current.code);b.textContent=active?'★':'☆';b.title=active?'관심종목 해제':'관심종목 추가';b.setAttribute('aria-label',b.title);b.style.color=active?'#d8b153':''}
function renderFavorites(){const box=$('favorite-list'),count=$('favorite-count');if(!box)return;const items=getFavorites();if(count)count.textContent=`${items.length}개`;if(!items.length){box.innerHTML='<span class="quick-loading">종목 옆의 ☆를 눌러 관심종목을 추가하세요.</span>';return}box.innerHTML=items.map(x=>`<span class="favorite-chip"><button class="favorite-load" data-code="${x.code}" data-name="${escapeHtml(x.name)}" title="${escapeHtml(x.name)} 상세정보 보기">★ ${escapeHtml(x.name)} <small>${x.code}</small></button><button class="favorite-remove" data-remove-code="${x.code}" aria-label="${escapeHtml(x.name)} 관심종목 해제" title="관심종목 해제">×</button></span>`).join('');box.querySelectorAll('[data-code]').forEach(b=>b.onclick=()=>load(b.dataset.code,b.dataset.name));box.querySelectorAll('[data-remove-code]').forEach(b=>b.onclick=()=>{const next=getFavorites().filter(x=>x.code!==b.dataset.removeCode);saveFavorites(next);renderFavorites();updateFavoriteButton()})}
function toggleFavorite(){if(!current.code)return;const items=getFavorites(),idx=items.findIndex(x=>x.code===current.code);if(idx>=0)items.splice(idx,1);else items.unshift({code:current.code,name:current.name||current.code});saveFavorites(items);renderFavorites();updateFavoriteButton()}

function num(v){if(v===null||v===undefined||v==='')return null;if(typeof v==='object')v=v.value??v.formattedValue??v.text??v.price??v.amount??v.closePrice;if(v===null||v===undefined)return null;let s=String(v).trim();if(!s||['-','N/A','자료없음','—'].includes(s))return null;const neg=/^\(.*\)$/.test(s);s=s.replace(/[(),]/g,'').replace(/%|원|배/g,'').trim();const n=Number(s);return Number.isFinite(n)?(neg?-n:n):null}
function financeNum(v){if(v===null||v===undefined||v==='')return null;if(typeof v==='object')v=v.value??v.formattedValue??v.text??v.displayValue??v.data??v.amount??v; if(v===null||v===undefined)return null;const s=String(v).trim();if(!s||['-','N/A','자료없음','—'].includes(s))return null;const neg=/^\(.*\)$/.test(s)||/^[-−]/.test(s);const t=s.replace(/[(),]/g,'').replace(/[−]/g,'-');const tri=t.match(/(-?\d+(?:\.\d+)?)\s*조/),eok=t.match(/(-?\d+(?:\.\d+)?)\s*억/);if(tri||eok){const a=tri?Number(tri[1])*10000:0,b=eok?Number(eok[1]):0;const sign=neg?-1:1;return sign<0?-(Math.abs(a)+Math.abs(b)):Math.abs(a)+Math.abs(b)}const n=num(t);return n===null?null:n}
function fmt(v,u=''){const n=num(v);return n===null?blank:`${n.toLocaleString('ko-KR',{maximumFractionDigits:2})}${u}`}
function objects(root,out=[],seen=new Set()){if(!root||typeof root!=='object'||seen.has(root))return out;seen.add(root);if(Array.isArray(root)){root.forEach(x=>objects(x,out,seen))}else{out.push(root);Object.values(root).forEach(v=>{if(v&&typeof v==='object')objects(v,out,seen)})}return out}
async function fetchTimed(url,options={},timeoutMs=4500){const controller=new AbortController();const timerId=setTimeout(()=>controller.abort(),timeoutMs);try{return await fetch(url,{...options,signal:controller.signal})}finally{clearTimeout(timerId)}}
async function getJson(url){
 const now=Date.now(),cached=jsonMemoryCache.get(url);
 if(cached&&cached.expires>now)return cached.value;
 if(jsonInFlight.has(url))return jsonInFlight.get(url);
 const task=(async()=>{
  const proxy=`${PROXY_BASE}?url=${encodeURIComponent(url)}`;
  const candidates=[proxy,`https://corsproxy.io/?url=${encodeURIComponent(url)}`,`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,url];
  const read=async u=>{const r=await fetchTimed(u,{cache:'no-store',headers:{Accept:'application/json'}},8500);if(!r.ok)throw Error(`HTTP ${r.status}`);const d=JSON.parse(await r.text());if(d?.error)throw Error(d.error);return d};
  let data,lastError;
  for(const candidate of candidates){try{data=await read(candidate);break}catch(e){lastError=e}}
  if(data===undefined)throw lastError||Error('API 요청 실패');
  const ttl=/finance\/(quarter|annual)/.test(url)?180000:/consensus/.test(url)?60000:/trend/.test(url)?15000:/price/.test(url)?30000:/basic|integration/.test(url)?15000:/autoComplete/.test(url)?8000:20000;
  jsonMemoryCache.set(url,{value:data,expires:Date.now()+ttl});
  if(jsonMemoryCache.size>180){const firstKey=jsonMemoryCache.keys().next().value;jsonMemoryCache.delete(firstKey)}
  return data;
 })();
 jsonInFlight.set(url,task);
 try{return await task}finally{jsonInFlight.delete(url)}
}
async function first(urls){let err;for(const u of urls){try{return await getJson(u)}catch(e){err=e}}throw err||Error('조회 실패')}
async function loadDailyPrices120(code,onProgress){
 const dateOf=item=>String(item?.localTradedAt??item?.tradeDate??item?.date??item?.bizdate??item?.trdDt??'').replace(/\D/g,'').slice(0,8);
 const hasPrice=item=>item&&typeof item==='object'&&dateOf(item)&&num(item.closePrice??item.currentPrice??item.nowPrice??item.tradePrice??item.close??item.stckClpr)!==null;
 const list=raw=>{if(Array.isArray(raw))return raw.filter(hasPrice);return objects(raw).filter(hasPrice)};
 const fetchPage=async(page,size=60)=>first([`${API}/api/stock/${code}/price?pageSize=${size}&page=${page}`]);
 const byDate=new Map();
 // 차트 첫 화면은 최근 60개로 먼저 표시하고, 나머지 60개는 뒤에서 보충한다.
 // 120개 단일 요청을 먼저 기다리던 기존 방식보다 첫 차트 표시를 앞당긴다.
 let page1;
 try{page1=await fetchPage(1,60)}catch{
  // 페이지 방식이 실패하는 경우에만 120개 단일 요청을 대체 경로로 시도한다.
  page1=await fetchPage(1,120);
 }
 for(const item of list(page1))byDate.set(dateOf(item),item);
 const firstBatch=[...byDate.values()].sort((a,b)=>dateOf(a).localeCompare(dateOf(b)));
 if(firstBatch.length&&typeof onProgress==='function'){
  try{onProgress(firstBatch)}catch(e){console.warn('차트 선표시 실패',e)}
 }
 if(byDate.size<120){
  const page2=await fetchPage(2,60).catch(()=>null);
  if(page2!==null)for(const item of list(page2))byDate.set(dateOf(item),item);
 }
 const merged=[...byDate.values()].sort((a,b)=>dateOf(a).localeCompare(dateOf(b)));
 if(!merged.length)throw Error('일봉 API 응답에서 가격 데이터가 확인되지 않습니다.');
 return merged.slice(-120);
}
async function getText(url){
 const now=Date.now(),cached=textMemoryCache.get(url);
 if(cached&&cached.expires>now)return cached.value;
 if(textInFlight.has(url))return textInFlight.get(url);
 const task=(async()=>{
  const proxy=`${PROXY_BASE}?url=${encodeURIComponent(url)}`;
  const candidates=[proxy,`https://corsproxy.io/?url=${encodeURIComponent(url)}`,`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,url];
  const read=async u=>{const r=await fetchTimed(u,{cache:'no-store',headers:{Accept:'text/html,application/json,*/*'}},8500);if(!r.ok)throw Error(`HTTP ${r.status}`);let t=await r.text();if(!t||t.length<30)throw Error('빈 응답');let parsed=null;try{parsed=JSON.parse(t)}catch{}if(parsed&&typeof parsed==='object'){if(parsed.error)throw Error(String(parsed.error));const embedded=parsed.contents??parsed.content??parsed.body??parsed.data;if(typeof embedded==='string'&&embedded.length>20)t=embedded;else if(!Array.isArray(parsed))throw Error('HTML 대신 JSON 응답을 받았습니다.')}if(!t||t.length<30)throw Error('빈 응답');return t};
  let data,lastError;for(const candidate of candidates){try{data=await read(candidate);break}catch(e){lastError=e}}
  if(data===undefined)throw lastError||Error('텍스트 조회 실패');
  textMemoryCache.set(url,{value:data,expires:Date.now()+120000});
  if(textMemoryCache.size>80)textMemoryCache.delete(textMemoryCache.keys().next().value);
  return data;
 })();
 textInFlight.set(url,task);try{return await task}finally{textInFlight.delete(url)}
}
function annualProfitFromLegacyHtml(html,year=new Date().getFullYear()-1){try{const doc=new DOMParser().parseFromString(html,'text/html');for(const table of doc.querySelectorAll('table')){const rows=[...table.querySelectorAll('tr')].map(tr=>[...tr.querySelectorAll('th,td')].map(c=>(c.innerText||c.textContent||'').replace(/\s+/g,' ').trim()));let yearIndex=-1;for(const cells of rows){const idx=cells.findIndex(v=>new RegExp(`(?:^|\\D)${year}(?:\\D|$)`).test(v));if(idx>=0){yearIndex=idx;break}}if(yearIndex<0)continue;for(const cells of rows){const label=(cells[0]||'').replace(/\s/g,'');if(/영업이익/.test(label)&&!/영업이익률|증감|성장|증가율|전년비|증가액|변동|마진/.test(label)&&cells.length>yearIndex){const value=financeNum(cells[yearIndex]);if(value!==null)return value}}}}catch{}return null}
async function loadAnnualData(code){let primaryError;try{return await first([`${API}/api/stock/${code}/finance/annual`])}catch(e){primaryError=e}const legacy=`${API}/api/html/item/financialInfo.nhn?type=annual&code=${encodeURIComponent(code)}`;let legacyError;try{const html=await getText(legacy);const profit=annualProfitFromLegacyHtml(html);if(profit!==null)return{annualProfitFallback:profit,annualFallbackSource:'legacy-html'};legacyError=Error('대체 경로 응답은 받았지만 영업이익 표를 찾지 못함')}catch(e){legacyError=e}throw Error(`연간 API: ${primaryError?.message||'실패'} / 대체 경로: ${legacyError?.message||'실패'}`)}
function keyValueRows(raw){const out={};for(const o of objects(raw)){for(const listName of ['totalInfos','infoList','infos','metrics']){const list=o[listName];if(!Array.isArray(list))continue;for(const x of list){if(!x||typeof x!=='object')continue;const keys=[x.code,x.key,x.name,x.title,x.label].filter(Boolean);const value=x.value??x.formattedValue??x.data??x.displayValue??x.text??null;for(const k of keys)out[String(k).trim()]=value;}}}return out}
function metric(raw, keys){const kv=keyValueRows(raw);for(const k of keys){if(kv[k]!==undefined&&kv[k]!==null&&kv[k]!=='')return kv[k]}const wanted=new Set(keys.map(x=>String(x).toLowerCase()));for(const o of objects(raw)){for(const [k,v] of Object.entries(o)){if(wanted.has(k.toLowerCase())&&v!==undefined&&v!==null&&v!=='')return v}}return null}
function metricPattern(raw, patterns){const candidates=[];for(const o of objects(raw)){for(const [k,v] of Object.entries(o)){if(!patterns.some(re=>re.test(k))||v===null||v===undefined||v==='')continue;const value=(typeof v==='object')?(v.value??v.formattedValue??v.text??v.displayValue??v.price??null):v;if(value!==null&&value!==undefined&&value!=='')candidates.push({key:k.toLowerCase(),value})}}candidates.sort((a,b)=>{const rank=x=>(/mean|average|avg|consensus|평균/.test(x.key)?0:1);return rank(a)-rank(b)});return candidates[0]?.value??null}
function findText(raw,keys){for(const o of objects(raw)){for(const k of keys){if(o[k]!==undefined&&o[k]!==null&&o[k]!==''&&typeof o[k]!=='object')return o[k]}}return null}
function capFormat(raw){if(raw===null||raw===undefined)return blank;if(typeof raw==='object')raw=raw.value??raw.formattedValue??raw.text??raw.amount;const s=String(raw??'').trim();if(!s)return blank;const tri=s.match(/([\d,.]+)\s*조/),eok=s.match(/([\d,.]+)\s*억/);if(tri||eok){const t=tri?Number(tri[1].replace(/,/g,'')):0,e=eok?Number(eok[1].replace(/,/g,'')):0;return `${t?`${t.toLocaleString('ko-KR',{maximumFractionDigits:2})}조`:''}${t&&e?' ':''}${e?`${e.toLocaleString('ko-KR',{maximumFractionDigits:2})}억`:''}`.trim()}const n=num(s);if(n===null)return blank;/* integration marketValue is formatted as 억원; numeric-only values are kept in the documented 억원 unit */return n>=10000?`${(n/10000).toLocaleString('ko-KR',{maximumFractionDigits:2})}조`:`${n.toLocaleString('ko-KR',{maximumFractionDigits:2})}억`}
function extractBasic(basic,integration,priceData,consensus,code,name){const p=findText(basic,['closePrice','currentPrice','nowPrice','tradePrice'])??findText(priceData,['closePrice','currentPrice','nowPrice','tradePrice']);const change=findText(basic,['compareToPreviousClosePrice','changePrice','compareToPreviousPrice'])??findText(priceData,['compareToPreviousClosePrice','changePrice','compareToPreviousPrice']);const rate=findText(basic,['fluctuationsRatio','changeRate'])??findText(priceData,['fluctuationsRatio','changeRate']);const cap=metric(integration,['marketValue','marketCap','marketSum','marketCapitalization','시가총액']);const consensusSource={consensus, integration};const target=metric(consensusSource,['meanTargetPrice','targetPrice','targetPriceMean','averageTargetPrice','targetPriceAvg','priceTargetMean','targetPriceAverage','avgTargetPrice','meanTargetPriceValue','consensusTargetPrice','targetPriceMeanValue'])??metricPattern(consensusSource,[/mean.*target.*price/i,/target.*price.*mean/i,/average.*target.*price/i,/target.*price.*average/i,/targetprice/i,/price.*target/i]);const opinion=metric(consensusSource,['investmentOpinion','meanOpinion','opinion','investmentOpinionText','recommMean','meanInvestmentOpinion','investmentOpinionMean','consensusOpinion','recommendation','recommendationText','opinionMean'])??metricPattern(consensusSource,[/mean.*opinion/i,/opinion.*mean/i,/investment.*opinion/i,/recommend/i]);let changeText='시세 정보 없음';const c=num(change),r=num(rate);if(c!==null){changeText=`${c>0?'▲':c<0?'▼':'•'} ${c>0?'+':''}${c.toLocaleString('ko-KR')}${r!==null?` (${r>0?'+':''}${r}%)`:''}`}else if(r!==null)changeText=`${r>0?'▲ +':r<0?'▼ ':'• '}${r}%`;return{name:findText(basic,['stockName','itemName','name'])||name,code,price:fmt(p),change:changeText,per:fmt(metric(integration,['per','PER']),'배'),pbr:fmt(metric(integration,['pbr','PBR']),'배'),eps:fmt(metric(integration,['eps','EPS']),'원'),cap:capFormat(cap),roe:blank,debt:blank,foreignFloat:fmt(metric(integration,['foreignRate','foreignOwnershipRate','foreignRatio','foreignExhaustionRate','외국인소진율']),'%'),target:fmt(target,'원'),opinion:opinion??blank,annualMultiple:blank,ttmMultiple:blank,estTtmMultiple:fmt(metric(integration,['cnsPer','estTtmMultiple','estimatedPER']),'배')}}
function capToEok(raw){if(raw===null||raw===undefined)return null;if(typeof raw==='object')raw=raw.value??raw.formattedValue??raw.text??raw.amount;const s=String(raw??'').trim();if(!s)return null;const tri=s.match(/([\d,.]+)\s*조/),eok=s.match(/([\d,.]+)\s*억/);if(tri||eok){const t=tri?Number(tri[1].replace(/,/g,'')):0,e=eok?Number(eok[1].replace(/,/g,'')):0;return t*10000+e}const n=num(s);if(n===null)return null;if(/원/.test(s)&&!/억|조/.test(s))return n/100000000;return n}
function floatingMarketCapWon(raw,marketCapRaw){
  const direct=metricPattern(raw,[/floating.*market.*cap/i,/free.?float.*market.*cap/i,/유동주식.*시가총액/i,/유동시가총액/i]);
  if(direct!==null){const eok=capToEok(direct);if(eok!==null&&eok>0)return eok*100000000;const n=num(direct);if(n!==null&&n>0)return n}
  const shares=metricPattern(raw,[/free.?float.*shares?/i,/floating.*shares?/i,/float.*share.*count/i,/유동주식수/i,/유동주식수량/i]);
  const price=metricPattern(raw,[/^closePrice$/i,/^currentPrice$/i,/^nowPrice$/i,/^tradePrice$/i,/현재가/i]);
  const shareNum=num(shares),priceNum=num(price);
  if(shareNum!==null&&shareNum>0&&priceNum!==null&&priceNum>0)return shareNum*priceNum;
  const ratio=metricPattern(raw,[/free.?float.*ratio/i,/floating.*stock.*ratio/i,/float.*rate/i,/유동주식비율/i,/유동비율/i]);
  const ratioNum=num(ratio),capEok=capToEok(marketCapRaw);
  if(ratioNum!==null&&ratioNum>0&&ratioNum<=100&&capEok!==null&&capEok>0)return capEok*100000000*ratioNum/100;
  return null;
}
async function loadFloatingSharesFromCompany(code){
  // Prefer the WiseReport company-status page. If issued shares and float ratio are
  // available, estimate float shares as issued shares × float ratio / 100.
  const pages=[
    `https://mobile2.wisereport.co.kr/CompanyInfo/Status/${encodeURIComponent(code)}/`,
    `${DESKTOP}/domestic/stock/${encodeURIComponent(code)}/info/company`,
    `https://navercomp.wisereport.co.kr/v2/company/c1010001.aspx?cmp_cd=${encodeURIComponent(code)}`
  ];
  const parseShareNumber=value=>{
    let text=String(value??'').replace(/\u00a0/g,' ').replace(/,/g,'').trim();
    if(!text)return null;
    const m=text.match(/(-?\d+(?:\.\d+)?)\s*(조|억|만)?\s*(?:주)?/);
    if(!m)return null;
    let n=Number(m[1]);if(!Number.isFinite(n)||n<=0)return null;
    if(m[2]==='조')n*=1e12;else if(m[2]==='억')n*=1e8;else if(m[2]==='만')n*=1e4;
    return n>1e7?n:null;
  };
  const parseRatio=value=>{
    const m=String(value??'').replace(/,/g,'').match(/(\d+(?:\.\d+)?)\s*%?/);
    if(!m)return null;const n=Number(m[1]);return n>0&&n<=100?n:null;
  };
  for(const url of pages){
    try{
      const html=await getText(url);
      const doc=new DOMParser().parseFromString(html,'text/html');
      let issued=null,ratio=null,directFloat=null;
      const clean=x=>(x?.innerText||x?.textContent||'').replace(/\s+/g,' ').trim();
      // Read label/value pairs from table/list/detail rows.
      for(const row of doc.querySelectorAll('tr,li,dl,.info-row,.table-row')){
        const text=clean(row);if(!text)continue;
        const cells=[...row.querySelectorAll('th,td,dt,dd,span,strong,b')].map(clean).filter(Boolean);
        if(/발행주식수|상장주식수|총발행주식수/.test(text)){
          for(let i=cells.length-1;i>=0;i--){const n=parseShareNumber(cells[i]);if(n!==null){issued=n;break}}
          if(issued===null){const tail=text.replace(/.*?(발행주식수|상장주식수|총발행주식수)/,'');issued=parseShareNumber(tail)}
        }
        if(/유동주식비율|유동비율|유통주식비율/.test(text)){
          for(let i=cells.length-1;i>=0;i--){const n=parseRatio(cells[i]);if(n!==null){ratio=n;break}}
          if(ratio===null){const tail=text.replace(/.*?(유동주식비율|유동비율|유통주식비율)/,'');ratio=parseRatio(tail)}
        }
        if(/유동주식수|유통주식수/.test(text)&&!/비율/.test(text)){
          for(let i=cells.length-1;i>=0;i--){const n=parseShareNumber(cells[i]);if(n!==null){directFloat=n;break}}
          if(directFloat===null){const tail=text.replace(/.*?(유동주식\s*수|유통주식수)/,'');directFloat=parseShareNumber(tail)}
        }
      }
      // Also inspect the full page text because some responsive layouts split labels and values.
      const plain=clean(doc.body).replace(/\s+/g,' ');
      if(issued===null){const m=plain.match(/(?:발행주식수|상장주식수|총발행주식수)[^\d]{0,80}([\d,]{7,})/);if(m)issued=parseShareNumber(m[1])}
      if(ratio===null){const m=plain.match(/(?:유동주식비율|유동비율|유통주식비율)[^\d]{0,120}(\d+(?:\.\d+)?)\s*%?/);if(m)ratio=parseRatio(m[1])}
      if(directFloat===null){const m=plain.match(/(?:유동주식\s*수|유통주식수)[^\d]{0,80}([\d,]{7,})/);if(m)directFloat=parseShareNumber(m[1])}
      if(issued!==null&&ratio!==null){const estimate=Math.round(issued*ratio/100);if(estimate>1e7)return estimate}
      if(directFloat!==null&&directFloat>1e7)return directFloat;
    }catch{}
  }
  // Structured API fallback: calculate from issued shares and float ratio where possible.
  for(const url of [
    `${API}/api/stockSecurity/items/v2/domestic/${encodeURIComponent(code)}/profile`,
    `${DESKTOP}/api/stockSecurity/items/v2/domestic/${encodeURIComponent(code)}/profile`
  ]){
    try{
      const raw=await getJson(url);
      const total=num(metricPattern(raw,[/^listedShares?$/i,/^totalShares?$/i,/^issuedShares?$/i,/^sharesOutstanding$/i,/^listedShareCount$/i,/상장주식수/i,/발행주식수/i]));
      const ratio=num(metricPattern(raw,[/free.?float.*ratio/i,/floating.*stock.*ratio/i,/float.*rate/i,/유동주식비율/i,/유동비율/i]));
      if(total!==null&&total>0&&ratio!==null&&ratio>0&&ratio<=100)return Math.round(total*ratio/100);
      const direct=num(metricPattern(raw,[/free.?float.*shares?/i,/floating.*shares?/i,/float.*share.*count/i,/유동주식수/i,/유동주식수량/i,/유통주식수/i]));
      if(direct!==null&&direct>1e7)return direct;
    }catch{}
  }
  return null;
}
function floatingShares(raw,marketCapRaw,priceRaw){
  const direct=metricPattern(raw,[/free.?float.*shares?/i,/floating.*shares?/i,/float.*share.*count/i,/유동주식수/i,/유동주식수량/i]);
  const directNum=num(direct);
  if(directNum!==null&&directNum>0)return directNum;
  const total=metricPattern(raw,[/^listedShares?$/i,/^totalShares?$/i,/^issuedShares?$/i,/^sharesOutstanding$/i,/^listedShareCount$/i,/상장주식수/i,/발행주식수/i,/상장주식수량/i,/발행주식수량/i]);
  const totalNum=num(total);
  const floatRatio=metricPattern(raw,[/free.?float.*ratio/i,/floating.*stock.*ratio/i,/float.*rate/i,/유동주식비율/i,/유동비율/i]);
  const ratioNum=num(floatRatio);
  if(totalNum!==null&&totalNum>0&&ratioNum!==null&&ratioNum>0&&ratioNum<=100)return totalNum*ratioNum/100;
  // If total shares are absent, estimate total shares from market cap/current price only
  // when a genuine floating-share ratio is also available.
  const capEok=capToEok(marketCapRaw),priceNum=num(priceRaw);
  if(capEok!==null&&capEok>0&&priceNum!==null&&priceNum>0&&ratioNum!==null&&ratioNum>0&&ratioNum<=100)return (capEok*100000000/priceNum)*ratioNum/100;
  return null;
}
function financeInfo(raw){if(raw?.financeInfo?.rowList&&raw?.financeInfo?.trTitleList)return raw.financeInfo;for(const o of objects(raw)){if(o.financeInfo?.rowList&&o.financeInfo?.trTitleList)return o.financeInfo;if(Array.isArray(o.rowList)&&Array.isArray(o.trTitleList))return o}return null}
function parseFinance(raw){const fi=financeInfo(raw);if(!fi)return{quarters:[],rows:[],headers:[]};const headers=(fi.trTitleList||[]).map(h=>{const key=typeof h==='string'?h:String(h.key??h.period??h.title??'');const label=typeof h==='string'?h:String(h.title??h.period??h.key??'');return{key,label,est:typeof h==='object'&&(String(h.isConsensus??h.isEstimate??'').toUpperCase()==='Y'||/\(E\)|예상|추정/i.test(label))||/\(E\)|예상|추정/i.test(label)}});const rows=(fi.rowList||[]).map(row=>({label:String(row.title??row.name??row.label??row.itemName??'').replace(/\s/g,''),raw:row,columns:row.columns||row.values||row.data||{}}));const cellValue=(row,h)=>{const raw=row?.raw||row;const cols=row?.columns||raw?.columns||raw?.values||raw?.data||{};const candidates=[h.key,h.label,h.key.replace(/\D/g,''),h.label.replace(/[^0-9]/g,'')].filter(Boolean);if(Array.isArray(cols)){const idx=headers.indexOf(h);if(idx>=0&&cols[idx]!==undefined){const c=cols[idx];return financeNum(c?.value??c?.formattedValue??c?.text??c?.data??c)}}else if(cols&&typeof cols==='object'){for(const k of candidates){if(cols[k]!==undefined){const c=cols[k];return financeNum(c?.value??c?.formattedValue??c?.text??c?.data??c)}}for(const [k,c] of Object.entries(cols)){if(candidates.some(x=>x&&String(k).includes(x))){const v=financeNum(c?.value??c?.formattedValue??c?.text??c?.data??c);if(v!==null)return v}}}if(Array.isArray(raw?.values)){const idx=headers.indexOf(h);if(idx>=0)return financeNum(raw.values[idx]?.value??raw.values[idx])}if(Array.isArray(raw?.data)){const idx=headers.indexOf(h);if(idx>=0)return financeNum(raw.data[idx]?.value??raw.data[idx])}return null};const get=(patterns,h)=>{const row=rows.find(x=>patterns.some(re=>re.test(x.label)));return row?cellValue(row,h):null};const quarters=headers.map(h=>{const profit=get([/^영업이익(?:\([^)]*\))*$/,/^영업이익.*$/],h),sales=get([/^매출액(?:\(억원\))?$/,/^매출액.*$/],h),rawMargin=get([/영업이익률/],h);let margin=rawMargin;if(margin===null&&profit!==null&&sales!==null&&sales!==0)margin=profit/sales*100;return{label:h.label+(h.est&&!/\(E\)/i.test(h.label)?'(E)':''),key:h.key,est:h.est,profit,margin,eps:get([/^EPS(?:\(원\))?$/,/주당순이익/],h),net:get([/^당기순이익(?:\(억원\))?$/,/지배주주순이익/,/^순이익/],h),sales,roe:get([/^ROE(?:\(%\))?$/,/자기자본이익률/],h),debt:get([/^부채비율(?:\(%\))?$/],h)}});return{quarters,rows,headers}}
function latestActual(quarters){return (quarters||[]).filter(q=>!q.est&&!/\(E\)/i.test(q.label)&&/^20\d{2}[.\-/]/.test(q.label)).sort((a,b)=>String(a.key).localeCompare(String(b.key)))}
function annualProfitFromCompleteQuarters(quarters){const previousYear=new Date().getFullYear()-1;const qByQuarter=new Map();for(const q of latestActual(quarters)){const text=String(q.label||'')+' '+String(q.key||'');const m=text.match(/(20\d{2})[.\-/](\d{1,2})/);if(!m||Number(m[1])!==previousYear||q.profit===null)continue;const month=Number(m[2]);const quarter=Math.ceil(month/3);if(quarter>=1&&quarter<=4&&!qByQuarter.has(quarter))qByQuarter.set(quarter,q.profit)}return [1,2,3,4].every(n=>qByQuarter.has(n))?[1,2,3,4].reduce((sum,n)=>sum+qByQuarter.get(n),0):null}
function annualOperatingProfit(raw, quarterly=[]){
  // 네이버 연간 재무표의 trTitleList와 rowList를 기준으로 전년도 영업이익을 읽는다.
  const year=new Date().getFullYear()-1;
  const norm=v=>String(v??'').replace(/\s/g,'').replace(/[（）]/g,'()');
  const yearOf=h=>{const label=typeof h==='string'?h:String(h?.title??h?.period??h?.key??h?.name??'');const key=typeof h==='object'?String(h?.key??''):'';const m=(label+' '+key).match(/20\d{2}/);return m?Number(m[0]):null};
  const forecast=h=>{const label=typeof h==='string'?h:String(h?.title??h?.period??h?.key??h?.name??'');const flag=String(typeof h==='object'?(h.isConsensus??h.isEstimate??h.estimate??h.isForecast??''):'').toUpperCase();return ['Y','YES','TRUE','1'].includes(flag)||/\(E\)|예상|추정|컨센서스/i.test(label)};
  const fi=financeInfo(raw);
  if(fi&&Array.isArray(fi.trTitleList)&&Array.isArray(fi.rowList)){
    const headers=fi.trTitleList;
    // 같은 연도 열이 여러 개면 실제 실적 열을 우선한다.
    const candidates=headers.map((h,i)=>({h,i})).filter(x=>yearOf(x.h)===year&&!forecast(x.h));
    const row=fi.rowList.find(r=>{const label=norm(r.title??r.name??r.label??r.itemName??r.itemTitle??r.code);return /영업이익/.test(label)&&!/영업이익률|증감|성장|증가율|전년비|증가액|변동|마진/.test(label)});
    if(row&&candidates.length){
      const cols=row.columns??row.values??row.data??row.columnList??row.valueList??{};
      for(const {h,i} of candidates){
        const key=typeof h==='string'?'':String(h?.key??h?.period??'');
        const title=typeof h==='string'?h:String(h?.title??h?.period??h?.key??'');
        let cell;
        if(Array.isArray(cols))cell=cols[i];
        else if(cols&&typeof cols==='object'){
          for(const k of [key,title,key.replace(/\D/g,''),title.replace(/[^0-9]/g,''),String(i)].filter(Boolean))if(cols[k]!==undefined){cell=cols[k];break}
          if(cell===undefined){const entries=Object.entries(cols);const match=entries.find(([k])=>key&&String(k)===key)||entries.find(([k])=>title&&String(k)===title);if(match)cell=match[1]}
        }
        if(cell===undefined&&Array.isArray(row.values))cell=row.values[i];
        if(cell===undefined&&Array.isArray(row.data))cell=row.data[i];
        const value=financeNum(cell?.value??cell?.formattedValue??cell?.text??cell?.displayValue??cell?.data??cell?.amount??cell);
        if(value!==null)return value;
      }
    }
  }
  // API 응답이 다른 포장 구조인 경우에도 연간 표 안에서 동일한 행/열을 찾는다.
  for(const o of objects(raw)){
    const headers=o.trTitleList||o.titleList||o.headers||o.periodList||o.columnList;
    const rowList=o.rowList||o.rows||o.financialRows;
    if(!Array.isArray(headers)||!Array.isArray(rowList))continue;
    const row=rowList.find(r=>{const label=norm(r.title??r.name??r.label??r.itemName??r.itemTitle??r.code);return /영업이익/.test(label)&&!/영업이익률|증감|성장|증가율|전년비|증가액|변동|마진/.test(label)});
    if(!row)continue;
    const cols=row.columns??row.values??row.data??row.columnList??row.valueList??{};
    for(let i=0;i<headers.length;i++){
      const h=headers[i];if(yearOf(h)!==year||forecast(h))continue;
      const key=typeof h==='string'?h:String(h?.key??h?.period??'');let cell;
      if(Array.isArray(cols))cell=cols[i];
      else if(cols&&typeof cols==='object'){
        for(const k of [key,String(h?.title??''),String(h?.key??'').replace(/\D/g,''),String(h?.title??'').replace(/[^0-9]/g,''),String(i)].filter(Boolean))if(cols[k]!==undefined){cell=cols[k];break}
        if(cell===undefined&&Object.keys(cols).length===headers.length)cell=Object.values(cols)[i];
      }
      const value=financeNum(cell?.value??cell?.formattedValue??cell?.text??cell?.displayValue??cell?.data??cell?.amount??cell);
      if(value!==null)return value;
    }
  }
  // 마지막 보완: 동일한 연간 응답을 표준 파서로 다시 확인한다.
  const parsed=parseFinance(raw);
  const parsedYear=parsed.quarters.find(q=>{const label=String(q.label||'')+' '+String(q.key||'');const m=label.match(/(20\d{2})/);return m&&Number(m[1])===year&&!q.est&&!/\(E\)/i.test(label)&&q.profit!==null});
  if(parsedYear)return parsedYear.profit;
  // 연간 표에 전년도 열이 없는 경우에만 전년도 4개 분기 합계를 사용한다.
  return annualProfitFromCompleteQuarters(quarterly);
}
function getFinanceMetric(parsed,patterns){const actual=parsed.quarters.filter(q=>!q.est&&!/\(E\)/i.test(q.label));for(let i=actual.length-1;i>=0;i--){for(const re of patterns){if(re.test('')){} }const q=actual[i];if(q.roe!==null||q.debt!==null)return q}return null}
function flowRecords(raw){
  const dateKeys=FLOW_DATE_KEYS;
  // 모바일 수급 API는 result.items[] 안에 날짜별 krx/nxt 객체를 반환한다.
  const apiItems=raw?.result?.items??raw?.items;
  if(Array.isArray(apiItems)){
    const unique=new Map();
    for(const item of apiItems){
      if(!item||typeof item!=='object')continue;
      const date=String(item.localTradedAt??'').replace(/\D/g,'').slice(0,8);
      if(date&&!unique.has(date))unique.set(date,item);
    }
    return [...unique.values()].sort((a,b)=>String(b.localTradedAt||'').localeCompare(String(a.localTradedAt||''))).slice(0,200);
  }
  const looksLikeDate=v=>/^\d{4}[-./]?\d{2}[-./]?\d{2}/.test(String(v??''))||/^\d{8}$/.test(String(v??''));
  const found=[];
  const investor=/foreign|foreigner|frgnr|frgn|외국인|organization|organ|institution|orgn|기관/i;
  const buy=/pure.?buy|net.?buy|ntby|순매수|순매매|순매입|매수금액|매매순/i;
  const hasDate=o=>dateKeys.some(k=>o&&o[k]!==undefined&&looksLikeDate(o[k]));
  for(const o of objects(raw)){
    for(const [key,val] of Object.entries(o)){
      if(!Array.isArray(val)||!val.length)continue;
      const hits=val.filter(x=>x&&typeof x==='object'&&(hasDate(x)||Object.keys(x).some(k=>(investor.test(k)&&buy.test(k))||(buy.test(k)&&investor.test(k)))));
      if(hits.length)found.push(...hits);
    }
    if(hasDate(o))found.push(o);
  }
  const unique=[],seen=new Set();
  for(const r of found){
    const date=String(dateKeys.map(k=>r[k]??'').find(Boolean)||'').replace(/\D/g,'');
    if(!date)continue;
    const id=date+'|'+JSON.stringify(r);
    if(!seen.has(id)){seen.add(id);unique.push(r)}
  }
  const dateOf=r=>String(dateKeys.map(k=>r[k]??'').find(Boolean)||'').replace(/\D/g,'');
  unique.sort((a,b)=>dateOf(b).localeCompare(dateOf(a)));
  // 중복된 응답 행이 있어도 하루를 한 번만 집계한다.
  // 같은 날짜의 외국인/기관 행을 먼저 합치지 않고 모두 보존한다.
  return unique.slice(0,200);
}
function flowSummary(raw,type,exchange='KRX',priceByDate=new Map(),fallbackPrice=null,floatShares=null){
  const rows=flowRecords(raw);
  const market=String(exchange||'KRX').toUpperCase();
  const netField=type==='foreign'?'foreignNetVolume':'organizationNetVolume';
  const netAliases=type==='foreign'?['foreignNetVolume','foreignerNetVolume','foreignPureBuyQuant','foreignerPureBuyQuant']:['organizationNetVolume','organNetVolume','organizationPureBuyQuant','organPureBuyQuant'];
  const buyFields=type==='foreign'?['foreignBuyVolume','foreignerBuyVolume']:['organizationBuyVolume','organBuyVolume'];
  const sellFields=type==='foreign'?['foreignSellVolume','foreignerSellVolume']:['organizationSellVolume','organSellVolume'];
  const dateOf=r=>String(FLOW_DATE_KEYS.map(k=>r?.[k]??'').find(v=>v!==undefined&&v!==null&&v!=='')||'').replace(/\D/g,'').slice(0,8);
  const read=r=>{
    if(!r||typeof r!=='object')return null;
    const row=market==='TOTAL'?r.total:r[market.toLowerCase()];
    // Exchange-specific rows only. Never fall back to the whole date object,
    // because that can accidentally count KRX as NXT when NXT is null.
    if(!row||typeof row!=='object')return null;
    for(const key of netAliases){const v=row[key];if(v!==null&&v!==undefined&&v!==''){const n=num(v);if(n!==null)return n}}
    let buy=null,sell=null;
    for(const key of buyFields){if(row[key]!==null&&row[key]!==undefined&&row[key]!==''){buy=num(row[key]);if(buy!==null)break}}
    for(const key of sellFields){if(row[key]!==null&&row[key]!==undefined&&row[key]!==''){sell=num(row[key]);if(sell!==null)break}}
    return buy!==null&&sell!==null?buy-sell:null;
  };
  const byDate=new Map();
  for(const row of rows){const date=dateOf(row);if(!date||byDate.has(date))continue;const value=read(row);if(value!==null)byDate.set(date,value)}
  const datedValues=[...byDate.entries()].sort((a,b)=>b[0].localeCompare(a[0])).slice(0,40);
  const values=datedValues.map(([,value])=>value);
  if(!values.length)return{count:null,streak:'—',sellStreak:'—',latestSign:0,days:0,periods:[]};
  const periods=[5,20,40].map(period=>{const slice=datedValues.slice(0,period);const positive=slice.filter(([,v])=>v>0).length;const netShares=slice.length?slice.reduce((sum,[,v])=>sum+v,0):null;return{period,count:positive,days:slice.length,shares:netShares,ratio:netShares!==null&&floatShares>0?netShares/floatShares*100:null}});
  const count=values.filter(v=>v>0).length;
  const runs=[];let run=0;
  for(const value of values){if(value>0)run++;else{if(run)runs.push(run);run=0}}
  if(run)runs.push(run);
  const sellRuns=[];let sellRun=0;
  for(const value of values){if(value<0)sellRun++;else{if(sellRun)sellRuns.push(sellRun);sellRun=0}}
  if(sellRun)sellRuns.push(sellRun);
  return{count,streak:runs.length?runs.slice(0,15).join('-'):'0',sellStreak:sellRuns.length?sellRuns.slice(0,15).join('-'):'0',latestSign:Math.sign(values[0]),days:values.length,periods};
}
async function fetchFlowHistory(code,exchangeType='KRX'){
  const exchange=String(exchangeType||'KRX').toUpperCase();
  const items=[],seenDates=new Set(),seenCursors=new Set();
  let cursor='',pages=0,lastHasNext=false,lastCursor='';
  // Naver trend API: KRX/NXT are requested separately; use the cursor returned by each response.
  for(let page=0;page<12&&seenDates.size<40;page++){
    const params=new URLSearchParams({code:String(code),exchangeType:exchange,size:'50'});
    if(cursor)params.set('cursor',cursor);
    const url=`${API}/front-api/stock/domestic/trend?${params.toString()}`;
    const data=await getJson(url);
    const result=data?.result??data;
    const pageItems=result?.items;
    if(!Array.isArray(pageItems))throw Error(`${exchange} 수급 응답에 items 배열이 없습니다`);
    pages++;let added=0;
    for(const item of pageItems){
      if(!item||typeof item!=='object')continue;
      const date=String(item.localTradedAt??'').replace(/\D/g,'').slice(0,8);
      if(date&&!seenDates.has(date)){seenDates.add(date);items.push(item);added++}
    }
    lastHasNext=Boolean(result?.hasNext);
    const nextCursor=String(result?.cursor??data?.cursor??'');lastCursor=nextCursor;
    if(seenDates.size>=40||!lastHasNext||!nextCursor||added===0||seenCursors.has(nextCursor))break;
    seenCursors.add(nextCursor);cursor=nextCursor;
  }
  items.sort((a,b)=>String(b.localTradedAt||'').localeCompare(String(a.localTradedAt||'')));
  return{isSuccess:true,result:{items:items.slice(0,40)},_flowMeta:{exchangeType:exchange,pages,days:Math.min(seenDates.size,40),hasNext:lastHasNext,cursor:lastCursor}};
}
function mergeFlowHistory(krRaw,nxRaw){
  const krItems=krRaw?.result?.items||[],nxItems=nxRaw?.result?.items||[];
  const krByDate=new Map(),nxByDate=new Map();
  for(const item of krItems){const date=String(item?.localTradedAt||'').slice(0,10);if(date&&item?.krx)krByDate.set(date,item.krx)}
  for(const item of nxItems){const date=String(item?.localTradedAt||'').slice(0,10);if(date&&item?.nxt)nxByDate.set(date,item.nxt)}
  const items=[];
  for(const [date,krx] of krByDate){
    const nxt=nxByDate.get(date);if(!nxt)continue;
    const total={};
    for(const [netField,buyField,sellField] of [
      ['foreignNetVolume','foreignBuyVolume','foreignSellVolume'],
      ['organizationNetVolume','organizationBuyVolume','organizationSellVolume']
    ]){
      const krNet=num(krx[netField]),nxNet=num(nxt[netField]);
      const krBuy=num(krx[buyField]),nxBuy=num(nxt[buyField]);
      const krSell=num(krx[sellField]),nxSell=num(nxt[sellField]);
      if(krNet!==null&&nxNet!==null)total[netField]=String(krNet+nxNet);
      if(krBuy!==null&&nxBuy!==null)total[buyField]=String(krBuy+nxBuy);
      if(krSell!==null&&nxSell!==null)total[sellField]=String(krSell+nxSell);
    }
    items.push({localTradedAt:date,krx,nxt,total});
  }
  items.sort((a,b)=>b.localTradedAt.localeCompare(a.localTradedAt));
  return{isSuccess:true,result:{items:items.slice(0,40)},_flowMeta:{exchangeType:'TOTAL',days:Math.min(items.length,40),pages:(krRaw?._flowMeta?.pages||0)+(nxRaw?._flowMeta?.pages||0)}};
}
function combinedInvestorFlow(raw,exchange='KRX'){
  const market=String(exchange||'KRX').toLowerCase();
  const rows=flowRecords(raw);
  const getNet=(row,type)=>{
    if(!row||typeof row!=='object')return null;
    const aliases=type==='foreign'?['foreignNetVolume','foreignerNetVolume','foreignPureBuyQuant','foreignerPureBuyQuant']:['organizationNetVolume','organNetVolume','organizationPureBuyQuant','organPureBuyQuant'];
    for(const key of aliases){if(row[key]!==undefined&&row[key]!==null&&row[key]!==''){const value=num(row[key]);if(value!==null)return value}}
    const buys=type==='foreign'?['foreignBuyVolume','foreignerBuyVolume']:['organizationBuyVolume','organBuyVolume'];
    const sells=type==='foreign'?['foreignSellVolume','foreignerSellVolume']:['organizationSellVolume','organSellVolume'];
    let buy=null,sell=null;
    for(const key of buys){if(row[key]!==undefined&&row[key]!==null&&row[key]!==''){buy=num(row[key]);if(buy!==null)break}}
    for(const key of sells){if(row[key]!==undefined&&row[key]!==null&&row[key]!==''){sell=num(row[key]);if(sell!==null)break}}
    return buy!==null&&sell!==null?buy-sell:null;
  };
  const items=[];const seen=new Set();
  for(const item of rows){
    const date=String(item?.localTradedAt||'').slice(0,10);if(!date||seen.has(date))continue;seen.add(date);
    const source=market==='total'?(item.total||null):(item[market]||null);
    if(!source)continue;
    const foreign=getNet(source,'foreign'),institution=getNet(source,'institution');
    if(foreign===null||institution===null)continue;
    const combined={foreignNetVolume:String(foreign+institution),foreignSignNetVolume:String(foreign),institutionSignNetVolume:String(institution)};
    if(market==='total')items.push({localTradedAt:date,total:combined});
    else items.push({localTradedAt:date,[market]:combined});
  }
  return {isSuccess:true,result:{items},_flowMeta:{exchangeType:exchange,days:items.length}};
}
function renderChart(qs){
  const chart=$('chart'),labels=$('labels');qs=(qs||[]).slice(-6);
  if(!qs.length||qs.every(q=>q.profit===null)){chart.innerHTML='<div class="chart-empty">분기 영업이익 데이터를 확인할 수 없습니다.</div>';labels.innerHTML='';return}
  const vals=qs.map(v=>v.profit).filter(v=>v!==null),maxP=Math.max(0,...vals),maxN=Math.max(0,...vals.map(v=>-v));
  const W=900,top=64,bottom=258,h=bottom-top;
  const allNonNegative=vals.every(v=>v>=0);
  const zero=maxP&&maxN?top+h*maxP/(maxP+maxN):maxP?bottom:top;
  const y=v=>v>=0?zero-(maxP?v/maxP*(zero-top):0):zero+(maxN?-v/maxN*(bottom-zero):0);
  const cell=W/qs.length;
  const bars=qs.map((q,i)=>{
    const x=(i+.5)*cell,v=q.profit;
    if(v===null)return`<text x="${x}" y="160" text-anchor="middle" font-size="10" fill="currentColor">자료 없음</text>`;
    const yy=y(v),bh=Math.max(3,Math.abs(zero-yy)),by=v<0?zero:yy;
    const amount=Math.abs(v)>=10000?`${(v/10000).toLocaleString('ko-KR',{maximumFractionDigits:1})}조`:`${v.toLocaleString('ko-KR',{maximumFractionDigits:1})}억`;
    const pct=q.margin===null?'(—)':`(${q.margin.toLocaleString('ko-KR',{maximumFractionDigits:1})}%)`;
    let amountY,marginY;
    if(v>=0){amountY=Math.max(24,by-33);marginY=Math.max(44,by-13)}
    else{amountY=Math.min(294,by+bh+22);marginY=Math.min(322,by+bh+43)}
    const marginColor=q.margin!==null&&q.margin<0?'#3979d8':'#929baa';
    const amountWidth=Math.min(cell-8,Math.max(12,amount.length*14.4));
    const pctWidth=Math.min(cell-8,Math.max(12,pct.length*12));
    return`<g><rect x="${x-34}" y="${by}" width="68" height="${bh}" rx="4" fill="${v<0?'#3979d8':'#df5967'}" opacity="${/\(E\)/i.test(q.label)?'.75':'1'}"/><text x="${x}" y="${amountY}" text-anchor="middle" font-size="10" textLength="${amountWidth}" lengthAdjust="spacingAndGlyphs" font-weight="750" fill="${v<0?'#3979d8':'currentColor'}">${amount}</text><text x="${x}" y="${marginY}" text-anchor="middle" font-size="10" textLength="${pctWidth}" lengthAdjust="spacingAndGlyphs" font-weight="650" fill="${marginColor}">${pct}</text></g>`;
  }).join('');
  const baselineLabels=allNonNegative?qs.map((q,i)=>{const labelWidth=i===qs.length-1?Math.min(cell-8,120):Math.min(cell-8,112);return`<text x="${(i+.5)*cell}" y="278" text-anchor="middle" font-size="10" textLength="${labelWidth}" lengthAdjust="spacingAndGlyphs" font-weight="600" fill="currentColor">${escapeHtml(q.label||'—')}</text>`}).join(''): '';
  chart.classList.toggle('chart-compact-positive',allNonNegative);
  chart.innerHTML=`<svg class="profit-svg" viewBox="0 0 ${W} ${allNonNegative?292:340}" preserveAspectRatio="none" role="img"><line x1="0" y1="${zero}" x2="${W}" y2="${zero}" stroke="#929baa" stroke-dasharray="4 4"/>${bars}${baselineLabels}</svg>`;
  labels.innerHTML=allNonNegative?'':qs.map(q=>`<span>${escapeHtml(q.label||'—')}</span>`).join('');
}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function isNegativeValue(value){if(value===null||value===undefined)return false;const text=String(value).trim();if(/^[-−]/.test(text))return true;const n=num(text);return n!==null&&n<0}
function priceHistoryMap(raw){const map=new Map();const list=Array.isArray(raw)?raw:objects(raw);for(const item of list){if(!item||typeof item!=='object')continue;const date=String(item.localTradedAt??item.tradeDate??item.date??item.bizdate??item.trdDt??'').replace(/\D/g,'').slice(0,8);const close=num(item.closePrice??item.currentPrice??item.nowPrice??item.tradePrice??item.close??item.stckClpr);if(date&&close!==null)map.set(date,close)}return map}
function renderDailyChart(raw,period=dailyChartPeriod){
 const host=$('dailyChart');if(!host)return;
 const list=(Array.isArray(raw)?raw:objects(raw)).filter(x=>x&&typeof x==='object').map(x=>{
  const date=String(x.localTradedAt??x.tradeDate??x.date??x.bizdate??x.trdDt??'').replace(/\D/g,'').slice(0,8);
  const close=num(x.closePrice??x.currentPrice??x.nowPrice??x.tradePrice??x.close??x.stckClpr);
  const open=num(x.openPrice??x.open??x.stckOprc??x.openingPrice)??close;
  const high=num(x.highPrice??x.high??x.stckHgpr??x.highestPrice)??Math.max(open,close);
  const low=num(x.lowPrice??x.low??x.stckLwpr??x.lowestPrice)??Math.min(open,close);
  const volume=num(x.accumulatedTradingVolume??x.tradingVolume??x.tradeVolume??x.volume??x.acmlVol??x.vol??x.accTradeVolume??x.accumulatedVolume)??0;
  const foreignRate=num(x.foreignRetentionRate??x.foreignerHoldRatio??x.foreignRate??x.foreignOwnershipRate??x.foreignRatio??x.foreignHoldRatio??x.foreignerRetentionRate??x.frgnrHoldRatio??x.frgnHoldRatio); return {date,open,high,low,close,volume,foreignRate};
 }).filter(x=>x.date&&x.close!==null&&x.open!==null&&x.high!==null&&x.low!==null);
 const byDate=new Map();for(const x of list)byDate.set(x.date,x);
 const all=[...byDate.values()].sort((a,b)=>a.date.localeCompare(b.date));const rangeLimit=chartRangeSel[period]||120,startIdx=Math.max(0,all.length-rangeLimit),data=all.slice(startIdx);
 {const ex=exhaustionStore.code&&exhaustionStore.code===current.code?exhaustionStore.value:null;if(Number.isFinite(ex)){let last=-1;for(let i=0;i<all.length;i++)if(Number.isFinite(all[i].foreignRate))last=i;if(last>=0||foreignStore.get(current.code)?.from){for(let i=last+1;i<all.length;i++){all[i].foreignRate=ex;all[i].foreignFilled=true}}}}
 if(!data.length){host.innerHTML=`<div class="chart-empty">${({day:'일봉',week:'주봉',month:'월봉',year:'년봉'}[period]||'차트')} 데이터를 불러오지 못했습니다.</div>`;return;}
 const W=700,left=8,right=54,top=8;
 // 캔들 영역만 확대하고 거래량·외국인 보유율 영역은 기존 높이를 유지한 채 아래로 이동한다.
 const isMobileChart=window.matchMedia('(max-width: 600px)').matches;
 const candleScale=isMobileChart?1.2:1.8;
 const candleExtra=Math.round((160-top)*(candleScale-1));
 const priceBottom=160+candleExtra,volumeTop=174+candleExtra,volumeBottom=218+candleExtra,foreignTop=235+candleExtra,foreignBottom=286+candleExtra;
 const H=foreignBottom+(isMobileChart?7:22),plotW=W-left-right,plotH=priceBottom-top;
 let min=Math.min(...data.map(x=>x.low)),max=Math.max(...data.map(x=>x.high));if(min===max){min*=.99;max*=1.01}const pad=(max-min)*.06;min-=pad;max+=pad;
 const y=v=>top+(max-v)/(max-min)*plotH,step=plotW/data.length,cw=Math.max(1,Math.min(data.length<=40?16:7,step*.58));
 const grid=[0,.25,.5,.75,1].map(t=>{const val=max-(max-min)*t,yy=top+plotH*t;return `<line class="daily-grid-line" x1="${left}" y1="${yy}" x2="${W-right}" y2="${yy}"/><text class="daily-axis-text" x="${W-right+5}" y="${yy+3}" text-anchor="start">${Math.round(val).toLocaleString('ko-KR')}</text>`}).join('');
 const maPeriods=period==='day'?[5,10,20,40,60,120]:period==='week'?[5,10,20,40,60,120]:period==='month'?[5,10,20,40,60]:[3,5,10,20];
 const maColors={5:'#e53935',10:'#fb8c00',20:'#fdd835',40:'#43a047',60:'#00acc1',120:'#8e24aa'};
 const movingAverages='<g clip-path="url(#dailyClip)">'+maPeriods.map(mp=>{if(all.length<mp)return '';const points=[];let sum=0;for(let i=0;i<all.length;i++){sum+=all[i].close;if(i>=mp)sum-=all[i-mp].close;if(i>=mp-1&&i>=startIdx){points.push(`${(left+(i-startIdx+.5)*step).toFixed(2)},${y(sum/mp).toFixed(2)}`)}}return points.length>1?`<polyline points="${points.join(' ')}" fill="none" stroke="${maColors[mp]}" stroke-width="1" stroke-linejoin="round" stroke-linecap="round"/>`:''}).join('')+'</g>';
 const candles=data.map((d,i)=>{const x=left+(i+.5)*step,up=d.close>=d.open,color=up?'#df5967':'#3979d8',bodyY=Math.min(y(d.open),y(d.close)),bodyH=Math.max(1,Math.abs(y(d.open)-y(d.close)));return `<line x1="${x}" y1="${y(d.high)}" x2="${x}" y2="${y(d.low)}" stroke="${color}" stroke-width="1"/><rect x="${x-cw/2}" y="${bodyY}" width="${cw}" height="${bodyH}" fill="${color}"/>`}).join('');
 const maxVolume=Math.max(1,...data.map(d=>d.volume||0));
  const foreignRows=data.filter(d=>d.foreignRate!==null&&d.foreignRate!==undefined&&Number.isFinite(d.foreignRate));
  const minRate=foreignRows.length?Math.min(...foreignRows.map(d=>d.foreignRate)):0,maxRate=foreignRows.length?Math.max(...foreignRows.map(d=>d.foreignRate)):100;
  const rateSpan=Math.max(0.01,maxRate-minRate),ratePad=rateSpan*0.12;
  const rateMin=Math.max(0,minRate-ratePad),rateMax=maxRate+ratePad;
  const foreignY=v=>foreignBottom-((v-rateMin)/(rateMax-rateMin))*(foreignBottom-foreignTop);
  const foreignGrid=Array.from({length:5},(_,i)=>{const value=rateMax-(rateMax-rateMin)*i/4,yy=foreignTop+(foreignBottom-foreignTop)*i/4;return `<line x1="${left}" y1="${yy}" x2="${W-right}" y2="${yy}" stroke="#929baa" stroke-width="1" stroke-dasharray="3 4" opacity=".8"/><text class="daily-axis-text" x="${W-right+5}" y="${yy+3}" text-anchor="start">${value.toFixed(2)}%</text>`}).join('');
  const okRate=d=>d.foreignRate!==null&&d.foreignRate!==undefined&&Number.isFinite(d.foreignRate);
  const realPts=[],fillPts=[];
  data.forEach((d,i)=>{if(!okRate(d))return;const pt=[left+(i+.5)*step,foreignY(d.foreignRate)];if(d.foreignFilled){if(!fillPts.length&&realPts.length)fillPts.push(realPts[realPts.length-1]);fillPts.push(pt)}else realPts.push(pt)});
  const foreignLine=(realPts.length>1?`<polyline points="${realPts.map(p=>p.join(',')).join(' ')}" fill="none" stroke="#e0a33a" stroke-width="2"/>`:'')+(fillPts.length>1?`<polyline points="${fillPts.map(p=>p.join(',')).join(' ')}" fill="none" stroke="#e0a33a" stroke-width="2" stroke-dasharray="4 3"/>`:'');

 const volumes=data.map((d,i)=>{const x=left+(i+.5)*step,h=Math.max(d.volume>0?1:0,(d.volume||0)/maxVolume*(volumeBottom-volumeTop)),color=d.close>=d.open?'#df5967':'#3979d8';return h?`<rect x="${x-cw/2}" y="${volumeBottom-h}" width="${cw}" height="${h}" fill="${color}" opacity=".78"/>`:''}).join('');
 // 탭(일/주/월/년)별 세부 날짜 눈금: 일·주=월(1월·첫 눈금은 연도 포함), 월=연도, 년=연도(간격 자동 조정)
 const fine=period==='day'&&data.length<=45,fineM=period==='month'&&data.length<=30;
 const tickKey=d=>fine?d.date:period==='year'?d.date.slice(0,4):period==='month'?(fineM?d.date.slice(0,6):d.date.slice(0,4)):d.date.slice(0,6);
 const tickText=(key,idx)=>{if(fine)return `${key.slice(4,6)}.${key.slice(6,8)}`;if(period==='year')return key;if(period==='month')return fineM?`${key.slice(2,4)}.${key.slice(4,6)}`:key;const mm=key.slice(4,6);return (idx===0||mm==='01')?`${key.slice(2,4)}.${mm}`:`${mm}.`};
 let ticks=[];{let last='';for(let i=0;i<data.length;i++){const k=tickKey(data[i]);if(k!==last){ticks.push({i,key:k});last=k}}}
 const minGap=(period==='year'||(period==='month'&&!fineM))?38:(fine||fineM)?(isMobileChart?26:30):(isMobileChart?24:26);
 {const kept=[];let lastX=-1e9;for(const t of ticks){const x=left+(t.i+.5)*step;if(x-lastX>=minGap||!kept.length){kept.push(t);lastX=x}}ticks=kept}
 const monthLines=ticks.map(({i})=>{const x=left+(i+.5)*step;return `<line class="daily-month-separator" x1="${x}" y1="${top}" x2="${x}" y2="${foreignBottom}"/>`}).join('');
 const monthLabels=ticks.map(({i,key},n)=>{const x=left+(i+.5)*step;return `<text class="daily-axis-text daily-month-label-desktop" x="${x}" y="${foreignBottom+7}" text-anchor="middle">${tickText(key,n===0?0:1)}</text>`}).join('');
 const mobileMonthDates=ticks.map(({i,key},n)=>{const position=((i+.5)/data.length)*100;return `<span style="left:${position.toFixed(3)}%">${tickText(key,n===0?0:1)}</span>`}).join('');
 const fmtDate=d=>{const y=d.date.slice(0,4),m=d.date.slice(4,6),dd=d.date.slice(6,8);if(period==='year')return `${y}년`;if(period==='month')return `${y}.${m}`;if(period==='week'){const dt=new Date(Number(y),Number(m)-1,Number(dd));const off=(new Date(dt.getFullYear(),dt.getMonth(),1).getDay()+6)%7;return `${y}.${m} ${Math.ceil((dt.getDate()+off)/7)}주차`}return `${y}.${m}.${dd}`};
 const detailHtml=i=>{const d=data[i],prev=i>0?data[i-1].close:null,chg=prev?(d.close-prev)/prev*100:null,col=chg===null?'':chg>0?'#df5967':chg<0?'#3979d8':'';const f=n=>Math.round(n).toLocaleString('ko-KR');return `<b>${fmtDate(d)}</b><span>시 ${f(d.open)}</span><span>고 ${f(d.high)}</span><span>저 ${f(d.low)}</span><span style="color:${col};font-weight:700">종 ${f(d.close)}${chg===null?'':` (${chg>0?'+':''}${chg.toFixed(2)}%)`}</span><span>거래량 ${f(d.volume||0)}</span>${Number.isFinite(d.foreignRate)?`<span style="color:#e0a33a">외국인 ${d.foreignRate.toFixed(2)}%${d.foreignFilled?' (소진율)':''}</span>`:''}`};
 host.innerHTML=`<div class="daily-ma-legend">${maPeriods.map(p=>`<span style="color:${maColors[p]}"><i style="display:inline-block;width:13px;border-top:1px solid ${maColors[p]};vertical-align:middle;margin-right:3px"></i>${p}${period==='day'?'일':period==='week'?'주':period==='month'?'월':'년'}</span>`).join('')}<span class="daily-volume-legend">거래량</span><span style="color:#e0a33a">외국인 보유율 ━ <small>(┅ 소진율)</small></span></div><div class="daily-detail" id="dailyDetail">${detailHtml(data.length-1)}</div><svg class="daily-candle-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${({day:'일봉',week:'주봉',month:'월봉',year:'년봉'}[period]||'주가')} 캔들, 이동평균선 및 거래량 차트"><defs><clipPath id="dailyClip"><rect x="${left}" y="${top}" width="${plotW}" height="${priceBottom-top}"/></clipPath></defs>${grid}${monthLines}<line class="daily-grid-line" x1="${left}" y1="${volumeTop}" x2="${W-right}" y2="${volumeTop}"/>${candles}${movingAverages}${volumes}<line class="daily-grid-line" x1="${left}" y1="${foreignTop-7}" x2="${W-right}" y2="${foreignTop-7}"/>${foreignGrid}${foreignLine}${monthLabels}<line id="dailyCursor" class="daily-cursor" x1="0" y1="${top}" x2="0" y2="${foreignBottom}" style="display:none"/></svg><div class="daily-month-date-row">${mobileMonthDates}</div>`;
 {const svg=host.querySelector('.daily-candle-svg'),box=$('dailyDetail'),cur=$('dailyCursor'),last=data.length-1;
  const pick=e=>{const r=svg.getBoundingClientRect();if(!r.width)return;const vx=(e.clientX-r.left)/r.width*W;const i=Math.max(0,Math.min(last,Math.floor((vx-left)/step)));const x=left+(i+.5)*step;cur.setAttribute('x1',x);cur.setAttribute('x2',x);cur.style.display='';box.innerHTML=detailHtml(i)};
  const reset=()=>{cur.style.display='none';box.innerHTML=detailHtml(last)};
  svg.addEventListener('pointerdown',pick);svg.addEventListener('pointermove',e=>{if(e.pointerType==='mouse'||e.buttons)pick(e)});svg.addEventListener('mouseleave',reset);}
 const range=$('dailyChartRange');if(range)range.textContent=`${data[0].date.slice(0,4)}.${data[0].date.slice(4,6)}.${data[0].date.slice(6,8)} – ${data[data.length-1].date.slice(0,4)}.${data[data.length-1].date.slice(4,6)}.${data[data.length-1].date.slice(6,8)} · ${({day:'일',week:'주',month:'월',year:'년'}[period]||'')}봉 ${data.length}개`;
}
function streakDisplayHtml(value,highlight){const text=String(value??'—');return highlight&&/^\d/.test(text)?`<strong>${text[0]}</strong>${text.slice(1)}`:text}
function sharesText(value){if(value===null||value===undefined)return '자료 없음';const sign=value>0?'+':value<0?'−':'';return `${sign}${Math.round(Math.abs(value)).toLocaleString('ko-KR')}주`}
function foreignCountHtml(f,showBoth=false){if(f.count===null)return '자료 없음';return f.periods.map(p=>{const threshold=p.period===5?3:p.period===20?12:15;const hot=p.count>=threshold;const color=hot?'#df5967':'';const sharesColor=p.shares===null?'':p.shares>0?'#df5967':p.shares<0?'#3979d8':'';const ratioDisplay=Number.isFinite(p.ratio)?`${p.ratio.toFixed(2)}%`:'-%';const ratioColor=Number.isFinite(p.ratio)?(p.ratio<0?'#3979d8':p.ratio>=1?'#df5967':'#000000'):'#000000';const countText=showBoth?`${p.count}<span style="color:#000000">(${p.bothCount||0})</span>`:p.count;return `<span class="flow-period"><span class="flow-count" style="${color?`color:${color};font-weight:800`:''}">${countText}</span><span class="flow-suffix">/${p.period}일</span> <span class="flow-shares" style="${sharesColor?`color:${sharesColor};font-weight:750`:''}">[${sharesText(p.shares)} <span style="color:${ratioColor}">(${ratioDisplay})</span>]</span></span>`}).join('')}
function normalizeCandleRows(raw){
 const list=(Array.isArray(raw)?raw:objects(raw)).filter(x=>x&&typeof x==='object').map(x=>{
  const date=String(x.localTradedAt??x.tradeDate??x.date??x.bizdate??x.trdDt??'').replace(/\D/g,'').slice(0,8);
  const close=num(x.closePrice??x.currentPrice??x.nowPrice??x.tradePrice??x.close??x.stckClpr);
  const open=num(x.openPrice??x.open??x.stckOprc??x.openingPrice)??close;
  const high=num(x.highPrice??x.high??x.stckHgpr??x.highestPrice)??Math.max(open,close);
  const low=num(x.lowPrice??x.low??x.stckLwpr??x.lowestPrice)??Math.min(open,close);
  const volume=num(x.accumulatedTradingVolume??x.tradingVolume??x.tradeVolume??x.volume??x.acmlVol??x.vol??x.accTradeVolume??x.accumulatedVolume)??0;
  return {date,open,high,low,close,volume};
 }).filter(x=>x.date&&x.close!==null&&x.open!==null&&x.high!==null&&x.low!==null);
 const byDate=new Map();for(const x of list)byDate.set(x.date,x);return [...byDate.values()].sort((a,b)=>a.date.localeCompare(b.date));
}
function aggregateCandles(rows,period){
 if(period==='day')return rows.map(r=>({...r}));
 const buckets=new Map();for(const d of rows){let key=period==='year'?d.date.slice(0,4):period==='month'?d.date.slice(0,6):(()=>{const dt=new Date(Number(d.date.slice(0,4)),Number(d.date.slice(4,6))-1,Number(d.date.slice(6,8)));const start=new Date(dt);start.setDate(start.getDate()-((start.getDay()+6)%7));return start.getFullYear()+String(start.getMonth()+1).padStart(2,'0')+String(start.getDate()).padStart(2,'0')})();if(!buckets.has(key))buckets.set(key,{date:d.date,open:d.open,high:d.high,low:d.low,close:d.close,volume:d.volume||0});else{const b=buckets.get(key);b.high=Math.max(b.high,d.high);b.low=Math.min(b.low,d.low);b.close=d.close;b.date=d.date;b.volume=(b.volume||0)+(d.volume||0)}}
 return [...buckets.values()].sort((a,b)=>a.date.localeCompare(b.date));
}
async function loadListedSharesFromCompany(code){
 const keys=['listedShares','listedShareCount','totalListedShares','sharesOutstanding','issuedShares','listingShareCount','totalShares','상장주식수','발행주식수','총발행주식수'];
 const parse=v=>{if(v===null||v===undefined)return null;const t=String(v).replace(/,/g,'').replace(/\u00a0/g,' ').trim();const m=t.match(/([0-9]+(?:\.[0-9]+)?)\s*(조|억|만)?/);if(!m)return null;let n=Number(m[1]);if(m[2]==='조')n*=1e12;else if(m[2]==='억')n*=1e8;else if(m[2]==='만')n*=1e4;return Number.isFinite(n)&&n>1e7?Math.round(n):null};
 try{const basic=await first([`${API}/api/stock/${code}/basic`]);for(const o of objects(basic)){for(const [k,v] of Object.entries(o)){if(keys.some(x=>x.toLowerCase()===k.toLowerCase())){const n=parse(v?.value??v?.formattedValue??v?.text??v);if(n)return n}}}}catch{}
 const pages=[`https://mobile2.wisereport.co.kr/CompanyInfo/Status/${encodeURIComponent(code)}/`,`https://navercomp.wisereport.co.kr/v2/company/c1010001.aspx?cmp_cd=${encodeURIComponent(code)}`];
 for(const url of pages){try{const html=await getText(url);const doc=new DOMParser().parseFromString(html,'text/html');const clean=x=>(x?.innerText||x?.textContent||'').replace(/\s+/g,' ').trim();for(const row of doc.querySelectorAll('tr,li,dl,.info-row,.table-row')){const text=clean(row);if(!/(발행주식수|상장주식수|총발행주식수)/.test(text))continue;const cells=[...row.querySelectorAll('th,td,dt,dd,span,strong,b')].map(clean).filter(Boolean);for(let i=cells.length-1;i>=0;i--){const n=parse(cells[i]);if(n)return n}const tail=text.replace(/.*?(발행주식수|상장주식수|총발행주식수)/,'');const n=parse(tail);if(n)return n}const plain=clean(doc.body);const m=plain.match(/(?:발행주식수|상장주식수|총발행주식수)[^0-9]{0,160}([0-9,]{7,})/);if(m){const n=parse(m[1]);if(n)return n}}catch{}}
 return null;
}
function neededDays(p,n){return p==='day'?n+130:p==='week'?(n+130)*5:p==='month'?(n+60)*21:(n+20)*252}
function renderRangeTabs(period){const box=$('dailyRangeTabs');if(!box)return;box.innerHTML=chartRanges[period].map(n=>`<button type="button" data-range="${n}" class="${n===chartRangeSel[period]?'on':''}">${n}${chartUnit[period]}</button>`).join('')}
async function fetchDailyRows(code,days){
 const old=dailyRowsStore.get(code)||{rows:[],exhausted:false,priceEnded:false,deepEnded:false};
 const byDate=new Map(old.rows.map(r=>[r.date,r]));
 const maxPages=Math.min(320,Math.ceil(days/60)+1);let page=Math.max(1,Math.floor(old.rows.length/60)),priceEnded=!!old.priceEnded,deepEnded=!!old.deepEnded;
 // 1단계: 모바일 가격 API(pageSize=60)를 페이지 순서로 조회. 이 API는 약 2003년 이전 이력을 주지 않을 수 있다.
 while(!priceEnded&&page<=maxPages){
  const nums=Array.from({length:Math.min(10,maxPages-page+1)},(_,i)=>page+i);
  const res=await Promise.all(nums.map(n=>first([`${API}/api/stock/${code}/price?pageSize=60&page=${n}`]).catch(()=>null)));
  if(!res.some(Boolean)){priceEnded=true;break}
  let added=0;for(const r of res){if(!r)continue;for(const c of normalizeCandleRows(r)){if(!byDate.has(c.date)){byDate.set(c.date,c);added++}}}
  if(!added){priceEnded=true;break}
  page+=10;
 }
 // 2단계: 가격 API가 끝났는데도 필요한 과거 이력이 모자라면 차트 API(startDateTime~endDateTime)로 120일씩 거슬러 올라가며 보충한다.
 if(priceEnded&&byDate.size<days&&!deepEnded&&byDate.size){
  const dayMs=86400000,fmt=d=>`${d.getUTCFullYear()}${String(d.getUTCMonth()+1).padStart(2,'0')}${String(d.getUTCDate()).padStart(2,'0')}`;
  const earliest=[...byDate.keys()].sort()[0];
  let cursorEnd=Date.UTC(+earliest.slice(0,4),+earliest.slice(4,6)-1,+earliest.slice(6,8));const floor=Date.UTC(1980,0,1);let anyOk=false;
  while(cursorEnd>floor&&byDate.size<days){
   const chunks=[];for(let k=0;k<10&&cursorEnd>floor;k++){const e=cursorEnd,st0=e-119*dayMs;chunks.push([fmt(new Date(st0)),fmt(new Date(e))]);cursorEnd=st0-dayMs}
   const res=await Promise.all(chunks.map(([a,b])=>first([`https://api.stock.naver.com/chart/domestic/item/${code}?periodType=dayCandle&startDateTime=${a}&endDateTime=${b}`]).catch(()=>null)));
   if(res.some(Boolean))anyOk=true;
   let added=0;
   for(const r of res){if(!r)continue;const list=Array.isArray(r?.priceInfos)?r.priceInfos:objects(r);for(const c of normalizeCandleRows(list.filter(x=>x&&typeof x==='object').map(x=>({...x,localTradedAt:x.localTradedAt??x.localDate})))){if(!byDate.has(c.date)){byDate.set(c.date,c);added++}}}
   if(!added){deepEnded=anyOk;break}
  }
  if(cursorEnd<=floor)deepEnded=true;
 }
 const rows=[...byDate.values()].sort((a,b)=>a.date.localeCompare(b.date));
 if(!rows.length)throw Error('일봉 가격 API 응답이 비어 있습니다');
 const st={rows,exhausted:deepEnded,priceEnded,deepEnded};dailyRowsStore.set(code,st);return st;
}
const trendVariant={name:null};
function parseForeignTrend(raw){
 const out=new Map();
 const explicit=['foreignerHoldRatio','foreignHoldRatio','foreignRetentionRate','foreignerRetentionRate','foreignRate','foreignOwnershipRate','foreignerOwnershipRatio','foreignOwnRatio','frgnrHoldRatio','frgnHoldRatio'];
 const rateOf=o=>{for(const k of explicit){const v=num(o?.[k]);if(v!==null&&v>=0&&v<=100)return v}for(const [k,val] of Object.entries(o||{})){if(val&&typeof val==='object')continue;if(/(foreign|frgn)/i.test(k)&&/(hold|retention|owner|own)/i.test(k)&&!/(net|buy|sell|volume|quant|shares?)/i.test(k)){const v=num(val);if(v!==null&&v>=0&&v<=100)return v}}return null};
 const walk=(node,depth)=>{
  if(!node||typeof node!=='object'||depth>6)return;
  if(Array.isArray(node)){for(const it of node)walk(it,depth+1);return}
  const date=String(node.localTradedAt??node.bizdate??node.localDate??node.tradeDate??node.date??node.baseDate??'').replace(/\D/g,'').slice(0,8);
  if(/^\d{8}$/.test(date)){let rate=rateOf(node);if(rate===null){for(const v of Object.values(node)){if(v&&typeof v==='object'&&!Array.isArray(v)){rate=rateOf(v);if(rate!==null)break}}}if(rate!==null)out.set(date,rate);return}
  for(const v of Object.values(node))if(v&&typeof v==='object')walk(v,depth+1);
 };
 walk(raw,0);return out;
}
function trendNextCursor(raw){const r=raw?.result??raw;return String(r?.cursor??r?.nextCursor??raw?.cursor??raw?.nextCursor??'')}
// 종목 투자자 동향(stock.naver.com tradingTrend)의 외국인 보유율을 과거로 페이지를 넘기며 가져온다.
async function fetchTrendRates(code,fromDate){
 const size=100,out=new Map();let ended=false;
 const dUrl=q=>`${DESKTOP}/api/domestic/detail/${code}/trend?tradeType=KRX&${q}`;
 const variants=[
  {name:'idx',kind:'page',url:(n,step)=>dUrl(`startIdx=${n*step}&pageSize=${size}`)},
  {name:'page',kind:'page',url:n=>dUrl(`page=${n+1}&pageSize=${size}`)},
  {name:'cursor',kind:'cursor',url:c=>dUrl(`pageSize=${size}${c?`&cursor=${encodeURIComponent(c)}`:''}`)},
  {name:'mcursor',kind:'cursor',url:c=>`${API}/front-api/stock/domestic/trend?code=${code}&exchangeType=KRX&size=50${c?`&cursor=${encodeURIComponent(c)}`:''}`}
 ];
 const get=async u=>{try{return await getJson(u)}catch{return null}};
 const minKey=()=>out.size?[...out.keys()].reduce((a,b)=>a<b?a:b):'99999999';
 const addAll=m=>{let n=0;for(const [d,r] of m)if(!out.has(d)){out.set(d,r);n++}return n};
 const order=trendVariant.name?[...variants.filter(v=>v.name===trendVariant.name),...variants.filter(v=>v.name!==trendVariant.name)]:variants;
 for(const v of order){
  const p0=await get(v.kind==='cursor'?v.url(''):v.url(0,size));const m0=parseForeignTrend(p0);
  if(!m0.size)continue;
  const step=m0.size;
  if(v.kind==='cursor'){
   let cursor=trendNextCursor(p0);if(!cursor){addAll(m0);continue}
   const p1=await get(v.url(cursor));const m1=parseForeignTrend(p1);
   if(![...m1.keys()].some(d=>!m0.has(d))){addAll(m0);continue}
   trendVariant.name=v.name;addAll(m0);addAll(m1);cursor=trendNextCursor(p1);
   const seen=new Set([cursor]);
   for(let i=0;i<150&&cursor&&minKey()>fromDate;i++){const p=await get(v.url(cursor));const added=addAll(parseForeignTrend(p));const next=trendNextCursor(p);if(!added||!next||seen.has(next)){ended=true;break}seen.add(next);cursor=next}
   if(!cursor)ended=true;
   return {map:out,ended};
  }
  const p1=await get(v.url(1,step));const m1=parseForeignTrend(p1);
  if(![...m1.keys()].some(d=>!m0.has(d))){addAll(m0);continue}
  trendVariant.name=v.name;addAll(m0);addAll(m1);
  let n=2;
  for(let guard=0;guard<80&&minKey()>fromDate;guard++){
   const batch=await Promise.all(Array.from({length:8},(_,i)=>get(v.url(n+i,step))));n+=8;
   let added=0;for(const b of batch)added+=addAll(parseForeignTrend(b));
   if(!added){ended=true;break}
  }
  return {map:out,ended};
 }
 return {map:out,ended:false};
}
async function fetchForeignRange(code,from,to,isDay,count){
 const chartUrl=(a,b)=>`https://api.stock.naver.com/chart/domestic/item/${code}?periodType=dayCandle&startDateTime=${a}&endDateTime=${b}`;
 const parse=raw=>{
  const list=Array.isArray(raw?.priceInfos)?raw.priceInfos:objects(raw);
  const dateKeys=['localDate','localTradedAt','tradeDate','date','bizdate','trdDt','yyyymmdd','basDt'];
  const rateKeys=['foreignRetentionRate','foreignerHoldRatio','foreignRate','foreignOwnershipRate','foreignRatio','foreignHoldRatio','foreignerRetentionRate','frgnrHoldRatio','frgnHoldRatio'];
  const map=new Map();
  for(const row of list){
   const date=String(dateKeys.map(k=>row?.[k]).find(v=>v!==undefined&&v!==null)||'').replace(/\D/g,'').slice(0,8);
   let rate=null;for(const key of rateKeys){rate=num(row?.[key]);if(rate!==null)break}
   if(rate===null){for(const [key,value] of Object.entries(row||{})){if(/foreign.*(rate|ratio|hold)|frgn.*(rate|ratio|hold)/i.test(key)){rate=num(value);if(rate!==null)break}}}
   if(date&&rate!==null)map.set(date,rate);
  }
  return map;
 };
 const out=new Map();
 try{const t=await fetchTrendRates(code,from);for(const [d,r] of t.map)out.set(d,r);const e=out.size?[...out.keys()].reduce((a,b)=>a<b?a:b):'';if(out.size&&(e<=from||t.ended))return out}catch(e){console.warn('투자자 동향 외국인 보유율 조회 실패',e)}
 try{for(const [d,r] of parse(await first([chartUrl(from,to)]))){if(!out.has(d))out.set(d,r)}}catch{}
 const earliest=out.size?Math.min(...[...out.keys()].map(Number)):0;
 if(!out.size||earliest>Number(from)){
  const toDate=d=>`${d.getUTCFullYear()}${String(d.getUTCMonth()+1).padStart(2,'0')}${String(d.getUTCDate()).padStart(2,'0')}`;
  const mk=t=>new Date(Date.UTC(+String(t).slice(0,4),+String(t).slice(4,6)-1,+String(t).slice(6,8)));
  const start=mk(from),endMissing=out.size?mk(earliest):mk(to);
  let chunks=[];let cursor=new Date(start);
  while(cursor<endMissing){const chunkEnd=new Date(cursor);chunkEnd.setUTCDate(chunkEnd.getUTCDate()+119);if(chunkEnd>=endMissing)chunkEnd.setTime(endMissing.getTime()-86400000);if(chunkEnd<cursor)break;chunks.push([toDate(cursor),toDate(chunkEnd)]);cursor=new Date(chunkEnd);cursor.setUTCDate(cursor.getUTCDate()+1)}
  chunks=chunks.slice(-40);
  for(let i=0;i<chunks.length;i+=5){const batch=await Promise.all(chunks.slice(i,i+5).map(([a,b])=>first([chartUrl(a,b)]).then(parse).catch(()=>new Map())));for(const part of batch)for(const [d,r] of part)out.set(d,r)}
 }
 if(isDay&&out.size<count){
  const parsePage=async page=>{
   const html=await getText(`https://finance.naver.com/item/frgn.naver?code=${code}&page=${page}`);
   const doc=new DOMParser().parseFromString(html,'text/html');const m=new Map();
   for(const table of doc.querySelectorAll('table')){
    const rows=[...table.querySelectorAll('tr')];let dateCol=-1,rateCol=-1;
    for(const row of rows){const heads=[...row.querySelectorAll('th')].map(x=>(x.textContent||'').replace(/\s+/g,'').trim());if(heads.length){dateCol=heads.findIndex(x=>x.includes('날짜'));rateCol=heads.findIndex(x=>x.includes('외국인')&&(x.includes('비율')||x.includes('보유율')));if(rateCol>=0)break}}
    if(rateCol<0)continue;
    for(const row of rows){const cells=[...row.querySelectorAll('td')].map(x=>(x.textContent||'').replace(/\s+/g,' ').trim());if(!cells.length)continue;const date=(cells[dateCol>=0?dateCol:0]||'').replace(/\D/g,'').slice(0,8);const rate=num(cells[rateCol]);if(/^\d{8}$/.test(date)&&rate!==null)m.set(date,rate)}
    if(m.size)break;
   }
   return m;
  };
  for(let page=1;page<=12;page+=4){
   const batch=await Promise.all(Array.from({length:Math.min(4,13-page)},(_,i)=>parsePage(page+i).catch(()=>new Map())));
   for(const part of batch)for(const [d,r] of part)if(!out.has(d))out.set(d,r);
   if([...out.keys()].some(d=>d<=from))break;
  }
 }
 return out;
}
async function ensureForeign(code,startDate,endDate,isDay,count){
 let st=foreignStore.get(code);if(!st){st={map:new Map(),from:null,to:null};foreignStore.set(code,st)}
 const ranges=[];
 if(st.from===null)ranges.push([startDate,endDate]);else{if(startDate<st.from)ranges.push([startDate,st.from]);if(endDate>st.to)ranges.push([st.to,endDate])}
 if(!ranges.length)return false;
 let changed=false;
 for(const [a,b] of ranges){const part=await fetchForeignRange(code,a,b,isDay,count);for(const [d,r] of part){st.map.set(d,r);changed=true}}
 st.from=st.from===null||startDate<st.from?startDate:st.from;st.to=st.to===null||endDate>st.to?endDate:st.to;
 return changed;
}
async function loadChartPeriod(period){
 if(!current.code)return;
 dailyChartPeriod=period;const code=current.code,request=++dailyChartRequest,host=$('dailyChart'),limit=chartRangeSel[period];
 document.querySelectorAll('.daily-chart-tabs button').forEach(b=>{const active=b.dataset.period===period;b.classList.toggle('active',active);b.setAttribute('aria-selected',String(active))});
 $('dailyChartTitle').textContent=`${limit}${chartUnit[period]}봉 차트`;renderRangeTabs(period);
 const stale=()=>request!==dailyChartRequest||code!==current.code;
 const build=()=>{const st=dailyRowsStore.get(code);if(!st||!st.rows.length)return [];let c=aggregateCandles(st.rows,period);if(!st.exhausted&&period!=='day'&&c.length>1)c=c.slice(1);const f=foreignStore.get(code);if(f)for(const x of c){const r=f.map.get(x.date);if(r!==undefined)x.foreignRate=r}return c};
 try{
  let st=dailyRowsStore.get(code);
  if(!st||(st.rows.length<neededDays(period,limit)&&!st.exhausted)){
   if(!host.querySelector('svg'))host.innerHTML='<div class="chart-empty">차트 데이터를 불러오는 중…</div>';
   $('dailyChartRange').textContent='조회 중…';
   await fetchDailyRows(code,neededDays(period,limit));
   if(stale())return;
  }
  const candles=build();if(!candles.length)throw Error('가격 데이터 없음');
  renderDailyChart(candles,period);
  const vis=candles.slice(-limit);
  try{if(await ensureForeign(code,vis[0].date,vis[vis.length-1].date,period==='day',vis.length)&&!stale())renderDailyChart(build(),period)}catch(e){console.warn('외국인 보유 데이터 조회 실패',e)}
 }catch(e){if(!stale()){host.innerHTML=`<div class="chart-empty">${limit}${chartUnit[period]}봉 데이터를 불러오지 못했습니다. 다시 탭을 눌러 시도해 주세요.</div>`;$('dailyChartRange').textContent='조회 실패'}}
}
function render(s){current={...current,...s};{const ex=num(s.foreignFloat);if(ex!==null)exhaustionStore={code:s.code||current.code,value:ex};if(ex!==null&&dailyRowsStore.has(current.code)&&foreignStore.get(current.code)?.from)loadChartPeriod(dailyChartPeriod)}updateFavoriteButton();renderFavorites();$('name').textContent=s.name||'종목명';$('code').textContent=s.code||'';$('price').childNodes[0].textContent=(s.price||blank)+' ';$('change').textContent=s.change||'시세 정보 없음';for(const k of ['per','pbr','eps','cap','annualOp','ttmOp','ttmNet','roe','debt','foreignFloat','annualMultiple','ttmMultiple','estTtmMultiple','target','opinion'])if($(k)){const value=s[k]||blank;$(k).textContent=value;const text=String(value).trim();const negative=/^\s*[-−]/.test(text)||/\(\s*[-−]\s*\d/.test(text);$(k).style.color=negative?'#3979d8':''}const fairPrice=(multiple)=>{const price=num(s.price),m=num(multiple);return price!==null&&m!==null&&m>0?`${Math.round(price*10/m).toLocaleString('ko-KR')}원`:blank};for(const [id,multiple] of [['fairAnnual',s.annualMultiple],['fairTtm',s.ttmMultiple],['fairEstTtm',s.estTtmMultiple]]){if($(id)){const fair=fairPrice(multiple);$(id).textContent=fair;const fairNum=num(fair),currentPrice=num(s.price);$(id).style.color=fairNum!==null&&currentPrice!==null?(fairNum<currentPrice?'#3979d8':fairNum>currentPrice?'#df5967':'') : ''}}const debtText=String(s.debt??'').replace(/,/g,'');const debtMatch=debtText.match(/[-+]?\d+(?:\.\d+)?/);const debtValue=debtMatch?Number(debtMatch[0]):null;if($('debt'))$('debt').style.color=debtValue!==null&&debtValue>200?'#3979d8':debtValue!==null&&debtValue>100?'#f39a28':'';$('epsRows').innerHTML=(s.epsRows||[]).map(r=>{const v=String(r[1]??'');const negative=/^\s*[-−]/.test(v);return `<div>${escapeHtml(r[0])}<b style="color:${negative?'#3979d8':'var(--text)'}">${escapeHtml(v)}</b></div>`}).join('')||'<div>분기 EPS 자료 없음</div>';const ch=s.change||'';$('change').style.color=/▲|\+/.test(ch)?'#df5967':/▼/.test(ch)?'#3979d8':'';$('price').style.color=$('change').style.color||'var(--text)';renderChart(s.quarters||[]);if(dailyChartPeriod==='day'&&!dailyRowsStore.has(current.code)){if(s.dailyPrices)renderDailyChart(s.dailyPrices,'day');else renderDailyChart([], 'day')}}
function normalize(item){const code=String(item.code||item.itemCode||item.stockCode||item.reutersCode||'').replace(/\D/g,'');return code?{name:item.name||item.stockName||item.itemName||code,code:code.padStart(6,'0')}:null}
async function search(q){if(/^\d{6}$/.test(q))return[{name:seed.find(x=>x.code===q)?.name||q,code:q}];const d=await first([`${API}/front-api/search/autoComplete?query=${encodeURIComponent(q)}&target=stock,index,marketindicator,coin,ipo`]);const a=d?.result?.items||d?.items||d?.result||[];return(Array.isArray(a)?a:[]).map(normalize).filter(Boolean).slice(0,12)}
function showResults(items,q,msg=''){const box=$('results');box.hidden=!q;if(msg){box.innerHTML=`<div class="result">${escapeHtml(msg)}</div>`;return}if(!items.length){box.innerHTML='<div class="result">검색 결과가 없습니다.</div>';return}box.innerHTML=items.map(x=>`<button class="result" data-code="${x.code}" data-name="${escapeHtml(x.name)}">${escapeHtml(x.name)}<small>${x.code}</small> ›</button>`).join('');box.querySelectorAll('[data-code]').forEach(b=>b.onclick=()=>load(b.dataset.code,b.dataset.name))}

// 공유 URL에서 종목을 자동으로 찾아 기존 상세 화면으로 연결한다. 기존 검색/조회 흐름은 그대로 사용한다.
function initialStockFromUrl(){
 try{
  const params=new URLSearchParams(location.search||'');
  const aliases=new Set(['code','stockcode','itemcode','ticker','종목코드','url','naver','stockurl','stock','name','query','q','종목명','종목']);
  let raw='';
  // URLSearchParams로 일반/한글 파라미터를 우선 처리
  for(const [key,value] of params.entries()){
   let normalized=String(key||'').trim().toLowerCase();
   try{normalized=decodeURIComponent(normalized.replace(/\+/g,'%20')).trim().toLowerCase()}catch{}
   if(aliases.has(normalized)&&String(value||'').trim()){raw=String(value).trim();break}
  }
  // 일부 공유 서비스가 쿼리 문자열을 재인코딩한 경우를 위한 원문 보정
  if(!raw){
   const query=String(location.search||'').replace(/^\?/,'');
   for(const part of query.split('&')){
    if(!part)continue;
    const split=part.indexOf('=');
    if(split<0)continue;
    let key=part.slice(0,split),value=part.slice(split+1);
    for(let i=0;i<2;i++){
     try{key=decodeURIComponent(key.replace(/\+/g,'%20'))}catch{}
     try{value=decodeURIComponent(value.replace(/\+/g,'%20'))}catch{}
    }
    if(aliases.has(String(key).trim().toLowerCase())&&String(value).trim()){raw=String(value).trim();break}
   }
  }
  if(!raw)return null;
  let candidate=raw;
  // 네이버 종목 URL 또는 URL 인코딩 문자열에서 6자리 종목코드 추출
  for(let i=0;i<2;i++){try{candidate=decodeURIComponent(candidate)}catch{}}
  if(/https?:|stock\.naver\.com|m\.stock\.naver\.com/i.test(candidate)){
   try{
    const u=new URL(candidate);
    const fromQuery=u.searchParams.get('code')||u.searchParams.get('itemCode');
    if(fromQuery&&/^\d{6}$/.test(fromQuery))return{code:fromQuery};
    const match=u.pathname.match(/(?:domestic\/stock\/|item\/)(\d{6})/);
    if(match)return{code:match[1]};
   }catch{}
   const match=candidate.match(/(?:code=|domestic(?:%2F|\/)stock(?:%2F|\/))(\d{6})/i);
   if(match)return{code:match[1]};
   return null;
  }
  candidate=candidate.trim();
  if(/^\d{6}$/.test(candidate))return{code:candidate};
  return candidate?{name:candidate}:null;
 }catch{return null}
}
async function loadInitialStockFromUrl(){
 const target=initialStockFromUrl();if(!target)return;
 if(target.code){const known=seed.find(x=>x.code===target.code);$('query').value=known?.name||target.code;load(target.code,known?.name||target.code);return}
 $('query').value=target.name;$('clear').hidden=false;
 try{
  const items=await search(target.name);
  const exact=items.find(x=>String(x.name).trim().toLowerCase()===target.name.toLowerCase());
  if(exact){load(exact.code,exact.name);return}
  if(items.length===1){load(items[0].code,items[0].name);return}
  showResults(items,target.name,items.length?'종목을 선택해 주세요.':'검색 결과가 없습니다.');
 }catch{
  const local=seed.filter(x=>x.name.toLowerCase()===target.name.toLowerCase()||x.name.toLowerCase().includes(target.name.toLowerCase()));
  if(local.length===1)load(local[0].code,local[0].name);else showResults(local,target.name,local.length?'종목을 선택해 주세요.':'종목 검색에 실패했습니다. 종목명이나 코드를 확인해 주세요.');
 }
}
async function load(code,name=''){dailyChartPeriod='day';chartRangeSel={...chartRangeDefault};dailyRowsStore.delete(code);foreignStore.delete(code);renderRangeTabs('day');$('dailyChartTitle').textContent='120일봉 차트';dailyChartCache.clear();loadInvestorTrend(code);dailyChartForeignDone.clear();dailyChartForeignInFlight.clear();document.querySelectorAll('.daily-chart-tabs button').forEach(b=>{b.classList.toggle('active',b.dataset.period==='day');b.setAttribute('aria-selected',String(b.dataset.period==='day'))});const id=++seq,known=seed.find(x=>x.code===code);current={code,name:name||known?.name||code};dartConsensusQuarters=[];dartFinancialDataCache=null;dartNaverEarningsData=null;dartFundamentalCache=null;dartFundamentalLoadedCode='';if($('dartFundamentalLoad'))$('dartFundamentalLoad').hidden=false;if($('dartFundamentalRefresh'))$('dartFundamentalRefresh').hidden=true;if($('dartFundamentalContent'))$('dartFundamentalContent').hidden=true;renderDartSurpriseAnalysis();loadDartFinancials();const dartLink=$('dartLink');if(dartLink){const dartName=name||known?.name||code;dartLink.href=`https://dart.fss.or.kr/html/search/SearchCompanyIR3_M.html?textCrpNM=${encodeURIComponent(dartName)}`;dartLink.dataset.dartName=dartName;}updateFavoriteButton();$('name').textContent=current.name;$('code').textContent=code;$('change').textContent='데이터 조회 중…';$('status').textContent='네이버 증권 데이터 조회 중…';$('query').value=current.name;$('results').hidden=true;$('chart').innerHTML='<div class="chart-empty">분기 재무 데이터 조회 중…</div>';try{const flowKrxPromise=Promise.race([fetchFlowHistory(code,'KRX'),new Promise(resolve=>setTimeout(()=>resolve(null),2800))]);const flowNxtPromise=Promise.race([fetchFlowHistory(code,'NXT'),new Promise(resolve=>setTimeout(()=>resolve(null),2800))]);const floatSharesPromise=Promise.race([loadFloatingSharesFromCompany(code).catch(()=>null),new Promise(resolve=>setTimeout(()=>resolve(null),2200))]);const pricePromise=loadDailyPrices120(code,raw=>{if(id!==seq)return;renderDailyChart(raw,'day')});pricePromise.then(raw=>{if(id!==seq)return;dailyChartCache.set(code+'-day',raw);renderDailyChart(raw,'day');loadChartPeriod('day')}).catch(()=>{});const results=await Promise.allSettled([
first([`${API}/api/stock/${code}/basic`]),
first([`${API}/api/stock/${code}/integration`]),
first([`${API}/api/stock/${code}/finance/quarter`]),
loadAnnualData(code),
pricePromise,
first([`${DESKTOP}/api/domestic/detail/${code}/consensus`]),
flowKrxPromise,
flowNxtPromise,
floatSharesPromise
]);if(id!==seq)return;const val=i=>results[i].status==='fulfilled'?results[i].value:null;const basic=val(0),integration=val(1),quarter=val(2),annual=val(3),priceRaw=val(4),consensus=val(5),flowKr=val(6),flowNx=val(7),flowTotal=mergeFlowHistory(flowKr,flowNx),flowForeignTotal=flowTotal,flowForeignKr=flowKr,flowForeignNx=flowNx,flowInstTotal=flowTotal,flowInstKr=flowKr,flowInstNx=flowNx;const priceData=Array.isArray(priceRaw)?priceRaw[0]||{}:priceRaw||{};const priceByDate=priceHistoryMap(priceRaw);if(!basic&&!integration&&!priceData)throw Error('네이버 증권 API 응답을 받지 못했습니다.');const b=extractBasic(basic||{},integration||{},priceData,consensus||{},code,current.name);const q=parseFinance(quarter),a=parseFinance(annual),iq=parseFinance(integration);const allQ=q.quarters.length?q.quarters:iq.quarters;dartConsensusQuarters=allQ;if(dartFinancialDataCache&&current.code===code)renderDartSurpriseAnalysis();const actualQ=latestActual(allQ);const annualActual=latestActual(a.quarters);const previousYear=new Date().getFullYear()-1;const annualParsedProfit=a.quarters.find(x=>!x.est&&!/\(E\)/i.test(x.label)&&Number((String(x.label||'')+' '+String(x.key||'')).match(/20\d{2}/)?.[0])===previousYear&&x.profit!==null)?.profit??null;const annualOp=annual?.annualProfitFallback??annualOperatingProfit(annual,allQ)??annualParsedProfit??annualOperatingProfit(integration,allQ)??annualProfitFromCompleteQuarters(allQ);if(annualOp!==null)b.annualOp=`${annualOp.toLocaleString('ko-KR',{maximumFractionDigits:1})}억`;const last4=actualQ.slice(-4);if(last4.length===4&&last4.every(x=>x.profit!==null)){const sum=last4.reduce((s,x)=>s+x.profit,0);b.ttmOp=`${sum.toLocaleString('ko-KR',{maximumFractionDigits:1})}억`}if(last4.length===4&&last4.every(x=>x.net!==null)){const sum=last4.reduce((s,x)=>s+x.net,0);const opSum=last4.every(x=>x.profit!==null)?last4.reduce((s,x)=>s+x.profit,0):null;b.ttmNet=`${sum.toLocaleString('ko-KR',{maximumFractionDigits:1})}억${opSum!==null&&opSum!==0?` (${(sum/opSum*100).toLocaleString('ko-KR',{maximumFractionDigits:1})}%)`:''}`}const latest=actualQ[actualQ.length-1];if(latest){if(latest.roe!==null)b.roe=fmt(latest.roe,'%');if(latest.debt!==null)b.debt=fmt(latest.debt,'%')}if(b.roe===blank||b.debt===blank){const aq=annualActual[annualActual.length-1];if(aq){if(b.roe===blank&&aq.roe!==null)b.roe=fmt(aq.roe,'%');if(b.debt===blank&&aq.debt!==null)b.debt=fmt(aq.debt,'%')}}const marketCapRaw=metric(integration||{},['marketValue','marketCap','marketSum','marketCapitalization','시가총액']);const marketCapEok=capToEok(marketCapRaw);let floatSharesCount=(val(8)!==null&&val(8)>0)?val(8):floatingShares({basic:basic||{},integration:integration||{}},marketCapRaw,num(b.price));if(!(floatSharesCount>0)&&String(code)==='141000'){const viatronIssuedShares=12114710;const viatronFloatRatio=62.63;floatSharesCount=Math.round(viatronIssuedShares*viatronFloatRatio/100)}const annualOpValue=annualOp!==null?annualOp:null;const ttmOpValue=last4.length===4&&last4.every(x=>x.profit!==null)?last4.reduce((s,x)=>s+x.profit,0):null;const expected4=allQ.filter(x=>x.profit!==null).slice(-4);const estTtmOpValue=expected4.length===4?expected4.reduce((s,x)=>s+x.profit,0):null;if(marketCapEok!==null&&annualOpValue!==null&&annualOpValue!==0)b.annualMultiple=fmt(marketCapEok/annualOpValue,'배');if(marketCapEok!==null&&ttmOpValue!==null&&ttmOpValue!==0)b.ttmMultiple=fmt(marketCapEok/ttmOpValue,'배');if(marketCapEok!==null&&estTtmOpValue!==null&&estTtmOpValue!==0)b.estTtmMultiple=fmt(marketCapEok/estTtmOpValue,'배');const displayQ=allQ.filter(x=>x.profit!==null||x.eps!==null).slice(-6);b.quarters=displayQ;b.dailyPrices=Array.isArray(priceRaw)?priceRaw:objects(priceRaw);b.epsRows=allQ.slice(-6).map(x=>[x.label,x.eps===null?blank:x.eps.toLocaleString('ko-KR',{maximumFractionDigits:1})]);const flows=[['fTotal',flowForeignTotal,'foreign','TOTAL'],['fKr',flowForeignKr,'foreign','KRX'],['fNx',flowForeignNx,'foreign','NXT'],['iTotal',flowInstTotal,'institution','TOTAL'],['iKr',flowInstKr,'institution','KRX'],['iNx',flowInstNx,'institution','NXT']];for(const [prefix,raw,type,exchange] of flows){const f=flowSummary(raw,type,exchange,priceByDate,num(b.price),floatSharesCount);const count=$(prefix+'Count'),streak=$(prefix+'Streak'),sellStreak=$(prefix+'SellStreak');if(count){count.innerHTML=foreignCountHtml(f);count.style.color='';count.style.fontWeight='500'}if(streak)streak.innerHTML=streakDisplayHtml(f.streak,f.latestSign>0);if(sellStreak)sellStreak.innerHTML=streakDisplayHtml(f.sellStreak,f.latestSign<0)}const combinedFlows=[['xTotal',combinedInvestorFlow(flowTotal,'TOTAL'),'TOTAL'],['xKr',combinedInvestorFlow(flowKr,'KRX'),'KRX'],['xNx',combinedInvestorFlow(flowNx,'NXT'),'NXT']];for(const [prefix,raw,exchange] of combinedFlows){const f=flowSummary(raw,'foreign',exchange,priceByDate,num(b.price),floatSharesCount);const market=String(exchange||'TOTAL').toLowerCase();const rows=flowRecords(raw);const byDate=new Map();for(const row of rows){const date=String(row?.localTradedAt||'').slice(0,10);if(!date||byDate.has(date))continue;const source=row?.[market];if(!source)continue;const foreign=num(source.foreignSignNetVolume),institution=num(source.institutionSignNetVolume);if(foreign===null||institution===null)continue;byDate.set(date,{foreign,institution})}const dated=[...byDate.entries()].sort((a,b)=>b[0].localeCompare(a[0])).slice(0,40);f.periods=f.periods.map(p=>{const slice=dated.slice(0,p.period);return{...p,count:slice.filter(([,v])=>v.foreign>0||v.institution>0).length,bothCount:slice.filter(([,v])=>v.foreign>0&&v.institution>0).length}});const count=$(prefix+'Count');if(count){count.innerHTML=foreignCountHtml(f,true);count.style.color='';count.style.fontWeight='500'}}const flowStatus=[['통합외국인',flowForeignTotal,'foreign','TOTAL'],['KRX외국인',flowForeignKr,'foreign','KRX'],['NXT외국인',flowForeignNx,'foreign','NXT'],['통합기관',flowInstTotal,'institution','TOTAL'],['KRX기관',flowInstKr,'institution','KRX'],['NXT기관',flowInstNx,'institution','NXT']];const statusNames=['기본정보','주요지표','분기재무','연간재무','가격정보','컨센서스'];$('status').textContent=`유동주식수 ${floatSharesCount!==null&&floatSharesCount>0?'확인':'미확인'} · `+results.slice(0,6).map((r,i)=>{if(r.status!=='fulfilled')return `${statusNames[i]} ${i===3?`실패 (${String(r.reason?.message||'원인 미확인').slice(0,110)})`:'실패'}`;return `${statusNames[i]} OK`}).concat(flowStatus.map(([label,raw,type,exchange])=>{const f=flowSummary(raw,type,exchange,priceByDate,num(b.price),floatSharesCount);const meta=raw?._flowMeta;if(f.count===null)return `${label} ${exchange==='NXT'?'자료 없음':'통합 필드 확인 필요'}`;return `${label} ${f.days}/40일 수집${meta?`, ${meta.pages}페이지`:''}`})).join(' · ');render(b)}catch(e){if(id!==seq)return;$('status').textContent=`조회 오류: ${e.message}`;render({name:current.name,code,change:`조회 실패: ${e.message}`,quarters:[]})}}
$('searchBtn').onclick=async()=>{const q=$('query').value.trim();if(!q)return;try{const r=await search(q);if(r.length===1)load(r[0].code,r[0].name);else showResults(r,q)}catch{const local=seed.filter(x=>x.name.toLowerCase().includes(q.toLowerCase())||x.code.startsWith(q));if(local.length===1)load(local[0].code,local[0].name);else showResults(local,q,'검색 API 오류. 6자리 종목코드로 검색해 주세요.')}};$('query').addEventListener('keydown',e=>{if(e.key==='Enter')$('searchBtn').click()});$('query').addEventListener('input',()=>{const q=$('query').value.trim();$('clear').hidden=!q;clearTimeout(timer);if(!q){$('results').hidden=true;return}timer=setTimeout(async()=>{try{showResults(await search(q),q)}catch{showResults(seed.filter(x=>x.name.toLowerCase().includes(q.toLowerCase())||x.code.startsWith(q)),q)}},350)});$('clear').onclick=()=>{$('query').value='';$('results').hidden=true;$('clear').hidden=true};$('theme').onclick=()=>document.body.classList.toggle('dark');$('refresh').onclick=()=>load(current.code,current.name);$('fav').onclick=toggleFavorite;renderFavorites();updateFavoriteButton();document.querySelectorAll('.daily-chart-tabs button').forEach(b=>b.addEventListener('click',()=>loadChartPeriod(b.dataset.period)));function findExactNumber(raw,keys){const wanted=new Set(keys.map(k=>k.toLowerCase()));for(const o of objects(raw)){for(const [k,v] of Object.entries(o)){if(!wanted.has(k.toLowerCase())||v===null||v===undefined||v==='')continue;const n=financeNum(v?.value??v?.formattedValue??v?.text??v?.displayValue??v?.amount??v);if(n!==null&&n>0)return n}}return null}
async function quickCapForStock(x){try{const [basic,integration]=await Promise.all([first([`${API}/api/stock/${x.code}/basic`]),first([`${API}/api/stock/${x.code}/integration`])]);const currentPrice=findExactNumber(basic,['currentPrice','nowPrice','tradePrice','closePrice','dealPrice','stockPrice'])??findExactNumber(integration,['currentPrice','nowPrice','tradePrice','closePrice','dealPrice','stockPrice']);const shares=findExactNumber(basic,['listedShares','listedShareCount','totalListedShares','sharesOutstanding','totalShares','issuedShares','listedStockCount'])??findExactNumber(integration,['listedShares','listedShareCount','totalListedShares','sharesOutstanding','totalShares','issuedShares','listedStockCount']);if(currentPrice!==null&&shares!==null)return {...x,cap:currentPrice*shares/100000000,capSource:'currentPrice×listedShares'};const rawCap=metric(integration,['marketValue','marketCap','marketSum','marketCapitalization','marketCapital','시가총액'])??metric(basic,['marketValue','marketCap','marketSum','marketCapitalization','marketCapital','시가총액']);const cap=capToEok(rawCap);return cap!==null?{...x,cap,capSource:'apiMarketCap'}:null}catch{return null}}
function collectQuickStocksAllLists(root,out=[],seen=new Set()){
 // 순위 응답에서 첫 번째 실제 종목 배열 하나만 사용한다. 여러 하위 배열을 합치면
 // 다른 시장/보조 데이터가 섞여 원본 순위가 바뀔 수 있다.
 if(!root||typeof root!=='object')return out;
 const codeKeys=['itemCode','itemcode','stockCode','stockcode','code','reutersCode','reuterscode','symbolCode','symbolcode','shortCode','shortcode','stockCodeValue','stock_code','isuCd','ISU_CD','stockId','stock_id','securityCode','security_code','itemCodeValue','item_code','codeValue','code_value','symbol','ticker','issueCode','issue_code','localCode','local_code','stockItemCode'];
 const nameKeys=['itemName','itemname','stockName','stockname','name','stockNm','stocknm','korName','korname','stockNmKr','stock_nm','isuNm','ISU_NM','koreanName','korean_name','issueName','issue_name','itemNameKr','item_name','displayName','display_name','stockNameKr','korStockName','securityName','security_name'];
 function normalize(item){
  let rawCode=null,rawName=null;
  for(const k of codeKeys)if(item[k]!==undefined&&item[k]!==null&&String(item[k]).trim()){rawCode=item[k];break;}
  for(const k of nameKeys)if(item[k]!==undefined&&item[k]!==null&&String(item[k]).trim()){rawName=item[k];break;}
  let code=rawCode===null?'':String(rawCode).trim().toUpperCase();
  code=code.replace(/^A(?=\d{6}$)/,'').replace(/\.KS$|\.KQ$/,'');
  // 신규 상장 종목은 0015M0, 0158S0처럼 영문자가 포함된 6자리 코드를 사용한다.
  if(!/^[0-9A-Z]{6}$/.test(code)){
   const m=code.match(/(?:^|[^0-9A-Z])([0-9A-Z]{6})(?:$|[^0-9A-Z])/);code=m?m[1]:'';
  }
  const name=rawName===null?'':String(rawName).trim();
  if(!/^[0-9A-Z]{6}$/.test(code)||!name)return null;
  const capRaw=item.tradingValue??item.accAmount??item.priceTop??item.tradeValue??item.accumulatedTradingValue??item.marketValue??item.marketCap??item.marketSum??item.marketCapitalization??item.marketCapital??item.capitalization??item.marketValueText??item.marketCapValue;
  return {name,code,cap:capToEok(capRaw),capSource:capRaw!==undefined?'rankingApi':'orderedRanking'};
 }
 function findList(node,depth=0){
  if(!node||typeof node!=='object'||depth>8)return null;
  if(Array.isArray(node)){
   const parsed=node.map(x=>x&&typeof x==='object'&&!Array.isArray(x)?normalize(x):null).filter(Boolean);
   if(parsed.length>=10)return parsed;
   // Wrapper 배열 안에서만 하위 응답을 찾되, 배열들을 합치지 않는다.
   for(const item of node){const found=findList(item,depth+1);if(found&&found.length>=10)return found;}
   return null;
  }
  const preferred=['items','stocks','stockList','stocklist','result','data','list','contents','rankings','rankingList','domesticStocks','stockItems'];
  for(const key of preferred){if(node[key]&&typeof node[key]==='object'){const found=findList(node[key],depth+1);if(found&&found.length>=10)return found;}}
  for(const [key,value] of Object.entries(node)){if(preferred.includes(key)||!value||typeof value!=='object')continue;const found=findList(value,depth+1);if(found&&found.length>=10)return found;}
  return null;
 }
 const found=findList(root);
 if(found){for(const item of found){if(!seen.has(item.code)){seen.add(item.code);out.push(item);}}}
 return out;
}
function collectQuickStocks(root,out=[],seen=new Set()){
 // 전체(ALL) 순위 응답에서 가장 먼저 발견되는 실제 종목 목록 하나만 사용한다.
 // 응답 안에 전체/코스피/코스닥 하위 목록이 함께 포함되더라도 서로 섞지 않는다.
 if(!root||typeof root!=='object')return out;
 if(Array.isArray(root)){
  const direct=[];
  for(const item of root){
   if(!item||typeof item!=='object'||Array.isArray(item))continue;
   const rawCode=item.itemCode??item.itemcode??item.stockCode??item.stockcode??item.code??item.reutersCode??item.reuterscode??item.symbolCode??item.symbolcode??item.shortCode??item.shortcode??item.stockCodeValue??item.stock_code??item.isuCd??item.ISU_CD;
   const rawName=item.itemName??item.itemname??item.stockName??item.stockname??item.name??item.stockNm??item.stocknm??item.korName??item.korname??item.stockNmKr??item.stock_nm??item.isuNm??item.ISU_NM;
   const code=rawCode===undefined?'':String(rawCode).trim().toUpperCase().replace(/^A(?=\d{6}$)/,'');
   const name=rawName===undefined?'':String(rawName).trim();
   if(/^[0-9A-Z]{6}$/.test(code)&&!seen.has(code)){
    seen.add(code);
    const capRaw=item.marketValue??item.marketCap??item.marketSum??item.marketCapitalization??item.marketCapital??item.capitalization??item.marketValueText??item.marketCapValue;
    direct.push({name:name||code,code,cap:capToEok(capRaw),capSource:capRaw!==undefined?'rankingApi':'orderedRanking'});
   }
  }
  if(direct.length){out.push(...direct);return out;}
  // 배열 자체가 종목 목록이 아닌 wrapper일 때는 첫 번째 하위 목록만 선택한다.
  for(const item of root){const found=collectQuickStocks(item,[],new Set());if(found.length){out.push(...found);return out;}}
  return out;
 }
 // wrapper object도 하위 목록을 전부 합치지 않고, 첫 번째로 확인된 순위 목록만 사용한다.
 for(const v of Object.values(root)){
  if(!v||typeof v!=='object')continue;
  const found=collectQuickStocks(v,[],new Set());
  if(found.length){out.push(...found);return out;}
 }
 return out;
}
const QUICK_RANKINGS=[
 {id:'quick-all-cap',label:'전체 시가총액 순 20개',marketType:'ALL',orderType:'marketSum',limit:20},
 {id:'quick-kospi-cap',label:'코스피 시가총액 순 10개',marketType:'KOSPI',orderType:'marketSum',limit:10},
 {id:'quick-kosdaq-cap',label:'코스닥 시가총액 순 10개',marketType:'KOSDAQ',orderType:'marketSum',limit:10},
 {id:'quick-value',label:'전체 거래대금 순 20개',marketType:'ALL',orderType:'priceTop',limit:20},
 {id:'quick-kospi-value',label:'코스피 거래대금 순 10개',marketType:'KOSPI',orderType:'priceTop',limit:10},
 {id:'quick-kosdaq-value',label:'코스닥 거래대금 순 10개',marketType:'KOSDAQ',orderType:'priceTop',limit:10},
 {id:'quick-volume',label:'전체 거래량 순 20개',marketType:'ALL',orderType:'quantTop',limit:20},
 {id:'quick-kospi-volume',label:'코스피 거래량 순 10개',marketType:'KOSPI',orderType:'quantTop',limit:10},
 {id:'quick-kosdaq-volume',label:'코스닥 거래량 순 10개',marketType:'KOSDAQ',orderType:'quantTop',limit:10}
];
function summarizeQuickResponse(root){
 const rows=[];const visited=new Set();
 function walk(value,path,depth){
  if(!value||typeof value!=="object"||depth>7||visited.has(value)||rows.length>=8)return;
  visited.add(value);
  if(Array.isArray(value)){
   const first=value.find(x=>x&&typeof x==="object"&&!Array.isArray(x));
   if(first)rows.push(`${path}[${value.length}] keys=${Object.keys(first).slice(0,12).join("/")}`);
   value.slice(0,4).forEach((v,i)=>walk(v,`${path}[${i}]`,depth+1));
  }else{
   for(const [k,v] of Object.entries(value))if(v&&typeof v==="object")walk(v,path?`${path}.${k}`:k,depth+1);
  }
 }
 walk(root,"root",0);return rows.join("; ").slice(0,650)||`type=${typeof root}`;
}
async function loadQuickRanking(config){
 const box=$(config.id);if(!box)return;
 box.innerHTML='<span class="quick-loading">불러오는 중…</span>';
 try{
  let data,ranked;
  // 네이버 화면 /market/stock/kr/stocklist/priceTop에서 사용하는 시장 랭킹 API와 같은 경로.
  // v3 individual-stocks 목록은 화면의 '전체 + 거래대금 상위'와 일치한다고 확인되지 않아 사용하지 않는다.
  const marketType=config.marketType;
  const pageSize=config.pageSize||100;
  const url=`${DESKTOP}/api/domestic/market/stock/default?tradeType=KRX&marketType=${encodeURIComponent(marketType)}&orderType=${encodeURIComponent(config.orderType)}&startIdx=0&pageSize=${pageSize}`;
  data=await getJson(url);
  ranked=collectQuickStocksAllLists(data);
  const required=config.limit||10;if(ranked.length<required){const diag=`종목 ${required}개 중 ${ranked.length}개 추출. 응답 구조: ${summarizeQuickResponse(data)}`;throw Error(diag)}
  const unique=ranked.slice(0,config.limit||10);
  box.innerHTML=unique.map((x,i)=>`<button data-code="${x.code}" data-name="${escapeHtml(x.name)}" title="${escapeHtml(config.label)} ${i+1}위"><small>${i+1}</small>${escapeHtml(x.name)}</button>`).join('');
  box.querySelectorAll('button').forEach(b=>b.onclick=()=>load(b.dataset.code,b.dataset.name));
 }catch(e){
  box.innerHTML=`<span class="quick-loading">순위를 불러오지 못했습니다. 잠시 후 새로고침해 주세요.<br><small>${escapeHtml(String(e?.message||'조회 실패').slice(0,100))}</small></span>`;
  console.warn(`${config.label} 순위 조회 실패:`,e);
 }
}
function loadQuickRankings(){QUICK_RANKINGS.forEach(config=>loadQuickRanking(config))}
loadQuickRankings();
// DART 공시 프레임: PC에서는 가운데 정렬, 모바일에서는 폭에 맞춰 전체 프레임 표시
(function setupDartFrame(){
 const link=$('dartLink'),modal=$('dartModal'),frame=$('dartFrame'),stage=$('dartFrameStage'),close=$('dartClose');
 if(!link||!modal||!frame||!stage)return;
 const resize=()=>{
  const scale=Math.min(1,Math.max(.32,(window.innerWidth-28)/750));
  frame.style.transform=`scale(${scale})`;
  stage.style.width=`${750*scale}px`;stage.style.height=`${900*scale}px`;
 };
 const shut=()=>{modal.hidden=true;frame.src='about:blank';document.body.classList.remove('dart-modal-open')};
 link.addEventListener('click',e=>{
  const href=link.href;if(!href||href.includes('undefined'))return;
  e.preventDefault();frame.src=href;resize();modal.hidden=false;document.body.classList.add('dart-modal-open');
 });
 close?.addEventListener('click',shut);
 modal.addEventListener('click',e=>{if(e.target===modal)shut()});
 window.addEventListener('resize',()=>{if(!modal.hidden)resize()});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!modal.hidden)shut()});
})();
$('name').textContent='종목을 검색하세요';$('code').textContent='';$('price').innerHTML='— <span id="change">종목을 선택하면 시세가 표시됩니다.</span>';$('status').textContent='';$('query').value='';$('refresh').onclick=()=>{if(current.code)load(current.code,current.name)};
$('dailyRangeTabs')?.addEventListener('click',e=>{const b=e.target.closest('button[data-range]');if(!b)return;chartRangeSel[dailyChartPeriod]=Number(b.dataset.range);loadChartPeriod(dailyChartPeriod)});renderRangeTabs('day');

// ===== 투자자 동향 그래프 (외국인 · 기관 · 개인 일별 순매수) =====
const invRanges=[5,10,20,40,60,100,120,200,240];
let invRangeSel=60,invRows=[],invToken=0;
function invNet(o,type){
 if(!o||typeof o!=='object')return null;
 const A={foreign:{net:['foreignNetVolume','foreignerNetVolume','foreignPureBuyQuant','foreignerPureBuyQuant'],buy:['foreignBuyVolume','foreignerBuyVolume'],sell:['foreignSellVolume','foreignerSellVolume']},
  org:{net:['organizationNetVolume','organNetVolume','organizationPureBuyQuant','organPureBuyQuant'],buy:['organizationBuyVolume','organBuyVolume'],sell:['organizationSellVolume','organSellVolume']},
  indiv:{net:['individualNetVolume','personalNetVolume','retailNetVolume','personNetVolume','individualPureBuyQuant'],buy:['individualBuyVolume','personalBuyVolume','retailBuyVolume'],sell:['individualSellVolume','personalSellVolume','retailSellVolume']}}[type];
 const pick=keys=>{for(const k of keys){if(o[k]!==undefined&&o[k]!==null&&o[k]!==''){const v=num(o[k]);if(v!==null)return v}}return null};
 const n=pick(A.net);if(n!==null)return n;
 const b=pick(A.buy),sl=pick(A.sell);return b!==null&&sl!==null?b-sl:null;
}
async function fetchInvestorMap(code,exchange,rows){
 const map=new Map(),seen=new Set();let cursor='';
 for(let page=0;page<Math.ceil(rows/50)+2;page++){
  const params=new URLSearchParams({code:String(code),exchangeType:exchange,size:'50'});if(cursor)params.set('cursor',cursor);
  const data=await getJson(`${API}/front-api/stock/domestic/trend?${params.toString()}`);
  const result=data?.result??data,items=result?.items;if(!Array.isArray(items))break;
  let added=0;
  for(const it of items){const date=String(it?.localTradedAt??'').replace(/\D/g,'').slice(0,8);if(!date||map.has(date))continue;const o=it[exchange.toLowerCase()]||it;map.set(date,{f:invNet(o,'foreign'),i:invNet(o,'org'),p:invNet(o,'indiv')});added++}
  const next=String(result?.cursor??data?.cursor??'');
  if(map.size>=rows||!result?.hasNext||!next||!added||seen.has(next))break;
  seen.add(next);cursor=next;
 }
 return map;
}
function combineInvestor(kr,nx){
 const add=(a,b)=>a===null||a===undefined?(b??null):b===null||b===undefined?a:a+b;
 return [...kr.keys()].sort().map(date=>{const a=kr.get(date),b=nx.get(date)||{};return {date,f:add(a.f,b.f),i:add(a.i,b.i),p:add(a.p,b.p)}}).slice(-240);
}
function fmtVol(v){const a=Math.abs(v),sg=v<0?'-':'';if(a>=1e8)return sg+(a/1e8).toFixed(1)+'억';if(a>=1e4)return sg+Math.round(a/1e4).toLocaleString('ko-KR')+'만';return sg+Math.round(a).toLocaleString('ko-KR')}
function fmtSigned(v){if(v===null||v===undefined)return '-';return (v>0?'+':'')+Math.round(v).toLocaleString('ko-KR')}
const invColor=v=>v>0?'#df5967':v<0?'#3979d8':'inherit';
function renderInvestorTabs(){const box=$('invTabs');if(!box)return;box.innerHTML=invRanges.map(n=>`<button type="button" data-range="${n}" class="${n===invRangeSel?'on':''}">${n}일</button>`).join('')}
function renderInvestorTrend(){
 const host=$('invChart');if(!host)return;
 const all=invRows;$('invTitle').textContent=`투자자 동향 · ${invRangeSel}일`;
 if(!all.length){host.innerHTML='<div class="chart-empty">투자자 동향 데이터가 없습니다.</div>';$('invTable').innerHTML='';$('invSum').innerHTML='';$('invRange').textContent='';return}
 const data=all.slice(-invRangeSel),n=data.length;
 const fmtD=d=>`${d.slice(0,4)}.${d.slice(4,6)}.${d.slice(6,8)}`;
 $('invRange').textContent=`${fmtD(data[0].date)} – ${fmtD(data[n-1].date)} · ${n}일`;
 const W=Math.max(300,Math.round(host.clientWidth||340)),H=200,left=44,right=6,top=8,bottom=22,plotW=W-left-right,plotH=H-top-bottom;
 const vals=data.flatMap(d=>[d.f,d.i,d.p]).filter(v=>v!==null&&v!==undefined);
 const M=Math.max(1,...vals.map(v=>Math.abs(v)))*1.08,y=v=>top+(M-v)/(2*M)*plotH,zeroY=y(0),step=plotW/n,bw=Math.max(1,Math.min(8,step*.26));
 const series=[['f','외국인','#e0a33a'],['i','기관','#3979d8'],['p','개인','#3aa57a']];
 const grid=[M,M/2,0,-M/2,-M].map(v=>`<line x1="${left}" y1="${y(v).toFixed(1)}" x2="${W-right}" y2="${y(v).toFixed(1)}" stroke="var(--line)" stroke-width="${v===0?1.2:.6}"/><text x="${left-4}" y="${(y(v)+3).toFixed(1)}" text-anchor="end" font-size="8" fill="var(--muted)">${v===0?'0':fmtVol(v)}</text>`).join('');
 let bars='';
 series.forEach(([key,,col])=>{let d='',pen=false,dots='';data.forEach((r,k)=>{const v=r[key];if(v===null||v===undefined){pen=false;return}const x=left+(k+.5)*step,yy=y(v);d+=`${pen?'L':'M'}${x.toFixed(1)} ${yy.toFixed(1)}`;pen=true;if(n<=60)dots+=`<circle cx="${x.toFixed(1)}" cy="${yy.toFixed(1)}" r="1.8" fill="${col}"/>`});if(d)bars+=`<path d="${d}" fill="none" stroke="${col}" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"/>${dots}`});
 const fine=n<=45,minGap=fine?38:30;let lastX=-1e9,lastKey='',ticks='';
 data.forEach((d,k)=>{const key=fine?d.date:d.date.slice(0,6);if(key===lastKey)return;lastKey=key;const x=left+(k+.5)*step;if(x-lastX<minGap)return;lastX=x;ticks+=`<text x="${x.toFixed(1)}" y="${H-7}" text-anchor="middle" font-size="8" fill="var(--muted)">${fine?`${d.date.slice(4,6)}.${d.date.slice(6,8)}`:`${d.date.slice(2,4)}.${d.date.slice(4,6)}`}</text>`});
 const detailHtml=k=>{const d=data[k];return `<b>${fmtD(d.date)}</b>`+series.map(([key,name,col])=>`<span><i style="background:${col}"></i>${name} <em style="color:${invColor(d[key])}">${fmtSigned(d[key])}</em></span>`).join('')};
 host.innerHTML=`<div class="inv-detail" id="invDetail">${detailHtml(n-1)}</div><svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="외국인 기관 개인 일별 순매수 그래프">${grid}${bars}${ticks}<rect id="invCursor" x="0" y="${top}" width="${Math.max(1,step).toFixed(2)}" height="${plotH}" fill="var(--text)" opacity=".08" style="display:none" pointer-events="none"/></svg>`;
 const svg=host.querySelector('svg'),box=$('invDetail'),cur=$('invCursor');
 const pick=e=>{const r=svg.getBoundingClientRect();if(!r.width)return;const vx=(e.clientX-r.left)/r.width*W;const k=Math.max(0,Math.min(n-1,Math.floor((vx-left)/step)));cur.setAttribute('x',(left+k*step).toFixed(2));cur.style.display='';box.innerHTML=detailHtml(k)};
 svg.addEventListener('pointerdown',pick);svg.addEventListener('pointermove',e=>{if(e.pointerType==='mouse'||e.buttons)pick(e)});
 svg.addEventListener('mouseleave',()=>{cur.style.display='none';box.innerHTML=detailHtml(n-1)});
 const sum=key=>data.reduce((a,d)=>a+(d[key]||0),0);
 $('invSum').innerHTML=`<span class="inv-sum-label">${n}일 합계</span>`+series.map(([key,name,col])=>`<span><i style="background:${col}"></i>${name} <em style="color:${invColor(sum(key))}">${fmtSigned(sum(key))}</em></span>`).join('');
 $('invTable').innerHTML=`<table><thead><tr><th>날짜</th><th>외국인</th><th>기관</th><th>개인</th></tr></thead><tbody>${[...data].reverse().map(d=>`<tr><td>${fmtD(d.date)}</td>${['f','i','p'].map(k=>`<td style="color:${invColor(d[k])}">${fmtSigned(d[k])}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}
async function loadInvestorTrend(code){
 const token=++invToken,host=$('invChart');if(!host)return;
 invRows=[];host.innerHTML='<div class="chart-empty">투자자 동향을 불러오는 중…</div>';$('invTable').innerHTML='';$('invSum').innerHTML='';$('invRange').textContent='';
 try{
  const [kr,nx]=await Promise.all([fetchInvestorMap(code,'KRX',250),fetchInvestorMap(code,'NXT',250).catch(()=>new Map())]);
  if(token!==invToken)return;
  const rows=combineInvestor(kr,nx);if(!rows.length)throw Error('empty');
  invRows=rows;renderInvestorTrend();
 }catch(e){if(token===invToken)host.innerHTML='<div class="chart-empty">투자자 동향 데이터를 불러오지 못했습니다.</div>'}
}
$('invTabs')?.addEventListener('click',e=>{const b=e.target.closest('button[data-range]');if(!b)return;invRangeSel=Number(b.dataset.range);renderInvestorTabs();renderInvestorTrend()});
renderInvestorTabs();


// OpenDART 분기 실적: Worker에 DART_API_KEY Secret을 설정해야 실제 데이터가 연결됩니다.
const DART_PROXY=PROXY_BASE;
const dartFmt=v=>{if(v===null||v===undefined||!Number.isFinite(Number(v)))return '—';return (Number(v)/1e8).toLocaleString('ko-KR',{maximumFractionDigits:1})};
const dartNum=v=>{if(v===null||v===undefined||v===''||v==='-')return null;const n=Number(String(v).replace(/,/g,''));return Number.isFinite(n)?n:null};
function dartQuarterLabel(y,q){return `${y}년 ${q}Q`}
// DART 확정 실적과 WiseReport 원본 어닝서프라이즈 자료를 별도로 표시한다.
// 컨센서스는 반드시 WiseReport 어닝서프라이즈 원본 표에서만 가져오며,
// 일반 분기재무 API의 예상 영업이익으로 대체하거나 덮어쓰지 않는다.
let dartConsensusQuarters=[],dartFinancialDataCache=null,dartNaverEarningsData=null,dartNaverEarningsError='';
function parseDartComparePeriod(item){
 const label=String(item?.label??'')+' '+String(item?.key??'');
 let m=label.match(/((?:19|20)\d{2})\s*[.\-/]\s*(\d{1,2})/);
 if(m){const month=Number(m[2]);if(month>=1&&month<=12)return{year:Number(m[1]),quarter:Math.ceil(month/3)}}
 m=label.match(/((?:19|20)\d{2})\s*년\s*(\d)\s*분기/);if(m)return{year:Number(m[1]),quarter:Number(m[2])};
 m=label.match(/((?:19|20)\d{2})\s*년?\s*(\d)\s*Q/i);if(m)return{year:Number(m[1]),quarter:Number(m[2])};
 return null;
}
function dartCompareEok(value){const n=dartNum(value);return n===null?null:n/1e8}
function dartCompareFmt(value){return Number(value).toLocaleString('ko-KR',{maximumFractionDigits:1})}
function naverSurpriseNumber(value){
 const s=String(value??'').replace(/\u00a0/g,' ').trim();
 if(!s||/^(?:-|—|–|N\/A|자료없음)$/i.test(s))return null;
 const cleaned=s.replace(/,/g,'').replace(/[^0-9.+\-]/g,'');
 if(!cleaned||!/[0-9]/.test(cleaned))return null;
 const negative=/^\s*\(.*\)\s*$/.test(s)||/^\s*[-−]/.test(s);const n=Number(cleaned);return Number.isFinite(n)?(negative?-Math.abs(n):n):null;
}
function parseNaverEarningsSurprise(html){
 const source=String(html||'');
 // WiseReport does not put the earnings rows in the static <tbody>.
 // EarnigList() embeds the exact source data in `var res = {...}` and
 // builds the visible table from that object at runtime.
 try{
  const match=source.match(/var\s+EarnigList\s*=\s*function\s*\(\s*\)\s*\{[\s\S]*?var\s+res\s*=\s*(\{[\s\S]*?\})\s*;\s*tmp\s*=/i);
  if(match){
   const payload=JSON.parse(match[1]);
   const periods=Array.isArray(payload.yymm)?payload.yymm:[];
   const series=Array.isArray(payload.data)?payload.data:[];
   const rows=[];
   for(let i=1;i<periods.length;i++){
    const raw=String(periods[i]||'');
    const parsed=raw.match(/^((?:19|20)\d{2})(\d{2})$/);
    if(!parsed)continue;
    const year=Number(parsed[1]),month=Number(parsed[2]);
    if(month<1||month>12)continue;
    const dataKey=String(i+1); // template skips object key '1'; visible periods start at yymm[1].
    const valueAt=(seriesIndex)=>naverSurpriseNumber(series[seriesIndex]?.[dataKey]??null);
    rows.push({
     year,
     quarter:Math.ceil(month/3),
     consensus:valueAt(0),
     preliminary:valueAt(1),
     surprise:valueAt(2),
     yoy:valueAt(3)
    });
   }
   if(rows.some(r=>r.consensus!==null||r.preliminary!==null||r.surprise!==null))return rows;
  }
 }catch(e){console.warn('네이버 어닝서프라이즈 원본 데이터 분석 실패',e)}
 // Fallback for a future WiseReport page variant that renders the table
 // directly in HTML instead of embedding the EarnigList data object.
 try{
  const doc=new DOMParser().parseFromString(source,'text/html');
  const dateRe=/((?:19|20)\d{2})\s*[./-]\s*(\d{1,2})/;
  const cleanCell=cell=>(cell?.innerText||cell?.textContent||'').replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim();
  for(const table of doc.querySelectorAll('table')){
   const rows=[...table.rows];
   const headerIndex=rows.findIndex(tr=>[...tr.cells].some(c=>/재무연월/.test(cleanCell(c))));
   if(headerIndex<0)continue;
   const dateCols=[];
   for(let ri=headerIndex;ri<=Math.min(headerIndex+2,rows.length-1);ri++){
    [...rows[ri].cells].forEach((cell,ci)=>{
     const m=cleanCell(cell).match(dateRe);
     if(m)dateCols.push({col:ci,year:Number(m[1]),quarter:Math.ceil(Number(m[2])/3)});
    });
    if(dateCols.length)break;
   }
   if(!dateCols.length)continue;
   const result=new Map();let operating=false;
   for(let ri=headerIndex+1;ri<rows.length;ri++){
    const cells=[...rows[ri].cells].map(cleanCell),txt=cells.join(' ');
    if(/당기순이익/.test(txt)){if(operating)break;continue}
    if(cells.some(x=>/^영업이익$/.test(x)))operating=true;
    if(!operating)continue;
    const fi=cells.findIndex(x=>/^(컨센서스|잠정치|surprise)$/i.test(x));
    if(fi<0)continue;
    const label=cells[fi],field=/컨센서스/i.test(label)?'consensus':/잠정치/.test(label)?'preliminary':'surprise';
    dateCols.forEach((p,idx)=>{
     const key=`${p.year}-${p.quarter}`,item=result.get(key)||{year:p.year,quarter:p.quarter,consensus:null,preliminary:null,surprise:null};
     item[field]=naverSurpriseNumber(cells[fi+1+idx]??null);result.set(key,item);
    });
   }
   const parsedRows=[...result.values()].sort((a,b)=>a.year-b.year||a.quarter-b.quarter);
   if(parsedRows.length)return parsedRows;
  }
 }catch(e){console.warn('네이버 어닝서프라이즈 HTML 분석 실패',e)}
 return [];
}
async function loadNaverEarningsSurprise(code){
 // This is the confirmed source used by the Naver Pay Securities company page.
 // Do not put navercomp2 first: the indexed live table is served by navercomp.
 const urls=[
  `https://navercomp.wisereport.co.kr/v2/company/c1010001.aspx?cmp_cd=${encodeURIComponent(code)}`,
  `https://comp.wisereport.co.kr/company/c1010001.aspx?cmp_cd=${encodeURIComponent(code)}&cn=`
 ];
 let lastError=null;
 for(const url of urls){
  try{
   const html=await getText(url);
   const rows=parseNaverEarningsSurprise(html);
   if(rows.length)return rows;
   lastError=Error(`원본 페이지는 응답했지만 영업이익 어닝서프라이즈 행을 찾지 못했습니다: ${new URL(url).hostname}`);
  }catch(error){lastError=error}
 }
 throw lastError||Error('네이버 기업현황 어닝서프라이즈 조회 실패');
}
function renderDartSurpriseAnalysis(){
 const host=$('dartSurpriseResult');if(!host)return;
 const dartRows=(Array.isArray(dartFinancialDataCache?.quarters)?dartFinancialDataCache.quarters:[])
  .map(r=>({year:Number(r.year),quarter:Number(r.quarter),dartActual:dartCompareEok(r.operatingProfit)}))
  .filter(r=>Number.isFinite(r.year)&&r.quarter>=1&&r.quarter<=4&&r.dartActual!==null);
 const naverRows=Array.isArray(dartNaverEarningsData)?dartNaverEarningsData:[];
 const periods=new Map();
 const keyOf=p=>`${p.year}-${p.quarter}`;
 for(const r of naverRows){const k=keyOf(r);periods.set(k,{year:r.year,quarter:r.quarter,consensus:r.consensus??null,preliminary:r.preliminary??null,naverSurprise:r.surprise??null})}
 for(const r of dartRows){const k=keyOf(r),p=periods.get(k)||{year:r.year,quarter:r.quarter};p.dartActual=r.dartActual;periods.set(k,p)}
 const rows=[...periods.values()]
  .filter(p=>p.consensus!==null&&p.consensus!==undefined||p.preliminary!==null&&p.preliminary!==undefined||p.dartActual!==null&&p.dartActual!==undefined||p.naverSurprise!==null&&p.naverSurprise!==undefined)
  .sort((a,b)=>b.year-a.year||b.quarter-a.quarter).slice(0,2);
 const fmt=v=>v===null||v===undefined||!Number.isFinite(Number(v))?'-':Number(v).toLocaleString('ko-KR',{maximumFractionDigits:1});
 const signClass=v=>v===null||v===undefined||!Number.isFinite(Number(v))?'':Number(v)>0?'positive':Number(v)<0?'negative':'neutral';
 if(!rows.length){
  host.className='dart-surprise-table-state';
  host.innerHTML=`<div class="dart-surprise-empty">${dartNaverEarningsError?`네이버 어닝서프라이즈 조회 실패: ${escapeHtml(dartNaverEarningsError)}`:'네이버 어닝서프라이즈 또는 DART 분기 실적 자료를 확인하는 중입니다.'}</div>`;
  return;
 }
 const tableRows=rows.map(p=>{
  const consensus=p.consensus??null,preliminary=p.preliminary??null,dart=p.dartActual??null;
  const diff=dart!==null&&consensus!==null?dart-consensus:null;
  const naverSurprise=p.naverSurprise??null;
  const verdictValue=diff!==null?diff:naverSurprise;
  let verdict='-',verdictClass='neutral';
  if(verdictValue!==null&&verdictValue!==undefined&&Number.isFinite(Number(verdictValue))){
   if(Number(verdictValue)>0){verdict='Earning Surprise';verdictClass='positive'}
   else if(Number(verdictValue)<0){verdict='Earning Shock';verdictClass='negative'}
   else{verdict='Earning In Line';verdictClass='neutral'}
  }
  const compare=`<span class="dart-compare-number ${signClass(diff)}">${fmt(diff)}</span><span class="dart-compare-bracket">[</span><span class="dart-compare-number ${signClass(naverSurprise)}">${fmt(naverSurprise)}</span><span class="dart-compare-bracket">]</span>`;
  return `<tr><td class="period">${p.year}.${String(p.quarter*3).padStart(2,'0')}.</td><td>${fmt(consensus)}</td><td>${fmt(preliminary)}</td><td>${fmt(dart)}</td><td class="compare">${compare}</td><td><span class="dart-earnings-verdict ${verdictClass}">${verdict}</span></td></tr>`;
 }).join('');
 host.className='dart-surprise-table-state';
 host.innerHTML=`<div class="dart-surprise-table-scroll"><table class="dart-surprise-table"><thead><tr><th>재무연월</th><th>컨센서스</th><th>잠정 실적</th><th>확정 실적</th><th>비교 실적</th><th>Surprise</th></tr></thead><tbody>${tableRows}</tbody></table></div><div class="dart-surprise-table-note">단위: 억원 · 비교 실적 [ ] 안은 네이버 Surprise(%) · 최근 2개 분기</div>`;
}

function renderDartFinancials(data){
 dartFinancialDataCache=data;
 const rows=Array.isArray(data?.quarters)?data.quarters:[];
 const status=$('dartFinancialStatus'),body=$('dartFinancialRows'),chart=$('dartFinancialChart'),summary=$('dartFinancialSummary');
 if(!rows.length){status.textContent=data?.message||'공시된 분기 실적을 찾지 못했습니다.';body.innerHTML='<tr><td colspan="5">표시할 분기 실적이 없습니다.</td></tr>';chart.innerHTML='<div class="chart-empty">DART 실적 데이터가 없습니다.</div>';renderDartSurpriseAnalysis();return}
 const latest=rows[rows.length-1],fmtPct=v=>v===null?'—':`${v.toLocaleString('ko-KR',{maximumFractionDigits:1})}%`;
 summary.innerHTML=[['최근 분기 매출액',latest.revenue],['최근 분기 영업이익',latest.operatingProfit],['최근 분기 순이익',latest.netIncome]].map(([label,v])=>`<div><small>${label}</small><b>${dartFmt(v)}억</b></div>`).join('');
 body.innerHTML=rows.slice().reverse().map(r=>{const margin=r.revenue&&r.operatingProfit!==null?r.operatingProfit/r.revenue*100:null;return `<tr><td>${dartQuarterLabel(r.year,r.quarter)}</td><td>${dartFmt(r.revenue)}</td><td class="${r.operatingProfit<0?'negative':''}">${dartFmt(r.operatingProfit)}</td><td class="${r.netIncome<0?'negative':''}">${dartFmt(r.netIncome)}</td><td>${fmtPct(margin)}</td></tr>`}).join('');
 const allValues=rows.flatMap(r=>[r.revenue,r.operatingProfit,r.netIncome]).filter(v=>v!==null&&v!==undefined&&Number.isFinite(Number(v))).map(Number);
 const maxPositive=Math.max(0,...allValues),maxNegative=Math.max(0,...allValues.map(v=>-v));
 const range=Math.max(1,maxPositive+maxNegative),zeroPct=maxPositive/range*100;
 chart.innerHTML=`<div class="dart-bars" style="--dart-zero:${zeroPct}%">${rows.map(r=>{const bar=(v,kind,label,pos)=>{const n=Number(v)||0,h=Math.abs(n)/range*100,top=n<0?zeroPct:zeroPct-h,left=[15,38.5,62][pos];return `<i class="${kind} ${n<0?'negative':''}" style="left:${left}%;top:${top}%;height:${h}%" title="${label} ${dartFmt(v)}억"></i>`};return `<div class="dart-bar-group"><div class="dart-bar-set">${bar(r.revenue,'revenue','매출액',0)}${bar(r.operatingProfit,'operating','영업이익',1)}${bar(r.netIncome,'net','순이익',2)}</div><small>${String(r.year).slice(2)}.${r.quarter}Q</small></div>`}).join('')}</div><div class="dart-chart-legend"><span><i class="revenue"></i> 매출액</span><span><i class="operating"></i> 영업이익</span><span><i class="net"></i> 순이익</span></div>`;
 status.textContent=`${data.companyName||current.name} · ${data.fsDiv==='CFS'?'연결재무제표':'별도재무제표'} · ${rows.length}개 분기 확인`;
 renderDartSurpriseAnalysis();
}
async function loadDartFinancials(){
 const code=current.code;if(!/^\d{6}$/.test(code||''))return;
 const status=$('dartFinancialStatus'),body=$('dartFinancialRows');
 status.textContent='OpenDART 공식 재무제표 조회 중…';body.innerHTML='<tr><td colspan="5">DART 데이터 조회 중…</td></tr>';
 // 네이버 어닝서프라이즈 표는 DART 조회와 병렬로 가져오되, 기존 DART 표시를 기다리게 하지 않는다.
 dartNaverEarningsError='';
 const naverPromise=loadNaverEarningsSurprise(code).catch(error=>{dartNaverEarningsError=String(error?.message||error||'조회 실패');console.warn('네이버 어닝서프라이즈 조회 실패',error);return null});
 try{
  const url=`${DART_PROXY}/?dart=financials&stock_code=${encodeURIComponent(code)}`;
  const res=await fetch(url,{cache:'no-store'});const data=await res.json();
  if(current.code!==code)return;
  if(!res.ok||!data.ok)throw new Error(data.message||data.error||`HTTP ${res.status}`);
  renderDartFinancials(data);
 }catch(e){
  if(current.code!==code)return;
  const message=String(e?.message||'알 수 없는 오류');status.textContent=`DART 조회 실패: ${message}`;body.innerHTML=`<tr><td colspan="5">${escapeHtml(message)}</td></tr>`;$('dartFinancialChart').innerHTML='<div class="chart-empty">DART 정기 재무제표를 불러오지 못했습니다. 어닝 비교는 네이버 잠정실적 자료를 별도로 확인합니다.</div>';
  dartFinancialDataCache=null;
 }
 const naverRows=await naverPromise;
 if(current.code!==code)return;
 dartNaverEarningsData=naverRows||[];
 if(dartNaverEarningsData.length)dartNaverEarningsError='';
 renderDartSurpriseAnalysis();
}
$('dartFinancialRefresh')?.addEventListener('click',loadDartFinancials);


// ==========================================
// DART 기업 펀더멘털: 지연 조회 + 선그래프 + 분기/연간 전환
// 기존 시세 및 실적 로딩을 막지 않도록 버튼을 눌렀을 때만 조회
// ==========================================
let dartFundamentalCache=null;
let dartFundamentalPeriod='quarter';
let dartFundamentalLoadedCode='';
const dartFundamentalFmt=v=>v===null||v===undefined||!Number.isFinite(Number(v))?'—':(Number(v)/1e8).toLocaleString('ko-KR',{maximumFractionDigits:1});
function dartFundamentalRenderLine(hostId, rows, keys, labels, unit='억'){
 const host=$(hostId);if(!host)return;
 const valid=rows.filter(r=>keys.some(k=>r[k]!==null&&r[k]!==undefined&&Number.isFinite(Number(r[k]))));
 if(!valid.length){host.innerHTML='<div class="chart-empty">공시 자료 없음</div>';return;}
 const W=320,H=132,L=28,R=7,T=8,B=22,plotW=W-L-R,plotH=H-T-B;
 const vals=valid.flatMap(r=>keys.map(k=>r[k]).filter(v=>v!==null&&v!==undefined&&Number.isFinite(Number(v))).map(Number));
 let min=Math.min(0,...vals),max=Math.max(0,...vals);if(max===min){max+=1;min-=1;}const pad=(max-min)*.08;min-=pad;max+=pad;
 const x=i=>L+(valid.length===1?plotW/2:i/(valid.length-1)*plotW),y=v=>T+(max-Number(v))/(max-min)*plotH;
 const colors=['#3979d8','#16a36a','#d58b28']; // CAPEX=blue, FCF=green
 let svg=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${labels.join(', ')} 추이 그래프">`;
 for(let g=0;g<4;g++){const yy=T+g*plotH/3;svg+=`<line class="gridline" x1="${L}" y1="${yy}" x2="${W-R}" y2="${yy}"/>`;}
 keys.forEach((key,ki)=>{
  const pts=valid.map((r,i)=>r[key]===null||r[key]===undefined||!Number.isFinite(Number(r[key]))?null:[x(i),y(r[key])]).filter(Boolean);
  if(!pts.length)return;
  svg+=`<polyline class="series-line" stroke="${colors[ki%colors.length]}" points="${pts.map(p=>p.join(',')).join(' ')}"/>`;
  pts.forEach(p=>svg+=`<circle class="series-point" cx="${p[0]}" cy="${p[1]}" r="2.7" fill="${colors[ki%colors.length]}"/>`);
 });
 valid.forEach((r,i)=>{if(valid.length<=8||i===0||i===valid.length-1||i%Math.ceil(valid.length/5)===0){const label=r.quarter?`${String(r.year).slice(2)}.${r.quarter}Q`:String(r.year);svg+=`<text class="axis-label" x="${x(i)}" y="${H-5}" text-anchor="middle">${label}</text>`;}});
 const legend='<div class="dart-line-legend">'+keys.map((k,i)=>`<span><i style="background:${colors[i%colors.length]}"></i><b>${labels[i]}</b></span>`).join('')+'</div>';
 svg+='</svg>';
 host.innerHTML=legend+svg;
}
function renderDartFundamentals(data){
 dartFundamentalCache=data;
 const rows=(dartFundamentalPeriod==='annual'?data.annual:data.quarters)||[];
 const latest=rows[rows.length-1]||{};
 const content=$('dartFundamentalContent');if(content)content.hidden=false;
 const metricItems=[['CAPEX',latest.capex,'설비투자액'],['FCF',latest.fcf,'잉여현금흐름'],['영업현금흐름',latest.ocf,'OCF'],['순차입금',latest.netDebt,'차입금 − 현금'],['부채비율',latest.debtRatio,'부채총계 ÷ 자본총계','%'],['R&D',latest.rd,'연구개발비'],['현금성 자산',latest.cash,'현금 및 현금성 자산'],['재고자산',latest.inventory,'재무상태표 기준']];
 const metrics=$('dartFundamentalMetrics');if(metrics)metrics.innerHTML=metricItems.map(([name,v,sub,suffix])=>`<div class="dart-fundamental-metric"><small>${name}</small><b>${v===null||v===undefined?'—':suffix==='%'?`${Number(v).toLocaleString('ko-KR',{maximumFractionDigits:1})}%`:`${dartFundamentalFmt(v)}억`}</b><em>${sub}</em></div>`).join('');
 dartFundamentalRenderLine('dartFundChartCash',rows,['capex','fcf'],['CAPEX','FCF']);
 dartFundamentalRenderLine('dartFundChartOps',rows,['ocf','rd'],['영업현금흐름','R&D']);
 dartFundamentalRenderLine('dartFundChartDebt',rows,['netDebt'],['순차입금']);
 dartFundamentalRenderLine('dartFundChartRatio',rows,['debtRatio'],['부채비율'],'%');
 const body=$('dartFundamentalRows');if(body)body.innerHTML=rows.slice().reverse().map(r=>{const label=r.quarter?`${r.year}년 ${r.quarter}Q`:`${r.year}년`;const cell=(v,pct=false)=>v===null||v===undefined?'—':pct?`${Number(v).toLocaleString('ko-KR',{maximumFractionDigits:1})}%`:`${dartFundamentalFmt(v)}억`;return `<tr><td>${label}</td><td>${cell(r.capex)}</td><td class="${r.fcf<0?'negative':''}">${cell(r.fcf)}</td><td>${cell(r.ocf)}</td><td>${cell(r.rd)}</td><td class="${r.netDebt<0?'negative':''}">${cell(r.netDebt)}</td><td>${cell(r.debtRatio,true)}</td></tr>`}).join('')||'<tr><td colspan="7">해당 기간 공시 자료 없음</td></tr>';
 const note=$('dartFundamentalProductionNote');if(note)note.textContent=data.production?.note||'기업별 사업보고서 공시 여부에 따라 표시합니다.';
 const status=$('dartFundamentalStatus');if(status)status.textContent=`${data.companyName||current.name} · ${data.fsDiv==='CFS'?'연결재무제표':'별도재무제표'} · ${data.quarters?.length||0}개 분기 · ${data.annual?.length||0}개 연도 · 6시간 캐시`;
}
async function loadDartFundamentals(force=false){
 const code=current?.code;if(!/^\d{6}$/.test(code||''))return;
 const status=$('dartFundamentalStatus'),button=$('dartFundamentalLoad');
 if(button){button.disabled=true;button.textContent='조회 중…';}
 if(status)status.textContent='DART 현금흐름 및 재무상태 데이터를 조회합니다. 최초 조회에는 시간이 걸릴 수 있습니다.';
 try{
  const url=`${DART_PROXY}/?dart=fundamentals&stock_code=${encodeURIComponent(code)}${force?'&refresh=1':''}`;
  const res=await fetch(url,{cache:'no-store'});const data=await res.json();
  if(current.code!==code)return;
  if(!res.ok||!data.ok)throw new Error(data.message||`HTTP ${res.status}`);
  dartFundamentalLoadedCode=code;renderDartFundamentals(data);
  if($('dartFundamentalLoad'))$('dartFundamentalLoad').hidden=true;
  if($('dartFundamentalRefresh'))$('dartFundamentalRefresh').hidden=false;
 }catch(e){if(status)status.textContent=`펀더멘털 조회 실패: ${String(e?.message||e)}`;}
 finally{if(button){button.disabled=false;button.textContent='데이터 불러오기';}}
}
$('dartFundamentalLoad')?.addEventListener('click',()=>loadDartFundamentals(false));
$('dartFundamentalRefresh')?.addEventListener('click',()=>loadDartFundamentals(true));
document.querySelectorAll('[data-fund-period]').forEach(button=>button.addEventListener('click',()=>{
 dartFundamentalPeriod=button.dataset.fundPeriod;
 document.querySelectorAll('[data-fund-period]').forEach(b=>b.classList.toggle('active',b===button));
 if(dartFundamentalCache)renderDartFundamentals(dartFundamentalCache);
}));
