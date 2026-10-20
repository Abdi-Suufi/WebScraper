import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pngToIco from 'png-to-ico';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const icon = await pngToIco(await readFile(path.join(root, 'icon.png')));
await mkdir(path.join(root, 'build'), { recursive: true });
await writeFile(path.join(root, 'build', 'icon.ico'), icon);
