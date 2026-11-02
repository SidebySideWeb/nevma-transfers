const WORDS: Record<string, string> = {
  scheduled: 'Scheduled',
  on_way: 'On the way',
  arrived: 'Arrived',
  on_board: 'Passenger on board',
  completed: 'Completed',
  no_show: 'No-show',
};

export function tripStatusWord(status: string): string {
  return WORDS[status] ?? status;
}

export function tripStatusClass(status: string): string {
  return `trip-${status}`;
}
