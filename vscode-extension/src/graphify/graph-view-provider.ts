import * as vscode from 'vscode';
import * as path from 'path';
import { RepositoryScanner } from './repository-scanner';
import { GraphBuilder } from './graph-builder';
import { SecurityFlowAnalyzer } from './security-flow';
import { TaintFlowState } from '../state';

export class GraphifyViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'taintflow.graphifyView';
    private _view?: vscode.WebviewView;
    private _panels: Set<vscode.WebviewPanel> = new Set();

    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly scanner: RepositoryScanner
    ) {
        this.scanner.onMemoryUpdated(() => {
            this.updateGraphData();
        });
        
        // Listen for findings updates to automatically refresh the visualization
        TaintFlowState.onFindingsChanged.event(() => {
            this.updateGraphData();
        });
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.context.extensionUri]
        };

        webviewView.webview.html = this.getHtmlForWebview(webviewView.webview, false);

        this.registerMessageHandlers(webviewView.webview);
        this.updateGraphData();
    }

    public openFullScreen() {
        const panel = vscode.window.createWebviewPanel(
            'taintflow.graphifyFullScreen',
            'Graphify Repository Map',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [this.context.extensionUri],
                retainContextWhenHidden: true
            }
        );

        panel.webview.html = this.getHtmlForWebview(panel.webview, true);
        this._panels.add(panel);

        this.registerMessageHandlers(panel.webview);
        
        panel.onDidDispose(() => {
            this._panels.delete(panel);
        });

        // Push initial graph data immediately
        panel.webview.postMessage(this.getGraphPayload());
    }

    private registerMessageHandlers(webview: vscode.Webview) {
        webview.onDidReceiveMessage(async (data) => {
            switch (data.command) {
                case 'openFile':
                    await this._handleOpenFileCommand(data.filePath);
                    break;
                case 'requestUpdate':
                    this.updateGraphData();
                    break;
                case 'openFullScreen':
                    this.openFullScreen();
                    break;
                case 'rebuildIndex':
                    await vscode.commands.executeCommand('taintflow.graphify.scanWorkspace');
                    break;
                case 'copyAIContext':
                    await vscode.commands.executeCommand('taintflow.graphify.copyAIContext');
                    break;
                case 'copyRepoMap':
                    await vscode.commands.executeCommand('taintflow.graphify.copyRepoMap');
                    break;
                case 'exportContext':
                    await vscode.commands.executeCommand('taintflow.graphify.exportContext');
                    break;
                case 'exportArchitecture':
                    await vscode.commands.executeCommand('taintflow.graphify.exportArchitecture');
                    break;
                case 'getSecurityPath':
                    try {
                        const attackPath = SecurityFlowAnalyzer.traceAttackPath(
                            this.scanner.getMemory(),
                            data.vulnerableFile,
                            data.vulnerabilityType,
                            data.severity,
                            data.line
                        );
                        webview.postMessage({
                            type: 'setSecurityPath',
                            attackPath: attackPath,
                            selectedNode: data.vulnerableFile
                        });
                    } catch (err) {
                        console.error('Error tracing attack path:', err);
                    }
                    break;
            }
        });
    }

    private async _handleOpenFileCommand(filePath: string) {
        if (!filePath) return;
        const rootUri = vscode.workspace.workspaceFolders?.[0]?.uri;
        if (!rootUri) return;

        try {
            const requestedUri = vscode.Uri.joinPath(rootUri, filePath);
            const relative = path.relative(rootUri.fsPath, requestedUri.fsPath);
            const isInside = !relative.startsWith('..') && !path.isAbsolute(relative);

            if (isInside) {
                const doc = await vscode.workspace.openTextDocument(requestedUri);
                await vscode.window.showTextDocument(doc);
            } else {
                console.warn('Attempted path traversal detected:', filePath);
                vscode.window.showErrorMessage('Invalid file path.');
            }
        } catch (error) {
            console.error('Failed to open document:', error);
            vscode.window.showErrorMessage(`Could not open file: ${filePath}`);
        }
    }

    private syncVulnerabilitiesToMemory() {
        const memory = this.scanner.getMemory();
        const cacheEntries = Array.from(TaintFlowState.findingsCache.entries());
        
        for (const [relPath, node] of Object.entries(memory.files)) {
            // Find findings where the cache key ends with the relative path
            const match = cacheEntries.find(([uriStr]) => {
                const decodedUri = decodeURIComponent(uriStr).replace(/\\/g, '/');
                return decodedUri.endsWith('/' + relPath);
            });
            const findings = match ? match[1] : [];
            node.vulnerabilitiesCount = findings.length;
            node.isVulnerable = findings.length > 0;
        }
    }

    private getGraphPayload() {
        const memory = this.scanner.getMemory();
        this.syncVulnerabilitiesToMemory();
        const graphData = GraphBuilder.buildVisualGraph(memory);
        
        // Extract all findings for the Security Flow view
        const allFindings: any[] = [];
        const rootUri = vscode.workspace.workspaceFolders?.[0]?.uri;
        
        for (const [uriStr, findings] of TaintFlowState.findingsCache.entries()) {
            let relPath = uriStr;
            if (rootUri && uriStr.startsWith('file://')) {
                const fileUri = vscode.Uri.parse(uriStr);
                relPath = path.relative(rootUri.fsPath, fileUri.fsPath).replace(/\\/g, '/');
            }
            for (const f of findings) {
                allFindings.push({
                    id: `${relPath}-${f.message}-${f.lineStart}`,
                    filePath: relPath,
                    fileName: path.basename(relPath),
                    message: f.message,
                    severity: f.severity.toLowerCase(),
                    line: f.lineStart,
                    source: f.source
                });
            }
        }

        return {
            type: 'setGraphData',
            data: graphData,
            findings: allFindings,
            stats: {
                projectName: memory.projectName,
                frameworks: memory.frameworks,
                lastScanTime: memory.lastScanTime,
                entryPointsCount: memory.entryPoints.length,
                servicesCount: memory.services.length,
                apisCount: memory.apis.length,
                databasesCount: memory.databases.length,
                totalFiles: Object.keys(memory.files).length,
                totalEdges: memory.edges.length
            }
        };
    }

    public showSecurityPath(vulnerableFile: string, pathChain: string[]) {
        const memory = this.scanner.getMemory();
        this.syncVulnerabilitiesToMemory();
        const graphData = GraphBuilder.buildVisualGraph(memory, new Set([vulnerableFile]), pathChain);
        
        const payload = {
            ...this.getGraphPayload(),
            data: graphData,
            selectedNode: vulnerableFile
        };

        if (this._view) {
            this._view.webview.postMessage(payload);
        }

        for (const panel of this._panels) {
            panel.webview.postMessage(payload);
        }
    }

    public updateGraphData() {
        const payload = this.getGraphPayload();

        if (this._view) {
            this._view.webview.postMessage(payload);
        }

        for (const panel of this._panels) {
            panel.webview.postMessage(payload);
        }
    }


    private getHtmlForWebview(webview: vscode.Webview, isPanel: boolean = false): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Graphify — Repository Map</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
