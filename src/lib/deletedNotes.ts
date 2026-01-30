import { loadJsonSync, saveJsonSync } from './storage'

const DELETED_NOTES_KEY = 'brezn:deleted-notes:v1'

export function loadDeletedNoteIds(): string[] {
  const raw = loadJsonSync<string[]>(DELETED_NOTES_KEY, [])
  return Array.isArray(raw) ? raw.filter((id): id is string => typeof id === 'string') : []
}

export function saveDeletedNoteIds(ids: string[]): void {
  saveJsonSync(DELETED_NOTES_KEY, ids)
}

export function addDeletedNoteId(id: string): void {
  const ids = loadDeletedNoteIds()
  if (ids.includes(id)) return
  ids.push(id)
  saveDeletedNoteIds(ids)
}
