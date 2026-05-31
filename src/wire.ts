import type { ServerMessage, StateMetrics, StateSnapshot } from "./types.ts";

export interface CompactStateSnapshot {
  type: "state";
  p?: StateSnapshot["players"];
  pF?: 1 | true;
  pR?: StateSnapshot["removedPlayerIds"];
  m?: StateSnapshot["monsters"];
  mF?: 1 | true;
  mR?: StateSnapshot["removedMonsterIds"];
  c?: StateSnapshot["corpses"];
  cF?: 1 | true;
  cR?: StateSnapshot["removedCorpseIds"];
  n?: StateSnapshot["npcs"];
  nF?: 1 | true;
  nR?: StateSnapshot["removedNpcIds"];
  t?: StateSnapshot["trees"];
  tF?: 1 | true;
  tR?: StateSnapshot["removedTreeIds"];
  fn?: StateSnapshot["fishingNodes"];
  fnF?: 1 | true;
  fnR?: StateSnapshot["removedFishingNodeIds"];
  mn?: StateSnapshot["miningNodes"];
  mnF?: 1 | true;
  mnR?: StateSnapshot["removedMiningNodeIds"];
  hn?: StateSnapshot["herbNodes"];
  hnF?: 1 | true;
  hnR?: StateSnapshot["removedHerbNodeIds"];
  f?: StateSnapshot["fires"];
  fF?: 1 | true;
  fR?: StateSnapshot["removedFireIds"];
  e?: StateSnapshot["events"];
  x?: StateMetrics;
}

export type WireServerMessage = ServerMessage | CompactStateSnapshot;

export function normalizeServerMessage(message: WireServerMessage): ServerMessage {
  if (!isCompactStateSnapshot(message)) return message as ServerMessage;
  const compact = message as CompactStateSnapshot;
  return {
    type: "state",
    players: compact.p ?? [],
    playersFull: Boolean(compact.pF),
    removedPlayerIds: compact.pR ?? [],
    monsters: compact.m ?? [],
    monstersFull: Boolean(compact.mF),
    removedMonsterIds: compact.mR ?? [],
    corpses: compact.c ?? [],
    corpsesFull: Boolean(compact.cF),
    removedCorpseIds: compact.cR ?? [],
    npcs: compact.n ?? [],
    npcsFull: Boolean(compact.nF),
    removedNpcIds: compact.nR ?? [],
    trees: compact.t ?? [],
    treesFull: Boolean(compact.tF),
    removedTreeIds: compact.tR ?? [],
    fishingNodes: compact.fn ?? [],
    fishingNodesFull: Boolean(compact.fnF),
    removedFishingNodeIds: compact.fnR ?? [],
    miningNodes: compact.mn ?? [],
    miningNodesFull: Boolean(compact.mnF),
    removedMiningNodeIds: compact.mnR ?? [],
    herbNodes: compact.hn ?? [],
    herbNodesFull: Boolean(compact.hnF),
    removedHerbNodeIds: compact.hnR ?? [],
    fires: compact.f ?? [],
    firesFull: Boolean(compact.fF),
    removedFireIds: compact.fR ?? [],
    events: compact.e ?? [],
    metrics: compact.x
  };
}

export function isCompactStateSnapshot(message: unknown): message is CompactStateSnapshot {
  return isRecord(message) && message.type === "state" && !("players" in message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
