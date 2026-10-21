/* Unsubmitted item/event forms remain separate from committed records. */
let draftTimer = null;
let modalInitialValues = null;
let restoringFormDraft = false;
function draftAction(action) {
  return ['save-item', 'calendar-save-event'].includes(action);
}
function formValues() {
  const values = {};
  for (const input of modal.querySelectorAll('input[name],select[name]')) values[input.name] = input.type === 'checkbox' ? input.checked ? 'true' : '' : input.value;
  return values;
}
function draftIdentity(action, context) {
  return JSON.stringify([action, context?.kind || null, context?.id || null, context?.projectId || null, context?.stageId || null]);
}
function clearFormDraft() {
  clearTimeout(draftTimer);
  draftTimer = null;
  delete model.formDraft;
}
function captureFormDraft() {
  clearTimeout(draftTimer);
  if (!modal.open || !draftAction(modalAction) || modalInitialValues === null) return false;
  const values = formValues();
  if (JSON.stringify(values) === modalInitialValues) {
    if (!model.formDraft) return false;
    clearFormDraft();
    return true;
  }
  const context = { ...modalContext };
  const unchanged = model.formDraft && draftIdentity(model.formDraft.action, model.formDraft.context) === draftIdentity(modalAction, context) && JSON.stringify(model.formDraft.values) === JSON.stringify(values);
  if (!unchanged) model.formDraft = { action: modalAction, context, values, savedAt: new Date().toISOString() };
  return !unchanged;
}
function applyFormDraft() {
  const draft = model.formDraft;
  if (!draft || draftIdentity(draft.action, draft.context) !== draftIdentity(modalAction, modalContext)) return;
  for (const [name, value] of Object.entries(draft.values)) {
    const input = modal.querySelector('[name="' + name + '"]');
    if (!input) continue;
    if (input.type === 'checkbox') input.checked = value === 'true';else input.value = value;
  }
  const end = modal.querySelector('[name=endTime]');
  if (end) end.disabled = modal.querySelector('[name=endOfDay]').checked;
}
function redirectToPendingDraft(action, context) {
  if (!model.formDraft || restoringFormDraft || draftIdentity(model.formDraft.action, model.formDraft.context) === draftIdentity(action, context)) return false;
  restoreFormDraft();
  toast('请先确认或丢弃已有草稿，再编辑另一事项。');
  return true;
}
function restoreFormDraft() {
  const draft = model.formDraft;
  if (!draft) return;
  const c = draft.context;
  const missing = c.id && !K.findTarget(model, c.id) && !model.calendarEvents.some(event => event.id === c.id)
    || draft.action === 'save-item' && !c.id && (c.kind === 'stage' && !projectById(c.projectId) || c.kind === 'task' && !stageById(c.stageId));
  if (missing) { toast('草稿对应事项已不存在，可在草稿提示中丢弃。', true); return; }
  restoringFormDraft = true;
  try {
    if (draft.action === 'calendar-save-event') calendarEventForm(c.id, draft.values.date || today);
    else {
      if (c.kind === 'stage' && !c.id) activeProject = c.projectId;
      if (c.kind === 'task' && !c.id) addTask(c.stageId);else editForm(c.kind, c.id);
    }
  } finally { restoringFormDraft = false; }
}
function renderDraftNotice() {
  document.querySelector('#draft-notice')?.remove();
  if (!model.formDraft || modal.open) return;
  main.insertAdjacentHTML('afterbegin', '<aside class="draft-notice" id="draft-notice"><span>有一份未提交草稿：' + esc(model.formDraft.values.title || '未命名事项') + '</span><div class="actions"><button type="button" class="secondary" data-action="restore-form-draft">继续编辑</button><button type="button" class="text-button" data-action="discard-form-draft">丢弃草稿</button></div></aside>');
}
function scheduleFormDraft() {
  if (!draftAction(modalAction)) return;
  clearTimeout(draftTimer);
  draftTimer = setTimeout(() => {
    if (captureFormDraft()) {
      const result = save(undefined, { recordUndo: false });
      const status = modal.querySelector('.form-draft-status');
      if (status) status.textContent = result.ok && result.persistent ? '未提交内容已作为草稿保存；确认后才加入项目或日程。' : '草稿尚未持久保存，请保留填写内容。';
    }
  }, 250);
}
modal.addEventListener('input', scheduleFormDraft);
modal.addEventListener('change', scheduleFormDraft);
