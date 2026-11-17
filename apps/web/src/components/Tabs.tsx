/**
 * Tabs component: Send / Receive segmented control
 */
import { JSX } from 'preact';
import './Tabs.css';

export type TabId = 'send' | 'receive';

interface TabsProps {
  active: TabId;
  onChange: (tab: TabId) => void;
}

export function Tabs({ active, onChange }: TabsProps): JSX.Element {
  return (
    <div class="tabs" role="tablist" aria-label="Send or Receive">
      <button
        type="button"
        role="tab"
        class={`tabs__tab ${active === 'send' ? 'tabs__tab--active' : ''}`}
        aria-selected={active === 'send'}
        onClick={() => onChange('send')}
        id="tab-send"
        aria-controls="panel-send"
      >
        Send
      </button>
      <button
        type="button"
        role="tab"
        class={`tabs__tab ${active === 'receive' ? 'tabs__tab--active' : ''}`}
        aria-selected={active === 'receive'}
        onClick={() => onChange('receive')}
        id="tab-receive"
        aria-controls="panel-receive"
      >
        Receive
      </button>
    </div>
  );
}

