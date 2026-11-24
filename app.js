'use strict';
// Yahoo Finance chart API is accessed through the companion Cloudflare Worker.
const PROXY_BASE='https://pmc.mcraft-tiger-574.workers.dev';
// Yahoo 요청은 동일 종목이 여러 카드에 반복 등장할 수 있어 브라우저 메모리에서
// 짧게 공유합니다. 화면의 기존 no-store 동작은 유지하면서 중복 네트워크 요청만 줄입니다.
const proxyResponseCache=new Map();
const proxyInflightRequests=new Map();
async function fetchProxy(target,ttlMs=0){
  const key=String(target),now=Date.now();
  const cached=proxyResponseCache.get(key);
  if(cached&&cached.expiresAt>now)return cached.response.clone();
  if(cached)proxyResponseCache.delete(key);
  let pending=proxyInflightRequests.get(key);
  if(!pending){
    pending=fetch(`${PROXY_BASE}/?url=${encodeURIComponent(key)}`,{cache:'no-store'}).then(response=>{
      if(response.ok&&ttlMs>0){
        proxyResponseCache.set(key,{expiresAt:Date.now()+ttlMs,response:response.clone()});
        while(proxyResponseCache.size>120)proxyResponseCache.delete(proxyResponseCache.keys().next().value);
      }
      return response.clone();
    }).finally(()=>proxyInflightRequests.delete(key));
    proxyInflightRequests.set(key,pending);
  }
  return (await pending).clone();
}
const $=id=>document.getElementById(id);
const blank='—';
const groups=[
  {label:'미국 증시',items:[
    {id:'nasdaq',no:1,name:'나스닥 종합',ticker:'^IXIC',unit:'index',percentChart:true},
    {id:'sp500',no:2,name:'S&P 500',ticker:'^GSPC',unit:'index',percentChart:true},
    {id:'nasdaq-futures',no:1,name:'나스닥 선물',ticker:'NQ=F',unit:'index',decimals:2,percentChart:true},
    {id:'sp500-futures',no:2,name:'S&P 500 선물',ticker:'ES=F',unit:'index',decimals:2,percentChart:true},
    {id:'sox',no:5,name:'필라델피아 반도체 지수',ticker:'^SOX',unit:'index',percentChart:true},
    {id:'nvda-m7',no:6,name:'엔비디아',ticker:'NVDA',unit:'stock',percentChart:true},
    {id:'aapl',no:6,name:'애플',ticker:'AAPL',unit:'stock',percentChart:true},
    {id:'googl',no:6,name:'알파벳 Class A',ticker:'GOOGL',unit:'stock',percentChart:true},
    {id:'msft',no:6,name:'마이크로소프트',ticker:'MSFT',unit:'stock',percentChart:true},
    {id:'amzn',no:6,name:'아마존',ticker:'AMZN',unit:'stock',percentChart:true},
    {id:'tsla',no:6,name:'테슬라',ticker:'TSLA',unit:'stock',percentChart:true},
    {id:'meta',no:6,name:'메타',ticker:'META',unit:'stock',percentChart:true}
  ]},
  {label:'금리·환율·원자재',items:[
    {id:'us2y',no:9,name:'미국 2년물 국채금리',source:'treasury',treasuryField:'BC_2YEAR',unit:'yield',suffix:'%',decimals:3},
    {id:'us10y',no:10,name:'미국 10년물 국채금리',source:'treasury',treasuryField:'BC_10YEAR',unit:'yield',suffix:'%',decimals:3},
    {id:'us30y',no:11,name:'미국 30년물 국채금리',source:'treasury',treasuryField:'BC_30YEAR',unit:'yield',suffix:'%',decimals:3},
    {id:'highyield',no:12,name:'하이일드 스프레드',source:'fred',ticker:'BAMLH0A0HYM2',unit:'yield',suffix:'%',decimals:2},
    {id:'dxy',no:13,name:'달러인덱스',ticker:'DX-Y.NYB',unit:'index'},
    {id:'usdkRW',no:14,name:'원/달러 환율',ticker:'KRW=X',unit:'fx',suffix:'원',decimals:2},
    {id:'wti',no:15,name:'WTI 유가',ticker:'CL=F',unit:'commodity',suffix:'$',decimals:2},
    {id:'brent',no:16,name:'브렌트유 유가',ticker:'BZ=F',unit:'commodity',suffix:'$',decimals:2},
    {id:'gold',no:17,name:'금',ticker:'GC=F',unit:'commodity',suffix:'$',decimals:2},
    {id:'silver',no:18,name:'은',ticker:'SI=F',unit:'commodity',suffix:'$',decimals:3},
    {id:'copper',no:19,name:'구리',ticker:'HG=F',unit:'commodity',suffix:'$',decimals:4},
    {id:'vix',no:20,name:'S&P 500 변동성 지수 VIX',ticker:'^VIX',unit:'index',decimals:2},
    {id:'vxn',no:21,name:'나스닥 100 변동성 지수 (VXN)',ticker:'^VXN',unit:'index',decimals:2,percentChart:true}
  ]},
  {label:'국내 증시',items:[
    {id:'kospi200night',no:3,name:'코스피200 야간선물',source:'kredNightFutures',page:'https://kred.dev/ko/kospi-200-night-futures',unit:'futures',decimals:2},
    {id:'kosdaq150night',no:4,name:'코스닥150 야간선물',source:'kredNightFutures',page:'https://kred.dev/ko/kosdaq-150-night-futures',unit:'futures',decimals:2},
    {id:'ewy',no:'',name:'iShares MSCI South Korea ETF',ticker:'EWY',unit:'stock',decimals:2}
  ]}
];
// SOXQ가 추종하는 PHLX Semiconductor Sector Index의 구성 종목 풀(현행 30개 종목).
// 이 중 시가총액 상위 16개만 요약 카드와 개별 차트에 표시합니다.
const SEMICONDUCTOR_UNIVERSE=[
  ['nvda-sox','NVDA','엔비디아'],['avgo','AVGO','브로드컴'],['tsm','TSM','TSMC'],['asml','ASML','ASML'],
  ['amd','AMD','AMD'],['mu','MU','마이크론'],['qcom','QCOM','퀄컴'],['intc','INTC','인텔'],
  ['txn','TXN','텍사스 인스트루먼트'],['adi','ADI','아날로그 디바이시스'],['mrvl','MRVL','마벨 테크놀로지'],
  ['amat','AMAT','어플라이드 머티리얼즈'],['klac','KLAC','KLA'],['lrcx','LRCX','램리서치'],
  ['nxpi','NXPI','NXP 반도체'],['mpwr','MPWR','모놀리식 파워 시스템즈'],['ter','TER','테라다인'],
  ['alab','ALAB','아스테라 랩스'],['cohr','COHR','코히런트'],['mchp','MCHP','마이크로칩 테크놀로지'],
  ['arm','ARM','ARM 홀딩스'],['crdo','CRDO','크레도 테크놀로지'],['on','ON','온세미'],
  ['gfs','GFS','글로벌파운드리스'],['q','Q','큐니티 일렉트로닉스'],['entg','ENTG','엔테그리스'],
  ['tsem','TSEM','타워 세미컨덕터'],['mtsi','MTSI','MACOM 테크놀로지'],['sitm','SITM','SiTime'],['lscc','LSCC','래티스 세미컨덕터']
].map(([id,ticker,name])=>({id,no:5,name,ticker,unit:'stock',semiconductorCandidate:true,summaryActive:false}));
const SKHY_ITEM={id:'skhy',no:7,name:'SK hynix ADR',ticker:'SKHY',unit:'stock',percentChart:true};
// AI infrastructure / model leaders: both are publicly traded on Nasdaq.
const AI_LEADERS=[
  {id:'anthropic',no:8,name:'앤트로픽',ticker:'ANT',unit:'stock',percentChart:true},
  {id:'coreweave',no:8,name:'코어위브',ticker:'CRWV',unit:'stock',percentChart:true}
];
const HYPERSCALERS=[
  {id:'hyperscaler-amzn',no:8,name:'아마존 AWS',ticker:'AMZN',unit:'stock',percentChart:true},
  {id:'hyperscaler-msft',no:8,name:'마이크로소프트 Azure',ticker:'MSFT',unit:'stock',percentChart:true},
  {id:'hyperscaler-googl',no:8,name:'구글 Google Cloud',ticker:'GOOGL',unit:'stock',percentChart:true},
  {id:'hyperscaler-orcl',no:8,name:'오라클 OCI',ticker:'ORCL',unit:'stock',percentChart:true}
];
// Summary and chart order: U.S. indices -> Korean night futures -> SOX (No. 5) -> M7 (No. 6) -> SK hynix ADR (No. 7) -> activity lists.
const firstGroup=groups[0].items;
const byId=new Map(firstGroup.map(item=>[item.id,item]));
groups[0].items=[
  byId.get('nasdaq'),byId.get('nasdaq-futures'),byId.get('sp500'),byId.get('sp500-futures'),
  byId.get('sox'),...['nvda-m7','aapl','googl','msft','amzn','tsla','meta'].map(id=>byId.get(id)),
  SKHY_ITEM,
  ...AI_LEADERS,
  ...SEMICONDUCTOR_UNIVERSE
].filter(Boolean);
const hiddenNdx={id:'ndx-index',name:'나스닥 100 (NDX)',ticker:'^NDX',unit:'index',percentChart:true,hidden:true};
const all=[...groups.flatMap(g=>g.items),...HYPERSCALERS,hiddenNdx];
const dataById=new Map(),charts=new Map();
// 화면 아래쪽 차트는 실제로 가까워졌을 때만 차트 인스턴스를 생성합니다.
// 시세/세션 데이터는 기존과 동일하게 먼저 받아 카드에 반영합니다.
let chartVisibilityObserver=null;
function deferChartUntilVisible(item,series,container){
  if(!('IntersectionObserver' in window))return false;
  const rect=container.getBoundingClientRect();
  if(container.offsetParent!==null&&rect.top<=window.innerHeight+350&&rect.bottom>=-350)return false;
  item._deferredChartSeries=series;
  container.innerHTML='<div class="chart-empty">화면에 표시될 때 차트를 불러옵니다.</div>';
  if(!chartVisibilityObserver){
    chartVisibilityObserver=new IntersectionObserver(entries=>{
      entries.forEach(entry=>{
        if(!entry.isIntersecting)return;
        const target=entry.target;chartVisibilityObserver.unobserve(target);
        const id=target.id.replace(/^chart-/,'');
        const targetItem=all.find(candidate=>candidate.id===id);
        const pending=targetItem?._deferredChartSeries;
        if(targetItem&&pending){delete targetItem._deferredChartSeries;renderOne(targetItem,pending);}
      });
    },{rootMargin:'350px 0px',threshold:0.01});
  }
  chartVisibilityObserver.observe(container);
  return true;
}
/* ---- 명암(라이트/다크) 테마 ---- */
function chartTheme(){return document.body.classList.contains('dark')?{bg:'#202733',text:'#9aa6b8',grid:'#2a3442',border:'#303a49'}:{bg:'#ffffff',text:'#8995a6',grid:'#f0f3f7',border:'#e6eaf1'}}
function applyTheme(dark,save){
  document.body.classList.toggle('dark',dark);
  const meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.setAttribute('content',dark?'#151a22':'#f3f5f9');
  const t=chartTheme();
  for(const entry of charts.values()){try{entry.chart.applyOptions({layout:{background:{type:'solid',color:t.bg},textColor:t.text},grid:{vertLines:{color:t.grid},horzLines:{color:t.grid}},rightPriceScale:{borderColor:t.border},timeScale:{borderColor:t.border}})}catch(e){}}
  if(save){try{localStorage.setItem('premarket-theme',dark?'dark':'light')}catch(e){}}
}
(function(){let saved=null;try{saved=localStorage.getItem('premarket-theme')}catch(e){}if(saved==='dark')applyTheme(true,false)})();
let ndxVolatility=null; // ^VXN is fetched as a calculation input; it is not shown as a separate chart.
let semiconductorExpanded=false;
const ACTIVITY_TYPES={
  turnover:{label:'거래대금 상위(20종목)',metric:'turnover',expanded:false,items:[],containerId:'activity-turnover-summary',chartContainerId:'activity-turnover-charts'},
  volume:{label:'거래량 상위(20종목)',metric:'volume',expanded:false,items:[],containerId:'activity-volume-summary',chartContainerId:'activity-volume-charts'}
};
let hyperscalerExpanded=false;
let hyperscalerLoadPromise=null;
let activityQuotesCache=null;
let activityQuotesFetchedAt=0;
let activityLoadPromise=null;
function updateSemiconductorToggles(){
  document.querySelectorAll('[data-semiconductor-content]').forEach(el=>{el.hidden=!semiconductorExpanded;});
  document.querySelectorAll('[data-semiconductor-toggle]').forEach(button=>{
    button.textContent=semiconductorExpanded?'필라델피아 반도체 지수 구성 종목(시가총액 상위 16종목) 접기 ▲':'필라델피아 반도체 지수 구성 종목(시가총액 상위 16종목) 펼치기 ▼';
    button.setAttribute('aria-expanded',String(semiconductorExpanded));
  });
  if(semiconductorExpanded){
    // The 16 semiconductor chart cards are initially inside a hidden wrapper.
    // Re-measure only these charts after the wrapper has completed layout so
    // Lightweight Charts does not retain the narrow/zero width from its hidden state.
    requestAnimationFrame(()=>requestAnimationFrame(resizeSemiconductorCharts));
    window.setTimeout(resizeSemiconductorCharts,100);
  }
}
function resizeSemiconductorCharts(){
  document.querySelectorAll('.chart-semiconductor-content .chart-card').forEach(card=>{
    const id=card.id.replace(/^chart-card-/,'');
    const entry=charts.get(id);
    const container=card.querySelector('.chart-area');
    if(!entry||!container||container.clientWidth<=0)return;
    const width=Math.floor(container.getBoundingClientRect().width);
    const height=Math.floor(container.getBoundingClientRect().height);
    if(width<=0||height<=0)return;

    // 펼치기 전 숨겨진 상태에서 만들어진 차트는 최초 너비와 시간축 간격이
    // 0 또는 잘못된 값으로 남을 수 있으므로, 실제 너비를 적용한 뒤 선택 기간을 재계산합니다.
    entry.chart.applyOptions({width,height});
    const values=dataById.get(id)?.values||[];
    if(!values.length)return;

    const toolbar=card.querySelector('.chart-range-toolbar');
    const selected=toolbar?.querySelector('button.selected')?.dataset.range||'3M';
    const last=values[values.length-1].time;
    const first=values[0].time;
    const days={
      '1M':31,'3M':92,'6M':184,'YTD':Math.ceil(
        (Date.now()-new Date(new Date().getFullYear(),0,1).getTime())/86400000
      ),'1Y':366,'ALL':730
    }[selected]||92;
    let from=selected==='ALL'?first:
      selected==='YTD'?Math.max(first,Math.floor(new Date(new Date().getFullYear(),0,1).getTime()/1000)):
      Math.max(first,last-days*86400);
    const visibleCount=values.filter(point=>point.time>=from&&point.time<=last).length;
    const plotWidth=Math.max(120,width-58);
    const barSpacing=Math.max(.25,Math.min(7,plotWidth/Math.max(1,visibleCount)));

    entry.chart.applyOptions({timeScale:{
      minBarSpacing:.25,
      barSpacing,
      rightOffset:0
    }});
    requestAnimationFrame(()=>{
      try{entry.chart.timeScale().setVisibleRange({from,to:last});}catch(error){}
    });
  });
}

