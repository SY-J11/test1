const WORKER='https://st.mcraft-tiger-574.workers.dev';
const DESKTOP='https://stock.naver.com';
const $=id=>document.getElementById(id);
const kinds={
 priceTop:{title:'거래대금 상위 {n}',desc:'당일 누적 거래대금 순',metric:'거래대금',order:'priceTop'},
 quantTop:{title:'거래량 상위 {n}',desc:'당일 누적 거래량 순',metric:'거래량',order:'quantTop'},
 marketSum:{title:'시가총액 상위 {n}',desc:'시가총액 순',metric:'시가총액',order:'marketSum'},
 popular:{title:'인기 종목 {n}',desc:'네이버 증권 인기 종목 순',metric:'인기 지수',order:'popular'},
 up:{title:'상승 상위 {n}',desc:'당일 등락률 높은 순',metric:'등락률',order:'up'},
 flat:{title:'보합 종목',desc:'전일 종가와 같은 종목 · 거래대금 순',metric:'거래대금',derived:true},
 down:{title:'하락 상위 {n}',desc:'당일 등락률 낮은 순',metric:'등락률',order:'down'},
 volSurge:{title:'거래량 급증 {n}',desc:'전일 대비 거래량 증가율 높은 순 · 네이버 목록',metric:'거래량 증감',order:'upperQuantTop'},
 volDrop:{title:'거래량 급감 {n}',desc:'전일 대비 거래량 감소율 큰 순 · 네이버 목록',metric:'거래량 증감',order:'lowerQuantTop'},
 high52:{title:'52주 최고 종목',desc:'당일 고가가 52주 최고가 이상인 종목 · 거래대금 순',metric:'52주 최고',order:'high52week'},
 low52:{title:'52주 최저 종목',desc:'당일 저가가 52주 최저가 이하인 종목 · 거래대금 순',metric:'52주 최저',order:'low52week'}
};
let active='priceTop',market='ALL',cache={},N=20;
const STRICT={flat:1,high52:1,low52:1};
const ttl=k=>kinds[k].title.replace('{n}',N);
// 종목코드 우선 분류. 회사명 키워드 추정보다 정확한 코드 매핑을 먼저 적용합니다.
const sectorMap={
 // 반도체·전자부품
 '000660':['반도체','DRAM·NAND·HBM'],'005930':['반도체·전자','메모리·파운드리·스마트폰'],'005935':['반도체·전자','삼성전자 우선주'],
 '042700':['반도체 장비','HBM·패키징 장비'],'092870':['반도체 장비','메모리·SSD 테스트'],'080220':['반도체','저전력 메모리·팹리스'],
 '353200':['전자부품','PCB·패키지 기판'],'008060':['지주·전자','전자소재·계열사 투자'],'222800':['전자부품','PCB·기판'],'009150':['전자부품','MLCC·FC-BGA·카메라모듈'],
 '000990':['반도체','웨이퍼·반도체 소재'],'036930':['반도체 장비','검사·측정 장비'],'039030':['반도체 장비','검사·계측 장비'],
 '058470':['반도체 장비','후공정·패키징 장비'],'240810':['반도체 장비','후공정 테스트 장비'],'036810':['반도체 장비','프로브카드·검사부품'],
 '089030':['반도체 장비','검사장비·부품'],'095340':['반도체 장비','테스트 핸들러'], '005290':['반도체 소재','특수가스·소재'],'036540':['반도체 소재','반도체·디스플레이 소재'],'078600':['반도체 장비','반도체 공정장비'],
 '067310':['전자부품','PCB·전자회로'], // 2차전지·소재·화학
 '006400':['2차전지','배터리 셀·에너지저장장치'],'373220':['2차전지','전기차 배터리'],'051910':['화학·2차전지','석유화학·양극재'],'003670':['2차전지 소재','양극재'],'005490':['철강·소재','철강·리튬·2차전지 소재'],
 '247540':['2차전지 소재','양극재'],'086520':['2차전지 소재','양극재·전구체'],'066970':['2차전지 소재','전해액'],
 '010950':['에너지·정유','정유·석유화학'],'096770':['에너지·정유','정유·윤활유'],'267250':['화학','석유화학·합성수지'],
 // 전력·에너지·건설·기계
 '034020':['에너지·발전','발전설비·원전'],'298040':['전력기기','변압기·전력기기'],'267260':['전력기기','전력설비·변압기'],'010120':['전력기기','전력자동화·차단기'],
 '015760':['전력·유틸리티','전력 공급'],'051600':['전력·유틸리티','전력 공급'],'003490':['운송·물류','항공·물류'],'042670':['건설기계','굴착기·건설장비'],
 '241560':['전력기기','전력망·변압기'],'000720':['건설','건축·토목'],'047040':['건설·플랜트','플랜트·인프라'],
 '028050':['건설','건축·토목'],'006360':['건설','주택·건축'],'000210':['기계·산업재','산업기계·건설장비'],'034730':['지주·에너지','지주·에너지·화학'],
 // 자동차·운송
 '005380':['자동차','완성차·모빌리티'],'000270':['자동차','완성차·모빌리티'],'012330':['자동차부품','모듈·전장'],'018880':['자동차부품','자동차 부품'],
 '161390':['자동차부품','자동차 전장·부품'],'086280':['자동차부품','자동차 부품'],
 '003490':['운송·물류','항공·물류'],'020560':['운송·물류','항공·물류'],'028670':['운송·물류','종합물류'],'000120':['운송·물류','종합물류·택배'],
 // 조선·방산·우주
 '042660':['조선','상선·특수선'],'329180':['조선','선박·엔진'],'009300':['비철금속','알루미늄 압연·가공'],'012450':['방산·우주','항공엔진·방산'],'079550':['방산','무기체계·방산전자'],
 '272210':['방산','유도무기·방산'],'047810':['방산·항공','항공기·방산'],'211270':['우주·통신','위성통신'],
 // 바이오·헬스케어
 '207940':['바이오','바이오의약품 위탁생산'],'068270':['바이오','바이오시밀러·의약품'],'196170':['바이오','항체·바이오 플랫폼'],'064550':['바이오','바이오시밀러·의약품'],
 '141080':['바이오','진단·의료기기'],'145020':['바이오','항암 신약'],'000100':['제약','전문의약품'],'128940':['제약','전문의약품'],'009420':['제약','의약품'],'185750':['제약','의약품'],'000250':['바이오','바이오의약품'],'091990':['바이오','세포·유전자 치료제'],
 // 인터넷·게임·콘텐츠·통신·보안
 '035420':['인터넷·플랫폼','검색·커머스·클라우드'],'035720':['인터넷·플랫폼','메신저·콘텐츠·핀테크'],'017670':['통신','무선통신·통신서비스'],'030200':['통신','유무선 통신'],'032640':['통신','통신서비스'],
 '263750':['게임','온라인·모바일 게임'],'036570':['게임','온라인 게임'],'251270':['게임','모바일 게임'],'112040':['게임','모바일 게임'],
 '053800':['사이버보안','정보보안 솔루션'],
 '035900':['엔터테인먼트','음악·아티스트 매니지먼트'],'041510':['엔터테인먼트','음악·콘텐츠'],'352820':['엔터테인먼트','음악·플랫폼'],'122870':['엔터테인먼트','음악·콘텐츠'],
 // 금융·지주·소비재·유통
 '105560':['금융','금융지주·은행'],'055550':['금융','금융지주·은행'],'086790':['금융','금융지주·은행'],'316140':['금융','금융지주·은행'],'024110':['금융','은행'],'005940':['금융','증권'],'016360':['금융','증권'],'032830':['보험','생명보험'],'000810':['보험','손해보험'],'003550':['지주회사','지주·투자'],'028260':['지주회사','지주·건설·상사'],
 '090430':['화장품·뷰티','화장품'],'278470':['화장품·뷰티','화장품'],'214150':['헬스케어·미용기기','미용 의료기기'],'018260':['IT서비스','시스템통합·IT서비스'],'023530':['유통·소비재','대형마트·유통'],'004170':['유통·소비재','백화점·유통'],'139480':['유통·소비재','백화점·유통'],
 '004370':['식품','식품 제조'],'097950':['식품','식품·바이오'],'271560':['식품','식품 제조'],'033780':['식품','식품·음료'],'003230':['식품','식품 제조'],
};
// 회사명 기반 보완 규칙: 코드 사전에 없는 신규·중소형 종목에 적용합니다.
const nameRules=[
 [/반도체|하이닉스|칩|테크윙|테스트|프로브|패키지|PCB|기판|팹리스|웨이퍼|후공정|리노공업|한미반도체|엑시콘|주성엔지니어링|원익|하나마이크론|두산테스나/,'반도체·전자','반도체 제조·장비·부품'],
 [/배터리|에너지솔루션|SDI|퓨처엠|엘앤에프|에코프로|포스코퓨처엠|전해액|양극재|음극재|리튬|폐배터리/,'2차전지·소재','배터리·양극재·전해질·재활용'],
 [/전력|일렉트릭|변압기|전선|케이블|효성중공업|산일전기|제룡전기/,'전력기기·전력망','변압기·전선·배전·전력 자동화'],
 [/원전|두산에너빌리티|한전기술|한전KPS|발전|수력|태양광|풍력|수소|신재생/,'에너지·발전','발전설비·원전·신재생에너지'],
 [/바이오|제약|셀트리온|알테오젠|리가켐|에이비엘|삼천당|유한양행|한미약품|HLB|녹십자|보로노이|신약|진단/,'바이오·제약','의약품·바이오 플랫폼·진단'],
 [/조선|해양|한화오션|HD현대|삼성중공업|케이조선|선박|엔진/,'조선·해양','선박·엔진·해양플랜트'],
 [/방산|한화시스템|현대로템|LIG넥스원|한국항공우주|항공우주|위성|우주/,'방산·우주항공','방산장비·항공기·위성'],
 [/자동차|모비스|기아|현대차|타이어|만도|HL만도|성우하이텍|화신|에스엘/,'자동차·부품','완성차·전장·자동차부품'],
 [/은행|금융지주|증권|보험|카드|캐피탈|저축은행|투자증권/,'금융','은행·증권·보험·금융서비스'],
 [/건설|건설산업|토건|엔지니어링|플랜트|인프라|시멘트|레미콘/,'건설·인프라','건축·토목·플랜트·건자재'],
 [/게임|소프트맥스|펄어비스|크래프톤|엔씨소프트|넷마블|카카오게임즈|위메이드/,'게임','게임 개발·퍼블리싱'],
 [/엔터|스튜디오|미디어|방송|콘텐츠|음악|음반|웹툰|광고/,'콘텐츠·미디어','엔터테인먼트·방송·콘텐츠'],
 [/통신|텔레콤|네트웍스|네트워크|위성통신/,'통신·네트워크','통신서비스·네트워크 장비'],
 [/보안|시큐|안랩|인증|정보보호|사이버/,'사이버보안','정보보안·인증 솔루션'],
 [/화장품|뷰티|미용|에이피알|아모레|코스맥스|한국콜마/,'화장품·뷰티','화장품·미용기기·ODM'],
 [/식품|푸드|제과|제당|음료|라면|사료|유업|빙과/,'식품·음료','식품 제조·가공·유통'],
 [/유통|백화점|마트|홈쇼핑|편의점|면세|리테일/,'유통·소비재','유통·판매·소매'],
 [/항공|대한항공|아시아나|한진칼|물류|택배|해운|운수|항만/,'운송·물류','항공·해운·육상운송·물류'],
 [/철강|금속|동국제강|현대제철|고려아연|풍산|세아/,'철강·금속','철강·비철금속·소재'],
 [/화학|케미칼|석유|정유|가스|에너지/,'화학·에너지','석유화학·정유·가스'],
 [/로봇|자동화|스마트팩토리|공장자동화/,'로봇·자동화','산업용 로봇·공장 자동화'],
 [/지주|홀딩스|홀딩|그룹/,'지주·투자','계열사 지배·투자 및 사업 포트폴리오']
];
const dbg={raw:[],ind:'',src:{}},EXT={};
const LSK={ovr:'sector_override_v1',ind:'sector_naver_v1'};
const ldLS=k=>{try{return JSON.parse(localStorage.getItem(k)||'{}')}catch(e){return {}}};
const svLS=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}};
let ovr=ldLS(LSK.ovr),indC=ldLS(LSK.ind),cur=[];const tried=new Set();let ORD=ldLS('order_map_v1');try{if(!localStorage.getItem('ord_clean_v13')){['volSurge','volDrop','high52','low52'].forEach(k=>delete ORD[k]);localStorage.setItem('order_map_v1',JSON.stringify(ORD));localStorage.setItem('ord_clean_v13','1')}}catch(e){}
[[/소프트|시스템|정보통신|데이터|클라우드|인공지능|솔루션/,'IT·소프트웨어','소프트웨어·IT서비스·AI'],
 [/의료|메디|헬스|덴탈|임플란트/,'의료기기·헬스케어','의료기기·진단·헬스케어'],
 [/디스플레이|OLED|LED|광학|카메라|센서|이노텍|전자/,'전자부품·디스플레이','전자부품·디스플레이·센서'],
 [/여행|호텔|레저|카지노|관광/,'여행·레저','여행·호텔·카지노'],
 [/섬유|의류|패션|화섬|방직|신발/,'패션·섬유','의류·섬유·패션'],
 [/교육|출판|에듀/,'교육·출판','교육·출판'],
 [/기계|중공업|공작|밸브|펌프/,'기계·산업재','산업기계·설비'],
 [/리츠|부동산/,'부동산·리츠','리츠·부동산'],
 [/제지|포장|유리/,'소재·포장','제지·포장·유리']].forEach(r=>nameRules.push(r));
