import { db } from "./firebase.js";
import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  onSnapshot,
  collection,
  getDocs,
  writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

/* =========================
   UI: Toast + DarkMode
   ========================= */
function toast(msg, type = "info", ms = 2600) {
  const host = document.getElementById("toastHost");
  if (!host) return alert(msg);

  const el = document.createElement("div");
  el.className = `toast toast-${type}`;
  el.innerHTML = `<span class="toast-dot"></span><span class="toast-text">${msg}</span>`;
  host.appendChild(el);

  requestAnimationFrame(() => el.classList.add("show"));
  setTimeout(() => {
    el.classList.remove("show");
    setTimeout(() => el.remove(), 220);
  }, ms);
}

function setTheme(theme) {
  document.body.setAttribute("data-theme", theme);
  localStorage.setItem("theme", theme);
  const btn = document.getElementById("themeToggle");
  if (btn) btn.textContent = theme === "dark" ? "☀️ מצב בהיר" : "🌙 מצב כהה";
}

function initThemeToggle() {
  const saved = localStorage.getItem("theme") || "light";
  setTheme(saved);

  const btn = document.getElementById("themeToggle");
  if (!btn) return;
  btn.addEventListener("click", () => {
    const current = document.body.getAttribute("data-theme") || "light";
    const next = current === "dark" ? "light" : "dark";
    setTheme(next);
    toast(next === "dark" ? "עברנו למצב כהה" : "עברנו למצב בהיר", "success");
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initThemeToggle();
});

// ===== סדר שחקנים קבוע =====
const PLAYERS_ORDER = ["חגי","ראזי","סעיד","ווסים","צביר","שמעון"];

// ===== עזרי URL/תצוגה =====
function qs() { return new URLSearchParams(location.search); }
function getBaseUrl() { return location.origin + location.pathname.replace(/\/[^\/]*$/, ""); }
function makeId(len = 8) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i=0;i<len;i++) s += chars[Math.floor(Math.random()*chars.length)];
  return s;
}
function makeKey(len = 20) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i=0;i<len;i++) s += chars[Math.floor(Math.random()*chars.length)];
  return s;
}
async function sha256(text) {
  const enc = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2,"0")).join("");
}
async function copyText(t) {
  try {
    await navigator.clipboard.writeText(t);
    toast("הועתק ✅", "success");
  } catch {
    prompt("העתק ידנית:", t);
  }
}
function formatMs(ms) {
  if (ms <= 0) return "00:00:00";
  const total = Math.floor(ms / 1000);
  const h = String(Math.floor(total / 3600)).padStart(2,"0");
  const m = String(Math.floor((total % 3600) / 60)).padStart(2,"0");
  const s = String(total % 60).padStart(2,"0");
  return `${h}:${m}:${s}`;
}

// ===== מצב גלובלי =====
let formId = qs().get("id") || "";
let adminKey = qs().get("admin") || "";
let adminHash = "";

let isExpertPage = !!document.getElementById("mainTable");
let isPlayerPage = !!document.getElementById("playerTable");

let formData = {
  matches: [],
  results: {},
  createdAt: 0,
  guessStartAt: null,
  guessEndAt: null,
  guessClosed: false
};

let guessesByPlayer = {};
let resultMode = false;

let expertTimerInterval = null;
let playerTimerInterval = null;

// ===== נתיבים =====
function formRef() { return doc(db, "forms", formId); }
function guessesColRef() { return collection(db, "forms", formId, "guesses"); }
function guessDocRef(player) { return doc(db, "forms", formId, "guesses", player); }

// ===== INIT =====
if (isExpertPage) initExpert();
if (isPlayerPage) initPlayer();

