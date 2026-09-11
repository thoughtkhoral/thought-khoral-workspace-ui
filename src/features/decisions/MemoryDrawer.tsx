import {
  Content,
  Drawer,
  DrawerActions,
  DrawerCloseButton,
  DrawerContent,
  DrawerContentBody,
  DrawerHead,
  DrawerPanelBody,
  DrawerPanelContent,
  Stack,
  StackItem,
  Title,
} from '@patternfly/react-core';
import type { ReactNode } from 'react';

import { DecisionCard, type Decision } from './DecisionCard';

export interface MemoryDrawerProps {
  decisions: readonly Decision[];
  isExpanded: boolean;
  onClose: () => void;
  children: ReactNode;
}

export function MemoryDrawer({
  decisions,
  isExpanded,
  onClose,
  children,
}: MemoryDrawerProps) {
  const activeDecisions = decisions.filter(
    (decision) => decision.status === 'active',
  );
  const panelContent = (
    <DrawerPanelContent
      id="collective-memory-panel"
      isResizable
      minSize="18rem"
      defaultSize="28rem"
      aria-label="Collective memory"
    >
      <DrawerHead>
        <Title headingLevel="h2" id="collective-memory-title">
          Collective memory
        </Title>
        <DrawerActions>
          <DrawerCloseButton
            aria-label="Close collective memory"
            onClick={onClose}
          />
        </DrawerActions>
      </DrawerHead>
      <DrawerPanelBody>
        {activeDecisions.length === 0 ? (
          <Content component="p">No active decisions yet.</Content>
        ) : (
          <Stack hasGutter>
            {activeDecisions.map((decision) => (
              <StackItem key={decision.id}>
                <DecisionCard
                  decision={decision}
                  participantRole="agent"
                  onTransition={() => undefined}
                />
              </StackItem>
            ))}
          </Stack>
        )}
      </DrawerPanelBody>
    </DrawerPanelContent>
  );

  return (
    <Drawer isExpanded={isExpanded} isInline>
      <DrawerContent panelContent={isExpanded ? panelContent : null}>
        <DrawerContentBody>{children}</DrawerContentBody>
      </DrawerContent>
    </Drawer>
  );
}
