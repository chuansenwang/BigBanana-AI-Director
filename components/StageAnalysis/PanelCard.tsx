import React from 'react';
import { PANEL_CLASS_NAME } from './constants';

interface PanelCardProps {
  eyebrow: string;
  title: string;
  description: string;
  bullets: string[];
}

const PanelCard: React.FC<PanelCardProps> = ({ eyebrow, title, description, bullets }) => {
  return (
    <section className={PANEL_CLASS_NAME}>
      <div className="text-[10px] font-mono uppercase tracking-[0.24em] text-[var(--text-muted)]">{eyebrow}</div>
      <h2 className="mt-2 text-lg font-semibold text-[var(--text-primary)]">{title}</h2>
      <p className="mt-3 text-sm leading-7 text-[var(--text-tertiary)]">{description}</p>
      <ul className="mt-4 space-y-2 text-sm leading-7 text-[var(--text-tertiary)]">
        {bullets.map((bullet) => (
          <li key={bullet}>· {bullet}</li>
        ))}
      </ul>
    </section>
  );
};

export default PanelCard;
