/* Context menu, future copies and reversible quick deletion. */
let scheduleMenu = null;
let scheduleMenuSource = null;
let calendarDeleteUndo = null;
function closeScheduleMenu(restoreFocus = false) {
  scheduleMenu?.remove();
  scheduleMenu = null;
  if (restoreFocus && scheduleMenuSource?.isConnected) scheduleMenuSource.focus({ preventScroll: true });
  scheduleMenuSource = null;
}
function openAppContextMenu(source, label, content, x, y) {
  closeScheduleMenu();
  cancelScheduleGesture();
  const menu = document.createElement('div');
  menu.id = 'schedule-context-menu';
  menu.className = 'schedule-context-menu';
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', label);
  menu.innerHTML = content;
  document.body.append(menu);
  scheduleMenu = menu;
  scheduleMenuSource = source;
  const rect = menu.getBoundingClientRect();
  menu.style.left = Math.max(8, Math.min(x, innerWidth - rect.width - 8)) + 'px';
  menu.style.top = Math.max(8, Math.min(y, innerHeight - rect.height - 8)) + 'px';
  menu.querySelector('button').focus({ preventScroll: true });
}
function openScheduleMenu(card, x, y) {
  const event = model.calendarEvents.find(item => item.id === card.dataset.id);
  if (!event) return;
  const linked = K.findTarget(model, event.targetId);
  const content = '<button type="button" role="menuitem" data-action="' + (linked ? 'calendar-unsync' : 'calendar-sync') + '" data-id="' + event.id + '">' + (linked ? '从项目中移除' : '添加到项目') + '</button><button type="button" role="menuitem" data-action="calendar-repeat" data-id="' + event.id + '">同步到未来</button><button type="button" role="menuitem" data-action="calendar-quick-delete" data-id="' + event.id + '" title="删除此日程，已关联的项目保留">删除</button>';
  openAppContextMenu(card, '日程操作：' + event.title, content, x, y);
}
function openProjectContextMenu(card, x, y) {
  const project = projectById(card.dataset.projectId);
  if (!project) return;
  const content = '<button type="button" role="menuitem" data-action="edit-project" data-id="' + project.id + '">编辑项目</button><button type="button" role="menuitem" data-action="delete-item" data-kind="project" data-id="' + project.id + '">删除</button>';
  openAppContextMenu(card, '项目操作：' + project.title, content, x, y);
}
function openTodayContextMenu(card, x, y) {
  const task = findLeaf(card.dataset.cardId);
  if (!task) return;
  const kind = task.isProject ? 'project' : task.isStage ? 'stage' : 'task';
  const label = task.isProject ? '项目' : task.isStage ? '子阶段' : '任务';
  const content = '<button type="button" role="menuitem" data-action="edit-task" data-id="' + task.id + '">编辑' + label + '</button><button type="button" role="menuitem" data-action="delete-item" data-kind="' + kind + '" data-id="' + task.id + '">删除</button>';
  openAppContextMenu(card, '任务操作：' + task.title, content, x, y);
}
function quickDeleteCalendarEvent(id) {
  const event = model.calendarEvents.find(item => item.id === id);
  if (!event) return;
  const before = C.validateModel(model);
  const linked = Boolean(K.findTarget(model, event.targetId));
  K.deleteEvent(model, id, false);
  const result = save();
  if (!result.ok) {
    render();
    return;
  }
  calendarDeleteUndo = { before, after: JSON.stringify(model), until: Date.now() + 5000 };
  render();
  toast(linked ? '日程已删除，关联的项目已保留。' : '日程已删除。', false, { name: 'calendar-undo-delete', label: '撤销' });
}
function undoCalendarDelete() {
  const undo = calendarDeleteUndo;
  calendarDeleteUndo = null;
  if (!undo || Date.now() > undo.until || JSON.stringify(model) !== undo.after) {
    toast('后续内容已变化或撤销时间已过，未覆盖当前数据。', true);
    return;
  }
  undoLastOperation('已撤销删除。');
}
function calendarRepeatOptions() {
  const form = $('#modal-form');
  const interval = $('[name="repeatInterval"]', form).value;
  return {
    interval: interval === 'custom' ? Number($('[name="repeatDays"]', form).value) : Number(interval),
    mode: $('[name="repeatStop"]', form).value,
    count: Number($('[name="repeatCount"]', form).value),
    until: $('[name="repeatUntil"]', form).value
  };
}
function calendarRepeatForm(id) {
  const event = model.calendarEvents.find(item => item.id === id);
  if (!event) return;
  openModal('同步到未来', '<p>以“' + esc(event.title) + '”的 ' + esc(event.date) + ' 为起点，添加未来日程。</p><div class="form-grid"><label class="field">同步间隔<select name="repeatInterval"><option value="1">每天重复</option><option value="7">每周重复</option><option value="custom">自定义天数</option></select></label><label class="field" id="repeat-days-field" hidden>间隔天数<input type="number" name="repeatDays" value="2" min="1" max="36500" step="1"></label><label class="field wide">重复至<select name="repeatStop"><option value="count">指定新增次数</option><option value="until">指定截止日期</option></select></label><label class="field" id="repeat-count-field">重复次数（不含当前日程）<input type="number" name="repeatCount" value="5" min="1" max="10000" step="1"></label><label class="field" id="repeat-until-field" hidden>重复截止日期（含当天）<input type="date" name="repeatUntil" min="' + event.date + '" max="9999-12-31"></label></div><div class="repeat-preview" id="repeat-preview" role="status" aria-live="polite"></div><p class="muted small">保留原来的时间、备注和颜色。新增日程独立保存，不自动添加到项目；修改或删除其中一条不会影响其他日程。</p>', 'calendar-confirm-repeat', { id });
  updateCalendarRepeat();
}
function updateCalendarRepeat() {
  if (modalAction !== 'calendar-confirm-repeat') return;
  const form = $('#modal-form');
  const custom = $('[name="repeatInterval"]', form).value === 'custom';
  const until = $('[name="repeatStop"]', form).value === 'until';
  for (const [id, name, enabled] of [['repeat-days-field', 'repeatDays', custom], ['repeat-count-field', 'repeatCount', !until], ['repeat-until-field', 'repeatUntil', until]]) {
    $('#' + id, form).hidden = !enabled;
    const input = $('[name="' + name + '"]', form);
    input.disabled = !enabled;
    input.required = enabled;
  }
  const preview = $('#repeat-preview', form);
  try {
    const event = model.calendarEvents.find(item => item.id === modalContext.id);
    if (!event) throw new Error('原日程已不存在');
    const dates = K.repeatDates(event, calendarRepeatOptions());
    if (dates.length + model.calendarEvents.length > C.LIMITS.calendarEvents) throw new Error('日程总数将超过 10000 条，请减少重复次数');
    preview.textContent = '将新增 ' + dates.length + ' 条日程：' + dates[0] + ' 至 ' + dates[dates.length - 1] + '。';
    preview.classList.remove('is-error');
  } catch (error) {
    preview.textContent = error.message;
    preview.classList.add('is-error');
  }
}
document.addEventListener('contextmenu', event => {
  const scheduleCard = event.target.closest('.schedule-timed-event');
  const projectCard = event.target.closest('.project-card');
  const todayCard = event.target.closest('.task-card[data-card-id]');
  const card = scheduleCard || projectCard || todayCard;
  if (!card || modal.open) return;
  event.preventDefault();
  const rect = card.getBoundingClientRect();
  const open = scheduleCard ? openScheduleMenu : projectCard ? openProjectContextMenu : openTodayContextMenu;
  open(card, event.clientX || rect.left + 8, event.clientY || rect.bottom);
});
document.addEventListener('pointerdown', event => {
  if (scheduleMenu && !scheduleMenu.contains(event.target)) closeScheduleMenu();
});
document.addEventListener('click', event => {
  if (event.target.closest('#schedule-context-menu button')) closeScheduleMenu();
}, true);
document.addEventListener('keydown', event => {
  if (!scheduleMenu) return;
  const buttons = [...scheduleMenu.querySelectorAll('button')];
  const index = buttons.indexOf(document.activeElement);
  if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next].focus();
  }
  if (event.key === 'Escape') { event.preventDefault(); closeScheduleMenu(true); }
  if (event.key === 'Tab') closeScheduleMenu();
});
document.addEventListener('input', event => {
  if (event.target.closest('#modal-form') && event.target.name?.startsWith('repeat')) updateCalendarRepeat();
});
document.addEventListener('change', event => {
  if (event.target.closest('#modal-form') && event.target.name?.startsWith('repeat')) updateCalendarRepeat();
});
window.addEventListener('scroll', () => closeScheduleMenu(), true);
window.addEventListener('resize', () => closeScheduleMenu());
window.addEventListener('blur', () => closeScheduleMenu());

document.addEventListener('keydown', event => {
  const card = event.target.closest('.task-card[data-card-id]');
  if (!card || event.target !== card || modal.open || scheduleMenu) return;
  if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openTodayProject(card.dataset.cardId); }
});
