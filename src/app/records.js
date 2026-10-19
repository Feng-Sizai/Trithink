/* Record lookup, persistence, plan cleanup and sidebar state.
 * Built in the shared private application scope; see build.config.cjs.
 */
function stageById(id) {
  for (const p of model.projects) {
    const stage = p.stages.find(s => s.id === id);
    if (stage) return {
      project: p,
      stage
    };
  }
  return null;
}
function recordById(id) {
  const leaf = findLeaf(id);
  if (!leaf) return null;
  if (leaf.isProject) {
    const project = projectById(leaf.projectId);
    return {
      project,
      stage: null,
      leaf,
      record: project
    };
  }
  const group = stageById(leaf.stageId);
  return {
    ...group,
    leaf,
    record: leaf.isStage ? group.stage : group.stage.tasks.find(t => t.id === id)
  };
}
let toastTimer = null;
let toastClearTimer = null;
function toast(message, error = false, action = null) {
  clearTimeout(toastTimer);
  clearTimeout(toastClearTimer);
  const el = $('#toast');
  el.classList.remove('toast-fading');
  el.textContent = message;
  el.classList.toggle('error', error);
  if (action) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'toast-action';
    button.dataset.action = action.name;
    button.textContent = action.label;
    el.append(button);
  }
  if (message) toastTimer = setTimeout(() => {
    el.classList.add('toast-fading');
    toastClearTimer = setTimeout(() => {
      el.textContent = '';
      el.classList.remove('toast-fading');
    }, 350);
  }, 5000);
}
function cleanPlans() {
  const valid = new Set(flat().map(t => t.id));
  const projectLeaves = new Set(flat().filter(t => t.isProject).map(t => t.id));
  for (const p of Object.values(model.plans)) {
    p.selected = [...new Set(p.selected)].filter(id => valid.has(id));
    p.visible = [...new Set(p.visible)].filter(id => valid.has(id) && p.selected.includes(id)).slice(0, 3);
    p.excludedProjects = (p.excludedProjects || []).filter(id => projectLeaves.has(id));
    p.manualSelected = [...new Set(p.manualSelected || [])].filter(id => valid.has(id)).slice(0, 3);
  }
}
function save(message, { recordUndo = true } = {}) {
  C.syncAutoProjects(model, today);
  cleanPlans();
  try {
    model = C.validateModel(model);
  } catch (error) {
    model = C.validateModel(lastGood);
    updateSidebar();
    toast(error.message || '数据未通过检查，本次修改没有保存。', true);
    return {
      ok: false,
      persistent: !memoryOnly,
      error: error.message
    };
  }
  const before = JSON.stringify(lastGood);
  const after = JSON.stringify(model);
  const result = S.save(model);
  if (!result.ok) {
    model = C.validateModel(lastGood);
    updateSidebar();
    toast(result.error || '保存失败，本次修改没有生效。', true);
    return result;
  }
  if (recordUndo) rememberOperation(before, after);
  lastGood = C.validateModel(model);
  memoryOnly = !result.persistent;
  updateSidebar();
  if (!result.persistent || result.error) toast(result.error || '未能持久保存，请先导出备份。', true);else if (message) toast(message);
  return result;
}
function updateSidebar() {
  const r = routine();
  $('#sidebar-status').innerHTML = `<div>已完成 <strong>${C.completedCount(model)}</strong> 项任务</div><div>计划入睡：<strong>${r.sleepTime || '未设置'}</strong></div><div aria-label="饮品摄入：咖啡${r.drinks.coffee}杯，奶茶${r.drinks.milkTea}杯，其他${r.drinks.other}杯">咖啡${r.drinks.coffee}·奶茶${r.drinks.milkTea}·其他${r.drinks.other}杯</div>`;
}
