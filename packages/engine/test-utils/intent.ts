// Constant intent policy for tests: the real one lives in `ai` (D-150). createEngine requires a policy while FLAGS.INTENTS is on.
import type { IntentPolicy } from '../src/pipeline';

export const constantIntent: IntentPolicy = () => 'guard';
