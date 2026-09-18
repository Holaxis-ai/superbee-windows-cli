// PowerShell accepts additional quote terminators; a rendered value must be inert in both shells.
const DOUBLE_QUOTE_LIKE = /["\u201c\u201d\u201e\u201f\u2033\u2036\u275d\u275e\u301d\u301e\u301f\uff02]/u;
const EXPANSION_LIKE = /[$`!%\uff40]/u;
const UNPRINTABLE = /[\u0000-\u001f\u007f]/u;
const SAFE_UNQUOTED_HOOK_TOKEN = /^[A-Za-z0-9_@%+=:,./-]+$/;

export function renderWindowsToken(value: string): string | undefined {
  if (UNPRINTABLE.test(value) || DOUBLE_QUOTE_LIKE.test(value) || EXPANSION_LIKE.test(value)) return undefined;
  // CRT consumes trailing backslashes before a quote; PowerShell preserves the doubled run.
  // This is the existing inert-but-not-identical trailing-backslash fidelity boundary.
  let suffixStart = value.length;
  while (suffixStart > 0 && value[suffixStart - 1] === '\\') suffixStart--;
  return `"${value}${value.slice(suffixStart)}"`;
}

export function renderGeneratedHookToken(value: string): string {
  const normalized = value.replaceAll('\\', '/');
  if ([...normalized].some(character => {
    const code = character.charCodeAt(0);
    return code < 0x20 || code === 0x7f || ['"', '%', '!', '$', '`'].includes(character);
  })) throw new Error('Windows hook token contains characters outside the generated-command grammar');
  return SAFE_UNQUOTED_HOOK_TOKEN.test(normalized) ? normalized : `"${normalized}"`;
}

export function lexicalHookTokens(command: string): readonly {raw: string; value: string; envelope: 'current'}[] | undefined {
  if (!command || command.startsWith(' ') || command.endsWith(' ')) return undefined;
  const tokens: {raw: string; value: string; envelope: 'current'}[] = [];
  let index = 0;
  while (index < command.length) {
    const start = index;
    let value = '';
    if (command[index] === '"') {
      const end = command.indexOf('"', index + 1);
      if (end < 0 || (end + 1 < command.length && command[end + 1] !== ' ')) return undefined;
      value = command.slice(index + 1, end);
      index = end + 1;
    } else {
      while (index < command.length && command[index] !== ' ') {
        const character = command[index]!;
        if (!SAFE_UNQUOTED_HOOK_TOKEN.test(character)) return undefined;
        value += character;
        index++;
      }
    }
    const raw = command.slice(start, index);
    try { if (raw !== renderGeneratedHookToken(value)) return undefined; } catch { return undefined; }
    tokens.push({raw, value, envelope:'current'});
    if (index < command.length && (++index === command.length || command[index] === ' ')) return undefined;
  }
  return tokens.length ? tokens : undefined;
}
