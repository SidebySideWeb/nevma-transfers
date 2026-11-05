import { isDriversEnabled } from './features';

export type NavItem = { href: string; id: string; label: string; count?: number };
export type NavGroup = { id: string; label: string; items: NavItem[] };

/** Sidebar groups. Drivers / Reports appear only when FEATURE_DRIVERS=true. Today is always shown. */
export function buildAdminNav(opts: { needsVehicle?: number; drivers?: boolean } = {}): NavGroup[] {
  const drivers = opts.drivers ?? isDriversEnabled();
  const needsVehicle = opts.needsVehicle ?? 0;

  const operations: NavItem[] = [
    { href: '/today', id: 'today', label: 'Today' },
    { href: '/bookings', id: 'bookings', label: 'Bookings', count: needsVehicle },
    { href: '/calendar', id: 'calendar', label: 'Fleet calendar' },
    { href: '/customers', id: 'customers', label: 'Customers' },
    { href: '/blocked-slots', id: 'blocked-slots', label: 'Blocked slots' },
  ];

  const groups: NavGroup[] = [{ id: 'operations', label: 'Operations', items: operations }];

  if (drivers) {
    groups.push({
      id: 'drivers',
      label: 'Drivers',
      items: [
        { href: '/drivers', id: 'drivers', label: 'Drivers' },
        { href: '/reports', id: 'reports', label: 'Reports' },
      ],
    });
  }

  groups.push(
    {
      id: 'pricing',
      label: 'Pricing',
      items: [
        { href: '/prices', id: 'prices', label: 'Zone prices' },
        { href: '/hourly-rates', id: 'hourly-rates', label: 'Hourly rates' },
        { href: '/extras', id: 'extras', label: 'Extras' },
      ],
    },
    {
      id: 'setup',
      label: 'Setup',
      items: [
        { href: '/fleet', id: 'fleet', label: 'Fleet' },
        { href: '/zones', id: 'zones', label: 'Zones' },
        { href: '/settings', id: 'settings', label: 'Settings' },
      ],
    },
  );

  return groups.filter((g) => g.items.length > 0);
}
