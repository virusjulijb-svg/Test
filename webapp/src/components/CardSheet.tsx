import type { ReactNode } from 'react';
import { CardDetail } from './CardView';
import { Modal } from './Modal';
import { useStore } from '../store';

/** Kartendetails mit optionalen Aktionen; auf dem Handy als Blatt am unteren Rand. */
export function CardSheet({ id, onClose, children }: { id: number; onClose: () => void; children?: ReactNode }) {
  const { db } = useStore();
  return (
    <Modal title={db.get(id)?.name ?? 'Karte'} onClose={onClose}>
      <div className="sheet-detail"><CardDetail id={id} /></div>
      {children && <div className="sheet-actions">{children}</div>}
    </Modal>
  );
}
