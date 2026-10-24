(function(global){
  'use strict';

  const Shared = global.Shared = global.Shared || {};
  const namespace = Shared.themeRuntime = Shared.themeRuntime || {};
  const NO_PREVIOUS_FILL = '__none__';
  const observers = new WeakMap();
  const SVG_PAINT_NODES = 'circle,ellipse,rect,path,polygon,polyline,line,g[stroke],g[fill],g[style],stop[data-quantitative-ramp="1"]';
  const PAINT_KEYS = ['fill', 'stroke', 'stop-color'];
  const MIN_MARK_CONTRAST = 3;
  const MIN_RAMP_CONTRAST = 4;

  function removeNode(node){
    if(node?.parentNode) node.parentNode.removeChild(node);
  }

  function rgb(color){
    if(typeof color !== 'string') return null;
    const value = color.trim().toLowerCase();
    const names = {black: '#000000', white: '#ffffff'};
    const hex = names[value] || value;
    const match = /^#([\da-f]{3}|[\da-f]{6})$/.exec(hex);
    if(match){
      const full = match[1].length === 3
        ? match[1].split('').map(c => c + c).join('') : match[1];
      return [0,2,4].map(i => Number.parseInt(full.slice(i, i + 2), 16));
    }
    const functional = /^rgba?\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})(?:\s*[,/]\s*([\d.]+))?\s*\)$/.exec(value);
    if(!functional || (functional[4] !== undefined && Number(functional[4]) < 1)) return null;
    const channels = functional.slice(1,4).map(Number);
    return channels.every(n => n >= 0 && n <= 255) ? channels : null;
  }

  function samePaint(left, right){
    if(left === right) return true;
    if(typeof left !== 'string' || typeof right !== 'string') return false;
    const lhs = rgb(left);
    const rhs = rgb(right);
    return !!(lhs && rhs && lhs.every((value, index) => value === rhs[index]));
  }

  function isDefaultDarkText(color){
    if(!color) return true;
    const channels = rgb(color);
    return !!channels && Math.max(...channels) === Math.min(...channels) && channels[0] <= 51;
  }

  function readableNeutral(color){
    const channels = rgb(color);
    if(!channels || Math.max(...channels) !== Math.min(...channels) || channels[0] > 88) return null;
    const value = 235 - channels[0];
    return `#${value.toString(16).padStart(2, '0').repeat(3)}`;
  }

  function linearChannel(value){
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  }

  function relativeLuminance(channels){
    return 0.2126 * linearChannel(channels[0])
      + 0.7152 * linearChannel(channels[1])
      + 0.0722 * linearChannel(channels[2]);
  }

  function contrastRatio(left, right){
    const first = relativeLuminance(left);
    const second = relativeLuminance(right);
    return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
  }

  function encodeChannel(value){
    const encoded = value <= 0.0031308 ? value * 12.92 : 1.055 * (value ** (1 / 2.4)) - 0.055;
    return Math.max(0, Math.min(255, Math.round(encoded * 255)));
  }

  function mixWithWhite(color, amount){
    const amountClamped = Math.max(0, Math.min(1, amount));
    return color.map(channel => encodeChannel(linearChannel(channel) * (1 - amountClamped) + amountClamped));
  }

  function toHex(channels){
    return `#${channels.map(channel => Math.round(channel).toString(16).padStart(2, '0')).join('')}`;
  }

  function contrastForOpacity(color, background, opacity){
    const alpha = Math.max(0, Math.min(1, opacity));
    const visible = color.map((channel, index) => encodeChannel(
      linearChannel(channel) * alpha + linearChannel(background[index]) * (1 - alpha)
    ));
    return contrastRatio(visible, background);
  }

  function contrastLift(color, background, minimum, opacity = 1){
    if(contrastForOpacity(color, background, opacity) >= minimum) return 0;
    if(contrastForOpacity([255, 255, 255], background, opacity) < minimum) return 1;
    let low = 0;
    let high = 1;
    for(let index = 0; index < 12; index += 1){
      const middle = (low + high) / 2;
      if(contrastForOpacity(mixWithWhite(color, middle), background, opacity) >= minimum) high = middle;
      else low = middle;
    }
    return high;
  }

  function createAppearanceAdapter(appearance){
    const source = appearance && typeof appearance === 'object' ? appearance : {};
    const isDark = source.isDark === true;
    const background = rgb(source.background || source.backgroundColor || source.tokens?.background || '#ffffff');
    // One linear-light lift preserves the relative order of every ramp color.
    const quantitativeLift = isDark && background
      ? contrastLift([0, 0, 0], background, MIN_RAMP_CONTRAST)
      : 0;
    return {
      isDark,
      background: background ? toHex(background) : '#ffffff',
      resolvePaint(color, role = 'mark', opacity = 1){
        if(!isDark || typeof color !== 'string') return color;
        const channels = rgb(color);
        if(!channels || !background) return color;
        const lift = role === 'quantitative'
          ? quantitativeLift
          : (role === 'mark' ? contrastLift(channels, background, MIN_MARK_CONTRAST, opacity) : 0);
        return lift > 0 ? toHex(mixWithWhite(channels, lift)) : color;
      },
      resolveTextColor(fill){
        const channels = rgb(fill);
        if(!channels) return '#ffffff';
        const blackContrast = contrastRatio(channels, [0, 0, 0]);
        const whiteContrast = contrastRatio(channels, [255, 255, 255]);
        return whiteContrast >= blackContrast ? '#ffffff' : '#000000';
      }
    };
  }

  function originalPaint(node, key){
    const raw = node.getAttribute(key);
    const inline = node.style?.getPropertyValue(key) || '';
    return { raw, inline };
  }

  // Render-only paint adaptation. The canonical value remains in the payload and
  // in the SVG's original-paint attribute; edits made while dark is active win.
  function applyPaint(node, key, next){
    const marker = `data-appearance-${key}-themed`;
    const previous = `data-appearance-${key}-original`;
    const previousInline = `data-appearance-${key}-inline`;
    const last = `data-appearance-${key}-applied`;
    const current = originalPaint(node, key);
    if(node.getAttribute(marker) === '1'){
      if(!samePaint(current.raw, node.getAttribute(last)) && !samePaint(current.inline, node.getAttribute(last))){
        // This is a real paint edit, not a theme redraw. Rebase on the edit.
        node.removeAttribute(marker);
        node.removeAttribute(previous);
        node.removeAttribute(previousInline);
        node.removeAttribute(last);
      }else{
        if(!samePaint(current.raw, next)) node.setAttribute(key, next);
        if(current.inline && !samePaint(current.inline, next)) node.style.setProperty(key, next);
        node.setAttribute(last, next);
        return;
      }
    }
    if(!next || (!current.raw && !current.inline)) return;
    node.setAttribute(previous, current.raw === null ? NO_PREVIOUS_FILL : current.raw);
    node.setAttribute(previousInline, current.inline || NO_PREVIOUS_FILL);
    node.setAttribute(marker, '1');
    node.setAttribute(last, next);
    node.setAttribute(key, next);
    if(current.inline) node.style.setProperty(key, next);
  }

  // When a color is edited while Dark is active, undo only the old display
  // projection. Keep the changed paint as the new user value.
  function rebaseEditedPaint(node, key){
    const prefix = `data-appearance-${key}-`;
    if(node.getAttribute(`${prefix}themed`) !== '1') return false;
    const last = node.getAttribute(`${prefix}applied`);
    const originalInline = node.getAttribute(`${prefix}inline`);
    const expectedInline = originalInline === NO_PREVIOUS_FILL ? '' : last;
    const current = originalPaint(node, key);
    if(samePaint(current.raw, last) && samePaint(current.inline, expectedInline)) return false;
    const originalRaw = node.getAttribute(`${prefix}original`);
    if(samePaint(current.raw, last)){
      if(originalRaw === NO_PREVIOUS_FILL) node.removeAttribute(key);
      else if(originalRaw !== null) node.setAttribute(key, originalRaw);
    }
    if(samePaint(current.inline, expectedInline)){
      if(originalInline === NO_PREVIOUS_FILL) node.style?.removeProperty(key);
      else if(originalInline !== null) node.style?.setProperty(key, originalInline);
    }
    ['themed','original','inline','applied'].forEach(part => node.removeAttribute(`${prefix}${part}`));
    return true;
  }

  function restorePaint(svg){
    PAINT_KEYS.forEach(key => {
      svg.querySelectorAll(`[data-appearance-${key}-themed="1"]`).forEach(node => {
        if(rebaseEditedPaint(node, key)) return;
        const last = node.getAttribute(`data-appearance-${key}-applied`);
        const current = originalPaint(node, key);
        // A user modification supersedes a previous theme-generated value.
        if(samePaint(current.raw, last) || samePaint(current.inline, last)){
          const raw = node.getAttribute(`data-appearance-${key}-original`);
          const inline = node.getAttribute(`data-appearance-${key}-inline`);
          if(raw === NO_PREVIOUS_FILL) node.removeAttribute(key);
          else if(raw !== null) node.setAttribute(key, raw);
          if(inline === NO_PREVIOUS_FILL) node.style?.removeProperty(key);
          else if(inline !== null) node.style?.setProperty(key, inline);
        }
        ['themed','original','inline','applied'].forEach(part => node.removeAttribute(`data-appearance-${key}-${part}`));
      });
    });
  }

  // Explicit annotations can have deliberately chosen colors. Only inherited
  // text and the usual default black paints belong to the appearance layer.
  function applyDarkTextNode(node, color, adapter){
    const cellFill = node.getAttribute('data-heatmap-cell-fill');
    const resolvedColor = cellFill && adapter
      ? adapter.resolveTextColor(adapter.resolvePaint(cellFill, 'quantitative'))
      : color;
    if(node.getAttribute('data-color-scheme-text-themed') === '1'){
      const applied = node.getAttribute('data-color-scheme-applied-fill');
      if(applied && node.getAttribute('fill') !== applied){
        ['data-color-scheme-text-themed','data-color-scheme-prev-fill','data-color-scheme-applied-fill'].forEach(attr => node.removeAttribute(attr));
        return;
      }
      if(node.getAttribute('fill') !== resolvedColor) node.setAttribute('fill', resolvedColor);
      node.setAttribute('data-color-scheme-applied-fill', resolvedColor);
      return;
    }
    if(!cellFill && !isDefaultDarkText(node.getAttribute('fill'))) return;
    node.setAttribute('data-color-scheme-prev-fill', node.hasAttribute('fill')
      ? node.getAttribute('fill') : NO_PREVIOUS_FILL);
    node.setAttribute('data-color-scheme-text-themed', '1');
    node.setAttribute('data-color-scheme-applied-fill', resolvedColor);
    node.setAttribute('fill', resolvedColor);
  }

  function applyDarkTextTheme(svg, color, adapter){
    svg.querySelectorAll('text,tspan').forEach(node => applyDarkTextNode(node, color, adapter));
  }

  function restoreTextTheme(svg){
    svg.querySelectorAll('text[data-color-scheme-text-themed="1"],tspan[data-color-scheme-text-themed="1"]').forEach(node => {
      const applied = node.getAttribute('data-color-scheme-applied-fill');
      if(node.getAttribute('fill') === applied){
        const previous = node.getAttribute('data-color-scheme-prev-fill');
        if(previous === NO_PREVIOUS_FILL || previous === null) node.removeAttribute('fill');
        else node.setAttribute('fill', previous);
      }
      ['data-color-scheme-text-themed','data-color-scheme-prev-fill','data-color-scheme-applied-fill'].forEach(attr => node.removeAttribute(attr));
    });
  }

  function quantitativePaintRole(node, componentType, key){
    if(key === 'stop-color'){
      return node.getAttribute('data-quantitative-ramp') === '1' ? 'quantitative' : null;
    }
    if(key === 'fill' && componentType === 'heatmap'
      && node.nodeName.toLowerCase() === 'rect'
      && node.closest?.('[data-layer="cells"]')
      && !node.closest?.('[data-heatmap-cell-hit-layer="1"]')){
      return 'quantitative';
    }
    if(key === 'fill' && componentType === 'surface'
      && node.closest?.('.surface-faces,.surface-points')){
      return 'quantitative';
    }
    if((key === 'fill' || key === 'stroke') && node.closest?.('[data-dark-appearance-mark="1"]')){
      return 'mark';
    }
    return null;
  }

  function isBackgroundRect(node){
    if(node.nodeName.toLowerCase() !== 'rect') return false;
    if(node.closest?.('[data-layer="background"],.background,[data-graph-background]')) return true;
    const svg = node.ownerSVGElement;
    if(!svg) return false;
    const view = svg.viewBox?.baseVal;
    const width = Number(view?.width) || Number.parseFloat(svg.getAttribute('width')) || 0;
    const height = Number(view?.height) || Number.parseFloat(svg.getAttribute('height')) || 0;
    const rectWidth = Number.parseFloat(node.getAttribute('width')) || 0;
    const rectHeight = Number.parseFloat(node.getAttribute('height')) || 0;
    return width > 0 && height > 0 && rectWidth >= width * 0.95 && rectHeight >= height * 0.95;
  }

  function applyDarkShapeNode(node, componentType, adapter){
    const rampStop = node.nodeName.toLowerCase() === 'stop'
      && node.getAttribute('data-quantitative-ramp') === '1';
    if(node.closest?.('[data-preview-bg],[data-color-scheme-background],[data-plot3d-panes="1"]')
      || (!rampStop && node.closest?.('defs'))){ return; }
    const hasSemanticRole = PAINT_KEYS.some(key => quantitativePaintRole(node, componentType, key));
    if(!hasSemanticRole && isBackgroundRect(node)) return;
    PAINT_KEYS.forEach(key => {
      if(key === 'fill' && node.nodeName.toLowerCase() === 'line') return;
      rebaseEditedPaint(node, key);
      const color = originalPaint(node, key);
      // When this node has already been themed, use the source value; repeated
      // draws/syncs must not compound the contrast operation.
      const original = node.getAttribute(`data-appearance-${key}-themed`) === '1'
        ? node.getAttribute(`data-appearance-${key}-original`)
        : (color.inline || color.raw);
      const role = quantitativePaintRole(node, componentType, key);
      const opacityKey = key === 'stop-color' ? 'stop-opacity' : `${key}-opacity`;
      const opacityValue = Number(node.getAttribute(opacityKey)
        || node.style?.getPropertyValue(opacityKey) || 1);
      const adapted = role && adapter
        ? adapter.resolvePaint(original, role, opacityValue)
        : (key === 'stop-color' ? null : readableNeutral(original));
      if(adapted) applyPaint(node, key, adapted);
    });
  }

  function applyDarkShapes(svg, componentType, adapter){
    svg.querySelectorAll(SVG_PAINT_NODES).forEach(node => applyDarkShapeNode(node, componentType, adapter));
  }

  function disconnectObserver(svg){
    const entry = observers.get(svg);
    if(entry){ entry.observer.disconnect(); observers.delete(svg); }
  }

  function ensureObserver(svg, state){
    if(typeof global.MutationObserver !== 'function') return;
    const existing = observers.get(svg);
    if(existing){ existing.state = state; return; }
    const entry = {state, observer: null};
    const observer = new global.MutationObserver(mutations => {
      for(const mutation of mutations){
        if(mutation.type === 'childList'){
          mutation.addedNodes.forEach(node => {
            if(node.nodeType !== 1) return;
            if(node.matches?.('text,tspan')) applyDarkTextNode(node, entry.state.textColor, entry.state.adapter);
            node.querySelectorAll?.('text,tspan').forEach(text => applyDarkTextNode(text, entry.state.textColor, entry.state.adapter));
            if(node.matches?.(SVG_PAINT_NODES)) applyDarkShapeNode(node, entry.state.componentType, entry.state.adapter);
            node.querySelectorAll?.(SVG_PAINT_NODES).forEach(mark => applyDarkShapeNode(mark, entry.state.componentType, entry.state.adapter));
          });
        }else if(mutation.type === 'attributes'){
          const node = mutation.target;
          if(node.matches?.('text,tspan')) applyDarkTextNode(node, entry.state.textColor, entry.state.adapter);
          else if(node.matches?.(SVG_PAINT_NODES)) applyDarkShapeNode(node, entry.state.componentType, entry.state.adapter);
        }
      }
    });
    observer.observe(svg, {subtree: true, childList: true, attributes: true, attributeFilter: ['fill','stroke','stop-color','style']});
    entry.observer = observer;
    observers.set(svg, entry);
  }

  function applySvgTheme(svg, scheme, options = {}){
    if(!svg || !scheme) return;
    const tokens = scheme.tokens || {};
    const isDark = scheme.appearance === 'dark' || (scheme.id === 'dark' && scheme.appearance !== 'light');
    const background = tokens.background || '#ffffff';
    const textColor = tokens.textColor || (isDark ? '#f2f2f2' : '#000000');
    const componentType = String(options.componentType || svg.getAttribute('data-color-scheme-component') || '').toLowerCase();
    const adapter = createAppearanceAdapter({ isDark, background });
    const preserveBackground = options.preserveBackground === true;
    svg.setAttribute('data-color-scheme', scheme.id || 'normal');
    if(componentType) svg.setAttribute('data-color-scheme-component', componentType);
    if(!preserveBackground) removeNode(svg.querySelector('[data-color-scheme-background="1"]'));
    if(isDark){
      if(preserveBackground) svg.removeAttribute('data-color-scheme-bg-color');
      else svg.setAttribute('data-color-scheme-bg-color', background);
      if(svg.style && !preserveBackground) svg.style.backgroundColor = background;
      applyDarkTextTheme(svg, textColor, adapter);
      applyDarkShapes(svg, componentType, adapter);
      if(options.observe !== false) ensureObserver(svg, {textColor, componentType, adapter});
    }else{
      disconnectObserver(svg);
      if(!preserveBackground){
        svg.removeAttribute('data-color-scheme-bg-color');
        if(svg.style) svg.style.removeProperty('background-color');
      }
      restoreTextTheme(svg);
      restorePaint(svg);
    }
  }

  namespace.applySvgTheme = applySvgTheme;
  namespace.createAppearanceAdapter = createAppearanceAdapter;
  namespace.applyDarkTextTheme = applyDarkTextTheme;
  namespace.restoreTextTheme = restoreTextTheme;
  namespace.restoreAppearancePaint = restorePaint;
})(window);
