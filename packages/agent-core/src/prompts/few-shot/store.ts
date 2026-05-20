import type { FewShotExample, FewShotContext } from './types.js';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const FEW_SHOT_DIR = join(process.cwd(), 'data', 'few-shot-examples');

/** Match examples based on keyword similarity */
function matchExamples(examples: FewShotExample[], context: FewShotContext): FewShotExample[] {
  const goalKeywords = context.goal.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  
  const scored = examples.map(example => {
    const tags = example.metadata.tags || [];
    let score = 0;
    for (const kw of goalKeywords) {
      if (tags.some(tag => tag.toLowerCase().includes(kw))) {
        score++;
      }
    }
    return { example, score };
  });
  
  return scored
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, context.maxExamples || 3)
    .map(({ example }) => example);
}

/** Load examples matching the current context */
export async function loadExamples(context: FewShotContext): Promise<FewShotExample[]> {
  try {
    const files = readdirSync(FEW_SHOT_DIR).filter(f => f.endsWith('.json'));
    const examples: FewShotExample[] = files.map(f => 
      JSON.parse(readFileSync(join(FEW_SHOT_DIR, f), 'utf-8'))
    );
    return matchExamples(examples, context);
  } catch {
    // Directory doesn't exist or read error — return empty
    return [];
  }
}
