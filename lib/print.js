const { buildTree } = require('./dashboard');

function colorEnabled() {
  if (process.env.NO_COLOR) return false;
  if (process.env.FORCE_COLOR) return true;
  return !!process.stdout.isTTY;
}

function wrap(text, dimmed, useColor) {
  if (!dimmed || !useColor) return text;
  return '\x1b[2m' + text + '\x1b[0m';
}

function labelWithCount(node) {
  return node.count != null ? node.label + ' (' + node.count + ')' : node.label;
}

function isDimmed(node) {
  if (node.dimmed) return true;
  if (node.count === 0) return true;
  if (node.type === 'claudemd' && !(node.data && node.data.data && node.data.data.exists)) return true;
  if (node.type === 'settings-layer' && !(node.data && node.data.data)) return true;
  return false;
}

function printScope(scope, useColor) {
  console.log(scope.icon + ' ' + scope.label);
  (scope.children || []).forEach(function(section) {
    if (section.id === 'marketplaces') return;
    const sectionDimmed = isDimmed(section);
    const sectionLine = '  ' + section.icon + ' ' + labelWithCount(section);
    console.log(wrap(sectionLine, sectionDimmed, useColor));
    (section.children || []).forEach(function(item) {
      const itemDimmed = sectionDimmed || isDimmed(item);
      const itemLine = '    \u2514\u2500 ' + labelWithCount(item);
      console.log(wrap(itemLine, itemDimmed, useColor));
      if (item.type === 'hook') {
        (item.children || []).forEach(function(handler) {
          const handlerLine = '        \u2514\u2500 ' + labelWithCount(handler);
          console.log(wrap(handlerLine, itemDimmed || isDimmed(handler), useColor));
        });
      }
    });
  });
}

function printInline(data, opts) {
  const useColor = (opts && opts.color != null) ? !!opts.color : colorEnabled();
  const tree = buildTree(data);
  tree.forEach(function(scope, i) {
    if (i > 0) console.log('');
    printScope(scope, useColor);
  });
}

module.exports = { printInline };
