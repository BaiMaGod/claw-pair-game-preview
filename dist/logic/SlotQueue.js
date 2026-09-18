export class SlotQueue {
    constructor(capacity = 4) {
        this.capacity = capacity;
        this.items = [];
    }
    reset() {
        this.items.length = 0;
    }
    getItems() {
        return [...this.items];
    }
    add(item) {
        if (this.items.length >= this.capacity) {
            throw new Error('SlotQueue overflow');
        }
        this.items.push(item);
        const pairIndices = this.findPairIndices();
        if (pairIndices) {
            const [i, j] = pairIndices;
            const pair = [this.items[i], this.items[j]];
            this.items = this.items.filter((_, index) => index !== i && index !== j);
            return { pair, failed: false, items: this.getItems() };
        }
        return {
            pair: null,
            failed: this.items.length >= this.capacity,
            items: this.getItems()
        };
    }
    findPairIndices() {
        for (let i = 0; i < this.items.length; i++) {
            for (let j = i + 1; j < this.items.length; j++) {
                if (this.items[i].type === this.items[j].type)
                    return [i, j];
            }
        }
        return null;
    }
}
