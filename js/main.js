// Opstarten.
'use strict';
/* ---------- boot ---------- */
// first the data from data/*.json, then the projects
loadData()
  .then(() => {
    all = loadLocal();
    let last = null;
    try {
      last = localStorage.getItem(LS_LAST);
    } catch (_) {}
    if (!Object.keys(all).length) {
      const ex = exampleProject();
      all[ex.id] = ex;
    }
    P = all[last] || Object.values(all).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0];
    setTool('select');
    renderAll();
    requestAnimationFrame(fit);
    initStore();
    loadHpList();
  })
  .catch(showDataError);
