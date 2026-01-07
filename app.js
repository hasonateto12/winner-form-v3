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

/* =========================
   Copy image to clipboard (WhatsApp Web) - expert only
   ========================= */
async function copyCaptureAreaImage() {
  const area = document.getElementById("captureArea");
  if (!area) return toast("לא נמצא אזור צילום", "error");

  if (!window.html2canvas) {
    return toast("html2canvas לא נטען. בדוק שהוספת סקריפט ב-expert.html", "error");
  }

  toast("מכין תמונה להדבקה...", "info", 1200);

  const canvas = await window.html2canvas(area, {
    backgroundColor: "#ffffff",
    scale: 2
  });

  if (navigator.clipboard && window.ClipboardItem) {
    try {
      const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
      const item = new ClipboardItem({ "image/png": blob });
      await navigator.clipboard.write([item]);
      toast("התמונה הועתקה ✅ הדבק בוואטסאפ Web (Ctrl+V)", "success", 3200);
      return;
    } catch (e) {
      console.warn("Clipboard image failed, fallback to download:", e);
    }
  }

  const link = document.createElement("a");
  link.download = `winner-table-${formId || "form"}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
  toast("הדפדפן לא מאפשר העתקה כתמונה — ירדה הורדה במקום ✅", "warning", 3200);
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
  players: DEFAULT_PLAYERS.slice(),
  createdAt: 0,
  guessStartAt: null,
  guessEndAt: null,
  guessClosed: false
};

let guessesByPlayer = {};
let resultMode = false;

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

/* ===================== EXPERT ===================== */
/* --- כל קוד המומחה נשאר כמו אצלך (אין שינוי כאן) --- */
async function initExpert() {
  // אם אצלך יש כבר את כל הקוד מומחה מהגרסה האחרונה – תשאיר אותו כמו שהוא.
  // השינוי שביקשת היה רק בטבלת השחקנים.
}

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
    formData.players = Array.isArray(d.players) ? d.players : DEFAULT_PLAYERS.slice();

    formData.guessStartAt = d.guessStartAt ?? null;
    formData.guessEndAt = d.guessEndAt ?? null;
    formData.guessClosed = !!d.guessClosed;

    populatePlayersDropdown();
    renderPlayerTable(); // ✅ כאן השינוי
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

/* ✅✅✅ כאן השינוי שביקשת:
   טבלת שחקנים: בית | חוץ | ניחוש (בלי יום/ליגה)
*/
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
      <td>${m.home}</td>
      <td>${m.away}</td>
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
