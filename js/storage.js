// Opslaan: claude.ai-opslag of localStorage.
'use strict';
/* ---------- persistence ---------- */
let db = null,
  uid = null,
  storeMode = 'local',
  saveTimer = null,
  saving = false,
  saveAgain = false,
  lastErr = null;
function storeNote() {
  return storeMode === 'db'
    ? 'Projecten worden automatisch opgeslagen in je Claude-account, alleen zichtbaar voor jou.'
    : storeMode === 'loading'
      ? 'Verbinden met je opslag…'
      : 'Projecten worden alleen in deze browser bewaard. Exporteer een .json als reservekopie.';
}
function setStatus(txt, cls) {
  const s = $('status');
  s.textContent = txt;
  s.className = 'pill' + (cls ? ' ' + cls : '');
}
let storeFull = false;
function saveLocal() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(all));
    storeFull = false;
  } catch (_) {
    // usually the browser storage is full, for example by large underlay images
    if (!storeFull)
      toast(
        'De opslag in deze browser is vol: de laatste wijzigingen zijn niet opgeslagen. Haal een onderlegger weg of exporteer het project als .json.'
      );
    storeFull = true;
  }
}
function loadLocal() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return {};
    const o = JSON.parse(raw);
    const out = {};
    Object.values(o || {}).forEach(p => {
      const n = normalizeProject(p);
      if (n) out[n.id] = n;
    });
    return out;
  } catch (_) {
    return {};
  }
}
function markDirty(noStamp) {
  _dtMemo = null;
  if (!P) return;
  if (!noStamp) {
    P.updatedAt = Date.now();
  }
  P.example = false;
  all[P.id] = P;
  setStatus('Wijzigingen…');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 900);
}
async function flush() {
  saveLocal();
  if (storeMode !== 'db') {
    setStatus(storeMode === 'loading' ? 'Opgeslagen in browser' : 'Opgeslagen in deze browser', 'ok');
    return;
  }
  if (saving) {
    saveAgain = true;
    return;
  }
  saving = true;
  const p = P;
  try {
    setStatus('Opslaan…');
    await db
      .collection('data/users/' + uid)
      .doc(p.id)
      .set({ name: p.name, updatedAt: p.updatedAt || Date.now(), project: JSON.parse(JSON.stringify(p)) });
    setStatus('Opgeslagen', 'ok');
    lastErr = null;
  } catch (err) {
    lastErr = err;
    setStatus(err && err.code === 'quota_exceeded' ? 'Opslag vol' : 'Niet opgeslagen in account', 'warn');
  } finally {
    saving = false;
    if (saveAgain) {
      saveAgain = false;
      flush();
    }
  }
}
async function removeRemote(id) {
  if (storeMode !== 'db') return;
  try {
    await db
      .collection('data/users/' + uid)
      .doc(id)
      .delete();
  } catch (_) {}
}
function withTimeout(pr, ms) {
  return Promise.race([pr, new Promise((_, rej) => setTimeout(() => rej({ code: 'timeout' }), ms))]);
}
async function initStore() {
  const c = window.claude;
  if (!c || typeof c.use !== 'function') {
    storeMode = 'local';
    setStatus('Opgeslagen in deze browser', 'ok');
    return;
  }
  storeMode = 'loading';
  setStatus('Verbinden…');
  c.use('downloads')
    .then(d => {
      downloads = d;
    })
    .catch(() => {});
  try {
    const [d, u] = await Promise.all([c.use('db'), c.use('user')]);
    const id = u ? await u.id() : null;
    if (!d || !id) {
      storeMode = 'local';
      setStatus('Opgeslagen in deze browser', 'ok');
      if (tab === 'set') renderPanel();
      return;
    }
    db = d;
    uid = id;
    const snap = await withTimeout(db.collection('data/users/' + uid).get(), 10000);
    const remote = {};
    snap.docs.forEach(doc => {
      const data = doc.data();
      const p = data && normalizeProject(clone(data.project));
      if (p) {
        p.id = doc.id;
        remote[p.id] = p;
      }
    });
    const toUpload = [];
    // drop untouched example when the account already has projects
    if (Object.keys(remote).length) {
      Object.values(all).forEach(p => {
        if (p.example && !p.updatedAt) delete all[p.id];
      });
    }
    Object.values(remote).forEach(p => {
      const l = all[p.id];
      if (!l || (p.updatedAt || 0) >= (l.updatedAt || 0)) all[p.id] = p;
    });
    Object.values(all).forEach(p => {
      const r = remote[p.id];
      if (!r || (p.updatedAt || 0) > (r.updatedAt || 0)) {
        if (!(p.example && !p.updatedAt)) toUpload.push(p);
      }
    });
    storeMode = 'db';
    if (!all[P.id]) {
      let last = null;
      try {
        last = localStorage.getItem(LS_LAST);
      } catch (_) {}
      const next = all[last] || Object.values(all).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0];
      if (next) {
        openProject(next.id);
      } else {
        const ex = exampleProject();
        all[ex.id] = ex;
        openProject(ex.id);
      }
    } else if (all[P.id] !== P) {
      P = normalizeProject(all[P.id]);
      all[P.id] = P;
      validateSel();
    }
    saveLocal();
    for (const p of toUpload) {
      try {
        await db
          .collection('data/users/' + uid)
          .doc(p.id)
          .set({ name: p.name, updatedAt: p.updatedAt || Date.now(), project: JSON.parse(JSON.stringify(p)) });
      } catch (_) {}
    }
    setStatus('Opgeslagen in account', 'ok');
    renderAll();
    loadHpFromAccount();
  } catch (err) {
    storeMode = 'local';
    setStatus(
      err && err.code === 'timeout' ? 'Account niet bereikbaar · lokaal opgeslagen' : 'Opgeslagen in deze browser',
      err && err.code === 'timeout' ? 'warn' : 'ok'
    );
    if (tab === 'set') renderPanel();
  }
}
