/* Three Things trial — data model and pure rules. No network or dependencies. */
(function (root) {
  'use strict';

  // Schema version, resource limits, and allowlists.
  const SCHEMA_VERSION = 1;
  const LIMITS = Object.freeze({
    projects: 100,
    categories: 100,
    stages: 10000,
    tasks: 10000,
    title: 200,
    notebook: 1024 * 1024,
    notebookEntries: 500,
    notebookTotal: 4 * 1024 * 1024,
    days: 3660,
    calendarEvents: 10000,
    references: 100000,
    json: 8 * 1024 * 1024
  });
  const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
  const SAFE_TAGS = new Set(['h1', 'h2', 'h3', 'p', 'div', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code']);
  let fallbackCounter = 0;

  // Shared validation primitives. These helpers do not trust imported data.
  function fail(message) {
    throw new Error(message);
  }
  function assert(value, message) {
    if (!value) fail(message);
  }
  function isRecord(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
  }
  function record(value, label) {
    assert(isRecord(value), label + '格式无效');
    return value;
  }
  function scanInput(value) {
    const stack = [{
      value,
      depth: 0
    }];
    const seen = new WeakSet();
    let visited = 0;
    while (stack.length) {
      const item = stack.pop();
      assert(++visited <= 300000 && item.depth <= 30, '数据规模或嵌套深度超出限制');
      if (!item.value || typeof item.value !== 'object') continue;
      assert(!seen.has(item.value), '数据不能包含循环或共享对象引用');
      seen.add(item.value);
      assert(Array.isArray(item.value) || isRecord(item.value), '数据对象格式无效');
      for (const key of Object.keys(item.value)) {
        assert(!FORBIDDEN_KEYS.has(key), '数据包含禁止的字段');
        const descriptor = Object.getOwnPropertyDescriptor(item.value, key);
        assert(descriptor && !descriptor.get && !descriptor.set, '数据不能包含访问器');
        stack.push({
          value: descriptor.value,
          depth: item.depth + 1
        });
      }
    }
  }
  function title(value, label) {
    assert(typeof value === 'string', label + '必须是文字');
    const result = value.trim();
    assert(result.length > 0 && result.length <= LIMITS.title, label + '需要 1–' + LIMITS.title + ' 个字符');
    assert(!/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(result), label + '包含无效字符');
    return result;
  }
  function priority(value, nullable, label, minimum = 1) {
    if (nullable && value === null) return null;
    assert(Number.isInteger(value) && value >= minimum && value <= 3, label + (minimum === 0 ? '应为 0、1、2 或 3' : '应为 1、2 或 3'));
    return value;
  }
  function isDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split('-').map(Number);
    if (year < 1 || month < 1 || month > 12 || day < 1) return false;
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    return day <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  }
  function deadline(value) {
    assert(value === null || isDate(value), '截止日期格式无效');
    return value;
  }
  function deadlineTime(value, due) {
    if (value == null || value === '' || value === '24:00') return null;
    assert(due && typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value), '截止时刻需要有效日期和小时分钟');
    return value;
  }
  function effectiveDeadline(...records) {
    const owner = records.find(item => item && item.due);
    return { due: owner?.due || null, dueTime: owner?.dueTime || null };
  }
  function compareDeadlines(a, b) {
    if (!a.due || !b.due) return a.due ? -1 : b.due ? 1 : 0;
    return a.due.localeCompare(b.due) || (a.dueTime || '24:00').localeCompare(b.dueTime || '24:00');
  }
  function boolean(value, label) {
    assert(typeof value === 'boolean', label + '格式无效');
    return value;
  }
  function list(value, max, label) {
    assert(Array.isArray(value) && value.length <= max, label + '数量超出限制或格式无效');
    return value;
  }

  // Completion timestamps and parent states derived from their children.
  function completionTimestamp(value, label) {
    if (value === undefined || value === null) return null;
    const name = label || '完成时间';
    assert(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{3})?Z$/.test(value) && isDate(value.slice(0, 10)), name + '必须是有效的 UTC 时间');
    const normalized = value.includes('.') ? value : value.replace('Z', '.000Z');
    assert(new Date(normalized).toISOString() === normalized, name + '无效');
    return normalized;
  }
  function validateCompletedAt(record, done) {
    const value = completionTimestamp(record.completedAt);
    return done ? value : null;
  }
  function leafCompletion(record) {
    const done = record.done === true;
    return {
      done,
      completedAt: done ? completionTimestamp(record.completedAt) : null
    };
  }
  function aggregateCompletion(record, children) {
    if (!children.every(child => child.done)) return {
      done: false,
      completedAt: null
    };
    // A recorded ancestor time can establish the final completion action even
    // when an older legacy child's historical timestamp is unknown.
    const allKnown = children.every(child => child.completedAt !== null);
    return {
      done: true,
      completedAt: allKnown ? children.reduce((latest, child) => child.completedAt > latest ? child.completedAt : latest, '') : record.done === true ? completionTimestamp(record.completedAt) : null
    };
  }
  function stageCompletion(stage) {
    return stage.tasks.length ? aggregateCompletion(stage, stage.tasks.map(leafCompletion)) : leafCompletion(stage);
  }
  function projectCompletion(project) {
    return project.stages.length ? aggregateCompletion(project, project.stages.map(stageCompletion)) : leafCompletion(project);
  }
  function reconcileCompletions(model, before, now) {
    const apply = (record, state) => {
      if (before && !before.get(record.id).done && state.done && state.completedAt === null) state.completedAt = now;
      record.done = state.done;
      record.completedAt = state.completedAt;
    };
    for (const project of model.projects) {
      for (const stage of project.stages) apply(stage, stageCompletion(stage));
      apply(project, projectCompletion(project));
    }
  }

  // Notebook formatting, separate drafts, and dated entries.
  // Only reconstruct known formatting tags. No attribute, URL, embed, script or style survives.
  // Text entities are retained as text; angle brackets outside recognized tags are escaped.
  function sanitizeNotebookHtml(html) {
    assert(typeof html === 'string' && html.length <= LIMITS.notebook, '速写本内容超出 1 MB 限制或格式无效');
    const input = html.replace(/<!--[\s\S]*?(?:-->|$)/g, '').replace(/<(script|style|iframe|object|svg|math|template|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
    const escape = value => value.replace(/&(?!(?:amp|lt|gt|quot|apos|nbsp|#\d{1,7}|#x[\da-fA-F]{1,6});)/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const tokenPattern = /<[^>]*>/g;
    let output = '',
      cursor = 0,
      token;
    while (token = tokenPattern.exec(input)) {
      output += escape(input.slice(cursor, token.index));
      const match = /^<\s*(\/?)\s*([a-z][a-z0-9]*)\b[^>]*>$/i.exec(token[0]);
      if (match && SAFE_TAGS.has(match[2].toLowerCase())) {
        const tag = match[2].toLowerCase();
        if (tag === 'br') output += '<br>';else output += '<' + (match[1] ? '/' : '') + tag + '>';
      }
      cursor = tokenPattern.lastIndex;
    }
    output += escape(input.slice(cursor));
    assert(output.length <= LIMITS.notebook, '速写本内容超出 1 MB 限制');
    return output || '<p><br></p>';
  }
  function notebookTime(value) {
    const timestamp = completionTimestamp(value, '速写时间');
    assert(timestamp !== null, '速写需要有效的记录时间');
    return timestamp;
  }
  function notebookCapacity(draft, entries) {
    assert(entries.length <= LIMITS.notebookEntries, '速写最多保存 500 条，请导出备份并清理后再试');
    assert(entries.reduce((total, entry) => total + entry.html.length, draft.length) <= LIMITS.notebookTotal, '速写与草稿总内容超出 4 MB 字符容量限制');
  }
  function mutableNotebook(model) {
    const notebook = record(model.notebook, '速写本');
    const entries = notebook.entries === undefined ? [] : list(notebook.entries, LIMITS.notebookEntries, '速写记录');
    return {
      notebook,
      entries
    };
  }
  function updateNotebookDraft(model, html) {
    const {
      notebook,
      entries
    } = mutableNotebook(model);
    const clean = sanitizeNotebookHtml(html);
    notebookCapacity(clean, entries);
    notebook.html = clean;
    return clean;
  }
  function createNotebookEntry(model, html, now) {
    const {
      notebook,
      entries
    } = mutableNotebook(model);
    const clean = sanitizeNotebookHtml(html === undefined ? notebook.html : html);
    const text = clean.replace(/<[^>]*>/g, '').replace(/&nbsp;/gi, ' ').replace(/&#(\d{1,7});|&#x([\da-f]{1,6});/gi, (entity, decimal, hex) => {
      const code = decimal ? Number(decimal) : parseInt(hex, 16);
      return code <= 0x10ffff ? String.fromCodePoint(code) : entity;
    }).replace(/[\u0000-\u001F\u200B-\u200D\u2060\uFEFF]/g, '').trim();
    assert(text.length > 0, '请先写下内容，再保存为一条速写');
    const timestamp = notebookTime(now === undefined ? new Date().toISOString() : now);
    const entry = {
      id: newId('note'),
      html: clean,
      createdAt: timestamp,
      updatedAt: timestamp,
      pinned: false
    };
    notebookCapacity(notebook.html, entries.concat(entry));
    notebook.entries = entries;
    entries.push(entry);
    notebook.activeEntryId = entry.id;
    return entry;
  }
  function updateNotebookEntry(model, id, html, now) {
    const {
      notebook,
      entries
    } = mutableNotebook(model);
    const entry = entries.find(item => item.id === id);
    assert(entry, '找不到要修改的速写');
    const clean = sanitizeNotebookHtml(html);
    if (clean === entry.html) return entry;
    const timestamp = notebookTime(now === undefined ? new Date().toISOString() : now);
    notebookCapacity(notebook.html, entries.map(item => item.id === id ? {
      html: clean
    } : item));
    entry.html = clean;
    entry.updatedAt = timestamp < entry.createdAt ? entry.createdAt : timestamp;
    return entry;
  }
  function deleteNotebookEntry(model, id) {
    const {
      notebook,
      entries
    } = mutableNotebook(model);
    const index = entries.findIndex(entry => entry.id === id);
    if (index < 0) return null;
    const removed = entries.splice(index, 1)[0];
    if (notebook.activeEntryId === id) notebook.activeEntryId = null;
    return removed;
  }
  function toggleNotebookPin(model, id) {
    const entry = mutableNotebook(model).entries.find(item => item.id === id);
    assert(entry, '找不到要置顶的速写');
    entry.pinned = !entry.pinned;
    return entry;
  }
  function sortedNotebookEntries(model) {
    return (model.notebook.entries || []).slice().sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt.localeCompare(a.createdAt));
  }

  // IDs, local calendar dates, and initial model factories.
  function newId(prefix) {
    prefix = typeof prefix === 'string' && /^[A-Za-z][A-Za-z0-9_-]{0,15}$/.test(prefix) ? prefix : 'item';
    let token;
    if (root.crypto && typeof root.crypto.randomUUID === 'function') token = root.crypto.randomUUID();else if (root.crypto && typeof root.crypto.getRandomValues === 'function') {
      const bytes = new Uint8Array(16);
      root.crypto.getRandomValues(bytes);
      token = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
    } else token = Date.now().toString(36) + '_' + (++fallbackCounter).toString(36) + '_' + Math.random().toString(36).slice(2, 12);
    return prefix + '_' + token;
  }
  function localDate(date) {
    const value = date instanceof Date ? date : new Date();
    return [value.getFullYear(), String(value.getMonth() + 1).padStart(2, '0'), String(value.getDate()).padStart(2, '0')].join('-');
  }
  function blankModel() {
    return {
      schemaVersion: SCHEMA_VERSION,
      projects: [],
      categories: [],
      projectSort: 'priority',
      viewState: null,
      plans: {},
      routines: {},
      calendarEvents: [],
      notebook: {
        html: '<p><br></p>',
        entries: [],
        activeEntryId: null
      }
    };
  }
  function sampleModel(date) {
    const today = isDate(date) ? date : localDate();
    const due = offset => {
      const value = new Date(today + 'T12:00:00');
      value.setDate(value.getDate() + offset);
      return localDate(value);
    };
    const model = blankModel();
    model.projects = [{
      id: 'p_math',
      title: '高等数学期末复习',
      priority: 3,
      importance: 3,
      done: false,
      stages: [{
        id: 's_limits',
        title: '第一章 · 极限与连续',
        priority: null,
        due: due(3),
        done: false,
        tasks: [{
          id: 't_notes',
          title: '整理极限公式与典型例题',
          priority: null,
          due: null,
          done: true
        }, {
          id: 't_exercises',
          title: '完成 10 道极限练习题',
          priority: null,
          due: null,
          done: false
        }]
      }, {
        id: 's_derivative',
        title: '第二章 · 导数与微分',
        priority: 2,
        due: due(7),
        done: false,
        tasks: [{
          id: 't_derivative',
          title: '看完导数定义的课程笔记',
          priority: null,
          due: null,
          done: false
        }]
      }]
    }, {
      id: 'p_event',
      title: '校园实践活动策划',
      priority: 2,
      importance: 2,
      done: false,
      stages: [{
        id: 's_proposal',
        title: '写出活动策划初稿',
        priority: null,
        due: due(5),
        done: false,
        tasks: []
      }]
    }];
    model.plans[today] = {
      selected: ['t_exercises', 't_derivative', 's_proposal'],
      visible: ['t_exercises', 't_derivative', 's_proposal'],
      excludedProjects: []
    };
    return model;
  }

  // Categories reference projects; they never copy projects or their progress.
  function categoryTitle(model, value, exceptId) {
    const name = title(value, '分类名称');
    assert(!['未分类', '全部项目'].includes(name), '这是内置分类名称，请使用其他名称');
    assert(!(model.categories || []).some(item => item.id !== exceptId && item.title === name), '已有同名分类，请换一个名称');
    return name;
  }
  function createCategory(model, value) {
    const name = categoryTitle(model, value);
    assert((model.categories || []).length < LIMITS.categories, '分类数量超出限制');
    const category = { id: newId('c'), title: name };
    if (!model.categories) model.categories = [];
    model.categories.push(category);
    return category;
  }
  function renameCategory(model, categoryId, value) {
    const category = (model.categories || []).find(item => item.id === categoryId);
    assert(category, '分类不存在');
    category.title = categoryTitle(model, value, categoryId);
  }
  function categoryMemberships(model, values) {
    const valid = new Set((model.categories || []).map(item => item.id));
    const seen = new Set();
    return list(values, LIMITS.categories, '项目所属分类').map(value => {
      assert(typeof value === 'string' && valid.has(value), '项目所属分类不存在');
      assert(!seen.has(value), '项目所属分类重复');
      seen.add(value);
      return value;
    });
  }
  function setProjectCategories(model, projectId, categoryIds) {
    const project = model.projects.find(item => item.id === projectId);
    assert(project, '项目不存在');
    const memberships = categoryMemberships(model, categoryIds);
    project.categoryIds = memberships;
  }
  function deleteCategory(model, categoryId) {
    assert((model.categories || []).some(item => item.id === categoryId), '分类不存在');
    model.categories = model.categories.filter(item => item.id !== categoryId);
    for (const project of model.projects) {
      project.categoryIds = (project.categoryIds || []).filter(id => id !== categoryId);
    }
    if (model.formDraft?.values.categoryIds) model.formDraft.values.categoryIds = model.formDraft.values.categoryIds.filter(id => id !== categoryId);
  }
  function projectsInCategory(model, categoryId = 'all') {
    return model.projects.filter(project => !project.done && (categoryId === 'all' ||
      categoryId === 'unclassified' && !(project.categoryIds || []).length ||
      (project.categoryIds || []).includes(categoryId)));
  }

  // Actionable leaves and the shared priority comparator used by task views.
  function flattenTasks(model, options) {
    const result = [];
    const includeDone = !(options && options.includeDone === false);
    for (const project of model.projects) {
      if (!project.stages.length) {
        const done = project.done === true;
        if (includeDone || !done) result.push({
          id: project.id,
          projectId: project.id,
          stageId: null,
          title: project.title,
          priority: project.priority,
          importance: project.importance,
          ...effectiveDeadline(project),
          done,
          completedAt: done ? completionTimestamp(project.completedAt) : null,
          isProject: true,
          isStage: false,
          projectTitle: project.title,
          stageTitle: ''
        });
        continue;
      }
      for (const stage of project.stages) {
        const stagePriority = stage.priority === null ? project.priority : stage.priority;
        if (!stage.tasks.length) {
          if (includeDone || !stage.done) result.push({
            id: stage.id,
            projectId: project.id,
            stageId: stage.id,
            title: stage.title,
            priority: stagePriority,
            importance: project.importance,
            ...effectiveDeadline(stage, project),
            done: stage.done,
            completedAt: stage.done ? completionTimestamp(stage.completedAt) : null,
            isProject: false,
            isStage: true,
            projectTitle: project.title,
            stageTitle: stage.title
          });
        } else for (const task of stage.tasks) {
          if (includeDone || !task.done) result.push({
            id: task.id,
            projectId: project.id,
            stageId: stage.id,
            title: task.title,
            priority: task.priority === null ? stagePriority : task.priority,
            importance: project.importance,
            ...effectiveDeadline(task, stage, project),
            done: task.done,
            completedAt: task.done ? completionTimestamp(task.completedAt) : null,
            isProject: false,
            isStage: false,
            projectTitle: project.title,
            stageTitle: stage.title
          });
        }
      }
    }
    return result;
  }
  function sortTasks(tasks, by = 'priority') {
    return tasks.slice().sort((a, b) => by === 'due' ? compareDeadlines(a, b) || b.priority - a.priority : b.priority - a.priority || compareDeadlines(a, b));
  }
  // Deadline boosts apply only to today's automatic queue. Unspecified times
  // mean local midnight at the end of the due date. Overdue items stay urgent.
  function deadlineRemaining(task, now = new Date()) {
    return task.due ? new Date(task.due + 'T' + (task.dueTime || '24:00') + ':00').getTime() - Number(now) : Infinity;
  }
  function isDeadlineUrgent(task, now = new Date()) {
    return Boolean(task && !task.done && deadlineRemaining(task, now) < 86400000);
  }
  function isTaskUrgent(model, task, now = new Date()) {
    if (!task || task.done) return false;
    return isDeadlineUrgent(task, now) || isDeadlineUrgent(model.projects.find(p => p.id === task.projectId), now);
  }
  function sortAutomaticTasks(tasks, now = new Date(), urgentIds = new Set()) {
    const ranked = tasks.map(task => {
      const remaining = deadlineRemaining(task, now);
      const boost = urgentIds.has(task.id) || remaining < 86400000 ? 4 : remaining < 172800000 ? 2.5 : 0;
      return { task, rank: Math.max(task.priority, boost) };
    });
    return ranked.sort((a, b) => b.rank - a.rank || b.task.priority - a.task.priority || compareDeadlines(a.task, b.task)).map(item => item.task);
  }
  // Flattened leaves retain stage/task order. Equal priority keeps that order.
  function projectLeadTask(leaves) {
    let next = null;
    for (const task of leaves) if (!task.done && (!next || task.priority > next.priority)) next = task;
    return next;
  }
  function completedCount(model) {
    return new Set(flattenTasks(model).filter(task => task.done).map(task => task.id)).size;
  }

  // Completion commands and the non-duplicated history projection.
  function setCompletion(model, id, done, now) {
    boolean(done, '完成状态');
    const instant = completionTimestamp(now === undefined ? new Date().toISOString() : now);
    assert(instant !== null, '记录完成需要有效的时间');
    const before = new Map();
    let target = null,
      leaves = null;
    for (const project of model.projects) {
      before.set(project.id, projectCompletion(project));
      if (project.id === id) {
        target = project;
        leaves = project.stages.length ? project.stages.flatMap(stage => stage.tasks.length ? stage.tasks : [stage]) : [project];
      }
      for (const stage of project.stages) {
        before.set(stage.id, stageCompletion(stage));
        if (stage.id === id) {
          target = stage;
          leaves = stage.tasks.length ? stage.tasks : [stage];
        }
        for (const task of stage.tasks) if (task.id === id) {
          target = task;
          leaves = [task];
        }
      }
    }
    assert(target, '找不到要修改的项目或任务');
    for (const leaf of leaves) {
      leaf.completedAt = done ? leaf.done === true ? completionTimestamp(leaf.completedAt) : instant : null;
      leaf.done = done;
    }
    reconcileCompletions(model, before, instant);
    return target;
  }
  function completedHistory(model) {
    const entries = [];
    function add(record, kind, project, stage, state, leafIds) {
      entries.push({
        id: record.id,
        kind,
        title: record.title,
        projectId: project.id,
        projectTitle: project.title,
        stageId: stage ? stage.id : null,
        stageTitle: stage ? stage.title : '',
        completedAt: state.completedAt,
        leafIds,
        leafCount: leafIds.length,
        done: true,
        isProject: kind === 'project',
        isStage: kind === 'stage',
        priority: kind === 'project' ? project.priority : record.priority === null ? stage.priority === null ? project.priority : stage.priority : record.priority,
        importance: project.importance,
        ...effectiveDeadline(record, stage, project)
      });
    }
    for (const project of model.projects) {
      const projectState = projectCompletion(project);
      if (projectState.done) {
        add(project, 'project', project, null, projectState, project.stages.length ? project.stages.flatMap(stage => stage.tasks.length ? stage.tasks.map(task => task.id) : [stage.id]) : [project.id]);
        continue;
      }
      for (const stage of project.stages) {
        const stageState = stageCompletion(stage);
        if (stageState.done) add(stage, 'stage', project, stage, stageState, stage.tasks.length ? stage.tasks.map(task => task.id) : [stage.id]);else for (const task of stage.tasks) if (task.done) add(task, 'task', project, stage, leafCompletion(task), [task.id]);
      }
    }
    return entries.sort((a, b) => a.completedAt && b.completedAt ? b.completedAt.localeCompare(a.completedAt) : a.completedAt ? -1 : b.completedAt ? 1 : 0);
  }

  // Per-date plans and routines. Other dates are not rolled into the active day.
  function getPlan(model, date) {
    const day = date || localDate();
    assert(isDate(day), '今日计划日期无效');
    if (!Object.prototype.hasOwnProperty.call(model.plans, day)) model.plans[day] = {
      selected: [],
      visible: [],
      excludedProjects: []
    };
    const plan = model.plans[day];
    if (plan.excludedProjects === undefined) plan.excludedProjects = [];
    if (plan.deferred === undefined) plan.deferred = plan.excludedProjects.slice();
    if (plan.mode === undefined) plan.mode = 'auto';
    if (plan.manualSelected === undefined) plan.manualSelected = [];
    if (plan.manualOrder === undefined) plan.manualOrder = [];
    return model.plans[day];
  }
  function setPlanMode(model, date, mode) {
    assert(mode === 'auto' || mode === 'manual', '今日计划模式无效');
    const plan = getPlan(model, date);
    plan.mode = mode;
    return syncAutoProjects(model, date);
  }
  function setManualTask(model, date, id, selected) {
    boolean(selected, '手选状态');
    const task = flattenTasks(model).find(item => item.id === id);
    assert(task, '找不到要选择的任务');
    const plan = getPlan(model, date);
    if (!selected) {
      plan.manualSelected = plan.manualSelected.filter(value => value !== id);
    } else if (!plan.manualSelected.includes(id)) {
      assert(!task.done, '请选择尚未完成的任务');
      assert(plan.manualSelected.length < 3, '手选模式最多选择三项，请先移出一项');
      plan.manualSelected = plan.manualSelected.concat(id);
    }
    return plan;
  }
  function moveManualTask(model, date, id, position) {
    const plan = getPlan(model, date);
    assert(plan.mode === 'manual', '请切换到手选模式调整顺序');
    const order = currentQueue(model, date).map(task => task.id);
    assert(order.includes(id), '事项不在待办队列中');
    assert(Number.isInteger(position) && position >= 0 && position < order.length, '任务位置无效');
    const reordered = order.filter(value => value !== id);
    reordered.splice(position, 0, id);
    plan.manualOrder = reordered;
    return syncAutoProjects(model, date);
  }
  // Keep the entire unfinished pool. Deferrals are a FIFO tail, never hidden.
  function automaticQueue(model, date, now = new Date()) {
    const plan = getPlan(model, date);
    const tasks = flattenTasks(model).filter(task => !task.done);
    const urgent = new Set(tasks.filter(task => isTaskUrgent(model, task, now)).map(task => task.id));
    const sorted = sortAutomaticTasks(tasks, now, urgent);
    const deferred = new Set(plan.deferred);
    const available = sorted.filter(task => !deferred.has(task.id) || urgent.has(task.id));
    const byId = new Map(sorted.map(task => [task.id, task]));
    const tail = plan.deferred.filter(id => byId.has(id) && !urgent.has(id)).map(id => byId.get(id));
    return available.concat(tail);
  }
  function currentQueue(model, date, now = new Date()) {
    const plan = getPlan(model, date);
    const sorted = automaticQueue(model, date, now);
    if (!plan.manualOrder.length) return sorted;
    const byId = new Map(sorted.map(task => [task.id, task]));
    const ordered = [...new Set(plan.manualOrder)].filter(id => byId.has(id));
    const seen = new Set(ordered);
    return ordered.map(id => byId.get(id)).concat(sorted.filter(task => !seen.has(task.id)));
  }
  function deferAutomaticTask(model, date, id, now = new Date()) {
    const task = flattenTasks(model).find(item => item.id === id);
    assert(task && !task.done, '只能暂缓未完成的事项');
    assert(!isTaskUrgent(model, task, now), '截止不足1天，不能暂缓');
    const plan = getPlan(model, date);
    assert(plan.mode === 'auto', '请在自动模式中暂缓事项');
    const sharedOrder = plan.manualOrder.length ? currentQueue(model, date, now).map(task => task.id) : null;
    plan.deferred = plan.deferred.filter(value => value !== id).concat(id);
    if (sharedOrder) plan.manualOrder = sharedOrder.filter(value => value !== id).concat(id);
    return syncAutoProjects(model, date, now);
  }
  function resetAutomaticQueue(model, date, now = new Date()) {
    const plan = getPlan(model, date);
    plan.deferred = [];
    plan.excludedProjects = [];
    plan.manualOrder = [];
    plan.manualSelected = [];
    plan.mode = 'auto';
    return syncAutoProjects(model, date, now);
  }
  function syncAutoProjects(model, date, now = new Date()) {
    const plan = getPlan(model, date);
    const leaves = flattenTasks(model);
    const valid = new Set(leaves.map(task => task.id));
    plan.manualSelected = [...new Set(plan.manualSelected)].filter(id => valid.has(id)).slice(0, 3);
    plan.deferred = [...new Set(plan.deferred)].filter(id => valid.has(id));
    plan.excludedProjects = plan.excludedProjects.filter(id => leaves.some(task => task.id === id && task.isProject));
    const queue = currentQueue(model, date, now);
    if (plan.manualOrder.length) plan.manualOrder = queue.map(task => task.id);
    plan.visible = queue.slice(0, 3).map(task => task.id);
    plan.selected = plan.visible.slice();
    return plan;
  }
  function getRoutine(model, date) {
    const day = date || localDate();
    assert(isDate(day), '今日作息日期无效');
    if (!Object.prototype.hasOwnProperty.call(model.routines, day)) model.routines[day] = {
      sleepTime: '',
      drinks: {
        coffee: 0,
        milkTea: 0,
        other: 0,
        water: 0
      }
    };
    return model.routines[day];
  }

  // Reconstruct only allowlisted fields and normalize legacy model extensions.
  function validateModel(raw) {
    scanInput(raw);
    record(raw, '文件');
    assert(raw.schemaVersion === SCHEMA_VERSION, '不支持的数据版本，请使用此试用版导出的文件');
    const output = blankModel();
    if (raw.backupMeta != null) {
      const meta = record(raw.backupMeta, '保存信息');
      assert(Number.isSafeInteger(meta.revision) && meta.revision > 0, '保存序号无效');
      output.backupMeta = { revision: meta.revision, savedAt: notebookTime(meta.savedAt) };
    }
    if (raw.formDraft != null) {
      const draft = record(raw.formDraft, '表单草稿');
      assert(['save-item', 'calendar-save-event'].includes(draft.action), '草稿类型无效');
      const context = record(draft.context, '草稿位置');
      const cleanContext = {};
      if (draft.action === 'save-item') {
        assert(['project', 'stage', 'task'].includes(context.kind), '草稿事项类型无效');
        cleanContext.kind = context.kind;
      }
      for (const key of ['id', 'projectId', 'stageId']) {
        const value = context[key] ?? null;
        assert(value === null || typeof value === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(value), '草稿事项编号无效');
        cleanContext[key] = value;
      }
      const values = record(draft.values, '草稿内容');
      const fields = draft.action === 'save-item' ? ['title', 'priority', 'due', 'dueTime'] : ['title', 'date', 'priority', 'startTime', 'endTime', 'endOfDay', 'location', 'color'];
      const cleanValues = {};
      for (const key of fields) {
        const value = values[key] ?? '';
        assert(typeof value === 'string' && value.length <= (['title', 'location'].includes(key) ? 200 : 20) && !/[\u0000-\u001F]/.test(value), '草稿内容无效');
        cleanValues[key] = value;
      }
      if (draft.action === 'save-item' && cleanContext.kind === 'project' && values.categoryIds !== undefined) {
        const seen = new Set();
        cleanValues.categoryIds = list(values.categoryIds, LIMITS.categories, '草稿分类').map(value => {
          assert(typeof value === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(value) && !seen.has(value), '草稿分类编号无效');
          seen.add(value);
          return value;
        });
      }
      output.formDraft = { action: draft.action, context: cleanContext, values: cleanValues, savedAt: notebookTime(draft.savedAt) };
    }
    output.projectSort = raw.projectSort === undefined ? 'priority' : raw.projectSort;
    assert(['priority', 'due'].includes(output.projectSort), '项目排序方式无效');
    const ids = new Set();
    let stageCount = 0,
      taskCount = 0,
      referenceCount = 0;
    const id = value => {
      assert(typeof value === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(value), '项目或任务编号无效');
      assert(!ids.has(value), '项目或任务编号重复');
      ids.add(value);
      return value;
    };
    const categoryNames = new Set(['未分类', '全部项目']);
    output.categories = list(raw.categories === undefined ? [] : raw.categories, LIMITS.categories, '项目分类').map(category => {
      record(category, '项目分类');
      assert(!['all', 'unclassified'].includes(category.id), '分类编号不能使用保留名称');
      const name = title(category.title, '分类名称');
      assert(!categoryNames.has(name), '分类名称重复');
      categoryNames.add(name);
      return { id: id(category.id), title: name };
    });
    if (output.formDraft?.values.categoryIds) output.formDraft.values.categoryIds = categoryMemberships(output, output.formDraft.values.categoryIds);
    output.projects = list(raw.projects, LIMITS.projects, '项目').map(project => {
      record(project, '项目');
      const projectDone = project.done === undefined ? false : boolean(project.done, '项目完成状态');
      return {
        id: id(project.id),
        title: title(project.title, '项目标题'),
        categoryIds: categoryMemberships(output, project.categoryIds === undefined ? [] : project.categoryIds),
        priority: priority(project.priority, false, '项目星级', 0),
        ...(project.importance === undefined ? {} : { importance: priority(project.importance, false, '历史重要程度') }),
        due: deadline(project.due === undefined ? null : project.due),
        dueTime: deadlineTime(project.dueTime, project.due),
        done: projectDone,
        completedAt: validateCompletedAt(project, projectDone),
        stages: list(project.stages, LIMITS.stages, '子阶段').map(stage => {
          assert(++stageCount <= LIMITS.stages, '子阶段总数超出限制');
          record(stage, '子阶段');
          return {
            id: id(stage.id),
            title: title(stage.title, '子阶段标题'),
            priority: priority(stage.priority, true, '子阶段星级', 0),
            due: deadline(stage.due),
            dueTime: deadlineTime(stage.dueTime, stage.due),
            done: boolean(stage.done, '子阶段完成状态'),
            completedAt: validateCompletedAt(stage, stage.done),
            tasks: list(stage.tasks, LIMITS.tasks, '小任务').map(task => {
              assert(++taskCount <= LIMITS.tasks, '小任务总数超出限制');
              record(task, '小任务');
              return {
                id: id(task.id),
                title: title(task.title, '小任务标题'),
                priority: priority(task.priority, true, '小任务星级', 0),
                due: deadline(task.due),
                dueTime: deadlineTime(task.dueTime, task.due),
                done: boolean(task.done, '小任务完成状态'),
                completedAt: validateCompletedAt(task, task.done)
              };
            })
          };
        })
      };
    });
    reconcileCompletions(output);
    const leaves = flattenTasks(output);
    const leafIds = new Set(leaves.map(task => task.id));
    const emptyProjectIds = new Set(leaves.filter(task => task.isProject).map(task => task.id));
    record(raw.plans, '今日计划');
    const planDates = Object.keys(raw.plans);
    assert(planDates.length <= LIMITS.days, '今日计划日期数量超出限制');
    const planIds = (values, max) => {
      const seen = new Set();
      return list(values, max, '今日计划任务').filter(value => {
        assert(typeof value === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(value), '今日计划任务编号无效');
        assert(++referenceCount <= LIMITS.references, '今日计划任务总量超出限制');
        if (!leafIds.has(value) || seen.has(value)) return false;
        seen.add(value);
        return true;
      });
    };
    for (const date of planDates) {
      assert(isDate(date), '今日计划日期无效');
      const plan = record(raw.plans[date], '今日计划');
      const selected = planIds(plan.selected, LIMITS.tasks + LIMITS.stages + LIMITS.projects);
      const selectedIds = new Set(selected);
      const visible = planIds(plan.visible, 3).filter(value => selectedIds.has(value));
      const excludedProjects = planIds(plan.excludedProjects === undefined ? [] : plan.excludedProjects, LIMITS.projects).filter(value => emptyProjectIds.has(value));
      const deferred = planIds(plan.deferred === undefined ? excludedProjects : plan.deferred, LIMITS.tasks + LIMITS.stages + LIMITS.projects);
      const mode = plan.mode === undefined ? 'auto' : plan.mode;
      assert(mode === 'auto' || mode === 'manual', '今日计划模式无效');
      const manualSelected = planIds(plan.manualSelected === undefined ? [] : plan.manualSelected, 3);
      const manualOrder = planIds(plan.manualOrder === undefined ? [] : plan.manualOrder, LIMITS.tasks + LIMITS.stages + LIMITS.projects);
      output.plans[date] = {
        selected,
        visible,
        excludedProjects,
        deferred,
        mode,
        manualSelected,
        manualOrder
      };
    }
    record(raw.routines, '今日作息');
    const routineDates = Object.keys(raw.routines);
    assert(routineDates.length <= LIMITS.days, '今日作息日期数量超出限制');
    for (const date of routineDates) {
      assert(isDate(date), '今日作息日期无效');
      const routine = record(raw.routines[date], '今日作息');
      assert(typeof routine.sleepTime === 'string' && (routine.sleepTime === '' || /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(routine.sleepTime)), '计划入睡时间无效');
      const drinks = record(routine.drinks, '饮品记录');
      const counts = {};
      for (const type of ['coffee', 'milkTea', 'other', 'water']) {
        const count = type === 'water' && drinks[type] === undefined ? 0 : drinks[type];
        assert(Number.isInteger(count) && count >= 0 && count <= 10000, '饮品杯数无效');
        counts[type] = count;
      }
      output.routines[date] = {
        sleepTime: routine.sleepTime,
        drinks: counts
      };
    }
    record(raw.notebook, '速写本');
    const notebookHtml = sanitizeNotebookHtml(raw.notebook.html);
    const notebookEntries = list(raw.notebook.entries === undefined ? [] : raw.notebook.entries, LIMITS.notebookEntries, '速写记录').map(entry => {
      record(entry, '速写记录');
      const createdAt = notebookTime(entry.createdAt);
      const updatedAt = notebookTime(entry.updatedAt);
      assert(updatedAt >= createdAt, '速写修改时间不能早于记录时间');
      return {
        id: id(entry.id),
        html: sanitizeNotebookHtml(entry.html),
        createdAt,
        updatedAt,
        pinned: boolean(entry.pinned, '速写置顶状态')
      };
    });
    notebookCapacity(notebookHtml, notebookEntries);
    const activeEntryId = raw.notebook.activeEntryId === undefined ? null : raw.notebook.activeEntryId;
    assert(activeEntryId === null || typeof activeEntryId === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(activeEntryId), '当前速写编号无效');
    output.notebook = {
      html: notebookHtml,
      entries: notebookEntries,
      activeEntryId: notebookEntries.some(entry => entry.id === activeEntryId) ? activeEntryId : null
    };
    const projectIds = new Set(ids);
    output.calendarEvents = list(raw.calendarEvents === undefined ? [] : raw.calendarEvents, LIMITS.calendarEvents, '日历事件').map(event => {
      record(event, '日历事件');
      assert(isDate(event.date), '事件日期无效');
      const targetId = event.targetId === undefined ? null : event.targetId;
      assert(targetId === null || typeof targetId === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(targetId), '同步事项编号无效');
      const startTime = event.startTime === undefined ? null : event.startTime;
      const endTime = event.endTime === undefined ? null : event.endTime;
      const clock = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
      assert(startTime === null || typeof startTime === 'string' && clock.test(startTime), '开始时间格式无效');
      assert(endTime === null || typeof endTime === 'string' && (clock.test(endTime) || endTime === '24:00'), '截止时间格式无效');
      assert(!startTime || !endTime || endTime > startTime, '截止时间须晚于开始时间');
      const location = event.location === undefined ? '' : event.location;
      assert(typeof location === 'string' && location.length <= 200 && !/[\u0000-\u001F]/.test(location), '备注需要为不超过 200 字的文字');
      const color = event.color === undefined ? 'sage' : event.color;
      assert(['sage', 'sky', 'lavender', 'rose', 'teal', 'sand'].includes(color), '日程颜色无效');
      const createdAt = notebookTime(event.createdAt);
      const updatedAt = notebookTime(event.updatedAt);
      assert(updatedAt >= createdAt, '事件修改时间不能早于创建时间');
      return {
        id: id(event.id),
        title: title(event.title, '事件名称'),
        date: event.date,
        startTime,
        endTime,
        location: location.trim(),
        color,
        priority: priority(event.priority, false, '事件星级', 0),
        targetId: projectIds.has(targetId) && !notebookEntries.some(entry => entry.id === targetId) ? targetId : null,
        createdAt,
        updatedAt
      };
    });
    if (raw.viewState != null) {
      const view = record(raw.viewState, '界面状态');
      assert(['today', 'projects', 'detail', 'all', 'routine', 'calendar', 'notebook', 'note-history'].includes(view.page), '界面页面无效');
      assert(view.activeProject === null || typeof view.activeProject === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(view.activeProject), '界面项目编号无效');
      assert(isDate(view.calendarDay) && isDate(view.calendarMonth + '-01'), '界面日期无效');
      boolean(view.showQueue, '队列展开状态'); boolean(view.showDone, '完成列表状态');
      assert(Number.isInteger(view.scrollY) && view.scrollY >= 0 && view.scrollY <= 10000000, '界面滚动位置无效');
      output.viewState = { page: view.page, activeProject: view.activeProject, calendarDay: view.calendarDay, calendarMonth: view.calendarMonth, showQueue: view.showQueue, showDone: view.showDone, scrollY: view.scrollY };
      const validCategories = new Set(['all', 'unclassified', ...output.categories.map(category => category.id)]);
      if (view.categoryId !== undefined) {
        assert(typeof view.categoryId === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(view.categoryId), '界面分类编号无效');
        output.viewState.categoryId = validCategories.has(view.categoryId) ? view.categoryId : 'all';
      }
      if (view.expandedCategories !== undefined) {
        const expanded = list(view.expandedCategories, LIMITS.categories + 1, '分类展开状态');
        assert(expanded.every(value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(value)), '分类展开编号无效');
        output.viewState.expandedCategories = [...new Set(expanded)].filter(value => value !== 'all' && validCategories.has(value));
      }
    }
    return output;
  }

  // Browser API; CommonJS export also supports the dependency-free test suite.
  const api = Object.freeze({
    SCHEMA_VERSION,
    LIMITS,
    blankModel,
    sampleModel,
    createCategory,
    renameCategory,
    deleteCategory,
    setProjectCategories,
    projectsInCategory,
    validateModel,
    newId,
    localDate,
    isDate,
    sanitizeNotebookHtml,
    updateNotebookDraft,
    createNotebookEntry,
    updateNotebookEntry,
    deleteNotebookEntry,
    toggleNotebookPin,
    sortedNotebookEntries,
    flattenTasks,
    sortTasks,
    sortAutomaticTasks,
    deadlineRemaining,
    isDeadlineUrgent,
    isTaskUrgent,
    automaticQueue,
    currentQueue,
    resetAutomaticQueue,
    deferAutomaticTask,
    effectiveDeadline,
    compareDeadlines,
    projectLeadTask,
    completedCount,
    setCompletion,
    completedHistory,
    getPlan,
    setPlanMode,
    setManualTask,
    moveManualTask,
    syncAutoProjects,
    getRoutine
  });
  root.ThreeThingsCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
