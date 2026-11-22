import { NavLink } from 'react-router-dom';

const items = [
  { to: '/', label: 'Start', icon: '🏠' },
  { to: '/history', label: 'Historie', icon: '📅' },
  { to: '/progress', label: 'Fortschritt', icon: '📈' },
  { to: '/manage', label: 'Verwalten', icon: '🛠️' },
  { to: '/settings', label: 'Mehr', icon: '⚙️' },
];

export function BottomNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
      <ul className="mx-auto flex max-w-2xl">
        {items.map((i) => (
          <li key={i.to} className="flex-1">
            <NavLink
              to={i.to}
              end={i.to === '/'}
              className={({ isActive }) =>
                `flex flex-col items-center py-2 text-xs ${isActive ? 'font-semibold text-emerald-600 dark:text-emerald-400' : 'text-slate-500'}`
              }
            >
              <span className="text-lg" aria-hidden>
                {i.icon}
              </span>
              {i.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
