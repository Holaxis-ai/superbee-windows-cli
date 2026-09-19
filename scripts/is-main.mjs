import { realpath } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
// Both representations can contain directory aliases (including Windows short paths).
export async function isMain(moduleUrl,entry=process.argv[1]) {
 if(!entry)return false;
 const [modulePath,entryPath]=await Promise.all([realpath(fileURLToPath(moduleUrl)),realpath(entry)]);
 return modulePath===entryPath;
}
