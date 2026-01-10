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

/* =========================
   PLAYERS
   ========================= */
const DEFAULT_PLAYERS = ["חגי","ראזי","סעיד","ווסים","צביר","שמעון"];

function getPlayersOrder() {
  const arr = Array.isArray(formData.players) ? formData.players : DEFAULT_PLAYERS;
  const fixed = DEFAULT_PLAYERS.filter(p => arr.includes(p));
  const extras = arr.filter(p => !DEFAULT_PLAYERS.includes(p));
  return [...fixed, ...extras];
}

/* =========================
   Helpers
   ========================= */
function qs() { return new URLSearchParams(location.search); }

function getBaseUrl() {
  const pathParts = location.pathname.split("/").filter(Boolean);
  const isGithubPages = location.hostname.endsWith("github.io");
  const repoPart = isGithubPages && pathParts.length ? `/${pathParts[0]}` : "";
  return `${location.origin}${repoPart}`;
}

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

/* =========================
   Copy/Share full table image (mobile friendly)
   ========================= */
async function copyCaptureAreaImage() {
  const area = document.getElementById("captureArea");
  if (!area) return toast("לא נמצא אזור צילום", "error");
  if (!window.html2canvas) return toast("html2canvas לא נטען", "error");

  toast("מכין תמונה מלאה כמו במסך…", "info", 1400);

  // מצב צילום (מסתיר כפתורים וכו')
  document.body.classList.add("capture-mode");

  const prevScrollY = window.scrollY;
  const prevScrollX = window.scrollX;
  window.scrollTo(0, 0);
  await new Promise(r => setTimeout(r, 120));

  // ✅ מידות אמיתיות של כל התוכן
  const fullW = area.scrollWidth;
  const fullH = area.scrollHeight;

  // ✅ רוצים שהתמונה תצא ברוחב מסך (כמו zoom-out בטלפון)
  const viewportW = Math.min(document.documentElement.clientWidth, window.innerWidth || 360);
  const padding = 8; // קצת שוליים
  const targetW = Math.max(280, viewportW - padding * 2);

  // scale שיכניס את הכל לרוחב המסך
  const fitScale = Math.min(1, targetW / fullW);
  const targetH = Math.ceil(fullH * fitScale);

  // ✅ יוצרים "סטודיו צילום" זמני
  const stage = document.createElement("div");
  stage.style.position = "fixed";
  stage.style.left = "0";
  stage.style.top = "0";
  stage.style.width = targetW + "px";
  stage.style.height = targetH + "px";
  stage.style.background = "#fff";
  stage.style.zIndex = "999999";
  stage.style.overflow = "hidden";
  stage.style.padding = "0";
  stage.style.margin = "0";

  // משכפלים את אזור הצילום כדי לא לשבור את הדף
  const clone = area.cloneNode(true);

  // ✅ חשוב: להעלים גלילות פנימיות כדי שיראו את הכל
  clone.querySelectorAll(".table-wrap").forEach(w => (w.style.overflow = "visible"));
  clone.style.overflow = "visible";
  clone.style.maxWidth = "none";
  clone.style.width = fullW + "px";

  // ✅ מקטינים כמו zoom-out
  clone.style.transformOrigin = "top left";
  clone.style.transform = `scale(${fitScale})`;

  stage.appendChild(clone);
  document.body.appendChild(stage);

  // תן רגע ל-layout
  await new Promise(r => setTimeout(r, 140));

  // ✅ מצלמים את ה-stage שהוא כבר מוקטן למסך
  const canvas = await window.html2canvas(stage, {
    backgroundColor: "#ffffff",
    scale: 2,
    useCORS: true,
    allowTaint: true,
    width: targetW,
    height: targetH,
    windowWidth: targetW,
    windowHeight: targetH,
    scrollX: 0,
    scrollY: 0
  });

  // ניקוי
  stage.remove();
  document.body.classList.remove("capture-mode");
  window.scrollTo(prevScrollX, prevScrollY);

  const dataUrl = canvas.toDataURL("image/png");

  try {
    const blob = await (await fetch(dataUrl)).blob();
    const file = new File([blob], `winner-table-${formId || "form"}.png`, { type: "image/png" });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        files: [file],
        title: "Winner Table",
        text: "טבלת משחקים + ניחושים"
      });
      toast("נפתח שיתוף ✅ בחר WhatsApp", "success", 2800);
      return;
    }
  } catch (_) {}

  const link = document.createElement("a");
  link.download = `winner-table-${formId || "form"}.png`;
  link.href = dataUrl;
  link.click();
  toast("התמונה נשמרה ✅", "success", 2600);
}



