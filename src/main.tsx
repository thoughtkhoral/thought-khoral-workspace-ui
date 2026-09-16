import '@patternfly/react-core/dist/styles/base.css';

import { Alert, Bullseye, Spinner } from '@patternfly/react-core';
import { StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';

import { RoomPage } from './features/room/RoomPage';
import type { ParticipantRole } from './features/decisions/DecisionCard';
import type { AuthenticatedSocketFactory } from './features/room/useRoomSocket';

import '@patternfly/chatbot/dist/css/main.css';

declare global {
  interface Window {
    thoughtKhoralWorkspace?: {
      roomId?: string;
      participantRole: ParticipantRole;
      getAccessToken: () => Promise<string>;
      createSocket: AuthenticatedSocketFactory;
      socketUrl?: string;
      onEnterRoom?: (roomId: string) => void;
      onLeaveRoom?: () => void;
    };
  }
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('The workspace root element is unavailable.');
}

const bootstrap = window.thoughtKhoralWorkspace;
createRoot(rootElement).render(
  <StrictMode>
    <Suspense
      fallback={
        <Bullseye>
          <Spinner aria-label="Loading workspace" />
        </Bullseye>
      }
    >
      {bootstrap ? (
        <RoomPage {...bootstrap} />
      ) : (
        <Bullseye>
          <Alert
            variant="danger"
            title="Workspace authentication is unavailable"
            role="alert"
            isInline
          >
            Start this UI from the OIDC-enabled host application.
          </Alert>
        </Bullseye>
      )}
    </Suspense>
  </StrictMode>,
);
