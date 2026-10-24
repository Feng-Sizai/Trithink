/* Sidebar category tree, shared project membership and category dialogs. */
const categoryFolderIcon = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M3 6a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/></svg>';
function selectedCategoryName() {
  return activeCategory === 'all' ? '全部项目' : activeCategory === 'unclassified' ? '未分类' : model.categories.find(item => item.id === activeCategory)?.title || '全部项目';
}
function renderCategoryTree() {
  if (!['all', 'unclassified'].includes(activeCategory) && !model.categories.some(item => item.id === activeCategory)) activeCategory = 'all';
  projectTreeOpen = !boot && ['projects', 'detail'].includes(page);
  const tree = $('#project-category-tree');
  tree.hidden = !projectTreeOpen;
  $('#projects-navigation-toggle').setAttribute('aria-expanded', String(projectTreeOpen));
  if (!projectTreeOpen) return;
  const categories = [...model.categories, { id: 'unclassified', title: '未分类' }];
  tree.innerHTML = '<div class="category-tree-heading"><span>项目分类</span><button type="button" data-action="new-category" aria-label="新建分类" title="新建分类">＋</button></div>' +
    categories.map(category => {
      const projects = C.sortTasks(C.projectsInCategory(model, category.id), model.projectSort);
      const expanded = expandedCategories.has(category.id);
      const selected = activeCategory === category.id;
      return `<div class="category-branch"><div class="category-branch-row${selected ? ' selected' : ''}"><button type="button" class="category-select" data-action="select-category" data-id="${category.id}"${selected && page === 'projects' ? ' aria-current="page"' : ''}>${categoryFolderIcon}<span class="category-name">${esc(category.title)}</span><span class="category-count">${projects.length}</span></button><button type="button" class="category-expand" data-action="toggle-category" data-id="${category.id}" aria-label="${expanded ? '收起' : '展开'}分类：${esc(category.title)}" aria-expanded="${expanded}" aria-controls="category-children-${category.id}"><svg aria-hidden="true" viewBox="0 0 20 20"><path d="m7 4 6 6-6 6"/></svg></button></div><div class="category-children" id="category-children-${category.id}"${expanded ? '' : ' hidden'}>${projects.length ? projects.map(project => `<button type="button" class="category-project${page === 'detail' && activeProject === project.id ? ' selected-project' : ''}" data-action="open-project" data-id="${project.id}"${page === 'detail' && activeProject === project.id ? ' aria-current="page"' : ''}><span class="project-tree-dot" aria-hidden="true"></span><span>${esc(project.title)}</span></button>`).join('') : '<p class="category-empty">暂无进行中的项目</p>'}</div></div>`;
    }).join('');
}
function categoryCheckboxes(selected = []) {
  if (!model.categories.length) return '<p class="muted small">暂未创建分类，项目会保存在“未分类”中。</p>';
  return '<fieldset class="category-choices"><legend>所属分类<span class="muted small">可多选</span></legend><div class="category-choice-list">' + model.categories.map(category => `<label><input type="checkbox" name="categoryIds" value="${category.id}"${selected.includes(category.id) ? ' checked' : ''}><span>${esc(category.title)}</span></label>`).join('') + '</div><p class="muted small">不选分类时，项目显示在“未分类”中。</p></fieldset>';
}
function projectCategoryBadges(project) {
  const categories = model.categories.filter(category => (project.categoryIds || []).includes(category.id));
  return '<div class="project-category-tags">' + (categories.length ? categories.map(category => `<button type="button" class="project-category-tag" data-action="select-category" data-id="${category.id}">${esc(category.title)}</button>`).join('') : '<span class="unclassified-tag">未分类</span>') + `<button type="button" class="project-classify" data-action="classify-project" data-id="${project.id}" aria-label="设置${esc(project.title)}的分类">分类</button></div>`;
}
function categoryScopeBar(count) {
  return `<div class="category-scope"><div><span class="category-scope-title">${esc(selectedCategoryName())}</span><span class="muted small">${count} 个进行中的项目</span></div>${!['all', 'unclassified'].includes(activeCategory) ? `<button type="button" class="text-button" data-action="edit-category" data-id="${activeCategory}">管理分类</button>` : ''}</div>`;
}
function categoryPreviewNotice() {
  return categoryPreview ? '<div class="category-preview-notice"><span>分类功能预览 · 示例数据，可自由试用</span><div><button type="button" class="text-button" data-action="preview-reset">重置示例</button><button type="button" class="text-button" data-action="preview-clear">清空示例</button></div></div>' : '';
}
function selectCategory(id) {
  if (!captureNotebook()) return;
  if (!save(undefined, { recordUndo: Boolean(editor) }).ok) return;
  activeCategory = id;
  if (id !== 'all') expandedCategories.add(id);
  activeProject = null;
  page = 'projects';
  boot = false;
  render();
}
function categoryClick(button) {
  const action = button.dataset.action;
  const id = button.dataset.id;
  if (action === 'select-category') selectCategory(id);
  else if (action === 'toggle-category') {
    if (expandedCategories.has(id)) expandedCategories.delete(id);else expandedCategories.add(id);
    renderCategoryTree();
    persistViewState();
    $(`[data-action="toggle-category"][data-id="${id}"]`)?.focus();
  } else if (action === 'new-category' || action === 'edit-category') {
    const category = model.categories.find(item => item.id === id);
    if (action === 'edit-category' && !category) return true;
    openModal(category ? '管理分类' : '新建分类', `<label class="field">分类名称<input name="categoryTitle" value="${esc(category?.title || '')}" maxlength="60" placeholder="例如：大学课程" required autocomplete="off"></label>${category ? `<button type="button" class="text-button danger" data-action="delete-category" data-id="${id}">删除分类</button>` : ''}`, 'save-category', { id: category?.id || null });
  } else if (action === 'delete-category') {
    const category = model.categories.find(item => item.id === id);
    if (!category) return true;
    openModal('删除分类', `<p>删除“${esc(category.title)}”分类？</p><p>其中的项目、阶段、任务和完成进度都会保留。</p><p class="muted small">项目仍可在其他所属分类中查看；没有其他分类的项目会归入“未分类”。</p>`, 'confirm-delete-category', { id });
  } else if (action === 'classify-project') {
    const project = projectById(id);
    if (!project) return true;
    if (model.formDraft) {
      restoreFormDraft();
      toast('请先确认或丢弃已有草稿，再调整项目分类。');
      return true;
    }
    openModal('设置项目分类', `<p class="muted">${esc(project.title)}</p>${categoryCheckboxes(project.categoryIds || [])}`, 'save-project-categories', { id });
  } else if (categoryPreview && (action === 'preview-reset' || action === 'preview-clear')) {
    openModal(action === 'preview-clear' ? '清空预览数据' : '重置示例', '<p>这会替换此网页预览中保存的内容。电脑软件里的数据不会改变。</p>', action, {});
  } else return false;
  return true;
}
function categorySubmit(action, context, data) {
  if (action === 'save-category') {
    const name = String(data.get('categoryTitle') || '').trim();
    if (context.id) C.renameCategory(model, context.id, name);
    else {
      const category = C.createCategory(model, name);
      activeCategory = category.id;
      expandedCategories.add(category.id);
      page = 'projects';
    }
  } else if (action === 'confirm-delete-category') {
    C.deleteCategory(model, context.id);
    expandedCategories.delete(context.id);
    if (activeCategory === context.id) activeCategory = 'all';
  } else if (action === 'save-project-categories') {
    C.setProjectCategories(model, context.id, data.getAll('categoryIds'));
  } else if (categoryPreview && (action === 'preview-reset' || action === 'preview-clear')) {
    destroyEditor(false);
    model = action === 'preview-reset' ? window.ThreeThingsCategoryPreview.sampleModel(today) : C.blankModel();
    activeCategory = 'all';
    activeProject = null;
    expandedCategories.clear();
    page = 'projects';
    boot = false;
  } else return false;
  closeModal({ submitted: true });
  save(action === 'confirm-delete-category' ? '分类已删除，项目已保留。' : '已保存。');
  render();
  return true;
}
