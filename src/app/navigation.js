/* The three secondary pages share a hover, keyboard and touch disclosure. */
const otherFeaturesGroup = $('#navigation-more');
const otherFeaturesToggle = $('#other-features-toggle');
const otherFeaturesPopover = $('#other-features-popover');
let otherFeaturesTimer = null;
let otherFeaturesPinned = false;

function closeOtherFeatures() {
  clearTimeout(otherFeaturesTimer);
  otherFeaturesPopover.hidden = true;
  otherFeaturesToggle.setAttribute('aria-expanded', 'false');
  otherFeaturesPinned = false;
}
function openOtherFeatures() {
  clearTimeout(otherFeaturesTimer);
  const anchor = otherFeaturesToggle.getBoundingClientRect();
  const width = Math.min(224, document.documentElement.clientWidth - 24);
  otherFeaturesPopover.hidden = false;
  otherFeaturesPopover.style.width = `${width}px`;
  const height = otherFeaturesPopover.getBoundingClientRect().height;
  const beside = document.documentElement.clientWidth > 760 && anchor.right + width + 22 <= document.documentElement.clientWidth;
  const left = beside ? anchor.right + 10 : Math.max(12, Math.min(anchor.left, document.documentElement.clientWidth - width - 12));
  const top = beside ? Math.min(anchor.top, window.innerHeight - height - 12) : anchor.bottom + height + 8 <= window.innerHeight ? anchor.bottom + 8 : anchor.top - height - 8;
  otherFeaturesPopover.style.left = `${left}px`;
  otherFeaturesPopover.style.top = `${Math.max(12, top)}px`;
  otherFeaturesToggle.setAttribute('aria-expanded', 'true');
}
function scheduleOtherFeaturesClose() {
  clearTimeout(otherFeaturesTimer);
  otherFeaturesTimer = setTimeout(() => {
    if (!otherFeaturesGroup.contains(document.activeElement)) closeOtherFeatures();
  }, 160);
}
otherFeaturesToggle.addEventListener('pointerenter', event => {
  if (event.pointerType === 'mouse') openOtherFeatures();
});
otherFeaturesPopover.addEventListener('pointerenter', () => clearTimeout(otherFeaturesTimer));
otherFeaturesGroup.addEventListener('pointerleave', event => {
  if (event.pointerType === 'mouse') scheduleOtherFeaturesClose();
});
otherFeaturesGroup.addEventListener('focusin', openOtherFeatures);
otherFeaturesGroup.addEventListener('focusout', scheduleOtherFeaturesClose);
otherFeaturesToggle.addEventListener('click', () => {
  if (!otherFeaturesPopover.hidden && otherFeaturesPinned) closeOtherFeatures();else {
    openOtherFeatures();
    otherFeaturesPinned = true;
  }
});
otherFeaturesGroup.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !otherFeaturesPopover.hidden) {
    event.preventDefault();
    // Focus first, then close; focusin otherwise reopens the disclosure.
    otherFeaturesToggle.focus({ preventScroll: true });
    closeOtherFeatures();
  }
  if (event.key === 'ArrowDown' && event.target === otherFeaturesToggle) {
    event.preventDefault();
    openOtherFeatures();
    $('button', otherFeaturesPopover).focus();
  }
});
document.addEventListener('click', event => {
  if (!otherFeaturesGroup.contains(event.target)) closeOtherFeatures();
});
window.addEventListener('resize', () => closeOtherFeatures());
window.addEventListener('scroll', () => closeOtherFeatures(), true);
