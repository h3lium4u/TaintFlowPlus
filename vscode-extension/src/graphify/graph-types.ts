export interface FileNode {
    id: string; // absolute or relative file path
    name: string; // filename
    type: 'file' | 'service' | 'api' | 'database' | 'entrypoint';
    language: string;
    path: string; // relative path
    imports: string[]; // files/modules imported
    exports: string[]; // symbols exported (classes, functions)
    isVulnerable?: boolean;
    vulnerabilitiesCount?: number;
    metadata: {
        sizeBytes?: number;
        linesCount?: number;
        frameworks?: string[];
        isService?: boolean;
        isController?: boolean;
        isRoute?: boolean;
        isDatabase?: boolean;
        dbType?: string;
    };
}

export interface GraphEdge {
    source: string; // node ID
    target: string; // node ID
    type: 'import' | 'dependency' | 'call' | 'security-path';
    metadata?: {
        symbols?: string[];
    };
}

export interface SecurityAttackPath {
    vulnerabilityId: string;
    vulnerabilityType: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    steps: {
        file: string;
        line?: number;
        symbol?: string;
        description: string;
    }[];
    impactRadius: string[]; // file paths impacted
}

export interface RepositoryMemory {
    projectName: string;
    frameworks: string[];
    entryPoints: string[];
    services: string[];
    apis: string[];
    databases: string[];
    files: Record<string, FileNode>; // Map of relative path -> FileNode
    edges: GraphEdge[];
    lastScanTime: number;
}
