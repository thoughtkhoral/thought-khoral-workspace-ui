import { useEffect, useRef, useState } from 'react';
import type { ChatSendValues } from '../../api';
import {
  ConversationError,
  PROFILE_VERSION,
  safeConversationError,
  type AcceptedTurn,
  type CatalogPage,
  type ConversationApi,
  type ConversationView,
  type SelectedSettings,
  type TaskView,
} from './conversationApi';

interface Options {
  roomId?: string;
  agentId: string;
  enabled: boolean;
  getAccessToken: () => Promise<string>;
  api: ConversationApi;
  loadModels?: boolean;
}
type ActiveTask = Pick<AcceptedTurn, 'taskId' | 'conversationId' | 'generation' | 'selectedSettings'>;

export function useAgentConversation({ roomId, agentId, enabled, getAccessToken, api, loadModels = true }: Options) {
  const [view, setView] = useState<ConversationView | null>(null);
  const [catalog, setCatalog] = useState<CatalogPage | null>(null);
  const [task, setTask] = useState<TaskView | null>(null);
  const [error, setError] = useState<ConversationError | null>(null);
  const [isAvailable, setIsAvailable] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTask, setActiveTask] = useState<ActiveTask | null>(null);
  const [draftSettings, setDraftSettings] = useState<SelectedSettings | null>(null);
  const [needsEffortAcknowledgement, setNeedsEffortAcknowledgement] = useState(false);
  const [newSession, setNewSession] = useState(false);
  const [resetAcknowledged, setResetAcknowledged] = useState(false);
  const epoch = useRef(0);
  const submitLock = useRef(false);
  const tokenSource = useRef(getAccessToken);
  tokenSource.current = getAccessToken;
  const setServerView = (next: ConversationView) => {
    setView(next);
    const state = next.conversation;
    setActiveTask(state?.activeTaskId ? {
      taskId: state.activeTaskId,
      conversationId: state.id,
      generation: state.generation,
      selectedSettings: state.selectedSettings,
    } : null);
  };
  useEffect(() => {
    const current = ++epoch.current;
    setView(null);
    setCatalog(null);
    setTask(null);
    setError(null);
    setIsAvailable(false);
    setActiveTask(null);
    setDraftSettings(null);
    setNeedsEffortAcknowledgement(false);
    setNewSession(false);
    setResetAcknowledged(false);
    setIsSubmitting(false);
    submitLock.current = false;
    if (enabled && roomId) {
      void (async () => {
        try {
          const token = await tokenSource.current();
          if (epoch.current !== current) return;
          const restored = await api.getConversation(token, roomId, agentId);
          if (epoch.current !== current) return;
          setServerView(restored);
          setIsAvailable(true);
          if (loadModels) {
            const models: CatalogPage['data'] = [];
            const seen = new Set<string>();
            let cursor: string | undefined;
            let revision: string | undefined;
            for (let pageCount = 0; ; pageCount++) {
              if (pageCount >= 100) throw new ConversationError('unexpected');
              const page = await api.listModels(token, roomId, agentId, cursor);
              if (epoch.current !== current) return;
              const revisionChanged = revision && revision !== page.catalogRevision;
              const duplicateModel = page.data.some(model => models.some(prior => prior.id === model.id));
              if (revisionChanged || duplicateModel) throw new ConversationError('unexpected');
              revision = page.catalogRevision;
              models.push(...page.data);
              if (!page.nextCursor) {
                setCatalog({ ...page, data: models });
                break;
              }
              if (seen.has(page.nextCursor)) throw new ConversationError('unexpected');
              seen.add(page.nextCursor);
              cursor = page.nextCursor;
            }
          }
        } catch (failure) {
          if (epoch.current !== current) return;
          setError(safeConversationError(failure));
          setIsAvailable(false);
          setActiveTask(null);
        }
      })();
    }
    return () => {
      ++epoch.current;
    };
  }, [enabled, roomId, agentId, api, loadModels]);
  useEffect(() => {
    if (!enabled || !roomId || !activeTask || !isAvailable) return;
    const current = epoch.current;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const token = await tokenSource.current();
        if (cancelled || epoch.current !== current) return;
        const next = await api.getTask(token, roomId, activeTask.taskId);
        if (cancelled || epoch.current !== current) return;
        if (next.conversationId !== activeTask.conversationId || next.generation !== activeTask.generation) throw new ConversationError('unexpected');
        setTask(next);
        if (next.state === 'completed' || next.state === 'failed') {
          if (next.failure) setError(new ConversationError(next.failure.code));
          const restored = await api.getConversation(token, roomId, agentId);
          if (cancelled || epoch.current !== current) return;
          setServerView(restored);
          return;
        }
        timer = setTimeout(() => void poll(), 1000);
      } catch (failure) {
        if (cancelled || epoch.current !== current) return;
        setError(safeConversationError(failure));
        setActiveTask(null);
        setIsAvailable(false);
      }
    };
    timer = setTimeout(() => void poll(), 1000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [enabled, roomId, agentId, activeTask, isAvailable, api]);
  const busy = isSubmitting || activeTask !== null;
  const freshSelection = newSession || !view?.conversation;
  const validDraft = Boolean(draftSettings && catalog && draftSettings.catalogRevision === catalog.catalogRevision &&
    catalog.data.some(model => model.id === draftSettings.model &&
      model.supportedReasoningEfforts.some(effort => effort.id === draftSettings.reasoningEffort)));
  const needsSettingsSelection = loadModels && freshSelection && !validDraft;
  const selectModel = (modelId: string) => {
    if (busy || !catalog) return;
    const model = catalog.data.find(option => option.id === modelId);
    if (!model) return;
    const oldEffort = draftSettings?.reasoningEffort ?? (freshSelection ? undefined : view?.conversation?.selectedSettings?.reasoningEffort);
    const retained = model.supportedReasoningEfforts.some(effort => effort.id === oldEffort);
    const nextEffort = retained ? oldEffort : model.defaultReasoningEffort;
    if (!nextEffort) {
      setError(new ConversationError('invalid_task_input'));
      return;
    }
    setDraftSettings({ model: model.id, reasoningEffort: nextEffort, catalogRevision: catalog.catalogRevision });
    setNeedsEffortAcknowledgement(!retained);
  };
  const selectEffort = (effortId: string) => {
    if (busy || !catalog) return;
    const modelId = draftSettings?.model ?? (freshSelection ? undefined : view?.conversation?.selectedSettings?.model);
    const model = catalog.data.find(option => option.id === modelId);
    if (!model?.supportedReasoningEfforts.some(effort => effort.id === effortId)) return;
    setDraftSettings({ model: model.id, reasoningEffort: effortId, catalogRevision: catalog.catalogRevision });
    setNeedsEffortAcknowledgement(false);
  };
  const submit = async (values: ChatSendValues): Promise<boolean> => {
    if (submitLock.current || !roomId || !enabled || !isAvailable) return false;
    if (values.delivery !== 'room') {
      setError(new ConversationError('invalid_task_input'));
      return false;
    }
    if (needsSettingsSelection || (draftSettings && !validDraft) || needsEffortAcknowledgement || (newSession && !resetAcknowledged)) return false;
    const current = epoch.current;
    submitLock.current = true;
    setIsSubmitting(true);
    setError(null);
    try {
      const token = await tokenSource.current();
      if (epoch.current !== current) return false;
      const restored = await api.getConversation(token, roomId, agentId);
      if (epoch.current !== current) return false;
      setServerView(restored);
      const state = restored.conversation;
      if (loadModels && (newSession || !state) && !validDraft) return false;
      if (state?.activeTaskId) throw new ConversationError('conversation_busy');
      if (state?.state === 'unusable' && !newSession) throw new ConversationError('session_unavailable');
      const accepted = await api.sendTurn(token, {
        profileVersion: PROFILE_VERSION,
        requestId: crypto.randomUUID(),
        roomId,
        agentId,
        occurredAt: new Date().toISOString(),
        text: values.text,
        mentions: values.mentions,
        conversation: newSession || !state ? { mode: 'new' } : { mode: 'continue', id: state.id, generation: state.generation },
        ...(draftSettings ? { settings: draftSettings } : {})
      });
      if (epoch.current !== current) return false;
      setTask(null);
      setActiveTask(accepted);
      setNewSession(false);
      setResetAcknowledged(false);
      setDraftSettings(null);
      return true;
    } catch (failure) {
      if (epoch.current === current) {
        const safe = safeConversationError(failure);
        setError(safe);
        if (safe.code === 'authentication_required') {
          setIsAvailable(false);
          setActiveTask(null);
        }
      }
      return false;
    } finally {
      if (epoch.current === current) {
        submitLock.current = false;
        setIsSubmitting(false);
      }
    }
  };
  return {
    view,
    catalog,
    task,
    error,
    isAvailable,
    busy,
    isSubmitting,
    draftSettings,
    selectModel,
    selectEffort,
    needsEffortAcknowledgement,
    needsSettingsSelection,
    submittedSettings: activeTask?.selectedSettings,
    pendingConfirmation: Boolean(activeTask && !task && view?.conversation?.activeTaskId !== activeTask.taskId),
    acknowledgeEffort: () => setNeedsEffortAcknowledgement(false),
    newSession,
    resetAcknowledged,
    chooseNewSession: () => {
      if (!busy) {
        setNewSession(true);
        setDraftSettings(null);
        setNeedsEffortAcknowledgement(false);
        setResetAcknowledged(false);
      }
    },
    continueSession: () => {
      if (!busy) {
        setNewSession(false);
        setDraftSettings(null);
        setNeedsEffortAcknowledgement(false);
        setResetAcknowledged(false);
      }
    },
    acknowledgeReset: (value: boolean) => setResetAcknowledged(value),
    submit
  };
}
export type AgentConversation = ReturnType<typeof useAgentConversation>;
