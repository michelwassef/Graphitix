#!/usr/bin/env node
'use strict';

// Candidate finder only: a captured write may be safe when an owner-aware
// wrapper or session guard surrounds the callback. Every result needs tracing.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const espree = require('espree');
const eslintScope = require('eslint-scope');

const root = path.resolve(__dirname, '..');
const sourceRoots = ['js/components', 'js/shared', 'js/main', 'js/workers'];
const callbackCall = /^(?:addEventListener|then|catch|finally|setTimeout|setInterval|requestAnimationFrame|requestIdleCallback|queueMicrotask|bind.*(?:handler|control|event|callback)|register.*(?:handler|callback)|schedule.*(?:callback|frame|draw)|run.*(?:owner|callback))/i;
const ownerGuardCall = /^(?:is\w*(?:Owner|Session|DrawToken)(?:Active|Current|Valid|ForModuleState)|canOwnerUseLiveProjection|resolveOwnerCaptureContext|assert\w*Owner)$/i;
const ownerWrapper = /^(?:bind(?:Box|Scatter|Line|Pca|PCA|Venn|Heatmap|Hist|Pie|Roc|ROC|Survival|Surface)?ControlHandler|bindScatterControlListener|bindOwnerControlHandler|bindEventHandlers|runVennOwnedCallback|runVennEventOwnerCallback)$/;
const activeLookup = /^(?:getActive(?:\w*(?:Tab|Session))?|resolveActive\w*|resolveWorkspaceActiveTabId|get\w*ProjectionTabId)$/i;
const mutatingMethods = new Set([
  'add', 'clear', 'delete', 'push', 'pop', 'shift', 'unshift', 'splice', 'set', 'toggle',
  'loadData', 'setDataAtCell', 'updateSettings', 'replaceData', 'setSourceData',
  'persistUserModifiedTabState', 'persistActiveTabState', 'persistTabState'
]);
const externalMutationMethods = new Set([
  'loadData', 'setDataAtCell', 'updateSettings', 'replaceData', 'setSourceData',
  'persistUserModifiedTabState', 'persistActiveTabState', 'persistTabState'
]);
const allFlag = process.argv.includes('--all');
const jsonFlag = process.argv.includes('--json');
const activeAfterAwaitOnly = process.argv.includes('--active-after-await');
const moduleScopeOnly = process.argv.includes('--module-scope-only');
const highPriorityOnly = process.argv.includes('--high-priority');
const helperDepthArgument = process.argv.find(arg => arg.startsWith('--helper-depth='));
const parsedHelperDepth = Number(helperDepthArgument?.slice('--helper-depth='.length));
const helperDepth = helperDepthArgument && Number.isFinite(parsedHelperDepth)
  ? Math.min(4, Math.max(0, parsedHelperDepth))
  : 1;
const fileArgIndex = process.argv.indexOf('--file');
const requestedFile = fileArgIndex >= 0 ? process.argv[fileArgIndex + 1] : '';
const limitArg = process.argv.find(arg => arg.startsWith('--limit='));
const outputLimit = allFlag ? Infinity : Math.max(1, Number(limitArg?.slice(8)) || 60);

function listJavaScript(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory()
      ? listJavaScript(fullPath)
      : (entry.isFile() && entry.name.endsWith('.js') ? [fullPath] : []);
  });
}

function getCallName(node) {
  const callee = node?.callee;
  if (callee?.type === 'Identifier') return callee.name;
  if (callee?.type === 'MemberExpression') {
    return callee.computed
      ? String(callee.property?.value || '')
      : String(callee.property?.name || '');
  }
  return '';
}

function getStaticMemberPath(node) {
  if (node?.type === 'Identifier') return node.name;
  if (node?.type !== 'MemberExpression' || node.computed) return '';
  const object = getStaticMemberPath(node.object);
  const property = node.property?.name || '';
  return object && property ? `${object}.${property}` : '';
}

function registrationSite(call, helper) {
  const callee = call?.callee;
  const receiver = callee?.type === 'MemberExpression'
    ? getStaticMemberPath(callee.object)
    : '';
  const target = /^(?:window|document|global|globalThis)(?:\.|$)/.test(receiver)
    ? 'global event target'
    : (receiver ? 'local or scoped target' : 'wrapper or direct callback');
  return {
    helper: helper || getCallName(call) || '<unknown helper>',
    receiver: receiver || null,
    target,
    line: call?.loc?.start?.line || null
  };
}

