// Saves the player's table, session summaries, results curve and recent hands between visits.
// On the hosted site everything lives in this browser. Opened as a Claude artifact, it's saved
// to the player's own private space on their Claude account, so it follows them across devices.

const SAVE_KEY = "pokerapp.progress.v1";
const RECENT_LIMIT = { local: 100, claude: 40 };
const CURVE_LIMIT = 5000;
const SESSION_LIMIT = 300;

const saved = { table: null, sessions: [], curve: [], recent: [] };
const saveState = { kind: "pending", saving: false, again: false, error: "" };
let saveBackend = null;

function localBackend() {
  return {
    kind: "local",
    load: function () {
      try {
        var raw = localStorage.getItem(SAVE_KEY);
        return Promise.resolve(raw ? JSON.parse(raw) : null);
      } catch (e) {
        return Promise.resolve(null);
      }
    },
    save: function (data) {
      try {
        localStorage.setItem(SAVE_KEY, JSON.stringify(data));
        return Promise.resolve();
      } catch (e) {
        return Promise.reject(e);
      }
    }
  };
}

async function claudeBackend() {
  if (!window.claude || typeof window.claude.use !== "function") return null;
  var caps = await Promise.all([window.claude.use("db"), window.claude.use("user")]);
  var db = caps[0], user = caps[1];
  if (!db || !user) return null;
  var uid = await user.id();
  if (!uid) return null;
  var progressDoc = db.doc("data/users/" + uid + "/progress");
  var recentDoc = db.doc("data/users/" + uid + "/recent");
  return {
    kind: "claude",
    load: async function () {
      var snaps = await Promise.all([progressDoc.get(), recentDoc.get()]);
      if (!snaps[0].exists) return null;
      var data = JSON.parse(JSON.stringify(snaps[0].data()));
      data.recent = snaps[1].exists ? JSON.parse(JSON.stringify(snaps[1].data().hands || [])) : [];
      return data;
    },
    save: async function (data) {
      await progressDoc.set({ table: data.table, sessions: data.sessions, curve: data.curve });
      await recentDoc.set({ hands: data.recent });
    }
  };
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise(function (_, reject) { setTimeout(function () { reject({ code: "timeout" }); }, ms); })
  ]);
}

async function loadProgress() {
  var backend = null;
  var data = null;
  try {
    backend = await withTimeout(claudeBackend(), 12000);
  } catch (e) {
    backend = null;
  }
  if (backend) {
    try {
      data = await withTimeout(backend.load(), 10000);
    } catch (e) {
      backend = null;
      saveState.error = "Couldn't reach your Claude account, so progress is being saved on this device for now.";
    }
  }
  if (!backend) {
    backend = localBackend();
    data = await backend.load();
  }
  saveBackend = backend;
  saveState.kind = backend.kind;
  if (data) {
    saved.table = data.table || null;
    saved.sessions = data.sessions || [];
    saved.curve = data.curve || [];
    saved.recent = data.recent || [];
  }
  return saved;
}

// Hands are stored without the shuffled deck, which nothing needs after the hand ends
function storableHand(h) {
  var copy = {};
  Object.keys(h).forEach(function (k) { if (k !== "deck") copy[k] = h[k]; });
  return copy;
}

async function persist() {
  if (!saveBackend) return;
  if (saveState.saving) { saveState.again = true; return; }
  saveState.saving = true;
  saved.recent = saved.recent.slice(0, RECENT_LIMIT[saveBackend.kind]);
  saved.sessions = saved.sessions.slice(0, SESSION_LIMIT);
  saved.curve = saved.curve.slice(-CURVE_LIMIT);
  try {
    await saveBackend.save({
      table: saved.table,
      sessions: saved.sessions,
      curve: saved.curve,
      recent: saved.recent.map(storableHand)
    });
    saveState.error = "";
  } catch (e) {
    if (saveBackend.kind === "claude") {
      saveBackend = localBackend();
      saveState.kind = "local";
      saveState.error = "Saving to your Claude account failed, so progress is being saved on this device instead.";
      saveState.saving = false;
      return persist();
    }
    saveState.error = "Couldn't save progress in this browser. Storage may be full or blocked (for example in a private window).";
  }
  saveState.saving = false;
  if (saveState.again) {
    saveState.again = false;
    persist();
  }
  if (typeof renderSaveStatus === "function") renderSaveStatus();
}
