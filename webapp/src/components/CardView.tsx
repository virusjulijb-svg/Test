import { useState, type MouseEvent, type ReactNode } from 'react';
import { imageUrl } from '../lib/api';
import { banStatus } from '../lib/carddb';
import type { BanFormat, Card } from '../lib/types';
import { useStore } from '../store';

const FRAME_COLORS: Record<string, string> = {
  normal: '#c9a15d', effect: '#c7703a', ritual: '#5a7fc4', fusion: '#8a5bb0', synchro: '#d8d8d8',
  xyz: '#2b2b2b', link: '#2a5d9c', spell: '#1d9a86', trap: '#b0417e', token: '#888', effect_pendulum: '#c7703a',
};

interface Props {
  id: number;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  onClick?: (e: MouseEvent) => void;
  onContextMenu?: (e: MouseEvent) => void;
  onMouseEnter?: () => void;
  faceDown?: boolean;
  dim?: boolean;
  selected?: boolean;
  badge?: ReactNode;
  title?: string;
  className?: string;
}

function BanMark({ card, format }: { card: Card; format: BanFormat }) {
  const s = banStatus(card, format);
  if (!s) return null;
  const label = s === 'Forbidden' ? '0' : s === 'Limited' ? '1' : '2';
  return <span className={`ban ban-${label}`} title={s}>{label}</span>;
}

/** Kartenbild mit Text-Ersatz, falls kein Bild verfügbar ist. */
export function CardView({ id, size = 'sm', onClick, onContextMenu, onMouseEnter, faceDown, dim, selected, badge, title, className = '' }: Props) {
  const { db, state } = useStore();
  const card = db.get(id);
  const [failed, setFailed] = useState(false);
  const cls = `card card-${size} ${dim ? 'dim' : ''} ${selected ? 'selected' : ''} ${onClick ? 'clickable' : ''} ${className}`;
  if (faceDown) {
    return (
      <div className={`${cls} card-back`} onClick={onClick} onContextMenu={onContextMenu} onMouseEnter={onMouseEnter} title={title ?? (card ? `${card.name} (verdeckt)` : 'verdeckt')}>
        {badge}
      </div>
    );
  }
  const imgId = card?.imageIds[0];
  const showImg = !!imgId && !failed;
  return (
    <div
      className={cls}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onMouseEnter={onMouseEnter}
      title={title ?? card?.name}
      data-card={card?.name}
      data-frame={card?.frameType}
      style={!showImg ? { background: FRAME_COLORS[card?.frameType ?? ''] ?? '#555' } : undefined}
    >
      {showImg ? (
        <img src={imageUrl(imgId!, size === 'lg' ? 'full' : 'small')} alt={card?.name} loading="lazy" onError={() => setFailed(true)} />
      ) : (
        <span className="card-text">{card?.name ?? `#${id}`}</span>
      )}
      {card && <BanMark card={card} format={state.settings.format} />}
      {badge}
    </div>
  );
}

export function CardDetail({ id }: { id: number | null }) {
  const { db, state } = useStore();
  const c = id != null ? db.get(id) : undefined;
  if (!c) return <div className="detail empty">Fahre über eine Karte, um Details zu sehen.</div>;
  const ban = banStatus(c, state.settings.format);
  const stats = [
    c.attribute,
    c.level != null ? `${c.frameType.startsWith('xyz') ? 'Rang' : 'Stufe'} ${c.level}` : undefined,
    c.linkval != null ? `Link ${c.linkval}` : undefined,
    c.scale != null ? `Skala ${c.scale}` : undefined,
    c.atk != null ? `ATK ${c.atk}` : undefined,
    c.def != null ? `DEF ${c.def}` : undefined,
  ].filter(Boolean);
  return (
    <div className="detail">
      <CardView id={c.id} size="lg" />
      <div>
        <h3>{c.name}</h3>
        <div className="muted">{c.type} · {c.race}{c.archetype ? ` · ${c.archetype}` : ''}</div>
        {stats.length > 0 && <div className="muted">{stats.join(' · ')}</div>}
        {ban && <div className={`ban-text ban-${ban}`}>{state.settings.format.toUpperCase()}: {ban}</div>}
        <p className="desc">{c.desc}</p>
      </div>
    </div>
  );
}
