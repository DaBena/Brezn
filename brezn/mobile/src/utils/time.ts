export function formatRelativeTime(timestampSeconds: number): string {
  // Formats a UNIX timestamp in seconds into a short, human-friendly relative string.
  const date = new Date(timestampSeconds * 1000);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) {
    return 'Gerade eben';
  }
  if (diffInSeconds < 3600) {
    const minutes = Math.floor(diffInSeconds / 60);
    return `vor ${minutes} Minuten`;
  }
  if (diffInSeconds < 86400) {
    const hours = Math.floor(diffInSeconds / 3600);
    return `vor ${hours} Stunden`;
  }
  const days = Math.floor(diffInSeconds / 86400);
  return `vor ${days} Tagen`;
}