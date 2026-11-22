import { CheckMark, Button } from '../components';
import './Sent.css';

interface SentProps {
  totalFiles: number;
  onSendMore: () => void;
  onDone: () => void;
}

export function Sent({ totalFiles, onSendMore, onDone }: SentProps) {
  const photoText = totalFiles === 1 ? 'photo' : 'photos';

  return (
    <div class="screen-page sent-root" data-theme="light">
      <div class="screen-container">
        {/* Centered content */}
        <div class="sent-center">
          <div class="sent-icon-wrap">
            <CheckMark size="lg" />
          </div>

          <h1 class="sent-title">Sent.</h1>

          <p class="sent-description">
            {totalFiles} {photoText} in full quality. Your originals are still on this phone.
          </p>
        </div>

        {/* Bottom buttons */}
        <div class="sent-footer">
          <Button
            variant="primary"
            label="Send more"
            onClick={onSendMore}
          />
          <Button
            variant="ghost"
            label="Done"
            onClick={onDone}
          />
        </div>
      </div>
    </div>
  );
}