/* ===================== EXPERT ===================== */
async function initExpert() {
  const btnNew = document.getElementById("btnNew");
  const btnCopyExpert = document.getElementById("btnCopyExpert");
  const btnCopyPlayers = document.getElementById("btnCopyPlayers");
  const linkInfo = document.getElementById("linkInfo");

  const btnMode = document.getElementById("btnMode");
  const btnDelete = document.getElementById("btnDelete");
  const btnClear = document.getElementById("btnClear");

  // טיימר
  const btnStartGuess = document.getElementById("btnStartGuess");
  const btnStopGuess  = document.getElementById("btnStopGuess");
  const guessStatus   = document.getElementById("guessStatus");

  const guessAmountEl = document.getElementById("guessAmount");
  const guessUnitEl   = document.getElementById("guessUnit");

  btnNew.addEventListener("click", async () => {
    const newId = makeId(10);
    const newAdminKey = makeKey(28);
    const newAdminHash = await sha256(newAdminKey);

    await setDoc(doc(db, "forms", newId), {
      adminHash: newAdminHash,
      matches: [],
      results: {},
      createdAt: Date.now(),
      guessStartAt: null,
      guessEndAt: null,
      guessClosed: false
    });

    const base = getBaseUrl();
    location.href = `${base}/expert.html?id=${newId}&admin=${encodeURIComponent(newAdminKey)}`;
  });

  if (!formId) {
    linkInfo.textContent = "לחץ 'צור טופס חדש' כדי לקבל קישורים לשיתוף בוואטסאפ.";
    return;
  }

  const snap = await getDoc(formRef());
  if (!snap.exists()) {
    linkInfo.textContent = "הטופס לא קיים. לחץ 'צור טופס חדש'.";
    return;
  }
  adminHash = snap.data().adminHash || "";

  const ok = adminKey ? (await sha256(adminKey)) === adminHash : false;
  if (!ok) {
    linkInfo.textContent = "⚠️ חסר/לא נכון מפתח מומחה בקישור. פתח את קישור המומחה המקורי.";
    disableExpertActions();
  } else {
    enableExpertActions();
    btnMode.disabled = false;
    btnCopyExpert.disabled = false;
    btnCopyPlayers.disabled = false;
    btnStartGuess.disabled = false;
    btnStopGuess.disabled = false;

    const base = getBaseUrl();
    const expertUrl  = `${base}/expert.html?id=${formId}&admin=${encodeURIComponent(adminKey)}`;
    const playersUrl = `${base}/player.html?id=${formId}`;

    linkInfo.innerHTML = `
      <div class="muted">קישור מומחה (שמור לעצמך): <b>${expertUrl}</b></div>
      <div class="muted">קישור שחקנים (לשליחה): <b>${playersUrl}</b></div>
    `;
    btnCopyExpert.addEventListener("click", () => copyText(expertUrl));
    btnCopyPlayers.addEventListener("click", () => copyText(playersUrl));
  }

  onSnapshot(formRef(), async (s) => {
    if (!s.exists()) return;
    const d = s.data();

    formData.matches = Array.isArray(d.matches) ? d.matches : [];
    formData.results = (d.results && typeof d.results === "object") ? d.results : {};
    formData.guessStartAt = d.guessStartAt ?? null;
    formData.guessEndAt = d.guessEndAt ?? null;
    formData.guessClosed = !!d.guessClosed;

    adminHash = d.adminHash || adminHash;

    await loadAllGuesses();
    renderExpertTable();
    renderTotalsOutside(); // סה"כ (שמות מעל מספרים)
    renderExpertGuessStatus(guessStatus);
    startExpertTicker(guessStatus);
  });

  // הוספת משחק
  const form = document.getElementById("matchForm");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!(await isAdminOk())) return toast("אין הרשאה (קישור מומחה בלבד)", "error");

    const match = {
      id: makeId(12),
      day: document.getElementById("day").value.trim(),
      league: document.getElementById("league").value.trim(),
      home: document.getElementById("home").value.trim(),
      away: document.getElementById("away").value.trim()
    };

    const matches = [...formData.matches, match];
    await updateDoc(formRef(), { matches });
    form.reset();
    toast("משחק נוסף ✅", "success");
  });

  // מצב חישוב
  btnMode.addEventListener("click", async () => {
    if (!(await isAdminOk())) return toast("אין הרשאה (קישור מומחה בלבד)", "error");
    resultMode = !resultMode;
    btnMode.textContent = resultMode ? "✅ מצב חישוב נקודות (פעיל)" : "✅ מצב חישוב נקודות (כבוי)";
    toast(resultMode ? "מצב חישוב הופעל" : "מצב חישוב כובה", "info");
  });

  function getDurationMsFromInputs() {
    const amount = Number(guessAmountEl?.value);
    const unit = guessUnitEl?.value || "hours";
    if (!Number.isFinite(amount) || amount <= 0) return null;
    if (unit === "minutes") return amount * 60 * 1000;
    if (unit === "hours")   return amount * 60 * 60 * 1000;
    if (unit === "days")    return amount * 24 * 60 * 60 * 1000;
    return null;
  }

  // התחלת טיימר
  btnStartGuess.addEventListener("click", async () => {
    if (!(await isAdminOk())) return toast("אין הרשאה (קישור מומחה בלבד)", "error");
    const durationMs = getDurationMsFromInputs();
    if (!durationMs) return toast("משך זמן לא תקין", "warning");

    const startAt = Date.now();
    const endAt = startAt + durationMs;

    await updateDoc(formRef(), {
      guessStartAt: startAt,
      guessEndAt: endAt,
      guessClosed: false
    });

    toast("הניחושים נפתחו 🕒", "success");
  });

  // עצירה מוקדמת
  btnStopGuess.addEventListener("click", async () => {
    if (!(await isAdminOk())) return toast("אין הרשאה (קישור מומחה בלבד)", "error");
    await updateDoc(formRef(), {
      guessClosed: true,
      guessEndAt: Date.now()
    });
    toast("ניחושים נסגרו ⏹", "warning");
  });

  // מחיקת משחק
  btnDelete.addEventListener("click", async () => {
    if (!(await isAdminOk())) return toast("אין הרשאה (קישור מומחה בלבד)", "error");
    const n = Number(document.getElementById("deleteIndex").value);
    if (!Number.isFinite(n) || n < 1 || n > formData.matches.length) {
      return toast("מספר שורה לא תקין", "error");
    }

    const idx = n - 1;
    const removed = formData.matches[idx];
    const matches = formData.matches.filter((_, i) => i !== idx);

    const results = { ...(formData.results || {}) };
    if (removed?.id && results[removed.id]) delete results[removed.id];

    const batch = writeBatch(db);
    const snaps = await getDocs(guessesColRef());
    snaps.forEach(gs => {
      const data = gs.data() || {};
      const picks = data.picks || {};
      if (removed?.id && picks[removed.id] !== undefined) {
        delete picks[removed.id];
        batch.set(gs.ref, { picks }, { merge: true });
      }
    });

    batch.update(formRef(), { matches, results });
    await batch.commit();
    document.getElementById("deleteIndex").value = "";
    toast("המשחק נמחק ✅", "success");
  });

  // ניקוי הכל
  btnClear.addEventListener("click", async () => {
    if (!(await isAdminOk())) return toast("אין הרשאה (קישור מומחה בלבד)", "error");
    if (!confirm("למחוק את כל המשחקים, הניחושים והתוצאות?")) return;

    const snaps = await getDocs(guessesColRef());
    const batch = writeBatch(db);
    snaps.forEach(gs => batch.delete(gs.ref));
    batch.update(formRef(), {
      matches: [],
      results: {},
      guessStartAt: null,
      guessEndAt: null,
      guessClosed: false
    });
    await batch.commit();
    toast("הטבלה נוקתה ✅", "success");
  });
}

