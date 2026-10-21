/* Tutorial-only helpers. IDs identify practice records; names never authorize cleanup. */
(function (root) {
  'use strict';
  const C = typeof module !== 'undefined' && module.exports ? require('./core.js') : root.ThreeThingsCore;
  function clearPractice(model, ownership) {
    const next = C.validateModel(model);
    const pending = next.formDraft?.context || {};
    const taskIds = new Set([ownership.tid, ownership.linkedTid].filter(Boolean));
    for (const project of next.projects) {
      for (const stage of project.stages) stage.tasks = stage.tasks.filter(task => !taskIds.has(task.id) || pending.id === task.id);
      project.stages = project.stages.filter(stage => stage.id !== ownership.sid || stage.tasks.length || pending.stageId === stage.id || pending.id === stage.id);
    }
    // Keep containers if the user added any other work to them during the lesson.
    next.projects = next.projects.filter(project => project.id !== ownership.pid || project.stages.length || pending.projectId === project.id || pending.id === project.id);
    next.calendarEvents = next.calendarEvents.filter(event => event.id !== ownership.eid || next.formDraft?.action === 'calendar-save-event' && pending.id === event.id);
    C.deleteNotebookEntry(next, ownership.nid);
    const receipt = ownership.waterReceipt;
    if (receipt && C.isDate(receipt.date) && Number.isInteger(receipt.after) && receipt.after > 0 && next.routines[receipt.date]?.drinks.water === receipt.after) next.routines[receipt.date].drinks.water--;
    return C.validateModel(next);
  }
  function positionCoach(target, size, viewport) {
    const gap = 22, edge = 12;
    const { width: w, height: h } = size, { width: W, height: H } = viewport;
    if (!target || w > W - edge * 2 || h > H - edge * 2) return null;
    const clamp = (v, max) => Math.max(edge, Math.min(v, max - edge));
    const x = clamp((target.left + target.right - w) / 2, W - w);
    const y = clamp((target.top + target.bottom - h) / 2, H - h);
    const candidates = [
      { left: target.right + gap, top: y, side: 'right' },
      { left: target.left - w - gap, top: y, side: 'left' },
      { left: x, top: target.bottom + gap, side: 'below' },
      { left: x, top: target.top - h - gap, side: 'above' }
    ];
    return candidates.find(p => p.left >= edge && p.top >= edge && p.left + w <= W - edge && p.top + h <= H - edge && (p.left >= target.right + gap || p.left + w <= target.left - gap || p.top >= target.bottom + gap || p.top + h <= target.top - gap)) || null;
  }
  const api = Object.freeze({ clearPractice, positionCoach });
  root.ThreeThingsTutorial = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
