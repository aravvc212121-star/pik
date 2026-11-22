/**
 * ShareCode — Light-theme screen. Shows 6-digit code on a lime card.
 * Has two states: waiting (pre-connection) and connected (post-connection).
 */
import { JSX } from 'preact';
import { useState, useEffect, useCallback } from 'preact/hooks';
import { Header } from '../components/Header';
import { Button } from '../components/Button';
import { CodeCard } from '../components/CodeCard';
import { StatusPill } from '../components/StatusPill';
import './ShareCode.css';

interface ShareCodeProps {
  code: string;
  expiresAt: number;
  connected: boolean;
  onBack: () => void;
  onShare: () => void;
  onCopy: () => void;
  onCancel: () => void;
}

export function ShareCode({
  code,
  expiresAt,
  connected,
  onBack,
  onShare,
  onCopy,
  onCancel,
}: ShareCodeProps) {
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);

  useEffect(() => {
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      setCanShare(true);
    }
  }, []);

  const handleCopy = useCallback(() => {
    onCopy();
    setCopied(true);
  }, [onCopy]);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <div class="screen-page sharecode-root" data-theme="light">
      <div class="screen-container">
        <Header mode="back" onBack={onBack} />

        <div class="sharecode-center">
          <h1 class="sharecode-title">Your code</h1>

          <div class={`sharecode-card-wrap ${connected ? 'sharecode-card-wrap--faded' : ''}`}>
            <CodeCard code={code} expiresAt={expiresAt} />
          </div>

          <div class="sharecode-pill-wrap">
            {connected ? (
              <StatusPill status="connected" label="Receiver connected" />
            ) : (
              <StatusPill status="waiting" label="Waiting for the other phone…" />
            )}
          </div>

          <p class="sharecode-info">
            {connected
              ? 'Code locked. Waiting for them to accept.'
              : 'Tell them this code, or send it in any chat. It works once.'
            }
          </p>
        </div>

        <div class="sharecode-footer">
          {connected ? (
            <Button variant="ghost" label="Cancel" onClick={onCancel} />
          ) : (
            <>
              {canShare && (
                <Button variant="primary" label="Share code" onClick={onShare} />
              )}
              <Button
                variant={canShare ? 'secondary' : 'primary'}
                label={copied ? 'Copied' : 'Copy code'}
                onClick={handleCopy}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