function disableExpertActions() {
  const ids = ["matchForm","btnDelete","btnClear","btnMode","btnStartGuess","btnStopGuess","guessAmount","guessUnit"];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (el.tagName === "FORM") el.querySelectorAll("input,button,select").forEach(x => x.disabled = true);
    else el.disabled = true;
  });
}
function enableExpertActions() {
  const form = document.getElementById("matchForm");
  if (form) form.querySelectorAll("input,button,select").forEach(x => x.disabled = false);
  ["btnDelete","btnClear","guessAmount","guessUnit"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = false;
  });
}

async function isAdminOk() {
  if (!formId || !adminKey) return false;
  if (!adminHash) {
    const snap = await getDoc(formRef());
    if (!snap.exists()) return false;
    adminHash = snap.data().adminHash || "";
  }
  return (await sha256(adminKey)) === adminHash;
}

async function loadAllGuesses() {
  guessesByPlayer = {};
  const snaps = await getDocs(guessesColRef());
  snaps.forEach(s => {
    const player = s.id;
    const data = s.data() || {};
    guessesByPlayer[player] = data.picks || {};
  });
}

function getGuessState() {
  const startAt = formData.guessStartAt;
  const endAt = formData.guessEndAt;
  const closed = !!formData.guessClosed;

  if (!startAt || !endAt) return { state: "not_started", remainingMs: 0 };
  const now = Date.now();
  const remaining = endAt - now;

  if (closed) return { state: "closed", remainingMs: 0 };
  if (remaining <= 0) return { state: "expired", remainingMs: 0 };
  return { state: "running", remainingMs: remaining };
}

