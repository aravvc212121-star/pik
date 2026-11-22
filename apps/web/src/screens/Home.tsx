import { useRef, useState } from 'preact/hooks';
import { Wordmark, IconButton } from '../components';
import './Home.css';

interface HomeProps {
  onSend: (files: File[]) => void;
  onReceive: () => void;
  onPrivacyClick: () => void;
}

export function Home({ onSend, onReceive, onPrivacyClick }: HomeProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  function handleSendClick() {
    fileInputRef.current?.click();
  }

  function handleFileChange(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const files = input.files ? Array.from(input.files) : [];
    if (files.length > 0) {
      onSend(files);
    }
    input.value = '';
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }

  function handleDragLeave(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files);
      onSend(files);
    }
  }

  return (
    <div
      class={`home-root ${isDragOver ? 'home-root--drag-over' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,video/*"
        class="home-file-input"
        onChange={handleFileChange}
        aria-hidden="true"
        tabIndex={-1}
      />

      {/* Top half — SEND (light theme) */}
      <div class="home-half home-half--light" data-theme="light">
        <button
          type="button"
          class="home-half-btn"
          onClick={handleSendClick}
          aria-label="Send photos"
        >
          <div class="home-half-content home-half-content--bottom">
            <div class="home-icon-circle home-icon-circle--ink" aria-hidden="true">
              <svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden="true">
                <path
                  d="M13 20V6M6 13l7-7 7 7"
                  stroke="white"
                  stroke-width="2.4"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </div>
            <h1 class="home-word">Send</h1>
            <p class="home-tagline">Pick photos and share a code.</p>
          </div>
        </button>
      </div>

      {/* Bottom half — RECEIVE (dark theme) */}
      <div class="home-half home-half--dark" data-theme="dark">
        <button
          type="button"
          class="home-half-btn"
          onClick={onReceive}
          aria-label="Receive photos"
        >
          <div class="home-half-content home-half-content--top">
            <div class="home-icon-circle home-icon-circle--lime" aria-hidden="true">
              <svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden="true">
                <path
                  d="M13 6v14M6 13l7 7 7-7"
                  stroke="#0E0E10"
                  stroke-width="2.4"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </div>
            <h1 class="home-word">Receive</h1>
            <p class="home-tagline">Enter a code. Photos drop in.</p>
          </div>
        </button>
      </div>

      {/* Overlaid: Wordmark at top-left */}
      <div class="home-overlay-tl">
        <Wordmark />
      </div>

      {/* Overlaid: Privacy icon button at top-right */}
      <div class="home-overlay-tr">
        <IconButton
          aria-label="Privacy"
          variant="privacy"
          icon="lock"
          onClick={onPrivacyClick}
        />
      </div>
    </div>
  );
}
