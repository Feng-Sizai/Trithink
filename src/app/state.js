/* Module handles, private state and display helpers.
 * Built in the shared private application scope; see build.config.cjs.
 */
const C = window.ThreeThingsCore;
const K = window.ThreeThingsCalendar;
const calendarPreview = document.body.dataset.preview === 'calendar';
const categoryPreview = document.body.dataset.preview === 'categories';
const services = window.ThreeThingsIntegrations.createIntegrationServices({
  storage: window.ThreeThingsStorage,
  accounts: null,
  projectSharing: null
});
const S = services.storage;
const E = window.ThreeThingsEditor;
const $ = (selector, parent = document) => parent.querySelector(selector);
const main = $('#main');
const modal = $('#modal');
const loaded = S.load();
let model = loaded.model || C.blankModel();
let today = C.localDate();
if (calendarPreview && loaded.isNew) model = K.sampleModel(today);
if (categoryPreview && loaded.isNew) model = window.ThreeThingsCategoryPreview.sampleModel(today);
let recoveryNoticeVisible = Boolean(loaded.recovered);
const previousView = model.viewState;
let restoringView = true;
let page = categoryPreview && loaded.isNew ? 'projects' : calendarPreview ? 'calendar' : previousView?.page || 'today';
let activeCategory = previousView?.categoryId || 'all';
let projectTreeOpen = categoryPreview;
const expandedCategories = new Set(previousView?.expandedCategories || []);
let calendarMonth = previousView?.calendarMonth || today.slice(0, 7);
let calendarDay = previousView?.calendarDay || today;
let calendarView = 'week';
let activeProject = previousView?.activeProject || null;
let editor = null;
let editorNoteId = null;
let noteTimer = null;
let modalAction = null;
let modalContext = null;
let memoryOnly = !loaded.persistent;
let lastGood = C.validateModel(model);
let showQueue = previousView?.showQueue || false;
let showDone = previousView?.showDone || false;
let boot = Boolean(loaded.isNew) && !calendarPreview && !categoryPreview;
const labels = ['低', '中', '高'];
const priorityLabels = ['日常', '普通', '重要', '极重要'];
let automaticOrder = '';
let urgentSignature = '';
const automaticSortDescription = '不足1天优先 > 三星 > 剩余1～2天 > 其余按星级；同星级截止更早优先。暂缓事项移至队尾，明天恢复参与排序';
const sortDescription = '重要程度（星级）>截止时间';
const drinks = [{
  id: 'coffee',
  name: '咖啡'
}, {
  id: 'milkTea',
  name: '奶茶'
}, {
  id: 'other',
  name: '其他'
}, {
  id: 'water',
  name: '喝水'
}];
const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
})[ch]);
const dateLabel = value => value ? `${Number(value.slice(5, 7))}月${Number(value.slice(8, 10))}日` : '未设截止时间';
const dateHeading = () => new Intl.DateTimeFormat('zh-CN', {
  month: 'long',
  day: 'numeric',
  weekday: 'long'
}).format(new Date(`${today}T12:00:00`));
const completedDay = value => value ? C.localDate(new Date(value)) : '';
const completedTime = value => new Intl.DateTimeFormat('zh-CN', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false
}).format(new Date(value));
const flat = () => C.flattenTasks(model);
const findLeaf = id => flat().find(item => item.id === id);
const plan = () => C.getPlan(model, today);
const routine = () => C.getRoutine(model, today);
const projectById = id => model.projects.find(p => p.id === id);