function renderExpertGuessStatus(el) {
  if (!el) return;
  const gs = getGuessState();
  if (gs.state === "not_started") el.textContent = "ניחושים עדיין לא התחילו.";
  if (gs.state === "running") el.textContent = `ניחושים פתוחים. נשאר: ${formatMs(gs.remainingMs)}`;
  if (gs.state === "expired") el.textContent = "הזמן נגמר. הניחושים נסגרו.";
  if (gs.state === "closed") el.textContent = "ניחושים נסגרו ידנית ע״י המומחה.";
}

function startExpertTicker(el) {
  if (expertTimerInterval) clearInterval(expertTimerInterval);
  expertTimerInterval = setInterval(() => renderExpertGuessStatus(el), 1000);
}

// ===== טבלה מומחה: rowspan ליום+ליגה (ברצף) =====
function renderExpertTable() {
  const table = document.getElementById("mainTable");
  if (!table) return;

  table.innerHTML = "";
  const header = document.createElement("tr");
  header.innerHTML = `
    <th>#</th>
    <th>יום המשחק</th>
    <th>ליגה</th>
    <th>קבוצת בית</th>
    <th>קבוצת חוץ</th>
    ${PLAYERS_ORDER.map(p => `<th>${p}</th>`).join("")}
  `;
  table.appendChild(header);

  const matches = formData.matches || [];
  const results = formData.results || {};

  const daySpanAt = {};
  const leagueSpanAt = {};

  // day runs
  let i = 0;
  while (i < matches.length) {
    const day = matches[i].day;
    let span = 1;
    while (i + span < matches.length && matches[i + span].day === day) span++;
    daySpanAt[i] = span;
    i += span;
  }

  // league runs
  i = 0;
  while (i < matches.length) {
    const lg = matches[i].league;
    let span = 1;
    while (i + span < matches.length && matches[i + span].league === lg) span++;
    leagueSpanAt[i] = span;
    i += span;
  }

  for (let r = 0; r < matches.length; r++) {
    const m = matches[r];
    const tr = document.createElement("tr");
    tr.innerHTML += `<td>${r + 1}</td>`;

    if (daySpanAt[r]) {
      const tdDay = document.createElement("td");
      tdDay.textContent = m.day;
      tdDay.rowSpan = daySpanAt[r];
      tr.appendChild(tdDay);
    }

    if (leagueSpanAt[r]) {
      const tdLeague = document.createElement("td");
      tdLeague.textContent = m.league;
      tdLeague.rowSpan = leagueSpanAt[r];
      tr.appendChild(tdLeague);
    }

    tr.innerHTML += `<td>${m.home}</td>`;
    tr.innerHTML += `<td>${m.away}</td>`;

    PLAYERS_ORDER.forEach(player => {
      const matchId = m.id;
      const pick = guessesByPlayer[player]?.[matchId] || "";
      const isGreen = !!results?.[matchId]?.[player];

      const td = document.createElement("td");
      td.textContent = pick;
      td.style.cursor = "pointer";
      if (isGreen) td.style.background = "#b6fcb6";

      td.addEventListener("click", async () => {
        if (!resultMode) return;
        if (!(await isAdminOk())) return toast("אין הרשאה (קישור מומחה בלבד)", "error");
        await toggleGreen(matchId, player);
      });

      tr.appendChild(td);
    });

    table.appendChild(tr);
  }
}