/* =========================
   Global state
   ========================= */
let formId = qs().get("id") || "";
let adminKey = qs().get("admin") || "";
let adminHash = "";

let isExpertPage = !!document.getElementById("mainTable");
let isPlayerPage = !!document.getElementById("playerTable");

let formData = {
  matches: [],
  results: {},
  finalResults: {},
  players: DEFAULT_PLAYERS.slice(),
  createdAt: 0,
  guessStartAt: null,
  guessEndAt: null,
  guessClosed: false
};

let guessesByPlayer = {};
let editingIndex = -1;

let expertTimerInterval = null;
let playerTimerInterval = null;

/* =========================
   Firestore paths
   ========================= */
function formRef() { return doc(db, "forms", formId); }
function guessesColRef() { return collection(db, "forms", formId, "guesses"); }
function guessDocRef(player) { return doc(db, "forms", formId, "guesses", player); }

/* =========================
   INIT
   ========================= */
if (isExpertPage) initExpert();
if (isPlayerPage) initPlayer();

/* =========================
   datetime-local helpers
   ========================= */
function localDatetimeValueToMs(v) {
  const d = new Date(v);
  return d.getTime();
}
function msToLocalDatetimeValue(ms) {
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/* =========================
   Timer state
   ========================= */
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

/* =========================
   ✅ Rowspan by RUNS (sequences only)
   ========================= */
function buildRunSpans(list, keyFn) {
  const spans = {}; // startIndex -> length
  let i = 0;
  while (i < list.length) {
    const key = keyFn(list[i]);
    let j = i + 1;
    while (j < list.length && keyFn(list[j]) === key) j++;
    spans[i] = (j - i);
    i = j;
  }
  return spans;
}

/* ===================== EXPERT ===================== */
async function initExpert() {
  const btnNew = document.getElementById("btnNew");
  const btnCopyExpert = document.getElementById("btnCopyExpert");
  const btnCopyPlayers = document.getElementById("btnCopyPlayers");
  const btnCopyImage = document.getElementById("btnCopyImage");
  const linkInfo = document.getElementById("linkInfo");
  const btnDelete = document.getElementById("btnDelete");
  const btnClear = document.getElementById("btnClear");

  const btnStartGuess = document.getElementById("btnStartGuess");
  const btnStopGuess  = document.getElementById("btnStopGuess");
  const guessStatus   = document.getElementById("guessStatus");
  const guessEndEl    = document.getElementById("guessEnd");

  const btnAddPlayer = document.getElementById("btnAddPlayer");
  const btnDeletePlayer = document.getElementById("btnDeletePlayer");
  const newPlayerNameEl = document.getElementById("newPlayerName");
  const deletePlayerNameEl = document.getElementById("deletePlayerName");

  // ✅ עריכה נפרדת
  const editCard = document.getElementById("editCard");
  const editIndexEl = document.getElementById("editIndex");
  const btnLoadEdit = document.getElementById("btnLoadEdit");
  const btnCancelEdit = document.getElementById("btnCancelEdit");
  const editForm = document.getElementById("editForm");
  const btnSaveEdit = document.getElementById("btnSaveEdit");

  const editDay = document.getElementById("editDay");
  const editLeague = document.getElementById("editLeague");
  const editHome = document.getElementById("editHome");
  const editAway = document.getElementById("editAway");

  function setEditEnabled(enabled) {
    if (btnSaveEdit) btnSaveEdit.disabled = !enabled;
    if (btnCancelEdit) btnCancelEdit.disabled = !enabled;
    if (editDay) editDay.disabled = !enabled;
    if (editLeague) editLeague.disabled = !enabled;
    if (editHome) editHome.disabled = !enabled;
    if (editAway) editAway.disabled = !enabled;
  }

  function clearEditFields() {
    if (editDay) editDay.value = "";
    if (editLeague) editLeague.value = "";
    if (editHome) editHome.value = "";
    if (editAway) editAway.value = "";
  }

  function exitEditMode() {
    editingIndex = -1;
    clearEditFields();
    setEditEnabled(false);
    if (editIndexEl) editIndexEl.value = "";
  }

  setEditEnabled(false);

  btnNew?.addEventListener("click", async () => {
    const newId = makeId(10);
    const newAdminKey = makeKey(28);
    const newAdminHash = await sha256(newAdminKey);

    await setDoc(doc(db, "forms", newId), {
      adminHash: newAdminHash,
      matches: [],
      results: {},
      finalResults: {},
      players: DEFAULT_PLAYERS.slice(),
      createdAt: Date.now(),
      guessStartAt: null,
      guessEndAt: null,
      guessClosed: false
    });

    const base = getBaseUrl();
    location.href = `${base}/expert.html?id=${newId}&admin=${encodeURIComponent(newAdminKey)}`;
  });

  if (!formId) {
    if (linkInfo) linkInfo.textContent = "לחץ 'צור טופס חדש' כדי לקבל קישורים לשיתוף בוואטסאפ.";
    return;
  }

  const snap = await getDoc(formRef());
  if (!snap.exists()) {
    if (linkInfo) linkInfo.textContent = "הטופס לא קיים. לחץ 'צור טופס חדש'.";
    return;
  }
  adminHash = snap.data().adminHash || "";

  const ok = adminKey ? (await sha256(adminKey)) === adminHash : false;

  if (!ok) {
    if (linkInfo) linkInfo.textContent = "⚠️ חסר/לא נכון מפתח מומחה בקישור. פתח את קישור המומחה המקורי.";
    disableExpertActions();
    if (btnCopyImage) btnCopyImage.disabled = true;
    exitEditMode();
  } else {
    enableExpertActions();
    if (btnCopyExpert) btnCopyExpert.disabled = false;
    if (btnCopyPlayers) btnCopyPlayers.disabled = false;
    if (btnStartGuess) btnStartGuess.disabled = false;
    if (btnStopGuess) btnStopGuess.disabled = false;

    if (btnLoadEdit) btnLoadEdit.disabled = false;

    if (btnCopyImage) {
      btnCopyImage.disabled = false;
      btnCopyImage.addEventListener("click", copyCaptureAreaImage);
    }

    const base = getBaseUrl();
    const expertUrl  = `${base}/expert.html?id=${formId}&admin=${encodeURIComponent(adminKey)}`;
    const playersUrl = `${base}/player.html?id=${formId}`;

    if (linkInfo) {
      linkInfo.innerHTML = `
        <div class="muted">קישור מומחה (שמור לעצמך): <b>${expertUrl}</b></div>
        <div class="muted">קישור שחקנים (לשליחה): <b>${playersUrl}</b></div>
        <div class="muted">📌 בטלפון: לחץ “צילום/שיתוף” ואז בחר WhatsApp.</div>
      `;
    }

    btnCopyExpert?.addEventListener("click", () => copyText(expertUrl));
    btnCopyPlayers?.addEventListener("click", () => copyText(playersUrl));
  }

onSnapshot(formRef(), async (s) => {
  if (!s.exists()) return;
  const d = s.data();

  formData.matches = Array.isArray(d.matches) ? d.matches : [];
  formData.results = (d.results && typeof d.results === "object") ? d.results : {};
  formData.finalResults = (d.finalResults && typeof d.finalResults === "object") ? d.finalResults : {};

  // ✅ זה התיקון
  formData.players = Array.isArray(d.players) ? d.players : DEFAULT_PLAYERS.slice();

  
  await loadAllGuesses();
  renderResultsTable();
  renderExpertTable();
  renderTotalsOutside();
});


  const matchForm = document.getElementById("matchForm");
  matchForm?.addEventListener("submit", async (e) => {
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
    matchForm.reset();
    toast("משחק נוסף ✅", "success");
  });

  btnLoadEdit?.addEventListener("click", async () => {
    if (!(await isAdminOk())) return toast("אין הרשאה (קישור מומחה בלבד)", "error");

    const n = Number((editIndexEl?.value || "").trim());
    if (!Number.isFinite(n) || n < 1 || n > formData.matches.length) {
      return toast("מספר שורה לא תקין", "error");
    }

    const idx = n - 1;
    const m = formData.matches[idx];
    if (!m) return toast("שורה לא נמצאה", "error");

    editingIndex = idx;
    if (editDay) editDay.value = m.day || "";
    if (editLeague) editLeague.value = m.league || "";
    if (editHome) editHome.value = m.home || "";
    if (editAway) editAway.value = m.away || "";

    setEditEnabled(true);
    editCard?.scrollIntoView({ behavior: "smooth", block: "start" });

    toast(`נטענה שורה ${n} לעריכה ✏️`, "success");
  });

  btnCancelEdit?.addEventListener("click", async () => {
    if (!(await isAdminOk())) return toast("אין הרשאה (קישור מומחה בלבד)", "error");
    exitEditMode();
    toast("בוטלה עריכה", "info");
  });

  // ✅ כאן התיקון המרכזי: אין יותר `};` אחרי זה
  editForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!(await isAdminOk())) return toast("אין הרשאה (קישור מומחה בלבד)", "error");

    if (editingIndex < 0 || editingIndex >= formData.matches.length) {
      return toast("אין שורה טעונה לעריכה", "warning");
    }

    const day = (editDay?.value || "").trim();
    const league = (editLeague?.value || "").trim();
    const home = (editHome?.value || "").trim();
    const away = (editAway?.value || "").trim();

    if (!day || !league || !home || !away) {
      return toast("מלא את כל השדות לפני שמירה", "warning");
    }

    const matches = [...formData.matches];
    const old = matches[editingIndex];
    matches[editingIndex] = { ...old, day, league, home, away };

    await updateDoc(formRef(), { matches });

    toast(`עודכנה שורה ${editingIndex + 1} ✅`, "success");
    exitEditMode();
  });

  // ✅ הוספת שחקן — עכשיו זה בתוך initExpert ולכן יעבוד
  btnAddPlayer?.addEventListener("click", async () => {
  if (!(await isAdminOk())) return toast("אין הרשאה (קישור מומחה בלבד)", "error");

  const name = (newPlayerNameEl?.value || "").trim();
  if (!name) return toast("הכנס שם שחקן", "warning");

  const current = Array.isArray(formData.players) ? [...formData.players] : DEFAULT_PLAYERS.slice();
  if (current.includes(name)) return toast("השם כבר קיים", "warning");

  current.push(name);
  await updateDoc(formRef(), { players: current });

  // ✅ תוספת חשובה: שיופיע מיד בטבלה בעמוד המומחה
  formData.players = current;
  renderExpertTable();
  renderTotalsOutside();

  if (newPlayerNameEl) newPlayerNameEl.value = "";
  toast("שחקן נוסף ✅", "success");
});


  btnDeletePlayer?.addEventListener("click", async () => {
    if (!(await isAdminOk())) return toast("אין הרשאה (קישור מומחה בלבד)", "error");

    const name = (deletePlayerNameEl?.value || "").trim();
    if (!name) return toast("כתוב שם למחיקה", "warning");

    if (DEFAULT_PLAYERS.includes(name)) return toast("אי אפשר למחוק שחקן קבוע", "error");

    const current = Array.isArray(formData.players) ? [...formData.players] : DEFAULT_PLAYERS.slice();
    if (!current.includes(name)) return toast("שם לא נמצא", "error");

    const updatedPlayers = current.filter(p => p !== name);

    const results = JSON.parse(JSON.stringify(formData.results || {}));
    Object.keys(results).forEach(mid => {
      if (results[mid]?.[name]) delete results[mid][name];
      if (results[mid] && Object.keys(results[mid]).length === 0) delete results[mid];
    });

    const batch = writeBatch(db);
    batch.update(formRef(), { players: updatedPlayers, results });
    batch.delete(guessDocRef(name));
    await batch.commit();

    if (deletePlayerNameEl) deletePlayerNameEl.value = "";
    toast("שחקן נמחק ✅", "success");
  });

  btnStartGuess?.addEventListener("click", async () => {
    if (!(await isAdminOk())) return toast("אין הרשאה (קישור מומחה בלבד)", "error");

    const endValue = (guessEndEl?.value || "").trim();
    if (!endValue) return toast("בחר תאריך ושעה סופיים", "warning");

    const endAt = localDatetimeValueToMs(endValue);
    if (!Number.isFinite(endAt)) return toast("תאריך/שעה לא תקינים", "error");

    const now = Date.now();
    if (endAt <= now) return toast("התאריך/שעה חייבים להיות בעתיד", "warning");

    await updateDoc(formRef(), {
      guessStartAt: now,
      guessEndAt: endAt,
      guessClosed: false
    });

    toast("הניחושים נפתחו 🕒", "success");
  });

  btnStopGuess?.addEventListener("click", async () => {
    if (!(await isAdminOk())) return toast("אין הרשאה (קישור מומחה בלבד)", "error");
    await updateDoc(formRef(), {
      guessClosed: true,
      guessEndAt: Date.now()
    });
    toast("ניחושים נסגרו ⏹", "warning");
  });

  btnDelete?.addEventListener("click", async () => {
    if (!(await isAdminOk())) return toast("אין הרשאה (קישור מומחה בלבד)", "error");

    const n = Number(document.getElementById("deleteIndex").value);
    if (!Number.isFinite(n) || n < 1 || n > formData.matches.length) {
      return toast("מספר שורה לא תקין", "error");
    }

    const idx = n - 1;
    const removed = formData.matches[idx];
    const matches = formData.matches.filter((_, i) => i !== idx);

    const results = { ...(formData.results || {}) };
    const finalResults = { ...(formData.finalResults || {}) };
    if (removed?.id && finalResults[removed.id] !== undefined) delete finalResults[removed.id];

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

    batch.update(formRef(), { matches, results, finalResults });
    await batch.commit();

    if (editingIndex === idx) exitEditMode();
    if (editingIndex > idx) editingIndex -= 1;

    document.getElementById("deleteIndex").value = "";
    toast("המשחק נמחק ✅", "success");
  });

  btnClear?.addEventListener("click", async () => {
    if (!(await isAdminOk())) return toast("אין הרשאה (קישור מומחה בלבד)", "error");
    if (!confirm("למחוק את כל המשחקים, הניחושים והתוצאות?")) return;

    const snaps = await getDocs(guessesColRef());
    const batch = writeBatch(db);
    snaps.forEach(gs => batch.delete(gs.ref));

    batch.update(formRef(), {
      matches: [],
      results: {},
      finalResults: {},
      players: DEFAULT_PLAYERS.slice(),
      guessStartAt: null,
      guessEndAt: null,
      guessClosed: false
    });

    await batch.commit();
    exitEditMode();
    toast("הטבלה נוקתה ✅", "success");
  });

} // ✅ סוף initExpert — כאן ורק כאן!