function createSemiconductorToggle(){
  const button=document.createElement('button');
  button.type='button';button.className='semiconductor-toggle';
  button.dataset.semiconductorToggle='true';button.setAttribute('aria-expanded',String(semiconductorExpanded));
  button.textContent=semiconductorExpanded?'필라델피아 반도체 지수 구성 종목(시가총액 상위 16종목) 접기 ▲':'필라델피아 반도체 지수 구성 종목(시가총액 상위 16종목) 펼치기 ▼';
  button.addEventListener('click',()=>{semiconductorExpanded=!semiconductorExpanded;updateSemiconductorToggles();});
  return button;
}
const M7_IDS=['nvda-m7','aapl','googl','msft','amzn','tsla','meta'];
const M7_TICKERS=['NVDA','AAPL','GOOGL','MSFT','AMZN','TSLA','META'];
// 거래가 종료된 종목은 실시간 거래량 순위에서 제외하고, 고정 종목으로 등록된 경우 상태를 명시합니다.
const INACTIVE_EQUITIES={KVUE:{status:'거래 종료',date:'2026-11-02',reason:'Kimberly-Clark 인수 완료'}};
function fmt(n,dec=2){if(n===null||n===undefined||!Number.isFinite(n))return blank;return n.toLocaleString('ko-KR',{minimumFractionDigits:0,maximumFractionDigits:dec});}
function signed(n,dec=2){if(n===null||n===undefined||!Number.isFinite(n))return blank;return `${n>0?'+':''}${fmt(n,dec)}`;}
function colorClass(n){return n>0?'up':n<0?'down':'neutral';}
function closeText(item,n){if(n==null)return blank;let suffix=item.suffix||'';if(item.unit==='yield')return `${fmt(n,item.decimals??3)}%`;if(item.unit==='fx')return `${fmt(n,item.decimals??2)}원`;if(item.unit==='commodity')return `$${fmt(n,item.decimals??2)}`;if(item.unit==='stock')return `$${fmt(n,2)}`;return `${fmt(n,item.decimals??2)}${suffix}`;}
function changeText(item,n){if(n==null)return blank;const dec=item.unit==='yield'?3:2;const value=signed(n,dec);if(item.unit==='commodity'||item.unit==='stock')return `$ ${value}`;const suffix=item.unit==='yield'?'%p':item.unit==='fx'?'원':'';return `${value}${suffix}`;}
function pctText(n){return n==null?blank:`${n>0?'+':''}${fmt(n,2)}%`;}
async function fetchActivityQuotes(force=false){
  if(!force&&activityQuotesCache&&Date.now()-activityQuotesFetchedAt<60000)return activityQuotesCache;
  if(activityLoadPromise)return activityLoadPromise;
  activityLoadPromise=(async()=>{
    const target='https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?count=250&scrIds=most_actives&formatted=false&lang=en-US&region=US';
    const response=await fetchProxy(target,60000);
    if(!response.ok)throw new Error(`미국 주식 스크리너 HTTP ${response.status}`);
    let json;
    try{json=await response.json();}
    catch{throw new Error('시세 제공처가 JSON이 아닌 응답을 반환했습니다. Cloudflare Worker 배포와 Yahoo 응답을 확인해 주세요.');}
    if(json?.finance?.error)throw new Error(`Yahoo 스크리너 오류: ${json.finance.error.description||json.finance.error.code||'응답 오류'}`);
    const quotes=json?.finance?.result?.[0]?.quotes||[];
    const clean=quotes.filter(q=>q.symbol&&!INACTIVE_EQUITIES[q.symbol]&&Number(q.regularMarketPrice)>0&&Number(q.regularMarketVolume)>0&&(!q.quoteType||q.quoteType==='EQUITY'))
      .map(q=>({...q,activityPrice:Number(q.regularMarketPrice),activityVolume:Number(q.regularMarketVolume),activityTurnover:Number(q.regularMarketPrice)*Number(q.regularMarketVolume)}))
      .filter(q=>Number.isFinite(q.activityTurnover)&&q.activityTurnover>0);
    if(clean.length<20)throw new Error(`미국 주식 후보가 ${clean.length}개만 조회되었습니다. Worker의 Yahoo 스크리너 허용 경로와 Yahoo 응답을 확인해 주세요.`);
    activityQuotesCache=clean;activityQuotesFetchedAt=Date.now();return clean;
  })().finally(()=>{activityLoadPromise=null;});
  return activityLoadPromise;
}
function buildActivityItems(type,quotes){
  const config=ACTIVITY_TYPES[type],metric=config.metric;
  const ranked=[...quotes].sort((a,b)=>b[metric==='turnover'?'activityTurnover':'activityVolume']-a[metric==='turnover'?'activityTurnover':'activityVolume']).slice(0,20);
  config.items=ranked.map(q=>{
    const ticker=q.symbol;
    const name=q.shortName||q.longName||ticker;
    const item={id:`activity-${type}-${ticker.replace(/[^A-Za-z0-9_-]/g,'_')}`,no:'',name,ticker,unit:'stock',activityType:type,
      activityRankValue:q[metric==='turnover'?'activityTurnover':'activityVolume'],activityVolume:q.activityVolume,activityTurnover:q.activityTurnover,
      last:q.activityPrice,screenerLast:q.activityPrice,delta:Number.isFinite(Number(q.regularMarketChange))?Number(q.regularMarketChange):null,
      pct:Number.isFinite(Number(q.regularMarketChangePercent))?Number(q.regularMarketChangePercent):null,
      screenerDelta:Number.isFinite(Number(q.regularMarketChange))?Number(q.regularMarketChange):null,
      screenerPct:Number.isFinite(Number(q.regularMarketChangePercent))?Number(q.regularMarketChangePercent):null,
      prev:Number.isFinite(Number(q.regularMarketPreviousClose))?Number(q.regularMarketPreviousClose):null,
      regularMarketPrice:q.activityPrice,regularMarketDelta:Number.isFinite(Number(q.regularMarketChange))?Number(q.regularMarketChange):null,
      regularMarketPct:Number.isFinite(Number(q.regularMarketChangePercent))?Number(q.regularMarketChangePercent):null};
    const existing=all.find(x=>x.id===item.id);if(existing){Object.assign(existing,item);return existing;}all.push(item);return item;
  });
  return config.items;
}
function updateHyperscalerToggle(){
  document.querySelectorAll('[data-hyperscaler-toggle]').forEach(button=>{
    button.textContent=`하이퍼스케일러 ${hyperscalerExpanded?'접기 ▲':'펼치기 ▼'}`;
    button.setAttribute('aria-expanded',String(hyperscalerExpanded));
  });
  document.querySelectorAll('[data-hyperscaler-result]').forEach(el=>{el.hidden=!hyperscalerExpanded;});
  const grid=$('hyperscaler-charts');if(grid)grid.hidden=!hyperscalerExpanded;
  if(hyperscalerExpanded)requestAnimationFrame(resizeCharts);
}
async function toggleHyperscalers(){
  hyperscalerExpanded=!hyperscalerExpanded;
  updateHyperscalerToggle();
  if(!hyperscalerExpanded)return;
  const pending=HYPERSCALERS.filter(item=>!item.hyperscalerLoaded);
  if(!pending.length)return;
  const status=$('status');const previous=status.textContent;status.textContent='하이퍼스케일러 4종목 차트 조회 중…';
  if(hyperscalerLoadPromise){await hyperscalerLoadPromise;return;}
  hyperscalerLoadPromise=(async()=>{
    let failures=0;
    await Promise.all(pending.map(async item=>{
      try{const series=await fetchSeries(item);renderOne(item,series);item.hyperscalerLoaded=true;}
      catch(error){failures++;const target=$(`chart-${item.id}`);if(target)target.innerHTML=`<div class="chart-empty">${item.name} 차트 조회 실패: ${String(error?.message||error)}</div>`;}
    }));
    updateSummary();
    status.textContent=failures?`하이퍼스케일러 ${4-failures}/4개 연결 · 확인 필요 ${failures}개`:'하이퍼스케일러 4개 차트 연결 완료';
    if(!failures)status.classList.remove('error-note');else status.classList.add('error-note');
    hyperscalerLoadPromise=null;
    requestAnimationFrame(resizeCharts);
  })();
  await hyperscalerLoadPromise;
}
function updateActivityButtons(){
  Object.entries(ACTIVITY_TYPES).forEach(([type,config])=>{
    document.querySelectorAll(`[data-activity-toggle="${type}"]`).forEach(button=>{
      button.textContent=`${config.label} ${config.expanded?'접기 ▲':'펼치기 ▼'}`;
      button.setAttribute('aria-expanded',String(config.expanded));
    });
    document.querySelectorAll(`[data-activity-result="${type}"]`).forEach(row=>row.hidden=!config.expanded);
    const chartGrid=$(config.chartContainerId);if(chartGrid)chartGrid.hidden=!config.expanded;
  });
  if(Object.values(ACTIVITY_TYPES).some(config=>config.expanded))requestAnimationFrame(resizeCharts);
}
async function toggleActivity(type){
  const config=ACTIVITY_TYPES[type];
  if(config.expanded){config.expanded=false;updateActivityButtons();return;}
  config.expanded=true;updateActivityButtons();
  const status=$('status');const previous=status.textContent;status.textContent=`미국 주식 ${config.label} 조회 중…`;
  try{
    const quotes=await fetchActivityQuotes();
    buildActivityItems(type,quotes);
    const grid=$(config.containerId);if(grid){grid.innerHTML='';config.items.forEach(item=>grid.appendChild(makeSummaryCell({no:'',id:item.id,name:item.name,ticker:item.ticker})));}
    const chartGrid=$(config.chartContainerId);if(chartGrid){await renderActivityCharts(type,chartGrid);}
    updateSummary();
    status.textContent=previous;status.classList.remove('error-note');
  }catch(error){
    // 실패해도 펼친 상태를 유지해 사용자가 오류 내용을 바로 확인할 수 있게 합니다.
    config.expanded=true;updateActivityButtons();
    const message=String(error?.message||error||'알 수 없는 오류');
    const grid=$(config.containerId);if(grid)grid.innerHTML=`<div class="chart-empty activity-error">조회 실패: ${message}</div>`;
    const chartGrid=$(config.chartContainerId);if(chartGrid)chartGrid.innerHTML=`<div class="chart-empty activity-error">조회 실패: ${message}</div>`;
    status.textContent='미국 주식 상위 종목 조회 실패';status.classList.add('error-note');
  }
}
async function renderActivityCharts(type,grid){
  const config=ACTIVITY_TYPES[type];
  if(grid.dataset.loaded==='true')return;
  grid.innerHTML='';grid.dataset.loaded='true';
  config.items.forEach(item=>{
    const card=document.createElement('article');card.className='chart-card activity-chart-card';card.id=`chart-card-${item.id}`;
    card.innerHTML=`<div class="chart-top"><div class="chart-title"><h3>${item.name} [${item.ticker}]</h3></div><div class="quote-block"><div class="quote-close">${closeText(item,item.last)}</div><div class="quote-change ${colorClass(item.delta)}">${changeText(item,item.delta)} · ${pctText(item.pct)}</div><div class="quote-date">거래량 ${fmt(item.activityVolume,0)}</div></div></div><div id="chart-${item.id}" class="chart-area"><div class="chart-empty">차트 불러오는 중…</div></div><div class="chart-foot"><span class="chart-note">${item.ticker}</span><span class="bar-count">거래대금 ${fmt(item.activityTurnover/1e6,1)}M USD</span></div>`;
    item.card=card;grid.appendChild(card);
  });
  // 펼침 목록은 스크리너의 동적 종목이므로 별도 Yahoo quote를 연결합니다.
  // 일괄 요청이 실패해도 차트/기존 데이터 로딩 전체를 중단하지 않고 종목별로 재시도합니다.
  const activitySymbols=[...new Set(config.items.map(item=>item.ticker).filter(Boolean))];
  const activityQuoteMap=new Map();
  if(activitySymbols.length){
    const fetchActivityQuoteBatch=async symbols=>{
      const target=`https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols.join(','))}&overnightPrice=true`;
      const response=await fetchProxy(target,12000);
      if(!response.ok)throw new Error(`Yahoo quote HTTP ${response.status}`);
      const json=await response.json();
      (json?.quoteResponse?.result||[]).forEach(quote=>activityQuoteMap.set(quote.symbol,quote));
    };
    try{
      await fetchActivityQuoteBatch(activitySymbols);
    }catch(batchError){
      console.warn('상위 종목 일괄 Overnight quote 조회 실패, 개별 재시도',batchError);
      let quoteCursor=0;
      const quoteWorkers=Array.from({length:4},async()=>{
        while(quoteCursor<activitySymbols.length){
          const ticker=activitySymbols[quoteCursor++];
          try{await fetchActivityQuoteBatch([ticker]);}
          catch(error){console.warn(`${ticker} Overnight quote 조회 실패`,error);}
        }
      });
      await Promise.all(quoteWorkers);
    }
    config.items.forEach(item=>{item.yahooQuote=activityQuoteMap.get(item.ticker)||null;});
  }
  let cursor=0;const workers=Array.from({length:5},async()=>{while(cursor<config.items.length){const item=config.items[cursor++];try{const series=await fetchSeries(item);renderOne(item,series);}catch(error){const target=$(`chart-${item.id}`);if(target)target.innerHTML=`<div class="chart-empty">${item.ticker} 차트 조회 실패</div>`;}}});
  await Promise.all(workers);
  config.items.forEach(item=>{
    item.last=item.screenerLast;item.delta=item.screenerDelta;item.pct=item.screenerPct;
    if(item.card){
      item.card.querySelector('.quote-close').textContent=closeText(item,item.screenerLast);
      item.card.querySelector('.quote-change').textContent=`${changeText(item,item.screenerDelta)} · ${pctText(item.screenerPct)}`;
      item.card.querySelector('.quote-change').className=`quote-change ${colorClass(item.screenerDelta)}`;
      item.card.querySelector('.quote-date').textContent=`거래량 ${fmt(item.activityVolume,0)}`;
    }
  });
  requestAnimationFrame(resizeCharts);
}
function makeSummaryCell(ref){
    const cell=document.createElement('div');
    cell.className='summary-cell'+(ref.id==='kospi200night'||ref.id==='kosdaq150night'?' night-futures-summary-cell':'')+(ref.no===6?' m7-summary-cell':'')+(ref.id==='skhy'?' skhy-reversed-summary-cell':'')+(ref.id==='vix'?' vix-summary-cell':'')+(['nasdaq','sp500','sox','kospi200night','kosdaq150night','vxn'].includes(ref.id)?' soft-green-summary-cell':'');
    const targetId=ref.chartId||ref.id;
    const link=ref.url?`<a class="summary-chart-link" href="${ref.url}" target="_blank" rel="noopener noreferrer">차트</a>`:`<a class="summary-chart-link internal-chart-link" href="#chart-card-${targetId}" data-chart-target="chart-card-${targetId}">차트</a>`;
    const ticker=ref.ticker||all.find(item=>item.id===ref.id)?.ticker;
    const displayName=ref.displayName||`${ref.no!==''&&ref.no!==null&&ref.no!==undefined?`${ref.no}. `:''}${ref.id==='vix'?'VIX':ref.name}${ticker?` [${ticker}]`:''}`;
    const blankOnly=!!ref.blankOnly||!!all.find(item=>item.id===ref.id)?.blankSummary;
    cell.innerHTML=`<div class="summary-titleline"><div class="summary-label">${displayName}</div>${link}</div>${blankOnly?'':`<div class="summary-price-line"><div class="summary-quote-values"><div class="summary-price">${blank}</div><div class="summary-change neutral">${blank} · ${blank}</div>${all.find(item=>item.id===ref.id)?.unit==='stock'?`<div class="summary-session-box"><div class="summary-session-item"><span class="summary-session-label">프리마켓</span><span class="summary-session-value summary-pre-price">${blank}</span><span class="summary-session-delta summary-pre-delta neutral">${blank}</span><span class="summary-session-pct summary-pre-pct neutral">${blank}</span></div><div class="summary-session-item"><span class="summary-session-label">애프터마켓</span><span class="summary-session-value summary-regular-price">${blank}</span><span class="summary-session-delta summary-regular-delta neutral">${blank}</span><span class="summary-session-pct summary-regular-pct neutral">${blank}</span></div><div class="summary-session-item"><span class="summary-session-label">오버나이트</span><span class="summary-session-value summary-post-price">${blank}</span><span class="summary-session-delta summary-post-delta neutral">${blank}</span><span class="summary-session-pct summary-post-pct neutral">${blank}</span><span class="summary-session-pct summary-post-time neutral"></span></div></div>`:''}</div></div>`}`;
    cell.dataset.summaryId=ref.id;
    return cell;
  }
