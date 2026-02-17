import { describe, expect, it } from 'vitest';
import { Hosts, type HostsLine } from '.';

describe('Hosts', () => {
  describe('getDefaultPath', () => {
    it('returns Windows path on win32', () => {
      const original = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
      expect(Hosts.getDefaultPath()).toMatch(/[\\/]hosts$/);
      Object.defineProperty(process, 'platform', { value: original, configurable: true });
    });

    it('returns /etc/hosts on darwin', () => {
      const original = process.platform;
      Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
      expect(Hosts.getDefaultPath()).toBe('/etc/hosts');
      Object.defineProperty(process, 'platform', { value: original, configurable: true });
    });

    it('returns /etc/hosts on linux', () => {
      const original = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
      expect(Hosts.getDefaultPath()).toBe('/etc/hosts');
      Object.defineProperty(process, 'platform', { value: original, configurable: true });
    });
  });

  describe('parse', () => {
    it('parses entries with IP and hostnames', () => {
      const content = '127.0.0.1\tlocalhost\n192.168.1.1 router.local';
      const lines = Hosts.parse(content);
      expect(lines).toHaveLength(2);
      expect(lines[0]).toEqual({ type: 'entry', ip: '127.0.0.1', hostnames: ['localhost'] });
      expect(lines[1]).toEqual({ type: 'entry', ip: '192.168.1.1', hostnames: ['router.local'] });
    });

    it('parses entries with multiple hostnames', () => {
      const content = '127.0.0.1\tlocalhost localhost.localdomain';
      const lines = Hosts.parse(content);
      expect(lines[0]).toEqual({
        type: 'entry',
        ip: '127.0.0.1',
        hostnames: ['localhost', 'localhost.localdomain'],
      });
    });

    it('parses comments', () => {
      const content = '# comment line\n127.0.0.1 localhost # inline comment';
      const lines = Hosts.parse(content);
      expect(lines[0]).toEqual({ type: 'comment', content: 'comment line' });
      expect(lines[1]).toEqual({
        type: 'entry',
        ip: '127.0.0.1',
        hostnames: ['localhost'],
        comment: 'inline comment',
      });
    });

    it('parses empty lines', () => {
      const content = '127.0.0.1 localhost\n\n\n';
      const lines = Hosts.parse(content);
      expect(lines).toHaveLength(4);
      expect(lines[1]).toEqual({ type: 'empty' });
      expect(lines[2]).toEqual({ type: 'empty' });
      expect(lines[3]).toEqual({ type: 'empty' });
    });

    it('handles Windows line endings', () => {
      const content = '127.0.0.1\tlocalhost\r\n192.168.1.1\thost\r\n';
      const lines = Hosts.parse(content);
      expect(lines.filter((l) => l.type === 'entry')).toHaveLength(2);
      expect(lines[0]).toEqual({ type: 'entry', ip: '127.0.0.1', hostnames: ['localhost'] });
      expect(lines[1]).toEqual({ type: 'entry', ip: '192.168.1.1', hostnames: ['host'] });
    });
  });

  describe('serialize', () => {
    it('serializes entries back to hosts format', () => {
      const lines: HostsLine[] = [
        { type: 'entry', ip: '127.0.0.1', hostnames: ['localhost'] },
        { type: 'comment', content: 'test' },
        { type: 'empty' },
      ];
      const content = Hosts.serialize(lines);
      expect(content).toBe('127.0.0.1\tlocalhost\n# test\n');
    });

    it('preserves round-trip', () => {
      const original = '127.0.0.1\tlocalhost\t# loopback\n\n# section';
      const lines = Hosts.parse(original);
      const serialized = Hosts.serialize(lines);
      const reparsed = Hosts.parse(serialized);
      expect(reparsed).toEqual(lines);
    });
  });

  describe('getEntries', () => {
    it('returns only entry lines', () => {
      const lines: HostsLine[] = [
        { type: 'comment', content: 'x' },
        { type: 'entry', ip: '127.0.0.1', hostnames: ['localhost'] },
        { type: 'empty' },
        { type: 'entry', ip: '::1', hostnames: ['ip6-localhost'] },
      ];
      const entries = Hosts.getEntries(lines);
      expect(entries).toHaveLength(2);
      expect(entries[0]).toEqual({ ip: '127.0.0.1', hostnames: ['localhost'] });
      expect(entries[1]).toEqual({ ip: '::1', hostnames: ['ip6-localhost'] });
    });
  });

  describe('addEntry', () => {
    it('adds new entry when IP does not exist', () => {
      const lines: HostsLine[] = [{ type: 'entry', ip: '127.0.0.1', hostnames: ['localhost'] }];
      const result = Hosts.addEntry(lines, '192.168.1.1', 'router');
      expect(result).toHaveLength(2);
      expect(result[1]).toEqual({ type: 'entry', ip: '192.168.1.1', hostnames: ['router'] });
    });

    it('merges hostnames when IP exists', () => {
      const lines: HostsLine[] = [{ type: 'entry', ip: '127.0.0.1', hostnames: ['localhost'] }];
      const result = Hosts.addEntry(lines, '127.0.0.1', 'local', 'localhost.localdomain');
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        type: 'entry',
        ip: '127.0.0.1',
        hostnames: ['localhost', 'local', 'localhost.localdomain'],
      });
    });

    it('deduplicates hostnames', () => {
      const lines: HostsLine[] = [{ type: 'entry', ip: '127.0.0.1', hostnames: ['localhost'] }];
      const result = Hosts.addEntry(lines, '127.0.0.1', 'localhost', 'local');
      expect(result[0]!.type === 'entry' && result[0].hostnames).toEqual(['localhost', 'local']);
    });
  });

  describe('removeEntry', () => {
    it('removes entry by IP', () => {
      const lines: HostsLine[] = [
        { type: 'entry', ip: '127.0.0.1', hostnames: ['localhost'] },
        { type: 'entry', ip: '192.168.1.1', hostnames: ['router'] },
      ];
      const result = Hosts.removeEntry(lines, '127.0.0.1');
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ type: 'entry', ip: '192.168.1.1', hostnames: ['router'] });
    });

    it('removes hostname from entry when matching by hostname', () => {
      const lines: HostsLine[] = [
        { type: 'entry', ip: '127.0.0.1', hostnames: ['localhost', 'local'] },
      ];
      const result = Hosts.removeEntry(lines, 'local');
      expect(result[0]).toEqual({ type: 'entry', ip: '127.0.0.1', hostnames: ['localhost'] });
    });

    it('removes entire entry when last hostname is removed', () => {
      const lines: HostsLine[] = [{ type: 'entry', ip: '127.0.0.1', hostnames: ['localhost'] }];
      const result = Hosts.removeEntry(lines, 'localhost');
      expect(result).toHaveLength(0);
    });
  });

  describe('constructor', () => {
    it('accepts custom path', () => {
      const manager = new Hosts({ path: '/custom/hosts' });
      expect(manager.path).toBe('/custom/hosts');
    });
  });
});
