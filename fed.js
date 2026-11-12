(() => {
  "use strict";
  const API_BASE = "https://fr.mcraft-tiger-574.workers.dev";
  const $ = id => document.getElementById(id);
  const state = { tab: "board", data: null, selected: null, newsCache: new Map(), requestId: 0 };

  function esc(value = "") {
    return String(value).replace(/[&<>"']/g, ch => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[ch]));
  }
  function dateText(value) {
    if (!value) return "날짜 정보 없음";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString("ko-KR", {month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"});
  }
  function toast(message) {
    $("toast").textContent = message;
    $("toast").classList.add("show");
    setTimeout(() => $("toast").classList.remove("show"), 2200);
  }
  async function getJSON(url) {
    const response = await fetch(url, {headers:{"Accept":"application/json"}});
    let data;
    try { data = await response.json(); }
    catch { throw new Error(`서버가 JSON이 아닌 응답을 반환했습니다. HTTP ${response.status}`); }
    if (!response.ok) throw new Error(data.error || `서버 오류 ${response.status}`);
    return data;
  }
  function personRole(person) {
    const role = String(person.role || "");
    if (/supervision/i.test(role)) return "금융감독 담당 부의장 · Vice Chair";
    if (/chairman/i.test(role)) return state.tab === "fomc" ? "FOMC 의장 · Chair" : "연준 의장 · Chair";
    if (/vice chair/i.test(role)) return "부의장 · Vice Chair";
    if (/Board of Governors/i.test(role)) return "연준 이사 · Governor";
    return role || person.institution || "FOMC Member";
  }
  function renderSummary() {
    const data = state.data;
    $("boardCount").textContent = data.board.length;
    $("fomcCount").textContent = data.fomc.length;
    $("alternateCount").textContent = data.alternates.length;
    $("rosterYear").textContent = data.year;
    $("updatedAt").textContent = `명단 확인 ${dateText(data.updatedAt)}`;
  }
  function renderPeople() {
    const data = state.data;
    if (!data) return;
    const isBoard = state.tab === "board";
    const people = isBoard ? data.board : data.fomc;
    $("sectionTitle").textContent = isBoard ? "Federal Reserve Board of Governors" : "Federal Open Market Committee";
    $("sectionDescription").textContent = isBoard
      ? "연준 이사회 현직 구성원입니다. 인물 카드를 선택하면 해당 인물의 최신 뉴스 검색 결과를 확인할 수 있습니다."
      : `현재 ${data.year}년 FOMC 투표권 보유 위원 ${data.fomc.length}명입니다. 연준 이사와 지역 연방준비은행 대표로 구성됩니다.`;
    $("peopleHeading").textContent = isBoard ? "현직 연준 이사" : "FOMC 투표권 보유 위원";
    $("alternatesSection").hidden = isBoard || !data.alternates.length;
    if (!isBoard) $("alternatesList").innerHTML = data.alternates.map(p => `<span class="alternate-chip">${esc(p.name)} · ${esc(p.institution)}</span>`).join("");
    const filter = $("peopleSearch").value.trim().toLowerCase();
    const filtered = people.filter(p => `${p.name} ${p.role} ${p.institution}`.toLowerCase().includes(filter));
    $("peopleList").innerHTML = filtered.length ? filtered.map(p => {
      const selected = state.selected && state.selected.name === p.name;
      return `<button type="button" class="person-card${selected ? " selected" : ""}" data-person="${esc(p.name)}">
        <span class="person-name">${esc(p.name)}</span><span class="person-role">${esc(personRole(p))}</span>
        <span class="person-institution">${esc(p.institution)}</span>
        <span class="person-meta"><span>${isBoard ? "BOARD GOVERNOR" : "VOTING MEMBER"}</span><span>뉴스 보기 ↗</span></span></button>`;
    }).join("") : `<div class="empty">검색 조건에 맞는 인물이 없습니다.</div>`;
    $("peopleList").querySelectorAll("[data-person]").forEach(button => button.addEventListener("click", () => {
      const person = people.find(p => p.name === button.dataset.person);
      if (person) selectPerson(person);
    }));
  }
  function renderNews(person, payload) {
    $("newsPerson").textContent = person.name;
    $("newsQuery").textContent = `${personRole(person)} · ${person.institution}`;
    $("newsStatus").textContent = payload.error
      ? `Google 검색 결과를 직접 불러오지 못했습니다: ${payload.error}`
      : payload.items.length ? `검색 결과 ${payload.total || payload.items.length}건 · 최신순` : (payload.notice || "검색 결과가 없습니다.");
    $("newsStatus").classList.toggle("error", !!payload.error);
    $("newsList").innerHTML = (payload.items || []).map(item => `<article class="news-item"><a href="${esc(item.url)}" target="_blank" rel="noopener">${esc(item.title)}</a><div class="news-meta"><span>${esc(item.source || "News")}</span><span>${esc(dateText(item.publishedAt))}</span></div></article>`).join("");
    if (!payload.items?.length && !payload.error) $("newsList").innerHTML = '<div class="empty">표시할 뉴스가 없습니다. 다시 검색해 주세요.</div>';
    $("newsProvider").textContent = payload.provider || "Google News RSS";
    const googleQuery = `"${person.name}" Federal Reserve OR FOMC`;
    const googleUrl = new URL("https://www.google.com/search");
    googleUrl.searchParams.set("q", googleQuery);
    googleUrl.searchParams.set("tbm", "nws");
    googleUrl.searchParams.set("tbs", "sbd:1");
    googleUrl.searchParams.set("hl", "en");
    googleUrl.searchParams.set("gl", "US");
    $("googleSearch").href = payload.searchUrl || googleUrl.toString();
    $("googleSearch").hidden = false;
  }
  async function selectPerson(person, force = false) {
    state.selected = person;
    renderPeople();
    $("newsPerson").textContent = person.name;
    $("newsQuery").textContent = `${personRole(person)} · ${person.institution}`;
    $("newsStatus").textContent = "Google 뉴스 검색 결과를 최신순으로 불러오고 있습니다.";
    $("newsStatus").classList.remove("error");
    $("newsList").innerHTML = '<div class="loading">Google 검색 결과를 확인하고 있습니다.</div>';
    $("searchAgain").disabled = true;
    const requestId = ++state.requestId;
    const cacheKey = `${state.tab}|${person.name}`;
    if (!force && state.newsCache.has(cacheKey)) {
      renderNews(person, state.newsCache.get(cacheKey));
      $("searchAgain").disabled = false;
      return;
    }
    try {
      const query = `"${person.name}" Federal Reserve OR FOMC`;
      const url = `${API_BASE}/api/person-news?q=${encodeURIComponent(query)}&limit=10`;
      const payload = await getJSON(url);
      if (requestId !== state.requestId) return;
      state.newsCache.set(cacheKey, payload);
      renderNews(person, payload);
    } catch (error) {
      if (requestId !== state.requestId) return;
      renderNews(person, {items:[], error:error.message});
    } finally {
      if (requestId === state.requestId) $("searchAgain").disabled = false;
    }
  }
  function switchTab(tab) {
    state.tab = tab;
    document.querySelectorAll(".tab").forEach(button => button.classList.toggle("active", button.dataset.tab === tab));
    $("peopleSearch").value = "";
    const people = tab === "board" ? state.data?.board : state.data?.fomc;
    renderPeople();
    if (people?.length) selectPerson(people[0]);
  }
  async function loadRoster(force = false) {
    $("peopleList").innerHTML = '<div class="loading">연준 공식 홈페이지에서 최신 명단을 확인하고 있습니다.</div>';
    $("updatedAt").textContent = "공식 명단 확인 중";
    try {
      const data = await getJSON(`${API_BASE}/api/fed-members${force ? "?force=1" : ""}`);
      if (!data.board || data.board.length !== 7 || !data.fomc?.length) throw new Error(data.error || `공식 명단 데이터가 올바르지 않습니다. (이사 ${data.board?.length || 0}명)`);
      state.data = data;
      state.newsCache.clear();
      renderSummary();
      renderPeople();
      const people = state.tab === "board" ? data.board : data.fomc;
      if (people.length) selectPerson(people[0]);
      if (data.stale) toast("공식 사이트 연결이 지연되어 저장된 명단을 표시합니다.");
    } catch (error) {
      $("peopleList").innerHTML = `<div class="empty error">명단을 불러오지 못했습니다.<br>${esc(error.message)}<br><br>Worker 주소와 /api/fed-members 배포 상태를 확인해 주세요.</div>`;
      $("updatedAt").textContent = "명단 조회 실패";
      toast("연준 공식 명단 조회에 실패했습니다.");
    }
  }
  document.querySelectorAll(".tab").forEach(button => button.addEventListener("click", () => switchTab(button.dataset.tab)));
  $("peopleSearch").addEventListener("input", renderPeople);
  $("searchAgain").addEventListener("click", () => state.selected && selectPerson(state.selected, true));
  $("refreshBtn").addEventListener("click", () => loadRoster(true));
  $("themeBtn").addEventListener("click", () => {
    document.body.classList.toggle("dark");
    localStorage.setItem("fed_monitor_theme", document.body.classList.contains("dark") ? "dark" : "light");
  });
  if (localStorage.getItem("fed_monitor_theme") === "dark") document.body.classList.add("dark");
  loadRoster();
})();
