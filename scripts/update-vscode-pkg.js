const fs = require('fs');
const path = require('path');

const vscodePkgPath = path.join('d:/TaintFlow+/vscode-extension', 'package.json');
const pkg = JSON.parse(fs.readFileSync(vscodePkgPath, 'utf8'));

pkg.main = './out/src/extension.js';

pkg.contributes.viewsContainers = {
  activitybar: [
    {
      id: 'taintflow-sidebar',
      title: 'TaintFlow+',
      icon: '$(shield)'
    }
  ]
};

pkg.contributes.views = {
  'taintflow-sidebar': [
    {
      id: 'taintflow.views.dashboard',
      name: 'Scan Results'
    }
  ]
};

const newCommands = [
  { command: 'taintflow.sidebar.focus', title: 'TaintFlow+: Show Dashboard' },
  { command: 'taintflow.openFile', title: 'TaintFlow+: Open File' },
  { command: 'taintflow.fixFinding', title: 'TaintFlow+: Fix with Antigravity', icon: '$(sparkle)' },
  { command: 'taintflow.fixAll', title: 'TaintFlow+: Fix All with Antigravity' }
];

for (const cmd of newCommands) {
    if (!pkg.contributes.commands.find(c => c.command === cmd.command)) {
        pkg.contributes.commands.push(cmd);
    }
}

pkg.contributes.menus = {
  'view/item/context': [
    {
      command: 'taintflow.fixFinding',
      when: 'view == taintflow.views.dashboard && viewItem == findingItem',
      group: 'inline'
    }
  ],
  'view/title': [
    {
      command: 'taintflow.fixAll',
      when: 'view == taintflow.views.dashboard',
      group: 'navigation'
    }
  ]
};

fs.writeFileSync(vscodePkgPath, JSON.stringify(pkg, null, 2));

const tsconfigPath = path.join('d:/TaintFlow+/vscode-extension', 'tsconfig.json');
const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf8'));
tsconfig.include = ['src/**/*', '../core/**/*'];
fs.writeFileSync(tsconfigPath, JSON.stringify(tsconfig, null, 2));

console.log('Updated package.json and tsconfig.json in vscode-extension');