:root {
  /* Default: Premium Slate Light Workstation Theme (#B8C2D1) */
  --c-bg: #B8C2D1;
  --c-grid: rgba(255, 255, 255, 0.06);
  --c-border: rgba(255, 255, 255, 0.15);
  --c-text: #1e293b;
  --c-muted: #475569;
  --c-l0: #8b5cf6; --c-l0-rgb: 139,92,246; /* Entrypoints: Soft Violet */
  --c-l1: #2563eb; --c-l1-rgb: 37,99,235;   /* Controllers: Royal Blue */
  --c-l2: #0d9488; --c-l2-rgb: 13,148,136;   /* Services: Teal */
  --c-l3: #d97706; --c-l3-rgb: 217,119,6;    /* Databases: Amber */
  --c-l4: #059669; --c-l4-rgb: 5,150,105;    /* External APIs: Emerald */
  --c-vuln: #dc2626; --c-vuln-rgb: 220,38,38; /* Vulnerabilities: Red */
  --c-panel-bg: rgba(255, 255, 255, 0.65);
  --c-shadow: rgba(15, 23, 42, 0.12);
}
body.vscode-light {
  --c-bg: #B8C2D1;
  --c-grid: rgba(255, 255, 255, 0.06);
  --c-border: rgba(255, 255, 255, 0.15);
  --c-text: #1e293b;
  --c-muted: #475569;
  --c-l0: #8b5cf6; --c-l0-rgb: 139,92,246;
  --c-l1: #2563eb; --c-l1-rgb: 37,99,235;
  --c-l2: #0d9488; --c-l2-rgb: 13,148,136;
  --c-l3: #d97706; --c-l3-rgb: 217,119,6;
  --c-l4: #059669; --c-l4-rgb: 5,150,105;
  --c-vuln: #dc2626; --c-vuln-rgb: 220,38,38;
  --c-panel-bg: rgba(255, 255, 255, 0.65);
  --c-shadow: rgba(15, 23, 42, 0.12);
}
body.vscode-dark {
  --c-bg: #050816;
  --c-grid: rgba(255, 255, 255, 0.02);
  --c-border: rgba(255, 255, 255, 0.08);
  --c-text: #e2e8f0;
  --c-muted: #64748b;
  --c-l0: #a78bfa; --c-l0-rgb: 167,139,250; /* Entrypoints: Violet */
  --c-l1: #3b82f6; --c-l1-rgb: 59,130,246;   /* Controllers: Blue */
  --c-l2: #06b6d4; --c-l2-rgb: 6,182,212;   /* Services: Cyan */
  --c-l3: #f59e0b; --c-l3-rgb: 245,158,11;   /* Databases: Amber */
  --c-l4: #10b981; --c-l4-rgb: 16,185,129;   /* External APIs: Green */
  --c-vuln: #ef4444; --c-vuln-rgb: 239,68,68; /* Security Findings: Red */
  --c-panel-bg: rgba(5, 8, 22, 0.85);
  --c-shadow: rgba(0, 0, 0, 0.6);
}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
body {
  background: radial-gradient(circle at center, rgba(255, 255, 255, 0.22) 0%, rgba(0, 0, 0, 0.07) 100%), var(--c-bg) !important;
  color: var(--c-text) !important;
  font-family: 'Inter', sans-serif;
  overflow: hidden;
  width: 100vw;
  height: 100vh;
  user-select: none;
}
body.vscode-dark {
  background: radial-gradient(circle at center, rgba(255, 255, 255, 0.04) 0%, rgba(0, 0, 0, 0.5) 100%), var(--c-bg) !important;
}
#canvas{position:absolute;inset:0;width:100%;height:100%;cursor:grab;}
#canvas:active{cursor:grabbing;}
#topbar{position:absolute;top:12px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:8px;background:var(--c-panel-bg);border:1px solid var(--c-border);border-radius:10px;padding:5px 10px;backdrop-filter:blur(12px);z-index:50;box-shadow:0 4px 20px var(--c-shadow);}
.tb-logo{font-size:11px;font-weight:600;color:var(--c-text);padding-right:8px;border-right:1px solid var(--c-border);white-space:nowrap;}
#search{background:transparent;border:none;outline:none;color:var(--c-text);font-size:11px;font-family:'Inter',sans-serif;width:150px;}
#search::placeholder{color:var(--c-muted);}
.tb-sep{width:1px;height:14px;background:var(--c-border);}
.tb-btn{background:transparent;border:1px solid var(--c-border);border-radius:5px;color:var(--c-muted);font-size:10px;font-family:'Inter',sans-serif;padding:3px 7px;cursor:pointer;transition:all 0.15s;}
.tb-btn:hover{color:var(--c-text);border-color:var(--c-text);background:rgba(128,128,128,0.1);}
#legend{position:absolute;bottom:14px;left:14px;display:flex;flex-direction:column;gap:4px;background:var(--c-panel-bg);border:1px solid var(--c-border);border-radius:8px;padding:9px 12px;backdrop-filter:blur(10px);z-index:50;}
.leg-row{display:flex;align-items:center;gap:6px;font-size:10px;color:var(--c-muted);}
.leg-dot{width:6px;height:6px;border-radius:50%;flex-shrink:0;}
#zoom-ctrls{position:absolute;bottom:14px;right:14px;display:flex;flex-direction:column;gap:4px;z-index:50;}
.z-btn{width:26px;height:26px;background:var(--c-panel-bg);border:1px solid var(--c-border);border-radius:5px;color:var(--c-text);font-size:13px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all 0.15s;backdrop-filter:blur(8px);}
.z-btn:hover{color:var(--c-text);border-color:var(--c-text);background:rgba(128,128,128,0.1);}
#inspect{display:none;position:absolute;top:54px;right:12px;width:210px;background:var(--c-panel-bg);border:1px solid var(--c-border);border-radius:10px;padding:12px;backdrop-filter:blur(14px);z-index:50;box-shadow:0 8px 30px var(--c-shadow);}
#inspect-close{float:right;background:none;border:none;color:var(--c-muted);cursor:pointer;font-size:14px;line-height:1;padding:0 2px;}
#inspect-close:hover{color:var(--c-text);}
#inspect-name{font-size:12px;font-weight:600;color:var(--c-text);margin-bottom:8px;word-break:break-all;padding-right:16px;}
.irow{display:flex;justify-content:space-between;align-items:center;font-size:10px;color:var(--c-muted);padding:3px 0;border-bottom:1px solid var(--c-border);}
.irow span:last-child{color:var(--c-text);font-family:'JetBrains Mono',monospace;font-size:9px;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
#inspect-open{margin-top:9px;width:100%;background:rgba(14,165,233,0.1);border:1px solid rgba(14,165,233,0.25);border-radius:5px;color:var(--c-l1);font-size:10px;padding:5px;cursor:pointer;transition:all 0.15s;}
#inspect-open:hover{background:rgba(14,165,233,0.18);}
#sec-badge{display:none;position:absolute;top:54px;left:12px;min-width:160px;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.3);border-radius:8px;padding:9px 12px;font-size:10px;color:var(--c-vuln);z-index:50;backdrop-filter:blur(10px);}
#sec-badge b{display:block;margin-bottom:3px;font-size:11px;}
#sec-clear{margin-top:6px;background:none;border:1px solid rgba(239,68,68,0.28);border-radius:4px;color:var(--c-vuln);font-size:9px;padding:3px 8px;cursor:pointer;width:100%;}
#tooltip{position:absolute;display:none;background:var(--c-panel-bg);border:1px solid var(--c-border);border-radius:7px;padding:7px 10px;font-size:10px;color:var(--c-text);pointer-events:none;z-index:100;box-shadow:0 6px 20px var(--c-shadow);max-width:220px;}
#tooltip b{display:block;color:var(--c-text);margin-bottom:3px;font-size:11px;}
::-webkit-scrollbar{width:3px;}
::-webkit-scrollbar-thumb{background:var(--c-border);border-radius:2px;}

/* Sidebar Mode Specific Adjustments */
.is-sidebar #topbar {
  width: calc(100% - 24px);
  left: 12px;
  transform: none;
  justify-content: space-between;
  padding: 5px 8px;
}
.is-sidebar .tb-logo {
  display: none;
}
.is-sidebar .tb-sep {
  display: none;
}
.is-sidebar #search {
  width: 80px;
  flex-grow: 1;
  min-width: 50px;
}
.is-sidebar .btn-text {
  display: none;
}
.is-sidebar .tb-btn {
  padding: 3px 5px;
  font-size: 11px;
}
.is-sidebar #legend {
  max-height: 26px;
  max-width: 80px;
  overflow: hidden;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  cursor: pointer;
}
.is-sidebar #legend::before {
  content: "ℹ️ Legend";
  font-size: 9px;
  font-weight: 600;
  color: var(--c-text);
  white-space: nowrap;
  display: block;
}
.is-sidebar #legend:hover {
  max-height: 160px;
  max-width: 170px;
}
.is-sidebar #legend .leg-row {
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s ease;
}
.is-sidebar #legend:hover .leg-row {
  opacity: 1;
  pointer-events: auto;
}
.is-sidebar #inspect {
  left: 12px;
  right: 12px;
  width: auto;
  top: 50px;
}
.is-sidebar #sec-badge {
  left: 12px;
  right: 12px;
  min-width: 0;
  top: 50px;
}
</style>
</head>
<body class="${!isPanel ? 'is-sidebar' : 'is-full'}">
<canvas id="canvas"></canvas>
<div id="topbar">
  <span class="tb-logo">Graphify</span>
  <input id="search" type="text" placeholder="Search nodes…" autocomplete="off">
  <div class="tb-sep"></div>
  ${!isPanel ? '<button class="tb-btn" id="btn-fs" title="Full Screen">⛶ <span class="btn-text">Full Screen</span></button>' : ''}
  <button class="tb-btn" id="btn-rebuild" title="Rebuild Index">↺ <span class="btn-text">Rebuild</span></button>
  <button class="tb-btn" id="btn-copy-ai" title="Copy Context">📋 <span class="btn-text">Copy Context</span></button>
  <button class="tb-btn" id="btn-copy-map" title="Copy Repo Map">📋 <span class="btn-text">Copy Repo Map</span></button>
