import { RepositoryMemory, FileNode } from './graph-types';
import * as path from 'path';

export class ContextGenerator {
    public static generateRepositorySummary(memory: RepositoryMemory, format: 'markdown' | 'json' | 'text'): string {
        const entryPoints = memory.entryPoints.map(e => `- ${e}`).join('\n') || '- None detected';
        const services = memory.services.map(s => `- ${s}`).join('\n') || '- None detected';
        const apis = memory.apis.map(a => `- ${a}`).join('\n') || '- None detected';
        const dbs = memory.databases.map(d => `- ${d}`).join('\n') || '- None detected';
        const frameworks = memory.frameworks.join(', ') || 'None detected';

        // Infer auth
        let hasAuth = 'None detected';
        for (const file of Object.values(memory.files)) {
            if (/auth|jwt|login|passport|session|bcrypt|token|signout|signin/i.test(file.name)) {
                hasAuth = `Detected in ${file.path}`;
                break;
            }
        }

        if (format === 'json') {
            return JSON.stringify({
                projectName: memory.projectName,
                frameworks: memory.frameworks,
                entryPoints: memory.entryPoints,
                services: memory.services,
                apis: memory.apis,
                databases: memory.databases,
                authentication: hasAuth
            }, null, 2);
        }

        if (format === 'text') {
            return `Repository: ${memory.projectName}
Framework: ${frameworks}
Entry Points: ${memory.entryPoints.join(', ') || 'None'}
Services: ${memory.services.join(', ') || 'None'}
APIs: ${memory.apis.join(', ') || 'None'}
Databases: ${memory.databases.join(', ') || 'None'}
Authentication: ${hasAuth}`;
        }

        // Markdown
        return `## Repository Summary: ${memory.projectName}

**Framework:** ${frameworks}

### Main Components:
**Entry Points:**
${entryPoints}

**Services:**
${services}

**APIs:**
${apis}

**Databases:**
${dbs}

**Authentication:**
${hasAuth}
`;
    }

    public static explainFile(memory: RepositoryMemory, filePath: string, format: 'markdown' | 'json' | 'text'): string {
        const fileNode = memory.files[filePath];
        if (!fileNode) {
            return format === 'markdown' ? `File \`${filePath}\` is not indexed in repository memory.` : `File ${filePath} is not indexed.`;
        }

        const imports = fileNode.imports.map(i => `- ${i}`).join('\n') || '- None';
        const exports = fileNode.exports.map(e => `- ${e}`).join('\n') || '- None';

        // Find what imports this file
        const importedBy: string[] = [];
        for (const edge of memory.edges) {
            if (edge.target === filePath) {
                importedBy.push(edge.source);
            }
        }
        const importedByStr = importedBy.map(f => `- ${f}`).join('\n') || '- None';

        if (format === 'json') {
            return JSON.stringify({
                file: filePath,
                type: fileNode.type,
                language: fileNode.language,
                exports: fileNode.exports,
                imports: fileNode.imports,
                importedBy: importedBy
            }, null, 2);
        }

        if (format === 'text') {
            return `File: ${filePath}
Type: ${fileNode.type} (${fileNode.language})
Exports: ${fileNode.exports.join(', ') || 'None'}
Imports: ${fileNode.imports.join(', ') || 'None'}
Imported By: ${importedBy.join(', ') || 'None'}`;
        }

        // Markdown
        return `## File Context: \`${filePath}\`
- **Type:** ${fileNode.type}
- **Language:** ${fileNode.language}

### Exports:
${exports}

### Imports / Dependencies:
${imports}

### Referenced By (Imported By):
${importedByStr}
`;
    }

    public static explainArchitecture(memory: RepositoryMemory, format: 'markdown' | 'json' | 'text'): string {
        if (format === 'json') {
            return JSON.stringify(memory, null, 2);
        }

        const summary = this.generateRepositorySummary(memory, format);
        
        let relationships = '';
        if (format === 'markdown') {
            relationships = '### Component Relationships:\n';
            memory.edges.forEach(edge => {
                relationships += `- \`${edge.source}\` imports/calls \`${edge.target}\`\n`;
            });
            return `${summary}\n${relationships}`;
        } else {
            relationships = '\nComponent Relationships:\n';
            memory.edges.forEach(edge => {
                relationships += `- ${edge.source} -> ${edge.target}\n`;
            });
            return `${summary}${relationships}`;
        }
    }

    public static generateAIContext(memory: RepositoryMemory): string {
        const frameworks = memory.frameworks.join(', ') || 'None';
        const components = Object.values(memory.files)
            .filter(f => f.type !== 'file')
            .map(f => `  - ${f.path} (${f.type})`)
            .slice(0, 15)
            .join('\n');

        return `[Repository Memory Context]
Project: ${memory.projectName}
Framework: ${frameworks}
Key Architectural Components:
${components || '  - None'}
Total Indexed Files: ${Object.keys(memory.files).length}
`;
    }
}