function walk(node, visit, parents = new WeakMap(), parent = null) {
  if (!node || typeof node !== 'object' || typeof node.type !== 'string') return;
  if (parent) parents.set(node, parent);
  visit(node);
  for (const [key, value] of Object.entries(node)) {
    if (key === 'parent' || key === 'loc' || key === 'range') continue;
    if (Array.isArray(value)) value.forEach(child => walk(child, visit, parents, node));
    else if (value && typeof value === 'object' && typeof value.type === 'string') {
      walk(value, visit, parents, node);
    }
  }
}

function isFunction(node) {
  return node?.type === 'FunctionDeclaration'
    || node?.type === 'FunctionExpression'
    || node?.type === 'ArrowFunctionExpression';
}

function functionLabel(node, parents) {
  if (node.id?.name) return node.id.name;
  const parent = parents.get(node);
  if (parent?.type === 'VariableDeclarator' && parent.id?.name) return parent.id.name;
  if (parent?.type === 'Property' && parent.key) {
    return parent.key.name || parent.key.value || '<property callback>';
  }
  return '<anonymous callback>';
}

function isCallArgumentCallback(node, parents) {
  const parent = parents.get(node);
  return parent?.type === 'CallExpression' && callbackCall.test(getCallName(parent));
}

function walkCurrentFunction(node, visit) {
  const stack = [node.body];
  while (stack.length) {
    const current = stack.pop();
    if (!current || typeof current !== 'object' || typeof current.type !== 'string') continue;
    if (current !== node.body && isFunction(current)) continue;
    visit(current);
    for (const [key, value] of Object.entries(current)) {
      if (key === 'parent' || key === 'loc' || key === 'range') continue;
      if (Array.isArray(value)) value.forEach(child => stack.push(child));
      else if (value && typeof value === 'object' && typeof value.type === 'string') stack.push(value);
    }
  }
}

function hasOwnerGuard(node) {
  let found = false;
  walkCurrentFunction(node, child => {
    if (child.type === 'CallExpression' && ownerGuardCall.test(getCallName(child))) found = true;
  });
  return found;
}

function ownerMetadataInCurrentFunction(node) {
  let found = false;
  walkCurrentFunction(node, child => {
    if (child.type === 'Identifier' && /^(?:owner|tabId|workspaceTabId|sessionGeneration|generation|requestToken|drawToken)$/i.test(child.name)) found = true;
  });
  return found;
}

function memberWriteKind(identifier, parents) {
  if (!identifier) return '';
  let current = identifier;
  let parent = parents.get(current);
  while (parent) {
    if (parent.type === 'MemberExpression' && parent.object === current) {
      current = parent;
      parent = parents.get(current);
      continue;
    }
    if (parent.type === 'AssignmentExpression' && parent.left === current) return 'property assignment';
    if (parent.type === 'UpdateExpression' && parent.argument === current) return 'property update';
    if (parent.type === 'UnaryExpression' && parent.operator === 'delete' && parent.argument === current) return 'property delete';
    if (parent.type === 'CallExpression' && parent.callee === current
      && current.type === 'MemberExpression' && mutatingMethods.has(getCallName({ callee: current }))) {
      return `.${getCallName({ callee: current })}()`;
    }
    return '';
  }
  return '';
}

function scopeWithin(scope, ancestor) {
  for (let current = scope; current; current = current.upper) {
    if (current === ancestor) return true;
  }
  return false;
}

function scopeWithinSameFunction(scope, functionScope) {
  for (let current = scope; current && current !== functionScope; current = current.upper) {
    if (current.type === 'function') return false;
  }
  return scope === functionScope || scopeWithin(scope, functionScope);
}

function getBaseIdentifier(node) {
  let current = node;
  while (current?.type === 'MemberExpression') current = current.object;
  return current?.type === 'Identifier' ? current : null;
}

function longLivedScopeDepth(scope) {
  let depth = 0;
  for (let current = scope; current; current = current.upper) {
    if (current.type === 'function' || current.type === 'module') depth += 1;
  }
  return depth;
}

