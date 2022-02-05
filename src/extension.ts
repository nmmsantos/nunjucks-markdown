import { readFileSync } from 'fs';
import * as MarkdownIt from 'markdown-it';
import * as Token from 'markdown-it/lib/token';
import { Environment, Loader, LoaderSource } from 'nunjucks';
import { dirname, join, relative, resolve } from 'path';
import { ExtensionContext, window, workspace } from 'vscode';

class VSCodeLoader extends Loader {
    isRelative(filename: string): boolean {
        return !filename.startsWith('/');
    }

    resolve(from: string, to: string): string {
        return `${to}\n${from}`;
    }

    getSource(name: string): LoaderSource {
        const noCache = true;

        if (!window.activeTextEditor) {
            return {
                src: '`Template: no active text editor`',
                path: '',
                noCache
            };
        }

        const docUri = window.activeTextEditor.document.uri;
        const wsFolder = workspace.getWorkspaceFolder(docUri);
        const basePath = wsFolder ? wsFolder.uri.path : '/';
        const nameParts = name.split('\n');
        const docPath = nameParts.length > 1 ? nameParts[1] : docUri.path;
        const path = join(basePath, resolve('/', dirname(relative(basePath, docPath)), nameParts[0]));

        try {
            return {
                src: readFileSync(path, 'utf-8'),
                path,
                noCache
            };
        } catch (e) {
            return {
                src: `\`Template: can't open '${path}'\``,
                path,
                noCache
            };
        }
    }
}

const createParser: (originalParser: (src: string, env: any) => Token[]) => (src: string, env: any) => Token[] = (originalParser) => {
    const nunjucksEnv = new Environment(new VSCodeLoader(), {
        autoescape: false,
        throwOnUndefined: true
    });

    return (src, env) => {
        let md = src;

        const firstLine = src.split('\n')[0].replace(/\s/g, '');

        if (firstLine === '[//]:#(nunjucks)' || firstLine === '[//]:#"nunjucks"') {
            try {
                md = nunjucksEnv.renderString(src, {});
            } catch (e) {
                md = `# Nunjucks error\n\n\`\`\`javascript\n${e}\n\`\`\``;
            }
        }

        return originalParser(md, env);
    };
};

export function activate(_: ExtensionContext) {
    return {
        extendMarkdownIt(md: MarkdownIt) {
            md.parse = createParser(md.parse.bind(md));
            return md;
        }
    };
}

export function deactivate() { }
