export function createMorphTransactionGate() {
  let current = 0;
  return {
    begin() {
      current += 1;
      return current;
    },
    cancel() {
      current += 1;
    },
    isCurrent(transaction: number) {
      return transaction === current;
    },
  };
}

export function getMorphTimings(reducedMotion: boolean) {
  return reducedMotion
    ? { commitMs: 50, finishMs: 120 }
    : { commitMs: 560, finishMs: 1120 };
}
