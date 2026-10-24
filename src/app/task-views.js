/* Shared markup and the task, project, completion-history and routine views.
 * Built in the shared private application scope; see build.config.cjs.
 */
function header(title, description = '', action = '') {
  return `<div class="header"><div><h1>${esc(title)}</h1>${description ? `<p class="muted">${esc(description)}</p>` : ''}</div>${action}</div>`;
}
function stars(n) {
  return '<span class="stars" aria-label="重要程度' + n + '星：' + priorityLabels[n] + '">' + '★'.repeat(n) + '<span class="urgency-label">' + (n ? '：' : '') + priorityLabels[n] + '</span></span>';
}
function compactStars(n) {
  return '<span class="compact-stars" aria-label="' + n + '星' + (n === 0 ? '，日常' : '') + '">' + '★'.repeat(n) + '</span>';
}
function urgentClass(record) {
  if (!record || record.done) return '';
  const target = K.findTarget(model, record.id);
  const deadline = C.effectiveDeadline(record, target?.stage, target?.project);
  return C.isTaskUrgent(model, { ...record, ...deadline, projectId: target?.project.id || record.projectId }) ? ' deadline-urgent' : '';
}
function deadlineSignature() {
  return flat().filter(t => C.isTaskUrgent(model, t)).map(t => t.id).join(' ');
}
function urgentExplanation(t) {
  if (!C.isTaskUrgent(model, t)) return '';
  if (C.isDeadlineUrgent(t)) return '此事项截止不足24小时或已逾期，不能暂缓';
  const p = projectById(t.projectId);
  return p ? '所属项目“' + p.title + '”截止：' + dueText(p.due, p.dueTime) + '，不足24小时或已逾期，不能暂缓' : '';
}
function parentUrgentNote(record) {
  const target = K.findTarget(model, record.id);
  const t = { ...record, ...C.effectiveDeadline(record, target?.stage, target?.project), projectId: target?.project.id || record.projectId };
  return C.isTaskUrgent(model, t) && !C.isDeadlineUrgent(t) ? '<p class="urgent-reason">' + esc(urgentExplanation(t)) + '</p>' : '';
}
function drinkEditButton(drink, date = null) {
  return '<button type="button" class="text-button drink-edit" data-action="edit-drink" data-kind="' + drink.id + '"' + (date ? ' data-date="' + date + '"' : '') + '>修改杯数</button>';
}
function editDrink(button) {
  const drink = drinks.find(item => item.id === button.dataset.kind);
  if (!drink) return;
  const date = C.isDate(button.dataset.date) ? button.dataset.date : today;
  openModal('修改' + drink.name + '杯数', '<p data-record-date>记录日期：' + date + '</p><label class="field">实际杯数<input type="number" name="count" min="0" max="10000" step="1" value="' + (model.routines[date]?.drinks[drink.id] || 0) + '" required></label><p class="muted small">可改为0；只更正这一天的这类饮品，其他记录保留。</p>', 'save-drink-count', { id: drink.id, date, followToday: !button.dataset.date });
}
function dueText(due, dueTime) {
  return due ? dateLabel(due) + (dueTime && dueTime !== '24:00' ? ' ' + dueTime : '') : '未设截止时间';
}
function dueTag(due, dueTime) {
  const now = new Date();
  const clock = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
  const overdue = due && (due < today || due === today && dueTime && dueTime !== '24:00' && dueTime < clock);
  return '<span class="deadline-badge' + (overdue ? ' overdue' : '') + '">截止：' + dueText(due, dueTime) + '</span>';
}
function metadata(t) {
  return `<div class="meta">${stars(t.priority)}${dueTag(t.due, t.dueTime)}</div>${parentUrgentNote(t)}`;
}
function projectSortControl() {
  return '<label class="project-sort">排序方式<select id="project-sort"><option value="priority"' + (model.projectSort !== 'due' ? ' selected' : '') + '>按重要程度</option><option value="due"' + (model.projectSort === 'due' ? ' selected' : '') + '>按截止时间</option></select></label>';
}
function openProjectDetail(id) {
  if (!projectById(id)) return;
  activeProject = id;
  page = 'detail';
  render();
}
function openTodayProject(id) {
  const task = findLeaf(id);
  if (!task) return;
  openProjectDetail(task.projectId);
  const stage = task.stageId && document.querySelector('[data-stage-id="' + task.stageId + '"]');
  if (stage) stage.scrollIntoView({ block: 'nearest' });
}
function planButton(t) {
  if (t.done) return '<span class="badge">已完成</span>';
  const deferred = plan().deferred.includes(t.id) && !C.isTaskUrgent(model, t);
  return '<span class="badge">' + (deferred ? '今日暂缓' : '待办队列') + '</span>';
}
function taskRow(t, detail = false) {
  const g = t.isProject ? {
    project: projectById(t.projectId),
    stage: null
  } : stageById(t.stageId);
  const stagePriority = g.stage ? g.stage.priority ?? g.project.priority : g.project.priority;
  const parentDeadline = C.effectiveDeadline(g.stage, g.project);
  const overrides = detail ? `<div class="meta">${t.priority !== stagePriority ? `<span>重要程度：${stars(t.priority)}</span>` : ''}${t.due && (t.due !== parentDeadline.due || t.dueTime !== parentDeadline.dueTime) ? dueTag(t.due, t.dueTime) : ''}</div>` : metadata(t);
  return `<div class="row ${t.done ? 'done' : ''}${urgentClass(t)}" data-task-id="${t.id}"><div class="row-main"><div class="row-title">${esc(t.title)}${t.isProject ? ' <span class="badge">项目</span>' : t.isStage && !detail ? ' <span class="badge">阶段</span>' : ''}</div>${detail || t.isProject ? '' : `<div class="muted small">${esc(t.projectTitle)}${t.isProject || t.isStage ? '' : ' / ' + esc(t.stageTitle)}</div>`}${overrides}${detail ? parentUrgentNote(t) : ''}</div><div class="row-actions"><button type="button" class="text-button" data-action="${t.done ? 'undo-complete' : 'complete'}" data-id="${t.id}">${t.done ? '撤销完成' : '完成'}</button><button type="button" class="text-button" data-action="edit-task" data-id="${t.id}">编辑</button>${planButton(t)}</div></div>`;
}
function pendingToday() {
  return C.currentQueue(model, today);
}
function refreshVisible() {
  if (manualMode()) return;
  plan().visible = pendingToday().slice(0, 3).map(t => t.id);
}
function hasFinishedCard() {
  return plan().visible.some(id => findLeaf(id)?.done);
}
function renderWelcome() {
  main.innerHTML = header('欢迎使用三件事', '本地试用版 · 你的项目、今日计划和随手笔记') + `<section class="card empty"><h2>今天，从一件开始。</h2><p>可以先用示例项目体验，也可以创建自己的第一个项目。</p><div class="actions"><button type="button" class="primary" data-action="start-demo">使用示例体验</button><button type="button" class="secondary" data-action="start-blank">从空白开始</button></div><p class="muted small">离线使用，数据保存在当前浏览器。可在“数据与备份”中导出备份。</p></section>`;
}
function renderToday() {
  const queue = pendingToday(), manual = manualMode();
  const shown = queue.slice(0, 3), rest = queue.slice(3);
  automaticOrder = queue.map(t => t.id).join(' ');
  main.innerHTML = header('今天，从一件开始。', dateHeading()) + planModeSwitch() + '<div class="summary"><span>' + (manual ? '手动排序' : '自动安排') + ' · 共 ' + queue.length + ' 项待办</span><span class="muted small">当前展示 ' + (showQueue ? queue.length : shown.length) + ' 项</span></div><p class="muted small">' + (manual ? '调整会同步至自动模式；可拖动、使用上下箭头或一键置顶。' : plan().manualOrder.length ? '使用手选调整后的共享顺序；点击“恢复默认”可重新按规则排序。' : automaticSortDescription) + '</p>' + (shown.length ? shown.map((t, i) => todayCard(t, i, manual, queue.length)).join('') : '<div class="card empty"><h2>当前没有未完成事项</h2><p>新增项目、阶段或任务后，会自动加入队列。</p><button type="button" class="primary" data-page="projects">我的项目</button></div>') + (rest.length ? '<button type="button" class="queue-toggle" data-action="toggle-queue" aria-expanded="' + showQueue + '"><span aria-hidden="true">' + (showQueue ? '▴' : '▾') + '</span> ' + (showQueue ? '收起后续待办' : '展开全部待办') + ' · 共 ' + queue.length + ' 项</button>' + (showQueue ? '<div class="queue-rest">' + rest.map((t, i) => todayCard(t, i + 3, manual, queue.length)).join('') + '</div>' : '') : '');
}
function todayCard(t, i, manual, total = 3) {
  const handle = manual ? '<button type="button" class="task-drag-handle" draggable="true" data-drag-id="' + t.id + '" aria-label="拖动调整顺序">☷</button>' : '';
  const controls = manual ? '<button type="button" class="secondary" data-action="queue-pin" data-id="' + t.id + '" ' + (i === 0 ? 'disabled' : '') + '>一键置顶</button><button type="button" class="secondary" data-action="queue-move" data-id="' + t.id + '" data-direction="up" aria-label="向上移动" ' + (i === 0 ? 'disabled' : '') + '>↑</button><button type="button" class="secondary" data-action="queue-move" data-id="' + t.id + '" data-direction="down" aria-label="向下移动" ' + (i === total - 1 ? 'disabled' : '') + '>↓</button>' : '<button type="button" class="secondary" data-action="defer-today" data-id="' + t.id + '" ' + (C.isTaskUrgent(model, t) ? 'disabled title="' + esc(urgentExplanation(t)) + '"' : '') + '>先不做这一条</button>';
  return '<article class="task-card ' + (i === 0 ? 'first' : '') + (manual ? ' manual-card' : '') + urgentClass(t) + '" data-card-id="' + t.id + '" tabindex="0" aria-label="打开项目：' + esc(t.projectTitle) + '" ' + (manual ? 'draggable="true"' : '') + '><span class="rank">' + String(i + 1).padStart(2, '0') + '</span><div><div class="today-task-heading"><div class="eyebrow">' + (i === 0 ? '先做这一件' : '接下来') + '</div>' + handle + '</div><h2>' + esc(t.title) + '</h2><div class="muted small">' + esc(t.projectTitle) + (t.isProject || t.isStage ? '' : ' / ' + esc(t.stageTitle)) + '</div>' + metadata(t) + '<div class="actions"><button type="button" class="' + (i === 0 ? 'primary' : 'secondary') + '" data-action="complete" data-id="' + t.id + '">标记完成</button>' + controls + '</div></div></article>';
}
function renderProjects() {
  if (!['all', 'unclassified'].includes(activeCategory) && !model.categories.some(category => category.id === activeCategory)) activeCategory = 'all';
  const activeProjects = C.sortTasks(C.projectsInCategory(model, activeCategory), model.projectSort);
  main.innerHTML = categoryPreviewNotice() + header('我的项目', '项目>阶段>任务', '<div class="actions"><button type="button" class="secondary" data-action="show-completed">查看已完成</button><button type="button" class="primary" data-action="new-project">＋ 新建项目</button></div>') + categoryScopeBar(activeProjects.length) + projectSortControl() + (activeProjects.length ? `<div class="project-grid">${activeProjects.map(p => {
    const leaves = flat().filter(t => t.projectId === p.id),
      next = C.projectLeadTask(leaves);
    return `<article class="project-card${urgentClass(p)}" data-project-id="${p.id}" tabindex="0" aria-label="项目：${esc(p.title)}"><div class="project-summary"><span>${p.stages.length}个阶段</span><span>${leaves.length}项任务·已完成${leaves.filter(t => t.done).length}项</span></div><h2>${esc(p.title)}</h2>${projectCategoryBadges(p)}<div class="project-next"><span class="muted small">首要任务</span><div class="row-title">${next ? esc(next.title) : leaves.length ? '当前任务已全部完成' : '添加阶段后显示首要任务'}</div>${next && !next.isStage && !next.isProject ? `<div class="muted small">${esc(next.stageTitle)}</div>` : ''}</div><div class="meta">${stars(p.priority)}${dueTag(p.due, p.dueTime)}</div><button type="button" class="project-open" data-action="open-project" data-id="${p.id}">查看子阶段与进度 <span class="hand-icon" aria-hidden="true">☞</span></button></article>`;
  }).join('')}</div>` : `<div class="card empty"><h2>${activeCategory !== 'all' ? '这个分类暂时没有进行中的项目' : model.projects.length ? '当前项目已全部完成' : '还没有项目'}</h2><p>${activeCategory !== 'all' ? '可以在这里新建项目，也可以修改已有项目的所属分类。' : model.projects.length ? '可在“查看已完成”中回看进展，也可以创建新项目。' : '从一门课、一场活动，或一件想做的事开始。'}</p><button type="button" class="primary" data-action="new-project">${model.projects.length ? '创建新项目' : '创建第一个项目'}</button></div>`);
}
function renderDetail() {
  const p = projectById(activeProject);
  if (!p) {
    page = 'projects';
    renderProjects();
    return;
  }
  main.innerHTML = '<button type="button" class="back" data-page="projects"><span class="back-chevron" aria-hidden="true"></span>所有项目</button>' + header(p.title, '', `<button type="button" class="secondary" data-action="edit-project" data-id="${p.id}">编辑项目</button>`) + `<div class="meta">项目重要程度 ${stars(p.priority)}${dueTag(p.due, p.dueTime)}</div><div class="summary"><span>${p.stages.length}个阶段</span><button type="button" class="primary" data-action="new-stage" data-id="${p.id}">＋ 添加子阶段</button></div>`;
  if (!p.stages.length) {
    const t = findLeaf(p.id);
    main.innerHTML += `<section class="card${urgentClass(p)}"><h2>可以直接做这个项目</h2><p>项目尚未拆分阶段，会按星级参与今日计划排序。</p><div class="actions"><button type="button" class="${t.done ? 'secondary' : 'primary'}" data-action="${t.done ? 'undo-complete' : 'complete'}" data-id="${p.id}">${t.done ? '撤销完成' : '完成此项目'}</button>${planButton(t)}</div></section>`;
    return;
  }
  main.innerHTML += '<p class="muted small">小任务默认使用所属阶段的星级和截止时间，单独调整时才另外显示。</p>' + p.stages.map((s, i) => renderStage(p, s, i)).join('');
}
function renderStage(p, s, i) {
  return `<section class="stage${urgentClass({ ...s, ...C.effectiveDeadline(s, p), projectId: p.id })}" data-stage-id="${s.id}"><div class="stage-head"><div><div class="stage-kind">阶段 ${String(i + 1).padStart(2, '0')}</div><h2>${esc(s.title)}</h2><div class="meta"><span>重要程度：${stars(s.priority ?? p.priority)}</span><span>截止：${s.due || p.due ? dueText(s.due || p.due, s.due ? s.dueTime : p.dueTime) : '未设置'}${!s.due && p.due ? ' · 沿用项目' : ''}</span></div>${parentUrgentNote(s)}</div><div class="row-actions"><button type="button" class="text-button" data-action="edit-stage" data-id="${s.id}">编辑</button><button type="button" class="stage-arrow" data-action="move-stage" data-direction="up" data-id="${s.id}" aria-label="向上移动${esc(s.title)}" ${i === 0 ? 'disabled' : ''}></button><button type="button" class="stage-arrow down" data-action="move-stage" data-direction="down" data-id="${s.id}" aria-label="向下移动${esc(s.title)}" ${i === p.stages.length - 1 ? 'disabled' : ''}></button></div></div>${s.tasks.length ? `<div class="stage-children"><div class="summary small muted"><span>小任务</span><span>已完成 ${s.tasks.filter(t => t.done).length} / ${s.tasks.length}</span></div>${s.tasks.map(t => taskRow(findLeaf(t.id), true)).join('')}<button type="button" class="text-button" data-action="new-task" data-id="${s.id}">＋ 添加小任务</button></div>` : `<div class="stage-children"><p class="muted small">尚未拆分，可直接将此阶段作为一项任务。</p>${directStage(s)}<button type="button" class="text-button" data-action="new-task" data-id="${s.id}">＋ 拆分小任务</button></div>`}</section>`;
}
function directStage(s) {
  const t = findLeaf(s.id);
  return `<div class="actions">${t.done ? '<span class="badge">此阶段已完成</span>' : `<button type="button" class="text-button" data-action="complete" data-id="${s.id}">完成此阶段</button>`}${t.done ? `<button type="button" class="text-button" data-action="undo-complete" data-id="${s.id}">撤销完成</button>` : planButton(t)}</div>`;
}
function renderAll() {
  const items = showDone ? C.completedHistory(model) : C.sortTasks(flat().filter(t => !t.done), model.projectSort);
  main.innerHTML = header('全部任务', showDone ? '按完成日期回看，一件件积累你的进展。' : '把待办放在这里，再挑选今天要做的。', '<button type="button" class="primary" data-page="today">查看今日计划</button>') + (showDone ? '' : projectSortControl()) + (manualMode() && !showDone ? manualSelectionSummary() : '') + `<div class="summary"><span>${showDone ? '已完成' : '待办'} ${items.length} ${showDone ? '项记录' : '项'}</span><button type="button" class="secondary" data-action="toggle-done">${showDone ? '查看待办' : '查看已完成'}</button></div>` + (showDone ? '<p class="muted small">按完成日期从近到远排列；项目全部完成后合并为一条项目记录。</p>' : `<p class="muted small">${model.projectSort === 'due' ? '截止时间>重要程度（星级）' : sortDescription}</p>`) + (items.length ? showDone ? renderCompletedHistory(items) : items.map(t => taskRow(t)).join('') : `<div class="card empty"><p>${showDone ? '还没有完成记录。' : '当前没有待办。可以到“我的项目”添加项目和子阶段。'}</p><button type="button" class="secondary" data-page="projects">我的项目</button></div>`);
}
function renderCompletedHistory(items) {
  const groups = new Map();
  for (const entry of items) {
    const day = completedDay(entry.completedAt);
    if (!groups.has(day)) groups.set(day, []);
    groups.get(day).push(entry);
  }
  return Array.from(groups, ([day, entries]) => {
    const dateText = day ? `${Number(day.slice(0, 4))}年${Number(day.slice(5, 7))}月${Number(day.slice(8, 10))}日` : '完成日期未知';
    return `<section class="history-group" data-completed-date="${day || 'unknown'}"><div class="history-date"><h2>${day ? `<time datetime="${day}">${dateText}</time>` : dateText}</h2><span class="muted small">${entries.length} 项记录</span></div><div class="history-list">${entries.map(completedRow).join('')}</div></section>`;
  }).join('');
}
function completedRow(entry) {
  const kindLabel = {
    project: '项目已完成',
    stage: '阶段已完成',
    task: '任务已完成'
  }[entry.kind];
  const context = entry.kind === 'project' ? `${entry.leafCount} 项任务全部完成` : entry.projectTitle + (entry.kind === 'task' ? ' / ' + entry.stageTitle : '');
  const time = entry.completedAt ? `<time datetime="${esc(entry.completedAt)}">${completedTime(entry.completedAt)} 完成</time>` : '旧记录未保存完成时间';
  return `<article class="history-item" data-history-id="${entry.id}" data-history-kind="${entry.kind}"><div class="history-main"><div class="history-title"><span class="badge history-kind">${kindLabel}</span><h3>${esc(entry.title)}</h3></div><div class="muted small history-context">${esc(context)}</div><div class="muted small history-time">${time}</div></div><div class="row-actions"><button type="button" class="secondary" data-action="open-project" data-id="${entry.projectId}">查看项目</button>${entry.leafCount > 1 ? `<button type="button" class="secondary" data-action="restore-completed-group" data-id="${entry.id}">恢复为未完成</button>` : ''}${entry.leafCount === 1 ? `<button type="button" class="text-button" data-action="undo-complete" data-id="${entry.leafIds[0]}">撤销完成</button>` : ''}</div></article>`;
}
function renderRoutine() {
  const r = routine();
  main.innerHTML = header('今日作息', dateHeading()) + routineStatistics() + `<section class="routine-section"><h2 id="sleep-title">计划入睡时间</h2><form id="sleep-form" class="sleep-form"><input type="time" name="sleepTime" aria-labelledby="sleep-title" value="${esc(r.sleepTime)}" required><button type="submit" class="primary">保存时间</button></form><p class="muted small">${r.sleepTime ? '时间已保存，可随时调整。' : '今晚准备几点入睡？'}</p></section><section class="routine-section"><h2>今日饮品</h2><div class="drink-grid">${drinks.map(d => `<div class="drink-card" data-drink="${d.id}"><h3>${d.name}</h3><div class="drink-number"><output aria-label="${d.name}杯数">${r.drinks[d.id]}</output><span>杯</span></div><button type="button" class="secondary" data-action="add-drink" data-kind="${d.id}">＋ ${d.name}</button>${drinkEditButton(d)}</div>`).join('')}</div><p class="muted small">每次确认增加1杯；记错可随时点击“修改杯数”，重开后也能更正。</p></section>`;
}
