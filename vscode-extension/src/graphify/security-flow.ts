import { RepositoryMemory, SecurityAttackPath } from './graph-types';

export class SecurityFlowAnalyzer {
    public static traceAttackPath(
        memory: RepositoryMemory,
        vulnerableFile: string,
        vulnerabilityType: string,
        severity: 'low' | 'medium' | 'high' | 'critical',
        lineNum?: number
    ): SecurityAttackPath {
        
        const steps: SecurityAttackPath['steps'] = [];
        const visited = new Set<string>();
        
        // 1. Trace backwards from the vulnerable file to find ingress / entrypoints
        const path: string[] = [];
        this.findSourcePath(vulnerableFile, memory, path, visited);

        // Reverse the path so it reads: Ingress/Source -> Intermediate -> Sink
        const fullPath = path.reverse();
        if (!fullPath.includes(vulnerableFile)) {
            fullPath.push(vulnerableFile);
        }

        // Build path steps
        fullPath.forEach((file, idx) => {
            const node = memory.files[file];
            let description = 'Intermediate logic handler';
            
            if (idx === 0) {
                description = 'Source / User Input Entry Point';
            } else if (file === vulnerableFile) {
                description = `Vulnerable Sink (${vulnerabilityType})`;
            } else if (node?.type === 'api') {
                description = 'HTTP API Route Handler';
            } else if (node?.type === 'service') {
                description = 'Core Service Business Logic';
            }

            steps.push({
                file,
                line: file === vulnerableFile ? lineNum : undefined,
                description
            });
        });

        // 2. Compute the Impact Radius (BFS traversal of all files importing/depending on the vulnerable file)
        const impactRadius: string[] = [];
        const queue: string[] = [vulnerableFile];
        const impactVisited = new Set<string>([vulnerableFile]);

        while (queue.length > 0) {
            const current = queue.shift()!;
            
            // Find all files that import/call 'current'
            for (const edge of memory.edges) {
                if (edge.target === current && !impactVisited.has(edge.source)) {
                    impactVisited.add(edge.source);
                    impactRadius.push(edge.source);
                    queue.push(edge.source);
                }
            }
        }

        return {
            vulnerabilityId: `${vulnerableFile}-${vulnerabilityType}-${lineNum || 0}`,
            vulnerabilityType,
            severity,
            steps,
            impactRadius
        };
    }

    private static findSourcePath(
        current: string,
        memory: RepositoryMemory,
        path: string[],
        visited: Set<string>
    ): boolean {
        if (visited.has(current)) return false;
        visited.add(current);
        path.push(current);

        const node = memory.files[current];
        // If we found an API route or Entry Point, we stop tracing back
        if (node?.type === 'entrypoint' || node?.type === 'api') {
            return true;
        }

        // Trace further back (who imports current?)
        for (const edge of memory.edges) {
            if (edge.target === current) {
                if (this.findSourcePath(edge.source, memory, path, visited)) {
                    return true;
                }
            }
        }

        // If no more paths back, check if we're at a root
        return false;
    }
}