async function toggleGreen(matchId, player) {
  const current = (formData.results && typeof formData.results === "object") ? formData.results : {};
  const results = JSON.parse(JSON.stringify(current));

  results[matchId] = results[matchId] || {};
  if (results[matchId][player]) delete results[matchId][player];
  else results[matchId][player] = true;

  await updateDoc(formRef(), { results });
}

// ===== סה"כ: שמות מעל מספרים + התאמה מדויקת לרוחבי עמודות (colgroup) =====
function renderTotalsOutside() {
  const totalsTable = document.getElementById("totalsTable");
  const mainTable = document.getElementById("mainTable");
  if (!totalsTable || !mainTable) return;

  const results = formData.results || {};
  const totals = {};
  PLAYERS_ORDER.forEach(p => totals[p] = 0);

  Object.keys(results).forEach(matchId => {
    PLAYERS_ORDER.forEach(p => {
      if (results?.[matchId]?.[p]) totals[p]++;
    });
  });

  const values = PLAYERS_ORDER.map(p => totals[p] || 0);
  const max = values.length ? Math.max(...values) : 0;

  totalsTable.innerHTML = "";

  const mainHeader = mainTable.querySelector("tr");
  if (!mainHeader) return;

  const ths = Array.from(mainHeader.children);
  const colgroup = document.createElement("colgroup");
  ths.forEach(th => {
    const col = document.createElement("col");
    col.style.width = `${th.getBoundingClientRect().width}px`;
    colgroup.appendChild(col);
  });
  totalsTable.appendChild(colgroup);

  // שורה 1: שמות מעל המספרים (כמו בטופס)
  const namesRow = document.createElement("tr");
  const emptyTd = document.createElement("td");
  emptyTd.colSpan = 5; // (#, יום, ליגה, בית, חוץ)
  namesRow.appendChild(emptyTd);

  PLAYERS_ORDER.forEach(name => {
    const td = document.createElement("td");
    td.textContent = name;
    td.style.fontWeight = "900";
    namesRow.appendChild(td);
  });
  totalsTable.appendChild(namesRow);

  // שורה 2: סה"כ ניחושים מתחיל מהעמודות של "קבוצת חוץ" והלאה (כל ה-5 הראשונות)
  const totalsRow = document.createElement("tr");
  const labelTd = document.createElement("td");
  labelTd.className = "totals-label";
  labelTd.colSpan = 5;
  labelTd.textContent = 'סה״כ ניחושים';
  totalsRow.appendChild(labelTd);

  PLAYERS_ORDER.forEach(p => {
    const td = document.createElement("td");
    const val = totals[p] || 0;

    if (max > 0 && val === max) {
      td.classList.add("winner");
      td.innerHTML = `${val} <span class="tag">WINNER</span>`;
    } else {
      td.textContent = String(val);
    }
    totalsRow.appendChild(td);
  });

  totalsTable.appendChild(totalsRow);
}

/* ===================== PLAYER ===================== */
async function initPlayer() {
  const info = document.getElementById("playerInfo");
  const timerInfo = document.getElementById("timerInfo");
  const btnSave = document.getElementById("btnSave");
  const playerSel = document.getElementById("player");

  if (!formId) {
    info.textContent = "חסר id בקישור. בקש מהמומחה קישור תקין.";
    btnSave.disabled = true;
    playerSel.disabled = true;
    return;
  }

  onSnapshot(formRef(), async (s) => {
    if (!s.exists()) {
      info.textContent = "הטופס לא קיים. בקש קישור תקין.";
      return;
    }
    const d = s.data();

    formData.matches = Array.isArray(d.matches) ? d.matches : [];
    formData.guessStartAt = d.guessStartAt ?? null;
    formData.guessEndAt = d.guessEndAt ?? null;
    formData.guessClosed = !!d.guessClosed;

    renderPlayerTable();
    renderPlayerTimer(timerInfo, btnSave);
    startPlayerTicker(timerInfo, btnSave);
  });

  playerSel.addEventListener("change", async () => {
    const name = playerSel.value;
    if (!name) return;
    info.textContent = `נבחר: ${name}`;

    const snap = await getDoc(guessDocRef(name));
    const picks = snap.exists() ? (snap.data().picks || {}) : {};
    fillPlayerPicks(picks);
  });

  btnSave.addEventListener("click", async () => {
    const name = playerSel.value;
    if (!name) return toast("בחר שחקן", "warning");

    const gs = getGuessState();
    if (gs.state !== "running") return toast("הניחושים סגורים/לא התחילו", "error");

    const picks = {};
    document.querySelectorAll("select[data-mid]").forEach(sel => {
      const mid = sel.getAttribute("data-mid");
      const val = sel.value;
      if (val) picks[mid] = val;
    });

    await setDoc(guessDocRef(name), { picks }, { merge: true });
    toast("נשמר בענן ✅", "success");
  });
}

