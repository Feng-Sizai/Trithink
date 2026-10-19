(function () {
  'use strict';

  var ALLOWED = new Set(['H1', 'H2', 'P', 'BR', 'B', 'STRONG', 'EM', 'I', 'U', 'UL', 'OL', 'LI', 'BLOCKQUOTE']);
  var BLOCKS = new Set(['H1', 'H2', 'P', 'UL', 'OL', 'LI', 'BLOCKQUOTE']);
  var DROP_CONTENT = new Set(['SCRIPT', 'STYLE', 'SVG', 'MATH', 'IMG', 'PICTURE', 'IFRAME', 'FRAME', 'FRAMESET', 'OBJECT', 'EMBED', 'APPLET', 'LINK', 'META', 'BASE', 'HEAD', 'TITLE', 'NOSCRIPT', 'TEMPLATE', 'FORM', 'INPUT', 'BUTTON', 'TEXTAREA', 'SELECT', 'OPTION', 'OPTGROUP', 'VIDEO', 'AUDIO', 'SOURCE', 'TRACK', 'CANVAS']);
  var nextId = 0;

  // Pasted documents may carry event handlers, links, remote images, or active
  // markup. Only these formatting elements survive, and no attributes survive.
  function sanitizeHTML(value) {
    var source = document.createElement('template');
    source.innerHTML = typeof value === 'string' ? value : '';
    var output = document.createElement('div');
    function clean(node) {
      var fragment = document.createDocumentFragment();
      if (node.nodeType === 3) {
        fragment.appendChild(document.createTextNode(node.nodeValue));
        return fragment;
      }
      if (node.nodeType !== 1) return fragment;
      var originalName = node.tagName.toUpperCase();
      if (DROP_CONTENT.has(originalName)) return fragment;
      var name = originalName === 'DIV' ? 'P' : originalName;
      var children = document.createDocumentFragment();
      Array.from(node.childNodes).forEach(function (child) {
        children.appendChild(clean(child));
      });
      if (!ALLOWED.has(name)) {
        // Harmless wrappers used by Word, such as spans and fonts, retain text.
        fragment.appendChild(children);
        return fragment;
      }
      if (name === 'P') {
        // A div copied from another editor may contain whole paragraphs. Split
        // it instead of creating invalid nested paragraphs on every save.
        var paragraph = document.createElement('p');
        while (children.firstChild) {
          var child = children.firstChild;
          if (child.nodeType === 1 && BLOCKS.has(child.tagName)) {
            if (paragraph.childNodes.length) fragment.appendChild(paragraph);
            fragment.appendChild(child);
            paragraph = document.createElement('p');
          } else {
            paragraph.appendChild(child);
          }
        }
        if (paragraph.childNodes.length || !fragment.childNodes.length) fragment.appendChild(paragraph);
      } else {
        var element = document.createElement(name.toLowerCase());
        element.appendChild(children);
        fragment.appendChild(element);
      }
      return fragment;
    }
    Array.from(source.content.childNodes).forEach(function (node) {
      output.appendChild(clean(node));
    });
    return output.innerHTML;
  }

  // Build one editor instance; persistence stays with the application controller.
  function create(options) {
    options = options || {};
    var container = options.container;
    if (!container || container.nodeType !== 1) throw new TypeError('速写本需要一个有效的容器。');
    var maxLength = Number.isSafeInteger(options.maxLength) && options.maxLength > 0 ? options.maxLength : 100000;
    var onChange = typeof options.onChange === 'function' ? options.onChange : function () {};
    var destroyed = false;
    var composing = false;
    var savedRange = null;
    var listeners = [];
    var id = 'three-things-note-' + ++nextId;
    container.replaceChildren();
    function element(tag, className, text) {
      var node = document.createElement(tag);
      if (className) node.className = className;
      if (text !== undefined) node.textContent = text;
      return node;
    }
    function listen(node, event, handler) {
      node.addEventListener(event, handler);
      listeners.push(function () {
        node.removeEventListener(event, handler);
      });
    }
    var toolbar = element('div', 'format-toolbar');
    toolbar.setAttribute('role', 'toolbar');
    toolbar.setAttribute('aria-label', '速写本文本格式');
    var editor = element('div', 'note-editor');
    editor.id = id;
    editor.contentEditable = 'true';
    editor.spellcheck = false;
    editor.tabIndex = 0;
    editor.setAttribute('role', 'textbox');
    editor.setAttribute('aria-multiline', 'true');
    editor.setAttribute('aria-label', '速写本正文');
    editor.setAttribute('data-placeholder', '在这里写下想法、课堂笔记或临时待办……');
    editor.style.overflowWrap = 'anywhere';
    editor.style.wordBreak = 'break-word';
    editor.innerHTML = sanitizeHTML(options.html) || '<p><br></p>';
    var footer = element('div', 'note-footer');
    var saveStatus = element('span', 'note-save-status', '等待保存');
    saveStatus.setAttribute('role', 'status');
    var count = element('span', 'note-char-count');
    var error = element('div', 'editor-status-error');
    error.id = id + '-message';
    error.setAttribute('role', 'status');
    error.setAttribute('aria-live', 'polite');
    editor.setAttribute('aria-describedby', error.id);
    footer.append(saveStatus, count);
    container.append(toolbar, editor, error, footer);
    var commands = [{
      label: '标题',
      command: 'formatBlock',
      value: 'h1',
      block: 'H1'
    }, {
      label: '副标题',
      command: 'formatBlock',
      value: 'h2',
      block: 'H2'
    }, {
      label: '正文',
      command: 'formatBlock',
      value: 'p',
      block: 'P'
    }, {
      label: '加粗',
      command: 'bold'
    }, {
      label: '斜体',
      command: 'italic'
    }, {
      label: '项目符号',
      command: 'insertUnorderedList'
    }, {
      label: '编号',
      command: 'insertOrderedList'
    }];
    var lastHTML = getHTML();
    var lastLength = editor.textContent.length;

    // Selection, status, and change tracking are shared by every editing action.
    function showError(message) {
      error.textContent = message || '';
    }
    function updateCount() {
      count.textContent = editor.textContent.length.toLocaleString('zh-CN') + ' / ' + maxLength.toLocaleString('zh-CN') + ' 字';
      editor.dataset.empty = String(!editor.textContent.trim());
    }
    function rangeIsInside(range) {
      return range && editor.contains(range.startContainer) && editor.contains(range.endContainer);
    }
    function rememberSelection() {
      var selection = window.getSelection();
      if (selection && selection.rangeCount && rangeIsInside(selection.getRangeAt(0))) {
        savedRange = selection.getRangeAt(0).cloneRange();
      }
    }
    function caretAtEnd() {
      var range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
      var selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      savedRange = range.cloneRange();
    }
    function restoreSelection() {
      editor.focus({
        preventScroll: true
      });
      var selection = window.getSelection();
      if (rangeIsInside(savedRange)) {
        selection.removeAllRanges();
        selection.addRange(savedRange);
      } else caretAtEnd();
    }
    function blockAtSelection() {
      var selection = window.getSelection();
      if (!selection || !selection.rangeCount || !rangeIsInside(selection.getRangeAt(0))) return null;
      var node = selection.anchorNode;
      if (node.nodeType !== 1) node = node.parentElement;
      while (node && node !== editor) {
        if (node.tagName === 'H1' || node.tagName === 'H2' || node.tagName === 'P') return node;
        node = node.parentElement;
      }
      return null;
    }
    function updateToolbar() {
      if (destroyed) return;
      var block = blockAtSelection();
      commands.forEach(function (item) {
        var pressed = false;
        if (item.block) pressed = block ? block.tagName === item.block : item.block === 'P';else {
          try {
            pressed = document.queryCommandState(item.command);
          } catch (_) {/* unsupported command */}
        }
        item.button.setAttribute('aria-pressed', String(pressed));
      });
    }
    function getHTML() {
      return sanitizeHTML(editor.innerHTML) || '<p><br></p>';
    }
    function changed() {
      if (destroyed || composing) return;
      var length = editor.textContent.length;
      if (length > maxLength && length > lastLength) {
        editor.innerHTML = lastHTML;
        savedRange = null;
        caretAtEnd();
        showError('内容超过 ' + maxLength.toLocaleString('zh-CN') + ' 字上限，本次输入未加入。请精简后再试。');
        updateCount();
        return;
      }
      if (length <= maxLength) showError('');
      lastHTML = getHTML();
      lastLength = length;
      updateCount();
      rememberSelection();
      updateToolbar();
      saveStatus.textContent = '等待保存';
      onChange(lastHTML);
    }
    function runCommand(item) {
      restoreSelection();
      document.execCommand(item.command, false, item.value || null);
      changed();
      rememberSelection();
    }

    // Toolbar actions restore the editor selection before applying formatting.
    commands.forEach(function (item) {
      var button = element('button', 'format-button', item.label);
      button.type = 'button';
      button.setAttribute('aria-controls', id);
      button.setAttribute('aria-pressed', 'false');
      item.button = button;
      toolbar.appendChild(button);
      listen(button, 'mousedown', function (event) {
        if (event.button === 0) event.preventDefault();
      });
      listen(button, 'click', function () {
        runCommand(item);
      });
    });
    listen(toolbar, 'keydown', function (event) {
      var index = commands.findIndex(function (item) {
        return item.button === document.activeElement;
      });
      if (index < 0) return;
      var next = index;
      if (event.key === 'ArrowRight') next = (index + 1) % commands.length;else if (event.key === 'ArrowLeft') next = (index + commands.length - 1) % commands.length;else if (event.key === 'Home') next = 0;else if (event.key === 'End') next = commands.length - 1;else return;
      event.preventDefault();
      commands[next].button.focus();
    });

    // Clipboard and drop content pass through the same bounded insertion path.
    function plainTextHTML(text) {
      var wrapper = document.createElement('div');
      text.replace(/\r\n?/g, '\n').split('\n').forEach(function (line) {
        var paragraph = document.createElement('p');
        paragraph.textContent = line;
        if (!line) paragraph.appendChild(document.createElement('br'));
        wrapper.appendChild(paragraph);
      });
      return wrapper.innerHTML;
    }
    function insertClipboard(data) {
      if (!data) return;
      if (data.files && data.files.length) {
        showError('速写本仅接受文字，请粘贴文本或带格式的文字。');
        return;
      }
      var rich = data.getData('text/html');
      var html = rich ? sanitizeHTML(rich) : plainTextHTML(data.getData('text/plain'));
      var probe = document.createElement('div');
      probe.innerHTML = html;
      restoreSelection();
      var selection = window.getSelection();
      var selectedLength = selection && selection.rangeCount ? selection.toString().length : 0;
      if (editor.textContent.length - selectedLength + probe.textContent.length > maxLength) {
        showError('粘贴后将超过 ' + maxLength.toLocaleString('zh-CN') + ' 字上限，内容未粘贴。');
        return;
      }
      if (!html) {
        showError('未找到可粘贴的文字。');
        return;
      }
      if (rich && !editor.textContent.trim()) {
        // Chromium keeps an emptied heading as the insertion context. Using
        // insertHTML there can wrap pasted body paragraphs in another heading.
        // A whole rich document in an otherwise empty editor can be installed
        // directly: it has already passed the allowlist and length checks.
        editor.innerHTML = html;
        savedRange = null;
        caretAtEnd();
        changed();
        return;
      }
      document.execCommand('insertHTML', false, html);
      changed();
    }
    listen(editor, 'paste', function (event) {
      event.preventDefault();
      rememberSelection();
      insertClipboard(event.clipboardData);
    });
    listen(editor, 'dragover', function (event) {
      event.preventDefault();
    });
    listen(editor, 'drop', function (event) {
      event.preventDefault();
      var range = null;
      if (document.caretRangeFromPoint) range = document.caretRangeFromPoint(event.clientX, event.clientY);else if (document.caretPositionFromPoint) {
        var position = document.caretPositionFromPoint(event.clientX, event.clientY);
        if (position) {
          range = document.createRange();
          range.setStart(position.offsetNode, position.offset);
          range.collapse(true);
        }
      }
      if (rangeIsInside(range)) savedRange = range;
      insertClipboard(event.dataTransfer);
    });
    // Let the input method finish composing before validating committed text.
    listen(editor, 'beforeinput', function (event) {
      if (event.inputType === 'insertFromDrop') {
        event.preventDefault();
        return;
      }
      if (composing || event.isComposing || !event.data || event.inputType.indexOf('insert') !== 0) return;
      var selection = window.getSelection();
      var removed = selection && selection.rangeCount && rangeIsInside(selection.getRangeAt(0)) ? selection.toString().length : 0;
      if (editor.textContent.length - removed + event.data.length > maxLength) {
        event.preventDefault();
        showError('内容已达到 ' + maxLength.toLocaleString('zh-CN') + ' 字上限，请精简后继续。');
      }
    });
    listen(editor, 'compositionstart', function () {
      composing = true;
    });
    listen(editor, 'compositionend', function () {
      composing = false;
      changed();
    });
    listen(editor, 'input', changed);
    listen(editor, 'keydown', function (event) {
      if (event.key !== 'Enter' || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey || event.isComposing || composing) return;
      var selection = window.getSelection();
      if (!selection || !selection.rangeCount || !selection.isCollapsed) return;
      var block = blockAtSelection();
      if (!block || block.tagName !== 'H1' && block.tagName !== 'H2') return;
      var tail = selection.getRangeAt(0).cloneRange();
      tail.setEnd(block, block.childNodes.length);
      if (tail.toString().length) return;
      event.preventDefault();
      var paragraph = document.createElement('p');
      paragraph.appendChild(document.createElement('br'));
      block.after(paragraph);
      var range = document.createRange();
      range.setStart(paragraph, 0);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      changed();
    });
    listen(editor, 'keyup', function () {
      rememberSelection();
      updateToolbar();
    });
    listen(editor, 'mouseup', function () {
      rememberSelection();
      updateToolbar();
    });
    listen(editor, 'blur', rememberSelection);
    listen(document, 'selectionchange', function () {
      rememberSelection();
      updateToolbar();
    });
    updateCount();
    updateToolbar();
    if (lastLength > maxLength) showError('这份笔记超过 ' + maxLength.toLocaleString('zh-CN') + ' 字上限，原文已保留，请精简后继续输入。');
    return {
      getHTML: getHTML,
      focus: function () {
        if (!destroyed) restoreSelection();
      },
      setSaveStatus: function (text) {
        if (!destroyed) saveStatus.textContent = String(text || '');
      },
      destroy: function () {
        if (destroyed) return;
        destroyed = true;
        listeners.forEach(function (remove) {
          remove();
        });
        savedRange = null;
        container.replaceChildren();
      }
    };
  }
  window.ThreeThingsEditor = Object.freeze({
    create: create,
    sanitizeHTML: sanitizeHTML
  });
})();
