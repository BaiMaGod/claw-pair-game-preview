export class BlockGraph {
    constructor(toyIds = [], edges = []) {
        this.blockedBy = new Map();
        this.blocking = new Map();
        this.active = new Set();
        this.reserved = new Set();
        this.reset(toyIds, edges);
    }
    reset(toyIds, edges) {
        this.blockedBy.clear();
        this.blocking.clear();
        this.active = new Set(toyIds);
        this.reserved.clear();
        for (const id of toyIds) {
            this.blockedBy.set(id, new Set());
            this.blocking.set(id, new Set());
        }
        for (const [blocker, blocked] of edges)
            this.addBlock(blocker, blocked);
    }
    addBlock(blocker, blocked) {
        if (!this.blockedBy.has(blocked))
            this.blockedBy.set(blocked, new Set());
        if (!this.blocking.has(blocker))
            this.blocking.set(blocker, new Set());
        this.blockedBy.get(blocked).add(blocker);
        this.blocking.get(blocker).add(blocked);
    }
    canGrab(id) {
        if (!this.active.has(id) || this.reserved.has(id))
            return false;
        const blockers = this.blockedBy.get(id);
        if (!blockers)
            return true;
        for (const blocker of blockers) {
            if (this.active.has(blocker))
                return false;
        }
        return true;
    }
    reserve(id) {
        if (!this.canGrab(id))
            return false;
        this.reserved.add(id);
        return true;
    }
    cancelReserve(id) {
        this.reserved.delete(id);
    }
    removeToy(id) {
        if (!this.active.has(id))
            return [];
        this.active.delete(id);
        this.reserved.delete(id);
        const unlocked = [];
        const children = this.blocking.get(id) ?? new Set();
        for (const childId of children) {
            if (this.canGrab(childId))
                unlocked.push(childId);
        }
        return unlocked;
    }
    getBlockers(id) {
        const blockers = this.blockedBy.get(id) ?? new Set();
        return [...blockers].filter((id) => this.active.has(id));
    }
    getAvailable() {
        return [...this.active].filter((id) => this.canGrab(id));
    }
    getRemainingCount() {
        return this.active.size;
    }
}
