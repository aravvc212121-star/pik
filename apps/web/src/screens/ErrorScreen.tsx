/**
 * ErrorScreen — Quiet centered error block.
 * Adapts to light/dark theme. 80px outlined circle with glyph,
 * title, explanation, primary retry button.
 */
import { JSX } from 'preact';
import { Button } from '../components/Button';
import './ErrorScreen.css';

interface ErrorScreenProps {
  title: string;
  message: string;
  actionLabel: string;
  onAction: () => void;
  theme?: 'light' | 'dark';
}

export function ErrorScreen({
  title,
  message,
  actionLabel,
  onAction,
  theme = 'light',
}: ErrorScreenProps) {
  return (
    <div class="screen-page error-root" data-theme={theme}>
      <div class="screen-container">
        <div class="error-center">
          {/* 80px outlined circle with exclamation glyph */}
          <div class="error-icon" aria-hidden="true">
            <svg width="80" height="80" viewBox="0 0 80 80" fill="none">
              <circle
                cx="40"
                cy="40"
                r="38"
                stroke="currentColor"
                stroke-width="2"
                fill="none"
              />
              <path
                d="M40 24v20"
                stroke="currentColor"
                stroke-width="3"
                stroke-linecap="round"
              />
              <circle cx="40" cy="54" r="2" fill="currentColor" />
            </svg>
          </div>

          <h1 class="error-title">{title}</h1>
          <p class="error-message">{message}</p>
        </div>

        <div class="error-footer">
          <Button variant="primary" label={actionLabel} onClick={onAction} />
        </div>
      </div>
    </div>
  );
}
