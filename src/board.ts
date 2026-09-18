import { win32 as paths } from 'node:path';
import type { BoardHostPolicy } from '@superbee/cli';

/** Call only after the owning code has obtained physical path evidence. */
export function sameResolvedPath(left: string, right: string): boolean {
  return paths.resolve(left).toLowerCase() === paths.resolve(right).toLowerCase();
}

function powershellQuote(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

export const windowsBoardHostPolicy: BoardHostPolicy = Object.freeze({
  sameResolvedPath,
  moveAsideHelp: (boardPath: string, _note: string) =>
    'powershell.exe -NoProfile -NonInteractive -Command "' +
    `$ErrorActionPreference='Stop'; Rename-Item -LiteralPath ${powershellQuote(boardPath)} ` +
    `-NewName ${powershellQuote(`${paths.basename(boardPath)}.bak`)} -ErrorAction Stop"`,
});
