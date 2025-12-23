export function chunkArray<T>(arr: T[], size: number): T[][] {
  const s = Math.max(1, Math.floor(size))
  if (arr.length <= s) return [arr]
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += s) out.push(arr.slice(i, i + s))
  return out
}

