import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline/promises';
import type { ActTool } from './app/agent.js'; // <- adjust to wherever ActTool is defined

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const WORKSPACE_ROOT = process.cwd();
const RESTRICT_TO_WORKSPACE = true; // set to false ONLY inside a sandbox (Docker/VM)
const REQUIRE_DELETE_APPROVAL = true; // ask the user before deleting anything

const MAX_OUTPUT_CHARS = 10_000;
const MAX_LIST_ENTRIES = 500;
const MAX_SEARCH_RESULTS = 100;
const MAX_SEARCH_FILE_BYTES = 1024 * 1024; // skip files bigger than 1 MB when searching content
const MAX_LINE_PREVIEW = 200;
const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', '__pycache__', '.venv']);

// ---------------------------------------------------------------------------
// Helpers (all cross-platform: only node:fs / node:path, no shell commands)
// ---------------------------------------------------------------------------

/** Resolves a path against the workspace root and blocks escapes like "../../etc". */
function resolvePath(p: unknown): string {
    const raw = typeof p === 'string' ? p.trim() : '';
    if (!raw) throw new Error('no path provided');
    const abs = path.resolve(WORKSPACE_ROOT, raw);
    if (RESTRICT_TO_WORKSPACE) {
        const rel = path.relative(WORKSPACE_ROOT, abs);
        if (rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel)) {
            throw new Error(`path "${raw}" is outside the workspace (${WORKSPACE_ROOT})`);
        }
    }
    return abs;
}

/** Path shown to the agent: relative to the workspace, always with forward slashes. */
function display(abs: string): string {
    return path.relative(WORKSPACE_ROOT, abs).split(path.sep).join('/') || '.';
}

function fail(e: unknown): string {
    const err = e as NodeJS.ErrnoException;
    const where = err.path ? ` (${display(err.path)})` : '';
    switch (err.code) {
        case 'ENOENT': return `There was an Error: no such file or directory${where}.`;
        case 'EEXIST': return `There was an Error: already exists${where}.`;
        case 'EACCES':
        case 'EPERM': return `There was an Error: permission denied${where}.`;
        case 'EISDIR': return `There was an Error: path is a directory, not a file${where}.`;
        case 'ENOTDIR': return `There was an Error: path is not a directory${where}.`;
        case 'ENOTEMPTY': return `There was an Error: directory is not empty${where}.`;
        default: return `There was an Error: ${err.message ?? String(e)}`;
    }
}

// Keep the start and the end of long output
function truncate(s: string): string {
    if (s.length <= MAX_OUTPUT_CHARS) return s;
    const head = Math.floor(MAX_OUTPUT_CHARS * 0.6);
    const tail = MAX_OUTPUT_CHARS - head;
    return `${s.slice(0, head)}\n...[${s.length - MAX_OUTPUT_CHARS} chars omitted]...\n${s.slice(-tail)}`;
}

function toInt(v: unknown): number | undefined {
    if (v === undefined || v === null || v === '') return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? Math.trunc(n) : undefined;
}

function toBool(v: unknown): boolean {
    return v === true || (typeof v === 'string' && v.trim().toLowerCase() === 'true');
}

/**
 * ActTool.executor only receives one string, so tools with several parameters take a JSON object string,
 * e.g. '{"filePath":"src/a.ts","content":"hi"}'.
 * For tools with a main parameter (primaryKey), a plain non-JSON string is accepted as that parameter,
 * e.g. readFile("src/a.ts") works the same as readFile('{"filePath":"src/a.ts"}').
 */
function parseArgs(input: string, primaryKey?: string): Record<string, unknown> {
    const raw = typeof input === 'string' ? input.trim() : '';
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        parsed = undefined;
    }
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
    }
    if (primaryKey) return { [primaryKey]: raw };
    throw new Error('input must be a JSON object string matching the tool signature, e.g. {"filePath":"a.txt","content":"hi"}');
}

function looksBinary(buf: Buffer): boolean {
    return buf.subarray(0, 8000).includes(0);
}

// Windows files often use \r\n, Linux files \n. The agent usually writes \n.
function detectEol(s: string): '\r\n' | '\n' {
    return s.includes('\r\n') ? '\r\n' : '\n';
}
function withEol(s: string, eol: '\r\n' | '\n'): string {
    return s.replace(/\r\n/g, '\n').replace(/\n/g, eol);
}

async function askApproval(message: string): Promise<boolean> {
    const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
    try {
        const ans = await rl.question(`\nAgent wants to:\n  ${message}\nAllow? [y/N] `);
        return ans.trim().toLowerCase() === 'y';
    } finally {
        rl.close();
    }
}

interface Entry { abs: string; isDir: boolean }

/** Depth-first walk that skips junk folders, unreadable folders and symlinked dirs. */
async function* walk(dir: string): AsyncGenerator<Entry> {
    let entries;
    try {
        entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
        return; // unreadable directory: skip it
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const e of entries) {
        const abs = path.join(dir, e.name);
        if (e.isDirectory()) {
            if (IGNORED_DIRS.has(e.name)) continue;
            yield { abs, isDir: true };
            yield* walk(abs);
        } else {
            yield { abs, isDir: false };
        }
    }
}

