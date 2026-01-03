import { db } from "./firebase.js";
import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  onSnapshot,
  collection,
  getDocs,
  deleteDoc,
  writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// ===== קבועים =====
const PLAYERS_ORDER = ["חגי","ראזי","סעיד","ווסים","צביר","שמעון"];

// ===== עזרי URL =====
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
  try { await navigator.clipboard.writeText(t); alert("הועתק!"); }
  catch { prompt("העתק ידנית:", t); }
}

// ===== מצב גלובלי =====
let formId = qs().get("id") || "";
let adminKey = qs().get("admin") || ""; // רק מומחה
let adminHash = ""; // נשמר בדוקומנט
let isExpertPage = !!document.getElementById("mainTable");
let isPlayerPage = !!document.getElementById("playerTable");

let formData = {
  matches: [],          // [{id, day, league, home, away}]
  results: {},          // { matchId: {player:true} }
  createdAt: 0
};

let guessesByPlayer = {}; // {player: {matchId:"1|X|2"}}
let resultMode = false;

// ===== נתיבים =====
function formRef() { return doc(db, "forms", formId); }
function guessesColRef() { return collection(db, "forms", formId, "guesses"); }
function guessDocRef(player) { return doc(db, "forms", formId, "guesses", player); }

// ===== INIT לפי דף =====
if (isExpertPage) initExpert();
if (isPlayerPage) initPlayer();

// ---------------- EXPERT ----------------
async function initExpert() {
  const btnNew = document.getElementById("btnNew");
  const btnCopyExpert = document.getElementById("btnCopyExpert");
  const btnCopyPlayers = document.getElementById("btnCopyPlayers");
  const linkInfo = document.getElementById("linkInfo");

  const btnMode = document.getElementById("btnMode");
  const btnDelete = document.getElementById("btnDelete");
  const btnClear = document.getElementById("btnClear");

  btnNew.addEventListener("click", async () => {
    // יוצר טופס חדש ומעביר אותך לקישור מומחה
    const newId = makeId(10);
    const newAdminKey = makeKey(28);
    const newAdminHash = await sha256(newAdminKey);

    await setDoc(doc(db, "forms", newId), {
      adminHash: newAdminHash,
      matches: [],
      results: {},
      createdAt: Date.now()
    });

    const base = getBaseUrl();
    const expertUrl = `${base}/expert.html?id=${newId}&admin=${encodeURIComponent(newAdminKey)}`;
    location.href = expertUrl;
  });

  // אם אין id -> תציג הודעה
  if (!formId) {
    linkInfo.textContent = "לחץ 'צור טופס חדש' כדי לקבל קישורים לשיתוף בוואטסאפ.";
    return;
  }

  // טען adminHash מהמסמך
  const snap = await getDoc(formRef());
  if (!snap.exists()) {
    linkInfo.textContent = "הטופס לא קיים. לחץ 'צור טופס חדש'.";
    return;
  }
  adminHash = snap.data().adminHash || "";

  // בדיקת מפתח מומחה (בדיקה ל-UI. לא אבטחה מלאה בלי Auth)
  const ok = adminKey ? (await sha256(adminKey)) === adminHash : false;
  if (!ok) {
    linkInfo.textContent = "⚠️ חסר/לא נכון מפתח מומחה בקישור. פתח את קישור המומחה המקורי.";
    // עדיין ניתן לצפות, אבל ננטרל פעולות
    disableExpertActions();
  } else {
    enableExpertActions();
    btnMode.disabled = false;
    btnCopyExpert.disabled = false;
    btnCopyPlayers.disabled = false;

    const base = getBaseUrl();
    const expertUrl = `${base}/expert.html?id=${formId}&admin=${encodeURIComponent(adminKey)}`;
    const playersUrl = `${base}/player.html?id=${formId}`;

    linkInfo.innerHTML = `
      <div>קישור מומחה (שמור לעצמך): <b>${expertUrl}</b></div>
      <div>קישור שחקנים (לשליחה בוואטסאפ): <b>${playersUrl}</b></div>
    `;

    btnCopyExpert.addEventListener("click", () => copyText(expertUrl));
    btnCopyPlayers.addEventListener("click", () => copyText(playersUrl));
  }

  // מאזין למסמך הטופס (משחקים + תוצאות)
  onSnapshot(formRef(), async (s) => {
    if (!s.exists()) return;
    const d = s.data();
    formData.matches = Array.isArray(d.matches) ? d.matches : [];
    formData.results = d.results && typeof d.results === "object" ? d.results : {};
    adminHash = d.adminHash || adminHash;

    // למשוך ניחושים מכל השחקנים
    await loadAllGuesses();
    renderExpertTable();
    renderScoreTable();
  });

  // הוספת משחק
  const form = document.getElementById("matchForm");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!(await isAdminOk())) return alert("אין הרשאה (קישור מומחה בלבד)");

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
  });

  // מצב חישוב
  btnMode.addEventListener("click", async () => {
    if (!(await isAdminOk())) return alert("אין הרשאה (קישור מומחה בלבד)");
    resultMode = !resultMode;
    btnMode.textContent = resultMode ? "מצב חישוב נקודות (פעיל)" : "מצב חישוב נקודות (כבוי)";
  });

  // מחיקת משחק לפי מספר שורה
  btnDelete.addEventListener("click", async () => {
    if (!(await isAdminOk())) return alert("אין הרשאה (קישור מומחה בלבד)");

    const n = Number(document.getElementById("deleteIndex").value);
    if (!Number.isFinite(n) || n < 1 || n > formData.matches.length) {
      return alert("מספר שורה לא תקין");
    }

    const idx = n - 1;
    const removed = formData.matches[idx];
    const matches = formData.matches.filter((_, i) => i !== idx);

    // למחוק גם תוצאות של המשחק הזה
    const results = { ...(formData.results || {}) };
    if (removed?.id && results[removed.id]) delete results[removed.id];

    // למחוק גם את הניחושים של המשחק הזה אצל כולם
    // (נעשה דרך batch על מסמכי guesses)
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
  });

  // ניקוי הכל
  btnClear.addEventListener("click", async () => {
    if (!(await isAdminOk())) return alert("אין הרשאה (קישור מומחה בלבד)");
    if (!confirm("למחוק את כל המשחקים, הניחושים והתוצאות?")) return;

    // מחיקת כל מסמכי guesses
    const snaps = await getDocs(guessesColRef());
    const batch = writeBatch(db);
    snaps.forEach(gs => batch.delete(gs.ref));
    batch.update(formRef(), { matches: [], results: {} });
    await batch.commit();
  });
}

