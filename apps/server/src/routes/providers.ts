import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  loadProvidersConfig,
  addProvider,
  updateProvider,
  deleteProvider,
  setActiveProvider,
  createProviderInstance,
} from '@eata/agent-core';
import { ProviderIdParam } from '../utils/validation.js';

const CreateProviderSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.literal('openai-compatible'),
  apiKey: z.string().min(1, { message: 'API key cannot be empty' }),
  baseURL: z.string().url(),
  model: z.string().min(1),
  enabled: z.boolean().optional().default(true),
});

const UpdateProviderSchema = CreateProviderSchema.partial();

export async function providersRoutes(server: FastifyInstance) {
  // GET /providers - 获取所有供应商
  server.get('/providers', async () => {
    return loadProvidersConfig();
  });

  // POST /providers - 添加新供应商
  server.post('/providers', async (request, reply) => {
    const parseResult = CreateProviderSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Validation failed',
        details: parseResult.error.errors,
      });
    }
    const config = addProvider(parseResult.data);
    return reply.status(201).send(config);
  });

  // PUT /providers/:id - 更新供应商
  server.put('/providers/:id', async (request, reply) => {
    const paramsResult = ProviderIdParam.safeParse(request.params);
    if (!paramsResult.success) {
      return reply.status(400).send({ error: 'Invalid provider ID', details: paramsResult.error.issues });
    }
    const { id } = paramsResult.data;
    const parseResult = UpdateProviderSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Validation failed',
        details: parseResult.error.errors,
      });
    }
    const config = updateProvider(id, parseResult.data);
    if (!config) return reply.status(404).send({ error: 'Provider not found' });
    return config;
  });

  // DELETE /providers/:id - 删除供应商
  server.delete('/providers/:id', async (request, reply) => {
    const paramsResult = ProviderIdParam.safeParse(request.params);
    if (!paramsResult.success) {
      return reply.status(400).send({ error: 'Invalid provider ID', details: paramsResult.error.issues });
    }
    const { id } = paramsResult.data;
    const config = deleteProvider(id);
    if (!config) return reply.status(404).send({ error: 'Provider not found' });
    return config;
  });

  // POST /providers/:id/test - 测试连接
  server.post('/providers/:id/test', async (request, reply) => {
    const paramsResult = ProviderIdParam.safeParse(request.params);
    if (!paramsResult.success) {
      return reply.status(400).send({ error: 'Invalid provider ID', details: paramsResult.error.issues });
    }
    const { id } = paramsResult.data;
    const config = loadProvidersConfig();
    const provider = config.providers.find(p => p.id === id);
    if (!provider) return reply.status(404).send({ error: 'Provider not found' });

    try {
      const llmProvider = createProviderInstance(provider);
      await llmProvider.generateText({
        prompt: 'Say "OK" to confirm connection',
        maxTokens: 10,
      });
      return { success: true, message: 'Connection successful' };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  // POST /providers/:id/activate - 设为默认
  server.post('/providers/:id/activate', async (request, reply) => {
    const paramsResult = ProviderIdParam.safeParse(request.params);
    if (!paramsResult.success) {
      return reply.status(400).send({ error: 'Invalid provider ID', details: paramsResult.error.issues });
    }
    const { id } = paramsResult.data;
    const config = setActiveProvider(id);
    if (!config) return reply.status(404).send({ error: 'Provider not found' });
    return config;
  });
}