function makeSummary(){
  const root=$('summaryRows');root.innerHTML='';
  const m7Names={'nvda-m7':'엔비디아',aapl:'애플',googl:'알파벳 Class A',msft:'마이크로소프트',amzn:'아마존',tsla:'테슬라',meta:'메타'};
  const m7Items=M7_IDS.map((id,index)=>({id,ticker:M7_TICKERS[index],item:all.find(x=>x.id===id),original:index})).sort((a,b)=>{
    const av=Number.isFinite(a.item?.marketCap)&&a.item.marketCap>0?a.item.marketCap:null;
    const bv=Number.isFinite(b.item?.marketCap)&&b.item.marketCap>0?b.item.marketCap:null;
    if(av===null&&bv===null)return a.original-b.original;if(av===null)return 1;if(bv===null)return -1;return bv-av;
  });
  const semis=SEMICONDUCTOR_UNIVERSE.filter(x=>x.summaryActive).sort((a,b)=>{
    const av=Number.isFinite(a.marketCap)&&a.marketCap>0?a.marketCap:null;
    const bv=Number.isFinite(b.marketCap)&&b.marketCap>0?b.marketCap:null;
    if(av===null&&bv===null)return SEMICONDUCTOR_UNIVERSE.indexOf(a)-SEMICONDUCTOR_UNIVERSE.indexOf(b);
    if(av===null)return 1;if(bv===null)return -1;return bv-av;
  }).slice(0,16).map(x=>({no:5,id:x.id,name:x.name,ticker:x.ticker}));
  const m7Refs=m7Items.map(x=>({no:6,id:x.id,name:m7Names[x.id],ticker:x.ticker}));
  const skhyRef={no:7,id:'skhy',name:'SK hynix ADR',ticker:'SKHY'};
  const aiLeaderRefs=AI_LEADERS.map(item=>({no:8,id:item.id,name:item.name,ticker:item.ticker}));
  const m7Rows=[[m7Refs[0],m7Refs[1]],[m7Refs[2],m7Refs[3]],[m7Refs[4],m7Refs[5]],[m7Refs[6],skhyRef]];
  const rows=[
    {items:[
      {no:1,id:'nasdaq',name:'나스닥 종합',ticker:'^IXIC'},
      {no:1,id:'nasdaq-futures',name:'나스닥 선물',ticker:'NQ=F'},
      {no:2,id:'sp500',name:'S&P 500',ticker:'^GSPC'},
      {no:2,id:'sp500-futures',name:'S&P 500 선물',ticker:'ES=F'}
    ],marketIndex:true,after:true},
    {items:[{no:3,id:'kospi200night',name:'코스피200 야간선물',url:'https://kred.dev/ko/kospi-200-night-futures'},{no:4,id:'kosdaq150night',name:'코스닥150 야간선물',url:'https://kred.dev/ko/kosdaq-150-night-futures'}],after:true},
    {items:[{no:'',id:'ewy',name:'iShares MSCI South Korea ETF',ticker:'EWY',displayName:'[+] iShares MSCI South Korea ETF [EWY]'}],single:true,after:true},
    {items:[{no:5,id:'sox',name:'필라델피아 반도체 지수',ticker:'^SOX'}],single:true,semis,after:true},
    ...m7Rows.map((items,index)=>({items,m7:true,after:index===3})),
    {items:aiLeaderRefs,after:true},
    {hyperscalerToggle:true,after:true},
    {activityType:'turnover'},
    {activityType:'volume',after:true},
    {items:[{no:9,id:'us2y',name:'미국 2년물'},{no:10,id:'us10y',name:'미국 10년물'}]},
    {items:[{no:11,id:'us30y',name:'미국 30년물'},{no:12,id:'highyield',name:'하이일드 스프레드'}],after:true},
    {items:[{no:13,id:'dxy',name:'달러인덱스'},{no:14,id:'usdkRW',name:'원/달러'}]},
    {items:[{no:15,id:'wti',name:'WTI 유가'},{no:16,id:'brent',name:'브렌트유'}],after:true},
    {items:[{no:17,id:'gold',name:'금',ticker:'GC=F'},{no:18,id:'silver',name:'은',ticker:'SI=F'},{no:19,id:'copper',name:'구리',ticker:'HG=F'}],after:true},
    {groupTitle:'VIX · S&P 500 Expected Move'},
    {expectedMoveGroup:{spotId:'sp500',volId:'vix',prefix:'spx',underlyingNote:'S&P 500 기준'},items:[{no:20,id:'vix',name:'S&P 500 변동성 지수 VIX',ticker:'^VIX'}],after:true},
    {groupTitle:'VXN · Nasdaq Expected Move'},
    {expectedMoveGroup:{spotId:'ndx-index',volId:'vxn',prefix:'ndx',underlyingNote:'Nasdaq 100 (NDX) 기준 · VXN 변동성 적용'},items:[{no:21,id:'vxn',name:'VXN',ticker:'^VXN'}],after:true}
  ];
  function makeSummaryCell(ref){
    const cell=document.createElement('div');
    cell.className='summary-cell'+(ref.id==='kospi200night'||ref.id==='kosdaq150night'?' night-futures-summary-cell':'')+(ref.no===6?' m7-summary-cell':'')+(ref.id==='skhy'?' skhy-reversed-summary-cell':'')+(ref.id==='vix'?' vix-summary-cell':'')+(['nasdaq','sp500','sox','kospi200night','kosdaq150night','vxn'].includes(ref.id)?' soft-green-summary-cell':'');
    const targetId=ref.chartId||ref.id;
    const link=ref.url?`<a class="summary-chart-link" href="${ref.url}" target="_blank" rel="noopener noreferrer">차트</a>`:`<a class="summary-chart-link internal-chart-link" href="#chart-card-${targetId}" data-chart-target="chart-card-${targetId}">차트</a>`;
    const ticker=ref.ticker||all.find(item=>item.id===ref.id)?.ticker;
    const displayName=ref.displayName||`${ref.no!==''&&ref.no!==null&&ref.no!==undefined?`${ref.no}. `:''}${ref.id==='vix'?'VIX':ref.name}${ticker?` [${ticker}]`:''}`;
    const blankOnly=!!ref.blankOnly||!!all.find(item=>item.id===ref.id)?.blankSummary;
    cell.innerHTML=`<div class="summary-titleline"><div class="summary-label">${displayName}</div>${link}</div>${blankOnly?'':`<div class="summary-price-line"><div class="summary-quote-values"><div class="summary-price">${blank}</div><div class="summary-change neutral">${blank} · ${blank}</div>${all.find(item=>item.id===ref.id)?.unit==='stock'?`<div class="summary-session-box"><div class="summary-session-item"><span class="summary-session-label">프리마켓</span><span class="summary-session-value summary-pre-price">${blank}</span><span class="summary-session-delta summary-pre-delta neutral">${blank}</span><span class="summary-session-pct summary-pre-pct neutral">${blank}</span></div><div class="summary-session-item"><span class="summary-session-label">애프터마켓</span><span class="summary-session-value summary-regular-price">${blank}</span><span class="summary-session-delta summary-regular-delta neutral">${blank}</span><span class="summary-session-pct summary-regular-pct neutral">${blank}</span></div><div class="summary-session-item"><span class="summary-session-label">오버나이트</span><span class="summary-session-value summary-post-price">${blank}</span><span class="summary-session-delta summary-post-delta neutral">${blank}</span><span class="summary-session-pct summary-post-pct neutral">${blank}</span><span class="summary-session-pct summary-post-time neutral"></span></div></div>`:''}</div></div>`}`;
    cell.dataset.summaryId=ref.id;
    return cell;
  }
  rows.forEach(row=>{
    if(row.groupTitle){
      const heading=document.createElement('div');
      heading.className='summary-group-title';
      heading.textContent=row.groupTitle;
      root.appendChild(heading);
      return;
    }
    if(row.expectedMoveGroup){
      const line=document.createElement('div');
      line.className='summary-row expected-move-group-row'+(row.after?' summary-divider-after':'');
      line.style.setProperty('--cols',4);
      row.items.forEach(ref=>line.appendChild(makeSummaryCell(ref)));
      [['1일',1],['1주일',7],['1개월',30]].forEach(([label,days])=>{
        const cell=document.createElement('div');
        cell.className='summary-cell expected-move-cell';
        cell.innerHTML=`<div class="summary-label">Expected Move (${label})</div><div class="expected-move-value" data-em-prefix="${row.expectedMoveGroup.prefix}" data-em-days="${days}">${blank}</div><div class="expected-move-note">${row.expectedMoveGroup.underlyingNote}</div><div class="expected-move-range"><span>예상 상단 <b data-em-side="upper">${blank}</b></span><span>예상 하단 <b data-em-side="lower">${blank}</b></span></div>`;
        line.appendChild(cell);
      });
      root.appendChild(line);
      return;
    }
    if(row.hyperscalerToggle){
      const buttonRow=document.createElement('div');
      buttonRow.className='summary-row activity-control-row summary-divider-after';
      buttonRow.style.setProperty('--cols',1);
      const cell=document.createElement('div');cell.className='summary-cell activity-button-cell';
      const button=document.createElement('button');button.type='button';button.className='activity-toggle';button.dataset.hyperscalerToggle='true';
      button.textContent=`하이퍼스케일러 ${hyperscalerExpanded?'접기 ▲':'펼치기 ▼'}`;button.setAttribute('aria-expanded',String(hyperscalerExpanded));
      button.addEventListener('click',toggleHyperscalers);cell.appendChild(button);
      const result=document.createElement('div');result.className='activity-result-content';result.dataset.hyperscalerResult='true';result.hidden=!hyperscalerExpanded;
      const grid=document.createElement('div');grid.className='activity-summary-grid';grid.id='hyperscaler-summary';
      HYPERSCALERS.forEach(item=>grid.appendChild(makeSummaryCell({no:'',id:item.id,name:item.name,ticker:item.ticker})));
      result.appendChild(grid);cell.appendChild(result);buttonRow.appendChild(cell);root.appendChild(buttonRow);
      return;
    }
    if(row.activityType){
      const type=row.activityType;
      const config=ACTIVITY_TYPES[type];
      const buttonRow=document.createElement('div');
      buttonRow.className='summary-row activity-control-row'+(type==='volume'?' summary-divider-after':'');
      buttonRow.style.setProperty('--cols',1);
      const cell=document.createElement('div');cell.className='summary-cell activity-button-cell';
      const button=document.createElement('button');button.type='button';button.className='activity-toggle';button.dataset.activityToggle=type;
      button.textContent=`${config.label} ${config.expanded?'접기 ▲':'펼치기 ▼'}`;button.setAttribute('aria-expanded',String(config.expanded));
      button.addEventListener('click',()=>toggleActivity(type));cell.appendChild(button);
      const result=document.createElement('div');result.className='activity-result-content';result.dataset.activityResult=type;result.hidden=!config.expanded;
      const grid=document.createElement('div');grid.className='activity-summary-grid';grid.id=config.containerId;
      config.items.forEach(item=>grid.appendChild(makeSummaryCell({no:'',id:item.id,name:item.name,ticker:item.ticker})));
      result.appendChild(grid);cell.appendChild(result);buttonRow.appendChild(cell);root.appendChild(buttonRow);
      return;
    }
    if(!row.items?.length)return;
    const line=document.createElement('div');
    line.className='summary-row'+(row.marketIndex?' market-index-row':'')+(row.hyperscaler?' hyperscaler-summary-row':'')+(row.m7?' m7-summary-row':'')+(row.firstM7?' m7-first-row':'')+(row.single?' single-index-row':'')+(row.before?' summary-divider-before':'')+(row.after?' summary-divider-after':'');
    line.style.setProperty('--cols',row.items.length);
    row.items.forEach(ref=>{
      const cell=makeSummaryCell(ref);
      if(ref.id==='sox'&&row.semis){
        const toggle=createSemiconductorToggle();
        toggle.classList.add('semiconductor-toggle-in-cell');
        cell.appendChild(toggle);
        const grid=document.createElement('div');grid.className='semiconductor-summary-grid';grid.dataset.semiconductorContent='true';grid.hidden=!semiconductorExpanded;
        row.semis.forEach(semiref=>grid.appendChild(makeSummaryCell(semiref)));
        cell.appendChild(grid);
      }
      line.appendChild(cell);
    });
    root.appendChild(line);
  });
  root.querySelectorAll('.internal-chart-link').forEach(link=>link.addEventListener('click',event=>{event.preventDefault();const target=$(link.dataset.chartTarget);if(!target)return;target.scrollIntoView({behavior:'smooth',block:'start'});target.classList.remove('chart-card-highlight');void target.offsetWidth;target.classList.add('chart-card-highlight');window.setTimeout(()=>target.classList.remove('chart-card-highlight'),1600);}));
  updateSemiconductorToggles();
}
function makeCharts(){
  const root=$('charts');root.innerHTML='';
  groups.forEach(group=>{
    let visibleItems=group.items.filter(item=>item.id!=='ewy'&&item.source!=='kredNightFutures'&&(!item.semiconductorCandidate||item.summaryActive));
    const m7Set=new Set(M7_IDS);
    const byCap=(a,b)=>{const av=Number.isFinite(a.marketCap)&&a.marketCap>0?a.marketCap:null,bv=Number.isFinite(b.marketCap)&&b.marketCap>0?b.marketCap:null;if(av===null&&bv===null)return group.items.indexOf(a)-group.items.indexOf(b);if(av===null)return 1;if(bv===null)return -1;return bv-av;};
    visibleItems.sort((a,b)=>{if(m7Set.has(a.id)&&m7Set.has(b.id))return byCap(a,b);if(a.semiconductorCandidate&&b.semiconductorCandidate)return byCap(a,b);return group.items.indexOf(a)-group.items.indexOf(b);});
    if(!visibleItems.length)return;
    if(group.label!=='금리·환율·원자재'){
      const heading=document.createElement('div');heading.className='section-heading group-heading';heading.innerHTML=`<div><span class="eyebrow">${group.label==='미국 증시'?'U.S. MARKETS':'KOREA MARKETS'}</span><h2>${group.label}</h2></div>`;root.appendChild(heading);
    }
    let semiconductorWrap=null;
    visibleItems.forEach(item=>{
      // EWY remains in the domestic data/summary group, but its chart is displayed above SOX.
      if(item.id==='sox'){
        const ewy=all.find(candidate=>candidate.id==='ewy');
        if(ewy){
          const ewyCard=document.createElement('article');
          ewyCard.className='chart-card';
          ewyCard.id=`chart-card-${ewy.id}`;
          ewyCard.innerHTML=`<div class="chart-top"><div class="chart-title"><span class="number">+</span><h3>${ewy.name} [${ewy.ticker}]</h3></div><div class="quote-block"><div class="quote-close">${blank}</div><div class="quote-change neutral">${blank} · ${blank}</div><div class="quote-date">종가 기준</div></div></div><div class="chart-range-toolbar" data-range-for="${ewy.id}"><button type="button" data-range="1M">1M</button><button type="button" data-range="3M\" class="selected">3M</button><button type="button" data-range="6M">6M</button><button type="button" data-range="YTD">YTD</button><button type="button" data-range="1Y">1Y</button><button type="button" data-range="ALL">ALL</button></div><div id="chart-${ewy.id}" class="chart-area"><div class="chart-empty">시세 데이터를 불러오는 중…</div></div><div class="chart-foot"><span class="chart-note">${ewy.ticker}</span><span class="bar-count">전체 기간 데이터</span></div>`;
          ewy.card=ewyCard;root.appendChild(ewyCard);
        }
      }
      if(item.id==='us2y'){
        // Keep the activity controls after the SOX, M7, and SK hynix chart cards.
        Object.entries(ACTIVITY_TYPES).forEach(([type,config])=>{
          const controlCell=document.createElement('article');
          controlCell.className='chart-card activity-chart-control-cell';
          controlCell.dataset.activityControlCard=type;
          const button=document.createElement('button');button.type='button';button.className='activity-toggle';button.dataset.activityToggle=type;button.textContent=`${config.label} ${config.expanded?'접기 ▲':'펼치기 ▼'}`;button.setAttribute('aria-expanded',String(config.expanded));button.addEventListener('click',()=>toggleActivity(type));controlCell.appendChild(button);
          const activityGrid=document.createElement('div');activityGrid.className='activity-chart-grid';activityGrid.id=config.chartContainerId;activityGrid.hidden=!config.expanded;controlCell.appendChild(activityGrid);
          root.appendChild(controlCell);
        });
        const ratesHeading=document.createElement('div');ratesHeading.className='section-heading group-heading';
        ratesHeading.innerHTML='<div><span class="eyebrow">RATES · FX · COMMODITIES</span><h2>금리·환율·원자재</h2></div>';
        root.appendChild(ratesHeading);
      }
      if(item.id==='vix'){
        const volatilityHeading=document.createElement('div');volatilityHeading.className='section-heading group-heading';
        volatilityHeading.innerHTML='<div><span class="eyebrow">VOLATILITY · MARKET RISK</span><h2>변동성 · 시장 위험</h2></div>';
        root.appendChild(volatilityHeading);
      }
      const card=document.createElement('article');
      card.className='chart-card'+(['sox','nvda-m7','us2y','vix'].includes(item.id)?' chart-divider-before':'');
      card.id=`chart-card-${item.id}`;
      card.innerHTML=`<div class="chart-top"><div class="chart-title"><span class="number">${item.id==='ewy'?'+' : item.no}</span><h3>${item.name}${item.ticker?` [${item.ticker}]`:''}</h3></div><div class="quote-block"><div class="quote-close">${blank}</div><div class="quote-change neutral">${blank} · ${blank}</div><div class="quote-date">종가 기준</div></div></div><div class="chart-range-toolbar" data-range-for="${item.id}"><button type="button" data-range="1M">1M</button><button type="button" data-range="3M" class="selected">3M</button><button type="button" data-range="6M">6M</button><button type="button" data-range="YTD">YTD</button><button type="button" data-range="1Y">1Y</button><button type="button" data-range="ALL">ALL</button></div><div id="chart-${item.id}" class="chart-area"><div class="chart-empty">시세 데이터를 불러오는 중…</div></div><div class="chart-foot"><span class="chart-note">${item.ticker||''}</span><span class="bar-count">전체 기간 데이터</span></div>`;
      if(item.semiconductorCandidate&&semiconductorWrap){semiconductorWrap.appendChild(card);}
      else root.appendChild(card);
      item.card=card;
      if(item.id==='coreweave'){
        // Place the hyperscaler control directly after the Anthropic/CoreWeave chart row.
        const hyperscalerControl=document.createElement('article');
        hyperscalerControl.className='chart-card activity-chart-control-cell';
        hyperscalerControl.dataset.hyperscalerControlCard='true';
        const hyperscalerButton=document.createElement('button');
        hyperscalerButton.type='button';hyperscalerButton.className='activity-toggle';hyperscalerButton.dataset.hyperscalerToggle='true';
        hyperscalerButton.textContent=`하이퍼스케일러 ${hyperscalerExpanded?'접기 ▲':'펼치기 ▼'}`;
        hyperscalerButton.setAttribute('aria-expanded',String(hyperscalerExpanded));
        hyperscalerButton.addEventListener('click',toggleHyperscalers);
        hyperscalerControl.appendChild(hyperscalerButton);
        const hyperscalerGrid=document.createElement('div');
        hyperscalerGrid.className='activity-chart-grid hyperscaler-chart-grid';
        hyperscalerGrid.id='hyperscaler-charts';hyperscalerGrid.hidden=!hyperscalerExpanded;
        HYPERSCALERS.forEach(item=>{
          const hyperCard=document.createElement('article');
          hyperCard.className='chart-card activity-chart-card hyperscaler-chart-card';
          hyperCard.id=`chart-card-${item.id}`;
          hyperCard.innerHTML=`<div class="chart-top"><div class="chart-title"><h3>${item.name} [${item.ticker}]</h3></div><div class="quote-block"><div class="quote-close">${blank}</div><div class="quote-change neutral">${blank} · ${blank}</div><div class="quote-date">종가 기준</div></div></div><div id="chart-${item.id}" class="chart-area"><div class="chart-empty">하이퍼스케일러 펼침 후 시세를 불러옵니다.</div></div><div class="chart-foot"><span class="chart-note">${item.ticker}</span><span class="bar-count">전체 기간 데이터</span></div>`;
          item.card=hyperCard;hyperscalerGrid.appendChild(hyperCard);
        });
        hyperscalerControl.appendChild(hyperscalerGrid);
        root.appendChild(hyperscalerControl);
      }
      if(item.id==='sox'){ 
        const toggle=createSemiconductorToggle();toggle.classList.add('semiconductor-toggle-in-chart');card.appendChild(toggle);
        semiconductorWrap=document.createElement('div');semiconductorWrap.className='chart-semiconductor-content';semiconductorWrap.dataset.semiconductorContent='true';semiconductorWrap.hidden=!semiconductorExpanded;card.appendChild(semiconductorWrap);
      }
    });
  });
  updateSemiconductorToggles();
}
function workerUrl(ticker){return `${PROXY_BASE}/?url=${encodeURIComponent(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=2y&interval=1d&events=div%2Csplits&includePrePost=true`)}`;}
async function fetchSeries(item){if(INACTIVE_EQUITIES[item.ticker])return {inactive:true,...INACTIVE_EQUITIES[item.ticker]};if(item.source==='kredNightFutures'){const response=await fetch(`${PROXY_BASE}/?url=${encodeURIComponent(item.page)}`,{cache:'no-store'});if(!response.ok)throw new Error(`KRED HTTP ${response.status}`);const html=await response.text();
const doc=new DOMParser().parseFromString(html,'text/html');
const decode=s=>String(s||'').replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/gi,'&').replace(/&minus;/gi,'−').replace(/&#8722;/g,'−');
const cleanDoc=doc.cloneNode(true);
cleanDoc.querySelectorAll('script,style,noscript,svg,template').forEach(node=>node.remove());
const text=decode(cleanDoc.body?.textContent||'').replace(/[\u00a0\u2007\u202f]/g,' ').replace(/\s+/g,' ').trim();
const title=item.id==='kospi200night'?'코스피 200 야간선물':'코스닥 150 야간선물';
const quotePattern=/([0-9]{1,4}(?:,[0-9]{3})*\.\d{2})\s*([+−–-]\s*\d+(?:\.\d+)?)\s*\(\s*([+−–-]?\s*\d+(?:\.\d+)?)\s*%\s*\)/g;
let match=null;
const titleIndex=text.indexOf(title);
if(titleIndex>=0){
  // 종목 제목 바로 뒤의 시세 영역만 검색해 본문·설명·다른 숫자와 섞이지 않게 합니다.
  const quoteSection=text.slice(titleIndex+title.length,titleIndex+title.length+700);
  match=[...quoteSection.matchAll(quotePattern)][0]||null;
}
if(!match){
  // 본문에 시세가 없을 때만 KRED의 공식 설명 메타데이터를 확인합니다.
  const metas=[...doc.querySelectorAll('meta[property="og:description"],meta[name="description"],meta[name="twitter:description"]')].map(m=>decode(m.content||'')).join(' ');
  match=[...metas.matchAll(quotePattern)][0]||null;
}
if(!match)throw new Error('KRED 원본 페이지에서 해당 야간선물의 현재가·등락·등락률을 확인하지 못했습니다. 잘못된 숫자를 대신 표시하지 않도록 조회를 중단했습니다.');
const num=v=>Number(String(v).replace(/,/g,'').replace(/[−–]/g,'-').replace(/\s/g,''));const price=num(match[1]),delta=num(match[2]),pct=num(match[3]);if(!Number.isFinite(price)||!Number.isFinite(delta)||!Number.isFinite(pct)||price<=0)throw new Error('KRED 시세 형식이 올바르지 않습니다');const reference=price-delta;const nowMs=Date.now();const nowDate=new Date(nowMs);const sessionStart=new Date(nowDate);const hour=nowDate.getHours();if(hour<18)sessionStart.setDate(sessionStart.getDate()-1);sessionStart.setHours(18,0,0,0);let sessionEnd=new Date(sessionStart);sessionEnd.setDate(sessionEnd.getDate()+1);sessionEnd.setHours(6,0,0,0);const now=Math.floor(Math.min(nowMs,sessionEnd.getTime())/1000);const start=Math.floor(sessionStart.getTime()/1000);const chartEnd=Math.max(start+60,now);return {nightFutures:true,current:price,delta,pct,reference,values:[{time:start,value:reference},{time:chartEnd,value:price}],exchange:'KRED',sessionStart:start,sessionEnd:Math.floor(sessionEnd.getTime()/1000)};}if(item.source==='tradingview'||item.source==='tradingviewEmbed'||item.source==='nightFuturesEmbed')return {tradingView:true,embed:item.source==='tradingviewEmbed',nightFutures:item.source==='nightFuturesEmbed',values:[]};const intradayTarget=`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(item.ticker)}?range=5d&interval=1m&events=div%2Csplits&includePrePost=true`;const intradayPromise=item.unit==='stock'&&!item.skipIntraday?fetchProxy(intradayTarget,12000).catch(()=>null):null;const afterHoursNowParts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).map(p=>[p.type,p.value]));const afterHoursNowMinute=Number(afterHoursNowParts.hour)*60+Number(afterHoursNowParts.minute);const isAfterHoursWindow=afterHoursNowMinute>=960&&afterHoursNowMinute<1200;const afterHoursQuotePromise=item.unit==='stock'&&isAfterHoursWindow?fetchProxy(`https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(item.ticker)}`,12000).then(async r=>{if(!r.ok)return null;const j=await r.json();return j?.quoteResponse?.result?.[0]||null;}).catch(()=>null):Promise.resolve(null);const target=item.source==='treasury'?`https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml?data=daily_treasury_yield_curve&field_tdr_date_value=${new Date().getFullYear()}`:item.source==='fred'?`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${encodeURIComponent(item.ticker)}&cosd=2024-01-01`: `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(item.ticker)}?range=2y&interval=1d&events=div%2Csplits&includePrePost=true`;let response=await fetchProxy(target,item.source==='fred'||item.source==='treasury'?0:300000);if(item.source==='fred'&&!response.ok){const fallbackTarget=`https://fred.stlouisfed.org/data/${encodeURIComponent(item.ticker)}`;response=await fetch(`${PROXY_BASE}/?url=${encodeURIComponent(fallbackTarget)}`,{cache:'no-store'});}if(item.source==='fred'&&!response.ok&&item.id==='highyield'){const mirrorTarget='https://autario.com/api/v1/public/datasets/e4a3e9e1-0e3f-4bc3-8b6f-bd8f0eb8c8c9/data?limit=1000';const mirrorResponse=await fetch(`${PROXY_BASE}/?url=${encodeURIComponent(mirrorTarget)}`,{cache:'no-store'});if(mirrorResponse.ok){const payload=await mirrorResponse.json();const rows=Array.isArray(payload?.data)?payload.data:(Array.isArray(payload?.rows)?payload.rows:[]);const values=rows.map(row=>{const date=String(row.date??row.observation_date??row.Date??'').slice(0,10);const value=Number(row.value??row.BAMLH0A0HYM2??row.Value);return {date,value};}).filter(row=>/^\d{4}-\d{2}-\d{2}$/.test(row.date)&&Number.isFinite(row.value)).sort((a,b)=>a.date.localeCompare(b.date)).map(row=>({time:Math.floor(Date.parse(row.date+'T00:00:00Z')/1000),value:row.value}));if(values.length>=2)return {values,currency:'%',exchange:'FRED (Autario backup)'};throw new Error('대체 데이터 응답 형식 오류');}throw new Error(`FRED HTTP ${response.status} / 대체 데이터 HTTP ${mirrorResponse.status}`);}if(item.source==='treasury'&&!response.ok)throw new Error(`HTTP ${response.status}`);if(item.source==='fred'&&!response.ok)throw new Error(`HTTP ${response.status}`);if(item.id==='wti'&&!response.ok){const retryTarget=`https://query1.finance.yahoo.com/v8/finance/chart/CL=F?range=1y&interval=1d&events=div%2Csplits&includePrePost=true`;response=await fetch(`${PROXY_BASE}/?url=${encodeURIComponent(retryTarget)}`,{cache:'no-store'});}if(!response.ok)throw new Error(`HTTP ${response.status}`);if(item.source==='treasury'){const xml=await response.text();const doc=new DOMParser().parseFromString(xml,'application/xml');const entries=[...doc.getElementsByTagName('entry')];const values=entries.map(entry=>{const dateNode=entry.getElementsByTagName('d:NEW_DATE')[0]||entry.getElementsByTagName('NEW_DATE')[0];const field=item.treasuryField||'BC_2YEAR';const valueNode=[...entry.getElementsByTagName('*')].find(node=>node.localName===field);const date=(dateNode?.textContent||'').slice(0,10);const value=Number(valueNode?.textContent);return {date,value};}).filter(x=>/^\d{4}-\d{2}-\d{2}$/.test(x.date)&&Number.isFinite(x.value)&&x.value>0).sort((a,b)=>a.date.localeCompare(b.date)).map(x=>({time:Math.floor(Date.parse(x.date+'T00:00:00Z')/1000),value:x.value}));if(values.length<2)throw new Error(`${item.name} 데이터 없음`);return {values,currency:'%',exchange:'U.S. Treasury'};}if(item.source==='fred'){const raw=await response.text();let rows=[];if(/<html|<table|<tr/i.test(raw)){const doc=new DOMParser().parseFromString(raw,'text/html');rows=[...doc.querySelectorAll('tr')].map(tr=>[...tr.querySelectorAll('th,td')].map(cell=>(cell.textContent||'').trim()));}else{rows=raw.trim().split(/\r?\n/).map(line=>line.split(','));}const values=rows.map(parts=>{const date=String(parts[0]||'').trim();const value=Number(String(parts[1]||'').trim());return {date,value};}).filter(x=>/^\d{4}-\d{2}-\d{2}$/.test(x.date)&&Number.isFinite(x.value)&&x.value>-100).map(x=>({time:Math.floor(Date.parse(x.date+'T00:00:00Z')/1000),value:x.value}));if(values.length<2)throw new Error(`${item.name} 데이터 형식 오류`);return {values,currency:'%',exchange:'FRED'};}let json=await response.json();let result=json?.chart?.result?.[0];if((!result||(result.timestamp||[]).length<2)&&item.id==='wti'){const retryTarget=`https://query1.finance.yahoo.com/v8/finance/chart/CL=F?range=1y&interval=1d&events=div%2Csplits&includePrePost=true`;const retryResponse=await fetch(`${PROXY_BASE}/?url=${encodeURIComponent(retryTarget)}`,{cache:'no-store'});if(retryResponse.ok){const retryJson=await retryResponse.json();const retryResult=retryJson?.chart?.result?.[0];if(retryResult&&(retryResult.timestamp||[]).length>=2){json=retryJson;result=retryResult;}}}if(!result)throw new Error(json?.chart?.error?.description||'시세 데이터 없음');const timestamps=result.timestamp||[],quotes=result.indicators?.quote?.[0]||{},closes=quotes.close||[];const values=[];for(let i=0;i<timestamps.length;i++){const close=closes[i];if(close!==null&&close!==undefined&&Number.isFinite(Number(close)))values.push({time:timestamps[i],value:Number(close)});}if(values.length<2)throw new Error('차트 데이터 부족');const meta=result.meta||{};const numOrNull=value=>value===null||value===undefined||value===''?null:(Number.isFinite(Number(value))?Number(value):null);
// 확장거래 가격은 Yahoo quote API의 세션별 실시간 필드를 우선 사용하고,
// 누락된 값만 1분봉에서 보완합니다. 일봉의 이전 종가를 현재가로 오인하지 않도록
// 현재 세션 데이터가 없으면 임의로 전일 종가를 대입하지 않습니다.
let sessionQuotes={};
if(item.unit==='stock'){
  try{
    const intradayResponse=await intradayPromise;
    let intraday=null;
    if(intradayResponse?.ok){
      const intradayJson=await intradayResponse.json();
      intraday=intradayJson?.chart?.result?.[0]||null;
    }
    const sessionMeta=intraday?.meta||meta;
    const times=intraday?.timestamp||[];
    const closes1m=intraday?.indicators?.quote?.[0]?.close||[];
    // IANA 거래소 시간대(America/New_York)를 사용하므로 Intl이 미국 서머타임 전환을 자동 반영합니다.
    const timeZone=sessionMeta.exchangeTimezoneName||meta.exchangeTimezoneName||'America/New_York';
    const formatter=new Intl.DateTimeFormat('en-US',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',weekday:'short',hourCycle:'h23'});
    const partsAt=ts=>Object.fromEntries(formatter.formatToParts(new Date(Number(ts)*1000)).map(p=>[p.type,p.value]));
    const nowParts=Object.fromEntries(formatter.formatToParts(new Date()).map(p=>[p.type,p.value]));
    const today=`${nowParts.year}-${nowParts.month}-${nowParts.day}`;
    const dateAt=ts=>Number.isFinite(Number(ts))&&Number(ts)>0?`${partsAt(ts).year}-${partsAt(ts).month}-${partsAt(ts).day}`:null;
    // Yahoo 일봉 timestamp는 UTC 자정일 수 있으므로 일봉 거래일은 UTC 날짜로 읽습니다.
    const dailySessionDate=ts=>Number.isFinite(Number(ts))&&Number(ts)>0?new Date(Number(ts)*1000).toISOString().slice(0,10):null;
    const minute=Number(nowParts.hour)*60+Number(nowParts.minute);
    const isWeekend=nowParts.weekday==='Sat'||nowParts.weekday==='Sun';
    const bars=[];
    for(let i=0;i<times.length;i++){
      const value=Number(closes1m[i]);
      if(!Number.isFinite(value)||value<=0)continue;
      const p=partsAt(times[i]);
      bars.push({date:`${p.year}-${p.month}-${p.day}`,minute:Number(p.hour)*60+Number(p.minute),time:Number(times[i]),value});
    }
    bars.sort((a,b)=>a.time-b.time);
    const dayBars=bars.filter(b=>b.date===today);
    const priorDates=[...new Set(bars.filter(b=>b.date<today).map(b=>b.date))].sort();
    const lastOf=list=>list.length?list[list.length-1].value:null;
    const priorRegularDate=[...priorDates].reverse().find(date=>bars.some(b=>b.date===date&&b.minute>=570&&b.minute<960));
    const priorPreDate=[...priorDates].reverse().find(date=>bars.some(b=>b.date===date&&b.minute>=240&&b.minute<570));
    const priorRegularBars=priorRegularDate?bars.filter(b=>b.date===priorRegularDate&&b.minute>=570&&b.minute<960):[];
    const priorPreBars=priorPreDate?bars.filter(b=>b.date===priorPreDate&&b.minute>=240&&b.minute<570):[];
    const preToday=dayBars.filter(b=>b.minute>=240&&b.minute<570);
    const regularToday=dayBars.filter(b=>b.minute>=570&&b.minute<960);
    const postToday=dayBars.filter(b=>b.minute>=960&&b.minute<1200);
    const quote=item.yahooQuote||{};
    const quoteToday=(priceKey,timeKey)=>dateAt(quote[timeKey])===today?numOrNull(quote[priceKey]):null;
    const metaToday=(priceKey,timeKey)=>dateAt(sessionMeta[timeKey])===today?numOrNull(sessionMeta[priceKey]):dateAt(meta[timeKey])===today?numOrNull(meta[priceKey]):null;
    const positive=value=>Number.isFinite(value)&&value>0?value:null;

    // 전일 정규장 종가: quote의 previousClose를 우선하고, 없으면 직전 정규장 1분봉/일봉 사용.
    const dailyPriorClose=[...values].filter(point=>dailySessionDate(point.time)<today&&positive(point.value)!==null).at(-1)?.value??null;
    // 전일 기준가는 Yahoo previousClose보다 일봉에서 확인한 직전 거래일 정규장 종가를 우선 사용합니다.
    const priorRegularClose=positive(dailyPriorClose)??positive(lastOf(priorRegularBars))??positive(numOrNull(quote.regularMarketPreviousClose));
    const priorPreClose=lastOf(priorPreBars);

    // 프리마켓 quote는 오늘 날짜의 값인지 확인하되, Yahoo가 시간 필드를 생략한 경우
    // 가격 자체가 유효하면 사용합니다. 다른 날짜의 오래된 프리마켓 값은 사용하지 않습니다.
    const quotePreTimestamp=dateAt(quote.preMarketTime);
    const metaPreTimestamp=dateAt(sessionMeta.preMarketTime)??dateAt(meta.preMarketTime);
    const quotePrePrice=positive(numOrNull(quote.preMarketPrice));
    const metaPrePrice=positive(numOrNull(sessionMeta.preMarketPrice))??positive(numOrNull(meta.preMarketPrice));
    // 기준 파일과 동일: Yahoo가 시간 필드를 생략한 경우에도 유효한 확장거래 가격은 사용합니다.
    // 다른 날짜로 확인된 오래된 가격은 제외하고, 값이 없으면 오늘 1분봉으로 보완합니다.
    const currentPre=(quotePrePrice!==null&&(quotePreTimestamp===today||quotePreTimestamp===null)?quotePrePrice:null)??
      (metaPrePrice!==null&&(metaPreTimestamp===today||metaPreTimestamp===null)?metaPrePrice:null)??lastOf(preToday);
    const currentRegular=positive(quoteToday('regularMarketPrice','regularMarketTime'))??positive(metaToday('regularMarketPrice','regularMarketTime'))??lastOf(regularToday);
    // Yahoo Finance Overnight(Blue Ocean ATS) 값을 기존 애프터마켓 칸에 표시합니다.
    // overnightPrice=true 요청으로 받은 overnightMarket* 필드를 우선 사용합니다.
    // Yahoo가 PREPRE 상태에서 postMarket*에 Overnight 값을 제공하는 경우에만 보조 사용합니다.
    const yahooMarketState=String(quote.marketState||'').toUpperCase();
    // Yahoo Finance now reports the Blue Ocean overnight session as OVERNIGHT.
    // PREPRE is retained only for older responses.
    const isYahooOvernight=yahooMarketState==='OVERNIGHT'||yahooMarketState==='PREPRE';
    const overnightPrice=positive(numOrNull(quote.overnightMarketPrice)) ??
      (isYahooOvernight?positive(numOrNull(quote.postMarketPrice)):null);
    const overnightDelta=numOrNull(quote.overnightMarketChange) ??
      (isYahooOvernight?numOrNull(quote.postMarketChange):null);
    const overnightPct=numOrNull(quote.overnightMarketChangePercent) ??
      (isYahooOvernight?numOrNull(quote.postMarketChangePercent):null);
    const overnightTimeRaw=quote.overnightMarketTime ?? (isYahooOvernight?quote.postMarketTime:null);
    const overnightEpoch=Number(overnightTimeRaw);
    const hasOvernightEpoch=Number.isFinite(overnightEpoch)&&overnightEpoch>0;
    const nowEpoch=Math.floor(Date.now()/1000);
    const overnightSessionDate=parts=>{
      if(!parts)return null;
      const hour=Number(parts.hour);
      const date=`${parts.year}-${parts.month}-${parts.day}`;
      if(hour>=20)return date;
      if(hour<4){
        const previous=new Date(`${date}T12:00:00Z`);
        previous.setUTCDate(previous.getUTCDate()-1);
        return previous.toISOString().slice(0,10);
      }
      return null;
    };
    const currentOvernightSession=overnightSessionDate(nowParts);
    const overnightParts=hasOvernightEpoch?partsAt(overnightEpoch):null;
    const quoteOvernightSession=overnightSessionDate(overnightParts);
    const overnightTimeText=hasOvernightEpoch
      ?new Intl.DateTimeFormat('en-US',{timeZone,hour:'numeric',minute:'2-digit',second:'2-digit',timeZoneName:'short'}).format(new Date(overnightEpoch*1000))
      :null;
    // marketState=OVERNIGHT is Yahoo's authoritative indication that the current
    // quote belongs to the overnight session. Do not reject a valid quote merely
    // because the chart endpoint reports a different/missing exchange timezone.
    // Keep a freshness guard so an old overnight quote is never shown as live.
    const validOvernight=isYahooOvernight&&overnightPrice!==null&&
      (hasOvernightEpoch
        ?overnightEpoch<=nowEpoch+30&&overnightEpoch>=nowEpoch-12*60*60
        :Boolean(quote.overnightMarketPrice!==undefined));
    const currentOvernightPrice=validOvernight?overnightPrice:null;
    // 프리마켓 종가는 당일 프리마켓 분봉의 마지막 체결가를 우선하고,
    // 분봉이 없으면 오늘 날짜로 확인된 Yahoo preMarketPrice를 사용합니다.
    const preClose=lastOf(preToday)??currentPre;
    const regularClose=lastOf(regularToday)??currentRegular;

    // 프리마켓 04:00~09:30 / 정규장 09:30~16:00 / 애프터마켓 16:00~20:00 (미 동부시간)
    const beforePremarket=isWeekend||minute<240;
    let prePrice;
    if(beforePremarket)prePrice=priorPreClose??priorRegularClose;
    else if(minute<570)prePrice=currentPre??lastOf(preToday)??priorPreClose??priorRegularClose;
    else prePrice=preClose??currentPre??priorPreClose??priorRegularClose;

    // Yahoo 일봉 timestamp는 UTC 자정으로 제공될 수 있습니다.
    // 이를 뉴욕 시간으로 변환하면 날짜가 전날로 밀리므로 일봉 날짜는 UTC 기준으로 판정합니다.
    const dailyCloseByDate=new Map();
    for(const point of values){
      const date=dailySessionDate(point.time);
      if(date)dailyCloseByDate.set(date,point.value);
    }

    // 정규장 가격은 당일 정규장 1분봉 → Yahoo 실시간 정규장 quote →
    // 해당 미국 거래일의 일봉 순으로 선택합니다. 단순히 일봉 배열의 마지막 값을
    // 무조건 쓰지 않아, 일봉 갱신 지연 시 전일 종가가 현재 정규장 값으로 오인되는 것을 방지합니다.
    // 오늘 미국 거래일의 정규장 가격만 사용합니다.
    // 오늘 1분봉/실시간 quote/오늘 날짜 일봉이 모두 없으면 null로 둡니다.
    // 이전 거래일 일봉(values 마지막 값)을 오늘 종가로 대체하지 않습니다.
    // 정규장 현재가: 장중에는 Yahoo 실시간 regularMarketPrice를 우선,
    // 이후 당일 정규장 1분봉 마지막 체결가, 당일 일봉 종가 순으로 사용합니다.
    // 정규장 종료 후에도 정규장 값은 애프터마켓 가격과 절대 혼합하지 않습니다.
    const regularPrice=
      positive(currentRegular)??
      positive(regularClose)??
      positive(dailyCloseByDate.get(today))??
      null;
    const regularReferenceClose=
      positive(dailyPriorClose)??
      positive(lastOf(priorRegularBars))??
      positive(numOrNull(quote.regularMarketPreviousClose));

    // Yahoo Overnight는 기존 애프터마켓 칸에 표시합니다.
    // Yahoo가 현재 야간 세션의 timestamp와 가격을 함께 제공할 때만 표시하며,
    // 기존 16:00~20:00 애프터마켓 가격이나 오래된 야간 가격으로 대체하지 않습니다.
    const change=(price,base)=>positive(price)!==null&&positive(base)!==null?price-base:null;
    const pct=(delta,base)=>delta!==null&&positive(base)!==null?delta/base*100:null;
    const preReferenceClose=
      positive(dailyPriorClose)??
      positive(numOrNull(quote.regularMarketPreviousClose))??
      positive(lastOf(priorRegularBars));
    const preDelta=change(prePrice,preReferenceClose);
    const regularDelta=change(regularPrice,regularReferenceClose);
    const regularPct=pct(regularDelta,regularReferenceClose);
    const currentOvernightChange=validOvernight&&Number.isFinite(overnightDelta)
      ?overnightDelta
      :(validOvernight&&positive(regularReferenceClose)!==null?currentOvernightPrice-regularReferenceClose:null);
    const currentOvernightPct=validOvernight&&Number.isFinite(overnightPct)
      ?overnightPct
      :(currentOvernightChange!==null&&positive(regularReferenceClose)!==null?currentOvernightChange/regularReferenceClose*100:null);
    const postPrice=currentOvernightPrice;
    const postDelta=postPrice===null?null:currentOvernightChange;
    const postPct=postPrice===null?null:currentOvernightPct;
    // 애프터마켓 표시용은 Overnight 옵션이 없는 별도 Yahoo quote에서 postMarket*를 읽습니다.
    // 기존 대표 현재가/정규장 값과 오버나이트 값은 이 조회로 덮어쓰지 않습니다.
    let displayAfterHoursPrice=null,displayAfterHoursChange=null,displayAfterHoursPct=null;
    try{
      const ahQuote=await afterHoursQuotePromise;
      const ahPrice=positive(numOrNull(ahQuote?.postMarketPrice));
      const ahChange=numOrNull(ahQuote?.postMarketChange);
      const ahPct=numOrNull(ahQuote?.postMarketChangePercent);
      const ahEpoch=Number(ahQuote?.postMarketTime);
      const ahParts=Number.isFinite(ahEpoch)&&ahEpoch>0?partsAt(ahEpoch):null;
      const ahDate=ahParts?`${ahParts.year}-${ahParts.month}-${ahParts.day}`:null;
      const ahMinute=ahParts?Number(ahParts.hour)*60+Number(ahParts.minute):null;
      const ahValid=ahPrice!==null&&ahParts&&ahDate===today&&ahMinute>=960&&ahMinute<1200&&ahEpoch<=nowEpoch+30&&ahEpoch>=nowEpoch-8*60*60;
      if(ahValid){displayAfterHoursPrice=ahPrice;displayAfterHoursChange=Number.isFinite(ahChange)?ahChange:change(ahPrice,regularReferenceClose);displayAfterHoursPct=Number.isFinite(ahPct)?ahPct:pct(displayAfterHoursChange,regularReferenceClose);}
    }catch(ahError){console.warn(`${item.ticker} Yahoo After-hours quote 조회 실패`,ahError);}
    sessionQuotes={
      preMarketPrice:prePrice,preMarketChange:preDelta,preMarketChangePercent:pct(preDelta,preReferenceClose),
      regularMarketPrice:regularPrice,regularMarketChange:regularDelta,regularMarketChangePercent:regularPct,
      displayAfterHoursPrice,displayAfterHoursChange,displayAfterHoursPercent:displayAfterHoursPct,
      postMarketPrice:postPrice,postMarketChange:postDelta,postMarketChangePercent:postPct,
      postMarketTime:validOvernight?overnightTimeText:null
    };
  }catch(sessionError){console.warn(`${item.ticker} 확장거래 시세 조회 실패`,sessionError);}
}
const hasSessionQuotes=Object.prototype.hasOwnProperty.call(sessionQuotes,'preMarketPrice');return {values,currency:meta.currency||'',exchange:meta.exchangeName||'',regularMarketPrice:hasSessionQuotes?sessionQuotes.regularMarketPrice:numOrNull(meta.regularMarketPrice),regularMarketChange:hasSessionQuotes?sessionQuotes.regularMarketChange:numOrNull(meta.regularMarketChange),regularMarketChangePercent:hasSessionQuotes?sessionQuotes.regularMarketChangePercent:numOrNull(meta.regularMarketChangePercent),preMarketPrice:hasSessionQuotes?sessionQuotes.preMarketPrice:numOrNull(meta.preMarketPrice),preMarketChange:hasSessionQuotes?sessionQuotes.preMarketChange:numOrNull(meta.preMarketChange),preMarketChangePercent:hasSessionQuotes?sessionQuotes.preMarketChangePercent:numOrNull(meta.preMarketChangePercent),postMarketPrice:hasSessionQuotes?sessionQuotes.postMarketPrice:numOrNull(meta.postMarketPrice),postMarketChange:hasSessionQuotes?sessionQuotes.postMarketChange:numOrNull(meta.postMarketChange),postMarketChangePercent:hasSessionQuotes?sessionQuotes.postMarketChangePercent:numOrNull(meta.postMarketChangePercent),postMarketTime:hasSessionQuotes?sessionQuotes.postMarketTime:null,displayAfterHoursPrice:hasSessionQuotes?sessionQuotes.displayAfterHoursPrice:null,displayAfterHoursChange:hasSessionQuotes?sessionQuotes.displayAfterHoursChange:null,displayAfterHoursPercent:hasSessionQuotes.displayAfterHoursPercent};}
function dateString(ts){return new Date(ts*1000).toLocaleDateString('ko-KR',{year:'numeric',month:'2-digit',day:'2-digit',timeZone:'UTC'});}
// 종목명 아래 대표 현재가는 정규장 시간에만 당일 장중 시세를 사용하고, 그 외에는 최신 일봉 종가를 표시합니다.
function headlineStockQuote(item,series){
  // 종목명 아래 대표 시세는 정규장 영역과 같은 정규장 가격/등락/등락률을 사용합니다.
  // 장중에만 표시를 바꾸거나 일봉 차트 마지막 값으로 대체해 확장거래 가격이 섞이지 않게 합니다.
  const regularPrice=Number.isFinite(series?.regularMarketPrice)&&series.regularMarketPrice>0?series.regularMarketPrice:null;
  const regularDelta=Number.isFinite(series?.regularMarketChange)?series.regularMarketChange:null;
  const regularPct=Number.isFinite(series?.regularMarketChangePercent)?series.regularMarketChangePercent:null;
  if(regularPrice!==null)return {price:regularPrice,delta:regularDelta,pct:regularPct,label:'정규장 기준'};
  return {price:item.last,delta:item.delta,pct:item.pct,label:'최근 정규장 종가'};
}
function renderOne(item,series){if(series.inactive){item.inactive=true;item.last=null;item.delta=null;item.pct=null;item.prev=null;item.preMarketPrice=item.preMarketDelta=item.preMarketPct=null;item.regularMarketPrice=item.regularMarketDelta=item.regularMarketPct=null;item.afterMarketPrice=item.afterMarketDelta=item.afterMarketPct=item.afterMarketTime=null;dataById.set(item.id,series);if(item.card){const card=item.card,container=$(`chart-${item.id}`);card.querySelector('.quote-close').textContent=blank;card.querySelector('.quote-change').textContent=series.status||'거래 종료';card.querySelector('.quote-change').className='quote-change neutral';card.querySelector('.quote-date').textContent=`${series.date||''} ${series.reason||''}`.trim();container.innerHTML=`<div class=\'chart-empty\'>${series.status||'거래 종료'} · 신규 시세 없음</div>`;card.querySelector('.chart-note').textContent='거래 종료 종목 · 마지막 거래 가격은 참고용';card.querySelector('.bar-count').textContent='실시간 거래량 순위 및 세션 시세 제외';}return;}if(series.nightFutures){item.last=series.current;item.delta=series.delta;item.pct=series.pct;item.prev=series.reference;dataById.set(item.id,series);if(!item.card)return;const card=item.card,container=$(`chart-${item.id}`);const close=card.querySelector('.quote-close'),change=card.querySelector('.quote-change'),date=card.querySelector('.quote-date');close.textContent=closeText(item,series.current);change.textContent=`${series.delta>0?'+':''}${fmt(series.delta,item.decimals??2)} · ${series.pct>0?'+':''}${series.pct.toFixed(2)}%`;change.className=`quote-change ${colorClass(series.delta)}`;date.textContent='KRED 공개 시세 · 조회 시점';item.last=series.current;item.delta=series.delta;item.pct=series.pct;item.prev=series.reference;dataById.set(item.id,series);container.innerHTML='';if(!window.LightweightCharts){container.innerHTML='<div class=\'chart-empty\'>차트 라이브러리를 불러오지 못했습니다.</div>';return;}const chart=LightweightCharts.createChart(container,{width:container.clientWidth,height:container.clientHeight,layout:{background:{type:'solid',color:chartTheme().bg},textColor:chartTheme().text,fontFamily:'-apple-system,BlinkMacSystemFont,sans-serif',fontSize:10},grid:{vertLines:{color:chartTheme().grid},horzLines:{color:chartTheme().grid}},rightPriceScale:{borderColor:chartTheme().border,scaleMargins:{top:.12,bottom:.1}},timeScale:{borderColor:chartTheme().border,timeVisible:true,secondsVisible:false,rightOffset:1,barSpacing:12,minBarSpacing:2},localization:{locale:'ko-KR',priceFormatter:p=>fmt(p,item.decimals??2)}});const line=chart.addLineSeries({color:series.delta>=0?'#d84a4a':'#3478d4',lineWidth:2,priceLineVisible:false,lastValueVisible:true});line.setData(series.values);chart.timeScale().fitContent();charts.set(item.id,{chart,line});const toolbar=card.querySelector('.chart-range-toolbar');if(toolbar)toolbar.style.display='none';card.querySelector('.chart-note').textContent='야간 세션 18:00~06:00 · 기준가와 최신가만 표시 (분봉 이력 API 미확인)';card.querySelector('.bar-count').textContent='야간 세션 전체 시간축 · 실제 분봉 이력 미제공';return;}if(series.tradingView){const card=item.card,container=$(`chart-${item.id}`);container.innerHTML='';const isKospi=item.id==='kospi200night';const title=isKospi?'코스피200 야간선물':'코스닥150 야간선물';const url=isKospi?'https://kred.dev/ko/kospi-200-night-futures':'https://kred.dev/ko/kosdaq-150-night-futures';card.querySelector('.quote-close').textContent='KRED 실시간 차트';card.querySelector('.quote-change').textContent='실시간 가격·등락은 아래 차트에서 확인';card.querySelector('.quote-change').className='quote-change neutral';card.querySelector('.quote-date').textContent='KRED 데이터';const frame=document.createElement('iframe');frame.className='kred-frame';frame.title=title+' 실시간 시세 및 차트';frame.loading='eager';frame.referrerPolicy='strict-origin-when-cross-origin';frame.allow='fullscreen';frame.src=url;container.appendChild(frame);card.querySelector('.chart-note').textContent='KRED 원본 페이지 · 실제 야간선물 시세와 분봉 차트';card.querySelector('.bar-count').textContent='KRED 페이지에서 1분 · 5분 · 10분 · 15분 · 30분 선택';const toolbar=card.querySelector('.chart-range-toolbar');if(toolbar)toolbar.style.display='none';return;}const toolbar=item.card.querySelector('.chart-range-toolbar');if(toolbar){toolbar.style.display='flex';toolbar.querySelectorAll('button').forEach(btn=>{btn.onclick=()=>{toolbar.querySelectorAll('button').forEach(b=>b.classList.toggle('selected',b===btn));const chartObj=charts.get(item.id)?.chart;if(!chartObj)return;const now=Math.floor(Date.now()/1000),days={'1M':31,'3M':92,'6M':184,'YTD':Math.ceil((Date.now()-new Date(new Date().getFullYear(),0,1).getTime())/86400000),'1Y':366,'ALL':730}[btn.dataset.range]||92;const to=series.values[series.values.length-1].time;let from;if(btn.dataset.range==='ALL'){from=series.values[0].time;}else if(btn.dataset.range==='YTD'){from=Math.max(series.values[0].time,Math.floor(new Date(new Date().getFullYear(),0,1).getTime()/1000));}else{from=Math.max(series.values[0].time,to-days*86400);}const visibleCount=series.values.filter(v=>v.time>=from&&v.time<=to).length;const plotWidth=Math.max(120,(chartObj.options().width||chartObj.chartElement?.clientWidth||item.card.querySelector('.chart-area').clientWidth)-58);chartObj.applyOptions({timeScale:{minBarSpacing:.25,barSpacing:Math.max(.25,Math.min(7,plotWidth/Math.max(1,visibleCount))),rightOffset:0}});chartObj.timeScale().setVisibleRange({from,to});};});}dataById.set(item.id,series);const vals=series.values,last=vals[vals.length-1],prev=vals[vals.length-2],delta=last.value-prev.value,pct=prev.value?delta/prev.value*100:null;item.last=last.value;item.delta=delta;item.pct=pct;item.prev=prev.value;if(item.unit==='stock'){item.preMarketPrice=series.preMarketPrice;item.preMarketDelta=series.preMarketChange;item.preMarketPct=series.preMarketChangePercent;item.regularMarketPrice=series.displayAfterHoursPrice;item.regularMarketDelta=series.displayAfterHoursChange;item.regularMarketPct=series.displayAfterHoursPercent;item.afterMarketPrice=series.postMarketPrice;item.afterMarketDelta=series.postMarketChange;item.afterMarketPct=series.postMarketChangePercent;item.afterMarketTime=series.postMarketTime||null;}const card=item.card;const close=card.querySelector('.quote-close'),change=card.querySelector('.quote-change'),date=card.querySelector('.quote-date');const headline=item.unit==='stock'?headlineStockQuote(item,series):{price:last.value,delta,pct,label:`${dateString(last.time)} 종가`};close.textContent=closeText(item,headline.price);change.textContent=`${changeText(item,headline.delta)} · ${pctText(headline.pct)}`;change.className=`quote-change ${colorClass(headline.delta)}`;date.textContent=item.unit==='stock'?headline.label:`${dateString(last.time)} 종가`;const container=$(`chart-${item.id}`);if(deferChartUntilVisible(item,series,container))return;container.innerHTML='';if(!window.LightweightCharts){container.innerHTML='<div class="chart-empty">차트 라이브러리를 불러오지 못했습니다.</div>';return;}const chart=LightweightCharts.createChart(container,{width:container.clientWidth,height:container.clientHeight,layout:{background:{type:'solid',color:chartTheme().bg},textColor:chartTheme().text,fontFamily:'-apple-system,BlinkMacSystemFont,sans-serif',fontSize:10},grid:{vertLines:{color:chartTheme().grid},horzLines:{color:chartTheme().grid}},rightPriceScale:{borderColor:chartTheme().border,scaleMargins:{top:.12,bottom:.1}},timeScale:{borderColor:chartTheme().border,timeVisible:false,secondsVisible:false,rightOffset:1,barSpacing:7,minBarSpacing:.25},crosshair:{vertLine:{color:'#a9b9cc',width:1,style:2},horzLine:{color:'#a9b9cc',width:1,style:2}},localization:{locale:'ko-KR',priceFormatter:p=>item.percentChart?`${p>0?'+':''}${p.toFixed(1)}%`:fmt(p,item.decimals??2)}});let points=vals;if(item.percentChart){const base=vals[0].value;points=vals.map(v=>({time:v.time,value:(v.value/base-1)*100}));}const seriesLine=chart.addLineSeries({color:last.value>=prev.value?'#d83b4b':'#2874d0',lineWidth:2,priceLineVisible:false,lastValueVisible:true,crosshairMarkerVisible:true,priceFormat:item.percentChart?{type:'custom',formatter:p=>`${p>0?'+':''}${p.toFixed(1)}%`,minMove:.1}:{type:'price',precision:item.decimals??2,minMove:item.unit==='yield'?.001:.01}});seriesLine.setData(points);chart.timeScale().fitContent();charts.set(item.id,{chart,container,series:seriesLine});const initialFrom=Math.max(vals[0].time,Math.floor(Date.now()/1000)-92*86400);try{chart.timeScale().setVisibleRange({from:initialFrom,to:last.time});}catch(e){}const foot=card.querySelector('.bar-count');foot.textContent=`${vals.length}봉 · ${dateString(vals[0].time)} ~ ${dateString(last.time)}`;}
async function refreshMarketCaps(){
  const symbols=[...new Set([...M7_TICKERS,'SKHY','EWY',...AI_LEADERS.map(x=>x.ticker),...HYPERSCALERS.map(x=>x.ticker),...SEMICONDUCTOR_UNIVERSE.map(x=>x.ticker)])];
  const target=`https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols.join(','))}&overnightPrice=true`;
  try{
    const response=await fetchProxy(target,12000);
    if(!response.ok)throw new Error(`Yahoo quote HTTP ${response.status}`);
    const json=await response.json();const quotes=json?.quoteResponse?.result||[];let updated=0;
    const byTicker=new Map(quotes.map(q=>[q.symbol,q]));
    quotes.forEach(quote=>{const matches=all.filter(x=>x.ticker===quote.symbol);matches.forEach(item=>{item.yahooQuote=quote;const cap=Number(quote.marketCap);if(Number.isFinite(cap)&&cap>0){item.marketCap=cap;updated++;}});});
    const previousSelection=SEMICONDUCTOR_UNIVERSE.filter(x=>x.summaryActive).map(x=>x.id).join(',');
    const ranked=[...SEMICONDUCTOR_UNIVERSE].sort((a,b)=>{
      const av=Number.isFinite(a.marketCap)&&a.marketCap>0?a.marketCap:null,bv=Number.isFinite(b.marketCap)&&b.marketCap>0?b.marketCap:null;
      if(av===null&&bv===null)return SEMICONDUCTOR_UNIVERSE.indexOf(a)-SEMICONDUCTOR_UNIVERSE.indexOf(b);
      if(av===null)return 1;if(bv===null)return -1;return bv-av;
    });
    const selected=new Set(ranked.slice(0,16).map(x=>x.id));
    SEMICONDUCTOR_UNIVERSE.forEach(item=>{item.summaryActive=selected.has(item.id);});
    const nextSelection=SEMICONDUCTOR_UNIVERSE.filter(x=>x.summaryActive).map(x=>x.id).join(',');
    makeSummary();
    if(previousSelection!==nextSelection||!groups[0].items.some(item=>item.semiconductorCandidate&&item.card)){
      charts.forEach(entry=>{try{entry.chart?.remove?.();}catch(e){}});charts.clear();makeCharts();
    }
    updateSummary();return updated;
  }catch(error){
    console.warn('시가총액 조회 실패:',error);
    // 첫 조회 실패 시에도 카드 영역은 비우지 않고 기존 우선순위의 16개를 표시합니다.
    const previousSelection=SEMICONDUCTOR_UNIVERSE.filter(x=>x.summaryActive).map(x=>x.id).join(',');
    if(!SEMICONDUCTOR_UNIVERSE.some(x=>x.summaryActive))SEMICONDUCTOR_UNIVERSE.slice(0,16).forEach(x=>x.summaryActive=true);
    const nextSelection=SEMICONDUCTOR_UNIVERSE.filter(x=>x.summaryActive).map(x=>x.id).join(',');
    makeSummary();
    if(previousSelection!==nextSelection||!groups[0].items.some(item=>item.semiconductorCandidate&&item.card)){
      charts.forEach(entry=>{try{entry.chart?.remove?.();}catch(e){}});charts.clear();makeCharts();
    }
    updateSummary();return 0;
  }
}
function updateSummary(){
  document.querySelectorAll('[data-summary-id]').forEach(cell=>{
    const item=all.find(x=>x.id===cell.dataset.summaryId);
    const price=cell.querySelector('.summary-price'),change=cell.querySelector('.summary-change');
    const colorIndex=!!item;
    if(item?.last==null){
      price.textContent=(item?.source==='nightFuturesEmbed'||item?.source==='tradingviewEmbed')?'차트 참조':blank;
      price.className=`summary-price${colorIndex?' neutral':''}`;
      change.textContent=item?.inactive?'거래 종료':(item?.source==='nightFuturesEmbed'||item?.source==='tradingviewEmbed')?'차트에서 시세 확인':'데이터 확인 필요';
      change.className='summary-change neutral';
      return;
    }
    const liveSeries=dataById.get(item.id),headline=item.unit==='stock'?headlineStockQuote(item,liveSeries):{price:item.last,delta:item.delta,pct:item.pct};
    price.textContent=closeText(item,headline.price);
    price.className=`summary-price${colorIndex?' '+colorClass(headline.delta):''}`;
    change.textContent=`${changeText(item,headline.delta)} · ${pctText(headline.pct)}`;
    change.className=`summary-change ${colorClass(headline.delta)}`;
    if(item.unit==='stock'){
      const sessions=[['pre',item.preMarketPrice,item.preMarketDelta,item.preMarketPct],['regular',item.regularMarketPrice,item.regularMarketDelta,item.regularMarketPct],['post',item.afterMarketPrice,item.afterMarketDelta,item.afterMarketPct]];
      sessions.forEach(([key,p,d,pct])=>{
        const pEl=cell.querySelector(`.summary-${key}-price`),dEl=cell.querySelector(`.summary-${key}-delta`),pctEl=cell.querySelector(`.summary-${key}-pct`);
        if(!pEl||!dEl||!pctEl)return;
        const valid=Number.isFinite(p)&&p>0;
        pEl.textContent=valid?closeText(item,p):blank;
        pEl.className=`summary-session-value summary-${key}-price ${valid?colorClass(d):'neutral'}`;
        dEl.textContent=valid&&Number.isFinite(d)?changeText(item,d):blank;
        dEl.className=`summary-session-delta summary-${key}-delta ${valid?colorClass(d):'neutral'}`;
        pctEl.textContent=valid&&Number.isFinite(pct)?pctText(pct):blank;
        pctEl.className=`summary-session-pct summary-${key}-pct ${valid?colorClass(d):'neutral'}`;
      });
      const postTimeEl=cell.querySelector('.summary-post-time');
      if(postTimeEl)postTimeEl.textContent=item.afterMarketTime||'';
    }
  });
  document.querySelectorAll('.expected-move-cell').forEach(cell=>{
    const valueEl=cell.querySelector('.expected-move-value');
    const prefix=valueEl?.dataset.emPrefix;
    const days=Number(valueEl?.dataset.emDays);
    const spotId=prefix==='spx'?'sp500':'ndx-index';
    const spot=all.find(x=>x.id===spotId)?.last;
    const vol=prefix==='spx'?all.find(x=>x.id==='vix')?.last:all.find(x=>x.id==='vxn')?.last;
    const move=Number.isFinite(spot)&&spot>0&&Number.isFinite(vol)&&vol>0?spot*(vol/100)*Math.sqrt(days/365):null;
    const upper=move===null?null:spot+move,lower=move===null?null:spot-move;
    valueEl.textContent=move===null?blank:`±${fmt(move,1)} pt`;
    const upperEl=cell.querySelector('[data-em-side="upper"]');
    const lowerEl=cell.querySelector('[data-em-side="lower"]');
    if(upperEl)upperEl.textContent=upper===null?blank:fmt(upper,1);
    if(lowerEl)lowerEl.textContent=lower===null?blank:fmt(lower,1);
  });
}
async function refreshAll(){
  const button=$('refresh');
  button.disabled=true;
  $('status').textContent='핵심 지수·야간선물 우선 조회 중…';
  $('updated').textContent='업데이트 중';
  $('status').classList.remove('error-note');
  $('status').parentElement.querySelector('.live-dot').classList.remove('active');
  let success=0,fail=0;

  // 시가총액 갱신과 야간선물 조회를 병렬로 시작합니다.
  // 이전에는 시가총액 조회가 끝난 뒤, 긴 종목 목록을 6개씩 순서대로 처리해
  // 국내 야간선물이 큐의 맨 마지막에서야 조회되는 문제가 있었습니다.
  const marketCapsTask=refreshMarketCaps();
  const priorityItems=groups.flatMap(group=>group.items)
    .filter(item=>item.source==='kredNightFutures');
  // EWY는 국내/미국 지수 로딩 대기열 뒤에 밀리지 않도록 별도 우선 요청으로 즉시 시작합니다.
  const ewyItem=all.find(item=>item.id==='ewy');
  const ewyTask=ewyItem?loadItem(ewyItem):Promise.resolve();

  async function loadItem(item){
    try{
      // Stock session fields (including Yahoo Overnight) are attached by the quote refresh.
      // Wait for that request before fetching/rendering stock session values to avoid a race.
      if(item.unit==='stock')await marketCapsTask;
      const series=await fetchSeries(item);
      renderOne(item,series);
      success++;
    }catch(error){
      fail++;
      const container=$(`chart-${item.id}`);
      if(container)container.innerHTML=`<div class="chart-empty"><span>${item.name} 데이터를 불러오지 못했습니다.<br><small>${String(error.message||error).slice(0,90)}</small></span></div>`;
      if(item.card){
        item.card.querySelector('.quote-close').textContent=blank;
        item.card.querySelector('.quote-change').textContent=item.source==='kredNightFutures'?'시세 연결 실패':'데이터 확인 필요';
        item.card.querySelector('.quote-change').className='quote-change neutral';
        item.card.querySelector('.quote-date').textContent=item.source==='kredNightFutures'?'KRED 응답 확인 필요':'시세 제공처 확인 필요';
      }
    }
    updateSummary();
  }

  // 야간선물은 나머지 수십 개 데이터보다 먼저 조회합니다.
  // NDX 현물도 VXN Expected Move 계산을 위해 동시에 가져옵니다.
  const ndxTask=(async()=>{
    try{
      const series=await fetchSeries(hiddenNdx);
      hiddenNdx.last=series.values[series.values.length-1]?.value??null;
      if(!Number.isFinite(hiddenNdx.last)||hiddenNdx.last<=0)throw new Error('NDX 현물 지수 데이터 없음');
    }catch(error){
      hiddenNdx.last=null;
      fail++;
      console.warn('NDX 현물 지수 조회 실패',error);
    }
    updateSummary();
  })();
  await Promise.all([marketCapsTask,Promise.all(priorityItems.map(loadItem)),ndxTask]);

  $('status').textContent='핵심 지수 조회 완료 · 나머지 차트 불러오는 중…';
  const priorityIds=new Set([...priorityItems.map(item=>item.id),'ewy']);
  const queue=all.filter(item=>
    !item.hidden &&
    !priorityIds.has(item.id) &&
    (!item.semiconductorCandidate||item.summaryActive) &&
    (!item.activityType||ACTIVITY_TYPES[item.activityType]?.expanded) &&
    (!item.id.startsWith('hyperscaler-')||hyperscalerExpanded)
  );
  let cursor=0;
  async function worker(){
    while(cursor<queue.length){
      const item=queue[cursor++];
      await loadItem(item);
    }
  }
  await Promise.all(Array.from({length:8},()=>worker()));
  // EWY가 늦더라도 다른 차트 로딩을 막지 않으며, 전체 상태 집계 전에 완료를 확인합니다.
  await ewyTask;

  updateSummary();
  $('updated').textContent=`${new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'})} 갱신`;
  $('status').textContent=fail?`정상 ${success}개 · 확인 필요 ${fail}개`:`${success}개 시세 연결 완료`;
  $('status').parentElement.querySelector('.live-dot').classList.toggle('active',success>0);
  if(fail)$('status').classList.add('error-note');
  button.disabled=false;
  resizeCharts();
}
function resizeCharts(){for(const {chart,container} of charts.values()){if(container.clientWidth>0)chart.applyOptions({width:container.clientWidth,height:container.clientHeight});}}
$('theme').addEventListener('click',()=>applyTheme(!document.body.classList.contains('dark'),true));makeSummary();makeCharts();$('refresh').addEventListener('click',refreshAll);window.addEventListener('resize',()=>{clearTimeout(window.__chartResizeTimer);window.__chartResizeTimer=setTimeout(resizeCharts,120);});refreshAll();