const etfRe=/^(KODEX|TIGER|ACE|RISE|SOL|KBSTAR|ARIRANG|HANARO|PLUS|KOSEF|WON|1Q|TIMEFOLIO|TREX|히어로즈|마이티|SMART|FOCUS|BNK|KIWOOM|ITF)/i;
function etfKind(n){
 if(/레버리지|2X|3X/i.test(n))return '레버리지';if(/인버스|곱버스/.test(n))return '인버스';
 if(/채권|국고채|머니마켓|CD금리|KOFR|단기/.test(n))return '채권·금리';if(/골드|금현물|구리|원유|WTI|은선물|원자재/.test(n))return '원자재';
 if(/배당|커버드콜|월배당|프리미엄/.test(n))return '배당·커버드콜';if(/미국|나스닥|S&P|해외|차이나|중국|일본|인도|베트남|글로벌/i.test(n))return '해외지수·테마';
 if(/반도체|AI|2차전지|배터리|바이오|조선|방산|로봇|전력|원자력|원전|리츠|증권|은행|헬스|게임|K-?컬처/i.test(n))return '국내 섹터·테마';
 if(/200|코스피|코스닥|KRX|지수|트레이딩/.test(n))return '국내 시장지수';return '기타 ETF';
}
const isEtf=x=>/etf|etn/i.test(x.endType||'')||etfRe.test(x.name||'')||/ETN(\(|$)/.test(x.name||'');
function nvNorm(v){return String(v).trim().replace(/^(.+?)[와과](.+)$/,'$1·$2')}
// 우선순위: 직접 지정 > ETF > 종목코드 사전 > 우선주(보통주 따라감) > 네이버 업종 > 이름 규칙 > 미확인
function classify(x){
 const code=String(x.code||'').toUpperCase(),name=String(x.name||''),n=name.replace(/\s+/g,'');
 if(ovr[code]){const v=ovr[code];return Array.isArray(v)?[v[0],v[1]||'직접 지정','ovr']:[v,'직접 지정','ovr']}
 if(isEtf(x))return ['ETF·ETN',etfKind(name),'etf'];
 if(sectorMap[code])return [...sectorMap[code],'map'];
 if(/우[A-C]?(\(전환\))?$/.test(n)&&code.slice(-1)!=='0'){const b=sectorMap[code.slice(0,5)+'0'];if(b)return [b[0],b[1]+' (우선주)','map']}
 if(indC[code])return [nvNorm(indC[code]),'네이버 증권 업종','naver'];
 for(const [re,s,d] of nameRules)if(re.test(n))return [s,d,'rule'];
 return ['업종 미확인','탭하여 직접 지정','unknown'];
}
function findInd(o,d=0){
 if(!o||typeof o!=='object'||d>6)return null;
 for(const [k,v] of Object.entries(o))if(typeof v==='string'&&/industry|upjong|sector/i.test(k)&&/[가-힣]/.test(v))return v;
 for(const v of Object.values(o)){const r=findInd(v,d+1);if(r)return r}return null;
}
function moneyKR(s){let t=0,f=false;for(const m of String(s).replace(/,/g,'').matchAll(/([\d.]+)\s*(조|억|백만|천만|만)?/g)){f=true;t+=parseFloat(m[1])*({'조':1e12,'억':1e8,'백만':1e6,'천만':1e7,'만':1e4}[m[2]]||1)}return f?t:null}
function parseTI(j){const t=(j&&j.totalInfos)||[],f=(cs,ks)=>t.find(i=>cs.includes(i.code)||ks.includes(i.key)),p=f(['lastClosePrice'],['전일']),v=f(['accumulatedTradingValue'],['대금','거래대금']);return {prev:p?num(p.value):null,value:v?moneyKR(v.value):null,at:Date.now()}}
function scan(o,re,pred,d=0){if(!o||typeof o!=='object'||d>3)return null;for(const [k,v] of Object.entries(o))if(re.test(k)){const n=num(v);if(n!==null&&(!pred||pred(n)))return n}for(const v of Object.values(o))if(v&&typeof v==='object'){const r=scan(v,re,pred,d+1);if(r!==null)return r}return null}
async function enrich(list){
 const now=Date.now(),t=list.filter(x=>((x.src==='unknown'||x.src==='rule')&&!indC[x.code]&&!tried.has(x.code))||(x.unsure&&!EXT[x.code])||(x.value==null&&(!EXT[x.code]||now-EXT[x.code].at>120000)));
 if(!t.length)return;let ch=false;
 for(let i=0;i<t.length;i+=6){
  await Promise.all(t.slice(i,i+6).map(async x=>{tried.add(x.code);
   try{const j=await fetchJson(`https://m.stock.naver.com/api/stock/${x.code}/integration`),v=findInd(j);
    if(v&&!indC[x.code]){indC[x.code]=v;svLS(LSK.ind,indC)}else if(!v&&!dbg.ind)dbg.ind=x.name+' keys:'+Object.keys(j||{}).join(',')+' '+JSON.stringify(Object.fromEntries(Object.entries(j||{}).filter(([k])=>k!=='totalInfos'&&k!=='dealTrendInfos'))).slice(0,3500);
    EXT[x.code]=parseTI(j);ch=true}catch(e){EXT[x.code]={prev:null,value:null,at:Date.now()}}}));
 }
 if(ch)render(cache[active]||[]);
}
function num(v){if(v===null||v===undefined||v==='')return null;if(typeof v==='object')v=v.value??v.formattedValue??v.text??v.price??v.amount??v.closePrice;const s=String(v).replace(/,/g,'').replace(/[원주%]/g,'').trim();const n=Number(s);return Number.isFinite(n)?n:null}
function first(o,keys){for(const k of keys){if(o&&o[k]!==undefined&&o[k]!==null&&o[k]!=='')return o[k]}return null}
function fmt(v){if(v===null||v===undefined)return '—';return Math.round(v).toLocaleString('ko-KR')}
function money(v){if(v===null||v===undefined)return '—';if(v>=1e12)return (v/1e12).toFixed(2)+'조';if(v>=1e8)return (v/1e8).toFixed(0)+'억';return fmt(v)}
function pct(v){if(v===null||v===undefined)return '—';return (v>0?'+':'')+v.toFixed(2)+'%'}
function codeOf(v){let s=String(v||'').toUpperCase().replace(/^A(?=\d{6}$)/,'');const m=s.match(/[0-9A-Z]{6}/);return m?m[0]:''}
function getRows(root){
 const codeKeys=['itemCode','itemcode','stockCode','stockcode','code','reutersCode','symbolCode','shortCode','isuCd','ISU_CD','stockItemCode'];
 const nameKeys=['itemName','itemname','stockName','stockname','name','stockNm','korName','isuNm','ISU_NM','koreanName','displayName'];
 const seen=new Set();
 function normalize(o){
  const code=codeOf(first(o,codeKeys)),name=String(first(o,nameKeys)||'').trim();
  if(!code||!name||seen.has(code))return null;seen.add(code);
  if(dbg.raw.length<2)dbg.raw.push(o);
  const K=o.price&&typeof o.price==='object'&&o.price.krx&&typeof o.price.krx==='object'?o.price.krx:null;
  const g=ks=>{const v=K?num(first(K,ks)):null;return v!==null?v:num(first(o,ks))};
  const price=g(['closePrice','currentPrice','nowPrice','tradePrice','priceValue']);const sc=(re,pred)=>{const r=K?scan(K,re,pred):null;return r!==null?r:scan(o,re,pred)};
  const apiRate=g(['prevChangeRate','fluctuationsRatio','changeRate','compareToPreviousCloseRate','changeRateValue'])??sc(/(fluct|chang|compar|prev|diff|rise|updown)\w*(rat|pct|percent)|^(rate|ratio)$/i,n=>Math.abs(n)<=31);
  const vc=g(['previousClosePrice','prevClosePrice','previousPrice','basePrice','yesterdayClosePrice','prevPrice','preClosePrice'])??sc(/^(prev(ious)?|last|yesterday|before)(day)?close(price)?$|^(base|prev(ious)?)price$/i,n=>n>0&&price!==null&&Math.abs(price-n)/n<=0.31),rawDiff=g(['prevChangePrice','compareToPreviousClosePrice','compareToPreviousPrice','changePrice']);
  const dirOf=v=>{const s=v&&typeof v==='object'?String(v.name||'')+' '+String(v.text||''):String(v||'');return /UPPER|RIS|상승|상한/i.test(s)?1:/LOWER|FALL|하락|하한/i.test(s)?-1:/UNCHANG|EVEN|보합/i.test(s)?0:null};
  const udm={'1':1,'2':1,'3':0,'4':-1,'5':-1},ug=udm[String(first(o,['upDownGb'])??'')];
  const dir=ug!==undefined?ug:dirOf((K&&first(K,['compareToPreviousPrice','fluctuationType']))??first(o,['compareToPreviousPrice','compareToPreviousPriceType','fluctuationType','priceChangeType']));
  let diff,rate,prev,basis,unsure=false;
  if(price!==null&&vc>0){prev=vc;diff=price-vc;rate=diff/vc*100;basis='전일종가 계산'}
  else{
   rate=apiRate;let dd=rawDiff!==null?rawDiff:(price!==null&&rate!==null?price-price/(1+rate/100):null);
   let sg=dir!==null?dir:(rate!==null&&rate!==0?Math.sign(rate):(rawDiff!==null&&rawDiff<0?-1:null));
   if(sg===null&&dd===0)sg=0;
   if(dd!==null&&sg!==null)dd=sg===0?0:Math.abs(dd)*sg;
   unsure=dd!==null&&sg===null;diff=dd;
   if(rate!==null&&sg!==null)rate=sg===0?0:Math.abs(rate)*sg;
   else if(rate===null&&dd!==null&&sg!==null&&price!==null&&price-dd>0)rate=dd/(price-dd)*100;
   prev=(price!==null&&diff!==null&&!unsure)?price-diff:null;basis='API 값'}
  const value=num(first(o,['tradeAmount','accumulatedTradingValue','tradingValue','accAmount','priceTop','tradeValue','totalTradingValue']))??sc(/(trad(ing|e)|acc)\w*(value|amount|money)|turnover/i);
  const volume=num(first(o,['tradeVolume','accumulatedTradingVolume','tradingVolume','accQuant','quantTop','volume','totalTradingVolume']));
  const cap=num(first(o,['marketValue','marketCap','marketSum','marketCapitalization','marketCapital']));
  const hit=num(first(o,['hitCount','searchCount','count','rankingValue']));
  const endType=String(first(o,['stockEndType','endType','stockType','type'])||'')+(o.etfType||o.nav?' etf':'');const [sector,detail,src]=classify({code,name,endType});
  const mv=first(o,['marketType','market','stockExchangeType','exchangeType']);return {code,name,price,rate,diff,prev,basis,unsure,value,volume,cap,hit,qr:num(o.quantDiffRate),w52h:num(o.week52HighPrice),w52l:num(o.week52LowPrice),hi:num(o.highPrice),lo:num(o.lowPrice),halt:String(o.tradeStopYn||'')==='Y',pq:num(o.prevQuant),sector,detail,src,endType,market:String(mv&&typeof mv==='object'?(mv.name||mv.code||''):(mv||(o.sosok==='0'?'KOSPI':o.sosok==='1'?'KOSDAQ':''))).toUpperCase()};
 }
 function walk(node,depth=0){
  if(!node||typeof node!=='object'||depth>9)return [];
  if(Array.isArray(node)){
   const out=node.map(v=>v&&typeof v==='object'&&!Array.isArray(v)?normalize(v):null).filter(Boolean);
   if(out.length>=1)return out;
   for(const v of node){const got=walk(v,depth+1);if(got.length)return got;}return [];
  }
  const preferred=['items','stocks','stockList','stocklist','result','data','list','contents','rankings','rankingList','domesticStocks','stockItems','searchTopList'];
  for(const k of preferred)if(node[k]&&typeof node[k]==='object'){const got=walk(node[k],depth+1);if(got.length)return got;}
  for(const [k,v] of Object.entries(node))if(!preferred.includes(k)&&v&&typeof v==='object'){const got=walk(v,depth+1);if(got.length)return got;}
  return [];
 }
 return walk(root);
}
async function fetchJson(url){
 const r=await fetch(WORKER+'/?url='+encodeURIComponent(url),{cache:'no-store'});
 if(!r.ok)throw new Error('데이터 요청 오류 ('+r.status+')');
 return r.json();
}
async function load(kind=active,force=false){
 active=kind;
 document.querySelectorAll('#tabs button').forEach(b=>b.classList.toggle('active',b.dataset.kind===kind));
 {const a=document.querySelector&&document.querySelector('#tabs button.active');if(a&&a.scrollIntoView&&typeof window!=='undefined'&&window.innerWidth>700)a.scrollIntoView({inline:'center',block:'nearest'})}
 const cfg=kinds[kind];$('list-title').textContent=ttl(kind);$('list-desc').textContent=cfg.desc;$('metric-head').textContent=cfg.metric;
 if(!cache[kind])$('rows').innerHTML='<div class="empty">순위를 불러오는 중입니다…</div>';
 try{
  let data;
  if(!force&&cache[kind])data=cache[kind];
  else if(STRICT[kind]){data=await loadStrict(kind);cache[kind]=data}
  else{
   const U=o=>ordUrl(o,market,200);
   const mn=ORD[kind]?1:10;
   const urls=ORD[kind]?[U(ORD[kind])]:kind==='popular'?[U('searchTop'),U('top')]:[U(cfg.order)];
   let lastErr;const errs=[];data=[];
   for(const u of urls){try{const d=await fetchRows(u);if(d.length>=mn){data=d;dbg.src[kind]=ORD[kind]?'저장된 이름 '+ORD[kind]:u.includes('searchTop')?'searchTop':'stocklist';break}}catch(e){lastErr=e;errs.push((u.match(/orderType=(\w+)/)||u.match(/listingType=(\w+)/)||u.match(/market\/([\w\/]+)/)||[0,'?'])[1]+' '+String(e.message).replace(/\D+/g,' ').trim())}}
   if(data.length<mn&&lastErr){if(kind==='popular'&&!ORD.popular&&shouldProbe('popular')){$('rows').innerHTML='<div class="empty">인기 종목 주소를 자동으로 찾는 중입니다…</div>';const f=await probeKind('popular');if(f){ORD.popular=f;svLS('order_map_v1',ORD);return load(kind,true)}}throw new Error('데이터 요청 오류 ('+errs.join(', ')+')')}
   if(data.length<mn)throw new Error(`응답에서 종목 ${data.length}개만 확인했습니다. 원본 API 구조가 변경됐을 수 있습니다.`);
   cache[kind]=data;
  }
  render(data);
  if(cfg.derived&&!ORD[kind]&&CAND[kind]&&shouldProbe(kind))probeKind(kind).then(f=>{if(f){ORD[kind]=f;svLS('order_map_v1',ORD);cache[kind]=null;if(active===kind)load(kind,true)}}).catch(()=>{});
  $('updated').textContent='조회 '+new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
 }catch(e){$('rows').innerHTML=`<div class="error">${escapeHtml(e.message)}<br><small>403이면 Worker를 최신 파일로 다시 배포해야 하고, 404면 네이버 주소가 다른 것입니다. 맨 아래 '데이터 점검'의 '자동 찾기'를 실행해 보세요.</small></div>`;$('updated').textContent='조회 실패'}
}
let UNI=null,UNIAT=0;
async function loadUniverse(){
 if(UNI&&Date.now()-UNIAT<110000)return UNI;
 const U=(i,ps)=>`${DESKTOP}/api/domestic/market/stock/default?tradeType=KRX&marketType=ALL&orderType=marketSum&startIdx=${i}&pageSize=${ps}`;
 let first=[];for(const n of [500,100]){try{first=getRows(await fetchJson(U(0,n)));if(first.length>=10)break}catch(e){}}
 if(first.length<10)throw new Error('전체 종목 목록을 불러오지 못했습니다.');
 const ps=first.length,all=[...first],seen=new Set(first.map(x=>x.code));let stop=ps<50;
 for(let i=1;i<80&&!stop;i+=6){
  const rs=await Promise.all([0,1,2,3,4,5].map(async k=>{try{return getRows(await fetchJson(U((i+k)*ps,ps)))}catch(e){return []}}));
  let add=0;for(const r of rs)for(const x of r)if(!seen.has(x.code)){seen.add(x.code);all.push(x);add++}
  if(!add)stop=true;
 }
 const ex=await Promise.all(['priceTop','quantTop','up','down'].map(async o=>{try{return getRows(await fetchJson(ordUrl(o)))}catch(e){return []}}));
 let more=0;for(const r of ex)for(const x of r)if(!seen.has(x.code)){seen.add(x.code);all.push(x);more++}
 UNI=all;UNIAT=Date.now();dbg.src.uni=all.length+'종목 (페이지당 '+ps+', 상위목록 합집합 +'+more+')';return all;
}
// 방향: 전일대비 금액 부호 우선, 없으면 등락률 부호. 판단 불가면 null(상승·보합·하락 어디에도 넣지 않음)
function sd(x){const f=x.diff!=null&&!x.unsure?x.diff:null;if(f!==null)return Math.sign(f)||0;if(x.rate!=null)return Math.sign(x.rate)||0;return null}
// 52주 최고/최저: 당일 고가(저가)가 52주 최고가(최저가) 이상(이하)인 종목만. 고가·저가 값이 없으면 현재가로 판단
function hiOK(x){return x.w52h>0&&((hlMode==='close'||!(x.hi>0))?x.price>=x.w52h:x.hi>=x.w52h)}
function loOK(x){return x.w52l>0&&((hlMode==='close'||!(x.lo>0))?x.price<=x.w52l:x.lo<=x.w52l)}
function derive(kind,uni){
 const L=uni.filter(x=>!isEtf(x)&&!x.halt&&x.price>0),vol=x=>x.volume==null||x.volume>0,L2=L.filter(x=>x.volume>0);
 const val=x=>x.value!=null?x.value:(x.volume>0&&x.price>0?x.volume*x.price:0),byV=(a,b)=>val(b)-val(a);
 if(kind==='flat')return L.filter(x=>vol(x)&&sd(x)===0).sort(byV);
 if(kind==='volSurge')return L2.filter(x=>x.qr!=null&&x.pq>0&&x.qr>0&&(x.value||0)>=minVal).sort((a,b)=>b.qr-a.qr);
 if(kind==='volDrop')return L2.filter(x=>x.qr!=null&&x.pq>0&&x.qr<0&&(x.value||0)>=minVal).sort((a,b)=>a.qr-b.qr);
 if(kind==='high52')return L.filter(x=>vol(x)&&hiOK(x)).sort(byV);
 if(kind==='low52')return L.filter(x=>vol(x)&&loOK(x)).sort(byV);
 return L;
}
// 보합·52주 최고·최저: 네이버 목록(최대 200종목)과 전체 종목 데이터를 합쳐, 조건을 직접 검증한 종목만 표시
async function fetchRows(u){
 try{const d=getRows(await fetchJson(u));if(d.length)return d}catch(e){if(!/(pageSize|size)=200\b/.test(u))throw e}
 return getRows(await fetchJson(u.replace(/(pageSize|size)=200\b/,'$1=100')));
}
async function loadStrict(kind){
 const o=ORD[kind]||kinds[kind].order;let list=[],uni=[],err=null;
 if(o){try{list=await fetchRows(ordUrl(o,market,200))}catch(e){err=e}}
 try{uni=await loadUniverse()}catch(e){err=e}
 if(!list.length&&!uni.length)throw err||new Error('종목 데이터를 불러오지 못했습니다.');
 const m=new Map();uni.forEach(x=>m.set(x.code,x));
 list.forEach(x=>{const u=m.get(x.code);if(u)for(const k in u)if(x[k]==null||x[k]==='')x[k]=u[k];m.set(x.code,x)});
 dbg.src[kind]='전체 '+uni.length+'종목'+(list.length?' + 네이버 목록 '+list.length:'')+' 합쳐 검증';
 return derive(kind,[...m.values()]);
}
const mo=x=>{switch(active){
 case 'priceTop':return '대금 '+money(x.value);case 'quantTop':return fmt(x.volume);case 'marketSum':return money(x.cap);
 case 'popular':return x.hit!=null?fmt(x.hit):'대금 '+money(x.value);
 case 'volSurge':case 'volDrop':return '거래량 '+fmt(x.volume)+' · 전일 '+fmt(x.pq)+(x.qr!=null?' ('+(x.qr>0?'+':'')+x.qr.toFixed(0)+'%)':'');
 case 'high52':return '52주 최고 '+fmt(x.w52h)+' · 고가 '+fmt(x.hi);
 case 'low52':return '52주 최저 '+fmt(x.w52l)+' · 저가 '+fmt(x.lo);
 default:return x.value?'대금 '+money(x.value):''}};
function agg(list){
 const tot=list.reduce((s,x)=>s+(x.value||0),0),w=x=>tot>0?(x.value||0):1,W=list.reduce((s,x)=>s+w(x),0)||1,g={};
 list.forEach(x=>{const a=g[x.sector]||(g[x.sector]={n:0,w:0,rw:0,top:x});a.n++;a.w+=w(x);a.rw+=(x.rate||0)*w(x)});
 return {tot,W,avg:list.reduce((s,x)=>s+(x.rate||0)*w(x),0)/W,arr:Object.entries(g).map(([s,a])=>({s,n:a.n,share:a.w/W*100,avg:a.w?a.rw/a.w:0,top:a.top.name})).sort((a,b)=>b.share-a.share||b.n-a.n)};
}
const cls2=v=>v>0?'up':v<0?'down':'';
let sortBy='rank',secF=null,secOpen=false,minVal=0,hlMode='intra';
const cls3=v=>v>0?'up':v<0?'down':'flat';
function renderOpts(){const el=$('opts');if(el){el.hidden=true;el.innerHTML=''}}
function render(data){
 renderOpts();
 if(STRICT[active])$('list-desc').textContent=kinds[active].desc+(UNI?' · 전체 '+UNI.length+'종목 기준 검증':'');
 data.forEach(x=>{const e=EXT[x.code];if(!e)return;if(x.value==null&&e.value!=null)x.value=e.value;if(x.unsure&&e.prev>0&&x.price!=null){x.prev=e.prev;x.diff=x.price-e.prev;x.rate=x.diff/e.prev*100;x.basis='전일종가(상세조회)';x.unsure=false}});
 data.forEach(x=>{[x.sector,x.detail,x.src]=classify(x)});
 const rows=(market==='ALL'?data:data.filter(x=>!x.market||x.market.includes(market))).filter(x=>!isEtf(x));
 const base=rows.slice(0,N);base.forEach((x,i)=>x.rk=i+1);cur=base;
 if(secF&&!base.some(x=>x.sector===secF))secF=null;
 const up=base.filter(x=>sd(x)===1).length,down=base.filter(x=>sd(x)===-1).length,flat=base.filter(x=>sd(x)===0).length;
 $('b-up').textContent=up;$('b-flat').textContent=flat;$('b-down').textContent=down;
 const {tot,avg,arr}=agg(base),vs=f=>base.filter(f).reduce((s,x)=>s+(x.value||0),0);
 let list=secF?base.filter(x=>x.sector===secF):base.slice();
 if(sortBy==='rate')list.sort((a,b)=>(b.rate||0)-(a.rate||0));
 $('sec-filter').hidden=!secF;$('sec-filter').innerHTML=secF?`섹터 필터: <b>${escapeHtml(secF)}</b> (${list.length}종목) <a href="#" id="clr">해제 ✕</a>`:'';
 $('rows').innerHTML=list.map(x=>{
  const c=cls3(x.rate),m=mo(x);
  const sh=tot>0&&x.value?` · 비중 ${(x.value/tot*100).toFixed(1)}%`:'';
  const rs=x.rate===null||x.rate===undefined?'—':(x.rate>0?'+':x.rate<0?'-':'')+Math.abs(x.rate).toFixed(2)+'%';const d=x.diff===null||x.diff===undefined?'—':x.unsure?fmt(Math.abs(x.diff)):(x.diff>0?'▲':x.diff<0?'▼':'')+fmt(Math.abs(x.diff));
  const bd=x.rate>=29.5?'<i class="bd u">상한가</i>':x.rate>=10?'<i class="bd u">급등</i>':x.rate<=-10?'<i class="bd d">급락</i>':'';
  const mk=x.market.includes('KOSDAQ')?'코스닥':x.market.includes('KOSPI')?'코스피':'';
  return `<div class="it"><div class="r1"><span class="rk">${x.rk}</span><div class="nm"><b>${escapeHtml(x.name)}${bd}</b><small>${x.code}${mk?' · '+mk:''}${x.prev?' · 전일 '+fmt(x.prev):''}</small></div><div class="px ${c}"><b>${fmt(x.price)}</b><small>${d} (${rs})</small></div></div><div class="r2"><span class="chip ed" data-code="${x.code}">${escapeHtml(x.sector)}</span><small class="dt">${escapeHtml(x.detail)}</small>${m?`<span class="vl">${m}${sh}</span>`:''}</div></div>`;
 }).join('')||'<div class="empty">해당 조건의 종목이 없습니다.</div>';
 $('sector-total').textContent=arr.length+'개 섹터';
 const sOpen=secOpen||(secF&&arr.findIndex(a=>a.s===secF)>=5),sh5=sOpen?arr:arr.slice(0,5);$('sector-list').innerHTML='<table class="sec-t"><thead><tr><th>섹터 (탭: 필터)</th><th>종목</th><th>비중</th><th>평균</th></tr></thead><tbody>'+sh5.map(a=>`<tr data-s="${escapeHtml(a.s)}" class="${a.s===secF?'on':''}"><td><b>${escapeHtml(a.s)}</b></td><td class="num">${a.n}</td><td><div class="bar"><i style="width:${a.share}%"></i></div><small>${a.share.toFixed(1)}%</small></td><td class="rate ${cls3(a.avg)}">${pct(a.avg)}</td></tr>`).join('')+'</tbody></table>'+(arr.length>5?`<button id="secMore" class="more">${sOpen?'▲ 접기':'▼ 나머지 '+(arr.length-5)+'개 섹터 펼치기'}</button>`:'');
 const real=arr.filter(a=>a.s!=='업종 미확인'),big=real.filter(a=>a.n>=2),T=[],top5=base.slice(0,5).reduce((s,x)=>s+(x.value||0),0);
 if(base.length){const r=up/Math.max(1,up+down);T.push(`<b>분위기</b> · ${r>=.65&&avg>0?'강세 우위':r<=.35&&avg<0?'약세 우위':'혼조'} · 가중 평균 <span class="${cls3(avg)}">${pct(avg)}</span> (상승 ${up} · 하락 ${down})`)}
 if(tot>0){const uv=vs(x=>x.rate>0)/tot*100,dv=vs(x=>x.rate<0)/tot*100;T.push(`<b>자금 방향</b> · 거래대금의 <span class="up">${uv.toFixed(0)}%</span>가 상승 종목, <span class="down">${dv.toFixed(0)}%</span>가 하락 종목 · 상위5 집중 ${(top5/tot*100).toFixed(0)}%${top5/tot>.45?' (소수 종목 쏠림)':''}`)}
 if(real[0])T.push(`<b>자금 쏠림</b> · ${escapeHtml(real[0].s)} ${real[0].share.toFixed(0)}% (${real[0].n}종목, <span class="${cls3(real[0].avg)}">${pct(real[0].avg)}</span>)${real[1]?' · 다음 '+real.slice(1,3).map(a=>escapeHtml(a.s)+' '+a.share.toFixed(0)+'%').join(', '):''}`);
 const bs=[...big].sort((a,b)=>b.avg-a.avg);
 if(bs.length>1)T.push(`<b>강세</b> ${escapeHtml(bs[0].s)} <span class="up">${pct(bs[0].avg)}</span> · <b>약세</b> ${escapeHtml(bs[bs.length-1].s)} <span class="down">${pct(bs[bs.length-1].avg)}</span>`);
 const sr=[...base].sort((a,b)=>(b.rate||0)-(a.rate||0)),hot=base.filter(x=>x.rate>=10).length;
 if(base.length>5){T.push(`<b>급등</b> ${sr.slice(0,3).map(x=>`${escapeHtml(x.name)} <span class="up">${pct(x.rate)}</span>`).join(', ')}${hot?` · +10%↑ ${hot}종목`:''}`);T.push(`<b>급락</b> ${sr.slice(-3).reverse().map(x=>`${escapeHtml(x.name)} <span class="down">${pct(x.rate)}</span>`).join(', ')}`)}
 $('trend-list').innerHTML=T.map(t=>`<li>${t}</li>`).join('')||'<li>데이터를 불러오는 중입니다.</li>';
 const un=base.filter(x=>x.sector==='업종 미확인').length;
 $('classify-note').textContent=un?`업종 미확인 ${un}종목 · 종목의 섹터 칩을 눌러 직접 지정하면 저장됩니다.`:'모든 종목의 섹터가 분류되었습니다.';
 enrich(base);
}
function escapeHtml(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
$('tabs').addEventListener('click',e=>{const b=e.target.closest('button[data-kind]');if(b){market='ALL';document.querySelectorAll('.filters button').forEach(x=>x.classList.toggle('selected',x.dataset.market==='ALL'));load(b.dataset.kind)}});
document.querySelectorAll('.filters button').forEach(b=>b.addEventListener('click',()=>{market=b.dataset.market;document.querySelectorAll('.filters button').forEach(x=>x.classList.toggle('selected',x===b));cache[active]=null;load(active,true)}));
$('refresh').addEventListener('click',()=>load(active,true));
$('cnt-tabs').addEventListener('click',e=>{const b=e.target.closest('button[data-n]');if(!b)return;N=+b.dataset.n;document.querySelectorAll('#cnt-tabs button').forEach(x=>x.classList.toggle('active',x===b));$('list-title').textContent=ttl(active);if(cache[active])render(cache[active])});
load();

document.addEventListener('click',e=>{
 const c=e.target.closest('.chip.ed');
 if(c){const code=c.dataset.code,x=cur.find(y=>y.code===code);const o0=ovr[code],d0=Array.isArray(o0)?o0.join(' / '):(o0||(x&&x.src!=='unknown'?x.sector+' / '+x.detail:''));const v=prompt(`${x?x.name:code}\n섹터 / 세부분야 입력\n예) 반도체 / DRAM·NAND·HBM\n(비우면 직접 지정 해제)`,d0);if(v===null)return;const pr=v.split('/').map(t=>t.trim());pr[0]?ovr[code]=pr[1]?[pr[0],pr[1]]:pr[0]:delete ovr[code];svLS(LSK.ovr,ovr);syncPush();render(cache[active]||[]);return}
 const r=e.target.closest('tr[data-s]');if(r){secF=secF===r.dataset.s?null:r.dataset.s;render(cache[active]||[]);if(secF)$('list').scrollIntoView({behavior:'smooth'});return}
 if(e.target.id==='clr'){e.preventDefault();secF=null;render(cache[active]||[]);return}
 const s=e.target.closest('button[data-sort]');if(s){sortBy=s.dataset.sort;document.querySelectorAll('.sorts button').forEach(b=>b.classList.toggle('selected',b===s));render(cache[active]||[])}
});
setInterval(()=>{if(!document.hidden)load(active,true)},60000);

(function(){const b=document.createElement('p');b.className='dbgbar';b.innerHTML='<a href="#" id="dbgL">데이터 점검 · 분류 백업 (V16)</a>';document.body.appendChild(b)})();
document.addEventListener('click',e=>{
 if(e.target.id==='dbgL'){e.preventDefault();let p=document.getElementById('dbgP');if(!p){p=document.createElement('div');p.id='dbgP';p.className='dbgp';document.body.appendChild(p)}
  const x=cur.slice(0,3).map(y=>({name:y.name,price:y.price,prev:y.prev,diff:y.diff,rate:y.rate&&+y.rate.toFixed(2),basis:y.basis}));
  p.innerHTML=`<b>계산값 (출처: ${escapeHtml(JSON.stringify(dbg.src))})</b><pre>${escapeHtml(JSON.stringify(x,null,1))}</pre><b>원본 응답(상위 2종목)</b><pre>${escapeHtml(JSON.stringify(dbg.raw,null,1).slice(0,3500))}</pre><b>업종 조회 응답(실패 시)</b><pre>${escapeHtml(dbg.ind.slice(0,3600)||'없음')}</pre><b>탭 정렬 이름 자동 찾기</b><div><button id="probeB" class="more">자동 찾기 실행 (1~2분)</button><button id="ordClr" class="more">저장된 정렬 이름 지우기</button></div><pre id="probeOut">${escapeHtml(JSON.stringify(ORD))}</pre><b>섹터 직접 지정 백업</b><textarea id="bk" rows="4">${escapeHtml(JSON.stringify(ovr))}</textarea><button id="bkL">가져오기</button>`;p.scrollIntoView();return}
 if(e.target.id==='bkL'){try{Object.assign(ovr,JSON.parse($('bk').value));svLS(LSK.ovr,ovr);syncPush();render(cache[active]||[]);alert('가져왔습니다')}catch(err){alert('형식이 올바르지 않습니다')}}
});

let syncOn=false;
function syncPush(){if(!syncOn)return;try{fetch(WORKER+'/?sectors=1',{method:'POST',body:JSON.stringify(ovr)}).catch(()=>{})}catch(e){}}
async function syncPull(){try{const r=await fetch(WORKER+'/?sectors=1',{cache:'no-store'});if(!r.ok)return;const rem=await r.json();syncOn=true;
 if(rem&&Object.keys(rem).length){ovr=rem;localStorage.setItem(LSK.ovr,JSON.stringify(ovr));render(cache[active]||[])}else if(Object.keys(ovr).length)syncPush()}catch(e){}}
document.addEventListener('click',e=>{if(e.target.id==='secMore'){secOpen=!secOpen;render(cache[active]||[])}});
syncPull();

function ordUrl(o,mk='ALL',ps=100){
 const D=DESKTOP+'/api/';
 if(o.startsWith('lt:'))return `${D}stockSecurity/individual-stocks/v3/domestic?listingType=${o.slice(3)}&exchangeType=KRX&index=0&size=${ps}`;
 if(o.startsWith('path:'))return `${D}domestic/market/${o.slice(5)}?nationType=KOR&tradeType=KRX&marketType=${mk}&startIdx=0&pageSize=${ps}`;
 return `${D}domestic/market/stock/default?tradeType=KRX&marketType=${mk}&orderType=${o}&startIdx=0&pageSize=${ps}`;
}
const CAND={
 popular:['searchTop','top','popular','path:searchTop','path:stock/searchTop','path:popular','lt:popular','lt:searchTop','lt:popularDesc','hit','hot','interest','search','view'],
 flat:['steady','unchanged','lt:unchanged','lt:steady','lt:flat','flat','noChange','lt:noChange','even','same']
};
const sig=a=>a.slice(0,10).map(x=>x.code).join();
let BASEP=null;
function getBase(){return BASEP||(BASEP=(async()=>{const b=[];for(const o of ['priceTop','quantTop','marketSum','up','down','lt:tradingValueDesc']){try{b.push(sig(getRows(await fetchJson(ordUrl(o)))))}catch(e){}}return b})())}
function shouldProbe(k){try{return Date.now()-(+localStorage.getItem('probe_t_'+k)||0)>864e5}catch(e){return false}}
const okf={popular:a=>true,flat:a=>a.slice(0,5).every(x=>x.rate===0||x.rate===null),volSurge:a=>a.length<5||a[0].qr==null||a[0].qr>=a[4].qr,volDrop:a=>a.length<5||a[0].qr==null||a[0].qr<=a[4].qr,high52:a=>a.slice(0,5).filter(x=>x.hi==null||x.hi>=x.w52h).length>=3,low52:a=>a.slice(0,5).filter(x=>x.lo==null||(x.lo>0&&x.lo<=x.w52l)).length>=3};
async function probeKind(k,log=()=>{}){
 try{localStorage.setItem('probe_t_'+k,String(Date.now()))}catch(e){}
 const base=await getBase(),cs=CAND[k];
 for(let i=0;i<cs.length;i+=4){
  const rs=await Promise.all(cs.slice(i,i+4).map(async c=>{try{return {c,a:getRows(await fetchJson(ordUrl(c)))}}catch(e){return {c,err:String(e.message).replace(/\D+/g,' ').trim()}}}));
  let found=null;
  for(const r of rs){
   if(r.err){log(`${k} ✗ ${r.c} (${r.err})`);continue}
   const same=base.includes(sig(r.a)),good=r.a.length>=1&&!same&&okf[k](r.a);
   log(`${k} ${good?'✓':'△'} ${r.c} · ${r.a.length}종목${same?' · 기존 탭과 같은 목록':''}${r.a.length?' · '+r.a.slice(0,3).map(x=>x.name).join(','):''}`);
   if(good&&!found)found=r.c}
  if(found)return found;
 }
 return null;
}
async function probe(){
 const out=document.getElementById('probeOut'),log=t=>{out.textContent+=t+'\n'};out.textContent='검색 중입니다. 화면을 닫지 마세요…\n';
 for(const k of Object.keys(CAND)){const f=await probeKind(k,log);if(f){ORD[k]=f;log(`→ ${k}: ${f} 저장`)}else log(`→ ${k}: 못 찾음 (앱 계산 방식 유지)`)}
 svLS('order_map_v1',ORD);cache={};log(`전체 종목 수집: ${dbg.src.uni||'-'}\n완료. 위 내용을 복사해 보내 주셔도 됩니다. 탭을 눌러 확인해 보세요.`);
}
document.addEventListener('click',e=>{
 if(e.target.id==='probeB'){probe();return}
 if(e.target.id==='ordClr'){ORD={};svLS('order_map_v1',ORD);cache={};['popular','flat','volSurge','volDrop','high52','low52'].forEach(k=>{try{localStorage.removeItem('probe_t_'+k)}catch(e){}});document.getElementById('probeOut').textContent='{}';alert('지웠습니다')}
});

document.addEventListener('click',e=>{const b=e.target.closest&&e.target.closest('button[data-opt]');if(!b)return;const [k,v]=b.dataset.opt.split(':');if(k==='min')minVal=+v;else hlMode=v;cache[active]=null;load(active,true)});
