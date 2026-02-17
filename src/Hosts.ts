import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

/**
 * A parsed line from the hosts file.
 * Use {@link HostsLine.type} to discriminate; other properties are set based on type.
 * @since 1.0.0
 */
export interface HostsLine {
  type: 'entry' | 'comment' | 'empty';
  id?: number;
  /** For type 'entry' */
  ip?: string;
  hostnames?: string[];
  /** For type 'entry' - inline comment; for type 'comment' - the comment text */
  comment?: string;
}

/**
 * Options for Hosts when used with file operations
 * @since 1.0.0
 */
export interface HostsOptions {
  /** Custom path to the hosts file. If not set, uses the default for the current OS. */
  path?: string;
  /** Encoding for read/write operations. Default: 'utf-8' */
  encoding?: BufferEncoding;
}

/**
 * Manages hosts file content and file operations across Windows, macOS, and Linux.
 * Use static methods for content-only operations. Instantiate with options for file read/write.
 * @since 1.0.0
 */
export class Hosts {
  /**
   * Gets the default hosts file path for the current operating system.
   * - Windows: C:\\Windows\\System32\\drivers\\etc\\hosts
   * - macOS / Linux: /etc/hosts
   * @since 1.0.0
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
   * @since 1.0.0
   */
  static parse(content: string): HostsLine[] {
    const lines: HostsLine[] = [];
    const contentLines = content.split(/\r?\n/);

    for (let i = 0; i < contentLines.length; i++) {
      const lineNumber = i + 1;
      const rawLine = contentLines[i]!;
      const trimmed = rawLine.trimEnd();

      if (trimmed === '') {
        lines.push({ type: 'empty', id: lineNumber });
        continue;
      }

      const commentStart = trimmed.indexOf('#');
      const hasComment = commentStart >= 0;

      if (commentStart === 0) {
        lines.push({
          type: 'comment',
          comment: trimmed.slice(1).trimStart(),
          id: lineNumber,
        });
        continue;
      }

      const dataPart = hasComment ? trimmed.slice(0, commentStart).trimEnd() : trimmed;
      const inlineComment = hasComment ? trimmed.slice(commentStart + 1).trimStart() : undefined;

      if (dataPart === '') {
        lines.push({
          type: 'comment',
          comment: inlineComment ?? '',
          id: lineNumber,
        });
        continue;
      }

      const tokens = dataPart.split(/\s+/).filter(Boolean);
      if (tokens.length === 0) {
        lines.push({ type: 'empty', id: lineNumber });
        continue;
      }

      const [ip, ...hostnames] = tokens;
      if (ip) {
        lines.push({
          type: 'entry',
          ip,
          hostnames,
          ...(inlineComment !== undefined && { comment: inlineComment }),
          id: lineNumber,
        });
      }
    }

    return lines;
  }

  /**
   * Serializes parsed lines back to hosts file format.
   * @since 1.0.0
   */
  static serialize(lines: HostsLine[]): string {
    return lines
      .map((line) => {
        if (line.type === 'empty') return '';
        if (line.type === 'comment') return line.comment ? `# ${line.comment}` : '#';
        if (line.type === 'entry' && line.ip !== undefined && line.hostnames !== undefined) {
          const main = [line.ip, ...line.hostnames].join('\t');
          return line.comment ? `${main}\t# ${line.comment}` : main;
        }
        return '';
      })
      .join('\n');
  }

  /**
   * Returns only the entry lines (IP + hostnames) from the given lines, excluding comments and empty lines.
   * @since 1.0.0
   */
  static getEntries(lines: HostsLine[]): HostsLine[] {
    return lines.filter(
      (line): line is HostsLine & { type: 'entry'; ip: string; hostnames: string[] } =>
        line.type === 'entry' && line.ip !== undefined && line.hostnames !== undefined,
    );
  }

  /**
   * Adds or updates an entry. If the IP exists, appends hostnames; otherwise inserts a new entry.
   * @since 1.0.0
   */
  static addEntry(lines: HostsLine[], ip: string, ...hostnames: string[]): HostsLine[] {
    const entries = Hosts.getEntries(lines);
    const existingIdx = entries.findIndex((e) => e.ip === ip);

    const newHostnames = [...new Set(hostnames)];

    if (existingIdx >= 0) {
      const lineIdx = lines.findIndex(
        (l) => l.type === 'entry' && l.ip === entries[existingIdx]!.ip,
      );
      if (
        lineIdx >= 0 &&
        lines[lineIdx]!.type === 'entry' &&
        lines[lineIdx]!.hostnames !== undefined
      ) {
        const merged = [...new Set([...lines[lineIdx]!.hostnames!, ...newHostnames])];
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
   * @since 1.0.0
   */
  static removeEntry(lines: HostsLine[], ipOrHostname: string): HostsLine[] {
    return lines
      .map((line): HostsLine | null => {
        if (line.type !== 'entry') return line;
        if (line.ip === ipOrHostname) return null;
        if (line.hostnames?.includes(ipOrHostname)) {
          const filtered = line.hostnames.filter((h) => h !== ipOrHostname);
          return filtered.length > 0 ? { ...line, hostnames: filtered } : null;
        }
        return line;
      })
      .filter((l): l is HostsLine => l !== null);
  }

  readonly #path: string;
  readonly #encoding: BufferEncoding;
  #lines: HostsLine[] = [];

  constructor(options: HostsOptions = {}) {
    this.#path = options.path ?? Hosts.getDefaultPath();
    this.#encoding = options.encoding ?? 'utf-8';
  }

  /**
   * Returns the hosts file path for the current platform
   * @since 1.0.0
   */
  get path(): string {
    return this.#path;
  }

  /**
   * Parsed lines. Populated by {@link read}.
   * @since 1.0.0
   */
  get lines(): HostsLine[] {
    return this.#lines;
  }

  set lines(value: HostsLine[]) {
    this.#lines = value;
  }

  /**
   * Reads the hosts file and returns parsed lines. Populates {@link lines}.
   * @since 1.0.0
   */
  async read(): Promise<HostsLine[]> {
    const content = await readFile(this.#path, this.#encoding);
    this.#lines = Hosts.parse(content);
    return this.#lines;
  }

  /**
   * Writes the given lines to the hosts file. Uses {@link lines} if no argument is provided.
   * @since 1.0.0
   */
  async write(lines?: HostsLine[]): Promise<void> {
    const toWrite = lines ?? this.#lines;
    const content = Hosts.serialize(toWrite);
    await writeFile(this.#path, content, this.#encoding);
    this.#lines = toWrite;
  }
}
