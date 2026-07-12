import { createActor, type SnapshotFrom } from "xstate";
import { definePlayer, type PlayerActor } from "@xmachines/play-xstate";
import { constitutionCatalog } from "../constitution/catalog.js";
import { createOSMachine } from "./machine.js";
import type { OSContext } from "./events.js";

export type OSMachine = ReturnType<typeof createOSMachine>;
export type OSPlayer = PlayerActor<OSMachine>;
export type OSPlayerSnapshot = SnapshotFrom<OSMachine>;

type PlayerInternals = {
  _xstateActor: ReturnType<typeof createActor<OSMachine>>;
};

const playerFactories = new WeakMap<OSMachine, ReturnType<typeof definePlayer>>();

function getPlayerFactory(machine: OSMachine) {
  let factory = playerFactories.get(machine);
  if (!factory) {
    factory = definePlayer({
      machine,
      catalog: constitutionCatalog,
    });
    playerFactories.set(machine, factory);
  }
  return factory;
}

function asPlayerInternals(actor: OSPlayer): PlayerInternals {
  return actor as unknown as PlayerInternals;
}

export function createOSPlayer(
  initialContext: OSContext,
  options?: { snapshot?: OSPlayerSnapshot },
): OSPlayer {
  const machine = createOSMachine(initialContext);
  const create = getPlayerFactory(machine);
  const actor = create(initialContext);

  if (options?.snapshot) {
    asPlayerInternals(actor)._xstateActor = createActor(machine, {
      snapshot: options.snapshot,
    });
  }

  actor.start();
  return actor;
}

export function getPersistedSnapshot(actor: OSPlayer): OSPlayerSnapshot {
  const internal = asPlayerInternals(actor);
  if (internal._xstateActor?.getPersistedSnapshot) {
    return internal._xstateActor.getPersistedSnapshot() as OSPlayerSnapshot;
  }
  return actor.getSnapshot() as OSPlayerSnapshot;
}

export function isTerminalSnapshot(snapshot: OSPlayerSnapshot): boolean {
  const value = snapshot.value;
  return value === "completed" || value === "failed";
}
