class MinPriorityQueue {
    constructor() {
        this.items = [];
    }

    get size() {
        return this.items.length;
    }

    push(item, priority) {
        this.items.push({ item, priority });
        this.bubbleUp(this.items.length - 1);
    }

    pop() {
        if (!this.items.length) return null;
        const root = this.items[0];
        const last = this.items.pop();
        if (this.items.length && last) {
            this.items[0] = last;
            this.bubbleDown(0);
        }
        return root.item;
    }

    bubbleUp(index) {
        while (index > 0) {
            const parent = Math.floor((index - 1) / 2);
            if (this.items[parent].priority <= this.items[index].priority) break;
            [this.items[parent], this.items[index]] = [this.items[index], this.items[parent]];
            index = parent;
        }
    }

    bubbleDown(index) {
        while (true) {
            const left = index * 2 + 1;
            const right = left + 1;
            let smallest = index;

            if (left < this.items.length && this.items[left].priority < this.items[smallest].priority) {
                smallest = left;
            }

            if (right < this.items.length && this.items[right].priority < this.items[smallest].priority) {
                smallest = right;
            }

            if (smallest === index) break;

            [this.items[index], this.items[smallest]] = [this.items[smallest], this.items[index]];
            index = smallest;
        }
    }
}
