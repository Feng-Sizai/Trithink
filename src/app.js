/* Application entry: DOM events, daily rollover and initial rendering.
 * Built in the shared private application scope; see build.config.cjs.
 */
document.addEventListener('click', event => {
  ensureCurrentDay();
  const button = event.target.closest('button');
  if (!button) {
    const projectCard = event.target.closest('.project-card[data-project-id]');
    if (projectCard && !modal.open && !event.target.closest('a,input,select,textarea')) {
      openProjectDetail(projectCard.dataset.projectId);
      return;
    }
    const card = event.target.closest('.task-card[data-card-id]');
    if (card && !modal.open && !event.target.closest('a,input,select,textarea')) openTodayProject(card.dataset.cardId);
    return;
  }
  if (button.disabled) return;
  if (button.dataset.page) {
    if (!captureNotebook()) return;
    const result = save(undefined, { recordUndo: Boolean(editor) });
    if (!result.ok) return;
    const fromOtherFeatures = otherFeaturesPopover.contains(button);
    closeOtherFeatures();
    boot = false;
    page = button.dataset.page;
    if (page === 'calendar') calendarView = 'week';
    showQueue = false;
    render();
    if (fromOtherFeatures) main.focus({ preventScroll: true });
    return;
  }
  const action = button.dataset.action,
    id = button.dataset.id;
  if (!action) return;
  if (action === 'open-tutorial') { openTutorial(); return; }
  if (calendarClick(button)) return;
  if (action === 'set-plan-mode') changePlanMode(button.dataset.mode);
  if (action === 'choose-today') {
    showDone = false;
    page = 'all';
    render();
  }
  if (action === 'start-demo' || action === 'start-blank') {
    model = action === 'start-demo' ? C.sampleModel() : C.blankModel();
    boot = false;
    page = action === 'start-demo' ? 'today' : 'projects';
    save();
    render();
  }
  if (action === 'new-project') editForm('project', null);
  if (action === 'edit-project') editForm('project', id);
  if (action === 'open-project') openProjectDetail(id);
  if (action === 'complete-project') completeProjectPrompt(id);
  if (action === 'restore-completed-group') restoreCompletedGroup(id);
  if (action === 'edit-drink') editDrink(button);
  if (action === 'restore-form-draft') restoreFormDraft();
  if (action === 'discard-form-draft') {
    clearFormDraft();
    closeModal({ submitted: true });
    if (save('已丢弃未提交草稿。', { recordUndo: false }).ok) render();
  }
  if (action === 'dismiss-recovery-notice') { recoveryNoticeVisible = false; renderRecoveryNotice(); }
  if (action === 'new-stage') {
    activeProject = id;
    editForm('stage', null);
  }
  if (action === 'edit-stage') editForm('stage', id);
  if (action === 'new-task') addTask(id);
  if (action === 'edit-task') {
    const t = findLeaf(id);
    editForm(t?.isProject ? 'project' : t?.isStage ? 'stage' : 'task', id);
  }
  if (action === 'delete-item') confirmDelete(button.dataset.kind, id);
  if (action === 'close-modal') closeModal();
  if (action === 'move-stage') {
    const g = stageById(id);
    const i = g.project.stages.indexOf(g.stage),
      j = i + (button.dataset.direction === 'up' ? -1 : 1);
    if (j >= 0 && j < g.project.stages.length) {
      [g.project.stages[i], g.project.stages[j]] = [g.project.stages[j], g.project.stages[i]];
      save('子阶段顺序已调整。');
      render();
    }
  }
  if (action === 'add-today' || action === 'remove-today') changeToday(id, action === 'add-today');
  if (action === 'queue-pin') reorderManualTask(id, 0);
  if (action === 'reset-default-queue') resetDefaultQueue();
  if (action === 'queue-move') {
    const index = pendingToday().findIndex(t => t.id === id);
    reorderManualTask(id, index + (button.dataset.direction === 'up' ? -1 : 1));
  }
  if (action === 'defer-today') deferToday(id);
  if (action === 'complete' || action === 'undo-complete') complete(id, action === 'complete');
  if (action === 'next') {
    refreshVisible();
    save();
    render();
  }
  if (action === 'toggle-queue') {
    showQueue = !showQueue;
    render();
  }
  if (action === 'toggle-done') {
    showDone = !showDone;
    render();
  }
  if (action === 'show-completed') {
    showDone = true;
    page = 'all';
    render();
  }
  if (action === 'note-save') saveNote();
  if (action === 'note-new') newNote();
  if (action === 'note-history') {
    if (!captureNotebook()) return;
    const result = save(undefined, { recordUndo: Boolean(editor) });
    if (!result.ok) return;
    destroyEditor(false);
    page = 'note-history';
    render();
  }
  if (action === 'note-back-editor') {
    page = 'notebook';
    render();
  }
  if (action === 'open-note') {
    if (!noteEntry(id)) return;
    model.notebook.activeEntryId = id;
    save(undefined, { recordUndo: false });
    page = 'notebook';
    render();
  }
  if (action === 'toggle-note-pin') {
    C.toggleNotebookPin(model, id);
    save();
    render();
  }
  if (action === 'delete-note') {
    const entry = noteEntry(id);
    if (!entry) return;
    openModal('删除速写', `<p>删除“${esc(noteText(entry.html).title)}”？</p><p class="muted small">只删除这一条速写，其他记录与草稿会保留。</p>`, 'note-delete', {
      id
    });
  }
  if (action === 'add-drink') {
    const d = drinks.find(d => d.id === button.dataset.kind);
    openModal('确认记录饮品', `<p class="muted small" data-record-date>记录日期：${esc(button.dataset.date || today)}</p><p>${d.id === 'water' ? '是否记录喝了一杯水？' : '是否记录新摄入一杯' + (d.id === 'other' ? '其他饮品' : d.name) + '？'}</p><p class="danger">确认后可按 Ctrl+Z 撤销。</p>`, 'confirm-drink', {
      id: d.id,
      followToday: !button.dataset.date,
      date: C.isDate(button.dataset.date) ? button.dataset.date : today
    });
  }
  if (action === 'open-data') showData();
  if (action === 'export-data') downloadBackup();
  if (action === 'choose-import') $('#backup-file', modal).click();
});
document.addEventListener('submit', event => {
  ensureCurrentDay();
  if (event.target.id === 'sleep-form' || event.target.id === 'calendar-sleep-form') {
    event.preventDefault();
    const value = new FormData(event.target).get('sleepTime');
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return;
    K.saveSleep(model, event.target.dataset.date || today, value);
    save(`计划入睡时间已保存为 ${value}。`);
    render();
    return;
  }
  if (event.target.id !== 'modal-form') return;
  event.preventDefault();
  const data = new FormData(event.target),
    action = modalAction,
    context = modalContext;
  if (!action) return;
  try {
    tutorialValidate(action, context, data);
    let createdId = null;
    if (calendarSubmit(action, context, data)) return;
    if (action === 'save-item') {
      const title = String(data.get('title') || '').trim();
      if (!title) throw new Error('请填写名称。');
      const priority = data.get('priority') ? Number(data.get('priority')) : null,
        due = data.get('due') || null,
        dueTime = data.get('dueTime') || null;
      if (dueTime && !due) throw new Error('请先选择截止日期，再设置具体时刻。');
      if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) throw new Error('请选择有效的截止日期。');
      if (context.kind === 'project') {
        if (context.id) Object.assign(projectById(context.id), {
          title,
          priority,
          due,
          dueTime
        });else {
          const p = {
            id: C.newId('p'),
            title,
            priority,
            due,
            dueTime,
            done: false,
            stages: []
          };
          model.projects.push(p);
          createdId = p.id;
          activeProject = p.id;
          page = 'detail';
        }
      }
      if (context.kind === 'stage') {
        if (context.id) Object.assign(stageById(context.id).stage, {
          title,
          priority,
          due,
          dueTime
        });else {
          const project = projectById(context.projectId),
            wasLeaf = !project.stages.length,
            stage = {
              id: C.newId('s'),
              title,
              priority,
              due,
              dueTime,
              done: false,
              tasks: []
            };
          project.stages.push(stage);
          createdId = stage.id;
          project.done = false;
          if (wasLeaf) {
            for (const p of Object.values(model.plans)) {
              p.selected = p.selected.map(x => x === project.id ? stage.id : x);
              p.visible = p.visible.map(x => x === project.id ? stage.id : x);
              p.deferred = (p.deferred || []).map(x => x === project.id ? stage.id : x);
              p.manualOrder = (p.manualOrder || []).map(x => x === project.id ? stage.id : x);
            }
          }
        }
      }
      if (context.kind === 'task') {
        if (context.id) Object.assign(recordById(context.id).record, {
          title,
          priority,
          due,
          dueTime
        });else {
          const g = stageById(context.stageId),
            wasLeaf = !g.stage.tasks.length,
            t = {
              id: C.newId('t'),
              title,
              priority,
              due,
              dueTime,
              done: false
            };
          g.stage.tasks.push(t);
          createdId = t.id;
          g.stage.done = false;
          if (wasLeaf) {
            for (const p of Object.values(model.plans)) {
              p.selected = p.selected.map(x => x === g.stage.id ? t.id : x);
              p.visible = p.visible.map(x => x === g.stage.id ? t.id : x);
              p.deferred = (p.deferred || []).map(x => x === g.stage.id ? t.id : x);
              p.manualOrder = (p.manualOrder || []).map(x => x === g.stage.id ? t.id : x);
            }
          }
        }
      }
      if (!hasFinishedCard()) refreshVisible();
    }
    if (action === 'delete-item') {
      if (model.formDraft?.action === 'save-item' && (model.formDraft.context.id === context.id || model.formDraft.context.projectId === context.id || model.formDraft.context.stageId === context.id)) clearFormDraft();
      if (context.kind === 'project') model.projects = model.projects.filter(p => p.id !== context.id);
      if (context.kind === 'stage') {
        const g = stageById(context.id);
        g.project.stages = g.project.stages.filter(s => s.id !== context.id);
      }
      if (context.kind === 'task') {
        const g = recordById(context.id);
        g.stage.tasks = g.stage.tasks.filter(t => t.id !== context.id);
      }
    }
    if (action === 'save-drink-count') K.setDrinkCount(model, context.date, context.id, Number(data.get('count')));
    if (action === 'confirm-complete-project') C.setCompletion(model, context.id, true);
    if (action === 'confirm-restore-group') C.setCompletion(model, context.id, false);
    if (action === 'confirm-drink') {
      K.addDrink(model, context.date, context.id);
    }
    if (action === 'note-delete') {
      C.deleteNotebookEntry(model, context.id);
      page = 'note-history';
    }
    if (action === 'import-data') {
      destroyEditor(false);
      model = context.model;
      activeProject = null;
      page = 'projects';
      boot = false;
    }
    if (action === 'save-item') clearFormDraft();
    const result = save(action === 'confirm-drink' || action === 'save-drink-count' ? '饮品记录已保存。' : action === 'confirm-restore-group' ? '已恢复为未完成。' : '已保存。');
    if (!result.ok) throw new Error(result.error || '保存失败，请重试');
    tutorialCommitted(action, context, createdId);
    closeModal({ submitted: true });
    render();
  } catch (error) {
    $('#form-error', modal).textContent = error.message || '无法保存，请检查输入。';
  }
});
document.addEventListener('change', async event => {
  if (event.target.id === 'project-sort') {
    model.projectSort = event.target.value === 'due' ? 'due' : 'priority';
    save();
    render();
    $('#project-sort')?.focus();
    return;
  }
  if (event.target.name === 'endOfDay') {
    const input = $('[name="endTime"]', modal);
    input.disabled = event.target.checked;
    return;
  }
  if (event.target.id === 'schedule-date') {
    const day = event.target.value;
    if (C.isDate(day) && day >= '0002-01-01' && day <= '9998-12-31') {
      calendarDay = day;
      calendarMonth = day.slice(0, 7);
      render();
    }
    return;
  }
  if (event.target.id === 'calendar-month') {
    if (/^(?!000[01])\d{4}-\d{2}$/.test(event.target.value) && C.isDate(event.target.value + '-01') && event.target.value < '9999-01') {
      calendarMonth = event.target.value;
      render();
    }
    return;
  }
  if (event.target.id === 'calendar-destination' || event.target.name === 'projectId') {
    updateSyncFields();
    return;
  }
  if (event.target.id !== 'backup-file') return;
  const file = event.target.files[0];
  if (!file) return;
  try {
    if (file.size > C.LIMITS.json * 4) throw new Error('备份文件过大。');
    const next = S.importJSON(await file.text());
    closeModal();
    openModal('确认导入备份', `<p>备份包含 ${next.projects.length} 个项目。确认后将替换当前全部数据。</p><p class="muted small">如需保留当前内容，请先取消并导出备份。</p>`, 'import-data', {
      model: next
    });
  } catch (error) {
    toast(error.message || '无法读取此备份文件。', true);
    event.target.value = '';
  }
});
modal.addEventListener('cancel', event => {
  event.preventDefault();
  closeModal();
});
window.addEventListener('beforeunload', () => {
  captureFormDraft();
  if (captureNotebook()) save(undefined, { recordUndo: false });
});
function ensureCurrentDay() {
  const next = C.localDate();
  if (next === today) return false;
  const previous = today;
  today = next;
  if (calendarDay === previous) { calendarDay = next; calendarMonth = next.slice(0, 7); }
  if (modalContext?.followToday) {
    modalContext.date = today;
    const label = modal.querySelector('[data-record-date]');
    if (label) label.textContent = '记录日期：' + today;
  }
  return true;
}
function refreshAutomaticOrder() {
  const newDay = ensureCurrentDay();
  if (boot) return;
  const changed = newDay || deadlineSignature() !== urgentSignature || page === 'today' && pendingToday().map(t => t.id).join(' ') !== automaticOrder;
  if (!changed) return;
  if (!captureNotebook()) return;
  if (!save(undefined, { recordUndo: false }).ok) return;
  if (!modal.open && !editor && !scheduleGesture) render();else updateSidebar();
  if (newDay) toast('新的一天开始了，今日日期和安排已更新。');
}
window.addEventListener('focus', refreshAutomaticOrder);
setInterval(refreshAutomaticOrder, 60000);
if (window.ThreeThingsDesktop) $('.local-label').textContent = '本机保存 · 每次修改自动备份';
render();
requestAnimationFrame(() => {
  window.scrollTo(0, previousView?.scrollY || 0);
  restoringView = false;
  persistViewState();
  if (model.formDraft) restoreFormDraft();
  maybeStartTutorial();
});
let viewSaveTimer = null;
window.addEventListener('scroll', () => {
  if (restoringView) return;
  clearTimeout(viewSaveTimer);
  viewSaveTimer = setTimeout(persistViewState, 250);
}, { passive: true });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    captureFormDraft();
    if (captureNotebook()) save(undefined, { recordUndo: false });
  } else refreshAutomaticOrder();
});
document.addEventListener('keydown', event => {
  if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.altKey || event.isComposing || event.key.toLowerCase() !== 's') return;
  event.preventDefault();
  manualBackupCurrent();
});
if (calendarPreview && loaded.isNew) save();
if (loaded.recovered) toast('已恢复有效备份，来源和保存时间已显示在页面顶部。');else if (loaded.error) toast(loaded.error, true);
