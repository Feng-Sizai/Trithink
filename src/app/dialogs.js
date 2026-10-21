/* Page routing, dialogs, editing commands and backup actions.
 * Built in the shared private application scope; see build.config.cjs.
 */
function render() {
  cancelScheduleGesture();
  closeScheduleMenu();
  if (!destroyEditor()) return;
  C.syncAutoProjects(model, today);
  cleanPlans();
  main.classList.toggle('deadline-urgent', page === 'detail' && Boolean(urgentClass(projectById(activeProject))));
  document.querySelectorAll('nav [data-page]').forEach(b => {
    if (b.dataset.page === (page === 'detail' ? 'projects' : page === 'note-history' ? 'notebook' : page)) b.setAttribute('aria-current', 'page');else b.removeAttribute('aria-current');
  });
  otherFeaturesToggle.classList.toggle('active', ['all', 'notebook', 'note-history', 'routine'].includes(page));
  if (boot) renderWelcome();else ({
    today: renderToday,
    projects: renderProjects,
    detail: renderDetail,
    all: renderAll,
    routine: renderRoutine,
    calendar: renderCalendar,
    notebook: renderNotebook,
    'note-history': renderNotebookHistory
  }[page] || renderToday)();
  renderDraftNotice();
  renderRecoveryNotice();
  updateSidebar();
  urgentSignature = deadlineSignature();
  if (typeof persistViewState === 'function') persistViewState();
  queueTutorialUpdate();
}
function openModal(title, body, action, context = null) {
  modalAction = action;
  modalContext = context;
  modal.innerHTML = `<form id="modal-form"><h2 id="modal-title">${esc(title)}</h2>${body}<p class="form-error" id="form-error" role="alert"></p><div class="actions modal-actions"><button type="button" class="secondary" data-action="close-modal">取消</button><button type="submit" class="primary">确认</button></div></form>`;
  modal.setAttribute('aria-labelledby', 'modal-title');
  modal.showModal();
  modalInitialValues = draftAction(action) ? JSON.stringify(formValues()) : null;
  if (draftAction(action)) {
    applyFormDraft();
    $('.modal-actions', modal).insertAdjacentHTML('beforebegin', '<p class="muted small form-draft-status">未提交内容会自动保存为草稿；确认后才加入项目或日程。</p>');
    $('.modal-actions', modal).insertAdjacentHTML('afterbegin', '<button type="button" class="text-button" data-action="discard-form-draft">丢弃草稿</button>');
    $('[data-action="close-modal"]', modal).textContent = '稍后继续';
  }
  const input = $('input:not([type="hidden"]),select', modal);
  if (input) input.focus();else $('[data-action="close-modal"]', modal).focus();
  queueTutorialUpdate();
}
function closeModal({ submitted = false } = {}) {
  if (!submitted && captureFormDraft()) save(undefined, { recordUndo: false });
  modalInitialValues = null;
  modal.close();
  modalAction = null;
  modalContext = null;
  renderDraftNotice();
}
function priorityOptions(value, inherit = false) {
  return (inherit ? `<option value="" ${value == null ? 'selected' : ''}>沿用上一级</option>` : '') + [3, 2, 1, 0].map(n => `<option value="${n}" ${value != null && value !== '' && Number(value) === n ? 'selected' : ''}>${n ? '★'.repeat(n) + '：' : ''}${priorityLabels[n]}</option>`).join('');
}
function editForm(kind, id) {
  let item, title, context;
  if (kind === 'project') {
    item = id ? projectById(id) : {
      title: '',
      priority: 1
    };
    title = id ? '编辑项目' : '新建项目';
    context = {
      kind,
      id
    };
  }
  if (kind === 'stage') {
    const g = id ? stageById(id) : null;
    item = g ? g.stage : {
      title: '',
      priority: null,
      due: null
    };
    title = id ? '编辑子阶段' : '添加子阶段';
    context = {
      kind,
      id,
      projectId: g ? g.project.id : activeProject
    };
  }
  if (kind === 'task') {
    const g = id ? recordById(id) : null;
    item = g ? g.record : {
      title: '',
      priority: null,
      due: null
    };
    title = id ? '编辑小任务' : '添加小任务';
    context = {
      kind,
      id,
      stageId: g ? g.stage.id : modalContext?.stageId
    };
  }
  if (redirectToPendingDraft('save-item', context)) return;
  const deadlineField = `<fieldset class="deadline-fields field wide"><legend>截止时间</legend><div class="deadline-inputs"><input aria-label="截止日期（选填）" type="date" name="due" value="${item.due || ''}"><input aria-label="截止时刻（选填）" type="time" name="dueTime" value="${item.dueTime || ''}"></div><span class="muted small">${kind === 'project' ? '日期可不填；' : '日期留空沿用上一级；'}时刻留空默认为当天 24:00，默认时刻不显示</span></fieldset>`;
  const fields = `<div class="form-grid"><label class="field wide">${kind === 'project' ? '项目标题' : kind === 'stage' ? '子阶段名称' : '小任务名称'}<input name="title" value="${esc(item.title)}" maxlength="200" required autocomplete="off"></label><label class="field">重要程度<select name="priority">${priorityOptions(item.priority, kind !== 'project')}</select></label>${deadlineField}</div>${id ? `<button type="button" class="danger text-button" data-action="delete-item" data-kind="${kind}" data-id="${id}">删除${kind === 'project' ? '项目' : kind === 'stage' ? '子阶段' : '小任务'}</button>` : ''}`;
  openModal(title, fields, 'save-item', context);
}
function addTask(stageId) {
  modalContext = {
    stageId
  };
  editForm('task', null);
}
function confirmDelete(kind, id) {
  closeModal();
  let title = '';
  if (kind === 'project') title = projectById(id)?.title;
  if (kind === 'stage') title = stageById(id)?.stage.title;
  if (kind === 'task') title = recordById(id)?.record.title;
  openModal('确认删除', `<p>删除“${esc(title)}”${kind === 'task' ? '' : '及其下的全部内容'}？</p><p class="muted small">建议先在“数据与备份”中导出备份。本次打开期间可按 Ctrl+Z 撤销。</p>`, 'delete-item', {
    kind,
    id
  });
}
function changeToday(id, add) {
  if (!add) return deferToday(id);
  plan().deferred = plan().deferred.filter(value => value !== id);
  if (save('已恢复自动候选。').ok) render();
}
function complete(id, value) {
  const g = K.findTarget(model, id);
  if (!g) return;
  C.setCompletion(model, id, value);
  const result = save(value ? '已完成一项，已从待办队列移除并递补。' : '已撤销完成。');
  if (result.ok && value) tutorialCommitted('complete', { id });
  render();
}
function recoveryDescription() {
  const source = loaded.source;
  return source ? source.kind + ' · ' + source.name + (source.savedAt ? ' · 保存于 ' + new Date(source.savedAt).toLocaleString('zh-CN') : ' · 旧版资料') + (source.revision ? ' · 保存序号 ' + source.revision : '') : '上一次有效备份';
}
function renderRecoveryNotice() {
  document.querySelector('#recovery-notice')?.remove();
  if (!recoveryNoticeVisible) return;
  main.insertAdjacentHTML('afterbegin', '<aside class="recovery-notice" id="recovery-notice"><div><strong>已恢复有效备份</strong><p>' + esc(recoveryDescription()) + '</p><p>请核对项目和日程；当前内容已继续自动保存。</p></div><button type="button" class="secondary" data-action="dismiss-recovery-notice">知道了</button></aside>');
}
function completeProjectPrompt(id) {
  const target = K.findTarget(model, id);
  if (!target) return;
  const leaves = flat().filter(item => item.projectId === id && !item.done);
  if (leaves.length <= 1) { complete(id, true); return; }
  openModal('完成整个项目', '<p>将“' + esc(target.record.title) + '”及其中 ' + leaves.length + ' 项未完成事项全部标为已完成？</p><p class="muted small">以后仍可在完成历史中一键恢复为未完成。</p>', 'confirm-complete-project', { id });
}
function restoreCompletedGroup(id) {
  const target = K.findTarget(model, id);
  if (!target) return;
  openModal('恢复为未完成', '<p>将“' + esc(target.record.title) + '”及其全部子事项恢复为未完成？</p><p class="muted small">只改变完成状态，名称、截止时间和日程关联保留。</p>', 'confirm-restore-group', { id });
}
function showData() {
  if (!captureNotebook()) return;
  save(undefined, { recordUndo: Boolean(editor) });
  openModal('数据与备份', `<p>${window.ThreeThingsDesktop ? '本程序离线运行，每次保存会写入本机数据文件并保留最近 100 份不同内容的自动备份。重新打开时自动读取；文件损坏时尝试恢复备份。' : '本程序离线运行，数据保存在当前浏览器。'}导出备份可用于迁移到其他电脑或后续版本。</p><p class="muted small">存储状态：${memoryOnly ? '仅在本次打开期间保留，请先导出备份。' : '本机保存可用。'}</p><div class="actions"><button type="button" class="primary" data-action="export-data">导出备份</button><button type="button" class="secondary" data-action="choose-import">导入备份</button><input id="backup-file" type="file" accept="application/json,.json" hidden></div>${loaded.recovered ? '<p class="muted small">本次恢复来源：' + esc(recoveryDescription()) + '</p>' : ''}<p class="muted small">Ctrl+S 可另存一份手动备份，完成后会显示文件位置。备份包含项目、日历日程、完整队列与当天暂缓标记、作息、速写及尚未提交的表单草稿。表单草稿只有确认后才会加入正式记录。</p>`, 'close-data');
}
function downloadBackup() {
  try {
    if (!captureNotebook()) return;
    captureFormDraft();
    const blob = new Blob([S.exportJSON(model)], {
        type: 'application/json'
      }),
      url = URL.createObjectURL(blob),
      a = document.createElement('a');
    a.href = url;
    a.download = `三件事-备份-${today}.json`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    toast('已生成备份文件。');
    tutorialCommitted('backup');
  } catch (error) {
    toast(error.message || '无法导出当前数据，请检查内容后重试。', true);
  }
}
