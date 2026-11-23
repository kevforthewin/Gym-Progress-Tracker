import { NavLink, useLocation } from 'react-router-dom';

const items = [
  { to: '/', label: 'Heute', icon: '🏠', match: (p: string) => p === '/' || p.startsWith('/session') },
  { to: '/history', label: 'Verlauf', icon: '📅', match: (p: string) => p.startsWith('/history') },
  { to: '/progress', label: 'Fortschritt', icon: '📈', match: (p: string) => p.startsWith('/progress') },
  {
    to: '/settings',
    label: 'Einstellungen',
    icon: '⚙️',
    match: (p: string) => p.startsWith('/settings') || p.startsWith('/manage') || p.startsWith('/quick'),
  },
];

export function BottomNav() {
  const { pathname } = useLocation();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
      <ul className="mx-auto flex max-w-2xl">
        {items.map((i) => {
          const active = i.match(pathname);
          return (
            <li key={i.to} className="flex-1">
              <NavLink
                to={i.to}
                className={`flex flex-col items-center py-2 text-xs ${active ? 'font-semibold text-emerald-600 dark:text-emerald-400' : 'text-slate-500'}`}
              >
                <span className="text-lg" aria-hidden>
                  {i.icon}
                </span>
                {i.label}
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
