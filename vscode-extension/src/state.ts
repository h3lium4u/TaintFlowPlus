
import * as vscode from 'vscode';
import { TaintFlowEngine, Finding } from './taintflow-core';
import { RepositoryScanner } from './graphify/repository-scanner';
import { GraphifyViewProvider } from './graphify/graph-view-provider';

export class TaintFlowState {
    public static engine: TaintFlowEngine;
    public static outputChannel: vscode.OutputChannel;
    public static context: vscode.ExtensionContext;
    public static diagnosticCollection: vscode.DiagnosticCollection;
    
    // Graphify State
    public static scanner: RepositoryScanner;
    public static graphifyProvider: GraphifyViewProvider;
    
    // uri string -> findings
    public static findingsCache = new Map<string, Finding[]>();
    
    // For tracking which files are currently being verified
    public static activeVerifications = new Map<string, boolean>();
    
    // Notify sidebar to refresh
    public static onFindingsChanged = new vscode.EventEmitter<void>();
}
