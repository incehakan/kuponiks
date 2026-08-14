export function formatRelativeTimeTr(
  value: string | Date | null | undefined,
  now = new Date(),
): string {
  if (!value) {
    return '';
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.round(diffMs / 1000);
  if (diffSec < 45) {
    return 'Az önce';
  }
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) {
    return `${diffMin} dk önce`;
  }
  const diffHour = Math.round(diffMin / 60);
  if (diffHour < 24) {
    return `${diffHour} sa önce`;
  }
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const startOfDate = new Date(date);
  startOfDate.setHours(0, 0, 0, 0);
  const dayDiff = Math.round(
    (startOfToday.getTime() - startOfDate.getTime()) / 86_400_000,
  );
  if (dayDiff === 1) {
    return 'Dün';
  }

  return new Intl.DateTimeFormat('tr-TR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}
