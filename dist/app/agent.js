export class ActBuilder {
    instructions;
    constructor() {
    }
    build() {
        return new ActAgent(this);
    }
    setInstructions(instructions) {
        this.instructions = instructions;
        return this;
    }
}
export class ActAgent {
    instructions;
    constructor(builder) {
        this.instructions = builder.instructions ?? '';
    }
    builder() {
        return new ActBuilder();
    }
    showInstructions() {
        console.log(this.instructions);
    }
}
//# sourceMappingURL=agent.js.map