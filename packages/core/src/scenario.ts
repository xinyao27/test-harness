import { Effect, Schema } from "effect";

import { InvalidScenarioBindingError } from "./errors.ts";
import { type ScenarioBinding, ScenarioBindingSchema } from "./schema.ts";

export type ScenarioRegistry = {
  readonly add: (binding: ScenarioBinding) => void;
  readonly get: () => readonly ScenarioBinding[];
  readonly reset: () => void;
};

export type ScenarioOptions = {
  readonly registry?: ScenarioRegistry;
};

export const createScenarioRegistry = (): ScenarioRegistry => {
  const bindings: ScenarioBinding[] = [];
  return {
    add(binding) {
      bindings.push(binding);
    },
    get() {
      return [...bindings];
    },
    reset() {
      bindings.length = 0;
    },
  };
};

const defaultScenarioRegistry = createScenarioRegistry();

export const scenario = (
  input: unknown,
  options: ScenarioOptions = {},
): Effect.Effect<ScenarioBinding, InvalidScenarioBindingError> =>
  Schema.decodeUnknownEffect(ScenarioBindingSchema)(input).pipe(
    Effect.mapError((cause) => new InvalidScenarioBindingError({ cause })),
    Effect.tap((binding) =>
      Effect.sync(() => {
        (options.registry ?? defaultScenarioRegistry).add(binding);
      }),
    ),
  );

export const getScenarioBindings = (): readonly ScenarioBinding[] => defaultScenarioRegistry.get();

export const resetScenarioBindings = (): void => {
  defaultScenarioRegistry.reset();
};