function disableExpertActions() {
  const ids = [
    "matchForm","btnDelete","btnClear",
    "btnStartGuess","btnStopGuess","guessEnd",
    "newPlayerName","btnAddPlayer","deletePlayerName","btnDeletePlayer",
    "editIndex","btnLoadEdit","btnCancelEdit","editForm","btnSaveEdit","editDay","editLeague","editHome","editAway"
  ];
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

  [
    "btnDelete","btnClear","guessEnd",
    "newPlayerName","btnAddPlayer","deletePlayerName","btnDeletePlayer",
    "editIndex","btnLoadEdit"
  ].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = false;
  });

  ["btnCancelEdit","btnSaveEdit","editDay","editLeague","editHome","editAway"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = true;
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

/* =======================================================
   Results + Table + Totals
   ======================================================= */
function renderResultsTable() {
  const table = document.getElementById("resultsTable");
  if (!table) return;

  const matches = formData.matches || [];
  const finals = formData.finalResults || {};

  table.innerHTML = "";

  const header = document.createElement("tr");
  header.innerHTML = `<th>תוצאה</th>`;
  table.appendChild(header);

  const canEditPromise = isExpertPage ? isAdminOk() : Promise.resolve(false);

  canEditPromise.then((canEdit) => {
    table.innerHTML = "";
    table.appendChild(header);

    matches.forEach((m) => {
      const mid = m.id;
      const tr = document.createElement("tr");
      const td = document.createElement("td");

      if (canEdit) {
        const sel = document.createElement("select");
        sel.setAttribute("data-mid", mid);
        sel.innerHTML = `
          <option value=""></option>
          <option value="1">1</option>
          <option value="X">X</option>
          <option value="2">2</option>
        `;
        sel.value = finals[mid] || "";

        sel.addEventListener("change", async () => {
          if (!(await isAdminOk())) return toast("אין הרשאה (קישור מומחה בלבד)", "error");
          const next = sel.value || "";

          const updated = { ...(formData.finalResults || {}) };
          if (!next) delete updated[mid];
          else updated[mid] = next;

          await updateDoc(formRef(), { finalResults: updated });
          toast("התוצאה עודכנה ✅", "success", 1600);
        });

        td.appendChild(sel);
      } else {
        td.textContent = finals[mid] || "";
      }

      tr.appendChild(td);
      table.appendChild(tr);
    });
  });
}

function renderExpertTable() {
  const table = document.getElementById("mainTable");
  if (!table) return;

  const PLAYERS_ORDER = getPlayersOrder();
  const matches = formData.matches || [];

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

  const daySpanAt = buildRunSpans(matches, (m) => (m.day || "").trim());
  const leagueSpanAt = buildRunSpans(matches, (m) => (m.league || "").trim());

  for (let r = 0; r < matches.length; r++) {
    const m = matches[r];
    const tr = document.createElement("tr");

    tr.insertAdjacentHTML("beforeend", `<td>${r + 1}</td>`);

    if (daySpanAt[r]) {
      const tdDay = document.createElement("td");
      tdDay.textContent = m.day || "";
      tdDay.rowSpan = daySpanAt[r];
      tr.appendChild(tdDay);
    }

    if (leagueSpanAt[r]) {
      const tdLeague = document.createElement("td");
      tdLeague.textContent = m.league || "";
      tdLeague.rowSpan = leagueSpanAt[r];
      tr.appendChild(tdLeague);
    }

    tr.insertAdjacentHTML("beforeend", `<td>${m.home || ""}</td>`);
    tr.insertAdjacentHTML("beforeend", `<td>${m.away || ""}</td>`);

    PLAYERS_ORDER.forEach(player => {
      const matchId = m.id;
      const pick = guessesByPlayer[player]?.[matchId] || "";
      const finalRes = formData.finalResults?.[matchId] || "";
      const isGreen = !!finalRes && pick === finalRes;

      const td = document.createElement("td");
      td.textContent = pick;
      if (isGreen) td.style.background = "#b6fcb6";
      tr.appendChild(td);
    });

    table.appendChild(tr);
  }
}

function renderTotalsOutside() {
  const totalsTable = document.getElementById("totalsTable");
  const mainTable = document.getElementById("mainTable");
  if (!totalsTable || !mainTable) return;

  const PLAYERS_ORDER = getPlayersOrder();
  const finals = formData.finalResults || {};

  const totals = {};
  PLAYERS_ORDER.forEach(p => totals[p] = 0);

  const matches = formData.matches || [];
  matches.forEach(m => {
    const mid = m.id;
    const res = finals[mid];
    if (!res) return;
    PLAYERS_ORDER.forEach(p => {
      const pick = guessesByPlayer[p]?.[mid] || "";
      if (pick && pick === res) totals[p]++;
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

  const namesRow = document.createElement("tr");
  const emptyTd = document.createElement("td");
  emptyTd.colSpan = 5;
  namesRow.appendChild(emptyTd);

  PLAYERS_ORDER.forEach(name => {
    const td = document.createElement("td");
    td.textContent = name;
    td.style.fontWeight = "700";
    namesRow.appendChild(td);
  });
  totalsTable.appendChild(namesRow);

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
    if (info) info.textContent = "חסר id בקישור. בקש מהמומחה קישור תקין.";
    if (btnSave) btnSave.disabled = true;
    if (playerSel) playerSel.disabled = true;
    return;
  }

  onSnapshot(formRef(), async (s) => {
    if (!s.exists()) {
      if (info) info.textContent = "הטופס לא קיים. בקש קישור תקין.";
      return;
    }
    const d = s.data();

    formData.matches = Array.isArray(d.matches) ? d.matches : [];
    formData.players = Array.isArray(d.players) ? d.players : DEFAULT_PLAYERS.slice();

    formData.guessStartAt = d.guessStartAt ?? null;
    formData.guessEndAt = d.guessEndAt ?? null;
    formData.guessClosed = !!d.guessClosed;

    populatePlayersDropdown();
    renderPlayerTable();
    renderPlayerTimer(timerInfo, btnSave);
    startPlayerTicker(timerInfo, btnSave);
  });

  playerSel?.addEventListener("change", async () => {
    const name = playerSel.value;
    if (!name) return;
    if (info) info.textContent = `נבחר: ${name}`;

    const snap = await getDoc(guessDocRef(name));
    const picks = snap.exists() ? (snap.data().picks || {}) : {};
    fillPlayerPicks(picks);
  });

  btnSave?.addEventListener("click", async () => {
    const name = playerSel?.value;
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

function populatePlayersDropdown() {
  const sel = document.getElementById("player");
  if (!sel) return;

  const currentVal = sel.value;
  const players = getPlayersOrder();

  sel.innerHTML = `<option value="">בחר שחקן</option>` +
    players.map(p => `<option value="${p}">${p}</option>`).join("");

  if (players.includes(currentVal)) sel.value = currentVal;
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

/* טבלת שחקנים: רק בית | חוץ | ניחוש */
function renderPlayerTable() {
  const table = document.getElementById("playerTable");
  if (!table) return;

  const matches = formData.matches || [];

  table.innerHTML = `
    <tr>
      <th>קבוצת בית</th>
      <th>קבוצת חוץ</th>
      <th>ניחוש</th>
    </tr>
  `;

  matches.forEach((m) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${m.home || ""}</td>
      <td>${m.away || ""}</td>
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
  });
}

function fillPlayerPicks(picks) {
  document.querySelectorAll("select[data-mid]").forEach(sel => {
    const mid = sel.getAttribute("data-mid");
    sel.value = picks?.[mid] || "";
  });
}