</div>
<div id="legend">
  <div class="leg-row"><span class="leg-dot" style="background:var(--c-l0)"></span>Entrypoints</div>
  <div class="leg-row"><span class="leg-dot" style="background:var(--c-l1)"></span>Controllers</div>
  <div class="leg-row"><span class="leg-dot" style="background:var(--c-l2)"></span>Services</div>
  <div class="leg-row"><span class="leg-dot" style="background:var(--c-l3)"></span>Databases</div>
  <div class="leg-row"><span class="leg-dot" style="background:var(--c-l4)"></span>External APIs</div>
  <div class="leg-row"><span class="leg-dot" style="background:var(--c-vuln)"></span>Security Findings</div>
</div>
<div id="zoom-ctrls">
  <button class="z-btn" id="btn-zi">+</button>
  <button class="z-btn" id="btn-zo">−</button>
  <button class="z-btn" id="btn-zf" title="Fit">⛶</button>
</div>
<div id="inspect">
  <button id="inspect-close">×</button>
  <div id="inspect-name">—</div>
  <div class="irow"><span>Type</span><span id="ip-type">—</span></div>
  <div class="irow"><span>Language</span><span id="ip-lang">—</span></div>
  <div class="irow"><span>Lines</span><span id="ip-lines">—</span></div>
  <div class="irow"><span>Connections</span><span id="ip-conn">—</span></div>
  <div class="irow"><span>Path</span><span id="ip-path">—</span></div>
  <button id="inspect-open">Open File</button>
</div>
<div id="sec-badge">
  <b id="sec-title">⚠ Vulnerability Path</b>
  <span id="sec-desc"></span>
  <button id="sec-clear">Clear</button>
</div>
<div id="tooltip"></div><script>
const vscode = acquireVsCodeApi();
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const tooltip = document.getElementById('tooltip');

// ── Theme adaptation ──────────────────────────────────────
const colors = {
    bg: '#B8C2D1',
    grid: 'rgba(255, 255, 255, 0.06)',
    border: 'rgba(255, 255, 255, 0.15)',
    text: '#1e293b',
    muted: '#475569',
    vuln: '#dc2626',
    vulnRgb: '220, 38, 38',
    layers: ['#8b5cf6', '#2563eb', '#0d9488', '#d97706', '#059669'],
    layersRgb: ['139,92,246', '37,99,235', '13,148,136', '217,119,6', '5,150,105']
};

