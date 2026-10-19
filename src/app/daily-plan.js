/* Independent daily modes, explicit manual selection and local drag reordering. */
let draggedTaskId = null;

function manualMode() {
  return plan().mode === 'manual';
}
function planModeSwitch() {
  return `<div class="plan-tools"><div class="plan-mode-switch" role="group" aria-label="今日计划模式"><button type="button" data-action="set-plan-mode" data-mode="auto" aria-pressed="${!manualMode()}">自动模式</button><button type="button" data-action="set-plan-mode" data-mode="manual" aria-pressed="${manualMode()}">手选模式</button></div><span class="muted small">${manualMode() ? '自己选三项，自己排顺序' : '按优先顺序展示前三项'}</span></div>`;
}
function manualSelectionSummary() {
  const count = plan().manualSelected.length;
  const picked = plan().manualSelected.map(findLeaf).filter(Boolean).map((task, i) => `<button type="button" class="manual-picked-task" data-action="manual-remove" data-id="${task.id}" aria-label="移出手选：${esc(task.title)}" title="${esc(task.title)}"><span>${i + 1}. ${esc(task.title)}${task.done ? '（已完成）' : ''}</span><span aria-hidden="true">×</span></button>`).join('');
  return `<section class="manual-selection-summary" aria-label="手选任务"><strong>手选模式 · 已选 ${count} / 3 项</strong><button type="button" class="secondary" data-page="today">返回今日计划</button><p>${count >= 3 ? '已选满三项。先移出一项，即可选择其他任务。' : '选择最多三项任务，返回今日计划后可拖拽调整顺序。'}</p>${picked ? `<div class="manual-picked-items">${picked}</div>` : ''}</section>`;
}
function changePlanMode(mode) {
  if (mode === plan().mode) return;
  try {
    C.setPlanMode(model, today, mode);
    showQueue = false;
    if (save(mode === 'manual' ? '已切换手选模式，请选择今天的任务。' : '已恢复自动优先排序。').ok) {
      render();
      $(`[data-action="set-plan-mode"][data-mode="${mode}"]`)?.focus({ preventScroll: true });
    }
  } catch (error) {
    toast(error.message, true);
  }
}
function changeManualTask(id, selected) {
  if (!manualMode()) return;
  try {
    C.setManualTask(model, today, id, selected);
    if (save(selected ? '已加入手选任务。' : '已移出手选，任务仍保留在列表中。').ok) render();
  } catch (error) {
    toast(error.message, true);
  }
}
function reorderManualTask(id, position) {
  if (!manualMode() || page !== 'today') return;
  try {
    C.moveManualTask(model, today, id, position);
    if (save(`顺序已保存，任务移至第 ${position + 1} 项。`).ok) {
      render();
      $(`[data-drag-id="${id}"]`)?.focus({ preventScroll: true });
    }
  } catch (error) {
    toast(error.message, true);
  }
}
function clearPlanDrag() {
  draggedTaskId = null;
  main.querySelectorAll('.dragging, .drop-target').forEach(card => card.classList.remove('dragging', 'drop-target'));
}

main.addEventListener('dragstart', event => {
  const card = event.target.closest('.manual-card');
  const control = event.target.closest('button, input, select, textarea, a');
  if (!manualMode() || page !== 'today' || !card || control && !control.matches('.task-drag-handle')) {
    if (card) event.preventDefault();
    return;
  }
  draggedTaskId = card.dataset.cardId;
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', draggedTaskId);
  event.dataTransfer.setDragImage(card, 35, 25);
  card.classList.add('dragging');
});
main.addEventListener('dragover', event => {
  if (!draggedTaskId || !manualMode() || page !== 'today') return;
  const card = event.target.closest('.manual-card');
  if (!card) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  main.querySelectorAll('.drop-target').forEach(item => item.classList.remove('drop-target'));
  if (card.dataset.cardId !== draggedTaskId) card.classList.add('drop-target');
});
main.addEventListener('drop', event => {
  if (!draggedTaskId || !manualMode() || page !== 'today') return;
  event.preventDefault();
  const card = event.target.closest('.manual-card');
  const id = draggedTaskId;
  const position = card ? plan().manualSelected.indexOf(card.dataset.cardId) : -1;
  const internal = event.dataTransfer.getData('text/plain') === id;
  clearPlanDrag();
  if (internal && position >= 0 && plan().manualSelected.indexOf(id) !== position) reorderManualTask(id, position);
});
main.addEventListener('dragend', clearPlanDrag);
main.addEventListener('keydown', event => {
  const handle = event.target.closest('.task-drag-handle');
  if (!handle || !manualMode() || page !== 'today' || !['ArrowUp', 'ArrowDown'].includes(event.key)) return;
  event.preventDefault();
  const id = handle.dataset.dragId;
  const position = plan().manualSelected.indexOf(id) + (event.key === 'ArrowUp' ? -1 : 1);
  if (position >= 0 && position < plan().manualSelected.length) reorderManualTask(id, position);
});