function activeOwnerReadAfterAwait(node) {
  let firstAwaitEnd = Infinity;
  walkCurrentFunction(node, child => {
    if (child.type === 'AwaitExpression') firstAwaitEnd = Math.min(firstAwaitEnd, child.range[1]);
  });
  if (!Number.isFinite(firstAwaitEnd)) return [];
  const reads = new Map();
  walkCurrentFunction(node, child => {
    if (child.type === 'CallExpression'
      && child.range[0] > firstAwaitEnd
      && activeLookup.test(getCallName(child))) {
      reads.set(`${getCallName(child)}:${child.loc.start.line}`, {
        name: getCallName(child),
        line: child.loc.start.line
      });
    }
  });
  return [...reads.values()];
}

function collectExternalFileSaveSinks(node, referenceByIdentifier) {
  const sinks = new Map();
  walkCurrentFunction(node, child => {
    if (child.type !== 'CallExpression') return;
    const callee = getStaticMemberPath(child.callee);
    if (!/(?:^|\.)fileIO\.saveGraphFile(?:As)?$/.test(callee)) return;
    const options = (child.arguments || []).find(argument => argument?.type === 'ObjectExpression');
    const selectors = [];
    for (const property of options?.properties || []) {
      if (property.type !== 'Property') continue;
      const key = String(property.key?.name || property.key?.value || '');
      if (!['fileHandle', 'fileName', 'downloadFileName', 'owner', 'payload', 'getPayload'].includes(key)) continue;
      const value = property.value;
      const expression = getStaticMemberPath(value)
        || (value?.type === 'Identifier' ? value.name : value?.type || 'dynamic');
      const base = getBaseIdentifier(value);
      const variable = base ? referenceByIdentifier.get(base)?.resolved : null;
      selectors.push({
        key,
        expression,
        scopeDepth: variable ? longLivedScopeDepth(variable.scope) : null
      });
    }
    const key = `${callee}:${child.loc.start.line}`;
    sinks.set(key, {
      name: callee,
      line: child.loc.start.line,
      selectors
    });
  });
  return [...sinks.values()];
}