function updateThemeColors() {
    try {
        const style = getComputedStyle(document.body);
        const bgVal = style.getPropertyValue('--c-bg').trim();
        if (bgVal) colors.bg = bgVal;
        
        const gridVal = style.getPropertyValue('--c-grid').trim();
        if (gridVal) colors.grid = gridVal;
        
        const borderVal = style.getPropertyValue('--c-border').trim();
        if (borderVal) colors.border = borderVal;
        
        const textVal = style.getPropertyValue('--c-text').trim();
        if (textVal) colors.text = textVal;
        
        const mutedVal = style.getPropertyValue('--c-muted').trim();
        if (mutedVal) colors.muted = mutedVal;
        
        const vulnVal = style.getPropertyValue('--c-vuln').trim();
        if (vulnVal) colors.vuln = vulnVal;
        
        const vulnRgbVal = style.getPropertyValue('--c-vuln-rgb').trim();
        if (vulnRgbVal) colors.vulnRgb = vulnRgbVal;
        
        for (let i = 0; i < 5; i++) {
            const lVal = style.getPropertyValue('--c-l' + i).trim();
            if (lVal) colors.layers[i] = lVal;
            const lRgbVal = style.getPropertyValue('--c-l' + i + '-rgb').trim();
            if (lRgbVal) colors.layersRgb[i] = lRgbVal;
        }
    } catch (e) {
        console.error('Error reading CSS variables:', e);
    }
}

updateThemeColors();
const themeObserver = new MutationObserver(() => {
    updateThemeColors();
});
themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });

// ── State ────────────────────────────────────────────────
let rawNodes = [], rawEdges = [], filteredNodes = [], filteredEdges = [];
let findings = [], stats = {};
let searchQuery = '';
let selectedNodeId = null, hoveredNode = null;
let hoveredConns = new Set(), hoveredNeighbors = new Set();
let focusLock = false;
let activeAttackPath = null, attackPathNodes = new Set(), attackPathEdges = new Set();
let currentOpenFile = null;

// Camera
let transform = { x: 0, y: 0, k: 1 };
let isDragging = false, startDrag = { x: 0, y: 0 };
let targetTransform = null;

// ── Button wiring ─────────────────────────────────────────
const fsBtn = document.getElementById('btn-fs');
if (fsBtn) fsBtn.addEventListener('click', () => vscode.postMessage({ command: 'openFullScreen' }));
document.getElementById('btn-rebuild').addEventListener('click', () => vscode.postMessage({ command: 'rebuildIndex' }));
document.getElementById('btn-copy-ai').addEventListener('click', () => vscode.postMessage({ command: 'copyAIContext' }));
document.getElementById('btn-copy-map').addEventListener('click', () => vscode.postMessage({ command: 'copyRepoMap' }));
document.getElementById('btn-zi').addEventListener('click', () => doZoom(1.3));
document.getElementById('btn-zo').addEventListener('click', () => doZoom(1 / 1.3));
document.getElementById('btn-zf').addEventListener('click', centerGraph);
document.getElementById('inspect-close').addEventListener('click', deselect);
document.getElementById('inspect-open').addEventListener('click', () => {
    if (currentOpenFile) vscode.postMessage({ command: 'openFile', filePath: currentOpenFile });
});
document.getElementById('sec-clear').addEventListener('click', clearSecurityPath);

document.getElementById('search').addEventListener('input', e => {
    searchQuery = e.target.value.toLowerCase();
});

// ── Messages from extension ───────────────────────────────
window.addEventListener('message', ev => {
    const msg = ev.data;
    if (msg.type === 'setGraphData') {
        rawNodes = msg.data.nodes || [];
        rawEdges = msg.data.edges || [];
        findings  = msg.findings || [];
        stats     = msg.stats || {};
        if (msg.selectedNode) selectedNodeId = msg.selectedNode;
        applyLayout(true);
        updateSecBadge();
    } else if (msg.type === 'setSecurityPath') {
        activeAttackPath = msg.attackPath;
        selectedNodeId   = msg.selectedNode;
        attackPathNodes.clear(); attackPathEdges.clear();
        if (activeAttackPath) {
            activeAttackPath.steps.forEach(s => attackPathNodes.add(s.file));
            for (let i = 0; i < activeAttackPath.steps.length - 1; i++) {
                attackPathEdges.add(activeAttackPath.steps[i].file + '->' + activeAttackPath.steps[i+1].file);
            }
        }
        updateSecBadge();
        applyLayout(false);
    }
});

function updateSecBadge() {
    const badge = document.getElementById('sec-badge');
    if (activeAttackPath) {
        badge.style.display = 'block';
        document.getElementById('sec-title').textContent = '\u26a0 ' + (activeAttackPath.vulnerabilityType || 'Vulnerability');
        document.getElementById('sec-desc').textContent = (activeAttackPath.severity || '').toUpperCase() + ' \u2022 ' + activeAttackPath.steps.length + ' hops';
    } else {
        badge.style.display = 'none';
    }
}

function clearSecurityPath() {
    activeAttackPath = null;
    attackPathNodes.clear(); attackPathEdges.clear();
    updateSecBadge();
    vscode.postMessage({ command: 'requestUpdate' });
}

// ── Layer classification ──────────────────────────────────
function getLayer(node) {
    const lbl  = node.label.toLowerCase();
    const p    = (node.path || '').toLowerCase();
    if (node.type === 'entrypoint' || p.includes('index.') || p.includes('main.') || p.includes('app.') || p.includes('server.') || p.includes('extension.')) return 0;
    if (node.type === 'api' || p.includes('controller') || p.includes('handler') || p.includes('route') || p.includes('api/') || lbl.includes('controller') || lbl.includes('handler') || lbl.includes('route')) return 1;
    if (node.type === 'database' || p.includes('schema') || p.includes('model') || p.includes('db') || p.includes('repository') || p.includes('entity') || lbl.includes('model') || lbl.includes('schema') || lbl.includes('db')) return 3;
    if (node.type === 'service' || p.includes('service') || p.includes('provider') || p.includes('manager') || lbl.includes('service') || lbl.includes('provider') || lbl.includes('manager')) return 2;
    return 4;
}

