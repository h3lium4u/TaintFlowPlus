import { RepositoryMemory, FileNode, GraphEdge } from './graph-types';

export interface VisualNode {
    id: string;
    label: string;
    type: 'file' | 'service' | 'api' | 'database' | 'entrypoint';
    language: string;
    severity?: 'low' | 'medium' | 'high' | 'critical';
    isHighlighted?: boolean;
    isVulnerable?: boolean;
    path: string;
    lines?: number;
    isMeaningful?: boolean;
}

export interface VisualEdge {
    id: string;
    source: string;
    target: string;
    type: 'import' | 'dependency' | 'call' | 'security-path';
    isHighlighted?: boolean;
}

export class GraphBuilder {
    public static buildVisualGraph(
        memory: RepositoryMemory, 
        highlightedNodes: Set<string> = new Set(),
        vulnerablePath: string[] = []
    ): { nodes: VisualNode[]; edges: VisualEdge[] } {
        
        const nodes: VisualNode[] = [];
        const edges: VisualEdge[] = [];
        
        // 1. Convert FileNodes to VisualNodes
        for (const [relPath, node] of Object.entries(memory.files)) {
            const isMeaningful = 
                node.type !== 'file' || 
                node.imports.length > 0 || 
                highlightedNodes.has(relPath) ||
                this.isImportedByAny(relPath, memory.edges);

            const isVulnerable = node.vulnerabilitiesCount && node.vulnerabilitiesCount > 0;
            const inSecPath = vulnerablePath.includes(relPath);

            nodes.push({
                id: relPath,
                label: node.name,
                type: node.type,
                language: node.language,
                severity: node.isVulnerable ? 'high' : undefined,
                isHighlighted: highlightedNodes.has(relPath) || inSecPath,
                isVulnerable: !!isVulnerable,
                path: relPath,
                lines: node.metadata.linesCount,
                isMeaningful: isMeaningful
            });
        }

        // 2. Convert GraphEdges to VisualEdges
        for (const edge of memory.edges) {
            // Only keep edges if both source and target exist in visual nodes
            const sourceExists = nodes.some(n => n.id === edge.source);
            const targetExists = nodes.some(n => n.id === edge.target);

            if (sourceExists && targetExists) {
                // Check if this edge is part of the vulnerable path sequence
                let isHighlightedEdge = false;
                if (vulnerablePath.length > 1) {
                    for (let i = 0; i < vulnerablePath.length - 1; i++) {
                        if (vulnerablePath[i] === edge.source && vulnerablePath[i + 1] === edge.target) {
                            isHighlightedEdge = true;
                            break;
                        }
                    }
                }

                edges.push({
                    id: `${edge.source}->${edge.target}`,
                    source: edge.source,
                    target: edge.target,
                    type: isHighlightedEdge ? 'security-path' : edge.type,
                    isHighlighted: isHighlightedEdge
                });
            }
        }

        return { nodes, edges };
    }

    private static isImportedByAny(filePath: string, edges: GraphEdge[]): boolean {
        return edges.some(e => e.target === filePath);
    }
}
