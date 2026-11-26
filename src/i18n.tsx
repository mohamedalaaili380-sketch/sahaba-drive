export function translate(en: string, vars?: Record<string, string | number>): string {
  let out = en
  if (vars) for (const [key, value] of Object.entries(vars)) out = out.replaceAll(`{${key}}`, String(value))
  return out
}

export const useT = () => translate