// ── Layout engine (vertical neural-network columns) ────────
function applyLayout(isUpdate) {
    if (rawNodes.length === 0) return;

    const groups = [[], [], [], [], []];
    rawNodes.forEach(n => { n.layerIndex = getLayer(n); groups[n.layerIndex].push(n); });

    // Tight neural-net spacing
    const colGap = 280;    // horizontal distance between layers
    const rowGap = 58;     // vertical distance between nodes in a layer

    groups.forEach((grp, li) => {
        grp.sort((a, b) => a.id.localeCompare(b.id));
        const count = grp.length;
        if (count === 0) return;

        // Multi-column wrapping within each layer band
        let cols = 1;
        if (count > 14) cols = 2;
        if (count > 30) cols = 3;
        const rows = Math.ceil(count / cols);
        const subGap = 60;

        grp.forEach((n, idx) => {
            const col = idx % cols;
            const row = Math.floor(idx / cols);
            n.targetX = (li - 2) * colGap + (col - (cols - 1) / 2) * subGap;
            n.targetY = (row - (rows - 1) / 2) * rowGap;

            // Node radius by importance
            if      (n.type === 'entrypoint') n.radius = 16;
            else if (n.type === 'database')   n.radius = 13;
            else if (n.type === 'service')    n.radius = 11;
            else if (n.type === 'api')        n.radius = 10;
            else                              n.radius = 8;
        });
    });

    // Smooth transition: keep previous positions for interpolation
    const nextMap = new Map(rawNodes.map(n => [n.id, n]));
    const prevMap = new Map(filteredNodes.map(n => [n.id, n]));

    filteredNodes = rawNodes.map(n => {
        const prev = prevMap.get(n.id);
        n.x       = prev ? prev.x       : n.targetX;
        n.y       = prev ? prev.y       : n.targetY;
        n.opacity = prev ? prev.opacity : 0;
        n.targetOpacity = 1;
        return n;
    });

    const nodeSet = new Set(filteredNodes.map(n => n.id));
    filteredEdges = rawEdges.filter(e => nodeSet.has(e.source) && nodeSet.has(e.target)).map(e => {
        const prev = filteredEdges.find(pe => pe.id === e.id);
        e.opacity = prev ? prev.opacity : 0;
        e.targetOpacity = 1;
        return e;
    });

    rebuildHighlight();
    if (!isUpdate) centerGraph();
}

// ── Highlight helpers ─────────────────────────────────────
function rebuildHighlight() {
    hoveredConns.clear(); hoveredNeighbors.clear();
    const pivot = hoveredNode || filteredNodes.find(n => n.id === selectedNodeId);
    if (!pivot) return;
    hoveredNeighbors.add(pivot.id);
    filteredEdges.forEach(e => {
        if (e.source === pivot.id) { hoveredConns.add(e.id); hoveredNeighbors.add(e.target); }
        if (e.target === pivot.id) { hoveredConns.add(e.id); hoveredNeighbors.add(e.source); }
    });
}
// ── Camera helpers ────────────────────────────────────────
function screenToWorld(cx, cy) {
    const r = canvas.getBoundingClientRect();
    return { x: (cx - r.left - transform.x) / transform.k, y: (cy - r.top - transform.y) / transform.k };
}
function doZoom(f) {
    const cx = canvas.width / 2, cy = canvas.height / 2;
    const w = { x: (cx - transform.x) / transform.k, y: (cy - transform.y) / transform.k };
    transform.k = Math.max(0.06, Math.min(transform.k * f, 5));
    transform.x = cx - w.x * transform.k;
    transform.y = cy - w.y * transform.k;
    targetTransform = null;
}
function centerGraph() {
    if (filteredNodes.length === 0) return;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    filteredNodes.forEach(n => { if(n.targetX < minX) minX=n.targetX; if(n.targetX > maxX) maxX=n.targetX; if(n.targetY < minY) minY=n.targetY; if(n.targetY > maxY) maxY=n.targetY; });
    const gw = maxX - minX || 1, gh = maxY - minY || 1;
    const vw = canvas.width - 60, vh = canvas.height - 60;
    const k = Math.max(0.1, Math.min(1.4, Math.min(vw / gw, vh / gh) * 0.88));
    targetTransform = { x: vw/2 + 30 - (minX + gw/2)*k, y: vh/2 + 30 - (minY + gh/2)*k, k };
}
function resize() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    centerGraph();
}
window.addEventListener('resize', resize);
resize();

// ── Deselect / inspect panel ──────────────────────────────
function deselect() {
    selectedNodeId = null; hoveredNode = null; focusLock = false;
    hoveredConns.clear(); hoveredNeighbors.clear();
    document.getElementById('inspect').style.display = 'none';
}
function showInspect(node) {
    currentOpenFile = node.id;
    document.getElementById('inspect-name').textContent = node.label;
    document.getElementById('ip-type').textContent  = node.type.toUpperCase();
    document.getElementById('ip-lang').textContent  = node.language || '—';
    document.getElementById('ip-lines').textContent = node.lines || '—';
    let ins = 0, outs = 0;
    filteredEdges.forEach(e => { if (e.source === node.id) outs++; if (e.target === node.id) ins++; });
    document.getElementById('ip-conn').textContent = ins + ' in / ' + outs + ' out';
    document.getElementById('ip-path').textContent = node.path || node.id;
    document.getElementById('inspect').style.display = 'block';
}

