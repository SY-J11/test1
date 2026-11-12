(() => {
  "use strict";
  const API_BASE = "https://fr.mcraft-tiger-574.workers.dev";
  const $ = id => document.getElementById(id);
  const state = { tab: "board", data: null, selected: null };

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
  function googleSearchUrls(person) {
    const query = person.name.trim();
    const news = new URL("https://www.google.com/search");
    news.searchParams.set("q", query);
    news.searchParams.set("tbm", "nws");
    news.searchParams.set("tbs", "sbd:1");
    news.searchParams.set("hl", "en");
    news.searchParams.set("gl", "US");
    const web = new URL("https://www.google.com/search");
    web.searchParams.set("q", query);
    web.searchParams.set("tbs", "sbd:1");
    web.searchParams.set("hl", "en");
    web.searchParams.set("gl", "US");
    return { news: news.toString(), web: web.toString(), query };
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
      ? "연준 이사회 현직 구성원입니다. 인물을 선택하면 해당 이름의 Google 최신순 뉴스 검색으로 연결됩니다."
      : `현재 ${data.year}년 FOMC 투표권 보유 위원 ${data.fomc.length}명입니다. 인물을 선택해 Google 최신순 검색을 확인하세요.`;
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
        <span class="person-meta"><span>${isBoard ? "BOARD GOVERNOR" : "VOTING MEMBER"}</span><span>Google 검색 ↗</span></span></button>`;
    }).join("") : `<div class="empty">검색 조건에 맞는 인물이 없습니다.</div>`;
    $("peopleList").querySelectorAll("[data-person]").forEach(button => button.addEventListener("click", () => {
      const person = people.find(p => p.name === button.dataset.person);
      if (person) selectPerson(person);
    }));
  }
  let newsOffset = 0;
  let newsBusy = false;
  let newsRequestId = 0;
  let selectedNewsPerson = null;
  function renderNewsItems(items, append = false) {
    const list = $("newsList");
    if (!append) list.innerHTML = "";
    items.forEach((item, index) => {
      const article = document.createElement("article"); article.className = "news-item";
      const link = document.createElement("a"); link.href = item.url; link.target = "_blank"; link.rel = "noopener noreferrer"; link.textContent = item.title || "제목 없음";
      const meta = document.createElement("div"); meta.className = "news-meta";
      const source = document.createElement("span"); source.textContent = item.source || "Google News";
      const date = document.createElement("span"); date.textContent = dateText(item.publishedAt);
      const number = document.createElement("span"); number.textContent = `#${newsOffset + index + 1}`;
      meta.append(number, source, date); article.append(link, meta); list.appendChild(article);
    });
  }
  async function loadPersonNews(person, reset = false) {
    if (newsBusy && !reset) return;
    if (reset) { newsRequestId += 1; newsOffset = 0; $("newsList").innerHTML = ""; }
    const requestId = newsRequestId;
    newsBusy = true;
    const more = $("loadMoreNews");
    if (more) { more.disabled = true; more.textContent = "불러오는 중…"; }
    if (!newsOffset) $("newsStatus").textContent = "최신 뉴스를 불러오는 중…";
    try {
      const query = person.name.trim();
      const params = new URLSearchParams({ q: query, limit: "5", offset: String(newsOffset) });
      const data = await getJSON(`${API_BASE}/api/person-news?${params}`);
      if (requestId !== newsRequestId) return;
      const items = Array.isArray(data.items) ? data.items : [];
      if (!items.length && !newsOffset) {
        const diagnostics = Array.isArray(data.diagnostics) ? data.diagnostics.slice(0, 3).join(" · ") : "";
        $("newsStatus").textContent = `${data.error || "Google 검색 결과가 없습니다."}${diagnostics ? ` (${diagnostics})` : ""} 아래 Google 검색 링크에서 실시간 결과를 확인할 수 있습니다.`;
        $("newsStatus").classList.add("error");
        const fallback = document.createElement("article");
        fallback.className = "news-item news-fallback";
        const a = document.createElement("a"); a.href = googleSearchUrls(person).news; a.target = "_blank"; a.rel = "noopener noreferrer";
        a.textContent = `Google 뉴스에서 ${person.name} 검색 결과 보기 ↗`;
        const meta = document.createElement("div"); meta.className = "news-meta"; meta.textContent = `검색어: ${person.name}`;
        fallback.append(a, meta); $("newsList").appendChild(fallback);
      } else {
        $("newsStatus").classList.remove("error");
        $("newsStatus").textContent = `${data.total || items.length}개 검색 결과 · ${data.provider || "Google News"} · 최신순`;
        renderNewsItems(items, newsOffset > 0);
        newsOffset += items.length;
      }
      if (more) { more.hidden = !data.hasMore; more.disabled = !data.hasMore; more.textContent = "기사 5개 더 보기 ↓"; }
      $("newsProvider").textContent = data.provider || "Google News";
    } catch (error) {
      if (requestId !== newsRequestId) return;
      $("newsStatus").textContent = `Google 뉴스 검색을 완료하지 못했습니다: ${error.message}`;
      $("newsStatus").classList.add("error");
      if (more) { more.hidden = false; more.disabled = false; more.textContent = "다시 불러오기 ↻"; }
    } finally { if (requestId === newsRequestId) { newsBusy = false; if (more && more.textContent === "불러오는 중…") more.textContent = "기사 5개 더 보기 ↓"; } }
  }
  function renderGoogleSearch(person) {
    selectedNewsPerson = person;
    const urls = googleSearchUrls(person);
    newsOffset = 0;
    $("newsPerson").textContent = person.name;
    $("newsQuery").textContent = `${personRole(person)} · ${person.institution}`;
    $("newsStatus").textContent = "Google News 검색 결과를 불러오는 중…";
    $("newsStatus").classList.remove("error");
    $("newsList").innerHTML = "";
    $("newsProvider").textContent = "Google News · 검색 중";
    $("googleSearch").href = urls.news;
    $("googleSearch").textContent = "Google 뉴스 전체 결과 ↗";
    $("googleSearch").hidden = false;
    $("searchAgain").disabled = false;
    $("searchAgain").textContent = "새로 검색 ↻";
    $("searchAgain").onclick = () => loadPersonNews(person, true);
    const more = $("loadMoreNews"); if (more) more.hidden = true;
    loadPersonNews(person, true);
  }
  function selectPerson(person) {
    state.selected = person;
    renderPeople();
    renderGoogleSearch(person);
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
  $("refreshBtn").addEventListener("click", () => loadRoster(true));
  $("loadMoreNews").addEventListener("click", () => { if (selectedNewsPerson) loadPersonNews(selectedNewsPerson, false); });
  $("themeBtn").addEventListener("click", () => {
    document.body.classList.toggle("dark");
    localStorage.setItem("fed_monitor_theme", document.body.classList.contains("dark") ? "dark" : "light");
  });
  if (localStorage.getItem("fed_monitor_theme") === "dark") document.body.classList.add("dark");
  loadRoster();
})();