function renderPlayerTimer(el, btnSave) {
  if (!el) return;
  const gs = getGuessState();

  const selects = document.querySelectorAll("select[data-mid]");
  const disableAll = (flag) => {
    selects.forEach(s => s.disabled = flag);
    if (btnSave) btnSave.disabled = flag;
  };

  if (gs.state === "not_started") {
    el.textContent = "הניחושים עדיין לא נפתחו. חכה שהמומחה יתחיל את הטיימר.";
    disableAll(true);
    return;
  }
  if (gs.state === "running") {
    el.textContent = `ניחושים פתוחים. נשאר: ${formatMs(gs.remainingMs)}`;
    disableAll(false);
    return;
  }
  if (gs.state === "expired") {
    el.textContent = "הזמן נגמר. הניחושים נסגרו.";
    disableAll(true);
    return;
  }
  if (gs.state === "closed") {
    el.textContent = "המומחה סגר את הניחושים מוקדם.";
    disableAll(true);
    return;
  }
}

function startPlayerTicker(el, btnSave) {
  if (playerTimerInterval) clearInterval(playerTimerInterval);
  playerTimerInterval = setInterval(() => renderPlayerTimer(el, btnSave), 1000);
}

// טבלת שחקן (rowspan יום+ליגה ברצף)
function renderPlayerTable() {
  const table = document.getElementById("playerTable");
  if (!table) return;

  const matches = formData.matches || [];

  const daySpanAt = {};
  const leagueSpanAt = {};

  let i = 0;
  while (i < matches.length) {
    const day = matches[i].day;
    let span = 1;
    while (i + span < matches.length && matches[i + span].day === day) span++;
    daySpanAt[i] = span;
    i += span;
  }

  i = 0;
  while (i < matches.length) {
    const lg = matches[i].league;
    let span = 1;
    while (i + span < matches.length && matches[i + span].league === lg) span++;
    leagueSpanAt[i] = span;
    i += span;
  }

  table.innerHTML = `
    <tr>
      <th>#</th>
      <th>יום המשחק</th>
      <th>ליגה</th>
      <th>משחק</th>
      <th>ניחוש</th>
    </tr>
  `;

  for (let r = 0; r < matches.length; r++) {
    const m = matches[r];
    const tr = document.createElement("tr");

    tr.innerHTML += `<td>${r + 1}</td>`;

    if (daySpanAt[r]) {
      const tdDay = document.createElement("td");
      tdDay.textContent = m.day;
      tdDay.rowSpan = daySpanAt[r];
      tr.appendChild(tdDay);
    }

    if (leagueSpanAt[r]) {
      const tdLeague = document.createElement("td");
      tdLeague.textContent = m.league;
      tdLeague.rowSpan = leagueSpanAt[r];
      tr.appendChild(tdLeague);
    }

    tr.innerHTML += `<td>${m.home} - ${m.away}</td>`;
    tr.innerHTML += `
      <td>
        <select data-mid="${m.id}">
          <option value=""></option>
          <option value="1">1</option>
          <option value="X">X</option>
          <option value="2">2</option>
        </select>
      </td>
    `;
    table.appendChild(tr);
  }
}

function fillPlayerPicks(picks) {
  document.querySelectorAll("select[data-mid]").forEach(sel => {
    const mid = sel.getAttribute("data-mid");
    sel.value = picks?.[mid] || "";
  });
}
