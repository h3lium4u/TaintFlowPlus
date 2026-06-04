declare module 'vscode' {
    export interface ExtensionContext {
        secrets: SecretStorage;
    }
    export interface SecretStorage {
        get(key: string): Promise<string | undefined>;
        store(key: string, value: string): Promise<void>;
        delete(key: string): Promise<void>;
    }
    export interface OutputChannel {
        appendLine(value: string): void;
    }
    export namespace workspace {
        export function getConfiguration(section?: string): WorkspaceConfiguration;
    }
    export interface WorkspaceConfiguration {
        get<T>(section: string): T | undefined;
        get<T>(section: string, defaultValue: T): T;
    }
}
