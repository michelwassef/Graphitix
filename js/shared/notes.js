// Shared notes helper for foldable per-workspace notes blocks
(function(global){
  'use strict';

  const Shared = global.Shared = global.Shared || {};
  const notes = Shared.notes = Shared.notes || {};
  if(notes.__installed){
    return;
  }
  notes.__installed = true;

  const INSTANCE_SYMBOL = '__sharedNotesControl';

  function isDebugEnabled(){
    return typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled();
  }

  function debugLog(message, payload){
    if(!isDebugEnabled()){
      return;
    }
    if(typeof payload === 'undefined'){
      console.debug(message);
      return;
    }
    console.debug(message, payload);
  }

  function resolveElement(target, doc){
    if(!target){
      return null;
    }
    if(typeof target === 'string'){
      return (doc || global.document).querySelector(target);
    }
    return target && target.nodeType === 1 ? target : null;
  }

  function findByNotesId(container, id){
    if(!container || !id){
      return null;
    }
    const candidates = container.querySelectorAll('[data-notes-id]');
    for(let i = 0; i < candidates.length; i += 1){
      const node = candidates[i];
      if(String(node.dataset.notesId || '') === id){
        return node;
      }
    }
    return null;
  }

  function asString(value){
    return value == null ? '' : String(value);
  }

  function createNotesEditor(doc, opts, richText){
    if(richText){
      const editor = doc.createElement('div');
      editor.className = 'shared-notes__editor allow-text-selection';
      editor.setAttribute('contenteditable', 'true');
      editor.setAttribute('role', 'textbox');
      editor.setAttribute('aria-multiline', 'true');
      editor.dataset.notesEditor = '1';
      editor.spellcheck = true;
      editor.dataset.placeholder = asString(opts.placeholder || 'Write notes about this analysis...');
      editor.innerHTML = asString(opts.value);
      return editor;
    }
    const editor = doc.createElement('textarea');
    editor.className = 'shared-notes__textarea';
    editor.placeholder = asString(opts.placeholder || 'Write notes about this analysis...');
    editor.spellcheck = true;
    editor.value = asString(opts.value);
    return editor;
  }

  notes.mountFoldable = function mountFoldable(options){
    const opts = options || {};
    const doc = opts.document || global.document;
    const container = resolveElement(opts.container, doc);
    if(!container || !doc){
      debugLog('Debug: Shared.notes.mountFoldable skipped', {
        hasContainer: !!container,
        hasDocument: !!doc
      });
      return null;
    }

    const id = opts.id ? String(opts.id) : '';
    const richText = opts.richText !== false;
    const scopeId = opts.scopeId ? String(opts.scopeId) : null;
    const fontKey = opts.fontKey ? String(opts.fontKey) : (id || 'notes');

    const existing = id ? findByNotesId(container, id) : null;
    if(existing && existing[INSTANCE_SYMBOL] && typeof existing[INSTANCE_SYMBOL].destroy === 'function'){
      existing[INSTANCE_SYMBOL].destroy();
    }else if(existing){
      try{
        existing.remove();
      }catch(err){
        console.error('Shared.notes existing remove error', err);
      }
    }

    const details = doc.createElement('details');
    details.className = `shared-notes${opts.className ? ` ${opts.className}` : ''}`;
    details.open = !!opts.open;
    if(id){
      details.dataset.notesId = id;
    }

    const summary = doc.createElement('summary');
    summary.className = 'shared-notes__summary';
    summary.textContent = asString(opts.title || 'Notes');
    details.appendChild(summary);

    const body = doc.createElement('div');
    body.className = 'shared-notes__body';
    details.appendChild(body);

    const editor = createNotesEditor(doc, opts, richText);
    body.appendChild(editor);

    const readValue = () => (richText ? editor.innerHTML : editor.value);
    const writeValue = value => {
      const next = asString(value);
      if(richText){
        editor.innerHTML = next;
      }else{
        editor.value = next;
      }
    };
    const getUndoScope = () => {
      const explicit = opts.undoScope ? String(opts.undoScope) : '';
      if(explicit){
        return explicit;
      }
      const panel = editor.closest ? editor.closest('.panel') : null;
      return panel?.id || null;
    };

    let destroyed = false;
    let toolbarOpenQueued = false;
    let pointerDown = false;
    let markedForFont = false;
    let suppressUndoRecord = false;
    let lastSnapshot = readValue();
    let mutationObserver = null;
    let mutationScheduled = false;

    const ensureMarkedForFont = () => {
      if(!richText || markedForFont){
        return;
      }
      const fontControls = Shared.fontControls;
      if(!fontControls || typeof fontControls.markText !== 'function'){
        return;
      }
      try{
        fontControls.markText(editor, { scopeId, role: 'notes', key: fontKey });
        markedForFont = true;
        debugLog('Debug: Shared.notes font mark applied', { scopeId, fontKey });
      }catch(err){
        console.error('Shared.notes font mark error', err);
      }
    };

    const openFontToolbar = (reason) => {
      if(!richText || destroyed){
        return;
      }
      const fontControls = Shared.fontControls;
      if(!fontControls || typeof fontControls.openForElement !== 'function'){
        return;
      }
      ensureMarkedForFont();
      try{
        fontControls.openForElement(editor, { scopeId, key: fontKey });
        if(scopeId && Shared.workspaceToolbar && typeof Shared.workspaceToolbar.activateSection === 'function'){
          Shared.workspaceToolbar.activateSection(scopeId, 'Format');
        }
        debugLog('Debug: Shared.notes font toolbar opened', { scopeId, fontKey, reason });
      }catch(err){
        console.error('Shared.notes font toolbar open error', err);
      }
    };

    const queueFontToolbarOpen = (reason) => {
      if(!richText || toolbarOpenQueued || destroyed){
        return;
      }
      toolbarOpenQueued = true;
      const scheduler = typeof global.requestAnimationFrame === 'function'
        ? global.requestAnimationFrame.bind(global)
        : (cb) => global.setTimeout(cb, 0);
      scheduler(() => {
        toolbarOpenQueued = false;
        if(destroyed || !editor.isConnected){
          return;
        }
        const isFocused = doc.activeElement === editor || (editor.contains && editor.contains(doc.activeElement));
        if(!isFocused || pointerDown){
          return;
        }
        openFontToolbar(reason);
      });
    };

    const emitChange = () => {
      if(typeof opts.onChange === 'function'){
        try{
          opts.onChange(readValue());
        }catch(err){
          console.error('Shared.notes onChange error', err);
        }
      }
    };
    const recordUndoIfChanged = (reason) => {
      const next = readValue();
      const previous = asString(lastSnapshot);
      if(next === previous){
        return;
      }
      const undoManager = Shared.undoManager || null;
      if(!suppressUndoRecord && undoManager && typeof undoManager.recordStateChange === 'function'){
        const scope = getUndoScope();
        undoManager.recordStateChange({
          label: `notes:${id || fontKey || 'notes'}`,
          scope,
          from: previous,
          to: next,
          equals: (a, b) => String(a) === String(b),
          apply: (value) => {
            suppressUndoRecord = true;
            writeValue(value);
            suppressUndoRecord = false;
            lastSnapshot = readValue();
            emitChange();
            return true;
          }
        });
      }
      lastSnapshot = next;
      emitChange();
      debugLog('Debug: Shared.notes change captured', { id: id || null, reason: reason || 'unknown' });
    };
    const scheduleMutationCapture = () => {
      if(mutationScheduled || destroyed){
        return;
      }
      mutationScheduled = true;
      const scheduler = typeof global.requestAnimationFrame === 'function'
        ? global.requestAnimationFrame.bind(global)
        : (cb) => global.setTimeout(cb, 0);
      scheduler(() => {
        mutationScheduled = false;
        if(destroyed){
          return;
        }
        recordUndoIfChanged('mutation');
      });
    };
    const onInput = () => {
      recordUndoIfChanged('input');
    };
    editor.addEventListener('input', onInput);

    const onToggle = () => {
      if(typeof opts.onToggle === 'function'){
        try{
          opts.onToggle(!!details.open);
        }catch(err){
          console.error('Shared.notes onToggle error', err);
        }
      }
      debugLog('Debug: Shared.notes.toggle', { id: id || null, open: !!details.open });
    };
    details.addEventListener('toggle', onToggle);

    let onGlobalPointerUp = null;
    if(richText){
      ensureMarkedForFont();
      editor.addEventListener('focus', () => {
        queueFontToolbarOpen('focus');
      });
      editor.addEventListener('mousedown', () => {
        pointerDown = true;
      });
      onGlobalPointerUp = () => {
        pointerDown = false;
        const isFocused = doc.activeElement === editor || (editor.contains && editor.contains(doc.activeElement));
        if(isFocused){
          queueFontToolbarOpen('pointerup');
        }
      };
      global.addEventListener('pointerup', onGlobalPointerUp, true);
      if(typeof global.MutationObserver === 'function'){
        mutationObserver = new global.MutationObserver(() => {
          scheduleMutationCapture();
        });
        try{
          mutationObserver.observe(editor, {
            childList: true,
            subtree: true,
            characterData: true,
            attributes: true,
            attributeFilter: ['style', 'class']
          });
        }catch(err){
          console.error('Shared.notes mutation observer attach error', err);
          mutationObserver = null;
        }
      }
    }

    container.appendChild(details);

    const control = {
      root: details,
      details,
      editor,
      getValue: readValue,
      setValue: value => {
        writeValue(value);
        lastSnapshot = readValue();
        emitChange();
      },
      isOpen: () => !!details.open,
      setOpen: open => { details.open = !!open; },
      focus: () => { editor.focus(); },
      destroy: () => {
        if(destroyed){
          return;
        }
        destroyed = true;
        try{
          editor.removeEventListener('input', onInput);
        }catch(err){
          console.error('Shared.notes input cleanup error', err);
        }
        try{
          details.removeEventListener('toggle', onToggle);
        }catch(err){
          console.error('Shared.notes toggle cleanup error', err);
        }
        if(mutationObserver){
          try{
            mutationObserver.disconnect();
          }catch(err){
            console.error('Shared.notes observer cleanup error', err);
          }
          mutationObserver = null;
        }
        if(onGlobalPointerUp){
          try{
            global.removeEventListener('pointerup', onGlobalPointerUp, true);
          }catch(err){
            console.error('Shared.notes pointer cleanup error', err);
          }
          onGlobalPointerUp = null;
        }
        try{
          details.remove();
        }catch(err){
          console.error('Shared.notes destroy error', err);
        }
      }
    };
    details[INSTANCE_SYMBOL] = control;

    debugLog('Debug: Shared.notes mounted', {
      id: id || null,
      open: !!details.open,
      richText,
      scopeId: scopeId || null
    });

    return control;
  };
})(typeof window !== 'undefined' ? window : globalThis);
