import { OpenRouter } from '@openrouter/sdk';
import type { DecisionsRequest } from '@openrouter/sdk/models';
import { RequestTimeoutError, ResponseValidationError, SDKValidationError } from '@openrouter/sdk/models/errors';
import type { CreateSystemoneRequest } from '@openrouter/sdk/models/operations';
import type { CommentItem, Note } from '../shared/types';
import { MonitorError, type ValidityFilter } from './monitor';

const DEFAULT_MODEL = 'jev-latest';
const REQUEST_TIMEOUT = 30_000;
const BASE_INSTRUCTIONS = 'AI 生成或改写的文本，以及广告、营销、推广、软文、带货、引流文本，都属于无效数据。真实用户自发的体验、评价和讨论属于有效数据。只根据所给文本判断，不要补充文本之外的信息。';
const VALIDITY_CRITERIA = {
  true: '内容是真实用户自发的体验、评价或讨论，且不是 AI 文或广告文。',
  false: '内容是 AI 生成或改写文本，或广告、营销、推广、软文、带货、引流文本。',
};

function validityQuestion(target: string) {
  return { type: 'noul' as const, instructions: `${target}${BASE_INSTRUCTIONS}`, criteria: VALIDITY_CRITERIA };
}

export type JevClient = Pick<OpenRouter, 'systemOne'>;

function answerMap(value: unknown, expectedKeys: string[]): boolean[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new MonitorError('aiFilterFormat');
  const answers = value as Record<string, unknown>;
  const keys = Object.keys(answers);
  if (keys.length !== expectedKeys.length || expectedKeys.some(key => !Object.hasOwn(answers, key))) {
    throw new MonitorError('aiFilterFormat');
  }
  return expectedKeys.map(key => {
    const answer = answers[key];
    if (typeof answer !== 'object' || answer === null) throw new MonitorError('aiFilterFormat');
    const decision = answer as Record<string, unknown>;
    if (decision.type !== 'noul' || (decision.noul !== 0 && decision.noul !== 1)) {
      throw new MonitorError('aiFilterFormat');
    }
    return decision.noul === 1;
  });
}

export function createJevFilter({ apiKey = process.env.XHS_MONITOR_OPENROUTER_API_KEY,
  model = process.env.XHS_MONITOR_OPENROUTER_MODEL, client, requestTimeoutMs = REQUEST_TIMEOUT }: {
  apiKey?: string;
  model?: string;
  client?: JevClient;
  requestTimeoutMs?: number;
} = {}): ValidityFilter {
  const selectedModel = model?.trim() || DEFAULT_MODEL;
  const selectedClient = client ?? (apiKey?.trim() ? new OpenRouter({ apiKey: apiKey.trim(), appTitle: '小红书舆情监控' }) : null);

  async function decide(state: DecisionsRequest['state'], questions: DecisionsRequest['questions'], parentSignal?: AbortSignal): Promise<boolean[]> {
    parentSignal?.throwIfAborted();
    if (!selectedClient) throw new MonitorError('aiFilterUnavailable');
    const keys = Object.keys(questions);
    const timeout = AbortSignal.timeout(requestTimeoutMs);
    const signal = parentSignal ? AbortSignal.any([parentSignal, timeout]) : timeout;
    const request: CreateSystemoneRequest = {
      decisionsRequest: { model: selectedModel, state, questions },
    };
    try {
      const response = await selectedClient.systemOne.create(request, {
        signal,
        retries: { strategy: 'none' },
      });
      return answerMap(response.answers, keys);
    } catch (error) {
      parentSignal?.throwIfAborted();
      if (error instanceof MonitorError) throw error;
      if (timeout.aborted || error instanceof RequestTimeoutError) throw new MonitorError('aiFilterTimeout');
      if (error instanceof ResponseValidationError || error instanceof SDKValidationError) throw new MonitorError('aiFilterFormat');
      throw new MonitorError('aiFilterFailed');
    }
  }

  return {
    async isNoteValid(note: Pick<Note, 'title' | 'text'>, signal?: AbortSignal): Promise<boolean> {
      const questions = { note: validityQuestion('结合 state 中的标题和正文，判断整篇笔记是否应保留为真实用户舆情数据。') };
      const [valid] = await decide({ title: note.title, text: note.text }, questions, signal);
      return valid!;
    },
    async filterComments(items: CommentItem[], signal?: AbortSignal): Promise<CommentItem[]> {
      if (!items.length) return [];
      const state = {
        comments: items.map((item, index) => ({ id: index, text: item.text, isReply: item.isReply })),
      };
      const questions = Object.fromEntries(items.map((_, index) => [
        `comment_${index}`,
        validityQuestion(`仅判断 state.comments 中 id 为 ${index} 的一条评论，忽略其他评论。`),
      ]));
      const decisions = await decide(state, questions, signal);
      return items.filter((_, index) => decisions[index]);
    },
  };
}
