/* Independent daily modes, explicit manual selection and local drag reordering. */
let draggedTaskId = null;

function manualMode() {
  return plan().mode === 'manual';
}
function planModeSwitch() {
  return `<div class="plan-tools"><div class="plan-mode-switch" role="group" aria-label="今日计划模式"><button type="button" data-action="set-plan-mode" data-mode="auto" aria-pressed="${!manualMode()}">自动模式</button><button type="button" data-action="set-plan-mode" data-mode="manual" aria-pressed="${manualMode()}">手选模式</button></div><span class="muted small">${manualMode() ? '同一队列，手动调整顺序' : plan().manualOrder.length ? '手选顺序已同步' : '从全部待办自动补足三项'}</span>${manualMode() ? '' : '<button type="button" class="secondary" data-action="reset-default-queue">恢复默认</button>'}</div>`;
}
function manualSelectionSummary() {
  return '<section class="manual-selection-summary"><strong>同一待办池 · 手动排序</strong><p>所有未完成事项都已在队列中，返回今日计划即可调整顺序。</p><button type="button" class="secondary" data-page="today">返回今日计划调整顺序</button></section>';
}
function changePlanMode(mode) {
  if (mode === plan().mode) return;
  try {
    C.setPlanMode(model, today, mode);
    showQueue = false;
    if (save(mode === 'manual' ? '已切换为手动调整当前队列。' : '已切换自动模式，保留当前队列顺序。').ok) {
      render();
      $(`[data-action="set-plan-mode"][data-mode="${mode}"]`)?.focus({ preventScroll: true });
    }
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
  const position = card ? pendingToday().map(t => t.id).indexOf(card.dataset.cardId) : -1;
  const internal = event.dataTransfer.getData('text/plain') === id;
  clearPlanDrag();
  if (internal && position >= 0 && pendingToday().map(t => t.id).indexOf(id) !== position) reorderManualTask(id, position);
});
main.addEventListener('dragend', clearPlanDrag);
main.addEventListener('keydown', event => {
  const handle = event.target.closest('.task-drag-handle');
  if (!handle || !manualMode() || page !== 'today' || !['ArrowUp', 'ArrowDown'].includes(event.key)) return;
  event.preventDefault();
  const id = handle.dataset.dragId;
  const position = pendingToday().map(t => t.id).indexOf(id) + (event.key === 'ArrowUp' ? -1 : 1);
  if (position >= 0 && position < pendingToday().length) reorderManualTask(id, position);
});

function deferToday(id) {
  try {
    C.deferAutomaticTask(model, today, id);
    if (save('已移到队尾，明天恢复参与排序。').ok) render();
  } catch (error) {
    render();
    toast(error.message, true);
  }
}

function resetDefaultQueue() {
  C.resetAutomaticQueue(model, today);
  if (save('已清空今天的暂缓标记和手动排序，按默认规则重新排列。').ok) render();
}