// ── Mouse interactions ────────────────────────────────────
canvas.addEventListener('mousedown', e => {
    const w = screenToWorld(e.clientX, e.clientY);
    const hit = filteredNodes.find(n => {
        const nx = n.currentX !== undefined ? n.currentX : n.x;
        const ny = n.currentY !== undefined ? n.currentY : n.y;
        const dx = nx - w.x, dy = ny - w.y;
        return dx * dx + dy * dy < (n.radius + 8) * (n.radius + 8);
    });
    if (hit) {
        selectedNodeId = hit.id; focusLock = false;
        vscode.postMessage({ command: 'openFile', filePath: hit.id });
        hoveredNode = hit; rebuildHighlight(); showInspect(hit);
        targetTransform = { x: canvas.width/2 - hit.x*1.2, y: canvas.height/2 - hit.y*1.2, k: 1.2 };
    } else {
        isDragging = true;
        startDrag = { x: e.clientX - transform.x, y: e.clientY - transform.y };
        targetTransform = null;
        deselect();
    }
});
canvas.addEventListener('dblclick', e => {
    const w = screenToWorld(e.clientX, e.clientY);
    const hit = filteredNodes.find(n => {
        const nx = n.currentX !== undefined ? n.currentX : n.x;
        const ny = n.currentY !== undefined ? n.currentY : n.y;
        const dx = nx - w.x, dy = ny - w.y;
        return dx * dx + dy * dy < (n.radius + 8) * (n.radius + 8);
    });
    if (hit) {
        focusLock = true; selectedNodeId = hit.id;
        // Expand to full dependency chain
        const chain = new Set([hit.id]);
        const vis = new Set();
        function walk(id) { if (vis.has(id)) return; vis.add(id); filteredEdges.forEach(e => { if (e.source===id) { chain.add(e.target); walk(e.target); } if (e.target===id) { chain.add(e.source); walk(e.source); } }); }
        walk(hit.id);
        hoveredNeighbors = chain;
        hoveredConns.clear();
        filteredEdges.forEach(e => { if (chain.has(e.source) && chain.has(e.target)) hoveredConns.add(e.id); });
        showInspect(hit);
    }
});
canvas.addEventListener('mousemove', e => {
    if (isDragging) { transform.x = e.clientX - startDrag.x; transform.y = e.clientY - startDrag.y; return; }
    const w = screenToWorld(e.clientX, e.clientY);
    const hov = filteredNodes.find(n => {
        const nx = n.currentX !== undefined ? n.currentX : n.x;
        const ny = n.currentY !== undefined ? n.currentY : n.y;
        const dx = nx - w.x, dy = ny - w.y;
        return dx * dx + dy * dy < (n.radius + 8) * (n.radius + 8);
    });
    if (hov) {
        canvas.style.cursor = 'pointer';
        tooltip.style.display = 'block';
        tooltip.style.left = (e.clientX + 14) + 'px';
        tooltip.style.top  = (e.clientY + 14) + 'px';
        let ins=0, outs=0;
        filteredEdges.forEach(e2 => { if(e2.source===hov.id) outs++; if(e2.target===hov.id) ins++; });
        tooltip.innerHTML = '<b>' + hov.label + '</b>' + hov.type.toUpperCase() + ' &bull; ' + (hov.language||'') + '<br><span style="color:var(--c-muted)">In: ' + ins + ' &nbsp; Out: ' + outs + '</span>';
        if (!focusLock) { hoveredNode = hov; rebuildHighlight(); }
    } else {
        canvas.style.cursor = isDragging ? 'grabbing' : 'grab';
        tooltip.style.display = 'none';
        if (!focusLock) { hoveredNode = null; rebuildHighlight(); }
    }
});
window.addEventListener('mouseup', () => { isDragging = false; });
canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const f = e.deltaY < 0 ? 1.1 : 1/1.1;
    const w = screenToWorld(e.clientX, e.clientY);
    transform.k = Math.max(0.06, Math.min(transform.k * f, 5));
    const r = canvas.getBoundingClientRect();
    transform.x = (e.clientX - r.left) - w.x * transform.k;
    transform.y = (e.clientY - r.top)  - w.y * transform.k;
    targetTransform = null;
}, { passive: false });
// ── Node color helpers ────────────────────────────────────
function nodeColor(n) {
    if (n.isVulnerable) return colors.vuln;
    return colors.layers[n.layerIndex ?? 4] || colors.muted;
}
function nodeRGBA(n, a) {
    if (n.isVulnerable) return "rgba(" + colors.vulnRgb + "," + a + ")";
    const c = colors.layersRgb[n.layerIndex ?? 4] || '148,163,184';
    return "rgba(" + c + "," + a + ")";
}

// ── Grid drawing ──────────────────────────────────────────
function drawGrid(vl, vt, vr, vb) {
    const sz = 80;
    ctx.strokeStyle = colors.grid;
    ctx.lineWidth = 1 / transform.k;
    ctx.beginPath();
    for (let x = Math.floor(vl/sz)*sz; x <= vr+sz; x += sz) { ctx.moveTo(x, vt); ctx.lineTo(x, vb); }
    for (let y = Math.floor(vt/sz)*sz; y <= vb+sz; y += sz) { ctx.moveTo(vl, y); ctx.lineTo(vr, y); }
    ctx.stroke();
}

// ── Organic Drift Helper (Multi-frequency slow sines) ─────
function getDrift(time, seed, maxDrift) {
    const freq1 = 0.32 + (seed % 7) * 0.025;
    const freq2 = 0.15 + ((seed >> 2) % 5) * 0.02;
    const freq3 = 0.08 + ((seed >> 4) % 3) * 0.015;

    const s1 = Math.sin(time * freq1 + (seed * 0.71)) * 1.0;
    const s2 = Math.sin(time * freq2 + (seed * 1.37)) * 0.5;
    const s3 = Math.sin(time * freq3 + (seed * 2.19)) * 0.25;

    return ((s1 + s2 + s3) / 1.75) * maxDrift;
}

// ── Particle drawing helper ──────────────────────────────
function drawParticleOnCurve(pts, t, pAlpha, pRadius) {
    if (!ctx || !pts || pts.length === 0 || t === undefined || t === null) return;
    if (t < 0 || t > 1) return;
    
    const totalPts = pts.length;
    const idx = t * (totalPts - 1);
    const currIdx = Math.floor(idx);
    const nextIdx = Math.min(totalPts - 1, currIdx + 1);
    const f = idx - currIdx;
    
    const px = pts[currIdx].x * (1 - f) + pts[nextIdx].x * f;
    const py = pts[currIdx].y * (1 - f) + pts[nextIdx].y * f;
    
    ctx.beginPath();
    ctx.arc(px, py, pRadius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, ' + pAlpha + ')';
    ctx.fill();
}

// ── Layer column guides ───────────────────────────────────
const COL_LABELS = ['ENTRYPOINTS','CONTROLLERS','SERVICES','DATABASES','EXTERNAL APIS'];
function drawLayerGuides(vt, vb) {
    const colGap = 280;
    for (let i = 0; i < 5; i++) {
        const cx = (i - 2) * colGap;
        // Faint vertical dashed guide
        if (i > 0) {
            ctx.strokeStyle = colors.grid;
            ctx.lineWidth = 1;
            ctx.setLineDash([5, 10]);
            ctx.beginPath();
            ctx.moveTo(cx - colGap/2, vt - 200);
            ctx.lineTo(cx - colGap/2, vb + 200);
            ctx.stroke();
            ctx.setLineDash([]);
        }
        // Layer label at top
        ctx.fillStyle = colors.layers[i];
        ctx.globalAlpha = 0.35;
        ctx.font = 'bold 9px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(COL_LABELS[i], cx, vt - 60);
        ctx.globalAlpha = 1;
    }
}

