/* Notebook draft lifecycle, saved-entry editing and history views.
 * Built in the shared private application scope; see build.config.cjs.
 */
function noteEntry(id) {
  return model.notebook.entries.find(entry => entry.id === id);
}
function noteText(html) {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = E.sanitizeHTML(html);
  const blocks = Array.from(wrapper.querySelectorAll('h1,h2,p,li,blockquote'));
  const first = blocks.map(block => block.textContent.replace(/\s+/g, ' ').trim()).find(Boolean);
  const text = wrapper.textContent.replace(/\s+/g, ' ').trim();
  const title = first || text;
  return {
    text,
    title: title ? title.slice(0, 60) : '未命名速写',
    preview: text.startsWith(title) ? text.slice(title.length).trim().slice(0, 120) : text.slice(0, 120)
  };
}
function writeNotebook(html, id) {
  if (id) C.updateNotebookEntry(model, id, html);else C.updateNotebookDraft(model, html);
}
function captureNotebook() {
  if (!editor) return true;
  try {
    writeNotebook(editor.getHTML(), editorNoteId);
    return true;
  } catch (error) {
    editor.setSaveStatus('修改尚未保存，请先保留文字。');
    toast(error.message || '无法保存速写，请先复制保留内容。', true);
    return false;
  }
}
function destroyEditor(flush = true) {
  if (!editor) return true;
  if (flush && !captureNotebook()) return false;
  clearTimeout(noteTimer);
  noteTimer = null;
  editor.destroy();
  editor = null;
  editorNoteId = null;
  return true;
}
function archiveDraft() {
  const html = model.notebook.html;
  if (!noteText(html).text) throw new Error('先写一点内容，再保存速写。');
  model.notebook.html = '<p><br></p>';
  try {
    return C.createNotebookEntry(model, html);
  } catch (error) {
    model.notebook.html = html;
    throw error;
  }
}
function saveNote() {
  if (!captureNotebook()) return;
  try {
    const isNew = !model.notebook.activeEntryId;
    if (isNew) archiveDraft();
    const result = save(isNew ? '已按日期收录这条速写。' : '速写修改已保存。');
    if (!result.ok) return;
    destroyEditor(false);
    render();
  } catch (error) {
    toast(error.message || '无法保存速写。', true);
  }
}
function newNote() {
  if (!captureNotebook()) return;
  try {
    const hadDraft = Boolean(noteText(model.notebook.html).text);
    if (hadDraft) archiveDraft();
    model.notebook.html = '<p><br></p>';
    model.notebook.activeEntryId = null;
    const result = save(hadDraft ? '草稿已收录，已新建速写。' : '已新建速写。');
    if (!result.ok) return;
    destroyEditor(false);
    page = 'notebook';
    render();
  } catch (error) {
    toast(error.message || '无法新建速写。', true);
  }
}
function renderNotebook() {
  const entry = noteEntry(model.notebook.activeEntryId);
  const noteId = entry ? entry.id : null;
  const description = entry ? `创建于 ${completedDay(entry.createdAt)} ${completedTime(entry.createdAt)} · 修改自动保存` : '草稿自动保存，点击“保存速写”收录到历史。';
  main.innerHTML = header('速写本', description, `<div class="actions"><button type="button" class="secondary" data-action="note-history">查看历史记录</button><button type="button" class="secondary" data-action="note-new">新建速写</button><button type="button" class="primary" data-action="note-save">${entry ? '保存修改' : '保存速写'}</button></div>`) + (entry ? '' : '<p class="muted small note-draft-label">当前草稿</p>') + '<section class="notebook" id="note-host"></section>';
  editorNoteId = noteId;
  editor = E.create({
    container: $('#note-host'),
    html: entry ? entry.html : model.notebook.html,
    onChange: html => {
      clearTimeout(noteTimer);
      try {
        writeNotebook(html, noteId);
      } catch (error) {
        editor.setSaveStatus('修改尚未保存，请先保留文字。');
        toast(error.message || '无法保存速写。', true);
        return;
      }
      noteTimer = setTimeout(() => {
        const result = save();
        if (editor) editor.setSaveStatus(result.ok ? result.persistent ? '已保存到本机' : '暂未持久保存，请导出备份' : '修改尚未保存，请先保留文字。');
      }, 450);
    }
  });
  editor.setSaveStatus(memoryOnly ? '暂存于本次打开，请导出备份' : entry ? '本机自动保存' : '草稿自动保存');
}
function renderNotebookHistory() {
  const entries = C.sortedNotebookEntries(model),
    pinned = entries.filter(entry => entry.pinned),
    normal = entries.filter(entry => !entry.pinned);
  main.innerHTML = header('速写历史', '', '<div class="actions"><button type="button" class="secondary" data-action="note-back-editor">返回编辑</button><button type="button" class="primary" data-action="note-new">新建速写</button></div>') + (entries.length ? `${pinned.length ? `<section class="note-history-section" data-note-section="pinned"><h2 class="note-section-title">置顶速写</h2>${noteGroups(pinned, true)}</section>` : ''}${normal.length ? `<section class="note-history-section" data-note-section="normal">${pinned.length ? '<h2 class="note-section-title">其他速写</h2>' : ''}${noteGroups(normal, false)}</section>` : ''}` : '<section class="card empty"><h2>还没有保存的速写</h2><p>写好一条后，点击“保存速写”，就会按日期收录在这里。</p><button type="button" class="secondary" data-action="note-back-editor">返回编辑</button></section>');
}
function noteGroups(entries, pinned) {
  const groups = new Map();
  for (const entry of entries) {
    const day = completedDay(entry.createdAt);
    if (!groups.has(day)) groups.set(day, []);
    groups.get(day).push(entry);
  }
  return Array.from(groups, ([day, notes]) => `<section class="history-group note-history-group" data-note-date="${day}" data-note-pinned="${pinned}"><div class="history-date"><h2><time datetime="${day}">${Number(day.slice(0, 4))}年${Number(day.slice(5, 7))}月${Number(day.slice(8, 10))}日</time></h2><span class="muted small">${notes.length} 条速写</span></div><div class="history-list">${notes.map(noteRow).join('')}</div></section>`).join('');
}
function noteRow(entry) {
  const text = noteText(entry.html);
  const edited = entry.updatedAt !== entry.createdAt ? ` · 最近编辑 ${completedDay(entry.updatedAt)} ${completedTime(entry.updatedAt)}` : '';
  return `<article class="history-item note-record" data-note-id="${entry.id}"><div class="history-main"><div class="history-title">${entry.pinned ? '<span class="badge note-pinned">已置顶</span>' : ''}<h3><button type="button" class="note-record-open" data-action="open-note" data-id="${entry.id}">${esc(text.title)}</button></h3></div>${text.preview ? `<div class="muted small note-record-preview">${esc(text.preview)}</div>` : ''}<div class="muted small history-time"><time datetime="${esc(entry.createdAt)}">${completedTime(entry.createdAt)} 保存</time>${edited}</div></div><div class="row-actions note-record-actions"><button type="button" class="secondary" data-action="toggle-note-pin" data-id="${entry.id}" aria-pressed="${entry.pinned}">${entry.pinned ? '取消置顶' : '置顶'}</button><button type="button" class="text-button danger" data-action="delete-note" data-id="${entry.id}">删除</button></div></article>`;
}
