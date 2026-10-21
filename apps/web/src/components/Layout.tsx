import { useState, type FormEvent } from 'react';
import { NavLink, Outlet, useNavigate, useSearchParams } from 'react-router';
import { useStats } from '../api/hooks.ts';
import { CaptureButton } from './CaptureButton.tsx';
import { Icon, type IconName } from './Icon.tsx';
import { ThemeToggle } from './ThemeToggle.tsx';
import s from './Layout.module.css';

const NAV: { group: string; items: { to: string; label: string; icon: IconName; count?: 'unreviewed' | 'favorites' | 'pendingReviews' }[] }[] = [
  {
    group: 'Vagas',
    items: [
      { to: '/', label: 'Dashboard', icon: 'dashboard' },
      { to: '/hoje', label: 'Vagas de hoje', icon: 'today' },
      { to: '/vagas', label: 'Todas as vagas', icon: 'jobs', count: 'unreviewed' },
      { to: '/favoritas', label: 'Favoritas', icon: 'star', count: 'favorites' },
      { to: '/candidaturas', label: 'Candidaturas', icon: 'briefcase' },
    ],
  },
  {
    group: 'Captura',
    items: [
      { to: '/fontes', label: 'Fontes', icon: 'sources' },
      { to: '/capturas', label: 'Histórico de capturas', icon: 'history' },
      { to: '/duplicatas', label: 'Revisão de duplicatas', icon: 'copy', count: 'pendingReviews' },
    ],
  },
  {
    group: 'Você',
    items: [
      { to: '/perfil', label: 'Perfil e preferências', icon: 'user' },
      { to: '/configuracoes', label: 'Configurações', icon: 'settings' },
      { to: '/exportar', label: 'Exportação', icon: 'download' },
    ],
  },
];

export function Layout() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [term, setTerm] = useState(params.get('q') ?? '');
  const stats = useStats();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    navigate(`/vagas${term.trim() ? `?q=${encodeURIComponent(term.trim())}` : ''}`);
  };

  return (
    <div className={s.shell}>
      <aside className={`${s.sidebar} ${open ? s.sidebarOpen : ''}`} aria-label="Navegação principal">
        <div className={s.brand}>
          <span className={s.logo}>JH</span>
          AI Job Hunter
        </div>
        {NAV.map((g) => (
          <nav key={g.group} aria-label={g.group}>
            <div className={s.navGroup}>{g.group}</div>
            {g.items.map((i) => {
              const n = i.count ? stats.data?.kpis[i.count] : undefined;
              return (
                <NavLink key={i.to} to={i.to} end={i.to === '/'} onClick={() => setOpen(false)} className={({ isActive }) => `${s.navLink} ${isActive ? s.active : ''}`}>
                  <Icon name={i.icon} />
                  {i.label}
                  {n ? <span className={s.count}>{n.toLocaleString('pt-BR')}</span> : null}
                </NavLink>
              );
            })}
          </nav>
        ))}
      </aside>
      {open && <div className={s.backdrop} onClick={() => setOpen(false)} />}
      <div className={s.main}>
        <header className={s.topbar}>
          <button className={`btn btn-ghost ${s.menuButton}`} aria-label="Abrir menu" onClick={() => setOpen(true)}>
            <Icon name="menu" />
          </button>
          <form className={s.search} role="search" onSubmit={submit}>
            <span className={s.searchIcon}>
              <Icon name="search" size={16} />
            </span>
            <label htmlFor="global-search" className="visually-hidden">
              Buscar vagas
            </label>
            <input
              id="global-search"
              className="input"
              type="search"
              placeholder="Buscar vagas: cargo, empresa, tecnologia…"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
            />
          </form>
          <ThemeToggle />
          <CaptureButton />
        </header>
        <main className={s.content}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
