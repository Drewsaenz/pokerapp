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

// ===== HAND ARCHIVE =====
// Every finished hand, kept as its written hand history (plus any review) until the player erases it.
// Claude version: players/<id>/archive/<chunk> documents, readable by the artifact's owner so
// Claude can pull them into a chat. Hosted site: one localStorage key.

const ARCHIVE_KEY = "pokerapp.archive.v1";
const ARCHIVE_CHUNK = 50;

const archive = { kind: "pending", count: 0, local: [], chunk: null, chunkIndex: 0, error: "" };
let archiveRemote = null;
let archiveChain = Promise.resolve();

function queueArchive(task) {
  archiveChain = archiveChain.then(task).catch(function () {
    archive.error = "A hand couldn't be added to your archive.";
    if (typeof renderArchive === "function") renderArchive();
  });
  return archiveChain;
}

function chunkId(i) {
  return "c" + String(i).padStart(6, "0");
}

async function claudeArchive() {
  if (!window.claude || typeof window.claude.use !== "function") return null;
  var caps = await Promise.all([window.claude.use("db"), window.claude.use("user")]);
  var db = caps[0], user = caps[1];
  if (!db || !user) return null;
  var uid = await user.id();
  if (!uid) return null;
  var playerDoc = db.doc("players/" + uid);
  var chunks = playerDoc.collection("archive");
  return { playerDoc: playerDoc, chunks: chunks };
}

async function loadArchive() {
  try {
    archiveRemote = await withTimeout(claudeArchive(), 12000);
  } catch (e) {
    archiveRemote = null;
  }
  if (archiveRemote) {
    try {
      var snap = await withTimeout(archiveRemote.playerDoc.get(), 10000);
      var info = snap.exists ? snap.data() : {};
      archive.count = info.count || 0;
      archive.chunkIndex = info.chunkIndex || 0;
      var chunkSnap = await archiveRemote.chunks.doc(chunkId(archive.chunkIndex)).get();
      archive.chunk = chunkSnap.exists ? JSON.parse(JSON.stringify(chunkSnap.data().hands || [])) : [];
      archive.kind = "claude";
      return;
    } catch (e) {
      archiveRemote = null;
    }
  }
  archive.kind = "local";
  try {
    archive.local = JSON.parse(localStorage.getItem(ARCHIVE_KEY) || "[]");
  } catch (e) {
    archive.local = [];
  }
  archive.count = archive.local.length;
}

function saveLocalArchive() {
  try {
    localStorage.setItem(ARCHIVE_KEY, JSON.stringify(archive.local));
    archive.error = "";
  } catch (e) {
    archive.error = "This browser's storage is full. Download your hands, then erase them to keep archiving.";
  }
}

async function writeRemoteChunk() {
  await archiveRemote.chunks.doc(chunkId(archive.chunkIndex)).set({ hands: archive.chunk });
  await archiveRemote.playerDoc.set({ count: archive.count, chunkIndex: archive.chunkIndex, updatedAt: Date.now() });
}

function archiveAdd(entry) {
  return queueArchive(async function () {
    if (archive.kind === "claude") {
      if (archive.chunk.length >= ARCHIVE_CHUNK) {
        archive.chunkIndex += 1;
        archive.chunk = [];
      }
      entry.chunk = archive.chunkIndex;
      archive.chunk.push(entry);
      archive.count += 1;
      await writeRemoteChunk();
      archive.error = "";
    } else {
      archive.local.push(entry);
      archive.count = archive.local.length;
      saveLocalArchive();
    }
    if (typeof renderArchive === "function") renderArchive();
  });
}

function archiveUpdate(id, patch) {
  return queueArchive(async function () {
    if (archive.kind === "claude") {
      var inCurrent = archive.chunk.find(function (e) { return e.id === id; });
      if (inCurrent) {
        Object.assign(inCurrent, patch);
        await writeRemoteChunk();
        return;
      }
      var snaps = await archiveRemote.chunks.get();
      for (var i = 0; i < snaps.docs.length; i++) {
        var hands = JSON.parse(JSON.stringify(snaps.docs[i].data().hands || []));
        var hit = hands.find(function (e) { return e.id === id; });
        if (hit) {
          Object.assign(hit, patch);
          await archiveRemote.chunks.doc(snaps.docs[i].id).set({ hands: hands });
          return;
        }
      }
    } else {
      var entry = archive.local.find(function (e) { return e.id === id; });
      if (entry) { Object.assign(entry, patch); saveLocalArchive(); }
    }
  });
}

async function archiveAll() {
  await archiveChain;
  if (archive.kind === "claude") {
    var snaps = await archiveRemote.chunks.get();
    var all = [];
    snaps.docs.forEach(function (d) { all = all.concat(d.data().hands || []); });
    return all;
  }
  return archive.local.slice();
}

function archiveErase() {
  return queueArchive(async function () {
    if (archive.kind === "claude") {
      var snaps = await archiveRemote.chunks.get();
      for (var i = 0; i < snaps.docs.length; i++) await archiveRemote.chunks.doc(snaps.docs[i].id).delete();
      archive.chunk = [];
      archive.chunkIndex = 0;
      archive.count = 0;
      await archiveRemote.playerDoc.set({ count: 0, chunkIndex: 0, updatedAt: Date.now() });
    } else {
      archive.local = [];
      archive.count = 0;
      try { localStorage.removeItem(ARCHIVE_KEY); } catch (e) { /* nothing stored */ }
    }
    archive.error = "";
    if (typeof renderArchive === "function") renderArchive();
  });
}
