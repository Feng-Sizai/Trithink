/* Calendar rendering and commands. Statistics are always relative to today. */
function routineStatistics() {
  const stats = K.statistics(model, today);
  return `<section class="routine-statistics" aria-label="作息与饮品统计"><div class="sleep-stat"><span class="muted small">过去三天平均计划入睡时刻</span><strong data-stat="average">${stats.average || '待补全'}</strong><span class="muted small">${dateLabel(stats.sleepDays[0])}—${dateLabel(stats.sleepDays[2])} · ${stats.average ? '不含今天' : `已记录 ${stats.recorded}/3 天`}</span></div><div class="beverage-stat"><span class="muted small">过去七天饮品累计 · 含今天</span><div class="stat-drinks">${drinks.map(drink => `<span>${drink.name}<strong data-stat="${drink.id}">${stats.drinks[drink.id]}<small> 杯</small></strong></span>`).join('')}</div><span class="muted small">${dateLabel(stats.drinkDays[0])}—${dateLabel(today)}</span></div></section>`;
}
function previewNotice() {
  return calendarPreview ? '<div class="preview-notice"><span>示例体验 · 与原程序的数据分开保存</span><button type="button" class="text-button" data-action="calendar-clear-preview">清空预览数据</button></div>' : '';
}
function selectedRoutine(day) {
  return model.routines[day] || { sleepTime: '', drinks: { coffee: 0, milkTea: 0, other: 0, water: 0 } };
}
function dayEvents(day) {
  return model.calendarEvents.filter(event => event.date === day).slice().sort((a, b) => b.priority - a.priority || a.createdAt.localeCompare(b.createdAt));
}
const scheduleColors = { sage: '浅绿', sky: '天蓝', lavender: '淡紫', rose: '浅粉', teal: '青色', sand: '暖黄' };
function eventTimeLabel(event) {
  return event.startTime && event.endTime ? event.startTime + '–' + event.endTime : event.startTime ? '开始 ' + event.startTime + ' · 未排入日程表' : event.endTime ? '截止 ' + event.endTime + ' · 未排入日程表' : '未排时间';
}
function calendarViewButton() {
  return '<button type="button" class="secondary calendar-view-toggle" data-action="calendar-toggle-view" aria-pressed="' + (calendarView === 'week') + '">' + (calendarView === 'week' ? '切换为月历' : '切换为日程表') + '</button>';
}
function renderCalendar() {
  const [year, month] = calendarMonth.split('-').map(Number);
  const days = K.monthDays(calendarMonth);
  const monthPanel = '<section class="calendar-panel"><div class="calendar-toolbar"><h2>' + year + '年 <strong>' + month + '月</strong></h2><div class="actions">' + calendarViewButton() + '<button type="button" class="secondary calendar-nav" data-action="calendar-month" data-offset="-1" aria-label="上个月">‹</button><button type="button" class="secondary" data-action="calendar-today">今天</button><button type="button" class="secondary calendar-nav" data-action="calendar-month" data-offset="1" aria-label="下个月">›</button><label class="calendar-month-picker"><span class="sr-only">跳转月份</span><input type="month" id="calendar-month" aria-label="跳转月份" value="' + calendarMonth + '" min="0002-01" max="9998-12"></label></div></div><div class="calendar-scroll"><div class="calendar-grid"><div class="calendar-weekdays">' + ['一', '二', '三', '四', '五', '六', '日'].map(name => '<span>周' + name + '</span>').join('') + '</div><div class="calendar-days">' + days.map(renderCalendarDay).join('') + '</div></div></div></section>';
  main.innerHTML = header('日历', calendarView === 'week' ? '把时间留给重要的事，一周安排尽在眼前。' : '把每天的作息和重要的事，留在日历里。', '<button type="button" class="primary" data-action="calendar-new-event" data-date="' + calendarDay + '">＋ 添加事件</button>') + previewNotice() + (calendarView === 'month' ? routineStatistics() + monthPanel : renderSchedule()) + renderCalendarDetail();
  if (calendarView === 'week') {
    positionScheduleEvents();
  }
}
function eventUrgentClass(event) {
  const target = event.targetId && K.findTarget(model, event.targetId);
  return target ? urgentClass({ ...target.record, ...C.effectiveDeadline(target.record, target.stage, target.project), projectId: target.project.id }) : '';
}
function renderScheduleEvent(event, timed = false) {
  const label = eventTimeLabel(event) + ' ' + event.title + '，' + event.priority + '星' + (event.priority === 0 ? '日常' : '') + (event.location ? '，' + event.location : '');
  return '<button type="button" class="schedule-event schedule-color-' + (event.color || 'sage') + (timed ? ' schedule-timed-event' : '') + eventUrgentClass(event) + '" data-action="calendar-edit-event" data-id="' + event.id + '" title="' + esc(label) + '" aria-label="' + esc(label) + '"><span class="schedule-card-content"><span class="schedule-card-summary"><span class="schedule-event-title">' + esc(event.title) + '</span>' + compactStars(event.priority) + '</span><span class="schedule-short-time">' + esc(eventTimeLabel(event)) + '</span></span><span class="schedule-full-label">' + esc(event.title + ' · ' + eventTimeLabel(event)) + '</span>' + (timed ? '<span class="schedule-resize schedule-resize-start" data-schedule-edge="start" aria-hidden="true"></span><span class="schedule-resize schedule-resize-end" data-schedule-edge="end" aria-hidden="true"></span>' : '') + '</button>';
}
function renderSchedule() {
  const days = K.weekDays(calendarDay);
  const weekdays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  const earlyEvents = model.calendarEvents.filter(event => days.includes(event.date) && event.startTime && event.endTime && K.timeMinutes(event.endTime) <= K.SCHEDULE.start);
  const earlyNotice = earlyEvents.length ? '<details class="early-events"><summary>本周另有 ' + earlyEvents.length + ' 项06:00之前的安排，点击查看</summary><div>' + earlyEvents.map(event => '<button type="button" class="early-event schedule-color-' + event.color + '" data-action="calendar-edit-event" data-id="' + event.id + '">' + dateLabel(event.date) + ' ' + eventTimeLabel(event) + ' · ' + esc(event.title) + '</button>').join('') + '</div></details>' : '';
  const hours = Array.from({ length: 18 }, (_, hour) => String(hour + 6).padStart(2, '0') + ':00');
  return '<section class="calendar-panel schedule-panel" aria-label="每周日程表"><div class="calendar-toolbar"><div><h2>' + days[0].slice(0, 4) + '年 <strong>' + dateLabel(days[0]) + '—' + dateLabel(days[6]) + '</strong></h2><p class="schedule-hint">每格 1 小时 · 拖选每格 15 分钟新建 · 拖动上下边缘调整 · 长按 0.45 秒移动（15 分钟刻度）</p></div><div class="actions">' + calendarViewButton() + '<button type="button" class="secondary calendar-nav" data-action="calendar-week" data-offset="-1" aria-label="上一周">‹</button><button type="button" class="secondary" data-action="calendar-today">本周</button><button type="button" class="secondary calendar-nav" data-action="calendar-week" data-offset="1" aria-label="下一周">›</button><label class="schedule-date-picker"><span class="sr-only">跳转日期</span><input type="date" id="schedule-date" aria-label="跳转日期" min="0002-01-01" max="9998-12-31" value="' + calendarDay + '"></label></div></div>' + earlyNotice + '<p class="muted small short-event-hint">短日程已放大以便点击和移动，左侧色线表示实际时长。</p><div class="schedule-scroll" id="schedule-scroll" tabindex="0" aria-label="完整日程时间表，窄屏可左右滚动"><div class="schedule-grid"><div class="schedule-heading"><div class="schedule-corner">时间</div>' + days.map((day, i) => '<button type="button" class="schedule-day-heading' + (day === today ? ' is-today' : '') + (day === calendarDay ? ' is-selected' : '') + '" data-action="calendar-select" data-date="' + day + '" aria-pressed="' + (day === calendarDay) + '"><span>' + weekdays[i] + '</span><time datetime="' + day + '">' + Number(day.slice(5, 7)) + '/' + Number(day.slice(8)) + '</time></button>').join('') + '</div><div class="schedule-body"><div class="schedule-axis">' + hours.map(hour => '<div class="schedule-hour"><span>' + hour + '</span></div>').join('') + '<span class="schedule-end-label">24:00</span></div>' + days.map(day => '<div class="schedule-column' + (day === today ? ' is-today' : '') + '" data-schedule-day="' + day + '">' + hours.map(hour => '<button type="button" class="schedule-slot" data-action="calendar-new-event" data-date="' + day + '" data-time="' + hour + '" aria-label="在' + day + ' ' + hour + '添加日程"></button>').join('') + K.scheduleLayout(dayEvents(day).filter(event => event.startTime && event.endTime && K.timeMinutes(event.endTime) > K.SCHEDULE.start), 54).map(item => renderScheduleEvent(item.event, true)).join('') + '</div>').join('') + '</div></div></div></section>';
}
function positionScheduleEvents() {
  for (const column of document.querySelectorAll('[data-schedule-day]')) {
    const layout = K.scheduleLayout(dayEvents(column.dataset.scheduleDay).filter(event => event.startTime && event.endTime && K.timeMinutes(event.endTime) > K.SCHEDULE.start), 54);
    for (const item of layout) {
      const button = [...column.querySelectorAll('.schedule-timed-event')].find(node => node.dataset.id === item.event.id);
      // CSSOM sets numeric geometry without enabling inline styles in the CSP.
      const actualTop = (Math.max(item.start, K.SCHEDULE.start) - K.SCHEDULE.start) / 60 * K.SCHEDULE.hourHeight;
      const displayedTop = Math.min(actualTop, 18 * K.SCHEDULE.hourHeight - 32);
      button.style.top = displayedTop + 'px';
      button.style.setProperty('--duration-offset', (actualTop - displayedTop) + 'px');
      const trueHeight = (item.end - Math.max(item.start, K.SCHEDULE.start)) / 60 * K.SCHEDULE.hourHeight;
      button.style.height = Math.max(32, trueHeight) + 'px';
      button.style.setProperty('--duration-height', trueHeight + 'px');
      button.style.left = 'calc(' + (item.column / item.columns * 100) + '% + 3px)';
      button.style.width = 'calc(' + (100 / item.columns) + '% - 6px)';
      button.classList.toggle('is-short', item.end - Math.max(item.start, K.SCHEDULE.start) < 60);
    }
  }
}
function renderCalendarDay(day) {
  const r = model.routines[day];
  const events = dayEvents(day);
  return `<section class="calendar-cell${day.slice(0, 7) !== calendarMonth ? ' outside-month' : ''}${day === today ? ' is-today' : ''}${day === calendarDay ? ' is-selected' : ''}" data-calendar-date="${day}" aria-label="${day}"><button type="button" class="calendar-date" data-action="calendar-select" data-date="${day}" aria-pressed="${day === calendarDay}"><time datetime="${day}">${Number(day.slice(8))}</time>${day === today ? '<span>今天</span>' : ''}</button>${r ? `<div class="calendar-sleep">入睡 ${r.sleepTime || '未填'}</div><div class="calendar-drinks">咖啡 ${r.drinks.coffee} · 奶茶 ${r.drinks.milkTea}<br>其他 ${r.drinks.other} · 喝水 ${r.drinks.water || 0} 杯</div>` : '<div class="calendar-no-record">暂无作息记录</div>'}<div class="calendar-events">${events.map(event => `<button type="button" class="calendar-event schedule-color-${event.color || 'sage'}${eventUrgentClass(event)}" data-action="calendar-edit-event" data-id="${event.id}" title="${esc(event.title + ' · ' + eventTimeLabel(event) + (event.location ? ' · ' + event.location : ''))}" aria-label="${esc(event.title)}，${event.priority}星${event.priority === 0 ? '日常' : ''}"><span class="calendar-event-title">${esc(event.title)}</span>${compactStars(event.priority)}</button>`).join('')}</div><button type="button" class="calendar-add" data-action="calendar-new-event" data-date="${day}" aria-label="为${day}添加事件">＋ 添加标注</button></section>`;
}
function renderCalendarDetail() {
  const r = selectedRoutine(calendarDay);
  const events = dayEvents(calendarDay);
  return `<section class="routine-section calendar-detail" id="calendar-detail"><div class="summary"><h2>${dateLabel(calendarDay)} · 每日记录</h2><span class="muted small">${calendarDay === today ? '今天' : calendarDay}</span></div><form id="calendar-sleep-form" class="sleep-form" data-date="${calendarDay}"><label for="calendar-sleep">计划入睡时间</label><input id="calendar-sleep" type="time" name="sleepTime" value="${r.sleepTime}" required><button type="submit" class="primary">保存时间</button></form><p class="muted small">${r.sleepTime ? '已保存，可修改或补记。' : '填写后保存，日历会按日期保留。'}</p><div class="drink-grid">${drinks.map(drink => `<div class="drink-card" data-drink="${drink.id}"><h3>${drink.name}</h3><div class="drink-number"><output>${r.drinks[drink.id]}</output><span>杯</span></div><button type="button" class="secondary" data-action="add-drink" data-kind="${drink.id}" data-date="${calendarDay}">＋ ${drink.name}</button>${drinkEditButton(drink, calendarDay)}</div>`).join('')}</div><p class="muted small">饮品可追加，也可点击“修改杯数”更正当前日期的记录。</p><div class="summary"><h3>当日事件</h3><button type="button" class="text-button" data-action="calendar-new-event" data-date="${calendarDay}">＋ 添加事件</button></div>${events.length ? events.map(event => {
    const target = K.findTarget(model, event.targetId);
    return `<article class="calendar-event-row" data-event-id="${event.id}"><div><h3>${esc(event.title)}</h3><div class="meta"><span class="muted small">${eventTimeLabel(event)}${event.location ? ' · ' + esc(event.location) : ''}</span>${stars(event.priority)}<span class="muted small">${target ? '已同步至' + esc(target.project.title) : '尚未同步到项目'}</span></div></div><div class="row-actions"><button type="button" class="text-button" data-action="calendar-edit-event" data-id="${event.id}">编辑</button><button type="button" class="text-button" data-action="${target ? 'open-project' : 'calendar-sync'}" data-id="${target ? target.project.id : event.id}">${target ? '查看项目' : '同步到项目'}</button><button type="button" class="text-button danger" data-action="calendar-delete-event" data-id="${event.id}">删除</button></div></article>`;
  }).join('') : '<p class="muted">这一天还没有标注。</p>'}</section>`;
}
function calendarEventForm(id, date, startTime, endTime) {
  const event = id ? model.calendarEvents.find(item => item.id === id) : { title: '', priority: 1, date, startTime, endTime: endTime || (startTime ? K.minuteTime(Math.min(1440, K.timeMinutes(startTime) + 60)) : null) };
  if (!event) return;
  const linked = K.findTarget(model, event.targetId);
  if (redirectToPendingDraft('calendar-save-event', { id })) return;
  openModal(id ? '编辑日历事件' : '添加日历事件', `<div class="form-grid"><label class="field wide">事件名称<input name="title" maxlength="200" value="${esc(event.title)}" required autocomplete="off"></label><label class="field">日期<input type="date" name="date" value="${event.date}" required></label><label class="field">重要程度（星级）<select name="priority">${priorityOptions(event.priority)}</select></label><label class="field">开始时间（选填）<input type="time" name="startTime" value="${event.startTime || ''}"></label><div class="field"><label for="calendar-end-time">截止时间（选填）</label><input id="calendar-end-time" name="endTime" type="time" value="${event.endTime === '24:00' ? '' : event.endTime || ''}" ${event.endTime === '24:00' ? 'disabled' : ''}><label class="end-of-day"><input type="checkbox" name="endOfDay" ${event.endTime === '24:00' ? 'checked' : ''}>当天结束（24:00）</label></div><label class="field wide">备注（选填）<input name="location" maxlength="200" value="${esc(event.location || '')}" autocomplete="off"></label><label class="field">日程颜色<select name="color">${Object.entries(scheduleColors).map(([value, name]) => '<option value="' + value + '"' + ((event.color || 'sage') === value ? ' selected' : '') + '>' + name + '</option>').join('')}</select></label></div><p class="muted small">只有开始时间和截止时间都填写，才会显示在日程表中；未填完整可直接添加到项目。勾选“当天结束”可设置为 24:00。</p>${linked ? '<p class="muted small">只同步本次实际修改的名称、星级或截止时间；仅改备注、颜色不会覆盖项目中的修改。</p>' : ''}`, 'calendar-save-event', { id });
  if (id) $('.modal-actions', modal).insertAdjacentHTML('afterbegin', '<button type="button" class="danger text-button modal-delete" data-action="calendar-delete-event" data-id="' + id + '">删除日程</button>');
}
function calendarSyncPrompt(id) {
  const event = model.calendarEvents.find(item => item.id === id);
  if (!event) return;
  openModal('同步到我的项目？', `<p>是否将“${esc(event.title)}”同步到“我的项目”？</p><p class="muted small">确认后选择新建项目或加入已有项目；取消则仅保留在日历中。</p>`, 'calendar-start-sync', { id });
}
function calendarSyncForm(id) {
  const event = model.calendarEvents.find(item => item.id === id);
  openModal(event?.startTime && event?.endTime ? '选择同步位置' : '添加到我的项目', `<div class="form-grid"><label class="field wide">加入方式<select name="destination" id="calendar-destination"><option value="project">新建独立项目</option><option value="stage" ${model.projects.length ? '' : 'disabled'}>加入已有项目 · 新阶段</option><option value="task" ${model.projects.some(project => project.stages.length) ? '' : 'disabled'}>加入已有项目 · 新任务</option></select></label><label class="field wide" id="sync-project" hidden>所属项目<select name="projectId">${model.projects.map(project => `<option value="${project.id}">${esc(project.title)}</option>`).join('')}</select></label><label class="field wide" id="sync-stage" hidden>所属阶段<select name="stageId"></select></label></div><p class="muted small">事件日期和截止时刻将作为项目截止时间。后续仅同步日历中实际修改的字段；仅改备注不会覆盖项目名称或截止时间。在项目中修改不会反向改动日历。</p>`, 'calendar-confirm-sync', { id });
  updateSyncFields();
}
function updateSyncFields() {
  const form = $('#modal-form');
  const kind = $('[name="destination"]', form)?.value;
  if (!kind) return;
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
  if (action === 'calendar-toggle-view') {
    calendarView = calendarView === 'month' ? 'week' : 'month';
    if (calendarView === 'week' && calendarDay.slice(0, 7) !== calendarMonth) calendarDay = calendarMonth + '-01';
    render();
    $('[data-action="calendar-toggle-view"]').focus({ preventScroll: true });
  }
  if (action === 'calendar-week') {
    const next = K.shiftDate(calendarDay, Number(button.dataset.offset) * 7);
    if (next >= '0002-01-01' && next <= '9998-12-31') {
      calendarDay = next;
      calendarMonth = next.slice(0, 7);
      render();
    }
  }
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
    if (action === 'calendar-select' && calendarView === 'month') $('#calendar-detail').scrollIntoView({ block: 'start' });
  }
  if (action === 'calendar-new-event') calendarEventForm(null, button.dataset.date, button.dataset.time);
  if (action === 'calendar-edit-event') calendarEventForm(id);
  if (action === 'calendar-sync') calendarSyncForm(id);
  if (action === 'calendar-repeat') calendarRepeatForm(id);
  if (action === 'calendar-quick-delete') quickDeleteCalendarEvent(id);
  if (action === 'calendar-undo-delete') undoCalendarDelete();
  if (action === 'calendar-unsync') {
    const event = model.calendarEvents.find(item => item.id === id);
    const target = event && K.findTarget(model, event.targetId);
    if (target) openModal('从项目中移除', '<p>保留日历中的“' + esc(event.title) + '”，从项目中移除对应事项？</p><p class="muted small">' + (target.kind === 'project' ? '该项目及其全部阶段、任务将被移除。' : target.kind === 'stage' ? '该阶段及其全部任务将被移除。' : '对应任务将被移除。') + '其他日程会保留；失效的项目关联会清除。</p>', 'calendar-confirm-unsync', { id });
  }
  if (action === 'calendar-delete-event') {
    const event = model.calendarEvents.find(item => item.id === id);
    if (!event) return true;
    const linked = K.findTarget(model, event.targetId);
    if (modal.open) closeModal();
    openModal('删除日历事件', `<p>删除“${esc(event.title)}”？</p>${linked ? `<fieldset class="delete-link-choice"><legend>是否同时删除项目中的对应事项？</legend><label><input type="radio" name="withTarget" value="no" required>只删除日历事件，保留项目事项</label><label><input type="radio" name="withTarget" value="yes" required>同时删除对应${{ project: '项目及其全部内容', stage: '阶段及其全部任务', task: '任务' }[linked.kind]}</label></fieldset>` : ''}<p class="muted small">本次打开期间可按 Ctrl+Z 撤销。</p>`, 'calendar-confirm-delete', { id, linked: Boolean(linked) });
  }
  if (action === 'calendar-clear-preview' && calendarPreview) openModal('清空预览数据', '<p>清空本预览中的全部示例和你添加的记录？</p><p>原程序和安装版中的数据不会受到影响。</p>', 'calendar-confirm-clear');
  return true;
}
function calendarSubmit(action, context, data) {
  if (!action.startsWith('calendar-')) return false;
  let nextAction = null;
  let savedEventId = null;
  let successMessage = '已保存。';
  if (action === 'calendar-save-event') {
    const event = K.saveEvent(model, { title: String(data.get('title') || ''), date: data.get('date'), priority: Number(data.get('priority')), startTime: data.get('startTime') || null, endTime: data.has('endOfDay') ? '24:00' : data.get('endTime') || null, location: String(data.get('location') || ''), color: data.get('color') || 'sage' }, context.id);
    savedEventId = event.id;
    calendarDay = event.date;
    calendarMonth = event.date.slice(0, 7);
    if (!K.findTarget(model, event.targetId)) nextAction = () => event.startTime && event.endTime ? calendarSyncPrompt(event.id) : calendarSyncForm(event.id);
  }
  if (action === 'calendar-confirm-unsync') {
    K.removeEventFromProject(model, context.id);
    successMessage = '已从项目中移除，日程已保留。';
  }
  if (action === 'calendar-confirm-repeat') {
    const options = calendarRepeatOptions();
    const preview = K.repeatPreview(model, context.id, options);
    const copies = K.repeatEvent(model, context.id, options);
    successMessage = copies.length ? '已添加 ' + copies.length + ' 条未来日程。' + (options.skipDuplicates && preview.duplicateDates.length ? '已跳过 ' + preview.duplicateDates.length + ' 个重复日期。' : '') : '这些未来日程已存在，未重复添加。';
  }
  if (action === 'calendar-start-sync') nextAction = () => calendarSyncForm(context.id);
  if (action === 'calendar-confirm-sync') K.syncEvent(model, context.id, { kind: data.get('destination'), projectId: data.get('projectId'), stageId: data.get('stageId') });
  if (action === 'calendar-confirm-delete') {
    if (model.formDraft?.action === 'calendar-save-event' && model.formDraft.context.id === context.id) clearFormDraft();
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
  if (action === 'calendar-save-event') clearFormDraft();
  const result = save(action === 'calendar-start-sync' ? '' : successMessage);
  if (!result.ok) throw new Error(result.error || '保存失败，请重试');
  tutorialCommitted(action, context, savedEventId);
  closeModal({ submitted: true });
  render();
  if (nextAction) nextAction();
  return true;
}
