import { useUpdateTracking } from '../api/tracking.ts';
import { Icon } from './Icon.tsx';

export function FavoriteButton({ id, favorite }: { id: number; favorite: boolean }) {
  const update = useUpdateTracking();
  const on = update.isPending ? !favorite : favorite;
  return (
    <button
      className="btn btn-sm btn-ghost"
      aria-pressed={on}
      aria-label={on ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
      title={on ? 'Remover dos favoritos' : 'Favoritar'}
      disabled={update.isPending}
      onClick={() => update.mutate({ id, favorite: !favorite })}
      style={{ color: on ? '#eab308' : 'var(--text-3)' }}
    >
      <Icon name="star" filled={on} />
    </button>
  );
}
