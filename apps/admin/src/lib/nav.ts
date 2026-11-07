import { features, filterAdminNav, type AdminNavGroup } from '@tem/features';

export type NavItem = { href: string; id: string; label: string; count?: number };
export type NavGroup = { id: string; label: string; items: NavItem[] };

/** Sidebar groups filtered by `@tem/features`. Today is always shown. */
export function buildAdminNav(opts: { needsVehicle?: number; f?: ReturnType<typeof features> } = {}): NavGroup[] {
  const f = opts.f ?? features();
  const needsVehicle = opts.needsVehicle ?? 0;
  const groups = filterAdminNav(f) as AdminNavGroup[];

  return groups.map((g) => ({
    id: g.id,
    label: g.label,
    items: g.items.map((item) =>
      item.id === 'bookings' && needsVehicle > 0
        ? { href: item.href, id: item.id, label: item.label, count: needsVehicle }
        : { href: item.href, id: item.id, label: item.label },
    ),
  }));
}
