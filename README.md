# @guoyunhe/hosts

![Version](https://img.shields.io/npm/v/@guoyunhe/hosts)
![Downloads](https://img.shields.io/npm/dw/@guoyunhe/hosts)

Node.js library to manage hosts file rules for GNU/Linux, macOS and Windows

## Install

```bash
npm i -S @guoyunhe/hosts
```

## Example

```js
import { Hosts } from '@guoyunhe/hosts';

// File operations
const manager = new Hosts();
const lines = await manager.read();
const updated = Hosts.addEntry(lines, '127.0.0.1', 'example.local');
await manager.write(updated);

// Content only (parse from string)
const content = Hosts.parse('127.0.0.1 localhost');
const entries = Hosts.getEntries(content);

// Custom path (e.g. for testing)
const custom = new Hosts({ path: '/tmp/hosts' });
```