async function* iterate(target: string, includeDirs: boolean): AsyncGenerator<Entry> {
    const st = await fs.stat(target);
    if (!st.isDirectory()) {
        yield { abs: target, isDir: false };
        return;
    }
    for await (const entry of walk(target)) {
        if (includeDirs || !entry.isDir) yield entry;
    }
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

const PATH_NOTE =
    `Input is a JSON object string with the fields shown in the signature (tools with a single main parameter also accept a plain string). ` +
    `Paths are relative to the workspace (${WORKSPACE_ROOT}); use forward slashes on every OS (backslashes must be escaped in JSON).`;

export const createFileTool: ActTool = {
    name: 'createFile',
    description:
        `Creates a new file with the given content. Parent folders are created automatically. ` +
        `Fails if the file already exists (use editFile to change existing files). ${PATH_NOTE}`,
    doc: 'createFile({ filePath: string, content: string }): string',
    async executor(input: string) {
        try {
            const { filePath, content } = parseArgs(input);
            const abs = resolvePath(filePath);
            await fs.mkdir(path.dirname(abs), { recursive: true });
            const data = String(content ?? '');
            await fs.writeFile(abs, data, { encoding: 'utf8', flag: 'wx' }); // 'wx' = fail if exists
            return `Created ${display(abs)} (${Buffer.byteLength(data)} bytes).`;
        } catch (e) {
            return fail(e);
        }
    },
};

export const readFileTool: ActTool = {
    name: 'readFile',
    description:
        `Reads a text file and returns its contents. Optionally pass 1-based startLine / endLine to read only part of it. ` +
        `Long output is truncated. ${PATH_NOTE}`,
    doc: 'readFile({ filePath: string, startLine?: number, endLine?: number }): string',
    async executor(input: string) {
        try {
            const { filePath, startLine, endLine } = parseArgs(input, 'filePath');
            const abs = resolvePath(filePath);
            const buf = await fs.readFile(abs);
            if (looksBinary(buf)) return `There was an Error: ${display(abs)} looks like a binary file.`;

            const text = buf.toString('utf8');
            const start = toInt(startLine);
            const end = toInt(endLine);
            if (start === undefined && end === undefined) return truncate(text);

            const lines = text.split(/\r?\n/);
            const from = Math.max(1, start ?? 1);
            const to = Math.min(lines.length, end ?? lines.length);
            if (from > to) return `There was an Error: invalid range, file has ${lines.length} lines.`;
            return `[${display(abs)} lines ${from}-${to} of ${lines.length}]\n${truncate(lines.slice(from - 1, to).join('\n'))}`;
        } catch (e) {
            return fail(e);
        }
    },
};

export const editFileTool: ActTool = {
    name: 'editFile',
    description:
        `Replaces one exact piece of text in an existing file. oldText must match the file exactly (including indentation) ` +
        `and must appear exactly once; include a few surrounding lines if needed to make it unique. ` +
        `Line endings (Windows \\r\\n vs Linux \\n) are handled automatically. ${PATH_NOTE}`,
    doc: 'editFile({ filePath: string, oldText: string, newText: string }): string',
    async executor(input: string) {
        try {
            const { filePath, oldText, newText } = parseArgs(input);
            const abs = resolvePath(filePath);
            if (typeof oldText !== 'string' || oldText === '') {
                return 'There was an Error: oldText must be a non-empty string.';
            }
            const content = await fs.readFile(abs, 'utf8');
            const eol = detectEol(content);
            const needle = withEol(oldText, eol);
            const replacement = withEol(String(newText ?? ''), eol);

            const first = content.indexOf(needle);
            if (first === -1) {
                return `There was an Error: oldText was not found in ${display(abs)}. Use readFile and copy the text exactly.`;
            }
            if (content.indexOf(needle, first + needle.length) !== -1) {
                return `There was an Error: oldText appears more than once in ${display(abs)}. Add more surrounding context so it is unique.`;
            }

            // Slice instead of String.replace so "$&" or "$1" in newText are never interpreted
            const updated = content.slice(0, first) + replacement + content.slice(first + needle.length);
            await fs.writeFile(abs, updated, 'utf8');
            return `Edited ${display(abs)} (1 replacement).`;
        } catch (e) {
            return fail(e);
        }
    },
};

export const deleteFileTool: ActTool = {
    name: 'deleteFile',
    description:
        `Deletes a single file (not a folder). The user may be asked to approve. ${PATH_NOTE}`,
    doc: 'deleteFile({ filePath: string }): string',
    async executor(input: string) {
        try {
            const { filePath } = parseArgs(input, 'filePath');
            const abs = resolvePath(filePath);
            const st = await fs.lstat(abs);
            if (st.isDirectory()) {
                return `There was an Error: ${display(abs)} is a directory. deleteFile only deletes files.`;
            }
            if (REQUIRE_DELETE_APPROVAL && !(await askApproval(`delete file ${abs}`))) {
                return 'The user rejected this deletion, so nothing was deleted. Do not retry it; ask what they would like instead.';
            }
            await fs.unlink(abs);
            return `Deleted ${display(abs)}.`;
        } catch (e) {
            return fail(e);
        }
    },
};

export const listFilesTool: ActTool = {
    name: 'listFiles',
    description:
        `Lists files and folders in a directory (folders end with "/"). Set recursive to true to include subfolders; ` +
        `node_modules, .git, dist and similar folders are skipped. Defaults to the workspace root. ${PATH_NOTE}`,
    doc: 'listFiles({ dirPath?: string, recursive?: boolean }): string',
    async executor(input: string) {
        try {
            const { dirPath, recursive } = parseArgs(input, 'dirPath');
            const abs = resolvePath(dirPath && String(dirPath).trim() ? dirPath : '.');
            const lines: string[] = [];
            let truncated = false;

            if (toBool(recursive)) {
                for await (const entry of walk(abs)) {
                    if (lines.length >= MAX_LIST_ENTRIES) { truncated = true; break; }
                    const rel = path.relative(abs, entry.abs).split(path.sep).join('/');
                    lines.push(entry.isDir ? `${rel}/` : rel);
                }
            } else {
                const entries = await fs.readdir(abs, { withFileTypes: true });
                entries.sort((a, b) => a.name.localeCompare(b.name));
                for (const e of entries) {
                    if (lines.length >= MAX_LIST_ENTRIES) { truncated = true; break; }
                    lines.push(e.isDirectory() ? `${e.name}/` : e.name);
                }
            }

            if (lines.length === 0) return `${display(abs)} is empty.`;
            return (
                `${display(abs)}:\n${lines.join('\n')}` +
                (truncated ? `\n...[stopped after ${MAX_LIST_ENTRIES} entries]` : '')
            );
        } catch (e) {
            return fail(e);
        }
    },
};

export const createDirectoryTool: ActTool = {
    name: 'createDirectory',
    description:
        `Creates a directory, including any missing parent folders. Succeeds quietly if it already exists. ${PATH_NOTE}`,
    doc: 'createDirectory({ dirPath: string }): string',
    async executor(input: string) {
        try {
            const { dirPath } = parseArgs(input, 'dirPath');
            const abs = resolvePath(dirPath);
            await fs.mkdir(abs, { recursive: true });
            return `Directory ready: ${display(abs)}`;
        } catch (e) {
            return fail(e);
        }
    },
};

export const searchFilesTool: ActTool = {
    name: 'searchFiles',
    description:
        `Searches a project. mode "content" (default) finds lines containing the query text (case-insensitive) and returns ` +
        `path:line: text. mode "name" finds files and folders whose path contains the query. ` +
        `Skips node_modules, .git, dist, binary files and files over 1 MB. Defaults to the workspace root. ${PATH_NOTE}`,
    doc: 'searchFiles({ query: string, dirPath?: string, mode?: "content" | "name" }): string',
    async executor(input: string) {
        try {
            const { query, dirPath, mode } = parseArgs(input, 'query');
            const q = typeof query === 'string' ? query : '';
            if (!q) return 'There was an Error: no search query provided.';
            const needle = q.toLowerCase();
            const root = resolvePath(dirPath && String(dirPath).trim() ? dirPath : '.');
            const byName = String(mode ?? 'content').toLowerCase() === 'name';

            const results: string[] = [];
            let hitLimit = false;

            for await (const entry of iterate(root, byName)) {
                if (results.length >= MAX_SEARCH_RESULTS) { hitLimit = true; break; }
                const shown = display(entry.abs);

                if (byName) {
                    if (shown.toLowerCase().includes(needle)) results.push(entry.isDir ? `${shown}/` : shown);
                    continue;
                }

                try {
                    const st = await fs.stat(entry.abs);
                    if (st.size > MAX_SEARCH_FILE_BYTES) continue;
                    const buf = await fs.readFile(entry.abs);
                    if (looksBinary(buf)) continue;

                    const lines = buf.toString('utf8').split(/\r?\n/);
                    for (let i = 0; i < lines.length; i++) {
                        const line = lines[i] ?? '';
                        if (!line.toLowerCase().includes(needle)) continue;
                        if (results.length >= MAX_SEARCH_RESULTS) { hitLimit = true; break; }
                        const preview = line.trim();
                        results.push(
                            `${shown}:${i + 1}: ${preview.length > MAX_LINE_PREVIEW ? preview.slice(0, MAX_LINE_PREVIEW) + '...' : preview}`
                        );
                    }
                } catch {
                    // unreadable file: skip it
                }
            }

            if (results.length === 0) return `No ${byName ? 'file names' : 'matches'} found for "${q}" in ${display(root)}.`;
            return (
                truncate(results.join('\n')) +
                (hitLimit ? `\n...[stopped after ${MAX_SEARCH_RESULTS} results, narrow your query or dirPath]` : '')
            );
        } catch (e) {
            return fail(e);
        }
    },
};

export const fileTools: ActTool[] = [
    createFileTool,
    readFileTool,
    editFileTool,
    deleteFileTool,
    listFilesTool,
    createDirectoryTool,
    searchFilesTool,
];