/* Session undo for committed changes. Text editors retain their native undo. */
const undoEntries = [];
let undoBytes = 0;
function rememberOperation(before, after) {
  if (before === after) return;
  undoEntries.push({ before, after });
  undoBytes += before.length + after.length;
  while (undoEntries.length > 50 || undoBytes > 32 * 1024 * 1024 && undoEntries.length > 1) {
    const removed = undoEntries.shift();
    undoBytes -= removed.before.length + removed.after.length;
  }
}
function undoLastOperation(message = '已撤销上一步操作。') {
  if (editor) {
    if (!captureNotebook() || !save().ok) return false;
  }
  const entry = undoEntries[undoEntries.length - 1];
  if (!entry) { toast('当前没有可撤销的操作。'); return false; }
  let previous;
  try { previous = C.validateModel(JSON.parse(entry.before)); }
  catch (_) { toast('无法读取撤销记录，当前数据未改动。', true); return false; }
  const result = S.save(previous);
  if (!result.ok) { toast(result.error || '撤销未能保存，当前数据未改动。', true); return false; }
  destroyEditor(false);
  cancelScheduleGesture();
  closeScheduleMenu();
  calendarDeleteUndo = null;
  undoEntries.pop();
  undoBytes -= entry.before.length + entry.after.length;
  model = previous;
  lastGood = C.validateModel(previous);
  memoryOnly = !result.persistent;
  boot = false;
  render();
  toast(result.error || message, Boolean(result.error));
  return true;
}
document.addEventListener('keydown', event => {
  if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.altKey || event.isComposing || event.key.toLowerCase() !== 'z') return;
  if (modal.open || event.target.closest?.('#tutorial') || event.target.isContentEditable || event.target.closest?.('input,textarea,select,[contenteditable="true"],[contenteditable=""]')) return;
  event.preventDefault();
  if (scheduleGesture) { cancelScheduleGesture(); toast('已取消当前拖动。'); return; }
  undoLastOperation();
});
