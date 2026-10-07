import { useEffect, useRef, useState } from 'react';
import type { ChatSendValues } from '../../api';
import { ConversationError, PROFILE_VERSION, safeConversationError, type AcceptedTurn, type CatalogPage,
  type ConversationApi, type ConversationView, type SelectedSettings, type TaskView } from './conversationApi';
interface Options {
  roomId?: string; agentId: string; enabled: boolean; getAccessToken: () => Promise<string>; api: ConversationApi;
  modelSelection?: boolean; reasoningEffort?: boolean;
}
type ActiveTask = Pick<AcceptedTurn, 'taskId' | 'conversationId' | 'generation' | 'selectedSettings'>;
const pairInCatalog = (pair: SelectedSettings, catalog: CatalogPage): boolean =>
  pair.catalogRevision === catalog.catalogRevision && catalog.data.some(model => model.id === pair.model &&
    model.supportedReasoningEfforts.some(effort => effort.id === pair.reasoningEffort));
async function loadCatalog(api: ConversationApi, token: string, room: string, agent: string, current: () => boolean): Promise<CatalogPage | null> {
  const models: CatalogPage['data'] = []; const seen = new Set<string>();
  let cursor: string | undefined; let revision: string | undefined;
  for (let count = 0; count < 100; count++) {
    const page = await api.listModels(token, room, agent, cursor);
    if (!current()) return null;
    if ((revision && revision !== page.catalogRevision) || page.data.some(model => models.some(prior => prior.id === model.id))) throw new ConversationError('unexpected');
    revision = page.catalogRevision; models.push(...page.data);
    if (!page.nextCursor) return { ...page, data: models };
    if (seen.has(page.nextCursor)) throw new ConversationError('unexpected');
    seen.add(page.nextCursor); cursor = page.nextCursor;
  }
  throw new ConversationError('unexpected');
}
export function useAgentConversation({ roomId, agentId, enabled, getAccessToken, api, modelSelection = true, reasoningEffort = true }: Options) {
  const supportsSettings = modelSelection || reasoningEffort;
  const [view, setView] = useState<ConversationView | null>(null);
  const [catalog, setCatalog] = useState<CatalogPage | null>(null);
  const [task, setTask] = useState<TaskView | null>(null);
  const [error, setError] = useState<ConversationError | null>(null);
  const [isAvailable, setIsAvailable] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTask, setActiveTask] = useState<ActiveTask | null>(null);
  const [selectedSettings, setSelectedSettings] = useState<SelectedSettings | null>(null);
  const [draftSettings, setDraftSettings] = useState<SelectedSettings | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [needsEffortAcknowledgement, setNeedsEffortAcknowledgement] = useState(false);
  const [newSession, setNewSession] = useState(false);
  const [resetAcknowledged, setResetAcknowledged] = useState(false);
  const epoch = useRef(0); const settingsSequence = useRef(0); const submitLock = useRef(false);
  const tokenSource = useRef(getAccessToken); tokenSource.current = getAccessToken;
  const setServerView = (next: ConversationView) => {
    setView(next); const state = next.conversation;
    setActiveTask(state?.activeTaskId ? { taskId: state.activeTaskId, conversationId: state.id,
      generation: state.generation, selectedSettings: state.selectedSettings } : null);
  };
  const invalidateSettings = (failure: unknown) => {
    ++settingsSequence.current; setSelectedSettings(null); setDraftSettings(null); setSettingsLoading(false);
    setNeedsEffortAcknowledgement(false); setError(safeConversationError(failure)); setIsAvailable(false);
    if (safeConversationError(failure).code === 'authentication_required') { setActiveTask(null); setCatalog(null); }
  };
  // Every acquisition is bounded, single-shot, and belongs to both a room epoch and a human settings action.
  const acquire = async (mode: 'restore' | 'new' | 'refresh', roomEpoch = epoch.current): Promise<void> => {
    if (!enabled || !roomId || submitLock.current) return;
    const sequence = ++settingsSequence.current;
    const current = () => epoch.current === roomEpoch && settingsSequence.current === sequence;
    setSelectedSettings(null); setDraftSettings(null); setNeedsEffortAcknowledgement(false);
    setSettingsLoading(supportsSettings); setIsAvailable(false); setError(null);
    try {
      const token = await tokenSource.current(); if (!current()) return;
      const restored = mode === 'new' ? view : await api.getConversation(token, roomId, agentId);
      if (!current()) return;
      if (restored && mode !== 'new') setServerView(restored);
      if (supportsSettings) {
        const nextCatalog = await loadCatalog(api, token, roomId, agentId, current);
        if (!current() || !nextCatalog) return;
        let pair = mode !== 'new' ? restored?.conversation?.selectedSettings : undefined;
        if (pair && mode === 'refresh') pair = { ...pair, catalogRevision: nextCatalog.catalogRevision };
        if (!pair) pair = (await api.getDefaults(token, roomId, agentId)).selectedSettings;
        if (!current()) return;
        if (!pairInCatalog(pair, nextCatalog)) throw new ConversationError('settings_unavailable');
        setCatalog(nextCatalog); setSelectedSettings({ ...pair });
      }
      setIsAvailable(true);
    } catch (failure) { if (current()) invalidateSettings(failure); }
    finally { if (current()) setSettingsLoading(false); }
  };
  useEffect(() => {
    const current = ++epoch.current; ++settingsSequence.current;
    setView(null); setCatalog(null); setTask(null); setError(null); setIsAvailable(false); setActiveTask(null);
    setSelectedSettings(null); setDraftSettings(null); setSettingsLoading(false); setNeedsEffortAcknowledgement(false);
    setNewSession(false); setResetAcknowledged(false); setIsSubmitting(false); submitLock.current = false;
    if (enabled && roomId) void acquire('restore', current);
    return () => { ++epoch.current; ++settingsSequence.current; };
  }, [enabled, roomId, agentId, api, modelSelection, reasoningEffort]);
  useEffect(() => {
    // An authenticated active task remains observable when only settings acquisition fails.
    if (!enabled || !roomId || !activeTask) return;
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
        invalidateSettings(failure);
      }
    };
    timer = setTimeout(() => void poll(), 1000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [enabled, roomId, agentId, activeTask, api]);
  const busy = isSubmitting || activeTask !== null;
  const settingsReady = !supportsSettings || Boolean(selectedSettings && catalog && pairInCatalog(selectedSettings, catalog));
  const needsSettingsSelection = supportsSettings && !settingsReady;
  const selectModel = (modelId: string) => {
    if (!modelSelection || busy || !catalog || !enabled || (!isAvailable && !settingsLoading)) return;
    const model = catalog.data.find(option => option.id === modelId); if (!model) return;
    ++settingsSequence.current; setSettingsLoading(false);
    const retained = reasoningEffort && model.supportedReasoningEfforts.some(effort => effort.id === selectedSettings?.reasoningEffort);
    const effort = retained ? selectedSettings!.reasoningEffort : model.defaultReasoningEffort;
    if (!effort || !model.supportedReasoningEfforts.some(option => option.id === effort)) {
      invalidateSettings(new ConversationError('settings_unavailable')); return;
    }
    const pair = { model: model.id, reasoningEffort: effort, catalogRevision: catalog.catalogRevision };
    setSelectedSettings(pair); setDraftSettings(pair); setIsAvailable(true); setError(null);
    setNeedsEffortAcknowledgement(reasoningEffort && !retained);
  };
  const selectEffort = (effortId: string) => {
    if (!reasoningEffort || busy || !catalog || !selectedSettings || !enabled) return;
    const model = catalog.data.find(option => option.id === selectedSettings.model);
    if (!model?.supportedReasoningEfforts.some(effort => effort.id === effortId)) return;
    ++settingsSequence.current; setSettingsLoading(false);
    const pair = { model: model.id, reasoningEffort: effortId, catalogRevision: catalog.catalogRevision };
    setSelectedSettings(pair); setDraftSettings(pair); setNeedsEffortAcknowledgement(false);
  };
  const submit = async (values: ChatSendValues): Promise<boolean> => {
    if (submitLock.current || !roomId || !enabled || !isAvailable || settingsLoading || !settingsReady || busy) return false;
    if (values.delivery !== 'room') { setError(new ConversationError('invalid_task_input')); return false; }
    if (needsEffortAcknowledgement || (newSession && !resetAcknowledged)) return false;
    const displayed = supportsSettings ? { ...selectedSettings! } : null;
    const current = epoch.current; submitLock.current = true; setIsSubmitting(true); setError(null);
    ++settingsSequence.current;
    try {
      const token = await tokenSource.current(); if (epoch.current !== current) return false;
      const restored = await api.getConversation(token, roomId, agentId); if (epoch.current !== current) return false;
      setServerView(restored); const state = restored.conversation;
      if (state?.activeTaskId) throw new ConversationError('conversation_busy');
      if (state?.state === 'unusable' && !newSession) throw new ConversationError('session_unavailable');
      const accepted = await api.sendTurn(token, { profileVersion: PROFILE_VERSION, requestId: crypto.randomUUID(), roomId, agentId,
        occurredAt: new Date().toISOString(), text: values.text, mentions: values.mentions,
        conversation: newSession || !state ? { mode: 'new' } : { mode: 'continue', id: state.id, generation: state.generation },
        ...(displayed ? { settings: displayed } : {}) });
      if (epoch.current !== current) return false;
      setTask(null); setActiveTask(accepted); setNewSession(false); setResetAcknowledged(false); setDraftSettings(null);
      return true;
    } catch (failure) {
      if (epoch.current === current) {
        const safe = safeConversationError(failure); setError(safe);
        if (['authentication_required', 'conversation_stale', 'invalid_task_input', 'unexpected'].includes(safe.code)) invalidateSettings(safe);
      }
      return false;
    } finally { if (epoch.current === current) { submitLock.current = false; setIsSubmitting(false); } }
  };
  return { view, catalog, task, error, isAvailable, busy, isSubmitting, draftSettings, selectedSettings, settingsLoading,
    selectModel, selectEffort, needsEffortAcknowledgement, needsSettingsSelection,
    submittedSettings: activeTask?.selectedSettings,
    pendingConfirmation: Boolean(activeTask && !task && view?.conversation?.activeTaskId !== activeTask.taskId),
    acknowledgeEffort: () => setNeedsEffortAcknowledgement(false), newSession, resetAcknowledged,
    refreshSettings: async () => { if (!busy) await acquire(newSession ? 'new' : 'refresh'); },
    chooseNewSession: () => { if (!busy) { setNewSession(true); setResetAcknowledged(false);
      if (supportsSettings) void acquire('new');
      else { ++settingsSequence.current; setSelectedSettings(null); setDraftSettings(null); setNeedsEffortAcknowledgement(false); }
    } },
    continueSession: () => {
      if (busy || (!isAvailable && error)) return;
      ++settingsSequence.current; setSettingsLoading(false); setNewSession(false); setResetAcknowledged(false);
      setDraftSettings(null); setNeedsEffortAcknowledgement(false);
      const pair = view?.conversation?.selectedSettings;
      if (supportsSettings && (!pair || !catalog || !pairInCatalog(pair, catalog))) { invalidateSettings(new ConversationError('settings_unavailable')); return; }
      setSelectedSettings(supportsSettings ? { ...pair! } : null); setIsAvailable(true); setError(null);
    },
    acknowledgeReset: (value: boolean) => setResetAcknowledged(value), submit };
}
export type AgentConversation = ReturnType<typeof useAgentConversation>;
