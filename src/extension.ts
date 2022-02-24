import { readFileSync } from 'fs';
import * as MarkdownIt from 'markdown-it';
import * as Token from 'markdown-it/lib/token';
import { Environment, Loader, LoaderSource } from 'nunjucks';
import { dirname, join, relative, resolve } from 'path';
import { commands, ExtensionContext, Selection, window, workspace } from 'vscode';
import { EncryptionContext } from './encryption-context';

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

const createParser: (originalParser: (src: string, env: any) => Token[], encryptionContext: EncryptionContext) => (src: string, env: any) => Token[] = (originalParser, encryptionContext) => {
    const nunjucksEnv = new Environment(new VSCodeLoader(), {
        autoescape: false,
        throwOnUndefined: true
    });

    nunjucksEnv.addFilter('decrypt', (str: string, defaultStr: string | undefined) => {
        try {
            return encryptionContext.decrypt(str);
        } catch {
            return defaultStr || '#ENCRYPTED#';
        }
    });

    return (src, env) => {
        let md = src;

        const firstLine = src.split('\n')[0].replace(/\s/g, '');

        const isNunjucksDbg = firstLine === '[//]:#(nunjucks-dbg)' || firstLine === '[//]:#"nunjucks-dbg"';
        const isNunjucks = isNunjucksDbg || firstLine === '[//]:#(nunjucks)' || firstLine === '[//]:#"nunjucks"';

        if (isNunjucks) {
            try {
                md = nunjucksEnv.renderString(src, {});

                if (isNunjucksDbg) {
                    md = `# Source\n\n\`\`\`\`\`\`\`markdown\n${md}\n\`\`\`\`\`\`\``;
                }
            } catch (e) {
                md = `# Nunjucks error\n\n\`\`\`javascript\n${e}\n\`\`\``;
            }
        }

        return originalParser(md, env);
    };
};

export function activate(context: ExtensionContext) {
    const encryptionContext = new EncryptionContext();

    const setEncryptionPasswordCommand = 'nunjucks-markdown.setEncryptionPassword';
    const encryptCommand = 'nunjucks-markdown.encrypt';
    const decryptCommand = 'nunjucks-markdown.decrypt';

    const setEncryptionPasswordCommandHandler = async () => {
        const result = await window.showInputBox({
            ignoreFocusOut: true,
            password: true,
            prompt: 'Encryption password',
            title: context.extension.packageJSON.displayName
        });

        if (result) {
            await encryptionContext.setPassword(result);
        }
    };

    const replaceSelections = async (fn: (str: string) => string) => {
        const selections: { selection: Selection; replace: string; }[] = [];
        const editor = window.activeTextEditor;

        if (editor) {
            for (const selection of editor.selections) {
                const text = editor.document.getText(selection);

                if (text) {
                    try {
                        selections.push({ selection, replace: fn(text) });
                    } catch (e) {
                        await window.showErrorMessage((e instanceof Error) ? e.message : String(e));
                        return;
                    }
                }
            }

            await editor.edit(edit => {
                for (const { selection, replace } of selections) {
                    edit.replace(selection, replace);
                }
            });
        }
    };

    const encryptCommandHandler = async () => {
        await replaceSelections(encryptionContext.encrypt.bind(encryptionContext));
    };

    const decryptCommandHandler = async () => {
        await replaceSelections(encryptionContext.decrypt.bind(encryptionContext));
    };

    context.subscriptions.push(commands.registerCommand(setEncryptionPasswordCommand, setEncryptionPasswordCommandHandler));
    context.subscriptions.push(commands.registerCommand(encryptCommand, encryptCommandHandler));
    context.subscriptions.push(commands.registerCommand(decryptCommand, decryptCommandHandler));

    return {
        extendMarkdownIt(md: MarkdownIt) {
            md.parse = createParser(md.parse.bind(md), encryptionContext);
            return md;
        }
    };
}
