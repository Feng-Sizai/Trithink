'use strict';

// These application fragments share one private scope, as the original app did.
module.exports = Object.freeze({
  sourceDirectory: 'src',
  outputDirectory: 'dist',
  outputFilename: '三件事-试用版.html',
  shell: 'shell.html',
  stylesheet: 'styles.css',
  extraStylesheets: ['calendar.css', 'categories.css'],
  libraries: ['core.js', 'calendar-core.js', 'tutorial-core.js', 'categories-preview.js', 'storage.js', 'integrations.js', 'editor.js'],
  application: ['app/state.js', 'app/records.js', 'app/undo.js', 'app/task-views.js', 'app/categories.js', 'app/daily-plan.js', 'app/notebook.js', 'app/calendar.js', 'app/schedule-interactions.js', 'app/schedule-menu.js', 'app/navigation.js', 'app/dialogs.js', 'app/form-drafts.js', 'app/tutorial.js', 'app.js']
});
