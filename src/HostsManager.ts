import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

/** A parsed hosts file entry mapping an IP to one or more hostnames */
export interface HostsEntry {
  ip: string;
  hostnames: string[];
  /** Inline comment after the entry, if any */
  comment?: string;
}

/** A parsed line from the hosts file */
export type HostsLine =
  | { type: 'entry'; ip: string; hostnames: string[]; comment?: string }
  | { type: 'comment'; content: string }
  | { type: 'empty' };

/** Options for HostsManager */
export interface HostsManagerOptions {
  /** Custom path to the hosts file. If not set, uses the default for the current OS. */
  path?: string;
  /** Encoding for read/write operations. Default: 'utf-8' */
  encoding?: BufferEncoding;
}

/**
 * Manages hosts file reading, writing, and parsing across Windows, macOS, and Linux.
 */
export class HostsManager {
  /**
   * Gets the default hosts file path for the current operating system.
   * - Windows: C:\\Windows\\System32\\drivers\\etc\\hosts
   * - macOS / Linux: /etc/hosts
   */
  static getDefaultPath(): string {
    if (process.platform === 'win32') {
      const systemRoot = process.env.SystemRoot ?? 'C:\\Windows';
      return resolve(systemRoot, 'System32', 'drivers', 'etc', 'hosts');
    }
    return '/etc/hosts';
  }

  /**
   * Parses hosts file content into structured lines.
   * Handles entries, comments (#), and empty lines.
   */
  static parse(content: string): HostsLine[] {
    const lines: HostsLine[] = [];
    const contentLines = content.split(/\r?\n/);

    for (const line of contentLines) {
      const trimmed = line.trimEnd();

      if (trimmed === '') {
        lines.push({ type: 'empty' });
        continue;
      }

      const commentStart = trimmed.indexOf('#');
      const hasComment = commentStart >= 0;

      if (commentStart === 0) {
        lines.push({ type: 'comment', content: trimmed.slice(1).trimStart() });
        continue;
      }

      const dataPart = hasComment ? trimmed.slice(0, commentStart).trimEnd() : trimmed;
      const inlineComment = hasComment ? trimmed.slice(commentStart + 1).trimStart() : undefined;

      if (dataPart === '') {
        lines.push({ type: 'comment', content: inlineComment ?? '' });
        continue;
      }

      const tokens = dataPart.split(/\s+/).filter(Boolean);
      if (tokens.length === 0) {
        lines.push({ type: 'empty' });
        continue;
      }

      const [ip, ...hostnames] = tokens;
      if (ip) {
        lines.push({
          type: 'entry',
          ip,
          hostnames,
          comment: inlineComment,
        });
      }
    }

    return lines;
  }

  /**
   * Serializes parsed lines back to hosts file format.
   */
  static serialize(lines: HostsLine[]): string {
    return lines
      .map((line) => {
        if (line.type === 'empty') return '';
        if (line.type === 'comment') return line.content ? `# ${line.content}` : '#';
        if (line.type === 'entry') {
          const main = [line.ip, ...line.hostnames].join('\t');
          return line.comment ? `${main}\t# ${line.comment}` : main;
        }
        return '';
      })
      .join('\n');
  }

  /**
   * Returns only the entry lines (IP + hostnames), excluding comments and empty lines.
   */
  static getEntries(lines: HostsLine[]): HostsEntry[] {
    return lines
      .filter((line): line is HostsLine & { type: 'entry' } => line.type === 'entry')
      .map(({ ip, hostnames, comment }) => ({ ip, hostnames, comment }));
  }

  /**
   * Adds or updates an entry. If the IP exists, appends hostnames; otherwise inserts a new entry.
   */
  static addEntry(lines: HostsLine[], ip: string, ...hostnames: string[]): HostsLine[] {
    const entries = HostsManager.getEntries(lines);
    const existingIdx = entries.findIndex((e) => e.ip === ip);

    const newHostnames = [...new Set(hostnames)];

    if (existingIdx >= 0) {
      const lineIdx = lines.findIndex(
        (l) => l.type === 'entry' && l.ip === entries[existingIdx]!.ip,
      );
      if (lineIdx >= 0 && lines[lineIdx]!.type === 'entry') {
        const merged = [...new Set([...lines[lineIdx]!.hostnames, ...newHostnames])];
        const updated: HostsLine[] = [...lines];
        updated[lineIdx] = { ...lines[lineIdx]!, hostnames: merged };
        return updated;
      }
    }

    const newEntry: HostsLine = { type: 'entry', ip, hostnames: newHostnames };
    const lastEntryIdx = lines.map((l) => l.type).lastIndexOf('entry');
    const insertAt = lastEntryIdx >= 0 ? lastEntryIdx + 1 : lines.length;
    return [...lines.slice(0, insertAt), newEntry, ...lines.slice(insertAt)];
  }

  /**
   * Removes entries matching the given IP or hostname.
   * When matching by IP, removes the entire entry. When matching by hostname, removes only that hostname.
   */
  static removeEntry(lines: HostsLine[], ipOrHostname: string): HostsLine[] {
    return lines
      .map((line): HostsLine | null => {
        if (line.type !== 'entry') return line;
        if (line.ip === ipOrHostname) return null;
        if (line.hostnames.includes(ipOrHostname)) {
          const filtered = line.hostnames.filter((h) => h !== ipOrHostname);
          return filtered.length > 0 ? { ...line, hostnames: filtered } : null;
        }
        return line;
      })
      .filter((l): l is HostsLine => l !== null);
  }

  readonly #path: string;
  readonly #encoding: BufferEncoding;

  constructor(options: HostsManagerOptions = {}) {
    this.#path = options.path ?? HostsManager.getDefaultPath();
    this.#encoding = options.encoding ?? 'utf-8';
  }

  /** Returns the hosts file path for the current platform */
  get path(): string {
    return this.#path;
  }

  /**
   * Reads the hosts file and returns parsed lines.
   */
  async read(): Promise<HostsLine[]> {
    const content = await readFile(this.#path, this.#encoding);
    return HostsManager.parse(content);
  }

  /**
   * Writes the given lines to the hosts file.
   */
  async write(lines: HostsLine[]): Promise<void> {
    const content = HostsManager.serialize(lines);
    await writeFile(this.#path, content, this.#encoding);
  }
}
