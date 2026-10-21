/* Minute-precision pointer gestures. The model changes only on a valid release. */
let scheduleGesture = null;
let scheduleIgnoreClickUntil = 0;
let scheduleCancelledPointer = null;
function cancelScheduleGesture() {
  const gesture = scheduleGesture;
  if (!gesture) return;
  scheduleGesture = null;
  scheduleCancelledPointer = gesture.pointerId;
  clearTimeout(gesture.timer);
  cancelAnimationFrame(gesture.frame);
  gesture.preview?.remove();
  gesture.trash?.remove();
  gesture.card?.classList.remove('schedule-drag-source');
  document.body.classList.remove('schedule-gesture-active');
  if (gesture.capture.hasPointerCapture?.(gesture.pointerId)) gesture.capture.releasePointerCapture(gesture.pointerId);
}
function schedulePointMinute(column, clientY) {
  return K.scheduleMinute(clientY - column.getBoundingClientRect().top);
}
function schedulePointerColumn(x, y) {
  return [...document.querySelectorAll('[data-schedule-day]')].find(column => {
    const rect = column.getBoundingClientRect();
    return x >= rect.left && x < rect.right && y >= rect.top && y <= rect.bottom;
  });
}
function updateSchedulePreview(gesture) {
  if (scheduleGesture !== gesture || gesture.mode === 'pending' || gesture.mode === 'cancelled') return;
  if (gesture.mode === 'move') {
    if (!gesture.trash) {
      gesture.trash = document.createElement('div');
      gesture.trash.className = 'schedule-trash';
      gesture.trash.setAttribute('role', 'status');
      gesture.trash.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7"/></svg><strong>拖到这里删除日程</strong><small>关联的项目将保留</small>';
      document.body.append(gesture.trash);
      gesture.trashArmed = !scheduleTrashContains(gesture, gesture.x, gesture.y);
    }
    const withinTrash = scheduleTrashContains(gesture, gesture.x, gesture.y);
    if (!withinTrash) gesture.trashArmed = true;
    gesture.overTrash = gesture.trashArmed && withinTrash;
    gesture.trash.classList.toggle('is-over', gesture.overTrash);
    if (gesture.overTrash) return;
    const destination = schedulePointerColumn(gesture.x, gesture.y);
    if (destination) gesture.column = destination;
  }
  const pointerMinute = schedulePointMinute(gesture.column, gesture.y);
  const minute = gesture.mode === 'start' ? gesture.start + pointerMinute - gesture.anchor : gesture.mode === 'end' ? gesture.end + pointerMinute - gesture.anchor : pointerMinute;
  gesture.range = gesture.mode === 'create' ? K.scheduleCreateRange(gesture.anchor, minute)
    : gesture.mode === 'move' && gesture.moved ? K.scheduleMoveRange(gesture.start, gesture.end, gesture.anchor, minute)
    : K.scheduleRange(gesture.mode, gesture.start, gesture.end, gesture.anchor, minute);
  if (!gesture.preview) {
    gesture.preview = document.createElement('div');
    gesture.preview.className = 'schedule-selection';
    if (gesture.card) {
      const colors = getComputedStyle(gesture.card);
      gesture.preview.style.setProperty('--event-bg', colors.getPropertyValue('--event-bg'));
      gesture.preview.style.setProperty('--event-ink', colors.getPropertyValue('--event-ink'));
    }
    const label = document.createElement('span');
    label.className = 'schedule-selection-label';
    gesture.preview.append(label);
  }
  gesture.column.append(gesture.preview);
  const start = Math.max(K.SCHEDULE.start, gesture.range.start);
  gesture.preview.style.top = ((start - K.SCHEDULE.start) * K.SCHEDULE.hourHeight / 60) + 'px';
  gesture.preview.style.height = ((gesture.range.end - start) * K.SCHEDULE.hourHeight / 60) + 'px';
  gesture.preview.classList.toggle('is-tiny', gesture.range.end - start < 35);
  gesture.preview.firstChild.textContent = K.minuteTime(gesture.range.start) + '–' + K.minuteTime(gesture.range.end);
  gesture.card?.classList.add('schedule-drag-source');
  document.body.classList.add('schedule-gesture-active');
}
function scheduleTrashContains(gesture, x, y) {
  if (!gesture.trash) return false;
  const rect = gesture.trash.getBoundingClientRect();
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}
function scheduleAutoScroll(gesture) {
  if (scheduleGesture !== gesture) return;
  if (gesture.mode !== 'pending' && gesture.mode !== 'cancelled' && gesture.moved && !gesture.overTrash) {
    const board = $('#schedule-scroll');
    if (!board) return cancelScheduleGesture();
    const rect = board.getBoundingClientRect();
    if (gesture.x >= rect.left && gesture.x <= rect.right) {
      const previous = window.scrollY;
      if (gesture.y < 40) window.scrollBy(0, -5);
      else if (gesture.y > innerHeight - 40) window.scrollBy(0, 5);
      if (window.scrollY !== previous) updateSchedulePreview(gesture);
    }
  }
  gesture.frame = requestAnimationFrame(() => scheduleAutoScroll(gesture));
}
document.addEventListener('pointerdown', event => {
  if (event.button !== 0 || event.isPrimary === false || event.pointerType === 'touch' || modal.open || scheduleGesture) return;
  const column = event.target.closest('[data-schedule-day]');
  if (!column) return;
  const card = event.target.closest('.schedule-timed-event');
  if (!card && !event.target.closest('.schedule-slot')) return;
  const record = card ? model.calendarEvents.find(item => item.id === card.dataset.id) : null;
  if (card && !record) return;
  const edge = event.target.closest('[data-schedule-edge]')?.dataset.scheduleEdge;
  const anchor = schedulePointMinute(column, event.clientY);
  const gesture = {
    mode: card ? edge || 'pending' : 'create',
    pointerId: event.pointerId,
    capture: column,
    column,
    originalColumn: column,
    card,
    recordId: record?.id,
    originalDate: record?.date,
    start: record ? K.timeMinutes(record.startTime) : anchor,
    end: record ? K.timeMinutes(record.endTime) : anchor + 1,
    anchor,
    downX: event.clientX,
    downY: event.clientY,
    x: event.clientX,
    y: event.clientY,
    moved: false
  };
  scheduleCancelledPointer = null;
  scheduleGesture = gesture;
  column.setPointerCapture?.(event.pointerId);
  if (gesture.mode === 'pending') {
    gesture.timer = setTimeout(() => {
      if (scheduleGesture !== gesture || gesture.mode !== 'pending') return;
      gesture.mode = 'move';
      updateSchedulePreview(gesture);
    }, K.SCHEDULE.holdMs);
  } else {
    event.preventDefault();
    if (edge) updateSchedulePreview(gesture);
  }
  gesture.frame = requestAnimationFrame(() => scheduleAutoScroll(gesture));
});
document.addEventListener('pointermove', event => {
  const gesture = scheduleGesture;
  if (!gesture || event.pointerId !== gesture.pointerId) return;
  gesture.x = event.clientX;
  gesture.y = event.clientY;
  const distance = Math.hypot(gesture.x - gesture.downX, gesture.y - gesture.downY);
  if (gesture.mode === 'pending' && distance > 5) {
    clearTimeout(gesture.timer);
    gesture.mode = 'cancelled';
  }
  if (distance >= 1) gesture.moved = true;
  if (gesture.mode !== 'pending' && gesture.mode !== 'cancelled' && gesture.moved) {
    event.preventDefault();
    updateSchedulePreview(gesture);
  }
});
document.addEventListener('pointerup', event => {
  const gesture = scheduleGesture;
  if (!gesture) {
    if (scheduleCancelledPointer === event.pointerId) scheduleIgnoreClickUntil = performance.now() + 500;
    scheduleCancelledPointer = null;
    return;
  }
  if (event.pointerId !== gesture.pointerId) return;
  gesture.x = event.clientX;
  gesture.y = event.clientY;
  const quickClick = gesture.mode === 'pending' || gesture.mode === 'create' && !gesture.moved;
  if (!quickClick) scheduleIgnoreClickUntil = performance.now() + 500;
  const scroll = $('#schedule-scroll');
  const rect = scroll?.getBoundingClientRect();
  const heading = scroll && $('.schedule-heading', scroll).getBoundingClientRect();
  const inside = rect && gesture.x >= rect.left && gesture.x < rect.right && gesture.y >= Math.max(0, heading.bottom) && gesture.y <= Math.min(innerHeight, rect.bottom);
  if (!quickClick && gesture.mode !== 'cancelled' && inside) updateSchedulePreview(gesture);
  const deleteDrop = gesture.mode === 'move' && gesture.moved && gesture.trashArmed && scheduleTrashContains(gesture, gesture.x, gesture.y);
  const range = gesture.range;
  const day = gesture.column.dataset.scheduleDay;
  cancelScheduleGesture();
  scheduleCancelledPointer = null;
  if (deleteDrop) {
    quickDeleteCalendarEvent(gesture.recordId);
    return;
  }
  if (quickClick) {
    // Pointer capture retargets the native click to the column. Open explicitly.
    scheduleIgnoreClickUntil = performance.now() + 500;
    if (gesture.card) calendarEventForm(gesture.recordId);
    else calendarEventForm(null, day, K.minuteTime(Math.min(anchorMinute(gesture), 1439)));
    return;
  }
  if (!inside || !gesture.moved || gesture.mode === 'cancelled' || !range) return;
  if (gesture.mode === 'create') {
    calendarEventForm(null, day, K.minuteTime(range.start), K.minuteTime(range.end));
    tutorialScheduleSelected(day, range);
    return;
  }
  if (range.start === gesture.start && range.end === gesture.end && day === gesture.originalDate) return;
  try {
    K.rescheduleEvent(model, gesture.recordId, day, range);
    const result = save('日程时间已调整：' + K.minuteTime(range.start) + '–' + K.minuteTime(range.end));
    if (!result.ok) throw new Error(result.error || '保存失败');
    render();
  } catch (error) {
    toast(error.message || '无法调整日程，请重试。', true);
    render();
  }
});
function anchorMinute(gesture) {
  return Math.max(K.SCHEDULE.start, Math.min(K.SCHEDULE.end - 1, gesture.anchor));
}
document.addEventListener('click', event => {
  if (performance.now() < scheduleIgnoreClickUntil && event.target.closest('.schedule-column')) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }
}, true);
document.addEventListener('pointercancel', event => {
  if (scheduleGesture?.pointerId === event.pointerId) {
    scheduleIgnoreClickUntil = performance.now() + 500;
    cancelScheduleGesture();
  }
});
document.addEventListener('lostpointercapture', event => {
  if (scheduleGesture?.pointerId === event.pointerId) cancelScheduleGesture();
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && scheduleGesture) {
    event.preventDefault();
    scheduleIgnoreClickUntil = performance.now() + 500;
    cancelScheduleGesture();
  }
});
window.addEventListener('blur', cancelScheduleGesture);
