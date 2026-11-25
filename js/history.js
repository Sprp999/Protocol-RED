(function (root) {
  const PR = (root.PR = root.PR || {});

  // 패치는 호출자가 이미 맵에 적용한 뒤 commit 한다는 약속이다.
  function createHistory(limit = 100) {
    let undoStack = [];
    let redoStack = [];
    return {
      commit(patch) {
        if (!patch || !patch.ops || !patch.ops.length) return;
        undoStack.push(patch);
        if (undoStack.length > limit) undoStack.shift();
        redoStack = [];
      },
      undo(map) {
        const patch = undoStack.pop();
        if (!patch) return false;
        root.PR.MapModel.revertPatch(map, patch);
        redoStack.push(patch);
        return true;
      },
      redo(map) {
        const patch = redoStack.pop();
        if (!patch) return false;
        root.PR.MapModel.applyPatch(map, patch);
        undoStack.push(patch);
        return true;
      },
      canUndo: () => undoStack.length > 0,
      canRedo: () => redoStack.length > 0,
      clear() {
        undoStack = [];
        redoStack = [];
      },
    };
  }

  PR.History = { createHistory };
  if (typeof module !== 'undefined') module.exports = PR.History;
})(typeof globalThis !== 'undefined' ? globalThis : window);
