export type DatasetSoftDeleteUndo = {
  type: "dataset-soft-delete";
  locId: string;
  folderNameInDeleted: string;
};

export type UndoAction = DatasetSoftDeleteUndo;

const stack: UndoAction[] = [];
const MAX = 32;

export function pushUndo(action: UndoAction): void {
  stack.push(action);
  while (stack.length > MAX) stack.shift();
}

export function popUndo(): UndoAction | undefined {
  return stack.pop();
}

export function canUndo(): boolean {
  return stack.length > 0;
}