(function(global){
  'use strict';
  const Shared = global.Shared = global.Shared || {};
  const pendingFocus = new WeakMap();

  function captureFocus(host){
    const node = host.ownerDocument.activeElement;
    const root = host.contains(node) ? node.closest?.('.stats-advisor') : null;
    if(!root){ return null; }
    const focus = { key: node.dataset.advisorQuestion || node.name || node.textContent,
      value: node.value, radio: node.type === 'radio', tabId: root.dataset.ownerTabId };
    pendingFocus.set(host, focus);
    return focus;
  }

  function canApply(plan){
    return plan?.ready === true && plan.canApply !== false;
  }

  // A projection owns no durable state. Retired DOM, inactive owners and state
  // replaced by hydration cannot execute an old callback against a new owner.
  function begin({ host, component, tabId, advisor, getAdvisor, isActive }){
    const savedFocus = captureFocus(host) || pendingFocus.get(host);
    pendingFocus.delete(host);
    const focus = savedFocus?.tabId === String(tabId) ? savedFocus : null;
    let projection = null;
    const current = () => isActive() && getAdvisor() === advisor;
    const isCurrent = () => current() && !!projection?.isConnected && host.contains(projection);
    return {
      isCurrent,
      finish(root){
        projection = root;
        root.dataset.ownerTabId = tabId;
        if(!root.querySelector('.stats-advisor__scope-note')){
          const scopeNote = root.ownerDocument.createElement('p');
          scopeNote.className = 'stats-advisor__scope-note';
          scopeNote.textContent = 'Plan sample size and statistical power before collecting data. This guide recommends an analysis but does not calculate either.';
          root.appendChild(scopeNote);
        }
        const bodyId = `${component}-advisor-${tabId}-body`;
        const summary = root.querySelector('.stats-advisor__summary');
        if(summary){
          summary.id = `${bodyId}-summary`;
          summary.setAttribute('role', 'status');
        }
        const questions = root.querySelector('.stats-advisor__questions');
        if(questions){ questions.id = bodyId; }
        const toggle = root.querySelector('.stats-advisor__toggle');
        const controlledId = questions?.id || summary?.id || bodyId;
        if(toggle){ toggle.setAttribute('aria-controls', controlledId); }
        root.querySelectorAll('input[type="radio"]').forEach(input => {
          const key = input.dataset.advisorQuestion || input.name;
          input.dataset.advisorQuestion = key;
          input.name = `${key}-${tabId}`;
        });
        root.querySelectorAll('.stats-advisor__actions button').forEach(button => {
          if(summary){ button.setAttribute('aria-describedby', summary.id); }
        });
        if(focus && current()){
          const target = [...root.querySelectorAll('input, button')].find(node =>
            focus.radio
              ? node.dataset.advisorQuestion === focus.key && node.value === focus.value
              : node.textContent === focus.key);
          (target && !target.disabled ? target : toggle)?.focus({ preventScroll: true });
        }
      },
      // Resolve once, synchronously, from current owner data. Commit receives
      // that exact plan; it must patch the session before projecting its UI.
      apply({ readContext, decide, commit, refresh }){
        if(!isCurrent()){ return false; }
        const context = readContext();
        const plan = decide(advisor.answers, context);
        if(!canApply(plan)){ refresh(context); return false; }
        commit(plan, context);
        return true;
      }
    };
  }

  Shared.statsAdvisor = Object.freeze({ begin, canApply, captureFocus });
})(typeof window !== 'undefined' ? window : globalThis);