function scanFile(file) {
  const source = fs.readFileSync(file, 'utf8');
  let ast;
  let sourceType = 'script';
  try {
    ast = espree.parse(source, { ecmaVersion: 'latest', sourceType, range: true, loc: true });
  } catch (scriptError) {
    sourceType = 'module';
    try {
      ast = espree.parse(source, { ecmaVersion: 'latest', sourceType, range: true, loc: true });
    } catch (moduleError) {
      throw new Error(`${path.relative(root, file)}: ${moduleError.message || scriptError.message}`);
    }
  }

  const parents = new WeakMap();
  const nodes = [];
  walk(ast, node => nodes.push(node), parents);
  const scopes = eslintScope.analyze(ast, {
    ecmaVersion: 2022,
    sourceType,
    optimistic: true,
    ignoreEval: true,
    impliedStrict: sourceType === 'module'
  }).scopes;
  const functionScopes = new Map(scopes.filter(scope => scope.type === 'function').map(scope => [scope.block, scope]));
  const referenceByIdentifier = new WeakMap();
  for (const scope of scopes) {
    for (const reference of scope.references) {
      if (reference.identifier) referenceByIdentifier.set(reference.identifier, reference);
    }
  }
  const namedFunctions = new Map();
  for (const node of nodes) {
    if (!isFunction(node)) continue;
    const name = functionLabel(node, parents);
    if (name !== '<anonymous callback>' && name !== '<property callback>') {
      const matches = namedFunctions.get(name) || [];
      matches.push(node);
      namedFunctions.set(name, matches);
    }
  }

  const callbackNodes = new Set(nodes.filter(node => isFunction(node) && (node.async || isCallArgumentCallback(node, parents))));
  const registrationNames = new Map();
  const registrationSites = new Map();
  const addRegistration = (node, helper, call) => {
    if (!isFunction(node)) return;
    callbackNodes.add(node);
    const names = registrationNames.get(node) || new Set();
    names.add(helper || '<unknown helper>');
    registrationNames.set(node, names);
    if (call) {
      const sites = registrationSites.get(node) || [];
      const site = registrationSite(call, helper);
      if (!sites.some(item => item.line === site.line && item.receiver === site.receiver && item.helper === site.helper)) {
        sites.push(site);
      }
      registrationSites.set(node, sites);
    }
  };
  const resolveFunctionDefinition = variable => {
    const definition = variable?.defs?.find(def => def.type === 'FunctionName' || def.type === 'Variable') || null;
    if (isFunction(definition?.node)) return definition.node;
    if (definition?.node?.type === 'VariableDeclarator' && isFunction(definition.node.init)) {
      return definition.node.init;
    }
    return null;
  };
  const resolveReferencedFunction = identifier => {
    const reference = referenceByIdentifier.get(identifier);
    if (reference?.resolved) return resolveFunctionDefinition(reference.resolved);
    const matches = namedFunctions.get(identifier.name) || [];
    return matches.length === 1 ? matches[0] : null;
  };
  const addReferencedFunction = (value, helper, call) => {
    if (isFunction(value)) {
      addRegistration(value, helper, call);
    } else if (value?.type === 'Identifier') {
      const node = resolveReferencedFunction(value);
      if (node) addRegistration(node, helper, call);
    } else if (value?.type === 'ArrayExpression') {
      value.elements.filter(Boolean).forEach(item => addReferencedFunction(item, helper, call));
    } else if (value?.type === 'ObjectExpression') {
      for (const property of value.properties || []) {
        const key = String(property.key?.name || property.key?.value || '');
        if (/^(?:handler|callback|listener|on[A-Z])/i.test(key)) {
          addReferencedFunction(property.value, helper, call);
        } else if (property.value?.type === 'ArrayExpression') {
          addReferencedFunction(property.value, helper, call);
        }
      }
    }
  };

  const resolveLocalFunction = call => {
    const callee = call?.callee;
    if (callee?.type !== 'Identifier') return null;
    const variable = referenceByIdentifier.get(callee)?.resolved || null;
    return resolveFunctionDefinition(variable);
  };

  const collectLocalHelperWrites = callback => {
    if (helperDepth === 0) return [];
    const queue = [{ node: callback, chain: [] }];
    const visited = new Set([callback]);
    const sinks = new Map();
    while (queue.length) {
      const current = queue.shift();
      if (current.chain.length >= helperDepth) continue;
      walkCurrentFunction(current.node, child => {
        if (child.type !== 'CallExpression') return;
        const helper = resolveLocalFunction(child);
        if (!helper || visited.has(helper)) return;
        visited.add(helper);
        const helperName = functionLabel(helper, parents);
        const chain = [...current.chain, helperName];
        queue.push({ node: helper, chain });

        const helperScope = functionScopes.get(helper);
        if (!helperScope) return;
        for (const scope of scopes) {
          if (!scopeWithinSameFunction(scope, helperScope)) continue;
          for (const reference of scope.references) {
            const variable = reference.resolved;
            if (!variable) continue;
            const kind = reference.isWrite() ? 'reassignment' : memberWriteKind(reference.identifier, parents);
            if (!kind) continue;
            const variableIsLocal = scopeWithin(variable.scope, helperScope);
            const isParameterWrite = variableIsLocal && variable.defs?.some(def => def.type === 'Parameter');
            if (variableIsLocal && !isParameterWrite) continue;
            if (isParameterWrite && kind === 'reassignment') continue;
            const scopeDepth = variableIsLocal ? 0 : longLivedScopeDepth(variable.scope);
            if (scopeDepth > 2) continue;
            const name = isParameterWrite ? `parameter:${variable.name}` : variable.name;
            const key = `${name}:${kind}:${reference.identifier.loc.start.line}`;
            sinks.set(key, { name, kind, line: reference.identifier.loc.start.line, scopeDepth, via: chain });
          }
        }
        walkCurrentFunction(helper, helperNode => {
          if (helperNode.type !== 'CallExpression'
            || helperNode.callee?.type !== 'MemberExpression'
            || !mutatingMethods.has(getCallName(helperNode))) return;
          const base = getBaseIdentifier(helperNode.callee.object);
          const baseVariable = base ? referenceByIdentifier.get(base)?.resolved : null;
          if (!baseVariable) return;
          const baseIsLocal = scopeWithin(baseVariable.scope, helperScope);
          const baseIsParameter = baseIsLocal && baseVariable.defs?.some(def => def.type === 'Parameter');
          if (baseIsLocal && !baseIsParameter && !externalMutationMethods.has(getCallName(helperNode))) return;
          const suffix = getStaticMemberPath(helperNode.callee.object).slice(base.name.length);
          const receiver = baseIsParameter
            ? `parameter:${base.name}${suffix}`
            : (getStaticMemberPath(helperNode.callee.object) || base.name);
          const key = `method:${receiver}.${getCallName(helperNode)}:${helperNode.loc.start.line}`;
          sinks.set(key, {
            name: `${receiver}.${getCallName(helperNode)}`,
            kind: 'mutating helper call',
            line: helperNode.loc.start.line,
            scopeDepth: baseIsParameter ? 0 : longLivedScopeDepth(baseVariable.scope),
            via: chain
          });
        });
      });
    }
    return [...sinks.values()]
      .sort((a, b) => a.via.length - b.via.length || a.line - b.line)
      .slice(0, 12);
  };
  for (const call of nodes.filter(node => node.type === 'CallExpression' && callbackCall.test(getCallName(node)))) {
    const helper = getCallName(call);
    for (const argument of call.arguments || []) {
      if (isFunction(argument) || argument.type === 'Identifier') addReferencedFunction(argument, helper, call);
      else if (argument.type === 'ObjectExpression' || argument.type === 'ArrayExpression') addReferencedFunction(argument, helper, call);
    }
  }

  const rel = path.relative(root, file).replace(/\\/g, '/');
  const findings = [];
  for (const node of callbackNodes) {
    const callbackScope = functionScopes.get(node);
    if (!callbackScope) continue;
    const writes = new Map();
    const writeOffsets = [];
    for (const scope of scopes) {
      if (!scopeWithin(scope, callbackScope)) continue;
      for (const reference of scope.references) {
        const variable = reference.resolved;
        if (!variable || scopeWithin(variable.scope, callbackScope)) continue;
        const scopeDepth = longLivedScopeDepth(variable.scope);
        if (scopeDepth > 2) continue;
        const kind = reference.isWrite() ? 'reassignment' : memberWriteKind(reference.identifier, parents);
        if (!kind) continue;
        writeOffsets.push(reference.identifier.range?.[0] ?? 0);
        const key = `${variable.name}:${kind}`;
        writes.set(key, { name: variable.name, kind, line: reference.identifier.loc.start.line, scopeDepth });
      }
    }
    const helperWrites = collectLocalHelperWrites(node);
    const externalSinks = collectExternalFileSaveSinks(node, referenceByIdentifier);
    if (!writes.size && !helperWrites.length && !externalSinks.length) continue;

    const hasOwnerCheck = hasOwnerGuard(node);
    const looksOwnerAware = ownerMetadataInCurrentFunction(node);
    const activeReadsAfterAwait = activeOwnerReadAfterAwait(node);
    let awaitCount = 0;
    let lastAwaitEnd = -1;
    const ownerGuardOffsets = [];
    walkCurrentFunction(node, child => {
      if (child.type === 'AwaitExpression') {
        awaitCount += 1;
        lastAwaitEnd = Math.max(lastAwaitEnd, child.range?.[1] ?? -1);
      }
      if (child.type === 'CallExpression' && ownerGuardCall.test(getCallName(child))) {
        ownerGuardOffsets.push(child.range?.[0] ?? 0);
      }
    });
    const hasDirectCapturedWrites = writeOffsets.length > 0;
    const lastWriteOffset = hasDirectCapturedWrites ? Math.max(...writeOffsets) : null;
    const ownerGuardBeforeLastWrite = hasDirectCapturedWrites
      ? ownerGuardOffsets.some(offset => offset < lastWriteOffset)
      : null;
    const ownerGuardAfterLastAwaitBeforeWrite = hasDirectCapturedWrites
      ? ownerGuardOffsets.some(offset => offset > lastAwaitEnd && offset < lastWriteOffset)
      : null;
    const registrationHelpers = [...(registrationNames.get(node) || [])];
    const registeredBy = registrationHelpers.join(', ') || (isCallArgumentCallback(node, parents) ? getCallName(parents.get(node)) : null);
    const hasOwnerWrapper = registrationHelpers.some(helper => ownerWrapper.test(helper));
    const registrationSitesForNode = registrationSites.get(node) || [];
    const allWrites = [...writes.values(), ...helperWrites];
    const writeNames = [...new Set(allWrites.map(write => write.name))];
    const durableNameCues = writeNames.filter(name => /^(?:parameter:)?(?:workspaceState|payload|session|tab|tabs|runtimeState)$/i.test(name));
    const cacheResultNameCues = writeNames.filter(name => /(?:cache|results|runtime|manager|notes|advisor|data)/i.test(name));
    const globalRegistrationCue = registrationSitesForNode.some(site => site.target === 'global event target');
    const moduleScopeWriteCue = allWrites.some(write => write.scopeDepth === 1);
    const triageReasons = [];
    let triageScore = 0;
    if (durableNameCues.length) { triageScore += 5; triageReasons.push(`durable-looking names: ${durableNameCues.join(', ')}`); }
    if (cacheResultNameCues.length) { triageScore += 3; triageReasons.push(`cache/result/data names: ${cacheResultNameCues.join(', ')}`); }
    if (globalRegistrationCue) { triageScore += 3; triageReasons.push('direct window/document/global registration'); }
    if (awaitCount) { triageScore += 2; triageReasons.push('callback can yield'); }
    if (activeReadsAfterAwait.length) { triageScore += 2; triageReasons.push('active owner lookup after await'); }
    if (!hasOwnerCheck && !hasOwnerWrapper) { triageScore += 2; triageReasons.push('no inline guard or recognized owner wrapper'); }
    if (hasOwnerCheck && hasDirectCapturedWrites && !ownerGuardBeforeLastWrite) { triageScore += 3; triageReasons.push('owner guard appears only after direct captured write'); }
    if (moduleScopeWriteCue) { triageScore += 1; triageReasons.push('writes a module-scope binding'); }
    if (helperWrites.length) { triageReasons.push(`calls local helpers with mutation sinks: ${[...new Set(helperWrites.map(write => write.via[0]))].join(', ')}`); }
    if (helperWrites.length) { triageReasons.push('owner ordering for helper sinks requires source tracing'); }
    if (externalSinks.length) { triageScore += 4; triageReasons.push('calls durable graph-file save; target and owner require source tracing'); }
    if (externalSinks.some(sink => sink.selectors.some(selector => selector.scopeDepth === 1))) {
      triageScore += 3;
      triageReasons.push('graph-file target selector reads a module-scope binding');
    }
    const triageBand = triageScore >= 9 ? 'high' : (triageScore >= 5 ? 'medium' : 'lower');
    findings.push({
      file: rel,
      line: node.loc.start.line,
      callback: functionLabel(node, parents),
      sourceHash: crypto.createHash('sha256').update(source.slice(node.range[0], node.range[1])).digest('hex'),
      registeredBy,
      kind: node.async ? 'async function' : 'registered callback',
      capturedWrites: [...writes.values()].sort((a, b) => a.line - b.line).slice(0, 6),
      helperWrites,
      externalSinks,
      ownerCheckPresent: hasOwnerCheck,
      ownerWrapperPresent: hasOwnerWrapper,
      ownerMetadataPresent: looksOwnerAware,
      activeReadsAfterAwait,
      registrationSites: registrationSitesForNode,
      awaitCount,
      ownerGuardOrderingCue: {
        beforeLastCapturedWrite: ownerGuardBeforeLastWrite,
        afterLastAwaitBeforeLastWrite: ownerGuardAfterLastAwaitBeforeWrite,
        helperWriteOrderingUnresolved: helperWrites.length > 0
      },
      triageScore,
      triageBand,
      triageReasons,
      rank: activeReadsAfterAwait.length && !hasOwnerCheck ? 0
        : (!hasOwnerCheck && !looksOwnerAware && !hasOwnerWrapper ? 1 : 2)
    });
  }
  return findings;
}

