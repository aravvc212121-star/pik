/**
 * Error / Expired screen
 */
import { JSX } from 'preact';
import { ErrorIcon } from '../components/Icons';
import { Button } from '../components/Button';
import './ErrorScreen.css';

interface ErrorScreenProps {
  title: string;
  message: string;
  actionLabel: string;
  onAction: () => void;
}

export function ErrorScreen({ title, message, actionLabel, onAction }: ErrorScreenProps): JSX.Element {
  return (
    <div class="error-screen">
      <div class="error-screen__center">
        <ErrorIcon size={64} />
        <h2 class="error-screen__title">{title}</h2>
        <p class="error-screen__message">{message}</p>
      </div>
      <Button variant="primary" onClick={onAction}>
        {actionLabel}
      </Button>
    </div>
  );
}
