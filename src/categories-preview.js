/* Synthetic category examples. Never reads the installed desktop profile. */
(function (root) {
  'use strict';
  const C = root.ThreeThingsCore;
  function sampleModel(date) {
    const model = C.blankModel();
    model.categories = [
      { id: 'c_courses', title: '大学课程' },
      { id: 'c_operations', title: '运筹学' },
      { id: 'c_week', title: '本周重点' },
      { id: 'c_practice', title: '实践与生活' }
    ];
    const due = offset => {
      const value = new Date(date + 'T12:00:00');
      value.setDate(value.getDate() + offset);
      return C.localDate(value);
    };
    const project = (id, title, categoryIds, priority, offset, stageTitle, taskTitle) => ({
      id, title, categoryIds, priority, due: due(offset), done: false,
      stages: [{ id: id + '_stage', title: stageTitle, priority: null, due: null, done: false,
        tasks: [{ id: id + '_task', title: taskTitle, priority: null, due: null, done: false }] }]
    });
    model.projects = [
      project('p_probability', '概率论', ['c_courses', 'c_week'], 3, 2, '第四章 · 随机变量', '完成概率论作业 4'),
      project('p_marx', '马原', ['c_courses'], 2, 5, '读书笔记', '完成本周阅读并整理笔记'),
      project('p_physics', '基础物理学 3', ['c_courses'], 1, 7, '电磁学', '整理电磁感应例题'),
      project('p_linear', '线性规划作业', ['c_operations', 'c_week'], 3, 1, '单纯形法', '完成习题并检查计算过程'),
      project('p_model', '运输问题建模', ['c_operations'], 2, 4, '建立模型', '整理约束条件与目标函数'),
      project('p_practice', '云南昆明实践', ['c_practice'], 1, 12, '前期准备', '确认出行安排'),
      project('p_reading', '阅读计划', ['c_practice'], 0, 16, '本月书单', '选择下一本想读的书'),
      project('p_misc', '整理电脑资料', [], 0, 9, '文件归档', '整理下载文件夹')
    ];
    return C.validateModel(model);
  }
  root.ThreeThingsCategoryPreview = Object.freeze({ sampleModel });
  if (typeof module !== 'undefined' && module.exports) module.exports = root.ThreeThingsCategoryPreview;
})(typeof globalThis !== 'undefined' ? globalThis : window);