const files = requestedFile
  ? [path.resolve(root, requestedFile)]
  : sourceRoots.flatMap(relative => listJavaScript(path.join(root, relative))).sort();
const findings = files.flatMap(scanFile).sort((a, b) => b.triageScore - a.triageScore || a.rank - b.rank || a.file.localeCompare(b.file) || a.line - b.line);
const selectedFindings = findings.filter(item => (
  (!activeAfterAwaitOnly || item.activeReadsAfterAwait.length > 0)
  && (!moduleScopeOnly || [...item.capturedWrites, ...item.helperWrites].some(write => write.scopeDepth === 1))
  && (!highPriorityOnly || item.triageBand === 'high')
));
const allWritesFor = item => [...item.capturedWrites, ...item.helperWrites];
const summary = {
  scannedFiles: files.length,
  candidates: findings.length,
  noOwnerClue: findings.filter(item => !item.ownerMetadataPresent).length,
  noInlineOwnerCheck: findings.filter(item => !item.ownerCheckPresent).length,
  knownOwnerWrapper: findings.filter(item => item.ownerWrapperPresent).length,
  activeLookupAfterAwait: findings.filter(item => item.activeReadsAfterAwait.length).length,
  unguardedActiveLookupAfterAwait: findings.filter(item => item.activeReadsAfterAwait.length && !item.ownerCheckPresent).length,
  moduleScopeWriteCandidates: findings.filter(item => allWritesFor(item).some(write => write.scopeDepth === 1)).length,
  enclosingFunctionWriteCandidates: findings.filter(item => allWritesFor(item).some(write => write.scopeDepth === 2)).length,
  helperMutationCandidates: findings.filter(item => item.helperWrites.length > 0).length,
  externalFileWriteCandidates: findings.filter(item => item.externalSinks.length > 0).length,
  helperDepth,
  triageBands: Object.fromEntries(['high', 'medium', 'lower'].map(band => [band, findings.filter(item => item.triageBand === band).length])),
  triageCaveat: 'Triage scores use identifier names, callback registration syntax, and direct lexical guard ordering only. Helper-sink ordering is unresolved and requires source tracing; scores prioritize review but do not prove a leak or safety.',
  filteredCandidates: selectedFindings.length,
  displayed: Math.min(selectedFindings.length, outputLimit),
  caveat: `Candidates are captured writes, bounded same-file local-helper sinks, or graph-file save calls in async/registered callbacks. A save sink cue exposes target and owner selectors but does not prove ownership or a defect. Helper tracing follows identifier calls to depth ${helperDepth} and reports at most 12 sinks per callback; object-method and dynamic calls may be missed. Wrappers, callers, guard control flow, and tab ownership still require manual tracing; counts and triage scores are not bug counts.`
};

