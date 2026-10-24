(function(global){
  'use strict';

  const Shared = global.Shared = global.Shared || {};

  function isAvailableOption(option){
    if(!option || option.disabled || option.hidden){
      return false;
    }
    if(option.getAttribute?.('aria-disabled') === 'true'
      || option.getAttribute?.('aria-hidden') === 'true'){
      return false;
    }
    return !option.closest?.('[hidden], [aria-hidden="true"]');
  }

  function toOptions(source, selector){
    return Array.isArray(source)
      ? source
      : (source && typeof source.querySelectorAll === 'function'
        ? Array.from(source.querySelectorAll(selector || '[role="option"]'))
        : (source && typeof source.length === 'number' ? Array.from(source) : []));
  }

  function getOptions(source, selector){
    return toOptions(source, selector).filter(isAvailableOption);
  }

  function moveActive(optionsSource, current, delta, config = {}){
    const options = getOptions(optionsSource);
    if(!options.length){
      return null;
    }
    const direction = Number(delta) < 0 ? -1 : 1;
    const currentIndex = options.indexOf(current);
    if(currentIndex < 0){
      return direction > 0 ? options[0] : options[options.length - 1];
    }
    const nextIndex = currentIndex + direction;
    if(config.wrap === true){
      return options[(nextIndex + options.length) % options.length];
    }
    return options[Math.max(0, Math.min(options.length - 1, nextIndex))];
  }

  function getEdge(optionsSource, edge){
    const options = getOptions(optionsSource);
    if(!options.length){
      return null;
    }
    return edge === 'last' ? options[options.length - 1] : options[0];
  }

  function setActive(input, optionsSource, activeOption, config = {}){
    const allOptions = toOptions(optionsSource, config.selector);
    const options = allOptions.filter(isAvailableOption);
    const expanded = config.expanded === true;
    const active = options.includes(activeOption) && activeOption.id
      ? activeOption
      : null;
    const activeClass = typeof config.activeClass === 'string' ? config.activeClass : '';

    allOptions.forEach(option => {
      const isActive = option === active;
      option.setAttribute?.('aria-selected', isActive ? 'true' : 'false');
      if(activeClass){
        option.classList?.toggle(activeClass, isActive);
      }
    });

    if(input){
      input.setAttribute?.('aria-expanded', expanded ? 'true' : 'false');
      if(expanded && active){
        input.setAttribute?.('aria-activedescendant', active.id);
      }else{
        input.removeAttribute?.('aria-activedescendant');
      }
    }
    if(expanded && active && config.scroll !== false && typeof active.scrollIntoView === 'function'){
      active.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
    return active;
  }

  Shared.editableCombobox = Object.freeze({
    getOptions,
    moveActive,
    getEdge,
    setActive
  });
})(typeof window !== 'undefined' ? window : globalThis);