function disableExpertActions() {
  const ids = ["matchForm","btnDelete","btnClear","btnMode"];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (el.tagName === "FORM") {
      el.querySelectorAll("input,button,select").forEach(x => x.disabled = true);
    } else {
      el.disabled = true;
    }
  });
}
function enableExpertActions() {
  const form = document.getElementById("matchForm");
  if (form) form.querySelectorAll("input,button,select").forEach(x => x.disabled = false);
  const btnDelete = document.getElementById("btnDelete");
  const btnClear = document.getElementById("btnClear");
  const btnMode = document.getElementById("btnMode");
  if (btnDelete) btnDelete.disabled = false;
  if (btnClear) btnClear.disabled = false;
  // btnMode יופעל רק אחרי בדיקת admin
}

async function isAdminOk() {
  if (!formId || !adminKey) return false;
  if (!adminHash) {
    const snap = await getDoc(formRef());
    if (!snap.exists()) return false;
    adminHash = snap.data().adminHash || "";
  }
  const h = await sha256(adminKey);
  return h === adminHash;
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

function renderExpertTable() {
  const table = document.getElementById("mainTable");
  if (!table) return;

  table.innerHTML = "";

  // Header (ימין->שמאל: # יום ליגה בית חוץ ואז שחקנים)
  const header = document.createElement("tr");
  header.innerHTML = `
    <th>#</th>
    <th>יום</th>
    <th>ליגה</th>
    <th>בית</th>
    <th>חוץ</th>
    ${PLAYERS_ORDER.map(p => `<th>${p}</th>`).join("")}
  `;
  table.appendChild(header);

  const matches = formData.matches || [];
  const results = formData.results || {};

  // rowspan ליום לפי רצף בלבד (כמו שביקשת)
  let i = 0;
  while (i < matches.length) {
    const day = matches[i].day;
    let span = 1;
    while (i + span < matches.length && matches[i + span].day === day) span++;

    // שורה ראשונה לבלוק היום
    const tr = document.createElement("tr");
    tr.innerHTML += `<td>${i + 1}</td>`;

    const tdDay = document.createElement("td");
    tdDay.textContent = day;
    tdDay.rowSpan = span;
    tr.appendChild(tdDay);

    tr.innerHTML += `
      <td>${matches[i].league}</td>
      <td>${matches[i].home}</td>
      <td>${matches[i].away}</td>
    `;

    PLAYERS_ORDER.forEach(player => {
      const matchId = matches[i].id;
      const pick = guessesByPlayer[player]?.[matchId] || "";
      const isGreen = !!results?.[matchId]?.[player];

      const td = document.createElement("td");
      td.textContent = pick;
      td.style.cursor = "pointer";
      if (isGreen) td.style.background = "#b6fcb6";

      td.addEventListener("click", async () => {
        if (!resultMode) return;
        if (!(await isAdminOk())) return alert("אין הרשאה (קישור מומחה בלבד)");
        await toggleGreen(matchId, player);
      });

      tr.appendChild(td);
    });

    table.appendChild(tr);

    // שאר השורות באותו יום
    for (let j = 1; j < span; j++) {
      const idx = i + j;
      const row = document.createElement("tr");
      row.innerHTML += `<td>${idx + 1}</td>`;
      row.innerHTML += `
        <td>${matches[idx].league}</td>
        <td>${matches[idx].home}</td>
        <td>${matches[idx].away}</td>
      `;

      PLAYERS_ORDER.forEach(player => {
        const matchId = matches[idx].id;
        const pick = guessesByPlayer[player]?.[matchId] || "";
        const isGreen = !!results?.[matchId]?.[player];

        const td = document.createElement("td");
        td.textContent = pick;
        td.style.cursor = "pointer";
        if (isGreen) td.style.background = "#b6fcb6";

        td.addEventListener("click", async () => {
          if (!resultMode) return;
          if (!(await isAdminOk())) return alert("אין הרשאה (קישור מומחה בלבד)");
          await toggleGreen(matchId, player);
        });

        row.appendChild(td);
      });

      table.appendChild(row);
    }

    i += span;
  }
}

async function toggleGreen(matchId, player) {
  const results = structuredClone(formData.results || {});
  results[matchId] = results[matchId] || {};
  if (results[matchId][player]) delete results[matchId][player];
  else results[matchId][player] = true;

  await updateDoc(formRef(), { results });
}

// ניקוד: סופר כמה תאים ירוקים לכל שחקן
function renderScoreTable() {
  const table = document.getElementById("scoreTable");
  if (!table) return;

  const results = formData.results || {};
  const scores = {};
  PLAYERS_ORDER.forEach(p => scores[p] = 0);

  // לכל matchId שיש בו ירוקים
  Object.keys(results).forEach(matchId => {
    PLAYERS_ORDER.forEach(p => {
      if (results?.[matchId]?.[p]) scores[p]++;
    });
  });

  table.innerHTML = `
    <tr><th>שחקן</th><th>ניחושים נכונים</th></tr>
    ${PLAYERS_ORDER.map(p => `<tr><td>${p}</td><td>${scores[p]}</td></tr>`).join("")}
  `;
}

// ---------------- PLAYER ----------------
async function initPlayer() {
  const info = document.getElementById("playerInfo");
  const btnSave = document.getElementById("btnSave");
  const playerSel = document.getElementById("player");

  if (!formId) {
    info.textContent = "חסר id בקישור. בקש מהמומחה קישור תקין.";
    btnSave.disabled = true;
    playerSel.disabled = true;
    return;
  }

  // מאזין למסמך הטופס כדי לצייר משחקים
  onSnapshot(formRef(), async (s) => {
    if (!s.exists()) {
      info.textContent = "הטופס לא קיים. בקש קישור תקין.";
      return;
    }
    const d = s.data();
    formData.matches = Array.isArray(d.matches) ? d.matches : [];
    renderPlayerTable();
  });

  playerSel.addEventListener("change", async () => {
    const name = playerSel.value;
    if (!name) return;
    info.textContent = `נבחר: ${name}`;
    // טען את הניחושים של השחקן (אם קיימים)
    const snap = await getDoc(guessDocRef(name));
    const picks = snap.exists() ? (snap.data().picks || {}) : {};
    fillPlayerPicks(picks);
  });

  btnSave.addEventListener("click", async () => {
    const name = playerSel.value;
    if (!name) return alert("בחר שם שחקן");

    const picks = {};
    document.querySelectorAll("select[data-mid]").forEach(sel => {
      const mid = sel.getAttribute("data-mid");
      const val = sel.value;
      if (val) picks[mid] = val;
    });

    await setDoc(guessDocRef(name), { picks }, { merge: true });
    alert("נשמר בענן ✅");
  });
}

function renderPlayerTable() {
  const table = document.getElementById("playerTable");
  if (!table) return;

  const matches = formData.matches || [];

  table.innerHTML = `
    <tr>
      <th>#</th>
      <th>יום</th>
      <th>ליגה</th>
      <th>משחק</th>
      <th>ניחוש</th>
    </tr>
    ${matches.map((m, idx) => `
      <tr>
        <td>${idx + 1}</td>
        <td>${m.day}</td>
        <td>${m.league}</td>
        <td>${m.home} - ${m.away}</td>
        <td>
          <select data-mid="${m.id}">
            <option value=""></option>
            <option value="1">1</option>
            <option value="X">X</option>
            <option value="2">2</option>
          </select>
        </td>
      </tr>
    `).join("")}
  `;
}

function fillPlayerPicks(picks) {
  document.querySelectorAll("select[data-mid]").forEach(sel => {
    const mid = sel.getAttribute("data-mid");
    sel.value = picks?.[mid] || "";
  });
}
