'use strict';

const fs = require('node:fs');
const espree = require('espree');

function parseScript(source, filename = '<source>') {
  return espree.parse(source, {
    ecmaVersion: 'latest',
    sourceType: 'script',
    allowHashBang: true
  }, filename);
}

function readScriptAst(filePath) {
  return parseScript(fs.readFileSync(filePath, 'utf8'), filePath);
}

function findNodes(root, predicate) {
  const matches = [];
  const visit = node => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (typeof node.type !== 'string') return;
    if (predicate(node)) matches.push(node);
    Object.keys(node).forEach(key => {
      if (key === 'loc' || key === 'range' || key === 'start' || key === 'end') return;
      visit(node[key]);
    });
  };
  visit(root);
  return matches;
}

function staticName(node) {
  if (!node) return null;
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
  return null;
}

function memberPath(node) {
  if (!node) return null;
  if (node.type === 'ChainExpression') return memberPath(node.expression);
  if (node.type === 'Identifier') return node.name;
  if (node.type !== 'MemberExpression') return null;
  const objectPath = memberPath(node.object);
  const propertyName = staticName(node.property);
  return objectPath && propertyName ? `${objectPath}.${propertyName}` : null;
}

function findFunctions(root, name) {
  return findNodes(root, node => (
    ['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'].includes(node.type)
    && node.id?.name === name
  ));
}

module.exports = {
  findFunctions,
  findNodes,
  memberPath,
  parseScript,
  readScriptAst,
  staticName
};
