(function initPageEditor() {
  var pageName = (window.location.pathname.split('/').pop() || 'index.html').replace(/[^a-z0-9.-]/gi, '-');
  var textKey = 'lip:text-edits:' + pageName + ':v1';
  var hiddenKey = 'lip:hidden-blocks:' + pageName + ':v1';
  var legacyTextKeys = pageName === 'index.html'
    ? ['lip:text-edits:slot-v1', 'lip:text-edits:v1', 'lip:text-edits:v2', 'lip:text-edits:stable-v1']
    : [];
  var legacyHiddenKeys = pageName === 'index.html'
    ? ['lip:hidden-blocks:slot-v1', 'lip:hidden-blocks:v1', 'lip:hidden-blocks:v2', 'lip:hidden-blocks:stable-v1']
    : [];
  var body = document.body;
  var editToggle = document.getElementById('editToggle');
  var exportButton = document.getElementById('exportEdits');
  var showHiddenButton = document.getElementById('showHidden');
  var resetButton = document.getElementById('resetEdits');
  var status = document.getElementById('editStatus');
  var editorPanel = document.querySelector('[data-editor-ui]');
  var editables = [];
  var removables = [];
  var textEdits = mergeLegacyText(readJson(textKey, {}));
  var hiddenBlocks = mergeLegacyHidden(readJson(hiddenKey, []));
  var saveTimer = null;
  var serverSaveOk = false;
  var host = window.location.hostname;
  var localEditorHost = window.location.protocol === 'file:' ||
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1';

  if (!localEditorHost) {
    if (editorPanel) editorPanel.remove();
    return;
  }

  if (!editToggle || !exportButton || !showHiddenButton || !resetButton || !status) return;
  if (editorPanel) editorPanel.classList.add('is-editor-enabled');

  function readJson(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key)) || fallback;
    } catch (error) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function mergeLegacyText(current) {
    var merged = {};
    legacyTextKeys.forEach(function(key) {
      merged = Object.assign(merged, readJson(key, {}));
    });
    return Object.assign(merged, current || {});
  }

  function mergeLegacyHidden(current) {
    var values = [];
    legacyHiddenKeys.forEach(function(key) {
      values = values.concat(readJson(key, []));
    });
    return Array.from(new Set(values.concat(current || [])));
  }

  function markSaved() {
    status.textContent = body.classList.contains('editor-on')
      ? (serverSaveOk ? 'Editing - saved to disk' : 'Editing - saved locally')
      : 'View mode';
  }

  function loadServerEdits() {
    if (!window.fetch) return Promise.resolve();
    return fetch('/api/editor-edits?page=' + encodeURIComponent(pageName), { cache: 'no-store' })
      .then(function(response) {
        if (!response.ok) throw new Error('No edit API');
        return response.json();
      })
      .then(function(data) {
        var localText = textEdits;
        var localHidden = hiddenBlocks;
        textEdits = Object.assign({}, data.textEdits || {}, localText || {});
        hiddenBlocks = Array.from(new Set([].concat(data.hiddenBlocks || [], localHidden || [])));
        writeJson(textKey, textEdits);
        writeJson(hiddenKey, hiddenBlocks);
        serverSaveOk = true;
      })
      .catch(function() {
        serverSaveOk = false;
      });
  }

  function saveServerEdits() {
    if (!window.fetch) return;
    fetch('/api/editor-edits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        page: pageName,
        textEdits: textEdits,
        hiddenBlocks: hiddenBlocks
      })
    })
      .then(function(response) {
        if (!response.ok) throw new Error('Save failed');
        serverSaveOk = true;
        markSaved();
      })
      .catch(function() {
        serverSaveOk = false;
        markSaved();
      });
  }

  function scheduleServerSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveServerEdits, 350);
  }

  function persistEdits() {
    writeJson(textKey, textEdits);
    writeJson(hiddenKey, hiddenBlocks);
    scheduleServerSave();
    markSaved();
  }

  function clearServerEdits() {
    if (!window.fetch) return;
    fetch('/api/editor-edits?page=' + encodeURIComponent(pageName), { method: 'DELETE' })
      .catch(function() {});
  }

  function slugify(value) {
    return (value || 'empty')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 56) || 'empty';
  }

  function contextName(el) {
    var context = el.closest('section, header, footer');
    if (!context) return 'page';
    if (context.id) return context.tagName.toLowerCase() + '-' + context.id;
    if (context.className) return context.tagName.toLowerCase() + '-' + slugify(context.className);
    return context.tagName.toLowerCase();
  }

  function elementName(el) {
    var parts = [el.tagName.toLowerCase()];
    if (el.className && typeof el.className === 'string') {
      parts.push(slugify(el.className));
    }
    if (el.id) parts.push(el.id);
    return parts.join('-');
  }

  function uniqueKey(base, counts) {
    counts[base] = (counts[base] || 0) + 1;
    return counts[base] === 1 ? base : base + '-' + counts[base];
  }

  function scopedPath(el) {
    var context = el.closest('section, header, footer') || body;
    var path = [];
    var node = el;
    while (node && node !== context && node.parentElement) {
      var tag = node.tagName.toLowerCase();
      var siblings = Array.prototype.slice.call(node.parentElement.children)
        .filter(function(child) {
          return child.tagName === node.tagName &&
            !child.closest('[data-editor-ui]') &&
            !child.classList.contains('edit-remove');
        });
      path.unshift(tag + '-' + (siblings.indexOf(node) + 1));
      node = node.parentElement;
    }
    return path.join('/');
  }

  function editableKey(el, counts) {
    if (el.dataset.editKey) return 'text:' + el.dataset.editKey;
    return uniqueKey([
      'text',
      contextName(el),
      elementName(el),
      scopedPath(el)
    ].join(':'), counts);
  }

  function removableKey(el, counts) {
    if (el.dataset.removeKey) return 'block:' + el.dataset.removeKey;
    return uniqueKey([
      'block',
      contextName(el),
      elementName(el),
      scopedPath(el)
    ].join(':'), counts);
  }

  function editableSelector() {
    return [
      '.nav__brand span',
      '.nav__links a',
      'h1',
      'h2',
      'h3',
      'h4',
      'p',
      'li',
      '.eyebrow',
      '.btn',
      '.join-cta span',
      '.social-link strong',
      '.social-link span',
      '.branch-teaser strong',
      '.branch-teaser span',
      '.branch-teaser em',
      '.card__num',
      '.proj__num',
      '.process span',
      '.roadmap span',
      '.gallery-preview span',
      '.essay-cards span',
      '[data-edit-key]',
      '.footer__mark'
    ].join(', ');
  }

  function shouldSkipEditable(el) {
    return Boolean(
      el.closest('[data-editor-ui]') ||
      el.closest('script') ||
      el.closest('style') ||
      el.closest('form') ||
      el.getAttribute('aria-hidden') === 'true' ||
      el.classList.contains('arrow') ||
      el.classList.contains('social-icon') ||
      el.classList.contains('discord-cta__icon')
    );
  }

  function setupEditables() {
    editables = Array.prototype.slice.call(document.querySelectorAll(editableSelector()))
      .filter(function(el) { return !shouldSkipEditable(el); });

    var counts = {};
    editables.forEach(function(el) {
      var id = editableKey(el, counts);
      el.dataset.editId = id;
      if (Object.prototype.hasOwnProperty.call(textEdits, id)) {
        el.textContent = textEdits[id];
      }
      el.addEventListener('input', function() {
        textEdits[id] = el.textContent;
        persistEdits();
      });
    });
  }

  function removableSelector() {
    return [
      'section',
      '.card',
      '.init',
      '.proj',
      '.charter article',
      '.essay-block',
      '.gallery-preview article',
      '.placeholder-panel',
      '.coming-panel'
    ].join(', ');
  }

  function setupRemovables() {
    removables = Array.prototype.slice.call(document.querySelectorAll(removableSelector()))
      .filter(function(el) { return !el.closest('[data-editor-ui]'); });

    var counts = {};
    removables.forEach(function(el) {
      var id = removableKey(el, counts);
      var button = document.createElement('button');
      el.dataset.removableId = id;
      el.classList.add('editable-block');
      button.type = 'button';
      button.className = 'edit-remove';
      button.textContent = 'x';
      button.setAttribute('aria-label', 'Hide this block');
      button.setAttribute('contenteditable', 'false');
      button.dataset.editorUi = 'true';
      button.addEventListener('click', function(event) {
        event.preventDefault();
        event.stopPropagation();
            if (hiddenBlocks.indexOf(id) === -1) {
              hiddenBlocks.push(id);
              persistEdits();
            }
            el.classList.add('editor-hidden');
            markSaved();
      });
      el.appendChild(button);
      if (hiddenBlocks.indexOf(id) !== -1) {
        el.classList.add('editor-hidden');
      }
    });
  }

  function setEditMode(on) {
    body.classList.toggle('editor-on', on);
    editToggle.textContent = on ? 'Done editing' : 'Edit page';
    status.textContent = on ? 'Editing - click text or x blocks' : 'View mode';
    editables.forEach(function(el) {
      if (on) {
        el.setAttribute('contenteditable', 'plaintext-only');
      } else {
        el.removeAttribute('contenteditable');
      }
    });
  }

  function exportHtml() {
    var clone = document.documentElement.cloneNode(true);
    clone.querySelectorAll('[data-editor-ui], .edit-remove').forEach(function(el) {
      el.remove();
    });
    clone.querySelectorAll('[contenteditable], [data-edit-id], [data-removable-id]').forEach(function(el) {
      el.removeAttribute('contenteditable');
      el.removeAttribute('data-edit-id');
      el.removeAttribute('data-removable-id');
    });
    clone.querySelectorAll('.editor-hidden').forEach(function(el) {
      el.remove();
    });
    clone.querySelectorAll('.editable-block').forEach(function(el) {
      el.classList.remove('editable-block');
    });
    clone.querySelector('body').classList.remove('editor-on');

    var html = '<!DOCTYPE html>\n' + clone.outerHTML;
    var blob = new Blob([html], { type: 'text/html' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = pageName.replace(/\.html$/i, '') + '-edited.html';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  loadServerEdits().then(function() {
    setupEditables();
    setupRemovables();
    setEditMode(false);

    editToggle.addEventListener('click', function() {
      setEditMode(!body.classList.contains('editor-on'));
    });

    exportButton.addEventListener('click', exportHtml);

    showHiddenButton.addEventListener('click', function() {
      hiddenBlocks = [];
      localStorage.removeItem(hiddenKey);
      persistEdits();
      document.querySelectorAll('.editor-hidden').forEach(function(el) {
        el.classList.remove('editor-hidden');
      });
      status.textContent = 'Hidden blocks restored';
    });

    resetButton.addEventListener('click', function() {
      if (!confirm('Clear browser edits and restore the original page copy/blocks?')) return;
      localStorage.removeItem(textKey);
      localStorage.removeItem(hiddenKey);
      clearServerEdits();
      window.location.reload();
    });

    document.addEventListener('click', function(event) {
      if (!body.classList.contains('editor-on')) return;
      var link = event.target.closest('a[href]');
      if (link && !link.closest('[data-editor-ui]')) {
        event.preventDefault();
      }
    }, true);

    document.querySelectorAll('a[href^="#"]').forEach(function(link) {
      link.addEventListener('click', function(event) {
        if (body.classList.contains('editor-on')) {
          event.preventDefault();
          return;
        }
        var id = link.getAttribute('href').slice(1);
        var target = document.getElementById(id);
        if (!target) return;

        event.preventDefault();
        var nav = document.querySelector('.nav');
        var offset = (nav ? nav.offsetHeight : 0) + 18;
        var top = target.getBoundingClientRect().top + window.pageYOffset - offset;
        window.scrollTo({ top: top, behavior: 'smooth' });
        history.pushState(null, '', '#' + id);
      });
    });
  });
})();
