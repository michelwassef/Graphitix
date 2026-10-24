(function(global){
  'use strict';

  const Shared = global.Shared = global.Shared || {};
  const controllers = new WeakMap();
  let openController = null;
  let documentListenersAttached = false;

  function isInside(controller, target){
    return !!target && (
      controller.trigger.contains(target)
      || controller.menu.contains(target)
    );
  }

  function syncController(controller){
    const labels = Array.from(controller.menu.querySelectorAll('input[type="checkbox"][data-checkbox-dropdown-label]'))
      .filter(input => input.checked)
      .map(input => input.dataset.checkboxDropdownLabel)
      .filter(Boolean);
    controller.summary.textContent = labels.length
      ? `${controller.emptyLabel} (${labels.length})`
      : controller.emptyLabel;
  }

  function closeController(controller, options = {}){
    if(!controller || controller.menu.hidden){
      return false;
    }
    controller.menu.hidden = true;
    controller.trigger.setAttribute('aria-expanded', 'false');
    if(openController === controller){
      openController = null;
    }
    if(options.restoreFocus && controller.trigger.isConnected && !controller.trigger.disabled){
      controller.trigger.focus();
    }
    return true;
  }

  function focusOption(controller, edge = 'first'){
    const inputs = Array.from(controller.menu.querySelectorAll('input[type="checkbox"]'))
      .filter(input => !input.disabled && !input.closest('[hidden]'));
    const target = edge === 'last' ? inputs[inputs.length - 1] : inputs[0];
    if(!target){
      return false;
    }
    target.focus();
    return true;
  }

  function openControllerMenu(controller, options = {}){
    if(!controller || controller.trigger.disabled){
      return false;
    }
    if(openController && openController !== controller){
      closeController(openController);
    }
    controller.menu.hidden = false;
    controller.trigger.setAttribute('aria-expanded', 'true');
    openController = controller;
    if(options.focus !== false){
      focusOption(controller, options.focus === 'last' ? 'last' : 'first');
    }
    return true;
  }

  function attachDocumentListeners(doc){
    if(documentListenersAttached || !doc){
      return;
    }
    documentListenersAttached = true;
    doc.addEventListener('pointerdown', event => {
      if(openController && !isInside(openController, event.target)){
        closeController(openController);
      }
    }, true);
    doc.addEventListener('focusin', event => {
      if(openController && !isInside(openController, event.target)){
        closeController(openController);
      }
    }, true);
  }

  function attach(trigger, menu, options = {}){
    if(!trigger || trigger.nodeType !== 1 || !menu || menu.nodeType !== 1){
      return null;
    }
    const existing = controllers.get(trigger);
    if(existing){
      syncController(existing);
      return true;
    }
    const summary = trigger.querySelector('[data-checkbox-dropdown-summary]');
    if(!summary){
      return null;
    }
    trigger.dataset.sessionIgnoreDirty = '1';

    const controller = {
      trigger,
      menu,
      summary,
      emptyLabel: String(options.emptyLabel || trigger.dataset.checkboxDropdownEmptyLabel || 'Options')
    };
    const onTriggerClick = event => {
      event.preventDefault();
      if(menu.hidden){
        openControllerMenu(controller, { focus: event.detail === 0 });
      }else{
        closeController(controller);
      }
    };
    const onTriggerKeyDown = event => {
      if(event.key === 'ArrowDown' || event.key === 'ArrowUp'){
        event.preventDefault();
        openControllerMenu(controller, { focus: event.key === 'ArrowUp' ? 'last' : 'first' });
      }
    };
    const onMenuKeyDown = event => {
      if(event.key === 'Escape'){
        event.preventDefault();
        closeController(controller, { restoreFocus: true });
      }
    };
    const onMenuPointerDown = event => {
      if(event.button === 0 && !event.target?.closest?.('input[type="checkbox"]')){
        // Keep pointer focus inside the disclosure until the label's native click
        // activates its checkbox. Otherwise the focusable workspace ancestor gains
        // focus first and outside-focus dismissal hides the label before click.
        event.preventDefault();
      }
    };
    const onMenuChange = () => syncController(controller);

    trigger.addEventListener('click', onTriggerClick);
    trigger.addEventListener('keydown', onTriggerKeyDown);
    menu.addEventListener('keydown', onMenuKeyDown);
    menu.addEventListener('pointerdown', onMenuPointerDown);
    menu.addEventListener('change', onMenuChange);
    attachDocumentListeners(trigger.ownerDocument || global.document);

    controllers.set(trigger, controller);
    syncController(controller);
    return true;
  }

  function sync(trigger){
    const controller = controllers.get(trigger);
    if(!controller){
      return false;
    }
    syncController(controller);
    return true;
  }

  function closeAll(options = {}){
    return closeController(openController, options);
  }

  Shared.checkboxDropdown = Object.freeze({ attach, sync, closeAll });
})(typeof window !== 'undefined' ? window : globalThis);
