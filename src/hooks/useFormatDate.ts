import { useSettings } from '../contexts/SettingsContext';

/**
 * Returns a formatDate function that respects the admin's saved timezone and dateFormat.
 * Usage: const formatDate = useFormatDate();  →  formatDate(someISOString)
 */
export function useFormatDate() {
  const { settings } = useSettings();

  return (dateInput: string | Date | null | undefined): string => {
    if (!dateInput) return '—';
    const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    if (isNaN(date.getTime())) return '—';

    const tz = settings.timezone;
    const fmt = settings.dateFormat;

    // Map our format tokens to Intl options
    const optionsMap: Record<string, Intl.DateTimeFormatOptions> = {
      'MM/DD/YYYY': { month: '2-digit', day: '2-digit', year: 'numeric', timeZone: tz },
      'DD/MM/YYYY': { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: tz },
      'YYYY-MM-DD': { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: tz },
      'MMM DD, YYYY': { month: 'short', day: 'numeric', year: 'numeric', timeZone: tz },
    };

    const options = optionsMap[fmt] ?? optionsMap['MMM DD, YYYY'];

    // For YYYY-MM-DD we need a specific format that Intl doesn't produce natively
    if (fmt === 'YYYY-MM-DD') {
      const parts = new Intl.DateTimeFormat('en-CA', options).formatToParts(date);
      const p: Record<string, string> = {};
      parts.forEach(({ type, value }) => { p[type] = value; });
      return `${p.year}-${p.month}-${p.day}`;
    }

    const locale = settings.language || 'en';
    return new Intl.DateTimeFormat(locale, options).format(date);
  };
}
