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
import { HostsManager } from '@guoyunhe/hosts';

const manager = new HostsManager();

// Read and parse
const lines = await manager.read();

// Add entry
const updated = HostsManager.addEntry(lines, '127.0.0.1', 'example.local');
await manager.write(updated);

// Custom path (e.g. for testing)
const custom = new HostsManager({ path: '/tmp/hosts' });
```