if (jsonFlag) {
  process.stdout.write(`${JSON.stringify({ summary, findings: selectedFindings.slice(0, outputLimit) }, null, 2)}\n`);
} else {
  const filters = [
    activeAfterAwaitOnly ? 'active-owner-after-await' : '',
    moduleScopeOnly ? 'module-scope writes' : '',
    highPriorityOnly ? 'high-priority triage cues' : ''
  ].filter(Boolean);
  const filterLabel = filters.length
    ? `Showing ${summary.filteredCandidates} ${filters.join(' and ')} candidates`
    : `Tab-isolation candidates: ${summary.candidates}`;
  process.stdout.write(`${filterLabel} across ${summary.scannedFiles} files. ${summary.caveat}\n`);
  process.stdout.write(`No inline owner check: ${summary.noInlineOwnerCheck}; active-owner lookup after await: ${summary.activeLookupAfterAwait}; unguarded among those: ${summary.unguardedActiveLookupAfterAwait}; helper-sink candidates: ${summary.helperMutationCandidates}; graph-file save candidates: ${summary.externalFileWriteCandidates}.\n\n`);
  for (const item of selectedFindings.slice(0, outputLimit)) {
    const writes = item.capturedWrites.map(write => `${write.name} (${write.kind}, line ${write.line})`).join(', ');
    const helperWrites = item.helperWrites.map(write => `${write.via.join(' -> ')}: ${write.name} (${write.kind}, line ${write.line})`).join(', ');
    const externalSinks = item.externalSinks.map(sink => `${sink.name} (line ${sink.line}; selectors ${sink.selectors.map(selector => `${selector.key}=${selector.expression}`).join(', ')})`).join(', ');
    const flags = [
      item.registeredBy ? `registration: ${item.registeredBy}` : '',
      item.activeReadsAfterAwait.length ? `active lookup after await: ${item.activeReadsAfterAwait.map(read => `${read.name}:${read.line}`).join(', ')}` : '',
      item.ownerCheckPresent ? 'inline owner check' : '',
      item.ownerWrapperPresent ? `registered through ${item.registeredBy}` : '',
      item.ownerMetadataPresent ? 'owner metadata clue' : ''
    ].filter(Boolean).join('; ') || 'no inline ownership clue';
    process.stdout.write(`${item.file}:${item.line} ${item.callback} [${item.kind}]\n  Triage: ${item.triageBand} (${item.triageScore}) ${item.triageReasons.join('; ') || 'no strong lexical cue'}\n  Registration: ${JSON.stringify(item.registrationSites)}\n  Captured writes: ${writes}\n${helperWrites ? `  Local helper sinks: ${helperWrites}\n` : ''}${externalSinks ? `  Durable file-save sinks: ${externalSinks}\n` : ''}  Review cues: ${flags}\n`);
  }
}
