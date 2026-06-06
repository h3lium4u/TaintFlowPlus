import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { RepositoryMemory } from './graph-types';

export class GraphifyMemoryStore {
    private static memoryFile = 'graphify-memory.json';

    private static getWorkspaceRoot(): string | undefined {
        const folders = vscode.workspace.workspaceFolders;
        if (folders && folders.length > 0) {
            return folders[0].uri.fsPath;
        }
        return undefined;
    }

    private static getTaintflowDir(): string | undefined {
        const root = this.getWorkspaceRoot();
        if (!root) return undefined;
        const dir = path.join(root, '.taintflow');
        if (!fs.existsSync(dir)) {
            try {
                fs.mkdirSync(dir, { recursive: true });
            } catch (err) {
                console.error('Failed to create .taintflow directory:', err);
                return undefined;
            }
        }
        return dir;
    }

    private static getFilePath(): string | undefined {
        const dir = this.getTaintflowDir();
        if (!dir) return undefined;
        return path.join(dir, this.memoryFile);
    }

    public static loadMemory(): RepositoryMemory | undefined {
        const filePath = this.getFilePath();
        if (!filePath || !fs.existsSync(filePath)) return undefined;

        try {
            const data = fs.readFileSync(filePath, 'utf-8');
            return JSON.parse(data) as RepositoryMemory;
        } catch (err) {
            console.error('Graphify: Failed to load repository memory:', err);
            return undefined;
        }
    }

    public static saveMemory(memory: RepositoryMemory): void {
        const filePath = this.getFilePath();
        if (!filePath) return;

        try {
            fs.writeFileSync(filePath, JSON.stringify(memory, null, 2), 'utf-8');
        } catch (err) {
            console.error('Graphify: Failed to save repository memory:', err);
        }
    }

    public static clearMemory(): void {
        const filePath = this.getFilePath();
        if (filePath && fs.existsSync(filePath)) {
            try {
                fs.unlinkSync(filePath);
            } catch (err) {
                console.error('Graphify: Failed to delete memory file:', err);
            }
        }
    }
}
