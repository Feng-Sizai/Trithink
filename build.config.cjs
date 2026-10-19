'use strict';

// These application fragments share one private scope, as the original app did.
module.exports = Object.freeze({
  sourceDirectory: 'src',
  outputDirectory: 'dist',
  outputFilename: '三件事-试用版.html',
  shell: 'shell.html',
  stylesheet: 'styles.css',
  extraStylesheets: ['calendar.css'],
  libraries: ['core.js', 'calendar-core.js', 'storage.js', 'integrations.js', 'editor.js'],
  application: ['app/state.js', 'app/records.js', 'app/task-views.js', 'app/daily-plan.js', 'app/notebook.js', 'app/calendar.js', 'app/navigation.js', 'app/dialogs.js', 'app.js']
});
