import type { ReactNode } from 'react';
import { useState } from 'react';
import { useDeleteJob } from '../api/tracking.ts';
import { Icon } from './Icon.tsx';
import { ConfirmDialog } from './ui.tsx';

interface Props {
  id: number;
  title: string;
  /** Personal data that will be lost with the job, to warn about it. */
  personal?: { favorite: boolean; hasNotes: boolean; applied: boolean };
  onDeleted?: () => void;
  /** Icon-only (lists) or labeled (detail page). */
  label?: ReactNode;
}

/** Trash button + confirmation modal. Deleting also stops future captures from re-adding the job. */
export function DeleteJobButton({ id, title, personal, onDeleted, label }: Props) {
  const [open, setOpen] = useState(false);
  const del = useDeleteJob();
  const lost = [personal?.favorite && 'favorita', personal?.hasNotes && 'notas', personal?.applied && 'estado da candidatura'].filter(Boolean);

  return (
    <>
      <button
        className={`btn btn-sm ${label ? 'btn-danger' : 'btn-ghost'}`}
        style={label ? undefined : { color: 'var(--text-3)' }}
        title="Excluir vaga"
        aria-label={`Excluir vaga: ${title}`}
        onClick={() => setOpen(true)}
      >
        <Icon name="trash" size={16} />
        {label}
      </button>
      {open && (
        <ConfirmDialog
          open
          title="Excluir esta vaga?"
          confirmLabel={del.isPending ? 'Excluindo…' : 'Excluir vaga'}
          danger
          onCancel={() => !del.isPending && setOpen(false)}
          onConfirm={() =>
            del.mutate(id, {
              onSuccess: () => {
                setOpen(false);
                onDeleted?.();
              },
            })
          }
        >
          <strong style={{ color: 'var(--text)' }}>{title}</strong>
          <p style={{ margin: '8px 0 0' }}>
            A vaga sai do acervo e <strong>não será capturada de novo</strong> nas próximas execuções. Para apenas escondê-la, use “Ignorar esta vaga”. Esta ação não pode ser desfeita.
          </p>
          {lost.length > 0 && (
            <p style={{ margin: '8px 0 0', color: 'var(--danger)' }}>Seus dados desta vaga também serão apagados: {lost.join(', ')}.</p>
          )}
          {del.error && <p style={{ margin: '8px 0 0', color: 'var(--danger)' }}>{del.error.message}</p>}
        </ConfirmDialog>
      )}
    </>
  );
}
