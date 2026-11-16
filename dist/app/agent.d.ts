export declare class ActBuilder {
    instructions: string | undefined;
    constructor();
    build(): ActAgent;
    setInstructions(instructions: string): this;
}
export declare class ActAgent {
    private instructions;
    constructor(builder: ActBuilder);
    builder(): ActBuilder;
    showInstructions(): void;
}
//# sourceMappingURL=agent.d.ts.map