// ── Main render loop ──────────────────────────────────────
function draw(ts) {
    // Smooth camera animation
    if (targetTransform) {
        transform.x += (targetTransform.x - transform.x) * 0.1;
        transform.y += (targetTransform.y - transform.y) * 0.1;
        transform.k += (targetTransform.k - transform.k) * 0.1;
        if (Math.abs(targetTransform.x-transform.x) < 0.2 && Math.abs(targetTransform.y-transform.y) < 0.2 && Math.abs(targetTransform.k-transform.k) < 0.004) {
            Object.assign(transform, targetTransform); targetTransform = null;
        }
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // World bounds for culling
    const vl = -transform.x / transform.k;
    const vt = -transform.y / transform.k;
    const vr = (canvas.width  - transform.x) / transform.k;
    const vb = (canvas.height - transform.y) / transform.k;

    // Grid (screen space)
    ctx.save();
    ctx.translate(transform.x, transform.y);
    ctx.scale(transform.k, transform.k);
    drawGrid(vl, vt, vr, vb);
    ctx.restore();

    ctx.save();
    ctx.translate(transform.x, transform.y);
    ctx.scale(transform.k, transform.k);

    // Layer guide lines + labels
    if (filteredNodes.length > 0) drawLayerGuides(vt, vb);

    // Interpolate positions and opacity
    filteredNodes.forEach(n => {
        n.x += (n.targetX - n.x) * 0.09;
        n.y += (n.targetY - n.y) * 0.09;
        n.opacity += (n.targetOpacity - n.opacity) * 0.12;

        // Nodes remain static as requested, only connections animate
        n.currentX = n.x;
        n.currentY = n.y;
    });
    filteredEdges.forEach(e => { e.opacity += (e.targetOpacity - e.opacity) * 0.1; });

    // ── Draw edges ────────────────────────────────────────
    filteredEdges.forEach(e => {
        const src = filteredNodes.find(n => n.id === e.source);
        const tgt = filteredNodes.find(n => n.id === e.target);
        if (!src || !tgt) return;

        const srcX = src.currentX !== undefined ? src.currentX : src.x;
        const srcY = src.currentY !== undefined ? src.currentY : src.y;
        const tgtX = tgt.currentX !== undefined ? tgt.currentX : tgt.x;
        const tgtY = tgt.currentY !== undefined ? tgt.currentY : tgt.y;

        // Cull off-screen edges
        const pad = 60;
        if (srcX < vl-pad && tgtX < vl-pad) return;
        if (srcX > vr+pad && tgtX > vr+pad) return;
        if (srcY < vt-pad && tgtY < vt-pad) return;
        if (srcY > vb+pad && tgtY > vb+pad) return;

        const isSecPath = attackPathEdges.has(e.id) || e.type === 'security-path';

        // Hash the edge ID to get deterministic pseudo-random values
        let hash = 0;
        const eid = e.id || '';
        for (let i = 0; i < eid.length; i++) {
            hash = (hash << 5) - hash + eid.charCodeAt(i);
            hash |= 0;
        }
        const seed = Math.abs(hash);

        // Edge-specific wave parameters
        const phaseOffset1 = (seed % 100) * 0.0628;
        const phaseOffset2 = ((seed >> 2) % 100) * 0.0628;

        const dist = Math.hypot(tgtX - srcX, tgtY - srcY);
        const scaleFactor = Math.min(1.0, dist / 120);

        // Ambient sway for control points (slow organic drifting) - increased drift values
        const time = ts * 0.001;
        const maxDrift = Math.max(30, Math.min(100, dist * 0.35)) * scaleFactor;

        const cp1X = getDrift(time, seed, maxDrift);
        const cp1Y = getDrift(time + 120, seed + 13, maxDrift);
        const cp2X = getDrift(time + 240, seed + 27, maxDrift);
        const cp2Y = getDrift(time + 360, seed + 39, maxDrift);

        const dx = tgtX - srcX;
        const dy = tgtY - srcY;
        const p0x = srcX, p0y = srcY;
        const p1x = srcX + dx * 0.35 + cp1X;
        const p1y = srcY + dy * 0.2 + cp1Y;
        const p2x = srcX + dx * 0.65 + cp2X;
        const p2y = srcY + dy * 0.8 + cp2Y;
        const p3x = tgtX, p3y = tgtY;

        // Keep all connections white as requested
        // Normal: rgba(255,255,255,0.25)
        // Glow: rgba(255,255,255,0.45)
        // Hover/Focused: rgba(255,255,255,0.8)
        // Selected: rgba(255,255,255,1)
        let threadColor = 'rgba(255, 255, 255, ' + (0.25 * e.opacity) + ')'; // Normal
        let glowColor = null;
        let lineWidth = 1.0;
        let glowWidth = 3.0;

        if (activeAttackPath) {
            if (isSecPath) {
                threadColor = 'rgba(255, 255, 255, ' + (1.0 * e.opacity) + ')'; // Selected
                glowColor = 'rgba(255, 255, 255, ' + (0.45 * e.opacity) + ')'; // Glow
                lineWidth = 2.0;
                glowWidth = 5.0;
            } else {
                threadColor = 'rgba(255, 255, 255, ' + (0.05 * e.opacity) + ')'; // Fade unrelated
                lineWidth = 0.5;
            }
        } else if (selectedNodeId || hoveredNode) {
            if (hoveredConns.has(e.id)) {
                const isDirect = (hoveredNode && (e.source === hoveredNode.id || e.target === hoveredNode.id)) ||
                                 (selectedNodeId && !hoveredNode && (e.source === selectedNodeId || e.target === selectedNodeId));
                
                if (isDirect) {
                    threadColor = 'rgba(255, 255, 255, ' + (1.0 * e.opacity) + ')'; // Selected
                    glowColor = 'rgba(255, 255, 255, ' + (0.45 * e.opacity) + ')'; // Glow
                    lineWidth = 2.0;
                    glowWidth = 4.5;
                } else {
                    threadColor = 'rgba(255, 255, 255, ' + (0.8 * e.opacity) + ')'; // Hover/Focused
                    glowColor = 'rgba(255, 255, 255, ' + (0.45 * e.opacity) + ')'; // Glow
                    lineWidth = 1.5;
                    glowWidth = 3.5;
                }
            } else {
                threadColor = 'rgba(255, 255, 255, ' + (0.05 * e.opacity) + ')'; // Fade unrelated
                lineWidth = 0.5;
            }
        }

        // Subdivide Bezier curve to apply organic path deformation (gentle bowing/drift) - increased amplitude
        const N = Math.max(16, Math.min(45, Math.floor(dist / 10)));
        const pts = [];
        for (let i = 0; i <= N; i++) {
            const t = i / N;
            const mt = 1 - t;
            
            const bx = mt*mt*mt*p0x + 3*mt*mt*t*p1x + 3*mt*t*t*p2x + t*t*t*p3x;
            const by = mt*mt*mt*p0y + 3*mt*mt*t*p1y + 3*mt*t*t*p2y + t*t*t*p3y;
            
            const dbx = 3*mt*mt*(p1x - p0x) + 6*mt*t*(p2x - p1x) + 3*t*t*(p3x - p2x);
            const dby = 3*mt*mt*(p1y - p0y) + 6*mt*t*(p2y - p1y) + 3*t*t*(p3y - p2y);
            
            const len = Math.hypot(dbx, dby);
            const nx = len > 0.001 ? -dby / len : 0;
            const ny = len > 0.001 ? dbx / len : 0;
            
            const envelope = Math.sin(Math.PI * t);
            const breezeFreq = 0.38 + (seed % 3) * 0.06;
            const breezeWave = Math.sin(time * breezeFreq + phaseOffset1) * 24 * scaleFactor;
            
            pts.push({
                x: bx + nx * envelope * breezeWave,
                y: by + ny * envelope * breezeWave
            });
        }

        // 1. Draw Glow Thread
        if (glowColor) {
            ctx.beginPath();
            ctx.moveTo(pts[0].x, pts[0].y);
            for (let i = 1; i <= N; i++) {
                ctx.lineTo(pts[i].x, pts[i].y);
            }
            ctx.strokeStyle = glowColor;
            ctx.lineWidth = glowWidth;
            ctx.stroke();
        }

        // 2. Draw Foreground Thread
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i <= N; i++) {
            ctx.lineTo(pts[i].x, pts[i].y);
        }
        ctx.strokeStyle = threadColor;
        ctx.lineWidth = lineWidth;
        ctx.stroke();

        // ── Draw animated particles along curves ────────────────
        if (dist > 20) {
            let speed = 12;       // very slow, drift speed
            let spacing = 180;    // sparse spacing
            let pAlpha = 0.25 * e.opacity;
            let pRadius = 0.8;
            
            if (activeAttackPath) {
                if (isSecPath) {
                    speed = 20;
                    spacing = 100;
                    pAlpha = 0.7 * e.opacity;
                    pRadius = 1.0;
                } else {
                    pAlpha = 0.02 * e.opacity;
                }
            } else if (selectedNodeId || hoveredNode) {
                if (hoveredConns.has(e.id)) {
                    speed = 18;
                    spacing = 120;
                    pAlpha = 0.6 * e.opacity;
                    pRadius = 1.0;
                } else {
                    pAlpha = 0.02 * e.opacity;
                }
            }
            
            if (pAlpha > 0.01) {
                const timeInSec = ts / 1000;
                const distTraveled = timeInSec * speed + (seed % 100);
                
                const numParticles = Math.max(1, Math.floor(dist / spacing));
                for (let j = 0; j < numParticles; j++) {
                    const d = (distTraveled + j * spacing) % dist;
                    const t = d / dist;
                    
                    drawParticleOnCurve(pts, t, pAlpha, pRadius);
                }
            }
        }
    });

    // ── Draw nodes ────────────────────────────────────────
    filteredNodes.forEach(n => {
        const nx = n.currentX !== undefined ? n.currentX : n.x;
        const ny = n.currentY !== undefined ? n.currentY : n.y;
        const margin = n.radius + 30;
        if (nx < vl-margin || nx > vr+margin || ny < vt-margin || ny > vb+margin) return;

        const isSecNode  = attackPathNodes.has(n.id);
        const isSelected = n.id === selectedNodeId;
        const isHovered  = hoveredNode && hoveredNode.id === n.id;
        const col        = nodeColor(n);

        let alpha = 0.85 * n.opacity;
        if (activeAttackPath) {
            alpha = isSecNode ? 1.0 : 0.05;
        } else if (selectedNodeId || hoveredNode) {
            alpha = hoveredNeighbors.has(n.id) ? 1.0 : 0.05;
        }

        // Scale factors: scale slightly on hover, or if selected
        const scaleFactor = isHovered ? 1.25 : (isSelected ? 1.15 : 1.0);

        // Subtle breath/pulse (only on important nodes or when hovered/selected)
        const imp = n.type === 'entrypoint' || n.type === 'database' || n.isVulnerable;
        const breath = imp ? 1 + 0.03 * Math.sin(ts * 0.0015 + ny * 0.01) : 1;
        const r = n.radius * breath * scaleFactor;

        ctx.globalAlpha = alpha;

        // 1. Soft outer glow around nodes
        if (alpha > 0.08) {
            ctx.beginPath();
            ctx.arc(nx, ny, r * 2.2, 0, Math.PI * 2);
            ctx.fillStyle = col;
            ctx.globalAlpha = (n.isVulnerable || isSecNode) ? alpha * 0.22 : alpha * 0.12;
            ctx.fill();
            ctx.globalAlpha = alpha;
        }

        // 2. Vulnerability pulse/aura overlay
        if ((n.isVulnerable || isSecNode) && alpha > 0.1) {
            const pulse = (ts % 1800) / 1800;

            // Extra soft red glow ring expanding outward
            ctx.beginPath();
            ctx.arc(nx, ny, r + pulse * 22, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(239, 68, 68, ' + (0.75 * (1 - pulse)) + ')';
            ctx.lineWidth   = 1.5;
            ctx.stroke();
        }

        // 3. Node Fill — clean, premium glass/radial gradient
        const g = ctx.createRadialGradient(nx - r * 0.2, ny - r * 0.2, r * 0.1, nx, ny, r);
        g.addColorStop(0, '#ffffff');
        g.addColorStop(0.35, col);
        g.addColorStop(1, 'rgba(10, 10, 20, 0.6)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(nx, ny, r, 0, Math.PI * 2);
        ctx.fill();

        // 4. Border ring
        ctx.beginPath();
        ctx.arc(nx, ny, r, 0, Math.PI * 2);
        if (isSelected) {
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2.0;
        } else if (isHovered) {
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.5;
        } else if (n.isVulnerable || isSecNode) {
            ctx.strokeStyle = colors.vuln;
            ctx.lineWidth = 1.8;
        } else {
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
            ctx.lineWidth = 1.0;
        }
        ctx.stroke();

        // 5. Label (always white, with high contrast drop shadow)
        const isSearched    = searchQuery && n.label.toLowerCase().includes(searchQuery);
        const isHighlighted = (selectedNodeId || hoveredNode) && hoveredNeighbors.has(n.id);
        if (isSearched || isHighlighted || imp || isSelected || isHovered) {
            ctx.fillStyle  = isSelected || isSearched || isHovered || isHighlighted ? colors.text : colors.muted;
            ctx.font       = isHighlighted || isSelected || isHovered ? 'bold 10px Inter,sans-serif' : '9px Inter,sans-serif';
            ctx.textAlign  = 'center';
            ctx.shadowColor = colors.bg;
            ctx.shadowBlur = 6;
            ctx.fillText(n.label, nx, ny + r + 13);
            ctx.shadowBlur = 0;
        }

        ctx.globalAlpha = 1.0;
    });

    ctx.restore();
    requestAnimationFrame(draw);
}

// Kick off
requestAnimationFrame(draw);
</script>
</body>
</html>`;
    }
}