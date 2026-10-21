/* A contextual coach: progress follows successful user actions, never sample-data injection. */
const tutorialPanel = $('#tutorial');
const tutorialPreferenceKey = calendarPreview ? 'three-things-calendar-preview:tutorial:v2' : 'three-things-trial:tutorial:v2';
const tutorialProjectTitle = '学习使用三件事';
let tutorialState = { status: 'intro', step: 0 };
try {
  const stored = JSON.parse(window.localStorage.getItem(tutorialPreferenceKey) || 'null');
  if (stored && ['intro', 'active', 'paused', 'done'].includes(stored.status) && Number.isInteger(stored.step) && stored.step >= 0 && stored.step <= 9) {
    tutorialState = { status: stored.status, step: stored.step, started: stored.started === true, noteReady: stored.noteReady === true, historySeen: stored.historySeen === true, cleaned: stored.cleaned === true };
    if (typeof stored.dragDraft === 'string' && stored.dragDraft.length < 3000) tutorialState.dragDraft = stored.dragDraft;
    if (stored.waterReceipt && C.isDate(stored.waterReceipt.date) && Number.isInteger(stored.waterReceipt.after) && stored.waterReceipt.after > 0 && stored.waterReceipt.after <= 10000) tutorialState.waterReceipt = { date: stored.waterReceipt.date, after: stored.waterReceipt.after };
    for (const key of ['pid', 'sid', 'tid', 'eid', 'nid', 'linkedTid']) if (typeof stored[key] === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(stored[key])) tutorialState[key] = stored[key];
  }
} catch (_) { /* A missing preference must not prevent learning or change user records. */ }
// Older interactive lessons already linked this exact event into the owned stage.
if (!tutorialState.linkedTid && tutorialState.step >= 6 && tutorialState.eid) {
  const event = model.calendarEvents.find(item => item.id === tutorialState.eid);
  const target = K.findTarget(model, event?.targetId);
  if (target?.kind === 'task' && target.project.id === tutorialState.pid && target.stage.id === tutorialState.sid) tutorialState.linkedTid = target.record.id;
}
let tutorialVisible = false;
let tutorialFrame = null;
let tutorialTarget = null;
let tutorialSignature = '';
let tutorialDragForm = null;
let tutorialInlineForm = null;
let tutorialInlinePage = null;
let tutorialRange = null;
let tutorialRangeHint = null;
const tutorialRing = document.createElement('div');
tutorialRing.className = 'tutorial-focus-ring';
tutorialRing.setAttribute('aria-hidden', 'true');
tutorialRing.hidden = true;
document.body.append(tutorialRing);
const tutorialChapters = ['创建项目', '添加阶段', '拆分任务', '完成待办', '查看记录与排日程', '关联项目', '记录想法', '记录喝水', '保存备份', '练习完成'];
function persistTutorial() {
  try { window.localStorage.setItem(tutorialPreferenceKey, JSON.stringify(tutorialState)); } catch (_) { /* Continue for this session. */ }
}
function tutorialAdvance(values = {}) {
  Object.assign(tutorialState, values, { step: tutorialState.step + 1 });
  persistTutorial();
  queueTutorialUpdate();
}
function tutorialCommitted(action, context = {}, id = null) {
  if (tutorialState.status !== 'active') return;
  const s = tutorialState;
  if (action === 'save-item' && !context.id && id) {
    if (s.step === 0 && context.kind === 'project' && projectById(id)?.title === tutorialProjectTitle) tutorialAdvance({ pid: id });
    else if (s.step === 1 && context.kind === 'stage' && context.projectId === s.pid) tutorialAdvance({ sid: id });
    else if (s.step === 2 && context.kind === 'task' && context.stageId === s.sid) tutorialAdvance({ tid: id });
  }
  if (s.step === 3 && action === 'complete' && context.id === s.tid && K.findTarget(model, s.tid)?.record.done) tutorialAdvance();
  if (s.step === 4 && action === 'calendar-save-event' && !context.id && id && tutorialDragForm === $('#modal-form')) tutorialAdvance({ eid: id, dragDraft: null });
  if (s.step === 5 && action === 'calendar-confirm-sync' && context.id === s.eid) {
    const e = model.calendarEvents.find(item => item.id === s.eid);
    if (K.findTarget(model, e?.targetId)?.project.id === s.pid) tutorialAdvance({ linkedTid: e.targetId });
  }
  if (s.step === 6 && action === 'note-new') { s.noteReady = true; persistTutorial(); }
  if (s.step === 6 && action === 'note-save' && s.noteReady && model.notebook.activeEntryId) tutorialAdvance({ nid: model.notebook.activeEntryId });
  if (s.step === 7 && action === 'confirm-drink' && context.id === 'water') tutorialAdvance({ waterReceipt: { date: context.date, after: model.routines[context.date].drinks.water } });
  if (s.step === 8 && action === 'backup') tutorialAdvance();
  queueTutorialUpdate();
}
function tutorialValidate(action, context, data) {
  if (!tutorialVisible || tutorialState.status !== 'active') return;
  const s = tutorialState;
  if (s.step === 0 && action === 'save-item' && context.kind === 'project' && !context.id && String(data.get('title') || '').trim() !== tutorialProjectTitle) throw new Error('本次练习请将项目命名为“学习使用三件事”。暂停教程后可自由创建其他项目。');
  if (s.step === 4 && action === 'calendar-save-event' && !context.id && (!data.get('startTime') || !(data.get('endTime') || data.has('endOfDay')))) throw new Error('本次练习请同时选择开始和截止时间，保存后就能在日程表里找到它。');
  if (s.step === 5 && action === 'calendar-confirm-sync' && context.id === s.eid && (data.get('destination') !== 'task' || data.get('projectId') !== s.pid || data.get('stageId') !== s.sid)) throw new Error('本次练习请选择“加入已有项目 · 新任务”，再选择练习项目和刚创建的阶段。');
}
function tutorialNavigate(targetPage) {
  const secondary = ['all', 'notebook', 'routine'].includes(targetPage);
  if (secondary && otherFeaturesPopover.hidden) return { target: '#other-features-toggle', title: '打开其他功能', text: '点击高亮的“其他功能”，再选择“' + ({ all: '全部任务', notebook: '速写本', routine: '今日作息' }[targetPage]) + '”。' };
  return { target: '.navigation [data-page="' + targetPage + '"]', title: '进入' + ({ projects: '我的项目', today: '今日计划', calendar: '日历', all: '全部任务', notebook: '速写本', routine: '今日作息' }[targetPage]), text: '点击高亮入口，我们就在这个界面完成下一项练习。' };
}
function tutorialExpectedForm() {
  const s = tutorialState;
  return modal.open && modalAction === 'save-item' && !modalContext?.id && (s.step === 0 && modalContext.kind === 'project' || s.step === 1 && modalContext.kind === 'stage' && modalContext.projectId === s.pid || s.step === 2 && modalContext.kind === 'task' && modalContext.stageId === s.sid);
}
function tutorialInstruction() {
  const s = tutorialState;
  if (s.status === 'intro' && modal.open) return { target: '#modal [data-action="close-modal"]', title: '先处理已有内容', text: '请先保存或主动丢弃原有草稿，再开始实操。教程不会替换这份内容。' };
  if (s.status === 'intro') return { title: '亲手学会用三件事', text: '我们会一起创建“学习使用三件事”，添加阶段和任务，再安排日程、记一条速写。请直接操作高亮的按钮；练习内容会保留。', intro: true };
  if (s.step === 9) return { title: '你已经完成实操练习', text: '可以保留练习继续整理，也可以一键清空本轮练习项目、日程和速写，从空白开始使用。其他记录和备份文件会保留。', finished: true };
  if (s.step > 0 && !projectById(s.pid) || s.step > 1 && stageById(s.sid)?.project.id !== s.pid || s.step > 2 && s.step <= 3 && !K.findTarget(model, s.tid) || s.step === 5 && !model.calendarEvents.some(e => e.id === s.eid)) return { title: '练习内容已被移除或撤销', text: '找不到这一步需要的练习记录。可以重新练习，现有其他记录会保留。', missing: true };
  if (modal.open) {
    if (tutorialExpectedForm()) {
      const input = $('[name="title"]', modal);
      const titles = ['学习使用三件事', '入门练习', '完成一次操作练习'];
      const ready = input.value.trim() && (s.step !== 0 || input.value.trim() === tutorialProjectTitle);
      return { target: ready ? '#modal-form button[type="submit"]' : '#modal [name="title"]', title: ['给项目起个名字', '写下阶段名称', '写下第一项小任务'][s.step], text: ready ? '名称填好了。点击表单里的“确认”，保存后就会继续。' : '请在高亮输入框中填写下面的名称，然后点击“确认”。', example: titles[s.step] };
    }
    if (s.step === 4 && modalAction === 'calendar-save-event' && !modalContext.id) {
      if (!tutorialDragForm && s.dragDraft && model.formDraft?.action === 'calendar-save-event' && !model.formDraft.context.id && JSON.stringify(formValues()) === s.dragDraft) tutorialDragForm = $('#modal-form');
      if (tutorialDragForm !== $('#modal-form')) return { target: '#modal [data-action="close-modal"]', title: '这次练习用鼠标拖选', text: '请先关闭这个窗口，回到日程表，在高亮的空白区按住鼠标向下拖动，再松开。若已填写其他内容，可暂停教程后保存。' };
      const title = $('[name="title"]', modal), start = $('[name="startTime"]', modal), end = $('[name="endTime"]', modal);
      const target = !title.value.trim() ? title : !start.value ? start : !end.value && !$('[name="endOfDay"]', modal).checked ? end : $('#modal-form button[type="submit"]');
      return { node: target, title: '拖选成功，给日程起个名字', text: '你拖选的时间已经填好了。输入下面的名称，再点击“确认”。也可以在这里调整具体时间。', example: '练习安排时间' };
    }
    if (s.step === 5 && modalContext?.id === s.eid) {
      if (modalAction === 'calendar-start-sync') return { target: '#modal-form button[type="submit"]', title: '把日程放进项目', text: '日程已保存。点击“确认”，接着选择它要加入的项目和阶段。' };
      if (modalAction === 'calendar-confirm-sync') {
        const destination = $('[name="destination"]', modal), project = $('[name="projectId"]', modal), stage = $('[name="stageId"]', modal);
        return { node: destination.value !== 'task' ? destination : project.value !== s.pid ? project : stage.value !== s.sid ? stage : $('#modal-form button[type="submit"]'), title: '选择练习项目和阶段', text: '加入方式选择“加入已有项目 · 新任务”；所属项目选择“学习使用三件事”，阶段选择刚才创建的阶段，然后确认。' };
      }
    }
    if (s.step === 7 && modalAction === 'confirm-drink' && modalContext?.id === 'water') return { target: '#modal-form button[type="submit"]', title: '确认这一杯水', text: '点击“确认”会真实增加一杯喝水记录。如果现在没有喝水，可以稍后继续并跳过这一项。' };
    if (s.step === 8 && modalAction === 'close-data') return { target: '#modal [data-action="export-data"]', title: '保存一份自己的备份', text: '点击“导出备份”，选择文件保存位置。也可以直接按 Ctrl+S 保存一份手动备份。', optional: true };
    return { target: '#modal [data-action="close-modal"]', title: '先处理当前窗口', text: '当前窗口不是这一步的练习。请先完成它，或点击“稍后继续”。已有草稿不会被教程覆盖。' };
  }
  if (model.formDraft && s.step <= 2 && !((s.step === 0 && model.formDraft.context.kind === 'project' && !model.formDraft.context.id) || (s.step === 1 && model.formDraft.context.projectId === s.pid) || (s.step === 2 && model.formDraft.context.stageId === s.sid))) return { target: '[data-action="restore-form-draft"]', title: '先完成已有草稿', text: '请点“继续编辑”处理上次未提交的内容，完成或主动丢弃后再继续练习。' };
  if (s.step === 0) return page !== 'projects' || boot ? tutorialNavigate('projects') : { target: '#main [data-action="new-project"]', title: '新建练习项目', text: '点击“新建项目”。这次我们要创建的项目叫“学习使用三件事”。' };
  if (s.step === 1 || s.step === 2) {
    if (page !== 'detail' || activeProject !== s.pid) return { target: '.project-card[data-project-id="' + s.pid + '"]', title: '进入练习项目', text: '点击“学习使用三件事”项目卡片，进入子阶段与进度界面。', repair: true };
    return s.step === 1 ? { target: '#main [data-action="new-stage"]', title: '添加一个阶段', text: '点击“添加子阶段”，把项目的第一步命名为“入门练习”。' } : { target: '[data-action="new-task"][data-id="' + s.sid + '"]', title: '把阶段拆成小任务', text: '点击高亮的按钮，添加一项“完成一次操作练习”。' };
  }
  if (s.step === 3) {
    if (page !== 'today') return tutorialNavigate('today');
    const button = $('#main [data-action="complete"][data-id="' + s.tid + '"]');
    if (button) return { node: button, title: '完成你刚创建的任务', text: '找到“学习使用三件事”下的“完成一次操作练习”，点击它的“标记完成”。其他待办请保留。' };
    if ($('[data-action="toggle-queue"]')) return { target: '[data-action="toggle-queue"]', title: '展开后续待办', text: '练习任务也在完整队列里。点击“展开全部待办”，找到刚创建的任务。' };
    return { title: '练习任务的状态已改变', text: '如果你已在别处完成它，请点击“核对练习进度”；撤销完成后也可以回到这里再练一次。', reconcile: true };
  }
  if (s.step === 4 && !s.historySeen) {
    if (page !== 'all') return tutorialNavigate('all');
    if (!showDone) return { target: '[data-action="toggle-done"]', title: '找到刚完成的练习', text: '在“全部任务”点击“查看已完成”，就能找到刚才完成的练习项目。' };
    s.historySeen = true;
    persistTutorial();
  }
  if (s.step === 4) return page !== 'calendar' ? tutorialNavigate('calendar') : tutorialDragInstruction();
  if (s.step === 5) return { target: '.schedule-event[data-id="' + s.eid + '"]', title: '继续关联练习日程', text: '日程已经保存。点击下面“继续关联”，选择加入练习项目。', sync: true };
  if (s.step === 6) {
    if (page !== 'notebook') return tutorialNavigate('notebook');
    if (!s.noteReady || model.notebook.activeEntryId) return { target: '[data-action="note-new"]', title: '新建一条练习速写', text: '点击“新建速写”，再写一句今天学会的操作。当前已有草稿会保留到历史记录中。' };
    const input = $('#note-host [contenteditable="true"]');
    return { node: input && input.textContent.trim() ? $('[data-action="note-save"]') : input, title: '写下并保存一条想法', text: '在高亮编辑区输入下面这句话，然后点击“保存速写”。也可以写你自己的想法。', example: '今天学会了创建项目和安排日程。' };
  }
  if (s.step === 7) return page !== 'routine' ? { ...tutorialNavigate('routine'), optional: true } : { target: '#main [data-action="add-drink"][data-kind="water"]', title: '试着记录一杯水', text: '如果刚喝了一杯水，点击喝水栏的记录按钮，再确认。没有喝水就点“跳过这项”，不会添加虚假的记录。', optional: true };
  return { target: '.sidebar [data-action="open-data"]', title: '亲手导出一次备份', text: '点击“备份与数据”，再点“导出备份”。也可以直接按 Ctrl+S。', optional: true };
}
function queueTutorialUpdate() {
  if (!tutorialVisible || tutorialFrame != null) return;
  tutorialFrame = requestAnimationFrame(() => { tutorialFrame = null; renderTutorial(); });
}
function tutorialDragInstruction() {
  const days = K.weekDays(calendarDay);
  const empty = (day, start) => !model.calendarEvents.some(e => e.date === day && e.startTime && e.endTime && K.timeMinutes(e.startTime) < start + 60 && K.timeMinutes(e.endTime) > start);
  if (!tutorialRangeHint || !days.includes(tutorialRangeHint.date) || !empty(tutorialRangeHint.date, tutorialRangeHint.start)) {
    tutorialRangeHint = null;
    const starts = [...Array.from({ length: 14 }, (_, i) => 540 + i * 60), 360, 420, 480];
    for (const date of [calendarDay, ...days.filter(day => day !== calendarDay)]) {
      const start = starts.find(minute => empty(date, minute));
      if (start != null) { tutorialRangeHint = { date, start }; break; }
    }
  }
  if (!tutorialRangeHint) return { target: '[data-action="calendar-week"][data-offset="1"]', title: '换一周找个空白时间', text: '这一周已经排满了。点击下一周，再在空白区域拖选一段时间。' };
  if (calendarView !== 'week') return { target: '[data-action="calendar-toggle-view"]', title: '切回日程表', text: '点击切换按钮进入日程表，我们用鼠标拖动创建日程。' };
  const column = document.querySelector('[data-schedule-day="' + tutorialRangeHint.date + '"]');
  if (column) {
    if (!tutorialRange) { tutorialRange = document.createElement('div'); tutorialRange.className = 'tutorial-range'; tutorialRange.setAttribute('aria-hidden', 'true'); tutorialRange.innerHTML = '<span>按住 ↓ 拖动</span>'; }
    if (tutorialRange.parentNode !== column) column.append(tutorialRange);
    tutorialRange.style.top = ((tutorialRangeHint.start - K.SCHEDULE.start) * K.SCHEDULE.hourHeight / 60) + 'px';
    tutorialRange.style.height = K.SCHEDULE.hourHeight + 'px';
  }
  return { node: tutorialRange, title: '在日程表上拖出一段时间', text: '把鼠标移到彩色圈出的空白区域，按住左键向下拖动，再松开。随后填写日程名称并保存。', drag: true };
}
function tutorialScheduleSelected(day, range) {
  if (!tutorialVisible || tutorialState.status !== 'active' || tutorialState.step !== 4 || !modal.open || modalAction !== 'calendar-save-event' || modalContext.id) return;
  if ($('[name="date"]', modal).value !== day || $('[name="startTime"]', modal).value !== K.minuteTime(range.start)) return;
  tutorialDragForm = $('#modal-form');
  tutorialRememberDrag();
  queueTutorialUpdate();
}
function tutorialRememberDrag() {
  if (tutorialState.step === 4 && modal.open && tutorialDragForm === $('#modal-form')) { tutorialState.dragDraft = JSON.stringify(formValues()); persistTutorial(); }
}
function tutorialRect(node) {
  if (!node?.isConnected || !node.getClientRects().length) return null;
  const r = node.getBoundingClientRect();
  if (r.width < 1 || r.height < 1 || r.right <= 0 || r.left >= innerWidth || r.bottom <= 0 || r.top >= innerHeight) return null;
  return { left: Math.max(4, r.left - 7), top: Math.max(4, r.top - 7), right: Math.min(innerWidth - 4, r.right + 7), bottom: Math.min(innerHeight - 4, r.bottom + 7) };
}
function positionTutorial(target) {
  const narrow = innerWidth < 960 || (modal.open ? tutorialInlineForm === $('#modal-form') : tutorialInlinePage === page);
  tutorialPanel.classList.toggle('tutorial-inline', narrow);
  const parent = modal.open ? modal : narrow ? main : document.body;
  if (tutorialPanel.parentNode !== parent) parent.prepend(tutorialPanel);
  if (!narrow) {
    const size = { width: tutorialPanel.offsetWidth, height: tutorialPanel.offsetHeight };
    const placed = window.ThreeThingsTutorial.positionCoach(tutorialRect(target), size, { width: innerWidth, height: innerHeight });
    if (placed) {
      tutorialPanel.style.left = placed.left + 'px'; tutorialPanel.style.top = placed.top + 'px'; tutorialPanel.dataset.placement = placed.side;
    } else if (target) {
      if (modal.open) tutorialInlineForm = $('#modal-form');else tutorialInlinePage = page;
      const inlineParent = modal.open ? modal : main;
      if (tutorialPanel.parentNode !== inlineParent) inlineParent.prepend(tutorialPanel);
      tutorialPanel.classList.add('tutorial-inline'); tutorialPanel.dataset.placement = 'inline';
    } else {
      tutorialPanel.style.left = Math.max(12, (innerWidth - size.width) / 2) + 'px';
      tutorialPanel.style.top = Math.max(12, (innerHeight - size.height) / 2) + 'px'; tutorialPanel.dataset.placement = 'center';
    }
  } else tutorialPanel.dataset.placement = 'inline';
  const ringParent = modal.open ? modal : document.body;
  if (tutorialRing.parentNode !== ringParent) ringParent.append(tutorialRing);
  const focus = tutorialRect(target);
  tutorialRing.hidden = !focus;
  if (focus) {
    tutorialRing.dataset.kind = target === tutorialRange ? 'drag' : target.matches('input,select,textarea,[contenteditable="true"]') ? 'input' : 'click';
    for (const [key, value] of Object.entries({ left: focus.left, top: focus.top, width: focus.right - focus.left, height: focus.bottom - focus.top })) tutorialRing.style[key] = value + 'px';
  }
}
function renderTutorial() {
  if (!tutorialVisible) return;
  const step = tutorialInstruction();
  if (!step.drag) tutorialRange?.remove();
  modal.classList.toggle('tutorial-with-coach', modal.open);
  document.body.classList.add('tutorial-running');
  const target = step.node || (step.target ? document.querySelector(step.target) : null);
  if (tutorialTarget !== target) {
    tutorialTarget?.classList.remove('tutorial-target');
    tutorialTarget = target;
    target?.classList.add('tutorial-target');
    if (target && !target.closest('#other-features-popover')) target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  const signature = JSON.stringify([tutorialState.status, tutorialState.step, step.title, step.text, step.example, step.optional, step.missing, step.sync, step.reconcile, step.repair, step.drag]);
  if (signature !== tutorialSignature) {
    tutorialSignature = signature;
    tutorialPanel.innerHTML = '<div class="tutorial-top"><span>边做边学 · ' + (step.intro ? '欢迎' : (tutorialState.step + 1) + '/10 · ' + tutorialChapters[tutorialState.step]) + '</span><button type="button" class="text-button" data-guide-action="pause">' + (step.intro ? '暂不学习' : '暂停') + '</button></div><h2 id="tutorial-title">' + esc(step.title) + '</h2><p aria-live="polite">' + esc(step.text) + '</p>'
      + (step.example ? '<div class="tutorial-example"><span>请填写</span><strong>' + esc(step.example) + '</strong></div>' : '')
      + '<div class="tutorial-controls">'
      + (step.intro ? '<button type="button" class="primary" data-guide-action="start">开始实操</button>' : '')
      + (step.missing ? '<button type="button" class="primary" data-guide-action="restart">重新练习</button>' : '')
      + (step.repair && !target ? '<button type="button" class="secondary" data-guide-action="project">回到练习项目</button>' : '')
      + (step.sync ? '<button type="button" class="primary" data-guide-action="sync">继续关联</button>' : '')
      + (step.reconcile ? '<button type="button" class="secondary" data-guide-action="reconcile">核对练习进度</button>' : '')
      + (step.optional ? '<button type="button" class="text-button" data-guide-action="skip">跳过这项</button>' : '')
      + (step.finished ? '<button type="button" class="primary" data-guide-action="cleanup">清空练习内容，开始使用</button><button type="button" class="secondary" data-guide-action="finish">保留练习内容</button><button type="button" class="text-button" data-guide-action="project">查看练习项目</button><button type="button" class="text-button" data-guide-action="restart">再练一次</button>' : '')
      + '</div><small>直接操作彩色圈出的位置，完成后自动继续。</small>';
  }
  tutorialPanel.hidden = false;
  positionTutorial(target);
  tutorialRememberDrag();
}
function cleanupTutorial() {
  if (tutorialState.step !== 9) return;
  if (!captureNotebook() || !save(undefined, { recordUndo: Boolean(editor) }).ok) return;
  try {
    model = window.ThreeThingsTutorial.clearPractice(model, tutorialState);
    const result = save('已清空本轮练习内容，可按 Ctrl+Z 撤销。');
    if (!result.ok) return;
    destroyEditor(false);
    if (modal.open) closeModal({ submitted: true });
    tutorialState.cleaned = true;
    pauseTutorial(true);
    boot = false; activeProject = null; page = 'projects'; render();
    toast('本轮练习内容已清空，可以从新建项目开始。Ctrl+Z 可撤销清理。');
  } catch (error) { toast(error.message || '清理未完成，请稍后重试。', true); }
}
function openTutorial() {
  if (tutorialVisible) return true;
  if (tutorialState.status === 'done') {
    const hasPractice = !tutorialState.cleaned && (projectById(tutorialState.pid) || model.calendarEvents.some(e => e.id === tutorialState.eid) || model.notebook.entries.some(n => n.id === tutorialState.nid));
    if (tutorialState.step === 9 && hasPractice) tutorialState.status = 'active';else tutorialState = { status: 'intro', step: 0 };
  }
  if (tutorialState.status === 'paused') tutorialState.status = tutorialState.started ? 'active' : 'intro';
  tutorialVisible = true;
  tutorialSignature = '';
  closeOtherFeatures();
  persistTutorial();
  renderTutorial();
  return true;
}
function pauseTutorial(done = false) {
  tutorialVisible = false;
  tutorialState.status = done ? 'done' : 'paused';
  persistTutorial();
  tutorialPanel.hidden = true;
  tutorialRing.hidden = true;
  tutorialRange?.remove();
  tutorialTarget?.classList.remove('tutorial-target');
  tutorialTarget = null;
  document.body.classList.remove('tutorial-running');
  modal.classList.remove('tutorial-with-coach');
  document.body.append(tutorialPanel, tutorialRing);
  toast(done ? '练习完成。可从“左下角“？” → 使用帮助”重新练习。' : '教程已暂停，可从“左下角“？” → 使用帮助”继续。');
}
function maybeStartTutorial() {
  if (calendarPreview || tutorialVisible) return;
  if (tutorialState.status === 'active' || tutorialState.status === 'intro' && !modal.open) openTutorial();
}
tutorialPanel.addEventListener('click', event => {
  const button = event.target.closest('[data-guide-action]');
  if (!button) return;
  event.stopPropagation();
  const action = button.dataset.guideAction;
  if (action === 'cleanup') { cleanupTutorial(); return; }
  if (action === 'pause' || action === 'finish') { pauseTutorial(action === 'finish'); return; }
  if ((action === 'start' || action === 'restart') && model.formDraft) {
    restoreFormDraft();
    toast('请先保存或主动丢弃已有草稿，再开始实操教程。');
    queueTutorialUpdate();
    return;
  }
  if (action === 'start' || action === 'restart') { tutorialState = { status: 'active', step: 0, started: true }; persistTutorial(); }
  if (action === 'skip' && [7, 8].includes(tutorialState.step)) tutorialAdvance();
  if (action === 'project' && projectById(tutorialState.pid)) { if (tutorialState.step === 9) pauseTutorial(true); openProjectDetail(tutorialState.pid); }
  if (action === 'sync') calendarSyncForm(tutorialState.eid);
  if (action === 'reconcile' && K.findTarget(model, tutorialState.tid)?.record.done) tutorialAdvance();
  queueTutorialUpdate();
});
for (const type of ['click', 'input', 'change', 'focusin', 'pointerover']) document.addEventListener(type, queueTutorialUpdate);
window.addEventListener('resize', () => { tutorialInlineForm = null; tutorialInlinePage = null; queueTutorialUpdate(); });
window.addEventListener('scroll', queueTutorialUpdate, { passive: true, capture: true });
window.addEventListener('beforeunload', tutorialRememberDrag);
modal.addEventListener('close', () => { maybeStartTutorial(); queueTutorialUpdate(); });
