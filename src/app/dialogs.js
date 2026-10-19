/* Page routing, dialogs, editing commands and backup actions.
 * Built in the shared private application scope; see build.config.cjs.
 */
function render() {
  if (!destroyEditor()) return;
  C.syncAutoProjects(model, today);
  cleanPlans();
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
  updateSidebar();
}
function openModal(title, body, action, context = null) {
  modalAction = action;
  modalContext = context;
  modal.innerHTML = `<form id="modal-form"><h2 id="modal-title">${esc(title)}</h2>${body}<p class="form-error" id="form-error" role="alert"></p><div class="actions modal-actions"><button type="button" class="secondary" data-action="close-modal">取消</button><button type="submit" class="primary">确认</button></div></form>`;
  modal.setAttribute('aria-labelledby', 'modal-title');
  modal.showModal();
  const input = $('input:not([type="hidden"]),select', modal);
  if (input) input.focus();else $('[data-action="close-modal"]', modal).focus();
}
function closeModal() {
  modal.close();
  modalAction = null;
  modalContext = null;
}
function priorityOptions(value, inherit = false) {
  return (inherit ? `<option value="" ${value == null ? 'selected' : ''}>沿用上一级</option>` : '') + [3, 2, 1].map(n => `<option value="${n}" ${Number(value) === n ? 'selected' : ''}>${'★'.repeat(n)}：${urgencyLabels[n - 1]}</option>`).join('');
}
function editForm(kind, id) {
  let item, title, context;
  if (kind === 'project') {
    item = id ? projectById(id) : {
      title: '',
      priority: 2,
      importance: 2
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
  const deadlineField = `<label class="field">截止时间<input type="date" name="due" value="${item.due || ''}"><span class="muted small">${kind === 'project' ? '可以暂不设置，下级默认沿用' : '留空则沿用上一级截止时间'}</span></label>`;
  const fields = `<div class="form-grid"><label class="field wide">${kind === 'project' ? '项目标题' : kind === 'stage' ? '子阶段名称' : '小任务名称'}<input name="title" value="${esc(item.title)}" maxlength="200" required autocomplete="off"></label><label class="field">紧急程度<select name="priority">${priorityOptions(item.priority, kind !== 'project')}</select></label>${kind === 'project' ? `<label class="field">重要程度<select name="importance">${[3, 2, 1].map(n => `<option value="${n}" ${item.importance === n ? 'selected' : ''}>${labels[n - 1]}</option>`).join('')}</select></label>${deadlineField}` : deadlineField}</div>${id ? `<button type="button" class="danger text-button" data-action="delete-item" data-kind="${kind}" data-id="${id}">删除${kind === 'project' ? '项目' : kind === 'stage' ? '子阶段' : '小任务'}</button>` : ''}`;
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
  openModal('确认删除', `<p>删除“${esc(title)}”${kind === 'task' ? '' : '及其下的全部内容'}？</p><p class="muted small">建议先在“数据与备份”中导出备份。删除后无法在界面中撤销。</p>`, 'delete-item', {
    kind,
    id
  });
}
function changeToday(id, add) {
  const p = plan();
  if (findLeaf(id)?.isProject) {
    p.excludedProjects = p.excludedProjects || [];
    if (add) p.excludedProjects = p.excludedProjects.filter(x => x !== id);else if (!p.excludedProjects.includes(id)) p.excludedProjects.push(id);
  }
  if (add && !p.selected.includes(id)) p.selected.push(id);
  if (!add) {
    p.selected = p.selected.filter(x => x !== id);
    p.visible = p.visible.filter(x => x !== id);
  }
  if (!hasFinishedCard()) refreshVisible();
  save(add ? '已加入今日计划。' : '已移出今日计划，仍保留在待办中。');
  render();
}
function complete(id, value) {
  const g = recordById(id);
  if (!g) return;
  C.setCompletion(model, id, value);
  save(value ? '已完成一项。准备好后，再点击“继续下一个”。' : '已撤销完成。');
  render();
}
function showData() {
  if (!captureNotebook()) return;
  save();
  openModal('数据与备份', `<p>本程序离线运行，数据保存在当前浏览器。导出备份可用于迁移到其他电脑或后续版本。</p><p class="muted small">存储状态：${memoryOnly ? '仅在本次打开期间保留，请先导出备份。' : '本机保存可用。'}</p><div class="actions"><button type="button" class="primary" data-action="export-data">导出备份</button><button type="button" class="secondary" data-action="choose-import">导入备份</button><input id="backup-file" type="file" accept="application/json,.json" hidden></div><p class="muted small">备份包含你的项目、计划、作息及速写内容；请保管好备份文件。</p>`, 'close-data');
}
function downloadBackup() {
  try {
    if (!captureNotebook()) return;
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
  } catch (error) {
    toast(error.message || '无法导出当前数据，请检查内容后重试。', true);
  }
}
