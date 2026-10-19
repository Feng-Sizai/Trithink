/* Calendar rendering and commands. Statistics are always relative to today. */
function routineStatistics() {
  const stats = K.statistics(model, today);
  return `<section class="routine-statistics" aria-label="作息与饮品统计"><div class="sleep-stat"><span class="muted small">过去三天平均计划入睡时刻</span><strong data-stat="average">${stats.average || '待补全'}</strong><span class="muted small">${dateLabel(stats.sleepDays[0])}—${dateLabel(stats.sleepDays[2])} · ${stats.average ? '不含今天' : `已记录 ${stats.recorded}/3 天`}</span></div><div class="beverage-stat"><span class="muted small">过去七天饮品累计 · 含今天</span><div class="stat-drinks">${drinks.map(drink => `<span>${drink.name}<strong data-stat="${drink.id}">${stats.drinks[drink.id]}<small> 杯</small></strong></span>`).join('')}</div><span class="muted small">${dateLabel(stats.drinkDays[0])}—${dateLabel(today)}</span></div></section>`;
}
function previewNotice() {
  return calendarPreview ? '<div class="preview-notice"><span>示例体验 · 与原程序的数据分开保存</span><button type="button" class="text-button" data-action="calendar-clear-preview">清空预览数据</button></div>' : '';
}
function selectedRoutine(day) {
  return model.routines[day] || { sleepTime: '', drinks: { coffee: 0, milkTea: 0, other: 0 } };
}
function dayEvents(day) {
  return model.calendarEvents.filter(event => event.date === day).slice().sort((a, b) => b.priority - a.priority || a.createdAt.localeCompare(b.createdAt));
}
function renderCalendar() {
  const [year, month] = calendarMonth.split('-').map(Number);
  const days = K.monthDays(calendarMonth);
  main.innerHTML = header('日历', '把每天的作息和重要的事，留在日历里。', `<button type="button" class="primary" data-action="calendar-new-event" data-date="${calendarDay}">＋ 添加事件</button>`) + previewNotice() + routineStatistics() + `<section class="calendar-panel"><div class="calendar-toolbar"><h2>${year}年 <strong>${month}月</strong></h2><div class="actions"><button type="button" class="secondary calendar-nav" data-action="calendar-month" data-offset="-1" aria-label="上个月">‹</button><button type="button" class="secondary" data-action="calendar-today">今天</button><button type="button" class="secondary calendar-nav" data-action="calendar-month" data-offset="1" aria-label="下个月">›</button><label class="calendar-month-picker"><span class="sr-only">跳转月份</span><input type="month" id="calendar-month" aria-label="跳转月份" value="${calendarMonth}" min="0002-01" max="9998-12"></label></div></div><div class="calendar-scroll"><div class="calendar-grid"><div class="calendar-weekdays">${['一', '二', '三', '四', '五', '六', '日'].map(name => `<span>周${name}</span>`).join('')}</div><div class="calendar-days">${days.map(renderCalendarDay).join('')}</div></div></div></section>${renderCalendarDetail()}`;
}
function renderCalendarDay(day) {
  const r = model.routines[day];
  const events = dayEvents(day);
  return `<section class="calendar-cell${day.slice(0, 7) !== calendarMonth ? ' outside-month' : ''}${day === today ? ' is-today' : ''}${day === calendarDay ? ' is-selected' : ''}" data-calendar-date="${day}" aria-label="${day}"><button type="button" class="calendar-date" data-action="calendar-select" data-date="${day}" aria-pressed="${day === calendarDay}"><time datetime="${day}">${Number(day.slice(8))}</time>${day === today ? '<span>今天</span>' : ''}</button>${r ? `<div class="calendar-sleep">入睡 ${r.sleepTime || '未填'}</div><div class="calendar-drinks">咖啡 ${r.drinks.coffee} · 奶茶 ${r.drinks.milkTea}<br>其他 ${r.drinks.other} 杯</div>` : '<div class="calendar-no-record">暂无作息记录</div>'}<div class="calendar-events">${events.map(event => `<button type="button" class="calendar-event" data-action="calendar-edit-event" data-id="${event.id}" title="${esc(event.title)}"><span>${'★'.repeat(event.priority)}：${urgencyLabels[event.priority - 1]}</span><span>${esc(event.title)}</span></button>`).join('')}</div><button type="button" class="calendar-add" data-action="calendar-new-event" data-date="${day}" aria-label="为${day}添加事件">＋ 添加标注</button></section>`;
}
function renderCalendarDetail() {
  const r = selectedRoutine(calendarDay);
  const events = dayEvents(calendarDay);
  return `<section class="routine-section calendar-detail" id="calendar-detail"><div class="summary"><h2>${dateLabel(calendarDay)} · 每日记录</h2><span class="muted small">${calendarDay === today ? '今天' : calendarDay}</span></div><form id="calendar-sleep-form" class="sleep-form" data-date="${calendarDay}"><label for="calendar-sleep">计划入睡时间</label><input id="calendar-sleep" type="time" name="sleepTime" value="${r.sleepTime}" required><button type="submit" class="primary">保存时间</button></form><p class="muted small">${r.sleepTime ? '已保存，可修改或补记。' : '填写后保存，日历会按日期保留。'}</p><div class="drink-grid">${drinks.map(drink => `<div class="drink-card" data-drink="${drink.id}"><h3>${drink.name}</h3><div class="drink-number"><output>${r.drinks[drink.id]}</output><span>杯</span></div><button type="button" class="secondary" data-action="add-drink" data-kind="${drink.id}" data-date="${calendarDay}">＋ ${drink.name}</button></div>`).join('')}</div><p class="muted small">饮品可追加；每次确认后增加一杯，不可撤销。</p><div class="summary"><h3>当日事件</h3><button type="button" class="text-button" data-action="calendar-new-event" data-date="${calendarDay}">＋ 添加事件</button></div>${events.length ? events.map(event => {
    const target = K.findTarget(model, event.targetId);
    return `<article class="calendar-event-row" data-event-id="${event.id}"><div><h3>${esc(event.title)}</h3><div class="meta">${stars(event.priority)}<span class="muted small">${target ? '已同步至' + esc(target.project.title) : '尚未同步到项目'}</span></div></div><div class="row-actions"><button type="button" class="text-button" data-action="calendar-edit-event" data-id="${event.id}">编辑</button><button type="button" class="text-button" data-action="${target ? 'open-project' : 'calendar-sync'}" data-id="${target ? target.project.id : event.id}">${target ? '查看项目' : '同步到项目'}</button><button type="button" class="text-button danger" data-action="calendar-delete-event" data-id="${event.id}">删除</button></div></article>`;
  }).join('') : '<p class="muted">这一天还没有标注。</p>'}</section>`;
}
function calendarEventForm(id, date) {
  const event = id ? model.calendarEvents.find(item => item.id === id) : { title: '', priority: 2, date };
  if (!event) return;
  const linked = K.findTarget(model, event.targetId);
  openModal(id ? '编辑日历事件' : '添加日历事件', `<div class="form-grid"><label class="field wide">事件名称<input name="title" maxlength="200" value="${esc(event.title)}" required autocomplete="off"></label><label class="field">日期<input type="date" name="date" value="${event.date}" required></label><label class="field">紧急程度（星级）<select name="priority">${priorityOptions(event.priority)}</select></label></div>${linked ? '<p class="muted small">保存后会更新对应项目事项的名称、星级和截止日期。</p>' : ''}`, 'calendar-save-event', { id });
}
function calendarSyncPrompt(id) {
  const event = model.calendarEvents.find(item => item.id === id);
  if (!event) return;
  openModal('同步到我的项目？', `<p>是否将“${esc(event.title)}”同步到“我的项目”？</p><p class="muted small">确认后选择新建项目或加入已有项目；取消则仅保留在日历中。</p>`, 'calendar-start-sync', { id });
}
function calendarSyncForm(id) {
  openModal('选择同步位置', `<div class="form-grid"><label class="field wide">加入方式<select name="destination" id="calendar-destination"><option value="project">新建独立项目</option><option value="stage" ${model.projects.length ? '' : 'disabled'}>加入已有项目 · 新阶段</option><option value="task" ${model.projects.some(project => project.stages.length) ? '' : 'disabled'}>加入已有项目 · 新任务</option></select></label><label class="field wide" id="sync-importance">新项目的重要程度<select name="importance" required><option value="">请选择</option>${[3, 2, 1].map(n => `<option value="${n}">${labels[n - 1]}</option>`).join('')}</select></label><label class="field wide" id="sync-project" hidden>所属项目<select name="projectId">${model.projects.map(project => `<option value="${project.id}">${esc(project.title)}</option>`).join('')}</select></label><label class="field wide" id="sync-stage" hidden>所属阶段<select name="stageId"></select></label></div><p class="muted small">事件日期将作为截止日期。后续修改日历事件会更新对应事项；在项目中修改不会反向改动日历。</p>`, 'calendar-confirm-sync', { id });
  updateSyncFields();
}
function updateSyncFields() {
  const form = $('#modal-form');
  const kind = $('[name="destination"]', form)?.value;
  if (!kind) return;
  $('#sync-importance', form).hidden = kind !== 'project';
  $('[name="importance"]', form).required = kind === 'project';
  $('#sync-project', form).hidden = kind === 'project';
  $('#sync-stage', form).hidden = kind !== 'task';
  const projectSelect = $('[name="projectId"]', form);
  for (const option of projectSelect.options) option.disabled = kind === 'task' && !projectById(option.value)?.stages.length;
  if (kind === 'task' && projectSelect.selectedOptions[0]?.disabled) projectSelect.value = model.projects.find(project => project.stages.length)?.id || '';
  const stageSelect = $('[name="stageId"]', form);
  const previousStage = stageSelect.value;
  stageSelect.innerHTML = (projectById(projectSelect.value)?.stages || []).map(stage => `<option value="${stage.id}">${esc(stage.title)}</option>`).join('');
  if ([...stageSelect.options].some(option => option.value === previousStage)) stageSelect.value = previousStage;
  stageSelect.required = kind === 'task';
}
function calendarClick(button) {
  const action = button.dataset.action;
  const id = button.dataset.id;
  if (!action?.startsWith('calendar-')) return false;
  if (action === 'calendar-month') {
    const date = new Date(calendarMonth + '-01T12:00:00');
    date.setMonth(date.getMonth() + Number(button.dataset.offset));
    if (date.getFullYear() < 2 || date.getFullYear() > 9998) return true;
    calendarMonth = C.localDate(date).slice(0, 7);
    render();
  }
  if (action === 'calendar-today' || action === 'calendar-select') {
    calendarDay = action === 'calendar-today' ? today : button.dataset.date;
    calendarMonth = calendarDay.slice(0, 7);
    render();
    if (action === 'calendar-select') $('#calendar-detail').scrollIntoView({ block: 'start' });
  }
  if (action === 'calendar-new-event') calendarEventForm(null, button.dataset.date);
  if (action === 'calendar-edit-event') calendarEventForm(id);
  if (action === 'calendar-sync') calendarSyncForm(id);
  if (action === 'calendar-delete-event') {
    const event = model.calendarEvents.find(item => item.id === id);
    if (!event) return true;
    const linked = K.findTarget(model, event.targetId);
    openModal('删除日历事件', `<p>删除“${esc(event.title)}”？</p>${linked ? `<fieldset class="delete-link-choice"><legend>是否同时删除项目中的对应事项？</legend><label><input type="radio" name="withTarget" value="no" required>只删除日历事件，保留项目事项</label><label><input type="radio" name="withTarget" value="yes" required>同时删除对应${{ project: '项目及其全部内容', stage: '阶段及其全部任务', task: '任务' }[linked.kind]}</label></fieldset>` : ''}<p class="muted small">删除后无法在界面中撤销。</p>`, 'calendar-confirm-delete', { id, linked: Boolean(linked) });
  }
  if (action === 'calendar-clear-preview' && calendarPreview) openModal('清空预览数据', '<p>清空本预览中的全部示例和你添加的记录？</p><p>原程序和安装版中的数据不会受到影响。</p>', 'calendar-confirm-clear');
  return true;
}
function calendarSubmit(action, context, data) {
  if (!action.startsWith('calendar-')) return false;
  let nextAction = null;
  if (action === 'calendar-save-event') {
    const event = K.saveEvent(model, { title: String(data.get('title') || ''), date: data.get('date'), priority: Number(data.get('priority')) }, context.id);
    calendarDay = event.date;
    calendarMonth = event.date.slice(0, 7);
    if (!K.findTarget(model, event.targetId)) nextAction = () => calendarSyncPrompt(event.id);
  }
  if (action === 'calendar-start-sync') nextAction = () => calendarSyncForm(context.id);
  if (action === 'calendar-confirm-sync') K.syncEvent(model, context.id, { kind: data.get('destination'), importance: Number(data.get('importance')), projectId: data.get('projectId'), stageId: data.get('stageId') });
  if (action === 'calendar-confirm-delete') {
    if (context.linked && !['yes', 'no'].includes(data.get('withTarget'))) throw new Error('请选择是否同时删除对应项目事项');
    K.deleteEvent(model, context.id, context.linked && data.get('withTarget') === 'yes');
  }
  if (action === 'calendar-confirm-clear' && calendarPreview) {
    destroyEditor(false);
    model = C.blankModel();
    activeProject = null;
    calendarDay = today;
    calendarMonth = today.slice(0, 7);
    page = 'calendar';
  }
  const result = save(action === 'calendar-start-sync' ? '' : '已保存。');
  if (!result.ok) throw new Error(result.error || '保存失败，请重试');
  closeModal();
  render();
  if (nextAction) nextAction();
  return true;
}
