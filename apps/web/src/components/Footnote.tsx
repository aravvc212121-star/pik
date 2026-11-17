/**
 * Footnote — centered muted text at bottom
 */
import { JSX, ComponentChildren } from 'preact';
import './Footnote.css';

interface FootnoteProps {
  children: ComponentChildren;
}

export function Footnote({ children }: FootnoteProps): JSX.Element {
  return <p class="footnote">{children}</p>;
}

